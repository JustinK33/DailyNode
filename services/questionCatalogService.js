import fs from 'node:fs/promises';

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

    return parsed;
  }

  async syncQuestionsFromFile() {
    const questions = await this.loadDataset();

    for (const question of questions) {
      const normalizedDifficulty = String(question.difficulty || '').toLowerCase();

      if (!['easy', 'medium', 'hard'].includes(normalizedDifficulty)) {
        continue;
      }

      await this.dbPool.query(
        `insert into questions (source_id, title, difficulty, link)
         values ($1, $2, $3, $4)
         on conflict (source_id)
         do update set
           title = excluded.title,
           difficulty = excluded.difficulty,
           link = excluded.link,
           updated_at = now()`,
        [question.id, question.title, normalizedDifficulty, question.link]
      );
    }

    return { syncedCount: questions.length };
  }
}
