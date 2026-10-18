/**
 * A exclusão de conta pelo CAMINHO DO PRODUTO, do pedido ao expurgo, com massa
 * de verdade e `DELETE` de verdade.
 *
 * ===========================================================================
 * POR QUE ESTE ARQUIVO EXISTE, SE JÁ HÁ UM PORTÃO DE CHAVE ESTRANGEIRA
 * ===========================================================================
 * `chave-estrangeira-contra-restricao.test.ts` prova que `DELETE FROM users`
 * conclui. Ele é indispensável e não é suficiente: ele apaga a conta **na mão**,
 * com SQL escrito no próprio caso. Nada ali passa por `excluirMinhaConta`, por
 * `registrarPedidoDeExclusao` ou por `expurgarContasExcluidas`, e nada ali
 * repara se o produto nunca chamar nenhuma das três.
 *
 * É exatamente a forma do defeito que a BICHUS-215 existe para fechar:
 * `invalidarTodasAsSessoes` era mecanismo escrito, testado e **sem chamador**,
 * e a suíte inteira ficava verde. Um portão que exercita o banco sem exercitar
 * o caminho prova o mecanismo, não o caminho.
 *
 * ===========================================================================
 * A AFIRMAÇÃO QUE DECIDE O TRABALHO
 * ===========================================================================
 * **A exclusão CONCLUI.** Não "foi chamada", não "não estourou o teste": a
 * linha de `users` deixa de existir, e o que era da pessoa vai junto.
 *
 * Um caso que afirmasse `assert.ok(repo.expurgarConta chamado)` fica verde com
 * um `23503` esperando na fila — e em 22/09 essa fila teve cinco ocorrências em
 * um dia. A quinta (migração `20260922000005`) só aparece quando a achadora
 * escreveu **numa conversa nascida do próprio aviso dela**: `users` cascateia
 * para `found_reports`, `found_reports` cascateia para `conversations`, e o
 * `SET NULL` de `conversation_messages.sender_user_id` revalidava
 * `conversation_id` contra um pai que a mesma instrução tinha acabado de levar.
 *
 * Por isso a massa daqui tem **pet, tag, foto, caso, aviso e conversa com
 * mensagem escrita pela própria pessoa**: é a travessia inteira, e é o que
 * torna "a exclusão concluiu" uma afirmação e não uma esperança.
 *
 * ===========================================================================
 * O QUE ESTE ARQUIVO **NÃO** PEGA, MEDIDO E NÃO DEDUZIDO
 * ===========================================================================
 * A isca foi rodada: uma migração temporária devolveu o `SET NULL` a
 * `conversation_messages.sender_user_id` — a declaração que a migração
 * `20260922000005` corrigiu — e a suíte inteira rodou contra ela.
 *
 * Resultado: `chave-estrangeira-contra-restricao.test.ts` reprovou em QUATRO
 * casos, inclusive o que exige o `23503`; **este arquivo passou**. Com a mesma
 * massa em espírito, a exclusão daqui concluiu mesmo com a declaração errada.
 * A ordem em que o Postgres dispara os gatilhos de integridade de um mesmo
 * `DELETE` depende do conjunto de restrições envolvidas, e a massa daqui tem
 * pet, tag, foto e intenção de envio que a do portão não tem. Remover o
 * `case_id` da conversa, para igualar a forma, não mudou o resultado.
 *
 * A consequência é para quem ler depois, e é o motivo de estar escrito aqui em
 * vez de virar nota de entrega: **a reprodução da quinta forma pertence ao
 * portão de chave estrangeira, não a este arquivo.** Quem apagar aquele arquivo
 * acreditando que este o cobre fica sem rede. Este prova outra coisa, e ela
 * também não tinha prova: que o CAMINHO existe e termina.
 *
 * ===========================================================================
 * O CONTRAPESO
 * ===========================================================================
 * Dois casos afirmam o lado permissivo, e eles são o que impede este arquivo de
 * virar "apaga tudo":
 *
 * - conta com pedido de exclusão de **ontem** não é expurgada. Sem ele, a
 *   implementação mais simples que passa no caso principal é ignorar o prazo, e
 *   o prazo é a janela de socorro de quem clicou errado;
 * - a **trilha de auditoria sobrevive**. `audit.events` não referencia `users`
 *   de propósito (ADR-0010: 24 meses, obrigação legal), e é ela que torna o
 *   prazo verificável por quem audita de fora.
 *
 * Como rodar: `npm run test:integration`, de dentro do worktree.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client } from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarIdentityRepository } from '../../src/modules/identity/adapters/persistence/kysely-identity-repository.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { expurgarContasExcluidas } from '../../src/modules/identity/application/expurgar-contas-excluidas.js';
import { PRAZO_DE_EXPURGO_EM_MS } from '../../src/modules/identity/application/auth-service.js';
import type { AuditEvent, AuditLog } from '../../src/modules/audit/ports/audit-log.js';
import type { Instant, UserId } from '../../src/shared/types/brands.js';
// Os imports de MIDIA (`comoObjectKey`, `criarObjectStorage`,
// `criarApagadorDeObjetosDaConta`, `ObjectStorage`) sairam em 17/10 junto do
// bloco SEC-020 que eles serviam. O bloco conferia que os tres objetos da conta
// saiam do balde no expurgo, e o cliente decidiu o contrario: "Mantenha a foto".
// O que sobrou no lugar e a isca que exige que o apagador NAO seja chamado.

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

const AGORA = Date.parse('2026-09-22T12:00:00.000Z') as Instant;
const DEPOIS_DO_PRAZO = (AGORA + PRAZO_DE_EXPURGO_EM_MS + 60_000) as Instant;

const ACHADORA = '0192f3a1-7c2b-7e3d-9a10-2150000000a1' as UserId;
const DONA = '0192f3a1-7c2b-7e3d-9a10-2150000000a2' as UserId;
const PET_DA_ACHADORA = '0192f3a1-7c2b-7e3d-9a10-2150000000b1';
const PET_DA_DONA = '0192f3a1-7c2b-7e3d-9a10-2150000000b2';
const TAG = '0192f3a1-7c2b-7e3d-9a10-2150000000c1';
const INTENCAO = '0192f3a1-7c2b-7e3d-9a10-2150000000d1';
const FOTO = '0192f3a1-7c2b-7e3d-9a10-2150000000d2';
const CASO = '0192f3a1-7c2b-7e3d-9a10-2150000000e1';
const AVISO = '0192f3a1-7c2b-7e3d-9a10-2150000000f1';
const CONVERSA = '0192f3a1-7c2b-7e3d-9a10-215000000101';
const MENSAGEM = '0192f3a1-7c2b-7e3d-9a10-215000000102';
/** Usada só pelo caso do e-mail livre, e limpa junto com as outras duas. */
const CONTA_DO_EMAIL_LIVRE = '0192f3a1-7c2b-7e3d-9a10-215000000999';
const APARELHO = '0192f3a1-7c2b-7e3d-9a10-215000000103';
/** A identidade de senha da achadora, usada só pela isca da credencial. */
const IDENTIDADE = '0192f3a1-7c2b-7e3d-9a10-215000000104';

let cliente: Client;
let banco: DbHandle;
let db: Db;
let repo: ReturnType<typeof criarIdentityRepository>;

/**
 * O apagador de objeto que estes casos usam, e o que ele DELIBERADAMENTE não
 * prova.
 *
 * Os casos deste bloco medem a travessia de dezoito tabelas e o `DELETE` que
 * cascateia por elas. Eles não medem apagamento de arquivo, e essa foi a leitura
 * errada que sustentou o SEC-020 por meses: **o verde deste arquivo provava
 * apagamento de BANCO e era lido como apagamento de DADO PESSOAL.** Nenhum byte
 * de foto jamais subiu em teste nesta pilha.
 *
 * Este nome existe para que a confusão não seja possível de novo. Quem o lê numa
 * chamada sabe, na hora, que aquele caso não diz nada sobre o balde. Quem quer
 * o apagamento físico tem o bloco `SEC-020`, no fim deste arquivo, e ele
 * **reprova com o motivo** enquanto a pilha não tiver armazenamento.
 */
const SO_O_BANCO = (): Promise<number> => Promise.resolve(0);

/** Trilha que só anota. O que o banco faz é o que este arquivo mede. */
function trilhaQueAnota(): AuditLog & { eventos: AuditEvent[] } {
  const eventos: AuditEvent[] = [];
  return {
    eventos,
    record(evento) {
      eventos.push(evento);
      return Promise.resolve();
    },
  };
}

before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    // Falha ruidosa, nunca `skip`. Um arquivo que se pula sozinho por falta de
    // banco termina verde e ninguém desconfia — e o que ele deixa de conferir é
    // a única instrução deste produto que dispara a árvore de cascatas inteira.
    throw new Error(
      'DATABASE_URL não está definida. Este arquivo apaga uma conta de verdade e exige que ' +
        'a operação CONCLUA. Sem banco ele não confere nada, e passar verde sem conferir é ' +
        'o desfecho que ele existe para impedir. Rode `npm run test:integration`.',
    );
  }
  cliente = new Client({ connectionString: CONEXAO });
  await cliente.connect();
  banco = createDb(CONEXAO);
  db = banco.db;
  repo = criarIdentityRepository(db, criarIdGenerator(() => AGORA));
});

after(async () => {
  await banco?.close();
  await cliente?.end();
});

// `codigoDoErro` saiu com o bloco que lia `23503`/`23514` das cascatas. Nenhuma
// cascata dispara mais: nada apaga `users`.

/**
 * A massa: tudo o que a exclusão precisa atravessar.
 *
 * A conversa nasce do aviso da PRÓPRIA achadora e tem uma mensagem escrita por
 * ela. É essa combinação, e só ela, que exercita a quinta forma da classe de
 * 22/09 — sem a mensagem, ou com ela marcada como `system`, a exclusão conclui
 * mesmo com a declaração errada, e o caso vira decoração.
 *
 * Ela é COMMITADA, e não isolada num `BEGIN`/`ROLLBACK`.
 *
 * Não é preferência: o repositório sob teste tem a conexão dele (o pool do
 * Kysely), e uma transação aberta neste cliente é invisível de lá. Massa dentro
 * de savepoint faria `expurgarContasExcluidas` enxergar um banco sem as linhas
 * e devolver "zero examinadas" — verde, sem ter exercitado nada.
 *
 * A limpeza é explícita e roda mesmo quando o caso reprova. Ela usa o mesmo
 * `DELETE FROM users` que está sob teste, e isso é deliberado: se a limpeza
 * falhar, a pilha efêmera some junto e o caso seguinte não herda lixo.
 */
async function comMassa(corpo: () => Promise<void>): Promise<void> {
  try {
    await cliente.query(
      `insert into users (id, email, deleted_at, status, deletion_requested_at) values
         ($1, 'achadora@expurgo.test', null, 'active', null),
         ($2, 'dona@expurgo.test',     null, 'active', null)`,
      [ACHADORA, DONA],
    );
    await cliente.query(
      `insert into pets (id, owner_user_id, name, species_code, size_code) values
         ($1, $2, 'Rex', 'dog', 'M'),
         ($3, $4, 'Mel', 'dog', 'M')`,
      [PET_DA_ACHADORA, ACHADORA, PET_DA_DONA, DONA],
    );
    await cliente.query(
      `insert into pet_tags (id, pet_id, code_hash, code_suffix, code_ciphertext)
       values ($1, $2, sha256('expurgo'::bytea), 'EXP7', 'cifra-para-reimpressao')`,
      [TAG, PET_DA_ACHADORA],
    );
    await cliente.query(
      `insert into upload_intents
         (id, user_id, pet_id, kind, object_key, declared_type, max_bytes, expires_at)
       values ($1, $2, $3, 'pet_photo', 'expurgo/1', 'image/jpeg', 1000000,
               now() + interval '1 hour')`,
      [INTENCAO, ACHADORA, PET_DA_ACHADORA],
    );
    await cliente.query(
      `insert into pet_photos
         (id, pet_id, upload_intent_id, status, original_key, is_primary, created_at)
       values ($1, $2, $3, 'processing', 'expurgo/1', false, now())`,
      [FOTO, PET_DA_ACHADORA, INTENCAO],
    );
    await cliente.query(
      `insert into lost_cases (id, pet_id, owner_user_id, last_seen_at, last_seen_city, share_token)
       values ($1, $2, $3, now(), 'Sao Paulo', 'tok-do-caso-do-expurgo')`,
      [CASO, PET_DA_DONA, DONA],
    );
    // O aviso avulso é da ACHADORA, e fala do pet da DONA. É a pista que
    // atravessa pessoas, e é o que a pergunta aberta com o cliente decide.
    await cliente.query(
      `insert into found_reports
         (id, origin, reporter_user_id, found_at, species, size, found_city, retention_until)
       values ($1, 'stray_report', $2, now(), 'dog', 'M', 'Sao Paulo', now() + interval '90 days')`,
      [AVISO, ACHADORA],
    );
    await cliente.query(
      `insert into conversations (id, found_report_id, pet_id, case_id, tutor_user_id, finder_user_id)
       values ($1, $2, $3, $4, $5, $6)`,
      [CONVERSA, AVISO, PET_DA_DONA, CASO, DONA, ACHADORA],
    );
    // A MENSAGEM DA PRÓPRIA ACHADORA. É esta linha que faz a quinta forma
    // aparecer: `sender_user_id` preenchido, numa conversa que a cascata do
    // aviso leva embora na mesma instrução.
    await cliente.query(
      `insert into conversation_messages (id, conversation_id, sender_role, sender_user_id, body)
       values ($1, $2, 'finder', $3, 'Achei ele na praca, esta bem')`,
      [MENSAGEM, CONVERSA, ACHADORA],
    );
    await corpo();
  } finally {
    await cliente.query('delete from users where id in ($1, $2, $3)', [
      ACHADORA,
      DONA,
      CONTA_DO_EMAIL_LIVRE,
    ]);
  }
}

async function contar(sql: string, parametros: unknown[]): Promise<string> {
  const { rows } = await cliente.query<{ n: string }>(sql, parametros);
  return rows[0]?.n ?? 'consulta sem linha';
}

void describe('exclusão de conta pelo caminho do produto (BICHUS-215)', () => {
  void it('o pedido marca a conta, revoga as tags e NÃO apaga nada', async () => {
    await comMassa(async () => {
      const consequencias = await repo.registrarPedidoDeExclusao(ACHADORA, AGORA);

      assert.deepEqual(consequencias, { tagsRevogadas: 1 });

      const { rows } = await cliente.query<{
        status: string;
        tem_deleted_at: boolean;
        tem_pedido: boolean;
        pets: string;
      }>(
        `select u.status,
                u.deleted_at is not null            as tem_deleted_at,
                u.deletion_requested_at is not null as tem_pedido,
                (select count(*) from pets where owner_user_id = u.id)::text as pets
           from users u where u.id = $1`,
        [ACHADORA],
      );
      // "Exclusão lógica imediata, expurgo definitivo em 30 dias" — as duas
      // metades da mesma frase do contrato. Um `DELETE` aqui tiraria a janela
      // de socorro de quem clicou errado.
      assert.deepEqual(rows[0], {
        status: 'deletion_requested',
        tem_deleted_at: true,
        tem_pedido: true,
        pets: '1',
      });
    });
  });

  void it('a tag revogada é estado COMPLETO e não guarda mais o código', async () => {
    await comMassa(async () => {
      await repo.registrarPedidoDeExclusao(ACHADORA, AGORA);

      const { rows } = await cliente.query<{
        status: string;
        motivo: string | null;
        tem_revoked_at: boolean;
        tem_cifra: boolean;
      }>(
        `select status, revocation_reason as motivo,
                revoked_at is not null      as tem_revoked_at,
                code_ciphertext is not null as tem_cifra
           from pet_tags where id = $1`,
        [TAG],
      );
      // A plaquinha está numa coleira, na rua, e resolve sem ninguém
      // autenticar. Trinta dias de QR vivo apontando para o pet de uma conta
      // excluída é o buraco que a exclusão existe para fechar. E o ADR-0004
      // manda apagar o texto cifrado guardado para reimpressão.
      assert.deepEqual(rows[0], {
        status: 'revoked',
        motivo: 'owner_request',
        tem_revoked_at: true,
        tem_cifra: false,
      });
    });
  });

  void it('o e-mail fica livre no mesmo instante: a pessoa pode voltar', async () => {
    await comMassa(async () => {
      await repo.registrarPedidoDeExclusao(ACHADORA, AGORA);

      // `users_email_unico_ativo` é parcial `WHERE deleted_at IS NULL`. Sem o
      // `deleted_at` na marcação, quem excluiu a conta ficaria impedido de
      // criar outra com o próprio endereço até o expurgo — 30 dias depois.
      await cliente.query(`insert into users (id, email) values ($1, 'achadora@expurgo.test')`, [
        CONTA_DO_EMAIL_LIVRE,
      ]);
      assert.equal(
        await contar(
          `select count(*)::text as n from users where email = 'achadora@expurgo.test'`,
          [],
        ),
        '2',
      );
    });
  });

  /**
   * ISCA PRINCIPAL DO DESENHO DE 17/10.
   *
   * Até 17/10 o caso daqui se chamava "A EXCLUSÃO CONCLUI: o expurgo apaga a
   * conta e tudo o que é dela", e ele conferia dezoito tabelas vazias. Foi
   * invertido, e a inversão é o registro de que a troca foi deliberada. A
   * decisão do cliente, literal:
   *
   * > *"Mantenha a foto e não delete os dados do usuário, apenas desabilite na
   * > plataforma e filtro as páginas para que esse usuário não seja mais
   * > encontrado em nenhuma pagina ou funcionalidade"*
   *
   * O caso agora passa o relógio para DEPOIS do prazo -- o instante em que o
   * desenho antigo apagava tudo -- e exige que **tudo continue lá**.
   */
  void it('ISCA: passado o prazo, NADA foi apagado -- a conta só está desabilitada', async () => {
    await comMassa(async () => {
      await repo.registrarPedidoDeExclusao(ACHADORA, AGORA);

      const resultado = await expurgarContasExcluidas({
        repositorio: repo,
        trilha: trilhaQueAnota(),
        clock: { now: () => DEPOIS_DO_PRAZO },
        apagarObjetosDaConta: SO_O_BANCO,
      });

      assert.equal(resultado.falhas, 0);
      assert.equal(
        resultado.expurgadas,
        0,
        'o expurgo expurgou alguma coisa. Desde 17/10 ele é inócuo de propósito.',
      );

      // AS SETE CADEIAS, uma por linha, e a conta na primeira. Uma asserção por
      // tabela e não um laço: quando uma reprovar, o nome da tabela precisa
      // estar na mensagem de quem lê a falha.
      for (const [tabela, sql, parametros] of [
        ['users', `select count(*)::text as n from users where id = $1`, [ACHADORA]],
        ['pets', `select count(*)::text as n from pets where owner_user_id = $1`, [ACHADORA]],
        ['pet_tags', `select count(*)::text as n from pet_tags where id = $1`, [TAG]],
        ['pet_photos', `select count(*)::text as n from pet_photos where id = $1`, [FOTO]],
        ['upload_intents', `select count(*)::text as n from upload_intents where id = $1`, [INTENCAO]],
        ['lost_cases', `select count(*)::text as n from lost_cases where id = $1`, [CASO]],
        ['found_reports', `select count(*)::text as n from found_reports where id = $1`, [AVISO]],
        ['conversations', `select count(*)::text as n from conversations where id = $1`, [CONVERSA]],
        ['conversation_messages', `select count(*)::text as n from conversation_messages where id = $1`, [MENSAGEM]],
      ] as readonly [string, string, unknown[]][]) {
        assert.equal(
          await contar(sql, parametros),
          '1',
          `${tabela}: a linha SUMIU depois do prazo. Nada pode ser apagado -- a conta é ` +
            `desabilitada e as leituras a filtram no WHERE.`,
        );
      }

      // A MARCA DE QUE A PESSOA SAIU CONTINUA, e ela é o que os filtros leem.
      // Sem ela, "desabilitar" não é observável por nenhuma consulta e o
      // desenho inteiro cai.
      assert.equal(
        await contar(
          `select count(*)::text as n from users where id = $1 and deleted_at is not null and status = 'deletion_requested'`,
          [ACHADORA],
        ),
        '1',
        'a conta perdeu a marca de desabilitada. É ela que todo filtro de leitura consulta.',
      );
    });
  });

  /**
   * ISCA: o expurgo não chama quem apaga arquivo.
   *
   * `apagarObjetosDaConta` continua sendo injetada por `src/bin/worker.ts`, que
   * é de outra branch e não pôde ser editado nesta. Enquanto a fiação existir, a
   * única coisa que garante que a foto fica é `expurgarContasExcluidas` IGNORAR
   * a dependência -- e isso é o que este caso mede. Uma dublê que estoura ao ser
   * chamada, e não um contador: se ela for chamada, o caso não tem como passar.
   */
  void it('ISCA: o expurgo NÃO chama o apagador de objeto -- a foto fica', async () => {
    await comMassa(async () => {
      await repo.registrarPedidoDeExclusao(ACHADORA, AGORA);

      const resultado = await expurgarContasExcluidas({
        repositorio: repo,
        trilha: trilhaQueAnota(),
        clock: { now: () => DEPOIS_DO_PRAZO },
        apagarObjetosDaConta: () => {
          throw new Error(
            'o expurgo chamou `apagarObjetosDaConta`. O cliente pediu "Mantenha a foto" ' +
              'em 17/10, e esta chamada é exatamente o que apaga os objetos do balde (SEC-020).',
          );
        },
      });

      assert.equal(resultado.falhas, 0, 'a falha aqui é a chamada ao apagador: leia a mensagem acima');
    });
  });

  /**
   * ISCA: o gatilho de 20260928000007 não existe mais.
   *
   * Ele apagava `user_devices` no instante da exclusão lógica. Conferido pelo
   * CATÁLOGO do banco e não pelo efeito: um caso que só olhasse a linha ficaria
   * verde numa massa sem aparelho, e é justamente num banco recém-migrado que o
   * gatilho voltaria sem ninguém ver.
   */
  void it('ISCA: nenhum gatilho de `users` apaga `user_devices`', async () => {
    assert.equal(
      await contar(
        `select count(*)::text as n from pg_trigger
          where tgrelid = 'users'::regclass
            and not tgisinternal
            and tgname = 'users_exclusao_logica_apaga_aparelhos'`,
        [],
      ),
      '0',
      'o gatilho `users_exclusao_logica_apaga_aparelhos` voltou. Ele apaga o cadastro de ' +
        'aparelho e de token de push na exclusão lógica, e desde 17/10 nada é apagado: quem ' +
        'tira o aparelho do alcance é `u.deleted_at IS NULL` em kysely-alcance-por-postgis.ts.',
    );
  });

  void it('ISCA: `user_devices` sobrevive à exclusão lógica da conta', async () => {
    await comMassa(async () => {
      // `last_seen_at` É `NOT NULL` E NÃO TEM `DEFAULT`, e é por isso que ela
      // está escrita aqui. Esta isca nasceu em 18/10 sem a coluna, nunca foi
      // executada, e reprovava em `23502 null value in column "last_seen_at"`
      // -- antes de chegar a medir a retenção, que é o que ela existe para
      // medir. A forma é a mesma de `registrar` em
      // `kysely-registro-de-aparelhos.ts`: registrado agora, visto agora.
      await cliente.query(
        `insert into user_devices
           (id, user_id, platform, push_token, push_permission, registered_at, last_seen_at)
         values ($1, $2, 'android', $3, 'granted', now(), now())`,
        [APARELHO, ACHADORA, 'token-de-teste-que-nao-e-segredo'],
      );

      await repo.registrarPedidoDeExclusao(ACHADORA, AGORA);

      assert.equal(
        await contar(`select count(*)::text as n from user_devices where id = $1`, [APARELHO]),
        '1',
        'a linha de `user_devices` foi apagada na exclusão lógica. Desde 17/10 ela é RETIDA.',
      );
    });
  });

  void it('CONTRAPESO: conta VIVA também não é tocada', async () => {
    await comMassa(async () => {
      const resultado = await expurgarContasExcluidas({
        repositorio: repo,
        trilha: trilhaQueAnota(),
        clock: { now: () => DEPOIS_DO_PRAZO },
        apagarObjetosDaConta: SO_O_BANCO,
      });

      assert.equal(resultado.falhas, 0);
      assert.equal(
        await contar(`select count(*)::text as n from users where id in ($1, $2)`, [ACHADORA, DONA]),
        '2',
      );
    });
  });

  /**
   * ISCA DA TRILHA, pelo avesso.
   *
   * `privacy.account_purged` era a única memória de que a conta tinha deixado de
   * existir. Nada deixa de existir, então o evento não pode ser gravado: ele
   * afirmaria à auditoria um apagamento que não aconteceu, que é a classe de
   * defeito de leitura que o SEC-020 existia para corrigir -- agora com o sinal
   * trocado.
   */
  void it('ISCA: `privacy.account_purged` NÃO é mais gravado -- nada foi expurgado', async () => {
    await comMassa(async () => {
      await repo.registrarPedidoDeExclusao(ACHADORA, AGORA);
      const trilha = trilhaQueAnota();

      await expurgarContasExcluidas({
        repositorio: repo,
        trilha,
        clock: { now: () => DEPOIS_DO_PRAZO },
        apagarObjetosDaConta: SO_O_BANCO,
      });

      assert.equal(
        trilha.eventos.filter((e) => e.action === 'privacy.account_purged').length,
        0,
        'a trilha afirma `privacy.account_purged` sem que nada tenha sido purgado. O evento ' +
          'que prova apagamento não pode existir num desenho que não apaga.',
      );
    });
  });

  /**
   * ISCA: a conta desabilitada NÃO entra.
   *
   * Pedida explicitamente pelo cliente. Mede o estado da conta pela cláusula que
   * `autenticar()` aplica (`status !== 'active'` recusa), e mede também que a
   * credencial CONTINUA LÁ: recusar apagando a senha seria apagar dado.
   */
  void it('ISCA: conta desabilitada não entra, e a credencial não foi apagada', async () => {
    await comMassa(async () => {
      // A SENHA DA ACHADORA, semeada aqui e não em `comMassa`: só este caso a
      // mede, e massa que nenhum outro caso usa é massa que ninguém consegue
      // justificar depois. As duas linhas saem com a conta na limpeza, pelas
      // cascatas `user_identities.user_id` e `local_credentials.identity_id`,
      // que `chave-estrangeira-contra-restricao.test.ts` declara.
      await cliente.query(
        `insert into user_identities (id, user_id, provider, provider_subject)
         values ($1, $2, 'local', 'achadora@expurgo.test')`,
        [IDENTIDADE, ACHADORA],
      );
      await cliente.query(
        `insert into local_credentials (identity_id, password_phc, password_updated_at)
         values ($1, '$pbkdf2-sha512$i=1$c2Fs$aGFzaA', now())`,
        [IDENTIDADE],
      );

      await repo.registrarPedidoDeExclusao(ACHADORA, AGORA);

      assert.equal(
        await contar(
          `select count(*)::text as n from users where id = $1 and status = 'active'`,
          [ACHADORA],
        ),
        '0',
        'a conta desabilitada continua `active`, e `autenticar()` recusa exatamente por ' +
          'status: com ela ativa, o login passa.',
      );
      assert.equal(
        // `local_credentials`, E A TABELA É POR `identity_id`. A isca nasceu em
        // 18/10 consultando `user_credentials where user_id = ...`, que não
        // existe neste esquema, e reprovava em `42P01 relation
        // "user_credentials" does not exist` sem chegar a medir nada. A senha
        // mora em `local_credentials (identity_id, password_phc, ...)`, pendurada
        // em `user_identities` -- é `user_identities.user_id` que leva à conta, e
        // `provider = 'local'` é a identidade de senha (as outras três do
        // `CHECK` são `google`, `apple` e `keycloak`).
        await contar(
          `select count(*)::text as n
             from local_credentials c
             join user_identities i on i.id = c.identity_id
            where i.user_id = $1`,
          [ACHADORA],
        ),
        '1',
        'a credencial foi APAGADA. O login tem de ser recusado por ESTADO da conta, não por ' +
          'ausência de senha -- apagar a senha é apagar dado do usuário.',
      );
    });
  });
});
