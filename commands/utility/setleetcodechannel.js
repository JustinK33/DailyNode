import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '../../config.json');

export const data = new SlashCommandBuilder()
	.setName('setleetcodechannel')
	.setDescription('Set the channel where the daily LeetCode challenge will be posted')
	.addChannelOption(option =>
		option
			.setName('channel')
			.setDescription('The channel to send daily LeetCode challenges to')
			.setRequired(true)
	)
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
	const channel = interaction.options.getChannel('channel');

	try {
		// Load existing config or create new one
		let config = {};
		if (fs.existsSync(configPath)) {
			config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
		}

		// Update the channel ID
		config.leetcodeChannelId = channel.id;

		// Write back to config file
		fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

		await interaction.reply({
			content: `✅ LeetCode daily challenge channel set to ${channel}!`,
			ephemeral: true
		});

		console.log(`✅ LeetCode channel updated to ${channel.name} (${channel.id})`);
	} catch (error) {
		console.error('Error setting LeetCode channel:', error);
		await interaction.reply({
			content: '❌ Failed to set the channel. Please try again.',
			ephemeral: true
		});
	}
}
