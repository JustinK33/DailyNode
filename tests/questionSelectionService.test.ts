import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { QuestionCatalogService } from '../services/questionCatalogService.ts';
import { QuestionSelectionService } from '../services/questionSelectionService.ts';
import { UserChallengeService } from '../services/userChallengeService.ts';

describe('QuestionSelectionService', () => {
  it('returns the current cycle deliveries newest-first for an in-progress cycle', async () => {
    const queries = [];
    const dbPool = {
      async query(sql, params) {
        queries.push({ sql, params });

        if (sql.includes('select count(*)::int as count from questions')) {
          return { rows: [{ count: 5 }] };
        }

        if (sql.includes('from user_question_history')) {
          return {
            rows: [{ source_id: 101 }, { source_id: 102 }, { source_id: 103 }]
          };
        }

        throw new Error(`Unexpected query: ${sql}`);
      }
    };

    const service = new QuestionSelectionService(dbPool);
    const ids = await service.listRecentUserQuestionIds('user-1', 'blind75', 'mixed');

    assert.deepEqual(ids, [103, 102, 101]);
    assert.equal(queries.length, 2);
    assert.deepEqual(queries[0].params, ['blind75']);
    assert.deepEqual(queries[1].params, ['user-1', 'blind75']);
  });

  it('resets the exclusion list once the active set has been fully delivered', async () => {
    const dbPool = {
      async query(sql) {
        if (sql.includes('select count(*)::int as count from questions')) {
          return { rows: [{ count: 3 }] };
        }
        if (sql.includes('from user_question_history')) {
          // Cycle 1 (full: 1,2,3) followed by start of cycle 2 (just 7).
          return {
            rows: [
              { source_id: 1 },
              { source_id: 2 },
              { source_id: 3 },
              { source_id: 7 }
            ]
          };
        }
        throw new Error(`Unexpected query: ${sql}`);
      }
    };

    const service = new QuestionSelectionService(dbPool);
    const ids = await service.listRecentUserQuestionIds('user-2', 'blind75', 'mixed');

    assert.deepEqual(ids, [7]);
  });

  it('treats a freshly completed cycle as fully excluded so the next pick triggers a reset', async () => {
    const dbPool = {
      async query(sql) {
        if (sql.includes('select count(*)::int as count from questions')) {
          return { rows: [{ count: 3 }] };
        }
        if (sql.includes('from user_question_history')) {
          return {
            rows: [{ source_id: 1 }, { source_id: 2 }, { source_id: 3 }]
          };
        }
        throw new Error(`Unexpected query: ${sql}`);
      }
    };

    const service = new QuestionSelectionService(dbPool);
    const ids = await service.listRecentUserQuestionIds('user-3', 'blind75', 'mixed');

    assert.deepEqual(ids, [3, 2, 1]);
  });

  it('passes a difficulty filter through so easy/medium/hard cycles are independent', async () => {
    const queries = [];
    const dbPool = {
      async query(sql, params) {
        queries.push({ sql, params });
        if (sql.includes('select count(*)::int as count from questions')) {
          return { rows: [{ count: 4 }] };
        }
        if (sql.includes('from user_question_history')) {
          return { rows: [{ source_id: 50 }, { source_id: 51 }] };
        }
        throw new Error(`Unexpected query: ${sql}`);
      }
    };

    const service = new QuestionSelectionService(dbPool);
    const ids = await service.listRecentUserQuestionIds('user-4', 'neetcode150', 'easy');

    assert.deepEqual(ids, [51, 50]);
    assert.deepEqual(queries[0].params, ['neetcode150', 'easy']);
    assert.deepEqual(queries[1].params, ['user-4', 'neetcode150', 'easy']);
    assert.match(queries[1].sql, /q\.difficulty = \$3/);
  });

  it('restarts selection inside the active set before falling back to the global default set', async () => {
    const queries = [];
    const dbPool = {
      async query(sql, params) {
        queries.push({ sql, params });

        if (sql.includes('not (source_id = ANY')) {
          return { rows: [] };
        }

        if (queries.length === 2) {
          return {
            rows: [
              {
                id: 201,
                source_id: 201,
                title: 'Cycle reset candidate',
                difficulty: 'easy',
                link: 'https://example.com/question/201'
              }
            ]
          };
        }

        throw new Error(`Unexpected fallback query: ${sql}`);
      }
    };

    const service = new QuestionSelectionService(dbPool);
    const question = await service.selectQuestion({
      difficulty: 'mixed',
      question_set: 'blind75',
      excludeSourceIds: [1, 2, 3]
    });

    assert.equal(question.source_id, 201);
    assert.equal(queries.length, 2);
  });

  it('avoids repeating yesterday question when a new cycle starts', async () => {
    const service = new QuestionSelectionService({ query: async () => ({ rows: [] }) });
    const question = service.pickQuestionForCycleReset(
      [
        { source_id: 11, id: 11, title: 'Q11', difficulty: 'easy', link: 'https://example.com/11' },
        { source_id: 22, id: 22, title: 'Q22', difficulty: 'easy', link: 'https://example.com/22' }
      ],
      [11, 22]
    );

    assert.equal(question.source_id, 22);
  });
});

describe('QuestionCatalogService', () => {
  it('deduplicates repeated questions by id when loading a dataset', async () => {
    const tempPath = path.join(os.tmpdir(), `dailynode-test-${Date.now()}.json`);
    const dataset = [
      { id: 1, title: 'First', difficulty: 'Easy', link: 'https://leetcode.com/problems/first/' },
      { id: 1, title: 'First duplicate', difficulty: 'Easy', link: 'https://leetcode.com/problems/first/' },
      { id: 2, title: 'Second', difficulty: 'Medium', link: 'https://leetcode.com/problems/second/' }
    ];

    await fs.writeFile(tempPath, JSON.stringify(dataset), 'utf8');

    try {
      const service = new QuestionCatalogService({}, tempPath);
      const loaded = await service.loadDataset();

      assert.equal(loaded.length, 2);
      assert.deepEqual(
        loaded.map((question) => question.id),
        [1, 2]
      );
    } finally {
      await fs.unlink(tempPath);
    }
  });
});

describe('UserChallengeService', () => {
  it('passes the active question set and difficulty into practice selection', async () => {
    let receivedArgs = null;

    const settingsService = {
      async getUserSettings() {
        return {
          difficulty: 'hard',
          question_set: 'neetcode250',
          timezone: 'America/New_York'
        };
      }
    };

    const questionSelectionService = {
      async listRecentUserQuestionIds(...args) {
        receivedArgs = args;
        return [301, 302];
      },
      async selectQuestion(payload) {
        return {
          id: 400,
          source_id: 400,
          title: 'Practice question',
          difficulty: payload.difficulty,
          link: 'https://example.com/question/400'
        };
      }
    };

    const dbPool = {
      async query() {
        return { rows: [] };
      }
    };

    const service = new UserChallengeService(settingsService, questionSelectionService, dbPool);
    const question = await service.getPracticeQuestion('user-99');

    assert.equal(question.source_id, 400);
    assert.deepEqual(receivedArgs, ['user-99', 'neetcode250', 'hard']);
  });
});