import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('serverconfig')
  .setDescription('Show current server DailyNode settings')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction, appContext) {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    return;
  }

  const settings = await appContext.services.settingsService.getGuildSettings(interaction.guildId);

  const embed = new EmbedBuilder()
    .setColor('#1F8B4C')
    .setTitle('Server DailyNode Configuration')
    .addFields(
      { name: 'Channel', value: settings.channel_id ? `<#${settings.channel_id}>` : 'Not configured', inline: false },
      { name: 'Difficulty', value: settings.difficulty, inline: true },
      { name: 'Post Time', value: settings.post_time, inline: true },
      { name: 'Timezone', value: settings.timezone, inline: false }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
