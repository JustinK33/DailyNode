import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
	.setName('help')
	.setDescription('Get a complete guide to DailyNode commands and features');

export async function execute(interaction) {
	const embed = new EmbedBuilder()
		.setColor('#5865F2')
		.setTitle('📘 DailyNode Help Center')
		.setDescription('DailyNode now supports server-level and personal settings. Use the commands below to configure your workflow.')
		.addFields(
			{
				name: '🛠️ Admin Commands',
				value:
					'• **`/setchannel <channel>`** — Set this server\'s daily post channel.\n' +
					'• **`/setdifficulty <easy|medium|hard|mixed>`** — Set server daily difficulty.\n' +
					'• **`/settime <HH:MM> <timezone>`** — Set server post schedule.\n' +
					'• **`/serverconfig`** — View current server config.\n' +
					'• **`/setleetcodechannel`** — Legacy alias for `/setchannel`.',
				inline: false
			},
			{
				name: '👤 Personal Commands',
				value:
					'• **`/mydifficulty [difficulty]`** — View or set your personal difficulty.\n' +
					'• **`/remindme <HH:MM> <timezone>`** — Turn on DM reminders.\n' +
					'• **`/reminderoff`** — Turn off DM reminders.\n' +
					'• **`/mysettings`** — View your personal settings.\n' +
					'• **`/myquestion`** — Your personal daily question.\n' +
					'• **`/practice`** — Fetch a practice question instantly.',
				inline: false
			},
			{
				name: '🧠 Notes',
				value:
					'• Server daily posts use server settings only.\n' +
					'• Personal settings affect only your personal commands and DM reminders.\n' +
					'• If no setting exists, difficulty defaults to `mixed`.',
				inline: false
			},
			{
				name: '📌 Compatibility',
				value: '• `/todayleetcode` still works and shows the server\'s daily question when available.',
				inline: false
			}
		)
		.setFooter({ text: 'Need setup help? Ask an admin to run /serverconfig.' })
		.setTimestamp();

	await interaction.reply({ embeds: [embed], ephemeral: true });
}
