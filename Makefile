SHELL := /bin/bash

-include .env

ENV ?= dev
export COMPOSE_PROJECT_NAME ?= $(ENV)
DOCKER_COMPOSE ?= docker compose

export API_PORT ?= 8787
export UI_PORT ?= 5173
export VITE_API_BASE_URL ?= http://localhost:$(API_PORT)/api
export CORS_ALLOWED_ORIGINS ?= http://localhost:$(UI_PORT),http://127.0.0.1:$(UI_PORT),http://ui:5173

export API_VERSION    ?= $(shell find api/src api/package.json api/Dockerfile -type f 2>/dev/null | LC_ALL=C sort | xargs cat 2>/dev/null | sha1sum | sed 's/\(......\).*/\1/')
export UI_VERSION     ?= $(shell find ui/src ui/package.json ui/Dockerfile ui/vite.config.ts ui/svelte.config.js -type f 2>/dev/null | LC_ALL=C sort | xargs cat 2>/dev/null | sha1sum | sed 's/\(......\).*/\1/')
export API_IMAGE_NAME ?= transpose-cv-api
export UI_IMAGE_NAME  ?= transpose-cv-ui

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show available targets
	@echo "Available targets:"
	@grep -E '^[a-zA-Z0-9_.-]+:.*?##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[32m%-25s\033[0m %s\n", $$1, $$2}'

# -----------------------------------------------------------------------------
# Development
# -----------------------------------------------------------------------------

.PHONY: dev
dev: ## Start UI and API in watch mode
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml up --build -d

.PHONY: up
up: ## Start the full stack in detached mode
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml up --build -d --wait

.PHONY: down
down: ## Stop and remove containers
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml down

.PHONY: ps
ps: ## Show running services
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml ps

.PHONY: logs
logs: ## Show logs for all services
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml logs -f

.PHONY: logs-%
logs-%: ## Show logs for a specific service (e.g., make logs-api)
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml logs -f $*

.PHONY: clean
clean: ## Clean all containers, volumes
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml down -v --remove-orphans

# -----------------------------------------------------------------------------
# Installation
# -----------------------------------------------------------------------------

.PHONY: install-api
install-api: ## Install API dependencies in container
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml exec api npm install $(NPM_LIB)

.PHONY: install-ui
install-ui: ## Install UI dependencies in container
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml exec ui npm install $(NPM_LIB)

# -----------------------------------------------------------------------------
# Build
# -----------------------------------------------------------------------------

.PHONY: build
build: build-api build-ui ## Build all images for production

.PHONY: build-api
build-api: ## Build API Docker image for production
	TARGET=production $(DOCKER_COMPOSE) build --no-cache api

.PHONY: build-ui
build-ui: ## Build UI Docker image for production
	TARGET=production $(DOCKER_COMPOSE) -f docker-compose.yml build --no-cache \
		--build-arg VITE_API_BASE_URL=/api \
		ui

# -----------------------------------------------------------------------------
# Type checking
# -----------------------------------------------------------------------------

.PHONY: typecheck-api
typecheck-api: ## Run TypeScript check on API
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml exec api npx tsc --noEmit

.PHONY: typecheck-ui
typecheck-ui: ## Run SvelteKit check on UI
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml exec ui npm run check

.PHONY: typecheck
typecheck: typecheck-api typecheck-ui ## Run all type checks

# -----------------------------------------------------------------------------
# Docker registry
# -----------------------------------------------------------------------------

.PHONY: docker-login
docker-login:
	@echo "$(DOCKER_PASSWORD)" | docker login $(REGISTRY) -u $(DOCKER_USERNAME) --password-stdin

.PHONY: publish-api
publish-api: docker-login ## Push API image to registry
	@echo "Pushing $(REGISTRY)/$(API_IMAGE_NAME):$(API_VERSION)"
	@docker push $(REGISTRY)/$(API_IMAGE_NAME):$(API_VERSION)

.PHONY: publish-ui
publish-ui: docker-login ## Push UI image to registry
	@echo "Pushing $(REGISTRY)/$(UI_IMAGE_NAME):$(UI_VERSION)"
	@docker push $(REGISTRY)/$(UI_IMAGE_NAME):$(UI_VERSION)

.PHONY: publish
publish: publish-api publish-ui ## Push all images to registry

# -----------------------------------------------------------------------------
# Scaleway deployment
# -----------------------------------------------------------------------------

.PHONY: check-scw
check-scw:
	@if ! command -v scw >/dev/null 2>&1; then \
		echo "scw (Scaleway CLI) not found. Installing..."; \
		curl -sL https://raw.githubusercontent.com/scaleway/scaleway-cli/master/scripts/get.sh | sh; \
	fi

.PHONY: scw-create-namespace
scw-create-namespace: check-scw ## Create Scaleway container namespace
	@echo "Creating namespace transpose-cv..."
	@scw container namespace create name=transpose-cv

.PHONY: deploy-api-init
deploy-api-init: check-scw ## Create API container in Scaleway namespace (first time)
	@echo "Creating container $(API_IMAGE_NAME) in namespace $(SCW_NAMESPACE_ID)..."
	@API_CONTAINER_ID=$$(scw container container list | awk '($$2=="$(API_IMAGE_NAME)"){print $$1}'); \
	if [ -n "$${API_CONTAINER_ID}" ]; then \
		echo "Container $(API_IMAGE_NAME) already exists (ID: $${API_CONTAINER_ID})"; \
	else \
		scw container container create \
			name=$(API_IMAGE_NAME) \
			namespace-id=$(SCW_NAMESPACE_ID) \
			registry-image=$(REGISTRY)/$(API_IMAGE_NAME):$(API_VERSION) \
			port=8787 \
			min-scale=0 \
			max-scale=1 \
			memory-limit=2048 \
			cpu-limit=1000 \
			timeout=300s \
			privacy=public \
			protocol=http1 \
			http-option=redirected; \
		echo "Container created."; \
	fi

.PHONY: deploy-ui-init
deploy-ui-init: check-scw ## Create UI container in Scaleway namespace (first time)
	@echo "Creating container $(UI_IMAGE_NAME) in namespace $(SCW_NAMESPACE_ID)..."
	@UI_CONTAINER_ID=$$(scw container container list | awk '($$2=="$(UI_IMAGE_NAME)"){print $$1}'); \
	if [ -n "$${UI_CONTAINER_ID}" ]; then \
		echo "Container $(UI_IMAGE_NAME) already exists (ID: $${UI_CONTAINER_ID})"; \
	else \
		scw container container create \
			name=$(UI_IMAGE_NAME) \
			namespace-id=$(SCW_NAMESPACE_ID) \
			registry-image=$(REGISTRY)/$(UI_IMAGE_NAME):$(UI_VERSION) \
			port=5173 \
			min-scale=0 \
			max-scale=1 \
			memory-limit=256 \
			cpu-limit=500 \
			timeout=60s \
			privacy=public \
			protocol=http1 \
			http-option=redirected; \
		echo "Container created."; \
	fi

.PHONY: deploy-api
deploy-api: check-scw ## Update API container with new image
	@echo "Updating $(API_IMAGE_NAME) to $(API_VERSION)..."
	@API_CONTAINER_ID=$$(scw container container list | awk '($$2=="$(API_IMAGE_NAME)"){print $$1}'); \
	scw container container update $${API_CONTAINER_ID} registry-image="$(REGISTRY)/$(API_IMAGE_NAME):$(API_VERSION)"
	@echo "Deployment initiated."

.PHONY: deploy-ui
deploy-ui: check-scw ## Update UI container with new image
	@echo "Updating $(UI_IMAGE_NAME) to $(UI_VERSION)..."
	@UI_CONTAINER_ID=$$(scw container container list | awk '($$2=="$(UI_IMAGE_NAME)"){print $$1}'); \
	scw container container update $${UI_CONTAINER_ID} registry-image="$(REGISTRY)/$(UI_IMAGE_NAME):$(UI_VERSION)"
	@echo "Deployment initiated."

.PHONY: deploy
deploy: deploy-api deploy-ui ## Deploy all containers

.PHONY: wait-for-api
wait-for-api: check-scw ## Wait for API container to be ready
	@printf "Waiting for API container..."
	@API_STATUS="pending"; \
	while [ "$${API_STATUS}" != "ready" ]; do \
		API_STATUS=$$(scw container container list | awk '($$2=="$(API_IMAGE_NAME)"){print $$4}'); \
		printf "."; \
		sleep 3; \
	done; \
	echo " ready!"

# -----------------------------------------------------------------------------
# Utilities
# -----------------------------------------------------------------------------

.PHONY: version
version: ## Show image versions
	@echo "API_VERSION: $(API_VERSION)"
	@echo "UI_VERSION: $(UI_VERSION)"

.PHONY: commit
commit: ## Create a git commit (MSG="type: message")
	@if [ -z "$(MSG)" ]; then \
		echo "Error: MSG is required (e.g., make commit MSG='docs: update spec')"; \
		exit 1; \
	fi
	@git commit -m "$$(printf "%b" "$(MSG)")"

.PHONY: exec-api
exec-api: ## Execute command in API container (CMD="...")
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml exec api sh -c "$(CMD)"

.PHONY: exec-ui
exec-ui: ## Execute command in UI container (CMD="...")
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml exec ui sh -c "$(CMD)"
