import { DEFAULT_DIFFICULTY, DEFAULT_QUESTION_SET, normalizeDifficulty } from '../lib/constants.js';

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export class QuestionSelectionService {
  constructor(dbPool) {
    this.dbPool = dbPool;
  }

  async listRecentGuildQuestionIds(guildId, limit = 30) {
    try {
      const result = await this.dbPool.query(
        `select q.source_id
         from guild_question_history gh
         join questions q on q.id = gh.question_id
         where gh.guild_id = $1
         order by gh.delivered_at desc
         limit $2`,
        [guildId, limit]
      );

      return (result.rows || []).map((row) => row.source_id);
    } catch (err) {
      console.error(`[QuestionSelectionService] Error listing recent guild question IDs: ${err.message}`);
      throw err;
    }
  }

  async listRecentUserQuestionIds(userId, limit = 30) {
    try {
      const result = await this.dbPool.query(
        `select q.source_id
         from user_question_history uh
         join questions q on q.id = uh.question_id
         where uh.user_id = $1
         order by uh.delivered_at desc
         limit $2`,
        [userId, limit]
      );

      return (result.rows || []).map((row) => row.source_id);
    } catch (err) {
      console.error(`[QuestionSelectionService] Error listing recent user question IDs: ${err.message}`);
      throw err;
    }
  }

  async selectQuestion({ difficulty, question_set, excludeSourceIds = [] }) {
    try {
      const normalizedDifficulty = normalizeDifficulty(difficulty || DEFAULT_DIFFICULTY);
      const normalizedQuestionSet = question_set || DEFAULT_QUESTION_SET;

      const exactRows = await this.selectByDifficulty(normalizedDifficulty, normalizedQuestionSet, excludeSourceIds);
      if (exactRows.length > 0) {
        const question = randomItem(exactRows);
        this._validateQuestion(question);
        return question;
      }

      const fallbackRows = await this.selectByDifficulty(DEFAULT_DIFFICULTY, DEFAULT_QUESTION_SET, []);
      if (fallbackRows.length === 0) {
        throw new Error('No questions available in database.');
      }

      const question = randomItem(fallbackRows);
      this._validateQuestion(question);
      return question;
    } catch (err) {
      console.error(`[QuestionSelectionService] Error selecting question: ${err.message}`);
      throw err;
    }
  }

  _validateQuestion(question) {
    if (!question || typeof question !== 'object') {
      throw new Error('Invalid question data returned from database');
    }
    if (!question.id || !question.title || !question.difficulty || !question.link) {
      throw new Error(`Question missing required fields: ${JSON.stringify(question)}`);
    }
  }

  async selectByDifficulty(difficulty, questionSet, excludeSourceIds) {
    try {
      // Build dynamic query based on parameters
      let query = 'select * from questions where 1=1';
      const params = [];

      // Add question_set filter (always apply)
      params.push(questionSet);
      query += ` and question_set = $${params.length}`;

      // Add difficulty filter
      if (difficulty !== DEFAULT_DIFFICULTY) {
        params.push(difficulty);
        query += ` and difficulty = $${params.length}`;
      }

      // Add exclusion filter
      if (excludeSourceIds.length > 0) {
        params.push(excludeSourceIds);
        query += ` and source_id != ANY($${params.length}::int[])`;
      }

      const result = await this.dbPool.query(query, params);
      return result.rows || [];
    } catch (err) {
      console.error(`[QuestionSelectionService] Error selecting by difficulty: ${err.message}`);
      throw err;
    }
  }
}
