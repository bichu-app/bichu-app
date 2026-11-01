import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import {
  carregarContrato,
  ehObjetoDoContrato,
  resolverRefDoContrato,
  type Contrato,
} from './contract.js';

const RAIZ = mkdtempSync(join(tmpdir(), 'bichu-contrato-'));
let sequencia = 0;

after(() => {
  rmSync(RAIZ, { recursive: true, force: true });
});

function caminhoNovo(): string {
  sequencia += 1;
  return join(RAIZ, `contrato-${String(sequencia)}.yaml`);
}

function carregarTexto(yaml: string): Contrato {
  const caminho = caminhoNovo();
  writeFileSync(caminho, yaml, 'utf8');
  return carregarContrato(caminho);
}

function carregarTextoEsperandoFalha(yaml: string): () => Contrato {
  const caminho = caminhoNovo();
  writeFileSync(caminho, yaml, 'utf8');
  return () => carregarContrato(caminho);
}

function comoObjeto(valor: unknown): Record<string, unknown> {
  assert.ok(ehObjetoDoContrato(valor), `esperava um objeto e veio ${String(valor)}`);
  return valor;
}

const CABECALHO = 'openapi: 3.1.0\ninfo: { title: bichu, version: "1" }\n';

function specComRequestBody(schemaYaml: string, extras = ''): string {
  return `${CABECALHO}${extras}paths:
  /pets:
    post:
      operationId: criarPet
      security: []
      requestBody:
        content:
          application/json:
            schema:
${schemaYaml
  .split('\n')
  .map((linha) => (linha === '' ? linha : `              ${linha}`))
  .join('\n')}
      responses:
        "201": { description: criado }
`;
}

void describe('o contrato que NÃO pode carregar', () => {
  void it('YAML quebrado falha nomeando o arquivo, e não com o erro cru do parser', () => {
    const caminho = caminhoNovo();
    writeFileSync(caminho, 'paths:\n\t- isto é tabulação\n', 'utf8');

    assert.throws(
      () => carregarContrato(caminho),
      (erro: unknown) =>
        erro instanceof Error &&
        erro.message.includes(caminho) &&
        erro.message.includes('não é YAML válido') &&
        erro.cause !== undefined,
    );
  });

  void it('chave repetida na especificação é recusada, e não vence a última em silêncio', () => {
    assert.throws(
      carregarTextoEsperandoFalha(`${CABECALHO}paths:
  /pets:
    post:
      operationId: criarPet
      security: []
      security: [{ bearerAuth: [] }]
      responses: { "201": { description: ok } }
`),
      /não é YAML válido/,
    );
  });

  void it('documento que não é mapa (uma lista, um escalar) é recusado', () => {
    assert.throws(carregarTextoEsperandoFalha('- a\n- b\n'), /não é um documento YAML de mapa/);
  });

  void it('contrato sem `paths` é recusado', () => {
    assert.throws(carregarTextoEsperandoFalha(`${CABECALHO}components: {}\n`), /sem `paths`/);
  });

  void it('contrato com `paths` vazio é recusado: zero operações não é um contrato', () => {
    assert.throws(
      carregarTextoEsperandoFalha(`${CABECALHO}paths: {}\n`),
      /sem nenhuma operação/,
    );
  });

  void it('operação sem `operationId` derruba a carga em vez de sumir do índice', () => {
    assert.throws(
      carregarTextoEsperandoFalha(`${CABECALHO}paths:
  /pets:
    post:
      security: []
      responses: { "201": { description: ok } }
`),
      /Operação sem operationId em POST \/pets/,
    );
  });

  void it('`security` como LISTA DE TEXTO derruba a carga, em vez de virar rota pública', () => {
    assert.throws(
      carregarTextoEsperandoFalha(`${CABECALHO}paths:
  /pets:
    get:
      operationId: listMyPets
      security: [bearerAuth]
      responses: { "200": { description: ok } }
`),
      (erro: unknown) =>
        erro instanceof Error &&
        erro.message.includes('listMyPets') &&
        /P[ÚU]BLICA/i.test(erro.message),
      'a forma malformada precisa derrubar a carga E dizer que seria lida como pública',
    );
  });

  void it('`security: []` continua valendo: é a forma CERTA de dizer pública', () => {
    const c = carregarTexto(`${CABECALHO}paths:
  /health:
    get:
      operationId: saude
      security: []
      responses: { "200": { description: ok } }
`);
    assert.deepEqual(c.operacoes.get('saude')?.securitySchemes, []);
  });

  void it('operação sem `security` declarado derruba a carga, e a mensagem nomeia qual', () => {
    assert.throws(
      carregarTextoEsperandoFalha(`${CABECALHO}paths:
  /pets:
    post:
      operationId: criarPet
      responses: { "201": { description: ok } }
  /health:
    get:
      operationId: saude
      security: []
      responses: { "200": { description: ok } }
`),
      (erro: unknown) =>
        erro instanceof Error &&
        erro.message.includes('criarPet') &&
        !erro.message.includes('saude'),
    );
  });

  void it('`security: []` é declaração de rota PÚBLICA e carrega — o que reprova é a ausência', () => {
    const contrato = carregarTexto(`${CABECALHO}paths:
  /tags/{code}:
    get:
      operationId: verTag
      security: []
      responses: { "200": { description: ok } }
`);
    const operacao = contrato.operacoes.get('verTag');
    assert.ok(operacao !== undefined);
    assert.deepEqual(operacao.security, []);
    assert.deepEqual(operacao.securitySchemes, []);
  });
});

void describe('indexação das operações', () => {
  const contrato = carregarTexto(`${CABECALHO}paths:
  /rascunho: ~
  /meio-escrito:
    get: ~
  /pets:
    summary: coleção de pets
    get:
      operationId: listarPets
      security: [{ bearerAuth: [] }]
      responses: { "200": { description: ok } }
    post:
      operationId: criarPet
      security: [{ bearerAuth: [] }, {}]
      x-effects: [cria-pet, 42, { nao: e-string }]
      x-rate-limit: [{ window: 60s, limit: 10 }]
      responses: { "201": { description: ok } }
    options:
      operationId: preflight
      security: []
      responses: { "204": { description: ok } }
  /health:
    get:
      operationId: saude
      security: []
      x-rate-limit: []
      responses: { "200": { description: ok } }
`);

  void it('caminho e método ficam guardados como estão na especificação', () => {
    const operacao = contrato.operacoes.get('criarPet');
    assert.ok(operacao !== undefined);
    assert.equal(operacao.method, 'post');
    assert.equal(operacao.path, '/pets');
  });

  void it('caminho nulo e método nulo são ignorados em vez de derrubarem a carga', () => {
    assert.equal(contrato.operacoes.has('listarPets'), true);
    assert.equal(contrato.operacoes.has('criarPet'), true);
    assert.equal(contrato.operacoes.has('saude'), true);
  });

  void it('só os cinco métodos com corpo/efeito entram no índice: `options` fica de fora', () => {
    assert.equal(contrato.operacoes.has('preflight'), false);
    assert.equal(contrato.operacoes.size, 3);
  });

  void it('`x-effects` descarta o que não é string em vez de deixar passar', () => {
    const operacao = contrato.operacoes.get('criarPet');
    assert.deepEqual(operacao?.effects, ['cria-pet']);
  });

  void it('operação sem `x-effects` tem lista vazia, e não `undefined`', () => {
    assert.deepEqual(contrato.operacoes.get('listarPets')?.effects, []);
  });

  void it('`x-rate-limit: []` NÃO conta como limite declarado', () => {
    assert.equal(contrato.operacoes.get('saude')?.hasRateLimit, false);
    assert.equal(contrato.operacoes.get('criarPet')?.hasRateLimit, true);
    assert.equal(contrato.operacoes.get('listarPets')?.hasRateLimit, false);
  });

  void it('`security` com alternativa pública guarda as DUAS coisas: os esquemas e a lista crua', () => {
    const operacao = contrato.operacoes.get('criarPet');
    assert.deepEqual(operacao?.securitySchemes, ['bearerAuth']);
    assert.equal(operacao?.security.length, 2);
    assert.deepEqual(operacao?.security[1], {});
  });
});

void describe('resolução de `$ref`', () => {
  void it('referência EXTERNA é recusada, e não buscada', () => {
    const contrato = carregarTexto(
      specComRequestBody(`$ref: "https://exemplo.invalid/outro.yaml#/components/schemas/Pet"`),
    );
    assert.throws(() => contrato.requestBodySchema('criarPet'), /externa não é suportada/);
  });

  void it('referência interna que não existe derruba, em vez de virar schema vazio', () => {
    const contrato = carregarTexto(
      specComRequestBody(`$ref: "#/components/schemas/NaoExiste"`, 'components:\n  schemas: {}\n'),
    );
    assert.throws(() => contrato.requestBodySchema('criarPet'), /não resolvida/);
  });

  void it('schema recursivo falha com mensagem, e não com a pilha estourada', () => {
    const contrato = carregarTexto(
      specComRequestBody(
        `$ref: "#/components/schemas/Ninho"`,
        `components:
  schemas:
    Ninho:
      type: object
      properties:
        filho: { $ref: "#/components/schemas/Ninho" }
`,
      ),
    );
    assert.throws(() => contrato.requestBodySchema('criarPet'), /recursivo/);
  });

  void it('o MESMO `$ref` em ramos irmãos NÃO é confundido com recursão', () => {
    const contrato = carregarTexto(
      specComRequestBody(
        `type: object
properties:
  especie: { $ref: "#/components/schemas/Especie" }
  especie_secundaria: { $ref: "#/components/schemas/Especie" }`,
        `components:
  schemas:
    Especie: { type: string, enum: [dog, cat] }
`,
      ),
    );

    const schema = comoObjeto(contrato.requestBodySchema('criarPet'));
    const props = comoObjeto(schema['properties']);
    assert.deepEqual(comoObjeto(props['especie'])['enum'], ['dog', 'cat']);
    assert.deepEqual(comoObjeto(props['especie_secundaria'])['enum'], ['dog', 'cat']);
  });

  void it('`$ref` dentro de lista (`oneOf`) também é resolvido', () => {
    const contrato = carregarTexto(
      specComRequestBody(
        `oneOf:
  - { $ref: "#/components/schemas/PorEmail" }
  - { type: object, properties: { telefone: { type: string } } }`,
        `components:
  schemas:
    PorEmail: { type: object, properties: { email: { type: string, format: email } } }
`,
      ),
    );
    const schema = comoObjeto(contrato.requestBodySchema('criarPet'));
    const alternativas = schema['oneOf'];
    assert.ok(Array.isArray(alternativas));
    const primeira = comoObjeto(alternativas[0]);
    assert.deepEqual(comoObjeto(comoObjeto(primeira['properties'])['email'])['format'], 'email');
  });

  void it('o ponteiro JSON desescapa `~1` e `~0`, senão nenhum `$ref` para um caminho resolve', () => {
    const contrato = carregarTexto(`${CABECALHO}paths:
  /v1/pets:
    post:
      operationId: criarPet
      security: []
      responses: { "201": { description: ok } }
`);
    assert.equal(
      resolverRefDoContrato(contrato.spec, '#/paths/~1v1~1pets/post/operationId'),
      'criarPet',
    );
  });

  void it('ponteiro que atravessa um escalar devolve `undefined`, e não o escalar do meio', () => {
    const contrato = carregarTexto(`${CABECALHO}paths:
  /pets:
    get:
      operationId: listarPets
      security: []
      responses: { "200": { description: ok } }
`);
    assert.equal(resolverRefDoContrato(contrato.spec, '#/info/title/qualquer'), undefined);
  });
});

void describe('conversão de OpenAPI para JSON Schema puro', () => {
  const contrato = carregarTexto(
    specComRequestBody(
      `type: object
additionalProperties: false
required: [name]
discriminator: { propertyName: kind }
example: { name: Rex }
x-origem: interna
properties:
  name:
    type: string
    minLength: 1
    maxLength: 60
    example: Rex
    deprecated: true
    readOnly: true
    externalDocs: { url: "https://exemplo.invalid" }
  breed_id:
    type: string
    format: uuid
    nullable: true
  peso:
    type: [number, integer]
    nullable: true
  apelido:
    type: [string, "null"]
    nullable: true`,
    ),
  );
  const schema = comoObjeto(contrato.requestBodySchema('criarPet'));
  const propriedades = comoObjeto(schema['properties']);

  void it('o vocabulário de OpenAPI sai do schema', () => {
    assert.equal('discriminator' in schema, false);
    assert.equal('example' in schema, false);
    assert.equal('x-origem' in schema, false);

    const name = comoObjeto(propriedades['name']);
    assert.equal('example' in name, false);
    assert.equal('deprecated' in name, false);
    assert.equal('readOnly' in name, false);
    assert.equal('externalDocs' in name, false);
  });

  void it('as RESTRIÇÕES sobrevivem à conversão — sem elas o corpo deixaria de ser validado', () => {
    assert.equal(schema['type'], 'object');
    assert.equal(schema['additionalProperties'], false);
    assert.deepEqual(schema['required'], ['name']);
    const name = comoObjeto(propriedades['name']);
    assert.equal(name['minLength'], 1);
    assert.equal(name['maxLength'], 60);
    assert.equal(comoObjeto(propriedades['breed_id'])['format'], 'uuid');
  });

  void it('`nullable: true` vira união com `null` e a palavra `nullable` some', () => {
    const breed = comoObjeto(propriedades['breed_id']);
    assert.deepEqual(breed['type'], ['string', 'null']);
    assert.equal('nullable' in breed, false);
  });

  void it('`nullable: true` sobre união já existente acrescenta `null` sem apagar os tipos', () => {
    assert.deepEqual(comoObjeto(propriedades['peso'])['type'], ['number', 'integer', 'null']);
  });

  void it('`null` já presente na união não é duplicado', () => {
    assert.deepEqual(comoObjeto(propriedades['apelido'])['type'], ['string', 'null']);
  });
});

void describe('palavra-chave de OpenAPI x NOME de campo', () => {
  const contrato = carregarTexto(
    specComRequestBody(
      `type: object
additionalProperties: false
required: [example, deprecated, readOnly, x-origem, $ref]
properties:
  example:
    type: string
  deprecated:
    type: boolean
  readOnly:
    type: string
  x-origem:
    type: string
  $ref:
    type: string`,
    ),
  );

  const schema = contrato.requestBodySchema('criarPet');

  void it('campo chamado como palavra-chave de OpenAPI sobrevive em `properties`', () => {
    const propriedades = comoObjeto(comoObjeto(schema)['properties']);
    for (const nome of ['example', 'deprecated', 'readOnly']) {
      assert.ok(
        nome in propriedades,
        `REPROVA: o campo '${nome}' sumiu de properties. Ele continua em ` +
          '`required` e `additionalProperties` e false, entao a rota recusa ' +
          'toda requisicao -- inclusive a correta.',
      );
    }
  });

  void it('campo com nome comecando em `x-` tambem sobrevive', () => {
    const propriedades = comoObjeto(comoObjeto(schema)['properties']);
    assert.ok('x-origem' in propriedades, 'REPROVA: campo `x-origem` descartado como extensao.');
  });

  void it('campo chamado `$ref` e nome, e nao referencia a resolver', () => {
    const propriedades = comoObjeto(comoObjeto(schema)['properties']);
    assert.ok('$ref' in propriedades, 'REPROVA: campo `$ref` tratado como referencia.');
    assert.equal(comoObjeto(propriedades['$ref'])['type'], 'string');
  });

  void it('e dentro do campo as palavras-chave CONTINUAM sendo descartadas', () => {
    const comAnotacao = carregarTexto(
      specComRequestBody(
        `type: object
properties:
  example:
    type: string
    example: abacaxi
    deprecated: true`,
      ),
    );
    const campo = comoObjeto(
      comoObjeto(comoObjeto(comAnotacao.requestBodySchema('criarPet'))['properties'])['example'],
    );
    assert.equal(campo['type'], 'string');
    assert.ok(!('example' in campo), 'REPROVA: anotacao `example` sobreviveu dentro do campo.');
    assert.ok(!('deprecated' in campo), 'REPROVA: anotacao `deprecated` sobreviveu.');
  });
});

void describe('schema de corpo de requisição', () => {
  const contrato = carregarTexto(`${CABECALHO}paths:
  /pets:
    post:
      operationId: criarPet
      security: []
      requestBody:
        content:
          application/json:
            schema: { type: object, properties: { name: { type: string } } }
      responses: { "201": { description: ok } }
  /pets/{petId}/photos:
    post:
      operationId: enviarFoto
      security: []
      requestBody:
        content:
          multipart/form-data:
            schema: { type: object, properties: { file: { type: string, format: binary } } }
      responses: { "201": { description: ok } }
  /sessions:
    delete:
      operationId: sair
      security: []
      responses: { "204": { description: ok } }
`);

  void it('operação FORA do contrato devolve `undefined`, e não um schema permissivo', () => {
    assert.equal(contrato.requestBodySchema('operacaoQueNaoExiste'), undefined);
  });

  void it('operação sem `requestBody` devolve `undefined`', () => {
    assert.equal(contrato.requestBodySchema('sair'), undefined);
  });

  void it('corpo que NÃO é `application/json` não é devolvido como se fosse', () => {
    assert.equal(contrato.requestBodySchema('enviarFoto'), undefined);
  });

  void it('duas leituras do mesmo corpo devolvem o mesmo schema', () => {
    const primeira = contrato.requestBodySchema('criarPet');
    const segunda = contrato.requestBodySchema('criarPet');
    assert.deepEqual(segunda, primeira);
    assert.deepEqual(primeira, { type: 'object', properties: { name: { type: 'string' } } });
  });
});

void describe('schema de resposta', () => {
  const contrato = carregarTexto(`${CABECALHO}paths:
  /pets:
    post:
      operationId: criarPet
      security: []
      responses:
        "201":
          description: criado
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Pet" }
        "204": { description: sem corpo }
        "409":
          description: conflito
          content:
            application/problem+json:
              schema: { type: object, properties: { type: { type: string } } }
        "410":
          description: sumiu
          content: {}
components:
  schemas:
    Pet: { type: object, properties: { id: { type: string, format: uuid } } }
`);

  void it('status NÃO declarado devolve `undefined`, e não o schema de outro status', () => {
    assert.equal(contrato.responseSchema('criarPet', '500'), undefined);
  });

  void it('operação fora do contrato devolve `undefined`', () => {
    assert.equal(contrato.responseSchema('operacaoQueNaoExiste', '200'), undefined);
  });

  void it('resposta sem corpo (204) devolve `undefined`', () => {
    assert.equal(contrato.responseSchema('criarPet', '204'), undefined);
  });

  void it('resposta com `content` vazio devolve `undefined`', () => {
    assert.equal(contrato.responseSchema('criarPet', '410'), undefined);
  });

  void it('`application/problem+json` é lido como qualquer outra mídia', () => {
    const schema = comoObjeto(contrato.responseSchema('criarPet', '409'));
    assert.deepEqual(comoObjeto(schema['properties'])['type'], { type: 'string' });
  });

  void it('`$ref` na resposta é resolvido para JSON Schema puro', () => {
    const schema = comoObjeto(contrato.responseSchema('criarPet', '201'));
    assert.deepEqual(schema, { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } });
  });
});

function specComParametro(parametroYaml: string): string {
  return `${CABECALHO}paths:
  /coisas:
    get:
      operationId: listarCoisas
      security: []
      parameters:
${parametroYaml
  .split('\n')
  .map((linha) => (linha === '' ? linha : `        ${linha}`))
  .join('\n')}
      responses:
        "200": { description: ok }
`;
}

void describe('isenção de palavra no esquema de borda', () => {
  void it('a palavra isenta SAI, e as outras ficam', () => {
    const contrato = carregarTexto(
      specComParametro(
        `- name: q
  in: query
  x-nao-recusado-na-borda: [minLength]
  schema: { type: string, minLength: 3, maxLength: 40 }`,
      ),
    );
    const propriedades = comoObjeto(
      contrato.parameterSchemas('listarCoisas').querystring?.['properties'],
    );
    assert.deepEqual(propriedades['q'], { type: 'string', maxLength: 40 });
  });

  void it('sem a chave, nada sai: o esquema é o do contrato', () => {
    const contrato = carregarTexto(
      specComParametro(
        `- name: q
  in: query
  schema: { type: string, minLength: 3, maxLength: 40 }`,
      ),
    );
    const propriedades = comoObjeto(
      contrato.parameterSchemas('listarCoisas').querystring?.['properties'],
    );
    assert.deepEqual(propriedades['q'], { type: 'string', minLength: 3, maxLength: 40 });
  });

  void it('ISCA: isentar palavra que o `schema` NÃO declara levanta', () => {
    const contrato = carregarTexto(
      specComParametro(
        `- name: q
  in: query
  x-nao-recusado-na-borda: [minlength]
  schema: { type: string, minLength: 3 }`,
      ),
    );
    assert.throws(
      () => contrato.parameterSchemas('listarCoisas'),
      /isenta `minlength`, que o `schema` do parâmetro não declara/,
      'uma isenção escrita errada passou calada, e é justamente o no-op silencioso ' +
        'que esta chave existe para não ter',
    );
  });

  void it('ISCA: lista vazia levanta, porque isentaria nada', () => {
    const contrato = carregarTexto(
      specComParametro(
        `- name: q
  in: query
  x-nao-recusado-na-borda: []
  schema: { type: string, minLength: 3 }`,
      ),
    );
    assert.throws(
      () => contrato.parameterSchemas('listarCoisas'),
      /precisa ser uma lista NÃO VAZIA/,
    );
  });

  void it('ISCA: valor que não é lista de texto levanta', () => {
    const contrato = carregarTexto(
      specComParametro(
        `- name: q
  in: query
  x-nao-recusado-na-borda: minLength
  schema: { type: string, minLength: 3 }`,
      ),
    );
    assert.throws(
      () => contrato.parameterSchemas('listarCoisas'),
      /precisa ser uma lista NÃO VAZIA/,
    );
  });
});

void describe('o contrato de verdade continua carregando', () => {
  const contrato = carregarContrato('api/openapi.yaml');

  void it('toda operação indexada declara `security` e tem caminho e método', () => {
    assert.ok(contrato.operacoes.size > 0);
    for (const operacao of contrato.operacoes.values()) {
      assert.ok(Array.isArray(operacao.security), `${operacao.operationId} sem security`);
      assert.ok(operacao.path.startsWith('/'));
    }
  });
});
