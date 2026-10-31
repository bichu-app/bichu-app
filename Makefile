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
.PHONY: verificar-tipos verificar-lint verificar-lint-do-painel verificar-lint-do-site verificar-passos-condicionais verificar-consulta-externa verificar-veredito-do-sonar-autoteste verificar-busca-do-veredito-autoteste verificar-suite-unitaria-autoteste verificar-suite-integracao-autoteste verificar-teste-fora-do-alcance-autoteste verificar-teste-fora-do-alcance verificar-colunas-que-nao-saem verificar-quebras-de-contrato-autoteste verificar-destinos verificar-armazenamento-por-destino verificar-boot-do-alvo-prod verificar-numero-de-adr verificar-numero-de-adr-autoteste verificar-carimbo-de-migracao verificar-carimbo-de-migracao-autoteste ajuda setup commit-de-build up portas down reset migrar migrar-baixo seed logs test test-int e2e cobertura verificar verificar-commit-de-build verificar-commit-de-build-autoteste verificar-variaveis verificar-portas verificar-portas-autoteste verificar-escolha-de-portas verificar-portabilidade verificar-associacao verificar-limite verificar-contrato-publico verificar-borda verificar-borda-local verificar-cobertura verificar-dispensas verificar-marcador-de-migracao verificar-boot-do-alvo-prod-autoteste verificar-docs-fechada verificar-manifesto-do-aplicativo verificar-manifesto-do-aplicativo-autoteste apk verificar-apk-autoteste verificar-subida-da-api verificar-subida-da-api-autoteste verificar-app verificar-tokens-gerados verificar-tokens-gerados-autoteste gerar-icones-da-barra fechar-integracao carimbar-fechamento verificar-recibo-de-fechamento-autoteste backup restore pin-digests livro repetir-integracao verificar-sorteio verificar-livro verificar-tokens-web verificar-site verificar-conformidade-do-app verificar-conformidade-do-app-autoteste verificar-segredos-do-gerenciador verificar-segredos-do-gerenciador-autoteste

ajuda: ## lista os alvos
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[1m%-22s\033[0m %s\n", $$1, $$2}'

setup: ## prepara a maquina: ganchos de git e .env
# `core.hooksPath` ABSOLUTO, apontando para o checkout principal. Relativo, que
# era o que estava aqui, o git resolve a partir da raiz de CADA worktree: o
# gancho so valia onde a branch ja continha o arquivo, e worktree em branch
# antiga ficava sem protecao nenhuma sem nenhum sinal. Medido, nao deduzido:
# `infra/verificacao/verificar-alcance-dos-ganchos.sh`.
#
# O preco e que o checkout principal vira FONTE UNICA: deixar a arvore
# principal numa branch antiga troca os ganchos de todo mundo de uma vez.
# O README diz o que fazer quando isso acontecer.
	@raiz="$$(dirname "$$(git rev-parse --path-format=absolute --git-common-dir)")"; \
	 if [ ! -d "$$raiz/.githooks" ]; then \
	   echo "make setup: nao achei '$$raiz/.githooks'."; \
	   echo "  O checkout principal e a fonte dos ganchos. Se ele esta numa branch"; \
	   echo "  que nao tem essa pasta, ninguem fica protegido. Recusando em vez de"; \
	   echo "  configurar um caminho que nao existe."; \
	   exit 1; \
	 fi; \
	 git config core.hooksPath "$$raiz/.githooks"; \
	 chmod +x "$$raiz"/.githooks/* 2>/dev/null || true; \
	 echo "ganchos ligados em $$raiz/.githooks"; \
	 echo "  caminho absoluto: vale em todos os worktrees, inclusive em branch antiga"
	@test -f .env || { cp .env.example .env; echo "criado .env a partir do exemplo: PREENCHA os valores vazios"; }

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
# `ferramentas` E NAO `api`, PELO MESMO MOTIVO DA ESTEIRA (23/09): `npm test`
# COMPILA antes de rodar caso nenhum (`tsc -p tsconfig.json --outDir
# dist/_tests`), e a `api` tem `mem_limit: 320m` -- teto de RUNTIME. Medido: o
# compilador estoura o grupo de controle e morre com "Killed", saida 137, sem
# um caso executado. Este alvo nunca acusou porque quase ninguem o roda da
# arvore principal; a esteira acusou pelo caminho gemeo, o da integracao.
# O servico `ferramentas` e o mesmo artefato com teto proprio (compose.yaml).
	$(COMPOSE) run --rm ferramentas npm test

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
# de abrir PR.
#
# ERA UMA COPIA do comando, com o curinga ENTRE ASPAS entregue ao runner --
# exatamente a forma que a BICHUS-219 tirou do `package.json` porque padrao que
# nao casa nada sai `# tests 0` e codigo de saida zero. A copia sobreviveu aqui
# e teria medido outra coisa que a esteira. Agora chama o MESMO executor, com a
# mesma bandeira: uma forma so.
#
# `--enable-source-maps` nao e opcional, e mora dentro do executor: sem ela o
# lcov aponta para o JavaScript de `dist/`, o Sonar nao casa nada e publica 0%
# sem reclamar.
cobertura: ## gera coverage/lcov.info (unitaria) no formato que o SonarCloud le
	@mkdir -p coverage
	npm test -- --lcov coverage/lcov.info

# A OUTRA METADE. Sobe a pilha efemera, porque a suite de integracao precisa de
# banco, e escreve `coverage/lcov-integracao.info` no proprio worktree (a arvore
# esta montada em `/app`). Sem ela, 40 arquivos de producao de `src` nao
# aparecem em relatorio nenhum -- e sem dado, para o Sonar, e 0%.
cobertura-integracao: ## gera coverage/lcov-integracao.info subindo a pilha efemera
	@mkdir -p coverage
	npm run test:integration -- --lcov coverage/lcov-integracao.info

verificar-cobertura: cobertura cobertura-integracao ## os dois lcov falam de src/**/*.ts, e de TODOS eles? Com as cinco iscas
	node infra/verificacao/verificar-cobertura-lcov.mjs \
	  coverage/lcov.info coverage/lcov-integracao.info

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

verificar-portabilidade: ## portao de portabilidade: provedor, hostname, migracao e as iscas (positivas e negativas)
	python3 infra/verificacao/verificar_portabilidade.py

verificar-sorteio: ## recusa assercao de tolerancia zero sobre quantidade sorteada, iscas primeiro
	node infra/verificacao/verificar-sorteio-sem-semente.mjs

verificar-livro: ## as iscas do livro dos casos que piscam: o que reprova e depois passa CONTINUA na lista
	node infra/suite/acumular-reprovados.mjs --autoteste

livro: ## mostra o acumulado local de casos que ja reprovaram
	@node infra/suite/acumular-reprovados.mjs render --livro .livro/integracao.jsonl --suite integracao

# Nao entra em `verificar`, e a ausencia e deliberada: sao 20 pilhas efemeras,
# cerca de 8 minutos nesta maquina. Na esteira quem roda isto e
# `.github/workflows/repeticao.yml`, agendado, fora do caminho critico. Aqui o
# alvo existe para quem esta cacando uma intermitencia e quer a resposta agora.
repetir-integracao: commit-de-build ## 20 execucoes seguidas da integracao, alimentando o livro (VEZES=20)
	node infra/integracao/repetir.mjs --vezes $${VEZES:-20} --livro .livro/integracao.jsonl --rotulo "local"

verificar-associacao: ## roda o monitor dos arquivos de deep link (secao 16.12)
	python3 infra/verificacao/verificar_associacao.py

# O portao que so a esteira tinha, e que por isso deixou passar.
#
# POR QUE ELE ESTA AQUI E NAO SO NO `ci.yml`
#
# Em 22/09/2026 o commit 351ae0f acrescentou duas respostas `400` a
# `api/openapi.yaml` e nao rodou `npm run generate:types`.
# `make fechar-integracao` ficou VERDE com a divergencia de pe, porque a
# conferencia existia em UM lugar so: `.github/workflows/ci.yml`, passo `tipos
# gerados batem com a spec` do job `lint, tipos e teste unitario`. A divergencia
# atravessou o fechamento local inteiro e so morreu na esteira, depois do push.
#
# POR QUE EM `verificar` E NAO EM `fechar-integracao`
#
# O criterio da casa e custo, e ja foi aplicado duas vezes: `apk` ficou fora de
# `verificar` porque leva minutos e exige a cadeia Android;
# `verificar-subida-da-api` ficou fora porque sobe docker e custa 15-27 s. Os
# dois moram no fechamento por isso.
#
# MEDIDO NESTE WORKTREE, com `/usr/bin/time -p`, Node 22.23.2:
#
#   npm run verify:types (geracao + comparacao)                1,06 s
#   npm run lint                                               8,57 s
#   npm run typecheck                                          2,28 s
#
# Ele nao sobe nada, nao le rede e nao encosta em docker. Contra os 0,22 s que a
# nota do `fechar-integracao` usou para justificar o que entrou no laco de quem
# desenvolve, 1,06 s e a mesma ordem de grandeza. Entao ele vai para `verificar`,
# que e o portao que roda MAIS VEZES -- e portao de divergencia so serve se
# rodar antes de a divergencia viajar.
#
# POR QUE NAO E `npm run verify:types`, QUE JA EXISTIA NO `package.json`
#
# Porque `verify:types` termina em `git diff --exit-code`, e isso responde a
# pergunta da ESTEIRA (arvore limpa no commit), nao a daqui. Medido: com a spec
# adiantada e os tipos JA REGERADOS -- o estado correto de quem acabou de mexer
# no contrato e ainda nao commitou -- `npm run verify:types` continua saindo 1.
# Portao que reprova o fluxo correto e portao que vai ser desligado.
#
# `infra/verificacao/verificar-tipos-gerados.mjs` pergunta outra coisa, que nao
# depende do git: gerar de novo muda algum arquivo? Se muda, o que estava em
# disco estava velho. Vale com a arvore limpa ou suja. As iscas estao no proprio
# script (`--autoteste`), como nos vizinhos.
verificar-tipos-gerados-autoteste: ## as iscas do portao dos tipos gerados reprovam (nao gera nada)
	node infra/verificacao/verificar-tipos-gerados.mjs --autoteste

# --------------------------------------------------------------------------
# O PORTAO DE NUMERO DE ADR (23/09/2026)
#
# Em 23/09 duas ADRs nasceram com o numero 0024 em branches diferentes, uma
# sobre a Loja e outra sobre privacidade da Rede, e NENHUM dos dois autores
# sabia do outro. O git nao acusa: nomes de arquivo diferentes nao conflitam,
# entao o merge junta os dois em silencio. So apareceu porque alguem foi olhar,
# e o conserto custou cerca de 55 referencias trocadas linha a linha.
#
# POR QUE EM `verificar` E NAO EM `fechar-integracao`
#
# Pelo criterio de custo da casa, medido neste worktree: 0,06 s, cinco medicoes,
# `real` entre 0,06 e 0,07. Ele le 24 nomes de arquivo e nao abre nenhum deles;
# nao usa docker, nao usa rede e nao depende de `npm ci`. `verificar-subida-da-api`
# ficou em `fechar-integracao` porque sobe docker e custa 15-27 s;
# `verificar-tipos-gerados` entrou em `verificar` com 1,06 s. Este e DEZESSETE
# VEZES mais barato que o dos tipos, entao entra no mesmo lugar, e primeiro na
# lista: o check mais rapido roda antes.
#
# POR QUE ELE NAO PERGUNTA NADA AO GIT
#
# Porque a pergunta e sobre o CONTEUDO de `adr/`, e nao sobre o estado do git.
# O portao dos tipos custou uma iteracao para aprender isso: a primeira versao
# terminava em `git diff --exit-code` e reprovava quem tinha feito tudo certo e
# ainda nao commitado. Aqui seria pior, porque a colisao NASCE num arquivo
# recem-criado e ainda nao rastreado -- o unico instante em que renumerar e
# barato e justamente aquele em que o git nao tem o que mostrar. Este alvo vale
# com a arvore limpa ou suja.
#
# O QUE ELE NAO FAZ: buraco na numeracao nao reprova. Numero reservado numa
# branch que ainda nao mesclou deixa buraco legitimo em toda branch vizinha, e
# reprovar nisso seria reprovar o fluxo normal do repositorio. Ele imprime o
# buraco como nota.
verificar-numero-de-adr-autoteste: ## as iscas do portao de numero de ADR reprovam (nao le adr/)
	node infra/verificacao/verificar-numero-de-adr.mjs --autoteste

verificar-numero-de-adr: ## dois arquivos de adr/ com o mesmo numero reprovam, nomeando os dois (0,06 s)
	node infra/verificacao/verificar-numero-de-adr.mjs

# CARIMBO DE MIGRACAO REPETIDO (23/09/2026). O irmao do de cima, e o caso GRAVE
# da familia: ADR repetida confunde quem le, migracao repetida QUEBRA O BANCO.
#
# Em 23/09 cinco migracoes nasceram com `20260923000001` em cinco branches de
# tres sessoes que nao se enxergam. E a `development` ja carregava ONZE
# migracoes em quatro carimbos repetidos antes de alguem olhar.
#
# POR QUE E PIOR QUE A ADR, medido contra um Postgres 16 com o node-pg-migrate
# 9.0.0 que o `package.json` pina: num banco que ja aplicou UMA das irmas, o
# `migrate up` seguinte morre em `checkOrder` --
#   Error: Not run migration <a nova> is preceding already run migration <a antiga>
# saida 1, nada aplicado, e o banco travado para toda migracao futura.
# `checkOrder` e ligado por padrao, e o `compose.yaml` chama `migracao up` sem
# desliga-lo.
#
# A CONFERENCIA DE COLISAO nao pergunta nada ao git, pelo mesmo motivo do portao
# de ADR: a colisao nasce num arquivo recem-criado e ainda nao rastreado, que e
# o unico instante em que renumerar e barato.
#
# A CONFERENCIA DE ORDEM precisa do git, e nao tem como nao precisar: "carimbo
# anterior ao que ja existe" so tem sentido contra a ponta da linha de base. Ela
# usa a PONTA e nao o `merge-base`, porque o que trava um banco e o que a base ja
# carrega, e nao o ponto em que a branch saiu dela.
#
# O QUE ELE NAO FAZ: buraco na sequencia nao reprova, vira nota.
verificar-carimbo-de-migracao-autoteste: ## as iscas do portao de carimbo de migracao reprovam (nao le migrations/)
	node infra/verificacao/verificar-carimbo-de-migracao.mjs --autoteste

verificar-carimbo-de-migracao: ## dois arquivos de migrations/ com o mesmo carimbo reprovam, nomeando todos (0,21 s)
	node infra/verificacao/verificar-carimbo-de-migracao.mjs

# ---------------------------------------------------------------------------
# O BURACO QUE ESTE PORTAO FECHA
#
# Todo caminho que exercita migracao aqui migra DO ZERO: `reset`, `test-int`,
# `verificar-subida-da-api` e a esteira. Em 28/09 a 20260921000001 aplicou em
# banco vazio e MORREU com 23514 contra o banco de dev, que tem dado -- e levou
# `make up` e `make test` junto, porque os dois esperam
# `migracao: service_completed_successfully`.
#
# A prova em banco vazio nao vale para esta classe. Este alvo aplica as massas de
# `infra/migracao/massa/` no instante anterior a migracao de cada uma e segue
# dali, e confere o ESTADO FINAL por `.depois.sql` -- porque apagar o dado errado
# tambem sai 0.
verificar-migracao-em-banco-com-dado-autoteste: ## as iscas do plano das massas reprovam (nao usa docker)
	node infra/verificacao/verificar-migracao-em-banco-com-dado.mjs --autoteste

verificar-migracao-em-banco-com-dado: commit-de-build ## a migracao aplica sobre DADO preexistente, nao so em banco vazio (pilha efemera)
	node infra/verificacao/verificar-migracao-em-banco-com-dado.mjs

verificar-tipos-gerados: ## o gerado de src/shared/types/generated/ bate com api/openapi.yaml (1,06 s)
	node infra/verificacao/verificar-tipos-gerados.mjs

verificar-limite: ## BICHUS-25: lint de limite de chamada, com as duas iscas do QA
	node infra/verificacao/verificar-limite-de-chamada.mjs api/openapi.yaml

verificar-contrato-publico: ## BICHUS-55: portao de contrato publico, iscas primeiro
	npm run build
	sh infra/verificacao/verificar-contrato-publico.sh api/openapi.yaml

verificar-rastreabilidade: ## ADR-0027 item 18: a matriz tela -> contrato concorda com api/openapi.yaml, isca primeiro
	npm run build
	node dist/tools/portao-rastreabilidade.js

verificar-borda: ## ADR-0016: x-edge-limits, prefixo, rota de /.well-known e `/v1/admin*` so no host admin, por leitura
	python3 infra/verificacao/verificar_borda.py

# O BACKOFFICE (`admin/`, ADR-0027). Duas metades, pelo mesmo motivo das outras
# do repositorio: o autoteste da sonda roda em `make verificar` porque nao usa
# docker nem rede e leva menos de um segundo; a verificacao inteira (imagem,
# iscas de build, pilha ISOLADA e a sonda pela borda) sobe containers e fica
# fora de `verificar`, como `verificar-subida-da-api`. E o MESMO script do job
# `admin` da esteira. Nao toca a pilha `bichu` de quem esta desenvolvendo: o
# projeto e outro, e nenhuma porta e publicada.
verificar-backoffice-autoteste: ## as iscas da sonda do backoffice e do orcamento do painel reprovam (nao usa docker)
	node infra/verificacao/verificar-backoffice-na-borda.mjs --autoteste
	node infra/verificacao/verificar-orcamento-do-admin.mjs --autoteste

# O CONTRATO DO BACKOFFICE, 28/10/2026. Ele estava fora do alcance de TODO
# portao local, e isso foi medido e nao suposto: `grep -n "cd admin" Makefile`
# nao devolvia linha nenhuma. O `verificar-tipos-gerados` da raiz le SO
# `src/shared/types/generated/` (a constante `DESTINO` do script), e o
# `verificar-site` roda o do `web/` -- o do `admin/` nao era conferido por
# ninguem fora do job `admin` da esteira.
#
# E A ESTEIRA SO RODA EM PR. Entao a copia do backoffice podia divergir do
# contrato e envelhecer na `development` sem NADA acusar localmente, ate alguem
# abrir um PR que a tocasse. O trio de arquivos gerados e o MESMO blob hoje
# (md5 igual nos tres), e e justamente por isso que a divergencia passaria
# desapercebida: ninguem olha o que acredita ser copia fiel.
#
# Custa ~1 s. Fica DENTRO de `verificar` de proposito: portao que mora fora do
# agregador e portao que ninguem roda.
verificar-backoffice-contrato: ## o tipo gerado do painel confere com `api/openapi.yaml` (~1 s)
	cd admin && npm run verify:api

verificar-backoffice: commit-de-build ## ADR-0027: imagem do admin-web, iscas de build, pilha isolada e sonda D33/D34/D41/D48 (~35 s)
	bash infra/verificacao/verificar-backoffice.sh

verificar-borda-local: ## a borda de pe responde o que o contrato promete, pela porta publicada
	python3 infra/verificacao/verificar_borda_local.py $${PUBLIC_BASE_URL:-http://localhost:$(PORTA)} .

verificar-docs-fechada: ## ADR-0018: a Swagger UI fechada, visto de fora (autoteste roda sem rede)
	python3 infra/verificacao/verificar_docs_fechada.py

verificar-manifesto-do-aplicativo-autoteste: ## as iscas do portao de boa-formacao reprovam (nao le app/)
	python3 infra/verificacao/verificar_manifesto_android.py --autoteste

# 50 ms medidos para os 17 arquivos, sem Gradle, sem JDK e sem SDK do Android.
# E por isso que ele cabe no laco de quem desenvolve e no job `rapidos`, ao
# lado das outras iscas, e nao no estagio caro.
#
# Ele existe porque a MESMA classe derrubou o build do Android duas vezes em
# dois dias (86499cb em 21/09, c0cd002 em 22/09): `--` dentro de comentario XML,
# que a especificacao proibe e o mesclador de manifesto do Gradle recusa. Nas
# duas vezes a suite ficou verde, porque `flutter analyze` e `flutter test`
# rodam na maquina virtual do Dart e nunca tocam no Gradle.
#
# O QUE ELE NAO COBRE: conflito de merge com o manifesto das bibliotecas,
# placeholder (`$${applicationName}`), `package`/`minSdk`/`targetSdk` que o AGP
# injeta, e regra de esquema do Android. Nada disso e boa-formacao, e nada disso
# se ve sem o Gradle. Quem pega essa metade e `make apk`, que roda no
# `fechar-integracao` e no job `apk` -- nao aqui.
verificar-manifesto-do-aplicativo: ## o XML que o build do aplicativo le esta bem formado (50 ms)
	python3 infra/verificacao/verificar_manifesto_android.py --raiz .

# `verificar-apk-autoteste` COMO PRE-REQUISITO, e nao ao lado: ate 28/09 o
# alvo das iscas existia fora dos dois agregadores, entao o fechamento rodava o
# conferidor do APK SEM as iscas que impedem ele de aprovar lixo -- um portao
# cego, do mesmo tipo que `verificar-app` ja evita com as iscas dos tokens.
#
# DESDE 19/10/2026 ESTES DOIS ALVOS COBRAM MAIS, e nao precisaram mudar de
# linha de comando para isso: as tres conferencias moram dentro do script, num
# lugar so, que e o mesmo motivo pelo qual as `--dart-define` moram la. O que
# entrou foi (1) a VERSAO DO APP no comando de build, tirada do `version:` de
# `app/pubspec.yaml` -- a mesma fonte do `versionName` -- e alimentando
# `--build-name` E `--dart-define=APP_VERSION` da MESMA variavel; (2) a
# conferencia do VALOR das defines DENTRO do `libapp.so` do pacote
# (`infra/verificacao/verificar_versao_no_apk.py`); e (3) o portao de
# literalidade do comando, que reprova define passado por variavel de shell.
#
# O que isso fecha: ate 19/10 `make apk` saia 0 com o APK sem `APP_VERSION`
# dentro -- MEDIDO, a versao aparecia zero vezes nos tres `libapp.so` -- e o
# bloqueio por versao minima inteiro ficava inerte em silencio.
apk: verificar-apk-autoteste ## compila o APK de release de hml, confere o pacote e o VALOR das dart-define dentro dele
	sh infra/verificacao/verificar-apk.sh

verificar-apk-autoteste: ## as iscas das tres conferencias do APK (pacote, valor das defines, literalidade do comando) precisam reprovar (nao compila nada)
	sh infra/verificacao/verificar-apk.sh --autoteste

# ---------------------------------------------------------------------------
# OS PORTOES QUE SO EXISTIAM NA ESTEIRA (28/09/2026)
#
# O cliente decidiu NAO contratar o GitHub Actions. A esteira nao roda e nao vai
# voltar a rodar por decisao, e `make fechar-integracao` local passou a ser o
# unico portao que existe. Tudo que morava so em `.github/workflows/ci.yml`
# deixou de ser conferido no dia em que a cobranca parou -- e nada acusou, porque
# a esteira parada nao reprova: ela fica `skipped`.
#
# ESTE BLOCO TRAZ O QUE E BARATO E NAO PEDE REDE NEM SEGREDO. Medido nesta
# maquina com `/usr/bin/time -p`, Node 22, Python 3:
#
#   npm run typecheck (tsc --noEmit)                            2,79 s
#   npm run lint      (eslint .)                   590 arquivos, ver abaixo
#   verificar_passos_condicionais.py                            0,07 s
#   verificar_consulta_externa.py                               0,05 s
#   verificar_veredito_do_sonar.py --autoteste                  0,04 s
#   verificar_quebras_de_contrato.py --autoteste                0,02 s
#   executar-unitaria.mjs --autoteste                           0,13 s
#   verificar-colunas-que-nao-saem.sh .                         0,37 s
#   comparar-destinos.js                                        0,07 s
#   buscar_veredito_do_sonar.py --autoteste                     3,64 s
#   verificar-boot-do-alvo-prod-local.sh (quente / frio)   2,89 / 32 s
#
# O CRITERIO DE ONDE CADA UM MORA E O DA CASA, E ELE E CUSTO: o que cabe no laco
# de quem desenvolve vai para `verificar`; o que sobe docker ou leva segundos vai
# para `fechar-integracao`, ao lado de `verificar-subida-da-api` (15-27 s) e do
# `apk`. Os dois ultimos da tabela ficaram no fechamento por isso, e so por isso.
#
# O QUE NAO VEIO, dito aqui e nao so na entrega:
#
# - `npx --yes @stoplight/spectral-cli@6.15.0` (1,44 s na esteira). Spectral NAO
#   e dependencia declarada deste projeto: o `npx --yes` PUXA DA REDE a cada
#   execucao. Trazer o portao exige acrescentar `devDependency`, e isso nao e
#   decisao de quem opera a esteira. Fica registrado como o buraco que e.
# - `npm run verify:types` (0,75 s). Ele termina em `git diff --exit-code`, que
#   responde a pergunta da esteira (o gerado esta commitado) e REPROVA o estado
#   correto de quem regerou e ainda nao commitou. `verificar-tipos-gerados`, que
#   ja esta em `verificar`, pergunta o que importa aqui e nao depende do git.
#   Duplicar seria trocar um portao melhor por um pior com dois nomes.
# - `npm run verify:isolamento-da-pilha`. Ele NAO entra em alvo nenhum:
#   `infra/integracao/isca-de-isolamento.mjs:271` roda `git worktree prune` na
#   raiz, dentro de `limpar()`, tambem ligada a `SIGINT`. Isso apaga a
#   administracao de worktree das outras sessoes deste repositorio, e ja apagou.
#   Ele e da esteira, que roda em runner descartavel, e continua sendo so dela.
# - varredura de segredo (`gitleaks/gitleaks-action@v2`, ci.yml linha 346). E
#   acao do GitHub e nao existe em lugar nenhum aqui: `gitleaks` nao esta
#   instalado, nao ha alvo, nao ha gancho. NAO CONSERTADO de proposito: instalar
#   ferramenta e decisao do cliente. O tamanho do buraco esta na entrega.

verificar-tipos: ## `tsc --noEmit` sobre a arvore inteira (2,79 s)
	npm run typecheck

# ESLINT NAO EXISTIA EM ALVO NENHUM, e era o achado mais grave da varredura de
# 28/09: `npm run lint` vivia so no `ci.yml`, e `eslint.config.mjs` tem DUAS
# regras proprias -- `arquitetura/fronteira-de-modulo` e
# `arquitetura/marca-so-pela-porta` -- que ninguem exercitava desde que a esteira
# parou. Medido EM 28/09: 590 arquivos lintados, zero mensagens (hoje sao 845 --
# a contagem abaixo e a de agora). Lint que nao acha arquivo
# aprova tudo calado, e por isso o numero de arquivos esta escrito aqui.
#
# ELE NAO REPROVA ARVORE SUJA LEGITIMA, e isso foi conferido: o `eslint` nao
# consulta o git. Medido com a arvore suja (arquivo modificado mais arquivo NAO
# rastreado) -- saida 0, e o arquivo nao rastreado foi lintado junto. E a
# diferenca que custou uma iteracao no portao dos tipos gerados, onde a forma da
# esteira (`git diff --exit-code`) reprovava quem tinha regerado e nao commitado.
#
# O ALVO COBRIA 845 ARQUIVOS E DIZIA 590, E NAO COBRIA O PAINEL DE JEITO NENHUM.
#
# `eslint.config.mjs` ignora `admin/**` DE PROPOSITO, e o motivo esta escrito la:
# o painel tem `package.json`, `tsconfig` e `eslint.config.mjs` proprios, e o
# servico de projeto da raiz nao conhece o tsconfig dele -- o parser morreria
# antes de qualquer regra. A exclusao esta certa. O que estava errado era o
# SILENCIO: o alvo se anunciava como "ESLint" e saia 0 com erro real dentro de
# `admin/`, e quem mexe no painel lia esse verde como "o diff esta limpo".
#
# Medido com `console.log` plantado em `admin/src/config.ts`:
#
#   `eslint .` na raiz                 exit 0, zero mensagens
#   `npx eslint admin/src/config.ts`   exit 0 -- "File ignored because of a
#                                      matching ignore pattern" e WARNING
#   `cd admin && npm run lint`         exit 1, `no-console` nomeando o arquivo
#
# Um portao que precisa que o nome do arquivo seja digitado a mao para acusar
# nao e portao. A esteira cobria (o job do backoffice roda o lint de la), entao
# isto nunca foi buraco de esteira -- era armadilha de confianca local, e as
# armadilhas locais sao as que fazem alguem abrir PR achando que mediu.
#
# O CONSERTO E RODAR OS DOIS, e isso foi medido antes de ser escrito: sao dois
# PROCESSOS de eslint, cada um com a raiz de tsconfig dele (`tsconfigRootDir`
# aponta para o diretorio do proprio config), e por isso o parser nao morre --
# o que morreria e um unico `eslint .` tentando cobrir as duas arvores com o
# servico de projeto da raiz. Raiz 19,4 s + painel 8,1 s, medidos.
#
# 31/10: O SITE ERA O MESMO BURACO, E ESTAVA ESCRITO COMO DIVIDA no proprio
# `eslint.config.mjs` ("DIVIDA: dar ao `web/` um eslint proprio depois; hoje ele
# nao tem lint dedicado"). `web/**` era ignorado aqui e NAO TINHA eslint em
# lugar nenhum -- nem config, nem `devDependency`, nem script, nem alvo. Medido
# com `console.log` plantado em `web/src/api/chamar.ts`, antes do conserto:
#
#   `eslint .` na raiz                 exit 0, ZERO mensagens
#   `npx eslint web/src/api/chamar.ts` exit 0 (o arquivo NOMEADO: "File ignored
#                                      because of a matching ignore pattern" e
#                                      WARNING)
#   `make verificar-lint`              exit 0
#
# Palavra por palavra o desfecho do painel. `verificar-lint-do-site` fecha, pela
# mesma forma: terceiro processo, terceira raiz de tsconfig.
#
# AS TRES CONTAGENS SAO DE ARVORE LIMPA, medidas em 31/10 neste worktree com
# `eslint . -f json` e as duas somas (arquivos lintados e mensagens):
#
#   raiz    847 arquivos, 0 mensagens   16,6 - 19,9 s
#   painel  143 arquivos, 0 mensagens    8,6 -  9,2 s
#   site     47 arquivos, 0 mensagens    2,0 s (inclui o `astro sync`)
#
# `make verificar-lint` inteiro: 27,0 s. A contagem da raiz subiu de 845 para
# 847 desde 30/10 porque a arvore cresceu -- e o numero esta escrito aqui
# porque LINT QUE NAO ACHA ARQUIVO APROVA TUDO CALADO.
verificar-lint: verificar-lint-do-painel verificar-lint-do-site ## ESLint da raiz (847 arquivos), do painel (143) e do site (47), tres processos; `workspace/**` fora do escopo
	npm run lint

# Separado para poder ser rodado sozinho por quem so mexeu no painel, e porque
# e ele que `verificar-lint` deixava de fora.
#
# A ausencia de `admin/node_modules` REPROVA nomeando a receita, em vez de sair
# 127 ("eslint: command not found") parecendo defeito de codigo. Mesma doutrina
# do portao de segredos: nao conseguir conferir nao e aprovacao.
verificar-lint-do-painel: ## ESLint do backoffice, com o tsconfig dele (143 arquivos; a raiz ignora `admin/**` e nao tem como lintar)
	@test -d admin/node_modules || { \
	  echo "admin/node_modules ausente: o lint do painel NAO RODOU. Rode \`cd admin && npm ci\`."; \
	  echo "Isto nao e aprovacao -- a raiz ignora \`admin/**\` e ninguem mais confere o painel aqui."; \
	  exit 1; }
	cd admin && npm run lint

# O MESMO, PARA O SITE (31/10/2026). `web/eslint.config.mjs` nasceu com este
# alvo: antes de hoje o site nao tinha lint em LUGAR NENHUM -- nao era so o
# agregado que o deixava de fora.
#
# 47 ARQUIVOS, E ELES NAO SAO OS 85 DA ARVORE: `.astro` fica fora, e a razao
# esta escrita em `web/eslint.config.mjs`. Em resumo: `eslint-plugin-astro`
# exige `eslint >= 10` e a raiz e o painel estao em 9. Os 37 `.astro` tem portao
# -- `astro check`, que ja roda em `verificar-site` e na esteira -- so nao tem
# regra de lint. A diferenca com `web/**` na raiz e exatamente essa: la nao
# havia portao nenhum.
#
# `npm run lint` do site e `astro sync && eslint .`, e o `astro sync` NAO E
# ENFEITE. Medido nos dois estados: sem `web/.astro/` (gerado, nunca
# versionado), `astro:middleware` nao resolve, `defineMiddleware` vira `any` e o
# lint cospe 9 erros de `no-unsafe-*` em `src/middleware.ts` que nao existem no
# codigo -- e, pelo outro lado, `any` engole as conferencias que as regras com
# tipo fariam ali. Com o sync: 47 arquivos, zero mensagens. Portao que mede a
# ausencia de um arquivo gerado nao esta medindo o codigo.
#
# A ausencia de `web/node_modules` REPROVA nomeando a receita, em vez de sair
# 127 ("eslint: command not found") parecendo defeito de codigo. Mesma doutrina
# do painel: nao conseguir conferir nao e aprovacao.
verificar-lint-do-site: ## ESLint do site, com o tsconfig dele (47 arquivos; a raiz ignora `web/**` e nao tem como lintar)
	@test -d web/node_modules || { \
	  echo "web/node_modules ausente: o lint do site NAO RODOU. Rode \`cd web && npm ci\`."; \
	  echo "Isto nao e aprovacao -- a raiz ignora \`web/**\` e ninguem mais confere o site aqui."; \
	  exit 1; }
	cd web && npm run lint

verificar-passos-condicionais: ## nenhum passo de workflow e pulado por premissa do proprio job, iscas dentro (0,07 s)
	python3 infra/verificacao/verificar_passos_condicionais.py

verificar-consulta-externa: ## nenhum passo trata "nao consegui perguntar" como resposta, iscas dentro (0,05 s)
	python3 infra/verificacao/verificar_consulta_externa.py

verificar-veredito-do-sonar-autoteste: ## as iscas do juizo do veredito do SonarCloud reprovam (0,04 s)
	python3 infra/verificacao/verificar_veredito_do_sonar.py --autoteste

# 3,64 s medidos, e o motivo esta no proprio script: ele sobe oito SonarCloud de
# mentira em 127.0.0.1, um por caso. Nao ha rede e nao ha docker, mas e o item
# mais caro do grupo -- por isso ele mora no fechamento e nao no laco.
verificar-busca-do-veredito-autoteste: ## as iscas da traducao HTTP->envelope do veredito reprovam (3,64 s, sem rede)
	python3 infra/verificacao/buscar_veredito_do_sonar.py --autoteste

# O DEFEITO QUE ELE GUARDA E `# tests 0` COM SAIDA 0: suite que nao roda nada
# aprova, e o total de testes e o numero em que todo mundo confia. Sem estas
# iscas o executor podia parar de enxergar caso compilado e nada acusaria.
verificar-suite-unitaria-autoteste: ## as iscas do executor da suite reprovam: suite que nao roda nada nao passa (0,13 s)
	node infra/suite/executar-unitaria.mjs --autoteste

verificar-suite-integracao-autoteste: ## as iscas do executor da integracao reprovam: placar limpo com saida 1 nao passa (0,05 s)
	node infra/integracao/executar-suite.mjs --autoteste

# O IRMAO DO DE CIMA, e o que fecha o vao que ele deixa de proposito. A regra 1
# de `executar-unitaria.mjs` varre da raiz, mas o `NAO_VARRER` dela exclui
# `admin/`, `web/` e `app/`, porque sao subprojetos com executor proprio
# (ADR-0027, ADR-0028) e ela nao conhece o alcance deles.
#
# Era exatamente nesse vao que `admin/src/diretorio/dominio.test.ts` e
# `admin/src/formato/telefone.test.ts` viviam: 24 casos com `describe`, `it` e
# assercoes de verdade, fora do `include` do vitest do painel
# (`test/**/*.test.{ts,tsx}`), que nunca rodaram. Movidos para `admin/test/`,
# passaram no primeiro tiro -- nao havia defeito escondido, havia COBERTURA
# FALSA. Este portao conhece o alcance dos SETE executores e varre o
# repositorio inteiro, inclusive a ponte de `test/a11y/` por tras do link
# simbolico `app/test/a11y`, que o `flutter test` nao atravessa.
verificar-teste-fora-do-alcance-autoteste: ## as iscas do portao de teste orfao reprovam (nao le o repositorio)
	node infra/verificacao/verificar-teste-fora-do-alcance.mjs --autoteste

verificar-teste-fora-do-alcance: ## arquivo com cara de teste que NENHUM executor coleta reprova, nomeando todos (0,06 s)
	node infra/verificacao/verificar-teste-fora-do-alcance.mjs

verificar-colunas-que-nao-saem: ## portao de saida: nenhuma coluna que nao sai escorre para resposta, iscas primeiro (0,37 s)
	sh infra/verificacao/verificar-colunas-que-nao-saem.sh .

verificar-quebras-de-contrato-autoteste: ## as iscas do juizo de quebra de contrato reprovam (0,02 s)
	python3 infra/verificacao/verificar_quebras_de_contrato.py --autoteste

# ELE EXIGE `dist/`, e por isso vem DEPOIS de `verificar-contrato-publico`, que
# e quem roda `npm run build` na lista. Posto antes, reprovaria por artefato
# ausente em vez de por divergencia -- a reprovacao que ninguem entende e que
# termina em alguem tirando o alvo da lista.
verificar-destinos: ## todo servico com `profiles:` declarado como ausente no destino hospedado, iscas dentro (0,07 s)
	node dist/tools/comparar-destinos.js

# O IRMAO DO COMPARADOR DE DESTINOS, e ele mede o que o outro nao olha.
#
# `verificar-destinos` cobra que todo servico com `profiles:` esteja DECLARADO
# como ausente no hospedado. Ele nao pergunta se o compose RESOLVE nos dois
# destinos -- e e ai que o desenho do armazenamento quebra calado: tirar um
# `required: false` deixa o destino local intacto e faz o HOSPEDADO recusar
# `up` inteiro, onde ninguem roda `make up` para descobrir.
#
# O juizo e o proprio `docker compose config`, que roda a mesma validacao do
# `up`. Nao sobe container nenhum, e gera o `.env` falso de que precisa: ele roda
# de worktree, e worktree novo nao tem `.env`.
verificar-armazenamento-por-destino: ## ADR-0007 Emenda 1: o compose resolve nos DOIS destinos, MinIO so no local, iscas dentro
	node infra/verificacao/verificar-armazenamento-por-destino.mjs

# A OUTRA METADE DO JUIZO DA MORTE DO ALVO `prod`. O Makefile tinha so
# `verificar-boot-do-alvo-prod-autoteste`: as iscas provam que o juizo ENXERGA, e
# NADA aplicava o juizo ao alvo `prod` de verdade. Essa metade vivia na linha
# 1076 do `ci.yml`, com `docker build`.
#
# Custo medido: 2,89 s com a imagem quente, 32 s com a camada de codigo
# invalidada -- o mesmo perfil de `verificar-subida-da-api` (15-27 s), e ele mora
# no fechamento pelo mesmo motivo.
verificar-boot-do-alvo-prod: ## BICHUS-213: o alvo `prod` constroi e morre no gerenciador de segredos (2,89 s quente, 32 s frio)
	sh infra/verificacao/verificar-boot-do-alvo-prod-local.sh

# O IRMAO DO JUIZO DA MORTE DO ALVO `prod`, e ele mede o passo SEGUINTE.
#
# `verificar-boot-do-alvo-prod` prova que o processo MORRE quando o gerenciador
# de segredos nao responde. Ele nao pergunta nada sobre o que o gerenciador
# responde quando responde -- e e ai que esta o defeito de 08/10 a 29/10: o
# `.env` da VM tinha a chave certa do GCS, o gerenciador tinha a do MinIO (uma
# versao so, de 29/09), e `resolverSegredos` SOBRESCREVIA a certa pela errada.
# Todo envio de foto do app voltava 403 por onze dias.
#
# As sondas de antes nao viam porque `docker exec ... node -e` roda processo
# NOVO, que nunca executa a troca, e `/proc/1/environ` mostra o ambiente do
# `exec`, nao as mutacoes em tempo de execucao. Foram seis rodadas.
#
# A metade de VERDADE fica FORA de `make verificar` pelo mesmo motivo de
# `verificar-boot-do-alvo-prod`: aquela lista e "tudo que nao precisa de nuvem
# nem de segredo", e esta precisa das duas coisas. Quem sobe chama este alvo com
# `--exigir`; sem credencial do GCP ele sai 2 (INCONCLUSIVO, nomeando cada
# variavel sem conferir), nunca 0.
verificar-segredos-do-gerenciador: ## o .env da subida e o Secret Manager declaram o MESMO valor, por digital sha256 (precisa de credencial do GCP)
	node infra/verificacao/verificar-segredos-do-gerenciador.mjs --exigir $(if $(ENV_DA_SUBIDA),--env $(ENV_DA_SUBIDA),)

verificar-segredos-do-gerenciador-autoteste: ## as iscas do portao de segredos reprovam: igual aprova, divergencia plantada reprova nomeando a variavel (0,6 s, sem rede e sem segredo)
	node infra/verificacao/verificar-segredos-do-gerenciador.mjs --autoteste

# Tudo que nao precisa de nuvem nem de segredo, na ordem da esteira. E o que
# `make up` seguido de `make verificar` responde antes de abrir um PR.
#
# `apk` NAO entra nesta lista, e a ausencia e deliberada. Ele leva minutos e
# precisa da cadeia de ferramentas Android instalada, que nao e premissa desta
# maquina; alem disso `verificar-apk-autoteste` sozinho aqui daria a impressao
# errada de que o APK foi conferido quando so o conferidor foi. Quem quer a
# resposta de verdade roda `make apk`; quem nao roda, a esteira roda por ele.
verificar: verificar-numero-de-adr-autoteste verificar-numero-de-adr verificar-carimbo-de-migracao-autoteste verificar-carimbo-de-migracao verificar-migracao-em-banco-com-dado-autoteste verificar-manifesto-do-aplicativo-autoteste verificar-manifesto-do-aplicativo verificar-recibo-de-fechamento-autoteste verificar-passos-condicionais verificar-consulta-externa verificar-veredito-do-sonar-autoteste verificar-quebras-de-contrato-autoteste verificar-suite-unitaria-autoteste verificar-suite-integracao-autoteste verificar-teste-fora-do-alcance-autoteste verificar-teste-fora-do-alcance verificar-colunas-que-nao-saem verificar-dispensas verificar-marcador-de-migracao verificar-boot-do-alvo-prod-autoteste verificar-segredos-do-gerenciador-autoteste verificar-commit-de-build-autoteste verificar-commit-de-build verificar-variaveis verificar-portas-autoteste verificar-escolha-de-portas verificar-portas verificar-portabilidade verificar-sorteio verificar-livro verificar-borda verificar-tipos-gerados-autoteste verificar-tipos-gerados verificar-backoffice-contrato verificar-limite verificar-tipos verificar-lint verificar-contrato-publico verificar-rastreabilidade verificar-destinos verificar-armazenamento-por-destino verificar-backoffice-autoteste verificar-cobertura verificar-borda-local ## roda os portoes locais, na ordem da esteira

verificar-subida-da-api: ## a API SOBE de verdade numa pilha efemera por worktree (15-27 s; so no fechamento)
	node infra/verificacao/verificar-subida-da-api.mjs

verificar-subida-da-api-autoteste: ## as iscas do juizo da subida reprovam (nao usa docker)
	node infra/verificacao/verificar-subida-da-api.mjs --autoteste

verificar-recibo-de-fechamento-autoteste: ## as iscas do guarda de push de `integra/*` reprovam
	sh infra/verificacao/verificar-recibo-de-fechamento.sh --autoteste

# O GEMEO DO PORTAO DOS TIPOS GERADOS, e ele desce pelo mesmo motivo.
#
# Havia DOIS portoes da forma "regera o derivado e compara" neste repositorio, e
# os dois so existiam na esteira:
#
#   api/openapi.yaml   -> src/shared/types/generated/        (job `codigo`)
#   design/tokens.json -> app/lib/theme/bichu_tokens.g.dart  (job `tokens`)
#
# O primeiro desceu para `make verificar` em 22/09, depois que o commit 351ae0f
# atravessou um `make fechar-integracao` VERDE com o derivado uma geracao atras
# da fonte. Este e o outro. Hoje o `.g.dart` esta em dia: e buraco latente, e o
# momento de tapar buraco latente e antes de ele virar historia.
#
# MEDIDO neste worktree: 1,26 s com `/usr/bin/time -p`, contra os 37,0 s de
# `flutter pub get` + `analyze` + suite de widget. Ele roda ANTES dos dois, e a
# ordem e o ponto: derivado velho reprova em um segundo, e nao depois de meio
# minuto de suite que nao tem nada com isso.
#
# NAO E `git diff --exit-code`, que e o que a esteira faz, e a diferenca custou
# uma iteracao no irmao. Com a fonte adiantada e o derivado JA REGERADO -- o
# estado correto de quem acabou de mexer no token e ainda nao commitou -- a
# forma da esteira REPROVA. Portao que reprova o fluxo certo e portao que alguem
# desliga. A pergunta daqui e outra, e nao depende do git: gerar de novo muda
# algum arquivo?
verificar-tokens-gerados-autoteste: ## as iscas do portao dos tokens gerados reprovam (nao gera nada)
	node infra/verificacao/verificar-tokens-gerados.mjs --autoteste

verificar-tokens-gerados: ## o Dart de app/lib/theme/ bate com design/tokens.json (1,26 s)
	node infra/verificacao/verificar-tokens-gerados.mjs

# ---------------------------------------------------------------------------
# OS DEZ ICONES DA BARRA (BICHUS-278, 23/10/2026)
#
# Gera `app/lib/theme/icones_da_barra.g.dart` a partir de
# `design/icones-da-barra/*.svg`. Terceiro derivado desta casa, depois dos
# tokens e da marca.
#
# POR QUE ELE NAO TEM UM `verificar-` IRMAO, e a assimetria e deliberada:
# a pergunta "gerar de novo muda o arquivo?" ja e respondida DENTRO de
# `flutter test`, por `app/test/telas/icones_da_barra_test.dart`, que le os dez
# SVG e compara moldura, rotulo e CADA forma -- na ordem -- com o `.g.dart`.
# Ele e o arranjo de `test/marca/vetor_da_marca_test.dart`, e nao o de
# `verificar-tokens-gerados.mjs`, porque esta fonte nao tem segundo consumidor:
# `design/tokens.json` alimenta Dart E CSS do site, e por isso o portao dele
# mora fora da suite; estes dez alimentam so o app. Um `.mjs` aqui seria um
# segundo lugar onde a mesma pergunta e feita, e os dois divergiriam.
#
# **Este alvo existe para ninguem escrever o `.g.dart` a mao.** O arquivo diz
# NAO EDITE no cabecalho, e quem precisar mexer num icone mexe no SVG e roda
# isto.
# DESLIGADO EM 26/10/2026: o cliente reprovou o desenho ("tava muito feio o
# icone do cachorro") e a barra voltou aos glifos do Material. Este alvo
# continua funcionando e o gerado continua commitado e conferido pela suite --
# o que mudou e `fonteAtivaDaBarra` em app/lib/telas/casca_com_abas.dart, que
# nao pinta mais os SVG. Religar e trocar aquela chave E os cinco destinos.
gerar-icones-da-barra: ## regera app/lib/theme/icones_da_barra.g.dart de design/icones-da-barra/*.svg (DESLIGADO na barra desde 26/10)
	cd app && dart run tool/gen_icones_da_barra.dart

# O SITE (web/, ADR-0028, item 8). Gemeo local do passo de tokens do job `web`:
# a pergunta e "gerar de novo muda o arquivo?", e a isca (raspberry.700
# alterado numa copia) PRECISA reprovar nomeando web/src/styles/tokens.g.css.
verificar-tokens-web: ## o CSS de web/src/styles/ bate com design/tokens.json, com a isca
	cd web && node scripts/gerar-tokens-css.mjs --verificar && node scripts/isca-tokens.mjs

# Os portoes do site que nao precisam de navegador nem de build (segundos).
# A suite de ponta a ponta e o orcamento rodam no job `web` da esteira; local:
#   cd web && npm run build && npm run verify:orcamento && npm run test:e2e
verificar-site: verificar-tokens-web ## site: contrato, tokens, valores soltos, astro check e unidade
	cd web && npm run verify:api && npm run verify:valores-soltos && npm run check && npm run test:unidade

# `flutter pub get` PRIMEIRO, e nao por habito: `dart run tool/gen_tokens.dart`
# precisa do pacote resolvido, e sem isso o portao reprovaria por falta de
# preparo em vez de por divergencia -- que e a reprovacao que ninguem entende.
# --------------------------------------------------------------------------
# O PORTAO DE CONFORMIDADE DO APP (23/09/2026)
#
# Regra do cliente, 23/09: toda funcionalidade segue `api/openapi.yaml`, e os
# quatro clientes usam os mesmos campos e os mesmos valores. Dois ja tinham
# portao para isso: o backend, com `verificar-tipos-gerados`, e o painel, com
# o cliente gerado. O APP nao tinha NENHUM.
#
# `app/lib/api/` e escrito a mao -- 22 arquivos, 5232 linhas, 45 tipos de
# modelo. Um campo renomeado no contrato nao quebrava build, nao quebrava
# `flutter analyze` e nao quebrava a suite: quebrava no aparelho da pessoa,
# que e o unico lugar onde ninguem esta olhando.
#
# POR QUE ELE NAO GERA OS MODELOS, QUE SERIA ESTRUTURALMENTE MELHOR
#
# Medido antes de decidir: 45 tipos a mao com 375 usos fora de `app/lib/api`,
# em 192 arquivos Dart. Os identificadores sao em portugues por regra da casa
# e o gerador emite os nomes do contrato em ingles, entao gerar nao APAGA a
# camada a mao -- troca ela por uma camada de traducao do mesmo tamanho. E o
# contrato tem 68 schemas dos quais o app modela um recorte DE PROPOSITO:
# gerador que espelha 1:1 entrega ao app exatamente o que ele nao pode ver.
# A decisao e do Orquestrador; a medicao esta na entrega.
#
# POR QUE ELE RODA ANTES DO `flutter pub get`, E NAO DEPOIS
#
# Ele nao precisa de Flutter: le texto Dart e YAML com Node. Medido neste
# worktree com `/usr/bin/time -p`, Node 22.23.2, cinco execucoes -- `real`
# entre 0,92 e 1,36 s, tipico 1,1 s; o autoteste custa 0,30 s. Contra os
# 37,0 s de `pub get` + `analyze` + suite, ele e ruido, e a ORDEM e o ponto:
# contrato divergente reprova em um segundo, e nao depois de meio minuto de
# suite que nao tem nada com isso. E a mesma razao pela qual
# `verificar-tokens-gerados` (1,26 s) roda antes de `analyze`.
#
# POR QUE EM `verificar-app` E NAO EM `verificar`
#
# Pelo criterio de custo da casa, e pelo assunto: ele le `app/lib/api/`, entao
# mora com a metade Flutter, junto do portao dos tokens, que tambem le `app/`
# e custa o mesmo. `verificar` e o laco de quem mexe em rota e em `src/`.
#
# O QUE ELE NAO FAZ: classe de modelo entra na conferencia quando tem ancora.
# Enum, nao: TODO enum de `app/lib/api/` tem de se classificar, e enum novo sem
# classificacao reprova. A assimetria esta registrada na entrega como limite
# conhecido, e nao como esquecimento.
verificar-conformidade-do-app-autoteste: ## as iscas do portao de conformidade do app reprovam (nao le a spec)
	node infra/verificacao/verificar-conformidade-do-app.mjs --autoteste

verificar-conformidade-do-app: ## os campos e enums de app/lib/api/ batem com api/openapi.yaml (1,1 s)
	node infra/verificacao/verificar-conformidade-do-app.mjs

verificar-app: verificar-tokens-gerados-autoteste verificar-conformidade-do-app-autoteste ## a metade Flutter: analise e suite de widget (job `app` da esteira)
	@$(MAKE) --no-print-directory verificar-conformidade-do-app
	cd app && flutter pub get
	@$(MAKE) --no-print-directory verificar-tokens-gerados
	cd app && flutter analyze && flutter test

# ---------------------------------------------------------------------------
# A LISTA DE FECHAMENTO DE INTEGRACAO
#
# POR QUE ELA EXISTE
#
# Em 22/09/2026 uma integracao se declarou VERDE sem nunca ter compilado um
# APK. Havia um `--` dentro de um comentario do `AndroidManifest.xml`, o
# mesclador de manifesto do Gradle recusava o arquivo, e o build do Android
# morria antes de compilar qualquer coisa. A mesma classe ja tinha sido
# corrigida em 21/09 (`86499cb`) e voltou em 22/09 (`c0cd002`).
#
# O buraco NAO foi a esteira nao ter o job: o `ci.yml` tem o job `apk`, e ele
# esta certo onde esta. O buraco foi a integracao LOCAL declarar verde sem
# nunca te-lo rodado, porque aquela branch nao passou por PR nenhum -- entao a
# esteira nunca disparou. Nao existia lista de fechamento. Esta e ela.
#
# POR QUE ELA NAO ESTA NO LACO DE QUEM DESENVOLVE, E POR QUE ISSO NAO E DESCUIDO
#
# `apk` precisa de JDK 17, do SDK do Android (`platforms;android-37.0`) e da
# distribuicao do Gradle -- nada disso e premissa desta maquina, e nenhum deles
# e necessario para escrever uma rota ou um widget.
#
# MEDIDO NESTE WORKTREE em 22/09/2026, com `/usr/bin/time -p`, APK de 75,3 MB:
#
#   make apk, `build/` frio, distribuicao do Gradle quente    35,6 s
#   make apk, tudo quente, sem mudanca em Dart                 7,6 s
#   make verificar-app (pub get + analyze + 750 testes)       37,0 s
#   os portoes que este commit acrescentou a `verificar`       0,22 s
#
# Nao medi `make verificar` inteiro: ele constroi imagens Docker e sonda uma
# pilha que outros agentes estao usando agora. O numero que importa para o
# argumento e o de cima: o que entrou no laco de quem desenvolve custa 0,22 s.
#
# Contra uma rodada inteira de integracao, `apk` e ruido. Contra o ciclo de
# editar e rodar teste, que e de segundos, e proibitivo. Por isso `verificar`
# continua sem `apk` e este alvo existe separado. NAO MOVA `apk` PARA
# `verificar`: o laco fica lento, e laco lento e desligado -- que e como a
# verificacao morre de verdade, nao por alguem discordar dela.
#
# COMO ELA SE FAZ CUMPRIR, e a resposta honesta e em duas camadas
#
# 1. QUEM INTEGRA RODA. Nao ha mecanismo que substitua isso, e fingir que ha
#    seria pior. A obrigacao esta escrita no README, secao "Fechamento de
#    integracao", e e la que quem integra a le.
# 2. O gancho `pre-push` recusa empurrar uma branch `integra/*` sem o recibo
#    verde DESTE commit (ver `.githooks/pre-push`). Ele e contornavel com
#    `--no-verify`, de proposito e pelo mesmo motivo do guarda da `main`: ele
#    existe para impedir o ENGANO, que e o caso comum, e nao a decisao
#    deliberada. Decisao deliberada aparece na esteira, em vermelho.
#
# FICA DE FORA, e a ausencia e deliberada: `make e2e`. O Cypress grava com
# `--record`, que exige a chave do painel; e um passo com segredo, e esta lista
# precisa rodar numa maquina sem nenhum. Quem fecha uma integracao que mexeu em
# fluxo de tela roda `make e2e` a mais, e o README diz isso.
RECIBO_DE_FECHAMENTO := fechamento.local.txt

fechar-integracao: ## o conjunto que FECHA uma integracao: verificar + subida da API + Flutter + APK
	@echo "fechamento de integracao: verificar -> verificar-subida-da-api -> verificar-migracao-em-banco-com-dado -> verificar-app -> apk."
	@echo "  Isto NAO e o \`make verificar\` do dia a dia: ele compila um APK de verdade"
	@echo "  e sobe a API numa pilha efemera."
	@echo "  Medido neste worktree: apk em 7,6 s quente e 35,6 s com \`build/\` frio;"
	@echo "  subida da API em 15 s quente e 27 s com a camada de codigo invalidada."
	@rm -f $(RECIBO_DE_FECHAMENTO)
	@$(MAKE) --no-print-directory verificar
	@$(MAKE) --no-print-directory verificar-busca-do-veredito-autoteste
	@$(MAKE) --no-print-directory verificar-subida-da-api
	@$(MAKE) --no-print-directory verificar-boot-do-alvo-prod
	@$(MAKE) --no-print-directory verificar-migracao-em-banco-com-dado
	@$(MAKE) --no-print-directory verificar-app
	@$(MAKE) --no-print-directory apk
	@$(MAKE) --no-print-directory carimbar-fechamento

# O carimbo mora num alvo PROPRIO para poder ser exercitado sem compilar um APK
# de 75 MB antes. Quem le o recibo tem as sete iscas de
# `verificar-recibo-de-fechamento.sh`; quem o ESCREVE e esta receita, e uma
# regra provada so de um lado e meia regra.
#
# NAO CHAME ESTE ALVO A MAO para pular o fechamento: carimbar sem ter rodado a
# lista produz um recibo que afirma o que ninguem provou, que e pior que nao
# ter recibo -- o gancho passa a aprovar em vez de calar.
carimbar-fechamento: ## carimba o recibo do fechamento no commit atual (chamado por fechar-integracao)
	@commit=$$(git rev-parse --verify HEAD 2>/dev/null); \
	 test -n "$$commit" || { echo "fechamento: sem commit em HEAD; nao ha o que carimbar" >&2; exit 1; }; \
	 if [ -z "$$(git status --porcelain)" ]; then arvore=limpa; else arvore=suja; fi; \
	 { echo "commit=$$commit"; \
	   echo "arvore=$$arvore"; \
	   echo "em=$$(date -u +%Y-%m-%dT%H:%M:%SZ)"; } > $(RECIBO_DE_FECHAMENTO); \
	 echo ""; \
	 echo "recibo em $(RECIBO_DE_FECHAMENTO) (fora do git, por arvore): $$commit, arvore $$arvore"; \
	 if [ "$$arvore" = "suja" ]; then \
	   echo "  AVISO: a arvore estava suja. O que foi provado nao e o que esta commitado,"; \
	   echo "         e o gancho \`pre-push\` vai recusar este recibo."; \
	 fi

backup: ## pg_dump para ./backup. Sem servico gerenciado, o unico backup e este
	@mkdir -p backup
	@# `set -o pipefail` na PROPRIA linha, e nao em `.SHELLFLAGS`: o GNU Make
	@# 3.81 (o que vem no macOS) le `.SHELLFLAGS` e NAO o usa -- a correcao
	@# pareceria aplicada e nao valeria nada justo na maquina de quem roda
	@# `make backup` a mao. Sem isto, `pg_dump` que reprova vira um .gz
	@# valido e VAZIO, o `gzip` sai 0, e o alvo anuncia "backup gravado".
	set -o pipefail; $(COMPOSE) exec -T db pg_dump -U $${POSTGRES_USER:-bichu} $${POSTGRES_DB:-bichu} | gzip > backup/bichu-$$(date +%Y%m%d-%H%M%S).sql.gz
	@echo "backup gravado. Backup nunca restaurado nao e backup: exercite `make restore` uma vez"

restore: ## restaura o dump mais recente de ./backup
	@ultimo=$$(ls -t backup/*.sql.gz 2>/dev/null | head -1); \
	 test -n "$$ultimo" || { echo "nenhum backup em ./backup"; exit 1; }; \
	 echo "restaurando $$ultimo"; \
	 set -o pipefail; gunzip -c "$$ultimo" | $(COMPOSE) exec -T db psql -U $${POSTGRES_USER:-bichu} -d $${POSTGRES_DB:-bichu}

pin-digests: ## reresolve os digests das imagens do compose e de todo Dockerfile (API, admin/, borda)
	@# Sem `pipefail`, `grep` que nao acha nada sai 1, o `sort` sai 0 e o
	@# `while` nao executa: o alvo termina VERDE tendo conferido ZERO
	@# referencias, que e o estado em que ele mais precisava falar.
	@set -o pipefail; grep -hoE '(quay\.io/)?[a-z0-9./-]+:[A-Za-z0-9._-]+@sha256:[0-9a-f]{64}' $(wildcard compose.yaml infra/integracao/compose.integracao.yaml Dockerfile */Dockerfile infra/*/Dockerfile) | sort -u | while read -r ref; do \
	  tag=$${ref%@*}; \
	  novo=$$(docker buildx imagetools inspect "$$tag" --format '{{.Manifest.Digest}}' 2>/dev/null); \
	  if [ -n "$$novo" ]; then echo "$$tag -> $$novo"; else echo "$$tag -> NAO RESOLVEU"; fi; \
	done
