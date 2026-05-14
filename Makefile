SHELL := /bin/bash

-include .env

ENV ?= tcv
export COMPOSE_PROJECT_NAME ?= $(ENV)
DOCKER_COMPOSE ?= docker compose

export API_PORT ?= 8686
export UI_PORT ?= 5175
export MAILDEV_SMTP_PORT ?= 1026
export MAILDEV_UI_PORT ?= 1081
export VITE_API_BASE_URL ?= http://localhost:$(API_PORT)/api
export CORS_ALLOWED_ORIGINS ?= http://localhost:$(UI_PORT),http://127.0.0.1:$(UI_PORT),http://ui:5173
export TENANT_S3_BUCKET ?= cv-transpose-config
export TENANT_S3_REGION ?= fr-par
export TENANT_S3_ENDPOINT ?= https://s3.$(TENANT_S3_REGION).scw.cloud
export TENANT_S3_ACCESS_KEY ?= $(shell scw config get access-key 2>/dev/null)
export TENANT_S3_SECRET_KEY ?= $(shell scw config get secret-key 2>/dev/null)
export DEV_TENANT_STORAGE_BACKEND ?= s3
export DEV_TENANT_S3_BUCKET ?= cv-transpose-dev
export DEV_TENANT_S3_REGION ?= fr-par
export DEV_TENANT_S3_ENDPOINT ?= http://minio:9000
export MINIO_ROOT_USER ?= minioadmin
export MINIO_ROOT_PASSWORD ?= minioadmin
export MINIO_API_PORT ?= 9000
export MINIO_CONSOLE_PORT ?= 9001

export API_VERSION    ?= $(shell (git ls-files api core package.json package-lock.json tsconfig.base.json 2>/dev/null || find api core package.json package-lock.json tsconfig.base.json -type f 2>/dev/null) | LC_ALL=C sort | xargs cat 2>/dev/null | sha1sum | sed 's/\(......\).*/\1/')
export API_IMAGE_NAME ?= transpose-cv-api

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
build: build-api ## Build API image for production

.PHONY: build-api
build-api: ## Build API Docker image for production
	TARGET=production $(DOCKER_COMPOSE) build --no-cache api

.PHONY: build-ui
build-ui: ## Build UI locally (SvelteKit static, deployed via GH Pages)
	cd ui && VITE_API_BASE_URL=https://cv-api.sent-tech.ca/api npm run build

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
# Tests
# -----------------------------------------------------------------------------

.PHONY: test-api
test-api: ## Run API unit tests
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml exec api sh -c 'files=$$(find src \( -name "*.test.ts" -o -name "*.spec.ts" \) | sort); if [ -z "$$files" ]; then echo "No API tests found"; exit 0; fi; node --import tsx --test $$files'

.PHONY: test-core-python
test-core-python: ## Run Python core unit tests in Docker
	docker run --rm --user "$$(id -u):$$(id -g)" -v "$$(pwd):/app" -w /app python:3.12-slim sh -lc 'HOME=/tmp PIP_CACHE_DIR=/tmp/pip-cache python -m pip install --disable-pip-version-check '"'"'lxml>=5.2,<6'"'"' '"'"'pypdf>=4.2,<6'"'"' '"'"'pytest>=8.2,<9'"'"' '"'"'pytest-asyncio>=0.23,<1'"'"' && HOME=/tmp PYTHONPATH=/app/core/python PYTHONDONTWRITEBYTECODE=1 python -m pytest -p no:cacheprovider core/python/tests'

.PHONY: smoke-tenant-e2e
smoke-tenant-e2e: ## Run tenant E2E smoke (TENANT=_default|scalian)
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml exec api sh -c 'TENANT="$(if $(strip $(TENANT)),$(TENANT),_default)" INPUT_FILE="$(if $(strip $(INPUT_FILE)),$(INPUT_FILE),templates/references/cgi_source_example_fictional.docx)" SESSION_PASSWORD="$(if $(strip $(SESSION_PASSWORD)),$(SESSION_PASSWORD),smoke-pass)" API_BASE_URL="$(if $(strip $(API_BASE_URL)),$(API_BASE_URL),http://localhost:8686/api)" PROVIDER="$(PROVIDER)" TARGET_COMPANY="$(TARGET_COMPANY)" TIMEOUT_MS="$(if $(strip $(TIMEOUT_MS)),$(TIMEOUT_MS),180000)" POLL_INTERVAL_MS="$(if $(strip $(POLL_INTERVAL_MS)),$(POLL_INTERVAL_MS),2000)" npx tsx scripts/smoke-tenant-e2e.ts'

.PHONY: analyze-template-docx
analyze-template-docx: ## Analyze a supplier DOCX example into a TemplateContract (PROFILE=..., INPUT_FILE=..., OUTPUT_FILE=...)
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml exec api sh -c 'PROFILE="$(if $(strip $(PROFILE)),$(PROFILE),cgi)"; INPUT_FILE="$(if $(strip $(INPUT_FILE)),$(INPUT_FILE),templates/references/cgi_source_example_fictional.docx)"; OUTPUT_FILE="$(if $(strip $(OUTPUT_FILE)),$(OUTPUT_FILE),templates/references/cgi_source_analysis.json)"; npx tsx scripts/analyze-template-docx.ts "$$PROFILE" "$$INPUT_FILE" "$$OUTPUT_FILE"'

.PHONY: uat-tenant
uat-tenant: ## Run tenant smoke flow once (TENANT=..., TARGET_COMPANY=...)
	@$(MAKE) smoke-tenant-e2e TENANT="$(if $(strip $(TENANT)),$(TENANT),_default)" TARGET_COMPANY="$(TARGET_COMPANY)"

.PHONY: uat-tenants
uat-tenants: ## Run the tenant smoke flow for _default then scalian
	@$(MAKE) smoke-tenant-e2e TENANT=_default
	@$(MAKE) smoke-tenant-e2e TENANT=scalian

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

.PHONY: publish
publish: publish-api ## Push API image to registry

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

.PHONY: storage-status
storage-status: check-scw ## List Object Storage buckets in the configured region
	@scw object bucket list region=$(TENANT_S3_REGION)

.PHONY: storage-create
storage-create: check-scw ## Create the tenant Object Storage bucket in Scaleway
	@echo "Creating Object Storage bucket $(TENANT_S3_BUCKET) in $(TENANT_S3_REGION)..."
	@scw object bucket create $(TENANT_S3_BUCKET) region=$(TENANT_S3_REGION) acl=private

.PHONY: admin-hash
admin-hash: ## Generate ADMIN_PASSWORD_HASH and ADMIN_PASSWORD_SALT (PASSWORD="...")
	@if [ -z "$(PASSWORD)" ]; then \
		echo "Error: PASSWORD is required (e.g. make admin-hash PASSWORD='change-me')"; \
		exit 1; \
	fi
	@node api/scripts/hash-admin-password.mjs "$(PASSWORD)"

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

SCW_API_CONTAINER_ID ?= 10379fdb-ef44-4ceb-8630-5a22cc30827b

.PHONY: deploy-api
deploy-api: check-scw ## Update API container with new image (rollout)
	@echo "Updating $(API_IMAGE_NAME) to $(API_VERSION)..."
	scw container container update $(SCW_API_CONTAINER_ID) registry-image="$(REGISTRY)/$(API_IMAGE_NAME):$(API_VERSION)" http-option=enabled region=fr-par
	@echo "Deployment initiated."

.PHONY: deploy
deploy: build-api publish deploy-api wait-for-api ## Full deploy: build, push, rollout, wait

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
# DNS (Cloudflare) + SCW custom domains
# -----------------------------------------------------------------------------

SCW_API_CONTAINER_ID ?= $(shell scw container container list 2>/dev/null | awk '($$2=="$(API_IMAGE_NAME)"){print $$1}')
SCW_API_DOMAIN       = transposecv5ntjukr9-transpose-cv-api.functions.fnc.fr-par.scw.cloud
CUSTOM_API_DOMAIN    = cv-api.sent-tech.ca
CUSTOM_UI_DOMAIN     = cv.sent-tech.ca
LEGACY_UI_DOMAIN     = scalian-cv.sent-tech.ca

.PHONY: dns-setup
dns-setup: dns-api dns-ui dns-ui-legacy scw-custom-domain scw-custom-domain-legacy ## Setup canonical DNS records + legacy UI redirect

.PHONY: dns-api
dns-api: ## Create CNAME cv-api.sent-tech.ca → SCW (Cloudflare)
	@if [ -z "$(CLOUDFLARE_API_TOKEN)" ] || [ -z "$(CLOUDFLARE_ZONE_ID)" ]; then \
		echo "Error: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID required in .env"; exit 1; \
	fi
	@echo "Creating CNAME $(CUSTOM_API_DOMAIN) → $(SCW_API_DOMAIN)..."
	@curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$(CLOUDFLARE_ZONE_ID)/dns_records" \
		-H "Authorization: Bearer $(CLOUDFLARE_API_TOKEN)" \
		-H "Content-Type: application/json" \
		--data '{"type":"CNAME","name":"cv-api","content":"$(SCW_API_DOMAIN)","ttl":1,"proxied":false}' \
		| node -e "let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>raw+=chunk);process.stdin.on('end',()=>{const r=JSON.parse(raw);console.log(r.success?'OK':`Error: ${JSON.stringify(r.errors ?? r)}`);});"

.PHONY: dns-ui
dns-ui: ## Create CNAME cv.sent-tech.ca → rhanka.github.io (Cloudflare CDN)
	@if [ -z "$(CLOUDFLARE_API_TOKEN)" ] || [ -z "$(CLOUDFLARE_ZONE_ID)" ]; then \
		echo "Error: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID required in .env"; exit 1; \
	fi
	@echo "Creating CNAME $(CUSTOM_UI_DOMAIN) → rhanka.github.io..."
	@curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$(CLOUDFLARE_ZONE_ID)/dns_records" \
		-H "Authorization: Bearer $(CLOUDFLARE_API_TOKEN)" \
		-H "Content-Type: application/json" \
		--data '{"type":"CNAME","name":"cv","content":"rhanka.github.io","ttl":1,"proxied":true}' \
		| node -e "let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>raw+=chunk);process.stdin.on('end',()=>{const r=JSON.parse(raw);console.log(r.success?'OK':`Error: ${JSON.stringify(r.errors ?? r)}`);});"

.PHONY: dns-ui-legacy
dns-ui-legacy: ## Create legacy CNAME scalian-cv.sent-tech.ca → SCW API redirect
	@if [ -z "$(CLOUDFLARE_API_TOKEN)" ] || [ -z "$(CLOUDFLARE_ZONE_ID)" ]; then \
		echo "Error: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID required in .env"; exit 1; \
	fi
	@echo "Creating legacy CNAME $(LEGACY_UI_DOMAIN) → $(CUSTOM_UI_DOMAIN)..."
	@curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$(CLOUDFLARE_ZONE_ID)/dns_records" \
		-H "Authorization: Bearer $(CLOUDFLARE_API_TOKEN)" \
		-H "Content-Type: application/json" \
		--data '{"type":"CNAME","name":"scalian-cv","content":"$(SCW_API_DOMAIN)","ttl":1,"proxied":false}' \
		| node -e "let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>raw+=chunk);process.stdin.on('end',()=>{const r=JSON.parse(raw);console.log(r.success?'OK':`Error: ${JSON.stringify(r.errors ?? r)}`);});"

.PHONY: scw-custom-domain
scw-custom-domain: check-scw ## Register custom domain on SCW API container
	@echo "Registering $(CUSTOM_API_DOMAIN) on SCW container $(SCW_API_CONTAINER_ID)..."
	@scw container domain create container-id=$(SCW_API_CONTAINER_ID) hostname=$(CUSTOM_API_DOMAIN)

.PHONY: scw-custom-domain-legacy
scw-custom-domain-legacy: check-scw ## Register legacy redirect domain on SCW API container
	@echo "Registering $(LEGACY_UI_DOMAIN) on SCW container $(SCW_API_CONTAINER_ID)..."
	@scw container domain create container-id=$(SCW_API_CONTAINER_ID) hostname=$(LEGACY_UI_DOMAIN)

# -----------------------------------------------------------------------------
# Utilities
# -----------------------------------------------------------------------------

.PHONY: version
version: ## Show image version
	@echo "API_VERSION: $(API_VERSION)"

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

.PHONY: storage-dev-bootstrap
storage-dev-bootstrap: ## Start local MinIO, create the dev bucket and seed tenant configs
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml up -d minio
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml run --rm minio-init
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml run --rm tenant-storage-seed

.PHONY: storage-dev-verify
storage-dev-verify: ## Verify tenant configs resolve from local MinIO
	$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml exec api sh -c 'npx tsx scripts/verify-s3-tenants.ts _default scalian'

.PHONY: uat-localhost
uat-localhost: ## Start the localhost stack with MinIO-backed tenant storage and run UAT
	@$(MAKE) up
	@$(MAKE) storage-dev-verify
	@$(MAKE) uat-tenants

.PHONY: tenants-migrate-s3
tenants-migrate-s3: ## Upload tenant registry/assets to S3 (SLUGS="_default scalian")
	@$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml exec \
		-e TENANT_STORAGE_BACKEND=s3 \
		-e TENANT_S3_BUCKET="$(TENANT_S3_BUCKET)" \
		-e TENANT_S3_REGION="$(TENANT_S3_REGION)" \
		-e TENANT_S3_ENDPOINT="$(TENANT_S3_ENDPOINT)" \
		-e TENANT_S3_ACCESS_KEY="$(TENANT_S3_ACCESS_KEY)" \
		-e TENANT_S3_SECRET_KEY="$(TENANT_S3_SECRET_KEY)" \
		-e TENANT_S3_PREFIX="$(TENANT_S3_PREFIX)" \
		api sh -c 'npx tsx scripts/migrate-tenants-to-s3.ts "$$@"' sh $(if $(strip $(SLUGS)),$(SLUGS),_default scalian)

.PHONY: tenants-verify-s3
tenants-verify-s3: ## Verify tenant configs load from S3 (SLUGS="_default scalian")
	@$(DOCKER_COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml exec \
		-e TENANT_STORAGE_BACKEND=s3 \
		-e TENANT_S3_BUCKET="$(TENANT_S3_BUCKET)" \
		-e TENANT_S3_REGION="$(TENANT_S3_REGION)" \
		-e TENANT_S3_ENDPOINT="$(TENANT_S3_ENDPOINT)" \
		-e TENANT_S3_ACCESS_KEY="$(TENANT_S3_ACCESS_KEY)" \
		-e TENANT_S3_SECRET_KEY="$(TENANT_S3_SECRET_KEY)" \
		-e TENANT_S3_PREFIX="$(TENANT_S3_PREFIX)" \
		api sh -c 'npx tsx scripts/verify-s3-tenants.ts "$$@"' sh $(if $(strip $(SLUGS)),$(SLUGS),_default scalian)
