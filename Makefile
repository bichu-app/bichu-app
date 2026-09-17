# Makefile - Bichu. Um comando sobe tudo; o resto e atalho.
# docs/07-devops.md secao 2.

SHELL := /bin/bash
COMPOSE := docker compose

# Duas variaveis de linha de comando, e as duas mexem em HOST e PORTA da URL
# base ao mesmo tempo. Trocar so uma das duas e o erro classico: o servico sobe,
# a sonda passa, e todo link gerado aponta para um endereco que nao responde.
#
#   make up HOST=192.168.0.10   serve no IP da rede local, para um segundo
#                               aparelho fisico alcancar a rota publica do QR
#   make up PORTA=3100          quando a 3000 do hospedeiro ja e de outro
#                               projeto (o Caddy escuta na porta que esta em
#                               PUBLIC_BASE_URL, entao porta publicada e porta
#                               da URL sao o MESMO numero)
HOST ?=
PORTA ?= 3000
PORTA_MIDIA ?= 3001

export PORTA_APP := $(PORTA)
export PORTA_MIDIA

BASE_HOST := $(if $(HOST),$(HOST),localhost)
ifneq ($(HOST)$(PORTA),3000)
export PUBLIC_BASE_URL := http://$(BASE_HOST):$(PORTA)
export API_BASE_URL := http://$(BASE_HOST):$(PORTA)
export MEDIA_PUBLIC_BASE_URL := http://$(BASE_HOST):$(PORTA_MIDIA)
export MINIO_CONSOLE_URL := http://$(BASE_HOST):9001
endif
ifneq ($(HOST),)
# So com HOST a borda sai de 127.0.0.1: publicar em 0.0.0.0 sem pedir expoe o
# ambiente de desenvolvimento para a rede inteira.
export BIND_HOST := 0.0.0.0
endif

.DEFAULT_GOAL := ajuda
.PHONY: ajuda setup up down reset migrar migrar-baixo seed logs test test-int e2e verificar-portabilidade verificar-associacao backup restore pin-digests

ajuda: ## lista os alvos
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[1m%-22s\033[0m %s\n", $$1, $$2}'

setup: ## prepara a maquina: ganchos de git e .env
	@git config core.hooksPath .githooks
	@chmod +x .githooks/* 2>/dev/null || true
	@test -f .env || { cp .env.example .env; echo "criado .env a partir do exemplo: PREENCHA os valores vazios"; }
	@echo "gancho de pre-push instalado por core.hooksPath (versionado, corrigivel por PR)"

up: setup ## sobe dev, aplicando as migracoes. HOST=<ip> para servir na rede local
	$(COMPOSE) --profile dev up -d --wait
	@echo "migracoes: aplicadas pelo servico \`migracao\` antes da api subir (docker compose logs migracao)"
	@echo "aplicacao: $${PUBLIC_BASE_URL:-http://localhost:3000}"
	@echo "midia:     $${MEDIA_PUBLIC_BASE_URL:-http://localhost:3001}"
	@echo "e-mail:    http://localhost:8025 (Mailpit; NAO prova entregabilidade)"

down: ## derruba preservando volume
	$(COMPOSE) --profile dev --profile qa down

reset: ## derruba APAGANDO volume e sobe do zero. Prova a migracao em banco vazio
	@if [ "$$ENVIRONMENT" = "homolog" ]; then echo "recusado: reset no perfil de homologacao apaga a massa de teste"; exit 1; fi
	$(COMPOSE) --profile dev --profile qa down -v
	$(MAKE) up

migrar: ## aplica as migracoes pendentes no banco de pe (idempotente)
	$(COMPOSE) up -d --wait db
	$(COMPOSE) run --rm migracao up

migrar-baixo: ## desfaz a ultima migracao. Prova que o `down` existe e roda
	$(COMPOSE) run --rm migracao down 1

seed: ## recria a massa fixa de qa, deterministica
	$(COMPOSE) run --rm api node dist/bin/seed.js

logs: ## tail agregado dos servicos, com prefixo
	$(COMPOSE) logs -f --tail=100

test: ## testes unitarios
	$(COMPOSE) run --rm api npm test

test-int: ## sobe db e objeto, migra do zero e roda integracao
	$(COMPOSE) up -d --wait db objeto
	$(COMPOSE) run --rm migracao up
	$(COMPOSE) run --rm api npm run test:integration

e2e: ## Cypress contra o ambiente de qa
	$(COMPOSE) --profile qa up -d --wait
	npx cypress run --record

verificar-portabilidade: ## portao de portabilidade: provedor, hostname e as duas iscas
	python3 infra/verificacao/verificar_portabilidade.py

verificar-associacao: ## roda o monitor dos arquivos de deep link (secao 16.12)
	python3 infra/verificacao/verificar_associacao.py

backup: ## pg_dump para ./backup. Sem servico gerenciado, o unico backup e este
	@mkdir -p backup
	$(COMPOSE) exec -T db pg_dump -U $${POSTGRES_USER:-bichu} $${POSTGRES_DB:-bichu} | gzip > backup/bichu-$$(date +%Y%m%d-%H%M%S).sql.gz
	@echo "backup gravado. Backup nunca restaurado nao e backup: exercite `make restore` uma vez"

restore: ## restaura o dump mais recente de ./backup
	@ultimo=$$(ls -t backup/*.sql.gz 2>/dev/null | head -1); \
	 test -n "$$ultimo" || { echo "nenhum backup em ./backup"; exit 1; }; \
	 echo "restaurando $$ultimo"; \
	 gunzip -c "$$ultimo" | $(COMPOSE) exec -T db psql -U $${POSTGRES_USER:-bichu} -d $${POSTGRES_DB:-bichu}

pin-digests: ## reresolve os digests das imagens do compose e da base do Dockerfile
	@grep -hoE '(quay\.io/)?[a-z0-9./-]+:[A-Za-z0-9._-]+@sha256:[0-9a-f]{64}' compose.yaml Dockerfile | sort -u | while read -r ref; do \
	  tag=$${ref%@*}; \
	  novo=$$(docker buildx imagetools inspect "$$tag" --format '{{.Manifest.Digest}}' 2>/dev/null); \
	  if [ -n "$$novo" ]; then echo "$$tag -> $$novo"; else echo "$$tag -> NAO RESOLVEU"; fi; \
	done
