/**
 * A porta que responde UMA pergunta: **a pagina publica existe de verdade?**
 *
 * Uma leitura e nada mais. Nao ha escrita por aqui de proposito, pela mesma
 * razao de `app-release/ports/politica-de-versao.ts`: o interruptor e trocado a
 * mao, no banco, por quem publica o site (ver o cabecalho da migracao
 * `20261020000010`). Uma rota de escrita no backoffice faria o interruptor
 * depender de o painel estar de pe no momento em que alguem precisa apaga-lo.
 *
 * ====================================================================
 * SOMENTE `true` EXPLICITO ACENDE -- E ISSO E O DESENHO INTEIRO
 * ====================================================================
 *
 * [DisponibilidadeDaPagina.estaPublicada] devolve `true` **unicamente** quando o
 * banco respondeu uma linha com `is_published` valendo `true`. Todo o resto
 * devolve `false`, e "todo o resto" e uma lista fechada:
 *
 * 1. linha com `is_published` falso;
 * 2. linha ausente (ninguem escreveu sobre esta pagina);
 * 3. **banco fora, consulta estourando** -- a leitura e embrulhada, e a
 *    excecao vira `false`;
 * 4. coluna devolvendo coisa que nao e booleano (tipo trocado por migracao
 *    futura).
 *
 * ## Por que embrulhar a falha aqui, quando a tabela irma NAO embrulha
 *
 * `version-status-routes.ts` recusa, com todas as letras, devolver `supported`
 * fabricado sobre um banco fora: *"um 200 `supported` fabricado sobre um banco
 * fora seria o servidor AFIRMANDO ter consultado a politica quando nao
 * consultou"*. A recusa esta certa **la**, e o contrario esta certo **aqui**,
 * pela assimetria que `notifications/domain/conteudo-do-push.ts` ja escreveu:
 *
 * - La o valor fabricado seria o PERMISSIVO (`supported` = deixa usar). Fingir
 *   permissao e afirmar o que nao se mediu.
 * - Aqui o valor fabricado e o RESTRITIVO (`false` = nao oferece). Isso nao
 *   afirma que a pagina existe -- e recusar-se a afirmar que existe, que e o
 *   unico estado honesto de quem nao conseguiu perguntar.
 *
 * E o preco de errar e assimetrico do mesmo jeito. Esconder a acao e visivel e
 * reversivel: a pessoa nao compartilha agora e compartilha depois. Oferece-la
 * sobre uma pagina que nao existe poe um link morto num grupo de bairro -- e
 * aquela mensagem saiu do nosso dominio no instante do envio, como o push:
 * nenhum `UPDATE` a apaga do celular de quarenta vizinhos.
 *
 * **A terceira razao e que a falha aqui nao pode derrubar o resto.** Esta porta
 * e lida na montagem de `LostCase`, que e a resposta de `getLostCase`, de
 * `closeLostCase` e de `reopenLostCase`. Se a excecao subisse, uma tabela de
 * configuracao inalcancavel passaria a impedir o tutor de dizer **"encontrei meu
 * pet"** -- e encerrar o caso e a melhor noticia do produto. Um interruptor de
 * compartilhamento nao tem o direito de ficar no caminho dela.
 */

/**
 * As paginas publicas do site sobre as quais existe interruptor.
 *
 * **A chave e do SITE inteiro, e nao de `lostfound`.** A porta nasceu aqui
 * porque a primeira pagina com interruptor era a do caso, e continua aqui para
 * nao haver duas definicoes do mesmo conceito; `network_event` (21/10/2026) e a
 * primeira chave de outro modulo, e quem a le e
 * `network/adapters/http/network-routes.ts`. O dominio fechado desta uniao tem
 * que casar com o `CHECK` de `site_page_availability.page` (migracoes
 * `20261020000010` e `20261020000017`): valor que exista aqui e nao la nao e
 * recusado pelo tipo e sim pelo banco, na forma de uma leitura que nunca acha
 * linha -- ou seja, escondido para sempre, calado.
 */
export type PaginaPublica = 'lost_case' | 'poster' | 'network_event';

export const PAGINAS_PUBLICAS: readonly PaginaPublica[] = [
  'lost_case',
  'poster',
  'network_event',
];

export interface DisponibilidadeDaPagina {
  /**
   * A pagina existe e serve 200 com as marcas de Open Graph?
   *
   * **Nunca lanca.** Os quatro desfechos do cabecalho devolvem `false`.
   */
  estaPublicada(pagina: PaginaPublica): Promise<boolean>;
}

/**
 * A disponibilidade de quem nao tem banco: tudo escondido.
 *
 * Existe para o teste e para o caminho em que o chamador nao tem o que injetar.
 * **Nao e um atalho de producao**: ela nunca acende, e por isso nao ha como
 * esquecer de ligar o adaptador de verdade e descobrir o compartilhamento
 * ligado sozinho -- o esquecimento falha para o lado escondido.
 */
export const paginaNenhumaPublicada: DisponibilidadeDaPagina = {
  // `Promise.resolve` e nao `async () =>`: nao ha nada a esperar, e o lint
  // cobra isso (`require-await`). O tipo devolvido e o mesmo.
  estaPublicada: () => Promise.resolve(false),
};
