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
import { startEventLoopMonitor } from '../utils/runtimeMonitor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createAppContext(client) {
  const bootStart = Date.now();
  console.log('[BOOT] Starting application context initialization.');

  const dbStart = Date.now();
  await verifyDatabaseConnection();
  console.log(`[BOOT] Database connection verified in ${Date.now() - dbStart}ms.`);

  const migrationStart = Date.now();
  await runMigrations();
  console.log(`[BOOT] Migrations completed in ${Date.now() - migrationStart}ms.`);

  const datasetPath = path.join(__dirname, '../data/leetcode150.json');

  const settingsService = new SettingsService(dbPool);
  const questionCatalogService = new QuestionCatalogService(dbPool, datasetPath);
  const questionSelectionService = new QuestionSelectionService(dbPool);
  const serverChallengeService = new ServerChallengeService(settingsService, questionSelectionService, dbPool);
  const userChallengeService = new UserChallengeService(settingsService, questionSelectionService, dbPool);

  const catalogSyncStart = Date.now();
  const syncInfo = await questionCatalogService.syncQuestionsFromFile();
  console.log(
    `[BOOT] Question catalog synced (${syncInfo.syncedCount} records processed) in ${Date.now() - catalogSyncStart}ms.`
  );

  startEventLoopMonitor();

  const schedulers = {
    serverDaily: initializeServerDailyScheduler(client, serverChallengeService),
    userReminder: initializeUserReminderScheduler(client, userChallengeService)
  };

  console.log(`[BOOT] Application context ready in ${Date.now() - bootStart}ms.`);

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
