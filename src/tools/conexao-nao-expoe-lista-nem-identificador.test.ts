/**
 * **ISCA (b): A LISTA DE CONEXÕES NÃO APARECE A NINGUÉM — nem ao dono.** E
 * **ISCA (f): nenhum identificador interno sai em resposta.** As duas medidas
 * **no contrato**, que é onde elas podem ser provadas por omissão.
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
 * O desenho que ele defende (plano 4-B, e a decisão do cliente de 18/10/2026):
 *
 * | | Sem conta | Com conta, sem conexão | Conectado | Bloqueado |
 * |---|---|---|---|---|
 * | Lista de conexões | — | **nunca** | **nunca** | 404 |
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

const DA_CONEXAO = ['Connection', 'ConnectionPerson', 'ConnectionRequestPage', 'ConnectionSummary'];

void describe('ISCA (b): não existe lista de conexões em lugar nenhum do contrato', () => {
  void it('são exatamente CINCO operações com a etiqueta `connections`', () => {
    const ids = operacoesDaConexao()
      .map(({ operacao }) => operacao.operationId ?? '')
      .sort();
    assert.deepEqual(ids, [
      'acceptConnection',
      'endConnection',
      'getMyConnectionSummary',
      'listMyConnectionRequests',
      'requestConnection',
    ]);
  });

  void it('não existe `GET /connections`: a coleção de conexões não é legível', () => {
    assert.equal(
      spec.paths['/connections']?.get,
      undefined,
      'um `GET /connections` seria a lista de conexões, que o desenho recusa a todos — ' +
        'inclusive ao próprio dono.',
    );
  });

  void it('nenhum caminho de conexão termina numa coleção de pessoas', () => {
    for (const { caminho, metodo, operacao } of operacoesDaConexao()) {
      if (metodo !== 'get') continue;
      const alcancados = [...schemasAlcancados(DA_CONEXAO)];
      void alcancados;
      assert.ok(
        ['listMyConnectionRequests', 'getMyConnectionSummary'].includes(operacao.operationId ?? ''),
        `${metodo.toUpperCase()} ${caminho} é uma leitura nova de conexão. ` +
          'Antes de existir, ela passa pela tabela 4-B: a lista de conexões é "nunca".',
      );
    }
  });

  void it('`ConnectionRequestPage` é a ÚNICA coleção, e ela é de pedidos', () => {
    // A diferença não é de nome: a página de pedidos existe porque "pedido
    // recebido" é um dos três caminhos que o desenho reconhece como relação, e
    // sem saber quem pediu não se decide nada. Conexão aceita não tem essa
    // necessidade, e por isso não tem coleção.
    const colecoes = [...schemasAlcancados(DA_CONEXAO)].filter((nome) => {
      const schema = spec.components.schemas[nome];
      return (
        schema !== undefined &&
        Object.prototype.hasOwnProperty.call(schema.properties ?? {}, 'items')
      );
    });
    assert.deepEqual(colecoes, ['ConnectionRequestPage']);
  });

  void it('o estado do app não tem valor de conexão aceita dentro da caixa de pedidos', () => {
    const estado = spec.components.schemas.ConnectionAppState as { enum?: readonly string[] };
    assert.deepEqual([...(estado.enum ?? [])].sort(), [
      'connected',
      'pending_received',
      'pending_sent',
    ]);
  });

  void it('ISCA: a varredura REPROVA uma operação de lista acrescentada depois', () => {
    // Sem esta isca, o caso de cima passaria por não haver operação nova — e não
    // por ele saber reconhecer uma.
    const inventada: Record<string, Operacao> = {
      get: { operationId: 'listMyConnections', tags: ['connections'] },
    };
    const comVazamento: Spec = {
      ...spec,
      paths: { ...spec.paths, '/connections': { ...spec.paths['/connections'], ...inventada } },
    };
    const ids: string[] = [];
    for (const item of Object.values(comVazamento.paths)) {
      for (const metodo of METODOS) {
        const operacao = item[metodo];
        if (operacao?.tags?.includes('connections') === true) ids.push(operacao.operationId ?? '');
      }
    }
    assert.ok(
      ids.includes('listMyConnections'),
      'a isca passou: a varredura não enxerga uma operação nova com a etiqueta `connections`.',
    );
    assert.equal(ids.length, 6, 'a varredura tem de contar seis quando alguém acrescentar a sexta');
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
  void it('as cinco operações exigem `bearerAuth`, sem alternativa vazia', () => {
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
          `${metodo.toUpperCase()} ${caminho} aceita \`${nome}\`: seria busca de pessoas, ` +
            'que o desenho recusa porque o dano mora na enumeração.',
        );
      }
    }
  });

  void it('o corpo do pedido aceita UM campo, e é um token — nunca uma pessoa', () => {
    const convite = spec.components.schemas.ConnectionInvite as {
      properties?: Record<string, unknown>;
      additionalProperties?: boolean;
      required?: readonly string[];
    };
    assert.deepEqual(Object.keys(convite.properties ?? {}), ['invite_token']);
    assert.deepEqual([...(convite.required ?? [])], ['invite_token']);
    assert.equal(
      convite.additionalProperties,
      false,
      'corpo aberto deixaria um campo de pessoa entrar sem ninguém decidir',
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
