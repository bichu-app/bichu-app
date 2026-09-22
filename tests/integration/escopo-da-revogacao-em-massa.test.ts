/**
 * **Quantas linhas o `UPDATE` atinge**, medido em Postgres de verdade, com
 * duas contas na tabela.
 *
 * ## Por que este arquivo é o principal, e não o complemento
 *
 * `revogarTodasAsFamilias` e `invalidarTokensPendentes` são `UPDATE` sem `id`
 * no `WHERE`. O defeito que importa nelas não é "de quem é a linha que
 * voltou", é **cardinalidade**: removida a cláusula `user_id`, uma tutora
 * apertando "sair de todos os aparelhos" derruba a sessão de toda a base, e
 * uma troca de senha queima o link de verificação de toda a base.
 *
 * **Dublê nenhum mede isso.** O dublê em memória apaga do `Map` da conta
 * pedida de qualquer jeito — a largura da instrução não existe dentro dele. A
 * BICHUS-91 já provou o custo dessa ilusão num caso irmão: `revogarDoDono`
 * virou um `no-op` e os 1037 casos unitários ficaram verdes; só a integração
 * reprovou, e foram 3 casos.
 *
 * `escopo-de-escrita-em-massa.test.ts` é a rede fina e rápida: ele compila o
 * SQL sem banco e prende a cláusula `WHERE` inteira. Ele também não conta
 * linha — SQL compilado é texto, e um escopo por coluna errada compila igual.
 * Quem conta linha é este arquivo.
 *
 * ## Como a contagem é feita, e por que não é `count(*)`
 *
 * Nenhum caso aqui afirma um número absoluto sobre a tabela: a pilha efêmera é
 * compartilhada pelos outros arquivos de integração, e um total é refém do que
 * eles deixaram. O que se mede é o **conjunto de linhas que mudaram**:
 *
 * 1. tira-se um retrato de `(id, revoked_at)` da tabela INTEIRA antes;
 * 2. roda-se a revogação de UMA conta;
 * 3. tira-se o retrato de novo e compara-se linha a linha.
 *
 * O conjunto que mudou tem de ser **exatamente** o das linhas vivas daquela
 * conta. Uma linha a mais, de qualquer outra conta, é o incidente. É a
 * pergunta certa: não "a conta B foi atingida?", que depende de escolher a
 * vítima com sorte, mas "quem MAIS foi atingido?", que não depende de nada.
 *
 * Além do retrato, o caso central é comportamental e é o que uma pessoa
 * entende: **duas contas, revoga uma, a outra continua entrando** — o refresh
 * da conta B ainda rotaciona depois de a conta A ter saído de todos os
 * aparelhos.
 *
 * ## Por que nenhum caso aqui grava `logout_all`
 *
 * Porque o banco recusa esse valor, hoje, em `development`. A migração
 * `20260922000001_motivo-de-revogacao-por-sair-de-todos.sql` é a ÚNICA do
 * repositório sem o marcador `-- Up Migration`, e sem ele o `node-pg-migrate`
 * manda o arquivo INTEIRO como subida: a metade de cima acrescenta
 * `logout_all` à restrição e a metade de baixo, a de descida, a remove na
 * sequência. A migração fica registrada como aplicada, o `COMMENT ON COLUMN`
 * fica de pé, e a restrição volta a ser a antiga.
 *
 * Consequência: `sairDeTodosOsAparelhos` grava `revoked_reason = 'logout_all'`
 * e leva `23514` do Postgres — nada é revogado, `invalidarSessoes` nem chega a
 * rodar, e o remédio que a emenda 1 do ADR-0002 oferece a quem perdeu o
 * aparelho responde 500.
 *
 * **Isso é incidente aberto, e não é o assunto deste arquivo.** Os casos de
 * escopo usam `password_changed`, que é um dos cinco gatilhos do SEC-006 e
 * passa pela MESMA instrução: o que se mede aqui é o alcance do `UPDATE`, e
 * ele não depende do motivo. Quando a restrição for corrigida, trocar o motivo
 * de volta é uma linha.
 *
 * ## O que este arquivo NÃO mede
 *
 * O caminho HTTP e o tempo da revogação, que são de
 * `revogacao-de-sessao.test.ts`, e a barreira `sessions_invalid_before`, que é
 * `invalidarSessoes` e tem escopo de UMA linha por `id` — outra classe de
 * instrução. A ADR-0002 (emenda 1) mantém os dois mecanismos separados e os
 * dois parando na pessoa.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * A pilha é efêmera, o projeto do compose sai do caminho do worktree, e o
 * banco é derrubado com `-v` no fim.
 *
 * ## O que sobrevive à execução
 *
 * Nada. As contas criadas são apagadas no `after`, e o `ON DELETE CASCADE`
 * leva refresh e tokens de verificação junto.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarIdentityRepository } from '../../src/modules/identity/adapters/persistence/kysely-identity-repository.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import type { IdentityRepository } from '../../src/modules/identity/ports/identity-repository.js';
import type { Instant, TokenHash, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

const AGORA = 1_800_000_000_000 as Instant;
const MINUTO = 60 * 1000;
const DIA = 24 * 60 * 60 * 1000;

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let repo: IdentityRepository;
const contasCriadas: UserId[] = [];

async function criarConta(): Promise<UserId> {
  const id = randomUUID() as UserId;
  await cliente.query('INSERT INTO users (id, email) VALUES ($1, $2)', [
    id,
    `escopo-${id}@${DOMINIO_DE_TESTE}`,
  ]);
  contasCriadas.push(id);
  return id;
}

/** Um hash de refresh distinto por chamada, no formato que a porta espera. */
function hashDeRefresh(): TokenHash {
  return Buffer.from(randomUUID().replaceAll('-', ''), 'hex').toString('base64') as TokenHash;
}

interface RefreshCriado {
  readonly id: string;
  readonly familyId: string;
  readonly hash: TokenHash;
}

async function darRefreshVivo(dono: UserId, nascidoEm: Instant = AGORA): Promise<RefreshCriado> {
  const id = randomUUID();
  const familyId = randomUUID();
  const hash = hashDeRefresh();
  await repo.gravarRefresh({
    id,
    userId: dono,
    familyId,
    tokenHash: hash,
    issuedAt: nascidoEm,
    expiresAt: (nascidoEm + 30 * DIA) as Instant,
    absoluteExpiresAt: (nascidoEm + 180 * DIA) as Instant,
    staySignedIn: false,
    userAgent: undefined,
    ipHmac: null,
  });
  return { id, familyId, hash };
}

async function darTokenPendente(dono: UserId): Promise<TokenHash> {
  const hash = hashDeRefresh();
  await repo.criarTokenDeVerificacao({
    id: randomUUID(),
    userId: dono,
    proposito: 'password_reset',
    tokenHash: hash,
    enviadoPara: `pendente-${randomUUID()}@${DOMINIO_DE_TESTE}`,
    expiraEm: (AGORA + 60 * MINUTO) as Instant,
    ipHmac: null,
  });
  return hash;
}

/**
 * Retrato da tabela INTEIRA: id da linha e o instante que marca a morte dela.
 *
 * A tabela inteira, e não as linhas das contas do caso, porque a pergunta é
 * "quem MAIS foi atingido" e a resposta não pode depender de o caso ter
 * adivinhado quem seria a vítima.
 */
async function retrato(tabela: string, coluna: string): Promise<Map<string, string | null>> {
  const r = await cliente.query<{ id: string; marca: Date | null }>(
    `SELECT id, ${coluna} AS marca FROM ${tabela}`,
  );
  return new Map(r.rows.map((l) => [l.id, l.marca === null ? null : l.marca.toISOString()]));
}

function idsQueMudaram(
  antes: Map<string, string | null>,
  depois: Map<string, string | null>,
): Set<string> {
  const mudaram = new Set<string>();
  for (const [id, valor] of depois) {
    if (antes.get(id) !== valor) mudaram.add(id);
  }
  return mudaram;
}

void before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    // Verificação que não consegue verificar precisa REPROVAR. Pular aqui
    // deixaria a suíte verde sem nunca ter contado uma linha, que é exatamente
    // o estado que este arquivo existe para acabar.
    throw new Error(
      'DATABASE_URL não está definida. Este arquivo mede quantas linhas um UPDATE em massa ' +
        'atinge, com duas contas em Postgres de verdade, e não tem versão em memória — o ' +
        'dublê apaga do Map de qualquer jeito. Rode `npm run test:integration`.',
    );
  }
  banco = createDb(CONEXAO);
  db = banco.db;
  await banco.ping();
  repo = criarIdentityRepository(db, criarIdGenerator(() => AGORA));

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

void describe('sair de todos os aparelhos para na conta de quem saiu', () => {
  void it('duas contas, revoga uma: a outra continua entrando', async () => {
    const tutora = await criarConta();
    const outra = await criarConta();
    await darRefreshVivo(tutora);
    const refreshDaOutra = await darRefreshVivo(outra);

    await repo.revogarTodasAsFamilias(tutora, 'password_changed', (AGORA + MINUTO) as Instant);

    // O refresh da outra tutora ainda está vivo E ainda ROTACIONA. Conferir só
    // `revoked_at is null` provaria menos: a renovação é o que a pessoa faz,
    // e é ela que precisa continuar funcionando.
    const armazenado = await repo.buscarRefreshPorHash(refreshDaOutra.hash);
    assert.notEqual(armazenado, undefined, 'o refresh da outra conta sumiu da tabela');
    assert.equal(
      armazenado?.revokedAt,
      null,
      'a outra conta foi revogada junto. Um logout de uma pessoa derrubou a sessão de ' +
        'outra: o UPDATE em massa perdeu o escopo da conta',
    );

    const rotacionou = await repo.rotacionar(
      refreshDaOutra.id,
      {
        id: randomUUID(),
        userId: outra,
        familyId: refreshDaOutra.familyId,
        tokenHash: hashDeRefresh(),
        issuedAt: (AGORA + 2 * MINUTO) as Instant,
        expiresAt: (AGORA + 30 * DIA) as Instant,
        absoluteExpiresAt: (AGORA + 180 * DIA) as Instant,
        staySignedIn: false,
        userAgent: undefined,
        ipHmac: null,
      },
      (AGORA + 2 * MINUTO) as Instant,
    );
    assert.equal(
      rotacionou,
      true,
      'a outra conta não conseguiu renovar depois de a primeira sair de todos os aparelhos',
    );
  });

  void it('as linhas que mudaram na tabela INTEIRA são só as da conta que saiu', async () => {
    const tutora = await criarConta();
    const outra = await criarConta();
    const terceira = await criarConta();
    const daTutora = [await darRefreshVivo(tutora), await darRefreshVivo(tutora)];
    await darRefreshVivo(outra);
    await darRefreshVivo(terceira);

    const antes = await retrato('refresh_tokens', 'revoked_at');
    const caidas = await repo.revogarTodasAsFamilias(
      tutora,
      'password_changed',
      (AGORA + MINUTO) as Instant,
    );
    const depois = await retrato('refresh_tokens', 'revoked_at');

    assert.deepEqual(
      [...idsQueMudaram(antes, depois)].sort(),
      daTutora.map((r) => r.id).sort(),
      'o UPDATE atingiu linhas que não são da conta que saiu. Esta é a falha que nenhum ' +
        'dublê acusa e que nenhuma resposta de rota revela: quem chamou recebeu o efeito ' +
        'que pediu, e quem caiu junto não aparece em requisição nenhuma',
    );
    assert.equal(
      caidas,
      daTutora.length,
      'o número devolvido não é o de linhas realmente atingidas, e é ele que vai para a ' +
        'trilha do SEC-006',
    );
  });

  void it('a segunda chamada devolve 0 e não reescreve a hora da primeira', async () => {
    // `revoked_at IS NULL` no WHERE. Sem ele a contagem mentiria e o motivo da
    // primeira revogação seria sobrescrito pelo da segunda.
    const tutora = await criarConta();
    const refresh = await darRefreshVivo(tutora);

    const primeira = await repo.revogarTodasAsFamilias(
      tutora,
      'password_changed',
      (AGORA + MINUTO) as Instant,
    );
    const antes = await retrato('refresh_tokens', 'revoked_at');
    const segunda = await repo.revogarTodasAsFamilias(
      tutora,
      'account_deleted',
      (AGORA + 10 * MINUTO) as Instant,
    );
    const depois = await retrato('refresh_tokens', 'revoked_at');

    assert.equal(primeira, 1);
    assert.equal(segunda, 0, 'a revogação deixou de ser idempotente');
    assert.equal(idsQueMudaram(antes, depois).size, 0, 'a segunda chamada reescreveu linhas');

    const motivo = await cliente.query<{ revoked_reason: string }>(
      'SELECT revoked_reason FROM refresh_tokens WHERE id = $1',
      [refresh.id],
    );
    assert.equal(
      motivo.rows[0]?.revoked_reason,
      'password_changed',
      'o motivo da primeira revogação foi sobrescrito pela segunda, e a trilha passou a ' +
        'contar outra história do que aconteceu com a conta',
    );
  });
});

void describe('a troca de senha queima os links pendentes de UMA conta', () => {
  void it('duas contas, invalida uma: o link da outra ainda vale', async () => {
    const tutora = await criarConta();
    const outra = await criarConta();
    await darTokenPendente(tutora);
    const linkDaOutra = await darTokenPendente(outra);

    await repo.invalidarTokensPendentes(tutora, (AGORA + MINUTO) as Instant);

    const consumido = await repo.consumirTokenDeVerificacao(
      linkDaOutra,
      'password_reset',
      (AGORA + 2 * MINUTO) as Instant,
    );
    assert.equal(
      consumido?.userId,
      outra,
      'o link de redefinição da outra conta foi queimado junto. Ela agora não consegue ' +
        'redefinir a senha e não tem como saber por quê: o link simplesmente não abre',
    );
  });

  void it('as linhas que mudaram na tabela INTEIRA são só as da conta trocada', async () => {
    const tutora = await criarConta();
    const outra = await criarConta();
    const terceira = await criarConta();
    await darTokenPendente(tutora);
    await darTokenPendente(tutora);
    await darTokenPendente(outra);
    await darTokenPendente(terceira);

    const daTutora = await cliente.query<{ id: string }>(
      'SELECT id FROM verification_tokens WHERE user_id = $1 AND consumed_at IS NULL',
      [tutora],
    );

    const antes = await retrato('verification_tokens', 'consumed_at');
    const queimados = await repo.invalidarTokensPendentes(tutora, (AGORA + MINUTO) as Instant);
    const depois = await retrato('verification_tokens', 'consumed_at');

    assert.deepEqual(
      [...idsQueMudaram(antes, depois)].sort(),
      daTutora.rows.map((l) => l.id).sort(),
      'a invalidação atingiu tokens que não são da conta cuja senha mudou',
    );
    assert.equal(queimados, daTutora.rows.length, 'o número devolvido não é o de links queimados');
  });

  void it('a segunda chamada devolve 0: token já gasto não é queimado de novo', async () => {
    const tutora = await criarConta();
    await darTokenPendente(tutora);

    const primeira = await repo.invalidarTokensPendentes(tutora, (AGORA + MINUTO) as Instant);
    const antes = await retrato('verification_tokens', 'consumed_at');
    const segunda = await repo.invalidarTokensPendentes(tutora, (AGORA + 10 * MINUTO) as Instant);
    const depois = await retrato('verification_tokens', 'consumed_at');

    assert.equal(primeira, 1);
    assert.equal(segunda, 0, 'a invalidação deixou de ser idempotente');
    assert.equal(
      idsQueMudaram(antes, depois).size,
      0,
      'a segunda chamada reescreveu a hora de consumo de um token já gasto',
    );
  });
});
