/**
 * Compara o corpo REAL de uma resposta com o schema que `api/openapi.yaml`
 * declara para ela.
 *
 * =========================================================================
 * O BURACO QUE ESTE ARQUIVO FECHA
 * =========================================================================
 *
 * Neste projeto **só o corpo da REQUISIÇÃO é validado** contra a
 * especificação: `corpoDe` entrega o schema ao Fastify, e requisição fora do
 * contrato leva 400. Do outro lado não havia nada. `Contrato.responseSchema`
 * existia desde o começo e **ninguém comparava nada contra ele** — ele era
 * lido em alguns testes para extrair a lista de `required` e conferir
 * presença, um por um, à mão.
 *
 * O resultado medido: em 28/10/2026 as duas operações de `options` de passkey
 * respondiam em camelCase (`rpId`, `userVerification`, `allowCredentials`)
 * contra um contrato que declara `rp_id`, `user_verification` e
 * `allow_credentials` — os três OBRIGATÓRIOS. Nenhum portão pegou. O app lia
 * `rp_id` nulo e a falha ficava indistinguível de "esta conta não tem
 * passkey". Esta classe de defeito já produziu mais de um defeito nesta casa,
 * e o nome que a memória dela usa é *"nada confere o corpo da resposta"*.
 *
 * =========================================================================
 * O QUE ESTE ARQUIVO É, E O QUE ELE NÃO É
 * =========================================================================
 *
 * Ele é uma FUNÇÃO, e não um portão: quem a chama é um caso de teste, que
 * mede a resposta de uma rota de verdade (`app.inject`) contra o schema de
 * verdade (`responseSchema`). Hoje quem a chama é
 * `modules/identity/adapters/http/passkey-grafia.test.ts`, e **só as duas
 * rotas de `options` de passkey estão cobertas**. O caso geral — toda rota
 * que emite corpo — fica EM ABERTO de propósito: uma isca estreita e provada
 * vale mais que a promessa larga, e ligá-la em massa descobriria divergências
 * em superfícies de outras frentes, que não se conserta de passagem.
 *
 * Ele também **não é um validador de JSON Schema**. Não há `ajv` nas
 * dependências declaradas deste projeto (o que existe em `node_modules` é
 * transitivo do Fastify, e depender de transitivo é depender do que ninguém
 * declarou). As palavras-chave cobertas são as que esta classe de defeito usa
 * — nome, tipo, `enum`, `required`, `items`, `maxItems` — e nada mais.
 * Aprovar aqui não é prova de conformidade total; REPROVAR aqui é prova de
 * divergência.
 *
 * =========================================================================
 * POR QUE CAMPO NÃO DECLARADO REPROVA
 * =========================================================================
 *
 * O contrato não escreve `additionalProperties: false` em quase nenhum
 * schema, então um validador de JSON Schema aprovaria `rpId` ao lado de
 * `rp_id`. É justamente o que não serve aqui: na divergência de grafia o
 * corpo tem o campo CERTO ausente **e** o errado presente, e quem lê o app vê
 * nulo. Então este comparador é ESTRITO sobre nomes, de propósito, e esse
 * rigor é o que faz a mensagem dizer `rpId` em voz alta.
 *
 * E ele vai um passo além: quando um nome não declarado vira, em
 * `snake_case`, um nome que o contrato DECLARA, o desvio diz isso. É a
 * diferença entre *"campo a mais"* e *"é a mesma palavra em outra grafia"* —
 * a segunda frase nomeia o defeito e a primeira faz procurar.
 */

export interface DesvioDeConformidade {
  /** Caminho do campo no corpo, como `user.display_name` ou `exclude_credentials[0]`. */
  readonly onde: string;
  readonly motivo: string;
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/** `pubKeyCredParams` -> `pub_key_cred_params`. */
function emSnakeCase(nome: string): string {
  return nome.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function nomeDoTipo(valor: unknown): string {
  if (valor === null) return 'null';
  if (Array.isArray(valor)) return 'array';
  if (Number.isInteger(valor)) return 'integer';
  return typeof valor;
}

function tipoCasa(declarado: string, valor: unknown): boolean {
  switch (declarado) {
    case 'object':
      return ehObjeto(valor);
    case 'array':
      return Array.isArray(valor);
    case 'null':
      return valor === null;
    case 'integer':
      return typeof valor === 'number' && Number.isInteger(valor);
    case 'number':
      return typeof valor === 'number';
    default:
      return typeof valor === declarado;
  }
}

function tiposDeclarados(schema: Record<string, unknown>): readonly string[] {
  const tipo = schema['type'];
  if (typeof tipo === 'string') return [tipo];
  if (Array.isArray(tipo)) return tipo.filter((t): t is string => typeof t === 'string');
  return [];
}

function conferir(
  valor: unknown,
  schema: unknown,
  onde: string,
  desvios: DesvioDeConformidade[],
): void {
  if (!ehObjeto(schema)) return;

  // `anyOf`/`oneOf` não são percorridos: um ramo que case esconderia o desvio
  // do outro, e decidir qual ramo valia exigiria o validador que este arquivo
  // declara não ser. Nenhum dos dois schemas de passkey os usa; o dia em que
  // um usar, isto fica em silêncio, e é por isso que está escrito aqui.
  if (schema['anyOf'] !== undefined || schema['oneOf'] !== undefined) return;

  const tipos = tiposDeclarados(schema);
  if (tipos.length > 0 && !tipos.some((tipo) => tipoCasa(tipo, valor))) {
    desvios.push({
      onde,
      motivo: `o contrato declara type ${tipos.join(' | ')} e o corpo trouxe ${nomeDoTipo(valor)}`,
    });
    // Tipo errado torna tudo abaixo ruído: um objeto esperado que veio string
    // produziria um desvio por campo obrigatório.
    return;
  }

  const enumerado = schema['enum'];
  if (Array.isArray(enumerado) && !enumerado.includes(valor)) {
    desvios.push({
      onde,
      motivo:
        `o contrato declara enum ${JSON.stringify(enumerado)} e o corpo trouxe ` +
        JSON.stringify(valor),
    });
  }

  if (Array.isArray(valor)) {
    const maximo = schema['maxItems'];
    if (typeof maximo === 'number' && valor.length > maximo) {
      desvios.push({
        onde,
        motivo: `o contrato declara maxItems ${String(maximo)} e o corpo trouxe ${String(valor.length)} item(ns)`,
      });
    }
    const itens = schema['items'];
    if (itens !== undefined) {
      valor.forEach((item, indice) => conferir(item, itens, `${onde}[${String(indice)}]`, desvios));
    }
    return;
  }

  if (!ehObjeto(valor)) return;

  const propriedades = ehObjeto(schema['properties']) ? schema['properties'] : undefined;
  const exigidos = Array.isArray(schema['required'])
    ? schema['required'].filter((n): n is string => typeof n === 'string')
    : [];

  for (const nome of exigidos) {
    if (!(nome in valor) || valor[nome] === undefined) {
      desvios.push({
        onde: onde === '' ? nome : `${onde}.${nome}`,
        motivo: 'o contrato declara este campo como OBRIGATÓRIO e o corpo não o trouxe',
      });
    }
  }

  if (propriedades === undefined) return;

  for (const [nome, filho] of Object.entries(valor)) {
    const caminho = onde === '' ? nome : `${onde}.${nome}`;
    if (!(nome in propriedades)) {
      const emGrafiaDoContrato = emSnakeCase(nome);
      const mesmaPalavra = emGrafiaDoContrato !== nome && emGrafiaDoContrato in propriedades;
      desvios.push({
        onde: caminho,
        motivo: mesmaPalavra
          ? `o corpo trouxe '${nome}' e o contrato declara '${emGrafiaDoContrato}': ` +
            'é a MESMA palavra em outra grafia. O consumidor lê o nome do ' +
            'contrato e recebe nulo, e a falha não se parece com um defeito.'
          : `o corpo trouxe '${nome}', que o contrato não declara`,
      });
      continue;
    }
    conferir(filho, propriedades[nome], caminho, desvios);
  }
}

/**
 * Os desvios do corpo em relação ao schema. Lista vazia é conformidade **nas
 * palavras-chave que este arquivo cobre** (ver o cabeçalho).
 *
 * ## Por que schema inútil LEVANTA em vez de aprovar
 *
 * Um schema que não declara `required` nem `properties` não tem contra o que
 * comparar, e compararia nada aprovando tudo: seria um caso verde que mede a
 * própria ausência. Esta casa já foi mordida por filtro que não casa nada e
 * devolve zero de tudo, então a ausência de matéria para medir é ERRO, com o
 * motivo escrito, e não um `[]` tranquilizador.
 */
export function desviosDaResposta(corpo: unknown, schema: unknown): readonly DesvioDeConformidade[] {
  if (!ehObjeto(schema)) {
    throw new Error(
      'Não há schema de resposta para comparar: `responseSchema` devolveu algo que não ' +
        'é um objeto. Ou a operação não declara corpo para este status no contrato, ou o ' +
        'status pedido está errado — e nos dois casos um caso que não compara nada é pior ' +
        'que nenhum caso.',
    );
  }
  const temPropriedades = ehObjeto(schema['properties']) && Object.keys(schema['properties']).length > 0;
  const temExigidos = Array.isArray(schema['required']) && schema['required'].length > 0;
  if (!temPropriedades && !temExigidos) {
    throw new Error(
      'O schema de resposta não declara `properties` nem `required`: não há contra o que ' +
        'comparar, e comparar contra nada aprovaria qualquer corpo. Confira o schema no ' +
        `contrato antes de confiar neste caso. Chaves do schema: ${Object.keys(schema).join(', ')}`,
    );
  }

  const desvios: DesvioDeConformidade[] = [];
  conferir(corpo, schema, '', desvios);
  return desvios;
}

/** Os desvios numa linha por desvio, para a mensagem de `assert`. */
export function desviosEmTexto(desvios: readonly DesvioDeConformidade[]): string {
  return desvios.map((d) => `  - ${d.onde}: ${d.motivo}`).join('\n');
}
