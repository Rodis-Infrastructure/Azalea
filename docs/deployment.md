# Deployment

Two supported deploy paths: a long-running host with **PM2** (the default CD target), or **Docker Compose**. Both run from source — Bun executes TypeScript directly, there is no build step.

## CI/CD overview

- **CI** (`.github/workflows/ci.yml`) runs on every push and pull request: lint, typecheck, tests, Prisma migration apply + drift check, Docker build, dependency audit, and `actionlint`.
- **CD** (`.github/workflows/cd.yml`) is triggered by a successful CI run on `main`/`master` (`workflow_run` trigger gated on `conclusion == 'success'`). It SSHes into the production host and invokes `scripts/deploy.sh`.

## PM2 deploy (default)

The CD workflow connects via `appleboy/ssh-action` and runs:

```sh
cd Projects/azalea
git pull origin main
bash scripts/deploy.sh
```

`scripts/deploy.sh` handles the rest:

1. `bun install --frozen-lockfile --production` — production dependencies only.
2. **Backup the SQLite database** to `prisma/backups/azalea.db.<UTC-timestamp>`. The 10 most recent backups are retained.
3. `bun run db:migrate` — apply pending Prisma migrations.
4. `pm2 reload ecosystem.config.js` — graceful reload.

### Required secrets

Configure these in the GitHub repo settings:

| Secret | Description |
|---|---|
| `SSH_HOST` | Production host (DNS name or IP). |
| `SSH_USER` | Username for the SSH connection. |
| `SSH_KEY` | Private key authorized on the host. |

### Required on the host

- `bun` (matching the version in `package.json`).
- `pm2` with an `ecosystem.config.js` one directory above the repo (`cd ..` from `Projects/azalea`).
- A working tree at `~/Projects/azalea` whose `.env` has `DATABASE_URL` and `DISCORD_TOKEN`. `SENTRY_DSN` is optional — leave it unset to disable error reporting.

### Manual deploy / rollback

The deploy script is just bash — you can run it locally on the host to reproduce or roll back. To restore from a backup:

```sh
cp prisma/backups/azalea.db.<timestamp> prisma/azalea.db
pm2 reload ecosystem.config.js
```

## Docker Compose deploy

```sh
docker compose up -d --build
```

The compose file:

- Builds the Bun-based image defined in `Dockerfile`.
- Reads secrets from `.env` via `env_file`.
- Mounts a named volume `data` at `/usr/src/app/data` so the SQLite database persists across rebuilds. **The migrations and schema live in the image, not the volume** — schema updates apply on the next `up`.
- Runs `bunx prisma migrate deploy && bun start` as the entrypoint, so migrations are applied at container start.

### Updating

```sh
docker compose pull       # if you push images to a registry
docker compose up -d --build
```

### Resetting state

To wipe the database and start fresh:

```sh
docker compose down -v    # `-v` removes the named volume
docker compose up -d --build
```

## Database location

`DATABASE_URL` defaults to `file:data/azalea.db` (matches the Docker volume layout). Existing PM2 deploys may still use `file:prisma/azalea.db`; both work — the only constraint is that whatever path you pick must be writable by the runtime user.

If you migrate an existing PM2 deploy to the new `data/` layout:

```sh
mkdir -p data
mv prisma/azalea.db data/azalea.db
# update .env: DATABASE_URL="file:data/azalea.db"
# update scripts/deploy.sh's backup path to match
```
