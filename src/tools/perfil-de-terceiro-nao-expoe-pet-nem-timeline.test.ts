import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';

const texto = readFileSync('api/openapi.yaml', 'utf8');
const spec = parseYaml(texto) as {
  tags: { name: string }[];
  paths: Record<string, Record<string, unknown>>;
  components: {
    schemas: Record<string, unknown>;
    parameters: Record<string, unknown>;
  };
};

const CAMINHO = '/people/{handle}';
const METODOS = ['get', 'post', 'put', 'patch', 'delete'] as const;

interface Operacao {
  readonly operationId?: string;
  readonly tags?: readonly string[];
  readonly security?: readonly Record<string, unknown>[];
  readonly description?: string;
  readonly responses?: Record<string, unknown>;
}

function operacaoDoPerfil(): Operacao {
  const op = spec.paths[CAMINHO]?.['get'];
  assert.ok(op, `sem \`get ${CAMINHO}\` todos os casos deste arquivo passariam por a operação não existir`);
  return op;
}

function operacoesDePessoa(): { caminho: string; metodo: string; op: Operacao }[] {
  const achadas: { caminho: string; metodo: string; op: Operacao }[] = [];
  for (const [caminho, item] of Object.entries(spec.paths)) {
    for (const metodo of METODOS) {
      const op = item[metodo] as Operacao | undefined;
      if (op !== undefined && (op.tags ?? []).includes('people')) achadas.push({ caminho, metodo, op });
    }
  }
  return achadas;
}

function schemasAlcancados(bloco: unknown): Set<string> {
  const vistos = new Set<string>();
  const fila: unknown[] = [bloco];
  while (fila.length > 0) {
    for (const achado of JSON.stringify(fila.pop() ?? null).matchAll(
      /#\/components\/schemas\/(\w+)/g,
    )) {
      const nome = achado[1] as string;
      if (vistos.has(nome)) continue;
      vistos.add(nome);
      fila.push(spec.components.schemas[nome]);
    }
  }
  return vistos;
}

function propriedadesDe(nome: string): string[] {
  const schema = spec.components.schemas[nome] as { properties?: Record<string, unknown> } | undefined;
  assert.ok(schema, `o schema \`${nome}\` não existe`);
  return Object.keys(schema.properties ?? {});
}

function todasAsPropriedadesDoPerfil(): string[] {
  const nomes = ['PersonProfile', ...schemasAlcancados(spec.components.schemas['PersonProfile'])];
  return nomes.flatMap((nome) => {
    const schema = spec.components.schemas[nome] as { properties?: Record<string, unknown> } | undefined;
    return Object.keys(schema?.properties ?? {});
  });
}

void describe('o perfil de outra pessoa nao expoe pet nem timeline (contrato)', () => {

  void it('a etiqueta `people` tem TRES operacoes, e a lista e exata', () => {
    assert.deepEqual(
      operacoesDePessoa()
        .map(({ metodo, caminho }) => `${metodo} ${caminho}`)
        .sort(),
      ['get /people', `get ${CAMINHO}`, 'post /connection-invites/resolution'],
      'uma QUARTA operação em `people` é listagem ou descoberta por outro nome. As três ' +
        'que existem são: a busca (com piso de 3 caracteres, teto por conta e campo ' +
        'vazio que não lista ninguém), a leitura de um perfil pelo apelido, e a mesma ' +
        'leitura endereçada pelo token do convite.',
    );
    assert.ok(
      spec.tags.some((etiqueta) => etiqueta.name === 'people'),
      'a etiqueta tem de estar declarada na raiz: etiqueta sem declaração é operação sem dono',
    );
  });

  void it('as TRES operacoes de `people` exigem conta, sem alternativa vazia', () => {
    for (const { metodo, caminho, op } of operacoesDePessoa()) {
      const seguranca = op.security ?? [];
      assert.ok(seguranca.length > 0, `${metodo} ${caminho} sem \`security\` nasceria pública`);
      assert.deepEqual(
        seguranca.flatMap((esquema) => Object.keys(esquema)),
        ['bearerAuth'],
        `${metodo} ${caminho} não exige exatamente conta`,
      );
    }
  });

  void it('`getPersonProfile` EXIGE conta, sem alternativa vazia', () => {
    const op = operacaoDoPerfil();
    const seguranca = op.security ?? [];
    assert.equal(op.operationId, 'getPersonProfile');
    assert.ok(seguranca.length > 0, 'operação sem `security` nasceria pública');
    assert.ok(
      seguranca.every((esquema) => Object.keys(esquema).length > 0),
      'alternativa vazia em `security` é a operação alcançável SEM CONTA',
    );
    assert.deepEqual(
      seguranca.flatMap((esquema) => Object.keys(esquema)),
      ['bearerAuth'],
      '`tagCode` ou `finderToken` aqui abririam o perfil de uma pessoa a quem não tem conta',
    );
  });

  void it('os caminhos `/people` sao EXATAMENTE dois: a colecao e o apelido', () => {
    const caminhos = Object.keys(spec.paths)
      .filter((caminho) => caminho.startsWith('/people'))
      .sort();
    assert.deepEqual(
      caminhos,
      ['/people', CAMINHO],
      'um TERCEIRO caminho `/people` é superfície nova. `/people` é a busca, com os ' +
        'freios do cliente; `/people/{handle}` é a leitura de um perfil. Não existe ' +
        '`/people/{handle}/pets`, `/people/{handle}/showcase`, `/people/available` ' +
        '(disponibilidade de apelido, plano 4-C.5) nem `/people/suggestions`.',
    );
  });

  void it('a colecao `/people` SO existe com busca: sem `q` ela nao lista ninguem', () => {
    const busca = spec.paths['/people']?.get as
      | { parameters?: readonly { name?: string; required?: boolean; schema?: { minLength?: number } }[] }
      | undefined;
    assert.ok(busca !== undefined, 'a coleção `/people` tem de ser uma leitura');
    const q = (busca.parameters ?? []).find((p) => p.name === 'q');
    assert.ok(q !== undefined, '`/people` sem parâmetro `q` seria uma listagem de pessoas');
    assert.notEqual(
      q?.required,
      true,
      '`q` obrigatório daria 400 para campo vazio, e a decisão do cliente é LISTA VAZIA: ' +
        'a tela chama a busca a cada tecla, e um erro no meio de alguém escrevendo seria ' +
        'o produto discutindo com quem digita.',
    );
    assert.equal(
      q?.schema?.minLength,
      3,
      'o piso de três caracteres é o do índice trigrama: abaixo dele não há trigrama ' +
        'nenhum e a consulta vira varredura da tabela de contas inteira.',
    );
  });

  void it('ISCA (b) -- nenhuma propriedade de timeline, publicacao ou seguidor no perfil', () => {
    const propriedades = todasAsPropriedadesDoPerfil();
    for (const proibido of [
      'timeline',
      'posts',
      'post_count',
      'publications',
      'publication_ref',
      'publication_count',
      'feed',
      'stories',
      'activity',
      'last_activity_at',
      'last_seen_at',
      'followers',
      'followers_count',
      'following',
      'following_count',
      'likes',
      'like_count',
      'comments',
      'comment_count',
    ]) {
      assert.ok(
        !propriedades.includes(proibido),
        `\`${proibido}\` reabre a decisão da migração 20261018000030 ("uma timeline de quem você segue É a lista de presença com hora... Encerrado, não se reabre")`,
      );
    }
  });

  void it('ISCA (b) -- o perfil nao alcanca schema NENHUM de publicacao ou de encontro', () => {
    const alcancados = schemasAlcancados(spec.components.schemas['PersonProfile']);
    for (const proibido of [
      'Publication',
      'PublicationReportInput',
      'NetworkEventPublic',
      'NetworkEventCheckin',
      'Conversation',
      'ConversationParticipant',
      'DirectoryReview',
      'PublicLostPet',
      'Pet',
      'PetSummary',
      'MyPhoto',
    ]) {
      assert.ok(
        !alcancados.has(proibido),
        `\`PersonProfile\` passou a alcançar \`${proibido}\`: "completar o perfil da pessoa" é a tentação óbvia, e cada um desses carrega o que o ADR-0010 recusa`,
      );
    }
  });

  void it('ISCA (c) -- a UNICA propriedade que fala de pet e `pets_count`, e ela e inteira', () => {
    const doPerfil = todasAsPropriedadesDoPerfil().filter((chave) => chave.includes('pet'));
    assert.deepEqual(
      doPerfil,
      ['pets_count'],
      'o item 7 do ADR-0010 proíbe agrupar os pets de um tutor; a emenda 2 abriu a CONTAGEM, e só ela',
    );
    const campo = (spec.components.schemas['PersonProfile'] as {
      properties: Record<string, { type?: string; minimum?: number }>;
    }).properties['pets_count'];
    assert.equal(campo?.type, 'integer', 'contagem que não é inteira é outra coisa');
    assert.equal(campo?.minimum, 0);
  });

  void it('ISCA (c) -- nenhum campo de nome, slug, foto ou especie de pet', () => {
    const propriedades = todasAsPropriedadesDoPerfil();
    for (const proibido of [
      'pets',
      'pet_names',
      'pet_name',
      'pet_slug',
      'pet_slugs',
      'pet_photos',
      'pet_thumbs',
      'pet_photo_url',
      'species_code',
      'breed_code',
      'animals',
    ]) {
      assert.ok(
        !propriedades.includes(proibido),
        `\`${proibido}\` é agrupamento NAVEGÁVEL de pets: com os pets nomeados, um caso de perdido de um deles localiza os outros`,
      );
    }
  });

  void it('ISCA (c) -- a lista de propriedades de `PersonProfile` e FECHADA', () => {
    assert.deepEqual(propriedadesDe('PersonProfile').sort(), [
      'connection_ref',
      'connection_state',
      'connections_count',
      'contact_channel_verified',
      'display_name',
      'handle',
      'pets_count',
      'public_ref',
      'showcase',
    ]);
    assert.equal(
      (spec.components.schemas['PersonProfile'] as { additionalProperties?: boolean })
        .additionalProperties,
      false,
    );
  });

  void it('ISCA (c) -- nem cidade, nem bairro, nem contato: ele nao mencionou nenhum', () => {
    const propriedades = todasAsPropriedadesDoPerfil();
    for (const proibido of [
      'city',
      'neighbourhood',
      'neighborhood',
      'state_code',
      'postal_code',
      'location',
      'lat',
      'lng',
      'point',
      'email',
      'phone',
      'phone_e164',
      'birth_date',
      'last_name',
    ]) {
      assert.ok(
        !propriedades.includes(proibido),
        `\`${proibido}\` não foi liberado por decisão nenhuma: o teto de "bairro e cidade" do ADR-0010 é limite de precisão, não permissão de expor onde a pessoa mora`,
      );
    }
  });

  void it('ISCA (c) -- nenhum UUID no perfil, e `public_ref` NAO e UUID', () => {
    const perfil = JSON.stringify(spec.components.schemas['PersonProfile']);
    assert.ok(!/"format"\s*:\s*"uuid"/.test(perfil), 'UUID interno em saída pública é o item 6 do ADR-0010');
    const campo = (spec.components.schemas['PersonProfile'] as {
      properties: Record<string, { format?: string; pattern?: string }>;
    }).properties['public_ref'];
    assert.notEqual(campo?.format, 'uuid');
    assert.equal(campo?.pattern, '^[A-Za-z0-9_-]{22}$');
  });

  void it('ISCA (d) -- a operacao declara 404 e NAO declara 403', () => {
    const respostas = Object.keys(operacaoDoPerfil().responses ?? {});
    assert.ok(respostas.includes('404'), 'sem 404 declarado, o cliente não sabe tratar perfil invisível');
    assert.ok(
      !respostas.includes('403'),
      '403 contaria que existe algo ali e que alguém decidiu barrar: para quem foi bloqueado, isso é o aviso de bloqueio (ADR-0021)',
    );
    assert.deepEqual(respostas.sort(), ['200', '400', '401', '404', '429']);
  });

  void it('ISCA (d) -- NENHUMA operacao da etiqueta `people` declara 403', () => {
    for (const { caminho, metodo, op } of operacoesDePessoa()) {
      assert.ok(
        !Object.keys(op.responses ?? {}).includes('403'),
        `${metodo} ${caminho} declara 403: o ADR-0021 não tem exceção nesta etiqueta`,
      );
    }
  });

  void it('ISCA (d) -- a descricao DIZ que os cinco caminhos sao o mesmo 404', () => {
    const descricao = String(operacaoDoPerfil().description);
    assert.match(descricao, /404 e nunca 403/i);
    assert.match(descricao, /desabilitada/i);
    assert.match(descricao, /bloqueado/i);
    assert.match(descricao, /de PET/i, 'apelido de pet precisa estar nomeado: o espaço de nomes é compartilhado');
  });

  void it('o apelido tem a MESMA faixa no parametro, no schema e no `CHECK` da migracao', () => {
    const PADRAO = '^[a-z0-9][a-z0-9-]{3,18}[a-z0-9]$';
    const parametro = spec.components.parameters['PersonHandleParam'] as {
      schema?: { minLength?: number; maxLength?: number; pattern?: string };
    };
    assert.deepEqual(
      { min: parametro.schema?.minLength, max: parametro.schema?.maxLength, padrao: parametro.schema?.pattern },
      { min: 5, max: 20, padrao: PADRAO },
    );

    const noPerfil = (spec.components.schemas['PersonProfile'] as {
      properties: Record<string, { minLength?: number; maxLength?: number; pattern?: string }>;
    }).properties['handle'];
    assert.deepEqual(
      { min: noPerfil?.minLength, max: noPerfil?.maxLength, padrao: noPerfil?.pattern },
      { min: 5, max: 20, padrao: PADRAO },
    );

    const migracao = readFileSync('migrations/20261018000021_nascimento-e-apelido-do-tutor.sql', 'utf8');
    assert.ok(
      migracao.includes("handle ~ '^[a-z0-9][a-z0-9-]{3,18}[a-z0-9]$'"),
      'o `CHECK` de `handles.handle` divergiu do contrato: quem errar a faixa receberia erro de servidor em vez de recusa explicada',
    );
  });

  void it('CONTRAPESO -- o perfil declara AS TRES coisas que o cliente liberou', () => {
    const schema = spec.components.schemas['PersonProfile'] as {
      required?: readonly string[];
      properties: Record<string, unknown>;
    };
    for (const liberado of ['display_name', 'pets_count', 'connections_count']) {
      assert.ok(schema.properties[liberado], `\`${liberado}\` é o que ele disse que a pessoa PODE ver`);
      assert.ok((schema.required ?? []).includes(liberado), `\`${liberado}\` tem de vir sempre`);
    }
    assert.ok((schema.required ?? []).includes('connection_state'));
  });

  void it('CONTRAPESO -- a decisao de 19/10/2026 esta CITADA na operacao', () => {
    const descricao = String(operacaoDoPerfil().description);
    assert.match(descricao, /19\/10\/2026/);
    assert.match(descricao, /quantidade de\s+pets/);
    assert.match(descricao, /ADR-0010/);
  });
});
