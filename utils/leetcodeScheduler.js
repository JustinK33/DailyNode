import cron from 'node-cron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EmbedBuilder } from 'discord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function dedupeProblemsById(problems) {
  const seenIds = new Set();

  return problems.filter((problem) => {
    if (!problem || typeof problem.id === 'undefined' || problem.id === null) {
      return false;
    }

    if (seenIds.has(problem.id)) {
      return false;
    }

    seenIds.add(problem.id);
    return true;
  });
}

// Load LeetCode problems
const leetcodeData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/neetcode150.json'), 'utf8')
);
const uniqueLeetcodeData = dedupeProblemsById(leetcodeData);

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
  return uniqueLeetcodeData[Math.floor(Math.random() * uniqueLeetcodeData.length)];
}

function getRandomEncouragingMessage() {
  return encouragingMessages[Math.floor(Math.random() * encouragingMessages.length)];
}

export function initializeLeetcodeScheduler(client) {
  try {
    const configPath = path.join(__dirname, '../config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const configuredChannels = { ...(config.leetcodeChannels || {}) };

    // Backward compatibility: migrate old single channel setting if present.
    if (config.leetcodeChannelId && Object.keys(configuredChannels).length === 0) {
      console.warn('⚠️  Legacy leetcodeChannelId found. Use /setleetcodechannel in each server to configure multi-server delivery.');
    }
    
    if (Object.keys(configuredChannels).length === 0 && !config.leetcodeChannelId) {
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

        const latestConfiguredChannels = config.leetcodeChannels || {};
        const channelIds = [
          ...new Set([
            ...Object.values(latestConfiguredChannels),
            ...(config.leetcodeChannelId ? [config.leetcodeChannelId] : [])
          ])
        ];

        if (channelIds.length === 0) {
          console.warn('⚠️  No LeetCode channels configured. Use /setleetcodechannel in each server.');
          return;
        }

        let sentCount = 0;
        for (const channelId of channelIds) {
          try {
            const channel = await client.channels.fetch(channelId);
            if (!channel || !channel.isTextBased()) {
              console.error(`❌ Could not use channel with ID: ${channelId}`);
              continue;
            }

            await channel.send({ embeds: [embed] });
            sentCount += 1;
          } catch (sendError) {
            console.error(`❌ Failed to send challenge to channel ${channelId}:`, sendError);
          }
        }

        console.log(`✅ Sent daily LeetCode challenge to ${sentCount} channel(s): ${problem.title}`);
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
