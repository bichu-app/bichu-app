/**
 * "Contar mais" e a foto, para quem avisou sem conta (BICHUS-41, e as duas
 * operações que a emenda 3 do ADR-0017 põe na BICHUS-72).
 *
 * `PATCH /v1/finder/found-report` e `POST /v1/media/finder-photo-intents`. As
 * duas são autorizadas pelo token do aviso e **não têm id no caminho nem no
 * corpo**: o token diz de qual aviso se trata (SEC-001).
 *
 * ## Para onde vai cada campo
 *
 * - `message` vira **mensagem do achador na conversa mediada**, redigida pelo
 *   mesmo caminho de `postFinderMessage`. É o único lugar em que o tutor lê o
 *   que o achador escreve: o aviso não tem tela do lado dele. Gravar o recado
 *   só em `found_reports.notes` seria guardar um texto que ninguém lê, e em
 *   claro.
 * - `location` vai para `found_point`, e não sai de volta: a vista devolve
 *   `has_location`, nunca o ponto.
 * - `finder_contact` vai para `finder_display_name` e `finder_email`. O nome
 *   aparece ao tutor cortado no primeiro termo; o e-mail não aparece a ninguém.
 *   Nome com telefone, e-mail ou endereço dentro é recusado: o nome é mostrado
 *   ao tutor, e seria o jeito de o contato atravessar o canal mediado sem passar
 *   pela redação.
 * - `photo_upload_ref` liga ao aviso o upload daquela referência, e só se ele
 *   for **deste** aviso: a consulta leva o resumo do token no `WHERE`.
 *
 * ## Por que a validade do token é perguntada à conversa
 *
 * "Caso aberto mais 30 dias" depende do caso ligado à conversa, e a regra mora
 * em `messaging`. Ver `ports/conversa-do-achador.ts`.
 */
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

/** Cinco minutos para enviar, o mesmo número das outras intenções de foto. */
const VALIDADE_DA_AUTORIZACAO_EM_SEGUNDOS = 300;

/** O mesmo teto da coluna `finder_display_name` e do contrato. */
const TAMANHO_MAXIMO_DO_NOME = 60;

export interface EntradaDeEnriquecimento {
  readonly message?: string;
  readonly location?: { readonly lat?: number; readonly lon?: number; readonly accuracy_m?: number };
  readonly finder_contact?: { readonly display_name?: string; readonly email?: string };
  readonly photo_upload_ref?: string;
}

/** `FinderFoundReportView`. Sem id, sem dado do tutor, sem coordenada. */
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

  /**
   * `PATCH /v1/finder/found-report`.
   *
   * A validação vem antes de tudo, e a lista inteira de uma vez: a pessoa está
   * com o animal na mão e não pode descobrir um problema por requisição. Depois,
   * o token (401 recusado, 410 vencido ou conversa fechada), e só então as
   * escritas. O recado entra primeiro porque é o que o tutor lê; se a conversa
   * fechar entre as duas, o 410 sai antes de o aviso mudar.
   */
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
      // "Trocar um caractere leva a `validation-failed`; nao ha o que enumerar"
      // (`FinderUploadIntent.upload_ref`). A referência de outro aviso cai aqui
      // do mesmo jeito que a inventada.
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
    // A escrita não pegou: o aviso encerrou entre a leitura e a escrita.
    if (atualizado === undefined) throw problemas.avisoEncerrado();

    return this.vista(token, atualizado, recadoEntregue);
  }

  /**
   * `POST /v1/media/finder-photo-intents`. Mesmas recusas de token que
   * "Contar mais": 401 recusado, 410 vencido, 410 conversa ou aviso encerrado.
   */
  async autorizarFoto(
    token: string,
    contentType: string,
    byteSize: number,
  ): Promise<FotoDoAchadorAutorizada> {
    const { aviso, resumo } = await this.avisoAberto(token);

    // 415, como na foto do achador com conta: é o status que o contrato
    // declara para arquivo que não abrimos. O teto de 2 MB é do SEC-009.
    if (!ehTipoAceito(contentType)) throw problemas.tipoDeMidiaNaoAceito();
    if (byteSize <= 0 || byteSize > TETO_DE_BYTES_DA_FOTO_DO_ACHADO) {
      throw problemas.tipoDeMidiaNaoAceito();
    }

    // O teto de três, revalidado aqui, independente do da borda (ADR-0001):
    // basta um caminho interno novo para a borda ser contornada.
    const pedidas = await this.deps.repositorio.contarIntencoesDeFotoPeloTokenDoAchador(resumo);
    if (pedidas >= TETO_DE_FOTOS_POR_ACHADO) throw problemas.limiteSemReabertura();

    // 128 bits de CSPRNG, e não o UUIDv7 da linha: o `id` carrega o instante
    // de criação e não sai para quem não tem conta (SEC-001).
    const uploadRef = Buffer.from(this.deps.ids.random128()).toString('base64url');
    // Sem o id do aviso na chave: ela sai para o achador nos campos assinados
    // do envio (ver `chaveDaFotoDoAchadorSemConta`).
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

  /**
   * O token e o aviso, nas recusas que o contrato declara para as duas
   * operações:
   *
   * - `finder-link-invalid` (401), um corpo só, para o token que a conversa
   *   recusa e para o que não resolve aviso ou não confere em tempo constante;
   * - `FinderAccessEnded` (410, corpo fixo) para o token vencido, o MESMO
   *   corpo das quatro rotas da conversa;
   * - `conversation-closed` (410) para a conversa que não aceita mensagem e
   *   para o aviso encerrado.
   */
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
    // O recado que sai é sempre o redigido: o que acabou de entrar na conversa,
    // ou o do aviso original passado pela mesma redação. `notes` está em claro
    // no banco desde antes da conversa existir.
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

/**
 * As regras de entrada que o schema do contrato não carrega.
 *
 * A faixa da coordenada NÃO está aqui: `location` é `GeoPoint` no contrato,
 * com a faixa do território e `lat`/`lon` obrigatórias juntas, e é o schema
 * dele que a rota instala. Uma segunda faixa escrita aqui divergiria da do
 * contrato no primeiro ajuste. O que fica é a recusa da coordenada pela metade
 * para quem chamar o serviço sem passar pela rota: ponto sem as duas metades
 * não é gravado.
 */
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
