import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('myquestion')
  .setDescription('Get your personal daily question based on your settings');

export async function execute(interaction, appContext) {
  const question = await appContext.services.userChallengeService.getOrCreateDailyPersonalQuestion(
    interaction.user.id
  );

  await interaction.reply({
    embeds: [appContext.services.userChallengeService.createPersonalQuestionEmbed(question)],
    ephemeral: true
  });
}
