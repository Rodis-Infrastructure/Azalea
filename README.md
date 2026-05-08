# Azalea

A Discord moderation and utility bot built with [Bun](https://bun.sh), [discord.js](https://discord.js.org), [Prisma](https://www.prisma.io) (SQLite), and [Sentry](https://sentry.io).

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

- [Bun](https://bun.sh) v1.3.10+
- [Node.js](https://nodejs.org) v22+ (required by Prisma)
- A Discord bot token
- A Sentry DSN

## Setup

### 1. Install dependencies

```sh
bun install
```

### 2. Configure environment variables

Copy the example file and fill in the values:

```sh
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | Yes | Discord bot token ([Developer Portal](https://discord.com/developers/applications)) |
| `DATABASE_URL` | Yes | SQLite database path, e.g. `file:database.db` |
| `SENTRY_DSN` | Yes | Sentry DSN ([sentry.io](https://sentry.io)) |
| `ROVER_API_KEY` | No | RoVer API key for Roblox account linking in `/user info` |
| `VIRUSTOTAL_API_KEY` | No | VirusTotal API key for `/scan url` |

### 3. Set up the database

```sh
bun run db:generate
bun run db:migrate
```

### 4. Create configuration files

**Global config** — Create `azalea.cfg.yml` in the project root:

```yaml
database:
  messages:
    insert_cron: "0 * * * *"       # Cron for inserting cached messages into the database
    delete_cron: "0 0 * * *"       # Cron for deleting expired messages
    ttl: 2419200000                # Message TTL in milliseconds (default: 28 days)
```

**Guild configs** — Create one file per guild in the `configs/` directory, named `<guild_id>.yml`. See the [Guild Configuration](#guild-configuration) section below for the full schema.

### 5. Start the bot

```sh
bun start
```

## Docker

Build and run with Docker Compose:

```sh
docker compose up -d --build
```

The `docker-compose.yml` reads secrets from `.env` via `env_file`. The database is persisted in a Docker volume (`prisma`). Migrations run automatically at container startup.

## Makefile

| Target | Description |
|---|---|
| `make install` | Install production dependencies |
| `make migrate-db` | Run Prisma migrations and generate client |
| `make test` | Run tests |
| `make lint` | Run ESLint |
| `make typecheck` | Run TypeScript type checking |
| `make start` | Start the bot |
| `make prod` | Install, migrate, test, and start (alias: `make production`) |

## Commands

### Slash Commands

| Command | Description |
|---|---|
| `/ban` | Ban a user from the server |
| `/kick` | Kick a member from the server |
| `/mute` | Mute a member (with duration) |
| `/unmute` | Unmute a member |
| `/unban` | Unban a user |
| `/warn` | Warn a user |
| `/note` | Add a note to a user's infraction history |
| `/purge all` | Purge messages in a channel |
| `/purge user` | Purge messages from a specific user |
| `/infraction search` | Search a user's infractions (filterable) |
| `/infraction info` | View infraction details by ID |
| `/infraction duration` | Update an infraction's duration |
| `/infraction reason` | Update an infraction's reason |
| `/infraction archive` | Archive an infraction |
| `/infraction restore` | Restore an archived infraction |
| `/infraction active` | View a user's active mute/ban |
| `/infraction copy-history` | Transfer infractions between users |
| `/search` | Find a user by display name |
| `/lockdown start` | Lock down the server |
| `/lockdown end` | End the lockdown |
| `/config guild` | View the guild configuration |
| `/config global` | View the global configuration |
| `/user info` | Get information about a user |
| `/role members` | List members with specified roles |
| `/rule` | Display a server rule |
| `/faq` | Send a quick response |
| `/reminders add` | Create a reminder |
| `/reminders list` | List your reminders |
| `/reminders remove` | Delete a reminder |
| `/reminders clear` | Clear all your reminders |
| `/censor nickname` | Censor a member's nickname |
| `/scan url` | Scan a URL with VirusTotal |
| `/process info` | Bot diagnostics (uptime, ping, memory) |
| `/moderation activity` | View moderation stats for a user |
| `/list-permissions` | List bot permissions in a channel |
| `/highlight pattern add` | Add a highlight pattern |
| `/highlight pattern remove` | Remove a highlight pattern |
| `/highlight pattern clear` | Clear all highlight patterns |
| `/highlight channel add` | Add a channel to highlight scoping |
| `/highlight channel remove` | Remove a channel from highlight scoping |
| `/highlight channel clear` | Clear all highlight channel scoping |
| `/highlight list` | List your highlights |
| `/highlight erase` | Erase a user's highlights (admin) |

### Context Menu Commands

| Menu Item | Type | Description |
|---|---|---|
| Purge messages | User | Purge messages from a user |
| User info | User | View user info |
| Search infractions | User | Search a user's infractions |
| Censor nickname | User | Censor a user's nickname |
| Report user | User | Report a user (modal) |
| Quick mute (30m) | Message | Quick mute author for 30 minutes |
| Quick mute (1h) | Message | Quick mute author for 1 hour |
| Report message | Message | Report a message |
| Store media | Message | Store message attachments to logs |

## Guild Configuration

Each guild requires a YAML file at `configs/<guild_id>.yml`. All properties are optional unless noted. Below is a reference of every configurable property.

### Surface-Level Properties

```yaml
default_purge_amount: 100                  # Default purge amount (1-100)
response_ttl: 3000                         # Temp response lifetime in ms
notification_channel_id: "<channel_id>"    # Channel for public infraction notifications
media_conversion_channel_id: "<channel_id>"
auto_publish_announcements: ["<channel_id>"]
ban_delete_message_days: 0                 # Days of messages to delete on ban (0-7)
default_mute_duration: 2419200000          # Default mute duration in ms (28 days)
rules:
  channel_id: "<channel_id>"               # Channel ID referenced for all rules
  entries: []                              # Rule entries (see Rules section)
```

### Logging

```yaml
logging:
  default_scoping:
    include_channels: []
    exclude_channels: []
  logs:
    - events: ["<event>"]
      channel_id: "<channel_id>"
      scoping:
        include_channels: []
        exclude_channels: []
```

**Available logging events:** `message_bulk_delete`, `message_delete`, `message_update`, `message_reaction_add`, `message_publish`, `interaction_create`, `voice_join`, `voice_leave`, `voice_move`, `thread_create`, `thread_delete`, `thread_update`, `member_join`, `member_leave`, `media_store`, `infraction_create`, `infraction_archive`, `infraction_restore`, `infraction_update`, `ban_request_approve`, `ban_request_deny`, `mute_request_approve`, `mute_request_deny`, `message_report_create`, `message_report_resolve`, `user_report_create`, `user_report_update`, `user_report_resolve`

### Permissions

```yaml
permissions:
  - roles: ["<role_id>"]
    allow:
      - manage_infractions
      - view_infractions
```

**Available permissions:** `manage_infractions`, `transfer_infractions`, `manage_mute_requests`, `manage_ban_requests`, `manage_message_reports`, `manage_user_reports`, `manage_highlights`, `view_infractions`, `view_moderation_activity`, `purge_messages`, `quick_mute`, `report_messages`, `manage_role_requests`, `manage_roles`, `forward_messages`

### Ban & Mute Requests

```yaml
ban_requests:
  channel_id: "<channel_id>"
  review_reminder:                      # Optional
    channel_id: "<channel_id>"
    cron: "0 0 * * *"

mute_requests:
  channel_id: "<channel_id>"
  review_reminder:                      # Optional
    channel_id: "<channel_id>"
    cron: "0 0 * * *"
```

### Message & User Reports

```yaml
message_reports:
  channel_id: "<channel_id>"
  ttl: 604800000                        # Optional, report TTL in ms
  mentioned_roles: ["<role_id>"]        # Optional
  exclude_roles: ["<role_id>"]          # Optional
  review_reminder:                      # Optional
    channel_id: "<channel_id>"
    cron: "0 0 * * *"

user_reports:
  channel_id: "<channel_id>"
  ttl: 604800000
  mentioned_roles: ["<role_id>"]
  exclude_roles: ["<role_id>"]
  review_reminder:
    channel_id: "<channel_id>"
    cron: "0 0 * * *"
```

### Lockdown

```yaml
lockdown:
  channels:
    - id: "<channel_id>"
  default_permission_overwrites:
    - id: "<role_or_user_id>"
      allow: []
      deny: ["SendMessages"]
```

### Highlights

Managed via `/highlight` commands. No YAML configuration needed.

### Auto-Reactions

```yaml
auto_reactions:
  - channel_id: "<channel_id>"
    reactions: ["emoji_1", "emoji_2"]
    exclude_roles: ["<role_id>"]        # Optional
    exclude_patterns: ["regex"]         # Optional
```

### Media Channels

```yaml
media_channels:
  - channel_id: "<channel_id>"
    include_roles: ["<role_id>"]        # Optional
    exclude_roles: ["<role_id>"]        # Optional
    fallback_response: "Please attach media."  # Optional
```

### Scheduled Messages

```yaml
scheduled_messages:
  - channel_id: "<channel_id>"
    cron: "0 0 * * *"
    monitor_slug: "slug"                # Sentry cron monitor slug
    messages: ["Message content"]
```

### Role Requests

```yaml
role_requests:
  channel_id: "<channel_id>"
  roles:
    - id: "<role_id>"
      ttl: 86400000                     # Optional, TTL in ms
```

### Quick Responses

```yaml
quick_responses:                        # Max 25
  - label: "FAQ Label"
    value: "faq_key"
    response: "Response content"
```

### Rules

```yaml
rules:
  - title: "Rule 1"
    content: "Description of rule 1"
```

### Nickname Censorship

```yaml
nickname_censorship:
  exclude_roles: ["<role_id>"]
  exclusion_response: "Cannot censor this user."
  nickname: "Censored User {n}"         # {n} = discriminator
```

### Stage Event Overrides

```yaml
stage_event_overrides:
  - channel_id: "<channel_id>"
```

### User Flags

```yaml
user_flags:                             # Max 18
  - label: "Flag Label"
    roles: ["<role_id>"]
```

### Infraction Reasons

```yaml
infraction_reasons:
  exclude_domains: ["example.com"]
  message_links:
    include_channels: []
    exclude_channels: []
```

### Ephemeral Scoping

```yaml
ephemeral_scoping:
  default:
    include_channels: []
    exclude_channels: []
  moderation_activity:
    include_channels: []
    exclude_channels: []
```

### Emojis

```yaml
emojis:
  reactions:
    approve: "<emoji>"
    deny: "<emoji>"
    quick_mute_30: "<emoji>"
    quick_mute_60: "<emoji>"
    purge_messages: "<emoji>"
    report_message: "<emoji>"
  display:
    checkmark: "<emoji_id>"
    warning: "<emoji_id>"
    alert: "<emoji_id>"
```

## Project Structure

```
src/
  index.ts                  # Entry point
  commands/                 # Slash and context menu commands
  components/               # Message component handlers (buttons, modals)
  events/                   # Discord event listeners
  managers/
    commands/               # Command registration and routing
    components/             # Component registration and routing
    config/                 # Guild and global config loading, schema validation
    events/                 # Event listener registration
  utils/                    # Shared utilities, constants, logging, message helpers
configs/                    # Guild configuration YAML files
prisma/
  schema.prisma             # Database schema
  migrations/               # Prisma migrations
```

## License

[CC BY-NC 4.0](LICENSE.md) — Creative Commons Attribution-NonCommercial 4.0 International
