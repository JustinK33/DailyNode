// @ts-nocheck
import {
  DEFAULT_DIFFICULTY,
  DEFAULT_QUESTION_SET,
  normalizeDifficulty,
  normalizeQuestionSet,
} from '../lib/constants.ts';

// Selection guarantees:
//   1. Within a cycle (one full pass through the eligible pool), no source_id
//      repeats. A "cycle" is poolSize distinct deliveries.
//   2. When a cycle completes and the next pick starts a fresh cycle, we
//      exclude yesterday's pick when at least one alternative exists.
//   3. If history is missing or out of sync (e.g. a question is deleted from
//      the pool), we degrade gracefully rather than throw.

function randomItem(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  return items[Math.floor(Math.random() * items.length)];
}

function asInt(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export class QuestionSelectionService {
  constructor(dbPool) {
    this.dbPool = dbPool;
  }

  /**
   * Main entry point: resolves the eligible pool for the given scope/settings,
   * walks delivery history to compute the current cycle, picks an unused
   * question (or starts a fresh cycle excluding yesterday's), and returns the
   * pick alongside cycle metadata callers use for logs and embeds.
   *
   * scope: { kind: 'guild' | 'user', id: string }
   * settings: { question_set, difficulty }
   *
   * Returns a SelectionResult — never null — or throws if the catalog is
   * empty (in which case the caller should surface a configuration error).
   */
  async selectForScope(scope, settings) {
    const filter = this._normalizeFilter(settings);
    const pool = await this._fetchPool(filter);

    if (pool.length === 0) {
      // Pool is empty under the requested filter. Fall back to the default
      // filter so the bot still sends something, but flag the result so logs
      // make it obvious. Empty default = misconfigured catalog: throw.
      const fallbackPool = await this._fetchPool({
        questionSet: DEFAULT_QUESTION_SET,
        difficulty: DEFAULT_DIFFICULTY,
      });

      if (fallbackPool.length === 0) {
        throw new Error(
          'No questions available in catalog. Check question_set sync.'
        );
      }

      const fallbackPick = randomItem(fallbackPool);
      return {
        question: fallbackPick,
        poolSize: 0,
        unusedCountBefore: 0,
        cycleNumber: 1,
        startedNewCycle: true,
        inCycleSourceIds: [],
        usedFallback: true,
        filter,
      };
    }

    const deliveredSourceIds = await this._fetchDeliveredSourceIdsOldestFirst(
      scope,
      filter
    );
    const cycle = this._computeCycleState(deliveredSourceIds, pool.length);

    const usedThisCycle = new Set(cycle.inCycleSourceIds);
    const unusedInPool = pool.filter(
      (q) => !usedThisCycle.has(asInt(q.source_id))
    );
    const unusedCountBefore = unusedInPool.length;

    let question;
    let startedNewCycle = false;

    if (unusedInPool.length > 0) {
      // Normal in-cycle pick — every source_id here is unused this cycle, so
      // a uniform random choice still satisfies the no-repeat guarantee.
      question = randomItem(unusedInPool);
    } else {
      // Pool exhausted in this cycle. Start a fresh cycle and avoid repeating
      // yesterday's pick when an alternative exists.
      startedNewCycle = true;
      const yesterdaySourceId = cycle.lastDeliveredSourceId;
      const alternatives =
        pool.length > 1
          ? pool.filter((q) => asInt(q.source_id) !== yesterdaySourceId)
          : pool;
      question = randomItem(alternatives.length > 0 ? alternatives : pool);
    }

    return {
      question,
      poolSize: pool.length,
      unusedCountBefore,
      cycleNumber: startedNewCycle ? cycle.cycleNumber + 1 : cycle.cycleNumber,
      startedNewCycle,
      inCycleSourceIds: startedNewCycle ? [] : cycle.inCycleSourceIds,
      usedFallback: false,
      filter,
    };
  }

  // ---- Backward-compatible API used by callers and existing tests ----

  async listRecentGuildQuestionIds(
    guildId,
    questionSet,
    difficulty = DEFAULT_DIFFICULTY
  ) {
    const filter = this._normalizeFilter({
      question_set: questionSet,
      difficulty,
    });
    return this._listRecentSourceIds({ kind: 'guild', id: guildId }, filter);
  }

  async listRecentUserQuestionIds(
    userId,
    questionSet,
    difficulty = DEFAULT_DIFFICULTY
  ) {
    const filter = this._normalizeFilter({
      question_set: questionSet,
      difficulty,
    });
    return this._listRecentSourceIds({ kind: 'user', id: userId }, filter);
  }

  async getQuestionPoolSize(questionSet, difficulty = DEFAULT_DIFFICULTY) {
    const filter = this._normalizeFilter({
      question_set: questionSet,
      difficulty,
    });
    return this._fetchPoolSize(filter);
  }

  // ---- Internal helpers ----

  _normalizeFilter(settings) {
    return {
      questionSet: normalizeQuestionSet(
        settings?.question_set || DEFAULT_QUESTION_SET
      ),
      difficulty: normalizeDifficulty(
        settings?.difficulty || DEFAULT_DIFFICULTY
      ),
    };
  }

  async _fetchPoolSize(filter) {
    let query =
      'select count(*)::int as count from questions where question_set = $1';
    const params = [filter.questionSet];

    if (filter.difficulty !== DEFAULT_DIFFICULTY) {
      params.push(filter.difficulty);
      query += ` and difficulty = $${params.length}`;
    }

    const result = await this.dbPool.query(query, params);
    return Number(result.rows?.[0]?.count || 0);
  }

  async _fetchPool(filter) {
    let query =
      'select id, source_id, title, difficulty, link, question_set from questions where question_set = $1';
    const params = [filter.questionSet];

    if (filter.difficulty !== DEFAULT_DIFFICULTY) {
      params.push(filter.difficulty);
      query += ` and difficulty = $${params.length}`;
    }

    const result = await this.dbPool.query(query, params);
    return (result.rows || []).filter(
      (row) => row && row.id && row.title && row.difficulty && row.link
    );
  }

  async _fetchDeliveredSourceIdsOldestFirst(scope, filter) {
    const historyTable =
      scope.kind === 'guild'
        ? 'guild_question_history'
        : 'user_question_history';
    const scopeColumn = scope.kind === 'guild' ? 'guild_id' : 'user_id';

    let query = `select q.source_id as source_id
       from ${historyTable} h
       join questions q on q.id = h.question_id
       where h.${scopeColumn} = $1 and q.question_set = $2`;

    const params = [scope.id, filter.questionSet];

    if (filter.difficulty !== DEFAULT_DIFFICULTY) {
      params.push(filter.difficulty);
      query += ` and q.difficulty = $${params.length}`;
    }

    query += ' order by h.delivered_at asc, h.id asc';

    const result = await this.dbPool.query(query, params);
    return (result.rows || [])
      .map((row) => asInt(row.source_id))
      .filter((value) => value !== null);
  }

  async _listRecentSourceIds(scope, filter) {
    const poolSize = await this._fetchPoolSize(filter);
    if (poolSize === 0) {
      return [];
    }

    const delivered = await this._fetchDeliveredSourceIdsOldestFirst(
      scope,
      filter
    );
    return this._computeCycleState(delivered, poolSize).inCycleSourceIds;
  }

  /**
   * Walks chronological delivery history (oldest-first) and reconstructs the
   * current cycle. A cycle is `poolSize` DISTINCT deliveries: once a cycle
   * fills, the next delivery starts a fresh one. Excluding the in-cycle
   * source_ids guarantees every question is delivered once before any repeats.
   *
   * Returns:
   *   cycleNumber: 1-indexed cycle currently in progress
   *   inCycleSourceIds: distinct source_ids delivered in the active cycle, newest-first
   *   lastDeliveredSourceId: source_id of the most recent delivery (or null)
   */
  _computeCycleState(deliveredOldestFirst, poolSize) {
    if (
      !Array.isArray(deliveredOldestFirst) ||
      deliveredOldestFirst.length === 0 ||
      poolSize <= 0
    ) {
      return {
        cycleNumber: 1,
        inCycleSourceIds: [],
        lastDeliveredSourceId: null,
      };
    }

    let cycleSet = new Set();
    let cycleStartIdx = 0;
    let cycleNumber = 1;

    for (let i = 0; i < deliveredOldestFirst.length; i++) {
      if (cycleSet.size >= poolSize) {
        cycleSet = new Set();
        cycleStartIdx = i;
        cycleNumber += 1;
      }
      cycleSet.add(deliveredOldestFirst[i]);
    }

    const seen = new Set();
    const inCycleSourceIds = [];
    for (let i = deliveredOldestFirst.length - 1; i >= cycleStartIdx; i--) {
      const sourceId = deliveredOldestFirst[i];
      if (!seen.has(sourceId)) {
        seen.add(sourceId);
        inCycleSourceIds.push(sourceId);
      }
    }

    return {
      cycleNumber,
      inCycleSourceIds,
      lastDeliveredSourceId:
        deliveredOldestFirst[deliveredOldestFirst.length - 1],
    };
  }
}
