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
    const settings = await this.settingsService.getUserSettings(userId);
    const localDate = getDateInTimezone(now, settings.timezone);

    const existing = await this.getUserQuestionForDate(userId, localDate, USER_HISTORY_SOURCE.MY_QUESTION);
    if (existing) {
      return existing;
    }

    const question = await this.questionSelectionService.selectQuestion({
      difficulty: settings.difficulty,
      excludeSourceIds: await this.questionSelectionService.listRecentUserQuestionIds(userId)
    });

    await this.recordUserHistory({
      userId,
      questionId: question.id,
      localDate,
      source: USER_HISTORY_SOURCE.MY_QUESTION,
      success: true
    });

    return question;
  }

  async getPracticeQuestion(userId, now = new Date()) {
    const settings = await this.settingsService.getUserSettings(userId);
    const localDate = getDateInTimezone(now, settings.timezone);

    const question = await this.questionSelectionService.selectQuestion({
      difficulty: settings.difficulty,
      excludeSourceIds: await this.questionSelectionService.listRecentUserQuestionIds(userId)
    });

    await this.recordUserHistory({
      userId,
      questionId: question.id,
      localDate,
      source: USER_HISTORY_SOURCE.PRACTICE,
      success: true
    });

    return question;
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
        excludeSourceIds: await this.questionSelectionService.listRecentUserQuestionIds(userSettings.user_id)
      });

      try {
        const user = await client.users.fetch(userSettings.user_id);
        await user.send({
          embeds: [
            buildQuestionEmbed(question, 'Your Daily LeetCode Reminder', 'You can change this with /remindme')
          ]
        });

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
        await this.recordUserHistory({
          userId: userSettings.user_id,
          questionId: question.id,
          localDate,
          source: USER_HISTORY_SOURCE.DM_REMINDER,
          success: false,
          error: error?.message || 'Unable to DM user'
        });
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

  async recordUserHistory({ userId, questionId, localDate, source, success, error }) {
    await this.dbPool.query(
      `insert into user_question_history
       (user_id, question_id, question_date, source, delivery_success, error_message)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (user_id, question_date, source)
       do update set
         question_id = excluded.question_id,
         delivery_success = excluded.delivery_success,
         error_message = excluded.error_message,
         delivered_at = now()`,
      [userId, questionId, localDate, source, success, error || null]
    );
  }

  createPersonalQuestionEmbed(question) {
    return buildQuestionEmbed(question, 'Your Personal Daily Question', 'Set difficulty with /mydifficulty');
  }

  createPracticeEmbed(question) {
    return buildQuestionEmbed(question, 'Practice Question', 'Keep going. One problem at a time.');
  }
}
