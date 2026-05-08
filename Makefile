.PHONY: install migrate-db test start lint typecheck prod production

install:
	bun install --frozen-lockfile --production

migrate-db:
	bun run db:migrate && bun run db:generate

test:
	bun test

lint:
	bun run lint

typecheck:
	bun run tsc --noEmit

start:
	bun start

prod production: install migrate-db test start
