/**
 * Leitura pública do caso: a página (`getPublicLostCase`) e o cartaz
 * (`getLostCasePoster`), as duas pelo `share_token`.
 *
 * A única decisão aqui é 200 ou 410, e ela é a mesma nas duas operações: o caso
 * existe e está aberto, ou o link não leva mais a lugar nenhum. Token
 * desconhecido cai no mesmo 410, com o mesmo corpo (ver
 * `problemas.casoPublicoEncerrado`).
 *
 * O cartaz **não recebe o chamador**. O papel colado no poste é igual para
 * todo mundo, e a resposta dele não pode variar com o cabeçalho de quem pede,
 * senão um cache compartilhado serviria a versão de um para o outro.
 */
import { problemas } from '../../../shared/http/errors.js';
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
    const caso = await this.abertoOuEncerrado(shareToken, chamador);
    return projecaoPublicaDoCaso(caso, this.bases);
  }

  async cartaz(shareToken: string): Promise<LostCasePoster> {
    const caso = await this.abertoOuEncerrado(shareToken, undefined);
    return cartazDoCaso(caso, this.bases);
  }

  private async abertoOuEncerrado(
    shareToken: string,
    chamador: UserId | undefined,
  ): Promise<CasoPublico> {
    const caso = await this.leitura.porShareToken(shareToken, chamador);
    if (caso === undefined || !caso.aberto) throw problemas.casoPublicoEncerrado();
    return caso;
  }
}
