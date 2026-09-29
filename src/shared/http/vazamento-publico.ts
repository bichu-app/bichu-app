/**
 * Detector de vazamento em resposta pública, para os testes das rotas sem conta.
 *
 * A regra do produto não tem exceção: **resposta pública nunca expõe telefone,
 * endereço, e-mail nem id interno do tutor** (ADR-0021, "resposta pública não
 * tem ramo privilegiado"; SEC-001; SEC-002). O portão `portao-contrato-publico`
 * confere o que o CONTRATO declara. Este arquivo confere o que a ROTA responde,
 * e as duas coisas divergem exatamente onde dói: propriedade a mais na resposta
 * não quebra cliente nenhum, então nenhum comparador de contrato a acusa.
 *
 * Quatro verificações, porque cada uma pega um defeito que as outras deixam
 * passar:
 *
 * 1. **Propriedade fora do contrato.** O corpo só pode ter as propriedades que o
 *    schema da resposta declara. É a que pega `owner_user_id` acrescentado "só
 *    para depurar", com qualquer nome.
 * 2. **Nome proibido em qualquer profundidade.** `email`, `phone`, `id`,
 *    `pet_id`... mesmo dentro de um objeto aninhado que o contrato declare.
 * 3. **Valor plantado.** O teste planta o e-mail, o telefone, o endereço e os
 *    UUIDs do tutor no que a porta devolve (inclusive dentro de texto livre), e
 *    nenhum deles pode aparecer no corpo. Telefone é comparado pelos oito
 *    últimos dígitos, porque `+55 11 98765-4321` e `87654321` escrito num
 *    recado são o mesmo número para quem liga, com ou sem DDI e DDD.
 * 4. **Qualquer UUID.** Superfície pública não carrega UUID nenhum (SEC-001: o
 *    UUIDv7 carrega o instante de criação), então um valor com forma de UUID é
 *    vazamento mesmo que ninguém o tenha plantado.
 *
 * O arquivo de teste deste detector carrega as iscas: um corpo que vaza de cada
 * um dos quatro jeitos, e a exigência de que cada um seja acusado. Detector que
 * não acusa a isca reprova a si mesmo.
 */

/** Nomes que não saem em resposta a quem não tem conta, em nenhuma profundidade. */
export const CHAVES_PROIBIDAS_EM_RESPOSTA_PUBLICA: ReadonlySet<string> = new Set([
  'id',
  'user_id',
  'owner_id',
  'owner_user_id',
  'tutor_id',
  'pet_id',
  'case_id',
  'tag_id',
  'email',
  'owner_email',
  'phone',
  'phone_e164',
  'owner_phone',
  'address',
  'street',
  'street_number',
  'house_number',
  'postal_code',
  'cep',
  'zip',
  'lat',
  'lon',
  'latitude',
  'longitude',
  'point',
  'coordinates',
  'last_seen_point',
  'last_seen_state',
]);

/**
 * O único UUID legítimo em corpo público: o `correlation_id` do Problem Details,
 * que identifica a REQUISIÇÃO no log e existe para a pessoa citar ao suporte.
 * Ele não aponta para registro nenhum do banco.
 */
const CAMPOS_COM_UUID_LEGITIMO: ReadonlySet<string> = new Set(['correlation_id']);

const FORMA_DE_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const DIGITOS_MINIMOS_DE_TELEFONE = 8;

export interface ValorPlantado {
  /** Para a mensagem: "e-mail do tutor", "UUID do pet". */
  readonly rotulo: string;
  readonly valor: string;
  /** Compara pelos oito últimos dígitos, sem pontuação. Para telefone. */
  readonly porDigitos?: true;
}

export interface AchadoDeVazamento {
  readonly onde: string;
  readonly motivo: string;
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/**
 * As propriedades que um schema de resposta declara, inclusive as que chegam por
 * `allOf` (`PublicLostCase` é `PublicLostPet` mais quatro campos).
 */
export function propriedadesDeclaradas(schema: unknown): ReadonlySet<string> {
  const nomes = new Set<string>();
  const visitar = (atual: unknown): void => {
    if (!ehObjeto(atual)) return;
    const propriedades = atual['properties'];
    if (ehObjeto(propriedades)) for (const nome of Object.keys(propriedades)) nomes.add(nome);
    const partes = atual['allOf'];
    if (Array.isArray(partes)) for (const parte of partes) visitar(parte);
  };
  visitar(schema);
  if (nomes.size === 0) {
    // Sem propriedade declarada não há contra o que comparar, e comparar contra
    // nada aprovaria qualquer corpo. Falha ruidosa, com o motivo.
    throw new Error(
      'O schema de resposta não declara propriedade nenhuma: o detector não tem ' +
        'contra o que comparar e reprova em vez de aprovar por omissão.',
    );
  }
  return nomes;
}

function digitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

function varrerChaves(valor: unknown, caminho: string, achados: AchadoDeVazamento[]): void {
  if (Array.isArray(valor)) {
    valor.forEach((item, indice) => varrerChaves(item, `${caminho}[${String(indice)}]`, achados));
    return;
  }
  if (!ehObjeto(valor)) return;
  for (const [chave, filho] of Object.entries(valor)) {
    const onde = caminho === '' ? chave : `${caminho}.${chave}`;
    if (CHAVES_PROIBIDAS_EM_RESPOSTA_PUBLICA.has(chave)) {
      achados.push({ onde, motivo: `nome proibido em resposta pública: '${chave}'` });
    }
    varrerChaves(filho, onde, achados);
  }
}

function varrerTextos(valor: unknown, caminho: string, visitar: (texto: string, onde: string) => void): void {
  if (typeof valor === 'string') {
    visitar(valor, caminho);
    return;
  }
  if (Array.isArray(valor)) {
    valor.forEach((item, indice) => varrerTextos(item, `${caminho}[${String(indice)}]`, visitar));
    return;
  }
  if (!ehObjeto(valor)) return;
  for (const [chave, filho] of Object.entries(valor)) {
    varrerTextos(filho, caminho === '' ? chave : `${caminho}.${chave}`, visitar);
  }
}

export function achadosDeVazamento(
  corpo: unknown,
  opcoes: {
    /** As propriedades do schema da resposta. Omitido para corpo de erro. */
    readonly declaradas?: ReadonlySet<string>;
    readonly plantados: readonly ValorPlantado[];
  },
): AchadoDeVazamento[] {
  const achados: AchadoDeVazamento[] = [];

  if (opcoes.declaradas !== undefined && ehObjeto(corpo)) {
    for (const chave of Object.keys(corpo)) {
      if (!opcoes.declaradas.has(chave)) {
        achados.push({ onde: chave, motivo: `propriedade que o contrato não declara: '${chave}'` });
      }
    }
  }

  varrerChaves(corpo, '', achados);

  varrerTextos(corpo, '', (texto, onde) => {
    if (FORMA_DE_UUID.test(texto) && !CAMPOS_COM_UUID_LEGITIMO.has(onde)) {
      achados.push({ onde, motivo: 'valor com forma de UUID em resposta pública' });
    }
    for (const plantado of opcoes.plantados) {
      const encontrado =
        plantado.porDigitos === true
          ? digitos(plantado.valor).length >= DIGITOS_MINIMOS_DE_TELEFONE &&
            digitos(texto).includes(digitos(plantado.valor).slice(-DIGITOS_MINIMOS_DE_TELEFONE))
          : texto.toLowerCase().includes(plantado.valor.toLowerCase());
      if (encontrado) achados.push({ onde, motivo: `${plantado.rotulo} apareceu na resposta` });
    }
  });

  return achados;
}
