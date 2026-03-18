import fs from 'node:fs/promises';
import path from 'node:path';

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

  // Extract question_set from filename (e.g., "blind75.json" -> "blind75")
  getQuestionSetFromPath() {
    const basename = path.basename(this.datasetPath, '.json');
    return basename;
  }

  async syncQuestionsFromFile() {
    const questions = await this.loadDataset();
    const questionSet = this.getQuestionSetFromPath();

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
    }

    return { syncedCount: questions.length, questionSet };
  }
}
