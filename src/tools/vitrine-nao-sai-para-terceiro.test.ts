/**
 * ISCA (a): A VITRINE NÃO SAI PARA NINGUÉM ALÉM DO DONO — medido NO CONTRATO.
 *
 * Mora em `src/tools/` e não junto da projeção porque **lê `api/openapi.yaml` do
 * disco**, como os vizinhos deste diretório: `domain/` não conhece arquivo, e o
 * `eslint` deste repositório recusa `node:fs` ali com razão.
 *
 * ## Por que a regra é medida assim, e não chamando a rota do dono
 *
 * Ela é de **OMISSÃO**: "a vitrine sai em `getMyShowcase` e em nenhuma outra
 * resposta". Omissão não se mede exercitando a única superfície que deve
 * mostrar o campo — se mede **varrendo as outras e provando que nenhuma o
 * declara**. Um caso que chamasse `getMyShowcase` e achasse as fotos passaria
 * igual num mundo em que a vitrine também sai no encontro, na avaliação e na
 * conversa mediada.
 *
 * ## A decisão que estes casos impõem, e que não é desta frente
 *
 * - o **ADR-0025 item 2** proíbe avatar de pessoa na superfície da `Rede`, por
 *   nome;
 * - o contrato afirma em **dois lugares** que `Conversation.participants` nunca
 *   traz telefone, e-mail nem foto de perfil.
 *
 * Mostrar a vitrine a terceiro contrariava decisão registrada e era decisão do
 * cliente. **Ela chegou em 19/10/2026**, e é de escopo fechado — literal:
 * *"ele pode ver nome, quantidade de pets, conexões, mas não as fotos
 * publicadas e nem a timeline do usuário"*. É a emenda 2 do ADR-0010.
 *
 * ## O QUE A DECISÃO DE 19/10 MUDOU AQUI, E O QUE ELA NÃO MUDOU
 *
 * **A recusa para quem NÃO é conexão continua inteira, e os casos que a medem
 * não foram afrouxados.** O que passou a existir é UMA superfície a mais, e ela
 * é nomeada: `getPersonProfile`, que só entrega foto quando
 * `connection_state` é `connected`.
 *
 * O desenho foi escolhido para que a regra de autorização **não precise ser
 * repetida** — que era a objeção original:
 *
 * - a vitrine de terceiro tem **schema próprio** (`PersonShowcasePhoto`), menor
 *   que `ShowcasePhoto`, então `MyShowcase` e `ShowcasePhoto` continuam com UM
 *   hospedeiro cada e os casos de contagem continuam valendo literalmente;
 * - o predicado de **conexão aceita mora na cláusula `WHERE`** da consulta das
 *   fotos (`people/adapters/persistence/kysely-perfil-de-pessoa.ts`), e não num
 *   `if` de camada acima: chamar aquela consulta por engano devolve lista vazia.
 *   Quem mede isso é
 *   `people/adapters/persistence/autorizacao-na-clausula-where.test.ts`;
 * - o que a foto de terceiro carrega é **menos** do que o dono vê: sem `status`,
 *   sem `rejection_reason`, sem `position` e sem `upload_id`.
 *
 * **O que este arquivo NÃO consegue medir** é o recorte em tempo de execução: o
 * contrato declara `showcase` como campo opcional, e "opcional" não distingue
 * "ausente porque não é conexão" de "ausente por esquecimento". As duas pontas
 * disso são medidas em `people/application/perfil-de-pessoa.test.ts` — a isca
 * (a) e o contrapeso dela.
 *
 * O CONTRAPESO (último caso) prova que a vitrine sai para o DONO. Sem ele,
 * todos os casos acima passariam num mundo em que a vitrine não existe em
 * contrato nenhum — que é a forma mais fácil de um teste de omissão ficar verde
 * sem ter medido nada.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';

const texto = readFileSync('api/openapi.yaml', 'utf8');
const spec = parseYaml(texto) as {
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, unknown> };
};

/**
 * Os esquemas da vitrine que carregam FOTO. `*Input` são de escrita.
 *
 * `PersonShowcasePhoto` entrou em 19/10/2026: ele é a vitrine vista por uma
 * CONEXÃO, e deixá-lo fora desta lista faria toda varredura abaixo ficar cega
 * para a superfície nova — que é a forma exata do defeito recorrente desta
 * casa. Com ele dentro, uma operação **sem conta** que o carregasse reprova
 * pelo mesmo caso que já reprovava `MyShowcase`.
 */
const ESQUEMAS_DE_LEITURA = ['MyShowcase', 'ShowcasePhoto', 'PersonShowcasePhoto'] as const;

/**
 * As operações que podem carregar vitrine, **por nome**. Lista FECHADA.
 *
 * Enumerar o PERMITIDO e não o proibido: operação nova cai no caso padrão, que
 * é reprovar. Enumerar o proibido erra aceitando, que já foi o defeito de dois
 * portões deste repositório.
 */
const OPERACOES_COM_VITRINE = [
  'get /me/showcase',
  'get /people/{handle}',
  'put /me/showcase',
  // **`post /me/showcase/photo-intents` NÃO está aqui, e descobrir por quê
  // valeu o caso.** A primeira versão desta varredura procurava
  // `'#/components/schemas/' + nome` por SUBSTRING, e
  // `#/components/schemas/ShowcasePhotoIntentInput` **contém**
  // `#/components/schemas/ShowcasePhoto`: a intenção de envio aparecia como se
  // carregasse a vitrine, e `getPersonProfile` — que carrega de verdade, por
  // `$ref` indireto — não aparecia. Os dois erros juntos deixariam a lista
  // "certa" por acidente. A varredura agora casa NOME EXATO (`Set.has`) e
  // segue `$ref` em profundidade.
] as const;

/**
 * Os schemas alcançáveis a partir de um bloco, seguindo `$ref` **em
 * profundidade**.
 *
 * Sem isto a varredura fica cega para `$ref` indireto, e foi exatamente o que
 * aconteceu na primeira versão do caso abaixo: `getPersonProfile` referencia
 * `PersonProfile`, que referencia `PersonShowcasePhoto` — procurar o segundo no
 * JSON da operação não acha nada, e a operação que CARREGA a vitrine passava
 * como se não carregasse. Mesma técnica de
 * `conexao-nao-expoe-lista-nem-identificador.test.ts`.
 */
function schemasAlcancados(bloco: unknown): Set<string> {
  const vistos = new Set<string>();
  const fila: unknown[] = [bloco];
  while (fila.length > 0) {
    const atual = fila.pop();
    for (const achado of JSON.stringify(atual ?? null).matchAll(
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

const METODOS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** Toda operação do contrato, com o caminho e o método. */
function operacoes(): { caminho: string; metodo: string; op: Record<string, unknown> }[] {
  const saida: { caminho: string; metodo: string; op: Record<string, unknown> }[] = [];
  for (const [caminho, item] of Object.entries(spec.paths)) {
    for (const metodo of METODOS) {
      const op = item[metodo];
      if (op !== undefined && op !== null) {
        saida.push({ caminho, metodo, op: op as Record<string, unknown> });
      }
    }
  }
  return saida;
}

/** O chamador desta operação tem conta? `security: []`, `tagCode` e `finderToken` não têm. */
function ehDeQuemNaoTemConta(op: Record<string, unknown>): boolean {
  const security = op['security'];
  if (!Array.isArray(security)) return false;
  if (security.length === 0) return true;
  return security.some((esquema) => {
    const nomes = Object.keys((esquema ?? {}) as Record<string, unknown>);
    return nomes.includes('tagCode') || nomes.includes('finderToken');
  });
}

void describe('a vitrine de fotos não sai para terceiro (contrato)', () => {
  void it('ISCA -- `MyShowcase` é referenciado SÓ pelas duas operações de `/me/showcase`', () => {
    const referentes = operacoes().filter(({ op }) =>
      JSON.stringify(op).includes('#/components/schemas/MyShowcase'),
    );
    assert.deepEqual(
      referentes.map(({ caminho, metodo }) => `${metodo} ${caminho}`).sort(),
      ['get /me/showcase', 'put /me/showcase'],
      'uma terceira operação devolvendo `MyShowcase` é uma superfície a mais, e precisa de decisão do cliente',
    );
  });

  void it('ISCA -- `ShowcasePhoto` só é alcançado por dentro de `MyShowcase`', () => {
    const referencias = texto.match(/#\/components\/schemas\/ShowcasePhoto\b/g) ?? [];
    assert.equal(
      referencias.length,
      1,
      'duas referências a `ShowcasePhoto` significam um segundo caminho até a foto da vitrine',
    );
  });

  void it('ISCA -- NENHUMA operação de quem não tem conta menciona a vitrine', () => {
    const vazando = operacoes()
      .filter(({ op }) => ehDeQuemNaoTemConta(op))
      .filter(({ op }) => {
        const corpo = JSON.stringify(op);
        return ESQUEMAS_DE_LEITURA.some((e) => corpo.includes(`#/components/schemas/${e}`));
      })
      .map(({ caminho, metodo }) => `${metodo} ${caminho}`);
    assert.deepEqual(vazando, [], 'superfície pública com vitrine contraria o ADR-0010 e o ADR-0025 item 2');
  });

  void it('ISCA -- todo caminho de vitrine está sob `/me/`, e não há `/users/{id}/showcase`', () => {
    const fora = Object.keys(spec.paths).filter(
      (caminho) => caminho.includes('showcase') && !caminho.startsWith('/me/'),
    );
    assert.deepEqual(
      fora,
      [],
      'a vitrine não ganhou caminho próprio fora de `/me/`: a de uma CONEXÃO sai DENTRO de `getPersonProfile`, e um `/users/{id}/showcase` seria a segunda rota em que alguém esquece de repetir a autorização',
    );
  });

  void it('ISCA (a) -- a vitrine sai em TRES operacoes nomeadas, e nenhuma quarta', () => {
    // A varredura é sobre os três esquemas de leitura E sobre as duas derivadas
    // por NOME DE CAMPO: um schema novo chamado de outra coisa, com `grid_url`
    // dentro, cai aqui mesmo sem estar na lista de esquemas.
    const comVitrine = operacoes()
      .filter(({ op }) => {
        const alcancados = schemasAlcancados(op);
        if (ESQUEMAS_DE_LEITURA.some((e) => alcancados.has(e))) return true;
        // E por NOME DE CAMPO, na operação e em tudo que ela alcança: um schema
        // novo, chamado de outra coisa e fora da lista de esquemas, cai aqui
        // mesmo assim se tiver uma das duas derivadas dentro.
        const corpo = [
          JSON.stringify(op),
          ...[...alcancados].map((nome) => JSON.stringify(spec.components.schemas[nome] ?? null)),
        ].join('');
        return corpo.includes('grid_url') || corpo.includes('open_url');
      })
      .map(({ caminho, metodo }) => `${metodo} ${caminho}`)
      .sort();
    assert.deepEqual(
      comVitrine,
      [...OPERACOES_COM_VITRINE],
      'uma quarta operação com vitrine é uma superfície a mais, e a de 19/10/2026 já é a única que o cliente decidiu',
    );
  });

  void it('ISCA (a) -- `PersonShowcasePhoto` tem UM hospedeiro, e ele e `PersonProfile`', () => {
    const referencias = texto.match(/#\/components\/schemas\/PersonShowcasePhoto\b/g) ?? [];
    assert.equal(
      referencias.length,
      1,
      'duas referências significam um segundo caminho até a foto de outra pessoa',
    );
    const perfil = JSON.stringify(spec.components.schemas['PersonProfile']);
    assert.match(perfil, /#\/components\/schemas\/PersonShowcasePhoto/);
  });

  void it('ISCA (a) -- `showcase` NAO e obrigatorio em `PersonProfile`: omitir e o estado de nao-conexao', () => {
    // É esta linha do contrato que deixa a borda OMITIR a chave em vez de
    // mandar `[]`. Com `showcase` em `required`, "não é conexão" teria de ser
    // representado por lista vazia — que afirma "ela não tem foto", sobre uma
    // vitrine que quem chama não pode ver.
    const perfil = spec.components.schemas['PersonProfile'] as {
      required?: readonly string[];
      properties?: Record<string, unknown>;
    };
    assert.ok(perfil.properties?.['showcase'], 'o campo existe: é ele que a conexão aceita recebe');
    assert.ok(
      !(perfil.required ?? []).includes('showcase'),
      '`showcase` obrigatório obrigaria a borda a mandar `[]` para quem não é conexão',
    );
    // E a condição está ESCRITA, com o nome do estado que a libera.
    assert.match(
      String((perfil.properties?.['showcase'] as { description?: string }).description),
      /connected/,
      'a descrição tem de nomear o estado que libera a vitrine',
    );
  });

  void it('ISCA (a) -- a foto de terceiro e MENOR que a do dono: sem moderacao e sem edicao', () => {
    const propriedades = Object.keys(
      (spec.components.schemas['PersonShowcasePhoto'] as { properties?: Record<string, unknown> })
        .properties ?? {},
    );
    assert.deepEqual(
      propriedades.sort(),
      ['alt_text', 'grid_url', 'open_url'],
      'um campo a mais na foto de OUTRA pessoa precisa de decisão, e este caso é onde ela aparece',
    );
    for (const proibido of ['status', 'rejection_reason', 'position', 'upload_id', 'caption', 'likes']) {
      assert.ok(
        !propriedades.includes(proibido),
        `\`${proibido}\` é estado da vitrine do DONO: motivo de recusa é assunto entre ele e quem modera`,
      );
    }
  });

  void it('ISCA (a) -- `PersonProfile` NAO alcanca `MyShowcase` nem `ShowcasePhoto`', () => {
    // Se alguém "simplificasse" reusando o schema do dono, `status` e
    // `rejection_reason` voltariam junto — e os dois casos de contagem acima
    // reprovariam. Este caso diz isso na própria fronteira, para a mensagem de
    // reprovação apontar o lugar certo.
    const perfil = JSON.stringify(spec.components.schemas['PersonProfile']);
    assert.ok(!perfil.includes('#/components/schemas/MyShowcase'));
    assert.ok(!perfil.includes('#/components/schemas/ShowcasePhoto'));
  });

  void it('ISCA -- a vitrine não entrou em `Conversation`, `NetworkEvent` nem avaliação', () => {
    // Os três lugares em que "completar o perfil da pessoa" é a tentação óbvia:
    // o participante da conversa mediada, quem fez check-in no encontro e quem
    // escreveu a avaliação do profissional.
    for (const esquema of [
      'Conversation',
      'ConversationParticipant',
      'NetworkEventPublic',
      'NetworkEventCheckin',
      'DirectoryReview',
    ]) {
      const bloco = spec.components.schemas[esquema];
      if (bloco === undefined) continue;
      const corpo = JSON.stringify(bloco);
      for (const proibido of [...ESQUEMAS_DE_LEITURA, 'showcase', 'grid_url']) {
        assert.ok(
          !corpo.includes(proibido),
          `${esquema} passou a carregar \`${proibido}\`: a vitrine é visível só ao dono`,
        );
      }
    }
  });

  void it('ISCA -- a vitrine não traz legenda, curtida, contador nem pessoa marcada', () => {
    // Confere o NOME DAS PROPRIEDADES, e não o texto do bloco. A primeira
    // versão deste caso procurava as palavras no JSON inteiro e reprovava na
    // própria descrição de `alt_text`, que diz "e não legenda" — um portão que
    // acusa a si mesmo é um portão que alguém desliga.
    const propriedades = Object.keys(
      (spec.components.schemas['ShowcasePhoto'] as { properties?: Record<string, unknown> })
        .properties ?? {},
    );
    for (const proibido of [
      'caption',
      'legenda',
      'likes',
      'like_count',
      'liked',
      'views',
      'view_count',
      'comments',
      'comment_count',
      'tagged_people',
      'tagged_users',
      'people',
      'faces',
    ]) {
      assert.ok(
        !propriedades.includes(proibido),
        `\`${proibido}\` está fora de propósito nesta frente, e não é omissão a preencher depois`,
      );
    }
    assert.deepEqual(
      propriedades.sort(),
      ['alt_text', 'grid_url', 'open_url', 'position', 'rejection_reason', 'status', 'upload_id'],
      'um campo a mais na foto da vitrine precisa de decisão, e este caso é onde ela aparece',
    );
    // MARCAR PESSOA é dado biométrico, e a recomendação registrada é recusar
    // para sempre. Não é omissão a ser preenchida depois.
    assert.ok(!texto.includes('face_landmarks'), 'marcar pessoa é dado biométrico: recusado para sempre');
  });

  void it('ISCA -- a identidade interna da imagem não sai: não há `catalog_image_id` em resposta', () => {
    const foto = JSON.stringify(spec.components.schemas['ShowcasePhoto']);
    assert.ok(!foto.includes('catalog_image_id'), '`catalog_images.id` é identidade interna');
    assert.ok(!foto.includes('"id"'), 'o identificador que sai é o `upload_id`, como nas duas galerias da casa');
  });

  void it('CONTRAPESO -- a vitrine SAI para o dono, em `getMyShowcase`, com a derivada da grade', () => {
    const op = spec.paths['/me/showcase']?.['get'] as Record<string, unknown> | undefined;
    assert.ok(op, 'sem esta operação todos os casos acima passariam por a vitrine não existir');
    assert.ok(!ehDeQuemNaoTemConta(op), 'a leitura da vitrine exige conta');
    assert.match(JSON.stringify(op), /#\/components\/schemas\/MyShowcase/);

    const foto = JSON.stringify(spec.components.schemas['ShowcasePhoto']);
    assert.match(foto, /grid_url/, 'a grade pede a derivada de 320 px');
    assert.match(foto, /open_url/, 'a foto aberta pede a de 1024 px');
  });
});
