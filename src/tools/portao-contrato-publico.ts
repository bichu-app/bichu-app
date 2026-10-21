/**
 * Portão de contrato: nenhuma resposta pública devolve campo privado.
 *
 * Lê `api/openapi.yaml` e percorre **toda** operação cujo chamador não tem
 * conta: `security: []`, `tagCode` ou `finderToken`. Reprova quando a resposta
 * declarada traz coordenada, telefone, e-mail, endereço ou UUID interno, e
 * quando o PEDIDO declara parâmetro de coordenada, distância ou raio.
 *
 * Os dois lados estão aqui porque o vazamento não precisa aparecer na resposta
 * para existir. Uma rota pública que aceita um centro escolhido por quem chama
 * é um oráculo de posição: variando o centro e lendo a ORDEM da página dá para
 * trilaterar o ponto de cada caso sem um único número de coordenada sair no
 * corpo. O ADR-0006 proíbe nominalmente para a listagem pública de perdidos
 * ("filtra por cidade e bairro digitados, jamais por latitude e longitude") e o
 * ADR-0010 itens 4 e 5 proíbem coordenada e distância em superfície alcançável
 * sem conta.
 *
 * Três decisões que fazem este portão valer alguma coisa:
 *
 * 1. **Ele lê o contrato, não a lista de rotas de hoje.** Rota pública criada
 *    depois do dia 30 é coberta sem ninguém precisar lembrar de nada.
 * 2. **Não achar alvo é reprovação.** Filtro que não filtra termina verde e
 *    ninguém desconfia. A ausência de operação para percorrer é falha ruidosa
 *    com o motivo na mensagem.
 * 3. **O caso que ele PRECISA reprovar mora aqui dentro e roda sempre.** Prova
 *    negativa que vive numa frase evapora: se a isca passar, o portão falha por
 *    não ter conseguido verificar, e diz isso.
 *
 * Uso: `node dist/tools/portao-contrato-publico.js [caminho-da-spec]`
 * Saída: 0 aprovado, 1 reprovado.
 */
import { parse as parseYaml } from 'yaml';
import { readFileSync } from 'node:fs';
import { carregarContrato, type OperacaoDoContrato } from '../shared/http/contract.js';

export const VERSAO_DO_PORTAO = '1.3.0';

/**
 * Nomes proibidos em resposta a quem não tem conta. Comparação por nome exato:
 * `recipient_email_masked` não é `email`, e tratar por substring transformaria o
 * portão numa fonte de achado falso, que é como portão perde a confiança de quem
 * o lê.
 */
const CAMPOS_PROIBIDOS = new Set([
  'lat',
  'lon',
  'latitude',
  'longitude',
  'phone',
  'phone_e164',
  'email',
  'postal_code',
  'cep',
  'address',
  'street',
  'zip',
  // ---------------------------------------------------------------------
  // BICHUS-92. A granularidade que sai em superfície pública é bairro,
  // cidade e UF, e **nunca mais fino** (ADR-0010, "o que a rota pública
  // jamais exibe", itens 4 e 5).
  //
  // As sete primeiras são a coordenada por outros nomes. `reference_point`
  // é a coluna nova, e está aqui porque a lista acima cobria `lat`/`lon` e
  // deixaria passar o nome da coluna: uma resposta pública declarando
  // `reference_point: { type: string }` (o WKT de um ponto é texto)
  // atravessava as duas listas sem um achado.
  //
  // `distance_m`, `distance_km` e `radius_m` não são coordenada e são
  // igualmente proibidas em superfície pública, pelo motivo que o ADR-0010
  // registra: distância implica centro, e três distâncias a partir de
  // centros conhecidos trilateram o centro desconhecido. No contrato de
  // hoje as três aparecem apenas em operação com `bearerAuth`
  // (`LostCaseReachPreview` e a lista de candidatos), e é justamente por
  // isso que declará-las aqui não muda nada hoje e fecha a porta amanhã.
  //
  // `map_url` fecha o item 5 (mapa com pino, em qualquer zoom).
  'point',
  'reference_point',
  'geo',
  'geom',
  'geohash',
  'coordinate',
  'coordinates',
  'distance_m',
  'distance_km',
  'radius_m',
  'map_url',
  'street_number',
  'house_number',
  // ---------------------------------------------------------------------
  // `street_address` ENTROU EM 21/10/2026, e a ausencia dele era um buraco
  // MEDIDO, nao teorico.
  //
  // A comparacao desta lista e **por nome exato** (ver o cabecalho do
  // `CAMPOS_PROIBIDOS`), de proposito. Mas `network_events.street_address` se
  // chama exatamente isso, e nao `street` nem `address`: ele atravessava as
  // duas entradas vizinhas sem um achado. Entao, antes desta linha, o portao
  // APROVAVA um `street_address` acrescentado a `NetworkEventPublic` -- que e
  // resposta de `getNetworkEvent`, operacao de autenticacao OPCIONAL e
  // portanto publica para este portao.
  //
  // O ADR-0027 item 21.2 e literal: o endereco por extenso do encontro sai
  // **so** em `getNetworkEventLocation`, com `bearerAuth`, e "nunca na agenda,
  // no detalhe publico, no teaser nem nos detalhes do privado". Trocar essa
  // regra para publica exige, no mesmo commit, o campo em `NetworkEventPublic`
  // e `NetworkEventPrivateDetails` e uma emenda naquele ADR -- e, agora,
  // tirar o nome daqui, que e o terceiro lugar onde a decisao aparece.
  //
  // A pagina publica do encontro (`/encontro/{slug}`, emenda 4 do ADR-0017) e
  // o motivo de isto virar urgente: ela e lida por quem nao tem conta, e o
  // `street_address` indo para ela e o endereco do encontro indo para um grupo
  // de WhatsApp.
  'street_address',
  'address_line',
  'address_line1',
]);

const ESQUEMAS_SEM_CONTA = new Set(['tagCode', 'finderToken']);

/**
 * `correlation_id` termina em `_id` e é um UUID, e **não** é identificador de
 * recurso: é o mesmo valor propagado no log e no trace, que o contrato manda
 * estar em todo `Problem`, inclusive nos públicos. Ele não ordena nada nem
 * revela taxa de criação de registro, que é o dano que o SEC-001 descreve.
 */
const CAMPOS_DISPENSADOS = new Set(['correlation_id']);

/**
 * Operações que **abrem sessão**: cadastro, login, renovação e confirmação de
 * e-mail. Elas declaram `security: []` porque quem chama ainda não tem token,
 * mas o corpo que devolvem é a conta **de quem acabou de provar a credencial na
 * mesma requisição** — não a de um terceiro. Exigir que a resposta de login não
 * traga o próprio e-mail tornaria a operação impossível.
 *
 * A regra do SEC-001 é escrita no contrato com escopo estreito, e é este:
 * "toda resposta a chamador com `tagCode` ou `finderToken`". A dispensa abaixo
 * é a leitura fiel dele, e não um alargamento de conveniência.
 *
 * As dispensas são **impressas a cada execução**. Lista de exceção que ninguém
 * vê é lista que cresce.
 */
const OPERACOES_QUE_ABREM_SESSAO: ReadonlyMap<string, string> = new Map([
  ['registerUser', 'devolve a sessão e a conta recém-criada a quem a criou'],
  ['login', 'devolve a sessão e a conta a quem apresentou a senha'],
  ['refreshSession', 'devolve a sessão a quem apresentou o refresh da própria conta'],
  ['confirmEmailVerification', 'devolve a sessão a quem apresentou o token do próprio e-mail'],
]);

export interface Achado {
  readonly operationId: string;
  readonly onde: string;
  readonly campo: string;
  readonly motivo: string;
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function resolver(spec: Record<string, unknown>, ref: string): unknown {
  let atual: unknown = spec;
  for (const parte of ref.replace(/^#\//, '').split('/')) {
    if (!ehObjeto(atual)) return undefined;
    atual = atual[parte];
  }
  return atual;
}

/** Um `id` de UUID numa resposta sem conta é o vazamento do SEC-001. */
function ehUuidInterno(nome: string, schema: Record<string, unknown>): boolean {
  if (nome !== 'id' && !nome.endsWith('_id')) return false;
  return schema['format'] === 'uuid';
}

function percorrerSchema(
  schema: unknown,
  spec: Record<string, unknown>,
  operationId: string,
  onde: string,
  vistos: Set<string>,
  achados: Achado[],
): void {
  if (Array.isArray(schema)) {
    for (const item of schema) percorrerSchema(item, spec, operationId, onde, vistos, achados);
    return;
  }
  if (!ehObjeto(schema)) return;

  const ref = schema['$ref'];
  if (typeof ref === 'string') {
    if (vistos.has(ref)) return;
    vistos.add(ref);
    percorrerSchema(resolver(spec, ref), spec, operationId, `${onde} -> ${ref}`, vistos, achados);
    return;
  }

  const propriedades = schema['properties'];
  if (ehObjeto(propriedades)) {
    for (const [nome, definicao] of Object.entries(propriedades)) {
      const alvo = ehObjeto(definicao) ? definicao : {};
      if (CAMPOS_DISPENSADOS.has(nome)) {
        // Segue percorrendo o que está abaixo dele: a dispensa é do nome, não
        // da subárvore.
        percorrerSchema(definicao, spec, operationId, `${onde}.${nome}`, vistos, achados);
        continue;
      }
      if (CAMPOS_PROIBIDOS.has(nome)) {
        achados.push({
          operationId,
          onde,
          campo: nome,
          motivo: 'campo privado em resposta a chamador sem conta',
        });
      } else if (ehUuidInterno(nome, alvo)) {
        achados.push({
          operationId,
          onde,
          campo: nome,
          motivo: 'UUID interno em resposta a chamador sem conta (SEC-001)',
        });
      }
      percorrerSchema(definicao, spec, operationId, `${onde}.${nome}`, vistos, achados);
    }
  }

  for (const chave of ['items', 'allOf', 'anyOf', 'oneOf', 'additionalProperties']) {
    if (schema[chave] !== undefined) {
      percorrerSchema(schema[chave], spec, operationId, `${onde}.${chave}`, vistos, achados);
    }
  }
}

export function ehOperacaoSemConta(operacao: OperacaoDoContrato): boolean {
  // `security: []` — pública.
  if (operacao.security.length === 0) return true;
  // `bearerAuth` mais `{}` — autenticação OPCIONAL. Existe um caminho sem conta,
  // e é justamente ele que precisa ser olhado: é assim que o contrato declara a
  // rota da tag em modo dono, onde a resposta muda se houver token. Tratar a
  // lista só pelos nomes dos esquemas faz a alternativa vazia desaparecer, e
  // some com ela a única rota pública que serve dois públicos diferentes.
  if (operacao.security.some((entrada) => Object.keys(entrada).length === 0)) return true;
  return operacao.securitySchemes.some((nome) => ESQUEMAS_SEM_CONTA.has(nome));
}

export function inspecionarCamposPublicos(
  spec: Record<string, unknown>,
  operacoes: readonly OperacaoDoContrato[],
): Achado[] {
  const achados: Achado[] = [];
  for (const operacao of operacoes) {
    if (OPERACOES_QUE_ABREM_SESSAO.has(operacao.operationId)) continue;
    const respostas = operacao.raw['responses'];
    if (!ehObjeto(respostas)) continue;
    for (const [status, resposta] of Object.entries(respostas)) {
      if (!ehObjeto(resposta)) continue;
      const conteudo = resposta['content'];
      if (!ehObjeto(conteudo)) continue;
      for (const [midia, corpo] of Object.entries(conteudo)) {
        if (!ehObjeto(corpo) || corpo['schema'] === undefined) continue;
        percorrerSchema(
          corpo['schema'],
          spec,
          operacao.operationId,
          `${status} ${midia}`,
          new Set(),
          achados,
        );
      }
    }
  }
  return achados;
}

/**
 * Tokens proibidos em NOME DE PARÂMETRO de operação alcançável sem conta.
 *
 * ## Por que esta lista é PRÓPRIA, e não a `CAMPOS_PROIBIDOS` da resposta
 *
 * A pergunta foi medida antes de ser respondida, nas 53 nomes de parâmetro que
 * o contrato declara hoje. Três coisas saíram da medição, e a primeira decide:
 *
 * 1. **`max_km` não está em `CAMPOS_PROIBIDOS`, e é um parâmetro deste
 *    contrato.** Ele é o nome que esta casa já usa para raio
 *    (`listNearbyNetworkEvents`, `bearerAuth`). A lista da resposta tem
 *    `radius_m` e não tem `max_km`, por um motivo correto: `max_km` nunca
 *    aparece numa resposta, só num pedido. Reusar a lista da resposta deixaria
 *    passar, numa rota pública, exatamente o nome que o projeto escolheu para
 *    dizer "raio" — o buraco fechado com a mão esquerda e reaberto com a
 *    direita.
 * 2. **A lista da resposta é mais larga do que esta regra autoriza.** Ela traz
 *    `phone`, `email`, `address`, `cep`, `street`, `zip`, `street_number`,
 *    `house_number`, `map_url`. Proibir `email` no PEDIDO de rota pública pode
 *    muito bem ser certo, mas por outro defeito (enumeração de conta), com
 *    outra evidência e em outra história. O que o ADR-0006 e o ADR-0010 itens 4
 *    e 5 proíbem é coordenada, distância e raio. Arrastar o resto para dentro
 *    desta mudança seria alargar a regra sem ADR atrás.
 * 3. **A lista da resposta muda por motivo de resposta.** O comentário dela diz
 *    isso de `reference_point`: entrou porque era o nome de uma COLUNA nova. No
 *    dia em que o mascaramento chegar e `phone` sair de lá, o lado do pedido
 *    perderia cobertura que nunca derivou dali. Acoplar faz uma mudança cair no
 *    raio da outra sem ninguém raciocinar sobre isso.
 *
 * O argumento contrário — uma lista só não divergir — é real, e perde: as duas
 * listas respondem a perguntas diferentes, e a divergência já é necessária
 * (`radius_m` de um lado, `max_km` do outro). O que não pode acontecer é
 * qualquer das duas ENCOLHER calada, e disso cuidam as iscas, uma por lista.
 *
 * O teste de `listagem-publica-de-perdidos.test.ts` já tinha feito esta mesma
 * escolha, por escrito e com a mesma razão ("a lista de lá é sobre o que SAI e
 * pode mudar por outra razão"). Divergir dela agora é que seria a incoerência.
 *
 * ## Por que o casamento é por SEGMENTO, e não por nome exato
 *
 * Na resposta o nome exato basta, e o arquivo explica por quê: substring
 * transformaria o portão numa fonte de achado falso. No pedido, não basta —
 * nome de parâmetro é naturalmente composto, e `max_km` está aí para provar.
 * `center_lat`, `lat_min` e `sw_lat` são a mesma coordenada com um prefixo, e
 * nome exato não alcança nenhum deles.
 *
 * Então o nome é quebrado em `_`, `-` e `.`, e cada segmento é comparado com os
 * tokens abaixo. Medido: nos 53 nomes de parâmetro do contrato de hoje isso
 * casa com TRÊS — `lat`, `lon` e `max_km` — e os três estão em operação com
 * `bearerAuth`. Zero achado falso. `page`, `limit`, `period`, `q`, `city`,
 * `neighborhood`, `size`, `sort`, `species`, `cursor`, `price_status` e
 * `verification_level` passam, e passam medidos, não por esperança.
 *
 * Fora da lista de propósito: `long`, `around`, `within` e `bounds`. São
 * palavras inglesas que nomeiam outra coisa com naturalidade (`long_name`), e
 * um achado falso custa ao portão a confiança de quem o lê — que é o que o
 * resto deste arquivo passa o tempo tentando não gastar. As formas compostas
 * que importam já caem pelo token geográfico ao lado (`lat`, `lon`, `km`).
 */
const TOKENS_PROIBIDOS_NO_PEDIDO: ReadonlySet<string> = new Set([
  // Coordenada, por todos os nomes que ela usa.
  'lat',
  'latitude',
  'lon',
  'lng',
  'longitude',
  'coord',
  'coords',
  'coordinate',
  'coordinates',
  'geo',
  'geohash',
  'geom',
  'geometry',
  'point',
  'centroid',
  // O CENTRO escolhido por quem chama. É o coração do defeito: um `?center=`
  // empacotando os dois números num texto só não tem segmento `lat` nem `lon`,
  // e passaria por tudo acima.
  'center',
  'centre',
  'bbox',
  // Distância e raio. O ADR-0010 registra o motivo e ele não é zelo: distância
  // implica centro, e três distâncias a partir de centros conhecidos trilateram
  // o centro desconhecido.
  'radius',
  'distance',
  'dist',
  'km',
  'proximity',
  'near',
  'nearby',
]);

/**
 * Por que o PEDIDO não dispensa `OPERACOES_QUE_ABREM_SESSAO`.
 *
 * A dispensa da resposta tem uma razão estreita e boa: o corpo que o login
 * devolve é a conta de quem acabou de provar a credencial na mesma requisição.
 * Nada disso vale para o lado do pedido — `login` não tem negócio nenhum
 * aceitando um `lat` de query string. A dispensa é da resposta, e fica lá.
 *
 * E por que o CORPO da requisição não é percorrido, que é uma fronteira e não
 * um esquecimento: um `lat` no corpo de `createFoundReportFromTag` é quem achou
 * o pet dizendo onde o achou — entrada legítima, e o ADR-0010 fala do que a
 * superfície pública EXIBE. O que faz o parâmetro ser diferente é que ele é um
 * SELETOR: vive na URL, é registrado em log, cai em cache e é compartilhado, e
 * é onde o OpenAPI declara filtro e ordenação. Coordenada que entra por direito
 * entra pelo corpo; esta varredura não toca no corpo.
 */

/** O que a varredura de parâmetros conseguiu olhar, além do que ela achou. */
export interface ResultadoDoPedido {
  readonly achados: readonly Achado[];
  readonly operacoesConferidas: number;
  /** Zero significa que não havia parâmetro para conferir, e NÃO que passou. */
  readonly parametrosConferidos: number;
}

function segmentosDoNome(nome: string): string[] {
  return nome
    .toLowerCase()
    .split(/[_\-.]/)
    .filter((parte) => parte.length > 0);
}

export function inspecionarParametrosPublicos(
  operacoes: readonly OperacaoDoContrato[],
): ResultadoDoPedido {
  const achados: Achado[] = [];
  let parametrosConferidos = 0;

  for (const operacao of operacoes) {
    for (const parametro of operacao.parameters) {
      const nome = parametro['name'];
      if (typeof nome !== 'string') continue;
      parametrosConferidos += 1;
      const onde = typeof parametro['in'] === 'string' ? parametro['in'] : '?';
      const casou = segmentosDoNome(nome).filter((segmento) =>
        TOKENS_PROIBIDOS_NO_PEDIDO.has(segmento),
      );
      if (casou.length === 0) continue;
      achados.push({
        operationId: operacao.operationId,
        onde: `parâmetro (${onde})`,
        campo: nome,
        motivo:
          `coordenada, distância ou raio no PEDIDO de operação alcançável sem conta ` +
          `(segmento: ${casou.join(', ')}) — ADR-0006 e ADR-0010 itens 4 e 5. ` +
          'Um centro escolhido por quem chama transforma a rota pública num oráculo ' +
          'de posição, mesmo que nenhuma coordenada apareça na resposta',
      });
    }
  }

  if (parametrosConferidos === 0) {
    // "Não achar alvo é reprovação", a regra deste arquivo. Se NENHUMA operação
    // sem conta declarar um parâmetro, esta varredura não percorreu nada e um
    // verde dela não diz nada. Vai como achado, e não como saída antecipada, de
    // propósito: as outras iscas precisam continuar vendo os achados de campo
    // que o `.esperado` delas cobra.
    achados.push({
      operationId: `(${operacoes.length} operação(ões) sem conta)`,
      onde: 'parâmetros',
      campo: 'nenhum parâmetro para percorrer',
      motivo:
        'a varredura do pedido não teve alvo nenhum. Filtro que não filtra termina ' +
        'verde e ninguém desconfia',
    });
  }

  return { achados, operacoesConferidas: operacoes.length, parametrosConferidos };
}

/**
 * Cabeçalhos exigidos nas páginas HTML públicas (critério 5).
 *
 * Desde o ADR-0017 o contrato não tem mais nenhuma resposta `text/html`: as 12
 * operações que renderizavam página saíram, e a renderização foi para outro
 * time. Este bloco continua aqui, e continua armado, porque a decisão foi tirar
 * as páginas DESTE serviço, não decidir que página pública dispensa cabeçalho.
 *
 * A distinção que o relatório precisa fazer, e que é o defeito que este projeto
 * mais persegue: **"não havia o que conferir" não pode sair igual a "conferi e
 * está certo"**. Ausência de página é dita com essas palavras e não reprova;
 * página presente sem cabeçalho reprova como sempre reprovou. Quem garante que
 * a segunda metade continua enxergando é a isca do autoteste, que roda a cada
 * execução com uma página nua e exige os seis achados de volta.
 */
const CABECALHOS_EXIGIDOS: readonly { readonly rotulo: string; readonly agulha: RegExp }[] = [
  { rotulo: 'X-Robots-Tag: noindex', agulha: /noindex/i },
  { rotulo: 'Referrer-Policy: no-referrer', agulha: /no-referrer/i },
  { rotulo: 'Cache-Control: no-store', agulha: /no-store/i },
  { rotulo: 'Content-Security-Policy', agulha: /content-security-policy/i },
  { rotulo: 'X-Content-Type-Options: nosniff', agulha: /nosniff/i },
  { rotulo: 'og: genérico', agulha: /\bog:/i },
];

/** O que a conferência de cabeçalhos conseguiu olhar, além do que ela achou. */
export interface ResultadoDosCabecalhos {
  readonly achados: readonly Achado[];
  /** Zero significa que não havia página para conferir, e NÃO que passou. */
  readonly paginasConferidas: number;
}

export function inspecionarCabecalhos(
  operacoes: readonly OperacaoDoContrato[],
): ResultadoDosCabecalhos {
  const achados: Achado[] = [];
  const paginasPublicas = operacoes.filter(
    (operacao) => ehOperacaoSemConta(operacao) && declaraHtml(operacao),
  );

  for (const operacao of paginasPublicas) {
    const declarado = JSON.stringify(operacao.raw);
    for (const exigido of CABECALHOS_EXIGIDOS) {
      if (!exigido.agulha.test(declarado)) {
        achados.push({
          operationId: operacao.operationId,
          onde: 'cabeçalhos',
          campo: exigido.rotulo,
          motivo: 'não declarado no contrato',
        });
      }
    }
  }
  return { achados, paginasConferidas: paginasPublicas.length };
}

function declaraHtml(operacao: OperacaoDoContrato): boolean {
  const respostas = operacao.raw['responses'];
  if (!ehObjeto(respostas)) return false;
  return Object.values(respostas).some(
    (resposta) =>
      ehObjeto(resposta) && ehObjeto(resposta['content']) && 'text/html' in resposta['content'],
  );
}

/**
 * A isca. Um contrato minúsculo com uma rota pública que devolve `lat` e um
 * `pet_id` de UUID: o portão **precisa** reprovar os dois. Ela roda em toda
 * execução, e não numa suíte que alguém pode pular.
 */
const ISCA = `
openapi: 3.1.0
info: { title: isca, version: '0' }
paths:
  /isca:
    get:
      operationId: iscaQueDeveReprovar
      security: []
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  lat: { type: number }
                  pet_id: { type: string, format: uuid }
  /isca-granularidade:
    get:
      operationId: iscaDeGranularidadeFinaDemais
      security: []
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  neighborhood: { type: string }
                  city: { type: string }
                  state: { type: string }
                  reference_point: { type: string }
                  distance_m: { type: integer }
                  radius_m: { type: integer }
                  map_url: { type: string }
  /isca-pedido:
    get:
      operationId: iscaDeCoordenadaNoPedido
      security: []
      parameters:
        - { name: page, in: query, schema: { type: integer } }
        - { name: limit, in: query, schema: { type: integer } }
        - { name: period, in: query, schema: { type: string } }
        - { name: q, in: query, schema: { type: string } }
        - { name: city, in: query, schema: { type: string } }
        - { name: neighborhood, in: query, schema: { type: string } }
        - { name: lat, in: query, schema: { type: number } }
        - { name: center_lon, in: query, schema: { type: number } }
        - { name: max_km, in: query, schema: { type: integer } }
        - { name: X-Near-Me, in: header, schema: { type: string } }
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                type: object
                properties:
                  city: { type: string }
  /isca-html:
    get:
      operationId: iscaDePaginaNua
      security: []
      responses:
        '200':
          content:
            text/html:
              schema: { type: string }
`;

function autoTeste(): string[] {
  const falhas: string[] = [];
  const spec = parseYaml(ISCA) as Record<string, unknown>;
  const paths = spec['paths'] as Record<string, Record<string, Record<string, unknown>>>;
  const operacaoBruta = paths['/isca']?.['get'] ?? {};
  const operacao: OperacaoDoContrato = {
    operationId: 'iscaQueDeveReprovar',
    method: 'get',
    path: '/isca',
    security: [],
    securitySchemes: [],
    effects: [],
    hasRateLimit: false,
    raw: operacaoBruta,
    parameters: [],
  };

  const achados = inspecionarCamposPublicos(spec, [operacao]);
  if (!achados.some((a) => a.campo === 'lat')) {
    falhas.push('a isca com `lat` passou: o portão parou de enxergar coordenada');
  }
  if (!achados.some((a) => a.campo === 'pet_id')) {
    falhas.push('a isca com `pet_id` de UUID passou: o portão parou de enxergar id interno');
  }

  // ---------------------------------------------------------------------
  // A ISCA DE GRANULARIDADE (BICHUS-92).
  //
  // Ela declara bairro, cidade e UF -- que PRECISAM passar, porque são
  // exatamente a granularidade permitida -- lado a lado com quatro campos mais
  // finos que precisam ser reprovados. Sem a metade que passa, a isca não
  // distinguiria um portão que enxerga de um portão que reprova tudo, e um
  // portão que reprova tudo é retirado na primeira sexta-feira.
  // ---------------------------------------------------------------------
  const granularidade: OperacaoDoContrato = {
    operationId: 'iscaDeGranularidadeFinaDemais',
    method: 'get',
    path: '/isca-granularidade',
    security: [],
    securitySchemes: [],
    effects: [],
    hasRateLimit: false,
    raw: paths['/isca-granularidade']?.['get'] ?? {},
    parameters: [],
  };
  const achadosDaGranularidade = inspecionarCamposPublicos(spec, [granularidade]);
  for (const fino of ['reference_point', 'distance_m', 'radius_m', 'map_url']) {
    if (!achadosDaGranularidade.some((a) => a.campo === fino)) {
      falhas.push(
        `a isca de granularidade passou em \`${fino}\`: a superfície pública voltou a ` +
          'poder dizer onde a pessoa está com precisão maior que bairro, cidade e UF',
      );
    }
  }
  for (const permitido of ['neighborhood', 'city', 'state']) {
    if (achadosDaGranularidade.some((a) => a.campo === permitido)) {
      falhas.push(
        `o portão reprovou \`${permitido}\`, que é a granularidade PERMITIDA: ` +
          'portão que reprova tudo não distingue nada e é retirado na primeira sexta-feira',
      );
    }
  }

  // A isca de cabeçalho existe por causa do ADR-0017. O contrato real não tem
  // mais página HTML, então a conferência de cabeçalho deixou de ser exercitada
  // por ele: sem esta isca, ela poderia quebrar e ninguém saberia, porque o
  // relatório continuaria dizendo o mesmo. Aqui ela é obrigada a acusar, a cada
  // execução, uma página pública sem nenhum dos seis itens.
  const paginaNua: OperacaoDoContrato = {
    operationId: 'iscaDePaginaNua',
    method: 'get',
    path: '/isca-html',
    security: [],
    securitySchemes: [],
    effects: [],
    hasRateLimit: false,
    raw: paths['/isca-html']?.['get'] ?? {},
    parameters: [],
  };
  const cabecalhos = inspecionarCabecalhos([paginaNua]);
  if (cabecalhos.paginasConferidas !== 1) {
    falhas.push('a isca de página HTML não foi reconhecida como página: o portão parou de enxergar `text/html`');
  }
  const faltando = CABECALHOS_EXIGIDOS.filter(
    (exigido) => !cabecalhos.achados.some((achado) => achado.campo === exigido.rotulo),
  );
  if (faltando.length > 0) {
    falhas.push(
      `a isca de página nua passou em ${faltando.map((e) => e.rotulo).join(', ')}: ` +
        'a conferência de cabeçalho parou de cobrar o que o critério 5 manda cobrar',
    );
  }

  // ---------------------------------------------------------------------
  // A ISCA DO PEDIDO.
  //
  // Mesma construção da isca de granularidade, e pelo mesmo motivo: metade dela
  // PRECISA passar. `page`, `limit`, `period`, `q`, `city` e `neighborhood` são
  // os filtros que o ADR-0006 manda a listagem pública usar — se o portão
  // reprovasse qualquer um deles ele não distinguiria nada e seria retirado na
  // primeira sexta-feira. A outra metade cobre as três formas que nome exato
  // não alcança: `lat` (nome cru), `center_lon` (composto, com o prefixo que o
  // oráculo usaria) e `max_km` (o nome que ESTA casa já usa para raio, e que a
  // lista da resposta não tem). `X-Near-Me` está aí porque cabeçalho é pedido
  // também: um oráculo não fica menos oráculo por entrar pelo cabeçalho.
  // ---------------------------------------------------------------------
  const pedido: OperacaoDoContrato = {
    operationId: 'iscaDeCoordenadaNoPedido',
    method: 'get',
    path: '/isca-pedido',
    security: [],
    securitySchemes: [],
    effects: [],
    hasRateLimit: false,
    raw: paths['/isca-pedido']?.['get'] ?? {},
    parameters: (() => {
      const brutos = paths['/isca-pedido']?.['get']?.['parameters'];
      return Array.isArray(brutos) ? (brutos as Record<string, unknown>[]) : [];
    })(),
  };
  const doPedido = inspecionarParametrosPublicos([pedido]);
  if (doPedido.parametrosConferidos !== 10) {
    falhas.push(
      `a isca do pedido tinha 10 parâmetros e o portão conferiu ${doPedido.parametrosConferidos}: ` +
        'a varredura do pedido parou de enxergar `parameters`',
    );
  }
  for (const proibido of ['lat', 'center_lon', 'max_km', 'X-Near-Me']) {
    if (!doPedido.achados.some((a) => a.campo === proibido)) {
      falhas.push(
        `a isca do pedido passou em \`${proibido}\`: a rota pública voltou a poder ` +
          'aceitar um centro escolhido por quem chama, e com ele a ordem da página ' +
          'trilatera o ponto de cada caso sem nenhuma coordenada sair na resposta',
      );
    }
  }
  for (const permitido of ['page', 'limit', 'period', 'q', 'city', 'neighborhood']) {
    if (doPedido.achados.some((a) => a.campo === permitido)) {
      falhas.push(
        `o portão reprovou o parâmetro \`${permitido}\`, que é filtro PERMITIDO pelo ` +
          'ADR-0006: portão que reprova tudo não distingue nada e é retirado na ' +
          'primeira sexta-feira',
      );
    }
  }
  // E a outra metade da regra: sem alvo, reprova. Uma operação sem parâmetro
  // nenhum não pode terminar verde por omissão.
  const semAlvo = inspecionarParametrosPublicos([paginaNua]);
  if (!semAlvo.achados.some((a) => a.campo === 'nenhum parâmetro para percorrer')) {
    falhas.push(
      'a varredura do pedido aprovou um conjunto sem parâmetro nenhum: ' +
        '"não achar alvo é reprovação" deixou de valer para o lado do pedido',
    );
  }

  return falhas;
}

export function executar(caminhoDaSpec: string): number {
  // A versão é dita no relatório: regra testada numa versão e pinada em outra já
  // foi declarada funcionando sendo cega.
  const versaoDoYaml = (() => {
    try {
      const pacote: unknown = JSON.parse(readFileSync('node_modules/yaml/package.json', 'utf8'));
      return ehObjeto(pacote) && typeof pacote['version'] === 'string' ? pacote['version'] : '?';
    } catch {
      return '?';
    }
  })();

  console.info(
    `portao-contrato-publico ${VERSAO_DO_PORTAO} | node ${process.version} | yaml ${versaoDoYaml}`,
  );

  const falhasDoAutoTeste = autoTeste();
  if (falhasDoAutoTeste.length > 0) {
    console.error('REPROVADO — o portão não conseguiu verificar a si mesmo:');
    for (const falha of falhasDoAutoTeste) console.error(`  - ${falha}`);
    return 1;
  }
  console.info('autoteste: a isca foi reprovada como deveria.');

  // `carregarContrato` já reprova operação sem `security` e contrato sem
  // operação nenhuma. Os dois são critério desta história, e valem aqui e na
  // subida da aplicação, pelo mesmo código — o portão não tem uma segunda
  // implementação da regra, que divergiria da que o servidor usa.
  let contrato;
  try {
    contrato = carregarContrato(caminhoDaSpec);
  } catch (erro) {
    console.error('REPROVADO — a especificação não carrega:');
    console.error(`  ${erro instanceof Error ? erro.message : String(erro)}`);
    return 1;
  }
  const semConta = [...contrato.operacoes.values()].filter(ehOperacaoSemConta);

  if (semConta.length === 0) {
    console.error(
      'REPROVADO — nenhuma operação sem conta encontrada para percorrer. ' +
        'Filtro que não filtra termina verde e ninguém desconfia.',
    );
    return 1;
  }
  const dispensadas = semConta.filter((o) => OPERACOES_QUE_ABREM_SESSAO.has(o.operationId));
  console.info(`operações sem conta encontradas: ${semConta.length}`);
  console.info(`campos dispensados por nome: ${[...CAMPOS_DISPENSADOS].join(', ')}`);
  if (dispensadas.length > 0) {
    console.info('operações dispensadas da varredura de campos, com o motivo:');
    for (const operacao of dispensadas) {
      console.info(
        `  ${operacao.operationId}: ${OPERACOES_QUE_ABREM_SESSAO.get(operacao.operationId) ?? ''}`,
      );
    }
  }
  console.info(`operações percorridas de fato: ${semConta.length - dispensadas.length}`);

  const cabecalhos = inspecionarCabecalhos(semConta);
  if (cabecalhos.paginasConferidas === 0) {
    // Dito com estas palavras de propósito. "Conferi e está certo" e "não havia
    // o que conferir" são desfechos diferentes, e o relatório que os funde é o
    // que faz uma verificação morrer sem ninguém notar. A capacidade de acusar
    // continua provada pela isca de página nua, logo acima.
    console.info(
      'cabeçalhos: NÃO HAVIA O QUE CONFERIR — nenhuma página HTML pública no contrato. ' +
        'É o esperado desde o ADR-0017, que tirou as respostas `text/html` deste serviço. ' +
        'A conferência segue armada: a isca de página nua foi reprovada no autoteste.',
    );
  } else {
    console.info(`cabeçalhos: ${cabecalhos.paginasConferidas} página(s) HTML pública(s) conferida(s).`);
  }

  // O lado do PEDIDO. Ele percorre as `semConta` inteiras, sem a dispensa de
  // `OPERACOES_QUE_ABREM_SESSAO`: a dispensa é da resposta, pelo motivo escrito
  // junto dela, e não há razão nenhuma para `login` aceitar um `lat` de query.
  const pedido = inspecionarParametrosPublicos(semConta);
  console.info(
    `pedido: ${pedido.parametrosConferidos} parâmetro(s) conferido(s) em ` +
      `${pedido.operacoesConferidas} operação(ões) sem conta.`,
  );
  console.info(`tokens proibidos no pedido: ${[...TOKENS_PROIBIDOS_NO_PEDIDO].join(', ')}`);

  const achados = [
    ...inspecionarCamposPublicos(contrato.spec, semConta),
    ...pedido.achados,
    ...cabecalhos.achados,
  ];

  if (achados.length === 0) {
    console.info(
      'APROVADO — nenhuma resposta sem conta declara campo privado, e nenhum pedido ' +
        'sem conta declara parâmetro de coordenada, distância ou raio.',
    );
    return 0;
  }

  console.error(`REPROVADO — ${achados.length} achado(s):`);
  for (const achado of achados) {
    console.error(`  ${achado.operationId} | ${achado.onde} | ${achado.campo} | ${achado.motivo}`);
  }
  return 1;
}

const invocadoDiretamente =
  process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invocadoDiretamente) {
  process.exit(executar(process.argv[2] ?? 'api/openapi.yaml'));
}
