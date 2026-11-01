export interface DesvioDeConformidade {
  /** Caminho do campo no corpo, como `user.display_name` ou `exclude_credentials[0]`. */
  readonly onde: string;
  readonly motivo: string;
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

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

  if (schema['anyOf'] !== undefined || schema['oneOf'] !== undefined) return;

  const tipos = tiposDeclarados(schema);
  if (tipos.length > 0 && !tipos.some((tipo) => tipoCasa(tipo, valor))) {
    desvios.push({
      onde,
      motivo: `o contrato declara type ${tipos.join(' | ')} e o corpo trouxe ${nomeDoTipo(valor)}`,
    });
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

/** Os desvios do corpo em relação ao schema. */
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
