/** O ENDERECO COMERCIAL SAI; O ENDERECO DE PESSOA NAO — medido NO CONTRATO. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';

const contrato = readFileSync('api/openapi.yaml', 'utf8');
const spec = parseYaml(contrato) as {
  paths: Record<string, Record<string, { operationId?: string; security?: unknown[] }>>;
  components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
};

/** As quatro colunas de endereco de `professionals` (`20261018000001`). */
const AS_QUATRO = ['postal_code', 'street', 'street_number', 'complement'] as const;

function propriedadesDe(esquema: string): string[] {
  return Object.keys(spec.components.schemas[esquema]?.properties ?? {});
}

/** Todo schema de componente que declara ALGUM dos quatro, com quais. */
function esquemasComEndereco(): Record<string, string[]> {
  const achados: Record<string, string[]> = {};
  for (const [nome, esquema] of Object.entries(spec.components.schemas)) {
    const propriedades = Object.keys(esquema?.properties ?? {});
    const quais = AS_QUATRO.filter((campo) => propriedades.includes(campo));
    if (quais.length > 0) achados[nome] = quais;
  }
  return achados;
}

void describe('o endereco do profissional chega ao aplicativo', () => {
  void it('`DirectoryEntryDetail` declara OS QUATRO campos', () => {
    const propriedades = propriedadesDe('DirectoryEntryDetail');
    for (const campo of AS_QUATRO) {
      assert.ok(
        propriedades.includes(campo),
        `\`${campo}\` sumiu de \`DirectoryEntryDetail\`: o cliente pediu o endereco ` +
          'COMPLETO em 21/10/2026, e tres quartos de um endereco nao abrem mapa nenhum',
      );
    }
  });

  void it('os quatro sao NULAVEIS e nenhum e `required`', () => {
    const esquema = spec.components.schemas['DirectoryEntryDetail'] as {
      required?: string[];
      properties: Record<string, { nullable?: boolean }>;
    };
    for (const campo of AS_QUATRO) {
      assert.equal(
        esquema.properties[campo]?.nullable,
        true,
        `\`${campo}\` precisa ser nulavel: nulo e o estado normal da maioria das entradas`,
      );
      assert.ok(
        !(esquema.required ?? []).includes(campo),
        `\`${campo}\` virou obrigatorio: o APK publicado le esta resposta e nao o conhece`,
      );
    }
  });

  void it('o CEP sai na forma GRAVADA -- oito digitos, sem mascara', () => {
    const cep = spec.components.schemas['DirectoryEntryDetail']?.properties?.[
      'postal_code'
    ] as { pattern?: string };
    assert.equal(cep?.pattern, '^[0-9]{8}$');
  });

  void it('a operacao que os devolve EXIGE conta', () => {
    const operacao = spec.paths['/directory/entries/{slug}']?.['get'];
    assert.equal(operacao?.operationId, 'getDirectoryEntry');
    assert.deepEqual(operacao?.security, [{ bearerAuth: [] }]);
  });
});

void describe('o endereco do profissional NAO escorrega para outra superficie', () => {
  void it('ISCA DE FRONTEIRA -- `DirectoryEntrySummary` nao tem NENHUM dos quatro', () => {
    const propriedades = propriedadesDe('DirectoryEntrySummary');
    for (const campo of AS_QUATRO) {
      assert.ok(
        !propriedades.includes(campo),
        `\`${campo}\` apareceu no CARTAO da listagem: o cliente pediu o endereco na ` +
          'pagina do profissional, e vinte enderecos de porta por pagina de lista nao ' +
          'foram pedidos por tela nenhuma',
      );
    }
  });

  void it('ISCA DE VAZAMENTO -- o CONJUNTO de schemas com endereco e FECHADO', () => {
    assert.deepEqual(esquemasComEndereco(), {
      AdminDirectoryEntryInput: ['postal_code', 'street', 'street_number', 'complement'],
      AdminDirectoryEntryPatch: ['postal_code', 'street', 'street_number', 'complement'],
      AdminDirectoryEntry: ['postal_code', 'street', 'street_number', 'complement'],
      DirectoryEntryDetail: ['postal_code', 'street', 'street_number', 'complement'],
      DirectorySuggestionInput: ['postal_code'],
      PostalCodeAddress: ['street'],
      DeliveryAddress: ['postal_code', 'street', 'street_number', 'complement'],
    });
  });

  void it('ISCA DE VAZAMENTO -- `PersonProfile` continua sem endereco de qualquer forma', () => {
    const propriedades = propriedadesDe('PersonProfile');
    for (const campo of [...AS_QUATRO, 'address', 'city', 'neighborhood', 'state']) {
      assert.ok(
        !propriedades.includes(campo),
        `\`${campo}\` entrou em \`PersonProfile\`: abrir o endereco de uma ENTIDADE em ` +
          '21/10 nao abriu o de uma PESSOA, e as duas decisoes nao sao a mesma',
      );
    }
  });

  void it('ISCA DE VAZAMENTO -- toda referencia a `DeliveryAddress` e do DONO ou de quem despacha', () => {
    const referencias = contrato.match(/#\/components\/schemas\/DeliveryAddress\b/g) ?? [];

    assert.ok(
      propriedadesDe('CollarTagRequestInput').includes('delivery_address'),
      '`CollarTagRequestInput` perdeu `delivery_address`: o tutor deixou de escrever o proprio endereco',
    );
    assert.ok(
      propriedadesDe('AdminCollarTagRequest').includes('delivery_address'),
      '`AdminCollarTagRequest` perdeu `delivery_address`: quem despacha deixou de ver para onde enviar',
    );

    const meu = spec.components.schemas.MyDeliveryAddress;
    assert.ok(meu, '`MyDeliveryAddress` desapareceu do contrato');
    assert.deepEqual(
      Object.keys(meu.properties ?? {}),
      [],
      '`MyDeliveryAddress` ganhou campo PROPRIO. Ele foi autorizado como alias ' +
        'anulavel de `DeliveryAddress` e nada mais: campo proprio aqui e uma ' +
        'segunda definicao da residencia de um tutor, e a isca do conjunto ' +
        'fechado nao o pega justamente porque as `properties` eram vazias.',
    );

    const rota = spec.paths['/me/delivery-address'];
    assert.ok(rota, '`/me/delivery-address` desapareceu do contrato');
    for (const verbo of ['get', 'put'] as const) {
      const operacao: { operationId?: string; security?: unknown[] } | undefined =
        rota[verbo];
      assert.ok(operacao, `\`/me/delivery-address\` perdeu o \`${verbo}\``);
      assert.deepEqual(
        operacao.security,
        [{ bearerAuth: [] }],
        `\`${operacao.operationId ?? verbo}\` deixou de exigir conta. O endereco de ` +
          'casa de um tutor nao tem superficie publica, e uma alternativa vazia ' +
          'em `security` e exatamente como ela nasceria.',
      );
    }

    const doPet = spec.components.schemas.PetDeliveryAddress;
    assert.ok(doPet, '`PetDeliveryAddress` desapareceu do contrato');
    assert.deepEqual(
      Object.keys(doPet.properties ?? {}),
      [],
      '`PetDeliveryAddress` ganhou campo PROPRIO. Ele foi autorizado como alias ' +
        'anulavel de `DeliveryAddress` e nada mais -- mesma leitura de ' +
        '`MyDeliveryAddress`, acima: campo proprio aqui e uma segunda definicao ' +
        'da residencia de um tutor, e a isca do conjunto fechado nao o pega ' +
        'justamente porque as `properties` eram vazias.',
    );

    const rotaDoPet = spec.paths['/pets/{petId}/delivery-address'];
    assert.ok(rotaDoPet, '`/pets/{petId}/delivery-address` desapareceu do contrato');
    for (const verbo of ['get', 'put'] as const) {
      const operacao: { operationId?: string; security?: unknown[] } | undefined =
        rotaDoPet[verbo];
      assert.ok(operacao, `\`/pets/{petId}/delivery-address\` perdeu o \`${verbo}\``);
      assert.deepEqual(
        operacao.security,
        [{ bearerAuth: [] }],
        `\`${operacao.operationId ?? verbo}\` deixou de exigir conta. O endereco de ` +
          'casa de um tutor nao tem superficie publica, e uma alternativa vazia ' +
          'em `security` e exatamente como ela nasceria.',
      );
    }

    assert.equal(
      referencias.length,
      8,
      'apareceu uma referencia a `DeliveryAddress` que nao e nenhuma das oito ' +
        'nomeadas neste caso (duas do pedido de plaquinha, uma do alias ' +
        '`MyDeliveryAddress`, duas de `putMyDeliveryAddress`, uma do alias ' +
        '`PetDeliveryAddress` e duas de `putPetDeliveryAddress`). Toda nova ' +
        'superficie para a residencia de um tutor e decisao do cliente: ' +
        'nomeie-a aqui, com o motivo, ou tire-a do contrato.',
    );
  });
});
