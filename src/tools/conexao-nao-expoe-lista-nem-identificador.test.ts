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

const DA_CONEXAO = [
  'Connection',
  'ConnectionPerson',
  'ConnectionRequestPage',
  'ConnectionSummary',
  'ConnectedPersonPage',
];

const AS_SEIS = [
  'acceptConnection',
  'endConnection',
  'getMyConnectionSummary',
  'listMyConnectionRequests',
  'listMyConnections',
  'requestConnection',
];

const LEITURAS_PERMITIDAS = [
  'listMyConnectionRequests',
  'getMyConnectionSummary',
  'listMyConnections',
];

const CINCO_DA_LISTA = [
  'connections_count',
  'display_name',
  'handle',
  'pets_count',
  'photo_icon_url',
];

const ENDERECAM_PESSOA = ['handle', 'userRef', 'personRef', 'publicRef', 'nickname', 'userId'];

void describe('ISCA (b): não existe lista de conexões DE TERCEIRO em lugar nenhum', () => {
  void it('são exatamente SEIS operações com a etiqueta `connections`', () => {
    const ids = operacoesDaConexao()
      .map(({ operacao }) => operacao.operationId ?? '')
      .sort();
    assert.deepEqual(ids, AS_SEIS);
  });

  void it('`GET /connections` é `listMyConnections`, a lista do PRÓPRIO DONO', () => {
    assert.equal(
      spec.paths['/connections']?.get?.operationId,
      'listMyConnections',
      '`GET /connections` é a lista das PRÓPRIAS conexões (cliente, 22/10/2026: ' +
        '"o usuário pode abrir a lista de usuários que é sua conexão"). Outro ' +
        '`operationId` neste endereço é uma operação que ninguém decidiu.',
    );
  });

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

    const doCaminho = (deTerceiro.parameters ?? []).map(
      (parametro) => (parametro as { name?: string }).name ?? '',
    );
    assert.deepEqual(doCaminho, ['handle']);
    assert.ok(
      ENDERECAM_PESSOA.includes('handle'),
      'a isca passou: `handle` não está na lista de parâmetros que endereçam pessoa, ' +
        'então o caso que os proíbe não mede nada.',
    );

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
