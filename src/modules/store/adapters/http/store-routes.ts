/**
 * `GET /v1/store/items` — a secao `Loja`.
 *
 * ## Por que ela e PUBLICA, e por que isso diverge de `Perto`
 *
 * `GET /v1/directory/entries` exige conta, e o cabecalho dela explica o motivo:
 * `phone_e164` e `distance_m` sao o conteudo util do diretorio, e
 * `src/tools/portao-contrato-publico.ts` reprova os dois em qualquer operacao
 * alcancavel sem conta.
 *
 * **A Loja nao tem nenhum dos dois, e nao e por acaso.** Um item da vitrine e
 * um produto de um parceiro: titulo, resumo, imagem, preco de referencia e o
 * link publico da loja dele. Nao ha telefone, nao ha coordenada, nao ha
 * distancia, e nao ha UUID -- as duas tabelas tem `slug` como chave primaria.
 * Nada nesta resposta e privado de ninguem, porque tudo nela ja esta publicado
 * no site do parceiro.
 *
 * E o criterio 24 da BICHUS-185 pede exatamente isto, por extenso: a operacao
 * de leitura da Loja e publica, **sem ramo privilegiado**, com autorizacao na
 * clausula `WHERE` (ADR-0021) e sem UUID interno na saida (ADR-0010). A
 * BICHUS-189 repete: "a Loja e navegavel deslogado, entao a operacao nao exige
 * conta".
 *
 * **Copiar o `bearerAuth` de `Perto` seria copiar a consequencia sem a causa.**
 * Uma vitrine de produtos de parceiro atras de login e uma vitrine que a pessoa
 * so ve depois de criar conta, o que e o oposto do que uma vitrine faz.
 *
 * ## O teto e por `ip`, e e por isso que ele pode ser
 *
 * `Perto` conta por `account` porque exige conta, e o cabecalho dela registra
 * que `ip` seria armadilha no Brasil, onde o CGNAT das operadoras poe muita
 * gente atras de poucos enderecos. O argumento vale, e **aqui ele nao se
 * aplica da mesma forma**: sem conta nao existe `account` para contar, e um
 * teto por IP recusando demais numa vitrine publica custa uma tela que nao
 * carrega, e nao um vizinho barrado de um recurso que ele precisa.
 *
 * O numero e generoso pelo mesmo motivo: 300 por hora e muito para uma pessoa e
 * pouco para quem raspa, e uma aba que a pessoa reabre a cada troca de filtro
 * nao pode bater no teto em uso normal.
 *
 * **`ip` e dimensao generica** (`DIMENSOES_GENERICAS`), entao o registro a
 * resolve sozinho e esta rota nao precisa de resolvedor. Nenhuma dimensao nova
 * entra em `DIMENSOES_CONHECIDAS` por causa desta rota.
 *
 * ## A validacao de query nao esta aqui
 *
 * `vigiarParametrosDasRotas` instala `schema.querystring` a partir do contrato,
 * pelo `operationId`. Declarar um schema aqui criaria a segunda definicao, que
 * e a que diverge.
 *
 * ## O preco vencido nao e omitido aqui
 *
 * Ele e omitido em `projetarItem`, no dominio, junto da regra que decide o que
 * "vencido" quer dizer. Um `if` de vencimento nesta funcao separaria a regra do
 * lugar onde ela e testavel sem subir borda.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { projetarItem, type CategoriaDaVitrine } from '../../domain/item-da-vitrine.js';
import type { OrdemDaVitrine, StoreRepository } from '../../ports/store-repository.js';
import type { Clock } from '../../../../shared/ports/index.js';

/**
 * O teto e o do contrato, copiado dele e nao escolhido aqui.
 *
 * `expensive_query` e o efeito: a busca por texto varre titulo e resumo do
 * recorte inteiro e ainda o conta. Sem efeito declarado o teto seria opcional,
 * e vitrine sem teto e a porta da raspagem de catalogo de parceiro.
 *
 * **Um teto so, e uma dimensao so.** A armadilha medida em 22/09 -- dois tetos
 * na mesma dimensao com janelas diferentes caindo no mesmo balde -- esta
 * consertada em `montarChave`, que poe a janela na chave. Esta rota nao
 * depende do conserto porque nao declara dois tetos; `store-routes.test.ts`
 * guarda a regra mesmo assim, para o dia em que alguem declarar o segundo.
 */
export const rotaDaVitrine = defineRoute({
  operationId: 'listStoreItems',
  method: 'get',
  path: '/store/items',
  effects: ['expensive_query'],
  rateLimit: [{ dimension: ['ip'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

/** Os mesmos defaults que o contrato declara. Copiados de la, nao escolhidos aqui. */
const PAGINA_INICIAL = 1;
const TAMANHO_PADRAO = 20;
const ORDEM_PADRAO: OrdemDaVitrine = 'curadoria';

export interface DependenciasDasRotasDaVitrine {
  readonly vitrine: StoreRepository;
  readonly clock: Clock;
}

interface QueryDaVitrine {
  readonly q?: string;
  readonly category?: CategoriaDaVitrine;
  readonly sort?: OrdemDaVitrine;
  readonly page?: number;
  readonly limit?: number;
}

/**
 * O recorte que de fato valeu, para a tela poder escreve-lo.
 *
 * `scope: all` quando nada foi recortado, pela mesma razao de `Perto`: "nada
 * filtrado" e uma informacao, e um objeto vazio faria a tela adivinhar a
 * diferenca entre "sem filtro" e "filtro que nao coube na resposta".
 */
function recortesAplicados(query: QueryDaVitrine): Record<string, string> {
  const aplicados: Record<string, string> = {};
  if (query.q !== undefined && query.q.trim() !== '') aplicados['q'] = query.q.trim();
  if (query.category !== undefined) aplicados['category'] = query.category;
  if (Object.keys(aplicados).length === 0) aplicados['scope'] = 'all';
  return aplicados;
}

export function registrarRotasDaVitrine(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDaVitrine,
): void {
  registrarRota(
    app,
    rotaDaVitrine,
    // Sem resolvedor: `ip` e dimensao generica e o registro a resolve sozinho.
    // O tipo `ResolvedoresExigidos` so aceita o objeto vazio como AUSENTE aqui,
    // e essa e a prova em tempo de compilacao de que nenhuma dimensao nova
    // entrou em `DIMENSOES_CONHECIDAS` por causa desta rota.
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = (request.query ?? {}) as QueryDaVitrine;
      const page = query.page ?? PAGINA_INICIAL;
      const limit = query.limit ?? TAMANHO_PADRAO;
      const sort = query.sort ?? ORDEM_PADRAO;
      const termo = query.q?.trim();

      const pagina = await deps.vitrine.listarVitrine({
        ...(termo === undefined || termo === '' ? {} : { q: termo }),
        ...(query.category === undefined ? {} : { category: query.category }),
        sort,
        page,
        limit,
      });

      const agora = deps.clock.now();

      return reply.send({
        items: pagina.itens.map((item) => projetarItem(item, agora)),
        page,
        limit,
        total: pagina.total,
        // A ordem que de fato valeu. Aqui ela e sempre a pedida -- nao ha o
        // caso de `Perto`, em que a distancia indisponivel derruba a ordem para
        // nome. O campo existe assim mesmo porque a BARRA mostra a ordem REAL,
        // e uma tela que lesse a ordem do proprio estado local afirmaria a
        // ordem pedida sobre uma lista que o servidor pode ter ordenado de
        // outro jeito no dia em que essa possibilidade aparecer.
        effective_sort: sort,
        applied_filters: recortesAplicados(query),
      });
    },
  );
}
