/** **A autorização está na cláusula `WHERE`, e isto se prova lendo o SQL.** */
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
import type { Instant, UserId } from '../../../../shared/types/brands.js';
import {
  TETO_DE_CONEXOES,
  TETO_DE_PEDIDOS_POR_DIA,
  TETO_DE_PENDENTES_ENVIADOS,
} from '../../domain/teto-de-conexoes.js';
import {
  construtorDaArestaDoPar,
  construtorDaArestaPorRef,
  construtorDaContagemDeConexoes,
  construtorDaContagemDeConvidados,
  construtorDasArestasPorApelido,
  construtorDasConexoes,
  construtorDasContagens,
  construtorDoAceite,
  construtorDoDesfazerPorBloqueio,
  construtorDoEncerramento,
  construtorDoParConectado,
  construtorDoPedido,
  construtorDosPedidos,
} from './kysely-connections-repository.js';

const CHAMADOR = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const OUTRO = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;
const TERCEIRO = '018f3a2b-0000-7000-8000-0000000000cc' as UserId;
const REF = 'Zm9vYmFyMTIzNDU2Nzg5MA';
const AGORA = 1_800_000_000_000 as Instant;

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

/** Toda consulta desta camada, com os mesmos argumentos, para varrer em lote. */
const TODAS = {
  contagens: () => construtorDasContagens(semBanco, CHAMADOR, AGORA),
  contagemDeConexoes: () => construtorDaContagemDeConexoes(semBanco, CHAMADOR),
  contagemDeConvidados: () => construtorDaContagemDeConvidados(semBanco, CHAMADOR),
  arestaPorRef: () => construtorDaArestaPorRef(semBanco, REF, CHAMADOR),
  arestaDoPar: () => construtorDaArestaDoPar(semBanco, CHAMADOR, OUTRO),
  pedido: () =>
    construtorDoPedido(semBanco, {
      id: '018f3a2b-0000-7000-8000-00000000dd01',
      ref: REF,
      quemPede: CHAMADOR,
      alvo: OUTRO,
      origem: 'anchored_case',
      agora: AGORA,
    }),
  aceite: () => construtorDoAceite(semBanco, REF, CHAMADOR, AGORA),
  encerramento: () => construtorDoEncerramento(semBanco, REF, CHAMADOR, AGORA),
  parConectado: () => construtorDoParConectado(semBanco, CHAMADOR, OUTRO),
  desfazerPorBloqueio: () => construtorDoDesfazerPorBloqueio(semBanco, CHAMADOR, OUTRO),
  pedidosRecebidos: () =>
    construtorDosPedidos(semBanco, CHAMADOR, {
      direcao: 'received',
      pagina: 1,
      limite: 20,
      agora: AGORA,
    }),
  pedidosEnviados: () =>
    construtorDosPedidos(semBanco, CHAMADOR, {
      direcao: 'sent',
      pagina: 1,
      limite: 20,
      agora: AGORA,
    }),
  listaDasProprias: () => construtorDasConexoes(semBanco, CHAMADOR, { pagina: 1, limite: 20 }),
  arestasPorApelido: () =>
    construtorDasArestasPorApelido(semBanco, CHAMADOR, ['bia-vet', 'carla-ong'], AGORA),
} as const;

void describe('quem chama entra no WHERE, e não num `if`', () => {
  void it('a aresta por `ref` cobra as DUAS pontas contra quem chama', () => {
    const { sql, parameters } = TODAS.arestaPorRef();
    assert.match(sql, /c\.requester_user_id = quem\.id or c\.addressee_user_id = quem\.id/i);
    assert.ok(parameters.includes(CHAMADOR), 'quem chama precisa estar ligado como parâmetro');
    assert.ok(parameters.includes(REF), 'o `ref` é filtro A MAIS, nunca no lugar de quem chama');
  });

  void it('trocar quem chama troca o parâmetro — o chamador viaja de verdade', () => {
    const outro = construtorDaArestaPorRef(semBanco, REF, TERCEIRO);
    assert.ok(outro.parameters.includes(TERCEIRO));
    assert.ok(!outro.parameters.includes(CHAMADOR));
  });

  void it('o aceite exige o DESTINATÁRIO: quem pediu não aceita o próprio pedido', () => {
    const { sql } = TODAS.aceite();
    assert.match(sql, /c\.addressee_user_id = \$\d+::uuid/i);
    assert.doesNotMatch(
      sql,
      /c\.requester_user_id = \$\d+::uuid/i,
      'o aceite não pode comparar quem pediu com quem chama: quem pede não aceita o próprio pedido',
    );
    assert.match(sql, /c\.state = 'pending'/i);
    assert.match(sql, /c\.expires_at > \$\d+::timestamptz/i);
  });

  void it('o encerramento aceita as duas pontas, e DERIVA a semântica no SQL', () => {
    const { sql } = TODAS.encerramento();
    assert.match(sql, /\(c\.requester_user_id = \$\d+::uuid OR c\.addressee_user_id = \$\d+::uuid\)/i);
    assert.match(sql, /when c\.state = 'accepted' then 'undone'/i);
    assert.match(sql, /when c\.requester_user_id = \$\d+::uuid then 'cancelled'/i);
    assert.match(sql, /else 'declined'/i);
  });

  void it('a semântica do encerramento NÃO vem como parâmetro de quem chama', () => {
    const { parameters } = TODAS.encerramento();
    for (const intencao of ['declined', 'cancelled', 'undone']) {
      assert.ok(
        !parameters.includes(intencao),
        `\`${intencao}\` veio ligado como parâmetro: recebida de fora, a intenção ` +
          'deixaria um cliente mandar "desfazer" num pendente e lavar a recusa.',
      );
    }
  });
});

void describe('ISCA (e): `conta_habilitada` nos DOIS lados, em tudo', () => {
  const PRECISAM = [
    'contagemDeConexoes',
    'arestaPorRef',
    'arestaDoPar',
    'aceite',
    'encerramento',
    'parConectado',
    'pedidosRecebidos',
    'pedidosEnviados',
    'listaDasProprias',
    'arestasPorApelido',
  ] as const;

  for (const nome of PRECISAM) {
    void it(`\`${nome}\` chama \`conta_habilitada\` para pedinte E destinatário`, () => {
      const { sql } = TODAS[nome]();
      const chamadas = sql.match(/conta_habilitada\(/gi) ?? [];
      assert.ok(
        chamadas.length >= 2,
        `\`${nome}\` chamou \`conta_habilitada\` ${String(chamadas.length)} vez(es); ` +
          'a conexão tem dois lados e os dois podem ter sido desabilitados.',
      );
      assert.match(sql, /conta_habilitada\([^)]*requester_user_id\)/i);
      assert.match(sql, /conta_habilitada\([^)]*addressee_user_id\)/i);
    });
  }

  /**
   * **O RECORTE POR QUEM CHAMA, nas duas leituras de LISTA** — e este caso nasceu de
   * uma isca que não caiu.
   */
  for (const nome of ['listaDasProprias', 'arestasPorApelido', 'pedidosRecebidos', 'pedidosEnviados'] as const) {
    void it(`\`${nome}\` cobra as DUAS pontas contra quem chama, no WHERE`, () => {
      const { sql } = TODAS[nome]();
      assert.match(
        sql,
        /\(c\.requester_user_id = quem\.id or c\.addressee_user_id = quem\.id\)/i,
        `\`${nome}\` nao recorta por quem chama: uma leitura de LISTA sem este predicado ` +
          'devolve a tabela inteira para qualquer conta. A emenda do cliente de 22/10/2026 ' +
          'abriu a lista do DONO, nao a de todos.',
      );
    });
  }

  /**
   * **ISCA do caso de cima.** Sem ela, aquele `assert.match` passaria por as
   * consultas de hoje terem a forma certa — e não por a expressão saber reconhecer a
   * forma errada.
   */
  void it('ISCA: a conferencia do recorte REPROVA um `FROM` sem as duas pontas', () => {
    const semRecorte = semBanco
      .selectFrom('user_connections as c')
      .select('c.ref')
      .where('c.state', '=', 'accepted')
      .compile();
    assert.doesNotMatch(
      semRecorte.sql,
      /\(c\.requester_user_id = quem\.id or c\.addressee_user_id = quem\.id\)/i,
      'a isca passou: a expressao casa ate numa consulta sem recorte por quem chama, ' +
        'entao a conferencia acima nao mede nada.',
    );
  });

  /**
   * **`conta_habilitada` NA ARESTA, e não em qualquer subconsulta** — e este caso
   * nasceu de uma isca que caiu pela metade.
   */
  for (const nome of ['listaDasProprias', 'arestasPorApelido'] as const) {
    void it(`\`${nome}\` chama \`conta_habilitada\` sobre a ARESTA LIDA (alias \`c\`)`, () => {
      const { sql } = TODAS[nome]();
      assert.match(
        sql,
        /conta_habilitada\(c\.requester_user_id\)/i,
        `\`${nome}\`: a chamada tem de ser sobre \`c\`, a aresta de \`juncaoDaAresta\`. ` +
          'Uma chamada numa subconsulta de contagem satisfaz a varredura generica sem ' +
          'recortar nenhuma linha da saida -- medido em 22/10/2026.',
      );
      assert.match(sql, /conta_habilitada\(c\.addressee_user_id\)/i);
    });
  }

  void it('a contagem de conexões também filtra, senão o número não bate com a lista', () => {
    assert.match(TODAS.contagens().sql, /conta_habilitada\([^)]*requester_user_id\)/i);
    assert.match(TODAS.contagens().sql, /conta_habilitada\([^)]*addressee_user_id\)/i);
  });

  void it('o pedido confere as duas contas ANTES de escrever', () => {
    const { sql } = TODAS.pedido();
    const chamadas = sql.match(/conta_habilitada\(/gi) ?? [];
    assert.ok(chamadas.length >= 2, 'o `INSERT` tem de conferir as duas contas');
  });

  void it('ISCA: a conferência REPROVA uma consulta que esqueça um dos lados', () => {
    const soUmLado = semBanco
      .selectFrom('user_connections')
      .select('ref')
      .where((eb) => eb('state', '=', 'accepted'))
      .compile();
    assert.doesNotMatch(
      soUmLado.sql,
      /conta_habilitada\([^)]*addressee_user_id\)/i,
      'a isca passou: a expressão casa até numa consulta sem `conta_habilitada`, ' +
        'então as conferências acima não medem nada.',
    );
  });

  void it('`desfazerPorBloqueio` NÃO filtra por conta habilitada, e é de propósito', () => {
    const { sql } = TODAS.desfazerPorBloqueio();
    assert.doesNotMatch(sql, /conta_habilitada/i);
    assert.match(sql, /delete from user_connections/i);
  });
});

void describe('ISCA (c): os tetos no WHERE do INSERT — o nível que vale na corrida', () => {
  void it('os quatro tetos estão na mesma instrução, com os números ligados', () => {
    const { sql, parameters } = TODAS.pedido();
    assert.equal(
      (sql.match(/\(select count\(\*\)/gi) ?? []).length,
      4,
      'são quatro contagens: 150 do pedinte, 150 do alvo, 20 pendentes e 10 do dia',
    );
    assert.ok(parameters.includes(TETO_DE_CONEXOES));
    assert.ok(parameters.includes(TETO_DE_PENDENTES_ENVIADOS));
    assert.ok(parameters.includes(TETO_DE_PEDIDOS_POR_DIA));
  });

  void it('o teto de 150 é cobrado dos DOIS lados no pedido', () => {
    const { parameters } = TODAS.pedido();
    assert.ok(
      parameters.filter((p) => p === TETO_DE_CONEXOES).length >= 2,
      'o teto de 150 tem de aparecer duas vezes: o do pedinte e o do alvo',
    );
  });

  void it('o aceite também cobra os dois lados — aceitar cria conexão para os dois', () => {
    const { parameters } = TODAS.aceite();
    assert.ok(parameters.filter((p) => p === TETO_DE_CONEXOES).length >= 2);
  });

  void it('a janela do teto diário é CORRIDA, e não de calendário', () => {
    assert.match(TODAS.pedido().sql, /interval '24 hours'/i);
    assert.doesNotMatch(
      TODAS.pedido().sql,
      /date_trunc|current_date/i,
      'janela de calendário deixaria 20 pedidos caberem em dois minutos na virada do dia',
    );
  });

  void it('UMA LINHA POR PAR: o índice do par é a última palavra', () => {
    const { sql } = TODAS.pedido();
    assert.match(sql, /on conflict \(pair_low, pair_high\) do update/i);
    assert.match(sql, /user_connections\.state = 'declined'/i);
    assert.match(sql, /user_connections\.rest_until <= \$\d+::timestamptz/i);
    assert.match(sql, /user_connections\.expires_at <= \$\d+::timestamptz/i);
  });

  void it('a aresta VIVA não é sobrescrita pelo `DO UPDATE`', () => {
    const { sql } = TODAS.pedido();
    assert.doesNotMatch(
      sql,
      /do update\s+set[\s\S]*?where\s+true/i,
      'um `DO UPDATE` sem condição sobrescreveria conexão aceita com um pedido novo',
    );
  });
});

void describe('todo instante entra no SQL com molde explícito', () => {
  void it('nenhum parâmetro de tempo fica sem `::timestamptz`', () => {
    for (const [nome, construtor] of Object.entries(TODAS)) {
      const { sql } = construtor();
      for (const achado of sql.matchAll(/(\$\d+)\s*(?:-|\+)\s*interval/gi)) {
        assert.fail(
          `\`${nome}\` faz aritmética de tempo com ${achado[1] ?? ''} sem molde. ` +
            'Use `${instante}::timestamptz`.',
        );
      }
    }
  });

  void it('a aritmética de tempo que existe usa o molde', () => {
    assert.match(TODAS.pedido().sql, /\$\d+::timestamptz - interval '24 hours'/i);
    assert.match(TODAS.pedido().sql, /\$\d+::timestamptz \+ interval '30 days'/i);
    assert.match(TODAS.encerramento().sql, /\$\d+::timestamptz \+ interval '90 days'/i);
  });
});

void describe('ISCA (f): nenhuma coluna de conta é PROJETADA', () => {
  const PROIBIDAS_NA_SAIDA = [
    'requester_user_id',
    'addressee_user_id',
    'pair_low',
    'pair_high',
    'email_verified_at',
    'phone_verified_at',
  ];

  for (const [nome, construtor] of Object.entries(TODAS)) {
    void it(`\`${nome}\` não seleciona coluna de conta na lista de saída`, () => {
      const { sql } = construtor();
      for (const coluna of PROIBIDAS_NA_SAIDA) {
        assert.doesNotMatch(
          sql,
          new RegExp(`as "?${coluna}"?`, 'i'),
          `\`${nome}\` projetou \`${coluna}\`, e ela é predicado de WHERE, não saída`,
        );
      }
    });
  }

  /** A lista FECHADA de apelidos de saída desta camada. */
  const APELIDOS_PERMITIDOS = new Set([
    'ref',
    'state',
    'sou_quem_pediu',
    'requested_at',
    'expires_at',
    'rest_until',
    'display_name',
    'handle',
    'canal_verificado',
    'total',
    'feito',
    'conexoes',
    'pendentes',
    'do_dia',
    'convidados',
    'conectados',
    'pets_count',
    'connections_count',
    'photo_key',
    'id',
  ]);

  void it('os apelidos de saída vêm de uma lista FECHADA, sem coluna de conta', () => {
    for (const [nome, construtor] of Object.entries(TODAS)) {
      for (const achado of construtor().sql.matchAll(/\bAS\s+(\w+)/gi)) {
        const apelido = (achado[1] ?? '').toLowerCase();
        assert.ok(
          APELIDOS_PERMITIDOS.has(apelido),
          `\`${nome}\` projeta \`${apelido}\`, que não está na lista fechada de saída. ` +
            'Campo novo em resposta é decisão de privacidade, e passa por esta lista.',
        );
      }
    }
  });

  void it('a conta de quem chama é COMPARADA e nunca projetada', () => {
    for (const [nome, construtor] of Object.entries(TODAS)) {
      const { sql } = construtor();
      assert.doesNotMatch(
        sql,
        /quem\.id\s+AS/i,
        `\`${nome}\` projetou \`quem.id\`, que é a conta de quem chama`,
      );
      assert.doesNotMatch(
        sql,
        /c\.id\s+AS/i,
        `\`${nome}\` projetou \`c.id\`, que é o UUIDv7 da aresta (ADR-0010 item 6)`,
      );
    }
  });

  void it('ISCA: a lista fechada REPROVA um apelido de saída novo', () => {
    const comVazamento = 'SELECT c.requester_user_id AS author_user_id FROM user_connections c';
    const apelidos = [...comVazamento.matchAll(/\bAS\s+(\w+)/gi)].map((m) =>
      (m[1] ?? '').toLowerCase(),
    );
    assert.deepEqual(apelidos, ['author_user_id']);
    assert.ok(
      !APELIDOS_PERMITIDOS.has('author_user_id'),
      'a isca passou: a lista fechada aceitaria um apelido que carrega conta.',
    );
  });

  void it('o que sai no lugar da direção é DERIVADO no SQL', () => {
    assert.match(TODAS.arestaPorRef().sql, /\(c\.requester_user_id = quem\.id\)\s+AS sou_quem_pediu/i);
  });

  void it('o apelido é lido pela costura que tolera a coluna ausente', () => {
    for (const nome of ['arestaPorRef', 'arestaDoPar', 'pedido', 'aceite', 'pedidosRecebidos'] as const) {
      assert.match(
        TODAS[nome]().sql,
        /to_jsonb\(\s*\w+\s*\) ->> 'handle'/i,
        `\`${nome}\` não lê o apelido pela costura, e vai quebrar numa base sem a coluna`,
      );
    }
  });
});

void describe('o predicado de par é simétrico, e exige o aceite', () => {
  void it('usa o par canônico, então a ordem dos argumentos não muda nada', () => {
    const { sql } = TODAS.parConectado();
    assert.match(sql, /c\.pair_low = least\(/i);
    assert.match(sql, /c\.pair_high = greatest\(/i);
  });

  void it('ISCA (a) no SQL: `state = accepted` é a condição, e não há alternativa', () => {
    const { sql } = TODAS.parConectado();
    assert.match(sql, /c\.state = 'accepted'/i);
    assert.doesNotMatch(
      sql,
      /'pending'/i,
      'pendente não pode entrar no predicado de conectado: seria conexão sem aceite',
    );
  });

  void it('`desfazerPorBloqueio` é simétrico e não olha o estado', () => {
    const { sql } = TODAS.desfazerPorBloqueio();
    assert.match(sql, /c\.pair_low = least\(/i);
    assert.doesNotMatch(sql, /\bstate\b/i, 'o bloqueio alcança pendente, aceita e recusada por igual');
  });
});

void describe('a caixa de pedidos não devolve conexão aceita', () => {
  void it('`received` traz só pendente', () => {
    const { sql } = TODAS.pedidosRecebidos();
    assert.match(sql, /c\.addressee_user_id = quem\.id AND c\.state = 'pending'/i);
    assert.doesNotMatch(sql, /'accepted'/i);
  });

  void it('`sent` traz pendente e recusado — e é assim que a recusa fica silenciosa', () => {
    const { sql } = TODAS.pedidosEnviados();
    assert.match(sql, /c\.state IN \('pending', 'declined'\)/i);
    assert.doesNotMatch(sql, /'accepted'/i);
  });

  void it('as duas caixas descartam o expirado, sem tarefa periódica', () => {
    assert.match(TODAS.pedidosRecebidos().sql, /c\.expires_at > \$\d+::timestamptz/i);
    assert.match(TODAS.pedidosEnviados().sql, /c\.expires_at > \$\d+::timestamptz/i);
  });

  void it('nenhuma consulta desta camada lista pessoas sem passar por uma aresta', () => {
    for (const [nome, construtor] of Object.entries(TODAS)) {
      const { sql } = construtor();
      if (!/from "?users"?/i.test(sql)) continue;
      assert.match(
        sql,
        /user_connections/i,
        `\`${nome}\` lê \`users\` sem passar por \`user_connections\`: seria enumeração de pessoas`,
      );
    }
  });
});

void describe('ISCA: o contador de convidados tem os DOIS sinais no WHERE', () => {
  const sql = TODAS.contagemDeConvidados().sql.toLowerCase();

  void it('conta aceita, com ESTA conta no destino e origem de convite', () => {
    assert.match(sql, /c\.state = 'accepted'/);
    assert.match(sql, /c\.addressee_user_id = \$\d+::uuid/);
    assert.match(sql, /c\.origin = 'invite_link'/);
    assert.doesNotMatch(
      sql,
      /c\.requester_user_id = \$\d+::uuid/,
      'REPROVA: a contagem de convidados filtra por quem PEDIU. Isso conta quem ' +
        'convidou esta conta, e não quem ela trouxe.',
    );
  });

  void it('exige pet com foto `ready`, e por EXISTS e nao por JOIN', () => {
    assert.match(sql, /exists \(/);
    assert.match(sql, /from pets p/);
    assert.match(sql, /pet_photos f on f\.pet_id = p\.id/);
    assert.match(sql, /f\.status = 'ready'/);
    assert.match(sql, /p\.deleted_at is null/);
    assert.match(
      sql,
      /f\.deleted_at is null/,
      'REPROVA: foto apagada conta. O freio anti-abuso precisa do sinal VIVO.',
    );
    assert.doesNotMatch(
      sql,
      /from user_connections c\s+join pet_photos/,
      'REPROVA: a contagem junta `pet_photos` na aresta. Quem tem três fotos ' +
        'prontas contaria três vezes.',
    );
  });

  void it('o pet e de QUEM PEDIU, e nao de quem conta', () => {
    assert.match(
      sql,
      /p\.owner_user_id = c\.requester_user_id/,
      'REPROVA: o `EXISTS` olha o pet da conta errada. O sinal é da pessoa que ' +
        'entrou pelo convite, não de quem convidou -- esta é a inversão que ' +
        'faria o contador subir por cada pet de quem convida.',
    );
  });

  void it('conta_habilitada nos dois lados, como nas outras contagens', () => {
    assert.match(sql, /conta_habilitada\(c\.requester_user_id\)/);
    assert.match(sql, /conta_habilitada\(c\.addressee_user_id\)/);
  });
});
