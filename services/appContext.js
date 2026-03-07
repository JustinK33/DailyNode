import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../db/migrator.js';
import { dbPool, verifyDatabaseConnection } from '../db/pool.js';
import { QuestionCatalogService } from './questionCatalogService.js';
import { QuestionSelectionService } from './questionSelectionService.js';
import { ServerChallengeService } from './serverChallengeService.js';
import { SettingsService } from './settingsService.js';
import { UserChallengeService } from './userChallengeService.js';
import { initializeServerDailyScheduler } from '../schedulers/serverDailyScheduler.js';
import { initializeUserReminderScheduler } from '../schedulers/userReminderScheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createAppContext(client) {
  await verifyDatabaseConnection();
  await runMigrations();

  const datasetPath = path.join(__dirname, '../data/leetcode150.json');

  const settingsService = new SettingsService(dbPool);
  const questionCatalogService = new QuestionCatalogService(dbPool, datasetPath);
  const questionSelectionService = new QuestionSelectionService(dbPool);
  const serverChallengeService = new ServerChallengeService(settingsService, questionSelectionService, dbPool);
  const userChallengeService = new UserChallengeService(settingsService, questionSelectionService, dbPool);

  const syncInfo = await questionCatalogService.syncQuestionsFromFile();
  console.log(`✅ Question catalog synced (${syncInfo.syncedCount} records processed).`);

  const schedulers = {
    serverDaily: initializeServerDailyScheduler(client, serverChallengeService),
    userReminder: initializeUserReminderScheduler(client, userChallengeService)
  };

  return {
    dbPool,
    services: {
      settingsService,
      questionCatalogService,
      questionSelectionService,
      serverChallengeService,
      userChallengeService
    },
    schedulers
  };
}
