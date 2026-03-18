import { SlashCommandBuilder } from 'discord.js';
import { QUESTION_SET_VALUES } from '../../lib/constants.js';

const QUESTION_SET_LABELS = {
  blind75: 'Blind 75',
  neetcode150: 'NeetCode 150',
  neetcode250: 'NeetCode 250'
};

export const data = new SlashCommandBuilder()
  .setName('setquestionset')
  .setDescription('Set the question set for daily challenges in this server')
  .addStringOption((option) => {
    option
      .setName('questionset')
      .setDescription('Which question set to use for daily challenges')
      .setRequired(true);

    for (const value of QUESTION_SET_VALUES) {
      option.addChoices({ name: QUESTION_SET_LABELS[value], value });
    }

    return option;
  });

export async function execute(interaction, appContext) {
  if (!interaction.guild) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      ephemeral: true
    });
    return;
  }

  // Permission check: user must have ManageGuild permission
  if (!interaction.member.permissions.has('ManageGuild')) {
    await interaction.reply({
      content: 'You need the **Manage Server** permission to use this command.',
      ephemeral: true
    });
    return;
  }

  const questionSet = interaction.options.getString('questionset', true);
  const guildId = interaction.guild.id;

  try {
    await appContext.services.settingsService.upsertGuildQuestionSet(guildId, questionSet);

    await interaction.reply({
      content: `This server's question set is now **${QUESTION_SET_LABELS[questionSet]}**. Daily challenges will use this question set.`
    });
  } catch (error) {
    console.error(`[setquestionset] Error updating guild question set: ${error.message}`);
    await interaction.reply({
      content: 'Failed to update the question set. Please try again.',
      ephemeral: true
    });
  }
}