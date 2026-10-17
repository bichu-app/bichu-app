/**
 * **A lista de candidatos carrega o TUTOR DO CASO no `WHERE`**, e o SQL
 * compilado prova.
 *
 * ## O buraco que esta listagem fechou, e por que a autorização dela é a parte
 * delicada
 *
 * A esteira já calculava e gravava as correspondências, e a rota de **decidir**
 * já estava no ar: o tutor podia dizer "é o meu pet" sobre algo que ele não
 * tinha como ver. Esta operação é a tela que faltava.
 *
 * E ela é a leitura mais sensível do módulo. `match_candidates` **não tem coluna
 * de dono** — o dono do candidato é o dono do CASO —, então a autorização depende
 * de duas coisas escritas juntas: o predicado `lost_cases.owner_user_id = :dono`
 * e a correlação `lost_cases.id = match_candidates.case_id`. Com o predicado e
 * **sem** a correlação, o mesmo SQL deixa de perguntar *"este candidato é de um
 * caso desta conta?"* e passa a perguntar *"esta conta tem algum caso?"* — o
 * produto cartesiano que publica os candidatos de todos os casos de todos os
 * tutores a qualquer pessoa com cadastro.
 *
 * ## Por que ler o SQL, e não só o comportamento
 *
 * Um teste de comportamento passa igual se a consulta trouxer as linhas e um
 * `if` na aplicação as descartar depois. As duas implementações são
 * indistinguíveis pelo lado de fora **até** o dia em que alguém mexe no `if`, e
 * aí não existe teste que acuse, porque o `if` era o teste. O ADR-0021 não diz
 * "não liste o candidato do outro"; ele diz **onde** a decisão mora.
 *
 * ## A isca
 *
 * O último caso deste arquivo é a prova negativa: ele compila à mão a MESMA
 * consulta sem o predicado do dono e exige que a conferência reprove. Se ela
 * aprovar, o arquivo falha dizendo que não conseguiu verificar — porque uma
 * conferência que aprova a consulta sem autorização não está conferindo nada.
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
import type { CaseId, UserId } from '../../../../shared/types/brands.js';
import { construtorDosCandidatosDoCaso } from './kysely-lost-case-repository.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const OUTRO = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;
const CASO = '018f3a2b-0000-7000-8000-0000000000dd' as CaseId;

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const PREDICADO_DO_DONO = /"lost_cases"\."owner_user_id"\s*=\s*\$(\d+)/;
const CORRELACAO_DO_CASO = /"lost_cases"\."id"\s*=\s*"match_candidates"\."case_id"/;

interface Compilada {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

/**
 * Confere que o predicado existe **e** que o valor ligado à posição dele é o
 * esperado.
 *
 * `parameters.includes(DONO)` responderia "o dono está em algum lugar da lista",
 * e isso aprova uma consulta que escrevesse
 * `"lost_cases"."owner_user_id" = $1` ligando o `caseId` à coluna do dono: a
 * coluna certa, o operador certo, e o dono na lista por outro motivo.
 */
function exigirNaPosicao(
  compilada: Compilada,
  predicado: RegExp,
  esperado: unknown,
  onde: string,
): void {
  const casado = predicado.exec(compilada.sql);
  assert.ok(
    casado !== null,
    `${onde}: o predicado ${String(predicado)} sumiu (ou trocou de operador). SQL: ${compilada.sql}`,
  );
  const posicao = Number(casado[1]) - 1;
  assert.equal(
    compilada.parameters[posicao],
    esperado,
    `${onde}: o predicado existe e está ligado a OUTRO valor — ` +
      `\`$${String(posicao + 1)}\` vale ${JSON.stringify(compilada.parameters[posicao])}. ` +
      `Parâmetros: ${JSON.stringify(compilada.parameters)}`,
  );
}

function listagem(dono: UserId = DONO, depoisDe?: { score: number; id: string }) {
  return construtorDosCandidatosDoCaso(semBanco, CASO, dono, {
    limit: 20,
    depoisDe,
  }).compile();
}

void describe('a listagem de candidatos carrega o tutor do caso no WHERE', () => {
  void it('o dono do caso está no WHERE, ligado à posição do próprio predicado', () => {
    exigirNaPosicao(listagem(), PREDICADO_DO_DONO, DONO, 'a listagem');
  });

  void it('o dono viaja de verdade: trocar quem chama troca o parâmetro ligado', () => {
    // Sem este caso, uma consulta que ignorasse o argumento e ligasse uma
    // constante passaria no caso acima.
    exigirNaPosicao(listagem(OUTRO), PREDICADO_DO_DONO, OUTRO, 'a listagem de outro chamador');
  });

  void it('a correlação entre o candidato e o caso está escrita', () => {
    // Sem ela o dono responde sobre o conjunto errado: "esta conta tem algum
    // caso?" em vez de "este candidato é de um caso desta conta".
    assert.match(listagem().sql, CORRELACAO_DO_CASO);
  });

  void it('o `caseId` é filtro A MAIS, nunca no lugar do dono', () => {
    const compilada = listagem();
    assert.match(compilada.sql, /"match_candidates"\."case_id"\s*=\s*\$\d+/);
    assert.ok(compilada.parameters.includes(CASO));
  });

  void it('NÃO filtra por status: os três estados do contrato saem', () => {
    // `MatchCandidate.status` declara `[suggested, confirmed, rejected]`.
    // Esconder `rejected` faria a lista mudar de tamanho sem explicação depois
    // de um toque irreversível; esconder `confirmed` tiraria da tela justamente
    // a correspondência que virou conversa.
    assert.doesNotMatch(listagem().sql, /"match_candidates"\."status"\s*(=|<>|!=|in)/);
  });

  void it('ordena por score decrescente, com o id como desempate estável', () => {
    // `score` é o que o contrato manda ordenar. O `id` não é enfeite: o score
    // repete, e sem desempate a paginação repete ou pula candidatos.
    assert.match(
      listagem().sql,
      /order by[\s\S]*"match_candidates"\."score" desc[\s\S]*"match_candidates"\."id" desc/,
    );
  });

  void it('o cursor é uma comparação de TUPLA, e não dois `AND` escritos à mão', () => {
    // `(a, b) < (x, y)` é a comparação lexicográfica que o Postgres resolve de
    // uma vez; a versão com `OR` erra no empate de score, que é quando importa.
    const compilada = listagem(DONO, { score: 0.42, id: 'cand-1' });
    assert.match(
      compilada.sql,
      /\(match_candidates\.score,\s*match_candidates\.id\)\s*<\s*\(\$\d+,\s*\$\d+\)/,
    );
    assert.ok(compilada.parameters.includes(0.42));
    assert.ok(compilada.parameters.includes('cand-1'));
  });

  void it('pet excluído logicamente não aparece na lista', () => {
    assert.match(listagem().sql, /"pets"\."deleted_at" is null/);
  });

  void it('ISCA: a conferência REPROVA a mesma consulta sem o predicado do dono', () => {
    // Sem este caso, as asserções acima poderiam estar medindo um texto que
    // sempre casa. Aqui a consulta é compilada **sem** o dono, e a exigência é
    // que `exigirNaPosicao` falhe. Se ela aprovar, este arquivo não verifica
    // nada e precisa dizer isso em voz alta.
    const semDono = semBanco
      .selectFrom('match_candidates')
      .innerJoin('lost_cases', (join) =>
        join.onRef('lost_cases.id', '=', 'match_candidates.case_id'),
      )
      .select(['match_candidates.id', 'match_candidates.status'])
      .where('match_candidates.case_id', '=', CASO)
      .compile();

    assert.throws(
      () => {
        exigirNaPosicao(semDono, PREDICADO_DO_DONO, DONO, 'a isca');
      },
      assert.AssertionError,
      'a isca passou: a conferência aprova uma listagem SEM autorização, ' +
        'então ela não está conferindo a autorização.',
    );
  });
});
