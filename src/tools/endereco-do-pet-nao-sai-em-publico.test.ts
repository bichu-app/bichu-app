/**
 * O ENDERECO DE ENTREGA DO PET NAO SAI EM SUPERFICIE PUBLICA, NAO APARECE EM
 * LISTA E NAO E LIDO POR OUTRA CONTA — medido no CONTRATO e na CONSULTA.
 *
 * ## A decisao que este arquivo protege
 *
 * O cliente pediu em **27/10/2026**: *"o endereco de entrega da plaquinha tem
 * que estar dentro do cadastro do pet"* e, com a decisao anterior dele posta na
 * mesa, *"endereco um por pet"*. Ela **supera** a de **21/10/2026** (*"um
 * endereco de entrega salvo na conta, reusado em todo pedido e editavel num
 * lugar so"*), que criou `user_delivery_addresses`.
 *
 * O que ele autorizou foi o endereco MUDAR DE DONO, e nao uma superficie nova
 * de dado pessoal. **Isto continua sendo a RESIDENCIA do usuario**, a mais
 * estreita das tres posturas de endereco deste produto — o irmao deste arquivo,
 * `endereco-guardado-nao-sai-em-publico.test.ts`, lista as tres.
 *
 * ## O QUE ESTE ARQUIVO MEDE, e o que o irmao dele ja media
 *
 * A varredura das operacoes alcancaveis **sem conta** contra os nove campos de
 * `DeliveryAddress` ja existe no irmao, e ela cobre o contrato INTEIRO — as
 * operacoes novas desta frente incluidas, porque ela parte das operacoes
 * publicas e nao de uma lista de rotas conhecidas. Repeti-la aqui seria uma
 * segunda redacao da mesma medida.
 *
 * O que ela **nao** cobre, e e por isso que este arquivo existe:
 *
 * 1. **`Pet` e `PetInput` nao carregam campo de endereco.** As duas sao
 *    projetadas com conta, entao a varredura publica nunca as visita — mas
 *    `Pet` sai em `listMyPets`, que e LISTA. O endereco dentro de `Pet` faria a
 *    residencia do tutor sair na abertura do aplicativo, multiplicada pelo
 *    numero de pets dele. O cabecalho da `20261020000016` fixou a regra
 *    inversa: *"quem quer o endereco faz JOIN, e quem nao faz nao o tem em
 *    maos"*;
 * 2. **as duas rotas novas exigem `bearerAuth` sem alternativa vazia**;
 * 3. **todo acesso a `pet_delivery_addresses` carrega o DONO DO PET e
 *    `deleted_at IS NULL` na mesma sentenca**;
 * 4. **as duas listas de colunas do repositorio nomeiam as mesmas nove.**
 *    `sql<LinhaDoEndereco>` e asserção e nao conferencia: acrescentar coluna a
 *    uma lista e esquecer a outra deixa o `tsc` verde e chega `undefined` em
 *    tempo de execucao.
 *
 * ## O CONTROLE POSITIVO E OBRIGATORIO em cada caso
 *
 * Uma varredura que nao acha nada e uma varredura cega saem com a mesma cor —
 * e e a regra do ADR-0027 item 12.12. Entao cada caso abaixo prova primeiro que
 * **enxerga** o campo onde ele esta, antes de afirmar que ele nao esta onde nao
 * deveria. Sem isso, renomear `DeliveryAddress` deixaria este arquivo verde e
 * cego para sempre.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';

const CAMINHO_DA_SPEC = 'api/openapi.yaml';
const CAMINHO_DO_REPOSITORIO =
  'src/modules/tags/adapters/persistence/kysely-endereco-do-pet.ts';
const CAMINHO_DA_PORTA = 'src/modules/tags/ports/endereco-do-pet.ts';

/** A tabela do endereco do pet. Uma constante porque os casos a procuram. */
const TABELA = 'pet_delivery_addresses';

/**
 * Os NOVE campos do endereco, pelos nomes que o contrato usa. Lista FECHADA, e
 * a MESMA do irmao deste arquivo — de proposito: e o mesmo `DeliveryAddress`, e
 * uma segunda lista com outros nomes seria a segunda fonte para divergir.
 *
 * O caso `a lista dos nove campos e a de `DeliveryAddress`` compara esta lista
 * com as propriedades do schema e reprova quando elas divergem. Sem ele, um
 * decimo campo nasceria **fora** da varredura e vazaria sem nada ficar vermelho.
 */
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
    // CONTROLE POSITIVO DE TUDO O QUE VEM ABAIXO. Se `DeliveryAddress` ganhar
    // um décimo campo, ou for renomeado, este caso reprova — e sem ele os casos
    // seguintes passariam medindo uma lista que não descreve mais o endereço.
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
      // CONTROLE POSITIVO: o caminhador enxerga ESTE schema. Sem isto, um
      // `allOf` que ele não soubesse resolver devolveria lista vazia e o caso
      // aprovaria qualquer coisa.
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
    // CONTROLE POSITIVO: as duas existem. Renomear uma operação não pode
    // transformar este caso em aprovação por ausência.
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
    // Os dois vazios são diferentes e a tela os desenha diferente: `null` fala
    // do ENDEREÇO (pet sem endereço, 200) e 404 fala do PET (não é seu, não
    // existe, excluído — nunca 403, ADR-0021). Um `DeliveryAddress` não-anulável
    // aqui faria o cliente gerado quebrar em TODO pet cadastrado depois da
    // `20261027000001`.
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

  /**
   * UMA FATIA POR SENTENÇA que vai ao banco. O corte é `.execute(deps.db)`, e
   * o caso abaixo CONTA as fatias: corte no lugar errado produz fatia vazia, e
   * portão que varre fatia vazia aprova tudo. Em 21/10/2026 um portão deste
   * projeto cortou uma consulta no lugar errado e ficou cego para o resto.
   */
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
    // O texto é limpo de comentários antes de medir: este arquivo EXPLICA em
    // prosa por que não há `SELECT *`, e um portão que mede a prosa em vez do
    // código fica vermelho para sempre — ou verde para sempre, se alguém
    // escrever o código dentro de um comentário.
    const semComentarios = repositorio
      .replace(/\/\*[\s\S]*?\*\//gu, ' ')
      .replace(/\/\/[^\n]*/gu, ' ');

    // CONTROLE POSITIVO DA LIMPEZA: se ela comesse o código junto, tudo abaixo
    // passaria por não ter sobrado nada para olhar.
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
    // `sql<LinhaDoEndereco>` é asserção e NÃO conferência. Acrescentar coluna a
    // uma das listas e esquecer a outra deixa o `tsc` verde e faz o campo
    // chegar `undefined` em tempo de execução — foi exatamente esse o defeito
    // que a mescla de 18/10 produziu em `kysely-pedido-de-plaquinha.ts`.
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
    // CONTROLE POSITIVO: as duas têm nove nomes. Uma expressão regular que não
    // casasse devolveria lista vazia, e `deepEqual([], [])` aprovaria.
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
    // **O TEXTO É LIMPO DE COMENTÁRIO ANTES DE MEDIR, e a primeira versão deste
    // caso reprovou por não fazer isso.** A porta EXPLICA em prosa por que não
    // existe uma assinatura `doTutor(chamador): Promise<Endereco[]>` — e o
    // portão leu a explicação como se fosse o código, exatamente o modo de
    // falhar que o caso irmão em `endereco-guardado-nao-sai-em-publico.test.ts`
    // já documenta: um portão que não descarta comentário mede a PROSA e não o
    // CÓDIGO, e fica vermelho para sempre (ou verde para sempre, se alguém
    // escrever o código dentro de um comentário).
    const porta = readFileSync(CAMINHO_DA_PORTA, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//gu, ' ')
      .replace(/\/\/[^\n]*/gu, ' ');

    // CONTROLE POSITIVO DA LIMPEZA: se ela comesse o código junto, tudo abaixo
    // passaria por não ter sobrado nada para olhar.
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
