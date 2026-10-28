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
  /**
   * O caso terminou **porque o animal voltou**, e o pet continua de pé.
   *
   * ## ESTE É O ÚNICO DOS CINCO MOTIVOS DE 410 QUE SE ABRE, e quem autorizou
   *
   * Cliente, 28/10/2026, sobre quem abre o cartaz de um pet que já foi achado:
   * *"crie uma página padrão, agradecendo a preocupação do usuário e avisando-o
   * que aquele pet já foi encontrado, que ele não precisa mais se preocupar."*
   *
   * [aberto] funde cinco situações num 410 só, e a fusão é de privacidade. Esta
   * autorização abre **um** dos cinco. Os outros quatro -- pet excluído,
   * falecido, arquivado, e token desconhecido -- continuam indistinguíveis
   * entre si e deste, e é por isso que este campo é um booleano de um motivo só
   * em vez de um `motivo: 'encerrado' | 'excluido' | ...`: um enum de motivo
   * publicaria os outros quatro no primeiro `switch` que alguém escrevesse.
   *
   * ## ELE EXIGE OS TRÊS, E NÃO SÓ O DESFECHO DO CASO
   *
   * `lost_cases.status = 'closed_reunited'` **mais** pet não excluído **mais**
   * pet fora de `deceased`/`archived`. Os dois últimos não são zelo: um pet que
   * voltou para casa e depois morreu tem o caso gravado como `closed_reunited`,
   * e dizer "ele já foi encontrado, não se preocupe" a quem abre esse cartaz
   * seria mentira cruel. Sem os três predicados o campo diria do CASO o que a
   * pessoa vai ler sobre o ANIMAL.
   *
   * ## NÃO É EXPOSIÇÃO NOVA DE CLASSE
   *
   * "Este pet voltou" já é fato legível **sem conta nenhuma** desde 20/10/2026:
   * é o selo `found_by_community` de `listPublicLostPets`, decidido pelo cliente
   * e escrito na Emenda 4 do ADR-0010. Aqui a mesma frase chega a quem tem o
   * `share_token` na mão, que é um público mais estreito que a lista pública.
   *
   * **Sem janela de 30 dias, e a diferença é proposital.** A janela do selo
   * governa se um pet APARECE numa lista que estranhos navegam sem link; ela
   * expira para o animal sair de circulação. Aqui a pessoa já tem o link
   * impresso, e o cartaz no poste dura mais de 30 dias -- aplicar a janela
   * devolveria a mensagem fundida justamente a quem o cliente reclamou três
   * vezes que estava recebendo a página errada.
   *
   * **Nada além disto sai.** Não há data de encerramento, não há quem achou, e
   * não há `pet_id`, `case_id` nem `user_id` (ADR-0010, item 6). O fato é
   * "este caso terminou porque o animal voltou", e o booleano é do tamanho dele.
   */
  readonly reencontrado: boolean;
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
