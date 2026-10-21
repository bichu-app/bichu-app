/**
 * O ENDERECO COMERCIAL SAI; O ENDERECO DE PESSOA NAO — medido NO CONTRATO.
 *
 * Mora em `src/tools/` e nao junto da projecao porque **le `api/openapi.yaml` do
 * disco**, e `domain/` nao conhece arquivo (o `eslint` deste repositorio recusa
 * `node:fs` ali). Os vizinhos deste diretorio fazem o mesmo.
 *
 * ## A decisao que este arquivo fixa
 *
 * Em 21/10/2026 o cliente pediu *"o endereco completo do profissional"*, para a
 * pessoa tocar no endereco e abrir o aplicativo de mapas. As quatro colunas
 * (`postal_code`, `street`, `street_number`, `complement`) existiam em
 * `professionals` desde `20261018000001` e NENHUMA saida as projetava — a
 * propria migracao escreveu por que: *"exibir endereco completo e decisao do
 * cliente, e ela nao foi tomada"*. Foi tomada, e `DirectoryEntryDetail` abriu.
 *
 * ## Por que isto NAO e emenda ao teto de bairro-e-cidade do ADR-0010
 *
 * A secao 4 do ADR-0011 separa os dois casos: *"a pagina do tutor e uma pessoa
 * que nao pediu para ser achada; o perfil do profissional e uma entidade que
 * aceitou aparecer para ser contratada"*. O `phone_e164` comercial ja saia por
 * esta mesma rota, pela mesma razao.
 *
 * **E e exatamente por isso que o arquivo mede os dois lados.** Uma decisao que
 * abre o endereco de uma ENTIDADE nao abre o de uma PESSOA, e a unica forma de
 * uma regra de omissao continuar valendo e varrer o contrato inteiro e provar
 * que ninguem mais declara os quatro campos.
 *
 * ## O que este arquivo NAO consegue medir
 *
 * O corpo real da resposta. Ele le o contrato declarado; que o manipulador
 * devolva de fato as quatro colunas e medido em
 * `professionals/adapters/http/directory-routes.test.ts`, e que a LISTAGEM nao
 * as selecione, em `entrada-do-diretorio.test.ts` e na consulta.
 */
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
    // Profissional autonomo -- adestrador, passeador, veterinario que atende em
    // casa -- nao tem endereco comercial, e a migracao deixou as quatro
    // anulaveis exatamente para ele continuar cadastravel sem publicar onde
    // mora. Exigi-las aqui tambem quebraria o APK em campo, que nao as conhece.
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
    // Duas formas do mesmo CEP no mesmo produto e o defeito que a duplicacao
    // produz. A mascara vive na tela, como no painel.
    const cep = spec.components.schemas['DirectoryEntryDetail']?.properties?.[
      'postal_code'
    ] as { pattern?: string };
    assert.equal(cep?.pattern, '^[0-9]{8}$');
  });

  void it('a operacao que os devolve EXIGE conta', () => {
    // E o que separa esta decisao de uma emenda ao ADR-0010: o endereco
    // comercial sai para quem tem conta, como o `phone_e164` comercial ja saia.
    const operacao = spec.paths['/directory/entries/{slug}']?.['get'];
    assert.equal(operacao?.operationId, 'getDirectoryEntry');
    assert.deepEqual(operacao?.security, [{ bearerAuth: [] }]);
  });
});

void describe('o endereco do profissional NAO escorrega para outra superficie', () => {
  void it('ISCA DE FRONTEIRA -- `DirectoryEntrySummary` nao tem NENHUM dos quatro', () => {
    // O cartao de `Perto` responde "existe e fica perto" com bairro, cidade e
    // UF. Endereco de porta em ate vinte cartoes alarga a superficie sem
    // nenhuma tela pedindo -- a mesma decisao de `photo_url`, que tambem so
    // existe no detalhe.
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
    // Ancora no CONJUNTO e nao em "nao contem X": lista de proibidos falha
    // exatamente no schema que ninguem previu, e falha para verde. Superficie
    // de endereco nova e decisao do cliente, e e aqui que ela aparece.
    assert.deepEqual(esquemasComEndereco(), {
      // O PAINEL escreve e le as quatro desde 18/10/2026 (`20261018000001`).
      AdminDirectoryEntryInput: ['postal_code', 'street', 'street_number', 'complement'],
      AdminDirectoryEntryPatch: ['postal_code', 'street', 'street_number', 'complement'],
      AdminDirectoryEntry: ['postal_code', 'street', 'street_number', 'complement'],
      // O APLICATIVO, desde 21/10/2026 -- a decisao que este arquivo fixa.
      DirectoryEntryDetail: ['postal_code', 'street', 'street_number', 'complement'],
      // A INDICACAO da comunidade: quem indica um estabelecimento pode mandar
      // o CEP dele. E entrada, nao saida, e e de entidade.
      DirectorySuggestionInput: ['postal_code'],
      // A BUSCA DE CEP do painel, que poupa digitacao. Devolve logradouro de
      // um CEP, e nao o endereco de ninguem.
      PostalCodeAddress: ['street'],
      // O ENDERECO DE ENTREGA DA PLAQUINHA, e ele e de PESSOA -- a unica
      // residencia que este contrato carrega. Ele sai em dois lugares e so
      // dois: `CollarTagRequestInput`, onde o proprio tutor o escreve, e
      // `AdminCollarTagRequest`, onde quem despacha a encomenda o le. Nenhuma
      // rota de terceiro o alcanca, e nada na decisao de 21/10 o toca.
      DeliveryAddress: ['postal_code', 'street', 'street_number', 'complement'],
    });
  });

  void it('ISCA DE VAZAMENTO -- `PersonProfile` continua sem endereco de qualquer forma', () => {
    // A pagina de um tutor e "uma pessoa que nao pediu para ser achada"
    // (ADR-0011 secao 4). O teto de bairro-e-cidade do ADR-0010 e limite de
    // PRECISAO, e nunca foi permissao de dizer onde alguem mora.
    const propriedades = propriedadesDe('PersonProfile');
    for (const campo of [...AS_QUATRO, 'address', 'city', 'neighborhood', 'state']) {
      assert.ok(
        !propriedades.includes(campo),
        `\`${campo}\` entrou em \`PersonProfile\`: abrir o endereco de uma ENTIDADE em ` +
          '21/10 nao abriu o de uma PESSOA, e as duas decisoes nao sao a mesma',
      );
    }
  });

  void it('ISCA DE VAZAMENTO -- `DeliveryAddress` e referenciado em DOIS lugares, e os dois sao o dono ou quem despacha', () => {
    const referencias = contrato.match(/#\/components\/schemas\/DeliveryAddress\b/g) ?? [];
    assert.equal(
      referencias.length,
      2,
      'uma terceira referencia e uma terceira superficie para a residencia de um tutor',
    );
    assert.ok(propriedadesDe('CollarTagRequestInput').includes('delivery_address'));
    assert.ok(propriedadesDe('AdminCollarTagRequest').includes('delivery_address'));
  });
});
