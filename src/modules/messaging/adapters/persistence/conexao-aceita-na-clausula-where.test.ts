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
import type { ConversationId, UserId } from '../../../../shared/types/brands.js';
import {
  construtorDaBuscaDoChamador,
  construtorDaContagemDoChamador,
  construtorDaListaDoChamador,
} from './kysely-conversation-repository.js';

const CHAMADOR = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const CONVERSA = '018f3a2b-0000-7000-8000-0000000000cc' as ConversationId;
const PAGINA = { limit: 20, depoisDe: undefined, termo: undefined };

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

interface Compilada {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

function subconsultaProjetada(sql: string, alias: string): string {
  const fim = sql.indexOf(`) as "${alias}"`);
  if (fim < 0) return '';
  let profundidade = 0;
  for (let i = fim; i >= 0; i -= 1) {
    const c = sql[i];
    if (c === ')') profundidade += 1;
    else if (c === '(') {
      profundidade -= 1;
      if (profundidade === 0) return sql.slice(i, fim + 1);
    }
  }
  return '';
}

const CAMPOS_DA_EMENDA = ['apelido_do_outro', 'chave_da_foto_do_outro'] as const;

function valoresLigadosNoTrecho(trecho: string, compilada: Compilada): unknown[] {
  const valores: unknown[] = [];
  for (const achado of trecho.matchAll(/\$(\d+)/g)) {
    valores.push(compilada.parameters[Number(achado[1]) - 1]);
  }
  return valores;
}

function consultasQueProjetam(): { nome: string; compilada: Compilada }[] {
  return [
    {
      nome: 'getConversation',
      compilada: construtorDaBuscaDoChamador(semBanco, CONVERSA, CHAMADOR).compile(),
    },
    {
      nome: 'listConversations',
      compilada: construtorDaListaDoChamador(semBanco, CHAMADOR, PAGINA).compile(),
    },
  ];
}

void describe('a foto do participante só sai entre conexões aceitas (SQL compilado)', () => {
  void it('CONTRAPESO -- os dois campos da emenda EXISTEM nas duas consultas que projetam', () => {
    for (const { nome, compilada } of consultasQueProjetam()) {
      for (const campo of CAMPOS_DA_EMENDA) {
        assert.notEqual(
          subconsultaProjetada(compilada.sql, campo),
          '',
          `${nome} deixou de projetar \`${campo}\`: a emenda 3 do ADR-0010 saiu da consulta, ` +
            'e com ela saíram todas as conferências deste arquivo',
        );
      }
    }
  });

  void it('ISCA -- o predicado de CONEXÃO ACEITA está dentro das DUAS subconsultas', () => {
    for (const { nome, compilada } of consultasQueProjetam()) {
      for (const campo of CAMPOS_DA_EMENDA) {
        const trecho = subconsultaProjetada(compilada.sql, campo);
        assert.match(
          trecho,
          /AND EXISTS \(\s*SELECT 1 FROM user_connections uc/,
          `${nome}/${campo}: o predicado de conexão saiu do \`WHERE\` da subconsulta, ou ` +
            'deixou de ser conjunção (um `OR` antes dele neutraliza o recorte inteiro)',
        );
        assert.match(
          trecho,
          /uc\.state = 'accepted'/,
          `${nome}/${campo}: pendente não é aceite. O cliente disse "JÁ aceitaram conexão": ` +
            'pedido enviado, pedido recebido e recusa são os três estados em que a foto não aparece',
        );
      }
    }
  });

  void it('ISCA -- o recorte é CONJUNÇÃO: nenhum literal booleano, e UM `OR` só', () => {
    for (const { nome, compilada } of consultasQueProjetam()) {
      for (const campo of CAMPOS_DA_EMENDA) {
        const trecho = subconsultaProjetada(compilada.sql, campo);
        for (const literal of [/\btrue\b/i, /\bfalse\b/i]) {
          assert.doesNotMatch(
            trecho,
            literal,
            `${nome}/${campo}: literal booleano no recorte. \`true\` ao lado de um \`OR\` ` +
              'desliga o predicado sem apagar uma linha de SQL',
          );
        }
        assert.equal(
          (trecho.match(/\bOR\b/g) ?? []).length,
          1,
          `${nome}/${campo}: o número de \`OR\` mudou. O único legítimo é o dos dois ` +
            'sentidos do par; um segundo é ramo alternativo, e ramo alternativo num ' +
            'recorte de autorização é o recorte com uma saída',
        );
      }
    }
  });

  void it('ISCA -- os DOIS SENTIDOS do par, porque a conexão é simétrica', () => {
    for (const { nome, compilada } of consultasQueProjetam()) {
      for (const campo of CAMPOS_DA_EMENDA) {
        const trecho = subconsultaProjetada(compilada.sql, campo);
        assert.match(
          trecho,
          /uc\.requester_user_id = \$\d+::uuid AND uc\.addressee_user_id = /,
          `${nome}/${campo}: o sentido "quem chama pediu" saiu`,
        );
        assert.match(
          trecho,
          /uc\.requester_user_id = [a-z._]+ AND uc\.addressee_user_id = \$\d+::uuid/,
          `${nome}/${campo}: o OUTRO sentido do par saiu, e quem pediu não decide quem vê`,
        );
      }
    }
  });

  void it('ISCA -- `conta_habilitada` nas DUAS pontas: quem saiu não tem foto nem apelido', () => {
    for (const { nome, compilada } of consultasQueProjetam()) {
      for (const campo of CAMPOS_DA_EMENDA) {
        const trecho = subconsultaProjetada(compilada.sql, campo);
        assert.match(trecho, /conta_habilitada\(uc\.requester_user_id\)/, `${nome}/${campo}`);
        assert.match(trecho, /conta_habilitada\(uc\.addressee_user_id\)/, `${nome}/${campo}`);
      }
    }
  });

  void it('ISCA (e) -- `NOT bloqueio_entre` nas duas, e ele NÃO é redundante aqui', () => {
    for (const { nome, compilada } of consultasQueProjetam()) {
      for (const campo of CAMPOS_DA_EMENDA) {
        const trecho = subconsultaProjetada(compilada.sql, campo);
        assert.match(
          trecho,
          /AND NOT bloqueio_entre\(\$\d+::uuid, /,
          `${nome}/${campo}: par bloqueado voltaria a ter foto durante a corrida das duas escritas`,
        );
      }
    }
  });

  void it('ISCA -- tudo que as subconsultas ligam a `$n` é o CHAMADOR, e nada mais', () => {
    for (const { nome, compilada } of consultasQueProjetam()) {
      for (const campo of CAMPOS_DA_EMENDA) {
        const trecho = subconsultaProjetada(compilada.sql, campo);
        const valores = valoresLigadosNoTrecho(trecho, compilada);
        assert.ok(valores.length >= 4, `${nome}/${campo}: nenhum valor ligado — o recorte falhou`);
        for (const v of valores) {
          assert.equal(
            v,
            CHAMADOR,
            `${nome}/${campo}: há um \`$n\` ligado a algo que não é o chamador (${String(v)})`,
          );
        }
      }
    }
  });

  void it('ISCA -- a FOTO é a derivada `thumb`, `ready`, e do propósito `user_photo`', () => {
    for (const { nome, compilada } of consultasQueProjetam()) {
      const trecho = subconsultaProjetada(compilada.sql, 'chave_da_foto_do_outro');
      assert.match(trecho, /SELECT foto\.thumb_key/, `${nome}: a derivada escolhida mudou`);
      assert.doesNotMatch(
        trecho,
        /foto\.public_key/,
        `${nome}: \`public_key\` é a \`card\` de 512 px — 4,3x a célula de 40 dp`,
      );
      assert.match(trecho, /foto\.status = 'ready'/, nome);
      assert.match(trecho, /foto\.purpose = 'user_photo'/, nome);
      assert.match(trecho, /foto\.thumb_key IS NOT NULL/, nome);
      assert.doesNotMatch(trecho, /rejection_reason/, `${nome}: motivo de recusa não é de terceiro`);
    }
  });

  void it('ISCA -- o APELIDO é de PESSOA, e nunca o de um pet do outro lado', () => {
    for (const { nome, compilada } of consultasQueProjetam()) {
      const trecho = subconsultaProjetada(compilada.sql, 'apelido_do_outro');
      assert.match(trecho, /SELECT h\.handle FROM handles h/, nome);
      assert.match(trecho, /h\.kind = 'pessoa'/, `${nome}: apelido de PET sairia como o da pessoa`);
    }
  });

  void it('ISCA -- nenhum identificador interno entra nas duas subconsultas', () => {
    for (const { nome, compilada } of consultasQueProjetam()) {
      for (const campo of CAMPOS_DA_EMENDA) {
        const trecho = subconsultaProjetada(compilada.sql, campo);
        for (const proibido of ['public_ref', 'SELECT outro.id', 'SELECT foto.id']) {
          assert.ok(
            !trecho.includes(proibido),
            `${nome}/${campo}: \`${proibido}\` projetado — identidade interna não sai (ADR-0010 item 6)`,
          );
        }
      }
    }
  });

  void it('a CONTAGEM da lista não projeta participante nenhum, e por isso não tem o que vazar', () => {
    const { sql } = construtorDaContagemDoChamador(semBanco, CHAMADOR, undefined).compile();
    for (const campo of CAMPOS_DA_EMENDA) {
      assert.ok(!sql.includes(campo), `a contagem passou a projetar \`${campo}\``);
    }
    assert.match(sql, /count\(\*\)/);
  });

  void it('A ISCA DA ISCA -- estas conferências REPROVAM três mutilações do SQL', () => {
    const compilada = construtorDaBuscaDoChamador(semBanco, CONVERSA, CHAMADOR).compile();

    const semAceite = compilada.sql.replace(/uc\.state = 'accepted'/g, 'true');
    for (const campo of CAMPOS_DA_EMENDA) {
      const trecho = subconsultaProjetada(semAceite, campo);
      assert.notEqual(trecho, '', 'a mutilação (1) quebrou o recorte, e não o predicado');
      assert.doesNotMatch(
        trecho,
        /uc\.state = 'accepted'/,
        'a expressão do aceite não distingue o SQL mutilado do íntegro',
      );
    }

    const semBloqueio = compilada.sql.replace(
      /AND NOT bloqueio_entre\(\$\d+::uuid, [a-z._]+\)/g,
      'AND true',
    );
    for (const campo of CAMPOS_DA_EMENDA) {
      const trecho = subconsultaProjetada(semBloqueio, campo);
      assert.notEqual(trecho, '', 'a mutilação (2) quebrou o recorte, e não o predicado');
      assert.doesNotMatch(
        trecho,
        /AND NOT bloqueio_entre\(\$\d+::uuid, /,
        'a expressão do bloqueio não distingue o SQL mutilado do íntegro',
      );
    }

    const ultima = compilada.parameters.length;
    const valorErrado = compilada.sql.replace(
      /uc\.requester_user_id = \$\d+::uuid/,
      `uc.requester_user_id = $${ultima}::uuid`,
    );
    const trecho = subconsultaProjetada(valorErrado, 'apelido_do_outro');
    assert.notEqual(trecho, '', 'a mutilação (3) quebrou o recorte');

    const neutralizado = compilada.sql.replace(
      /AND EXISTS \(\s*SELECT 1 FROM user_connections uc/g,
      (achado) => `AND true AND true OR ${achado.slice('AND '.length)}`,
    );
    for (const campo of CAMPOS_DA_EMENDA) {
      const t = subconsultaProjetada(neutralizado, campo);
      assert.notEqual(t, '', 'a mutilação (4) quebrou o recorte, e não o predicado');
      assert.doesNotMatch(
        t,
        /AND EXISTS \(\s*SELECT 1 FROM user_connections uc/,
        'a âncora `AND EXISTS (` aprova um predicado neutralizado por `OR`',
      );
      assert.match(t, /\btrue\b/, 'a mutilação (4) não introduziu o literal');
      assert.ok(
        (t.match(/\bOR\b/g) ?? []).length > 1,
        'a contagem de `OR` não distingue o predicado neutralizado do íntegro',
      );
    }
    const valores = valoresLigadosNoTrecho(trecho, { ...compilada, sql: valorErrado });
    assert.equal(
      compilada.parameters[ultima - 1],
      CONVERSA,
      'a premissa da mutilação (3): o último parâmetro é o id da conversa',
    );
    assert.ok(
      valores.some((v) => v !== CHAMADOR),
      'a conferência de valores aprova um `$n` ligado ao id da conversa: ela não mede nada',
    );
  });
});

