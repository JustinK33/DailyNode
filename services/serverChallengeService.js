import { EmbedBuilder } from 'discord.js';
import { getDateInTimezone, isDueAtMinute } from '../lib/time.js';

const ENCOURAGING_MESSAGES = [
  "You've got this. Let's solve this problem today.",
  'Time to sharpen those coding skills.',
  'Another day, another algorithm to conquer.',
  'Challenge accepted. Let us code.',
  "Ready to level up? Here is today's problem."
];

function randomMessage() {
  return ENCOURAGING_MESSAGES[Math.floor(Math.random() * ENCOURAGING_MESSAGES.length)];
}

export class ServerChallengeService {
  constructor(settingsService, questionSelectionService, dbPool) {
    this.settingsService = settingsService;
    this.questionSelectionService = questionSelectionService;
    this.dbPool = dbPool;
  }

  createEmbed(question, motivation) {
    return new EmbedBuilder()
      .setColor('#FFA500')
      .setTitle('Daily LeetCode Challenge')
      .addFields(
        { name: 'Problem', value: `**${question.title}**`, inline: false },
        { name: 'Difficulty', value: question.difficulty, inline: true },
        { name: 'Problem ID', value: `#${question.source_id}`, inline: true },
        { name: 'Motivation', value: motivation, inline: false },
        { name: 'Link', value: `[Solve on LeetCode](${question.link})`, inline: false }
      )
      .setFooter({ text: 'Good luck.' })
      .setTimestamp();
  }

  async hasGuildDailyForDate(guildId, localDate) {
    const result = await this.dbPool.query(
      `select id
       from guild_question_history
       where guild_id = $1 and question_date = $2 and selection_mode = 'daily'
       limit 1`,
      [guildId, localDate]
    );

    return result.rowCount > 0;
  }

  async getGuildQuestionForDate(guildId, localDate) {
    const result = await this.dbPool.query(
      `select q.*
       from guild_question_history gh
       join questions q on q.id = gh.question_id
       where gh.guild_id = $1 and gh.question_date = $2 and gh.selection_mode = 'daily'
       limit 1`,
      [guildId, localDate]
    );

    return result.rows[0] || null;
  }

  async postDailyChallengeForGuild(client, guildId, now = new Date()) {
    const settings = await this.settingsService.getGuildSettings(guildId);

    if (!settings.channel_id) {
      return { skipped: true, reason: 'no-channel' };
    }

    const localDate = getDateInTimezone(now, settings.timezone);
    const existing = await this.getGuildQuestionForDate(guildId, localDate);

    const question =
      existing ||
      (await this.questionSelectionService.selectQuestion({
        difficulty: settings.difficulty,
        excludeSourceIds: await this.questionSelectionService.listRecentGuildQuestionIds(guildId)
      }));

    const embed = this.createEmbed(question, randomMessage());

    try {
      const channel = await client.channels.fetch(settings.channel_id);
      if (!channel || !channel.isTextBased()) {
        await this.recordGuildHistory({
          guildId,
          questionId: question.id,
          localDate,
          channelId: settings.channel_id,
          success: false,
          error: 'Configured channel is not text-based or no longer exists.'
        });
        return { skipped: true, reason: 'invalid-channel' };
      }

      await channel.send({ embeds: [embed] });

      if (!existing) {
        await this.recordGuildHistory({
          guildId,
          questionId: question.id,
          localDate,
          channelId: settings.channel_id,
          success: true
        });
      }

      return { sent: true, question };
    } catch (error) {
      await this.recordGuildHistory({
        guildId,
        questionId: question.id,
        localDate,
        channelId: settings.channel_id,
        success: false,
        error: error?.message || 'Unknown delivery failure'
      });

      return { skipped: true, reason: 'send-failed', error };
    }
  }

  async recordGuildHistory({ guildId, questionId, localDate, channelId, success, error }) {
    await this.dbPool.query(
      `insert into guild_question_history
       (guild_id, question_id, question_date, selection_mode, delivery_channel_id, delivery_success, error_message)
       values ($1, $2, $3, 'daily', $4, $5, $6)
       on conflict (guild_id, question_date, selection_mode)
       do update set
         question_id = excluded.question_id,
         delivery_channel_id = excluded.delivery_channel_id,
         delivery_success = excluded.delivery_success,
         error_message = excluded.error_message,
         delivered_at = now()`,
      [guildId, questionId, localDate, channelId, success, error || null]
    );
  }

  async runDueGuildChallenges(client, now = new Date()) {
    const guildSettings = await this.settingsService.listGuildSettingsWithChannels();

    let scannedGuilds = 0;
    let dueGuilds = 0;
    let alreadyPosted = 0;
    let sentCount = 0;

    for (const settings of guildSettings) {
      scannedGuilds += 1;

      if (!isDueAtMinute(now, settings.timezone, settings.post_time)) {
        continue;
      }

      dueGuilds += 1;

      const localDate = getDateInTimezone(now, settings.timezone);
      if (await this.hasGuildDailyForDate(settings.guild_id, localDate)) {
        alreadyPosted += 1;
        continue;
      }

      const result = await this.postDailyChallengeForGuild(client, settings.guild_id, now);
      if (result.sent) {
        sentCount += 1;
      }
    }

    return { scannedGuilds, dueGuilds, alreadyPosted, sentCount };
  }
}
