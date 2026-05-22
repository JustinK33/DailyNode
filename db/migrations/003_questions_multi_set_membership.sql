-- The previous schema put a UNIQUE constraint on questions.source_id, but the
-- same LeetCode problem can belong to several question sets (blind75,
-- neetcode150, neetcode250). The catalog sync used "on conflict (source_id) do
-- update" so the last sync overwrote the question_set label, shrinking each
-- pool to only its set-exclusive problems and causing daily repeats.
--
-- This migration replaces the single-column unique with a composite unique on
-- (source_id, question_set) so each problem can have one row per set it
-- belongs to.

-- Drop the legacy unique constraint on source_id alone (created by `unique`
-- inline in 001_initial.sql). The constraint name follows Postgres' default
-- naming convention "<table>_<column>_key".
alter table questions drop constraint if exists questions_source_id_key;

-- Add the new composite unique constraint. Using a named constraint so future
-- migrations can reference it predictably.
alter table questions
  add constraint questions_source_id_question_set_key
  unique (source_id, question_set);

-- Helpful covering index for the hot lookup pattern: filtering eligible pool
-- by set and difficulty.
create index if not exists idx_questions_set_difficulty
  on questions (question_set, difficulty);
