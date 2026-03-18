import { SlashCommandBuilder } from 'discord.js';
import { QUESTION_SET_VALUES } from '../../lib/constants.js';

const QUESTION_SET_LABELS = {
  blind75: 'Blind 75',
  neetcode150: 'NeetCode 150',
  neetcode250: 'NeetCode 250'
};

export const data = new SlashCommandBuilder()
  .setName('myquestionset')
  .setDescription('View or set your personal question set preference')
  .addStringOption((option) => {
    option
      .setName('questionset')
      .setDescription('Which question set to use for /practice, /myquestion, and reminders')
      .setRequired(false);

    for (const value of QUESTION_SET_VALUES) {
      option.addChoices({ name: QUESTION_SET_LABELS[value], value });
    }

    return option;
  });

export async function execute(interaction, appContext) {
  const questionSet = interaction.options.getString('questionset', false);

  if (!questionSet) {
    try {
      const settings = await appContext.services.settingsService.getUserSettings(interaction.user.id);
      if (!settings || !settings.question_set) {
        throw new Error('Failed to retrieve settings');
      }
      const label = QUESTION_SET_LABELS[settings.question_set] || settings.question_set;
      await interaction.reply({
        content: `Your personal question set is **${label}**.`,
        ephemeral: true
      });
    } catch (error) {
      console.error(`[myquestionset] Error retrieving settings: ${error.message}`);
      await interaction.reply({
        content: 'Failed to retrieve your settings. Please try again.',
        ephemeral: true
      });
    }
    return;
  }

  try {
    const updated = await appContext.services.settingsService.upsertUserQuestionSet(
      interaction.user.id,
      questionSet
    );

    if (!updated || !updated.question_set) {
      throw new Error('Failed to update settings');
    }

    const label = QUESTION_SET_LABELS[updated.question_set];
    await interaction.reply({
      content: `Your personal question set is now **${label}**.`,
      ephemeral: true
    });
  } catch (error) {
    console.error(`[myquestionset] Error updating question set: ${error.message}`);
    await interaction.reply({
      content: 'Failed to update your question set. Please try again.',
      ephemeral: true
    });
  }
}