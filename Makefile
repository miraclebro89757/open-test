# Makefile

.PHONY: up down build logs api agent executor frontend

up:
	docker compose up --build -d

down:
	docker compose down -v

build:
	docker compose build

logs:
	docker compose logs -f

api:
	docker compose logs -f api

agent:
	docker compose logs -f agent

executor:
	docker compose logs -f executor

frontend:
	docker compose logs -f frontend
