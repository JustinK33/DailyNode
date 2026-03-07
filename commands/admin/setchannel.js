import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('setchannel')
  .setDescription('Set the channel where this server receives daily questions')
  .addChannelOption((option) =>
    option
      .setName('channel')
      .setDescription('Target channel for daily question posts')
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction, appContext) {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    return;
  }

  const channel = interaction.options.getChannel('channel', true);

  try {
    await appContext.services.settingsService.upsertGuildChannel(interaction.guildId, channel.id);
    await interaction.reply({
      content: `Daily questions for this server will post in ${channel}.`,
      ephemeral: true
    });
  } catch (error) {
    console.error('setchannel error:', error);
    await interaction.reply({
      content: 'Failed to save server channel setting. Please try again.',
      ephemeral: true
    });
  }
}
