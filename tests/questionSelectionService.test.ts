import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { QuestionCatalogService } from '../services/questionCatalogService.ts';
import { QuestionSelectionService } from '../services/questionSelectionService.ts';
import { UserChallengeService } from '../services/userChallengeService.ts';

type StubQuestion = {
  id: number;
  source_id: number;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  link: string;
  question_set: string;
};

type HistoryRow = {
  scope_id: string;
  question_id: number;
  source?: string;
  delivered_at: number;
};

type StubInit = {
  questions: StubQuestion[];
  guildHistory?: HistoryRow[];
  userHistory?: HistoryRow[];
};

function makeStubPool({
  questions,
  guildHistory = [],
  userHistory = [],
}: StubInit) {
  const calls: { sql: string; params: any[] }[] = [];
  const inserts: { table: string; row: HistoryRow }[] = [];

  function matchPool(sql: string, params: any[]) {
    const set = params[0];
    const difficulty = params[1];
    return questions.filter(
      (q) =>
        q.question_set === set && (!difficulty || q.difficulty === difficulty)
    );
  }

  function matchHistory(table: 'guild' | 'user', sql: string, params: any[]) {
    const [scopeId, set, difficulty] = params;
    const history = table === 'guild' ? guildHistory : userHistory;
    return history
      .filter((h) => h.scope_id === scopeId)
      .map((h) => ({
        row: h,
        q: questions.find((q) => q.id === h.question_id)!,
      }))
      .filter(
        ({ q }) =>
          q &&
          q.question_set === set &&
          (!difficulty || q.difficulty === difficulty)
      )
      .sort((a, b) => a.row.delivered_at - b.row.delivered_at)
      .map(({ q }) => ({ source_id: q.source_id }));
  }

  return {
    calls,
    inserts,
    addGuildHistory(row: HistoryRow) {
      guildHistory.push(row);
    },
    addUserHistory(row: HistoryRow) {
      userHistory.push(row);
    },
    async query(sql: string, params: any[] = []) {
      calls.push({ sql, params });

      if (sql.includes('select count(*)::int as count from questions')) {
        const rows = matchPool(sql, params);
        return { rows: [{ count: rows.length }], rowCount: 1 };
      }

      if (sql.includes('from questions where question_set = $1')) {
        const rows = matchPool(sql, params);
        return { rows, rowCount: rows.length };
      }

      if (sql.includes('from guild_question_history h')) {
        const rows = matchHistory('guild', sql, params);
        return { rows, rowCount: rows.length };
      }

      if (sql.includes('from user_question_history h')) {
        const rows = matchHistory('user', sql, params);
        return { rows, rowCount: rows.length };
      }

      if (sql.startsWith('insert into guild_question_history')) {
        inserts.push({
          table: 'guild_question_history',
          row: {
            scope_id: params[0],
            question_id: params[1],
            delivered_at: Date.now(),
          },
        });
        return { rows: [], rowCount: 1 };
      }

      if (sql.startsWith('insert into user_question_history')) {
        inserts.push({
          table: 'user_question_history',
          row: {
            scope_id: params[0],
            question_id: params[1],
            source: params[3],
            delivered_at: Date.now(),
          },
        });
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
  };
}

function pool(
  set: string,
  difficulty: StubQuestion['difficulty'],
  ids: number[],
  startId = 100
): StubQuestion[] {
  return ids.map((sid, idx) => ({
    id: startId + idx,
    source_id: sid,
    title: `${set}-${sid}`,
    difficulty,
    link: `https://leetcode.com/problems/${sid}/`,
    question_set: set,
  }));
}

describe('QuestionSelectionService.selectForScope', () => {
  it('never picks the same question twice within a single cycle', async () => {
    const questions = pool('neetcode150', 'mixed' as any, [1, 2, 3, 4, 5]);
    questions.forEach((q) => (q.difficulty = 'medium'));

    const stub = makeStubPool({ questions });
    const service = new QuestionSelectionService(stub);

    const seen = new Set<number>();
    const settings = { question_set: 'neetcode150', difficulty: 'mixed' };
    let lastDeliveredAt = 0;
    const fakeQuestionIdToHistoryEntry = (questionId: number) => {
      lastDeliveredAt += 1;
      stub.addGuildHistory({
        scope_id: 'g',
        question_id: questionId,
        delivered_at: lastDeliveredAt,
      });
    };

    for (let i = 0; i < questions.length; i++) {
      const result = await service.selectForScope(
        { kind: 'guild', id: 'g' },
        settings
      );
      assert.ok(result.question, 'must always return a question');
      assert.equal(
        seen.has(result.question.source_id),
        false,
        `repeat at step ${i}: #${result.question.source_id}`
      );
      seen.add(result.question.source_id);
      fakeQuestionIdToHistoryEntry(result.question.id);
    }

    assert.equal(seen.size, questions.length);
  });

  it('starts a new cycle only after every question in the pool has been delivered', async () => {
    const questions = pool('blind75', 'easy', [10, 20, 30]);
    const stub = makeStubPool({ questions });
    const service = new QuestionSelectionService(stub);

    // Deliver all three to fill the first cycle.
    stub.addGuildHistory({
      scope_id: 'g',
      question_id: questions[0].id,
      delivered_at: 1,
    });
    stub.addGuildHistory({
      scope_id: 'g',
      question_id: questions[1].id,
      delivered_at: 2,
    });
    stub.addGuildHistory({
      scope_id: 'g',
      question_id: questions[2].id,
      delivered_at: 3,
    });

    const result = await service.selectForScope(
      { kind: 'guild', id: 'g' },
      { question_set: 'blind75', difficulty: 'easy' }
    );

    assert.equal(result.startedNewCycle, true);
    assert.equal(result.cycleNumber, 2);
    // Yesterday was source_id=30 (the latest delivery), so it should be avoided.
    assert.notEqual(result.question.source_id, 30);
  });

  it('does not avoid yesterday when the pool is exactly one question', async () => {
    const questions = pool('blind75', 'easy', [42]);
    const stub = makeStubPool({ questions });
    const service = new QuestionSelectionService(stub);

    stub.addGuildHistory({
      scope_id: 'g',
      question_id: questions[0].id,
      delivered_at: 1,
    });

    const result = await service.selectForScope(
      { kind: 'guild', id: 'g' },
      { question_set: 'blind75', difficulty: 'easy' }
    );

    assert.equal(result.question.source_id, 42);
    assert.equal(result.startedNewCycle, true);
  });

  it('keeps server and user histories isolated for the same id string', async () => {
    const guildPool = pool('blind75', 'easy', [1, 2, 3]);
    const stub = makeStubPool({ questions: guildPool });
    const service = new QuestionSelectionService(stub);

    // Guild "abc" has used #1, #2 in its cycle. User "abc" has used nothing.
    stub.addGuildHistory({
      scope_id: 'abc',
      question_id: guildPool[0].id,
      delivered_at: 1,
    });
    stub.addGuildHistory({
      scope_id: 'abc',
      question_id: guildPool[1].id,
      delivered_at: 2,
    });

    const guildResult = await service.selectForScope(
      { kind: 'guild', id: 'abc' },
      { question_set: 'blind75', difficulty: 'easy' }
    );
    const userResult = await service.selectForScope(
      { kind: 'user', id: 'abc' },
      { question_set: 'blind75', difficulty: 'easy' }
    );

    assert.equal(
      guildResult.question.source_id,
      3,
      'guild "abc" should only have #3 unused'
    );
    assert.equal(
      userResult.unusedCountBefore,
      3,
      'user "abc" should still have full pool unused'
    );
  });

  it('filters the eligible pool by difficulty and question_set', async () => {
    const questions = [
      ...pool('blind75', 'easy', [1, 2]),
      ...pool('blind75', 'hard', [3, 4], 200),
      ...pool('neetcode150', 'easy', [1, 2], 300), // same source_ids as blind75-easy but different set
    ];
    const stub = makeStubPool({ questions });
    const service = new QuestionSelectionService(stub);

    const result = await service.selectForScope(
      { kind: 'guild', id: 'g' },
      { question_set: 'blind75', difficulty: 'easy' }
    );

    assert.equal(result.poolSize, 2);
    assert.ok([1, 2].includes(result.question.source_id));
    assert.equal(result.question.question_set, 'blind75');
  });

  it('treats the same LeetCode source_id as distinct rows across question_sets', async () => {
    // Both rows have source_id=1 but are members of different sets and have
    // different database ids. Selection per set should be independent.
    const questions = [
      ...pool('blind75', 'easy', [1]),
      ...pool('neetcode150', 'easy', [1], 500),
    ];
    const stub = makeStubPool({ questions });
    const service = new QuestionSelectionService(stub);

    const blind = await service.selectForScope(
      { kind: 'user', id: 'u' },
      { question_set: 'blind75', difficulty: 'easy' }
    );
    const neetcode = await service.selectForScope(
      { kind: 'user', id: 'u' },
      { question_set: 'neetcode150', difficulty: 'easy' }
    );

    assert.equal(blind.question.question_set, 'blind75');
    assert.equal(neetcode.question.question_set, 'neetcode150');
    assert.notEqual(blind.question.id, neetcode.question.id);
  });

  it('falls back to the default catalog when the requested pool is empty', async () => {
    const questions = pool('neetcode150', 'medium', [50, 51, 52]);
    const stub = makeStubPool({ questions });
    const service = new QuestionSelectionService(stub);

    const result = await service.selectForScope(
      { kind: 'guild', id: 'g' },
      { question_set: 'blind75', difficulty: 'hard' } // nothing matches
    );

    assert.equal(result.usedFallback, true);
    assert.equal(result.poolSize, 0);
    assert.ok([50, 51, 52].includes(result.question.source_id));
  });

  it('throws when no questions exist in the catalog at all', async () => {
    const stub = makeStubPool({ questions: [] });
    const service = new QuestionSelectionService(stub);

    await assert.rejects(
      () =>
        service.selectForScope(
          { kind: 'guild', id: 'g' },
          { question_set: 'blind75', difficulty: 'easy' }
        ),
      /No questions available/
    );
  });

  it('simulates a 75-day cycle and a clean rollover into cycle 2', async () => {
    // Replicates the production scenario: guild on a 75-question pool. We
    // assert no repeats across 75 picks, then that day 76 starts cycle 2
    // without selecting day 75's question.
    const ids = Array.from({ length: 75 }, (_, i) => i + 1);
    const questions = pool('blind75', 'easy', ids);
    const stub = makeStubPool({ questions });
    const service = new QuestionSelectionService(stub);

    const seen = new Set<number>();
    let nextDeliveredAt = 1;
    let lastQuestionSourceId: number | null = null;

    for (let i = 0; i < 75; i++) {
      const result = await service.selectForScope(
        { kind: 'guild', id: 'g' },
        { question_set: 'blind75', difficulty: 'easy' }
      );
      assert.equal(
        seen.has(result.question.source_id),
        false,
        `day ${i + 1}: repeat #${result.question.source_id}`
      );
      seen.add(result.question.source_id);
      stub.addGuildHistory({
        scope_id: 'g',
        question_id: result.question.id,
        delivered_at: nextDeliveredAt++,
      });
      lastQuestionSourceId = result.question.source_id;
    }

    assert.equal(seen.size, 75, 'all 75 questions delivered exactly once');

    // Day 76 starts cycle 2; must avoid day 75's pick.
    const day76 = await service.selectForScope(
      { kind: 'guild', id: 'g' },
      { question_set: 'blind75', difficulty: 'easy' }
    );
    assert.equal(day76.startedNewCycle, true);
    assert.equal(day76.cycleNumber, 2);
    assert.notEqual(day76.question.source_id, lastQuestionSourceId);
  });

  it('continues past duplicate history rows without inflating cycle count', async () => {
    const questions = pool('blind75', 'easy', [1, 2, 3]);
    const stub = makeStubPool({ questions });
    const service = new QuestionSelectionService(stub);

    // History has a stray duplicate of #1. Should not trigger a premature cycle reset.
    stub.addGuildHistory({
      scope_id: 'g',
      question_id: questions[0].id,
      delivered_at: 1,
    });
    stub.addGuildHistory({
      scope_id: 'g',
      question_id: questions[0].id,
      delivered_at: 2,
    });

    const result = await service.selectForScope(
      { kind: 'guild', id: 'g' },
      { question_set: 'blind75', difficulty: 'easy' }
    );

    assert.equal(result.cycleNumber, 1, 'should still be in the first cycle');
    assert.ok(
      [2, 3].includes(result.question.source_id),
      'should pick an unused question'
    );
  });
});

describe('QuestionSelectionService backward-compatible helpers', () => {
  it('listRecentGuildQuestionIds returns the current cycle source_ids newest-first', async () => {
    const questions = pool('blind75', 'easy', [1, 2, 3, 4, 5]);
    const stub = makeStubPool({ questions });
    const service = new QuestionSelectionService(stub);

    [1, 2, 3].forEach((sid, idx) => {
      stub.addGuildHistory({
        scope_id: 'g',
        question_id: questions.find((q) => q.source_id === sid)!.id,
        delivered_at: idx + 1,
      });
    });

    const ids = await service.listRecentGuildQuestionIds(
      'g',
      'blind75',
      'easy'
    );
    assert.deepEqual(ids, [3, 2, 1]);
  });

  it('reconstructs the cycle correctly after a reset (algorithm-level test)', () => {
    const service = new QuestionSelectionService({
      async query() {
        return { rows: [] };
      },
    } as any);
    // poolSize=3, history is "full cycle 1,2,3" followed by start of cycle 2: 7.
    const state = (service as any)._computeCycleState([1, 2, 3, 7], 3);
    assert.deepEqual(state.inCycleSourceIds, [7]);
    assert.equal(state.cycleNumber, 2);
    assert.equal(state.lastDeliveredSourceId, 7);
  });

  it('reports cycle 1 with all source_ids in-flight when the cycle is mid-way', () => {
    const service = new QuestionSelectionService({
      async query() {
        return { rows: [] };
      },
    } as any);
    const state = (service as any)._computeCycleState([10, 20], 5);
    assert.deepEqual(state.inCycleSourceIds, [20, 10]);
    assert.equal(state.cycleNumber, 1);
  });
});

describe('QuestionCatalogService', () => {
  it('deduplicates repeated questions by id when loading a dataset', async () => {
    const tempPath = path.join(
      os.tmpdir(),
      `dailynode-test-${Date.now()}.json`
    );
    const dataset = [
      {
        id: 1,
        title: 'First',
        difficulty: 'Easy',
        link: 'https://leetcode.com/problems/first/',
      },
      {
        id: 1,
        title: 'Duplicate',
        difficulty: 'Easy',
        link: 'https://leetcode.com/problems/first/',
      },
      {
        id: 2,
        title: 'Second',
        difficulty: 'Medium',
        link: 'https://leetcode.com/problems/second/',
      },
    ];

    await fs.writeFile(tempPath, JSON.stringify(dataset), 'utf8');

    try {
      const service = new QuestionCatalogService({}, tempPath);
      const loaded = await service.loadDataset();

      assert.equal(loaded.length, 2);
      assert.deepEqual(
        loaded.map((q: any) => q.id),
        [1, 2]
      );
    } finally {
      await fs.unlink(tempPath);
    }
  });

  it('upserts on (source_id, question_set) so the same id can belong to multiple sets', async () => {
    const tempPath = path.join(
      os.tmpdir(),
      `dailynode-test-catalog-${Date.now()}.json`
    );
    await fs.writeFile(
      tempPath,
      JSON.stringify([
        {
          id: 1,
          title: 'Two Sum',
          difficulty: 'Easy',
          link: 'https://leetcode.com/problems/two-sum/',
        },
      ]),
      'utf8'
    );

    const queries: { sql: string; params: any[] }[] = [];
    const stubPool = {
      async query(sql: string, params: any[]) {
        queries.push({ sql, params });
        return { rows: [], rowCount: 1 };
      },
    };

    try {
      const renamed = path.join(path.dirname(tempPath), 'neetcode150.json');
      await fs.rename(tempPath, renamed);
      const service = new QuestionCatalogService(stubPool, renamed);
      const result = await service.syncQuestionsFromFile();

      assert.equal(result.syncedCount, 1);
      assert.equal(result.questionSet, 'neetcode150');
      assert.match(queries[0].sql, /on conflict \(source_id, question_set\)/);
      assert.deepEqual(queries[0].params, [
        1,
        'Two Sum',
        'easy',
        'https://leetcode.com/problems/two-sum/',
        'neetcode150',
      ]);

      await fs.unlink(renamed);
    } catch (err) {
      // Best-effort cleanup.
      throw err;
    }
  });
});

describe('UserChallengeService integration', () => {
  it('returns an embed with cycle progress for /practice', async () => {
    const questions = pool('neetcode250', 'hard', [301, 302, 303]);
    const stub = makeStubPool({ questions });
    const service = new QuestionSelectionService(stub);

    const settingsService = {
      async getUserSettings() {
        return {
          difficulty: 'hard',
          question_set: 'neetcode250',
          timezone: 'America/New_York',
        };
      },
    };

    const user = new UserChallengeService(
      settingsService as any,
      service,
      stub
    );
    const { question, embed } = await user.getPracticeQuestion('u-1');

    assert.ok(question);
    assert.ok([301, 302, 303].includes(question.source_id));
    const built = embed.toJSON();
    assert.ok(built.footer?.text?.includes('NeetCode 250'));
    assert.ok(built.footer?.text?.includes('1/3 this cycle'));
    assert.ok(built.title?.includes('Practice Question'));
  });

  it('passes the active question set and difficulty into selection', async () => {
    const questions = pool('neetcode250', 'hard', [400]);
    const stub = makeStubPool({ questions });
    const service = new QuestionSelectionService(stub);

    const settingsService = {
      async getUserSettings() {
        return {
          difficulty: 'hard',
          question_set: 'neetcode250',
          timezone: 'America/New_York',
        };
      },
    };

    const user = new UserChallengeService(
      settingsService as any,
      service,
      stub
    );
    const { question } = await user.getPracticeQuestion('u-1');

    assert.equal(question.source_id, 400);
    assert.equal(question.question_set, 'neetcode250');
  });
});
