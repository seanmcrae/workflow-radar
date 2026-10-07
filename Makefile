.PHONY: install build lint format typecheck test check demo sample site clean

install:
	npm ci

build:
	npm run build

lint:
	npm run lint

format:
	npm run format

typecheck:
	npm run typecheck

test:
	npm test

check: lint
	npm run format:check
	npm run typecheck
	npm test

demo:
	npm run demo

sample:
	npm run sample

site:
	npm run site

clean:
	rm -rf dist report site coverage
