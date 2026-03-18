export const DIFFICULTY_VALUES = ['easy', 'medium', 'hard', 'mixed'];
export const DEFAULT_DIFFICULTY = 'mixed';

export const QUESTION_SET_VALUES = ['blind75', 'neetcode150', 'neetcode250'];
export const DEFAULT_QUESTION_SET = 'neetcode150';

export const DEFAULT_SERVER_POST_TIME = '12:00';
export const DEFAULT_USER_REMINDER_TIME = '18:00';
export const DEFAULT_TIMEZONE = 'America/New_York';

export const USER_HISTORY_SOURCE = {
  DM_REMINDER: 'dm-reminder',
  PRACTICE: 'practice',
  MY_QUESTION: 'myquestion'
};

export function normalizeDifficulty(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return DIFFICULTY_VALUES.includes(normalized) ? normalized : DEFAULT_DIFFICULTY;
}

export function normalizeQuestionSet(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return QUESTION_SET_VALUES.includes(normalized) ? normalized : DEFAULT_QUESTION_SET;
}
