import cron from 'node-cron';

const USER_SCHEDULER_KEY = Symbol.for('dailynode.userSchedulerTask');

export function initializeUserReminderScheduler(client, userChallengeService) {
  if (client[USER_SCHEDULER_KEY]) {
    console.warn('[CRON] User reminder scheduler already initialized. Skipping duplicate registration.');
    return client[USER_SCHEDULER_KEY];
  }

  let isRunning = false;

  // Runs every minute and sends reminders only when a user's local time matches their configured HH:MM.
  const task = cron.schedule('* * * * *', async () => {
    const startedAt = new Date();
    if (isRunning) {
      console.warn(`[CRON] userReminder overlap detected at ${startedAt.toISOString()}; skipping tick.`);
      return;
    }

    isRunning = true;
    const runStart = Date.now();

    try {
      console.log(`[CRON] userReminder start at ${startedAt.toISOString()}.`);
      const result = await userChallengeService.sendDueReminderDMs(client, new Date());
      const durationMs = Date.now() - runStart;

      console.log(
        `[CRON] userReminder end duration=${durationMs}ms scanned=${result.scannedUsers} due=${result.dueUsers} sent=${result.sentCount} failed=${result.failedCount} alreadySentToday=${result.alreadySentToday}.`
      );

      if (result.sentCount > 0) {
        console.log(`✅ User reminder scheduler sent ${result.sentCount} DM reminder(s).`);
      }
    } catch (error) {
      console.error('❌ User reminder scheduler failed:', error);
    } finally {
      isRunning = false;
    }
  }, {
    noOverlap: true,
    timezone: 'UTC'
  });

  client[USER_SCHEDULER_KEY] = task;
  console.log('✅ User reminder scheduler initialized (checks every minute).');
  return task;
}
