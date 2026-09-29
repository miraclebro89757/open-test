# OpenTest Makefile

.PHONY: up down build logs api agent executor frontend test test-worker test-semantic test-event test-e2e test-setup help

# Docker compose commands
up:
	docker compose up --build -d

down:
	docker compose down -v

build:
	docker compose build

logs:
	docker compose logs -f

# Service-specific logs
api:
	docker compose logs -f api

agent:
	docker compose logs -f agent

executor:
	docker compose logs -f executor

frontend:
	docker compose logs -f frontend

# Test commands
test: ## Run all integration tests
	@echo "Running all integration tests..."
	./run-tests.sh

test-worker: ## Run worker pool tests only
	@echo "Running worker pool tests..."
	cd tests && cargo test --test test_worker_pool -- --nocapture

test-semantic: ## Run semantic engine tests only
	@echo "Running semantic engine tests..."
	cd tests && cargo test --test test_semantic_engine -- --nocapture

test-event: ## Run event bus tests only
	@echo "Running event bus tests..."
	cd tests && cargo test --test test_event_bus -- --nocapture

test-e2e: ## Run end-to-end integration tests only
	@echo "Running end-to-end integration tests..."
	cd tests && cargo test --test integration_test -- --nocapture

test-setup: ## Check if test environment is ready
	@echo "Checking test environment..."
	@command -v cargo >/dev/null 2>&1 || { echo "❌ Cargo not found. Please install Rust: https://rustup.rs"; exit 1; }
	@echo "✅ Cargo found: $$(cargo --version)"
	@echo "✅ Test environment ready"
	@echo ""
	@echo "Run 'make test' to execute all tests"

# Help command
help: ## Show this help message
	@echo "OpenTest - Available Commands:"
	@echo ""
	@echo "Docker Commands:"
	@echo "  make up              - Start all services with Docker Compose"
	@echo "  make down            - Stop all services and remove volumes"
	@echo "  make build           - Build all Docker images"
	@echo "  make logs            - View logs from all services"
	@echo "  make api             - View API service logs"
	@echo "  make agent           - View Agent service logs"
	@echo "  make executor        - View Executor service logs"
	@echo "  make frontend        - View Frontend service logs"
	@echo ""
	@echo "Test Commands:"
	@echo "  make test            - Run all integration tests"
	@echo "  make test-worker     - Run worker pool tests only"
	@echo "  make test-semantic   - Run semantic engine tests only"
	@echo "  make test-event      - Run event bus tests only"
	@echo "  make test-e2e        - Run end-to-end integration tests only"
	@echo "  make test-setup      - Check if test environment is ready"
	@echo ""
	@echo "Documentation:"
	@echo "  See TESTING.md for test documentation"
	@echo "  See SETUP_TESTS.md for test environment setup"
	@echo "  See TEST_SUMMARY.md for test overview (中文)"
