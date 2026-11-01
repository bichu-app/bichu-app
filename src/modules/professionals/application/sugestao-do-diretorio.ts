import { problemas } from '../../../shared/http/errors.js';
import type { UserId } from '../../../shared/types/brands.js';
import type { RevisaoDaIndicacao } from '../domain/fila-de-indicacoes.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';
import {
  errosDaSugestao,
  projetarMinhaIndicacao,
  projetarRecibo,
  type CorpoDaSugestaoDoDiretorio,
  type PaginaDasMinhasIndicacoesProjetada,
  type ReciboDaSugestao,
} from '../domain/sugestao-do-diretorio.js';
import type { ConferenciasDeTexto } from '../ports/conferencias-de-texto.js';
import type { DirectorySuggestionRepository } from '../ports/directory-suggestion-repository.js';

/** A leitura de apoio: a conta que chama TEM canal de contato verificado? */
export interface CanalDeContatoDoChamador {
  temCanalVerificado(conta: UserId): Promise<boolean>;
}

/** Quem sugeriu, e o contexto da requisicao que a trilha guarda. */
export interface AutorDaSugestao {
  readonly userId: UserId;
  readonly correlationId: string;
  /** Em claro. A porta da trilha o transforma em HMAC (SEC-010); este arquivo nao. */
  readonly ip: string | undefined;
}

/** **Sem `ids` e sem `clock`**, e a ausencia dos dois e decisao. */
export interface DependenciasDaSugestaoDoDiretorio {
  readonly sugestoes: DirectorySuggestionRepository;
  readonly trilha: AuditLog;
  /** Ver `ports/conferencias-de-texto.ts`: o detector de D59 nao mora neste modulo. */
  readonly conferencias: ConferenciasDeTexto;
  /** Ver `CanalDeContatoDoChamador`: a trava de "conta validada", no SERVIDOR. */
  readonly canal: CanalDeContatoDoChamador;
}

function aparado(valor: string | undefined): string | null {
  const texto = valor?.trim();
  return texto === undefined || texto === '' ? null : texto;
}

export class SugestaoDoDiretorio {
  constructor(private readonly deps: DependenciasDaSugestaoDoDiretorio) {}

  async sugerir(
    autor: AutorDaSugestao,
    corpo: CorpoDaSugestaoDoDiretorio,
  ): Promise<ReciboDaSugestao> {
    if (!(await this.deps.canal.temCanalVerificado(autor.userId))) {
      throw problemas.canalDeContatoNaoVerificadoParaSugestao();
    }

    const erros = errosDaSugestao(corpo, this.deps.conferencias);
    if (erros.length > 0) throw problemas.validacao(erros);

    const gravada = await this.deps.sugestoes.registrar({
      autor: autor.userId,
      displayName: corpo.display_name.trim(),
      kind: corpo.kind,
      entityKind: corpo.entity_kind ?? 'professional',
      city: corpo.city.trim(),
      state: corpo.state,
      neighborhood: aparado(corpo.neighborhood),
      postalCode: aparado(corpo.postal_code),
      contatoKind: corpo.public_contact.kind,
      contatoValue: corpo.public_contact.value.trim(),
      note: aparado(corpo.note),
      logoUploadId: corpo.logo_upload_id ?? null,
      photoUploadIds: corpo.photo_upload_ids ?? [],
    });

    if (gravada.tipo === 'envio_nao_serve') {
      throw problemas.validacao([
        {
          field: gravada.campo,
          code: 'upload_not_usable',
          message: 'Essa imagem não serve para esta indicação. Escolha-a de novo.',
        },
      ]);
    }

    await this.deps.trilha.record({
      actorKind: 'user',
      actorUserId: autor.userId,
      actorIp: autor.ip,
      correlationId: autor.correlationId,
      action: 'directory_suggestion.submitted',
      resourceKind: 'directory_suggestion',
      resourceId: gravada.sugestao.ref,
      after: {
        kind: corpo.kind,
        city: corpo.city.trim(),
        state: corpo.state,
        contact_kind: corpo.public_contact.kind,
        has_note: corpo.note !== undefined,
        has_postal_code: corpo.postal_code !== undefined,
        has_logo: corpo.logo_upload_id !== undefined,
        photo_count: (corpo.photo_upload_ids ?? []).length,
        review_status: 'pending',
      },
    });

    return projetarRecibo(gravada.sugestao);
  }

  /** `listMyDirectorySuggestions`: as indicacoes DA CONTA, com o estado de cada uma. */
  async minhasIndicacoes(
    autor: UserId,
    recorte: {
      readonly page: number;
      readonly limit: number;
      readonly reviewStatus?: RevisaoDaIndicacao | undefined;
    },
  ): Promise<PaginaDasMinhasIndicacoesProjetada> {
    const lida = await this.deps.sugestoes.listarDoAutor({
      autor,
      reviewStatus: recorte.reviewStatus,
      page: recorte.page,
      limit: recorte.limit,
    });

    return {
      items: lida.itens.map(projetarMinhaIndicacao),
      page: recorte.page,
      limit: recorte.limit,
      total: lida.total,
    };
  }
}
