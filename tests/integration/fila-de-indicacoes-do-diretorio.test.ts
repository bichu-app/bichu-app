/**
 * ISCAS DA FILA DE INDICAÇÕES do `Perto` (18/10/2026).
 *
 * ## A queixa que a fila responde, literal
 *
 * > *"No backoffice não tem um menu para aprovar os profissionais que as
 * > pessoas estão indicando."*
 *
 * E a decisão que manda: *"recomendação passa por revisão do administrador no
 * backoffice"*.
 *
 * ## ===================================================================
 * ## ESTAS ISCAS NÃO FORAM RODADAS, E ISSO ESTÁ DECLARADO
 * ## ===================================================================
 *
 * Regra do cliente nesta rodada: nada de suíte unitária nem de integração. O
 * banco é COMPARTILHADO entre os worktrees, e `npm run test:integration`
 * aplicaria migração nele. Então elas estão escritas, lidas e **não
 * executadas** — quem rodar primeiro é quem vai saber se passam.
 *
 * O que FOI exercitado contra o Postgres de homologação, em `BEGIN/ROLLBACK`:
 * a subida da `20261017000016` (as duas colunas, os três `CHECK` e a função
 * `indicacao_com_autor_ativo`), mais a recusa de `decline_reason` em linha
 * pendente. A descida não foi exercitada, e nem a ordem real do `migrate up`.
 *
 * ## POR QUE ESTE ARQUIVO EXIGE BANCO
 *
 * Porque três dos quatro mecanismos são **de banco**:
 *
 * - `indicacao_com_autor_ativo(uuid)` é função SQL que delega a
 *   `conta_habilitada(uuid)`. Dublê não tem função de banco, e é exatamente a
 *   classe de coisa que fica verde em dublê e aberta em produção;
 * - a aprovação escreve em DUAS tabelas na MESMA transação
 *   (`professionals` e `directory_suggestions`), mais a trilha. Dublê não
 *   desfaz;
 * - o `CHECK directory_suggestions_entrada_so_na_aprovacao` é o que garante
 *   que a ligação não existe fora de `approved`.
 *
 * ## A PROVA É POR DESLIGAMENTO
 *
 * Cada caso diz, por extenso, o que se apaga do código para ele ficar
 * vermelho. Caso que passa com o mecanismo desligado não é prova de nada, e
 * este projeto já aprovou 1037 casos com um mecanismo desligado.
 *
 * ## Como rodar: `npm run test:integration`, de dentro do worktree.
 *
 * ## O que sobrevive à execução
 *
 * Nada. Contas, indicações, entradas e linhas de trilha saem no `after`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { sql } from 'kysely';

import { loadAppConfig } from '../../src/shared/config/app-config.js';
import { createDb, type Db } from '../../src/shared/db/pool.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { criarTrilhaTransacional } from '../../src/modules/audit/adapters/persistence/kysely-audit-log.js';
import { criarDirectoryRepository } from '../../src/modules/professionals/adapters/persistence/kysely-directory-repository.js';
import { criarFilaDeIndicacoesRepository } from '../../src/modules/professionals/adapters/persistence/kysely-fila-de-indicacoes.js';
import { FilaDeIndicacoes } from '../../src/modules/professionals/application/fila-de-indicacoes.js';
import type { Autor } from '../../src/modules/professionals/application/diretorio-administrativo.js';
import { AppError } from '../../src/shared/http/errors.js';
import type { AdminAccountId, Instant, UserId } from '../../src/shared/types/brands.js';
import type { Clock } from '../../src/shared/time/clock.js';
import type { DirectoryRepository } from '../../src/modules/professionals/ports/directory-repository.js';

const relogio: Clock = { now: () => Date.now() as Instant };
const ids = criarIdGenerator(() => relogio.now());

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO = 'exemplo.invalid';
/**
 * A listagem do `Perto` é pedida com `sort: 'name'`, e não por distância.
 *
 * Não é economia de setup: a conta deste caso não tem localização de referência,
 * e `distance_available: false` é o que a própria porta devolve nesse caso. Uma
 * ordem por distância aqui mediria a geolocalização do aparelho em vez de medir
 * se a entrada aprovada APARECE — que é o que esta isca existe para medir.
 */

let banco: { db: Db; close: () => Promise<void> };
let config: ReturnType<typeof loadAppConfig>;
let fila: FilaDeIndicacoes;
let perto: DirectoryRepository;
let autor: Autor;

const contas: string[] = [];
const contasDoPainel: string[] = [];
const refs: string[] = [];
const slugs: string[] = [];

const sufixo = () => randomBytes(6).toString('hex');

/** Uma conta do painel. O hash é de teste e nunca confere com senha nenhuma. */
async function novaContaDoPainel(): Promise<AdminAccountId> {
  const id = ids.uuidv7() as AdminAccountId;
  await banco.db
    .insertInto('admin_accounts')
    .values({
      id,
      email: `fila-painel-${sufixo()}@${DOMINIO}`,
      display_name: 'Revisão',
      password_phc: '$pbkdf2-sha512$i=1$c2Fs$aGFzaA',
      password_updated_at: new Date(),
    })
    .execute();
  contasDoPainel.push(id);
  return id;
}

async function novaConta(): Promise<UserId> {
  const id = randomUUID() as UserId;
  await sql`
    insert into users (id, email, display_name, created_at, updated_at)
    values (${id}::uuid, ${`fila-${sufixo()}@${DOMINIO}`}, 'Quem Indicou', now(), now())
  `.execute(banco.db);
  contas.push(id);
  return id;
}

/** Desabilita a conta pelo caminho de 17/10: nada é apagado. */
async function desabilitar(userId: UserId): Promise<void> {
  await sql`update users set deleted_at = now() where id = ${userId}::uuid`.execute(banco.db);
}

/**
 * Uma indicação na fila, pela MESMA função que a rota do aplicativo usa
 * (`directory_suggestions_registrar`, migração `20261017000004`): escrever o
 * `INSERT` à mão aqui criaria um segundo caminho de escrita, e o caso passaria a
 * medir o caminho do teste em vez do caminho do produto.
 */
async function indicar(
  autorDaIndicacao: UserId,
  ajuste: { nome?: string; contato?: ['phone' | 'website' | 'instagram', string]; recado?: string | null } = {},
): Promise<string> {
  const ref = randomBytes(16).toString('base64url');
  const [kind, valor] = ajuste.contato ?? (['phone', '+551130612200'] as const);
  await sql`
    select directory_suggestions_registrar(
      ${ids.uuidv7()}::uuid, ${ref}, ${autorDaIndicacao}::uuid,
      ${ajuste.nome ?? `Clinica ${sufixo()}`}, 'clinic', 'Sao Paulo', 'SP', 'Bela Vista',
      ${kind}, ${valor}, ${ajuste.recado ?? null})
  `.execute(banco.db);
  refs.push(ref);
  return ref;
}

async function trilhaDe(ref: string) {
  return banco.db
    .selectFrom('audit.events')
    .select(['action', 'actor_admin_id', 'before', 'after'])
    .where('resource_kind', '=', 'directory_suggestion')
    .where('resource_id', '=', ref)
    .orderBy('occurred_at', 'asc')
    .execute();
}

function codigo(erro: unknown): string | undefined {
  if (!(erro instanceof AppError)) return undefined;
  return erro.errors?.[0]?.code ?? erro.problemType;
}

before(async () => {
  config = loadAppConfig();
  banco = createDb(config.databaseUrl);
  autor = {
    adminAccountId: await novaContaDoPainel(),
    sessao: 'f1e2d3c4b5a60718',
    ip: '203.0.113.9',
    correlationId: randomUUID(),
  };
  fila = new FilaDeIndicacoes({
    repositorio: criarFilaDeIndicacoesRepository({
      db: banco.db,
      trilha: criarTrilhaTransacional({ ids, clock: relogio, ipHmacKey: config.ipHmacKey }),
    }),
    ids,
    clock: relogio,
    // O detector de verdade, pelo mesmo par que `src/bin/api.ts` passa. Um
    // dublê aqui faria o caso aprovar motivo que o produto recusa.
    conferencias: {
      errosDeTextoDeUsuario: (campo, valor, minimo, maximo) =>
        valor.trim().length < minimo || valor.trim().length > maximo
          ? [{ field: campo, code: 'length', message: 'fora do tamanho' }]
          : [],
      handleDoInstagram: (valor) => valor.replace(/^@/, '').toLowerCase() || null,
    },
  });
  // O 2o argumento entrou em 18/10 com a avaliacao do local (o `ref` da
  // avaliacao e 128 bits de CSPRNG). Passa-se o `ids` que este arquivo ja
  // constroi sobre o relogio do teste, e nao `Date.now`: a fila e medida com
  // tempo controlado, e dois geradores no mesmo caso seriam duas verdades.
  perto = criarDirectoryRepository(banco.db, ids);
});

after(async () => {
  if (banco === undefined) return;
  for (const ref of refs) {
    await sql`delete from directory_suggestions where ref = ${ref}`.execute(banco.db);
  }
  for (const slug of slugs) {
    await sql`delete from professionals where slug = ${slug}`.execute(banco.db);
  }
  await sql`delete from audit.events where actor_admin_id = any(${contasDoPainel}::uuid[])`.execute(banco.db);
  for (const id of contas) await sql`delete from users where id = ${id}::uuid`.execute(banco.db);
  for (const id of contasDoPainel) {
    await banco.db.deleteFrom('admin_accounts').where('id', '=', id).execute();
  }
  await banco.close();
});

void describe('a fila de indicações do Perto, contra Postgres', () => {
  /**
   * ISCA (a): APROVAR FAZ A ENTRADA APARECER NA LISTAGEM DO PERTO.
   *
   * É o ponto da fila inteira, e é por isso que este caso lê o `Perto` DE
   * VERDADE (`criarDirectoryRepository`, a mesma leitura que serve
   * `listDirectoryEntries` ao aplicativo) em vez de conferir a coluna `status`.
   * Conferir `status = 'published'` provaria que a aprovação escreveu o valor
   * certo; só a listagem prova que a entrada APARECE.
   *
   * COMO DESLIGAR PARA VER VERMELHO: troque `status` por `STATUS_INICIAL` em
   * `criarEntradaDaIndicacao` (`application/fila-de-indicacoes.ts`). A
   * aprovação continua gravando a entrada, a indicação continua `approved`, e
   * a listagem do `Perto` volta vazia — que é exatamente a reclamação que o
   * cliente faria.
   */
  void it('(a) aprovar com contato de telefone cria a entrada E ela aparece na listagem do Perto', async () => {
    const quem = await novaConta();
    const ref = await indicar(quem, { nome: 'Clinica Santa Isca' });
    const slug = `clinica-santa-isca-${sufixo().slice(0, 6)}`;
    slugs.push(slug);

    const aprovada = await fila.aprovar(autor, ref, { slug });

    assert.equal(aprovada.entry_created, true, 'a entrada nasceu desta aprovação');
    assert.equal(aprovada.entry.status, 'published', 'contato de telefone completa a régua de publicação');
    assert.equal(aprovada.entry.slug, slug);
    assert.equal(aprovada.suggestion.review_status, 'approved');
    assert.equal(aprovada.suggestion.entry_slug, slug);
    // `source` é `import`, e NUNCA `community`: a emenda 1 do ADR-0011 tirou
    // esse valor do `CHECK`, e quem gravou aqui foi o painel decidindo.
    assert.equal(aprovada.entry.source, 'import');
    assert.equal(aprovada.entry.claim_status, 'unclaimed');
    // O recado de quem indicou NÃO vira texto do diretório.
    assert.equal(aprovada.entry.about, null);

    // A PROVA: a listagem que o aplicativo lê.
    const pagina = await perto.listarPublicados({
      chamador: quem,
      agora: relogio.now(),
      sort: 'name',
      page: 1,
      limit: 50,
    });
    const naListagem = pagina.itens.some((e) => e.slug === slug);
    assert.ok(naListagem, 'a entrada aprovada aparece na listagem do Perto');
  });

  /**
   * ISCA (a2): contato que NÃO é telefone não vai ao ar sozinho, e o telefone
   * do corpo resolve.
   *
   * `professionals` só tem `phone_e164` como canal de contato. Uma indicação
   * cujo contato público é site ou Instagram não tem o que copiar, e a régua de
   * publicação (`faltasParaPublicar`) recusa — a entrada nasce `draft`, e a
   * resposta DIZ o que falta em vez de mentir que está no ar.
   *
   * COMO DESLIGAR: apague `phone_e164` da conta de `faltasParaPublicar` em
   * `escrita-do-diretorio.ts`. A primeira asserção vira `published`, e o
   * `Perto` passa a mostrar uma clínica sem nenhum jeito de ligar para ela.
   */
  void it('(a2) indicação com contato de site nasce rascunho; com telefone no corpo, vai ao ar', async () => {
    const quem = await novaConta();
    const semTelefone = await indicar(quem, {
      nome: 'Pet Isca Sem Telefone',
      contato: ['instagram', '@petiscasemtelefone'],
    });
    const slugA = `pet-isca-rascunho-${sufixo().slice(0, 6)}`;
    slugs.push(slugA);
    const rascunho = await fila.aprovar(autor, semTelefone, { slug: slugA });
    assert.equal(rascunho.entry.status, 'draft');
    assert.deepEqual(rascunho.entry.missing_to_publish, ['phone_e164']);

    const outra = await indicar(quem, {
      nome: 'Pet Isca Com Telefone',
      contato: ['website', 'https://exemplo.invalid/contato'],
    });
    const slugB = `pet-isca-no-ar-${sufixo().slice(0, 6)}`;
    slugs.push(slugB);
    const noAr = await fila.aprovar(autor, outra, { slug: slugB, phone_e164: '+551130612200' });
    assert.equal(noAr.entry.status, 'published');
    assert.equal(noAr.entry.phone_e164, '+551130612200');
  });

  /**
   * ISCA (a3): O LOCAL JÁ EXISTE — a duplicata não cria segunda entrada.
   *
   * Duas pessoas indicam a mesma clínica, ou indicam uma que o painel já
   * cadastrou. Aprovar com o `slug` da entrada que já está lá liga a indicação
   * àquela entrada: nada é criado, e **nada na entrada existente é alterado** —
   * o nome, o telefone e a situação dela ficam como estavam. Um `UPDATE` aqui
   * deixaria um estranho reescrever o telefone de uma clínica no ar, sem
   * `If-Match` e sem ninguém conferir.
   *
   * COMO DESLIGAR: faça `aprovar` ignorar `existente` e sempre chamar
   * `criarEntradaDaIndicacao`. O `INSERT` viola
   * `professionals_slug_unico`, o caso fica vermelho com violação de unicidade
   * — e o painel passaria a não ter caminho nenhum para tirar a indicação
   * repetida da fila.
   */
  void it('(a3) duplicata: aprovar no slug de uma entrada existente liga as duas e não altera a entrada', async () => {
    const quem = await novaConta();
    const primeira = await indicar(quem, { nome: 'Clinica Isca Repetida' });
    const slug = `clinica-isca-repetida-${sufixo().slice(0, 6)}`;
    slugs.push(slug);
    const criada = await fila.aprovar(autor, primeira, { slug });
    assert.equal(criada.entry_created, true);
    const nomeOriginal = criada.entry.display_name;
    const versaoOriginal = criada.entry.version;

    // A MESMA entidade, indicada outra vez, com nome escrito diferente.
    const segunda = await indicar(quem, { nome: 'CLINICA ISCA REPETIDA LTDA' });
    const ligada = await fila.aprovar(autor, segunda, { slug, phone_e164: '+551199999999' });

    assert.equal(ligada.entry_created, false, 'nada foi criado');
    assert.equal(ligada.entry.slug, slug);
    assert.equal(ligada.entry.display_name, nomeOriginal, 'o nome da entrada existente não mudou');
    assert.equal(ligada.entry.version, versaoOriginal, 'a versão não mudou: nenhuma escrita tocou a entrada');
    // `phone_e164` do corpo é IGNORADO na duplicata, de propósito: alterar a
    // entrada existente é `updateAdminDirectoryEntry`, que tem `If-Match`.
    assert.equal(ligada.entry.phone_e164, criada.entry.phone_e164);
    assert.equal(ligada.suggestion.entry_slug, slug);

    // Uma entrada só com aquele endereço, e não duas.
    const quantas = await sql<{ n: string }>`
      select count(*) as n from professionals where slug = ${slug}`.execute(banco.db);
    assert.equal(Number(quantas.rows[0]?.n), 1);
  });

  /**
   * ISCA (b): RECUSAR GUARDA O MOTIVO E NÃO APAGA.
   *
   * A indicação recusada continua legível na fila, com `decline_reason` e
   * `decided_at`. O motivo é para o PRÓXIMO revisor, não é publicado e não
   * chega a quem indicou.
   *
   * COMO DESLIGAR, de dois jeitos, e os dois ficam vermelhos aqui:
   * (1) troque o `UPDATE` de `marcarRecusada` por um `DELETE` — a leitura
   *     devolve `null` e a primeira asserção quebra;
   * (2) pare de gravar `decline_reason` — `decline_reason` vem `null` e a
   *     segunda asserção quebra. O `CHECK` de uma via NÃO pega esse caso, e
   *     está escrito na migração que não pega: é este caso que pega.
   */
  void it('(b) recusar grava o motivo, não apaga a indicação, e não cria entrada', async () => {
    const quem = await novaConta();
    const ref = await indicar(quem, { nome: 'Pet Isca Fechada', recado: 'indico de olhos fechados' });

    const recusada = await fila.recusar(autor, ref, {
      reason: 'Fechou em 2025; o telefone atende outra loja.',
    });
    assert.equal(recusada.review_status, 'declined');
    assert.equal(recusada.decline_reason, 'Fechou em 2025; o telefone atende outra loja.');
    assert.notEqual(recusada.decided_at, null);
    assert.equal(recusada.entry_slug, null, 'recusar não cria entrada');

    // A LINHA CONTINUA LÁ: a leitura pelo `ref` responde, e não 404.
    const lida = await fila.ler(ref);
    assert.equal(lida.decline_reason, recusada.decline_reason);

    // E ela aparece na aba Recusadas, que é o que faz "não sumir" ser verdade
    // para quem olha a tela, e não só para quem olha o banco.
    const pagina = await fila.listar({ reviewStatus: 'declined', page: 1, limit: 50 });
    assert.ok(pagina.items.some((i) => i.reference === ref));

    // Motivo vazio é recusado antes de qualquer escrita.
    await assert.rejects(() => fila.recusar(autor, ref, { reason: ' ' }));
  });

  /**
   * ISCA (c): INDICAÇÃO DE CONTA DESABILITADA NÃO ENTRA NA FILA, NEM NA
   * CONTAGEM.
   *
   * Decisão do cliente de 17/10: conta desabilitada "não é mais encontrada em
   * nenhuma página ou funcionalidade". São TRÊS lugares, e este caso mede os
   * três — porque na fila da Rede filtrar só a listagem fez o painel dizer
   * "1 pendente" sobre uma fila vazia.
   *
   * COMO DESLIGAR, um lugar por vez, em `kysely-fila-de-indicacoes.ts`:
   * (1) tire `AUTOR_ATIVO` da consulta das linhas → `items` traz a indicação;
   * (2) tire da contagem de `pending_total` → `pending_total` conta 1 sobre
   *     fila vazia, e é ESTA asserção que pega o defeito que a Rede teve;
   * (3) tire de `lerIndicacao` → a leitura devolve 200 em vez de 404, e
   *     aprovar/recusar passam a decidir sobre quem saiu da plataforma.
   */
  void it('(c) indicação de conta desabilitada sai da listagem, da contagem e da leitura', async () => {
    const quem = await novaConta();
    const ref = await indicar(quem, { nome: 'Clinica Da Conta Que Saiu' });

    // Antes: ela está nos três.
    const antes = await fila.listar({ page: 1, limit: 50 });
    assert.ok(antes.items.some((i) => i.reference === ref));
    const pendentesAntes = antes.pending_total;
    assert.ok(pendentesAntes >= 1);
    assert.equal((await fila.ler(ref)).reference, ref);

    await desabilitar(quem);

    // LUGAR 1: a listagem.
    const depois = await fila.listar({ page: 1, limit: 50 });
    assert.ok(
      !depois.items.some((i) => i.reference === ref),
      'a listagem não traz indicação de conta desabilitada',
    );
    // LUGAR 2: A CONTAGEM DO AVISO DO MENU. Sem este filtro o painel diria
    // "1 pendente" e quem abrisse encontraria a fila vazia.
    assert.equal(
      depois.pending_total,
      pendentesAntes - 1,
      'a contagem do aviso do menu desce junto com a listagem',
    );
    // LUGAR 3: a leitura. 404, e NUNCA 403 (ADR-0021).
    await assert.rejects(
      () => fila.ler(ref),
      (erro: unknown) => {
        assert.equal((erro as AppError).problemType, 'not-found');
        return true;
      },
    );
    // E decidir sobre ela também é 404: a autorização está no `WHERE`, então a
    // decisão nem chega a existir.
    await assert.rejects(() => fila.aprovar(autor, ref, { slug: 'nao-vai-nascer' }));
    await assert.rejects(() => fila.recusar(autor, ref, { reason: 'nem deveria chegar aqui' }));

    // E nenhuma entrada nasceu daquela tentativa.
    const nenhuma = await sql<{ n: string }>`
      select count(*) as n from professionals where slug = 'nao-vai-nascer'`.execute(banco.db);
    assert.equal(Number(nenhuma.rows[0]?.n), 0);
  });

  /**
   * ISCA (d): A MESMA INDICAÇÃO NÃO PODE SER APROVADA DUAS VEZES.
   *
   * Aprovar duas vezes criaria uma segunda entrada do mesmo lugar — que é a
   * duplicata que esta fila existe para evitar. E recusar o que foi aprovado
   * apagaria o rastro de uma entrada que já pode estar no ar.
   *
   * COMO DESLIGAR: apague a chamada a `erroSeJaDecidida` em `aprovar`. A
   * segunda aprovação passa, nasce uma segunda entrada com outro `slug`, e a
   * contagem de entradas do fim do caso fica vermelha.
   *
   * A trilha é conferida aqui de propósito: UMA linha por decisão, pelo `ref` e
   * não pelo UUID, com a conta do painel que decidiu.
   */
  void it('(d) aprovada não se aprova nem se recusa de novo (400 suggestion_not_pending), e a trilha tem uma linha', async () => {
    const quem = await novaConta();
    const ref = await indicar(quem, { nome: 'Clinica Isca Unica' });
    const slug = `clinica-isca-unica-${sufixo().slice(0, 6)}`;
    slugs.push(slug);

    await fila.aprovar(autor, ref, { slug });

    const outroSlug = `clinica-isca-unica-b-${sufixo().slice(0, 6)}`;
    const segunda = await fila
      .aprovar(autor, ref, { slug: outroSlug })
      .then(() => undefined)
      .catch((e: unknown) => e);
    assert.equal(codigo(segunda), 'suggestion_not_pending');

    const recusa = await fila
      .recusar(autor, ref, { reason: 'mudei de ideia depois de aprovar' })
      .then(() => undefined)
      .catch((e: unknown) => e);
    assert.equal(codigo(recusa), 'suggestion_not_pending');

    // Nenhuma segunda entrada nasceu da tentativa.
    const segundaEntrada = await sql<{ n: string }>`
      select count(*) as n from professionals where slug = ${outroSlug}`.execute(banco.db);
    assert.equal(Number(segundaEntrada.rows[0]?.n), 0);

    // AUDITORIA: uma linha, e o `resource_id` é o `ref` — é por ele que um
    // suporte liga uma reclamação a uma linha.
    const trilha = await trilhaDe(ref);
    assert.equal(trilha.length, 1);
    assert.equal(trilha[0]?.action, 'admin.directory_suggestion.approved');
    assert.equal(trilha[0]?.actor_admin_id, autor.adminAccountId);
    assert.deepEqual((trilha[0]?.before as Record<string, unknown>)['review_status'], 'pending');
    assert.deepEqual((trilha[0]?.after as Record<string, unknown>)['review_status'], 'approved');
    assert.equal((trilha[0]?.after as Record<string, unknown>)['entry_created'], true);
    // E a trilha NÃO carrega quem indicou: este processo nunca soube.
    assert.ok(!JSON.stringify(trilha[0]).includes(quem));
  });
});
