/**
 * ISCAS (b) e (c) do perfil de outra pessoa, medidas **NO CONTRATO**.
 *
 * A decisão do cliente, 19/10/2026, literal: *"ele pode ver nome, quantidade de
 * pets, conexões, mas não as fotos publicadas e nem a timeline do usuário"*. É
 * a emenda 2 do ADR-0010.
 *
 * ## Por que estas duas regras são medidas no contrato, e não só no corpo
 *
 * Porque as duas são de **OMISSÃO**, e omissão não se mede exercitando a
 * superfície que deve mostrar o campo: mede-se varrendo o que ela declara e
 * provando que o proibido não está lá. O corpo é medido também, em
 * `people/application/perfil-de-pessoa.test.ts` — as duas metades são
 * necessárias e nenhuma substitui a outra:
 *
 * - **o contrato** pega o campo que alguém DECLARA e esquece de implementar, e
 *   pega o que os quatro clientes (app, backoffice, site, backend) passariam a
 *   esperar;
 * - **o corpo** pega o campo que alguém implementa e esquece de declarar — e
 *   esse é o caminho real do vazamento, porque **nenhum portão deste
 *   repositório confere o corpo da resposta**: o Fastify valida a REQUISIÇÃO.
 *
 * ## Por que a timeline não é uma ausência a preencher
 *
 * Ela **não existe no produto**. A migração `20261018000030` registra a decisão
 * por extenso — *"uma timeline de quem você segue É a lista de presença com
 * hora... Encerrado, não se reabre"* — e não há tabela de publicação nesta base
 * (`safety/ports/safety-repository.ts` diz isso ao justificar por que
 * `denunciarPublicacao` não confere o alvo). Um campo de timeline aqui não seria
 * um campo novo: seria aquela decisão reaberta.
 */
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

/** Toda operação da etiqueta `people`, com caminho e método. */
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

/** Os schemas alcançáveis a partir de um bloco, seguindo `$ref` em profundidade. */
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

/** Toda propriedade alcançável a partir de `PersonProfile`, de todos os schemas. */
function todasAsPropriedadesDoPerfil(): string[] {
  const nomes = ['PersonProfile', ...schemasAlcancados(spec.components.schemas['PersonProfile'])];
  return nomes.flatMap((nome) => {
    const schema = spec.components.schemas[nome] as { properties?: Record<string, unknown> } | undefined;
    return Object.keys(schema?.properties ?? {});
  });
}

void describe('o perfil de outra pessoa nao expoe pet nem timeline (contrato)', () => {
  // ------------------------------------------------------------------
  // A OPERAÇÃO: UMA, COM CONTA, E SEM COLEÇÃO
  // ------------------------------------------------------------------

  /**
   * **ESTE CASO MUDOU EM 20/10/2026, POR DECISÃO DO CLIENTE.**
   *
   * Ele cobrava que `people` tivesse **uma** operação, e a mensagem de reprovação
   * dizia: *"uma segunda operação em `people` é busca, listagem ou descoberta por
   * outro nome: nenhuma das três foi decidida"*. Duas delas **foram decididas**:
   *
   * > *"vamos implementar a busca pelo usuário (...) e vamos implementar o link
   * > de convite, (...) ao clicar vai para a página do perfil do usuário"*
   *
   * O caso não foi afrouxado para "qualquer número": ele passou a cobrar a lista
   * **exata** de três, e uma quarta continua reprovando. É esse número que faz
   * uma operação nova nesta etiqueta ser vista por alguém.
   */
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

  /**
   * As três operações de `people` exigem conta, **sem alternativa vazia**. A
   * coluna "sem conta" da tabela 4-B é vazia inteira, e a busca não a abriu: uma
   * busca de pessoas alcançável sem conta não teria nem teto por conta possível.
   */
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

  /**
   * **ESTE CASO MUDOU EM 20/10/2026.** Ele cobrava que não existisse caminho
   * `/people` sem apelido, porque *"coleção de pessoas é enumeração, e não existe
   * busca de pessoas neste produto"*. O cliente pediu a busca, e a coleção passou
   * a existir — **com freios**.
   *
   * O caso passou a cobrar os dois caminhos exatos. O que ele defende agora é que
   * não apareça um **terceiro**: `/people/{handle}/pets`,
   * `/people/{handle}/showcase`, `/people/available` ou `/people/suggestions`
   * seriam cada um uma superfície nova, e nenhuma delas foi decidida.
   */
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

  /**
   * **A busca existe, e os freios dela são parte da decisão.** Sem este caso, a
   * mudança acima teria aberto a coleção sem nada cobrar o que o cliente pediu
   * junto com ela.
   */
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

  // ------------------------------------------------------------------
  // ISCA (b): NADA DE TIMELINE OU PUBLICAÇÃO
  // ------------------------------------------------------------------

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

  // ------------------------------------------------------------------
  // ISCA (c): PET É CONTAGEM, E SÓ CONTAGEM
  // ------------------------------------------------------------------

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
    // Ancora no CONJUNTO e não em "não contém X": lista de proibidos falha
    // exatamente no item que ninguém previu, e falha para verde. Campo novo
    // aqui é decisão do cliente, e este caso é onde ela aparece.
    // `contact_channel_verified` entrou em 21/10/2026 pela emenda do ADR-0010 --
    // decisao do cliente, e a emenda NOMEIA este schema. Ele esta nesta lista e
    // nao na de proibidos logo abaixo porque e um BOOLEANO sobre a conta: ele
    // nao identifica, nao localiza e nao conta nada de pet.
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

  // ------------------------------------------------------------------
  // ISCA (d): 404, NUNCA 403
  // ------------------------------------------------------------------

  void it('ISCA (d) -- a operacao declara 404 e NAO declara 403', () => {
    const respostas = Object.keys(operacaoDoPerfil().responses ?? {});
    assert.ok(respostas.includes('404'), 'sem 404 declarado, o cliente não sabe tratar perfil invisível');
    assert.ok(
      !respostas.includes('403'),
      '403 contaria que existe algo ali e que alguém decidiu barrar: para quem foi bloqueado, isso é o aviso de bloqueio (ADR-0021)',
    );
    // O 400 e do apelido FORA DA FAIXA, recusado na borda, e ele e
    // obrigatorio: `vigiarParametrosDasRotas` derruba a subida da aplicacao
    // quando uma rota valida parametro e nao declara 400. Ele nao e oraculo --
    // diz que o apelido esta malformado, nao que a pessoa existe.
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
    // A frase escrita é o que os quatro clientes leem. Sem ela, o app poderia
    // tratar 404 como "erro" em vez de "não encontramos esta pessoa".
    const descricao = String(operacaoDoPerfil().description);
    assert.match(descricao, /404 e nunca 403/i);
    assert.match(descricao, /desabilitada/i);
    assert.match(descricao, /bloqueado/i);
    assert.match(descricao, /de PET/i, 'apelido de pet precisa estar nomeado: o espaço de nomes é compartilhado');
  });

  // ------------------------------------------------------------------
  // A FAIXA DO APELIDO É A MESMA EM QUATRO LUGARES
  // ------------------------------------------------------------------

  void it('o apelido tem a MESMA faixa no parametro, no schema e no `CHECK` da migracao', () => {
    // Esta casa já pagou por divergência de faixa entre contrato e coluna: o
    // recado do achado aceitava 1000 no contrato e a coluna recusava acima de
    // 500, e a pessoa recebia erro de servidor em vez de recusa explicada.
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

  // ------------------------------------------------------------------
  // CONTRAPESO
  // ------------------------------------------------------------------

  void it('CONTRAPESO -- o perfil declara AS TRES coisas que o cliente liberou', () => {
    // Sem ele, todas as iscas de omissão acima passariam num mundo em que
    // `PersonProfile` é um objeto vazio — que é a forma mais fácil de um teste
    // de omissão ficar verde sem ter medido nada.
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
    // Decisão de produto sem a frase dela ao lado é decisão que ninguém
    // reconstrói seis meses depois.
    const descricao = String(operacaoDoPerfil().description);
    assert.match(descricao, /19\/10\/2026/);
    assert.match(descricao, /quantidade de\s+pets/);
    assert.match(descricao, /ADR-0010/);
  });
});
