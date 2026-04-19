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
      const poolSize = await this.getQuestionPoolSize(normalizedQuestionSet, normalizedDifficulty);

      if (poolSize === 0) {
        return [];
      }

      const rawHistoryLimit = poolSize + 1;
      let query =
        `select q.source_id
         from guild_question_history gh
         join questions q on q.id = gh.question_id
         where gh.guild_id = $1 and q.question_set = $2`;

      const params = [guildId, normalizedQuestionSet];

      if (normalizedDifficulty !== DEFAULT_DIFFICULTY) {
        params.push(normalizedDifficulty);
        query += ` and q.difficulty = $${params.length}`;
      }

      params.push(rawHistoryLimit);
      query +=
        `
         order by gh.delivered_at desc
         limit $${params.length}`;

      const result = await this.dbPool.query(query, params);
      return this.buildCurrentCycleSourceIds(result.rows || [], poolSize);
    } catch (err) {
      console.error(`[QuestionSelectionService] Error listing recent guild question IDs: ${err.message}`);
      throw err;
    }
  }

  async listRecentUserQuestionIds(userId, questionSet, difficulty = DEFAULT_DIFFICULTY) {
    try {
      const normalizedQuestionSet = normalizeQuestionSet(questionSet || DEFAULT_QUESTION_SET);
      const normalizedDifficulty = normalizeDifficulty(difficulty || DEFAULT_DIFFICULTY);
      const poolSize = await this.getQuestionPoolSize(normalizedQuestionSet, normalizedDifficulty);

      if (poolSize === 0) {
        return [];
      }

      const rawHistoryLimit = poolSize + 1;
      let query =
        `select q.source_id
         from user_question_history uh
         join questions q on q.id = uh.question_id
         where uh.user_id = $1 and q.question_set = $2`;

      const params = [userId, normalizedQuestionSet];

      if (normalizedDifficulty !== DEFAULT_DIFFICULTY) {
        params.push(normalizedDifficulty);
        query += ` and q.difficulty = $${params.length}`;
      }

      params.push(rawHistoryLimit);
      query +=
        `
         order by uh.delivered_at desc
         limit $${params.length}`;

      const result = await this.dbPool.query(query, params);
      return this.buildCurrentCycleSourceIds(result.rows || [], poolSize);
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
      const recentSourceIds = excludeSourceIds || [];

      const exactRows = await this.selectByDifficulty(normalizedDifficulty, normalizedQuestionSet, recentSourceIds);
      if (exactRows.length > 0) {
        const question = this.pickQuestionWithRecencyWeight(exactRows, recentSourceIds);
        this._validateQuestion(question);
        return question;
      }

      const fallbackRows = await this.selectByDifficulty(normalizedDifficulty, normalizedQuestionSet, []);
      if (fallbackRows.length > 0) {
        const question = this.pickQuestionForCycleReset(fallbackRows, recentSourceIds);
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

  buildCurrentCycleSourceIds(rows, poolSize) {
    const cycleSourceIds = [];
    const seen = new Set();

    for (const row of rows) {
      const sourceId = Number(row.source_id);
      if (!Number.isInteger(sourceId)) {
        continue;
      }

      if (seen.has(sourceId)) {
        break;
      }

      seen.add(sourceId);
      cycleSourceIds.push(sourceId);

      if (cycleSourceIds.length >= poolSize) {
        break;
      }
    }

    return cycleSourceIds;
  }

  pickQuestionForCycleReset(questions, recentSourceIds = []) {
    if (!Array.isArray(questions) || questions.length === 0) {
      return null;
    }

    if (questions.length === 1) {
      return questions[0];
    }

    if (!Array.isArray(recentSourceIds) || recentSourceIds.length === 0) {
      return randomItem(questions);
    }

    const lastSourceId = Number(recentSourceIds[0]);
    const isExhaustedPool = recentSourceIds.length >= questions.length;

    if (!isExhaustedPool || !Number.isInteger(lastSourceId)) {
      return this.pickQuestionWithRecencyWeight(questions, recentSourceIds);
    }

    // On cycle reset, avoid choosing yesterday's question when possible.
    const withoutLastQuestion = questions.filter((question) => Number(question.source_id) !== lastSourceId);

    if (withoutLastQuestion.length === 0) {
      return randomItem(questions);
    }

    return randomItem(withoutLastQuestion);
  }

  pickQuestionWithRecencyWeight(questions, recentSourceIds = []) {
    if (!Array.isArray(questions) || questions.length === 0) {
      return null;
    }

    if (questions.length === 1) {
      return questions[0];
    }

    if (!Array.isArray(recentSourceIds) || recentSourceIds.length === 0) {
      return randomItem(questions);
    }

    const recencyIndexBySourceId = new Map(
      recentSourceIds.map((sourceId, index) => [Number(sourceId), index])
    );

    let totalWeight = 0;
    const weightedCandidates = questions.map((question) => {
      const sourceId = Number(question.source_id);
      const recencyIndex = recencyIndexBySourceId.get(sourceId);

      // Favor unseen questions heavily, and down-rank recently seen questions.
      let weight = 2;
      if (recencyIndex !== undefined) {
        const denominator = Math.max(1, recentSourceIds.length - 1);
        const ageRatio = recencyIndex / denominator;
        weight = 0.1 + ageRatio * 0.9;
      }

      totalWeight += weight;
      return { question, weight };
    });

    if (totalWeight <= 0) {
      return randomItem(questions);
    }

    let cursor = Math.random() * totalWeight;
    for (const candidate of weightedCandidates) {
      cursor -= candidate.weight;
      if (cursor <= 0) {
        return candidate.question;
      }
    }

    return weightedCandidates[weightedCandidates.length - 1].question;
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
        query += ` and not (source_id = ANY($${params.length}::int[]))`;
      }

      const result = await this.dbPool.query(query, params);
      return result.rows || [];
    } catch (err) {
      console.error(`[QuestionSelectionService] Error selecting by difficulty: ${err.message}`);
      throw err;
    }
  }
}
