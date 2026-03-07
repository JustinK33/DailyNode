import { DEFAULT_DIFFICULTY, normalizeDifficulty } from '../lib/constants.js';

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export class QuestionSelectionService {
  constructor(dbPool) {
    this.dbPool = dbPool;
  }

  async listRecentGuildQuestionIds(guildId, limit = 30) {
    const result = await this.dbPool.query(
      `select q.source_id
       from guild_question_history gh
       join questions q on q.id = gh.question_id
       where gh.guild_id = $1
       order by gh.delivered_at desc
       limit $2`,
      [guildId, limit]
    );

    return result.rows.map((row) => row.source_id);
  }

  async listRecentUserQuestionIds(userId, limit = 30) {
    const result = await this.dbPool.query(
      `select q.source_id
       from user_question_history uh
       join questions q on q.id = uh.question_id
       where uh.user_id = $1
       order by uh.delivered_at desc
       limit $2`,
      [userId, limit]
    );

    return result.rows.map((row) => row.source_id);
  }

  async selectQuestion({ difficulty, excludeSourceIds = [] }) {
    const normalized = normalizeDifficulty(difficulty || DEFAULT_DIFFICULTY);

    const exactRows = await this.selectByDifficulty(normalized, excludeSourceIds);
    if (exactRows.length > 0) {
      return randomItem(exactRows);
    }

    const fallbackRows = await this.selectByDifficulty(DEFAULT_DIFFICULTY, []);
    if (fallbackRows.length === 0) {
      throw new Error('No questions available in database.');
    }

    return randomItem(fallbackRows);
  }

  async selectByDifficulty(difficulty, excludeSourceIds) {
    if (difficulty === DEFAULT_DIFFICULTY) {
      if (excludeSourceIds.length === 0) {
        const result = await this.dbPool.query('select * from questions');
        return result.rows;
      }

      const result = await this.dbPool.query(
        'select * from questions where source_id != all($1::int[])',
        [excludeSourceIds]
      );
      return result.rows;
    }

    if (excludeSourceIds.length === 0) {
      const result = await this.dbPool.query(
        'select * from questions where difficulty = $1',
        [difficulty]
      );
      return result.rows;
    }

    const result = await this.dbPool.query(
      'select * from questions where difficulty = $1 and source_id != all($2::int[])',
      [difficulty, excludeSourceIds]
    );

    return result.rows;
  }
}
