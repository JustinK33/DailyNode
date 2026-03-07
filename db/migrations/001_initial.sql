create table if not exists questions (
  id bigserial primary key,
  source_id integer not null unique,
  title text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  link text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists guild_settings (
  guild_id text primary key,
  channel_id text,
  difficulty text not null default 'mixed' check (difficulty in ('easy', 'medium', 'hard', 'mixed')),
  post_time text not null default '12:00',
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_settings (
  user_id text primary key,
  difficulty text not null default 'mixed' check (difficulty in ('easy', 'medium', 'hard', 'mixed')),
  reminder_enabled boolean not null default false,
  reminder_time text not null default '18:00',
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists guild_question_history (
  id bigserial primary key,
  guild_id text not null,
  question_id bigint not null references questions(id),
  question_date date not null,
  selection_mode text not null default 'daily',
  delivery_channel_id text,
  delivered_at timestamptz not null default now(),
  delivery_success boolean not null default true,
  error_message text,
  unique (guild_id, question_date, selection_mode)
);

create index if not exists idx_guild_question_history_guild_id
  on guild_question_history (guild_id);

create table if not exists user_question_history (
  id bigserial primary key,
  user_id text not null,
  question_id bigint not null references questions(id),
  question_date date not null,
  source text not null check (source in ('dm-reminder', 'practice', 'myquestion')),
  delivered_at timestamptz not null default now(),
  delivery_success boolean not null default true,
  error_message text,
  unique (user_id, question_date, source)
);

create index if not exists idx_user_question_history_user_id
  on user_question_history (user_id);
