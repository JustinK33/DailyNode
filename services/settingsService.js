import {
  DEFAULT_DIFFICULTY,
  DEFAULT_SERVER_POST_TIME,
  DEFAULT_TIMEZONE,
  DEFAULT_USER_REMINDER_TIME,
  normalizeDifficulty
} from '../lib/constants.js';
import { isValidTimeString, isValidTimezone } from '../lib/time.js';

export class SettingsService {
  constructor(dbPool) {
    this.dbPool = dbPool;
  }

  async getGuildSettings(guildId) {
    const result = await this.dbPool.query(
      'select * from guild_settings where guild_id = $1',
      [guildId]
    );

    if (result.rowCount > 0) {
      return result.rows[0];
    }

    return {
      guild_id: guildId,
      channel_id: null,
      difficulty: DEFAULT_DIFFICULTY,
      post_time: DEFAULT_SERVER_POST_TIME,
      timezone: DEFAULT_TIMEZONE
    };
  }

  async upsertGuildChannel(guildId, channelId) {
    const result = await this.dbPool.query(
      `insert into guild_settings (guild_id, channel_id)
       values ($1, $2)
       on conflict (guild_id)
       do update set channel_id = excluded.channel_id, updated_at = now()
       returning *`,
      [guildId, channelId]
    );

    return result.rows[0];
  }

  async upsertGuildDifficulty(guildId, difficulty) {
    const normalized = normalizeDifficulty(difficulty);
    const result = await this.dbPool.query(
      `insert into guild_settings (guild_id, difficulty)
       values ($1, $2)
       on conflict (guild_id)
       do update set difficulty = excluded.difficulty, updated_at = now()
       returning *`,
      [guildId, normalized]
    );

    return result.rows[0];
  }

  async upsertGuildSchedule(guildId, postTime, timezone) {
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

    return result.rows[0];
  }

  async listGuildSettingsWithChannels() {
    const result = await this.dbPool.query(
      'select * from guild_settings where channel_id is not null'
    );

    return result.rows;
  }

  async getUserSettings(userId) {
    const result = await this.dbPool.query(
      'select * from user_settings where user_id = $1',
      [userId]
    );

    if (result.rowCount > 0) {
      return result.rows[0];
    }

    return {
      user_id: userId,
      difficulty: DEFAULT_DIFFICULTY,
      reminder_enabled: false,
      reminder_time: DEFAULT_USER_REMINDER_TIME,
      timezone: DEFAULT_TIMEZONE
    };
  }

  async upsertUserDifficulty(userId, difficulty) {
    const normalized = normalizeDifficulty(difficulty);

    const result = await this.dbPool.query(
      `insert into user_settings (user_id, difficulty)
       values ($1, $2)
       on conflict (user_id)
       do update set difficulty = excluded.difficulty, updated_at = now()
       returning *`,
      [userId, normalized]
    );

    return result.rows[0];
  }

  async enableUserReminder(userId, reminderTime, timezone) {
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

    return result.rows[0];
  }

  async disableUserReminder(userId) {
    const result = await this.dbPool.query(
      `insert into user_settings (user_id, reminder_enabled)
       values ($1, false)
       on conflict (user_id)
       do update set reminder_enabled = false, updated_at = now()
       returning *`,
      [userId]
    );

    return result.rows[0];
  }

  async listUsersWithRemindersEnabled() {
    const result = await this.dbPool.query(
      'select * from user_settings where reminder_enabled = true'
    );

    return result.rows;
  }
}
