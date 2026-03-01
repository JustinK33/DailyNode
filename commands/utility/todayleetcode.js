import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '../../config.json');

export const data = new SlashCommandBuilder()
	.setName('todayleetcode')
	.setDescription('Get a reminder of today\'s LeetCode challenge');

export async function execute(interaction) {
	try {
		const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
		const problem = config.dailyProblem;
		const problemDate = config.dailyProblemDate;

		if (!problem) {
			await interaction.reply({
				content: '❌ No LeetCode problem has been set for today yet. Try again later!',
				ephemeral: true
			});
			return;
		}

		// Check if the saved problem is from today
		const today = new Date().toISOString().split('T')[0];
		if (problemDate !== today) {
			await interaction.reply({
				content: '⏰ The daily problem will be sent at 12:00 PM. Check back then for a fresh challenge!',
				ephemeral: true
			});
			return;
		}

		const embed = new EmbedBuilder()
			.setColor('#FFA500')
			.setTitle('🎯 Today\'s LeetCode Challenge')
			.addFields(
				{ name: 'Problem', value: `**${problem.title}**`, inline: false },
				{ name: 'Difficulty', value: problem.difficulty, inline: true },
				{ name: 'Problem ID', value: `#${problem.id}`, inline: true },
				{ name: 'Link', value: `[Solve on LeetCode](${problem.link})`, inline: false }
			)
			.setFooter({ text: 'Good luck! 🍀' })
			.setTimestamp();

		await interaction.reply({ embeds: [embed] });
	} catch (error) {
		console.error('Error retrieving today\'s LeetCode challenge:', error);
		await interaction.reply({
			content: '❌ Failed to retrieve today\'s problem. Please try again.',
			ephemeral: true
		});
	}
}
