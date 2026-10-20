/**
 * `Pet.open_case_id` SAI DA CONSULTA, e o SQL compilado prova isso.
 *
 * ## O defeito que este arquivo fecha, medido e não suposto
 *
 * O cliente, em 20/10/2026: *"o botão para desmarcar o pet como perdido no
 * perfil do usuário também não está funcionando."*
 *
 * A ação existe desde 19/10 — `Encontrei meu pet`, em
 * `app/lib/telas/pet/tela_detalhe_do_pet.dart`, chamando `closeLostCase` com
 * `outcome: reunited`. O servidor encerra certo; medido em 20/10/2026 contra
 * Postgres de verdade, com o mesmo artefato que a homologação roda:
 *
 *   POST /v1/lost-cases/{caseId}/close  {"outcome":"reunited"}
 *   -> 200  {"status":"closed_reunited", "closed_at":"...",
 *            "reopen_deadline":"<+7 dias>",
 *            "resolution":{"outcome":"reunited","reunion_channel":null}}
 *
 * O botão para PEDIR isso é que nunca foi desenhado. Ele vive no ramo
 * `_jaProcurado` da tela, que é o OU de dois campos da ficha do pet —
 * `status == lost` e `open_case_id != null`. Com um caso `open` no banco, a
 * ficha respondia, na MESMA medição:
 *
 *   GET /v1/pets/{petId}
 *   -> 200  {"status":"active","open_case_id":null}
 *
 * `pets.status` ficar `active` é de propósito e está escrito no cabeçalho de
 * `kysely-perfil-publico.ts`: *"abrir um caso não muda `pets.status` hoje, e o
 * caso aberto é a fonte da verdade sobre 'perdido'"*. Então `open_case_id` é o
 * ÚNICO campo que podia carregar o sinal — e `comoPet` o fixava em `null`, com
 * o comentário "o caso de perdido chega com o módulo `lostfound`". O módulo
 * chegou; a linha ficou. Os dois campos diziam, juntos, que o animal não estava
 * sendo procurado, e a tela acreditava nos dois.
 *
 * ## Por que o SQL compilado, e não a resposta da rota
 *
 * Porque a vacuidade deste repositório é exatamente esta: a frente do aplicativo
 * tem DEZENAS de casos verdes sobre o estado perdido
 * (`app/test/telas/pet_perdido_pagina_e_estados_test.dart`), e todos eles montam
 * a ficha à mão com `petDoContrato(status: 'lost', casoAberto: ...)` — uma
 * resposta que o servidor nunca emitiu. Teste que fabrica a entrada não tem como
 * acusar o produtor dela.
 *
 * Este arquivo lê o SQL que o compilador do Postgres escreve, nunca o
 * texto-fonte do adaptador: uma conferência que procurasse `lost_cases` no
 * arquivo casaria com a menção dentro deste próprio comentário e ficaria verde
 * com a subconsulta removida.
 *
 * O **efeito** — a ficha trazer o identificador do caso aberto e voltar a nulo
 * no encerramento — é de `tests/integration/caso-aberto-chega-na-ficha-do-pet.test.ts`,
 * que roda contra Postgres. Este arquivo não alcança isso, e aquele não alcança
 * a forma da consulta. Os dois são necessários e nenhum basta sozinho.
 *
 * ## A isca, e como ela foi provada
 *
 * Em 20/10/2026, Node v22.23.2. Cada desligamento foi confirmado por diferença
 * de conteúdo do arquivo ANTES de a suíte rodar.
 *
 * Base de `npm test`: 3456 casos em 253 arquivos, 3455 passaram, 1 reprovou --
 * a pré-existente de `viacep-com-brasilapi`, que tem dono em
 * `fix/cep-prazo-laco-vazio`.
 *
 * | o que foi desligado em `kysely-pet-repository.ts` | placar | reprovaram, por nome |
 * |---|---|---|
 * | a subconsulta inteira de `open_case_id` | 3451/5 | `a leitura do dono traz o caso ABERTO do pet`, `o recorte da subconsulta é o estado ABERTO, e ele é o campo`, `a subconsulta é CORRELACIONADA pelo pet da linha de fora` e, no arquivo vizinho, `a leitura do dono liga o dono a $3, e não a $1: DUAS subconsultas vem antes` (a quinta é a do `viacep`) |
 * | `openCaseId: linha.open_case_id` de volta para `openCaseId: null` | 3455/1 | **NENHUM**: a suíte unitária inteira ficou verde fora da do `viacep`. Reprovaram três casos de `tests/integration/caso-aberto-chega-na-ficha-do-pet.test.ts` |
 *
 * A segunda linha é por que o arquivo de integração existe, e vale dito em voz
 * alta: devolver a projeção para `null` reabre o defeito INTEIRO e nada fora do
 * banco acusa. A projeção em memória não aparece no SQL compilado.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';

import type { Database } from '../../../../shared/db/schema.js';
import type { UserId } from '../../../../shared/types/brands.js';
import { construtorDaLeituraDoDono } from './kysely-pet-repository.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;

/** O mesmo arranjo de `autorizacao-na-clausula-where.test.ts`: compila, não executa. */
const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

/**
 * A subconsulta de `open_case_id`, como o compilador do Postgres a escreve.
 *
 * O apelido entra na regex de propósito: uma subconsulta a `lost_cases` que
 * saísse com outro nome de coluna não alimentaria `linha.open_case_id`, e a
 * ficha voltaria a dizer nulo com a consulta certa do lado.
 */
const SUBCONSULTA_DO_CASO =
  /\(select\s+"lost_cases"\."id"\s+from\s+"lost_cases"\s+where\s+[^)]*\)\s+as\s+"open_case_id"/;

function sqlDaLeitura(): string {
  return construtorDaLeituraDoDono(semBanco, DONO).compile().sql;
}

void describe('a ficha do pet diz que ele está sendo procurado, porque ela LÊ o caso aberto', () => {
  void it('a leitura do dono traz o caso ABERTO do pet', () => {
    const sql = sqlDaLeitura();

    assert.match(
      sql,
      SUBCONSULTA_DO_CASO,
      'a ficha do pet voltou a não saber do caso aberto. `Encontrei meu pet` vive no ramo ' +
        `\`_jaProcurado\` da tela, e ele é o OU de \`status == lost\` com \`open_case_id != null\`; ` +
        `\`pets.status\` NÃO vira \`lost\` ao abrir um caso (cabeçalho de ` +
        `\`kysely-perfil-publico.ts\`), então sem este campo não sobra nenhum sinal e o botão de ` +
        `desmarcar não é desenhado para nenhum pet. SQL: ${sql}`,
    );
  });

  void it('o recorte da subconsulta é o estado ABERTO, e ele é o campo', () => {
    const compilada = construtorDaLeituraDoDono(semBanco, DONO).compile();

    assert.match(
      compilada.sql,
      /"lost_cases"\."status"\s*=\s*\$(\d+)/,
      `a subconsulta perdeu o recorte de estado. SQL: ${compilada.sql}`,
    );
    // O VALOR ligado, e não só a coluna: `status = 'closed_reunited'` tem a
    // coluna certa, o operador certo, e faria a ficha anunciar como caso aberto
    // justamente o caso que o tutor acabou de encerrar.
    const posicao = /"lost_cases"\."status"\s*=\s*\$(\d+)/.exec(compilada.sql)?.[1];
    assert.ok(posicao !== undefined, 'a posição do parâmetro não foi lida de volta');
    assert.equal(
      compilada.parameters[Number(posicao) - 1],
      'open',
      'o estado ligado à subconsulta não é `open`. Com outro valor, `open_case_id` passa a ' +
        'apontar para caso encerrado, e a tela oferece `Encontrei meu pet` sobre um caso que ' +
        `já tem desfecho. parâmetros: ${JSON.stringify([...compilada.parameters])}`,
    );
  });

  void it('a subconsulta é CORRELACIONADA pelo pet da linha de fora', () => {
    const sql = sqlDaLeitura();

    assert.match(
      sql,
      /"lost_cases"\."pet_id"\s*=\s*"pets"\."id"/,
      'a subconsulta deixou de se correlacionar com a linha de fora. Sem isto ela devolve o ' +
        'caso aberto de QUALQUER pet — o de outro tutor inclusive — e a ficha anuncia perdido ' +
        `um animal que não está. SQL: ${sql}`,
    );
  });

  void it('o dono continua no WHERE da consulta de fora, com a subconsulta nova no meio', () => {
    // A subconsulta nova empurrou o parâmetro do dono de `$2` para `$3`. A
    // conferência do ADR-0021 lê a posição de volta, e não um índice fixo; este
    // caso existe para que a mudança de posição não passe por aqui calada.
    const compilada = construtorDaLeituraDoDono(semBanco, DONO).compile();
    const achado = /"owner_user_id"\s*=\s*\$(\d+)/.exec(compilada.sql);

    assert.ok(achado !== null, `o predicado do dono saiu do WHERE. SQL: ${compilada.sql}`);
    assert.equal(
      compilada.parameters[Number(achado[1]) - 1],
      DONO,
      `a posição \`$${String(achado[1])}\` não carrega o dono. parâmetros: ` +
        JSON.stringify([...compilada.parameters]),
    );
  });
});

void describe('ISCA: a mesma conferência REPROVA uma leitura sem o caso aberto', () => {
  void it('a consulta de antes de 20/10 — sem a subconsulta — é acusada', () => {
    const comoEraAntes = semBanco
      .selectFrom('pets')
      .select((eb) => [
        'pets.id',
        'pets.status',
        eb
          .selectFrom('pet_tags')
          .whereRef('pet_tags.pet_id', '=', 'pets.id')
          .where('pet_tags.status', '=', 'active')
          .select(({ fn }) => fn.countAll().as('n'))
          .as('active_tag_count'),
      ])
      .where('pets.owner_user_id', '=', DONO)
      .compile();

    assert.doesNotMatch(
      comoEraAntes.sql,
      SUBCONSULTA_DO_CASO,
      'a conferência aprovou a consulta que PRODUZIU o defeito; ela não mede nada. SQL: ' +
        comoEraAntes.sql,
    );
  });

  void it('uma subconsulta a `lost_cases` SEM recorte de estado é acusada', () => {
    // Coluna certa, tabela certa, apelido certo — e nenhum recorte. Ela
    // devolveria o caso ENCERRADO como se estivesse aberto, e o pet reencontrado
    // continuaria com a faixa de urgência e o botão de desmarcar na tela.
    const semRecorte = semBanco
      .selectFrom('pets')
      .select((eb) => [
        'pets.id',
        eb
          .selectFrom('lost_cases')
          .whereRef('lost_cases.pet_id', '=', 'pets.id')
          .select('lost_cases.id')
          .as('open_case_id'),
      ])
      .where('pets.owner_user_id', '=', DONO)
      .compile();

    assert.match(
      semRecorte.sql,
      SUBCONSULTA_DO_CASO,
      `a isca precisa casar a FORMA para a próxima asserção medir algo. SQL: ${semRecorte.sql}`,
    );
    assert.doesNotMatch(
      semRecorte.sql,
      /"lost_cases"\."status"\s*=\s*\$(\d+)/,
      `a conferência de estado aprovou uma subconsulta sem recorte. SQL: ${semRecorte.sql}`,
    );
  });

  void it('uma subconsulta NÃO correlacionada é acusada', () => {
    const semCorrelacao = semBanco
      .selectFrom('pets')
      .select((eb) => [
        'pets.id',
        eb
          .selectFrom('lost_cases')
          .where('lost_cases.status', '=', 'open')
          .select('lost_cases.id')
          .as('open_case_id'),
      ])
      .where('pets.owner_user_id', '=', DONO)
      .compile();

    assert.doesNotMatch(
      semCorrelacao.sql,
      /"lost_cases"\."pet_id"\s*=\s*"pets"\."id"/,
      `a conferência aprovou uma subconsulta solta. SQL: ${semCorrelacao.sql}`,
    );
  });
});
