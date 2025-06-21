# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1.2.17@sha256:2cd6a1d9e3d505725243c9564cca08465fc6ffb12c065a09261992e650995ee6 as base
WORKDIR /usr/src/app

# set environment variables
ARG DATABASE_URL
ARG DISCORD_TOKEN
ARG SENTRY_DSN

ENV DATABASE_URL=$DATABASE_URL
ENV DISCORD_TOKEN=$DISCORD_TOKEN
ENV SENTRY_DSN=$SENTRY_DSN

# copy node binary from official node image
COPY --from=node:22.16-slim@sha256:048ed02c5fd52e86fda6fbd2f6a76cf0d4492fd6c6fee9e2c463ed5108da0e34 /usr/local/bin/node /usr/local/bin/node

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