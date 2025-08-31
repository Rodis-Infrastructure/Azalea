# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1.2.21@sha256:5a2011bf09364b9af658ac1e66f60d08092f4291aeefbff448d58b027734fdd0 as base
WORKDIR /usr/src/app

# set environment variables
ARG DATABASE_URL
ARG DISCORD_TOKEN
ARG SENTRY_DSN

ENV DATABASE_URL=$DATABASE_URL
ENV DISCORD_TOKEN=$DISCORD_TOKEN
ENV SENTRY_DSN=$SENTRY_DSN

# copy node binary from official node image
COPY --from=node:22.19-slim@sha256:0ae9e80c8c7e7a8fea5bc8e8762e4fd09a7a68c251abf8cf44ea0863efda2bc5 /usr/local/bin/node /usr/local/bin/node

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