# DailyNode

[![CI](https://github.com/JustinK33/DailyNode/actions/workflows/ci.yml/badge.svg)](https://github.com/JustinK33/DailyNode/actions/workflows/ci.yml)

A self-hosted Discord bot that posts a daily LeetCode problem per server and per user, without repeating a problem until the whole set has been seen.

## What it does

Any bot can post a random problem. The part worth building is not repeating one, and that turned out to be most of the work in this repo.

DailyNode keeps two independent schedules. A server admin sets a channel, a time, a timezone, a difficulty, and a question set, and the bot posts there every day. Separately, any user can DM-subscribe on their own time and their own settings, which is why the history tables are keyed per guild and per user rather than globally.
Four sets are available: Blind 75, NeetCode 150, NeetCode 250, and a 252-problem combined list, and a problem that belongs to several sets exists once per set it belongs to.

Selection works on cycles rather than a recency window. One cycle is a full pass through the eligible pool, and within a cycle no problem repeats at all. When the pool is exhausted the next pick starts a fresh cycle and avoids yesterday's problem if there is more than one option. If the configured filter matches nothing, it falls back to the default set and flags the result so the log says the catalog is misconfigured instead of the bot going quiet.

Fourteen slash commands cover the rest: `/setchannel`, `/settime`, `/setdifficulty`, `/setquestionset`, and `/serverconfig` for admins, `/mydifficulty`, `/myquestionset`, `/remindme`, `/reminderoff`, `/mysettings`, `/practice`, and `/myquestion` for users, plus `/todayleetcode` and `/help`.

## Tech stack

| Layer | What it uses |
| --- | --- |
| Runtime | Node 20, TypeScript run directly through `tsx`, ES modules |
| Discord | `discord.js` v14, global slash commands |
| Scheduling | `node-cron`, two jobs on `* * * * *` pinned to UTC |
| Database | PostgreSQL via `pg`, SQL migrations applied on boot |
| Question data | Four JSON files under `data/`, synced into Postgres at startup |
| Config | `dotenv` |
| Checks | `node --test`, ESLint, Prettier, `tsc --noEmit`, all in CI |

Four runtime dependencies. There is no build step; `tsx` runs the TypeScript as-is.

## Architecture

```mermaid
flowchart TD
    discord["Discord"] -->|"slash command interaction"| index["index.ts<br/>command loader, interaction router"]
    index --> ctx["services/appContext.ts<br/>wires services, runs migrations, syncs catalog"]
    index --> cmds["commands/<br/>admin, user, utility"]
    cmds --> settings["SettingsService<br/>guild_settings, user_settings"]
    cmds --> sel["QuestionSelectionService<br/>cycle model, no repeat within a cycle"]
    ctx --> cron["schedulers/<br/>two node-cron jobs, every minute, UTC"]
    cron --> guild["ServerChallengeService<br/>runDueGuildChallenges"]
    cron --> user["UserChallengeService<br/>DM reminders"]
    guild --> sel
    user --> sel
    catalog["QuestionCatalogService<br/>data/*.json into questions"] --> db[("Postgres<br/>settings, questions, guild and user history")]
    sel --> db
    settings --> db
```

`index.ts` loads every file under `commands/`, builds the app context once on `ClientReady`, and routes interactions by command name.
The context is where the ordering matters: migrations run, then the JSON catalog syncs into the `questions` table, then the two schedulers start, so a cron tick can never fire against a schema or a catalog that isn't ready.

Both schedulers tick every minute in UTC and do nothing most of the time. Each tick asks the database which guilds or users have a configured local time matching now, in their own timezone, and posts only for those. Timezone handling lives in the query and in `lib/time.ts`, not in the cron expression, which is why the cron itself is pinned to UTC and never to the host clock.
The delivery is recorded in `guild_question_history` or `user_question_history` with a unique constraint on the day, so a restart or a duplicate tick cannot double-post.

Layer-by-layer detail and the full schema are in [docs/PRODUCTION_ARCHITECTURE.md](docs/PRODUCTION_ARCHITECTURE.md).

## What building this taught me

**I fixed the same bug three times and only the third fix was the bug.** Users kept seeing the same problems over and over. The first attempt widened the recent-history window. The second replaced the window with a cycle model. Neither worked, because the actual cause was in the schema: `questions.source_id` had a single-column `UNIQUE`, and the catalog sync used `on conflict (source_id) do update`, so syncing four overlapping sets left each problem tagged with whichever set synced last. Blind 75's pool wasn't 75 problems, it was however few problems appear in Blind 75 and nowhere else. Migration 003 replaced it with a composite unique on `(source_id, question_set)`. Two rewrites of the selection algorithm were tuning a picker that was being handed a pool of four.

**A `LIMIT` on undeduplicated rows is not a limit on distinct values.** The recent-history query selected raw history rows ordered by `delivered_at desc limit poolSize + 1`, which reads like "the last poolSize problems" and is not. One frequently repeated problem occupies many of those rows, so the exclusion list held far fewer distinct problems than the limit suggested, and the repeat stayed eligible. It needs `group by source_id` with `max(delivered_at)` before the limit means what it looks like it means.

**"Not recently" and "not this cycle" are different guarantees, and only one is checkable.** The recency version could never answer "will every problem appear before any repeats", because the answer depended on a window size I kept guessing at. Replaying the delivery history oldest-first and computing which cycle we're in makes the guarantee a property of the data rather than a tuning parameter, and it's testable: `tests/questionSelectionService.test.ts` asserts the no-repeat property directly instead of asserting on a limit.

**A cron job on `* * * * *` needs three separate guards, and I added them one at a time.** A slow tick overlapping the next one needed an `isRunning` flag in the closure and node-cron's own `noOverlap`. Re-initialization creating a second identical job needed the task stashed on the client under a `Symbol.for` key so a duplicate registration is skipped and logged. Running on the host clock instead of UTC needed `timezone: 'UTC'`, since every per-guild time calculation already happens in code and the cron only has to be a steady heartbeat. Each of those was its own commit, which is a fair record of how many ways an every-minute job can misbehave. `utils/runtimeMonitor.ts` reports event loop lag behind `ENABLE_EVENT_LOOP_MONITOR` because I wanted a number rather than an impression while sorting it out.

**`PermissionFlagsBits.Administrator` locks out the people you meant to allow.** `/setleetcodechannel` was admin-only, which in practice means server owners and nobody else, so a moderator who manages the channels couldn't point the bot at one. `ManageGuild` is the permission that actually describes the action.

**The TypeScript migration is nominal so far, and pretending otherwise would be worse.** Every file was renamed to `.ts` and `tsc --noEmit` runs in CI, but 8 files carry `// @ts-nocheck`, and they are the ones that matter: both entry points and all five services. So the layer holding the selection logic and every SQL call is unchecked, and `npm run typecheck` passing says less than it appears to. The nocheck comments are the to-do list, and removing them one file at a time is the point of having them written down.

## Documentation

- [docs/PRODUCTION_ARCHITECTURE.md](docs/PRODUCTION_ARCHITECTURE.md) is the reference: the four runtime layers, the table-by-table schema, the command inventory, and the service responsibilities.
- [DOCKER.md](DOCKER.md) covers the container setup, Compose, logs, and rebuilds.
- [db/migrations/](db/migrations/) is the schema in order. `003_questions_multi_set_membership.sql` has the write-up of the repeats bug in its header comment.
- [data/](data/) holds the four question sets as JSON, which is the only place to edit the catalog.

## Quick start

Needs Node 20+, a Discord application, and a Postgres database.

Put three values in a gitignored `.env`:

```bash
DISCORD_TOKEN=...
clientId=...            # lowercase, that is what deploy-commands.ts reads
DATABASE_URL=postgres://user:pass@host:5432/dailynode
```

```bash
npm ci
npm run deploy          # register the slash commands with Discord
npm start
```

Migrations and the question-catalog sync both run on startup, so a fresh database needs no extra step. `npm run migrate` runs them alone if you want to apply them without booting the bot.

`PGSSLMODE`, `DB_POOL_MAX`, `DB_IDLE_TIMEOUT_MS`, and `DB_CONNECT_TIMEOUT_MS` are optional pool settings, and `ENABLE_EVENT_LOOP_MONITOR=1` turns on the lag reporter.

Or run it in a container:

```bash
docker compose up -d
docker compose logs -f
```

Checks, which is also what CI runs:

```bash
npm run lint
npm run format -- --check
npm run typecheck
npm test
```

`scripts/simulate.ts` drives the selection service over many days without Discord or a scheduler, which is the fastest way to see whether a change to the picker still holds the no-repeat guarantee.
