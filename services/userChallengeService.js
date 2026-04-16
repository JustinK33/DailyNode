import { EmbedBuilder } from 'discord.js';
import { USER_HISTORY_SOURCE } from '../lib/constants.js';
import { getDateInTimezone, isDueAtMinute } from '../lib/time.js';

function buildQuestionEmbed(question, title, footerText) {
  return new EmbedBuilder()
    .setColor('#2ECC71')
    .setTitle(title)
    .addFields(
      { name: 'Problem', value: `**${question.title}**`, inline: false },
      { name: 'Difficulty', value: question.difficulty, inline: true },
      { name: 'Problem ID', value: `#${question.source_id}`, inline: true },
      { name: 'Link', value: `[Solve on LeetCode](${question.link})`, inline: false }
    )
    .setFooter({ text: footerText })
    .setTimestamp();
}

export class UserChallengeService {
  constructor(settingsService, questionSelectionService, dbPool) {
    this.settingsService = settingsService;
    this.questionSelectionService = questionSelectionService;
    this.dbPool = dbPool;
  }

  async getOrCreateDailyPersonalQuestion(userId, now = new Date()) {
    try {
      const settings = await this.settingsService.getUserSettings(userId);
      const localDate = getDateInTimezone(now, settings.timezone);

      const existing = await this.getUserQuestionForDate(userId, localDate, USER_HISTORY_SOURCE.MY_QUESTION);
      if (existing) {
        return existing;
      }

      const question = await this.questionSelectionService.selectQuestion({
        difficulty: settings.difficulty,
        question_set: settings.question_set,
        excludeSourceIds: await this.questionSelectionService.listRecentUserQuestionIds(
          userId,
          settings.question_set,
          settings.difficulty
        )
      });

      await this.recordUserHistory({
        userId,
        questionId: question.id,
        localDate,
        source: USER_HISTORY_SOURCE.MY_QUESTION,
        success: true
      });

      return question;
    } catch (err) {
      console.error(`[UserChallengeService] Error getting or creating daily personal question for user ${userId}: ${err.message}`);
      throw err;
    }
  }

  async getPracticeQuestion(userId, now = new Date()) {
    try {
      const settings = await this.settingsService.getUserSettings(userId);
      const localDate = getDateInTimezone(now, settings.timezone);

      const question = await this.questionSelectionService.selectQuestion({
        difficulty: settings.difficulty,
        question_set: settings.question_set,
        excludeSourceIds: await this.questionSelectionService.listRecentUserQuestionIds(
          userId,
          settings.question_set,
          settings.difficulty
        )
      });

      await this.recordUserHistory({
        userId,
        questionId: question.id,
        localDate,
        source: USER_HISTORY_SOURCE.PRACTICE,
        success: true
      });

      return question;
    } catch (err) {
      console.error(`[UserChallengeService] Error getting practice question for user ${userId}: ${err.message}`);
      throw err;
    }
  }

  async sendDueReminderDMs(client, now = new Date()) {
    try {
      const users = await this.settingsService.listUsersWithRemindersEnabled();

      let scannedUsers = 0;
      let dueUsers = 0;
      let alreadySentToday = 0;
      let sentCount = 0;
      let failedCount = 0;

      for (const userSettings of users) {
        scannedUsers += 1;

        if (!isDueAtMinute(now, userSettings.timezone, userSettings.reminder_time)) {
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

        const question = await this.questionSelectionService.selectQuestion({
          difficulty: userSettings.difficulty,
          question_set: userSettings.question_set,
          excludeSourceIds: await this.questionSelectionService.listRecentUserQuestionIds(
            userSettings.user_id,
            userSettings.question_set,
            userSettings.difficulty
          )
        });

        try {
          const user = await client.users.fetch(userSettings.user_id);
          if (!user) {
            throw new Error('User not found');
          }

          // Send DM first, only record success if DM actually succeeds
          await user.send({
            embeds: [
              buildQuestionEmbed(question, 'Your Daily LeetCode Reminder', 'You can change this with /remindme')
            ]
          });

          // Only record as success if DM was sent successfully
          await this.recordUserHistory({
            userId: userSettings.user_id,
            questionId: question.id,
            localDate,
            source: USER_HISTORY_SOURCE.DM_REMINDER,
            success: true
          });
          sentCount += 1;
        } catch (error) {
          failedCount += 1;
          // Record failure with error message
          try {
            await this.recordUserHistory({
              userId: userSettings.user_id,
              questionId: question.id,
              localDate,
              source: USER_HISTORY_SOURCE.DM_REMINDER,
              success: false,
              error: error?.message || 'Unable to DM user'
            });
          } catch (historyErr) {
            console.error(`[UserChallengeService] Failed to record DM failure for user ${userSettings.user_id}: ${historyErr.message}`);
          }
        }
      }

      return { scannedUsers, dueUsers, alreadySentToday, sentCount, failedCount };
    } catch (err) {
      console.error(`[UserChallengeService] Error in sendDueReminderDMs: ${err.message}`);
      throw err;
    }
  }

  async getUserQuestionForDate(userId, localDate, source) {
    try {
      const result = await this.dbPool.query(
        `select q.*
         from user_question_history uh
         join questions q on q.id = uh.question_id
         where uh.user_id = $1 and uh.question_date = $2 and uh.source = $3
         limit 1`,
        [userId, localDate, source]
      );

      return result.rows[0] || null;
    } catch (err) {
      console.error(`[UserChallengeService] Error fetching user question for date: ${err.message}`);
      throw err;
    }
  }

  async recordUserHistory({ userId, questionId, localDate, source, success, error }) {
    try {
      const result = await this.dbPool.query(
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
      if (!result) {
        throw new Error('Failed to record user history');
      }
    } catch (err) {
      console.error(`[UserChallengeService] Error recording user history for user ${userId}: ${err.message}`);
      throw err;
    }
  }

  createPersonalQuestionEmbed(question) {
    return buildQuestionEmbed(question, 'Your Personal Daily Question', 'Set difficulty with /mydifficulty');
  }

  createPracticeEmbed(question) {
    return buildQuestionEmbed(question, 'Practice Question', 'Keep going. One problem at a time.');
  }
}
