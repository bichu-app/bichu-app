import { problemas } from '../../../shared/http/errors.js';
import { hashDeToken, iguaisEmTempoConstante } from '../../../shared/crypto/digest.js';
import { redigirCanalMediado } from '../../../shared/redaction/redigir.js';
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import type { Clock, IdGenerator } from '../../../shared/ports/index.js';
import type { AbsoluteUrl } from '../../../shared/types/brands.js';
import type { AutorizacaoDeEnvio, ObjectStorage } from '../../media/ports/object-storage.js';
import { chaveDaFotoDoAchadorSemConta, ehTipoAceito } from '../../media/ports/chaves-de-objeto.js';
import type {
  AvisoDoAchador,
  EnriquecimentoDoAchador,
  FoundReportRepository,
} from '../ports/found-report-repository.js';
import type {
  ConversaDoAchadorParaAviso,
  OrigemDoPedidoDoAchador,
} from '../ports/conversa-do-achador.js';
import { TETO_DE_BYTES_DA_FOTO_DO_ACHADO, TETO_DE_FOTOS_POR_ACHADO } from './found-report-service.js';

const VALIDADE_DA_AUTORIZACAO_EM_SEGUNDOS = 300;

const TAMANHO_MAXIMO_DO_NOME = 60;

export interface EntradaDeEnriquecimento {
  readonly message?: string;
  readonly location?: { readonly lat?: number; readonly lon?: number; readonly accuracy_m?: number };
  readonly finder_contact?: { readonly display_name?: string; readonly email?: string };
  readonly photo_upload_ref?: string;
}

/** `FinderFoundReportView`. */
export interface VistaDoAvisoParaOAchador {
  readonly status: AvisoDoAchador['status'];
  readonly foundAt: Date;
  readonly hasPhoto: boolean;
  readonly hasLocation: boolean;
  readonly message: string | null;
  readonly petDisplayName: string | null;
  readonly conversationUrl: AbsoluteUrl;
}

export interface FotoDoAchadorAutorizada {
  readonly uploadRef: string;
  readonly autorizacao: AutorizacaoDeEnvio;
}

export interface DependenciasDoAvisoDoAchador {
  readonly repositorio: FoundReportRepository;
  readonly conversa: ConversaDoAchadorParaAviso;
  readonly armazenamento: ObjectStorage;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  /** `WEB_BASE_URL`: a página `/c/{token}` é do site, não desta API. */
  readonly baseDaWeb: AbsoluteUrl;
}

export class AvisoDoAchadorService {
  constructor(private readonly deps: DependenciasDoAvisoDoAchador) {}

  /** `PATCH /v1/finder/found-report`. */
  async enriquecer(
    token: string,
    entrada: EntradaDeEnriquecimento,
    origem: OrigemDoPedidoDoAchador,
  ): Promise<VistaDoAvisoParaOAchador> {
    const mudanca = validarEnriquecimento(entrada);

    const { resumo } = await this.avisoAberto(token);

    let fotoUploadId: string | undefined;
    if (entrada.photo_upload_ref !== undefined) {
      fotoUploadId = await this.deps.repositorio.intencaoDeFotoDoAchadorPelaReferencia(
        resumo,
        entrada.photo_upload_ref,
      );
      if (fotoUploadId === undefined) {
        throw problemas.validacao([
          { field: 'photo_upload_ref', code: 'unknown', message: 'Envie a foto de novo.' },
        ]);
      }
    }

    const recado = entrada.message?.trim();
    const recadoEntregue =
      recado === undefined || recado === ''
        ? undefined
        : await this.deps.conversa.entregarRecado(token, recado, origem);

    const atualizado = await this.deps.repositorio.enriquecerPeloTokenDoAchador(
      resumo,
      { ...mudanca, ...(fotoUploadId === undefined ? {} : { fotoUploadId }) },
      this.deps.clock.now(),
    );
    if (atualizado === undefined) throw problemas.avisoEncerrado();

    return this.vista(token, atualizado, recadoEntregue);
  }

  /** `POST /v1/media/finder-photo-intents`. */
  async autorizarFoto(
    token: string,
    contentType: string,
    byteSize: number,
  ): Promise<FotoDoAchadorAutorizada> {
    const { aviso, resumo } = await this.avisoAberto(token);

    if (!ehTipoAceito(contentType)) throw problemas.tipoDeMidiaNaoAceito();
    if (byteSize <= 0 || byteSize > TETO_DE_BYTES_DA_FOTO_DO_ACHADO) {
      throw problemas.tipoDeMidiaNaoAceito();
    }

    const pedidas = await this.deps.repositorio.contarIntencoesDeFotoPeloTokenDoAchador(resumo);
    if (pedidas >= TETO_DE_FOTOS_POR_ACHADO) throw problemas.limiteSemReabertura();

    const uploadRef = Buffer.from(this.deps.ids.random128()).toString('base64url');
    const chave = chaveDaFotoDoAchadorSemConta(this.deps.ids.random128());

    const autorizacao = await this.deps.armazenamento.createUploadIntent({
      classe: 'privado',
      chave,
      contentType,
      maxBytes: TETO_DE_BYTES_DA_FOTO_DO_ACHADO,
      validadeEmSegundos: VALIDADE_DA_AUTORIZACAO_EM_SEGUNDOS,
    });

    await this.deps.repositorio.registrarIntencaoDeFotoDoAchadorSemConta({
      id: this.deps.ids.uuidv7(),
      uploadRef,
      foundReportId: aviso.id,
      objectKey: chave,
      declaredType: contentType,
      maxBytes: TETO_DE_BYTES_DA_FOTO_DO_ACHADO,
      expiresAt: autorizacao.expiraEm,
    });

    return { uploadRef, autorizacao };
  }

  /** O token e o aviso, nas recusas que o contrato declara para as duas operações: */
  private async avisoAberto(token: string): Promise<{ aviso: AvisoDoAchador; resumo: Buffer }> {
    const acesso = await this.deps.conversa.acesso(token);
    if (acesso.situacao === 'recusado') throw problemas.linkDoAchadorInvalido();
    if (acesso.situacao === 'vencido') throw problemas.acessoDoAchadorVencido();
    if (!acesso.aceitaMensagem) throw problemas.avisoEncerrado();

    const resumo = hashDeToken(token);
    const aviso = await this.deps.repositorio.avisoPeloTokenDoAchador(resumo);
    if (aviso === undefined || !iguaisEmTempoConstante(Buffer.from(aviso.resumoDoToken), resumo)) {
      throw problemas.linkDoAchadorInvalido();
    }
    if (aviso.status === 'closed') throw problemas.avisoEncerrado();
    return { aviso, resumo };
  }

  private vista(
    token: string,
    aviso: AvisoDoAchador,
    recadoEntregue: string | undefined,
  ): VistaDoAvisoParaOAchador {
    const recadoDoAviso = aviso.recado === null ? null : redigirCanalMediado(aviso.recado).texto;
    return {
      status: aviso.status,
      foundAt: aviso.achadoEm,
      hasPhoto: aviso.temFoto,
      hasLocation: aviso.temPonto,
      message: recadoEntregue ?? recadoDoAviso,
      petDisplayName: aviso.nomeDoPet,
      conversationUrl: `${this.deps.baseDaWeb}/c/${token}` as AbsoluteUrl,
    };
  }
}

/** As regras de entrada que o schema do contrato não carrega. */
export function validarEnriquecimento(entrada: EntradaDeEnriquecimento): EnriquecimentoDoAchador {
  const erros: ProblemFieldError[] = [];
  const mudanca: { lat?: number; lon?: number; nome?: string; email?: string } = {};

  const local = entrada.location;
  if (local !== undefined) {
    const { lat, lon } = local;
    if (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      erros.push({ field: 'location', code: 'required', message: 'Envie latitude e longitude juntas.' });
    } else {
      mudanca.lat = lat;
      mudanca.lon = lon;
    }
  }

  const nome = entrada.finder_contact?.display_name?.trim();
  if (nome !== undefined && nome !== '') {
    if (redigirCanalMediado(nome).retirados.length > 0) {
      erros.push({
        field: 'finder_contact.display_name',
        code: 'contact_data',
        message: 'Use só o nome. Telefone e e-mail não aparecem para o tutor.',
      });
    } else {
      mudanca.nome = nome.slice(0, TAMANHO_MAXIMO_DO_NOME);
    }
  }

  const email = entrada.finder_contact?.email?.trim();
  if (email !== undefined && email !== '') mudanca.email = email;

  if (erros.length > 0) throw problemas.validacao(erros);
  return mudanca;
}
