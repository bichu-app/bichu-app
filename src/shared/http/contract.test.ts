/**
 * `contract.ts` sob teste com documentos pequenos, montados caso a caso.
 *
 * Por que documentos montados aqui, e não `api/openapi.yaml`: o que este módulo
 * precisa provar é o que ele **recusa**, e a especificação de verdade é (por
 * construção) o caso que passa. Uma suíte que só a carrega prova que o contrato
 * bom carrega, e não prova nada sobre o contrato ruim — que é o único que chega
 * numa revisão. Cada caso abaixo é uma especificação com um defeito só, escrita
 * para que o defeito seja o motivo da reprovação.
 *
 * O carregador lê de disco (`readFileSync`), então os documentos vão para um
 * diretório temporário próprio, apagado no fim. Isso não é banco: é o mesmo
 * `parse` de YAML que roda em produção, sobre texto que o teste escolheu.
 */
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

/** Grava o texto e carrega, exatamente como a subida do servidor faria. */
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

/** Estreita `unknown` para objeto sem espalhar asserção de tipo pelos casos. */
function comoObjeto(valor: unknown): Record<string, unknown> {
  assert.ok(ehObjetoDoContrato(valor), `esperava um objeto e veio ${String(valor)}`);
  return valor;
}

const CABECALHO = 'openapi: 3.1.0\ninfo: { title: bichu, version: "1" }\n';

/** Operação mínima que carrega: tem `operationId` e declara `security`. */
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
    // Sem o `try/catch` deste módulo, o que sobe é um `YAMLParseError` sobre
    // linha e coluna, sem dizer de qual arquivo. Numa subida em produção isso
    // vira meia hora procurando qual dos documentos do repositório quebrou, e a
    // mensagem precisa dizer também que não é no código que se conserta.
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
    // `uniqueKeys` fica no padrão de propósito. Se ele fosse afrouxado, um
    // `security:` colado duas vezes na mesma operação faria a segunda vencer: a
    // especificação diria uma coisa para quem a lê na revisão e outra para quem
    // a carrega, e a rota rodaria com a autenticação que ninguém aprovou.
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
    // YAML aceita `- a\n- b` como documento inteiro. Sem esta guarda o acesso a
    // `spec['paths']` daria `undefined` e o erro seguinte seria "Contrato sem
    // `paths`", que manda a pessoa procurar o defeito no lugar errado.
    assert.throws(carregarTextoEsperandoFalha('- a\n- b\n'), /não é um documento YAML de mapa/);
  });

  void it('contrato sem `paths` é recusado', () => {
    assert.throws(carregarTextoEsperandoFalha(`${CABECALHO}components: {}\n`), /sem `paths`/);
  });

  void it('contrato com `paths` vazio é recusado: zero operações não é um contrato', () => {
    // Silêncio não é aprovação. Um `paths: {}` (por exemplo depois de um merge
    // que comeu o bloco) carregaria sem reclamar, o portão de contrato
    // conferiria zero operações e diria que está tudo certo.
    assert.throws(
      carregarTextoEsperandoFalha(`${CABECALHO}paths: {}\n`),
      /sem nenhuma operação/,
    );
  });

  void it('operação sem `operationId` derruba a carga em vez de sumir do índice', () => {
    // O `operationId` é a única costura entre a especificação e a rota. Se a
    // operação sem ele fosse apenas ignorada, ela desapareceria do índice e o
    // portão de contrato deixaria de conferir justamente a rota mal escrita — e
    // a rota continuaria servindo, sem ninguém a olhando.
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
    // O erro mais natural do arquivo inteiro: `security: [bearerAuth]`, sem os
    // dois-pontos e as chaves — porque `tags` e `x-effects` logo ao lado são
    // listas de texto e a mão escreve no automático.
    //
    // Antes de 18/09 isso passava: `Array.isArray` aceitava, o filtro de mapas
    // esvaziava, e o resultado era `security: []` — que este módulo documenta
    // como PÚBLICA. Uma rota escrita para exigir conta virava pública em
    // silêncio, e o portão que existe justamente para pegar rota
    // acidentalmente pública era enganado pela mesma leitura.
    //
    // Não havia nada errado escrito: havia a coisa certa escrita na forma
    // errada, que é o defeito que mais sobrevive a revisão.
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
    // A correção acima não pode ter engolido o caso legítimo. Lista vazia é a
    // declaração explícita de rota sem conta, e o produto tem 28 delas.
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
    // Este é o caso que o arquivo existe para pegar. Sem `security` na operação,
    // OpenAPI manda herdar o `security` global — e a rota some de qualquer
    // conferência que leia a declaração da operação. Uma rota que devia exigir
    // conta passa a valer o padrão global, e ninguém percebe porque não há nada
    // escrito errado: há algo não escrito.
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
    // A metade que fecha o caso acima. Se alguém "consertasse" a regra tratando
    // lista vazia como ausência, toda rota deliberadamente pública (a página do
    // QR, a sonda de saúde) deixaria de carregar e o produto não subiria.
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
    // O casamento entre rota registrada e operação é feito por `método caminho`.
    // Se o caminho fosse normalizado aqui (barra final, `{id}` virando `:id`), a
    // conferência de subida pararia de casar e passaria a aprovar por vacuidade.
    const operacao = contrato.operacoes.get('criarPet');
    assert.ok(operacao !== undefined);
    assert.equal(operacao.method, 'post');
    assert.equal(operacao.path, '/pets');
  });

  void it('caminho nulo e método nulo são ignorados em vez de derrubarem a carga', () => {
    // `/rascunho: ~` é o que sobra quando alguém abre o caminho e ainda não
    // escreveu a operação, e `get: ~` é o mesmo um nível abaixo. Sem as guardas
    // de objeto isso é um TypeError na subida do servidor, não uma mensagem — e
    // um rascunho esquecido num merge derrubaria a subida inteira.
    assert.equal(contrato.operacoes.has('listarPets'), true);
    assert.equal(contrato.operacoes.has('criarPet'), true);
    assert.equal(contrato.operacoes.has('saude'), true);
  });

  void it('só os cinco métodos com corpo/efeito entram no índice: `options` fica de fora', () => {
    // Deliberado, e precisa continuar deliberado. O índice existe para o portão
    // de subida casar rota registrada com operação; o Fastify registra HEAD
    // sozinho para cada GET e o preflight de CORS vem de plugin, nenhum dos dois
    // escrito à mão. Se `options`/`head` entrassem, o portão passaria a acusar
    // "rota fora do contrato" em rotas que ninguém escreveu, e a reprovação
    // ruidosa e falsa é o caminho mais curto para alguém desligar o portão.
    assert.equal(contrato.operacoes.has('preflight'), false);
    assert.equal(contrato.operacoes.size, 3);
  });

  void it('`x-effects` descarta o que não é string em vez de deixar passar', () => {
    // Um número ou um mapa dentro de `x-effects` é erro de escrita da
    // especificação. Deixá-lo entrar espalharia o valor estranho para quem
    // consome a lista de efeitos, e o defeito apareceria longe daqui.
    const operacao = contrato.operacoes.get('criarPet');
    assert.deepEqual(operacao?.effects, ['cria-pet']);
  });

  void it('operação sem `x-effects` tem lista vazia, e não `undefined`', () => {
    assert.deepEqual(contrato.operacoes.get('listarPets')?.effects, []);
  });

  void it('`x-rate-limit: []` NÃO conta como limite declarado', () => {
    // A lista vazia é a forma de dizer "este bloco existe e não declara nada".
    // Contá-la como limite faria a sonda de saúde parecer protegida por um
    // limitador que não existe — e o que se perde é justamente a chance de
    // notar que falta limite na rota que apanha primeiro num pico.
    assert.equal(contrato.operacoes.get('saude')?.hasRateLimit, false);
    assert.equal(contrato.operacoes.get('criarPet')?.hasRateLimit, true);
    assert.equal(contrato.operacoes.get('listarPets')?.hasRateLimit, false);
  });

  void it('`security` com alternativa pública guarda as DUAS coisas: os esquemas e a lista crua', () => {
    // `[{bearerAuth: []}, {}]` quer dizer "autenticação opcional". Quem só olha
    // `securitySchemes` vê `['bearerAuth']` e conclui "exige conta" — conclusão
    // errada, e é por isso que a lista crua continua aqui. Achatar sem guardar o
    // original apagaria a diferença entre exigir e aceitar.
    const operacao = contrato.operacoes.get('criarPet');
    assert.deepEqual(operacao?.securitySchemes, ['bearerAuth']);
    assert.equal(operacao?.security.length, 2);
    assert.deepEqual(operacao?.security[1], {});
  });
});

void describe('resolução de `$ref`', () => {
  void it('referência EXTERNA é recusada, e não buscada', () => {
    // Um `$ref` para outro arquivo ou para uma URL transformaria o carregamento
    // da especificação em leitura de algo de fora do repositório: o que valida o
    // corpo das requisições passaria a depender de um documento que ninguém
    // revisou junto. A recusa é explícita para que a tentação não passe calada.
    const contrato = carregarTexto(
      specComRequestBody(`$ref: "https://exemplo.invalid/outro.yaml#/components/schemas/Pet"`),
    );
    assert.throws(() => contrato.requestBodySchema('criarPet'), /externa não é suportada/);
  });

  void it('referência interna que não existe derruba, em vez de virar schema vazio', () => {
    // Este é o defeito caro: `$ref` apontando para um schema renomeado resolve
    // para `undefined`. Sem a checagem, o Fastify receberia "sem schema" e a
    // rota passaria a aceitar QUALQUER corpo — validação desligada numa rota de
    // escrita, sem nenhum sinal.
    const contrato = carregarTexto(
      specComRequestBody(`$ref: "#/components/schemas/NaoExiste"`, 'components:\n  schemas: {}\n'),
    );
    assert.throws(() => contrato.requestBodySchema('criarPet'), /não resolvida/);
  });

  void it('schema recursivo falha com mensagem, e não com a pilha estourada', () => {
    // Expansão de `$ref` é literal: um schema que se referencia expandiria para
    // sempre. A diferença entre as duas falhas é prática — `RangeError: Maximum
    // call stack size exceeded` na subida não diz qual schema, e a mensagem diz.
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
    // A metade que fecha o caso acima, e a que pega o defeito de verdade: a
    // guarda precisa ser o caminho percorrido, não um conjunto de "já vistos".
    // Se virar "já vistos", reusar `#/components/schemas/Especie` em dois
    // campos do mesmo corpo — coisa banal numa especificação — derruba a subida
    // inteira acusando recursão onde não há.
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
    // `#/paths/~1v1~1pets/post` é a forma normal de apontar para uma operação:
    // a barra do caminho PRECISA vir escapada. Sem o desescape, o segmento
    // procurado seria a chave literal `~1v1~1pets`, que não existe, e a
    // referência resolveria para `undefined` — que é o mesmo buraco do caso
    // "referência não resolvida", só que disfarçado de erro de escrita.
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
    // `#/info/title/qualquer` passa por uma string. Devolver a string seria pior
    // que devolver nada: um `$ref` mal escrito entregaria `"bichu"` como se
    // fosse um schema, e o validador aceitaria o que desse.
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
    // `discriminator`, `example` e as extensões `x-` não são JSON Schema. O
    // Ajv do Fastify roda em modo estrito: palavra desconhecida no schema é
    // exceção no REGISTRO da rota, ou seja, o servidor não sobe. Fora do modo
    // estrito é pior — a palavra é ignorada em silêncio e quem escreveu acha
    // que declarou alguma coisa.
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
    // A metade obrigatória do caso acima. Uma "limpeza" que levasse junto
    // `minLength`, `required` ou `additionalProperties` não quebraria nenhum
    // teste de rota: a rota continuaria respondendo, aceitando nome vazio,
    // corpo sem nome e campo desconhecido. O estrago aparece no banco, depois.
    assert.equal(schema['type'], 'object');
    assert.equal(schema['additionalProperties'], false);
    assert.deepEqual(schema['required'], ['name']);
    const name = comoObjeto(propriedades['name']);
    assert.equal(name['minLength'], 1);
    assert.equal(name['maxLength'], 60);
    assert.equal(comoObjeto(propriedades['breed_id'])['format'], 'uuid');
  });

  void it('`nullable: true` vira união com `null` e a palavra `nullable` some', () => {
    // `nullable` é forma de OpenAPI 3.0 e não existe em JSON Schema. Deixá-la
    // passar faz o validador enxergar só `type: string` e recusar `null` num
    // campo que a especificação declara anulável: o tutor que tenta APAGAR a
    // raça do pet (mandando `breed_id: null`) leva 400 e não consegue.
    const breed = comoObjeto(propriedades['breed_id']);
    assert.deepEqual(breed['type'], ['string', 'null']);
    assert.equal('nullable' in breed, false);
  });

  void it('`nullable: true` sobre união já existente acrescenta `null` sem apagar os tipos', () => {
    assert.deepEqual(comoObjeto(propriedades['peso'])['type'], ['number', 'integer', 'null']);
  });

  void it('`null` já presente na união não é duplicado', () => {
    // `['string','null','null']` é aceito pelo Ajv, mas é lixo que vaza para a
    // documentação gerada e para os tipos gerados de `openapi-typescript`.
    assert.deepEqual(comoObjeto(propriedades['apelido'])['type'], ['string', 'null']);
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
    // Se um `operationId` errado devolvesse `{}`, a rota seria registrada com um
    // schema que aceita tudo. O `undefined` obriga quem chama a decidir; um
    // objeto vazio decidiria por ele, e decidiria errado.
    assert.equal(contrato.requestBodySchema('operacaoQueNaoExiste'), undefined);
  });

  void it('operação sem `requestBody` devolve `undefined`', () => {
    assert.equal(contrato.requestBodySchema('sair'), undefined);
  });

  void it('corpo que NÃO é `application/json` não é devolvido como se fosse', () => {
    // O envio de foto é `multipart/form-data`. Entregar o schema do multipart
    // para o validador de JSON faria o Fastify recusar todo upload — ou, pior,
    // validar bytes com regras de campo de texto.
    assert.equal(contrato.requestBodySchema('enviarFoto'), undefined);
  });

  void it('duas leituras do mesmo corpo devolvem o mesmo schema', () => {
    // O schema é lido na subida (registro da rota) e de novo pelo portão de
    // contrato. Se as duas leituras divergissem, o que o portão confere não
    // seria o que valida a requisição — e a conferência viraria enfeite.
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
    // Cair para "algum schema" é o defeito que faz o serializador do Fastify
    // podar campos usando as regras da resposta errada. Um 500 serializado com o
    // schema do 201 sai com o corpo vazio e o app não tem o que mostrar.
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
    // Todo erro do produto responde `application/problem+json` (RFC 9457). Se a
    // busca fosse fixada em `application/json`, NENHUMA resposta de erro teria
    // schema, e é justamente o corpo de erro que o app usa para decidir o que
    // fazer com o usuário.
    const schema = comoObjeto(contrato.responseSchema('criarPet', '409'));
    assert.deepEqual(comoObjeto(schema['properties'])['type'], { type: 'string' });
  });

  void it('`$ref` na resposta é resolvido para JSON Schema puro', () => {
    const schema = comoObjeto(contrato.responseSchema('criarPet', '201'));
    assert.deepEqual(schema, { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } });
  });
});

void describe('o contrato de verdade continua carregando', () => {
  // Um caso só, e de propósito: os documentos montados acima provam as regras;
  // este prova que `api/openapi.yaml` ainda passa por todas elas. Se este cair
  // sozinho, o defeito está na especificação, não neste módulo.
  const contrato = carregarContrato('api/openapi.yaml');

  void it('toda operação indexada declara `security` e tem caminho e método', () => {
    assert.ok(contrato.operacoes.size > 0);
    for (const operacao of contrato.operacoes.values()) {
      assert.ok(Array.isArray(operacao.security), `${operacao.operationId} sem security`);
      assert.ok(operacao.path.startsWith('/'));
    }
  });
});
