import { SlashCommandBuilder } from 'discord.js';
import { DEFAULT_TIMEZONE } from '../../lib/constants.js';

export const data = new SlashCommandBuilder()
  .setName('remindme')
  .setDescription('Enable daily DM reminders with a custom time and timezone')
  .addStringOption((option) =>
    option
      .setName('time')
      .setDescription('Time in HH:MM 24-hour format, e.g. 19:45')
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName('timezone')
      .setDescription(`IANA timezone, e.g. America/New_York (default ${DEFAULT_TIMEZONE})`)
      .setRequired(true)
  );

export async function execute(interaction, appContext) {
  const time = interaction.options.getString('time', true);
  const timezone = interaction.options.getString('timezone', true);

  try {
    const settings = await appContext.services.settingsService.enableUserReminder(
      interaction.user.id,
      time,
      timezone
    );

    await interaction.reply({
      content: `Reminder enabled at **${settings.reminder_time}** in **${settings.timezone}**.`,
      ephemeral: true
    });
  } catch (error) {
    await interaction.reply({
      content: `Could not enable reminder: ${error.message}`,
      ephemeral: true
    });
  }
}
