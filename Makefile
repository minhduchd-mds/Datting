.PHONY: help test test-go test-core test-ui test-match build up down migrate dev-ws dev-match dev-admin

help:
	@echo "make test       — chạy toàn bộ test (Go + @datting/core + match-service)"
	@echo "make build      — build cả hai service"
	@echo "make up         — dựng hạ tầng local (docker compose)"
	@echo "make migrate    — chạy migration PostgreSQL"
	@echo "make dev-match  — chạy match-service (:8080)"
	@echo "make dev-ws     — chạy ws-gateway (:8081)"

test: test-go test-core test-ui test-match

test-go:
	@echo "── ws-gateway (Go) ─────────────────────────────"
	cd services/ws-gateway && go vet ./... && go test ./... -race

test-core:
	@echo "── @datting/core (motion + cổng tuổi) ──────────────"
	cd packages/core && npm test

test-ui:
	@echo "── @datting/ui-web (token + tương phản WCAG) ───"
	cd packages/ui-web && npm test

test-match:
	@echo "── match-service (matching + geoshard) ─────────"
	cd services/match-service && npm test

build:
	cd services/ws-gateway && go build -o /dev/null .
	cd packages/core && npm run build
	cd packages/ui-web && npm run build
	cd services/match-service && npm run build

up:
	docker compose up -d

down:
	docker compose down -v

# Chay MOI migration theo thu tu ten file, khong chi 0001.
# Truoc day muc nay ghim cung 0001_init.sql, nen 0002_report_reason_scam.sql
# khong bao gio duoc ap dung — bang chi biet 5 ly do bao cao trong khi app di
# dong da gui ma 6. Hong im lang, dung loai ma `make migrate` phai chan.
migrate:
	@for f in db/migrations/*.sql; do \
		echo "── $$f"; \
		psql postgresql://datting:datting@localhost:5432/datting -v ON_ERROR_STOP=1 -f "$$f" || exit 1; \
	done

dev-match:
	cd services/match-service && npm run dev

dev-ws:
	cd services/ws-gateway && go run .

dev-admin:
	npm run dev -w @datting/admin
