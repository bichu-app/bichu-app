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
import {
  temContatoNovoParaDivulgar,
  textoDoConsentimento,
  type ContatoParaDivulgar,
  type PedidoDeDivulgacaoDeContato,
} from '../domain/consentimento-de-contato.js';
import { TETO_DE_BYTES_DA_FOTO_DO_ACHADO, TETO_DE_FOTOS_POR_ACHADO } from './found-report-service.js';

const VALIDADE_DA_AUTORIZACAO_EM_SEGUNDOS = 300;

const TAMANHO_MAXIMO_DO_NOME = 60;

/** O mesmo `pattern` de `phone_e164` no contrato, e o de `professionals`. */
const TELEFONE_E164_BR = /^\+55\d{10,11}$/;

export interface EntradaDeEnriquecimento {
  readonly message?: string;
  readonly location?: { readonly lat?: number; readonly lon?: number; readonly accuracy_m?: number };
  readonly finder_contact?: {
    readonly display_name?: string;
    readonly email?: string;
    readonly phone_e164?: string;
    readonly share_consent?: { readonly accepted?: boolean; readonly consent_version?: string };
  };
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
  /**
   * Quando o contato foi divulgado NESTA requisição, ou `null` quando ela não
   * divulgou nada. Ver a descrição de `contact_shared_at` no contrato.
   */
  readonly contactSharedAt: Date | null;
}

/**
 * O que a entrada produz: o que vai para o banco, e — **só quando houve o ato
 * explícito de consentir** — o que vai ser divulgado.
 *
 * `divulgacao` é `undefined` na ausência do ato, e não `{ consentiu: false }`: não
 * há bandeira neste caminho, e por isso não há bandeira para esquecer. O código
 * que divulga exige este objeto, e ele só existe depois de a versão do texto ter
 * resolvido para um texto nosso.
 */
export interface EntradaValidada {
  readonly mudanca: EnriquecimentoDoAchador;
  readonly divulgacao: PedidoDeDivulgacaoDeContato | undefined;
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
    const { mudanca, divulgacao } = validarEnriquecimento(entrada);

    const { aviso, resumo } = await this.avisoAberto(token);

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

    /*
     * A DIVULGAÇÃO VEM POR ÚLTIMO, E A ORDEM É O QUE PROTEGE A DIREÇÃO DA FALHA.
     *
     * Se a divulgação falhar, o enriquecimento já está gravado e NADA do contato
     * saiu. Na ordem inversa, uma falha depois da divulgação entregaria o contato
     * e perderia o resto — e entre perder o aviso e entregar contato sem registrar
     * o aviso, o segundo é o erro que não dá para desfazer.
     *
     * O contato divulgado é o DESTE corpo, e não o acumulado no banco: é o que o
     * texto do consentimento diz — *"os dados de contato que eu preenchi aqui"*.
     */
    const contatoDivulgadoEm =
      divulgacao === undefined
        ? null
        : (
            await this.deps.conversa.divulgarContatoComConsentimento(
              token,
              { ...divulgacao, foundReportId: aviso.id, nomeDoPet: atualizado.nomeDoPet },
              origem,
            )
          ).consentidoEm;

    return this.vista(token, atualizado, recadoEntregue, contatoDivulgadoEm);
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
    contactSharedAt: Date | null,
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
      contactSharedAt,
    };
  }
}

/**
 * As regras de entrada que o schema do contrato não carrega.
 *
 * ## A TRAVA É CONDICIONAL, E O PADRÃO CONTINUA SENDO RECUSAR
 *
 * O que mudou em 03/11/2026 não foi a trava: foi o surgimento de um caminho que
 * **prova** o consentimento. `redigirCanalMediado` continua valendo sobre
 * `display_name`, e continua recusando — agora com a frase certa, porque existe
 * campo próprio para telefone e e-mail.
 *
 * O telefone só é aceito COM o ato de consentir. Sem ele, é `400`, e não um campo
 * aceito e descartado: campo aceito e descartado em silêncio é a forma mais
 * discreta de um vazamento nascer, porque ninguém mede o que não reclama.
 *
 * E a liberação não é um booleano: é a resolução da versão para um texto NOSSO.
 * Versão que não resolve não produz `divulgacao`, e sem `divulgacao` não há o que
 * passar para `divulgarContatoComConsentimento` — a ausência de prova recusa por
 * construção, e não por disciplina de quem lê este arquivo depois.
 */
export function validarEnriquecimento(entrada: EntradaDeEnriquecimento): EntradaValidada {
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
        message:
          'Use só o nome aqui. Para o tutor receber seu telefone ou e-mail, preencha os ' +
          'campos próprios e aceite compartilhar.',
      });
    } else {
      mudanca.nome = nome.slice(0, TAMANHO_MAXIMO_DO_NOME);
    }
  }

  const email = entrada.finder_contact?.email?.trim();
  if (email !== undefined && email !== '') mudanca.email = email;

  const telefone = entrada.finder_contact?.phone_e164?.trim();
  if (telefone !== undefined && telefone !== '' && !TELEFONE_E164_BR.test(telefone)) {
    erros.push({
      field: 'finder_contact.phone_e164',
      code: 'format',
      message: 'Informe o telefone com DDD, no formato +55 e só dígitos.',
    });
  }

  const consentimento = entrada.finder_contact?.share_consent;
  const contato: ContatoParaDivulgar = {
    nome: mudanca.nome,
    email: mudanca.email,
    telefone: telefone === undefined || telefone === '' ? undefined : telefone,
  };

  let divulgacao: PedidoDeDivulgacaoDeContato | undefined;
  if (consentimento === undefined) {
    // SEM O ATO: o telefone não tem para onde ir, e por isso não entra.
    if (contato.telefone !== undefined) {
      erros.push({
        field: 'finder_contact.share_consent',
        code: 'required',
        message:
          'Para o tutor receber seu telefone, aceite compartilhar seus dados com ele. ' +
          'Sem isso o telefone não é guardado nem mostrado.',
      });
    }
  } else if (consentimento.accepted !== true) {
    // O contrato já recusa `false`; isto é a rede embaixo dele, e existe porque
    // `accepted` chegar sem ser `true` nunca pode cair no ramo que libera.
    erros.push({
      field: 'finder_contact.share_consent.accepted',
      code: 'invalid',
      message: 'Para não compartilhar, não envie o consentimento.',
    });
  } else {
    const versao = consentimento.consent_version?.trim() ?? '';
    const texto = textoDoConsentimento(versao);
    if (texto === undefined) {
      erros.push({
        field: 'finder_contact.share_consent.consent_version',
        code: 'unknown',
        message: 'Recarregue a página e aceite de novo: este aviso de consentimento mudou.',
      });
    } else if (!temContatoNovoParaDivulgar(contato)) {
      erros.push({
        field: 'finder_contact',
        code: 'required',
        message: 'Informe seu e-mail ou seu telefone para o tutor conseguir falar com você.',
      });
    } else {
      divulgacao = {
        contato,
        versaoDoConsentimento: versao,
        textoDoConsentimento: texto,
        nomeDoPet: null,
      };
    }
  }

  if (erros.length > 0) throw problemas.validacao(erros);
  return { mudanca, divulgacao };
}
