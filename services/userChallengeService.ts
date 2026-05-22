// @ts-nocheck
import { buildChallengeEmbed } from '../lib/embed.ts';
import { USER_HISTORY_SOURCE } from '../lib/constants.ts';
import { getDateInTimezone, isDueAtMinute } from '../lib/time.ts';

export class UserChallengeService {
  constructor(settingsService, questionSelectionService, dbPool) {
    this.settingsService = settingsService;
    this.questionSelectionService = questionSelectionService;
    this.dbPool = dbPool;
  }

  /**
   * /myquestion — return the personal daily question for today, picking and
   * recording one if today has no entry yet. Returns { question, embed }.
   */
  async getOrCreateDailyPersonalQuestion(userId, now = new Date()) {
    const settings = await this.settingsService.getUserSettings(userId);
    const localDate = getDateInTimezone(now, settings.timezone);

    const existing = await this.getUserQuestionForDate(
      userId,
      localDate,
      USER_HISTORY_SOURCE.MY_QUESTION
    );

    if (existing) {
      return {
        question: existing,
        embed: buildChallengeEmbed(existing, {
          title: 'Your Personal Daily Question',
          questionSet: settings.question_set,
          footerExtra: 'Set difficulty with /mydifficulty',
        }),
      };
    }

    const selection = await this.questionSelectionService.selectForScope(
      { kind: 'user', id: userId },
      settings
    );

    this._logSelection({
      scope: 'user',
      id: userId,
      source: 'myquestion',
      selection,
    });

    await this._recordHistory({
      userId,
      questionId: selection.question.id,
      localDate,
      source: USER_HISTORY_SOURCE.MY_QUESTION,
      success: true,
    });

    return {
      question: selection.question,
      embed: this._buildSelectionEmbed(selection, {
        title: 'Your Personal Daily Question',
        footerExtra: 'Set difficulty with /mydifficulty',
      }),
    };
  }

  /**
   * /practice — always picks a fresh question (respecting cycle exclusion).
   * Returns { question, embed }.
   */
  async getPracticeQuestion(userId, now = new Date()) {
    const settings = await this.settingsService.getUserSettings(userId);
    const localDate = getDateInTimezone(now, settings.timezone);

    const selection = await this.questionSelectionService.selectForScope(
      { kind: 'user', id: userId },
      settings
    );

    this._logSelection({
      scope: 'user',
      id: userId,
      source: 'practice',
      selection,
    });

    await this._recordHistory({
      userId,
      questionId: selection.question.id,
      localDate,
      source: USER_HISTORY_SOURCE.PRACTICE,
      success: true,
    });

    return {
      question: selection.question,
      embed: this._buildSelectionEmbed(selection, {
        title: 'Practice Question',
        footerExtra: 'Keep going. One problem at a time.',
      }),
    };
  }

  async sendDueReminderDMs(client, now = new Date()) {
    const users = await this.settingsService.listUsersWithRemindersEnabled();

    let scannedUsers = 0;
    let dueUsers = 0;
    let alreadySentToday = 0;
    let sentCount = 0;
    let failedCount = 0;

    for (const userSettings of users) {
      scannedUsers += 1;

      if (
        !isDueAtMinute(now, userSettings.timezone, userSettings.reminder_time)
      ) {
        continue;
      }

      dueUsers += 1;

      const localDate = getDateInTimezone(now, userSettings.timezone);
      const alreadySent = await this.getUserQuestionForDate(
        userSettings.user_id,
        localDate,
        USER_HISTORY_SOURCE.DM_REMINDER
      );

      if (alreadySent) {
        alreadySentToday += 1;
        continue;
      }

      let selection;
      try {
        selection = await this.questionSelectionService.selectForScope(
          { kind: 'user', id: userSettings.user_id },
          userSettings
        );
      } catch (err) {
        console.error(
          `[UserChallengeService] Selection failed for user ${userSettings.user_id}: ${err.message}`
        );
        continue;
      }

      this._logSelection({
        scope: 'user',
        id: userSettings.user_id,
        source: 'dm-reminder',
        selection,
      });

      const embed = this._buildSelectionEmbed(selection, {
        title: 'Your Daily LeetCode Reminder',
        footerExtra: 'Change reminders with /remindme',
      });

      try {
        const user = await client.users.fetch(userSettings.user_id);
        if (!user) {
          throw new Error('User not found');
        }

        await user.send({ embeds: [embed] });

        await this._recordHistory({
          userId: userSettings.user_id,
          questionId: selection.question.id,
          localDate,
          source: USER_HISTORY_SOURCE.DM_REMINDER,
          success: true,
        });
        sentCount += 1;
      } catch (error) {
        failedCount += 1;
        try {
          await this._recordHistory({
            userId: userSettings.user_id,
            questionId: selection.question.id,
            localDate,
            source: USER_HISTORY_SOURCE.DM_REMINDER,
            success: false,
            error: error?.message || 'Unable to DM user',
          });
        } catch (historyErr) {
          console.error(
            `[UserChallengeService] Failed to record DM failure for user ${userSettings.user_id}: ${historyErr.message}`
          );
        }
      }
    }

    return { scannedUsers, dueUsers, alreadySentToday, sentCount, failedCount };
  }

  async getUserQuestionForDate(userId, localDate, source) {
    const result = await this.dbPool.query(
      `select q.*
       from user_question_history uh
       join questions q on q.id = uh.question_id
       where uh.user_id = $1 and uh.question_date = $2 and uh.source = $3
       limit 1`,
      [userId, localDate, source]
    );

    return result.rows[0] || null;
  }

  async _recordHistory({
    userId,
    questionId,
    localDate,
    source,
    success,
    error,
  }) {
    await this.dbPool.query(
      `insert into user_question_history
       (user_id, question_id, question_date, source, delivery_success, error_message, delivered_at)
       values ($1, $2, $3, $4, $5, $6, now())
       on conflict (user_id, question_date, source)
       do update set
         question_id = excluded.question_id,
         delivery_success = excluded.delivery_success,
         error_message = excluded.error_message,
         delivered_at = CASE WHEN excluded.delivery_success = true THEN now() ELSE user_question_history.delivered_at END`,
      [userId, questionId, localDate, source, success, error || null]
    );
  }

  _buildSelectionEmbed(selection, { title, footerExtra }) {
    const delivered = selection.startedNewCycle
      ? 1
      : Math.max(1, selection.poolSize - selection.unusedCountBefore + 1);

    return buildChallengeEmbed(selection.question, {
      title,
      questionSet: selection.filter?.questionSet,
      cycleProgress:
        selection.poolSize > 0
          ? {
              delivered,
              poolSize: selection.poolSize,
              cycleNumber: selection.cycleNumber,
            }
          : null,
      footerExtra,
    });
  }

  _logSelection({ scope, id, source, selection }) {
    const {
      question,
      poolSize,
      unusedCountBefore,
      cycleNumber,
      startedNewCycle,
      usedFallback,
      filter,
    } = selection;
    console.log(
      `[SELECT ${scope}=${id} source=${source}] set=${filter?.questionSet} difficulty=${filter?.difficulty} ` +
        `pool=${poolSize} unused=${unusedCountBefore} cycle=${cycleNumber} ` +
        `newCycle=${startedNewCycle} fallback=${usedFallback} ` +
        `picked=#${question?.source_id} "${question?.title}"`
    );
  }
}
