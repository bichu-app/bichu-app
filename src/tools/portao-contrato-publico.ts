import { parse as parseYaml } from 'yaml';
import { readFileSync } from 'node:fs';
import { carregarContrato, type OperacaoDoContrato } from '../shared/http/contract.js';

export const VERSAO_DO_PORTAO = '1.3.0';

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
  'complement',
  'street_address',
  'address_line',
  'address_line1',
]);

const ESQUEMAS_SEM_CONTA = new Set(['tagCode', 'finderToken']);

const CAMPOS_DISPENSADOS = new Set(['correlation_id']);

const OPERACOES_QUE_ABREM_SESSAO: ReadonlyMap<string, string> = new Map([
  ['registerUser', 'devolve a sessão e a conta recém-criada a quem a criou'],
  ['login', 'devolve a sessão e a conta a quem apresentou a senha'],
  ['refreshSession', 'devolve a sessão a quem apresentou o refresh da própria conta'],
  ['confirmEmailVerification', 'devolve a sessão a quem apresentou o token do próprio e-mail'],
  [
    'finishPasskeyAuthentication',
    'devolve a sessão e a conta a quem apresentou a asserção WebAuthn da própria credencial',
  ],
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
  if (operacao.security.length === 0) return true;
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

const TOKENS_PROIBIDOS_NO_PEDIDO: ReadonlySet<string> = new Set([
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
  'center',
  'centre',
  'bbox',
  'radius',
  'distance',
  'dist',
  'km',
  'proximity',
  'near',
  'nearby',
]);

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
                  postal_code: { type: string }
                  street: { type: string }
                  street_number: { type: string }
                  complement: { type: string }
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
  for (const fino of [
    'reference_point',
    'distance_m',
    'radius_m',
    'map_url',
    'postal_code',
    'street',
    'street_number',
    'complement',
  ]) {
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
    console.info(
      'cabeçalhos: NÃO HAVIA O QUE CONFERIR — nenhuma página HTML pública no contrato. ' +
        'É o esperado desde o ADR-0017, que tirou as respostas `text/html` deste serviço. ' +
        'A conferência segue armada: a isca de página nua foi reprovada no autoteste.',
    );
  } else {
    console.info(`cabeçalhos: ${cabecalhos.paginasConferidas} página(s) HTML pública(s) conferida(s).`);
  }

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
