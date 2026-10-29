/**
 * O LOGOTIPO DA INDICAÇÃO contra Postgres (cliente, 29/10/2026: *"não tem o
 * campo do logotipo para o usuário subir e indicar o estabelecimento"*).
 *
 * ## POR QUE ESTE ARQUIVO EXIGE BANCO
 *
 * Porque o mecanismo inteiro é **de banco**, e dublê não o reproduz:
 *
 * - a conferência do envio é a **cláusula `WHERE`** da consulta
 *   (`u.user_id`, `u.purpose`). Um dublê que a imitasse faria o caso medir o
 *   próprio dublê -- e é exatamente a classe de coisa que fica verde em dublê e
 *   aberta em produção;
 * - a escrita são **quatro instruções na mesma transação**: a imagem de
 *   catálogo, o envio marcado como confirmado, o trabalho enfileirado e o
 *   `INSERT` da indicação. Dublê não desfaz;
 * - `directory_suggestions_logotipo_unico` e a chave estrangeira para
 *   `catalog_images` são do banco.
 *
 * ## A FRONTEIRA QUE ESTE ARQUIVO MEDE, E ELA É A RAZÃO DA FILA EXISTIR
 *
 * **A imagem de uma indicação que ninguém aprovou não pode aparecer em
 * superfície pública.** O que garante isso é o `purpose` separado:
 *
 * - **esta direção** (aqui): envio do PAINEL (`directory_logo`) **não** entra na
 *   fila -- o `WHERE` não o acha;
 * - a direção inversa (envio da indicação recusado pela escrita de
 *   `professionals`, que é a superfície pública) é comparação de valor no caso
 *   de uso, e está medida sem banco em
 *   `src/modules/professionals/application/logotipo-da-indicacao-nao-vaza.test.ts`.
 *
 * As duas juntas fecham o caminho nos dois sentidos. Uma só deixaria metade
 * aberta.
 *
 * ## A PROVA É POR DESLIGAMENTO
 *
 * Cada caso diz, por extenso, o que se apaga do código para ele ficar vermelho.
 * Caso que passa com o mecanismo desligado não é prova de nada, e este projeto
 * já aprovou 1037 casos com um mecanismo desligado.
 *
 * ## Como rodar: `npm run test:integration`, de dentro do worktree.
 *
 * ## O que sobrevive à execução
 *
 * Nada. Contas, indicações, imagens de catálogo, intenções de envio e trabalhos
 * saem no `after`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';

import { loadAppConfig, type AppConfig } from '../../src/shared/config/app-config.js';
import { createDb, type Db } from '../../src/shared/db/pool.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { criarDirectorySuggestionRepository } from '../../src/modules/professionals/adapters/persistence/kysely-directory-suggestion-repository.js';
import type {
  DirectorySuggestionRepository,
  SugestaoAGravar,
} from '../../src/modules/professionals/ports/directory-suggestion-repository.js';
import {
  PROPOSITO_DO_LOGOTIPO_DA_INDICACAO,
  TRABALHO_DE_IMAGEM_DE_CATALOGO,
  type PropositoDaImagem,
} from '../../src/modules/media/ports/imagem-de-catalogo.js';
import type { Instant, UserId } from '../../src/shared/types/brands.js';
import type { Clock } from '../../src/shared/time/clock.js';

const relogio: Clock = { now: () => Date.now() as Instant };
const ids = criarIdGenerator(() => relogio.now());

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO = 'exemplo.invalid';

let config: AppConfig;
let banco: { db: Db; close: () => Promise<void> };
let repositorio: DirectorySuggestionRepository;

const contas: UserId[] = [];
const refs: string[] = [];
const envios: string[] = [];

function sufixo(): string {
  return randomUUID().slice(0, 8);
}

/**
 * A contagem de um `count(*)`, como NUMERO.
 *
 * **Isto nao e cosmetica, e foi medido:** a primeira versao deste arquivo
 * comparava `rows[0].total` com a string `'1'` e os dois casos que usavam
 * contagem reprovaram com `1 !== '1'`. O driver desta pilha devolve `bigint`
 * como numero, e o tipo que o `sql<...>` declara nao muda o que chega -- e a
 * forma de verde falso ao contrario: o mecanismo estava certo e a assercao
 * errada. `Number()` e a mesma leitura que `listarDoAutor` faz no adaptador.
 */
function total(linha: { total: string | number } | undefined): number {
  return Number(linha?.total ?? -1);
}

async function novaConta(): Promise<UserId> {
  const id = randomUUID() as UserId;
  await sql`
    insert into users (id, email, display_name, created_at, updated_at, public_ref)
    values (${id}::uuid, ${`logo-${sufixo()}@${DOMINIO}`}, 'Quem Indicou', now(), now(),
            translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_'))
  `.execute(banco.db);
  contas.push(id);
  return id;
}

/**
 * Uma intenção de envio, como a rota de mídia a grava.
 *
 * **Escrita aqui com SQL cru, e não pela função do produto, de propósito**: o
 * que este arquivo mede é a CONFERÊNCIA do envio, e para medi-la ele precisa
 * poder gravar envios que o produto nunca gravaria -- de outro propósito, de
 * outra conta, vencido. `registrarIntencaoDoLogotipoDaIndicacao` tem o
 * propósito FECHADO no tipo justamente para que o produto não consiga.
 */
async function novoEnvio(opcoes: {
  dono: UserId;
  purpose?: PropositoDaImagem;
  vencido?: boolean;
  confirmado?: boolean;
}): Promise<string> {
  const id = ids.uuidv7();
  await banco.db
    .insertInto('catalog_upload_intents')
    .values({
      id,
      admin_account_id: null,
      user_id: opcoes.dono,
      purpose: opcoes.purpose ?? PROPOSITO_DO_LOGOTIPO_DA_INDICACAO,
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

/** O corpo mínimo que `registrar` exige, com o logotipo escolhido por caso. */
function aGravar(autor: UserId, logoUploadId: string | null): SugestaoAGravar {
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
  };
}

/** A linha gravada, lida pelo `ref` -- que é o que o recibo devolve. */
async function linhaDoRef(ref: string) {
  const r = await sql<{
    logo_image_id: string | null;
    entity_kind: string;
    review_status: string;
  }>`
    select logo_image_id, entity_kind, review_status
      from directory_suggestions where ref = ${ref}
  `.execute(banco.db);
  return r.rows[0];
}

// **Sem `async`**: nada aqui espera por nada, e `require-await` do `eslint`
// reprova a arrow assincrona sem `await` -- com razao, porque `async` sem espera
// esconde de quem le que a abertura e sincrona.
before(() => {
  config = loadAppConfig();
  banco = createDb(config.databaseUrl);
  repositorio = criarDirectorySuggestionRepository(banco.db, ids);
});

after(async () => {
  if (banco === undefined) return;
  // A ORDEM IMPORTA: a indicação aponta para a imagem, a imagem aponta para a
  // intenção. Limpar na ordem inversa recusaria pela chave estrangeira.
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

void describe('o logotipo da indicação, contra Postgres', () => {
  void it('o caminho FELIZ: a imagem nasce, o envio é confirmado, o trabalho é enfileirado e a indicação aponta para ela', async () => {
    // DESLIGAR PARA VER REPROVAR: em
    // `kysely-directory-suggestion-repository.ts`, troque `gravar(trx, imagemId)`
    // por `gravar(trx, null)` -- a imagem nasce e a indicação não a aponta, que
    // é a forma silenciosa deste defeito.
    const dono = await novaConta();
    const envio = await novoEnvio({ dono });

    const r = await repositorio.registrar(aGravar(dono, envio));
    assert.equal(r.tipo, 'gravada');
    if (r.tipo !== 'gravada') return;
    refs.push(r.sugestao.ref);

    const linha = await linhaDoRef(r.sugestao.ref);
    assert.ok(linha?.logo_image_id, 'a indicação precisa apontar para a imagem');
    // A indicação nasce PENDENTE, e o logotipo não muda isso: o cliente foi
    // explícito em 29/10 de que o fluxo da fila continua.
    assert.equal(linha?.review_status, 'pending');
    // E o `entity_kind` do item 1 atravessa junto, pela mesma função de catorze
    // argumentos.
    assert.equal(linha?.entity_kind, 'organization');

    const imagem = await sql<{ purpose: string; status: string }>`
      select purpose, status from catalog_images where id = ${linha?.logo_image_id}::uuid
    `.execute(banco.db);
    assert.equal(
      imagem.rows[0]?.purpose,
      PROPOSITO_DO_LOGOTIPO_DA_INDICACAO,
      'a imagem precisa nascer com o propósito da indicação, e não com o do painel',
    );
    // `processing`, e não `ready`: quem a torna servível é o worker, e a leitura
    // pública filtra por `ready`. Nascer `ready` publicaria bytes com EXIF.
    assert.equal(imagem.rows[0]?.status, 'processing');

    const envioLido = await sql<{ confirmed_at: Date | null }>`
      select confirmed_at from catalog_upload_intents where id = ${envio}::uuid
    `.execute(banco.db);
    assert.ok(
      envioLido.rows[0]?.confirmed_at !== null,
      'o envio precisa ficar confirmado: é isso que o tira da varredura de vencidos',
    );

    const trabalho = await sql<{ total: string }>`
      select count(*) as total from jobs
       where kind = ${TRABALHO_DE_IMAGEM_DE_CATALOGO}
         and payload->>'catalog_image_id' = ${linha?.logo_image_id}
    `.execute(banco.db);
    assert.equal(
      total(trabalho.rows[0]),
      1,
      'imagem sem trabalho ficaria `processing` para sempre',
    );
  });

  void it('A FRONTEIRA: envio do PAINEL (`directory_logo`) NÃO entra na fila, e nada é gravado', async () => {
    // **O caso que a fila existe para garantir, nesta direção.** Um envio
    // assinado por `createAdminCatalogImageIntent` tem `purpose:
    // directory_logo` -- e é esse o propósito que a escrita de `professionals`
    // aceita, que é a superfície pública. Aceitá-lo aqui misturaria as duas
    // esteiras e tiraria o sentido da separação.
    //
    // DESLIGAR PARA VER REPROVAR: tire
    // `AND u.purpose = ${PROPOSITO_DO_LOGOTIPO_DA_INDICACAO}` da consulta.
    const dono = await novaConta();
    const envio = await novoEnvio({ dono, purpose: 'directory_logo' });

    const r = await repositorio.registrar(aGravar(dono, envio));
    assert.equal(
      r.tipo,
      'envio_nao_serve',
      'REPROVA: a fila aceitou um envio do PAINEL. Os dois propósitos existem ' +
        'separados justamente para que as duas esteiras não se misturem.',
    );

    // NADA foi gravado: a transação volta inteira.
    const nada = await sql<{ total: string }>`
      select count(*) as total from catalog_images where upload_intent_id = ${envio}::uuid
    `.execute(banco.db);
    assert.equal(total(nada.rows[0]), 0, 'a recusa não pode deixar imagem nascida');
    const envioLido = await sql<{ confirmed_at: Date | null }>`
      select confirmed_at from catalog_upload_intents where id = ${envio}::uuid
    `.execute(banco.db);
    assert.equal(
      envioLido.rows[0]?.confirmed_at,
      null,
      'a recusa não pode deixar o envio confirmado',
    );
  });

  void it('envio de OUTRA CONTA é recusado com o MESMO desfecho', async () => {
    // A autoria está na cláusula `WHERE` (`u.user_id`), e não num `if` depois
    // do `SELECT`: um `if` teria lido o envio de outra pessoa para a memória
    // deste processo (ADR-0021).
    //
    // **O desfecho é o MESMO da recusa acima, e o silêncio é o recurso**: dizer
    // "esse envio é de outra pessoa" confirmaria a existência de um `upload_id`
    // alheio a quem o adivinhou.
    //
    // DESLIGAR PARA VER REPROVAR: tire `AND u.user_id = ...` da consulta.
    const dono = await novaConta();
    const outra = await novaConta();
    const envio = await novoEnvio({ dono: outra });

    const r = await repositorio.registrar(aGravar(dono, envio));
    assert.equal(r.tipo, 'envio_nao_serve');
  });

  void it('envio VENCIDO, envio JÁ CONFIRMADO e `upload_id` que não existe saem com o MESMO desfecho', async () => {
    const dono = await novaConta();
    const vencido = await novoEnvio({ dono, vencido: true });
    const confirmado = await novoEnvio({ dono, confirmado: true });
    const inexistente = randomUUID();

    for (const [nome, envio] of [
      ['vencido', vencido],
      ['já confirmado', confirmado],
      ['inexistente', inexistente],
    ] as const) {
      const r = await repositorio.registrar(aGravar(dono, envio));
      assert.equal(r.tipo, 'envio_nao_serve', nome);
    }
  });

  void it('`upload_id` que não é UUID é recusado SEM chegar ao banco', async () => {
    // A segunda rede da forma. O contrato já o valida como `format: uuid`, e um
    // texto qualquer aqui estouraria como erro de banco (`22P02`) em vez de
    // `400` -- que é o defeito que `FORMA_DE_UUID` existe para não ter.
    const dono = await novaConta();
    const r = await repositorio.registrar(aGravar(dono, 'nao-e-uuid'));
    assert.equal(r.tipo, 'envio_nao_serve');
  });

  void it('SEM logotipo a indicação é gravada normalmente, e nada é confirmado', async () => {
    // **O caminho do APK publicado, e o caso comum.** Ele não abre transação:
    // ver o cabeçalho de `registrar`.
    const dono = await novaConta();
    const antes = await sql<{ total: string }>`
      select count(*) as total from catalog_images where purpose = ${PROPOSITO_DO_LOGOTIPO_DA_INDICACAO}
    `.execute(banco.db);

    const r = await repositorio.registrar(aGravar(dono, null));
    assert.equal(r.tipo, 'gravada');
    if (r.tipo !== 'gravada') return;
    refs.push(r.sugestao.ref);

    const linha = await linhaDoRef(r.sugestao.ref);
    assert.equal(
      linha?.logo_image_id,
      null,
      'indicação sem logotipo precisa gravar NULO -- não há `DEFAULT` a repor',
    );
    const depois = await sql<{ total: string }>`
      select count(*) as total from catalog_images where purpose = ${PROPOSITO_DO_LOGOTIPO_DA_INDICACAO}
    `.execute(banco.db);
    assert.equal(
      total(depois.rows[0]),
      total(antes.rows[0]),
      'nenhuma imagem de catálogo pode nascer de uma indicação sem logotipo',
    );
  });

  void it('a MESMA imagem não serve a DUAS indicações', async () => {
    // O envio já confirmado não serve de novo -- e a diferença em relação à capa
    // do encontro está escrita no cabeçalho de `registrar`: encontro se edita,
    // indicação não. `directory_suggestions_logotipo_unico` é a rede de baixo.
    const dono = await novaConta();
    const envio = await novoEnvio({ dono });

    const primeira = await repositorio.registrar(aGravar(dono, envio));
    assert.equal(primeira.tipo, 'gravada');
    if (primeira.tipo === 'gravada') refs.push(primeira.sugestao.ref);

    const segunda = await repositorio.registrar(aGravar(dono, envio));
    assert.equal(
      segunda.tipo,
      'envio_nao_serve',
      'REPROVA: o mesmo `upload_id` virou logotipo de duas indicações.',
    );
  });
});
