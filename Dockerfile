# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1.3.11@sha256:0733e50325078969732ebe3b15ce4c4be5082f18c4ac1a0f0ca4839c2e4e42a7 as base
WORKDIR /usr/src/app

# set environment variables
ARG DATABASE_URL
ARG DISCORD_TOKEN
ARG SENTRY_DSN

ENV DATABASE_URL=$DATABASE_URL
ENV DISCORD_TOKEN=$DISCORD_TOKEN
ENV SENTRY_DSN=$SENTRY_DSN

# copy node binary from official node image
COPY --from=node:22.22-slim@sha256:f3a68cf41a855d227d1b0ab832bed9749469ef38cf4f58182fb8c893bc462383 /usr/local/bin/node /usr/local/bin/node

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