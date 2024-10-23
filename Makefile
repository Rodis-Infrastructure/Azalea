install:
	bun install --frozen-lockfile --production

migrate-db:
	bun run db:migrate && bun run db:generate

test:
	bun test

start:
	bun start

prod production: install migrate-db test start