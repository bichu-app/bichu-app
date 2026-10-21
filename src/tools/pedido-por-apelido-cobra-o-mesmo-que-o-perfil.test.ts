/**
 * **A ISCA CENTRAL DO CAMINHO POR APELIDO: o pedido cobra os MESMOS predicados
 * que a leitura do perfil.**
 *
 * ## Por que isto é a isca central, e não um detalhe de simetria
 *
 * Desde 20/10/2026 há duas superfícies que resolvem um apelido:
 *
 * - `getPersonProfile` → `construtorDoPerfilPorApelido` (módulo `people`);
 * - `requestConnection` com `handle` → `construtorDoAlvoPorApelido` (módulo
 *   `connections`).
 *
 * Se os dois conjuntos de predicados divergirem, abre-se um dos dois buracos, e
 * o segundo é grave:
 *
 * 1. a busca e o perfil mostram alguém a quem o pedido **não** chega — a pessoa
 *    vê um botão "adicionar" que só pode falhar. Ruim, e visível;
 * 2. **o pedido chega a quem o perfil esconde** — e aí `POST /connections` passa
 *    a contornar o 404 de `getPersonProfile`. Quem foi bloqueado descobre, pela
 *    diferença entre as duas respostas, que a outra pessoa existe. Essa é a
 *    *"porta de trás"* que a decisão de 18/10 temia, reaberta por descuido em vez
 *    de por decisão — e ela não aparece em nenhum teste de uma superfície só,
 *    porque cada uma delas, isolada, está correta.
 *
 * ## Por que este arquivo mora em `src/tools/`
 *
 * Porque ele compara **dois módulos**, e um módulo só enxerga `ports/` de outro
 * (`src/architecture.rules.mjs`, docs/03-arquitetura.md §6). Dentro de qualquer
 * um dos dois, este arquivo importaria `adapters/` alheio — que é o que a regra
 * proíbe, com razão. `src/tools/` está fora de `src/modules`, e é onde os outros
 * portões que atravessam módulo já vivem.
 *
 * ## O que este arquivo NÃO prova
 *
 * Que o Postgres se comporta como o texto diz — isso é medido onde as funções
 * SQL moram (`20261017000013`, `20261018000031`, `20261018000032`). Aqui se
 * prova que as duas camadas as **chamam**, no `WHERE`, com o mesmo conjunto.
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

import type { Database } from '../shared/db/schema.js';
import type { UserId } from '../shared/types/brands.js';
import { construtorDoPerfilPorApelido } from '../modules/people/adapters/persistence/kysely-perfil-de-pessoa.js';
import { construtorDoAlvoPorApelido } from '../modules/connections/adapters/persistence/kysely-convites.js';

const QUEM_CHAMA = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const APELIDO = 'ana-do-bairro';

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const sqlDoPerfil = (): string =>
  construtorDoPerfilPorApelido(semBanco, APELIDO, QUEM_CHAMA).sql;
const sqlDoAlvo = (): string => construtorDoAlvoPorApelido(semBanco, APELIDO, QUEM_CHAMA).sql;

/**
 * Os predicados que as DUAS consultas têm de cobrar, **cada um com nome
 * próprio**.
 *
 * O nome está aqui e não numa asserção comum de propósito: o pedido desta
 * entrega foi *"iscas de verdade, conferidas pelo nome do caso"*. Uma asserção
 * que varresse os cinco num `assert.ok(todos)` reprovaria dizendo "faltou algum"
 * — e quem lesse a reprovação não saberia qual, nem por que ele existia.
 */
const PREDICADOS = [
  {
    nome: 'conta_habilitada do lado OLHADO',
    re: /conta_habilitada\("?u"?\."?id"?\)/,
    porque:
      'conta desabilitada "nao e mais encontrada em nenhuma pagina ou funcionalidade" ' +
      '(decisao do cliente de 17/10/2026).',
  },
  {
    nome: 'conta_habilitada de QUEM CHAMA',
    re: /conta_habilitada\(\$\d+::uuid\)/,
    porque:
      'parece redundante -- quem chama esta autenticado -- e NAO e: quem desabilitou a ' +
      'propria conta continua com token valido ate ele vencer. E o predicado que alguem ' +
      'vai apagar por achar que sobra.',
  },
  {
    nome: 'bloqueio_entre (simetrico)',
    re: /not\s+bloqueio_entre\(/i,
    porque:
      'se qualquer um dos dois bloqueou o outro, a pessoa nao existe para quem olha. ' +
      'Simetrico e nao direcional: fazer o efeito depender da direcao deixaria o ' +
      'bloqueado alcancar o bloqueador.',
  },
  {
    nome: 'perfil_ocultado_para_quem_denunciou',
    re: /not\s+perfil_ocultado_para_quem_denunciou\(/i,
    porque:
      'quem denunciou um perfil nao volta a ve-lo, e a promessa da tela e literal: ' +
      '"Voce nao vai mais ver este conteudo".',
  },
  {
    nome: 'kind = pessoa (pet e reservado nao resolvem)',
    re: /"?kind"?\s*=\s*\$\d+/,
    porque:
      'o espaco de nomes e compartilhado entre pessoa, pet e reservado ' +
      '(`20261018000021`). Sem ele, `@bidu` resolveria para o tutor do pet -- ou viraria ' +
      'um oraculo de "este apelido existe e e de um pet".',
  },
] as const;

void describe('o pedido por apelido cobra os MESMOS predicados que a leitura do perfil', () => {
  for (const { nome, re, porque } of PREDICADOS) {
    void it(`ISCA -- \`${nome}\` esta na consulta do PERFIL`, () => {
      assert.match(sqlDoPerfil(), re, `${nome} saiu do WHERE do perfil. ${porque}`);
    });

    void it(`ISCA -- \`${nome}\` esta na consulta do PEDIDO POR APELIDO`, () => {
      assert.match(
        sqlDoAlvo(),
        re,
        `${nome} saiu do WHERE do pedido por apelido. ${porque}\n\n` +
          'Com ele so no perfil, `POST /connections` com `handle` contorna o 404 de ' +
          '`getPersonProfile`: o pedido chega a quem o perfil esconde, e quem foi ' +
          'bloqueado descobre pela diferenca que a outra pessoa existe.',
      );
    });
  }

  /**
   * **A isca da isca.** Sem ela, os casos acima passariam por os dois SQL terem
   * os predicados hoje — e não por a varredura saber reconhecer a falta de um.
   */
  void it('ISCA: a varredura REPROVA quando um predicado falta numa das duas', () => {
    for (const { nome, re } of PREDICADOS) {
      const mutilado = sqlDoAlvo().replace(re, 'true');
      assert.doesNotMatch(
        mutilado,
        re,
        `a isca passou para \`${nome}\`: a expressao nao reconhece a AUSENCIA dele, ` +
          'entao o caso correspondente nao mede nada.',
      );
    }
  });

  /**
   * O contrapeso de conjunto: as duas consultas têm de cobrar **a mesma
   * quantidade** de predicados de autorização. Um predicado novo só no perfil
   * reabriria a divergência pelo outro lado — e nenhum dos casos acima pegaria,
   * porque eles varrem uma lista fixa.
   */
  void it('as duas consultas cobram a MESMA quantidade de predicados de autorizacao', () => {
    const contar = (sql: string): number =>
      [
        /conta_habilitada\(/g,
        /bloqueio_entre\(/g,
        /perfil_ocultado_para_quem_denunciou\(/g,
      ].reduce((total, re) => total + (sql.match(re)?.length ?? 0), 0);
    assert.equal(
      contar(sqlDoAlvo()),
      contar(sqlDoPerfil()),
      'as duas consultas deixaram de cobrar o mesmo numero de predicados de ' +
        'autorizacao. Um predicado novo em UMA delas e a divergencia que este arquivo ' +
        'existe para pegar -- acrescente-o nas duas, ou escreva aqui por que ele vale ' +
        'so para uma.',
    );
  });
});
