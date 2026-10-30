/**
 * A RECUSA NÃO PODE COMITAR (BICHUS-321).
 *
 * ## O DEFEITO QUE ESTE ARQUIVO MEDE
 *
 * No Kysely, `return` de dentro de `db.transaction().execute()` **COMITA**. A
 * transação só é desfeita quando o corpo **lança**. Então um bloco que grava e
 * depois sai por `return` querendo abortar deixa tudo gravado -- e responde ao
 * chamador como se nada tivesse acontecido.
 *
 * Apareceu primeiro em `kysely-directory-suggestion-repository.ts` (quatro
 * imagens da indicação) e foi consertado lá. A varredura da BICHUS-321 achou os
 * dois gêmeos deste arquivo, em `kysely-identity-repository.ts`:
 *
 * - `trocarFotoDoPerfil`: grava `confirmed_at` do envio, a linha em
 *   `catalog_images` e o trabalho em `jobs`; depois roda
 *   `UPDATE users ... WHERE deleted_at IS NULL RETURNING ...` e devolvia
 *   `undefined` quando a conta não casava. Os três ficavam gravados, com
 *   `photo_image_id` nunca apontando para a imagem: **envio confirmado, imagem
 *   órfã e trabalho enfileirado para ninguém**;
 * - `atualizarPerfil` (caminho do apelido): rebaixa o apelido anterior a
 *   `reservado` e insere o novo em `handles`; depois o mesmo `UPDATE users` e o
 *   mesmo `undefined`. O apelido ficaria **ocupado por uma conta que não existe
 *   mais** -- e nenhuma leitura do produto alcança aquilo para liberar.
 *
 * ## O QUE ESTE ARQUIVO MEDE, E O QUE ELE NÃO MEDE
 *
 * **Os dois não são igualmente alcançáveis, e misturá-los daria verde falso.**
 *
 * `trocarFotoDoPerfil` **não consulta `users` antes de gravar**: a conferência
 * é sobre `catalog_upload_intents`, cujo `WHERE` casa mesmo para conta apagada.
 * Então uma conta apagada chega às três escritas e só então o `UPDATE users`
 * não casa -- **defeito determinístico**, e é ele que os dois primeiros casos
 * medem, com a contagem das linhas gravadas depois da recusa.
 *
 * `atualizarPerfil` abre com `SELECT users ... WHERE deleted_at IS NULL` e sai
 * por `return undefined` **antes de qualquer escrita**. Uma conta já apagada
 * para nessa guarda, então um caso que afirmasse "a recusa não comitou" neste
 * cenário mediria a guarda, não a fronteira: ele aprovaria com o conserto
 * desfeito. O único caminho até o `return` do fim é a conta ser apagada ENTRE o
 * `SELECT` e o `UPDATE`, e corrida não se escreve em caso determinístico. O
 * conserto lá é **defensivo**, e o terceiro e o quarto casos dizem exatamente
 * isso: um prega as escritas do caminho felizo, o outro prega a guarda de cima.
 *
 * ## POR QUE ESTE ARQUIVO EXIGE BANCO
 *
 * Porque **fronteira transacional não existe em dublê**. Um dublê de
 * repositório devolve o que foi programado para devolver; ele não tem `COMMIT`
 * nem `ROLLBACK`, então o caso fica verde com o defeito presente. O que se mede
 * aqui é o que **sobrou no Postgres depois** da recusa -- e a recusa é a mesma
 * nos dois mundos. O caso que pegou o original afirmava `0` e media `3`.
 *
 * ## A PROVA É POR DESLIGAMENTO
 *
 * O caso de recusa de `trocarFotoDoPerfil` diz, por extenso, o que se apaga do
 * conserto para ele ficar vermelho: trocar `throw new ContaSumiuNaTransacao()`
 * de volta por `return linha === undefined ? undefined : paraConta(...)`.
 * Medido: com o conserto desfeito, a recusa continua `undefined` e os três
 * números vão de `0` a `1`.
 *
 * ## TODO ZERO TEM CONTROLE POSITIVO
 *
 * Um `0` só vale se a mesma contagem, no mesmo caso, vai a `1`/`3` quando a
 * conta está viva. Por isso cada recusa aqui vem **em par** com o caminho
 * felizo medido pela mesma consulta: sem o par, um `WHERE` que não casa com
 * nada daria `0` e o caso aprovaria com o mecanismo desligado.
 *
 * ## Como rodar: `npm run test:integration`, de dentro do worktree.
 *
 * ## O que sobrevive à execução
 *
 * Nada. Contas, apelidos, imagens de catálogo, intenções de envio e trabalhos
 * saem no `after`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';

import { loadAppConfig, type AppConfig } from '../../src/shared/config/app-config.js';
import { createDb, type Db } from '../../src/shared/db/pool.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { criarIdentityRepository } from '../../src/modules/identity/adapters/persistence/kysely-identity-repository.js';
import type { IdentityRepository } from '../../src/modules/identity/ports/identity-repository.js';
import { TRABALHO_DE_IMAGEM_DE_CATALOGO } from '../../src/modules/media/ports/imagem-de-catalogo.js';
import type { Instant, UserId } from '../../src/shared/types/brands.js';

const ids = criarIdGenerator(() => Date.now());

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO = 'exemplo.invalid';

let config: AppConfig;
let banco: { db: Db; close: () => Promise<void> };
let repositorio: IdentityRepository;

const contas: UserId[] = [];
const envios: string[] = [];
const apelidos: string[] = [];

function sufixo(): string {
  return randomUUID().slice(0, 8).replace(/[^a-z0-9]/gi, 'a');
}

/**
 * A contagem de um `count(*)`, como NÚMERO.
 *
 * O driver desta pilha devolve `bigint` como número e o tipo que o `sql<...>`
 * declara não muda o que chega; comparar com string reprova por `1 !== '1'`.
 */
function total(linha: { total: string | number } | undefined): number {
  return Number(linha?.total ?? -1);
}

/** Mais que `DIAS_ENTRE_TROCAS_DE_APELIDO` (60), para a carência não recusar. */
const DIAS_DE_FOLGA = 61;

async function novaConta(opcoes: { apelido?: string } = {}): Promise<UserId> {
  const id = randomUUID() as UserId;
  await sql`
    insert into users (id, email, display_name, created_at, updated_at, public_ref)
    values (${id}::uuid, ${`t321-${sufixo()}@${DOMINIO}`}, 'Quem Edita', now(), now(),
            translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_'))
  `.execute(banco.db);
  contas.push(id);
  if (opcoes.apelido !== undefined) {
    // `claimed_at` ANTIGO de propósito: com a data de hoje, `atualizarPerfil`
    // recusa por `too_soon` (a carência de 60 dias entre trocas de apelido) e o
    // caso mediria a carência em vez da fronteira transacional. Foi medido:
    // a primeira versão deste arquivo usava `new Date()` e o controle positivo
    // reprovou por isso -- com o mecanismo certo e o cenário errado.
    await banco.db
      .insertInto('handles')
      .values({
        handle: opcoes.apelido,
        kind: 'pessoa',
        user_id: id,
        claimed_at: new Date(Date.now() - DIAS_DE_FOLGA * 86_400_000),
      })
      .execute();
    await banco.db.updateTable('users').set({ handle: opcoes.apelido }).where('id', '=', id).execute();
    apelidos.push(opcoes.apelido);
  }
  return id;
}

/**
 * A conta apagada LOGICAMENTE, como `registrarPedidoDeExclusao` a deixa.
 *
 * É esta a corrida que abre o defeito: o `WHERE deleted_at IS NULL` do `UPDATE
 * users` no fim do bloco deixa de casar, e o `return undefined` de antes
 * confirmava tudo o que já havia sido gravado. Escrito aqui com SQL cru de
 * propósito -- usar o método do produto mediria o método do produto.
 */
async function apagarLogicamente(id: UserId): Promise<void> {
  await sql`
    update users set deleted_at = now(), status = 'deletion_requested' where id = ${id}::uuid
  `.execute(banco.db);
}

/** Uma intenção de envio de FOTO DE PERFIL, como a rota de mídia a grava. */
async function novoEnvioDeFoto(dono: UserId): Promise<string> {
  const id = ids.uuidv7();
  await banco.db
    .insertInto('catalog_upload_intents')
    .values({
      id,
      admin_account_id: null,
      user_id: dono,
      purpose: 'user_photo',
      object_key: `people/original/${id}.jpeg`,
      declared_type: 'image/jpeg',
      max_bytes: 5_242_880,
      expires_at: new Date(Date.now() + 600_000),
    })
    .execute();
  envios.push(id);
  return id;
}

/** As TRÊS escritas de `trocarFotoDoPerfil`, contadas pelo envio que as gerou. */
async function rastroDoEnvio(envio: string): Promise<{
  confirmado: number;
  imagens: number;
  trabalhos: number;
}> {
  const r = await sql<{ confirmado: string; imagens: string; trabalhos: string }>`
    select
      (select count(*) from catalog_upload_intents
        where id = ${envio}::uuid and confirmed_at is not null) as confirmado,
      (select count(*) from catalog_images
        where upload_intent_id = ${envio}::uuid) as imagens,
      (select count(*) from jobs
        where kind = ${TRABALHO_DE_IMAGEM_DE_CATALOGO}
          and payload::jsonb ->> 'catalog_image_id' in
              (select id::text from catalog_images where upload_intent_id = ${envio}::uuid)) as trabalhos
  `.execute(banco.db);
  const linha = r.rows[0];
  return {
    confirmado: Number(linha?.confirmado ?? -1),
    imagens: Number(linha?.imagens ?? -1),
    trabalhos: Number(linha?.trabalhos ?? -1),
  };
}

// **Sem `async`**: nada aqui espera por nada, e `require-await` do `eslint`
// reprova a arrow assíncrona sem `await` -- com razão.
before(() => {
  config = loadAppConfig();
  banco = createDb(config.databaseUrl);
  repositorio = criarIdentityRepository(banco.db, ids);
});

after(async () => {
  if (banco === undefined) return;
  // A ORDEM IMPORTA: o trabalho aponta para a imagem, a imagem aponta para a
  // intenção, e `users.photo_image_id` aponta para a imagem. Limpar fora de
  // ordem recusaria pela chave estrangeira.
  for (const envio of envios) {
    await sql`
      delete from jobs where kind = ${TRABALHO_DE_IMAGEM_DE_CATALOGO}
        and payload::jsonb ->> 'catalog_image_id' in
            (select id::text from catalog_images where upload_intent_id = ${envio}::uuid)
    `.execute(banco.db);
    await sql`
      update users set photo_image_id = null where photo_image_id in
        (select id from catalog_images where upload_intent_id = ${envio}::uuid)
    `.execute(banco.db);
    await sql`delete from catalog_images where upload_intent_id = ${envio}::uuid`.execute(banco.db);
    await sql`delete from catalog_upload_intents where id = ${envio}::uuid`.execute(banco.db);
  }
  // `users.handle` APONTA para `handles` (`users_handle_no_espaco_de_nomes`).
  // Apagar o apelido antes de soltar a referência recusa por `23503` -- e isso
  // foi medido: a primeira versão deste `after` apagava `handles` primeiro e
  // derrubou o arquivo com os quatro casos já VERDES, pela limpeza e não pelo
  // que se mede aqui. Soltar primeiro, apagar depois.
  for (const id of contas) {
    await sql`update users set handle = null where id = ${id}::uuid`.execute(banco.db);
  }
  for (const apelido of apelidos) {
    await sql`delete from handles where handle = ${apelido}`.execute(banco.db);
  }
  for (const id of contas) {
    await sql`delete from handles where user_id = ${id}::uuid`.execute(banco.db);
    await sql`delete from users where id = ${id}::uuid`.execute(banco.db);
  }
  await banco.close();
});

void describe('a recusa não comita o que a transação já gravou (BICHUS-321)', () => {
  void it('CONTROLE POSITIVO: com a conta VIVA, `trocarFotoDoPerfil` grava os TRÊS', async () => {
    // Sem este caso o `0` do caso seguinte não prova nada: um `WHERE` que não
    // casasse com nada daria `0` com o mecanismo desligado.
    const dono = await novaConta();
    const envio = await novoEnvioDeFoto(dono);

    const conta = await repositorio.trocarFotoDoPerfil(dono, envio, Date.now() as Instant);
    assert.notEqual(conta, undefined, 'conta viva precisa receber a conta de volta');

    const rastro = await rastroDoEnvio(envio);
    assert.deepEqual(
      rastro,
      { confirmado: 1, imagens: 1, trabalhos: 1 },
      'o caminho felizo grava o envio confirmado, a imagem e o trabalho',
    );
  });

  void it('`trocarFotoDoPerfil` numa conta APAGADA recusa e NÃO deixa nada gravado', async () => {
    // ESTE É O DEFEITO DA BICHUS-321 NA SUA FORMA ORIGINAL -- e as mesmas três
    // tabelas do caso que o achou na indicação.
    //
    // DESLIGAR PARA VER REPROVAR: em `trocarFotoDoPerfil`, troque
    // `if (linha === undefined) throw new ContaSumiuNaTransacao();` de volta
    // por `return linha === undefined ? undefined : paraConta(...)`. A recusa
    // continua `undefined` e os três números vão a `1`.
    const dono = await novaConta();
    const envio = await novoEnvioDeFoto(dono);
    await apagarLogicamente(dono);

    const conta = await repositorio.trocarFotoDoPerfil(dono, envio, Date.now() as Instant);
    assert.equal(conta, undefined, 'conta apagada precisa sair como `undefined`');

    const rastro = await rastroDoEnvio(envio);
    assert.deepEqual(
      rastro,
      { confirmado: 0, imagens: 0, trabalhos: 0 },
      'REPROVA: a recusa comitou o envio confirmado, a imagem órfã e/ou o trabalho ' +
        'enfileirado para ninguém -- dado que nenhuma leitura alcança.',
    );
  });

  void it('CONTROLE POSITIVO: com a conta VIVA, o apelido NOVO entra e o anterior é rebaixado', async () => {
    const anterior = `t321a${sufixo()}`;
    const novo = `t321b${sufixo()}`;
    apelidos.push(novo);
    const dono = await novaConta({ apelido: anterior });

    const conta = await repositorio.atualizarPerfil(dono, { handle: novo }, Date.now() as Instant);
    assert.notEqual(conta, undefined, 'conta viva precisa receber a conta de volta');

    const r = await sql<{ total: string }>`
      select count(*) as total from handles where handle = ${novo} and kind = 'pessoa'
    `.execute(banco.db);
    assert.equal(total(r.rows[0]), 1, 'o apelido novo precisa existir como `pessoa`');

    const velho = await sql<{ kind: string }>`
      select kind from handles where handle = ${anterior}
    `.execute(banco.db);
    assert.equal(velho.rows[0]?.kind, 'reservado', 'o anterior precisa virar `reservado`');
  });

  void it('a GUARDA DE CIMA de `atualizarPerfil` nem chega às escritas (e é por isso que só a corrida alcança o resto)', async () => {
    // ESTE CASO NÃO MEDE A FRONTEIRA TRANSACIONAL, E DIZER ISSO É O PONTO.
    //
    // `atualizarPerfil` abre com `SELECT users ... WHERE deleted_at IS NULL` e
    // sai por `return undefined` ANTES de qualquer escrita. Então uma conta já
    // apagada para aqui, e os zeros abaixo são os zeros DESSA GUARDA -- eles
    // continuariam zero com o conserto desfeito. Um caso que afirmasse
    // "a recusa não comitou" neste cenário aprovaria com o mecanismo
    // desligado, que é a forma de verde falso que este projeto já colecionou.
    //
    // O que o caso serve para: PREGAR a guarda. Enquanto ela existe, o único
    // caminho até o `return` do fim de `atualizarPerfil` é a conta ser apagada
    // ENTRE o `SELECT` e o `UPDATE` -- corrida que não se escreve em caso
    // determinístico. Se alguém tirar a guarda, este caso reprova e o conserto
    // da sentinela (medido de verdade em `trocarFotoDoPerfil`, que não tem
    // guarda nenhuma) passa a ser o que segura a fronteira.
    const anterior = `t321c${sufixo()}`;
    const novo = `t321d${sufixo()}`;
    apelidos.push(novo);
    const dono = await novaConta({ apelido: anterior });
    await apagarLogicamente(dono);

    const conta = await repositorio.atualizarPerfil(dono, { handle: novo }, Date.now() as Instant);
    assert.equal(conta, undefined, 'conta apagada precisa sair como `undefined`');

    const ocupado = await sql<{ total: string }>`
      select count(*) as total from handles where handle = ${novo}
    `.execute(banco.db);
    assert.equal(total(ocupado.rows[0]), 0, 'a guarda de cima não pode deixar o apelido novo nascer');

    const velho = await sql<{ kind: string }>`
      select kind from handles where handle = ${anterior}
    `.execute(banco.db);
    assert.equal(
      velho.rows[0]?.kind,
      'pessoa',
      'a guarda de cima não pode deixar o apelido anterior ser rebaixado',
    );
  });
});
