import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
	.setName('help')
	.setDescription('Get a complete guide to DailyNode commands and features');

export async function execute(interaction) {
	const embed = new EmbedBuilder()
		.setColor('#5865F2')
		.setTitle('📘 DailyNode Help Center')
		.setDescription('Welcome to **DailyNode** — your daily LeetCode practice companion. Use the commands below to configure and get challenges quickly.')
		.addFields(
			{
				name: '🧭 Available Commands',
				value:
					'• **`/todayleetcode`** — Shows today\'s challenge on demand.\n' +
					'• **`/setleetcodechannel <channel>`** — Sets where daily challenges are posted (Manage Server required).\n' +
					'• **`/help`** — Shows this guide.',
				inline: false
			},
			{
				name: '⚙️ Admin Setup (1-time)',
				value:
					'1. Run **`/setleetcodechannel`** and choose a channel.\n' +
					'2. Daily challenge posts automatically at **12:00 PM (America/New_York)**.\n' +
					'3. Members can run **`/todayleetcode`** any time to view today\'s problem.',
				inline: false
			},
			{
				name: '🧠 How Daily Challenges Work',
				value:
					'• A random problem is selected from the LeetCode 150 dataset each day.\n' +
					'• The bot stores the selected problem for the current date, so everyone sees the same daily challenge.\n' +
					'• If no challenge is available yet, `/todayleetcode` tells you when to check back.',
				inline: false
			},
			{
				name: '💡 Tips',
				value:
					'• Pin the daily challenge message in your practice channel.\n' +
					'• Pair this with a dedicated study thread for discussion and solutions.\n' +
					'• Use `/todayleetcode` to quickly pull the problem during standups or study sessions.',
				inline: false
			}
		)
		.setFooter({ text: 'Need setup help? Ask an admin to run /setleetcodechannel.' })
		.setTimestamp();

	await interaction.reply({ embeds: [embed], ephemeral: true });
}
