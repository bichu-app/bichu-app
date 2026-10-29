# Medição para o refactoring — 28/10/2026

Só leitura. **Nenhum arquivo de código foi editado.** A entrega é esta lista, ordenada
por ganho, para o cliente escolher os alvos.

- Árvore medida: `origin/development` em `6b60db94` (merge do PR #91, 28/10 21:29 -03)
- Worktree: `builds/medicao-refactor-28-10` (caminho durável, **não** `/private/tmp`)
- Ferramentas: `jscpd` 4.0.5 (TS, TSX, Dart), `awk`, `find`, scripts próprios em Node 22
- Nenhum container subiu, nenhuma suíte rodou

---

## 0. A linha de partida, conferida nesta árvore

O número que recebi está à esquerda; o que eu medi, à direita. **As diferenças são
crescimento do dia**, não discordância de método — exceto onde anotado.

| | recebido | **medido aqui** | arquivos |
|---|---|---|---|
| `src/` produção `.ts`, linhas não vazias | 99.118 | **99.319** | 397 |
| — dessas, **comentário** | ~46.200 (47%) | **44.702 (45,0%)** | |
| — dessas, **código** | 52.909 (Sonar) | **54.617** | |
| `src/` testes | 84.676 | **85.009** | 303 |
| `src/` gerados | 24.404 | **24.478** | 3 |
| `app/lib` Dart (todos) | 97.168 | **97.183** | 237 |
| `app/lib` Dart sem `.g.dart` | — | **96.430** | 234 |
| — dessas, **comentário** | — | **46.498 (48,2%)** | |
| `web/src` + `admin/src` (`.ts`/`.tsx`/`.astro`) | 65.142 | **66.795** | 145 |
| — comentário (só `.ts`/`.tsx`) | — | **29.717 (45,6%)** | 109 |

Meu contador de comentário é mais conservador que o do Sonar (ele não conta linha
mista; aqui não há nenhuma em `src/`). A diferença de ~1,7 mil linhas entre
"54.617 código" e "52.909 Sonar" é de tokenizador e de 1 dia de crescimento —
**as duas medidas concordam na conclusão: comentário é ~45–48% de toda a base, nas três stacks.**

Controle positivo do contador: arquivo de 7 linhas com 1 `//`, 1 bloco `/* */` de 2
linhas e 1 string contendo `//` → devolveu 3 comentário / 2 código / 2 vazia. Correto.

---

## 1. Tabela-resumo

| # | Frente | Achados | Linhas economizáveis | Risco | Confiança |
|---|---|---|---|---|---|
| A | **Cliente de API gerado, duplicado byte a byte** entre `web/` e `admin/` | 1 | **24.383** (um dos dois lados) | baixo (infra) / **alto** (build das duas frentes) | **medida** (md5 igual) |
| B | **Função equivalente com nome diferente** — TS (`src` + `admin` + `web`) | 20 pares + resíduo | **~420** | baixo a alto, caso a caso | medida por amostragem |
| C | **Função/widget equivalente** — Dart `app/lib` | 20 pares + 13 reimplementações | **~800** | baixo a médio | medida por amostragem |
| D | **Helper repetido em `src/`** (mesmo nome, N arquivos) | 92 nomes em 2+ arquivos | **~250** | baixo | medida |
| E | **Clone textual dentro do mesmo módulo** (jscpd, `min-lines 10`) | 114 clones | **1.993** | baixo a médio | medida |
| F | **Histórico encadeado em constante de portão** | 14 linhas, 2 arquivos | **89.001 bytes** (não apagar — arquivar) | médio | medida |
| G | **Comentário que MENTE** | 3 confirmados | ~15 (o valor não é tamanho) | baixo | medida |
| H | **Comentário duplicado literalmente** | 29 blocos | **218** | baixo | medida |
| I | **Sem cobertura e sem justificativa** | **0** em `src/`; 3 arquivos de hoje | — | — | proxy estático (ver §9) |
| J | **Acúmulo de worktree** | 385 registrados | **~150 GB** (estimativa) | baixo | 50,6 GB medidos + 99 GB estimados |

**Linhas economizáveis em código, somadas sem dupla contagem: ~3.700** — fora os
24.383 do item A e os 89.001 bytes do item F. Isso é **3,7% da base de produção**,
não 40%. O número grande está em comentário, e o comentário é 95% único e datado
(§8). **Se o objetivo é "reduzir a quantidade", a resposta honesta é: a base não tem
20 mil linhas de gordura de código para cortar.**

---

## 2. Os três maiores alvos

1. **A** — `web/src/api/generated/api.ts` e `admin/src/api/generated/api.ts` são o
   **mesmo arquivo**, 24.383 linhas, md5 `f78f3174…` idêntico nos dois. Um pacote
   compartilhado apaga uma cópia inteira.
2. **C.1** — o bloco de busca de CEP (`_buscarOCep` + linha de progresso +
   preenchimento) está em **6 telas Dart**, com 3 divergências de comportamento, duas
   delas podendo gravar UF inexistente. ~280 linhas.
3. **E/admin** — `admin/src` concentra **6,49%** de clone textual (`min-lines 5`), o
   maior índice das três stacks; `web/src` tem **zero**. São 6 formulários e 6 listas
   que copiaram a mesma casca.

---

## 3. Frente A — duplicação entre projetos: o que é inevitável e o que não é

O briefing pediu para separar as duas coisas. Separei, e o resultado é limpo:

**Duplicação textual CRUZANDO projeto, medida pelo jscpd: 1 clone, 15 linhas.**

| | |
|---|---|
| `src/modules/network/domain/escrita-do-encontro.ts:213-227` | |
| `admin/src/rede/dominio/observacoes.ts:104-113` | |

Isto é, **não há duplicação textual relevante entre backend e os dois frontes**. A
fronteira de processo está sendo respeitada. O problema cruzado é de outra natureza:

### A.1 — O cliente de API gerado existe duas vezes (ALVO №1)

| | |
|---|---|
| Arquivos | `web/src/api/generated/api.ts` e `admin/src/api/generated/api.ts` |
| Tamanho | 1.152.803 bytes e **24.383 linhas**, cada um |
| Prova | `md5` **idêntico** (`f78f31748fb35585d7fe306cfb793cad`) |
| O que seria feito | um pacote local (`packages/contrato-ts/`) gerado uma vez de `api/openapi.yaml`, consumido pelos dois |
| Encolhe | **24.383 linhas** de `web/src`+`admin/src` (de 66.795 para 42.412, −36,5%) |
| O que pode quebrar | o `tsc` do backoffice **já sobe para a raiz** para resolver pacote (memória conhecida: "Backoffice typecheca código do servidor"); mover o cliente para um pacote mexe exatamente nessa resolução. O `verificar-site` e o build do admin precisam ser conferidos juntos, não em sequência. **Risco alto de esteira, ganho alto de linha.** |
| Observação | é código **gerado**: hoje ele não entra na conta do Sonar nem é editado à mão. O ganho é de repositório e de risco de divergência (uma geração desatualizar só um lado), não de qualidade de código escrito. |

### A.2 — O detector de observações do servidor foi copiado para o painel, e envelheceu

A cópia **declara o SHA de origem no próprio comentário** e divergiu desde então.

| lado | caminho | TLDs reconhecidos |
|---|---|---|
| servidor | `src/modules/network/domain/escrita-do-encontro.ts:228` | **47** |
| painel | `admin/src/rede/dominio/observacoes.ts:84` | **9** |

Contado por mim (`gsub` de `\|` na linha), não pelo agente que achou — ele disse 46.
Consequência medida: `bit.ly` e `linktr.ee` **passam verdes no painel** e tomam 400 do
servidor. Além disso `observacoes.ts:139` tem um atalho `if (BIDI.test(texto)) return
['bidi']` que **salta todas as outras conferências**, e o servidor não tem.

- O que seria feito: pacote compartilhado de domínio painel↔servidor, ou — mais barato
  — um teste de paridade que compara as duas tabelas de TLD e reprova na divergência.
- Encolhe: ~55 linhas (estimativa).
- Risco: **médio-alto**. Não existe pacote compartilhado hoje; criar um é decisão de
  arquitetura, não refactoring.

### A.3 — Rótulo divergente em três superfícies: o gêmeo exato do caso `clinic`

**Verifiquei os três lados eu mesmo.** A unidade de preço do encontro:

| superfície | `per_person` | `per_pair` | `per_two_people` |
|---|---|---|---|
| `app/lib/api/modelos_rede.dart:215-217` | `por humano` | `por dupla (1 humano + 1 pet)` | `por dupla (2 humanos)` |
| `admin/src/rede/dominio/rotulos.ts:58-63` | `por humano` | `por dupla (1 humano + 1 pet)` | `por dupla (2 humanos)` |
| **`web/src/dominio/telas-do-encontro.ts:210-217`** | **`por pessoa`** | **`por dupla (1 pessoa + 1 pet)`** | **`por dupla (2 pessoas)`** |

E o comentário em `app/lib/api/modelos_rede.dart:210-212` afirma: *"Os rótulos são,
palavra por palavra, os do painel … e não há duas verdades."* **São duas verdades.**
O site é a minoria de três, e os três lados estão verdes.

- O que seria feito: alinhar `web/src` nos outros dois (3 strings).
- Encolhe: ~7 linhas. **O valor não é linha, é o defeito.**
- Risco: **baixo**. Pode quebrar teste e2e de `web/` que fixa `por pessoa`
  (ver §10: os e2e de `web/` não entram no `verificar-site`).

### A.4 — Slug de tag: o aviso de colisão do painel mede outra string

| lado | caminho | o que faz com `&` |
|---|---|---|
| servidor | `src/modules/store/domain/escrita-da-vitrine.ts:872-881` | `[ &+]` → `-` (`N&D` → `n-d`) |
| painel | `admin/src/loja/dominio.ts:169-180` | `[^a-z0-9 -]` → **apaga** (`N&D` → `nd`) |

Conferido lendo os dois corpos. `Farmina N&D Ocean` dá `farmina-nd-ocean` no painel e
`farmina-n-d-ocean` no servidor, então o aviso *"esse slug já existe"* do painel está
comparando uma string que o servidor nunca vai gravar.

- O que seria feito: copiar o pipeline do servidor para `slugDoRotulo`. ~11 linhas.
- Risco: **baixo**. É correção de defeito. Os testes de `slugDoRotulo` quebram, e devem.

---

## 4. Frente E — clone textual, com a ferramenta e com o controle positivo

### Como foi medido, e a armadilha que quase estragou a medição

`jscpd` 4.0.5, instalado fora do repositório (scratchpad), rodado separadamente em
`src/`, `app/lib` e `admin/src`+`web/src`, excluindo teste e gerado.

**Controle positivo:** copiei 120 linhas de `src/shared/http/errors.ts` e 200 de
`app/lib/main.dart` para dois diretórios e rodei. Acusou os 2 clones, um por formato
(`typescript` e `dart`). **A ferramenta estava lendo os arquivos.**

**A armadilha, e ela mudou os números:** o `jscpd` tem `--max-lines 1000` por padrão e
**pula em silêncio todo arquivo maior**. Na primeira rodada ele analisou 385 das 397
fontes de `src/` e 211 das 234 de `app/lib` — ou seja, **pulou exatamente os 12
arquivos maiores de `src/` (17.144 linhas) e 23 de `app/lib`**, que são os mais
prováveis de conter clone. Provei a conta: `88.099 + 17.144 ≈ 105.243`, e a lista dos
12 bate arquivo por arquivo. Com `--max-lines 50000`:

| alvo | antes (padrão) | **depois (corrigido)** |
|---|---|---|
| `src/` | 30 clones, 436 linhas, 0,49% | **36 clones, 562 linhas, 0,53%** — 397/397 fontes |
| `app/lib` | 26 clones, 459 linhas, 0,68% | **63 clones, 1.140 linhas, 1,10%** — 234/234 fontes |
| `admin`+`web` | 12 clones, 206 linhas | **15 clones, 291 linhas, 1,29%** — 139 fontes |

O Dart **dobrou**. Qualquer medição de duplicação feita com o padrão do jscpd nesta
base está errada por baixo.

### Sensibilidade: o mesmo alvo com `min-lines 5`

| alvo | `min-lines 10` | `min-lines 5` |
|---|---|---|
| `src/` | 0,53% (36 clones) | **2,52%** (285 clones, 2.647 linhas) |
| `app/lib` | 1,10% (63 clones) | **3,28%** (309 clones, 3.394 linhas) |
| `admin`+`web` | 1,29% (15 clones) | **6,49%** (105 clones, 1.462 linhas) |

`admin/src` é o mais denso das três stacks por larga margem. **`web/src` tem zero
clones nos dois cortes** — os 15 e os 105 estão todos dentro de `admin/src`.

### E.1 — DENTRO DO MESMO MÓDULO (o mais barato, vai primeiro)

| linhas | caminho e intervalo | o que é |
|---|---|---|
| 18 | `src/modules/media/adapters/persistence/kysely-imagem-de-catalogo.ts:100-117` ↔ `:67-84` | mesma montagem de consulta duas vezes no mesmo arquivo |
| 17 | `src/modules/pets/adapters/persistence/kysely-pet-repository.ts:350-366` ↔ `:154-170` | idem |
| 17 | `src/modules/lostfound/adapters/persistence/kysely-lost-case-repository.ts:707-723` ↔ `:643-659` | idem |
| 13 | `src/modules/lostfound/adapters/http/lost-case-routes.ts:780-792` ↔ `:710-722` | idem |
| 12 | `src/modules/store/adapters/http/admin-store-routes.ts:339-350` ↔ `:294-305` | idem |
| 11 | `src/modules/store/application/catalogo-administrativo.ts:862-872` ↔ `:803-813` | idem |
| 11 | `src/modules/professionals/adapters/http/directory-routes.ts:506-516` ↔ `:441-451` | idem |
| 39+29+22+20+13 | `app/lib/api/modelos_rede.dart` — 5 clones internos (`:1197-1235`↔`:1004-1041`, `:1292-1320`↔`:1090-1118`, `:1177-1198`↔`:983-1004`, `:1254-1273`↔`:1052-1071`, `:1273-1285`↔`:1071-1083`) | **156 linhas em um arquivo só**: `fromJson`/`toJson` repetidos por modelo |
| 34 | `app/lib/widgets/barra_de_listagem.dart:1312-1345` ↔ `:1146-1179` | |
| 14 | `app/lib/api/api_client.dart:316-329` ↔ `:213-226` | |
| 13 | `app/lib/telas/escanear/tela_do_pet_da_tag.dart:491-503` ↔ `:464-476` | |
| 12 | `app/lib/telas/perto/lista_do_diretorio.dart:1492-1503` ↔ `:1061-1072` | |
| 57 (3x) | `admin/src/diretorio/FilaDeIndicacoes.tsx` consigo mesmo | |
| 98 (6x) | `admin/src/rede/telas/FormularioDoEncontro.tsx` consigo mesmo | |
| 27 (3x) | `admin/src/componentes/campos.tsx` consigo mesmo | |

- O que seria feito: extrair função privada **no próprio arquivo**. Nenhum importe novo,
  nenhuma fronteira atravessada.
- Encolhe: **~560 linhas** somadas (medida).
- Risco: **baixo**. É o grupo que não toca em contrato, não cruza módulo e não mexe em
  casca de tela. `modelos_rede.dart` é o melhor custo-benefício isolado: 156 linhas em
  um arquivo, sem efeito fora dele.
- O que pode quebrar: `app/lib/api/modelos_rede.dart` alimenta o portão
  `enum-sem-valores-lidos` — mexer em `fromJson` de enum exige o código de fio junto
  (memória conhecida: "Ponteiro de enum exige código de fio").

### E.2 — Entre módulos da mesma stack (segundo mais barato)

Os pares com mais linhas, por par de arquivos (`min-lines 5`, somado):

| linhas | par |
|---|---|
| 189 (14 clones) | `app/lib/telas/perto/sugerir_profissional.dart` ↔ `app/lib/telas/rede/criar_encontro.dart` |
| 184 (14 clones) | `admin/src/diretorio/FormularioDaEntrada.tsx` ↔ `admin/src/loja/FormularioDeParceiro.tsx` |
| 145 (4) | `admin/src/loja/ListaDeProdutos.tsx` ↔ `admin/src/loja/Tags.tsx` |
| 133 (7) | `admin/src/loja/ListaDeParceiros.tsx` ↔ `admin/src/loja/Tags.tsx` |
| 123 (1) | `admin/src/diretorio/ListaDeEntradas.tsx` ↔ `admin/src/rede/telas/ListaDeEncontros.tsx` |
| 110 (6) | `app/lib/telas/loja/produto_da_loja.dart` ↔ `app/lib/telas/perto/pagina_do_local.dart` |
| 97 (8) | `admin/src/moderacao/FilaDeModeracao.tsx` ↔ `admin/src/plaquinhas/FilaDePlaquinhas.tsx` |
| 96 (8) | `app/lib/telas/perfil/tela_endereco_de_entrega.dart` ↔ `app/lib/telas/pet/tela_solicitar_plaquinha.dart` |
| 94 (6) | `src/modules/professionals/application/diretorio-administrativo.ts` ↔ `src/modules/store/application/catalogo-administrativo.ts` |
| 92 (5) | `app/lib/telas/perto/pagina_do_local.dart` ↔ `app/lib/telas/rede/encontro_da_rede.dart` |

Arquivos que mais aparecem em clone (número de clones em que entram):

- `src/`: `transfers/.../transfer-routes.ts` (357 L / 37 clones), `src/bin/api.ts` (218/27),
  `store/application/catalogo-administrativo.ts` (187/15)
- `app/lib`: `telas/rede/criar_encontro.dart` (398/32), `telas/rede/encontro_da_rede.dart` (378/30),
  `telas/perto/pagina_do_local.dart` (360/26)
- `admin/src`: `loja/Tags.tsx` (404/22), `diretorio/FilaDeIndicacoes.tsx` (297/18),
  `rede/telas/FormularioDoEncontro.tsx` (259/16)

---

## 5. Frente D — helper com o mesmo nome em N arquivos de `src/` (medido por mim)

Varri as 1.377 definições de função/arrow de topo de `src/` produção. **92 nomes
aparecem definidos em 2 ou mais arquivos.** O primeiro scanner que escrevi devolveu
**zero** porque usei `match($0, /…/, m)` — a terceira forma de `match` é do GNU awk e
este macOS não tem. Refiz em Node com controle positivo (dois arquivos com
`slugOcupado` → acusou 2x). Os maiores:

| N arquivos | nome | tamanho da cópia | avaliação |
|---|---|---|---|
| **15** | `ehObjeto` | 3 linhas | **ALVO BARATO E DIVERGENTE.** 13 das 16 definições (15 produção + 1 teste) têm o corpo `typeof === 'object' && !== null && !Array.isArray(valor)`. **Duas não:** `src/shared/adapters/external/gcp-secret-manager.ts:80` e `src/modules/notifications/adapters/external/fcm-http-v1.ts:104` omitem o `!Array.isArray` — nelas **um array passa como objeto**. Encolhe ~42 linhas e conserta 2 defeitos. Risco **baixo**. |
| **29** | `contaDoTeto` | ~10 linhas | **NÃO é cópia:** os 29 embrulham 4 funções diferentes (`donoAutenticado` 3x, `contaDoChamador` 3x, `chamadorAutenticado` 3x, `relatorAutenticado` 1x, e as outras variantes), cada uma com um tipo de `deps` próprio. Unificar exige genérico. Encolhe ~200 linhas, risco **médio** — mexe na aplicação de teto em 29 rotas. |
| 4 | `versaoExigida` / `versaoMudou` / `faltaVersao` / `slugOcupado` | 4–14 linhas | **ALVO CLARO.** O quarteto de If-Match otimista está em `network/application/encontro-da-comunidade.ts:106-115`, `network/application/rede-administrativa.ts:219-229`, `professionals/application/diretorio-administrativo.ts:114-137` e `store/application/catalogo-administrativo.ts:223-244`. `src/shared/http/if-match.ts` **já existe** e já é usado por todos para a leitura — só a parte de erro não foi compartilhada. Encolhe ~70 linhas. Risco **baixo-médio**: os `code` de `AppError` (`slug-taken`, `precondition-failed`, `precondition-required`) atravessam para o painel; mantê-los idênticos é o requisito. |
| 9 | `chamadorAutenticado` | ~12 linhas | mesma família de `contaDoTeto`. |
| 8 | `comoResposta` | varia | projeção de resposta por módulo; cada uma projeta uma entidade diferente. **Descartado** (ver §10). |

---

## 6. Frente B — função equivalente com nome diferente, TypeScript

Levantado por varredura dirigida. **Verifiquei pessoalmente 4 dos achados abaixo** (A.2,
A.3, A.4 acima e o B.1 a seguir); os demais estão marcados como **não reconferidos** e
precisam de uma olhada antes de virar tarefa.

### B.1 — `errosDeTexto`, três corpos e **dois comportamentos** (VERIFICADO)

| caminho | como conta o tamanho | recusa bidi? |
|---|---|---|
| `src/modules/network/domain/escrita-do-encontro.ts:175` → `:179` | `[...valor.trim()].length` (**code points**) | **sim** (`:177`) |
| `src/modules/store/domain/escrita-da-vitrine.ts:614` → `:620` | `valor.trim().length` (**UTF-16**) | não |
| `src/modules/professionals/domain/escrita-do-diretorio.ts:420` → `:426` | `valor.trim().length` (**UTF-16**) | não |

(Há um quarto parente, `errosDeTextoDeUsuario` em
`src/modules/network/domain/encontro-da-comunidade.ts:252`.)

Um nome com 15 emojis passa no limite de 30 da Rede e é recusado na Loja. E o painel
espelhou **cada lado fielmente** — `admin/src/rede/dominio/texto.ts:23` conta code
points; `admin/src/loja/formulario-do-produto.ts:158` e
`admin/src/diretorio/FormularioDaEntrada.tsx:251` contam `.trim().length`. **A
divergência tem três camadas.**

- O que seria feito: **decidir qual é a verdade antes de unificar.**
- Encolhe: ~17 linhas.
- Risco: **alto.** Unificar em code points afrouxa `CHECK`s de banco que medem
  `char_length`; unificar em UTF-16 aperta a Rede e muda contrato público. Isto é
  decisão do cliente, não refactoring.

### B.2 — o resto, por linhas economizáveis (**não reconferidos por mim**)

| ~linhas | o par | divergência |
|---|---|---|
| 45 | `admin/src/endereco/enderecos.ts:70`, `:117` e `admin/src/rede/dominio/link-do-convite.ts:35` ↔ `src/shared/url/endereco-completo.ts:89` (que **já é parametrizado**) | `HOST_LOCAL` do painel inclui `test\|lan\|corp`; o do shared não. `https://loja.test` é recusado no campo e aceito pela API |
| 33 | `src/modules/network/domain/escrita-do-encontro.ts:422` ↔ `src/shared/url/endereco-completo.ts:89` | o módulo **já importa o shared** para `errosDoInstagram` (`:524`) e não para este |
| 32 | `admin/src/rede/dominio/observacoes.ts:49` ↔ `src/shared/redaction/redigir.ts:150` (`canonizar`) | nenhuma hoje |
| 30 | `src/modules/messaging/domain/paginacao.ts:37,52,73` ↔ `src/modules/lostfound/domain/paginacao-de-candidatos.ts:41,48,67` | nenhuma |
| 28 | os três `criarContagemDe*Novos` em `network`, `lostfound`, `professionals` (`kysely-contagem-de-*.ts:49/50/51`) | só a coluna de tempo |
| 25 | `textoDaContagem`/`textoSemResultado` em 6 lugares de `admin/src` | `ListaDeEntradas.tsx:214` desiste e escreve texto fixo |
| 25 | `admin/src/rede/dominio/horario.ts:19,41` ↔ `src/modules/network/domain/encontro-da-rede.ts:331` ↔ `src/modules/messaging/domain/primeira-mensagem.ts:65` | servidor mede em segundo, painel trunca no minuto; a meia-noite "24" é consertada de dois jeitos |
| 20 | `src/shared/texto/moderacao.ts:182` ↔ `src/modules/network/domain/escrita-do-encontro.ts:202` | **deliberada** (`@`→`a` só na moderação). O comentário em `moderacao.ts:165-171` já explica. **Só o pipeline base dá para unificar** |
| 15 | `urlDeMidia` escrito 5 vezes com 5 nomes + inline em mais 5 módulos (`tag-service.ts:231`, `media-routes.ts:156`, `showcase-routes.ts:129`, `publicacao-routes.ts:197`, `projecao-publica-do-caso.ts:48`) e 8 lambdas iguais em `src/bin/api.ts` | nenhuma. **Alvo barato** |
| 15 | `plural` genérico **já existe** em `admin/src/comunicados/dominio.ts:170`; 5 seções têm a sua privada (`rede/dominio/lista.ts:62`, `loja/ListaDeProdutos.tsx:56`, `loja/ListaDeParceiros.tsx:21`, `diretorio/ListaDeEntradas.tsx:50`, `diretorio/FilaDeIndicacoes.tsx:79`) | nenhuma. **O mais barato da frente B** |
| 14 | `admin/src/api/problema.ts:10,46` ↔ `web/src/dominio/resultado.ts:26,35` | o painel aceita qualquer slug e **inventa 60s** quando não lê `Retry-After`; o site exige lista fechada e aceita data-HTTP |
| 12 | 4 clamps de `limit` (`paginacao.ts:73`, `paginacao-de-candidatos.ts:67`, `found-report-service.ts:301`, inline em `caixa-de-notificacoes-service.ts:49`) | `limit=0.5` dá `1` em dois e `20` no terceiro; e em `caixa-de-notificacoes` o teto **é** o padrão |
| 10 | `web/src/dominio/telas-do-encontro.ts:226` ↔ `admin/src/rede/dominio/valor.ts:33` | site mostra `R$ 15,00`, painel mostra `R$ 15` — e o cabeçalho de `valor.ts:3` afirma que mostra "a mesma forma" do app |
| 9 | `slugSugerido` em `admin/src/diretorio/dominio.ts:155` e `admin/src/loja/dominio.ts:183` ↔ `slugDoTitulo` em `escrita-do-encontro.ts:655` | `Hill's Pet` → `hills-pet` na Loja e `hill-s-pet` no Diretório. O comentário em `diretorio/dominio.ts:130-141` diz que repetiu de propósito "por fronteira de seção" — **e a fronteira produziu a divergência que ela queria evitar** |
| 9 | 4 `dd/mm/aaaa` em `admin/src` (`FilaDeIndicacoes.tsx:90`, `plaquinhas/fila.ts:216`, `moderacao/fila.ts:178`, `loja/dominio.ts:150`) | 3 usam o fuso do navegador, 1 fixa `America/Sao_Paulo`. A mesma linha de auditoria mostra datas diferentes em telas diferentes |
| <8 cada | `somenteDigitos` 2x em `admin/src/formato/`; `comoEtag` 2x + `versaoComoEtag`; `handleDoInstagram` byte a byte igual em `link-do-convite.ts:66` e `escrita-do-encontro.ts:483`; `hojeCivil`/`diaCivil` ↔ `diaCivilNoFuso` (`src/shared/idade/idade-minima.ts:106`, que **documenta por que a sua versão é a segura** e os dois clientes copiaram a frágil) | |

---

## 7. Frente C — função/widget equivalente, Dart (`app/lib`)

**Verifiquei pessoalmente C.1, C.2 e as reimplementações de `formato/`.** Os demais
pares estão **não reconferidos**.

### C.1 — Bloco de busca de CEP em 6 telas (VERIFICADO, ALVO №2)

`Future<void> _buscarOCep()` está definido em **exatamente 6 arquivos** (`git grep`):

| caminho | linha |
|---|---|
| `app/lib/telas/pet/tela_solicitar_plaquinha.dart` | 544 |
| `app/lib/telas/perfil/tela_endereco_de_entrega.dart` | 315 |
| `app/lib/telas/perfil/tela_dados_pessoais.dart` | 402 |
| `app/lib/telas/perto/sugerir_profissional.dart` | 334 |
| `app/lib/telas/rede/criar_encontro.dart` | 469 |
| `app/lib/telas/localizacao/captura_de_localizacao.dart` | 280 |

Três divergências (**não reconferidas uma a uma**, vindas da varredura):

1. `tela_dados_pessoais:418` e `tela_endereco_de_entrega:340` aceitam `endereco.uf` só
   por `length == 2`; as outras passam por `siglaDeEstadoValida`. **As duas primeiras
   podem gravar uma UF inexistente** devolvida por serviço de terceiro.
2. A guarda do CEP é `cepParaOContrato` numa tela e `_soDigitos(...).length != 8` nas
   outras cinco — **e as cinco já importam `formato/cep.dart`**, onde
   `cepParaOContrato` mora (`:128`).
3. Só `captura_de_localizacao:361` embrulha a linha de progresso em
   `Semantics(liveRegion: true)`. Nas outras cinco o leitor de tela **não ouve**
   "Buscando o endereço…".

- O que seria feito: um `widgets/campo_de_cep.dart` ou um mixin, com as chaves de erro
  por parâmetro.
- Encolhe: **~280 linhas** (estimativa).
- O que pode quebrar: cada tela mexe num mapa de erros com chave diferente
  (`_CamposDoPedido` / `'place.city'` / `'city'` / `_chaveCidade`), e
  `captura_de_localizacao` chama `_publicar()` **fora** do `setState`. Errar isso quebra
  a tela "Onde" do achado. Risco **médio**.

### C.2 — `class _UmaLinha` em 3 arquivos, **byte a byte idêntico** (VERIFICADO)

| caminho | intervalo | md5 do trecho |
|---|---|---|
| `app/lib/telas/perfil/meus_achados.dart` | 448-467 | `2437130f61d11b04aedafac28f15f386` |
| `app/lib/telas/perfil/meus_eventos.dart` | 883-902 | `2437130f61d11b04aedafac28f15f386` |
| `app/lib/telas/perdido/lista_de_perdidos.dart` | 1787-1806 | `2437130f61d11b04aedafac28f15f386` |

Conferido por `md5` dos três trechos: **iguais**. Só os comentários de doc diferem.

- O que seria feito: `app/lib/widgets/uma_linha.dart`.
- Encolhe: **40 linhas** (medida, não estimativa).
- Risco: **baixo**. É o alvo mais barato do relatório inteiro.

### C.3 — `formato/` existe e as telas não usam (VERIFICADO)

`app/lib/formato/quando.dart` é importado por **3 arquivos de produção**
(`telas/conexoes/convide_tutores.dart`, `telas/mensagens/area_de_mensagens.dart`,
`telas/pet/tela_detalhe_do_pet.dart`) — contado por `git grep -l`. Enquanto isso há
**12 formatadores de data escritos à mão**:

`api/modelos_diretorio.dart:1285`, `api/modelos_notificacao.dart:232`,
`api/modelos_loja.dart:522`, `telas/achado/tela_registrar_achado.dart:824`,
`telas/achado/textos_do_achado.dart:371`, `telas/escanear/tela_do_pet_da_tag.dart:197`,
`telas/perfil/meus_achados.dart:366`, `telas/perdido/cartao_do_perdido.dart:215`,
`telas/perdido/tela_onde_e_quando.dart:448`, `telas/seguranca/tela_de_bloqueados.dart:324`,
`telas/notificacoes/comunicado.dart:224`, `telas/rede/criar_encontro.dart:1496`.

Divergências levantadas (**não reconferidas**): `tela_registrar_achado.dart:824` e
`tela_onde_e_quando.dart:448` são **idênticos inclusive no comentário de doc** e
**nenhum dos dois chama `toLocal()`** — um `DateTime` em UTC sai um dia errado.
`modelos_notificacao.dart:232` e `comunicado.dart:224` escrevem `9h05` (sem zero);
`criar_encontro.dart:1496` escreve `09h05`.

- Encolhe: ~50 linhas. Risco **baixo** (o destino, `formato/quando.dart`, já existe).

### C.4 — o resto da frente C (**não reconferidos**)

| ~linhas | achado |
|---|---|
| 70 | `_TextosDoEndereco` (`tela_endereco_de_entrega.dart:760`) e `_TextosDaPlaquinha` (`tela_solicitar_plaquinha.dart:1140`): **20 constantes com valor idêntico**, e `digiteARua`/`digiteORua` são a mesma string com dois nomes. O trio de CEP se repete em mais 4 classes de texto |
| 45 | 13 `OutlinedButton` crus repetindo `minimumSize` que `app/lib/theme/bichu_theme.dart:104` **já aplica a todo `OutlinedButton`**, enquanto `BotaoSecundario` (`widgets/botao_primario.dart:204`) existe. 10 deles são redundância pura; os 3 de `AlvoDeToque.critico` (64 dp) precisam do override — **não são todos iguais** |
| 45 | `meus_achados._corpo()` (`:278`) ↔ `meus_eventos._porFase()` (`:465`): mesmo `enum _Fase`, mesmo spinner com `Semantics`, mesma `FaixaDeAviso`, mesmo laço. **Risco médio: o portão de enum sem valores lidos morde se fundir os dois `_Fase`** — extrair o corpo e deixar cada enum privado |
| 40 | `produto_da_loja._corpo()` (`:226`) ↔ `pagina_do_local._corpo()` (`:990`): mesma máquina de 4 fases; só o local tem o ramo `semConta`. **Risco médio: portão da árvore de telas** |
| 30 | folha de origem da foto em `telas/mensagens/tela_da_conversa.dart:429` ↔ `telas/pet/tela_editar_pet.dart:246`. Divergência: **`tela_da_conversa` não consulta permissão de câmera** e sempre a oferece como ação primária |
| 28 | rodapé de paginação reescrito à mão em `meus_achados.dart:309-335`, com `widgets/rodape_da_paginacao.dart:56` disponível — e a constante `'Carregar mais'` redeclarada em `meus_achados.dart:93`. **Risco médio:** `meus_achados` pagina por cursor e o widget decide por `carregados < total` |
| 25 | 5 redações do bloco "carregando": `liveRegion` presente em 3 de 5, `adaptive()` em 1, e `agenda_da_rede.dart:1212` usa esqueleto. Pode haver caso de `test/a11y/*` a cobrar |
| 25 | 3 cálculos de "quanto tempo faz": `formato/quando.dart:42`, `cartao_do_perdido.dart:192`, `tela_do_pet_da_tag.dart:197`. **As três redações são intencionalmente diferentes** (os comentários justificam) — unificar só o cálculo de dias e a tabela de meses |
| 22 | `'dd/mm/aaaa às HhMM'` 3x, com a hora sem zero em 2 e com zero em 1 |
| 20 | `_SeloDoEstado` (`minhas_indicacoes.dart:488`) ↔ `DistintivoDeSituacao` (`pecas_da_rede.dart:240`). **E `'Em análise'` é usado para `pending` numa e para `StatusDoAchado.aberto` na outra** |
| 14 | `'Ver mais'` (`tela_minhas_conexoes.dart:461`) ↔ `'Carregar mais'` (`rodape_da_paginacao.dart:90`) para a mesma ação, e a tela pagina pela regra exata do widget |
| 12 | 2 traduções de distância: `modelos_rede.dart:1355` dá `A cerca de 1 km da sua região` onde `lista_do_diretorio.dart:991` dá `a 450 m`, para o mesmo `distance_m` |
| 10 | `rotuloDeAtualizar = 'Atualizar'` declarado em **8 classes** contra `MensagensDeErro.tentarDeNovo` (`api/mensagens_de_erro.dart:178`) usado em 4 telas, e hardcoded em 2. A divergência de rótulo mais espalhada do app |
| 10 | `_soDigitos` com **8 definições** (3 privadas dentro de `formato/` + 5 em telas), em dois dialetos de regex |
| 6 | `'Cancelado'` literal em `cartao_do_encontro.dart:104` contra `rotuloDaSituacao` em `pecas_da_rede.dart:229`, com um terceiro literal de fallback em `agenda_da_rede.dart:1019` |

**Conferido como NÃO sendo problema:** `widgets/barra_de_listagem.dart` **não** está
sendo reimplementado — as 11 telas com recorte no corpo o importam, e `DropdownButton`
cru não aparece em lugar nenhum (controle positivo: `TextField` cru aparece em 2 telas,
logo o filtro casa). `RefreshIndicator` cru não existe fora de
`widgets/arrastar_para_atualizar.dart:171`. `validator:` dá **zero** ocorrências e isso
é verdade, não falha de filtro: o app não usa `Form`/`TextFormField`.

**Sobre o PR #95:** `3d199a18` *"o título sai da página do local, e a casca passa a ser
UMA"* **está** nesta árvore. A extração foi do título/casca de topo; `_Fase` e
`_corpo()` continuam duplicados por tela (item C.4, linha de 40). Os dois arquivos não
compartilham nenhum widget de corpo.

---

## 8. Frente G/H/F — comentário

### O enquadramento, antes da lista

| | linhas |
|---|---|
| comentário em `src/` produção | 44.702 |
| comentário em `app/lib` | 46.498 |
| comentário em `admin/src`+`web/src` | 29.717 |
| **total** | **~120.900** |
| dele, **duplicado literalmente** (medido, §H) | **218 — 0,18%** |
| dele, **comprovadamente mentindo** (medido, §G) | **3 trechos** |

**O comentário desta base é 99,8% único.** Qualquer alvo de "enxugar comentário" por
tamanho estaria apagando prosa datada e verificável. O cliente autorizou enxugar; a
medição diz que **não há o que enxugar por volume** — há 3 trechos a corrigir e 1
história a arquivar.

### G — comentário que MENTE (o grupo mais valioso)

**G.1 — `app/lib/telas/perto/lista_do_diretorio.dart:71-73` — ainda na `development`**

```
71: ///   isso. **`avaliacao` tambem saiu desta lista**:
72: ///   `DirectoryEntrySummary.rating` entrou no contrato em 18/10 e o cartao
73: ///   mostra a media e a quantidade.
```

O mesmo arquivo, na linha 1016, documenta o contrário:

```
1016: // | media e contagem          | `_BlocoDaPontuacao`, secao `Avaliacoes`  |
```

— numa tabela intitulada *"o que saiu do cartão"*, por pedido literal do cliente
(`:1005-1007`). **Conferido no código:** `awk` sobre as linhas não-comentário de
`lista_do_diretorio.dart` encontra **zero** ocorrência de `rating`/`avaliac`/`pontuacao`.
Controle positivo: a mesma varredura em `pagina_do_local.dart` acha 5 na hora. **O
cartão não pinta avaliação; o comentário de topo diz que pinta.**

- O que seria feito: corrigir as linhas 71-73. ~3 linhas.
- **O que pode quebrar / o cuidado:** existe trabalho em voo que torna o comentário
  verdadeiro de novo — `b8859751 feat(BICHUS-313): a nota na listagem da Comunidade,
  variacao A`. **Não apagar o parágrafo**: corrigir o tempo verbal e datar. E a
  justificativa sobre misturar eixos que foi revertida no mesmo dia é precedente: o
  conserto aqui é de uma frase, não do bloco.

**G.2 — `sonar-project.properties:81` — erra por 6x**

```
81: # que existe so roda em SonarQube auto-hospedado. Os 41 arquivos de `app/lib`
82: # ficam fora desta analise, e dizer o contrario seria a confianca falsa do
```

`app/lib` tem **237** arquivos `.dart` (234 sem `.g.dart`), não 41. A afirmação
estrutural ("Dart fica fora do Sonar") continua certa; **o número que mede o buraco
está errado por 6x**, e é esse número que alguém usaria para julgar o risco de não
analisar Dart.

- Encolhe: 0 (troca de número). Risco **baixo**.
- Sugestão: trocar o literal por uma frase sem número, ou pôr a data da contagem —
  senão mente de novo na semana que vem.

**G.3 — a contagem de telas da barra fixa, em dois lugares**

| caminho | o que afirma | real |
|---|---|---|
| `app/lib/telas/casca_com_abas.dart:1335` | "as **29** rotas empilhadas desta árvore" | **37** |
| `app/test/telas/barra_fixa_em_toda_tela_test.dart:830-836` | era "a barra está aqui" em **29** telas; agora é 2 e "**27**" não; "as **29** rotas têm builders diferentes" | **2 + 35 = 37** |

Contado por `awk` nas duas listas do próprio teste (`telasDePrimeiroPlano` nas linhas
131-164: **2** entradas; `telasInternas` nas 165-455: **35**). O arquivo cresceu e a
prosa ao lado não.

- Encolhe: ~0. Risco **baixo**.
- Sugestão: trocar o número por `telasInternas.length` no texto do caso, para a prosa
  não poder divergir da lista que ela descreve.

### Caçada que deu NEGATIVO — e por que o negativo vale

Escrevi dois detectores para achar mais mentira, e **os dois acharam zero**. Registro
isso porque o zero foi provado, não presumido:

1. **Comentário citando símbolo que não existe mais.** Colhi os 2.517 identificadores
   entre crase nos comentários de `app/lib` e cruzei com `git grep -w` no repositório
   inteiro: **0 fantasmas**. Controle positivo: `BarraDeListagem` aparece em 37
   arquivos; um identificador inventado aparece em 0. O filtro casa.
2. **Identificador citado só em prosa, nunca em código**, nos 1.469 arquivos de
   `src`/`app`/`admin`/`web`/`tests`/`infra`/`.github`: 565 candidatos, e **nenhum é
   mentira**. Os que pareciam (`AbaPerto`, `ShellRoute`, `TelaDoMural`) documentam a
   ausência **de propósito e com data** — `app/lib/telas/abas.dart:453` diz
   *"**`AbaPerto` NAO EXISTE MAIS, e a ausencia e o contrato (19/10/2026)**"*. Esses
   **ficam**. O resto são SHAs, classes do framework Flutter, nomes de regra de lint e
   identificadores SQL.

Também conferi 4 afirmações numéricas que *pareciam* mentir e **não mentem**, porque
são registro datado e não afirmação de presente — **estas ficam**:
`infra/suite/executar-unitaria.mjs:243` (log de execução transcrito),
`infra/verificacao/verificar-cobertura-lcov.mjs:916` ("Até 22/09 esta linha imprimia…"),
`app/lib/api/contadores_api.dart:20` ("Medido nesta árvore em 20/10/2026"),
e os `"app/lib/telas tem 89 arquivos na base e 89 aqui"` de
`app/test/dispositivo/porta_nao_contornada_test.dart` (medição de mescla, com data).

**Vale olhar, mas não é mentira:** `contadores_api.dart:20` mediu "zero ocorrências nas
**80** migrações" em 20/10. Hoje há **97** migrações. A conclusão pode ter mudado nas 17
novas; a frase, por ser datada, está correta.

### H — comentário duplicado literalmente

Medido com script próprio: bloco de 3+ linhas consecutivas de comentário, com 120+
caracteres não-brancos, idêntico em 2+ lugares.

| alvo | blocos | linhas economizáveis |
|---|---|---|
| `src/` produção | 8 | **67** |
| `app/lib` | 20 | **148** |
| `admin/src`+`web/src` | 1 | **3** |
| **total** | **29** | **218** |

Os maiores:

| linhas × lugares | o bloco |
|---|---|
| 6 × **6** = 30 | `/// A BUSCA QUE O ARRASTO REFAZ (cliente, 18/10/2026).` em `telas/loja/vitrine_da_loja.dart:172`, `telas/perfil/meus_pets.dart:178`, `telas/perdido/lista_de_perdidos.dart:507`, `telas/perto/minhas_indicacoes.dart:170`, `telas/perto/lista_do_diretorio.dart:169`, `telas/rede/agenda_da_rede.dart:215` |
| 7 × 4 = 21 | `/// O arranque roda em didChangeDependencies, e nao em initState.` em `telas/pet/tela_cadastrar_foto.dart:53`, `telas/pet/campos_do_pet.dart:131` e `:542`, `telas/pet/tela_pet_cadastrado.dart:85` |
| 5 × 4 = 15 | `// O ARRASTAR-PARA-ATUALIZAR (cliente, 18/10/2026)` em `telas/perfil/vitrine_de_fotos.dart:455`, `telas/perfil/meus_achados.dart:260`, `telas/mensagens/area_de_mensagens.dart:643`, `telas/notificacoes/caixa_de_notificacoes.dart:542` |
| 17 × 2 = 17 | `src/modules/people/application/perfil-de-pessoa.ts:79-95` ↔ `src/modules/people/ports/perfil-de-pessoa-repository.ts:63-79` |
| 14 × 2 = 14 | `src/modules/publications/ports/publicacoes-repository.ts:98-111` ↔ `:161-174` (mesmo arquivo) |
| 11 × 2 = 11 | `app/lib/api/modelos_diretorio.dart:257-267` ↔ `:1120-1130` (mesmo arquivo) |
| 9 × 2 = 9 | `src/bin/api.ts:252-260` ↔ `src/bin/worker.ts:258-266` |
| 4 × 3 = 8 | `// O QUE NAO E FalhaDeChamada.` em `tela_editar_pet.dart:523`, `tela_cadastrar_sinais.dart:142`, `tela_esqueci_minha_senha.dart:137` |

- O que seria feito: o texto fica num lugar (um `doc comment` de widget compartilhado,
  ou um arquivo de decisão rastreado em `design/*.json`), e os outros N−1 referenciam.
- Encolhe: **218 linhas** (medida).
- Risco: **baixo**, com uma ressalva real: esses blocos **são** a decisão datada do
  cliente de 18/10, e uma referência indireta é menos legível que a cópia. Os de 6 e 4
  lugares valem; os de 2 lugares provavelmente não valem a indireção. **Recomendo só os
  três primeiros (66 linhas) e deixar o resto.**

### F — histórico encadeado em constante de portão

Medido: linhas com 1.200+ bytes que contêm `//`, fora de arquivo gerado.

| bytes | caminho:linha | o que é |
|---|---|---|
| **26.645** | `app/test/dispositivo/porta_nao_contornada_test.dart:2847` | comentário de cauda de `const String _arvoreDasTelas`: **15 entradas datadas, 9 referências BICHUS, 5 "ANTERIOR"**, numa linha |
| **19.489** | `app/test/widgets/vocabulario_do_produto.dart:904` | o mesmo padrão em `const int ocorrenciasDeBichu` |
| 8.029 / 5.855 / 5.747 / 5.626 / 5.137 | `porta_nao_contornada_test.dart:1544, 1550, 1530, 1543, 1507` | outras cinco gerações |
| 2.366 / 2.265 / 1.724 / 1.571 / 1.537 / 1.526 / 1.484 | `porta_nao_contornada_test.dart:1604, 1540, 1548, 1058, 1439, 1377, 1057` | |
| **89.001** | **total em 14 linhas, 2 arquivos** | |

`porta_nao_contornada_test.dart` tem 269.309 bytes em 3.197 linhas; **69.512 bytes
(26%) são essas 13 linhas de cauda.**

**Não proponho apagar.** O briefing é explícito e a razão está dentro do próprio texto:
a última entrada termina com *"ESTE VALOR NAO SOBREVIVE A PROXIMA UNIAO: quem mesclar
`app/lib/telas` de novo recalcula, nunca escolhe um dos lados"* — e registra a armadilha
do modificador `:a` do zsh, reproduzida duas vezes.

**Critério proposto (decisão do cliente):**

1. **Na linha da constante ficam as 3 gerações mais recentes**, completas. Três porque é
   o que cobre uma onda de integração: a base, a última mescla e a atual — é o
   intervalo em que alguém recalcula o valor e precisa do porquê na mão.
2. **O resto vai para um arquivo rastreado ao lado**, não para `docs/` (que não entra no
   git): `design/historico-do-portao-da-arvore-de-telas.json`, com um campo por geração
   (`sha`, `data`, `bichus`, `prosa`). `design/*.json` é onde o portão já cobra o que
   precisa sobreviver.
3. **A linha da constante referencia o arquivo por caminho** — e um caso de teste confere
   que o arquivo existe e que o `sha` do topo dele é o da constante. Sem esse caso, o
   arquivo apodrece e a memória vira ficção.
4. **Nada é apagado nesta rodada.** Primeiro o arquivo e o caso existem e passam;
   depois a prosa sai da linha, num commit que só move texto.

- Encolhe: **~85.000 bytes** em 2 arquivos de teste (não conta como linha de produção).
- Risco: **médio.** Mexer em `porta_nao_contornada_test.dart` mexe no portão da árvore
  de telas, que colide em toda mescla; fazer isso enquanto 3 sessões escrevem na
  `development` é pedir conflito. **Fazer numa janela sem frente ativa no app.**

---

## 9. Frente I — o que não tem teste

### O que eu NÃO pude medir, e por quê

**Não há `lcov` desta árvore.** Os dois relatórios que existem no checkout principal
(`jarvis-ai/workspace/bichu/coverage/lcov.info` e `lcov-integracao.info`) são de
**7 de outubro**, 21 dias atrás, e cobrem **193 e 164 arquivos** quando `src/` produção
tem **397**. Usá-los seria medir outra árvore. **E não rodei a suíte** — a máquina está
com carga alta e há integração rodando (o briefing pediu para não disputar).

Então o que segue é **proxy estático, não cobertura de linha**, e está dito.

### I.1 — Alcance estático: 13 arquivos, e os 13 já estão justificados

Montei o grafo de importes de `src/` + `tests/` (resolvendo `.ts`/`index.ts`, importe
estático e dinâmico) e fiz BFS a partir dos **362** arquivos de teste.

| | |
|---|---|
| arquivos de produção em `src/` | **397** |
| alcançados por importe a partir de algum teste (transitivo) | **384** |
| **não alcançados por teste nenhum** | **13** |

Cruzando com `AUSENCIAS_ACEITAS` (`infra/verificacao/verificar-cobertura-lcov.mjs:180`,
**83 entradas** — bate exatamente com o número do briefing):

**Todos os 13 estão na lista e estão justificados. Zero descobertos sem justificativa.**

```
src/bin/api.ts
src/bin/worker.ts
src/modules/app-release/adapters/persistence/kysely-politica-de-versao.ts
src/modules/identity/adapters/persistence/kysely-passkey-repository.ts
src/modules/media/adapters/persistence/kysely-fotos-do-achado.ts
src/modules/notifications/adapters/persistence/kysely-comunicados.ts
src/modules/notifications/adapters/persistence/kysely-registro-de-entregas.ts
src/modules/pets/adapters/persistence/kysely-reference-data-repository.ts
src/modules/professionals/adapters/persistence/kysely-canal-verificado-do-chamador.ts
src/modules/professionals/adapters/persistence/kysely-directory-suggestion-repository.ts
src/modules/sections/adapters/persistence/kysely-marcadores-de-secao.ts
src/modules/tags/adapters/persistence/kysely-endereco-do-pet.ts
src/modules/tags/adapters/persistence/kysely-leitura-do-aviso-ao-tutor.ts
```

Controle positivo do cruzamento: a primeira entrada da lista
(`src/modules/admin-access/ports/aviso-por-email.ts`) casa. O filtro não é cego.

**Saúde da lista:** nenhuma das 83 entradas apodreceu — todas existem no disco. **70 das
83** são alcançadas por importe de teste; são as portas só-tipo, cujo compilado não tem
instrução — exatamente a razão escrita no topo da lista. A lista está honesta.

**Limite desta medida, dito:** alcance por importe **não é** cobertura. Um arquivo
alcançado pode ter 3% de linha coberta. O que esta medida prova é o contrário: **nenhum
arquivo de `src/` está completamente fora do alcance da suíte sem justificativa escrita.**
Para o número de linha é preciso um `lcov` fresco.

### I.2 — BICHUS-310: as linhas novas de hoje

62 commits na `development` hoje. Diferença contra o último commit de ontem
(`d5c382dc`):

| área | adicionadas | removidas | arquivos |
|---|---|---|---|
| `src/` produção | **+1.331** | −76 | 17 |
| `src/` teste | +1.954 | −11 | 13 |
| `app/lib` | +2.322 | −27 | 16 |
| `app/test` | +2.048 | −11 | 10 |
| `tests/` integração | +346 | 0 | 1 |
| `admin/src` | +200 | −15 | 1 |
| `web/src` | +201 | −15 | 2 |

Dos **17** arquivos de produção de `src/` tocados hoje, cruzando "tem `.test.ts` irmão",
"é citado por algum arquivo de `tests/integration`" e "está em `AUSENCIAS_ACEITAS`":

| arquivo | irmão | integração | ausência aceita | veredito |
|---|---|---|---|---|
| `src/modules/identity/adapters/http/passkey-routes.ts` | não | **0** | não | **ALVO** |
| `src/modules/identity/application/passkey-service.ts` | não | **0** | não | **ALVO** |
| `src/shared/http/conformidade-de-resposta.ts` | não | **0** | não | **ALVO** |
| `src/bin/api.ts` | não | 29 | **sim** | coberto pelo motivo escrito |
| `src/modules/lostfound/ports/leitura-publica-do-caso.ts` | não | 1 | **sim** | idem |
| `kysely-found-report-repository.ts` | não | 5 | não | integração cobre |
| `kysely-leitura-publica-do-caso.ts` | não | 1 | não | integração cobre |
| `kysely-directory-repository.ts` | não | 4 | não | integração cobre |
| `src/shared/http/errors.ts` | não | 11 | não | integração cobre |
| os outros 8 | **sim** | — | — | ok |

Os três alvos, por risco (quanto o arquivo decide × quão descoberto está):

1. **`src/shared/http/conformidade-de-resposta.ts`** — 215 linhas não vazias, exporta
   `desviosDaResposta` e `desviosEmTexto`. **É importado por exatamente 1 arquivo**
   (`src/modules/identity/adapters/http/passkey-grafia.test.ts`) e por mais nenhum. Ou
   seja: **o verificador que vai dizer se o corpo da resposta confere com o contrato não
   tem nenhum teste próprio.** Isso casa com a lacuna já conhecida de que nada confere o
   corpo da resposta. **Risco mais alto dos três:** um falso "APROVADO" aqui é invisível.
2. **`src/modules/identity/application/passkey-service.ts`** — há testes de passkey
   (`passkey-grafia.test.ts`, `passkey-desafio-de-uso-unico.test.ts`,
   `domain/passkey.test.ts`, `rotas-registradas-contra-o-contrato.test.ts`), mas nenhum
   `.test.ts` irmão do serviço e nenhum arquivo de integração que o nomeie. Autenticação.
3. **`src/modules/identity/adapters/http/passkey-routes.ts`** — mesma situação, na borda.

---

## 10. Não mexer — o que achei e descartei, com o motivo

Esta seção vale tanto quanto a lista de alvos.

| o que | por que NÃO |
|---|---|
| **Enxugar comentário por volume** | 120.900 linhas de comentário, das quais **218 (0,18%)** são duplicadas e 3 trechos mentem. O resto é decisão datada e armadilha medida. Cortar por tamanho apagaria exatamente o que diagnosticou três defeitos hoje. **Não há alvo de volume aqui.** |
| **Apagar o histórico de `_arvoreDasTelas`** | O briefing proíbe e o texto se defende: ele explica por que o valor é o que é e já salvou medição. Proposta é **arquivar com caso de teste**, não apagar (§F). |
| **Os comentários que documentam ausência** — `AbaPerto` (`app/lib/telas/abas.dart:453`), `ShellRoute` (`casca_com_abas.dart:1381`, `roteamento/rotas.dart:945`), `TelaDoMural` | Pareciam fantasmas no meu detector. São declarações datadas de que algo **deixou de existir de propósito**, e a ausência é o contrato. Apagar reabre a decisão. |
| **`infra/suite/executar-unitaria.mjs:243`** ("2782 casos em 199 arquivos") | Parece número velho. É **transcrição de um log de CI** (run 39130666267) que documenta o defeito do caso cancelado. Número histórico, correto no contexto. |
| **`verificar-cobertura-lcov.mjs:916`** ("os 71 arquivos de TESTE") | "Até 22/09 esta linha imprimia…" — passado, datado. |
| **`app/lib/api/contadores_api.dart:20`** ("nas 80 migrações") | "Medido nesta árvore em 20/10/2026". Hoje são 97; a frase datada continua verdadeira. **Vale remedir a conclusão, não corrigir a frase.** |
| **Os `"89 arquivos na base e 89 aqui"`** de `porta_nao_contornada_test.dart` | Registro de verificação de mescla, com data. É a prova de que ninguém perdeu arquivo. |
| **Duplicação `src/` ↔ `web/`/`admin/` como alvo de unificação textual** | jscpd achou **1 clone de 15 linhas** cruzando projeto. A fronteira de processo está respeitada. O problema cruzado é o cliente gerado (A.1) e a divergência de regra (A.2–A.4) — **naturezas diferentes, tratamentos diferentes.** |
| **`comoResposta` nos 8 arquivos** | Mesmo nome, entidades diferentes. Cada uma projeta um agregado próprio; unificar criaria um tipo-união que o `tsc` aceita e o domínio não (há memória sobre união duplicada passar por `tsc`, lint e 3.940 casos). |
| **`contaDoTeto` em 29 arquivos** como cópia | Não é cópia: 4 funções internas distintas, 4 tipos de `deps`. Fica na lista como alvo **médio** com genérico, não como achado barato. |
| **Unificar `errosDeTexto` sem decisão prévia** | É contrato público e `CHECK` de banco. **Risco alto.** Vira pergunta para o cliente, não tarefa. |
| **`moderacao.ts` ↔ `escrita-do-encontro.ts` (`normalizarPara*`)** | A divergência é **deliberada** e já documentada em `moderacao.ts:165-171`: `@`→`a` na moderação, e **não** na conferência de contato, onde `@` é sinal. Unificar ingenuamente apaga o detector de `@usuario`. |
| **Fundir os `enum _Fase` das telas Dart** | O portão `enum-sem-valores-lidos` reprova valor que uma das telas não leia. Extrair o **corpo** sim; fundir o enum, não. |
| **`BotaoSecundario` nos 3 `OutlinedButton` de `AlvoDeToque.critico`** | Reduz o alvo de toque de 64 para 48 dp e pode reprovar isca de acessibilidade. Só os 10 de `min` são seguros. |
| **As 3 redações de "quanto tempo faz"** | São intencionalmente diferentes e os comentários justificam cada uma. Unificar o **cálculo**, nunca o texto. |
| **`admin/src/loja/Tags.tsx` (404 L em 22 clones) como alvo isolado** | É o arquivo mais clonado do painel, mas os pares são com 5 arquivos diferentes. Vale um componente de lista do painel, não um conserto local — e isso é desenho, que no Bichu passa pelo Figma/protótipo antes do código. |
| **`eslint .` na raiz para apoiar a medição** | Estoura memória por causa dos worktrees dentro do repositório. Não usei. |
| **Remover worktree do acumulado** | É decisão do cliente. §11 é **levantamento**, e removi **só o meu**. |

---

## 11. Frente J — o acúmulo de worktree (levantamento, não limpeza)

### Medido agora

| | |
|---|---|
| worktrees registrados no git | **385** |
| `prunable` segundo o git | 1 (`/private/tmp/wt-fk-reauth`) |
| registro órfão (pasta inexistente) | **0** |
| `builds/` | 21 pastas, **9,4 GB** (medido) |
| `worktrees-app/` | 132 pastas, **56,7 GB** (medido) |
| pastas `tmp-*` na raiz | 61 |

O número de 385 confere com o do briefing. **Correção de método:** meu primeiro resumo
disse "0 sujos e 385 não mesclados" — era bug do meu script, não dado. Usei `print -r`
no zsh, que **não expande `\t`**, e o separador ficou literal; o `awk -F'\t'` não casou
e devolveu zero de tudo. Reparseado, os números abaixo são os reais.

### Os três grupos

**GRUPO 1 — branch já mesclada na `development` E árvore limpa → removível: 329**

Destes, **6 foram mexidos nas últimas 8 horas** e podem estar em uso por frente viva
agora, mesmo com árvore limpa e branch mesclada. **Esses saem do grupo 1:**

```
builds/medicao-refactor-28-10              (0h — este, eu removo no fim)
jarvis-ai/workspace/bichu-wt-loja-cupom-28-10   (5h)
wt-bichus-313                              (5h)
wt-sonar-teto-28-10                        (5h)
jarvis-ai/workspace/bichu-wt-sonar-stacktrace   (6h)
worktrees-app/sonar-erro-28-10             (7h)
```

**Grupo 1 seguro: 323 worktrees.**

Espaço liberado:

| | |
|---|---|
| 116 do grupo 1 com `du` **medido** (em `builds/` e `worktrees-app/`) | **50,6 GB** |
| 213 sem `du` medido (quase todos em `jarvis-ai/workspace`) | **~99 GB — ESTIMATIVA** |
| **total** | **~150 GB — ESTIMATIVA** |

A estimativa é a média de uma **amostra de 11** desses 213, medida de fato (5,1 GB,
média 0,46 GB), multiplicada por 213. É consistente com os 157 GB de
`jarvis-ai/workspace` do briefing, mas **é estimativa e está dito**. A amostra tem
variância alta (de 34 MB a 1,6 GB), então o intervalo honesto é **~90 a ~120 GB** para
os 213, ou **~140 a ~170 GB** no total.

**GRUPO 2 — com alteração não comitada → TEM TRABALHO DENTRO, NÃO TOCAR: 19**

| arquivos sujos | mesclada | idade | caminho |
|---|---|---|---|
| 8 | sim | 173h | `worktrees-app/piso-da-busca` |
| 6 | **não** | 144h | `worktrees-app/prosa-da-busca` |
| 5 | sim | 145h | `jarvis-ai/workspace/bichu-wt-busca-digitar` |
| 5 | sim | 51h | `jarvis-ai/workspace/bichu` ← **checkout principal, nunca remover** |
| 5 | sim | 49h | `worktrees-app/achado-foto-nome-26-10` |
| 5 | **não** | 199h | `worktrees-app/icones-da-barra` |
| 4 | sim | 194h | `jarvis-ai/workspace/bichu-wt-build-1ff67840` |
| 4 | sim | 49h | `worktrees-app/perdido-tutor-df2695fe` |
| 3 | sim | 158h | `jarvis-ai/workspace/bichu-wt-estab-21-10` |
| 2 | sim | 249h | `jarvis-ai/workspace/wt/lote-oito-18-10` |
| 2 | sim | 199h | `jarvis-ai/workspace/bichu-wt-deadlock-linha-base` |
| 1 | sim | 725h | `jarvis-ai/workspace/wt/tetos-invalidas` |
| 1 | sim | 242h | `builds/ios-f8c74714` |
| 1 | sim | 218h | `worktrees-app/lote-19-10` |
| 1 | sim | 218h | `builds/lote-458cd005` |
| 1 | sim | 213h | `builds/lote2-fb3a0fba` |
| 1 | sim | 141h | `worktrees-app/diag-pr61-onda8-899cf227` |
| 1 | sim | 7h | `builds/hml-46d0587c` |
| 1 | **não** | 1h | `builds/menu-unificado-675c516c` ← **JA REMOVIDO pela propria sessao** (ver nota) |

> **Nota de validade deste levantamento.** Entre a medição e a entrega deste relatório
> (cerca de 40 minutos), `builds/menu-unificado-675c516c` **foi removido pela própria
> sessão que o usava** — a pasta não existe mais e os dois ramos
> (`desenho/menu-unificado-28-10` e `trabalho/menu-unificado-28-10`) continuam no
> repositório. O registro caiu de 385 para 383 (esse mais o meu). **A foto envelhece em
> minutos:** reconferir `git worktree list` e `git status --porcelain` de cada candidato
> imediatamente antes de remover, não confiar nesta tabela.

Os três com `mesclada=não` e árvore suja (`prosa-da-busca`, `icones-da-barra`,
`menu-unificado-675c516c`) são os que têm mais a perder: trabalho **não comitado** sobre
branch **não integrada**. Medido com `git status --porcelain --no-optional-locks` para
não escrever no index de outra sessão.

**GRUPO 3 — em uso por frente viva agora → fica: 13 mexidos nas últimas 8h**

```
 0h  builds/diretorio-28-10                               (não mesclada)
 0h  worktrees-app/wt-pagina-do-local-28-10                (não mesclada)
 0h  builds/medicao-refactor-28-10                         (este)
 1h  jarvis-ai/workspace/bichu-wt-estrelas-listagem-28-10  (não mesclada)
 1h  builds/menu-unificado-675c516c                        (ja removido pela propria sessao)
 5h  tmp-estrelas-313-28-10                                (não mesclada)
 5h  tmp-menu-unificado-28-10-tmpdir                       (não mesclada)
 5h  jarvis-ai/workspace/bichu-wt-loja-cupom-28-10
 5h  wt-bichus-313
 5h  wt-sonar-teto-28-10
 6h  jarvis-ai/workspace/bichu-wt-sonar-stacktrace
 7h  worktrees-app/sonar-erro-28-10
 7h  builds/hml-46d0587c                                   (SUJA)
```

**Limite desta medida, dito:** "em uso agora" foi inferido por `mtime` da pasta, não por
processo vivo. Uma frente que está lendo e não escrevendo há 9 horas cai fora. **Antes de
remover qualquer coisa do grupo 1, confirmar com as sessões abertas.**

**Resto: 37 worktrees com árvore limpa e branch NÃO mesclada** — trabalho comitado e
nunca integrado. Não é grupo 1 (a branch tem commit que a `development` não tem) nem
grupo 2 (não há nada por comitar). Os mais antigos (840h = 35 dias):
`bichu-wt-tokens-web` (`design/tokens-web`), `bichu-wt-adr-site` (`docs/adr-site-web`),
`bichu-wt-cd` (`infra/cd-tres-containers`), `bichu-wt-achado`
(`docs/achado-sem-conta-e-pontos`). **Esses merecem uma decisão de "integra ou
descarta", não uma remoção.** A lista completa dos 37 saiu na medição e pode ser
reproduzida com o script em `/private/tmp/…/scratchpad/med/classificar-wt.sh`.

### Por que isto entra num relatório de qualidade de código

- `eslint .` na raiz **estoura memória** por causa dos worktrees dentro do repositório —
  é por isso que o lint só roda pelo alvo do Makefile, e é por isso que eu não o usei
  nesta medição.
- A **pilha do `git stash` é compartilhada** entre os 385, e é por isso que `git stash`
  é proibido no projeto.
- O `jscpd` precisou de `--ignore '**/node_modules/**'` explícito; sem isso a varredura
  de `src/` arrastaria árvore de worktree aninhada.

**Não removi nada além do meu próprio worktree.** A limpeza do acumulado é decisão do
cliente.

---

## 12. O que eu NÃO medi

1. **Cobertura de linha de verdade.** Não há `lcov` desta árvore (os que existem são de
   7/10, com 193+164 arquivos contra 397) e eu **não rodei a suíte**. Tudo no §9 é proxy
   estático de alcance por importe. **Para BICHUS-310 valer como número, falta um `lcov`
   fresco** — e isso precisa de uma janela sem integração rodando.
2. **Cobertura de `app/lib`, `admin/src` e `web/src`.** O Sonar não analisa Dart, e eu
   não rodei `flutter test --coverage` nem a suíte do admin. **Zero medição de cobertura
   fora de `src/`.**
3. **Duplicação em `.astro`, `.css`, `.svg`, SQL e YAML.** O jscpd tratou os 36 `.astro`
   como `javascript` (33 deles passaram do piso de token); CSS, migrações e workflows
   ficaram fora inteiramente. **97 migrações e 9 CSS não foram medidos.**
4. **`src/` gerados e `app/lib/*.g.dart`.** Excluídos de propósito (3 e 3 arquivos),
   exceto a constatação do md5 em A.1.
5. **`cypress/`, `app/test/`, `admin/test/`, `tests/` e `infra/` como alvo de
   duplicação.** Medi comentário e histórico em `app/test`, mas **não rodei jscpd em
   nenhuma suíte** — e as suítes somam 85.009 + 241 arquivos Dart + 59 de integração. Há
   quase certamente duplicação de `setup`/`fixture` ali, e ela não está neste relatório.
6. **Complexidade, acoplamento e tamanho de função.** Nenhuma métrica além de linha e
   clone textual. Os 12 arquivos de `src/` com mais de 1.000 linhas (17.144 no total,
   liderados por `shared/db/schema.ts` com 2.842 e `identity/application/auth-service.ts`
   com 2.388) **não foram avaliados como alvo de quebra**.
7. **Se os pares da frente B e C realmente se comportam igual em execução.** Li código;
   não executei nada. Marquei como "não reconferido" o que não abri eu mesmo.
8. **O impacto real de cada unificação na esteira.** Não rodei `portoes rapidos` nem
   nada. Os "o que pode quebrar" são leitura de portão, não medição.
9. **`du` exato dos 213 worktrees do grupo 1 em `jarvis-ai/workspace`.** Amostra de 11.
   O ~99 GB é estimativa com intervalo de ~90 a ~120 GB.
10. **Processo vivo por worktree.** O grupo 3 foi inferido por `mtime`, não por `ps`.

### Onde estimei, e está dito

| número | base |
|---|---|
| ~420 linhas (frente B), ~800 (frente C) | soma de estimativas por par; **4 pares da B e 3 da C foram reconferidos por mim, o resto não** |
| ~99 GB dos 213 worktrees | amostra de 11, média 0,46 GB |
| "3 gerações" como critério de arquivo do histórico | **proposta minha**, sem medição que a sustente — é um palpite informado sobre o intervalo de uma onda de integração, e o cliente pode preferir 2 ou 5 |
| ~250 linhas da frente D | `ehObjeto` é medida (3 × 14 = 42); `contaDoTeto` é estimativa (10 × ~20) |

### Números que são medida, não estimativa

Linhas e arquivos de §0; os 36/63/15 clones e 562/1.140/291 linhas do jscpd; os 2,52/3,28/6,49% de `min-lines 5`; os 218 de comentário duplicado; os 89.001 bytes de histórico; os 92 nomes duplicados em `src/`; os 13 não alcançados e o cruzamento com as 83 ausências; os 24.383 do md5 idêntico; 47 vs 9 TLDs; o md5 igual do `_UmaLinha`; 6 definições de `_buscarOCep`; 3 importes de `formato/quando.dart`; 237 vs 41 arquivos de `app/lib`; 37 vs 29 telas da barra; 385/329/19/37 worktrees; 9,4 GB de `builds/` e 56,7 GB de `worktrees-app/`.
