/**
 * Porta da leitura pública do caso, pelo `share_token`.
 *
 * É a "porta própria" que o cabeçalho de `lost-case-repository.ts` anunciava: a
 * projeção pública não reaproveita `CasoGravado`, porque `CasoGravado` carrega
 * `id` e `petId`, e o jeito mais barato de um UUID interno não sair numa rota
 * pública é ele não chegar até a rota.
 *
 * **O que NÃO está aqui, e a ausência é a regra (ADR-0021, SEC-001, SEC-002):**
 * `case_id`, `pet_id`, `owner_user_id`, coordenada, estado (UF), telefone,
 * e-mail e endereço do tutor. Nenhum campo desta interface consegue carregar
 * dado de contato do tutor, porque nenhum deles vem de `users`.
 *
 * **O dono também não entra.** A única pergunta que a rota faz sobre ele é "quem
 * chama é o tutor?", e ela é respondida pelo banco, na consulta, com o chamador
 * como argumento. O resultado chega aqui como um booleano (`doChamador`); o
 * identificador do tutor não atravessa a aplicação, e portanto não tem como ser
 * serializado por engano numa resposta.
 */
import type { UserId } from '../../../shared/types/brands.js';

export type EspecieDoCaso = 'dog' | 'cat' | 'other';
export type PorteDoCaso = 'P' | 'M' | 'G' | 'GG';

/** O caso como a superfície pública pode vê-lo. Nada além disto sai do banco. */
export interface CasoPublico {
  readonly shareToken: string;
  /**
   * Falso quando o caso foi encerrado, ou quando o pet foi excluído, marcado
   * como falecido ou arquivado. Os quatro respondem a mesma coisa (410): a
   * superfície pública não distingue motivo, porque distinguir contaria a um
   * estranho o que aconteceu com o animal de outra pessoa.
   */
  readonly aberto: boolean;
  readonly petNome: string;
  readonly especie: EspecieDoCaso;
  readonly porte: PorteDoCaso;
  /** Rótulo da lista quando há código; o texto do tutor quando não há. */
  readonly racaRotulo: string | null;
  readonly corRotulo: string | null;
  readonly marcas: string | null;
  readonly cuidados: string | null;
  readonly descricao: string | null;
  /** `lost_cases.last_seen_at`: quando o animal sumiu, e não quando o caso abriu. */
  readonly vistoPorUltimoEm: Date;
  readonly cidade: string | null;
  readonly bairro: string | null;
  /** Chave da derivada `card` da foto principal pronta. Nula sem foto pronta. */
  readonly chaveDaFoto: string | null;
  /** O chamador autenticado é o tutor do caso. Sempre falso para anônimo. */
  readonly doChamador: boolean;
}

export interface LeituraPublicaDoCaso {
  /**
   * O caso do token, ou `undefined` quando o token não existe.
   *
   * `chamador` é opcional porque a operação é pública com autenticação
   * opcional. Ele entra na consulta só para calcular `doChamador`, e nunca
   * restringe o que volta: o token é a credencial.
   */
  porShareToken(shareToken: string, chamador: UserId | undefined): Promise<CasoPublico | undefined>;
}
