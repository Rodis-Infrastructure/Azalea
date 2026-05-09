#!/usr/bin/env bash
# Production deploy script. Run from the azalea project root after `git pull`.
# Invoked over SSH by .github/workflows/cd.yml.

set -euo pipefail

# appleboy/ssh-action runs a non-interactive non-login shell, so the host's
# ~/.bashrc / ~/.profile (where Bun and PM2 add themselves to PATH) is
# never sourced. Re-add both binaries' default install dirs explicitly so
# `bun` and `pm2` resolve regardless of how this script was invoked.
export PATH="$HOME/.bun/bin:$HOME/.local/bin:/usr/local/bin:$PATH"

BACKUPS_DIR="prisma/backups"
KEEP_BACKUPS=10

bun install --frozen-lockfile --production

if [[ -f prisma/azalea.db ]]; then
  mkdir -p "$BACKUPS_DIR"
  cp prisma/azalea.db "$BACKUPS_DIR/azalea.db.$(date -u +%Y%m%dT%H%M%SZ)"
  find "$BACKUPS_DIR" -maxdepth 1 -type f -name 'azalea.db.*' \
    | sort -r | tail -n "+$((KEEP_BACKUPS + 1))" \
    | xargs -I {} rm -- "{}"
fi

bun run db:migrate

( cd .. && pm2 reload ecosystem.config.js )
