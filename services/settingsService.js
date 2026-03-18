import {
  DEFAULT_DIFFICULTY,
  DEFAULT_QUESTION_SET,
  DEFAULT_SERVER_POST_TIME,
  DEFAULT_TIMEZONE,
  DEFAULT_USER_REMINDER_TIME,
  normalizeDifficulty,
  normalizeQuestionSet
} from '../lib/constants.js';
import { isValidTimeString, isValidTimezone } from '../lib/time.js';

export class SettingsService {
  constructor(dbPool) {
    this.dbPool = dbPool;
  }

  async getGuildSettings(guildId) {
    try {
      const result = await this.dbPool.query(
        'select * from guild_settings where guild_id = $1',
        [guildId]
      );

      if (result.rowCount > 0 && result.rows[0]) {
        return result.rows[0];
      }

      return {
        guild_id: guildId,
        channel_id: null,
        difficulty: DEFAULT_DIFFICULTY,
        question_set: DEFAULT_QUESTION_SET,
        post_time: DEFAULT_SERVER_POST_TIME,
        timezone: DEFAULT_TIMEZONE,
        created_at: new Date(),
        updated_at: new Date()
      };
    } catch (err) {
      console.error(`[SettingsService] Error fetching guild settings for ${guildId}: ${err.message}`);
      throw err;
    }
  }

  async upsertGuildChannel(guildId, channelId) {
    try {
      const result = await this.dbPool.query(
        `insert into guild_settings (guild_id, channel_id)
         values ($1, $2)
         on conflict (guild_id)
         do update set channel_id = excluded.channel_id, updated_at = now()
         returning *`,
        [guildId, channelId]
      );

      if (!result.rows[0]) {
        throw new Error('Failed to insert/update guild channel');
      }

      return result.rows[0];
    } catch (err) {
      console.error(`[SettingsService] Error upserting guild channel for ${guildId}: ${err.message}`);
      throw err;
    }
  }

  async upsertGuildDifficulty(guildId, difficulty) {
    try {
      const normalized = normalizeDifficulty(difficulty);
      const result = await this.dbPool.query(
        `insert into guild_settings (guild_id, difficulty)
         values ($1, $2)
         on conflict (guild_id)
         do update set difficulty = excluded.difficulty, updated_at = now()
         returning *`,
        [guildId, normalized]
      );

      if (!result.rows[0]) {
        throw new Error('Failed to insert/update guild difficulty');
      }

      return result.rows[0];
    } catch (err) {
      console.error(`[SettingsService] Error upserting guild difficulty for ${guildId}: ${err.message}`);
      throw err;
    }
  }

  async upsertGuildSchedule(guildId, postTime, timezone) {
    try {
      if (!isValidTimeString(postTime)) {
        throw new Error('Time must be in HH:MM 24-hour format.');
      }

      if (!isValidTimezone(timezone)) {
        throw new Error('Invalid IANA timezone. Example: America/New_York');
      }

      const result = await this.dbPool.query(
        `insert into guild_settings (guild_id, post_time, timezone)
         values ($1, $2, $3)
         on conflict (guild_id)
         do update set post_time = excluded.post_time, timezone = excluded.timezone, updated_at = now()
         returning *`,
        [guildId, postTime, timezone]
      );

      if (!result.rows[0]) {
        throw new Error('Failed to insert/update guild schedule');
      }

      return result.rows[0];
    } catch (err) {
      console.error(`[SettingsService] Error upserting guild schedule for ${guildId}: ${err.message}`);
      throw err;
    }
  }

  async listGuildSettingsWithChannels() {
    try {
      const result = await this.dbPool.query(
        'select * from guild_settings where channel_id is not null'
      );
      return result.rows || [];
    } catch (err) {
      console.error(`[SettingsService] Error listing guild settings: ${err.message}`);
      throw err;
    }
  }

  async getUserSettings(userId) {
    try {
      const result = await this.dbPool.query(
        'select * from user_settings where user_id = $1',
        [userId]
      );

      if (result.rowCount > 0 && result.rows[0]) {
        return result.rows[0];
      }

      return {
        user_id: userId,
        difficulty: DEFAULT_DIFFICULTY,
        question_set: DEFAULT_QUESTION_SET,
        reminder_enabled: false,
        reminder_time: DEFAULT_USER_REMINDER_TIME,
        timezone: DEFAULT_TIMEZONE,
        created_at: new Date(),
        updated_at: new Date()
      };
    } catch (err) {
      console.error(`[SettingsService] Error fetching user settings for ${userId}: ${err.message}`);
      throw err;
    }
  }

  async upsertUserDifficulty(userId, difficulty) {
    try {
      const normalized = normalizeDifficulty(difficulty);

      const result = await this.dbPool.query(
        `insert into user_settings (user_id, difficulty)
         values ($1, $2)
         on conflict (user_id)
         do update set difficulty = excluded.difficulty, updated_at = now()
         returning *`,
        [userId, normalized]
      );

      if (!result.rows[0]) {
        throw new Error('Failed to insert/update user difficulty');
      }

      return result.rows[0];
    } catch (err) {
      console.error(`[SettingsService] Error upserting user difficulty for ${userId}: ${err.message}`);
      throw err;
    }
  }

  async enableUserReminder(userId, reminderTime, timezone) {
    try {
      if (!isValidTimeString(reminderTime)) {
        throw new Error('Time must be in HH:MM 24-hour format.');
      }

      if (!isValidTimezone(timezone)) {
        throw new Error('Invalid IANA timezone. Example: America/New_York');
      }

      const result = await this.dbPool.query(
        `insert into user_settings (user_id, reminder_enabled, reminder_time, timezone)
         values ($1, true, $2, $3)
         on conflict (user_id)
         do update set
           reminder_enabled = true,
           reminder_time = excluded.reminder_time,
           timezone = excluded.timezone,
           updated_at = now()
         returning *`,
        [userId, reminderTime, timezone]
      );

      if (!result.rows[0]) {
        throw new Error('Failed to insert/update user reminder settings');
      }

      return result.rows[0];
    } catch (err) {
      console.error(`[SettingsService] Error enabling user reminder for ${userId}: ${err.message}`);
      throw err;
    }
  }

  async disableUserReminder(userId) {
    try {
      const result = await this.dbPool.query(
        `insert into user_settings (user_id, reminder_enabled)
         values ($1, false)
         on conflict (user_id)
         do update set reminder_enabled = false, updated_at = now()
         returning *`,
        [userId]
      );

      if (!result.rows[0]) {
        throw new Error('Failed to insert/update user reminder settings');
      }

      return result.rows[0];
    } catch (err) {
      console.error(`[SettingsService] Error disabling user reminder for ${userId}: ${err.message}`);
      throw err;
    }
  }

  async listUsersWithRemindersEnabled() {
    try {
      const result = await this.dbPool.query(
        'select * from user_settings where reminder_enabled = true'
      );
      return result.rows || [];
    } catch (err) {
      console.error(`[SettingsService] Error listing users with reminders enabled: ${err.message}`);
      throw err;
    }
  }

  async upsertGuildQuestionSet(guildId, questionSet) {
    try {
      const normalized = normalizeQuestionSet(questionSet);
      const result = await this.dbPool.query(
        `insert into guild_settings (guild_id, question_set)
         values ($1, $2)
         on conflict (guild_id)
         do update set question_set = excluded.question_set, updated_at = now()
         returning *`,
        [guildId, normalized]
      );

      if (!result.rows[0]) {
        throw new Error('Failed to insert/update guild question set');
      }

      return result.rows[0];
    } catch (err) {
      console.error(`[SettingsService] Error upserting guild question set for ${guildId}: ${err.message}`);
      throw err;
    }
  }

  async upsertUserQuestionSet(userId, questionSet) {
    try {
      const normalized = normalizeQuestionSet(questionSet);
      const result = await this.dbPool.query(
        `insert into user_settings (user_id, question_set)
         values ($1, $2)
         on conflict (user_id)
         do update set question_set = excluded.question_set, updated_at = now()
         returning *`,
        [userId, normalized]
      );

      if (!result.rows[0]) {
        throw new Error('Failed to insert/update user question set');
      }

      return result.rows[0];
    } catch (err) {
      console.error(`[SettingsService] Error upserting user question set for ${userId}: ${err.message}`);
      throw err;
    }
  }
}
