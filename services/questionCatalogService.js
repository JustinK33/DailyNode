import fs from 'node:fs/promises';
import path from 'node:path';

function dedupeQuestionsById(questions) {
  const seenIds = new Set();

  return questions.filter((question) => {
    if (!question || typeof question.id === 'undefined' || question.id === null) {
      return false;
    }

    if (seenIds.has(question.id)) {
      return false;
    }

    seenIds.add(question.id);
    return true;
  });
}

export class QuestionCatalogService {
  constructor(dbPool, datasetPath) {
    this.dbPool = dbPool;
    this.datasetPath = datasetPath;
  }

  async loadDataset() {
    const raw = await fs.readFile(this.datasetPath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error('LeetCode dataset must be an array.');
    }

    return dedupeQuestionsById(parsed);
  }

  // Extract question_set from filename (e.g., "blind75.json" -> "blind75")
  getQuestionSetFromPath() {
    const basename = path.basename(this.datasetPath, '.json');
    return basename;
  }

  async syncQuestionsFromFile() {
    const questions = await this.loadDataset();
    const questionSet = this.getQuestionSetFromPath();
    let syncedCount = 0;

    for (const question of questions) {
      const normalizedDifficulty = String(question.difficulty || '').toLowerCase();

      if (!['easy', 'medium', 'hard'].includes(normalizedDifficulty)) {
        continue;
      }

      await this.dbPool.query(
        `insert into questions (source_id, title, difficulty, link, question_set)
         values ($1, $2, $3, $4, $5)
         on conflict (source_id)
         do update set
           title = excluded.title,
           difficulty = excluded.difficulty,
           link = excluded.link,
           question_set = excluded.question_set,
           updated_at = now()`,
        [question.id, question.title, normalizedDifficulty, question.link, questionSet]
      );

      syncedCount += 1;
    }

    return { syncedCount, questionSet };
  }
}
