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

  void it('ISCA DE VAZAMENTO -- toda referencia a `DeliveryAddress` e do DONO ou de quem despacha', () => {
    // ESTA ISCA MUDOU DE FORMA NA ONDA 4, e nao de rigor.
    //
    // Ela contava `2` e passou a achar `5`. As tres novas sao da operacao
    // `/me/delivery-address`, que a frente do endereco guardado trouxe:
    // `putMyDeliveryAddress` (o corpo e a resposta `200`) e o `oneOf` de
    // `MyDeliveryAddress`, que e a resposta de `getMyDeliveryAddress`. As tres
    // tem `security: [bearerAuth]` sem alternativa vazia, e o `WHERE` compara
    // `user_id` com o portador do token: **sao o DONO lendo e escrevendo o
    // proprio endereco.** Nenhuma superficie de terceiro apareceu.
    //
    // **Subir o numero de 2 para 5 teria afrouxado a isca**: o que ela guarda
    // nao e a contagem, e que nenhuma superficie NOVA alcance a residencia de
    // um tutor. Numero e procuracao de invariante, e procuracao vence pelo
    // lado errado quando o numero muda. Entao ela passou a ancorar no CONJUNTO
    // NOMEADO, como a isca irma de `esquemasComEndereco` ja fazia: superficie
    // nova continua reprovando, e reprovando COM NOME.
    const referencias = contrato.match(/#\/components\/schemas\/DeliveryAddress\b/g) ?? [];

    // 1 e 2 -- o tutor escrevendo o pedido, e quem despacha a encomenda lendo.
    assert.ok(
      propriedadesDe('CollarTagRequestInput').includes('delivery_address'),
      '`CollarTagRequestInput` perdeu `delivery_address`: o tutor deixou de escrever o proprio endereco',
    );
    assert.ok(
      propriedadesDe('AdminCollarTagRequest').includes('delivery_address'),
      '`AdminCollarTagRequest` perdeu `delivery_address`: quem despacha deixou de ver para onde enviar',
    );

    // 3 -- `MyDeliveryAddress`, o alias ANULAVEL do proprio dono.
    //
    // Autorizado pelo cliente em 21/10/2026: alias anulavel de
    // `DeliveryAddress`, SEM campo proprio. Ele existe porque o `GET` devolve
    // `null` quando a conta nunca guardou endereco, e prosa nao gera tipo.
    // **E por ter `properties` vazias que a isca do CONJUNTO FECHADO acima nao
    // o acusa** -- e ela esta certa em nao acusar: ele nao acrescenta campo de
    // endereco a superficie nenhuma, so embrulha o schema que ja existia.
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

    // 4 e 5 -- `putMyDeliveryAddress`: corpo e resposta, as duas do dono.
    //
    // A conferencia que importa aqui nao e a contagem: e que as operacoes de
    // `/me/delivery-address` EXIJAM conta. `security` vazio ou ausente faria o
    // endereco de casa de um tutor virar superficie publica.
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

    // E O FECHO: cinco, e as cinco nomeadas acima. Uma sexta e superficie nova.
    assert.equal(
      referencias.length,
      5,
      'apareceu uma referencia a `DeliveryAddress` que nao e nenhuma das cinco ' +
        'nomeadas neste caso (duas do pedido de plaquinha, uma do alias ' +
        '`MyDeliveryAddress`, duas de `putMyDeliveryAddress`). Toda nova ' +
        'superficie para a residencia de um tutor e decisao do cliente: ' +
        'nomeie-a aqui, com o motivo, ou tire-a do contrato.',
    );
  });
});
