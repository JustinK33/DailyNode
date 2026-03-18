import path from 'node:path';
import fs from 'node:fs/promises';
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

// Question set files to load
const QUESTION_SET_FILES = ['blind75.json', 'neetcode150.json', 'neetcode250.json'];

export async function createAppContext(client) {
  const bootStart = Date.now();
  console.log('[BOOT] Starting application context initialization.');

  const dbStart = Date.now();
  await verifyDatabaseConnection();
  console.log(`[BOOT] Database connection verified in ${Date.now() - dbStart}ms.`);

  const migrationStart = Date.now();
  await runMigrations();
  console.log(`[BOOT] Migrations completed in ${Date.now() - migrationStart}ms.`);

  const settingsService = new SettingsService(dbPool);
  const questionSelectionService = new QuestionSelectionService(dbPool);
  const serverChallengeService = new ServerChallengeService(settingsService, questionSelectionService, dbPool);
  const userChallengeService = new UserChallengeService(settingsService, questionSelectionService, dbPool);

  // Sync all question sets
  const catalogSyncStart = Date.now();
  let totalSynced = 0;
  const dataDir = path.join(__dirname, '../data');

  for (const filename of QUESTION_SET_FILES) {
    const datasetPath = path.join(dataDir, filename);
    try {
      const questionCatalogService = new QuestionCatalogService(dbPool, datasetPath);
      const syncInfo = await questionCatalogService.syncQuestionsFromFile();
      if (!syncInfo || typeof syncInfo.syncedCount !== 'number') {
        throw new Error('Invalid sync response');
      }
      console.log(`[BOOT] Synced ${syncInfo.syncedCount} questions from ${filename} (question_set: ${syncInfo.questionSet})`);
      totalSynced += syncInfo.syncedCount;
    } catch (err) {
      console.error(`[BOOT] Error syncing ${filename}: ${err.message}`);
    }
  }
  console.log(
    `[BOOT] Question catalog synced (${totalSynced} total records processed) in ${Date.now() - catalogSyncStart}ms.`
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
      questionSelectionService,
      serverChallengeService,
      userChallengeService
    },
    schedulers
  };
}
