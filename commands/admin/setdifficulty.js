import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { DIFFICULTY_VALUES } from '../../lib/constants.js';

export const data = new SlashCommandBuilder()
  .setName('setdifficulty')
  .setDescription('Set this server\'s daily question difficulty')
  .addStringOption((option) => {
    option
      .setName('difficulty')
      .setDescription('Difficulty for server daily posts')
      .setRequired(true);

    for (const value of DIFFICULTY_VALUES) {
      option.addChoices({ name: value, value });
    }

    return option;
  })
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction, appContext) {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    return;
  }

  const difficulty = interaction.options.getString('difficulty', true);

  try {
    const settings = await appContext.services.settingsService.upsertGuildDifficulty(
      interaction.guildId,
      difficulty
    );

    await interaction.reply({
      content: `Server daily difficulty set to **${settings.difficulty}**.`,
      ephemeral: true
    });
  } catch (error) {
    console.error('setdifficulty error:', error);
    await interaction.reply({
      content: 'Failed to save server difficulty setting. Please try again.',
      ephemeral: true
    });
  }
}
