# ADR-0030: registro concorrente é um arquivo por entrada, não um arquivo compartilhado
**Status:** aceito
**Data:** 2026-09-23

## Contexto

Vinte e quatro papéis escrevem em paralelo, a partir de mais de cem worktrees,
em um punhado de arquivos compartilhados. Em 23/09 o mesmo defeito apareceu três
vezes em um dia:

1. Um agente sobrescreveu a linha de outro em `.jarvis/entregas.md`. Ele colou
   no que julgava ser o fim do arquivo; o fim já era a linha de outro agente,
   acrescentada entre a leitura e a escrita. Só apareceu porque ele conferiu o
   resultado.
2. Duas ADRs nasceram com o número 0024 em branches diferentes. Nomes de arquivo
   diferentes não conflitam, então o merge juntou as duas em silêncio, e o
   conserto custou cerca de 55 referências trocadas linha a linha.
3. Um agente renumerou os achados de outro em `docs/04-seguranca.md`, num arquivo
   que foi de 3.896 para 5.110 linhas entre a escrita de um e a releitura do
   outro.

O mecanismo é sempre o mesmo. **"Acrescentar ao fim" não é uma operação.** Toda
ferramenta de edição lê o arquivo inteiro, altera em memória e grava o arquivo
inteiro de volta; entre a leitura e a gravação cabe a escrita de outro agente, e
quem grava por último grava por cima. O resultado não fica corrompido — fica
plausível, com uma entrada a menos. Não há marcador de conflito, não há buraco
na numeração, e nada avisa.

A tentativa anterior de resolver isso foi um aviso no topo do arquivo, escrito em
17/09: *"este arquivo é escrito EM SÉRIE. Acrescente sua linha no fim; nunca
sobrescreva. Já houve perda de entradas duas vezes por escrita concorrente."*
Ele não impediu nada, e não podia: a regra dependia de cada agente lembrar dela
no instante certo, e o modo de falha não passa pela lembrança de ninguém.

Agrava tudo o fato de `.jarvis/` e `docs/` estarem no `.gitignore` por decisão do
cliente, reafirmada em 23/09. **Não há `git log`, não há `git checkout`, e nesta
máquina não há Time Machine nem snapshot APFS.** O que foi sobrescrito nesses
dois diretórios é irrecuperável e, pior, incontável.

## Decisão

**Onde vários agentes registram entradas independentes, cada entrada é um
arquivo, e o nome do arquivo é sorteado e criado com `O_CREAT|O_EXCL`.**

O POSIX define `O_EXCL` como atômico: dois processos nunca recebem o mesmo
arquivo, porque um dos dois leva `EEXIST` e sorteia outro nome. Quem arbitra é o
kernel, não a disciplina de quem escreve.

Aplicado arquivo a arquivo:

| Arquivo | Decisão | Por quê |
|---|---|---|
| `.jarvis/entregas.md` | **vira `.jarvis/entregas/`**, um arquivo por entrega | log de acréscimo puro, sem ordem semântica e sem referência por número; o custo é concatenar para ler, e é baixo |
| `.jarvis/PAUTA-DE-REFINAMENTO-22-09.md` | **fica como está** | 51 itens numerados, referenciados por número em 31 pontos de outros documentos; a escrita concorrente ali é *edição do mesmo item*, que um diretório não resolve |
| `docs/04-seguranca.md` | **fica como está**; o identificador `SEC-NNN` passa a ser imutável | o defeito não foi acréscimo concorrente, foi renumeração; o remédio é proibir renumerar, não partir o documento |
| `adr/` | já resolvido por `infra/verificacao/verificar-numero-de-adr.mjs` | mesma família de defeito, já com portão |

A ferramenta de registro é `infra/ferramentas/entregas.mjs`, com quatro
subcomandos: `registrar`, `ler`, `listar` e `verificar`.

**`verificar` reprova com diretório ausente ou vazio.** Verificação que não
consegue verificar não aprova, e o modo de falha a evitar aqui é o contraintuitivo:
o portão verde porque não achou o que conferir. A única saída é explícita,
`--aceitar-vazio`, e ela ainda assim imprime o aviso.

**`verificar` não é job da esteira, e a ausência é deliberada.** `.jarvis/` não
está no repositório: um job de CI que exigisse `.jarvis/entregas/` reprovaria
toda execução no GitHub Actions, onde o diretório nunca existe. Portão que
reprova o fluxo certo é portão que alguém desliga.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| **Um arquivo por entrada** (escolhida) | colisão deixa de ser possível, não apenas improvável; o kernel arbitra; funciona igual com 2 ou com 200 agentes | ler o conjunto exige concatenar; o diretório fica com centenas de arquivos | — |
| **Acréscimo com trava** (`flock` ou lockfile) num auxiliar que os briefings mandam usar | preserva um arquivo único, nada muda para quem lê | depende de **todo** agente chamar o auxiliar; um `Edit` direto no arquivo contorna a trava sem erro | é exatamente a dependência que falhou. O aviso no topo do arquivo já era essa aposta, e ela perdeu cinco linhas |
| **Pôr `.jarvis/` no git** | histórico, `git checkout`, conflito visível | contraria decisão do cliente de 17/09, reafirmada em 23/09; e o git só *acusa* a colisão depois, no merge | não é minha decisão reabrir, e mesmo resolvida a colisão continuaria acontecendo |
| **Banco de dados para o log** | resolve de verdade, com transação | um serviço a mais no caminho de um registro que precisa funcionar com a máquina meio de pé | desproporcional ao problema: um diretório dá a mesma garantia sem processo novo |
| **Partir também a `PAUTA`** | mesma garantia | quebra 31 referências por número e não ataca o modo de falha real dali | custa mais do que resolve |

## Consequências

**Fica mais fácil.** Registrar uma entrega passa a ser uma operação sem leitura
prévia: nenhum agente precisa saber o que os outros escreveram, e nenhuma ordem
de escrita perde dado. O front-matter passa a **exigir** autor, o que o formato
antigo não fazia — das 245 entradas migradas, **74 não dizem quem as escreveu**.

**Fica mais difícil.** Ler o conjunto passa por `entregas.mjs ler`. `cat`,
`grep` e `tail` no arquivo único deixam de servir, e quem tinha o caminho
`.jarvis/entregas.md` na memória encontra um ponteiro em vez do conteúdo.

**Passa a ser irreversível** o corte por entrada: as 245 entradas migradas têm
prova de round-trip por SHA-256 e o original está preservado ao lado, mas
reconstituir o arquivo único como alvo de escrita traria o defeito de volta.

**O que este ADR não cobre**, e continua aberto: `docs/06-design-system.md` e
`docs/08-plano-de-testes.md` têm **três donos declarados cada** em
`platform/roles.yaml`, contra a invariante que diz que dois papéis não escrevem
no mesmo arquivo. Para `src/`, `app/` e `tests/`, que também têm vários donos, o
git acusa o conflito; para esses dois documentos, que estão fora do git, não há
nada entre dois agentes e a sobrescrita silenciosa.
