/** As operações do achado avulso (BICHUS-35). */
import { problemas } from '../../../shared/http/errors.js';
import type { Clock, IdGenerator, JobQueue } from '../../../shared/ports/index.js';
import type { FoundReportId, UserId } from '../../../shared/types/brands.js';
import type { AutorizacaoDeEnvio, ObjectStorage } from '../../media/ports/object-storage.js';
import { chaveDaFotoDoAchado, ehTipoAceito, TETO_DE_BYTES } from '../../media/ports/chaves-de-objeto.js';
import {
  recusasDoRegistro,
  retencaoAPartirDe,
  temCoordenada,
  type AchadoAvulso,
  type AchadoGravado,
} from '../domain/registro-de-achado.js';
import { cruzar, vinculoDireto } from '../domain/cruzamento.js';
import type { Enriquecimento, FoundReportRepository, Pagina } from '../ports/found-report-repository.js';

/** SEC-009: três fotos no aviso do achador, para sempre. */
export const TETO_DE_FOTOS_POR_ACHADO = 3;

/** O teto do envio da foto do achador: **5 MB, o mesmo de todos os caminhos**. */
export const TETO_DE_BYTES_DA_FOTO_DO_ACHADO = TETO_DE_BYTES;

/** Cinco minutos para enviar. */
const VALIDADE_DA_AUTORIZACAO_EM_SEGUNDOS = 300;

/** O teto do contrato, que o servidor impõe em vez de confiar no cliente. */
export const LIMITE_MAXIMO_DA_PAGINA = 50;
export const LIMITE_PADRAO_DA_PAGINA = 20;

export interface DependenciasDeAchado {
  readonly repositorio: FoundReportRepository;
  readonly armazenamento: ObjectStorage;
  readonly fila: JobQueue;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export interface EnvioDeFotoAutorizado {
  readonly uploadId: string;
  readonly autorizacao: AutorizacaoDeEnvio;
}

export class FoundReportService {
  constructor(private readonly deps: DependenciasDeAchado) {}

  /** Registra o achado avulso. */
  async registrar(entrada: AchadoAvulso, relator: UserId): Promise<AchadoGravado> {
    const agora = this.deps.clock.now();
    const recusas = recusasDoRegistro(entrada, agora);
    if (recusas.length > 0) throw problemas.validacao(recusas);

    const caso =
      entrada.shareToken === undefined || entrada.shareToken.trim() === ''
        ? null
        : await this.deps.repositorio.casoAbertoPorShareToken(entrada.shareToken.trim());

    const id = this.deps.ids.uuidv7() as FoundReportId;
    const achado = await this.deps.repositorio.criar({
      id,
      reporterUserId: relator,
      especie: entrada.especie,
      porte: entrada.porte,
      sexo: entrada.sexo ?? null,
      racaCodigo: textoOuNulo(entrada.racaCodigo),
      racaTextoLivre: textoOuNulo(entrada.racaTextoLivre),
      versaoDosDadosDeReferencia: textoOuNulo(entrada.versaoDosDadosDeReferencia),
      corPrimariaCodigo: textoOuNulo(entrada.corPrimariaCodigo),
      achadoEm: entrada.achadoEm,
      lat: temCoordenada(entrada.onde) ? entrada.onde.lat : undefined,
      lon: temCoordenada(entrada.onde) ? entrada.onde.lon : undefined,
      cidade: textoOuNulo(entrada.onde.city),
      bairro: textoOuNulo(entrada.onde.neighborhood),
      uf: textoOuNulo(entrada.onde.state),
      observacao: textoOuNulo(entrada.observacao),
      caseId: caso,
      retencaoAte: retencaoAPartirDe(agora),
    });

    if (caso !== null) {
      await this.deps.repositorio.sugerirCorrespondencias([vinculoDireto(id, caso)]);
    } else {
      await this.deps.fila.enqueue('match.recompute', { foundReportId: id });
    }

    return achado;
  }

  /** O cruzamento por atributos, como o consumidor de `match.recompute` o executa. */
  async cruzarAchado(achado: FoundReportId): Promise<number> {
    const pares = await this.deps.repositorio.paresParaCruzar(achado);
    if (pares.length === 0) return 0;
    return this.deps.repositorio.sugerirCorrespondencias(cruzar(pares));
  }

  async buscar(achado: FoundReportId, dono: UserId): Promise<AchadoGravado> {
    const encontrado = await this.deps.repositorio.buscarDoRelator(achado, dono);
    if (encontrado === null) throw problemas.naoEncontrado();
    return encontrado;
  }

  async listarDoRelator(dono: UserId, limite: number, cursor: string | null): Promise<Pagina<AchadoGravado>> {
    return this.deps.repositorio.listarDoRelator(dono, limiteDaPagina(limite), cursor);
  }

  /** Acrescenta detalhes ao aviso, para quem tem conta. */
  async enriquecer(achado: FoundReportId, dono: UserId, mudanca: Enriquecimento): Promise<AchadoGravado> {
    const atualizado = await this.deps.repositorio.enriquecer(
      achado,
      dono,
      mudanca,
      this.deps.clock.now(),
    );
    if (atualizado !== null) return atualizado;

    const status = await this.deps.repositorio.statusDoRelator(achado, dono);
    if (status === 'closed') throw problemas.avisoEncerrado();
    throw problemas.naoEncontrado();
  }

  /** As credenciais de upload da foto do achador. */
  async autorizarFotoDoAchado(
    achado: FoundReportId,
    dono: UserId,
    contentType: string,
    byteSize: number,
  ): Promise<EnvioDeFotoAutorizado> {
    if (!ehTipoAceito(contentType)) throw problemas.tipoDeMidiaNaoAceito();
    if (byteSize <= 0 || byteSize > TETO_DE_BYTES_DA_FOTO_DO_ACHADO) {
      throw problemas.tipoDeMidiaNaoAceito();
    }

    if ((await this.deps.repositorio.avisoParaAnexarFoto(achado, dono)) === null) {
      throw problemas.naoEncontrado();
    }

    if ((await this.deps.repositorio.contarIntencoesDeFoto(achado, dono)) >= TETO_DE_FOTOS_POR_ACHADO) {
      throw problemas.limiteSemReabertura();
    }

    const uploadId = this.deps.ids.uuidv7();
    const chave = chaveDaFotoDoAchado(achado, this.deps.ids.random128());

    const autorizacao = await this.deps.armazenamento.createUploadIntent({
      classe: 'privado',
      chave,
      contentType,
      maxBytes: TETO_DE_BYTES_DA_FOTO_DO_ACHADO,
      validadeEmSegundos: VALIDADE_DA_AUTORIZACAO_EM_SEGUNDOS,
    });

    await this.deps.repositorio.registrarIntencaoDeFoto({
      id: uploadId,
      userId: dono,
      foundReportId: achado,
      objectKey: chave,
      declaredType: contentType,
      maxBytes: TETO_DE_BYTES_DA_FOTO_DO_ACHADO,
      expiresAt: autorizacao.expiraEm,
    });

    return { uploadId, autorizacao };
  }

}

function textoOuNulo(valor: string | undefined): string | null {
  if (valor === undefined) return null;
  const limpo = valor.trim();
  return limpo === '' ? null : limpo;
}

/** O limite da página, imposto pelo servidor. */
export function limiteDaPagina(pedido: number | undefined): number {
  if (pedido === undefined || !Number.isInteger(pedido) || pedido < 1) return LIMITE_PADRAO_DA_PAGINA;
  return Math.min(pedido, LIMITE_MAXIMO_DA_PAGINA);
}
