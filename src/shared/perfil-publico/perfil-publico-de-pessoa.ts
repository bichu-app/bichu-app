/**
 * **O PERFIL PUBLICO DA PESSOA E VISIBILIDADE, E NAO CAPACIDADE.**
 *
 * O cliente separou as duas coisas em 02/11/2026, literal: *"nao tem relacao com
 * permissoes dentro do sistema, apenas de visibilidade"*. Ele exibe as
 * informacoes da pessoa, e o perfil e os posts dela podem aparecer para outras
 * pessoas.
 *
 * **Este arquivo existe para manter a separacao em pe.** A matriz de capacidades
 * esta em `src/shared/autorizacao/matriz-de-capacidades.ts`, e o perfil publico
 * **NAO esta nela** -- nenhuma `Capacidade` depende dele, nenhuma entrada de
 * `NIVEL_EXIGIDO` o menciona, e nada aqui importa daquele arquivo. Dois arquivos
 * sem aresta entre eles e o jeito de a confusao nao poder acontecer por descuido:
 * para transformar visibilidade em permissao alguem teria de escrever o `import`
 * a mao, e nesse momento estaria contrariando esta prosa e a decisao dela.
 *
 * O que ligar o perfil publico NAO faz: nao verifica a conta, nao a promove de
 * nivel, nao libera cadastrar evento, nao libera recomendar profissional, nao
 * libera nada. O que ele faz: deixa a pessoa ser vista.
 *
 * ## POR QUE ESTA REGRA MORA EM `shared/` E NAO EM `modules/people/domain/`
 *
 * Porque DOIS modulos precisam dela, e modulo nao conversa com modulo a nao ser
 * por porta (a regra de fronteira do ESLint reprova o `import` direto, e reprovou
 * a primeira versao deste arquivo). Quem ESCREVE o interruptor e `identity`, em
 * `updateMe`; quem LE a visibilidade e `people`, nas leituras de pessoa. Declarar
 * uma porta em cada lado para um predicado de uma linha daria duas definicoes de
 * "aparece", que e o defeito que este arquivo existe para nao ter.
 *
 * O precedente e `shared/db/canal-de-contato-confirmado.ts`: a regua de
 * "validado" mora em `shared/` exatamente por ser lida por cinco modulos, e tem
 * portao proprio guardando a unicidade dela.
 */

/** O que a pessoa tem, para a regra de visibilidade. */
export interface EstadoDoPerfilDePessoa {
  /**
   * `users.public_profile_enabled` (migracao `20261102000002`). **Desligado por
   * padrao, e a pessoa habilita** (cliente, 02/11/2026).
   */
  readonly perfilPublicoLigado: boolean;
  /**
   * Foto da PROPRIA pessoa em `ready`.
   *
   * **`processing` nao vale, e `rejected` nao vale** -- e a mesma regua de
   * `lostfound/domain/abertura-do-caso.ts`, escrita la por extenso: foto que
   * ainda nao serve a superficie publica nao e foto para quem olha. A consulta
   * que mede isto e a mesma de `kysely-busca-de-pessoas.ts`:
   * `catalog_images.purpose = 'user_photo' AND status = 'ready'`.
   */
  readonly temFotoPronta: boolean;
  /**
   * O apelido (`@`), ou `null`.
   *
   * Entra na regra porque `GET /v1/people/{handle}` e a unica rota que serve o
   * perfil de uma pessoa: sem apelido o perfil nao tem endereco, e aparecer numa
   * listagem sem endereco e oferecer um link que nao abre. E a mesma razao do
   * `CHECK users_perfil_publico_exige_apelido`, e aqui ela e medida em vez de
   * confiada -- o banco impede o estado, e este predicado nao depende de ele
   * impedir.
   */
  readonly apelido: string | null;
}

/** Por que a pessoa NAO aparece. `null` e "aparece". */
export type MotivoDeNaoAparecer =
  | 'perfil_publico_desligado'
  | 'sem_foto_pronta'
  | 'sem_apelido';

/**
 * **O que coloca a pessoa numa listagem de pessoas: FOTO + PERFIL PUBLICO**
 * (cliente, 02/11/2026, refinando a adesao que ele decidira antes).
 *
 * Devolve o motivo na ordem em que a tela deve resolve-lo -- o mesmo arranjo de
 * `bloqueiosParaAbrirCaso`, e pela mesma razao: mandar a pessoa tirar tres
 * pendencias de uma vez e pior do que mandar tirar a primeira.
 *
 * **Esta funcao NAO constroi a listagem.** A listagem por regiao e de outra
 * frente; o que mora aqui e a regra, para que exista UM lugar que a diz.
 */
export function motivoDeNaoAparecerNaListagem(
  estado: EstadoDoPerfilDePessoa,
): MotivoDeNaoAparecer | null {
  if (!estado.perfilPublicoLigado) return 'perfil_publico_desligado';
  if (!estado.temFotoPronta) return 'sem_foto_pronta';
  if (estado.apelido === null) return 'sem_apelido';
  return null;
}

/** Atalho do predicado, para quem so precisa do sim ou nao. */
export function apareceNaListagem(estado: EstadoDoPerfilDePessoa): boolean {
  return motivoDeNaoAparecerNaListagem(estado) === null;
}

/**
 * **Ligar o perfil publico exige apelido**, e o servidor recusa ANTES do banco.
 *
 * O `CHECK users_perfil_publico_exige_apelido` e a garantia; este predicado e a
 * mensagem. Sem ele a pessoa sem apelido receberia a violacao de restricao como
 * erro de servidor, em vez de um erro de campo que diz o que fazer.
 */
export function ligarPerfilPublicoExigeApelido(conta: { readonly handle: string | null }): boolean {
  return conta.handle === null;
}
