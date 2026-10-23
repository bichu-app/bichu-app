/**
 * A rota da **busca de pessoas**: `GET /people` (decisão do cliente de
 * 20/10/2026).
 *
 * ## Esta rota é a reversão de uma ausência declarada
 *
 * O cabeçalho de `person-profile-routes.ts` dizia, até 20/10/2026: *"Não existe
 * `GET /people`, não existe `/people/search` (...) Coleção de pessoas é
 * enumeração, e é o dano que o desenho desta frente recusa por escrito."* O
 * cliente pediu a busca, **com freios que ele mesmo listou**, e aquele cabeçalho
 * foi corrigido em vez de deixado contradizendo este arquivo.
 *
 * `GET /people` e não `/people/search`: a busca é a leitura da coleção com um
 * filtro, e `search` como segmento faria parecer que existe uma coleção
 * navegável **e** uma busca. Existe só a busca — sem `q` a resposta é vazia.
 *
 * ## Por que a etiqueta é `people` e não `connections`
 *
 * Pela mesma razão que `getPersonProfile`:
 * `conexao-nao-expoe-lista-nem-identificador.test.ts` cobra que `connections`
 * tenha **exatamente cinco** operações, e cobra com razão — é esse número que
 * impede uma sexta operação de conexão entrar sem alguém ver. Pôr esta aqui
 * faria um portão certo reprovar o desenho certo, e a saída é etiqueta própria,
 * não afrouxar o número.
 *
 * ## Os freios, e onde cada um mora
 *
 * ## O piso NÃO é cobrado nesta borda, e isso é o contrato falando
 *
 * `api/openapi.yaml` declara `minLength: 3` em `q` dizendo, por escrito, que
 * ele **não é recusado com 400 quando menor** — a resposta é lista vazia,
 * porque a tela chama a busca a cada tecla e um erro vermelho no meio de
 * alguém escrevendo `maria` seria o produto discutindo com quem digita. O
 * `minLength` ali documenta o piso do índice trigrama para quem lê a
 * especificação, e nada mais.
 *
 * Até 21/10/2026 o código discordava do contrato: `vigiarParametrosDasRotas`
 * instalava aquele `minLength` no validador do Fastify e `q=ma` respondia
 * `400 validation-failed` com `{"field":"q","code":"minLength"}`, medido em
 * homologação pelo corpo da resposta. O contrato venceu — ele é a fonte única
 * que manda em quatro aplicações, e um cliente escrito contra ele espera 200.
 * O conserto é a chave `x-nao-recusado-na-borda: [minLength]` no parâmetro, que
 * `contract.ts` honra tirando a palavra do esquema de borda, e **só** dela.
 *
 * **Nenhum dos três freios do cliente afrouxou**: a busca continua exigindo
 * conta, abaixo de três caracteres continua não havendo consulta ao banco
 * (`termoDeBusca` devolve `undefined` e a porta nem é chamada), e campo vazio
 * continua não listando ninguém. Mudou a FORMA da recusa, e nenhuma pessoa a
 * mais sai por causa disso — medido em
 * `o-piso-da-busca-nao-recusa-na-borda.test.ts`. O `maxLength: 40` continua
 * recusando com 400: termo de 41 caracteres é pedido malformado, não
 * incompleto.
 *
 * | Freio | Onde |
 * |---|---|
 * | 3 caracteres, campo vazio não lista | `termoDeBusca` + `BuscaDePessoas` |
 * | teto por conta | `x-rate-limit` abaixo, aplicado por `registrar-rota.ts` |
 * | nome e 2 contagens, sem foto | `PessoaEncontrada` e `comoRespostaDaPessoa` |
 * | quem não existe para quem busca | a cláusula `WHERE` (ADR-0021) |
 *
 * ## O que este arquivo NÃO decide
 *
 * **Quem aparece é decidido na cláusula `WHERE`** (ADR-0021), em
 * `kysely-busca-de-pessoas.ts`: não há um `if` nesta borda que filtre resultado,
 * e não há caminho que produza 403. Conta desabilitada, par bloqueado em
 * qualquer direção, perfil denunciado por quem busca, apelido de pet e apelido
 * reservado simplesmente **não entram na lista** — e a lista vazia funde "não
 * casou ninguém" com "só casaria gente que não existe para você".
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { problemas } from '../../../../shared/http/errors.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import type { AbsoluteUrl, UserId } from '../../../../shared/types/brands.js';
import type {
  BuscaDePessoas,
  PessoaEncontradaComEstado,
} from '../../application/busca-de-pessoas.js';

/**
 * **Os tetos são os do contrato, COPIADOS de lá**, e são DOIS — o mesmo arranjo
 * de `listDirectoryEntries`, pela mesma razão:
 *
 * - **120/h por conta** é o teto da rota, que vale para quem abre a aba;
 * - **60/h por conta na dimensão `[account, q]`** é o **teto de consultas** que
 *   o cliente pediu, e ele é o freio de varredura do catálogo.
 *
 * **`q` marca PRESENÇA de busca, nunca o termo digitado**, e esse detalhe é o
 * que faz o teto servir para alguma coisa. O raciocínio inteiro está em
 * `DIMENSOES_CONHECIDAS` de `aplicacao-de-teto.ts`; o resumo é: com o termo no
 * balde, cada termo novo abriria um balde novo com um uso, e **quem enumera
 * varia o termo a cada chamada por definição** — nunca encostaria no teto. O
 * único uso que um teto por termo limitaria é repetir a mesma busca, que é o que
 * mais parece com gente.
 *
 * Por conta e não por IP porque a rota exige conta, então `account` existe e é
 * exato — e o CGNAT das operadoras brasileiras faria um teto por IP pegar
 * vizinho inocente e errar quem raspa.
 *
 * **`expensive_query`**: é `LIKE '%termo%'` sobre duas colunas com índice
 * trigrama, e abaixo do piso de três caracteres o índice deixa de existir. Com
 * efeito não vazio, `defineRoute` torna a ausência de `rateLimit` erro de
 * compilação (ADR-0016) — que é exatamente o que se quer numa rota de busca.
 */
export const rotaDaBuscaDePessoas = defineRoute({
  operationId: 'searchPeople',
  method: 'get',
  path: '/people',
  effects: ['expensive_query'],
  rateLimit: [
    { dimension: ['account'], limit: 120, window: '1h', onExceed: 'deny_429' },
    { dimension: ['account', 'q'], limit: 60, window: '1h', onExceed: 'deny_429' },
  ],
});

const PAGINA_INICIAL = 1;
const TAMANHO_PADRAO = 20;

/** Pessoa é dado de pessoa: nada daqui entra em cache compartilhado. */
const SEM_CACHE = 'private, no-store';

export interface Autenticador {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDeBusca {
  readonly busca: BuscaDePessoas;
  readonly autenticador: Autenticador;
  /** A raiz publica da midia, de onde a URL da foto e montada. */
  readonly baseDeMidia: AbsoluteUrl;
}

interface QueryDaBusca {
  readonly q?: string;
  readonly page?: number;
  readonly limit?: number;
}

function tokenDoCabecalho(request: FastifyRequest): string {
  const cabecalho = request.headers.authorization;
  const prefixo = 'Bearer ';
  if (cabecalho === undefined || !cabecalho.startsWith(prefixo)) throw problemas.naoAutenticado();
  return cabecalho.slice(prefixo.length);
}

/**
 * Quem chama, **resolvido UMA vez por requisição**.
 *
 * `memoDaRequisicao` não é economia de estilo: esta rota pede a conta **duas**
 * vezes — o resolvedor do teto por `account` precisa dela antes do manipulador,
 * e o manipulador precisa dela para a consulta. Sem a memória, cada busca
 * validaria o token duas vezes. É a mesma forma que `person-profile-routes.ts`
 * usa, pelo mesmo motivo.
 */
async function chamador(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeBusca,
): Promise<UserId> {
  return memoDaRequisicao(request, 'people:busca:chamador', async () => {
    const { userId } = await deps.autenticador.autenticar(tokenDoCabecalho(request));
    return userId;
  });
}

/**
 * Uma pessoa como `PersonSearchResult` a declara: **seis campos**.
 *
 * **`connection_state` ENTROU EM 22/10/2026, e este cabeçalho dizia o
 * contrário**: ele explicava a ausência com *"o estado é por par, e vinte
 * estados por requisição é o material de que uma lista de conexões é feita do
 * lado de fora"*. Aquele argumento caiu no dia em que o cliente autorizou a
 * lista das próprias conexões — com `listMyConnections`, o dono já obtém o
 * conjunto por uma rota legítima, e devolvê-lo recortado na busca **dele** não
 * entrega nada novo. É o conserto do defeito que ele relatou: *"após eu ter
 * aceito, ainda aparece para solicitar conexão a um usuário que ja foi
 * adicionado e aceito"*.
 *
 * **`none` é a ausência, e `declined` não existe**: a projeção é `estadoNoApp`,
 * a mesma do perfil, e a recusa continua silenciosa.
 *
 * **COM `photo_icon_url` desde 21/10/2026**, e este parágrafo dizia o
 * contrário: ele explicava a ausência pela emenda 5 item 2 do ADR-0010. **O
 * cliente emendou a própria decisão** — *"o resultado tras foto sim, para
 * identificar usuarios com nomes parecidos."* A derivada é a `thumb`, a menor
 * que existe, e os três freios que tornam isso defensável (conta obrigatória,
 * piso de três caracteres, campo vazio não lista ninguém) estão no cabeçalho da
 * porta. **Sem `public_ref`**: ele existe em `PersonProfile`
 * porque aquela tela hospeda denunciar e bloquear, e esta não hospeda nenhuma
 * das três. **Sem UUID** (ADR-0010 item 6). **Sem `connection_ref`**: o `ref` da
 * aresta é o que deixa desfazer, e desfazer mora no perfil — não numa lista.
 *
 * **Exportada para a isca**, como `comoResposta` do perfil: nenhum portão deste
 * repositório confere o CORPO da resposta, então a única forma de medir o
 * conjunto de chaves em suíte é chamar a projeção.
 */
export function comoRespostaDaPessoa(
  pessoa: PessoaEncontradaComEstado,
  baseDeMidia: AbsoluteUrl,
): Record<string, unknown> {
  return {
    handle: pessoa.handle,
    display_name: pessoa.displayName,
    pets_count: pessoa.petsCount,
    connections_count: pessoa.connectionsCount,
    // O ESTADO DO PAR (22/10/2026). **Derivado no servidor e nunca recebido de
    // quem chama**, como em `PersonProfile`. `none` e a ausencia de aresta que
    // se projete, e ela funde os tres motivos de propósito.
    connection_state: pessoa.estadoDaConexao,
    // A URL e montada AQUI, na borda, com o dominio de midia do ambiente -- o
    // banco guarda chave de objeto e nunca endereco (§11.1 proibicao 9). Mesma
    // divisao da conversa mediada e do autor de publicacao.
    //
    // **A chave vem SEMPRE, com nulo quando nao ha foto pronta.** Chave que
    // aparece e desaparece faria o cliente distinguir ausencia de nulo sem que a
    // diferenca significasse algo.
    photo_icon_url:
      pessoa.photoKey === null
        ? null
        : `${baseDeMidia.replace(/\/$/, '')}/${pessoa.photoKey}`,
  };
}

export function registrarRotasDeBuscaDePessoas(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDeBusca,
): void {
  registrarRota(
    app,
    rotaDaBuscaDePessoas,
    {
      resolvedores: {
        account: async (request: FastifyRequest) => chamador(request, deps),
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = (request.query ?? {}) as QueryDaBusca;
      const page = query.page ?? PAGINA_INICIAL;
      const limit = query.limit ?? TAMANHO_PADRAO;
      // `q` chega como a borda o recebeu, e a borda NAO normaliza: acento e
      // caixa sao do banco (`texto_para_busca`), e o piso de tres caracteres e
      // do caso de uso. Normalizar aqui seria a segunda definicao da regra.
      const pagina = await deps.busca.buscar(
        await chamador(request, deps),
        query.q,
        page,
        limit,
      );
      return reply
        .status(200)
        .header('Cache-Control', SEM_CACHE)
        .send({
          items: pagina.itens.map((pessoa) =>
            comoRespostaDaPessoa(pessoa, deps.baseDeMidia),
          ),
          total: pagina.total,
          page,
          limit,
        });
    },
  );
}
