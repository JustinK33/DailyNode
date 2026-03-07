import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

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

export async function execute(interaction, appContext) {
	const channel = interaction.options.getChannel('channel');
	const guildId = interaction.guildId;

	if (!guildId) {
		await interaction.reply({
			content: '❌ This command can only be used inside a server.',
			ephemeral: true
		});
		return;
	}

	try {
		await appContext.services.settingsService.upsertGuildChannel(guildId, channel.id);

		await interaction.reply({
			content: `✅ LeetCode daily challenge channel set to ${channel}!\nUse \`/setchannel\` moving forward.`,
			ephemeral: true
		});

		console.log(`✅ LeetCode channel updated for guild ${guildId} to ${channel.name} (${channel.id})`);
	} catch (error) {
		console.error('Error setting LeetCode channel:', error);
		await interaction.reply({
			content: '❌ Failed to set the channel. Please try again.',
			ephemeral: true
		});
	}
}
