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
 */
const CAMPOS_COM_UUID_LEGITIMO: ReadonlySet<string> = new Set(['correlation_id']);

const FORMA_DE_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const DIGITOS_MINIMOS_DE_TELEFONE = 8;

export interface ValorPlantado {
  /** Para a mensagem: "e-mail do tutor", "UUID do pet". */
  readonly rotulo: string;
  readonly valor: string;
  /** Compara pelos oito últimos dígitos, sem pontuação. */
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
    /** As propriedades do schema da resposta. */
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
