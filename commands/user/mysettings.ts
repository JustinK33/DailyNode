import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('mysettings')
  .setDescription('Show your personal DailyNode settings');

export async function execute(interaction, appContext) {
  const settings = await appContext.services.settingsService.getUserSettings(interaction.user.id);

  const embed = new EmbedBuilder()
    .setColor('#3498DB')
    .setTitle('Your DailyNode Settings')
    .addFields(
      { name: 'Difficulty', value: settings.difficulty, inline: true },
      { name: 'Reminders Enabled', value: settings.reminder_enabled ? 'Yes' : 'No', inline: true },
      { name: 'Reminder Time', value: settings.reminder_time, inline: true },
      { name: 'Timezone', value: settings.timezone, inline: false }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
