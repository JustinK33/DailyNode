// @ts-nocheck
import { EmbedBuilder } from 'discord.js';

const DIFFICULTY_COLOR = {
  easy: 0x2ecc71, // green
  medium: 0xf1c40f, // amber
  hard: 0xe74c3c, // red
  mixed: 0x5865f2, // discord blurple — used when difficulty filter is "mixed"
};

const QUESTION_SET_LABEL = {
  blind75: 'Blind 75',
  neetcode150: 'NeetCode 150',
  neetcode250: 'NeetCode 250',
};

function colorFor(difficulty) {
  const key = String(difficulty || '').toLowerCase();
  return DIFFICULTY_COLOR[key] ?? DIFFICULTY_COLOR.mixed;
}

function difficultyBadge(difficulty) {
  const key = String(difficulty || '').toLowerCase();
  if (key === 'easy') return '🟢 Easy';
  if (key === 'medium') return '🟡 Medium';
  if (key === 'hard') return '🔴 Hard';
  return difficulty;
}

function formatQuestionSetLabel(questionSet) {
  return QUESTION_SET_LABEL[questionSet] || questionSet || 'Custom set';
}

/**
 * Build the daily challenge embed.
 *
 *   question: { source_id, title, difficulty, link }
 *   options:
 *     title         — embed title (default "Daily LeetCode Challenge")
 *     motivation    — motivational message (optional)
 *     questionSet   — slug like "neetcode150" used for footer label
 *     cycleProgress — { delivered, poolSize, cycleNumber } for footer
 *     footerExtra   — appended after the standard footer
 */
export function buildChallengeEmbed(question, options = {}) {
  const {
    title = 'Daily LeetCode Challenge',
    motivation = null,
    questionSet = null,
    cycleProgress = null,
    footerExtra = null,
  } = options;

  const embed = new EmbedBuilder()
    .setColor(colorFor(question.difficulty))
    .setTitle(title)
    .setURL(question.link)
    .setDescription(`### [${question.title}](${question.link})`)
    .addFields(
      {
        name: 'Difficulty',
        value: difficultyBadge(question.difficulty),
        inline: true,
      },
      { name: 'Problem', value: `#${question.source_id}`, inline: true },
      {
        name: 'Link',
        value: `[Solve on LeetCode](${question.link})`,
        inline: true,
      }
    );

  if (motivation) {
    embed.addFields({ name: 'Motivation', value: motivation, inline: false });
  }

  embed.setFooter({
    text: buildFooter({ questionSet, cycleProgress, footerExtra }),
  });
  embed.setTimestamp();

  return embed;
}

function buildFooter({ questionSet, cycleProgress, footerExtra }) {
  const parts = [];

  if (questionSet) {
    parts.push(formatQuestionSetLabel(questionSet));
  }

  if (cycleProgress && cycleProgress.poolSize > 0) {
    const { delivered, poolSize, cycleNumber } = cycleProgress;
    const progress = `${delivered}/${poolSize} this cycle`;
    parts.push(
      cycleNumber > 1 ? `Cycle ${cycleNumber} • ${progress}` : progress
    );
  }

  if (footerExtra) {
    parts.push(footerExtra);
  }

  return parts.length > 0 ? parts.join(' • ') : 'Good luck.';
}
