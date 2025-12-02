# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1.3.3@sha256:fbf8e67e9d3b806c86be7a2f2e9bae801f2d9212a21db4dcf8cc9889f5a3c9c4 as base
WORKDIR /usr/src/app

# set environment variables
ARG DATABASE_URL
ARG DISCORD_TOKEN
ARG SENTRY_DSN

ENV DATABASE_URL=$DATABASE_URL
ENV DISCORD_TOKEN=$DISCORD_TOKEN
ENV SENTRY_DSN=$SENTRY_DSN

# copy node binary from official node image
COPY --from=node:24.11-slim@sha256:0afb7822fac7bf9d7c1bf3b6e6c496dee6b2b64d8dfa365501a3c68e8eba94b2 /usr/local/bin/node /usr/local/bin/node

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

# ensure prisma.schema is already in the directory
# before installing the prisma client
COPY . .
RUN bunx prisma generate && bunx prisma migrate deploy
# give the user permission to write to the prisma directory
RUN chown -R bun:bun /usr/src/app/prisma

# run the app
USER bun
ENTRYPOINT [ "bun", "start" ]