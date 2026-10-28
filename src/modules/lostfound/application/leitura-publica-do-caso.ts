/**
 * Leitura pública do caso: a página (`getPublicLostCase`) e o cartaz
 * (`getLostCasePoster`), as duas pelo `share_token`.
 *
 * A decisão aqui é 200 ou 410, e desde 28/10/2026 ela **não é mais a mesma nas
 * duas operações**: a página tem dois 410 e o cartaz tem um.
 *
 * - **`caso()`** separa UM motivo dos cinco: o caso que terminou porque o animal
 *   voltou responde `lost-case-reunited`, e todos os outros respondem o
 *   `lost-case-closed` de sempre, com o corpo de sempre. A autorização é do
 *   cliente (28/10/2026) e cobre só esse motivo; ver
 *   `problemas.casoPublicoReencontrado`.
 * - **`cartaz()`** continua com um 410 só para os cinco.
 *
 * Token desconhecido cai no ramo FUNDIDO nas duas, e esse é o caminho que mais
 * importa: ele não tem linha no banco, então não tem desfecho para consultar, e
 * nenhuma pergunta sobre reencontro chega a ser feita a respeito dele.
 *
 * O cartaz **não recebe o chamador**. O papel colado no poste é igual para
 * todo mundo, e a resposta dele não pode variar com o cabeçalho de quem pede,
 * senão um cache compartilhado serviria a versão de um para o outro.
 */
import { type AppError, problemas } from '../../../shared/http/errors.js';
import type { UserId } from '../../../shared/types/brands.js';
import type { components } from '../../../shared/types/generated/api.js';
import {
  cartazDoCaso,
  projecaoPublicaDoCaso,
  type BasesPublicas,
} from '../domain/projecao-publica-do-caso.js';
import type { CasoPublico, LeituraPublicaDoCaso } from '../ports/leitura-publica-do-caso.js';

type PublicLostCase = components['schemas']['PublicLostCase'];
type LostCasePoster = components['schemas']['LostCasePoster'];

export class LeituraPublicaDoCasoService {
  constructor(
    private readonly leitura: LeituraPublicaDoCaso,
    private readonly bases: BasesPublicas,
  ) {}

  async caso(shareToken: string, chamador: UserId | undefined): Promise<PublicLostCase> {
    const caso = await this.leitura.porShareToken(shareToken, chamador);
    if (caso === undefined || !caso.aberto) throw this.oQueAconteceu(caso);
    return projecaoPublicaDoCaso(caso, this.bases);
  }

  /**
   * Qual dos DOIS 410 sai, e por que só esta operação tem dois.
   *
   * **Reencontrado é o único motivo que se nomeia** (cliente, 28/10/2026). Os
   * outros quatro -- pet excluído, falecido, arquivado, e token desconhecido --
   * saem no `lost-case-closed` de sempre, com o corpo de sempre, e continuam
   * indistinguíveis entre si **e deste**.
   *
   * `caso === undefined` é o token desconhecido, e ele cai no ramo fundido sem
   * passar por nenhuma pergunta: não há linha para ter desfecho. É o caminho que
   * mais importa, porque dizer "já foi encontrado" a um token que nunca existiu
   * confirmaria que ele não existe, que é enumeração.
   */
  private oQueAconteceu(caso: CasoPublico | undefined): AppError {
    return caso?.reencontrado === true
      ? problemas.casoPublicoReencontrado()
      : problemas.casoPublicoEncerrado();
  }

  async cartaz(shareToken: string): Promise<LostCasePoster> {
    const caso = await this.abertoOuEncerrado(shareToken, undefined);
    return cartazDoCaso(caso, this.bases);
  }

  /**
   * A decisão do CARTAZ, e ela continua com **um** 410 para os cinco motivos.
   *
   * O cartaz não ganhou o tipo novo de propósito, e não por esquecimento:
   *
   * 1. **o pedido do cliente é a página**, e o contrato manda declarar toda
   *    resposta que a rota emite -- `getLostCasePoster` declara um 410 só, e
   *    emitir `lost-case-reunited` por aqui seria responder fora do contrato
   *    sem nenhum portão estático para acusar;
   * 2. **o cartaz é papel.** Ele existe para ser impresso e lido de longe; a
   *    tela de agradecimento é uma página que alguém abre e lê. Quem toca no
   *    link do cartaz chega em `/p/`, que é a operação que agradece.
   */
  private async abertoOuEncerrado(
    shareToken: string,
    chamador: UserId | undefined,
  ): Promise<CasoPublico> {
    const caso = await this.leitura.porShareToken(shareToken, chamador);
    if (caso === undefined || !caso.aberto) throw problemas.casoPublicoEncerrado();
    return caso;
  }
}
