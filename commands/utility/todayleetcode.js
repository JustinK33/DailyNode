import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getDateInTimezone } from '../../lib/time.js';

export const data = new SlashCommandBuilder()
	.setName('todayleetcode')
	.setDescription('Get a reminder of today\'s LeetCode challenge');

export async function execute(interaction, appContext) {
	try {
		if (!interaction.guildId) {
			await interaction.reply({
				content: 'Use `/myquestion` for your personal question in DMs or outside servers.',
				ephemeral: true
			});
			return;
		}

		const settings = await appContext.services.settingsService.getGuildSettings(interaction.guildId);
		const today = getDateInTimezone(new Date(), settings.timezone);
		const problem = await appContext.services.serverChallengeService.getGuildQuestionForDate(
			interaction.guildId,
			today
		);

		if (!problem) {
			await interaction.reply({
				content: '⏰ No server daily question has been posted yet for today. Check back at the configured server time.',
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
				{ name: 'Problem ID', value: `#${problem.source_id}`, inline: true },
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
