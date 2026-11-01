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
