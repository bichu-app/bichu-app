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

  /** Qual dos DOIS 410 sai, e por que só esta operação tem dois. */
  private oQueAconteceu(caso: CasoPublico | undefined): AppError {
    return caso?.reencontrado === true
      ? problemas.casoPublicoReencontrado()
      : problemas.casoPublicoEncerrado();
  }

  async cartaz(shareToken: string): Promise<LostCasePoster> {
    const caso = await this.abertoOuEncerrado(shareToken, undefined);
    return cartazDoCaso(caso, this.bases);
  }

  /** A decisão do CARTAZ, e ela continua com **um** 410 para os cinco motivos. */
  private async abertoOuEncerrado(
    shareToken: string,
    chamador: UserId | undefined,
  ): Promise<CasoPublico> {
    const caso = await this.leitura.porShareToken(shareToken, chamador);
    if (caso === undefined || !caso.aberto) throw problemas.casoPublicoEncerrado();
    return caso;
  }
}
