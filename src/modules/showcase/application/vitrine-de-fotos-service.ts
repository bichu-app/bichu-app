/**
 * O caso de uso da vitrine de fotos do usuário.
 *
 * Fino de propósito: a regra de forma está no domínio
 * (`conferirVitrinePedida`), a autorização está na cláusula `WHERE` do
 * repositório, e a geometria das derivadas está em `derivadas.ts`. O que sobra
 * aqui é a ordem dos atos — conferir ANTES de abrir transação, e autorizar o
 * envio ANTES de assinar.
 *
 * ## A autorização de envio é pedida FORA de transação
 *
 * Assinar é chamada de rede a um serviço externo. Segurar conexão do banco
 * esperando por ela é o que esgota o pool num pico, e é o mesmo motivo que
 * `capa-de-encontro-da-comunidade.ts` registra.
 *
 * ## O teto de 5 MB é cobrado na POLÍTICA ASSINADA, e não depois
 *
 * O backend nunca recebe os bytes (ADR-0007): o app envia direto ao
 * armazenamento. Então o teto tem de estar na política — recusar depois seria
 * recusar o que já foi gravado e pago. `preparar` o aplica
 * (`TETO_DE_BYTES_DO_CATALOGO`, reexportado do ponto único
 * `TETO_DE_BYTES_DO_ENVIO`), e também recusa o `byte_size` DECLARADO acima do
 * teto antes de assinar, para a tela dizer o motivo em vez de o envio falhar no
 * armazenamento sem explicação.
 */
import type { UserId } from '../../../shared/types/brands.js';
import type { Clock } from '../../../shared/ports/index.js';
import { problemas } from '../../../shared/http/errors.js';
import {
  DIMENSAO_MINIMA,
  dimensaoDeclaradaAbaixoDaMinima,
  type AutorizacaoDeCapa,
  type PreparadorDeEnvioDeCatalogo,
} from '../../media/ports/imagem-de-catalogo.js';
import type { DbExecutor } from '../../../shared/db/pool.js';
import {
  TETO_DE_FOTOS_DA_VITRINE,
  conferirVitrinePedida,
  type FotoPedidaNaVitrine,
} from '../domain/vitrine-de-fotos.js';
import type { FotoDaVitrine, VitrineRepository } from '../ports/vitrine-repository.js';
import { PROPOSITO_DA_VITRINE } from '../adapters/persistence/kysely-vitrine.js';

/** O corpo de `createShowcasePhotoUploadIntent`, como o contrato o declara. */
export interface CorpoDaIntencaoDaVitrine {
  readonly content_type: string;
  readonly byte_size: number;
  readonly width?: number;
  readonly height?: number;
}

/** O corpo de `replaceMyShowcase`. */
export interface CorpoDaVitrine {
  readonly photos: readonly FotoPedidaNaVitrine[];
}

export interface DependenciasDaVitrine {
  readonly envios: PreparadorDeEnvioDeCatalogo;
  readonly vitrine: VitrineRepository;
  /** Grava a intenção com autor de `users`. Uma instrução: não abre transação. */
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
  readonly clock: Clock;
}

export class VitrineDeFotos {
  constructor(private readonly deps: DependenciasDaVitrine) {}

  /** A vitrine do DONO. Lista vazia é resposta normal, e não ausência de recurso. */
  async minhaVitrine(dono: UserId): Promise<readonly FotoDaVitrine[]> {
    return this.deps.vitrine.listar(dono);
  }

  async autorizarEnvio(dono: UserId, corpo: CorpoDaIntencaoDaVitrine): Promise<AutorizacaoDeCapa> {
    // A dimensão declarada ANTES de assinar: recusar depois deixaria uma
    // política assinada valendo dez minutos para um arquivo já sabido ruim.
    const abaixo = dimensaoDeclaradaAbaixoDaMinima(PROPOSITO_DA_VITRINE, corpo.width, corpo.height);
    if (abaixo.length > 0) {
      const minima = DIMENSAO_MINIMA[PROPOSITO_DA_VITRINE];
      throw problemas.imagemPequenaDemais(
        minima,
        abaixo.map((field) => ({
          field,
          code: 'minimum',
          message: `Mínimo de ${String(field === 'width' ? minima.largura : minima.altura)} pixels.`,
        })),
      );
    }
    // O TETO DE FOTOS, conferido aqui também: assinar a décima autorização
    // seria entregar uma política de escrita que a vitrine nunca vai aceitar, e
    // o objeto ficaria no balde até o varredor passar. Conferir antes é o que
    // faz a tela dizer "você já tem nove" em vez de o envio subir e sumir.
    const atuais = await this.deps.vitrine.listar(dono);
    if (atuais.length >= TETO_DE_FOTOS_DA_VITRINE) {
      throw problemas.validacao([
        {
          field: 'photos',
          code: 'maximum',
          message: `No máximo ${String(TETO_DE_FOTOS_DA_VITRINE)} fotos na vitrine.`,
        },
      ]);
    }

    const envio = await this.deps.envios.preparar(
      corpo.content_type,
      corpo.byte_size,
      PROPOSITO_DA_VITRINE,
    );
    await this.deps.registrarIntencao(this.deps.db, {
      id: envio.uploadId,
      userId: dono,
      objectKey: envio.chave,
      declaredType: envio.contentType,
      maxBytes: envio.maxBytes,
      expiresAt: envio.autorizacao.expiraEm,
    });
    return { uploadId: envio.uploadId, autorizacao: envio.autorizacao };
  }

  /**
   * Substitui a vitrine inteira. É a ÚNICA escrita, e trata acrescentar,
   * reordenar, trocar a capa e remover — ver o cabeçalho do domínio.
   *
   * A conferência vem ANTES da transação: abrir transação para descobrir que o
   * corpo tem dez fotos é segurar conexão por nada.
   */
  async substituir(dono: UserId, corpo: CorpoDaVitrine): Promise<readonly FotoDaVitrine[]> {
    const fotos = conferirVitrinePedida(corpo.photos ?? []);
    const agora = this.deps.clock.now();
    return this.deps.vitrine.substituir({ dono, fotos, agora });
  }
}
