import cron from 'node-cron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EmbedBuilder } from 'discord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load LeetCode problems
const leetcodeData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/leetcode150.json'), 'utf8')
);

const encouragingMessages = [
  "You've got this! 💪 Let's solve this problem today!",
  "Time to sharpen those coding skills! ⚡",
  "Another day, another algorithm to conquer! 🎯",
  "Challenge accepted! Let's code! 🚀",
  "Ready to level up? Here's today's problem! 📈",
  "Let's turn this problem into a solution! 🔥",
  "Debugging builds character! Here's today's challenge! 🧠",
  "One problem a day keeps the errors away! 🎨",
  "You're unstoppable! Let's tackle this! 💻",
  "Every problem solved is progress made! 🏆"
];

function getRandomProblem() {
  return leetcodeData[Math.floor(Math.random() * leetcodeData.length)];
}

function getRandomEncouragingMessage() {
  return encouragingMessages[Math.floor(Math.random() * encouragingMessages.length)];
}

export function initializeLeetcodeScheduler(client) {
  try {
    const configPath = path.join(__dirname, '../config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const channelId = config.leetcodeChannelId;
    
    if (!channelId) {
      console.warn('⚠️  LeetCode channel not configured. Use /setleetcodechannel to set it up.');
      return;
    }

    // Check if today's problem is already set, if not, set it now
    const today = new Date().toISOString().split('T')[0];
    if (!config.dailyProblemDate || config.dailyProblemDate !== today) {
      const problem = getRandomProblem();
      config.dailyProblem = problem;
      config.dailyProblemDate = today;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      console.log(`✅ Today's LeetCode problem set: ${problem.title}`);
    }

    // Schedule for every day at 12:00 PM (noon)
    const task = cron.schedule('0 12 * * *', async () => {
      try {
        const channel = client.channels.cache.get(channelId);
        
        if (!channel) {
          console.error(`❌ Could not find channel with ID: ${channelId}`);
          return;
        }

        const problem = getRandomProblem();
        const encouragement = getRandomEncouragingMessage();

        // Save today's problem to config
        const configPath = path.join(__dirname, '../config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        config.dailyProblem = problem;
        config.dailyProblemDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

        const embed = new EmbedBuilder()
          .setColor('#FFA500')
          .setTitle('🎯 Daily LeetCode Challenge')
          .addFields(
            { name: 'Problem', value: `**${problem.title}**`, inline: false },
            { name: 'Difficulty', value: problem.difficulty, inline: true },
            { name: 'Problem ID', value: `#${problem.id}`, inline: true },
            { name: 'Motivation', value: encouragement, inline: false },
            { name: 'Link', value: `[Solve on LeetCode](${problem.link})`, inline: false }
          )
          .setFooter({ text: 'Good luck! 🍀' })
          .setTimestamp();

        await channel.send({ embeds: [embed] });
        console.log(`✅ Sent daily LeetCode challenge: ${problem.title}`);
      } catch (error) {
        console.error('❌ Error sending daily LeetCode challenge:', error);
      }
    }, {
      scheduled: true,
      timezone: "America/New_York" // Change this to your timezone
    });

    console.log('✅ LeetCode daily scheduler initialized (12:00 PM daily)');
    return task;
  } catch (error) {
    console.error('❌ Error initializing LeetCode scheduler:', error);
  }
}
