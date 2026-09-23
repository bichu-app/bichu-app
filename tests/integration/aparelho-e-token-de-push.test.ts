/**
 * O registro e a revogação do aparelho contra Postgres de verdade (BICHUS-91).
 *
 * ## Por que este arquivo não pode ser unitário
 *
 * O dublê em memória prova a regra e não prova a tabela. Nada do que está aqui
 * existe fora do banco:
 *
 * - **os dois índices únicos parciais.** "Um token, uma conta" e "uma linha sem
 *   token por (conta, plataforma)" são invariantes de esquema; em memória eles
 *   são um `if` que alguém escreveu no dublê, e um `if` no dublê prova o dublê;
 * - **os dois alvos de `ON CONFLICT`.** O Postgres aceita **um** alvo por
 *   comando, e ele precisa casar exatamente com um índice único existente. Um
 *   alvo escrito errado não é achado de revisão: é `ON CONFLICT` sem índice
 *   correspondente, que o banco recusa com erro — e o único jeito de saber é
 *   mandar o comando;
 * - **a reivindicação do token por outra conta**, que é um `UPDATE` disfarçado
 *   de `INSERT` e depende do índice parcial certo estar no alvo;
 * - **o `ON DELETE CASCADE`**, que é o caminho da exclusão de conta;
 * - **o índice parcial de alcançáveis ser de fato usado** pela consulta, medido
 *   por `EXPLAIN`. Um índice que o planejador ignora é um índice que não existe
 *   no momento em que ele importa, e nada além do banco diz isso.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * A pilha é efêmera, o projeto do compose é derivado do caminho do worktree e o
 * banco é derrubado com `-v` no fim. Nada aqui toca a pilha de desenvolvimento.
 *
 * ## As iscas, e como foram provadas
 *
 * Desligadas em `kysely-registro-de-aparelhos.ts`, rodadas contra a pilha
 * efêmera e vistas reprovar em 22/09/2026, e depois restauradas:
 *
 * | o que foi desligado | reprovaram, aqui |
 * |---|---|
 * | `.where('user_id', '=', dono)` removido de `construtorDaRemocaoPeloDono` | 1 caso |
 * | `.where('push_permission', '=', 'granted')` removido dos alcançáveis | 2 casos |
 * | `revogarDoDono` virando `no-op` (a linha fica, e continua elegível) | 3 casos |
 *
 * **A terceira linha é a razão de este arquivo existir.** Com a revogação
 * transformada em `no-op`, a suíte unitária inteira continuou verde — 1037
 * casos, zero falhas — porque o dublê em memória apaga do `Map` de qualquer
 * jeito e nenhum teste sem banco alcança o `DELETE` que não aconteceu. Aqui
 * reprovaram três: a conta seguiu alcançável, o endereço de envio seguiu
 * resolvendo, e a linha alheia seguiu de pé.
 *
 * ## O que sobrevive à execução
 *
 * Nada. As contas criadas são apagadas no `after`, e o `ON DELETE CASCADE` leva
 * os aparelhos junto — que é, ele próprio, um dos casos.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarRegistroDeAparelhos } from '../../src/modules/notifications/adapters/persistence/kysely-registro-de-aparelhos.js';
import type { RegistroDeAparelhos } from '../../src/modules/notifications/ports/registro-de-aparelhos.js';
import type { TokenDeAparelho } from '../../src/modules/notifications/ports/push-sender.js';
import type { Instant, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

const AGORA = 1_800_000_000_000 as Instant;
const DEPOIS = (AGORA + 60_000) as Instant;

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let repo: RegistroDeAparelhos;
const contasCriadas: UserId[] = [];

/** UUIDv7 de verdade não é necessário aqui: a coluna é `uuid` e só. */
const ids = { uuidv7: (): string => randomUUID() };

async function criarConta(): Promise<UserId> {
  const id = randomUUID() as UserId;
  await cliente.query('INSERT INTO users (id, email) VALUES ($1, $2)', [
    id,
    `bichus91-${id}@${DOMINIO_DE_TESTE}`,
  ]);
  contasCriadas.push(id);
  return id;
}

function token(sufixo: string): TokenDeAparelho {
  return `fcm-${randomUUID()}-${sufixo}`;
}

async function linhasDe(dono: UserId): Promise<number> {
  const r = await cliente.query<{ n: string }>(
    'SELECT count(*)::text AS n FROM user_devices WHERE user_id = $1',
    [dono],
  );
  return Number(r.rows[0]?.n ?? '0');
}

void before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    // Verificação que não consegue verificar precisa REPROVAR. Pular aqui faria
    // a suíte ficar verde sem nunca ter tocado num índice único parcial, que é
    // exatamente o que este arquivo existe para provar.
    throw new Error(
      'DATABASE_URL não está definida. Este arquivo mede índices únicos parciais e ' +
        'dois alvos de ON CONFLICT contra Postgres de verdade, e não tem versão em ' +
        'memória. Rode `npm run test:integration`, que sobe a pilha efêmera.',
    );
  }
  banco = createDb(CONEXAO);
  db = banco.db;
  await banco.ping();
  repo = criarRegistroDeAparelhos(db, ids);

  cliente = new pg.Client({ connectionString: CONEXAO });
  await cliente.connect();
});

void after(async () => {
  if (contasCriadas.length > 0) {
    await cliente.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [contasCriadas]);
  }
  await cliente.end();
  await banco.close();
});

void describe('o esquema é o que a migração promete', () => {
  void it('`push_token` é NULLABLE: quem negou continua registrado (ADR-0008)', async () => {
    const r = await cliente.query<{ notnull: boolean }>(
      `SELECT a.attnotnull AS notnull
         FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
        WHERE c.relname = 'user_devices' AND a.attname = 'push_token'`,
    );
    assert.equal(r.rows[0]?.notnull, false, 'um token obrigatório expulsaria do banco quem negou');
  });

  void it('`platform` e `push_permission` são CHECK, e não enum nativo', async () => {
    const r = await cliente.query<{ nome: string; def: string }>(
      `SELECT k.conname AS nome, pg_get_constraintdef(k.oid) AS def
         FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
        WHERE c.relname = 'user_devices' AND k.contype = 'c'`,
    );
    const porNome = new Map(r.rows.map((linha) => [linha.nome, linha.def]));
    assert.match(porNome.get('user_devices_plataforma') ?? '', /android/);
    assert.match(porNome.get('user_devices_permissao') ?? '', /not_asked/);
    // Enum nativo não volta atrás numa migração `down`: `ALTER TYPE ... ADD
    // VALUE` não tem inverso.
    const enums = await cliente.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_type WHERE typname IN ('platform', 'push_permission')`,
    );
    assert.equal(enums.rows[0]?.n, '0');
  });

  void it('os três índices da migração existem, e os dois únicos são parciais', async () => {
    const r = await cliente.query<{ nome: string; def: string }>(
      `SELECT indexname AS nome, indexdef AS def FROM pg_indexes WHERE tablename = 'user_devices'`,
    );
    const porNome = new Map(r.rows.map((linha) => [linha.nome, linha.def]));

    const umToken = porNome.get('user_devices_um_token_uma_conta') ?? '';
    assert.match(umToken, /UNIQUE/i, 'o índice do token deixou de ser único');
    assert.match(umToken, /WHERE\s*\(?push_token IS NOT NULL\)?/i);

    const semToken = porNome.get('user_devices_uma_linha_sem_token_por_plataforma') ?? '';
    assert.match(semToken, /UNIQUE/i);
    assert.match(semToken, /WHERE\s*\(?push_token IS NULL\)?/i);

    const alcancaveis = porNome.get('user_devices_alcancaveis') ?? '';
    assert.match(alcancaveis, /WHERE/i, 'o índice de alcançáveis deixou de ser parcial');
    assert.match(alcancaveis, /granted/);
  });

  void it('`user_id` referencia `users.id` com ON DELETE CASCADE', async () => {
    const r = await cliente.query<{ def: string }>(
      `SELECT pg_get_constraintdef(k.oid) AS def
         FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
        WHERE c.relname = 'user_devices' AND k.contype = 'f'`,
    );
    assert.match(r.rows[0]?.def ?? '', /REFERENCES users\(id\) ON DELETE CASCADE/i);
  });
});

void describe('o registro é idempotente pelo token', () => {
  void it('dois registros do mesmo token e do mesmo dono: uma linha, um id', async () => {
    const dono = await criarConta();
    const t = token('mesmo');

    const primeiro = await repo.registrar(
      dono,
      {
        plataforma: 'android',
        pushToken: t,
        permissao: 'granted',
        versaoDoApp: '1.4.0',
        versaoDoSistema: '14',
      },
      AGORA,
    );
    const segundo = await repo.registrar(
      dono,
      {
        plataforma: 'android',
        pushToken: t,
        permissao: 'granted',
        versaoDoApp: '1.5.0',
        versaoDoSistema: '15',
      },
      DEPOIS,
    );

    assert.equal(await linhasDe(dono), 1, 'a rotação de versão criou um aparelho fantasma');
    assert.equal(primeiro.aparelho.id, segundo.aparelho.id);
    assert.equal(segundo.aparelho.versaoDoApp, '1.5.0');
    assert.equal(segundo.reivindicadoDe, null);
  });

  void it('`registered_at` sobrevive ao conflito; `last_seen_at` avança', async () => {
    // "Há quanto tempo este aparelho existe" não pode ser reescrito a cada
    // rotação de token do FCM: é o que o Perfil mostra para a pessoa
    // reconhecer qual aparelho é qual.
    const dono = await criarConta();
    const t = token('relogio');
    const entrada = {
      plataforma: 'android' as const,
      pushToken: t,
      permissao: 'granted' as const,
      versaoDoApp: null,
      versaoDoSistema: null,
    };

    const primeiro = await repo.registrar(dono, entrada, AGORA);
    const segundo = await repo.registrar(dono, entrada, DEPOIS);

    assert.equal(segundo.aparelho.registradoEm, primeiro.aparelho.registradoEm);
    assert.ok(segundo.aparelho.vistoEm > primeiro.aparelho.vistoEm);
  });

  void it('duas linhas SEM token na mesma plataforma colapsam numa só', async () => {
    // Sem o índice parcial, cada abertura do app de quem negou a permissão
    // inseriria uma linha nova, para sempre. O teto de 60 por hora limita a
    // velocidade, não o crescimento.
    const dono = await criarConta();
    const entrada = {
      plataforma: 'ios' as const,
      pushToken: null,
      permissao: 'not_asked' as const,
      versaoDoApp: null,
      versaoDoSistema: null,
    };

    await repo.registrar(dono, entrada, AGORA);
    await repo.registrar(dono, { ...entrada, permissao: 'denied' }, DEPOIS);

    assert.equal(await linhasDe(dono), 1);
    const lista = await repo.listarDoDono(dono);
    assert.equal(lista[0]?.permissao, 'denied');
  });

  void it('o token que chega apaga a linha sem token da mesma plataforma', async () => {
    // O fluxo normal do iOS: a primeira abertura registra `not_asked` sem
    // token, e a permissão concedida registra o mesmo aparelho COM token. São
    // alvos de conflito diferentes, então sem o colapso o Perfil mostraria um
    // iPhone fantasma que ninguém consegue remover.
    const dono = await criarConta();
    await repo.registrar(
      dono,
      {
        plataforma: 'ios',
        pushToken: null,
        permissao: 'not_asked',
        versaoDoApp: null,
        versaoDoSistema: null,
      },
      AGORA,
    );
    await repo.registrar(
      dono,
      {
        plataforma: 'ios',
        pushToken: token('ios'),
        permissao: 'granted',
        versaoDoApp: null,
        versaoDoSistema: null,
      },
      DEPOIS,
    );

    assert.equal(await linhasDe(dono), 1, 'sobrou a lembrança de uma pergunta como aparelho');
  });
});

void describe('o token que muda de conta é reivindicado (critério 3, sem depender do app)', () => {
  void it('a linha passa para a conta nova e `reivindicadoDe` nomeia a antiga', async () => {
    const antiga = await criarConta();
    const nova = await criarConta();
    const t = token('trocou-de-dono');
    const entrada = {
      plataforma: 'android' as const,
      pushToken: t,
      permissao: 'granted' as const,
      versaoDoApp: null,
      versaoDoSistema: null,
    };

    await repo.registrar(antiga, entrada, AGORA);
    const depois = await repo.registrar(nova, entrada, DEPOIS);

    assert.equal(depois.reivindicadoDe, antiga);
    assert.equal(await linhasDe(antiga), 0, 'o mesmo token ficou vivo em duas contas');
    assert.equal(await linhasDe(nova), 1);
  });

  void it('a conta antiga deixa de ser alcançável no mesmo comando', async () => {
    const antiga = await criarConta();
    const nova = await criarConta();
    const entrada = {
      plataforma: 'android' as const,
      pushToken: token('alcance'),
      permissao: 'granted' as const,
      versaoDoApp: null,
      versaoDoSistema: null,
    };

    await repo.registrar(antiga, entrada, AGORA);
    assert.deepEqual([...(await repo.contasAlcancaveisPorPush([antiga, nova]))], [antiga]);

    await repo.registrar(nova, entrada, DEPOIS);
    assert.deepEqual([...(await repo.contasAlcancaveisPorPush([antiga, nova]))], [nova]);
  });
});

void describe('a autorização está no WHERE: a conta B não alcança o aparelho de A', () => {
  void it('remover o aparelho alheio devolve `null`, e a linha continua lá', async () => {
    const dona = await criarConta();
    const outra = await criarConta();
    const { aparelho } = await repo.registrar(
      dona,
      {
        plataforma: 'android',
        pushToken: token('da-dona'),
        permissao: 'granted',
        versaoDoApp: null,
        versaoDoSistema: null,
      },
      AGORA,
    );

    assert.equal(await repo.revogarDoDono(outra, aparelho.id), null);
    assert.equal(await linhasDe(dona), 1, 'a conta alheia conseguiu apagar o aparelho');

    // E o dono consegue: sem este par, o caso acima passaria com um repositório
    // que não apaga nada.
    const revogado = await repo.revogarDoDono(dona, aparelho.id);
    assert.equal(revogado?.id, aparelho.id);
    assert.equal(await linhasDe(dona), 0);
  });

  void it('a listagem de uma conta não traz o aparelho da outra', async () => {
    const dona = await criarConta();
    const outra = await criarConta();
    const comum = {
      plataforma: 'android' as const,
      permissao: 'granted' as const,
      versaoDoApp: null,
      versaoDoSistema: null,
    };
    await repo.registrar(dona, { ...comum, pushToken: token('a') }, AGORA);
    await repo.registrar(outra, { ...comum, pushToken: token('b') }, AGORA);

    const lista = await repo.listarDoDono(dona);
    assert.equal(lista.length, 1);
    assert.equal(lista[0]?.dono, dona);
  });
});

void describe('aparelho revogado para de ser alcançável e de ter endereço', () => {
  void it('o último aparelho revogado tira a conta da base de alerta (critério 6)', async () => {
    const dono = await criarConta();
    const { aparelho } = await repo.registrar(
      dono,
      {
        plataforma: 'android',
        pushToken: token('unico'),
        permissao: 'granted',
        versaoDoApp: null,
        versaoDoSistema: null,
      },
      AGORA,
    );

    assert.deepEqual(
      [...(await repo.contasAlcancaveisPorPush([dono]))],
      [dono],
      'a conta não era alcançável nem antes: o caso abaixo mediria nada',
    );

    await repo.revogarDoDono(dono, aparelho.id);

    assert.deepEqual(
      [...(await repo.contasAlcancaveisPorPush([dono]))],
      [],
      'a conta continuou alcançável depois de o único aparelho dela ter sido revogado',
    );
  });

  void it('o token recusado pelo FCM derruba UM aparelho, e não os outros', async () => {
    const dono = await criarConta();
    const morto = token('morto');
    const vivo = token('vivo');
    const comum = {
      plataforma: 'android' as const,
      permissao: 'granted' as const,
      versaoDoApp: null,
      versaoDoSistema: null,
    };

    await repo.registrar(dono, { ...comum, pushToken: morto }, AGORA);
    const { aparelho: tablet } = await repo.registrar(dono, { ...comum, pushToken: vivo }, AGORA);

    const revogado = await repo.revogarPorToken(morto);
    assert.ok(revogado !== null);
    assert.equal(await linhasDe(dono), 1, 'a revogação por token derrubou a conta inteira');
    assert.equal(await repo.enderecoDeEnvio(tablet.id), vivo);
    assert.deepEqual([...(await repo.contasAlcancaveisPorPush([dono]))], [dono]);
  });

  void it('revogar o mesmo token duas vezes é sucesso na primeira e `null` na segunda', async () => {
    const dono = await criarConta();
    const t = token('duas-vezes');
    await repo.registrar(
      dono,
      {
        plataforma: 'android',
        pushToken: t,
        permissao: 'granted',
        versaoDoApp: null,
        versaoDoSistema: null,
      },
      AGORA,
    );

    assert.ok((await repo.revogarPorToken(t)) !== null);
    assert.equal(await repo.revogarPorToken(t), null, 'a segunda recusa concorrente virou erro');
  });

  void it('o endereço de envio some no instante da revogação', async () => {
    const dono = await criarConta();
    const { aparelho } = await repo.registrar(
      dono,
      {
        plataforma: 'android',
        pushToken: token('endereco'),
        permissao: 'granted',
        versaoDoApp: null,
        versaoDoSistema: null,
      },
      AGORA,
    );

    assert.ok((await repo.enderecoDeEnvio(aparelho.id)) !== null);
    await repo.revogarDoDono(dono, aparelho.id);
    assert.equal(
      await repo.enderecoDeEnvio(aparelho.id),
      null,
      'um disparo em curso continuaria mandando para o aparelho revogado',
    );
  });

  void it('perder a permissão tira o endereço sem apagar a linha', async () => {
    // O caso é o da pessoa que desliga a notificação nos ajustes do sistema e o
    // app reporta `denied` no próximo registro. A linha fica (ADR-0008: quem
    // negou continua registrado), e o endereço some — que é o que faz a
    // releitura no instante do envio valer alguma coisa.
    const dono = await criarConta();
    const t = token('desligou');
    const comum = {
      plataforma: 'android' as const,
      pushToken: t,
      versaoDoApp: null,
      versaoDoSistema: null,
    };
    const { aparelho } = await repo.registrar(dono, { ...comum, permissao: 'granted' }, AGORA);
    assert.ok((await repo.enderecoDeEnvio(aparelho.id)) !== null);

    await repo.registrar(dono, { ...comum, permissao: 'denied' }, DEPOIS);

    assert.equal(await linhasDe(dono), 1, 'o aparelho de quem negou saiu do banco');
    assert.equal(await repo.enderecoDeEnvio(aparelho.id), null);
    assert.deepEqual([...(await repo.contasAlcancaveisPorPush([dono]))], []);
  });
});

void describe('os dois critérios do ADR-0006, medidos no banco', () => {
  void it('permissão concedida SEM token não torna a conta alcançável', async () => {
    const dono = await criarConta();
    await repo.registrar(
      dono,
      {
        plataforma: 'ios',
        pushToken: null,
        permissao: 'granted',
        versaoDoApp: null,
        versaoDoSistema: null,
      },
      AGORA,
    );
    assert.deepEqual(
      [...(await repo.contasAlcancaveisPorPush([dono]))],
      [],
      'a janela entre "tocou em Permitir" e "o token chegou" entrou na conta de alcance',
    );
  });

  void it('token SEM permissão concedida não torna a conta alcançável', async () => {
    const dono = await criarConta();
    await repo.registrar(
      dono,
      {
        plataforma: 'android',
        pushToken: token('negado'),
        permissao: 'denied',
        versaoDoApp: null,
        versaoDoSistema: null,
      },
      AGORA,
    );
    assert.deepEqual([...(await repo.contasAlcancaveisPorPush([dono]))], []);
  });

  void it('lista de candidatos vazia devolve conjunto vazio, e não erro de sintaxe', async () => {
    // `IN ()` é erro de sintaxe no Postgres. Sem o atalho no adaptador, um
    // disparo num raio sem nenhum tutor derrubaria a rota em vez de responder
    // zero — e zero é a resposta certa aqui, ao contrário do alcance.
    assert.deepEqual([...(await repo.contasAlcancaveisPorPush([]))], []);
  });

  void it('**o índice parcial de alcançáveis é de fato usado** pelo planejador', async () => {
    // Um índice que o planejador ignora é um índice que não existe no momento
    // em que ele importa. `enable_seqscan = off` porque a tabela de teste é
    // pequena e o Postgres varre por ser mais barato: o que se mede aqui é se o
    // índice PODE ser usado pela consulta, ou seja, se o predicado dele casa.
    const dono = await criarConta();
    await repo.registrar(
      dono,
      {
        plataforma: 'android',
        pushToken: token('plano'),
        permissao: 'granted',
        versaoDoApp: null,
        versaoDoSistema: null,
      },
      AGORA,
    );

    await cliente.query('SET LOCAL enable_seqscan = off');
    const plano = await cliente.query<Record<string, string>>(
      `EXPLAIN SELECT DISTINCT user_id FROM user_devices
        WHERE user_id = ANY($1::uuid[])
          AND push_permission = 'granted'
          AND push_token IS NOT NULL`,
      [[dono]],
    );
    const texto = plano.rows.map((linha) => linha['QUERY PLAN'] ?? '').join('\n');
    assert.match(
      texto,
      /user_devices_alcancaveis/,
      'o planejador não alcança o índice parcial dos alcançáveis. O predicado dele ' +
        `deixou de casar com o da consulta. Plano:\n${texto}`,
    );
  });
});

void describe('a exclusão da conta leva os aparelhos junto', () => {
  void it('`DELETE FROM users` apaga as linhas de `user_devices` por CASCADE', async () => {
    const dono = await criarConta();
    await repo.registrar(
      dono,
      {
        plataforma: 'android',
        pushToken: token('cascade'),
        permissao: 'granted',
        versaoDoApp: null,
        versaoDoSistema: null,
      },
      AGORA,
    );
    assert.equal(await linhasDe(dono), 1);

    await cliente.query('DELETE FROM users WHERE id = $1', [dono]);
    assert.equal(
      await linhasDe(dono),
      0,
      'o token de push sobreviveu à exclusão da conta: a credencial de entrega ficou ' +
        'no banco sem dono (ADR-0010, tabela de retenção)',
    );
  });
});

/**
 * SEC-019, segunda camada: o gatilho da migração `20260923000001`.
 *
 * A primeira camada é de aplicação e está em `derrubarTodasAsSessoes`, por onde
 * `excluirMinhaConta` passa. Esta é a de banco, e existe pelo precedente que o
 * repositório já escolheu para o mesmo problema em `20260922000006`.
 *
 * **Ela é a única prova de que a migração roda.** Uma migração de gatilho sem
 * caso que a exercite passa despercebida até o dia em que alguém depende dela —
 * e foi por falta do marcador `-- Up Migration` que "sair de todos" ficou 500
 * por vinte horas em 22/09.
 */
void describe('SEC-019: a exclusão LÓGICA da conta apaga os aparelhos na hora', () => {
  void it('marcar `deleted_at` leva a linha de `user_devices` junto', async () => {
    const tutora = await criarConta();
    await repo.registrar(
      tutora,
      {
        plataforma: 'android',
        pushToken: token('vai-sumir-na-exclusao'),
        permissao: 'granted',
        versaoDoApp: null,
        versaoDoSistema: null,
      },
      AGORA,
    );
    assert.equal(await linhasDe(tutora), 1, 'o aparelho não foi registrado: nada a medir');

    // A exclusão LÓGICA, como `registrarPedidoDeExclusao` a escreve. O expurgo
    // definitivo só acontece 30 dias depois, e esperar por ele deixaria trinta
    // dias de alerta de pet perdido chegando no aparelho de uma conta que a
    // pessoa já mandou apagar.
    await cliente.query(
      `UPDATE users SET deleted_at = now(), status = 'deletion_requested',
                        deletion_requested_at = now()
        WHERE id = $1`,
      [tutora],
    );

    assert.equal(
      await linhasDe(tutora),
      0,
      'a conta foi excluída logicamente e o aparelho CONTINUA no cadastro de push. Ele ' +
        'segue sendo destinatário válido de alerta de pet perdido, com nome do animal e ' +
        'região, por trinta dias depois do pedido de exclusão. Se o gatilho ' +
        '`users_exclusao_logica_apaga_aparelhos` não existe, a migração ' +
        '`20260923000001` não rodou -- confira o marcador `-- Up Migration`.',
    );
  });

  void it('CONTRAPESO: a conta VIZINHA não perde o aparelho dela', async () => {
    // Sem este caso, a implementação mais simples que passa no de cima é um
    // gatilho sem `WHERE user_id = NEW.id`, que esvazia a tabela inteira na
    // primeira exclusão de conta do sistema.
    const queExclui = await criarConta();
    const vizinha = await criarConta();
    const registrar = (dono: UserId, sufixo: string): Promise<unknown> =>
      repo.registrar(
        dono,
        {
          plataforma: 'android',
          pushToken: token(sufixo),
          permissao: 'granted',
          versaoDoApp: null,
          versaoDoSistema: null,
        },
        DEPOIS,
      );
    await registrar(queExclui, 'da-que-exclui');
    await registrar(vizinha, 'da-vizinha');

    await cliente.query('UPDATE users SET deleted_at = now() WHERE id = $1', [queExclui]);

    assert.equal(await linhasDe(vizinha), 1, 'o gatilho alcançou a conta de outra pessoa');
  });

  void it('a REVERSÃO de `deleted_at` não ressuscita aparelho nenhum', async () => {
    // A cláusula `WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)`
    // é o que fecha isto. Um gatilho sem ela dispararia de novo na volta, e o
    // `DELETE` rodaria sobre uma tabela que já está vazia -- inofensivo hoje,
    // e a porta para alguém trocar o corpo do gatilho por algo que não seja.
    const tutora = await criarConta();
    await cliente.query('UPDATE users SET deleted_at = now() WHERE id = $1', [tutora]);
    await cliente.query('UPDATE users SET deleted_at = NULL WHERE id = $1', [tutora]);

    assert.equal(await linhasDe(tutora), 0);
  });
});
