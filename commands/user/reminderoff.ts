import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('reminderoff')
  .setDescription('Disable your DM reminders');

export async function execute(interaction, appContext) {
  await appContext.services.settingsService.disableUserReminder(interaction.user.id);

  await interaction.reply({
    content: 'Your DM reminders are now disabled.',
    ephemeral: true
  });
}
