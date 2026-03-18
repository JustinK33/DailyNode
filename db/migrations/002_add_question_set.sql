-- Add question_set column to questions table
alter table questions add column if not exists question_set text not null default 'blind75';

-- Add question_set column to user_settings
alter table user_settings add column if not exists question_set text not null default 'blind75';

-- Add question_set column to guild_settings
alter table guild_settings add column if not exists question_set text not null default 'blind75';

-- Add index for faster filtering by question_set
create index if not exists idx_questions_question_set on questions (question_set);