/**
 * A autorizacao de envio da CAPA do encontro da comunidade (ADR-0025 emenda 3).
 *
 * O backend nunca recebe os bytes: ele assina a autorizacao de envio direto e o
 * app faz o `POST`/`PUT` no armazenamento (ADR-0007). **Nao ha fluxo novo
 * nenhum aqui** -- e o mesmo `ObjectStorage.createUploadIntent` da foto de pet
 * e da foto de achado, e o mesmo preparador que o painel usa para imagem de
 * catalogo, com `purpose = network_event` e o prefixo `events/` do ADR-0007
 * emenda 1.
 *
 * ## As duas diferencas em relacao ao painel, e por que
 *
 * - **O autor e uma conta do app**, e nao do painel: a intencao grava `user_id`
 *   em `catalog_upload_intents` (coluna da migracao `20261001000005`, com
 *   `CHECK` de "um e so um autor"). Isso e o que permite a confirmacao do envio
 *   conferir a conta na clausula `WHERE`: sem autor de `users`, confirmar
 *   capa de outra pessoa seria so uma questao de adivinhar o `upload_id`.
 * - **Nao ha trilha aqui**, como nao ha em `createPetPhotoUploadIntent`:
 *   autorizar nao e escrita de conteudo, e a intencao que ninguem confirma
 *   vence em dez minutos e o varredor a recolhe. A trilha sai na criacao do
 *   encontro, onde a capa passa a existir.
 *
 * A assinatura e pedida ANTES de qualquer escrita, e nao dentro de transacao:
 * e chamada de rede a um servico externo, e segurar conexao do banco esperando
 * por ela e o que esgota o pool num pico.
 */
import type { DbExecutor } from '../../../shared/db/pool.js';
import type { IdGenerator } from '../../../shared/ports/index.js';
import type { UserId } from '../../../shared/types/brands.js';
import {
  recusarDimensaoDeclaradaPequena,
  type AutorizacaoDeCapa,
  type PreparadorDeEnvioDeCatalogo,
} from '../ports/imagem-de-catalogo.js';

/** O corpo de `createNetworkEventCoverUploadIntent`, como o contrato o declara. */
export interface CorpoDaIntencaoDeCapa {
  readonly content_type: string;
  readonly byte_size: number;
  readonly width?: number;
  readonly height?: number;
}

export interface DependenciasDaCapaDeEncontro {
  readonly envios: PreparadorDeEnvioDeCatalogo;
  /** Grava a intencao com autor de `users`. Uma instrucao: nao abre transacao. */
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

export class CapaDeEncontroDaComunidade {
  constructor(private readonly deps: DependenciasDaCapaDeEncontro) {}

  async autorizar(autor: UserId, corpo: CorpoDaIntencaoDeCapa): Promise<AutorizacaoDeCapa> {
    recusarDimensaoDeclaradaPequena('network_event', corpo.width, corpo.height);
    const envio = await this.deps.envios.preparar(corpo.content_type, corpo.byte_size, 'network_event');
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
