import cron from 'node-cron';

export function initializeUserReminderScheduler(client, userChallengeService) {
  // Runs every minute and sends reminders only when a user's local time matches their configured HH:MM.
  const task = cron.schedule('* * * * *', async () => {
    try {
      const result = await userChallengeService.sendDueReminderDMs(client, new Date());
      if (result.sentCount > 0) {
        console.log(`✅ User reminder scheduler sent ${result.sentCount} DM reminder(s).`);
      }
    } catch (error) {
      console.error('❌ User reminder scheduler failed:', error);
    }
  });

  console.log('✅ User reminder scheduler initialized (checks every minute).');
  return task;
}
