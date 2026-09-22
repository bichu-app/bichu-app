/**
 * As operações do achado avulso (BICHUS-35).
 *
 * ## O que este serviço nunca faz
 *
 * Ele **não confirma correspondência**. `registrar` termina com sugestões
 * gravadas em `suggested` e nada mais: nenhum tutor é avisado de que "achamos o
 * seu pet", nenhuma conversa abre, nenhum caso encerra. A seção 4.10 é explícita,
 * e o critério 7 da história também — o resultado do cruzamento "nunca é aplicado
 * sozinho".
 *
 * ## O cruzamento roda aqui e não num job, e isso é uma divergência declarada
 *
 * A seção 4.10 diz "é um job na fila, nunca síncrono na requisição", e o motivo
 * que ela dá é bom: "o tutor em pânico não espera cruzamento". Só que o tutor em
 * pânico é quem abre o CASO; quem chama esta rota é a pessoa que achou o animal, e
 * ela já está numa tela de confirmação.
 *
 * Mesmo assim o cruzamento **é enfileirado**, e não executado aqui. Duas razões,
 * e a segunda é a que decide: (1) a regra está escrita e não é minha para mudar;
 * (2) o cruzamento ao abrir um caso — o outro sentido, retroativo sobre 14 dias —
 * é caro de verdade, e ter os dois sentidos no mesmo lugar é o que permite ao
 * `match.recompute` ser um consumidor só. O que roda síncrono é apenas o vínculo
 * direto do critério 10, que não é cruzamento: é uma linha com score 1,0 que a
 * pessoa acabou de afirmar, e adiá-la faria a tela dela mentir.
 */
import { problemas } from '../../../shared/http/errors.js';
import type { Clock, IdGenerator, JobQueue } from '../../../shared/ports/index.js';
import type { FoundReportId, UserId } from '../../../shared/types/brands.js';
import type { AutorizacaoDeEnvio, ObjectStorage } from '../../media/ports/object-storage.js';
import { chaveDaFotoDoAchado, ehTipoAceito } from '../../media/ports/chaves-de-objeto.js';
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

/** SEC-009: 2 MB por foto do achador, e não os 10 MB da foto de pet. */
export const TETO_DE_BYTES_DA_FOTO_DO_ACHADO = 2 * 1024 * 1024;

/** Cinco minutos para enviar. O mesmo número da foto de pet (BICHUS-87, critério 22). */
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

  /**
   * Registra o achado avulso.
   *
   * A ordem importa e é esta: valida, resolve o `share_token`, grava, e só então
   * decide o que fazer com o cruzamento. Gravar antes de enfileirar é o que faz
   * um erro na fila não custar o relato da pessoa — o achado sem correspondência
   * ainda vale, e vale por 30 dias.
   */
  async registrar(entrada: AchadoAvulso, relator: UserId): Promise<AchadoGravado> {
    const agora = this.deps.clock.now();
    const recusas = recusasDoRegistro(entrada, agora);
    if (recusas.length > 0) throw problemas.validacao(recusas);

    // Critério 10. O token opaco é a ÚNICA chave do caso em superfície pública, e
    // ele é resolvido aqui, contra um caso **aberto** — um token de caso já
    // encerrado não vincula nada, e tratá-lo como ausente é o certo: a pessoa
    // chegou por um push que envelheceu, e o achado dela continua valendo como
    // achado avulso.
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
      // Vínculo direto: score 1,0, sem cruzamento — e ainda assim `suggested`.
      await this.deps.repositorio.sugerirCorrespondencias([vinculoDireto(id, caso)]);
    } else {
      await this.deps.fila.enqueue('match.recompute', { foundReportId: id });
    }

    return achado;
  }

  /**
   * O cruzamento por atributos, como o consumidor de `match.recompute` o executa.
   *
   * Vive aqui e não no worker porque a regra é de domínio e precisa ser testável
   * sem fila: o worker que a chamar é dez linhas de reserva e confirmação.
   *
   * Devolve quantas sugestões foram gravadas. **Nenhuma delas confirma nada.**
   */
  async cruzarAchado(achado: FoundReportId): Promise<number> {
    const pares = await this.deps.repositorio.paresParaCruzar(achado);
    if (pares.length === 0) return 0;
    return this.deps.repositorio.sugerirCorrespondencias(cruzar(pares));
  }

  async buscar(achado: FoundReportId, dono: UserId): Promise<AchadoGravado> {
    const encontrado = await this.deps.repositorio.buscarDoRelator(achado, dono);
    // 404 e não 403, inclusive para o achado de outra conta (ADR-0021). Aqui isso
    // vale duas vezes: um 403 confirmaria que aquele identificador é um achado de
    // verdade, e um achado carrega onde um animal foi visto.
    if (encontrado === null) throw problemas.naoEncontrado();
    return encontrado;
  }

  async listarDoRelator(dono: UserId, limite: number, cursor: string | null): Promise<Pagina<AchadoGravado>> {
    return this.deps.repositorio.listarDoRelator(dono, limiteDaPagina(limite), cursor);
  }

  /**
   * Acrescenta detalhes ao aviso, para quem tem conta.
   *
   * Autorizado por **propriedade**, e a propriedade está na cláusula `WHERE` do
   * adaptador. Quem avisou sem conta usa a rota do achador, que não tem id no
   * caminho (SEC-001).
   */
  async enriquecer(achado: FoundReportId, dono: UserId, mudanca: Enriquecimento): Promise<AchadoGravado> {
    const atualizado = await this.deps.repositorio.enriquecer(
      achado,
      dono,
      mudanca,
      this.deps.clock.now(),
    );
    if (atualizado !== null) return atualizado;

    // A escrita não pegou. Duas causas, e elas têm respostas diferentes no
    // contrato: 410 quando o achado é do chamador e já encerrou, 404 no resto.
    // A segunda pergunta só é feita para quem já provou ser dono — perguntar
    // antes transformaria a rota num oráculo de existência.
    const status = await this.deps.repositorio.statusDoRelator(achado, dono);
    if (status === 'closed') throw problemas.avisoEncerrado();
    throw problemas.naoEncontrado();
  }

  /**
   * As credenciais de upload da foto do achador.
   *
   * O caminho é o mesmo da foto de pet, e a diferença está em três números que
   * são do SEC-009 e não desta implementação: bucket privado, 2 MB e três por
   * aviso. A foto **nunca aparece em rota pública** — ela é vista pelo tutor
   * dentro da conversa mediada, e só (critério 9).
   */
  async autorizarFotoDoAchado(
    achado: FoundReportId,
    dono: UserId,
    contentType: string,
    byteSize: number,
  ): Promise<EnvioDeFotoAutorizado> {
    // 415 e não 400: o contrato declara este status para tipo não aceito, e a
    // tela tem texto próprio.
    if (!ehTipoAceito(contentType)) throw problemas.tipoDeMidiaNaoAceito();
    if (byteSize <= 0 || byteSize > TETO_DE_BYTES_DA_FOTO_DO_ACHADO) {
      throw problemas.tipoDeMidiaNaoAceito();
    }

    // A autorização só sai para achado do próprio chamador. 404, nunca 403.
    if ((await this.deps.repositorio.buscarDoRelator(achado, dono)) === null) {
      throw problemas.naoEncontrado();
    }

    // O teto de três, revalidado aqui. Ele já é contado pelo teto de chamada na
    // borda, e a repetição é deliberada (ADR-0001): basta um job, uma rota nova
    // ou um caminho interno para a borda ser contornada, e aí o limite vira
    // decoração. As duas contagens são independentes e a mais restritiva vence.
    if ((await this.deps.repositorio.contarIntencoesDeFoto(achado, dono)) >= TETO_DE_FOTOS_POR_ACHADO) {
      throw problemas.limiteDeChamadas(VALIDADE_DA_AUTORIZACAO_EM_SEGUNDOS);
    }

    const uploadId = this.deps.ids.uuidv7();
    // 128 bits de CSPRNG na chave, como no original da foto de pet: o `uploadId`
    // é UUIDv7, carrega carimbo de tempo, e não serve de chave.
    const chave = chaveDaFotoDoAchado(achado, this.deps.ids.random128());

    const autorizacao = await this.deps.armazenamento.createUploadIntent({
      classe: 'privado',
      chave,
      contentType,
      // O teto vai para a POLÍTICA assinada, e não fica só aqui: o backend não vê
      // os bytes, então recusar depois seria recusar o que já foi gravado.
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

/**
 * O limite da página, imposto pelo servidor.
 *
 * Coleção sem paginação é incidente esperando a base crescer, e um `limit=10000`
 * vindo do cliente é a mesma coisa com mais passos. O teto é o do contrato.
 */
export function limiteDaPagina(pedido: number | undefined): number {
  if (pedido === undefined || !Number.isInteger(pedido) || pedido < 1) return LIMITE_PADRAO_DA_PAGINA;
  return Math.min(pedido, LIMITE_MAXIMO_DA_PAGINA);
}
