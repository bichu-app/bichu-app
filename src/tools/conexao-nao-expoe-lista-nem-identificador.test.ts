/**
 * **ISCA (b): A LISTA DE CONEXÕES DE TERCEIRO NÃO APARECE A NINGUÉM.** E
 * **ISCA (f): nenhum identificador interno sai em resposta.** As duas medidas
 * **no contrato**, que é onde elas podem ser provadas por omissão.
 *
 * ## ESTE PORTÃO FOI AJUSTADO EM 22/10/2026, POR DECISÃO DO CLIENTE
 *
 * Até 22/10/2026 ele cobrava que a lista de conexões não existisse **para
 * ninguém, nem para o dono** — e cobrava com razão, porque era essa a decisão do
 * cliente de 18/10/2026. **Ele emendou a própria decisão**, literal:
 *
 * > *"o usuário pode abrir a lista de usuários que é sua conexão"*
 *
 * **O ajuste é NOMEADO, e não um afrouxamento.** Uma operação foi aberta pelo
 * nome — `listMyConnections` (`GET /connections`) — e tudo o mais que este
 * arquivo cobrava continua cobrado, inteiro:
 *
 * | | antes de 22/10 | depois |
 * |---|---|---|
 * | a própria lista, para o próprio dono | **nunca** | **PODE** |
 * | a lista de **TERCEIRO** | **nunca** | **continua NUNCA** |
 * | identificador interno em saída | nunca | nunca |
 *
 * **Nenhum caso foi apagado.** O caso que afirmava a ausência de
 * `GET /connections` virou o caso que afirma que ele é `listMyConnections` e
 * **só** ele; e entraram casos NOVOS, que antes não tinham como existir: a lista
 * de terceiro não nasce por caminho endereçado a pessoa, `ConnectedPersonPage`
 * tem **uma** porta, e o recorte de cada pessoa na lista é o MESMO da busca.
 *
 * O desenho que ele defende hoje (a tabela 4-B do plano, com a emenda de
 * 22/10/2026 na primeira coluna):
 *
 * | | Sem conta | Com conta, sem conexão | Conectado | Bloqueado |
 * |---|---|---|---|---|
 * | Lista de conexões **de terceiro** | — | **nunca** | **nunca** | 404 |
 * | Lista das **próprias** conexões | — | **o dono, e só ele** | idem | — |
 *
 * Mora em `src/tools/` e não junto do módulo porque **lê `api/openapi.yaml` do
 * disco**, e o `eslint` deste repositório recusa `node:fs` em `domain/` — com
 * razão. Os vizinhos deste diretório fazem o mesmo.
 *
 * ## Por que assim, e não com um teste de comportamento
 *
 * As duas regras são de **omissão**. "Não existe lista de conexões" não se prova
 * chamando as cinco operações que existem: prova-se varrendo o contrato inteiro
 * e mostrando que **nenhuma** operação devolve um conjunto de pessoas
 * conectadas. Um caso que chamasse `listMyConnectionRequests` e achasse só
 * pendentes passaria igual num mundo em que uma sexta operação devolvesse a
 * lista.
 *
 * E é um teste que **envelhece bem**: ele reprova a operação que alguém
 * acrescentar amanhã, não a que existe hoje.
 *
 * ## Por que assim, e não com um teste de comportamento (continua valendo)
 *
 * A regra que sobrou é de **omissão**: "não existe lista de conexões de
 * terceiro" não se prova chamando as seis operações que existem — prova-se
 * varrendo o contrato inteiro e mostrando que **nenhuma** devolve um conjunto de
 * pessoas conectadas a outra pessoa.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

interface Operacao {
  readonly operationId?: string;
  readonly tags?: readonly string[];
  readonly security?: readonly Record<string, readonly string[]>[];
  readonly parameters?: readonly unknown[];
  readonly responses?: Record<string, unknown>;
}

interface Spec {
  readonly paths: Record<string, Record<string, Operacao>>;
  readonly components: {
    readonly schemas: Record<string, Record<string, unknown>>;
    readonly parameters: Record<string, Record<string, unknown>>;
  };
}

const textoDoContrato = readFileSync('api/openapi.yaml', 'utf8');
const spec = parse(textoDoContrato) as Spec;

const METODOS = ['get', 'post', 'put', 'patch', 'delete'] as const;

function operacoesDaConexao(): { caminho: string; metodo: string; operacao: Operacao }[] {
  const achadas: { caminho: string; metodo: string; operacao: Operacao }[] = [];
  for (const [caminho, item] of Object.entries(spec.paths)) {
    for (const metodo of METODOS) {
      const operacao = item[metodo];
      if (operacao === undefined) continue;
      if (operacao.tags?.includes('connections') === true) achadas.push({ caminho, metodo, operacao });
    }
  }
  return achadas;
}

/** Os nomes de schema que a família da conexão alcança, seguindo `$ref`. */
function schemasAlcancados(nomes: readonly string[]): Set<string> {
  const vistos = new Set<string>();
  const fila = [...nomes];
  while (fila.length > 0) {
    const nome = fila.pop() as string;
    if (vistos.has(nome)) continue;
    vistos.add(nome);
    const schema = spec.components.schemas[nome];
    if (schema === undefined) continue;
    for (const achado of JSON.stringify(schema).matchAll(/#\/components\/schemas\/(\w+)/g)) {
      fila.push(achado[1] as string);
    }
  }
  return vistos;
}

/**
 * As raízes da família da conexão. **`ConnectedPersonPage` entrou em
 * 22/10/2026** junto com `listMyConnections`, e entrar aqui não é detalhe de
 * lista: é o que põe a lista nova **debaixo** das conferências de identificador
 * interno deste arquivo, em vez de ao lado delas.
 */
const DA_CONEXAO = [
  'Connection',
  'ConnectionPerson',
  'ConnectionRequestPage',
  'ConnectionSummary',
  'ConnectedPersonPage',
];

/**
 * **As operações que a etiqueta `connections` tem, e as leituras que ela
 * permite.** Fechadas as duas, e o número é o mecanismo: é ele que faz uma
 * operação nova ser vista por alguém antes de nascer.
 */
const AS_SEIS = [
  'acceptConnection',
  'endConnection',
  'getMyConnectionSummary',
  'listMyConnectionRequests',
  // **ABERTA EM 22/10/2026, POR DECISÃO DO CLIENTE** -- *"o usuário pode abrir a
  // lista de usuários que é sua conexão"*. É a lista do PRÓPRIO DONO, e a de
  // terceiro continua não existindo: ver os três casos abaixo.
  'listMyConnections',
  'requestConnection',
];

/** As leituras (`GET`) que a etiqueta permite. Qualquer outra reprova. */
const LEITURAS_PERMITIDAS = [
  'listMyConnectionRequests',
  'getMyConnectionSummary',
  'listMyConnections',
];

/**
 * **Os cinco campos que uma pessoa mostra numa LISTA desta casa** — os de
 * `PersonSearchResult`, decididos em 20/10/2026 e emendados em 21/10/2026 (a
 * foto). `ConnectedPerson` tem de ter os MESMOS, e o caso que compara os dois é
 * o que torna "o mesmo limite" medido em vez de prometido.
 */
const CINCO_DA_LISTA = [
  'connections_count',
  'display_name',
  'handle',
  'pets_count',
  'photo_icon_url',
];

/**
 * Nomes de parâmetro de caminho que endereçam **uma pessoa**. Nenhuma operação
 * de conexão pode ter um: é por um deles que a lista de TERCEIRO nasceria.
 */
const ENDERECAM_PESSOA = ['handle', 'userRef', 'personRef', 'publicRef', 'nickname', 'userId'];

void describe('ISCA (b): não existe lista de conexões DE TERCEIRO em lugar nenhum', () => {
  /**
   * **SEIS desde 22/10/2026, e eram CINCO.** O número subiu por uma decisão do
   * cliente, nomeada na constante [AS_SEIS], e não por alguém ter afrouxado a
   * conferência: ela continua sendo igualdade de conjunto, então a SÉTIMA
   * reprova exatamente como a sexta reprovava ontem.
   */
  void it('são exatamente SEIS operações com a etiqueta `connections`', () => {
    const ids = operacoesDaConexao()
      .map(({ operacao }) => operacao.operationId ?? '')
      .sort();
    assert.deepEqual(ids, AS_SEIS);
  });

  /**
   * **ESTE CASO MUDOU EM 22/10/2026, POR DECISÃO DO CLIENTE.**
   *
   * Até essa data ele afirmava que `GET /connections` **não existia**, e a
   * mensagem dizia *"inclusive ao próprio dono"*. O cliente emendou a própria
   * decisão de 18/10/2026, literal:
   *
   * > *"o usuário pode abrir a lista de usuários que é sua conexão"*
   *
   * O caso **não foi apagado nem afrouxado para "aceita qualquer coisa"**. Ele
   * passou a cobrar a forma nova com a mesma precisão: `GET /connections`
   * existe, é `listMyConnections` e **nada mais** — um `operationId` diferente
   * nesse endereço é outra operação, e outra operação neste lugar é a lista que
   * ninguém decidiu.
   */
  void it('`GET /connections` é `listMyConnections`, a lista do PRÓPRIO DONO', () => {
    assert.equal(
      spec.paths['/connections']?.get?.operationId,
      'listMyConnections',
      '`GET /connections` é a lista das PRÓPRIAS conexões (cliente, 22/10/2026: ' +
        '"o usuário pode abrir a lista de usuários que é sua conexão"). Outro ' +
        '`operationId` neste endereço é uma operação que ninguém decidiu.',
    );
  });

  /**
   * **As LEITURAS da etiqueta são TRÊS, nomeadas** — e eram duas até
   * 22/10/2026, quando `listMyConnections` entrou por decisão do cliente.
   *
   * A conferência continua sendo pertencimento a uma lista FECHADA, e não "é
   * uma leitura conhecida": uma operação `GET` nova nesta etiqueta reprova aqui
   * **antes de existir**, e passa pela tabela 4-B — onde a lista de TERCEIRO
   * continua "nunca". O caso que havia aqui antes dizia a mesma coisa com a
   * lista escrita em linha; ela virou constante porque agora dois casos a usam.
   */
  void it('toda leitura de conexão está na lista FECHADA de três', () => {
    const leituras = operacoesDaConexao().filter(({ metodo }) => metodo === 'get');
    assert.equal(leituras.length, 3, 'são três leituras: as duas de 19/10 e a de 22/10');
    for (const { caminho, metodo, operacao } of leituras) {
      assert.ok(
        LEITURAS_PERMITIDAS.includes(operacao.operationId ?? ''),
        `${metodo.toUpperCase()} ${caminho} é uma leitura nova de conexão. ` +
          'Antes de existir, ela passa pela tabela 4-B: a lista de TERCEIRO é "nunca", ' +
          'e a emenda de 22/10/2026 abriu UMA operação, pelo nome.',
      );
    }
  });

  /**
   * **O caso que sustenta a metade NÃO emendada da decisão.**
   *
   * A emenda de 22/10/2026 abriu a lista do dono e **não** a de terceiro, e a
   * diferença é mecânica: a lista do dono é endereçada por **quem chama**, que
   * vem do `bearerAuth`, e a de terceiro precisaria de um parâmetro que nomeie
   * uma pessoa. Sem esse parâmetro ela não é exprimível — e é por isso que este
   * caso olha o PARÂMETRO, e não a prosa.
   */
  void it('nenhuma operação de conexão é endereçada a uma PESSOA', () => {
    for (const { caminho, metodo, operacao } of operacoesDaConexao()) {
      for (const parametro of operacao.parameters ?? []) {
        const { name, in: onde } = parametro as { name?: string; in?: string };
        if (name === undefined || onde !== 'path') continue;
        assert.ok(
          !ENDERECAM_PESSOA.includes(name),
          `${metodo.toUpperCase()} ${caminho} é endereçado por \`${name}\`, que nomeia uma ` +
            'PESSOA. A emenda do cliente de 22/10/2026 abriu a lista do PRÓPRIO DONO; ' +
            'a de terceiro continua "nunca", e é por um parâmetro assim que ela nasceria.',
        );
      }
      assert.doesNotMatch(
        caminho,
        /\{(handle|userRef|personRef|publicRef|nickname|userId)\}/,
        `${metodo.toUpperCase()} ${caminho} tem pessoa no caminho.`,
      );
    }
  });

  /**
   * **`ConnectedPersonPage` tem UMA porta, e esta é a conferência mais forte do
   * arquivo.** As duas de cima olham a etiqueta e o parâmetro; esta olha a
   * FORMA: onde quer que no contrato apareça uma página de pessoas conectadas,
   * a operação que a devolve tem de ser `listMyConnections`.
   *
   * É isso que fecha o caminho de fora da etiqueta — um `GET
   * /people/{handle}/connections` com etiqueta `people` passaria pelos dois
   * casos acima e reprova aqui.
   */
  void it('`ConnectedPersonPage` sai por `listMyConnections` e por mais nenhuma operação', () => {
    const portas: string[] = [];
    for (const [caminho, item] of Object.entries(spec.paths)) {
      for (const metodo of METODOS) {
        const operacao = item[metodo];
        if (operacao === undefined) continue;
        if (!JSON.stringify(operacao.responses ?? {}).includes('ConnectedPersonPage')) continue;
        portas.push(`${metodo.toUpperCase()} ${caminho} (${operacao.operationId ?? '?'})`);
      }
    }
    assert.deepEqual(
      portas,
      ['GET /connections (listMyConnections)'],
      'a lista de pessoas conectadas tem UMA porta, e ela é a do próprio dono. ' +
        'Uma segunda porta para a mesma forma é a lista de terceiro entrando por outra etiqueta.',
    );
  });

  /**
   * **DUAS coleções desde 22/10/2026, e eram UMA.** As duas são nomeadas, e as
   * razões são diferentes: a de pedidos existe porque "pedido recebido" é um
   * dos três caminhos que o desenho reconhece como relação, e sem saber quem
   * pediu não se decide nada; a de conexões aceitas existe porque **o cliente a
   * pediu em 22/10/2026**. Uma TERCEIRA reprova aqui.
   */
  void it('as coleções da família são DUAS, nomeadas: pedidos e as próprias conexões', () => {
    const colecoes = [...schemasAlcancados(DA_CONEXAO)]
      .filter((nome) => {
        const schema = spec.components.schemas[nome];
        return (
          schema !== undefined &&
          Object.prototype.hasOwnProperty.call(schema.properties ?? {}, 'items')
        );
      })
      .sort();
    assert.deepEqual(colecoes, ['ConnectedPersonPage', 'ConnectionRequestPage']);
  });

  /**
   * **O recorte da lista é o MESMO da busca, e isto é o que o torna medido.**
   *
   * O cliente autorizou a lista com o limite de `PersonSearchResult`: nome,
   * apelido, contagem de pets, contagem de conexões e a foto. Sem este caso,
   * "o mesmo limite" seria uma promessa de prosa, e o primeiro campo a mais
   * entraria em `ConnectedPerson` sem nada acusar — numa lista, e não numa
   * tela de uma pessoa.
   */
  void it('`ConnectedPerson` mostra exatamente os cinco campos de `PersonSearchResult`', () => {
    const daLista = Object.keys(spec.components.schemas.ConnectedPerson?.properties ?? {}).sort();
    const daBusca = Object.keys(spec.components.schemas.PersonSearchResult?.properties ?? {}).sort();
    assert.deepEqual(
      daLista,
      CINCO_DA_LISTA,
      'ser conexão aceita não abre campo nesta lista: o que o aceite abre está nas ' +
        'OUTRAS superfícies (vitrine, mural, perfil), cada uma com o próprio predicado.',
    );
    for (const campo of daLista) {
      assert.ok(
        daBusca.includes(campo),
        `\`ConnectedPerson.${campo}\` não existe em \`PersonSearchResult\`. O limite da ` +
          'lista é o da busca, e um campo só da lista é um limite novo que ninguém decidiu.',
      );
    }
  });

  /** **`ConnectedPerson` não carrega `ref` de aresta**: desfazer não mora na lista. */
  void it('a lista não traz `ref` de aresta nem `connection_state`', () => {
    const propriedades = Object.keys(spec.components.schemas.ConnectedPerson?.properties ?? {});
    for (const proibido of ['ref', 'connection_ref', 'connection_state', 'public_ref']) {
      assert.ok(
        !propriedades.includes(proibido),
        `\`ConnectedPerson\` tem \`${proibido}\`. Nesta lista \`connection_state\` seria a ` +
          'constante `connected` em toda linha, e `ref` poria o botão de desfazer numa ' +
          'lista que a pessoa rola com o polegar — quem desfaz abre o perfil.',
      );
    }
  });

  void it('o estado do app não tem valor de conexão aceita dentro da caixa de pedidos', () => {
    const estado = spec.components.schemas.ConnectionAppState as { enum?: readonly string[] };
    assert.deepEqual([...(estado.enum ?? [])].sort(), [
      'connected',
      'pending_received',
      'pending_sent',
    ]);
  });

  /**
   * **A ISCA DA LISTA DE TERCEIRO, e ela é o caso que prova que o ajuste de
   * 22/10/2026 não desligou nada.**
   *
   * A isca que estava aqui injetava `listMyConnections` — e ela deixou de medir
   * no dia em que o cliente autorizou aquela operação: a partir daí ela
   * afirmaria que a varredura enxerga algo que de fato existe, o que é
   * tautologia. **Ela foi RE-APONTADA, não apagada**, e aponta agora para a
   * metade da decisão que o cliente NÃO emendou: a lista de conexões de outra
   * pessoa.
   *
   * A injeção é a forma pela qual essa lista entraria de verdade — um caminho
   * endereçado por apelido, com a etiqueta da conexão — e a isca mostra que as
   * três conferências de cima a vêem: a contagem passa a SETE, o parâmetro de
   * pessoa aparece, e a página de pessoas conectadas ganha uma SEGUNDA porta.
   */
  void it('ISCA: a varredura REPROVA uma lista de conexões DE TERCEIRO injetada', () => {
    const deTerceiro: Operacao = {
      operationId: 'listPersonConnections',
      tags: ['connections'],
      parameters: [{ name: 'handle', in: 'path' }],
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ConnectedPersonPage' },
            },
          },
        },
      },
    };
    const comVazamento: Spec = {
      ...spec,
      paths: { ...spec.paths, '/people/{handle}/connections': { get: deTerceiro } },
    };

    // (1) a CONTAGEM a vê: seis passam a sete.
    const ids: string[] = [];
    for (const item of Object.values(comVazamento.paths)) {
      for (const metodo of METODOS) {
        const operacao = item[metodo];
        if (operacao?.tags?.includes('connections') === true) ids.push(operacao.operationId ?? '');
      }
    }
    assert.ok(
      ids.includes('listPersonConnections'),
      'a isca passou: a varredura não enxerga uma operação nova com a etiqueta `connections`.',
    );
    assert.equal(ids.length, 7, 'a varredura tem de contar sete quando alguém acrescentar a sétima');
    assert.notDeepEqual([...ids].sort(), AS_SEIS, 'a igualdade de conjunto tem de reprovar a sétima');

    // (2) o PARÂMETRO DE PESSOA a vê, e é por ele que a lista de terceiro nasce.
    const doCaminho = (deTerceiro.parameters ?? []).map(
      (parametro) => (parametro as { name?: string }).name ?? '',
    );
    assert.deepEqual(doCaminho, ['handle']);
    assert.ok(
      ENDERECAM_PESSOA.includes('handle'),
      'a isca passou: `handle` não está na lista de parâmetros que endereçam pessoa, ' +
        'então o caso que os proíbe não mede nada.',
    );

    // (3) a FORMA a vê: a página de pessoas conectadas ganharia uma SEGUNDA porta.
    const portas: string[] = [];
    for (const [caminho, item] of Object.entries(comVazamento.paths)) {
      for (const metodo of METODOS) {
        const operacao = item[metodo];
        if (operacao === undefined) continue;
        if (!JSON.stringify(operacao.responses ?? {}).includes('ConnectedPersonPage')) continue;
        portas.push(`${metodo.toUpperCase()} ${caminho} (${operacao.operationId ?? '?'})`);
      }
    }
    assert.equal(
      portas.length,
      2,
      'a isca passou: a conferência de porta única não enxerga uma segunda operação ' +
        'devolvendo `ConnectedPersonPage`.',
    );
  });
});

void describe('ISCA (f): nenhum identificador interno nas respostas de conexão', () => {
  void it('nenhum schema da família declara `format: uuid`', () => {
    for (const nome of schemasAlcancados(DA_CONEXAO)) {
      const schema = spec.components.schemas[nome];
      if (schema === undefined) continue;
      assert.doesNotMatch(
        JSON.stringify(schema),
        /"format"\s*:\s*"uuid"/,
        `\`${nome}\` declara um campo com \`format: uuid\`, e o ADR-0010 item 6 proíbe ` +
          'UUID interno em saída.',
      );
    }
  });

  void it('nenhum schema da família tem campo de conta, de id ou de autoria', () => {
    const PROIBIDOS = [
      'id',
      'user_id',
      'requester_user_id',
      'addressee_user_id',
      'author_user_id',
      'owner_user_id',
      'pair_low',
      'pair_high',
    ];
    for (const nome of schemasAlcancados(DA_CONEXAO)) {
      const propriedades = Object.keys(spec.components.schemas[nome]?.properties ?? {});
      for (const proibido of PROIBIDOS) {
        assert.ok(
          !propriedades.includes(proibido),
          `\`${nome}\` tem a propriedade \`${proibido}\`: o que identifica uma pessoa ` +
            'aqui é o apelido, e o que identifica a aresta é `ref`.',
        );
      }
    }
  });

  void it('`ConnectionRefParam` é opaco e NÃO é UUID', () => {
    const parametro = spec.components.parameters.ConnectionRefParam as {
      schema?: { format?: string; pattern?: string };
      description?: string;
    };
    assert.notEqual(parametro.schema?.format, 'uuid');
    assert.equal(parametro.schema?.pattern, '^[A-Za-z0-9_-]+$');
    assert.match(String(parametro.description), /nao e de uma pessoa/i);
  });

  void it('`Connection.ref` tem o mesmo formato opaco dos outros `ref` da casa', () => {
    const ref = (spec.components.schemas.Connection?.properties as Record<string, { pattern?: string; format?: string }>)
      .ref;
    assert.equal(ref?.pattern, '^[A-Za-z0-9_-]+$');
    assert.notEqual(ref?.format, 'uuid');
  });

  void it('ISCA: a varredura REPROVA um `format: uuid` acrescentado à família', () => {
    const comVazamento = {
      ...spec.components.schemas.Connection,
      properties: {
        ...(spec.components.schemas.Connection?.properties as Record<string, unknown>),
        person_id: { type: 'string', format: 'uuid' },
      },
    };
    assert.match(
      JSON.stringify(comVazamento),
      /"format"\s*:\s*"uuid"/,
      'a isca passou: a expressão não reconhece um `format: uuid`, então a ' +
        'conferência de cima não mede nada.',
    );
  });
});

void describe('nenhuma superfície de conexão é alcançável sem conta', () => {
  void it('as SEIS operações exigem `bearerAuth`, sem alternativa vazia', () => {
    for (const { caminho, metodo, operacao } of operacoesDaConexao()) {
      const seguranca = operacao.security ?? [];
      assert.ok(
        seguranca.length === 1 && Object.keys(seguranca[0] ?? {})[0] === 'bearerAuth',
        `${metodo.toUpperCase()} ${caminho} não exige conta. A coluna "sem conta" da ` +
          'tabela 4-B é vazia inteira, e isso é arquitetura e não escolha de tela.',
      );
    }
  });

  /**
   * **A busca de pessoas existe desde 20/10/2026, e este caso continua certo.**
   *
   * Ele não cobra que a busca não exista — ela existe, é `GET /v1/people`, da
   * etiqueta `people`, com os freios que o cliente listou. Ele cobra que **ela
   * não more nesta etiqueta**, e a diferença não é burocrática:
   *
   * - a etiqueta `connections` é fechada em cinco operações, e é esse número que
   *   faz uma sexta ser vista;
   * - a busca tem freios próprios (piso de três caracteres, teto `[account, q]`,
   *   recorte de resposta sem foto). Um `q` numa operação de conexão seria uma
   *   **segunda** busca, sem nenhum deles, chegando como parâmetro de uma rota
   *   que já existia — exatamente a forma pela qual uma superfície de enumeração
   *   entra sem ninguém decidir.
   *
   * `handle` continua na lista de proibidos **como PARÂMETRO**, e isso não
   * contradiz `requestConnection` aceitá-lo: lá ele é campo de **corpo**, numa
   * operação `POST`, coberto pelo caso do `oneOf` acima. Em query string ele
   * seria endereço de pessoa em URL — log de acesso, histórico e `Referer`.
   */
  void it('nenhuma operação de conexão aceita parâmetro de busca de pessoa', () => {
    const PROIBIDOS = ['q', 'handle', 'nickname', 'name', 'display_name', 'user', 'email', 'phone'];
    for (const { caminho, metodo, operacao } of operacoesDaConexao()) {
      for (const parametro of operacao.parameters ?? []) {
        const nome = (parametro as { name?: string }).name;
        if (nome === undefined) continue;
        assert.ok(
          !PROIBIDOS.includes(nome),
          `${metodo.toUpperCase()} ${caminho} aceita \`${nome}\`: seria uma SEGUNDA busca de ` +
            'pessoas, sem os freios da primeira (`GET /v1/people`), entrando como parâmetro ' +
            'de uma rota que já existia.',
        );
      }
    }
  });

  /**
   * **ESTE CASO MUDOU EM 20/10/2026, POR DECISÃO DO CLIENTE.**
   *
   * Até essa data ele cobrava que o corpo do pedido tivesse **um** campo e que
   * ele fosse um token — e cobrava com razão, porque a decisão de 18/10 era que
   * não existia caminho por apelido. O cliente reverteu:
   *
   * > *"vamos implementar a busca pelo usuário (...) e vamos implementar o link
   * > de convite"*
   *
   * O caso **não foi apagado nem afrouxado para "aceita qualquer coisa"**. Ele
   * passou a cobrar a forma nova com a mesma precisão: **exatamente duas**
   * credenciais, **exatamente uma por requisição** (`oneOf`), e corpo fechado.
   * O que ele defende agora é que não entre uma **terceira** — `public_ref`,
   * `user_id`, `email` ou `phone` — sem alguém decidir.
   */
  void it('o corpo do pedido aceita DUAS credenciais, e exatamente uma por vez', () => {
    const convite = spec.components.schemas.ConnectionInvite as {
      properties?: Record<string, unknown>;
      additionalProperties?: boolean;
      required?: readonly string[];
      oneOf?: readonly { required?: readonly string[] }[];
    };
    assert.deepEqual(
      Object.keys(convite.properties ?? {}).sort(),
      ['handle', 'invite_token'],
      'as credenciais são o token do convite (link e QR) e o apelido (busca). ' +
        'Uma terceira forma de endereçar pessoa é decisão do cliente, não detalhe de rota.',
    );
    // **`oneOf` e NAO `required`**: com `required: [invite_token, handle]` os
    // dois seriam obrigatorios, e sem `required` nenhum seria -- corpo vazio
    // viraria um pedido sem alvo. `oneOf` e a unica forma que recusa as duas
    // coisas erradas (os dois juntos, e nenhum dos dois).
    assert.deepEqual(
      (convite.oneOf ?? []).map((ramo) => [...(ramo.required ?? [])]).sort(),
      [['handle'], ['invite_token']],
      'sem `oneOf`, um corpo com as duas credenciais escolheria o caminho pela ' +
        'ordem do `if` da borda — e a procedência gravada em `origin` passaria a ' +
        'depender de qual ramo alguém escreveu primeiro.',
    );
    assert.equal(
      convite.required,
      undefined,
      '`required` no topo, junto com `oneOf`, tornaria a credencial listada ' +
        'obrigatória nos DOIS ramos — e o outro caminho deixaria de existir.',
    );
    assert.equal(
      convite.additionalProperties,
      false,
      'corpo aberto deixaria uma terceira forma de endereçar pessoa entrar sem ninguém decidir',
    );
  });

  /**
   * **ISCA do caso de cima**: sem ela, aquele caso passaria por o contrato ter
   * a forma certa hoje — e não por ele saber reconhecer a forma errada.
   */
  void it('ISCA: a conferência REPROVA uma terceira credencial no corpo do pedido', () => {
    const comVazamento = {
      ...spec.components.schemas.ConnectionInvite,
      properties: {
        ...(spec.components.schemas.ConnectionInvite?.properties as Record<string, unknown>),
        public_ref: { type: 'string' },
      },
    };
    assert.notDeepEqual(
      Object.keys(comVazamento.properties).sort(),
      ['handle', 'invite_token'],
      'a isca passou: a conferência não enxerga uma credencial nova no corpo do pedido.',
    );
  });

  void it('NÃO EXISTE "seguir": nenhum campo, valor ou operação de `follow`', () => {
    // A varredura é sobre NOME DE CAMPO, VALOR DE ENUM e `operationId` -- e não
    // sobre a prosa: a descrição de `ConnectionAppState` cita `following` de
    // propósito, para dizer que ele não existe, e uma varredura de texto puro
    // reprovaria exatamente a frase que documenta a ausência.
    for (const nome of schemasAlcancados(DA_CONEXAO)) {
      const schema = spec.components.schemas[nome];
      if (schema === undefined) continue;
      for (const campo of Object.keys(schema.properties ?? {})) {
        assert.doesNotMatch(campo, /follow/i, `\`${nome}.${campo}\` fala de seguir`);
      }
      for (const valor of (schema.enum ?? []) as readonly string[]) {
        assert.doesNotMatch(String(valor), /follow/i, `\`${nome}\` tem o valor \`${valor}\``);
      }
    }
    for (const { operacao } of operacoesDaConexao()) {
      assert.doesNotMatch(String(operacao.operationId), /follow/i);
    }
  });
});
