import {
  DEFAULT_DIFFICULTY,
  DEFAULT_QUESTION_SET,
  normalizeDifficulty,
  normalizeQuestionSet
} from '../lib/constants.js';

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export class QuestionSelectionService {
  constructor(dbPool) {
    this.dbPool = dbPool;
  }

  async listRecentGuildQuestionIds(guildId, questionSet, difficulty = DEFAULT_DIFFICULTY) {
    try {
      const normalizedQuestionSet = normalizeQuestionSet(questionSet || DEFAULT_QUESTION_SET);
      const normalizedDifficulty = normalizeDifficulty(difficulty || DEFAULT_DIFFICULTY);
      const limit = await this.getQuestionPoolSize(normalizedQuestionSet, normalizedDifficulty);

      if (limit === 0) {
        return [];
      }

      const result = await this.dbPool.query(
        `select source_id
         from (
           select q.source_id as source_id, max(gh.delivered_at) as last_delivered_at
           from guild_question_history gh
           join questions q on q.id = gh.question_id
           where gh.guild_id = $1 and q.question_set = $2
           group by q.source_id
         ) recent_questions
         order by last_delivered_at desc
         limit $3`,
        [guildId, normalizedQuestionSet, limit]
      );

      return (result.rows || []).map((row) => row.source_id);
    } catch (err) {
      console.error(`[QuestionSelectionService] Error listing recent guild question IDs: ${err.message}`);
      throw err;
    }
  }

  async listRecentUserQuestionIds(userId, questionSet, difficulty = DEFAULT_DIFFICULTY) {
    try {
      const normalizedQuestionSet = normalizeQuestionSet(questionSet || DEFAULT_QUESTION_SET);
      const normalizedDifficulty = normalizeDifficulty(difficulty || DEFAULT_DIFFICULTY);
      const limit = await this.getQuestionPoolSize(normalizedQuestionSet, normalizedDifficulty);

      if (limit === 0) {
        return [];
      }

      const result = await this.dbPool.query(
        `select source_id
         from (
           select q.source_id as source_id, max(uh.delivered_at) as last_delivered_at
           from user_question_history uh
           join questions q on q.id = uh.question_id
           where uh.user_id = $1 and q.question_set = $2
           group by q.source_id
         ) recent_questions
         order by last_delivered_at desc
         limit $3`,
        [userId, normalizedQuestionSet, limit]
      );

      return (result.rows || []).map((row) => row.source_id);
    } catch (err) {
      console.error(`[QuestionSelectionService] Error listing recent user question IDs: ${err.message}`);
      throw err;
    }
  }

  async getQuestionPoolSize(questionSet, difficulty = DEFAULT_DIFFICULTY) {
    try {
      const normalizedQuestionSet = normalizeQuestionSet(questionSet || DEFAULT_QUESTION_SET);
      const normalizedDifficulty = normalizeDifficulty(difficulty || DEFAULT_DIFFICULTY);

      let query = 'select count(*)::int as count from questions where question_set = $1';
      const params = [normalizedQuestionSet];

      if (normalizedDifficulty !== DEFAULT_DIFFICULTY) {
        params.push(normalizedDifficulty);
        query += ` and difficulty = $${params.length}`;
      }

      const result = await this.dbPool.query(query, params);
      return Number(result.rows?.[0]?.count || 0);
    } catch (err) {
      console.error(`[QuestionSelectionService] Error counting questions in pool: ${err.message}`);
      throw err;
    }
  }

  async selectQuestion({ difficulty, question_set, excludeSourceIds = [] }) {
    try {
      const normalizedDifficulty = normalizeDifficulty(difficulty || DEFAULT_DIFFICULTY);
      const normalizedQuestionSet = normalizeQuestionSet(question_set || DEFAULT_QUESTION_SET);

      const exactRows = await this.selectByDifficulty(normalizedDifficulty, normalizedQuestionSet, excludeSourceIds);
      if (exactRows.length > 0) {
        const question = randomItem(exactRows);
        this._validateQuestion(question);
        return question;
      }

      const fallbackRows = await this.selectByDifficulty(normalizedDifficulty, normalizedQuestionSet, []);
      if (fallbackRows.length > 0) {
        const question = randomItem(fallbackRows);
        this._validateQuestion(question);
        return question;
      }

      const defaultRows = await this.selectByDifficulty(DEFAULT_DIFFICULTY, DEFAULT_QUESTION_SET, []);
      if (defaultRows.length === 0) {
        throw new Error('No questions available in database.');
      }

      const question = randomItem(defaultRows);
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
