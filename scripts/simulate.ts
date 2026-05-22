// Drives the real QuestionSelectionService against the real question dataset
// using an in-memory adapter that mirrors what migration 003 + the catalog
// sync would produce. Prints each day's pick and asserts that no source_id
// repeats within a cycle.
//
// Usage:
//   tsx scripts/simulate.ts                       # neetcode150 / mixed / 300 days
//   tsx scripts/simulate.ts blind75 easy 200      # custom set / difficulty / days

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QuestionSelectionService } from '../services/questionSelectionService.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');

const [setArg = 'neetcode150', difficultyArg = 'mixed', daysArg = '300'] =
  process.argv.slice(2);
const DAYS = Number(daysArg);

type Q = {
  id: number;
  source_id: number;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  link: string;
  question_set: string;
};

async function buildCatalog(): Promise<Q[]> {
  const sets = ['blind75', 'neetcode150', 'neetcode250'];
  const catalog: Q[] = [];
  let pk = 1;

  for (const set of sets) {
    const raw = JSON.parse(
      await fs.readFile(path.join(dataDir, `${set}.json`), 'utf8')
    ) as any[];
    const seen = new Set<number>();
    for (const q of raw) {
      if (!q?.id || seen.has(q.id)) continue;
      seen.add(q.id);
      const d = String(q.difficulty || '').toLowerCase();
      if (!['easy', 'medium', 'hard'].includes(d)) continue;
      catalog.push({
        id: pk++,
        source_id: q.id,
        title: q.title,
        difficulty: d as Q['difficulty'],
        link: q.link,
        question_set: set,
      });
    }
  }
  return catalog;
}

function makeStubPool(catalog: Q[]) {
  const guildHistory: { question_id: number; delivered_at: number }[] = [];
  let nextDeliveredAt = 1;

  function matchPool(params: any[]) {
    const [set, difficulty] = params;
    return catalog.filter(
      (q) => q.question_set === set && (!difficulty || q.difficulty === difficulty)
    );
  }

  return {
    addHistory(questionId: number) {
      guildHistory.push({ question_id: questionId, delivered_at: nextDeliveredAt++ });
    },
    async query(sql: string, params: any[] = []) {
      if (sql.includes('select count(*)::int as count from questions')) {
        const rows = matchPool(params);
        return { rows: [{ count: rows.length }], rowCount: 1 };
      }
      if (sql.includes('from questions where question_set = $1')) {
        const rows = matchPool(params);
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('from guild_question_history h')) {
        const [, set, difficulty] = params;
        const rows = guildHistory
          .map((h) => ({ h, q: catalog.find((q) => q.id === h.question_id)! }))
          .filter(({ q }) => q && q.question_set === set && (!difficulty || q.difficulty === difficulty))
          .sort((a, b) => a.h.delivered_at - b.h.delivered_at)
          .map(({ q }) => ({ source_id: q.source_id }));
        return { rows, rowCount: rows.length };
      }
      throw new Error('Unexpected query: ' + sql);
    },
  };
}

function pad(n: number, width: number) {
  return String(n).padStart(width, ' ');
}

async function main() {
  const catalog = await buildCatalog();
  const stub = makeStubPool(catalog);
  const service = new QuestionSelectionService(stub as any);
  const settings = { question_set: setArg, difficulty: difficultyArg };
  const expectedPool = catalog.filter(
    (q) =>
      q.question_set === setArg &&
      (difficultyArg === 'mixed' || q.difficulty === difficultyArg)
  );

  console.log(
    `Simulating ${DAYS} days of guild daily picks — set=${setArg} difficulty=${difficultyArg} eligible_pool=${expectedPool.length}\n`
  );

  let currentCycleSeen = new Set<number>();
  let cycleNumber = 1;
  let lastPickSourceId: number | null = null;
  let inCycleRepeats = 0;
  let cycleBoundaryViolations = 0;
  let totalCyclesCompleted = 0;
  const pickHistogram = new Map<number, number>();

  for (let day = 1; day <= DAYS; day++) {
    const result = await service.selectForScope(
      { kind: 'guild', id: 'sim' },
      settings
    );
    const sid = result.question.source_id;
    pickHistogram.set(sid, (pickHistogram.get(sid) || 0) + 1);

    if (result.startedNewCycle) {
      if (currentCycleSeen.size > 0) totalCyclesCompleted += 1;
      if (lastPickSourceId !== null && sid === lastPickSourceId && expectedPool.length > 1) {
        cycleBoundaryViolations += 1;
      }
      currentCycleSeen = new Set();
      cycleNumber = result.cycleNumber;
    } else if (currentCycleSeen.has(sid)) {
      inCycleRepeats += 1;
    }
    currentCycleSeen.add(sid);
    lastPickSourceId = sid;

    stub.addHistory(result.question.id);

    if (
      day <= 5 ||
      result.startedNewCycle ||
      day === DAYS ||
      (day > DAYS - 3)
    ) {
      console.log(
        `Day ${pad(day, 3)} | cycle ${result.cycleNumber} ${result.startedNewCycle ? '(new!)' : '      '} | #${pad(sid, 4)} ${result.question.difficulty.padEnd(6)} ${result.question.title}`
      );
    } else if (day === 6) {
      console.log(`Day  6 … Day ${pad(expectedPool.length, 3)} | (suppressed — would print every pick) …`);
    }
  }

  const counts = [...pickHistogram.values()];
  const maxRepeats = Math.max(...counts);
  const minRepeats = Math.min(...counts);
  const distinct = pickHistogram.size;
  const expectedCycles = Math.floor(DAYS / expectedPool.length);

  console.log('\n=== Verification ===');
  console.log(`Eligible pool size:           ${expectedPool.length}`);
  console.log(`Distinct questions delivered: ${distinct}`);
  console.log(`Pick count per question:      min=${minRepeats} max=${maxRepeats} (expected ≈ ${expectedCycles}-${expectedCycles + 1})`);
  console.log(`Cycles completed:             ${totalCyclesCompleted}`);
  console.log(`In-cycle repeats detected:    ${inCycleRepeats}`);
  console.log(`Cycle-boundary violations:    ${cycleBoundaryViolations}`);

  const ok =
    inCycleRepeats === 0 &&
    cycleBoundaryViolations === 0 &&
    distinct === expectedPool.length;
  console.log(ok ? '\nPASS — no duplicates within any cycle, every question delivered.' : '\nFAIL — see counts above.');
  process.exit(ok ? 0 : 1);
}

await main();
