/**
 * O ENDERECO DE ENTREGA DO PET NAO SAI EM SUPERFICIE PUBLICA, NAO APARECE EM LISTA
 * E NAO E LIDO POR OUTRA CONTA — medido no CONTRATO e na CONSULTA.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';

const CAMINHO_DA_SPEC = 'api/openapi.yaml';
const CAMINHO_DO_REPOSITORIO =
  'src/modules/tags/adapters/persistence/kysely-endereco-do-pet.ts';
const CAMINHO_DA_PORTA = 'src/modules/tags/ports/endereco-do-pet.ts';

/** A tabela do endereco do pet. */
const TABELA = 'pet_delivery_addresses';

/** Os NOVE campos do endereco, pelos nomes que o contrato usa. */
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

/** As duas operacoes que esta frente acrescentou. */
const OPERACOES_NOVAS = ['getPetDeliveryAddress', 'putPetDeliveryAddress'] as const;

interface OperacaoBruta {
  readonly operationId?: string;
  readonly security?: readonly Record<string, unknown>[];
}

interface Spec {
  readonly paths: Record<string, Record<string, OperacaoBruta>>;
  readonly components: { readonly schemas: Record<string, unknown> };
}

const spec = parseYaml(readFileSync(CAMINHO_DA_SPEC, 'utf8')) as Spec;

const METODOS = ['get', 'put', 'post', 'patch', 'delete'] as const;

function operacoes(): Map<string, OperacaoBruta> {
  const achadas = new Map<string, OperacaoBruta>();
  for (const porCaminho of Object.values(spec.paths)) {
    for (const metodo of METODOS) {
      const operacao = porCaminho[metodo];
      if (operacao?.operationId !== undefined) achadas.set(operacao.operationId, operacao);
    }
  }
  return achadas;
}

/** As propriedades de um schema, resolvendo `allOf` um nivel. */
function propriedadesDe(nome: string): readonly string[] {
  const schema = spec.components.schemas[nome] as
    | {
        properties?: Record<string, unknown>;
        allOf?: readonly { $ref?: string; properties?: Record<string, unknown> }[];
      }
    | undefined;
  assert.ok(schema !== undefined, `o schema \`${nome}\` nao existe mais no contrato`);
  const nomes = new Set(Object.keys(schema.properties ?? {}));
  for (const parte of schema.allOf ?? []) {
    for (const chave of Object.keys(parte.properties ?? {})) nomes.add(chave);
    const ref = parte.$ref;
    if (ref !== undefined) {
      const referido = ref.split('/').pop();
      if (referido !== undefined && referido !== nome) {
        for (const chave of propriedadesDe(referido)) nomes.add(chave);
      }
    }
  }
  return [...nomes].sort();
}

void describe('o endereço de entrega do pet não sai em público nem em lista', () => {
  void it('a lista dos nove campos é a de `DeliveryAddress`', () => {
    assert.deepEqual(
      propriedadesDe('DeliveryAddress'),
      [...CAMPOS_DO_ENDERECO],
      'as propriedades de `DeliveryAddress` divergem da lista deste arquivo. Um ' +
        'campo de endereço fora desta lista nasce FORA de toda varredura abaixo',
    );
  });

  void it('`Pet` e `PetInput` não carregam campo de endereço — `Pet` sai em lista', () => {
    for (const schema of ['Pet', 'PetInput']) {
      const propriedades = propriedadesDe(schema);
      assert.ok(
        propriedades.includes('name') && propriedades.includes('species'),
        `o caminhador não enxerga as propriedades de \`${schema}\`: não achou ` +
          `\`name\` nem \`species\`, que estão lá. A conferência abaixo estaria ` +
          `varrendo uma lista vazia`,
      );
      for (const campo of CAMPOS_DO_ENDERECO) {
        assert.ok(
          !propriedades.includes(campo),
          `ISCA DE VAZAMENTO: \`${schema}\` declara \`${campo}\`. \`Pet\` é a ` +
            `projeção de \`listMyPets\`, que é LISTA: a residência do tutor ` +
            `passaria a sair na abertura do aplicativo, multiplicada pelo número ` +
            `de pets. O endereço do pet é sub-recurso próprio ` +
            `(\`/pets/{petId}/delivery-address\`) exatamente por isso`,
        );
      }
    }
  });

  void it('as duas operações novas exigem `bearerAuth` sem alternativa vazia', () => {
    const achadas = operacoes();
    for (const operationId of OPERACOES_NOVAS) {
      const operacao = achadas.get(operationId);
      assert.ok(
        operacao !== undefined,
        `a operação \`${operationId}\` não está no contrato. Este arquivo ` +
          `aprovaria por ausência`,
      );
      const seguranca = operacao.security ?? [];
      assert.equal(
        seguranca.length,
        1,
        `\`${operationId}\` declara ${seguranca.length} alternativas de ` +
          `segurança. Mais de uma abre a porta de uma alternativa VAZIA, que é ` +
          `como uma rota de residência passa a ser alcançável sem conta`,
      );
      assert.deepEqual(
        Object.keys(seguranca[0] ?? {}),
        ['bearerAuth'],
        `\`${operationId}\` não exige \`bearerAuth\`. O endereço do pet é a ` +
          `residência do tutor, e só ele o lê`,
      );
    }
  });

  void it('`getPetDeliveryAddress` responde o alias ANULÁVEL, e declara 404', () => {
    const bruto = readFileSync(CAMINHO_DA_SPEC, 'utf8');
    assert.match(
      bruto,
      /operationId: getPetDeliveryAddress[\s\S]{0,2000}?PetDeliveryAddress/u,
      '`getPetDeliveryAddress` não responde `PetDeliveryAddress`. Sem o alias ' +
        'anulável, o pet sem endereço quebra o cliente gerado',
    );
    assert.match(
      bruto,
      /operationId: getPetDeliveryAddress[\s\S]{0,2000}?responses\/NotFound/u,
      '`getPetDeliveryAddress` não declara 404. Pet de outra pessoa não é 403 — ' +
        'ele não existe (ADR-0021), e sem o 404 declarado a tela não tem o que desenhar',
    );
  });
});

void describe('a consulta do endereço do pet carrega o dono e não lê em lista', () => {
  const repositorio = readFileSync(CAMINHO_DO_REPOSITORIO, 'utf8');

  /** UMA FATIA POR SENTENÇA que vai ao banco. */
  const fatias = repositorio.split('.execute(deps.db)').slice(0, -1);

  void it('o corte da consulta é onde eu digo que é, e nenhuma fatia é cega', () => {
    assert.equal(
      fatias.length,
      3,
      `o portão esperava TRÊS sentenças no banco (o dono em \`doPetDoChamador\`, ` +
        `a leitura do endereço e o \`INSERT\` de \`guardarNoPet\`) e achou ` +
        `${fatias.length}. Um acesso novo ao banco não está sendo conferido por ` +
        `nenhum caso deste arquivo`,
    );
    for (const [indice, fatia] of fatias.entries()) {
      assert.ok(
        fatia.includes('FROM pets p') || fatia.includes('JOIN pets p'),
        `a fatia ${indice} não menciona \`pets\`. O corte está no lugar errado — ` +
          `e as conferências abaixo estão olhando para o lugar errado`,
      );
    }
  });

  void it('TODO acesso carrega o DONO DO PET e `deleted_at IS NULL`', () => {
    for (const [indice, fatia] of fatias.entries()) {
      assert.match(
        fatia,
        /p\.owner_user_id = \$\{chamador\}::uuid/u,
        `ISCA DE VAZAMENTO: a sentença ${indice} vai ao banco sem ` +
          `\`p.owner_user_id = \${chamador}\`. A autorização deste endereço mora ` +
          `na cláusula \`WHERE\` (ADR-0021), e um \`WHERE\` que falta devolve — ou ` +
          `sobrescreve — a residência de outra pessoa`,
      );
      assert.match(
        fatia,
        /p\.deleted_at IS NULL/u,
        `a sentença ${indice} não exige \`p.deleted_at IS NULL\`. Pet excluído ` +
          `não pede plaquinha, e ler ou escrever o endereço dele é superfície que ` +
          `ninguém decidiu abrir`,
      );
    }
  });

  void it('nenhum acesso lê a tabela inteira nem pagina', () => {
    const semComentarios = repositorio
      .replace(/\/\*[\s\S]*?\*\//gu, ' ')
      .replace(/\/\/[^\n]*/gu, ' ');

    assert.ok(
      semComentarios.includes(`INSERT INTO ${TABELA}`),
      'a remoção de comentários comeu o código junto: o `INSERT INTO ' +
        `${TABELA}\` não está mais no texto medido, e as conferências abaixo ` +
        'olham para o vazio',
    );
    assert.ok(
      semComentarios.includes(`FROM ${TABELA} d`),
      `a remoção de comentários comeu o \`SELECT\` de \`${TABELA}\`. Ver acima`,
    );

    assert.ok(
      !/SELECT\s+\*|SELECT\s+d\.\*|RETURNING\s+\*/u.test(semComentarios),
      'estrela no repositório do endereço do pet: cada coluna futura passaria a ' +
        'atravessar a borda por omissão, e `updated_at` já seria uma delas',
    );
    assert.ok(
      !/\bLIMIT\b|\bOFFSET\b|ORDER BY/u.test(semComentarios),
      'paginação ou ordenação no repositório do endereço do pet. A leitura ' +
        'devolve no máximo UMA linha, porque `pet_id` é a chave primária — ' +
        'paginar aqui só faria sentido para ler o endereço de mais de um pet',
    );
  });

  void it('as duas listas de colunas nomeiam as mesmas nove', () => {
    const colunasDe = (nome: string): readonly string[] => {
      const bloco = new RegExp(`const ${nome} = sql\`([^\`]*)\``, 'u').exec(repositorio);
      assert.ok(bloco !== null, `a lista \`${nome}\` não existe mais no repositório`);
      return (bloco[1] ?? '')
        .split(',')
        .map((coluna) => coluna.trim().replace(/^d\./u, ''))
        .filter((coluna) => coluna !== '')
        .sort();
    };
    const comApelido = colunasDe('COLUNAS_DO_ENDERECO');
    const semApelido = colunasDe('COLUNAS_DO_ENDERECO_GRAVADO');
    assert.equal(comApelido.length, 9, `\`COLUNAS_DO_ENDERECO\` tem ${comApelido.length} colunas`);
    assert.deepEqual(
      comApelido,
      semApelido,
      'as duas listas de colunas do repositório divergem. A do `RETURNING` não ' +
        'pode levar apelido (não há apelido em escopo ali), e é por isso que são ' +
        'duas — mas elas têm de nomear as MESMAS nove',
    );
    assert.deepEqual(
      comApelido,
      [...CAMPOS_DO_ENDERECO],
      'as colunas do repositório não são os nove campos de `DeliveryAddress`. ' +
        'Divergência aqui faz o endereço do pet nascer capaz de produzir um ' +
        'pedido que o banco recusa',
    );
  });

  void it('a porta não tem assinatura que leia pet de terceiro nem vários pets', () => {
    const porta = readFileSync(CAMINHO_DA_PORTA, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//gu, ' ')
      .replace(/\/\/[^\n]*/gu, ' ');

    assert.ok(
      porta.includes('EnderecoDoPetRepository'),
      'a remoção de comentários comeu o código junto: a interface não está mais ' +
        'no texto medido, e as conferências abaixo olham para o vazio',
    );

    const assinaturas = [...porta.matchAll(/^\s{2}([a-zA-Z]+)\(\s*$|^\s{2}([a-zA-Z]+)\(([^)]*)/gmu)]
      .map((m) => ({ metodo: m[1] ?? m[2] ?? '', parametros: (m[3] ?? '').trim() }))
      .filter((a) => a.metodo !== '');
    assert.deepEqual(
      assinaturas.map((a) => a.metodo).sort(),
      ['doPetDoChamador', 'guardarNoPet'],
      'a porta do endereço do pet ganhou ou perdeu método. Qualquer leitura nova ' +
        'aqui é superfície nova da residência do usuário — e uma que receba só o ' +
        'chamador devolveria os endereços de TODOS os pets dele',
    );
    assert.ok(
      !/\bPromise<readonly |\[\]>/u.test(porta),
      'a porta do endereço do pet declara um retorno em lista. Uma assinatura ' +
        'que devolva vários endereços é o atalho pelo qual a residência do tutor ' +
        'passa a sair na abertura do aplicativo',
    );
  });
});
