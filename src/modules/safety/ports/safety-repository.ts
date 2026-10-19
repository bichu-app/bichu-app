/**
 * A porta do módulo de bloqueio e denúncia.
 *
 * Duas famílias de operação, e a fronteira entre elas é o desenho da fatia:
 *
 * - **bloqueio** — ferramenta pessoal, efeito imediato, nenhum administrador;
 * - **denúncia** — pedido de atenção humana, que vai para a fila do painel.
 *
 * ## O que NÃO existe nesta porta, e a ausência é mecanismo
 *
 * Não há método de aviso, de notificação, de push nem de e-mail: **o denunciado
 * não é avisado**, e avisá-lo não é algo que alguém aqui esqueceu de não fazer —
 * é algo que não é exprimível por esta porta. Ver
 * `domain/o-denunciado-nao-e-avisado.ts`.
 *
 * Não há método de leitura de denúncia. Quem lê a fila é o painel, por
 * `fila_de_moderacao`, e nenhuma conta do app alcança denúncia nenhuma — nem a
 * própria. Uma leitura da própria denúncia é onde o prazo prometido nasceria.
 *
 * **Há, desde 19/10/2026, UMA leitura: `quemEuBloqueei`.** Ela é de bloqueio e
 * não de denúncia, e a diferença é a razão de ela ser aceitável aqui: bloquear
 * é ato de quem chama, sem administrador e sem revisão, e a lista é o registro
 * dos próprios atos. Denúncia continua sem leitura nenhuma.
 *
 * Não há `apagarDenuncia` nem `apagarBloqueio`: a denúncia é prova de que houve
 * resposta e vive 24 meses; o bloqueio se desfaz por `desbloquear`, que é outra
 * coisa.
 */
import type { Instant, UserId } from '../../../shared/types/brands.js';

/** O endereço público e opaco de uma pessoa (`users.public_ref`). */
export type RefPublicoDaPessoa = string;

/**
 * O desfecho de uma escrita que depende de o alvo existir **para quem chama**.
 *
 * `ausente` cobre os três casos de uma vez, e a fusão é a regra e não economia:
 * alvo que nunca existiu, alvo de conta desabilitada e **alvo que bloqueou quem
 * chama** devolvem o MESMO valor, porque devolvem o mesmo `404` (ADR-0021).
 * Distinguir seria o oráculo que conta a alguém que foi bloqueado.
 */
export type DesfechoDaEscrita = 'feito' | 'ausente' | 'eu_mesmo';

export interface EntradaDaDenuncia {
  readonly motivo: string;
  readonly relato: string | null;
}

/**
 * UMA LINHA DA LISTA DE QUEM EU BLOQUEEI.
 *
 * **Quatro campos, e o recorte foi decidido** (contrato: `BlockedPerson`). Os
 * três de pessoa são exatamente os três que a emenda 2 do ADR-0010 já libera a
 * qualquer chamador com conta em `getPersonProfile`; `bloqueadoEm` é o ato de
 * quem chama, e não dado da outra pessoa.
 *
 * **Não há foto**, e a ausência é a emenda 3 do ADR-0010 lida ao pé da letra: a
 * foto saiu para UMA superfície, a conversa mediada, e **só entre conexões
 * aceitas**. Bloqueado é o oposto de conexão aceita. Não há contagem de pet nem
 * de conexão: esta linha não é um perfil, e a pergunta dela é "qual das pessoas
 * que eu bloqueei é esta".
 */
export interface PessoaQueEuBloqueei {
  readonly publicRef: RefPublicoDaPessoa;
  /** Anulável: o bloqueio é endereçado por `public_ref`, não pelo apelido. */
  readonly handle: string | null;
  readonly displayName: string | null;
  /** `user_blocks.created_at` da linha de quem chama. */
  readonly bloqueadoEm: Instant;
}

/** Uma página da lista de quem eu bloqueei. */
export interface PaginaDeBloqueios {
  readonly items: readonly PessoaQueEuBloqueei[];
  readonly total: number;
}

export interface SafetyRepository {
  /**
   * **QUEM EU BLOQUEEI. Nunca quem me bloqueou.**
   *
   * A autorização é a igualdade `blocker_user_id = chamador` na cláusula
   * `WHERE` (ADR-0021), e é ela que faz a leitura ser ASSIMÉTRICA sobre um
   * predicado simétrico. `bloqueio_entre` **não serve aqui e não é chamada**:
   * ela é simétrica e devolveria as duas metades do par, e a segunda metade é o
   * oráculo *"ela te bloqueou"*.
   *
   * Ordem fixa, mais recentes primeiro. Sem busca e sem filtro: recorte por
   * pessoa aqui seria superfície de enumeração.
   */
  quemEuBloqueei(
    chamador: UserId,
    pagina: { readonly page: number; readonly limit: number },
  ): Promise<PaginaDeBloqueios>;

  /**
   * Bloqueia, **idempotente**: bloquear de novo não cria linha e não é erro.
   *
   * `ausente` quando o alvo não existe para quem chama — e aqui entra o caso em
   * que o alvo já bloqueou quem chama: a resposta é a mesma de pessoa
   * inexistente.
   */
  bloquear(chamador: UserId, alvo: RefPublicoDaPessoa, agora: Instant): Promise<DesfechoDaEscrita>;

  /** Desbloqueia, **idempotente**. Só quem bloqueou desfaz (igualdade no `WHERE`). */
  desbloquear(chamador: UserId, alvo: RefPublicoDaPessoa): Promise<DesfechoDaEscrita>;

  /**
   * Denuncia um PERFIL. Repetir soma em `repeat_count` e não cria linha.
   *
   * `eu_mesmo` quando o alvo é quem chama: o `400` com `code: own_profile`.
   */
  denunciarPerfil(
    chamador: UserId,
    alvo: RefPublicoDaPessoa,
    denuncia: EntradaDaDenuncia,
    agora: Instant,
  ): Promise<DesfechoDaEscrita>;

  /**
   * Denuncia uma FOTO, endereçada pela chave da derivada pública.
   *
   * `eu_mesmo` quando a foto é de quem chama — não há a quem pedir moderação da
   * própria foto: o caminho certo é removê-la.
   */
  denunciarFoto(
    chamador: UserId,
    chaveDaFoto: string,
    denuncia: EntradaDaDenuncia,
    agora: Instant,
  ): Promise<DesfechoDaEscrita>;

  /**
   * Denuncia uma PUBLICAÇÃO.
   *
   * **A tabela de publicações não existe nesta base** (é de outra fatia), então
   * esta escrita grava a denúncia com o endereço público recebido e **não
   * confere o alvo**. A conferência é uma linha quando a tabela pousar, e o que
   * falta ligar está no fim da migração `20261018000032`. Enquanto isso, a
   * escrita é real, os tetos valem e a ocultação imediata funciona.
   */
  denunciarPublicacao(
    chamador: UserId,
    refDaPublicacao: string,
    denuncia: EntradaDaDenuncia,
    agora: Instant,
  ): Promise<DesfechoDaEscrita>;
}
