import { SlashCommandBuilder } from 'discord.js';
import { DIFFICULTY_VALUES } from '../../lib/constants.js';

export const data = new SlashCommandBuilder()
  .setName('mydifficulty')
  .setDescription('View or set your personal difficulty preference')
  .addStringOption((option) => {
    option
      .setName('difficulty')
      .setDescription('Your personal difficulty for /practice, /myquestion, and reminders')
      .setRequired(false);

    for (const value of DIFFICULTY_VALUES) {
      option.addChoices({ name: value, value });
    }

    return option;
  });

export async function execute(interaction, appContext) {
  const difficulty = interaction.options.getString('difficulty', false);

  if (!difficulty) {
    const settings = await appContext.services.settingsService.getUserSettings(interaction.user.id);
    await interaction.reply({
      content: `Your personal difficulty is **${settings.difficulty}**.`,
      ephemeral: true
    });
    return;
  }

  const updated = await appContext.services.settingsService.upsertUserDifficulty(
    interaction.user.id,
    difficulty
  );

  await interaction.reply({
    content: `Your personal difficulty is now **${updated.difficulty}**.`,
    ephemeral: true
  });
}
