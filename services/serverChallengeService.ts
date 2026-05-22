// @ts-nocheck
import { buildChallengeEmbed } from '../lib/embed.ts';
import { getDateInTimezone, isDueAtMinute } from '../lib/time.ts';

const ENCOURAGING_MESSAGES = [
  'Lock in and give this problem your full attention. You are getting sharper every day.',
  'It is time to focus up and put in real work. Progress comes from sessions like this.',
  'Stay disciplined and keep pushing. Every problem you solve builds real skill.',
  'Get locked in and trust your training. You are more capable than you think.',
  'This is where improvement happens. Sit down, focus, and earn your progress.',
  'Keep your head down and keep working. Consistency is what separates you.',
  'Lock in for this session and make it count. Every rep matters.',
  'Do not overthink it. Focus on the next step and keep moving forward.',
  'You are not here to be comfortable. You are here to get better.',
  'Put distractions aside and attack this challenge. This is how growth happens.',
  'Stay focused and keep building. Your hard work is starting to stack up.',
  'This problem is another chance to level up. Lock in and take it seriously.',
  'Do the work even if it feels hard today. That is how real progress is made.',
  'Keep showing up with discipline and effort. Results always follow consistency.',
  'Focus up and give yourself a real shot. You are building something valuable.',
  'Take a breath, lock in, and get after it. You are capable of solving hard things.',
  'Every challenge you face today makes you stronger tomorrow. Keep going.',
  'This is not just practice. This is you building the mindset and skill to improve.',
  'Stay patient, stay focused, and keep grinding. You are getting better with every rep.',
  'The goal is not to be perfect right now. The goal is to keep improving today.',
  'Lock in and trust the process. Your effort today will pay off later.',
  'You have done hard things before, and you can do this too. Stay on it.',
  'Keep your momentum going and do not let up. This is how confidence is built.',
  'Focus on execution, not excuses. The work you do now matters.',
  'You do not need motivation to start. You need discipline to keep going.',
  'Another day, another chance to sharpen your problem-solving skills. Make it count.',
  'This is your time to focus and improve. Give it everything you have right now.',
  'Stay locked in through the struggle. The hard part is where growth starts.',
  'Push through the confusion and keep thinking. Clarity comes from effort.',
  'Get serious and do the work. The version of you that you want to become is built here.',
  'Every line of code and every attempt adds up. Keep stacking small wins.',
  'Lock in and trust your ability to figure things out. You are learning more than you realize.',
  'The only way forward is through the work. Stay focused and keep moving.',
  'You are building discipline every time you choose to keep going. That matters.',
  'This is your daily rep. Show up, stay focused, and put in good work.',
  'Keep your standards high and your focus sharp. You are here to improve.',
  'Do not let one tough problem shake you. Stay calm, lock in, and work through it.',
  'Right now is a chance to get better than you were yesterday. Take that seriously.',
  'You are capable of real progress when you stay consistent. Lock in and prove it.',
  'Focus on getting one step further than before. That is how mastery is built.',
  'Discipline today creates confidence tomorrow. Keep showing up and doing the work.',
  'This effort is not wasted. Every session is making you stronger and sharper.',
  'Stay locked in and respect the process. Improvement is earned, not given.',
  'It is okay if it takes time. What matters is that you keep pushing forward.',
  'Challenge yourself to stay focused a little longer. That extra effort changes things.',
  'You are in the middle of building something real. Keep your foot on the gas.',
  'Keep grinding even when it feels slow. Progress is still progress.',
  'Focus hard, think clearly, and trust yourself. You can solve more than you think.',
  'The work you put in today is setting up the results you want later. Stay with it.',
  'Lock in, stay disciplined, and finish strong. You are becoming better through every session.',
];

function randomMessage() {
  return ENCOURAGING_MESSAGES[
    Math.floor(Math.random() * ENCOURAGING_MESSAGES.length)
  ];
}

export class ServerChallengeService {
  constructor(settingsService, questionSelectionService, dbPool) {
    this.settingsService = settingsService;
    this.questionSelectionService = questionSelectionService;
    this.dbPool = dbPool;
  }

  buildEmbed(question, selection) {
    const delivered = selection.startedNewCycle
      ? 1
      : Math.max(1, selection.poolSize - selection.unusedCountBefore + 1);

    return buildChallengeEmbed(question, {
      title: 'Daily LeetCode Challenge',
      motivation: randomMessage(),
      questionSet: selection.filter?.questionSet,
      cycleProgress: {
        delivered,
        poolSize: selection.poolSize,
        cycleNumber: selection.cycleNumber,
      },
    });
  }

  async hasGuildDailyForDate(guildId, localDate) {
    const result = await this.dbPool.query(
      `select id from guild_question_history
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

    if (existing) {
      // A challenge has already been recorded for today — re-render and resend
      // without choosing a new question or touching history.
      const embed = buildChallengeEmbed(existing, {
        title: 'Daily LeetCode Challenge',
        motivation: randomMessage(),
        questionSet: settings.question_set,
      });
      return this._sendAndRecord(client, settings, embed, {
        guildId,
        question: existing,
        localDate,
        skipHistory: true,
      });
    }

    const selection = await this.questionSelectionService.selectForScope(
      { kind: 'guild', id: guildId },
      settings
    );

    this._logSelection(guildId, selection);

    const embed = this.buildEmbed(selection.question, selection);
    return this._sendAndRecord(client, settings, embed, {
      guildId,
      question: selection.question,
      localDate,
      skipHistory: false,
    });
  }

  async _sendAndRecord(client, settings, embed, ctx) {
    const { guildId, question, localDate, skipHistory } = ctx;

    try {
      const channel = await client.channels.fetch(settings.channel_id);
      if (!channel || !channel.isTextBased()) {
        if (!skipHistory) {
          await this._recordHistory({
            guildId,
            questionId: question.id,
            localDate,
            channelId: settings.channel_id,
            success: false,
            error: 'Configured channel is not text-based or no longer exists.',
          });
        }
        return { skipped: true, reason: 'invalid-channel' };
      }

      await channel.send({ embeds: [embed] });

      if (!skipHistory) {
        await this._recordHistory({
          guildId,
          questionId: question.id,
          localDate,
          channelId: settings.channel_id,
          success: true,
        });
      }

      return { sent: true, question };
    } catch (error) {
      if (!skipHistory) {
        await this._recordHistory({
          guildId,
          questionId: question.id,
          localDate,
          channelId: settings.channel_id,
          success: false,
          error: error?.message || 'Unknown delivery failure',
        });
      }
      return { skipped: true, reason: 'send-failed', error };
    }
  }

  _logSelection(guildId, selection) {
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
      `[SELECT guild=${guildId}] set=${filter?.questionSet} difficulty=${filter?.difficulty} ` +
        `pool=${poolSize} unused=${unusedCountBefore} cycle=${cycleNumber} ` +
        `newCycle=${startedNewCycle} fallback=${usedFallback} ` +
        `picked=#${question?.source_id} "${question?.title}"`
    );
  }

  async _recordHistory({
    guildId,
    questionId,
    localDate,
    channelId,
    success,
    error,
  }) {
    await this.dbPool.query(
      `insert into guild_question_history
       (guild_id, question_id, question_date, selection_mode, delivery_channel_id, delivery_success, error_message, delivered_at)
       values ($1, $2, $3, 'daily', $4, $5, $6, now())
       on conflict (guild_id, question_date, selection_mode)
       do update set
         question_id = excluded.question_id,
         delivery_channel_id = excluded.delivery_channel_id,
         delivery_success = excluded.delivery_success,
         error_message = excluded.error_message,
         delivered_at = CASE WHEN excluded.delivery_success = true THEN now() ELSE guild_question_history.delivered_at END`,
      [guildId, questionId, localDate, channelId, success, error || null]
    );
  }

  async runDueGuildChallenges(client, now = new Date()) {
    const guildSettings =
      await this.settingsService.listGuildSettingsWithChannels();

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

      try {
        const result = await this.postDailyChallengeForGuild(
          client,
          settings.guild_id,
          now
        );
        if (result.sent) {
          sentCount += 1;
        }
      } catch (err) {
        console.error(
          `[ServerChallengeService] Error posting daily challenge for guild ${settings.guild_id}: ${err.message}`
        );
      }
    }

    return { scannedGuilds, dueGuilds, alreadyPosted, sentCount };
  }
}
