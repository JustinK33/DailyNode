import cron from 'node-cron';

const SERVER_SCHEDULER_KEY = Symbol.for('dailynode.serverSchedulerTask');

export function initializeServerDailyScheduler(client, serverChallengeService) {
  if (client[SERVER_SCHEDULER_KEY]) {
    console.warn('[CRON] Server daily scheduler already initialized. Skipping duplicate registration.');
    return client[SERVER_SCHEDULER_KEY];
  }

  let isRunning = false;

  // Runs every minute and only posts for guilds whose local time matches their configured HH:MM.
  const task = cron.schedule('* * * * *', async () => {
    const startedAt = new Date();
    if (isRunning) {
      console.warn(`[CRON] serverDaily overlap detected at ${startedAt.toISOString()}; skipping tick.`);
      return;
    }

    isRunning = true;
    const runStart = Date.now();

    try {
      console.log(`[CRON] serverDaily start at ${startedAt.toISOString()}.`);
      const result = await serverChallengeService.runDueGuildChallenges(client, new Date());
      const durationMs = Date.now() - runStart;

      console.log(
        `[CRON] serverDaily end duration=${durationMs}ms scanned=${result.scannedGuilds} due=${result.dueGuilds} sent=${result.sentCount} alreadyPosted=${result.alreadyPosted}.`
      );

      if (result.sentCount > 0) {
        console.log(`✅ Server daily scheduler sent ${result.sentCount} challenge(s).`);
      }
    } catch (error) {
      console.error('❌ Server daily scheduler failed:', error);
    } finally {
      isRunning = false;
    }
  }, {
    noOverlap: true
  });

  client[SERVER_SCHEDULER_KEY] = task;
  console.log('✅ Server daily scheduler initialized (checks every minute).');
  return task;
}
