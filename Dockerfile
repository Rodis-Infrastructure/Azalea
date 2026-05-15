# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4 AS base
WORKDIR /usr/src/app

# copy node binary from official node image
COPY --from=node:22.22-slim@sha256:9f6d5975c7dca860947d3915877f85607946403fc55349f39b4bc3688448bb6e /usr/local/bin/node /usr/local/bin/node

# install dependencies into temp directory
# this will cache them and speed up future builds
FROM base AS install

# install with --production (exclude devDependencies) and generate prisma client
RUN mkdir -p /temp/prod
COPY package.json bun.lockb /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# copy production dependencies and source code into final image
FROM base AS release
COPY --from=install /temp/prod/ .

# copy source code with bun ownership so generated artifacts are writable at runtime
COPY --chown=bun:bun . .
RUN bunx prisma generate

# create the SQLite data directory (mounted as a volume in docker-compose)
RUN mkdir -p data && chown bun:bun data

# run migrations at startup, then start the app
# secrets (DISCORD_TOKEN, SENTRY_DSN, DATABASE_URL) should be provided
# at runtime via environment variables or docker-compose env_file
USER bun
ENTRYPOINT [ "sh", "-c", "bunx prisma migrate deploy && bun start" ]