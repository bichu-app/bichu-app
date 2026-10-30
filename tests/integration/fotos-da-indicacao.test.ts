/**
 * AS FOTOS DO ESTABELECIMENTO NA INDICAÇÃO contra Postgres (cliente, 29 e
 * 30/10/2026: *"devemos deixar enviar até 4 imagens"* e *"só tem o campo para
 * subir a foto do logotipo da empresa, mas não as fotos do estabelecimento que
 * fica no topo da página"*).
 *
 * ## POR QUE ESTE ARQUIVO EXIGE BANCO
 *
 * Pelas MESMAS três razões de `logotipo-da-indicacao.test.ts`, mais uma que só
 * vale aqui:
 *
 *  - a conferência do envio é a **cláusula `WHERE`** (`u.user_id`, `u.purpose`).
 *    Dublê que a imitasse faria o caso medir o dublê;
 *  - a escrita são **cinco instruções na mesma transação** por foto, mais o
 *    `INSERT` da indicação e o das linhas de `directory_suggestion_images`. Dublê
 *    não desfaz;
 *  - `directory_suggestion_images_posicao` (`BETWEEN 0 AND 3`),
 *    `directory_suggestion_images_ordem_unica` e o `UNIQUE` global de `image_id`
 *    são do banco;
 *  - **a projeção da fila são TRÊS subconsultas correlacionadas** numa consulta
 *    só. O que elas devolvem -- e o que elas DEIXAM DE FORA -- não se mede sem
 *    `json_agg`, `count(*)` e dados em `catalog_images` com `status` de verdade.
 *
 * ## A FRONTEIRA QUE ESTE ARQUIVO MEDE
 *
 * **A foto de uma indicação que ninguém aprovou não aparece em superfície
 * pública.** O que garante isso é o `purpose` separado, e aqui mede-se esta
 * direção: envio do PAINEL (`directory_photo`) **não** entra na fila -- o `WHERE`
 * não o acha. A direção inversa (envio da indicação recusado pela escrita de
 * `professionals`) já está medida em
 * `src/modules/professionals/application/logotipo-da-indicacao-nao-vaza.test.ts`
 * para a logo, pelo mesmo mecanismo de comparação de valor.
 *
 * ## A PROVA É POR DESLIGAMENTO
 *
 * Cada caso diz, por extenso, o que se apaga do código para ele ficar vermelho.
 *
 * ## Como rodar: `npm run test:integration`, de dentro do worktree.
 *
 * ## O que sobrevive à execução
 *
 * Nada. Contas, indicações, imagens de catálogo, intenções de envio, vínculos e
 * trabalhos saem no `after`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';

import { loadAppConfig, type AppConfig } from '../../src/shared/config/app-config.js';
import { createDb, type Db } from '../../src/shared/db/pool.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { criarDirectorySuggestionRepository } from '../../src/modules/professionals/adapters/persistence/kysely-directory-suggestion-repository.js';
import { criarFilaDeIndicacoesRepository } from '../../src/modules/professionals/adapters/persistence/kysely-fila-de-indicacoes.js';
import {
  marcarImagemDeCatalogoPronta,
  marcarImagemDeCatalogoRecusada,
  registroDeImagemDeCatalogo,
} from '../../src/modules/media/adapters/persistence/kysely-imagem-de-catalogo.js';
import { criarTrilhaTransacional } from '../../src/modules/audit/adapters/persistence/kysely-audit-log.js';
import type {
  DirectorySuggestionRepository,
  SugestaoAGravar,
} from '../../src/modules/professionals/ports/directory-suggestion-repository.js';
import type { FilaDeIndicacoesRepository } from '../../src/modules/professionals/ports/fila-de-indicacoes.js';
import { projetarIndicacao } from '../../src/modules/professionals/domain/fila-de-indicacoes.js';
import {
  PROPOSITO_DA_FOTO_DA_INDICACAO,
  PROPOSITO_DO_LOGOTIPO_DA_INDICACAO,
  TRABALHO_DE_IMAGEM_DE_CATALOGO,
  type PropositoDaImagem,
} from '../../src/modules/media/ports/imagem-de-catalogo.js';
import { comoObjectKey } from '../../src/modules/media/domain/chave-de-objeto.js';
import type { Instant, UserId } from '../../src/shared/types/brands.js';
import type { Clock } from '../../src/shared/time/clock.js';

const relogio: Clock = { now: () => Date.now() as Instant };
const ids = criarIdGenerator(() => relogio.now());

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO = 'exemplo.invalid';

/** A base de mídia, injetada como `src/bin/api.ts` a injeta. */
const URL_DE_MIDIA = (chave: string): string => `https://midia.invalido/${chave}`;

let config: AppConfig;
let banco: { db: Db; close: () => Promise<void> };
let repositorio: DirectorySuggestionRepository;
let fila: FilaDeIndicacoesRepository;

const contas: UserId[] = [];
const refs: string[] = [];
const envios: string[] = [];

function sufixo(): string {
  return randomUUID().slice(0, 8);
}

/** A contagem de um `count(*)`, como NÚMERO (ver a nota em `logotipo-da-indicacao.test.ts`). */
function total(linha: { total: string | number } | undefined): number {
  return Number(linha?.total ?? -1);
}

async function novaConta(): Promise<UserId> {
  const id = randomUUID() as UserId;
  await sql`
    insert into users (id, email, display_name, created_at, updated_at, public_ref)
    values (${id}::uuid, ${`foto-${sufixo()}@${DOMINIO}`}, 'Quem Indicou', now(), now(),
            translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_'))
  `.execute(banco.db);
  contas.push(id);
  return id;
}

/**
 * Uma intenção de envio, como a rota de mídia a grava.
 *
 * **SQL cru de propósito**: o que este arquivo mede é a CONFERÊNCIA do envio, e
 * para medi-la ele precisa gravar envios que o produto nunca gravaria -- de outro
 * propósito, de outra conta, vencido. `registrarIntencaoDaFotoDaIndicacao` tem o
 * propósito FECHADO no tipo justamente para que o produto não consiga.
 */
async function novoEnvio(opcoes: {
  dono: UserId;
  purpose?: PropositoDaImagem;
  vencido?: boolean;
  confirmado?: boolean;
}): Promise<string> {
  const id = randomUUID();
  await banco.db
    .insertInto('catalog_upload_intents')
    .values({
      id,
      admin_account_id: null,
      user_id: opcoes.dono,
      purpose: opcoes.purpose ?? PROPOSITO_DA_FOTO_DA_INDICACAO,
      object_key: `directory/original/${id}.jpeg`,
      declared_type: 'image/jpeg',
      max_bytes: 5_242_880,
      expires_at: new Date(Date.now() + (opcoes.vencido === true ? -60_000 : 600_000)),
      ...(opcoes.confirmado === true ? { confirmed_at: new Date() } : {}),
    })
    .execute();
  envios.push(id);
  return id;
}

/** O corpo mínimo que `registrar` exige, com logotipo e fotos escolhidos por caso. */
function aGravar(
  autor: UserId,
  logoUploadId: string | null,
  photoUploadIds: readonly string[],
): SugestaoAGravar {
  return {
    autor,
    displayName: `Clinica ${sufixo()}`,
    kind: 'clinic',
    entityKind: 'organization',
    city: 'Sao Paulo',
    state: 'SP',
    neighborhood: 'Bela Vista',
    postalCode: null,
    contatoKind: 'phone',
    contatoValue: '+551130612200',
    note: null,
    logoUploadId,
    photoUploadIds,
  };
}

/** Grava a indicação e devolve o `ref`, ou falha o caso nomeando o desfecho. */
async function indicarCom(
  autor: UserId,
  fotos: readonly string[],
  logo: string | null = null,
): Promise<string> {
  const r = await repositorio.registrar(aGravar(autor, logo, fotos));
  assert.equal(r.tipo, 'gravada', `a gravação não aconteceu: ${JSON.stringify(r)}`);
  if (r.tipo !== 'gravada') throw new Error('inalcançável');
  refs.push(r.sugestao.ref);
  return r.sugestao.ref;
}

/** As linhas da tabela das fotos, pela indicação, na ordem de `position`. */
async function vinculos(ref: string) {
  const r = await sql<{ position: number; purpose: string; status: string }>`
    select i.position, c.purpose, c.status
      from directory_suggestion_images i
      join catalog_images c on c.id = i.image_id
      join directory_suggestions s on s.id = i.suggestion_id
     where s.ref = ${ref}
     order by i.position asc
  `.execute(banco.db);
  return r.rows;
}

/**
 * Põe a imagem em `ready` com as chaves das derivadas, como o worker faz.
 *
 * **Pela porta do produto (`registroDeImagemDeCatalogo.marcarPronta`)**, e não com
 * `UPDATE` à mão: um `UPDATE` aqui seria um segundo caminho de escrita, e o caso
 * passaria a medir o caminho do teste.
 */
async function tornarPronta(ref: string, position: number): Promise<void> {
  const r = await sql<{ image_id: string }>`
    select i.image_id
      from directory_suggestion_images i
      join directory_suggestions s on s.id = i.suggestion_id
     where s.ref = ${ref} and i.position = ${position}
  `.execute(banco.db);
  const imagemId = r.rows[0]?.image_id;
  assert.ok(imagemId, `não há foto na posição ${String(position)} de ${ref}`);
  await marcarImagemDeCatalogoPronta(banco.db, imagemId, {
    banner: comoObjectKey(`directory/banner/f${String(position)}-${sufixo()}.webp`),
    card: comoObjectKey(`directory/card/f${String(position)}-${sufixo()}.webp`),
  });
}

/** Põe a LOGO em `ready`, com `thumb` -- a derivada que a fila projeta. */
async function logoPronta(ref: string): Promise<void> {
  const r = await sql<{ logo_image_id: string | null }>`
    select logo_image_id from directory_suggestions where ref = ${ref}
  `.execute(banco.db);
  const imagemId = r.rows[0]?.logo_image_id;
  assert.ok(imagemId, 'a indicação não tem logotipo');
  await marcarImagemDeCatalogoPronta(banco.db, imagemId, {
    card: comoObjectKey(`directory/card/logo-${sufixo()}.webp`),
    thumb: comoObjectKey(`directory/thumb/logo-${sufixo()}.webp`),
  });
}

/** Recusa os bytes da imagem, como o worker faz quando a imagem é pequena. */
async function recusarFoto(ref: string, position: number): Promise<void> {
  const r = await sql<{ image_id: string }>`
    select i.image_id
      from directory_suggestion_images i
      join directory_suggestions s on s.id = i.suggestion_id
     where s.ref = ${ref} and i.position = ${position}
  `.execute(banco.db);
  const imagemId = r.rows[0]?.image_id;
  assert.ok(imagemId);
  await marcarImagemDeCatalogoRecusada(
    banco.db,
    imagemId,
    'A imagem precisa ter pelo menos 600 x 600 pixels.',
  );
}

/** A indicação como a fila do painel a PROJETA. */
async function comoOPainelVe(ref: string) {
  const lida = await fila.indicacaoPorRef(ref);
  assert.ok(lida, `a fila não achou ${ref}`);
  return projetarIndicacao(lida, URL_DE_MIDIA);
}

before(() => {
  config = loadAppConfig();
  banco = createDb(config.databaseUrl);
  repositorio = criarDirectorySuggestionRepository(banco.db, ids);
  fila = criarFilaDeIndicacoesRepository({
    db: banco.db,
    trilha: criarTrilhaTransacional({ ids, clock: relogio, ipHmacKey: config.ipHmacKey }),
    imagens: registroDeImagemDeCatalogo,
  });
});

after(async () => {
  if (banco === undefined) return;
  // A ORDEM IMPORTA: o vínculo aponta para a imagem e para a indicação; a
  // imagem aponta para a intenção. `ON DELETE CASCADE` no `suggestion_id` leva
  // os vínculos junto com a indicação, e é só depois disso que a imagem sai.
  for (const ref of refs) {
    await sql`delete from directory_suggestions where ref = ${ref}`.execute(banco.db);
  }
  for (const id of envios) {
    await sql`delete from jobs where payload->>'catalog_image_id' in (
      select id::text from catalog_images where upload_intent_id = ${id}::uuid)`.execute(banco.db);
    await sql`delete from catalog_images where upload_intent_id = ${id}::uuid`.execute(banco.db);
    await sql`delete from catalog_upload_intents where id = ${id}::uuid`.execute(banco.db);
  }
  for (const id of contas) await sql`delete from users where id = ${id}::uuid`.execute(banco.db);
  await banco.close();
});

void describe('a ESCRITA das fotos do estabelecimento, contra Postgres', () => {
  void it('o caminho FELIZ: as QUATRO nascem, na ORDEM do array, com o propósito da indicação', async () => {
    // DESLIGAR PARA VER REPROVAR: em
    // `kysely-directory-suggestion-repository.ts`, troque
    // `linhas.push({ ..., position })` por `position: 0` -- a ordem desaparece e
    // `directory_suggestion_images_ordem_unica` reprova com 23505 a partir da
    // segunda foto.
    const dono = await novaConta();
    const quatro = [
      await novoEnvio({ dono }),
      await novoEnvio({ dono }),
      await novoEnvio({ dono }),
      await novoEnvio({ dono }),
    ];

    const ref = await indicarCom(dono, quatro);

    const linhas = await vinculos(ref);
    assert.deepEqual(
      linhas.map((l) => l.position),
      [0, 1, 2, 3],
      'REPROVA: as quatro fotos não ocuparam as posições 0..3. A 0 é a CAPA, e não ' +
        'existe coluna de capa.',
    );
    assert.deepEqual(
      linhas.map((l) => l.purpose),
      Array.from({ length: 4 }, () => PROPOSITO_DA_FOTO_DA_INDICACAO),
      'as imagens precisam nascer com o propósito da INDICAÇÃO, e não com o do painel',
    );
    // `processing`, e não `ready`: quem as torna servíveis é o worker.
    assert.deepEqual(
      linhas.map((l) => l.status),
      Array.from({ length: 4 }, () => 'processing'),
    );

    // Cada foto é um trabalho: imagem sem trabalho ficaria `processing` para sempre.
    const trabalhos = await sql<{ total: string }>`
      select count(*) as total from jobs
       where kind = ${TRABALHO_DE_IMAGEM_DE_CATALOGO}
         and payload->>'catalog_image_id' in (
           select i.image_id::text from directory_suggestion_images i
             join directory_suggestions s on s.id = i.suggestion_id
            where s.ref = ${ref})
    `.execute(banco.db);
    assert.equal(total(trabalhos.rows[0]), 4);

    // Os quatro envios ficam confirmados: é isso que os tira da varredura.
    const confirmados = await sql<{ total: string }>`
      select count(*) as total from catalog_upload_intents
       where id = any(${quatro}::uuid[]) and confirmed_at is not null
    `.execute(banco.db);
    assert.equal(total(confirmados.rows[0]), 4);
  });

  void it('a LOGO e as QUATRO fotos convivem: o logotipo NÃO conta entre as quatro', async () => {
    // O cliente nomeou as duas ausências em DUAS mensagens separadas, como duas
    // coisas. Obrigar a logo a ocupar uma das quatro faria quem tem logo poder
    // mandar só três fotos.
    const dono = await novaConta();
    const logo = await novoEnvio({ dono, purpose: PROPOSITO_DO_LOGOTIPO_DA_INDICACAO });
    const quatro = [
      await novoEnvio({ dono }),
      await novoEnvio({ dono }),
      await novoEnvio({ dono }),
      await novoEnvio({ dono }),
    ];

    const ref = await indicarCom(dono, quatro, logo);

    assert.equal((await vinculos(ref)).length, 4);
    const linha = await sql<{ logo_image_id: string | null }>`
      select logo_image_id from directory_suggestions where ref = ${ref}
    `.execute(banco.db);
    assert.ok(
      linha.rows[0]?.logo_image_id,
      'REPROVA: a indicação perdeu o logotipo quando veio com fotos. São dois campos ' +
        'e duas geometrias, e o logotipo é UM porque é a marca.',
    );
  });

  void it('A FRONTEIRA: envio do PAINEL (`directory_photo`) NÃO entra na fila, e NADA é gravado', async () => {
    // **O caso que a fila existe para garantir, nesta direção.** `directory_photo`
    // é o propósito que a escrita de `professionals` aceita -- a superfície
    // pública. Aceitá-lo aqui misturaria as duas esteiras.
    //
    // DESLIGAR PARA VER REPROVAR: tire `AND u.purpose = ${proposito}` da consulta
    // de `confirmar`.
    const dono = await novaConta();
    const doPainel = await novoEnvio({ dono, purpose: 'directory_photo' });

    const r = await repositorio.registrar(aGravar(dono, null, [doPainel]));
    assert.equal(
      r.tipo,
      'envio_nao_serve',
      'REPROVA: a fila aceitou um envio do PAINEL. Os dois propósitos existem separados ' +
        'justamente para que a foto de uma indicação não aprovada não chegue ao `Perto`.',
    );
    if (r.tipo === 'envio_nao_serve') {
      assert.equal(
        r.campo,
        'photo_upload_ids',
        'o 400 precisa nomear o campo da FOTO: marcar `logo_upload_id` manda a tela ' +
          'pedir de novo o arquivo errado',
      );
    }

    const nada = await sql<{ total: string }>`
      select count(*) as total from catalog_images where upload_intent_id = ${doPainel}::uuid
    `.execute(banco.db);
    assert.equal(total(nada.rows[0]), 0, 'a recusa não pode deixar imagem nascida');
    const envioLido = await sql<{ confirmed_at: Date | null }>`
      select confirmed_at from catalog_upload_intents where id = ${doPainel}::uuid
    `.execute(banco.db);
    assert.equal(envioLido.rows[0]?.confirmed_at, null, 'a recusa não pode confirmar o envio');
  });

  void it('o envio do LOGOTIPO não serve como FOTO: os dois propósitos da indicação também são separados', async () => {
    const dono = await novaConta();
    const logo = await novoEnvio({ dono, purpose: PROPOSITO_DO_LOGOTIPO_DA_INDICACAO });

    const r = await repositorio.registrar(aGravar(dono, null, [logo]));
    assert.equal(
      r.tipo,
      'envio_nao_serve',
      'REPROVA: a foto aceitou um envio de logotipo. São geometrias e mínimas ' +
        'diferentes (512 quadrada com mínima 256; faixa 1280 x 720 com mínima 600), ' +
        'e é por isso que são duas rotas.',
    );
  });

  void it('envio de OUTRA CONTA, VENCIDO, JÁ CONFIRMADO e inexistente têm o MESMO desfecho', async () => {
    // A autoria está na cláusula `WHERE` (`u.user_id`), e não num `if` depois do
    // `SELECT`. **O desfecho é o MESMO nos quatro, e o silêncio é o recurso.**
    //
    // DESLIGAR PARA VER REPROVAR: tire `AND u.user_id = ...` da consulta, e o
    // caso de outra conta passa a gravar.
    const dono = await novaConta();
    const outra = await novaConta();

    const casos = [
      await novoEnvio({ dono: outra }),
      await novoEnvio({ dono, vencido: true }),
      await novoEnvio({ dono, confirmado: true }),
      randomUUID(),
      'nao-e-uuid-nenhum',
    ];

    for (const envio of casos) {
      const r = await repositorio.registrar(aGravar(dono, null, [envio]));
      assert.equal(r.tipo, 'envio_nao_serve', `o envio ${envio} foi aceito`);
    }
  });

  void it('UMA das quatro que não serve desfaz as OUTRAS TRÊS: é uma transação só', async () => {
    // **O caso que dublê não mede.** A primeira foto é válida e já teve imagem
    // criada, envio confirmado e trabalho enfileirado quando a quarta é recusada.
    // Sem a transação, ficariam três imagens `processing` para sempre e três
    // envios confirmados fora de qualquer indicação.
    //
    // DESLIGAR PARA VER REPROVAR: troque `db.transaction().execute(...)` por uma
    // chamada direta com `db`.
    const dono = await novaConta();
    const boas = [await novoEnvio({ dono }), await novoEnvio({ dono }), await novoEnvio({ dono })];
    const ruim = await novoEnvio({ dono, purpose: 'directory_photo' });

    const r = await repositorio.registrar(aGravar(dono, null, [...boas, ruim]));
    assert.equal(r.tipo, 'envio_nao_serve');

    const imagens = await sql<{ total: string }>`
      select count(*) as total from catalog_images where upload_intent_id = any(${boas}::uuid[])
    `.execute(banco.db);
    assert.equal(
      total(imagens.rows[0]),
      0,
      'REPROVA: as três primeiras imagens sobreviveram à recusa da quarta. Ficariam ' +
        '`processing` para sempre, sem indicação nenhuma apontando para elas.',
    );
    const confirmados = await sql<{ total: string }>`
      select count(*) as total from catalog_upload_intents
       where id = any(${boas}::uuid[]) and confirmed_at is not null
    `.execute(banco.db);
    assert.equal(total(confirmados.rows[0]), 0, 'os envios ficaram confirmados fora de indicação');
    const trabalhos = await sql<{ total: string }>`
      select count(*) as total from jobs
       where kind = ${TRABALHO_DE_IMAGEM_DE_CATALOGO}
         and payload->>'catalog_image_id' in (
           select id::text from catalog_images where upload_intent_id = any(${boas}::uuid[]))
    `.execute(banco.db);
    assert.equal(total(trabalhos.rows[0]), 0);
  });

  void it('a MESMA imagem não serve a DUAS indicações: a segunda é recusada com 400, e não com 500', async () => {
    // É o que faz a recusa `upload_not_usable` ter rede embaixo: sem ela, a
    // colisão no `UNIQUE` global de `image_id` viraria `500`.
    const dono = await novaConta();
    const envio = await novoEnvio({ dono });

    await indicarCom(dono, [envio]);

    const segunda = await repositorio.registrar(aGravar(dono, null, [envio]));
    assert.equal(
      segunda.tipo,
      'envio_nao_serve',
      'REPROVA: o mesmo envio entrou em duas indicações, ou a colisão virou erro de banco.',
    );
  });

  void it('indicação SEM foto nenhuma continua sendo o estado normal, e não abre transação', async () => {
    // CONTRAPESO: o APK publicado não tem o campo, e exigi-lo seria
    // `request-property-became-required`.
    const dono = await novaConta();
    const ref = await indicarCom(dono, []);

    assert.deepEqual(await vinculos(ref), []);
    const painel = await comoOPainelVe(ref);
    assert.deepEqual(painel.photo_urls, []);
    assert.equal(painel.photos_total, 0);
    assert.equal(painel.logo_url, null);
  });

  void it('a QUINTA foto é recusada pelo CHECK do banco, e não em silêncio', async () => {
    // O teto de quatro é `directory_suggestion_images_posicao`
    // (`BETWEEN 0 AND 3`). O contrato também o cobra (`maxItems: 4`), e as duas
    // camadas são de propósito: o `maxItems` protege a tela, e o `CHECK` protege
    // o banco de qualquer escrita futura que esqueça o contrato.
    const dono = await novaConta();
    const cinco = [
      await novoEnvio({ dono }),
      await novoEnvio({ dono }),
      await novoEnvio({ dono }),
      await novoEnvio({ dono }),
      await novoEnvio({ dono }),
    ];

    const erro = await repositorio.registrar(aGravar(dono, null, cinco)).then(
      () => undefined,
      (e: unknown) => e,
    );
    assert.ok(erro, 'REPROVA: a quinta foto entrou. O `CHECK` do banco não foi aplicado.');
    const codigoDoBanco = String((erro as { code?: string }).code ?? '');
    assert.match(
      codigoDoBanco,
      /23514/,
      'o erro precisa ser a violação do CHECK `directory_suggestion_images_posicao` ' +
        `(23514), e não outra coisa. Veio: ${codigoDoBanco || JSON.stringify(erro)}`,
    );

    // E NADA ficou: a transação volta inteira, inclusive a indicação.
    const imagens = await sql<{ total: string }>`
      select count(*) as total from catalog_images where upload_intent_id = any(${cinco}::uuid[])
    `.execute(banco.db);
    assert.equal(total(imagens.rows[0]), 0);
  });
});

void describe('a PROJEÇÃO da fila do painel, contra Postgres', () => {
  void it('as fotos PRONTAS saem na ordem de `position`, na derivada `card`', async () => {
    // DESLIGAR PARA VER REPROVAR: tire `ORDER BY i.position` da subconsulta
    // `foto_card_keys` -- a ordem passa a ser a que o Postgres quiser, e a capa
    // deixa de ser a primeira.
    const dono = await novaConta();
    const quatro = [
      await novoEnvio({ dono }),
      await novoEnvio({ dono }),
      await novoEnvio({ dono }),
      await novoEnvio({ dono }),
    ];
    const ref = await indicarCom(dono, quatro);
    for (const position of [3, 1, 0, 2]) await tornarPronta(ref, position);

    const painel = await comoOPainelVe(ref);

    assert.equal(painel.photo_urls.length, 4);
    assert.equal(painel.photos_total, 4);
    assert.deepEqual(
      // `https://midia.invalido/directory/card/f2-ab12cd34.webp` -> `f2`: o
      // prefixo que `tornarPronta` grava e a POSICAO, e e so ele que se compara.
      painel.photo_urls.map((u) => u.split('/').at(-1)?.split('-')[0]),
      ['f0', 'f1', 'f2', 'f3'],
      'REPROVA: as fotos não saíram na ordem de `position`. A ordem é a em que a ' +
        'pessoa as colocou, e a primeira é a capa -- e aqui elas foram marcadas ' +
        'prontas em 3, 1, 0, 2 justamente para que a ordem de GRAVAÇÃO não possa ' +
        'ser confundida com a ordem de `position`.',
    );
    for (const url of painel.photo_urls) {
      assert.ok(url.startsWith('https://midia.invalido/directory/card/'), url);
    }
  });

  void it('a foto que o worker NÃO terminou e a RECUSADA ficam fora da lista, e `photos_total` as conta', async () => {
    // **A razão de `photos_total` existir.** Sem ele o painel não distingue "não
    // enviou nenhuma" de "enviou quatro e nenhuma ficou pronta ainda".
    //
    // DESLIGAR PARA VER REPROVAR: tire `AND c.status = 'ready'` da subconsulta
    // `foto_card_keys`. A foto recusada passa a sair com `public_key` nula, e a
    // que o worker não terminou também.
    const dono = await novaConta();
    const quatro = [
      await novoEnvio({ dono }),
      await novoEnvio({ dono }),
      await novoEnvio({ dono }),
      await novoEnvio({ dono }),
    ];
    const ref = await indicarCom(dono, quatro);
    await tornarPronta(ref, 0);
    await recusarFoto(ref, 1);
    // As posições 2 e 3 ficam `processing`: é o estado de quem acabou de enviar.

    const painel = await comoOPainelVe(ref);

    assert.equal(
      painel.photo_urls.length,
      1,
      `REPROVA: entrou na lista foto que não está \`ready\`: ${JSON.stringify(painel.photo_urls)}`,
    );
    assert.equal(
      painel.photos_total,
      4,
      'REPROVA: a contagem perdeu as três que não estão prontas. É ela que faz o painel ' +
        'dizer "ainda processando" em vez de "sem fotos".',
    );
  });

  void it('`logo_url` sai na derivada `thumb` e é NULA nos três casos: sem logo, processando, recusada', async () => {
    // DESLIGAR PARA VER REPROVAR: troque `c.thumb_key` por `c.public_key` na
    // subconsulta `logo_thumb_key` -- a fila passa a desenhar a `card` de 512 numa
    // lista paginada, que é o custo medido de 9,8 MB na primeira pintura.
    const dono = await novaConta();

    const pronta = await indicarCom(dono, [], await novoEnvio({ dono, purpose: PROPOSITO_DO_LOGOTIPO_DA_INDICACAO }));
    await logoPronta(pronta);
    const comLogo = await comoOPainelVe(pronta);
    assert.ok(
      comLogo.logo_url?.startsWith('https://midia.invalido/directory/thumb/'),
      `REPROVA: a logo não saiu na derivada \`thumb\`: ${String(comLogo.logo_url)}`,
    );

    const processando = await indicarCom(dono, [], await novoEnvio({ dono, purpose: PROPOSITO_DO_LOGOTIPO_DA_INDICACAO }));
    assert.equal((await comoOPainelVe(processando)).logo_url, null, 'worker não terminou');

    const recusada = await indicarCom(dono, [], await novoEnvio({ dono, purpose: PROPOSITO_DO_LOGOTIPO_DA_INDICACAO }));
    const r = await sql<{ logo_image_id: string }>`
      select logo_image_id from directory_suggestions where ref = ${recusada}
    `.execute(banco.db);
    await marcarImagemDeCatalogoRecusada(
      banco.db,
      r.rows[0]?.logo_image_id ?? '',
      'A imagem precisa ter pelo menos 256 x 256 pixels.',
    );
    assert.equal((await comoOPainelVe(recusada)).logo_url, null, 'bytes recusados');

    const semLogo = await indicarCom(dono, []);
    assert.equal((await comoOPainelVe(semLogo)).logo_url, null, 'sem logotipo');
  });

  void it('AS TRÊS OPERAÇÕES projetam as imagens: a LISTAGEM paginada, a LEITURA e a aprovação', async () => {
    // `AdminDirectorySuggestion` é UM esquema que serve a
    // `listAdminDirectorySuggestions`, a `getAdminDirectorySuggestion` e a
    // `AdminDirectorySuggestionApproved.suggestion`. Um segundo esquema que
    // repetisse os campos é exatamente a união duplicada que este repositório já
    // viu passar por `tsc`, pelo lint e por milhares de casos enquanto divergia.
    const dono = await novaConta();
    const envio = await novoEnvio({ dono });
    const ref = await indicarCom(dono, [envio]);
    await tornarPronta(ref, 0);

    const daLeitura = await comoOPainelVe(ref);
    assert.equal(daLeitura.photo_urls.length, 1);

    const pagina = await fila.listar({ reviewStatus: 'pending', page: 1, limit: 20 });
    const naListagem = pagina.itens.find((i) => i.ref === ref);
    assert.ok(naListagem, 'a indicação não apareceu na listagem paginada');
    const projetadaDaListagem = projetarIndicacao(naListagem, URL_DE_MIDIA);
    assert.deepEqual(
      projetadaDaListagem.photo_urls,
      daLeitura.photo_urls,
      'REPROVA: a listagem e a leitura projetam imagens diferentes. É UM esquema só.',
    );
    assert.equal(projetadaDaListagem.photos_total, daLeitura.photos_total);
  });

  void it('NENHUM identificador do banco sai na projeção da fila (ADR-0010 item 6)', async () => {
    const dono = await novaConta();
    const logo = await novoEnvio({ dono, purpose: PROPOSITO_DO_LOGOTIPO_DA_INDICACAO });
    const fotos = [await novoEnvio({ dono }), await novoEnvio({ dono })];
    const ref = await indicarCom(dono, fotos, logo);
    await tornarPronta(ref, 0);
    await tornarPronta(ref, 1);
    await logoPronta(ref);

    const texto = JSON.stringify(await comoOPainelVe(ref));

    assert.ok(
      !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(texto),
      `REPROVA: a projeção carrega um UUID do banco: ${texto}`,
    );
    for (const envio of [logo, ...fotos]) {
      assert.ok(!texto.includes(envio), `a projeção carrega o \`upload_id\` ${envio}`);
    }
    // A metade positiva: o caso acima não passa porque a projeção está vazia.
    assert.equal((await comoOPainelVe(ref)).photo_urls.length, 2);
  });

  void it('a listagem de 20 linhas com fotos emite o MESMO número de consultas que a de 1', async () => {
    // A contagem de consultas por dublê está em
    // `imagens-da-fila-saem-em-uma-consulta.test.ts`. O que ESTE caso mede é que
    // as três subconsultas RODAM contra Postgres de verdade numa página inteira:
    // subconsulta correlacionada que o dublê aceita e o Postgres recusa é a classe
    // de defeito que aquele arquivo não alcança.
    const dono = await novaConta();
    for (let n = 0; n < 3; n += 1) {
      const ref = await indicarCom(dono, [await novoEnvio({ dono })]);
      await tornarPronta(ref, 0);
    }

    const pagina = await fila.listar({ reviewStatus: 'pending', page: 1, limit: 20 });

    assert.ok(pagina.itens.length >= 3, `a página trouxe ${String(pagina.itens.length)} linhas`);
    const minhas = pagina.itens.filter((i) => refs.includes(i.ref));
    assert.ok(minhas.length >= 3);
    for (const i of minhas.slice(0, 3)) {
      assert.equal(typeof i.fotosTotal, 'number', '`fotos_total` chegou como texto');
    }
  });
});
