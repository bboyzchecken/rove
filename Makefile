# rove — developer shortcuts. Everything real happens through docker compose.

.DEFAULT_GOAL := help
COMPOSE := docker compose

.PHONY: help up down restart build logs ps sh-api sh-web sh-db migrate seed test test-api test-web lint fmt clean

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | sed -e 's/:.*## /|/' | awk -F'|' '{ printf "  %-10s %s\n", $$1, $$2 }'

up: ## Build and start the whole stack
	$(COMPOSE) up --build -d

down: ## Stop the stack
	$(COMPOSE) down

restart: ## Restart api and web
	$(COMPOSE) restart api web

build: ## Rebuild images without starting
	$(COMPOSE) build

logs: ## Follow api + web logs
	$(COMPOSE) logs -f api web

ps: ## Show container status
	$(COMPOSE) ps

sh-api: ## Shell into the api container
	$(COMPOSE) exec api sh

sh-web: ## Shell into the web container
	$(COMPOSE) exec web sh

sh-db: ## MySQL shell
	$(COMPOSE) exec mysql sh -c 'mysql -u"$$MYSQL_USER" -p"$$MYSQL_PASSWORD" "$$MYSQL_DATABASE"'

migrate: ## Run database migrations only
	$(COMPOSE) exec api go run . up

seed: ## Import data/poi/jp.csv
	$(COMPOSE) exec api go run . seed

test: test-api test-web ## Run every test

test-api: ## Go tests
	$(COMPOSE) exec api go test ./...

test-web: ## Vitest
	$(COMPOSE) exec web pnpm test

lint: ## go vet + eslint + tsc
	$(COMPOSE) exec api go vet ./...
	$(COMPOSE) exec web pnpm lint
	$(COMPOSE) exec web pnpm typecheck

fmt: ## Format both apps
	$(COMPOSE) exec api go fmt ./...
	$(COMPOSE) exec web pnpm format

clean: ## Stop and delete all volumes (WIPES THE DATABASE)
	$(COMPOSE) down -v
