# Azalea

A Discord moderation and utility bot built with [Bun](https://bun.sh), [discord.js](https://discord.js.org), [Prisma](https://www.prisma.io) (SQLite), and [Sentry](https://sentry.io).

## Documentation

- **[docs/commands.md](docs/commands.md)** — every slash and context menu command.
- **[docs/configuration.md](docs/configuration.md)** — global and guild config schema reference.
- **[docs/deployment.md](docs/deployment.md)** — PM2 and Docker Compose deploy paths.
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — local dev setup, code style, and testing.

## Features

- **Infractions** — Ban, kick, mute, unmute, unban, warn, and note. All actions are tracked in the database with unique IDs and support searching, filtering, archiving, restoring, reason/duration editing, and history transfer between users.
- **Ban & Mute Requests** — Staff submit ban/mute requests that require approval. Configurable review channels with cron-based review reminders.
- **Message & User Reports** — Context menu reporting with configurable report channels, TTL, review reminders, and role mentions. Localized in 6 languages.
- **Logging** — 27 event types covering messages, voice, threads, members, infractions, moderation requests, reports, media, and interactions. Per-log channel scoping with include/exclude controls.
- **Highlights** — Pattern-based keyword notifications with per-user channel scoping (up to 20 patterns, 40 channel entries).
- **Reminders** — Up to 10 per user, with custom duration and message. Persisted across restarts.
- **Server Lockdown** — Apply/revert permission overwrites to configured channels. Pre-lockdown state is stored for clean revert.
- **Quick Mute** — 30-minute and 1-hour context menu quick mutes that automatically purge the author's messages.
- **URL Scanning** — VirusTotal integration for scanning URLs.
- **Moderation Activity** — View staff moderation stats (infractions dealt, requests reviewed/made), filterable by month and year.
- **Auto-Publish** — Automatically crosspost messages in announcement channels.
- **Auto-Reactions** — Add configured reactions to messages in specified channels.
- **Media Channels** — Enforce attachment requirements in specified channels.
- **Scheduled Messages** — Cron-based scheduled messages with Sentry monitor slugs.
- **Role Requests** — Configurable role request channels with optional TTL.
- **Quick Responses / FAQ** — Guild-specific configurable quick responses via `/faq`.
- **Rules Display** — Guild-specific `/rule` command populated from config.
- **Nickname Censorship** — Slash command and context menu to censor nicknames.
- **Media Conversion** — Log uploaded media and respond with a link to the log.

## Requirements

- [Bun](https://bun.sh) v1.3+
- [Node.js](https://nodejs.org) v22+ (used by Prisma at runtime)
- A Discord bot token
- (Optional) A Sentry DSN for error reporting

## Setup

### 1. Install dependencies and generate the Prisma client

```sh
bun run setup
```

Equivalent to `bun install && bun run db:generate`.

### 2. Configure environment variables

```sh
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | Yes | Discord bot token ([Developer Portal](https://discord.com/developers/applications)). |
| `DATABASE_URL` | Yes | SQLite database path. Default: `file:data/azalea.db`. |
| `SENTRY_DSN` | No | Sentry DSN ([sentry.io](https://sentry.io)). If unset, error reporting is disabled. |
| `ROVER_API_KEY` | No | RoVer API key for Roblox account linking in `/user info`. |
| `VIRUSTOTAL_API_KEY` | No | VirusTotal API key for `/scan url`. |

### 3. Apply database migrations

```sh
bun run db:migrate
```

### 4. Create configuration files

- **Global config** — `azalea.cfg.yml` in the project root.
- **Guild configs** — one file per guild at `configs/<guild_id>.yml`.

See [docs/configuration.md](docs/configuration.md) for the schema.

### 5. Start the bot

```sh
bun start
```

## Scripts

| Script | Description |
|---|---|
| `bun start` | Run the bot. |
| `bun run setup` | Install dependencies and generate the Prisma client. |
| `bun run reset` | Wipe `node_modules` and re-run `setup`. |
| `bun run lint` / `lint:fix` | ESLint, with optional auto-fix. |
| `bun run typecheck` | `tsc --noEmit`. |
| `bun test` | Run tests. |
| `bun run verify` | Run every check CI runs (lint, typecheck, tests, schema validation, drift check). |
| `bun run db` | Apply migrations and regenerate the Prisma client. |
| `bun run db:migrate` / `db:generate` / `db:validate` / `db:format` / `db:check` / `db:studio` | Individual Prisma helpers. |
| `bun run docker:build` / `docker:up` / `docker:down` / `docker:logs` | Compose shortcuts. |

## Deployment

See [docs/deployment.md](docs/deployment.md) for PM2 and Docker Compose details.

For a quick Docker Compose start:

```sh
docker compose up -d --build
```

## License

[CC BY-NC 4.0](LICENSE.md) — Creative Commons Attribution-NonCommercial 4.0 International.
