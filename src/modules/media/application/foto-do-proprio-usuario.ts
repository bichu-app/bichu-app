/**
 * A autorizacao de envio da FOTO DO PROPRIO USUARIO (cliente, 18/10/2026, nas
 * palavras dele: *"coloque um campo para o usuario cadastrar sua propria foto e
 * um selo na foto dele, se ele estiver validado"*).
 *
 * O backend nunca recebe os bytes: ele assina a autorizacao de envio direto e o
 * app faz o `POST`/`PUT` no armazenamento (ADR-0007). **Nao ha fluxo novo
 * nenhum aqui** -- e o mesmo `ObjectStorage.createUploadIntent` da foto de pet,
 * o mesmo preparador que o painel usa para imagem de catalogo, e a MESMA
 * estrutura de `capa-de-encontro-da-comunidade.ts`, com `purpose = user_photo` e
 * o prefixo `people/`.
 *
 * ## As tres diferencas em relacao a capa do encontro, e cada uma tem motivo
 *
 * - **HEIC entra na lista de entrada.** A capa do encontro recusa HEIC porque a
 *   lista dela e a do painel, que vem de um computador de mesa. Esta foto sai de
 *   um celular, metade dos celulares e iPhone, e o cliente autorizou HEIC por
 *   causa disso. Quem decide e `TIPOS_POR_PROPOSITO['user_photo']`, que reusa
 *   `TIPOS_ACEITOS` -- a mesma lista da foto de pet.
 * - **A dimensao minima e 300 x 300**, e nao 600: a maior derivada e 512, e um
 *   retrato recortado de uma foto antiga chega perto disso. Recusar a 500 px
 *   entregaria "sua foto nao serve" a quem tem a unica foto que tem.
 * - **O prefixo e `people/`**, proprio, e nao compartilhado com `Loja`, `Rede`
 *   ou diretorio: foto de pessoa e foto de estabelecimento tem regimes de
 *   privacidade diferentes (ADR-0010), e prefixos separados sao o que permite
 *   uma politica de balde valer para uma e nao para a outra.
 *
 * ## O que esta classe NAO faz, e as ausencias sao a resposta a duas perguntas
 *
 * - **Nao confirma nada.** Quem confirma e `PATCH /v1/me`, com `photo_upload_id`
 *   e com a conta na clausula `WHERE`. Assinar nao e escrita de conteudo, e a
 *   intencao que ninguem confirma vence em dez minutos e o varredor a recolhe.
 *   **E aquela confirmacao, e nao esta assinatura, que protege a foto da
 *   varredura de envios vencidos** -- ver o cabecalho de
 *   `varrer-envios-vencidos.ts` e o defeito que ele descreve.
 * - **Nao decide quem ve a foto, e nao decide o selo.** A foto sai em `GET
 *   /v1/me` e em nenhuma outra resposta; o selo e `users.email_verified_at`, que
 *   ja existe e ja sai como `Me.email_verified`.
 *
 * A assinatura e pedida ANTES de qualquer escrita, e nao dentro de transacao: e
 * chamada de rede a um servico externo, e segurar conexao do banco esperando
 * por ela e o que esgota o pool num pico.
 */
import { problemas } from '../../../shared/http/errors.js';
import type { DbExecutor } from '../../../shared/db/pool.js';
import type { IdGenerator } from '../../../shared/ports/index.js';
import type { UserId } from '../../../shared/types/brands.js';
import {
  DIMENSAO_MINIMA,
  dimensaoDeclaradaAbaixoDaMinima,
  type AutorizacaoDeCapa,
  type PreparadorDeEnvioDeCatalogo,
} from '../ports/imagem-de-catalogo.js';

/** O corpo de `createMyPhotoUploadIntent`, como o contrato o declara. */
export interface CorpoDaIntencaoDeFoto {
  readonly content_type: string;
  readonly byte_size: number;
  readonly width?: number;
  readonly height?: number;
}

export interface DependenciasDaFotoDoUsuario {
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
      readonly purpose: 'user_photo';
    },
  ) => Promise<void>;
  readonly db: DbExecutor;
  readonly ids: IdGenerator;
}

export class FotoDoProprioUsuario {
  constructor(private readonly deps: DependenciasDaFotoDoUsuario) {}

  async autorizar(autor: UserId, corpo: CorpoDaIntencaoDeFoto): Promise<AutorizacaoDeCapa> {
    // A dimensao declarada ANTES de assinar: recusar depois deixaria uma
    // politica assinada valendo dez minutos para um arquivo que ja se sabe ruim.
    const abaixo = dimensaoDeclaradaAbaixoDaMinima('user_photo', corpo.width, corpo.height);
    if (abaixo.length > 0) {
      const minima = DIMENSAO_MINIMA['user_photo'];
      throw problemas.imagemPequenaDemais(
        minima,
        abaixo.map((field) => ({
          field,
          code: 'minimum',
          message: `Mínimo de ${String(field === 'width' ? minima.largura : minima.altura)} pixels.`,
        })),
      );
    }
    // `preparar` e quem recusa o tipo fora da lista (415) e o BYTE_SIZE ACIMA DE
    // 5 MB (400), **no servidor**, antes de assinar -- e e ele tambem que poe o
    // mesmo teto dentro da politica assinada, que e o que impede o envio direto
    // ao armazenamento de passar por cima da recusa.
    const envio = await this.deps.envios.preparar(corpo.content_type, corpo.byte_size, 'user_photo');
    await this.deps.registrarIntencao(this.deps.db, {
      id: envio.uploadId,
      userId: autor,
      objectKey: envio.chave,
      declaredType: envio.contentType,
      maxBytes: envio.maxBytes,
      expiresAt: envio.autorizacao.expiraEm,
      purpose: 'user_photo',
    });
    return { uploadId: envio.uploadId, autorizacao: envio.autorizacao };
  }
}
