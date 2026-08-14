.PHONY: help test test-go test-core test-match build up down migrate dev-ws dev-match

help:
	@echo "make test       — chạy toàn bộ test (Go + @datting/core + match-service)"
	@echo "make build      — build cả hai service"
	@echo "make up         — dựng hạ tầng local (docker compose)"
	@echo "make migrate    — chạy migration PostgreSQL"
	@echo "make dev-match  — chạy match-service (:8080)"
	@echo "make dev-ws     — chạy ws-gateway (:8081)"

test: test-go test-core test-match

test-go:
	@echo "── ws-gateway (Go) ─────────────────────────────"
	cd services/ws-gateway && go vet ./... && go test ./... -race

test-core:
	@echo "── @datting/core (motion + cổng tuổi) ──────────────"
	cd packages/core && npm test

test-match:
	@echo "── match-service (matching + geoshard) ─────────"
	cd services/match-service && npm test

build:
	cd services/ws-gateway && go build -o /dev/null .
	cd packages/core && npm run build
	cd services/match-service && npm run build

up:
	docker compose up -d

down:
	docker compose down -v

migrate:
	psql postgresql://datting:datting@localhost:5432/datting -f db/migrations/0001_init.sql

dev-match:
	cd services/match-service && npm run dev

dev-ws:
	cd services/ws-gateway && go run .
