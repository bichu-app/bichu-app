/**
 * A persistência da vitrine de fotos do usuário.
 *
 * ## A AUTORIZAÇÃO É A CLÁUSULA `WHERE`, e não uma camada acima
 *
 * `listar` filtra por `user_id`, e `substituir` confirma cada envio exigindo
 * `catalog_upload_intents.user_id = <dono>` no `WHERE`. Não existe aqui uma
 * consulta que alcance a vitrine de outra conta — e é essa ausência que faz a
 * vitrine ser visível só ao dono, em vez de um `if` que alguém pode esquecer de
 * repetir na segunda rota (ADR-0021).
 *
 * É também o que impede confirmar o envio de outra pessoa adivinhando o
 * `upload_id`: sem o autor na cláusula, bastaria o identificador.
 *
 * ## TUDO NUMA TRANSAÇÃO, e a confirmação dentro dela
 *
 * `substituir` apaga as ligações antigas, confirma os envios novos, cria as
 * imagens em `processing`, enfileira o processamento e insere as posições —
 * **tudo na mesma transação**. Dois motivos, e os dois já produziram defeito
 * neste repositório:
 *
 * 1. **A confirmação sai junto com a escrita.** `confirmed_at` deixa de ser
 *    nulo no mesmo instante em que a foto passa a existir, e a linha sai da
 *    lista de `varrer-envios-vencidos.ts` nesse instante. Confirmar depois
 *    deixaria uma janela em que a intenção está vencida e não confirmada — que
 *    é exatamente a condição em que a varredura apagou foto de achado.
 * 2. **Imagem sem trabalho enfileirado fica `processing` para sempre**, e
 *    trabalho sem imagem falha em laço procurando linha que não existe.
 *
 * A unicidade `(user_id, position)` é DIFERIDA (`DEFERRABLE INITIALLY
 * DEFERRED`), e é por isso que reordenar pode ser "apaga tudo e insere na ordem
 * nova" sem colidir no meio da transação.
 */
import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import type { FotoDaVitrineParaGravar } from '../../domain/vitrine-de-fotos.js';
import type { IdGenerator } from '../../../../shared/ports/index.js';
import type { Instant, ObjectKey, UserId } from '../../../../shared/types/brands.js';
// `comoObjectKey` vem da PORTA de `media`, e nao de `media/domain`: a fronteira
// da arquitetura proibe importar dominio alheio, e copiar a conferencia da
// chave seria a segunda definicao dela. Ver o comentario da reexportacao.
import {
  TRABALHO_DE_IMAGEM_DE_CATALOGO,
  comoObjectKey,
} from '../../../media/ports/imagem-de-catalogo.js';
import { problemas } from '../../../../shared/http/errors.js';
import type { EnvioDaVitrine, FotoDaVitrine, VitrineRepository } from '../../ports/vitrine-repository.js';

/** O propósito desta esteira. Escrito uma vez, conferido na leitura e na escrita. */
export const PROPOSITO_DA_VITRINE = 'user_showcase' as const;

const FORMA_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function chaveOuNulo(valor: string | null): ObjectKey | null {
  return valor === null ? null : comoObjectKey(valor);
}

/**
 * O envio do DONO, com trava de linha.
 *
 * `user_id = dono` na cláusula, e `purpose = user_showcase` junto: um
 * `upload_id` de capa de encontro não vira foto de vitrine (T9), e o envio de
 * outra conta não é encontrado — a rota responde 404 e nunca 403, porque
 * distinguir os dois revelaria que o envio existe (ADR-0021).
 */
export async function envioDaVitrineDoDono(
  db: DbExecutor,
  uploadId: string,
  dono: UserId,
): Promise<EnvioDaVitrine | null> {
  if (!FORMA_DE_UUID.test(uploadId)) return null;
  const linha = await db
    .selectFrom('catalog_upload_intents as u')
    .leftJoin('catalog_images as c', 'c.upload_intent_id', 'u.id')
    .select([
      'u.id as id',
      'u.purpose as purpose',
      'u.expires_at as expires_at',
      'u.confirmed_at as confirmed_at',
      'c.id as catalog_image_id',
    ])
    .where('u.id', '=', uploadId)
    .where('u.user_id', '=', dono)
    .where('u.purpose', '=', PROPOSITO_DA_VITRINE)
    .forUpdate('u')
    .executeTakeFirst();
  if (linha === undefined) return null;
  return {
    id: linha.id,
    purpose: linha.purpose,
    expiresAt: linha.expires_at,
    confirmedAt: linha.confirmed_at,
    catalogImageId: linha.catalog_image_id,
  };
}

async function lerVitrine(db: DbExecutor, dono: UserId): Promise<readonly FotoDaVitrine[]> {
  const linhas = await db
    .selectFrom('user_showcase_images as v')
    .innerJoin('catalog_images as c', 'c.id', 'v.image_id')
    .leftJoin('catalog_upload_intents as u', 'u.id', 'c.upload_intent_id')
    .select([
      'u.id as upload_id',
      'v.position as position',
      'v.alt_text as alt_text',
      'c.status as status',
      // `thumb_key` é a derivada da GRADE (320 px) e `public_key` é a ABERTA
      // (1024 px). As duas saem desta consulta, e a tela escolhe pela medida
      // do que ela pinta — nunca o original, que não tem derivada pública.
      'c.thumb_key as thumb_key',
      'c.public_key as public_key',
      'c.rejection_reason as rejection_reason',
    ])
    .where('v.user_id', '=', dono)
    .where('c.purpose', '=', PROPOSITO_DA_VITRINE)
    .orderBy('v.position', 'asc')
    .execute();

  return linhas.map((linha) => ({
    uploadId: linha.upload_id,
    position: linha.position,
    status: linha.status,
    gradeKey: chaveOuNulo(linha.thumb_key),
    abertaKey: chaveOuNulo(linha.public_key),
    rejectionReason: linha.rejection_reason,
    altText: linha.alt_text,
  }));
}

/**
 * A escrita da vitrine, **sobre um executor recebido de fora**.
 *
 * Função separada de `substituir`, e a separação não é estilo: é o que torna a
 * promessa "a confirmação do envio vai na MESMA transação da escrita"
 * **mensurável por teste**. Com o corpo dentro do `db.transaction()`, a única
 * prova possível seria ler o código e acreditar — e foi exatamente um
 * comentário acreditado que deixou a varredura apagar foto de achado.
 *
 * Recebendo o executor, um teste passa um dublê que registra as operações e
 * confere que o `UPDATE ... confirmed_at` e o `INSERT INTO
 * user_showcase_images` chegaram no MESMO executor — isto é, na mesma
 * transação. Ver `confirmacao-na-mesma-transacao.test.ts`.
 */
export async function gravarVitrineNaTransacao(
  trx: DbExecutor,
  entrada: {
    readonly dono: UserId;
    readonly fotos: readonly FotoDaVitrineParaGravar[];
    readonly agora: Instant;
    readonly ids: IdGenerator;
  },
): Promise<readonly FotoDaVitrine[]> {
  const { dono, fotos, agora, ids } = entrada;
  {
    {
        // A ligação antiga sai primeiro. A unicidade `(user_id, position)` é
        // DIFERIDA, então a ordem nova pode reusar as mesmas posições dentro
        // desta transação sem colidir no meio.
        //
        // **As imagens de `catalog_images` NÃO são apagadas**, e a omissão é
        // deliberada: o objeto no balde é pago, mas apagá-lo aqui tornaria
        // "reordenar" uma operação destrutiva se o cliente reenviasse a lista
        // com uma foto fora por engano. Quem apaga objeto de conta é o expurgo
        // de 30 dias (SEC-020), que é ação explícita de pessoa.
        await trx.deleteFrom('user_showcase_images').where('user_id', '=', dono).execute();

        const gravadas: { imagemId: string; posicao: number; altText: string | null }[] = [];

        for (const foto of fotos) {
          const envio = await envioDaVitrineDoDono(trx, foto.uploadId, dono);
          // Envio que não é do dono, não é de vitrine, ou não existe: 404, e
          // nunca 403. Distinguir os dois revelaria que o envio existe.
          if (envio === null) throw problemas.naoEncontrado();

          let imagemId = envio.catalogImageId;
          if (imagemId === null) {
            // PRIMEIRA vez que este envio entra na vitrine: confirma, cria a
            // imagem em `processing` e enfileira — os três AQUI, dentro desta
            // transação. Ver o cabeçalho sobre a varredura de vencidos.
            if (envio.confirmedAt !== null) {
              // Confirmado e sem imagem é estado que não deveria existir:
              // falha ruidosa em vez de criar uma segunda imagem do mesmo
              // envio, que `catalog_images.upload_intent_id UNIQUE` recusaria
              // com erro de banco sem motivo.
              throw problemas.validacao([
                { field: 'photos', code: 'conflict', message: 'Esse envio já foi usado.' },
              ]);
            }
            if (envio.expiresAt.getTime() <= agora) {
              throw problemas.validacao([
                { field: 'photos', code: 'expired', message: 'Esse envio venceu. Envie a foto de novo.' },
              ]);
            }
            imagemId = ids.uuidv7();
            await trx
              .updateTable('catalog_upload_intents')
              .set({ confirmed_at: new Date(agora) })
              .where('id', '=', envio.id)
              .where('confirmed_at', 'is', null)
              .execute();
            await trx
              .insertInto('catalog_images')
              .values({
                id: imagemId,
                upload_intent_id: envio.id,
                purpose: PROPOSITO_DA_VITRINE,
                public_key: null,
                rejection_reason: null,
              })
              .execute();
            await trx
              .insertInto('jobs')
              .values({
                id: ids.uuidv7(),
                kind: TRABALHO_DE_IMAGEM_DE_CATALOGO,
                payload: JSON.stringify({ catalog_image_id: imagemId }),
              })
              .execute();
          }
          gravadas.push({ imagemId, posicao: foto.position, altText: foto.altText });
        }

        if (gravadas.length > 0) {
          await trx
            .insertInto('user_showcase_images')
            .values(
              gravadas.map((linha) => ({
                user_id: dono,
                image_id: linha.imagemId,
                position: linha.posicao,
                alt_text: linha.altText,
              })),
            )
            .execute();
        }

        return lerVitrine(trx, dono);
    }
  }
}

export function criarVitrineRepository(db: Db, ids: IdGenerator): VitrineRepository {
  return {
    listar: (dono) => lerVitrine(db, dono),
    substituir: ({ dono, fotos, agora }) =>
      db.transaction().execute((trx) => gravarVitrineNaTransacao(trx, { dono, fotos, agora, ids })),
  };
}
