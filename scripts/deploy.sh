#!/usr/bin/env bash
# Production deploy script. Run from the azalea project root after `git pull`.
# Invoked over SSH by .github/workflows/cd.yml.

set -euo pipefail

# appleboy/ssh-action runs a non-interactive non-login shell, so the host's
# ~/.bashrc / ~/.profile (where Bun and PM2 add themselves to PATH) is
# never sourced. Re-add both binaries' default install dirs explicitly so
# `bun` and `pm2` resolve regardless of how this script was invoked.
export PATH="$HOME/.bun/bin:$HOME/.local/bin:/usr/local/bin:$PATH"

# Pin the host's Bun to the version recorded in `.bun-version`. CI uses
# the same file via `oven-sh/setup-bun`, so dev/CI/prod stay in lockstep
# and we never silently pull a Bun release that hasn't been vetted in CI
# first. If `.bun-version` is absent (e.g. when running this script from
# a stale checkout) we fall back to the currently installed Bun.
PIN="$(cat .bun-version 2>/dev/null | tr -d '[:space:]')"
if [ -n "$PIN" ]; then
  if [ "$(bun --version 2>/dev/null)" != "$PIN" ]; then
    echo "Pinning Bun to $PIN (current: $(bun --version 2>/dev/null || echo none))"
    curl -fsSL https://bun.sh/install | bash -s "bun-v$PIN"
  fi
else
  echo "WARNING: .bun-version missing; using installed Bun $(bun --version)"
fi

BACKUPS_DIR="prisma/backups"
KEEP_BACKUPS=3

bun install --frozen-lockfile --production

if [[ -f prisma/azalea.db ]]; then
  mkdir -p "$BACKUPS_DIR"
  gzip -c prisma/azalea.db > "$BACKUPS_DIR/azalea.db.$(date -u +%Y%m%dT%H%M%SZ).gz"
  find "$BACKUPS_DIR" -maxdepth 1 -type f -name 'azalea.db.*' \
    | sort -r | tail -n "+$((KEEP_BACKUPS + 1))" \
    | xargs -I {} rm -- "{}"
fi

bun run db:migrate

( cd .. && pm2 reload ecosystem.config.js --only azalea --update-env )
