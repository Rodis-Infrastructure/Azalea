# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1.3.13@sha256:87416c977a612a204eb54ab9f3927023c2a3c971f4f345a01da08ea6262ae30e as base
WORKDIR /usr/src/app

# copy node binary from official node image
COPY --from=node:24.15-slim@sha256:03eae3ef7e88a9de535496fb488d67e02b9d96a063a8967bae657744ecd513f2 /usr/local/bin/node /usr/local/bin/node

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
RUN bunx prisma generate

# give the user permission to write to the prisma directory
RUN chown -R bun:bun /usr/src/app/prisma

# run migrations at startup, then start the app
# secrets (DISCORD_TOKEN, SENTRY_DSN, DATABASE_URL) should be provided
# at runtime via environment variables or docker-compose env_file
USER bun
ENTRYPOINT [ "sh", "-c", "bunx prisma migrate deploy && bun start" ]