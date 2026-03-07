import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { DEFAULT_TIMEZONE } from '../../lib/constants.js';

export const data = new SlashCommandBuilder()
  .setName('settime')
  .setDescription('Set this server\'s daily post time and timezone')
  .addStringOption((option) =>
    option
      .setName('time')
      .setDescription('Time in HH:MM 24-hour format, e.g. 09:30')
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName('timezone')
      .setDescription(`IANA timezone, e.g. America/New_York (default ${DEFAULT_TIMEZONE})`)
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction, appContext) {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    return;
  }

  const time = interaction.options.getString('time', true);
  const timezone = interaction.options.getString('timezone', true);

  try {
    const settings = await appContext.services.settingsService.upsertGuildSchedule(
      interaction.guildId,
      time,
      timezone
    );

    await interaction.reply({
      content: `Server daily schedule set to **${settings.post_time}** in **${settings.timezone}**.`,
      ephemeral: true
    });
  } catch (error) {
    await interaction.reply({
      content: `Failed to update schedule: ${error.message}`,
      ephemeral: true
    });
  }
}
