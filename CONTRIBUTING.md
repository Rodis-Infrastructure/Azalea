# Contributing

Guidelines for contributing to Azalea.

## Setup

### Prerequisites

- [Bun](https://bun.sh/) (v1.3+)
- SQLite (bundled with Bun)
- A Discord bot token

### Installation

```bash
bun install
```

### Environment

Copy `.env.example` to `.env` (or create `.env`) and fill in:

```
BOT_TOKEN=<your discord bot token>
SENTRY_DSN=<optional sentry dsn>
VIRUSTOTAL_API_KEY=<optional virustotal api key>
```

### Database

```bash
bun run db:generate   # Generate Prisma client
bun run db:migrate    # Apply migrations
```

### Running

```bash
bun start
```

## Code Style

### TypeScript

- Strict mode enabled (`strict: true` in tsconfig)
- Use `@utils/`, `@managers/`, `@/` path aliases (defined in tsconfig)
- Prefer explicit return types on exported functions and public methods
- Use `as` casts for discord.js type incompatibilities (not `@ts-expect-error`)

### Naming Conventions

| Kind | Convention | Example |
|------|-----------|---------|
| Files | PascalCase (commands, events, components) | `ModerationActivity.ts` |
| Utility files | camelCase | `eventLogging.ts` |
| Classes | PascalCase | `MessageCache` |
| Types/Interfaces | PascalCase | `CommandResponse` |
| Enums | PascalCase (name), PascalCase (members) | `InfractionSource.Quick` |
| Functions | camelCase | `humanizeDuration()` |
| Private methods | `_camelCase` | `_buildSearchQuery()` |
| Constants | UPPER_SNAKE_CASE | `MAX_MUTE_DURATION` |
| Config properties | snake_case | `ban_delete_message_days` |

### Time Values

All time-based configuration values and constants use **milliseconds** unless documented otherwise. The only exception is the `duration` column in the `MuteRequest` database table, which stores seconds.

### ESLint

The project uses ESLint with TypeScript rules. Run the linter:

```bash
bunx eslint .
```

All code must pass linting with zero errors and zero warnings.

### Formatting

- Tabs for indentation
- Double quotes for strings
- Semicolons required
- Trailing commas in multiline structures

## Testing

```bash
bun test
```

Tests live in the `tests/` directory. All tests must pass before merging.

## Type Checking

```bash
bunx tsc --noEmit
```

Must produce zero errors.

## Project Structure

```
src/
  index.ts                  # Entry point
  commands/                 # Slash and context menu commands
  components/               # Button and select menu handlers
  events/                   # Discord event listeners
  managers/
    commands/               # Command registration and dispatch
    components/             # Component registration and dispatch
    config/                 # Guild config loading, schema, and validation
    events/                 # Event listener registration
  utils/                    # Shared utilities
configs/                    # Guild YAML configuration files
prisma/                     # Database schema and migrations
tests/                      # Test files
```

## Guild Configuration

Guild configs are YAML files in `configs/` named by guild ID (e.g., `configs/123456789.yml`). They are validated against the Zod schema in `src/managers/config/schema.ts`.

See [CONFIG_MIGRATION.md](CONFIG_MIGRATION.md) for recent property changes.

## Key Patterns

### Fire-and-Forget Logging

The `log()` function has its own internal try/catch with Sentry reporting. Unawaited `log()` calls are intentional.

### `.catch(() => null)`

Used deliberately for Discord API calls where failure is expected and acceptable (e.g., fetching a user who may not exist).

### Config Data

`RawGuildConfig` is inferred from the Zod schema via `z.infer`. Changing property names in `schema.ts` automatically updates the type everywhere.
