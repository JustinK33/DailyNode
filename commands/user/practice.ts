import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('practice')
  .setDescription('Get a practice problem based on your personal difficulty');

export async function execute(interaction, appContext) {
  const { embed } =
    await appContext.services.userChallengeService.getPracticeQuestion(
      interaction.user.id
    );

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
