# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start           # Run the bot (tsx index.ts)
npm test            # Run all tests (Node built-in test runner via tsx)
npm run typecheck   # Type-check without emitting (tsc --noEmit)
npm run lint        # ESLint
npm run format      # Prettier
npm run deploy      # Register slash commands with Discord API
npm run migrate     # Run DB migrations standalone (also runs automatically on start)
```

Run a single test file:

```bash
tsx --test tests/questionSelectionService.test.ts
```

## Environment Variables

Required in `.env`:

- `DISCORD_TOKEN` — bot token
- `clientId` — Discord application client ID
- `DATABASE_URL` — PostgreSQL connection string (auto-detects SSL for remote hosts)
- `guildId` — used only by `deploy-commands.ts` for guild-scoped deploys

## Architecture

**Entry point:** `index.ts` loads all command files, waits for `ClientReady`, then calls `createAppContext()`.

**`services/appContext.ts`** is the boot orchestrator. On startup it:

1. Verifies DB connection and runs SQL migrations (`db/migrator.ts`)
2. Syncs three question datasets from `data/` (blind75, neetcode150, neetcode250) into the `questions` table via `QuestionCatalogService`
3. Instantiates all services and wires them together
4. Starts two `node-cron` schedulers

**Service layer** (`services/`):

- `QuestionCatalogService` — loads JSON question files into the DB. Upserts on `(source_id, question_set)` so the same LeetCode problem can be a member of multiple sets (blind75, neetcode150, neetcode250) without one sync overwriting another's label.
- `QuestionSelectionService` — picks questions for users/guilds. Entry point is `selectForScope({ kind: 'guild'|'user', id }, settings)` which returns `{ question, poolSize, unusedCountBefore, cycleNumber, startedNewCycle, filter, ... }`. Algorithm: build the eligible pool from settings, walk the chronological delivery history to reconstruct the current cycle (a cycle = `poolSize` distinct deliveries), pick uniformly from unused entries; on cycle exhaustion, start a new cycle and exclude yesterday's pick when at least one alternative exists.
- `ServerChallengeService` — manages per-guild daily posts; on each cron tick, checks if a guild's `post_time` matches local time, then routes through `selectForScope` and `buildChallengeEmbed`.
- `UserChallengeService` — same shape per-user (`/myquestion`, `/practice`, DM reminders). Public methods return `{ question, embed }`.
- `SettingsService` — all DB reads/writes for guild and user settings.

**Shared embed** (`lib/embed.ts`): `buildChallengeEmbed(question, { title, motivation, questionSet, cycleProgress, footerExtra })` is the single source of truth for embed visuals. It colors by difficulty (green/amber/red) and renders a footer like `NeetCode 150 • Cycle 2 • 23/150 this cycle`.

**Schedulers** (`schedulers/`):

- `serverDailyScheduler` — fires every minute, delegates to `serverChallengeService.runDueGuildChallenges()`. Has overlap guard (`isRunning` flag)
- `userReminderScheduler` — same pattern for user DM reminders

**Commands** are grouped into three folders under `commands/`:

- `admin/` — server config commands (channel, difficulty, question set, post time)
- `user/` — per-user preference and practice commands
- `utility/` — legacy LeetCode commands (`todayleetcode`, `setleetcodechannel`) and `/help`

Every command exports `{ data: SlashCommandBuilder, execute(interaction, appContext) }`. The `appContext` object gives commands access to `services.*` and `dbPool`.

**Database** (`db/`):

- `pool.ts` — singleton `pg.Pool`; handles SSL auto-detection and URL normalization
- `migrator.ts` — reads `db/migrations/*.sql` in lexicographic order, tracks applied migrations in `schema_migrations`
- Migrations run automatically at boot; also runnable standalone via `npm run migrate`

**Key tables:** `questions` (`unique (source_id, question_set)`), `guild_settings`, `user_settings`, `guild_question_history`, `user_question_history`. History rows reference `questions.id` (not `source_id`), so a question's set membership is locked at the time of delivery.

## TypeScript Notes

`strict` is `false` and several files use `// @ts-nocheck`. The project runs via `tsx` (no compilation step). `allowImportingTsExtensions` is enabled, so imports use `.ts` extensions directly.

## Deployment

Docker Compose is the standard deployment path — see `DOCKER.md`. The bot is hosted on Google Cloud.
