import type { DbExecutor } from '../../../shared/db/pool.js';
import type { IdGenerator } from '../../../shared/ports/index.js';
import type { UserId } from '../../../shared/types/brands.js';
import {
  recusarDimensaoDeclaradaPequena,
  type AutorizacaoDeCapa,
  type PreparadorDeEnvioDeCatalogo,
} from '../ports/imagem-de-catalogo.js';

/**
 * A AUTORIZAÇÃO DE ENVIO DA FOTO DE CAPA DO PET (cliente, 06/11/2026).
 *
 * Pedido literal: *"gostei muito da forma como ele apresenta o perfil do pet,
 * com a foto de capa, como fazemos na pagina de eventos e profissionais"*.
 *
 * **Idêntico em forma a `CapaDeEncontroDaComunidade`, e isso é o ponto**: o
 * mesmo caminho que a capa do encontro criado pela conta já percorre (ADR-0025
 * emenda 3), pela decisão do cliente de 03/11/2026 — *"sempre que estivermos
 * falando de upload de imagem, isso deve ser tratado no mesmo lugar, e as
 * correções devem ser realizadas em todos os lugares por ser o mesmo código"*.
 *
 * O que muda é **só o propósito**, e ele é separado de propósito: um envio
 * autorizado aqui não casa o `purpose` que a confirmação do encontro exige, e
 * vice-versa. Não existe caminho que leve a capa de um pet para a agenda da
 * comunidade.
 *
 * ## O que esta classe NÃO faz
 *
 * **Não olha o pet.** Autorizar não escreve em pet nenhum: o `upload_id` só vira
 * capa quando `setPetCover` o confirma, e é lá que o dono do pet é conferido na
 * cláusula `WHERE`. Pedir aqui o `petId` daria a impressão de reserva, e
 * autorização não reserva nada — a intenção que ninguém confirma vence em dez
 * minutos e o varredor a recolhe.
 */
export interface CorpoDaIntencaoDaCapaDoPet {
  readonly content_type: string;
  readonly byte_size: number;
  readonly width?: number;
  readonly height?: number;
}

export interface DependenciasDaCapaDoPet {
  readonly envios: PreparadorDeEnvioDeCatalogo;
  /** Grava a intenção com autor de `users`, nunca de `admin_accounts`. */
  readonly registrarIntencao: (
    db: DbExecutor,
    nova: {
      readonly id: string;
      readonly userId: string;
      readonly objectKey: string;
      readonly declaredType: string;
      readonly maxBytes: number;
      readonly expiresAt: Date;
    },
  ) => Promise<void>;
  readonly db: DbExecutor;
  readonly ids: IdGenerator;
}

export class CapaDoPet {
  constructor(private readonly deps: DependenciasDaCapaDoPet) {}

  async autorizar(
    autor: UserId,
    corpo: CorpoDaIntencaoDaCapaDoPet,
  ): Promise<AutorizacaoDeCapa> {
    // 1280 x 720 (cliente, 02/11/2026). A altura NÃO está escrita aqui: ela sai
    // de `DIMENSAO_MINIMA`, derivada da proporção da derivada `banner`.
    recusarDimensaoDeclaradaPequena('pet_cover', corpo.width, corpo.height);
    const envio = await this.deps.envios.preparar(
      corpo.content_type,
      corpo.byte_size,
      'pet_cover',
    );
    await this.deps.registrarIntencao(this.deps.db, {
      id: envio.uploadId,
      userId: autor,
      objectKey: envio.chave,
      declaredType: envio.contentType,
      maxBytes: envio.maxBytes,
      expiresAt: envio.autorizacao.expiraEm,
    });
    return { uploadId: envio.uploadId, autorizacao: envio.autorizacao };
  }
}
