/**
 * O ENDERECO DE ENTREGA GUARDADO NA CONTA NAO SAI EM SUPERFICIE PUBLICA, NAO
 * APARECE EM LISTA E NAO E LIDO POR OUTRA CONTA — medido no CONTRATO e na
 * CONSULTA.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';

const CAMINHO_DA_SPEC = 'api/openapi.yaml';
const CAMINHO_DO_REPOSITORIO =
  'src/modules/tags/adapters/persistence/kysely-endereco-guardado.ts';
const CAMINHO_DA_PORTA = 'src/modules/tags/ports/endereco-guardado.ts';
const CAMINHO_DAS_ROTAS = 'src/modules/tags/adapters/http/endereco-guardado-routes.ts';

/** A tabela do endereço guardado. */
const TABELA = 'user_delivery_addresses';

/** Os NOVE campos do endereço, pelos nomes que o contrato usa. */
const CAMPOS_DO_ENDERECO = [
  'city',
  'complement',
  'neighborhood',
  'postal_code',
  'recipient_name',
  'recipient_phone',
  'state',
  'street',
  'street_number',
] as const;

interface Spec {
  readonly paths: Record<string, Record<string, OperacaoBruta>>;
  readonly components: {
    readonly schemas: Record<string, unknown>;
    readonly responses?: Record<string, unknown>;
    readonly requestBodies?: Record<string, unknown>;
    readonly parameters?: Record<string, unknown>;
    readonly headers?: Record<string, unknown>;
    readonly examples?: Record<string, unknown>;
  };
}

interface OperacaoBruta {
  readonly operationId?: string;
  readonly security?: readonly Record<string, unknown>[];
  readonly responses?: Record<string, unknown>;
}

const textoDaSpec = readFileSync(CAMINHO_DA_SPEC, 'utf8');
const spec = parseYaml(textoDaSpec) as Spec;

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/** Resolve um `$ref` interno pela SEÇÃO que ele nomeia. */
function resolver(ref: string): unknown {
  const secoes: Record<string, Record<string, unknown> | undefined> = {
    schemas: spec.components.schemas,
    responses: spec.components.responses,
    requestBodies: spec.components.requestBodies,
    parameters: spec.components.parameters,
    headers: spec.components.headers,
    examples: spec.components.examples,
  };
  const casado = /^#\/components\/([a-zA-Z]+)\/(.+)$/u.exec(ref);
  assert.ok(
    casado !== null,
    `\`$ref\` que este caminhador não sabe seguir: ${ref}. Enquanto ele não ` +
      `souber, há um ramo do contrato que ele não visita — e um ramo não ` +
      `visitado é onde o endereço vaza em silêncio.`,
  );
  const secao = secoes[casado[1] ?? ''];
  assert.ok(
    secao !== undefined,
    `\`$ref\` para a seção \`${casado[1]}\`, que este caminhador não conhece: ` +
      `${ref}. Ver acima: ramo não visitado é vazamento silencioso.`,
  );
  return secao[casado[2] ?? ''];
}

/** Todo nome de propriedade alcançável a partir de um nó do contrato. */
function propriedadesAlcancaveis(no: unknown, vistos: Set<string> = new Set()): Set<string> {
  const achadas = new Set<string>();
  const descer = (valor: unknown): void => {
    if (Array.isArray(valor)) {
      for (const item of valor) descer(item);
      return;
    }
    if (!ehObjeto(valor)) return;

    const ref = valor['$ref'];
    if (typeof ref === 'string') {
      if (vistos.has(ref)) return;
      vistos.add(ref);
      descer(resolver(ref));
      return;
    }

    const propriedades = valor['properties'];
    if (ehObjeto(propriedades)) {
      for (const [nome, sub] of Object.entries(propriedades)) {
        achadas.add(nome);
        descer(sub);
      }
    }
    for (const chave of ['items', 'additionalProperties', 'allOf', 'oneOf', 'anyOf'] as const) {
      if (valor[chave] !== undefined) descer(valor[chave]);
    }
    for (const chave of ['responses', 'requestBody', 'content', 'schema'] as const) {
      if (valor[chave] !== undefined) descer(valor[chave]);
    }
    for (const [chave, sub] of Object.entries(valor)) {
      if (/^\d{3}$/u.test(chave) || chave === 'application/json') descer(sub);
    }
  };
  descer(no);
  return achadas;
}

/** OS DOIS CAMPOS QUE DISTINGUEM A RESIDÊNCIA DE UM ENDEREÇO PÚBLICO. */
const MARCADORES_DA_RESIDENCIA = ['recipient_name', 'street_number'] as const;

/** O endereço é alcançável DE DENTRO de um array, a partir deste nó? */
function enderecoSobArray(no: unknown, vistos: Set<string> = new Set()): boolean {
  if (Array.isArray(no)) return no.some((item) => enderecoSobArray(item, vistos));
  if (!ehObjeto(no)) return false;

  const ref = no['$ref'];
  if (typeof ref === 'string') {
    if (vistos.has(ref)) return false;
    const adiante = new Set(vistos);
    adiante.add(ref);
    return enderecoSobArray(resolver(ref), adiante);
  }

  const ehArray = no['type'] === 'array' || no['items'] !== undefined;
  if (ehArray) {
    const dentro = propriedadesAlcancaveis(no, new Set(vistos));
    if (MARCADORES_DA_RESIDENCIA.every((campo) => dentro.has(campo))) return true;
  }

  for (const valor of Object.values(no)) {
    if (enderecoSobArray(valor, vistos)) return true;
  }
  return false;
}

interface Operacao {
  readonly id: string;
  readonly caminho: string;
  readonly metodo: string;
  readonly op: OperacaoBruta;
}

function todasAsOperacoes(): Operacao[] {
  const operacoes: Operacao[] = [];
  for (const [caminho, item] of Object.entries(spec.paths)) {
    for (const [metodo, op] of Object.entries(item)) {
      if (!ehObjeto(op) || op['responses'] === undefined) continue;
      const bruta = op as OperacaoBruta;
      operacoes.push({
        id: bruta.operationId ?? `${metodo.toUpperCase()} ${caminho}`,
        caminho,
        metodo,
        op: bruta,
      });
    }
  }
  return operacoes;
}

/**
 * Alcançável SEM conta: `security: []` (ninguém precisa de token) ou uma
 * alternativa vazia na lista (o token é opcional).
 */
function alcancaOEndereco(op: OperacaoBruta): boolean {
  const achadas = propriedadesAlcancaveis(op);
  return MARCADORES_DA_RESIDENCIA.every((campo) => achadas.has(campo));
}

function alcancavelSemConta(op: OperacaoBruta): boolean {
  const seguranca = op.security;
  if (seguranca === undefined) return false;
  return seguranca.length === 0 || seguranca.some((entrada) => Object.keys(entrada).length === 0);
}

void describe('o endereço guardado não sai em superfície pública (contrato)', () => {
  void it('a lista dos nove campos é a de `DeliveryAddress`, e ela é fechada', () => {
    const schema = spec.components.schemas['DeliveryAddress'];
    assert.ok(ehObjeto(schema), '`DeliveryAddress` não existe mais no contrato');
    const propriedades = Object.keys(schema['properties'] as Record<string, unknown>).sort();
    assert.deepEqual(
      propriedades,
      [...CAMPOS_DO_ENDERECO],
      'um campo a mais (ou a menos) em `DeliveryAddress` é superfície nova de ' +
        'dado pessoal, e precisa de decisão do cliente — este caso é onde ela aparece',
    );
  });

  void it('CONTROLE POSITIVO -- o caminhador acha os nove em `getMyDeliveryAddress`', () => {
    const dono = todasAsOperacoes().find((o) => o.id === 'getMyDeliveryAddress');
    assert.ok(dono !== undefined, '`getMyDeliveryAddress` não está no contrato');
    const achadas = propriedadesAlcancaveis(dono.op.responses);
    const faltando = CAMPOS_DO_ENDERECO.filter((campo) => !achadas.has(campo));
    assert.deepEqual(
      faltando,
      [],
      'o caminhador NÃO acha estes campos na resposta do próprio dono, onde eles ' +
        'têm de estar. Ele está cego, e a varredura de omissão abaixo não vale nada',
    );
  });

  void it('ISCA DE VAZAMENTO -- nenhuma operação alcançável SEM CONTA projeta o endereço', () => {
    const publicas = todasAsOperacoes().filter((o) => alcancavelSemConta(o.op));

    assert.ok(
      publicas.length >= 30,
      `só ${publicas.length} operações classificadas como alcançáveis sem conta. ` +
        `Eram 32 em 21/10/2026; uma queda desta ordem quer dizer que a ` +
        `classificação parou de funcionar, e a varredura abaixo está vazia`,
    );

    const vazamentos = publicas
      .filter((publica) => {
        const respostas = publica.op.responses;
        if (respostas === undefined) return false;
        const achadas = propriedadesAlcancaveis(respostas);
        return MARCADORES_DA_RESIDENCIA.every((campo) => achadas.has(campo));
      })
      .map((publica) => `${publica.id} (${publica.metodo.toUpperCase()} ${publica.caminho})`);

    assert.deepEqual(
      vazamentos,
      [],
      'uma operação alcançável SEM CONTA projeta o endereço de entrega. Este é ' +
        'o endereço RESIDENCIAL do usuário e ele não é público em nenhuma ' +
        'superfície, para ninguém — nem para o estranho que escaneou a plaquinha',
    );
  });

  void it('o endereço de entrega só é alcançável nas operações onde foi decidido', () => {
    const hospedeiros = todasAsOperacoes()
      .filter((operacao) => alcancaOEndereco(operacao.op))
      .map((operacao) => operacao.id)
      .sort();

    assert.deepEqual(
      hospedeiros,
      [
        'declineAdminCollarTagRequest',
        'fulfillAdminCollarTagRequest',
        'getAdminCollarTagRequest',
        'getMyDeliveryAddress',
        'getPetDeliveryAddress',
        'listAdminCollarTagRequests',
        'putMyDeliveryAddress',
        'putPetDeliveryAddress',
        'requestCollarTag',
        'updateAdminCollarTagRequestDelivery',
      ],
      'uma operação nova alcança o endereço de entrega. Se ela for do app ou do ' +
        'site, é vazamento; se for do painel, é decisão de produto — e nos dois ' +
        'casos passa por aqui primeiro',
    );
  });

  void it('ISCA DE VAZAMENTO -- o endereço guardado não aparece em LISTA nenhuma', () => {
    const emLista = todasAsOperacoes()
      .filter((operacao) => !operacao.caminho.startsWith('/admin'))
      .filter((operacao) => operacao.op.responses !== undefined)
      .filter((operacao) => enderecoSobArray(operacao.op.responses))
      .map((operacao) => operacao.id);

    assert.deepEqual(
      emLista,
      [],
      'o endereço guardado saiu numa LISTA fora do painel. Uma lista de ' +
        'residências é o pior formato possível deste dado',
    );
  });

  void it('CONTROLE POSITIVO -- a travessia de lista enxerga a lista do painel', () => {
    const fila = todasAsOperacoes().find((o) => o.id === 'listAdminCollarTagRequests');
    assert.ok(fila !== undefined, '`listAdminCollarTagRequests` não está no contrato');
    assert.ok(
      enderecoSobArray(fila.op.responses),
      'a travessia NÃO acha o endereço na fila do painel, que é uma lista de ' +
        'endereços por decisão. Ela está cega, e o caso da lista acima não vale nada',
    );
  });

  void it('`/me/delivery-address` não carrega identificador no caminho (ADR-0010 item 6)', () => {
    const item = spec.paths['/me/delivery-address'];
    assert.ok(item !== undefined && ehObjeto(item), 'o caminho do endereço guardado não existe');
    assert.ok(
      !/\{/u.test('/me/delivery-address'),
      'o caminho ganhou parâmetro. O recurso é singular de propósito: a tabela ' +
        'tem `user_id` como chave primária e não tem coluna `id`, e nenhum ' +
        'identificador interno vai para caminho de rota',
    );
    for (const metodo of ['get', 'put'] as const) {
      const op = item[metodo] as OperacaoBruta & { parameters?: unknown[] };
      assert.ok(op !== undefined, `falta o \`${metodo}\` de /me/delivery-address`);
      assert.equal(
        (op.parameters ?? []).length,
        0,
        `\`${metodo}\` ganhou parâmetro. Ver acima: não há identificador a passar`,
      );
    }
  });

  void it('as duas operações do endereço guardado exigem `bearerAuth`, sem alternativa vazia', () => {
    const item = spec.paths['/me/delivery-address'];
    assert.ok(item !== undefined, 'o caminho do endereço guardado não existe');
    for (const metodo of ['get', 'put'] as const) {
      const op: OperacaoBruta | undefined = item[metodo];
      assert.ok(op !== undefined, `falta o \`${metodo}\` de /me/delivery-address`);
      assert.deepEqual(
        op.security,
        [{ bearerAuth: [] }],
        `\`${metodo} /me/delivery-address\` não exige \`bearerAuth\` sem alternativa. ` +
          `Uma alternativa vazia aqui abriria a residência do usuário a quem não tem conta`,
      );
    }
  });

});

void describe('o endereço guardado é lido só pelo dono (consulta e porta)', () => {
  const repositorio = readFileSync(CAMINHO_DO_REPOSITORIO, 'utf8');

  /** AS FATIAS, e é aqui que este portão declara ONDE ELE CORTA. */
  const fatias = repositorio.split('await this.db').slice(1);

  void it('o corte da consulta é onde eu digo que é, e nenhuma fatia é cega', () => {
    assert.equal(
      fatias.length,
      2,
      `o portão esperava DUAS fatias (uma por acesso ao banco: \`doChamador\` e ` +
        `\`guardar\`) e achou ${fatias.length}. Um acesso novo ao banco não está ` +
        `sendo conferido por nenhum caso deste arquivo`,
    );
    for (const [indice, fatia] of fatias.entries()) {
      assert.ok(
        fatia.includes(TABELA),
        `a fatia ${indice} não menciona \`${TABELA}\`. O corte está no lugar ` +
          `errado, ou a tabela foi renomeada — e nos dois casos as conferências ` +
          `abaixo estão olhando para o lugar errado`,
      );
    }
  });

  void it('TODO acesso a `user_delivery_addresses` carrega o dono na cláusula `WHERE`', () => {
    for (const [indice, fatia] of fatias.entries()) {
      const temWhereDoDono = /\.where\('user_id', '=', chamador\)/u.test(fatia);
      const temValuesDoDono = /user_id:\s*chamador/u.test(fatia);
      assert.ok(
        temWhereDoDono || temValuesDoDono,
        `ISCA DE VAZAMENTO: a fatia ${indice} toca \`${TABELA}\` sem \`user_id\` ` +
          `do chamador. A autorização deste endereço mora na cláusula \`WHERE\` ` +
          `(ADR-0021), e um \`WHERE\` que falta devolve a residência de outra pessoa`,
      );
    }
  });

  void it('nenhum acesso lê a tabela inteira', () => {
    const semComentarios = repositorio
      .replace(/\/\*[\s\S]*?\*\//gu, ' ')
      .replace(/\/\/[^\n]*/gu, ' ');

    assert.match(
      semComentarios,
      /selectFrom\('user_delivery_addresses'\)/u,
      'a remoção de comentários comeu o código junto: o `selectFrom` da tabela ' +
        'não está mais no texto medido, e as conferências abaixo olham para o vazio',
    );
    assert.match(
      semComentarios,
      /insertInto\('user_delivery_addresses'\)/u,
      'a remoção de comentários comeu o `insertInto`. Ver acima',
    );

    assert.ok(
      !/selectAll\(\)/u.test(semComentarios),
      '`selectAll()` no repositório do endereço guardado: cada coluna futura ' +
        'passaria a atravessar a borda por omissão, e `updated_at` já seria uma delas',
    );
    assert.ok(
      !/\.limit\(|\.offset\(|orderBy/u.test(semComentarios),
      'paginação ou ordenação no repositório do endereço guardado. A leitura ' +
        'devolve no máximo UMA linha, porque `user_id` é a chave primária — ' +
        'paginar aqui só faria sentido para ler o endereço de mais de uma conta',
    );
  });

  void it('a porta não tem assinatura que aceite conta de terceiro', () => {
    const porta = readFileSync(CAMINHO_DA_PORTA, 'utf8');
    const assinaturas = [...porta.matchAll(/^\s{2}([a-zA-Z]+)\(([^)]*)/gmu)].map((m) => ({
      metodo: m[1] ?? '',
      parametros: (m[2] ?? '').trim(),
    }));
    assert.deepEqual(
      assinaturas.map((a) => a.metodo).sort(),
      ['doChamador', 'guardar'],
      'a porta do endereço guardado ganhou ou perdeu método. Qualquer leitura ' +
        'nova aqui é superfície nova da residência do usuário',
    );
    for (const assinatura of assinaturas) {
      assert.match(
        assinatura.parametros,
        /^chamador: UserId/u,
        `\`${assinatura.metodo}\` não começa por \`chamador: UserId\`. Uma ` +
          `assinatura que aceite a conta de outra pessoa é o caminho por onde ` +
          `a residência de terceiro passa a ser legível`,
      );
    }
  });

  void it('as rotas não leem identificador da requisição', () => {
    const rotas = readFileSync(CAMINHO_DAS_ROTAS, 'utf8');
    assert.ok(
      !/request\.params/u.test(rotas),
      'as rotas do endereço guardado leem `request.params`. O caminho é ' +
        'singular e não tem parâmetro: um id lido dali só poderia vir de outra conta',
    );
    assert.ok(
      !/request\.query/u.test(rotas),
      'as rotas do endereço guardado leem `request.query`. Mesma razão de ' +
        '`request.params` — e um `?user_id=` é a forma mais clássica deste vazamento',
    );
  });
});
