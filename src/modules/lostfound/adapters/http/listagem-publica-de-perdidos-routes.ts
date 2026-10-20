/**
 * `GET /v1/public/lost-pets` (`listPublicLostPets`): a listagem pública de
 * perdidos — a tela em que o aplicativo ABRE.
 *
 * **Esta rota não existia.** A operação estava declarada no contrato desde o
 * início e era a última linha de `OPERACOES_AINDA_SEM_ROTA`; o aplicativo não
 * chamava nada e a aba `Pets` dizia "a lista está em construção". Nenhum campo,
 * nenhum parâmetro e nenhum teto deste arquivo foi escolhido aqui: todos são o
 * contrato copiado, e `rotas-registradas-contra-o-contrato.test.ts` compara
 * entrada por entrada.
 *
 * ## `security: []` — e isso é decisão do contrato, não desta rota
 *
 * A operação é **pública e deslogada**, com todas as letras na descrição dela.
 * É o que faz a vizinhança achar o pet: quem recebeu o link no grupo do bairro
 * não tem conta, e exigir uma seria fechar a porta pela qual o produto
 * funciona. Diferente de `getPublicLostCase`, aqui **nem há autenticação
 * opcional**: não existe campo na resposta que varie com quem pede
 * (`can_report_sighting` é da página do caso, não da lista), e ler o cabeçalho
 * para não usá-lo só criaria o 401 de token vencido numa rota que não precisa
 * de token.
 *
 * ## Os três tetos, e por que o terceiro existe
 *
 * Os dois primeiros são por `ip` (120/h e 600/24h) e o terceiro é por
 * `[ip, q]`, 30/h: busca por texto tem teto próprio porque ela é o que sai mais
 * caro — não há índice trigrama sobre `pets.name` (ver o adaptador de
 * persistência). `q` é dimensão genérica (`aplicacao-de-teto.ts`), então o
 * registro a resolve sozinho e não há resolvedor a escrever.
 *
 * `on_exceed: challenge` degenera em `deny_429` com `Retry-After` quando o
 * pedido não traz `X-Captcha-Token` (ADR-0020), que é a razão por que a operação
 * declara 429.
 *
 * ## `Cache-Control: no-store`, como nas outras duas públicas
 *
 * A resposta é uma lista de casos abertos que muda a cada caso aberto e a cada
 * caso fechado, e um cache compartilhado serviria a lista de ontem a quem está
 * procurando hoje. O cache de 60 s do ADR-0028 é do site, sobre o HTML que ele
 * monta, e não desta resposta.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { ListagemPublicaDePerdidosService } from '../../application/listagem-publica-de-perdidos.js';
import type { EspecieDoCaso, PorteDoCaso } from '../../ports/leitura-publica-do-caso.js';
import type { JanelaDePerdidos } from '../../ports/listagem-publica-de-perdidos.js';
import type { EstadoDoCasoPedido } from '../../application/listagem-publica-de-perdidos.js';

export const rotaDaListagemDePerdidos = defineRoute({
  operationId: 'listPublicLostPets',
  method: 'get',
  path: '/public/lost-pets',
  effects: ['expensive_query'],
  rateLimit: [
    { dimension: ['ip'], limit: 120, window: '1h', onExceed: 'challenge' },
    { dimension: ['ip'], limit: 600, window: '24h', onExceed: 'challenge' },
    { dimension: ['ip', 'q'], limit: 30, window: '1h', onExceed: 'challenge' },
  ],
});

export interface DependenciasDaListagemDePerdidos {
  readonly listagem: ListagemPublicaDePerdidosService;
}

/**
 * A query string, com os tipos do contrato. **Não há validação aqui**: o
 * esquema de `querystring` sai do contrato e é instalado pelo registro
 * (`validacao-de-parametros.ts`), e é ele que responde o 400 que a operação
 * declara. Reconferir aqui seria uma segunda definição dos limites.
 */
interface QueryDePerdidos {
  readonly case_state?: EstadoDoCasoPedido | undefined;
  readonly city?: string | undefined;
  readonly neighborhood?: string | undefined;
  readonly species?: EspecieDoCaso | undefined;
  readonly size?: PorteDoCaso | undefined;
  readonly period?: JanelaDePerdidos | undefined;
  readonly q?: string | undefined;
  readonly page?: number | undefined;
  readonly limit?: number | undefined;
}

export function registrarRotaDaListagemDePerdidos(
  app: RegistradorDeRotas,
  deps: DependenciasDaListagemDePerdidos,
): void {
  registrarRota(
    app,
    rotaDaListagemDePerdidos,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      void reply.header('X-Robots-Tag', 'noindex, nofollow');
      void reply.header('Referrer-Policy', 'no-referrer');
      void reply.header('Cache-Control', 'no-store');

      const query = (request.query ?? {}) as QueryDePerdidos;
      // `city` DEIXOU DE SER `required` NO CONTRATO em 19/10/2026 (decisão do
      // cliente), e o `?? ''` que morava aqui saiu junto. Ele existia "para o
      // tipo" enquanto a ausência era impossível; com a ausência possível ele
      // viraria o defeito que o comentário anterior descrevia como seguro:
      // `''` é uma cidade vazia, e cidade vazia compara contra
      // `texto_para_busca('')` e não casa com nada — a lista aberta
      // responderia uma página vazia.
      //
      // Passa `undefined` adiante, que é o que a camada de aplicação entende
      // como "ninguém pediu cidade". Continua não havendo validação aqui: o
      // `minLength: 2` é do contrato e quem responde o 400 de `city=` vazio é
      // o esquema de querystring, como antes.
      //
      // **Esta linha NÃO é a guarda contra a cidade vazia, e não se deve
      // confiar nela como tal.** MEDIDO em 19/10/2026: repondo o `?? ''` aqui,
      // a suíte continua VERDE, porque `aparado(pedido.city)` na camada de
      // aplicação transforma `''` em `undefined` logo depois. Quem sustenta a
      // isca é o `aparado`, e é lá que está a nota de desligamento. O `?? ''`
      // saiu por não ter mais razão de existir, não por ser o mecanismo.
      const corpo = await deps.listagem.pagina({
        // `case_state` chega conferido contra o `enum` do contrato por
        // `vigiarParametrosDasRotas`: valor fora de `[open, reunited]` e 400
        // antes desta linha, e nao um conjunto escolhido em silencio.
        caseState: query.case_state,
        city: query.city,
        neighborhood: query.neighborhood,
        species: query.species,
        size: query.size,
        period: query.period,
        q: query.q,
        page: query.page,
        limit: query.limit,
      });
      return reply.status(200).send(corpo);
    },
  );
}
