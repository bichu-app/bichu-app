/**
 * Porta de persistência do caso de perdido.
 *
 * Mesma decisão do ADR-0021 que vale nas tags, no cadastro e na mídia: **todo
 * método que toca um caso recebe o dono como argumento obrigatório**, e a busca
 * é vinculada. A consulta que devolveria o caso de outro tutor não existe aqui.
 *
 * Consequência intencional: caso de outro tutor responde **404, nunca 403**.
 * E há uma razão a mais neste módulo — um 403 confirmaria que aquele pet está
 * perdido, para quem não deveria saber.
 *
 * Nenhum método devolve coordenada para fora da visão do dono. A projeção
 * pública tem porta própria e carrega `share_token`, nunca `case_id`.
 */
import type { CaseId, Instant, PetId, UserId } from '../../../shared/types/brands.js';

export type StatusDoCaso = 'open' | 'closed_reunited' | 'closed_not_found' | 'closed_false_alarm';
export type DesfechoDoCaso = 'reunited' | 'not_found' | 'false_alarm';
export type CanalDoReencontro = 'tag_scan' | 'bichu_alert' | 'poster_or_link' | 'on_my_own' | 'other';

/** O que o serviço precisa saber ANTES de deixar abrir. Uma consulta só. */
export interface EstadoDoPetParaAbertura {
  readonly existeEhDoTutor: boolean;
  readonly temFotoPronta: boolean;
  readonly petJaTemCasoAberto: boolean;
  readonly casosAbertosDaConta: number;
  readonly temCanalVerificado: boolean;
}

export interface NovoCaso {
  readonly id: CaseId;
  readonly petId: PetId;
  readonly ownerUserId: UserId;
  readonly lastSeenAt: Instant;
  readonly lat: number | undefined;
  readonly lon: number | undefined;
  readonly city: string | undefined;
  readonly neighborhood: string | undefined;
  readonly state: string | undefined;
  readonly description: string | undefined;
  readonly shareToPublicList: boolean;
  /** Token opaco. A única chave do caso em superfície pública. */
  readonly shareToken: string;
}

export interface CasoGravado {
  readonly id: CaseId;
  readonly petId: PetId;
  readonly status: StatusDoCaso;
  readonly lastSeenAt: Date;
  /** Falso quando o caso nasceu só com área: a tela usa para explicar a ausência de alerta. */
  readonly hasLocation: boolean;
  readonly areaLabel: string | null;
  readonly description: string | null;
  readonly shareToken: string;
  readonly shareToPublicList: boolean;
  readonly openedAt: Date;
  readonly closedAt: Date | null;
  readonly closureOutcome: DesfechoDoCaso | null;
  readonly closureChannel: CanalDoReencontro | null;
  readonly closureNote: string | null;
}

export interface LostCaseRepository {
  /**
   * Tudo que decide a abertura, numa consulta só.
   *
   * Junto e não separado porque as quatro perguntas são feitas sempre, no mesmo
   * instante, e quatro idas ao banco no caminho de alguém em pânico com 11% de
   * bateria é latência que dá para não gastar.
   */
  estadoParaAbertura(pet: PetId, dono: UserId): Promise<EstadoDoPetParaAbertura>;

  /**
   * Abre o caso.
   *
   * **Pode recusar por corrida**, e é isso que o retorno `null` significa: o
   * índice único parcial do banco garante um caso aberto por pet, e duas
   * requisições simultâneas do mesmo tutor — que é exatamente o que a fila
   * offline produz quando o sinal volta — passariam as duas pela conferência
   * antes de qualquer uma gravar. Quem perde a corrida recebe `null` e vira
   * `pet-already-lost`, que é a verdade.
   */
  abrir(novo: NovoCaso): Promise<CasoGravado | null>;

  /** `null` quando não existe **ou** não é do chamador. São a mesma resposta. */
  buscarDoTutor(caso: CaseId, dono: UserId): Promise<CasoGravado | null>;

  /** `null` com o mesmo significado. Só encerra caso **aberto**. */
  encerrar(entrada: {
    readonly caso: CaseId;
    readonly dono: UserId;
    readonly desfecho: DesfechoDoCaso;
    readonly canal: CanalDoReencontro | undefined;
    readonly nota: string | undefined;
    readonly agora: Instant;
  }): Promise<CasoGravado | null>;
}
