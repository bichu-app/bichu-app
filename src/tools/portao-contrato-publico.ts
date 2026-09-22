/**
 * Portão de contrato: nenhuma resposta pública devolve campo privado.
 *
 * Lê `api/openapi.yaml` e percorre **toda** operação cujo chamador não tem
 * conta: `security: []`, `tagCode` ou `finderToken`. Reprova quando a resposta
 * declarada traz coordenada, telefone, e-mail, endereço ou UUID interno.
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

export const VERSAO_DO_PORTAO = '1.1.0';

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

  const achados = [
    ...inspecionarCamposPublicos(contrato.spec, semConta),
    ...cabecalhos.achados,
  ];

  if (achados.length === 0) {
    console.info('APROVADO — nenhuma resposta sem conta declara campo privado.');
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
