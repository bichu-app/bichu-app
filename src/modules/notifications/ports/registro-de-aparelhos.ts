import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { Aparelho, RegistroDeAparelho } from '../domain/aparelho.js';
import type { TokenDeAparelho } from './push-sender.js';

/** O que o registro devolve, e por que não é só o aparelho. */
export interface ResultadoDoRegistro {
  readonly aparelho: Aparelho;
  /** A conta anterior do mesmo token do FCM, ou `null` quando não havia. */
  readonly reivindicadoDe: UserId | null;
}

export interface RegistroDeAparelhos {
  /** Registra ou atualiza o aparelho. */
  registrar(
    dono: UserId,
    entrada: RegistroDeAparelho,
    agora: Instant,
  ): Promise<ResultadoDoRegistro>;

  /** Os aparelhos do dono, para o Perfil (critério 5). */
  listarDoDono(dono: UserId): Promise<readonly Aparelho[]>;

  /** Apaga o aparelho do dono. */
  revogarDoDono(dono: UserId, aparelhoId: string): Promise<Aparelho | null>;

  /** Apaga **TODOS** os aparelhos do dono. */
  revogarTodosDoDono(dono: UserId): Promise<number>;

  /** Apaga o aparelho pelo token que o FCM recusou (critério 4). */
  revogarPorToken(token: TokenDeAparelho): Promise<Aparelho | null>;

  /**
   * Das contas candidatas, quais têm **ao menos um** aparelho com `push_permission =
   * granted` e token — os critérios 1 e 4 do ADR-0006, e só eles.
   */
  contasAlcancaveisPorPush(candidatos: readonly UserId[]): Promise<ReadonlySet<UserId>>;

  /** O token para onde mandar, resolvido **no instante do envio**. */
  enderecoDeEnvio(aparelhoId: string): Promise<TokenDeAparelho | null>;
}
