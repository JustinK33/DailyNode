# DailyNode Production Architecture

## 1) High-level architecture overview

DailyNode is split into four runtime layers:

- `Discord Gateway Layer` (`index.js`, command handlers)
  - Handles slash command interactions and dispatches to services.
- `Service Layer` (`services/*`)
  - `SettingsService` for guild/user persistence.
  - `QuestionCatalogService` for question sync from JSON into DB.
  - `QuestionSelectionService` for filtered/randomized question picks.
  - `ServerChallengeService` for guild daily posting flow.
  - `UserChallengeService` for personal question and DM reminder flow.
- `Scheduler Layer` (`schedulers/*`)
  - `serverDailyScheduler` checks every minute and posts for due guilds.
  - `userReminderScheduler` checks every minute and DMs due users.
- `Persistence Layer` (`db/*`)
  - PostgreSQL pool + SQL migrations + history-aware schema.

This design supports 3000+ users by keeping command handlers stateless and moving all scheduling/persistence to dedicated services.

## 2) Recommended database schema

Tables:

- `guild_settings`
  - `guild_id` (PK), `channel_id`, `difficulty`, `post_time`, `timezone`, timestamps
- `user_settings`
  - `user_id` (PK), `difficulty`, `reminder_enabled`, `reminder_time`, `timezone`, timestamps
- `questions`
  - `id` (PK), `source_id` (unique), `title`, `difficulty`, `link`, timestamps
- `guild_question_history`
  - `guild_id`, `question_id`, `question_date`, `selection_mode`, delivery result fields
  - unique `(guild_id, question_date, selection_mode)`
- `user_question_history`
  - `user_id`, `question_id`, `question_date`, `source`, delivery result fields
  - unique `(user_id, question_date, source)`

The history tables are ready for future non-repeat strategies.

## 3) Slash command design

Admin-only commands:

- `/setchannel <channel>`
- `/setdifficulty <easy|medium|hard|mixed>`
- `/settime <HH:MM> <timezone>`
- `/serverconfig`

User commands:

- `/mydifficulty [easy|medium|hard|mixed]`
- `/remindme <HH:MM> <timezone>`
- `/reminderoff`
- `/mysettings`
- `/practice`
- `/myquestion`

Compatibility commands retained:

- `/setleetcodechannel` (alias behavior)
- `/todayleetcode`
- `/help`

## 4) Core service structure

- `SettingsService`
  - get/upsert guild settings
  - get/upsert user settings
  - list due candidates for schedulers
- `QuestionSelectionService`
  - difficulty-based random selection
  - optional exclusion based on recent history
- `ServerChallengeService`
  - due-check + daily post + guild history write
- `UserChallengeService`
  - personal daily question + practice question + DM reminder writes
- `QuestionCatalogService`
  - syncs `data/leetcode150.json` into `questions`

## 5) Implementation plan in phases

1. `Phase 1: Persistence`
- Add PostgreSQL pool and SQL migrations.
- Add startup migration runner.

2. `Phase 2: Services`
- Implement settings, question sync/selection, and history services.

3. `Phase 3: Scheduling`
- Split server scheduler and user reminder scheduler.
- Add timezone/time due checks.

4. `Phase 4: Commands`
- Add admin and user command handlers.
- Keep legacy compatibility commands.

5. `Phase 5: Hardening`
- Add retries, metrics, and dashboard observability.
- Add history-based anti-repeat algorithm and rate-limit controls.

## 6) Starter code scaffolding

Scaffolded in this repo:

- `db/` (`pool.js`, `migrator.js`, `migrations/001_initial.sql`)
- `services/` (`appContext.js`, `settingsService.js`, `questionCatalogService.js`, `questionSelectionService.js`, `serverChallengeService.js`, `userChallengeService.js`)
- `schedulers/` (`serverDailyScheduler.js`, `userReminderScheduler.js`)
- `commands/admin/*`
- `commands/user/*`
- `scripts/migrate.js`

Run:

- `npm run migrate`
- `npm run deploy`
- `npm start`
