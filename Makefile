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
#
# BICHUS-211: o PADRAO 3000/3001 nao servia numa maquina compartilhada. As duas
# sao as portas mais disputadas que existem, e na maquina onde este produto e
# desenvolvido as duas ja sao de outros projetos -- `make up` sem argumento
# morria em `port is already allocated`, uma mensagem do Docker que diz que a
# porta esta ocupada e NAO diz qual usar.
#
# A saida e `portas.local.mk`: gerado na primeira invocacao com o primeiro par
# livre, POR MAQUINA, fora do git. Depois de gerado o par nao muda mais entre
# execucoes -- e esse e o ponto. Procurar porta livre a cada subida faria o
# endereco variar, e o teste com segundo aparelho da secao 3.10 depende de o
# endereco que foi para o QR continuar valendo na subida seguinte.
#
# O `-include` precisa vir ANTES dos `?=` abaixo: quem define primeiro ganha.
# E o alvo logo abaixo do include nao e enfeite -- quando o arquivo nao existe,
# o GNU Make o constroi e RECOMECA a leitura do Makefile sozinho, entao a
# primeira invocacao ja enxerga o par escolhido.
PORTAS_LOCAIS := portas.local.mk
-include $(PORTAS_LOCAIS)

$(PORTAS_LOCAIS):
	@python3 infra/escolher-portas.py --escrever $@

HOST ?=
PORTA ?= 3000
PORTA_MIDIA ?= 3001

export PORTA_APP := $(PORTA)
export PORTA_MIDIA

BASE_HOST := $(if $(HOST),$(HOST),localhost)
# Sem nada trocado, as cinco URLs vem do `.env` -- e o que deixa a maquina de
# homologacao subir com os enderecos `https://` dela em vez de `localhost`.
# Trocado qualquer um dos tres, o Makefile passa a mandar nas cinco JUNTAS.
#
# `PORTA_MIDIA` estava fora desta condicao ate 22/09, e a falta dela era um
# buraco real: `make up PORTA_MIDIA=4001` publicava a 4001 e deixava
# MEDIA_PUBLIC_BASE_URL na 3001 do `.env`, sem nada acusar. E exatamente o
# defeito que `make verificar-portas` reprova agora.
ifneq ($(HOST)-$(PORTA)-$(PORTA_MIDIA),-3000-3001)
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

# ---------------------------------------------------------------------------
# BUILD_COMMIT (absorcao da BICHUS-210, que mexeu no Dockerfile e nao aqui).
#
# Desde a 210 o commit entra por `ARG BUILD_COMMIT` e o build REPROVA quando
# ele falta ou nao tem forma de commit. O `compose.yaml` repassa
# `${BUILD_COMMIT:-}` como argumento de build, com padrao vazio de proposito:
# a interpolacao acontece ao LER o arquivo, entao `:?` derrubaria tambem
# `down`, `logs` e `config`, que nao constroem nada. Quem precisa reprovar e o
# build. Falta alguem POR o valor, e esse alguem e este Makefile.
#
# `:=` e nao `?=`, e a diferenca nao e de desempenho. `?=` cria variavel de
# expansao RECURSIVA: o `$(shell)` roda de novo a cada referencia, e como a
# variavel e exportada, isso e um `git rev-parse` por linha de receita e por
# sub-make. O problema real nao e o fork, e que o valor pode MUDAR no meio de
# uma invocacao -- basta alguem commitar enquanto `make up` roda -- e os tres
# alvos (dev, api, migrador) sairiam com commits diferentes do mesmo `make up`.
# Uma subida estampa UM commit, e so expansao simples promete isso.
#
# O `ifeq` no lugar de `?=` porque `?=` considera definida a variavel que veio
# VAZIA do ambiente (`BUILD_COMMIT= make up`), e ali cairiamos no vazio sem
# sonda. Quem passa valor de verdade pelo ambiente ou pela linha de comando
# continua mandando.
#
# Limite conhecido, escrito para nao virar surpresa: `git rev-parse HEAD` conta
# de onde a arvore SAIU, nao o que ela tem agora. Com arvore suja a imagem sai
# rotulada com o commit anterior. Em desenvolvimento a arvore esta suja quase
# sempre e alarmar a cada `make up` seria ruido; onde isso importa, a esteira
# compara o valor reportado com o commit construido (BICHUS-210).
ifeq ($(strip $(BUILD_COMMIT)),)
# `--verify` e nao `rev-parse HEAD` puro: em repositorio sem nenhum commit o
# segundo IMPRIME a string `HEAD` e sai com erro, e esse lixo viraria o valor
# exportado -- o Dockerfile o recusaria, mas por acaso, e `down` e `logs`
# passariam a carregar um BUILD_COMMIT=HEAD no ambiente sem motivo.
BUILD_COMMIT := $(shell git rev-parse --verify HEAD 2>/dev/null)
endif
export BUILD_COMMIT

# A FORMA exigida. A autoridade e o Dockerfile (BICHUS-210), que reprova o
# build com este mesmo criterio; a conferencia daqui nao aprova nada, ela so
# troca a mensagem do Docker pela nossa antes de o build comecar -- mesmo
# padrao da pre-checagem de portas. As duas precisam andar juntas: afrouxar
# aqui nao afrouxa la, mas apertar la sem apertar aqui devolve a mensagem ruim.
FORMA_DE_COMMIT := ^[0-9a-f]{7,40}$$

.DEFAULT_GOAL := ajuda
.PHONY: ajuda setup commit-de-build up portas down reset migrar migrar-baixo seed logs test test-int e2e cobertura verificar verificar-commit-de-build verificar-commit-de-build-autoteste verificar-variaveis verificar-portas verificar-portas-autoteste verificar-escolha-de-portas verificar-portabilidade verificar-associacao verificar-limite verificar-contrato-publico verificar-borda verificar-borda-local verificar-cobertura verificar-dispensas verificar-marcador-de-migracao verificar-boot-do-alvo-prod-autoteste verificar-docs-fechada apk verificar-apk-autoteste backup restore pin-digests

ajuda: ## lista os alvos
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[1m%-22s\033[0m %s\n", $$1, $$2}'

setup: ## prepara a maquina: ganchos de git e .env
	@git config core.hooksPath .githooks
	@chmod +x .githooks/* 2>/dev/null || true
	@test -f .env || { cp .env.example .env; echo "criado .env a partir do exemplo: PREENCHA os valores vazios"; }
	@echo "gancho de pre-push instalado por core.hooksPath (versionado, corrigivel por PR)"

commit-de-build: ## confere BUILD_COMMIT antes de o docker construir (BICHUS-210)
	@if printf '%s' '$(BUILD_COMMIT)' | grep -Eq '$(FORMA_DE_COMMIT)'; then exit 0; fi; \
	 echo "BUILD_COMMIT vazio ou sem forma de commit (veio '$(BUILD_COMMIT)')."; \
	 if git rev-parse --git-dir >/dev/null 2>&1; then \
	   echo "  Este diretorio E um repositorio git, mas \`git rev-parse HEAD\` nao devolveu commit."; \
	   echo "  Provavel: repositorio sem nenhum commit ainda, ou HEAD apontando para lugar nenhum."; \
	 else \
	   echo "  Este diretorio NAO e um repositorio git (tarball, copia, ou .git removido)."; \
	 fi; \
	 echo "  Desde a BICHUS-210 o commit e gravado DENTRO da imagem e o build reprova sem ele:"; \
	 echo "  binario que nao sabe de onde veio responde \`status: ok\` igual ao que sabe, e ai"; \
	 echo "  um servico rodando codigo antigo e indistinguivel de um rodando o novo."; \
	 echo "  Saida certa: construa de um checkout do git."; \
	 echo "  Nao invente um valor -- SHA falso engana pior que o nulo, porque a sonda passa a"; \
	 echo "  AFIRMAR em vez de calar, e a esteira compara o reportado com o commit construido."; \
	 exit 1

up: setup commit-de-build ## sobe dev, aplicando as migracoes. HOST=<ip> para servir na rede local
	@$(MAKE) --no-print-directory verificar-portas
	@python3 infra/escolher-portas.py --conferir $(PORTA) $(PORTA_MIDIA)
	$(COMPOSE) --profile dev up -d --wait
	@echo "migracoes: aplicadas pelo servico \`migracao\` antes da api subir (docker compose logs migracao)"
	@echo "aplicacao: $${PUBLIC_BASE_URL:-http://localhost:$(PORTA)}"
	@echo "midia:     $${MEDIA_PUBLIC_BASE_URL:-http://localhost:$(PORTA_MIDIA)}"
	@echo "e-mail:    http://localhost:8025 (Mailpit; NAO prova entregabilidade)"

portas: ## reescolhe o par de portas desta maquina e regrava portas.local.mk
	@python3 infra/escolher-portas.py --escrever $(PORTAS_LOCAIS)

down: ## derruba preservando volume
	$(COMPOSE) --profile dev --profile qa down

reset: ## derruba APAGANDO volume e sobe do zero. Prova a migracao em banco vazio
	@if [ "$$ENVIRONMENT" = "homolog" ]; then echo "recusado: reset no perfil de homologacao apaga a massa de teste"; exit 1; fi
	$(COMPOSE) --profile dev --profile qa down -v
	$(MAKE) up

migrar: commit-de-build ## aplica as migracoes pendentes no banco de pe (idempotente)
	$(COMPOSE) up -d --wait db
	$(COMPOSE) run --rm migracao up

migrar-baixo: ## desfaz a ultima migracao. Prova que o `down` existe e roda
	$(COMPOSE) run --rm migracao down 1

seed: commit-de-build ## recria a massa fixa de qa, deterministica
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
test: commit-de-build ## testes unitarios (so na arvore principal; de worktree use `npm test`)
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
test-int: commit-de-build ## sobe uma pilha efemera propria, migra do zero e roda a integracao
	npm run test:integration

e2e: commit-de-build ## Cypress contra o ambiente de qa
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

verificar-marcador-de-migracao: ## BICHUS-125: a descida nao roda junto com a subida, com as cinco iscas
	node infra/verificacao/verificar-marcador-de-migracao.mjs migrations

verificar-boot-do-alvo-prod-autoteste: ## BICHUS-213: as iscas do juizo da morte do alvo prod reprovam
	python3 infra/verificacao/verificar_boot_do_alvo_prod.py --autoteste

verificar-variaveis: ## as variaveis que o codigo exige, lidas do codigo, com autoteste
	npm run verify:variaveis

verificar-portas: ## BICHUS-211: porta publicada e URL base de acordo, pela config renderizada
	@python3 infra/verificacao/verificar_portas.py --raiz .

verificar-portas-autoteste: ## as iscas do portao de portas precisam reprovar (nao usa docker)
	python3 infra/verificacao/verificar_portas.py --autoteste --raiz .

verificar-escolha-de-portas: ## BICHUS-211: havendo par livre, `make up` sem argumento nao cai no bind
	python3 infra/verificacao/verificar_escolha_de_portas.py --raiz .

verificar-commit-de-build: ## BICHUS-210/211: o `make` exporta BUILD_COMMIT com forma de commit
	python3 infra/verificacao/verificar_commit_de_build.py --raiz .

verificar-commit-de-build-autoteste: ## BICHUS-216: cada caso do portao do commit reprova pela regra dele (nao usa docker)
	python3 infra/verificacao/verificar_commit_de_build.py --autoteste --raiz .

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
	python3 infra/verificacao/verificar_borda_local.py $${PUBLIC_BASE_URL:-http://localhost:$(PORTA)} .

verificar-docs-fechada: ## ADR-0018: a Swagger UI fechada, visto de fora (autoteste roda sem rede)
	python3 infra/verificacao/verificar_docs_fechada.py

apk: ## compila o APK de release de hml e confere o que saiu (o mesmo do job `apk` da esteira)
	sh infra/verificacao/verificar-apk.sh

verificar-apk-autoteste: ## as iscas da conferencia do APK precisam reprovar (nao compila nada)
	sh infra/verificacao/verificar-apk.sh --autoteste

# Tudo que nao precisa de nuvem nem de segredo, na ordem da esteira. E o que
# `make up` seguido de `make verificar` responde antes de abrir um PR.
#
# `apk` NAO entra nesta lista, e a ausencia e deliberada. Ele leva minutos e
# precisa da cadeia de ferramentas Android instalada, que nao e premissa desta
# maquina; alem disso `verificar-apk-autoteste` sozinho aqui daria a impressao
# errada de que o APK foi conferido quando so o conferidor foi. Quem quer a
# resposta de verdade roda `make apk`; quem nao roda, a esteira roda por ele.
verificar: verificar-dispensas verificar-marcador-de-migracao verificar-boot-do-alvo-prod-autoteste verificar-commit-de-build-autoteste verificar-commit-de-build verificar-variaveis verificar-portas-autoteste verificar-escolha-de-portas verificar-portas verificar-portabilidade verificar-borda verificar-limite verificar-contrato-publico verificar-cobertura verificar-borda-local ## roda os portoes locais, na ordem da esteira

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
