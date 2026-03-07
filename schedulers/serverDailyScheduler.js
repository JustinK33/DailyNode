import cron from 'node-cron';

export function initializeServerDailyScheduler(client, serverChallengeService) {
  // Runs every minute and only posts for guilds whose local time matches their configured HH:MM.
  const task = cron.schedule('* * * * *', async () => {
    try {
      const result = await serverChallengeService.runDueGuildChallenges(client, new Date());
      if (result.sentCount > 0) {
        console.log(`✅ Server daily scheduler sent ${result.sentCount} challenge(s).`);
      }
    } catch (error) {
      console.error('❌ Server daily scheduler failed:', error);
    }
  });

  console.log('✅ Server daily scheduler initialized (checks every minute).');
  return task;
}
