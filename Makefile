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
# As duas que sairam de PUBLIC_BASE_URL (ADR-0017 item 2) acompanham o HOST.
# Esquecer a de tag aqui faria `make up HOST=<ip>` emitir tag com `localhost`
# dentro do QR, que e o endereco do proprio aparelho de quem le -- e o que o
# QR guarda nao se corrige depois (ADR-0004).
export TAG_BASE_URL := http://$(BASE_HOST):$(PORTA)
export WEB_BASE_URL := http://$(BASE_HOST):$(PORTA)
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
.PHONY: ajuda setup up down reset migrar migrar-baixo seed logs test test-int e2e cobertura verificar verificar-variaveis verificar-portabilidade verificar-associacao verificar-limite verificar-contrato-publico verificar-borda verificar-borda-local verificar-cobertura verificar-dispensas verificar-docs-fechada backup restore pin-digests

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

# `compose.yaml` declara `name: bichu`, entao `$(COMPOSE)` resolve para a PILHA
# PRINCIPAL venha o comando de onde vier -- inclusive de um worktree. Rodar a
# suite unitaria assim de dentro de um worktree executaria o codigo da arvore
# principal e chamaria o resultado de "os meus testes passaram". Nao e colisao:
# e testar outra coisa, em silencio.
#
# Por isso a recusa. Ela e por CAMINHO e nao por branch: o que decide qual codigo
# roda e o diretorio.
test: ## testes unitarios (so na arvore principal; de worktree use `npm test`)
	@principal=$$(git rev-parse --path-format=absolute --git-common-dir | xargs dirname); \
	 aqui=$$(git rev-parse --show-toplevel); \
	 if [ "$$principal" != "$$aqui" ]; then \
	   echo "recusado: $$aqui e um worktree, e \`docker compose\` aqui resolve para a pilha"; \
	   echo "          \`bichu\`, que carrega o codigo de $$principal."; \
	   echo "          A suite unitaria nao precisa de banco: rode \`npm test\` direto."; \
	   exit 1; \
	 fi
	$(COMPOSE) run --rm api npm test

# Pilha EFEMERA, com nome de projeto derivado do caminho e NENHUMA porta
# publicada. Roda igual da arvore principal e de qualquer worktree, e nunca
# encosta no banco de desenvolvimento -- a versao anterior deste alvo migrava e
# escrevia DENTRO da pilha `bichu`, viesse o comando de onde viesse.
# Ver infra/integracao/rodar.mjs.
test-int: ## sobe uma pilha efemera propria, migra do zero e roda a integracao
	npm run test:integration

e2e: ## Cypress contra o ambiente de qa
	$(COMPOSE) --profile qa up -d --wait
	npx cypress run --record

# A mesma invocacao do job `sonar` da esteira, para conferir na maquina antes
# de abrir PR. Roda fora do compose de proposito: e o caminho que o runner do
# GitHub usa, e o objetivo aqui e reproduzir esse caminho, nao um parecido.
#
# `--enable-source-maps` nao e opcional: sem ela o lcov aponta para o
# JavaScript de `dist/`, o Sonar nao casa nada e publica 0% sem reclamar.
cobertura: ## gera coverage/lcov.info no formato que o SonarCloud le
	@mkdir -p coverage
	npx tsc -p tsconfig.json --outDir dist/_tests
	node --enable-source-maps --test --experimental-test-coverage \
	  --test-reporter=spec --test-reporter-destination=stdout \
	  --test-reporter=lcov --test-reporter-destination=coverage/lcov.info \
	  "dist/_tests/src/**/*.test.js"

verificar-cobertura: cobertura ## o lcov fala de src/**/*.ts? Com as quatro iscas
	node infra/verificacao/verificar-cobertura-lcov.mjs coverage/lcov.info

verificar-dispensas: ## dispensa de portao vencida reprova (secao 5.3)
	python3 infra/verificacao/verificar_dispensas.py

verificar-variaveis: ## as variaveis que o codigo exige, lidas do codigo, com autoteste
	npm run verify:variaveis

verificar-portabilidade: ## portao de portabilidade: provedor, hostname e as duas iscas
	python3 infra/verificacao/verificar_portabilidade.py

verificar-associacao: ## roda o monitor dos arquivos de deep link (secao 16.12)
	python3 infra/verificacao/verificar_associacao.py

verificar-limite: ## BICHUS-25: lint de limite de chamada, com as duas iscas do QA
	node infra/verificacao/verificar-limite-de-chamada.mjs api/openapi.yaml

verificar-contrato-publico: ## BICHUS-55: portao de contrato publico, iscas primeiro
	npm run build
	sh infra/verificacao/verificar-contrato-publico.sh api/openapi.yaml

verificar-borda: ## ADR-0016: x-edge-limits, prefixo e rota de /.well-known, por leitura
	python3 infra/verificacao/verificar_borda.py

verificar-borda-local: ## a borda de pe responde o que o contrato promete, pela porta publicada
	python3 infra/verificacao/verificar_borda_local.py $${PUBLIC_BASE_URL:-http://localhost:3000} .

verificar-docs-fechada: ## ADR-0018: a Swagger UI fechada, visto de fora (autoteste roda sem rede)
	python3 infra/verificacao/verificar_docs_fechada.py

# Tudo que nao precisa de nuvem nem de segredo, na ordem da esteira. E o que
# `make up` seguido de `make verificar` responde antes de abrir um PR.
verificar: verificar-dispensas verificar-variaveis verificar-portabilidade verificar-borda verificar-limite verificar-contrato-publico verificar-cobertura verificar-borda-local ## roda os portoes locais, na ordem da esteira

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
