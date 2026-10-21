/**
 * Porta de persistência do achado.
 *
 * ADR-0021 aplicado do mesmo jeito que em `media-repository.ts`: **todo método
 * que toca um achado de alguém recebe o dono como argumento obrigatório**, e a
 * busca é vinculada. A consulta que devolveria o achado de outra conta não existe
 * do outro lado desta porta.
 *
 * A exceção é nomeada e é uma só: `paresParaCruzar`, que roda dentro do
 * cruzamento. Ela não atende ninguém — quem a chama é o processamento do achado,
 * e ela devolve atributos e distância, nunca dado de contato nem identificador de
 * tutor. Está separada justamente para que o teste de autorização possa exigir o
 * predicado do dono em todo o resto sem precisar abrir uma exceção na lista;
 * exceção em lista de verificação é por onde a próxima entra.
 */
import type { FoundReportId, CaseId, Instant, ObjectKey, UserId } from '../../../shared/types/brands.js';
import type { AchadoGravado } from '../domain/registro-de-achado.js';
import type { Especie, Par, Porte, Sexo, Sugestao } from '../domain/cruzamento.js';

export interface NovoAchado {
  readonly id: FoundReportId;
  readonly reporterUserId: UserId;
  readonly especie: Especie;
  readonly porte: Porte;
  readonly sexo: Sexo | null;
  readonly racaCodigo: string | null;
  readonly racaTextoLivre: string | null;
  readonly versaoDosDadosDeReferencia: string | null;
  readonly corPrimariaCodigo: string | null;
  readonly achadoEm: Instant;
  /** Ausentes juntos ou presentes juntos. O `anyOf` do contrato. */
  readonly lat: number | undefined;
  readonly lon: number | undefined;
  readonly cidade: string | null;
  readonly bairro: string | null;
  readonly uf: string | null;
  readonly observacao: string | null;
  /** Vem do `share_token` (critério 10). `null` quando o achado é avulso puro. */
  readonly caseId: CaseId | null;
  readonly retencaoAte: Instant;
}

export interface Pagina<T> {
  readonly itens: readonly T[];
  readonly proximoCursor: string | null;
}

export interface Enriquecimento {
  readonly observacao?: string;
  readonly lat?: number;
  readonly lon?: number;
}

export interface NovaIntencaoDeFotoDoAchado {
  readonly id: string;
  readonly userId: UserId;
  readonly foundReportId: FoundReportId;
  readonly objectKey: ObjectKey;
  readonly declaredType: string;
  readonly maxBytes: number;
  readonly expiresAt: Date;
}

/**
 * O aviso como o achador SEM CONTA o alcança: pelo resumo do token (BICHUS-41).
 *
 * `id` fica do lado de dentro, para a chave de objeto da foto; a vista que sai
 * (`FinderFoundReportView`) não tem id nenhum (SEC-001).
 */
export interface AvisoDoAchador {
  readonly id: FoundReportId;
  readonly status: 'open' | 'matched' | 'closed';
  readonly achadoEm: Date;
  readonly temFoto: boolean;
  readonly temPonto: boolean;
  /** `found_reports.notes`, como a pessoa digitou no aviso. Redigido na borda de saída. */
  readonly recado: string | null;
  readonly nomeDoPet: string | null;
  /** O resumo gravado, para a comparação em tempo constante no serviço. */
  readonly resumoDoToken: Uint8Array;
}

/** O que "Contar mais" grava no aviso. O recado não: ele vai para a conversa. */
export interface EnriquecimentoDoAchador {
  readonly lat?: number;
  readonly lon?: number;
  readonly nome?: string;
  readonly email?: string;
  /** O id interno do upload, já resolvido a partir da referência opaca. */
  readonly fotoUploadId?: string;
}

export interface NovaIntencaoDeFotoDoAchadorSemConta {
  readonly id: string;
  /** A referência opaca que o achador recebe e devolve. Nunca o `id`. */
  readonly uploadRef: string;
  readonly foundReportId: FoundReportId;
  readonly objectKey: ObjectKey;
  readonly declaredType: string;
  readonly maxBytes: number;
  readonly expiresAt: Date;
}

export interface FoundReportRepository {
  /** `null` quando o caso do `share_token` não existe ou não está aberto. */
  casoAbertoPorShareToken(token: string): Promise<CaseId | null>;

  criar(novo: NovoAchado): Promise<AchadoGravado>;

  /** `null` quando não existe **ou não é do chamador**. Nunca 403 (ADR-0021). */
  buscarDoRelator(achado: FoundReportId, dono: UserId): Promise<AchadoGravado | null>;

  /**
   * O aviso, para quem pode ANEXAR FOTO a ele: o relator **ou o tutor do pet**.
   *
   * ## Por que esta autorização é mais larga que a de [buscarDoRelator]
   *
   * A conversa mediada é SIMÉTRICA: os dois lados mandam foto, e nenhum depende
   * de o outro ter mandado primeiro (BICHUS-35, critério 9). O tutor do pet não
   * é o relator do aviso — quem relata é quem achou o animal —, então com
   * [buscarDoRelator] ele recebia 404 e **não tinha nenhum caminho** para obter
   * intenção de foto. A simetria estava no contrato e não existia no código.
   *
   * ## O que ela NÃO amplia
   *
   * Só a foto. `GET`, `PATCH` e `statusDoRelator` continuam em
   * [buscarDoRelator]: o aviso é a declaração de quem achou o animal, e o tutor
   * não edita o que outra pessoa declarou.
   *
   * ## Sem travessia de fronteira
   *
   * "Quem é o tutor" se responde com `found_reports.pet_id` ->
   * `pets.owner_user_id`, dentro do próprio módulo `found`. A conversa não
   * entra na consulta, e este módulo continua sem importar nada de
   * `messaging`.
   *
   * `null` quando não existe, não é de nenhum dos dois, ou o aviso é avulso e
   * o chamador não é o relator. Nunca 403 (ADR-0021).
   */
  avisoParaAnexarFoto(achado: FoundReportId, chamador: UserId): Promise<AchadoGravado | null>;

  listarDoRelator(dono: UserId, limite: number, cursor: string | null): Promise<Pagina<AchadoGravado>>;

  /**
   * `null` quando não existe, não é do chamador **ou já está encerrado** — e os
   * três são a mesma ausência aqui. Quem distingue "encerrado" de "não é seu" é o
   * serviço, e só para o achado que ele já provou ser do chamador.
   */
  enriquecer(
    achado: FoundReportId,
    dono: UserId,
    mudanca: Enriquecimento,
    agora: Instant,
  ): Promise<AchadoGravado | null>;

  /** `open`, `matched` ou `closed`; `null` quando não existe ou não é do chamador. */
  statusDoRelator(achado: FoundReportId, dono: UserId): Promise<AchadoGravado['status'] | null>;

  /**
   * Quantas intenções de foto este achado já teve, **na vida inteira**.
   *
   * É o teto de 3 do SEC-009 e do `x-rate-limit` de
   * `createFoundReportPhotoUploadIntent`. Conta intenção e não foto confirmada
   * de propósito: cada intenção assina uma autorização de escrita que não se
   * desfaz dentro da validade, então três intenções já são três escritas
   * possíveis no bucket, tenham elas sido confirmadas ou não.
   *
   * ## O TETO É COMPARTILHADO entre o tutor e o achador, e isto é consequência
   *
   * A contagem é do **aviso**, as duas espécies juntas
   * (`found_report_photo` e `finder_photo`) — ela sempre foi, porque o
   * `WHERE` nunca filtrou por `upload_intents.user_id` (ver o cabeçalho do
   * construtor). Até a BICHUS-35 isso não tinha consequência visível, porque só
   * o relator conseguia pedir intenção. Agora que o tutor também pede, as três
   * fotos do aviso são três no total: se o achador gastar as três, **o tutor não
   * manda nenhuma**, e vice-versa.
   *
   * **O número não foi mudado** (continua 3, SEC-009). A consequência está
   * registrada aqui porque ela é de produto e não de implementação: se três
   * compartilhadas se mostrarem poucas, quem decide o número é o cliente.
   *
   * `dono` é o relator **ou o tutor do pet**, o mesmo predicado de
   * [avisoParaAnexarFoto]: a autorização continua no `WHERE`.
   */
  contarIntencoesDeFoto(achado: FoundReportId, dono: UserId): Promise<number>;

  registrarIntencaoDeFoto(nova: NovaIntencaoDeFotoDoAchado): Promise<void>;

  /**
   * Os pares que valem a pena pontuar: este achado contra cada caso aberto que
   * o filtro grosseiro deixou passar.
   *
   * O filtro grosseiro (espécie, janela de tempo, distância) acontece **no
   * banco**, porque é lá que estão o índice GiST e `ST_Distance`. O que volta é o
   * que a seção 4.10 precisa para pontuar, com a distância **por par** — o mesmo
   * achado fica a 800 m de um caso e a 12 km de outro.
   *
   * **Não devolve dado de contato, nome de pet nem identificador de tutor.** O
   * cruzamento não precisa de nada disso, e o que não chega não vaza.
   */
  paresParaCruzar(achado: FoundReportId): Promise<readonly Par[]>;

  /**
   * Grava as sugestões. **Toda linha nasce `suggested`.**
   *
   * A porta não aceita status como argumento, e isso é o desenho: não existe
   * chamada possível daqui que confirme uma correspondência. A confirmação é de
   * quem decide com uma pessoa do outro lado, e o banco cobra o autor e o
   * instante (`match_candidates_decisao_tem_autor`).
   */
  sugerirCorrespondencias(sugestoes: readonly Sugestao[]): Promise<number>;

  // -------------------------------------------------------------------------
  // O achador sem conta (BICHUS-41). O "dono" é o RESUMO do token, e ele entra
  // no `WHERE` de cada consulta, como `reporter_user_id` entra nas de cima.
  // -------------------------------------------------------------------------

  /** `undefined` quando o resumo não é de aviso nenhum. */
  avisoPeloTokenDoAchador(resumo: Uint8Array): Promise<AvisoDoAchador | undefined>;

  /**
   * `undefined` quando o resumo não é de aviso nenhum **ou o aviso já encerrou**.
   * Quem distingue os dois é o serviço, que já leu o aviso antes.
   */
  enriquecerPeloTokenDoAchador(
    resumo: Uint8Array,
    mudanca: EnriquecimentoDoAchador,
    agora: Instant,
  ): Promise<AvisoDoAchador | undefined>;

  /** O upload da referência opaca, e só se ele for DESTE aviso. */
  intencaoDeFotoDoAchadorPelaReferencia(
    resumo: Uint8Array,
    uploadRef: string,
  ): Promise<string | undefined>;

  /** Quantas intenções de foto o aviso deste token já teve, na vida inteira (SEC-009). */
  contarIntencoesDeFotoPeloTokenDoAchador(resumo: Uint8Array): Promise<number>;

  registrarIntencaoDeFotoDoAchadorSemConta(nova: NovaIntencaoDeFotoDoAchadorSemConta): Promise<void>;
}
