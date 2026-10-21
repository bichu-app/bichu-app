/**
 * ISCA (b), METADE DO CONTRATO: **a publicação não sai para quem não tem
 * relação com o autor — medido NO CONTRATO, por omissão.**
 *
 * Mora em `src/tools/` e não junto do módulo porque **lê `api/openapi.yaml` do
 * disco**, como os vizinhos deste diretório: o `eslint` deste repositório recusa
 * `node:fs` em `domain/`, com razão.
 *
 * ## Por que a regra é medida assim, e não chamando a rota
 *
 * Ela é de **OMISSÃO**: "a publicação sai em `getMyTimeline` e em
 * `listMyPublications`, e em nenhuma outra resposta". Omissão não se mede
 * exercitando as duas superfícies que devem mostrar o campo — se mede varrendo
 * **as outras** e provando que nenhuma o declara. Um caso que chamasse
 * `getMyTimeline` e achasse as publicações passaria igual num mundo em que a
 * publicação também sai no perfil de terceiro, na página pública do caso e na
 * listagem de perdidos.
 *
 * O recorte em tempo de execução — *"não-conexão não vê"* — é medido no `WHERE`
 * da consulta, com mutação do predicado, em
 * `publications/adapters/persistence/autorizacao-na-clausula-where.test.ts`. As
 * duas metades são necessárias e nenhuma basta: o contrato pode estar certo com
 * a consulta errada, e a consulta certa com um campo a mais no contrato.
 *
 * ## O modelo, e por que ele é seguido ao pé da letra
 *
 * `vitrine-nao-sai-para-terceiro.test.ts` foi **estendido duas vezes** porque a
 * primeira versão dele estava cega de dois jeitos ao mesmo tempo: ela procurava
 * `'#/components/schemas/' + nome` por **SUBSTRING**, então
 * `ShowcasePhotoIntentInput` **continha** `ShowcasePhoto` e a intenção de envio
 * aparecia como se carregasse a vitrine; e ela não seguia `$ref` em
 * profundidade, então `getPersonProfile` — que carrega de verdade, por `$ref`
 * indireto — **não** aparecia. Os dois erros juntos deixavam a lista "certa" por
 * acidente.
 *
 * Então aqui, desde o primeiro dia: **nome EXATO** (`Set.has`) e **`$ref` em
 * profundidade**. E a lista de operações autorizadas é FECHADA e enumera o
 * PERMITIDO — operação nova cai no caso padrão, que é reprovar. Enumerar o
 * proibido erra aceitando, que já foi o defeito de dois portões desta casa.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';

const texto = readFileSync('api/openapi.yaml', 'utf8');
const spec = parseYaml(texto) as {
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, unknown>; parameters: Record<string, unknown> };
};

const METODOS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/**
 * Os esquemas que carregam PUBLICAÇÃO. `*Input` são de escrita e ficam fora:
 * eles entram, não saem.
 *
 * `PublicationAuthor` está aqui e **descobrir por que vale a frase**: ele é a
 * pessoa dentro da publicação, e deixá-lo fora faria a varredura ficar cega para
 * a superfície que mais importa — uma operação sem conta que carregasse autor de
 * publicação passaria. Com ele dentro, ela reprova pelo mesmo caso.
 */
const ESQUEMAS_DE_LEITURA = [
  'Publication',
  'PublicationPage',
  'PublicationImage',
  'PublicationAuthor',
  'MyPublication',
  'MyPublicationPage',
  'MyPublicationImage',
  // 20/10/2026: curtir e comentar. `PublicationComment` carrega
  // `PublicationAuthor` por `$ref`, e `PublicationAuthor` carrega a foto de
  // pessoa pela Emenda 5 -- entao os schemas do comentario entram nesta lista
  // pelo mesmo motivo que os da publicacao: uma operacao SEM CONTA que os
  // carregasse reprova pelo mesmo caso.
  'PublicationComment',
  'PublicationCommentPage',
  'PublicationCommentCreated',
] as const;

/**
 * As operações que podem carregar publicação, **por nome**. Lista FECHADA.
 *
 * `post /me/publications` está aqui porque ela **devolve** `MyPublication` na
 * resposta `201` — ela não é só escrita. `post /me/publications/photo-intents`
 * **não** está, e é a armadilha que o portão da vitrine pagou: o nome
 * `PublicationPhotoIntentInput` **contém** `PublicationPhoto`, e uma varredura
 * por substring o mostraria como se ele carregasse a imagem da publicação. A
 * varredura abaixo casa nome EXATO, então ele fica fora com razão.
 */
const OPERACOES_COM_PUBLICACAO = new Set([
  'get /timeline',
  'get /me/publications',
  'post /me/publications',
  // 20/10/2026: as tres de COMENTARIO que carregam `PublicationAuthor` (e com
  // ele a foto da Emenda 5). **`put`/`delete .../like` NAO estao aqui**, e a
  // ausencia e medida: `PublicationReaction` tem dois inteiros e um booleano,
  // nao alcanca `$ref` nenhum, e por isso nao carrega publicacao.
  'get /publications/{publicationRef}/comments',
  'post /publications/{publicationRef}/comments',
]);

/** Os schemas alcançáveis a partir de um bloco, seguindo `$ref` **em profundidade**. */
function schemasAlcancados(bloco: unknown): Set<string> {
  const vistos = new Set<string>();
  const fila: unknown[] = [bloco];
  while (fila.length > 0) {
    const atual = fila.pop();
    if (atual === null || atual === undefined) continue;
    if (typeof atual === 'string') continue;
    if (Array.isArray(atual)) {
      // `as unknown[]` e nao `...atual` cru: `Array.isArray` estreita para
      // `any[]`, e o `eslint` deste repositorio recusa espalhar `any[]` num
      // parametro -- com razao, porque `any` atravessando a borda e como as
      // conferencias deste arquivo deixariam de valer sem ninguem ver.
      fila.push(...(atual as unknown[]));
      continue;
    }
    if (typeof atual !== 'object') continue;
    for (const [chave, valor] of Object.entries(atual as Record<string, unknown>)) {
      if (chave === '$ref' && typeof valor === 'string') {
        const nome = valor.startsWith('#/components/schemas/')
          ? valor.slice('#/components/schemas/'.length)
          : undefined;
        // NOME EXATO, e `Set` em vez de `includes` de texto: é esta linha que
        // o portão da vitrine não tinha.
        if (nome !== undefined && !vistos.has(nome)) {
          vistos.add(nome);
          fila.push(spec.components.schemas[nome]);
        }
        continue;
      }
      fila.push(valor);
    }
  }
  return vistos;
}

/**
 * Onde, na árvore inteira do contrato, existe uma propriedade com este nome.
 *
 * Devolve o caminho do OBJETO que a declara (o pai de `properties`), em ordem
 * estável. Ela desce por `properties`, `items`, `allOf`, `oneOf` e qualquer
 * outra chave — porque um campo pode estar declarado inline, e foi exatamente
 * isso que cegou a primeira versão do caso que a usa.
 */
function caminhosDaPropriedade(raiz: unknown, campo: string): string[] {
  const achados: string[] = [];
  const andar = (no: unknown, caminho: string): void => {
    if (no === null || typeof no !== 'object') return;
    if (Array.isArray(no)) {
      no.forEach((item, indice) => {
        andar(item, `${caminho}[${String(indice)}]`);
      });
      return;
    }
    const objeto = no as Record<string, unknown>;
    const propriedades = objeto.properties;
    if (
      propriedades !== null &&
      typeof propriedades === 'object' &&
      Object.prototype.hasOwnProperty.call(propriedades, campo)
    ) {
      achados.push(caminho);
    }
    for (const [chave, valor] of Object.entries(objeto)) {
      andar(valor, caminho === '' ? chave : `${caminho}.${chave}`);
    }
  };
  andar(raiz, '');
  return achados.sort();
}

interface Achada {
  readonly chave: string;
  readonly operacao: Record<string, unknown>;
  readonly carrega: readonly string[];
}

function todasAsOperacoes(): Achada[] {
  const saida: Achada[] = [];
  for (const [caminho, item] of Object.entries(spec.paths)) {
    for (const metodo of METODOS) {
      const operacao = item[metodo];
      if (operacao === undefined || operacao === null) continue;
      const alcancados = schemasAlcancados(operacao);
      saida.push({
        chave: `${metodo} ${caminho}`,
        operacao: operacao as Record<string, unknown>,
        carrega: ESQUEMAS_DE_LEITURA.filter((nome) => alcancados.has(nome)),
      });
    }
  }
  return saida;
}

const OPERACOES = todasAsOperacoes();

void describe('ISCA (b): a publicacao sai em DUAS operacoes, e em mais nenhuma', () => {
  void it('ISCA (b) -- nenhuma operacao fora da lista fechada carrega publicacao', () => {
    const intrusas = OPERACOES.filter(
      ({ chave, carrega }) => carrega.length > 0 && !OPERACOES_COM_PUBLICACAO.has(chave),
    ).map(({ chave, carrega }) => `${chave} -> ${carrega.join(', ')}`);
    assert.deepEqual(
      intrusas,
      [],
      'operacao nova carregando publicacao. Antes de existir, ela passa pela Emenda 2 do ' +
        'ADR-0010: "timeline, publicacao, curtida, contador" nao saem para quem nao e conexao',
    );
  });

  void it('ISCA (b) -- TODA operacao que carrega publicacao exige conta, sem alternativa vazia', () => {
    // A coluna "sem conta" da tabela 4-B e vazia inteira, e isso e arquitetura e
    // nao escolha de tela. `security: []` numa destas abriria a linha do tempo
    // para o mundo.
    for (const { chave, operacao, carrega } of OPERACOES) {
      if (carrega.length === 0) continue;
      const seguranca = (operacao.security ?? []) as readonly Record<string, unknown>[];
      assert.ok(
        seguranca.length === 1 && Object.keys(seguranca[0] ?? {})[0] === 'bearerAuth',
        `${chave} carrega publicacao e nao exige \`bearerAuth\` sozinho`,
      );
    }
  });

  void it('ISCA (b) -- NAO EXISTE `GET /publications/{ref}`: leitura avulsa por endereco', () => {
    // Uma leitura avulsa existiria exatamente para ser chamada com um endereco
    // que quem chama recebeu de outro lugar, e teria de repetir o recorte
    // inteiro num segundo lugar -- e segundo lugar e onde uma correcao falta.
    assert.equal(spec.paths['/publications/{publicationRef}'], undefined);
    // **O criterio e o SCHEMA, e nao o prefixo do caminho**, e a precisao e
    // necessaria desde 20/10: `get /publications/{ref}/comments` existe e e
    // legitima -- ela devolve COMENTARIOS, nao a publicacao. Reprovar por
    // prefixo reprovaria o certo, e portao que reprova o certo e portao que
    // alguem desliga.
    const avulsas = OPERACOES.filter(
      ({ chave, carrega, operacao }) =>
        chave.startsWith('get /publications/') &&
        String(operacao.operationId) !== 'listPublicationComments' &&
        (carrega.includes('Publication') || carrega.includes('PublicationPage')),
    ).map(({ chave }) => chave);
    assert.deepEqual(
      avulsas,
      [],
      'nasceu uma leitura de PUBLICACAO por endereco: ela teria de repetir o recorte ' +
        'inteiro num segundo lugar, e segundo lugar e onde uma correcao falta',
    );
    // E nao nasceu uma LISTA de quem curtiu: item 7 da Emenda 5 do ADR-0010.
    const curtidores = OPERACOES.filter(({ chave }) =>
      /\/likes($|\/)/.test(chave),
    ).map(({ chave }) => chave);
    assert.deepEqual(
      curtidores,
      [],
      'nasceu uma rota de lista de quem curtiu. A decisao de 19/10 sobre curtir e ' +
        'CONTAGEM, e contagem nao diz quem (item 7 da Emenda 5 do ADR-0010)',
    );
  });

  void it('ISCA (b) -- nao existe COLECAO de publicacoes de OUTRA pessoa', () => {
    // `/people/{handle}/publications` seria a timeline de alguem, que a Emenda 2
    // do ADR-0010 recusa por nome -- e seria alcancavel so com o apelido.
    for (const { chave } of OPERACOES) {
      assert.doesNotMatch(
        chave,
        /\/(people|users)\/\{[^}]+\}\/(publications|timeline)/,
        `${chave} e a linha do tempo de outra pessoa`,
      );
    }
  });

  void it('ISCA (b) -- a ISCA DA VARREDURA: uma operacao inventada com publicacao REPROVA', () => {
    // Sem esta isca, o primeiro caso ficaria verde por nao haver operacao
    // intrusa -- e nao por ele saber reconhecer uma. E exatamente o defeito dos
    // onze portoes cegos desta rodada.
    const inventada = {
      operationId: 'listPersonPublications',
      tags: ['people'],
      security: [],
      responses: {
        '200': {
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/PublicationPage' } },
          },
        },
      },
    };
    const alcancados = schemasAlcancados(inventada);
    assert.ok(
      alcancados.has('PublicationPage'),
      'a varredura nao enxerga `$ref` direto: ela nao mede nada',
    );
    assert.ok(
      alcancados.has('Publication') && alcancados.has('PublicationAuthor'),
      'a varredura nao segue `$ref` EM PROFUNDIDADE -- foi essa cegueira que deixou ' +
        '`getPersonProfile` passar no portao da vitrine',
    );
  });

  void it('ISCA (b) -- a ISCA DO NOME EXATO: um nome que CONTEM outro nao conta como ele', () => {
    // A armadilha que o portao da vitrine pagou, na forma exata dela: um nome de
    // esquema **contem** outro, e uma varredura por SUBSTRING marca o primeiro
    // como se ele carregasse o segundo.
    //
    // O par desta familia: `PublicationPage` contem `Publication`, e
    // `PublicationPhotoIntentInput` (a intencao de envio) contem `Publication`
    // tambem. Uma varredura por substring faria a intencao de envio aparecer
    // como se ela carregasse a publicacao inteira.
    assert.ok(
      'PublicationPhotoIntentInput'.includes('Publication') &&
        'PublicationPage'.includes('Publication'),
      'o pressuposto da isca mudou: os nomes deixaram de se conter',
    );
    const daIntencao = schemasAlcancados({
      requestBody: {
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/PublicationPhotoIntentInput' },
          },
        },
      },
    });
    assert.ok(daIntencao.has('PublicationPhotoIntentInput'));
    assert.ok(
      !daIntencao.has('Publication'),
      'a varredura voltou a casar por SUBSTRING: a intencao de envio aparece como se ' +
        'carregasse a publicacao, e a lista fechada fica "certa" por acidente',
    );
    assert.ok(
      !daIntencao.has('PublicationImage'),
      'a intencao de envio aparece como se carregasse a imagem da publicacao',
    );
  });
});

void describe('ISCA (b): o AUTOR da publicacao sai sem foto e sem pet', () => {
  const autor = spec.components.schemas.PublicationAuthor as {
    properties?: Record<string, unknown>;
    required?: readonly string[];
    additionalProperties?: boolean;
  };

  void it('`PublicationAuthor` tem TRES campos, e a lista e fechada', () => {
    // Eram DOIS ate 20/10/2026. A Emenda 5 do ADR-0010 acrescentou o terceiro,
    // e a lista continua FECHADA -- um quarto campo e uma decisao a tomar, nao
    // um detalhe a acrescentar.
    assert.deepEqual(Object.keys(autor.properties ?? {}), [
      'handle',
      'display_name',
      'photo_icon_url',
    ]);
    assert.equal(
      autor.additionalProperties,
      false,
      'corpo aberto deixaria um campo de pessoa entrar sem ninguem decidir',
    );
  });

  void it('EMENDA 5 -- a foto e a `thumb` de 176, e NUNCA a `card` de 512', () => {
    // **ESTE CASO MUDOU DE AFIRMACAO EM 20/10/2026.** Ele dizia que nao havia
    // foto de pessoa aqui -- e estava certo: a Emenda 3 limitava a
    // `Conversation.participants[]` *"e em mais nenhuma resposta deste
    // contrato"*. A frente parou e perguntou; a Emenda 5 nomeou esta
    // superficie.
    //
    // **O que substituiu nao e "pode ter foto": e QUAL foto.** A conta e da
    // propria emenda: o icone pinta 40 dp (120 px reais a 3x); a `thumb` de 176
    // cobre sem ampliar (1,47x) e a `card` de 512 seria 4,27x mais dado do que
    // a celula pinta, vinte vezes por pagina. O campo e um so, escalar e sem
    // estado -- e nunca um objeto `photo:`, que abriria espaco para `status` e
    // `rejection_reason` voltarem para uma resposta de terceiro.
    const foto = (autor.properties ?? {})['photo_icon_url'] as
      | { type?: string; format?: string; nullable?: boolean }
      | undefined;
    assert.ok(foto !== undefined, 'a foto do autor saiu do contrato');
    assert.equal(foto.type, 'string', 'a foto virou objeto: `photo_icon_url` e escalar');
    assert.equal(foto.format, 'uri');
    assert.equal(foto.nullable, true, 'nula e o estado normal em tres casos, e nenhum e erro');
    // Nenhum campo de ESTADO entrou com ela.
    const campos = Object.keys(autor.properties ?? {});
    for (const proibido of ['status', 'rejection_reason', 'photo', 'photo_url', 'avatar_url']) {
      assert.ok(
        !campos.includes(proibido),
        `\`PublicationAuthor.${proibido}\`: a Emenda 5 abre UM campo escalar e sem estado`,
      );
    }
  });

  void it('ISCA -- `photo_icon_url` tem uma LISTA FECHADA de hospedeiros, e sao DOIS', () => {
    // A varredura e sobre o CONTRATO, e nao sobre esta fatia: ela reprova
    // qualquer resposta nova que ganhe o campo, de qualquer frente.
    //
    // **Ela desce a arvore inteira, e nao so as propriedades de primeiro nivel
    // dos schemas nomeados.** Descobrir isso valeu o caso: em
    // `Conversation.participants[]` o participante e um objeto INLINE -- nao ha
    // schema `ConversationParticipant` --, e a primeira versao deste caso
    // procurava `schema.properties.photo_icon_url` nos schemas nomeados e nao
    // achava NADA. Ela ficou verde afirmando que o campo nao existia em lugar
    // nenhum, que e a forma exata de um portao cego.
    const hospedeiros = caminhosDaPropriedade(spec, 'photo_icon_url');
    assert.deepEqual(
      hospedeiros,
      [
        // Emenda 3 (19/10/2026): a conversa mediada. Objeto INLINE -- e e por
        // isso que esta varredura desce a arvore.
        'components.schemas.Conversation.properties.participants.items',
        // Emenda 5 (20/10/2026): o autor de uma publicacao, e com ele o autor
        // de um COMENTARIO -- que reusa o mesmo schema de proposito.
        'components.schemas.PublicationAuthor',
      ].sort(),
      'a foto de pessoa ganhou hospedeiro novo, ou perdeu um. O ADR-0010 a limita as ' +
        'superficies das emendas 3 e 5, por nome, e abrir uma terceira e decisao do ' +
        'cliente -- nao de quem implementa',
    );
  });

  void it('ISCA -- a varredura de `photo_icon_url` REPROVA um hospedeiro novo INLINE', () => {
    // Sem esta isca, o caso de cima passaria por nao haver hospedeiro novo -- e
    // nao por ele saber reconhecer um. E a mutacao usa a forma INLINE de
    // proposito, que e justamente a que a primeira versao nao enxergava.
    const comVazamento = {
      components: {
        schemas: {
          Publication: {
            properties: {
              author: { properties: { photo_icon_url: { type: 'string' } } },
            },
          },
        },
      },
    };
    assert.deepEqual(caminhosDaPropriedade(comVazamento, 'photo_icon_url'), [
      'components.schemas.Publication.properties.author',
    ]);
  });

  void it('ISCA -- NENHUM identificador interno no autor: item 6 do ADR-0010', () => {
    const familia = schemasAlcancados({ $ref: '#/components/schemas/Publication' });
    for (const nome of familia) {
      const schema = spec.components.schemas[nome];
      if (schema === undefined) continue;
      assert.doesNotMatch(
        JSON.stringify(schema),
        /"format"\s*:\s*"uuid"/,
        `\`${nome}\` declara um campo com \`format: uuid\`, e o item 6 do ADR-0010 proibe ` +
          'UUID interno em saida',
      );
      const propriedades = Object.keys(
        (schema as { properties?: Record<string, unknown> }).properties ?? {},
      );
      for (const proibido of ['id', 'user_id', 'author_user_id', 'public_ref', 'image_id']) {
        assert.ok(
          !propriedades.includes(proibido),
          `\`${nome}.${proibido}\`: o que enderecha a publicacao e \`ref\`, e o autor e o apelido`,
        );
      }
    }
  });

  void it('ISCA -- NENHUM campo de pet em lugar nenhum da familia: item 7 do ADR-0010', () => {
    // Foto de pet numa publicacao e permitida (cliente, 19/10); MARCAR o pet
    // ou ligar a ficha dele, nao -- isso agruparia os pets de um tutor. A
    // defesa e nao haver campo, e nao um `if`.
    const familia = [
      ...schemasAlcancados({ $ref: '#/components/schemas/Publication' }),
      ...schemasAlcancados({ $ref: '#/components/schemas/MyPublication' }),
      ...schemasAlcancados({ $ref: '#/components/schemas/PublicationInput' }),
    ];
    for (const nome of new Set(familia)) {
      const propriedades = Object.keys(
        (spec.components.schemas[nome] as { properties?: Record<string, unknown> })?.properties ??
          {},
      );
      for (const campo of propriedades) {
        assert.doesNotMatch(
          campo,
          /pet|animal|species|breed/i,
          `\`${nome}.${campo}\` liga publicacao a pet: o item 7 do ADR-0010 proibe agrupar ` +
            'os pets de um tutor',
        );
      }
    }
  });

  void it('ISCA -- NENHUM campo de lugar: ADR-0006, nao ha geocodificacao', () => {
    const familia = [
      ...schemasAlcancados({ $ref: '#/components/schemas/Publication' }),
      ...schemasAlcancados({ $ref: '#/components/schemas/PublicationInput' }),
    ];
    for (const nome of new Set(familia)) {
      const propriedades = Object.keys(
        (spec.components.schemas[nome] as { properties?: Record<string, unknown> })?.properties ??
          {},
      );
      for (const campo of propriedades) {
        assert.doesNotMatch(
          campo,
          /lat|lon|^city$|neighbourhood|postal|geo|distance/i,
          `\`${nome}.${campo}\` e recorte geografico: "publicacoes perto de voce" seria ` +
            'coordenada disfarcada (ADR-0006)',
        );
      }
    }
  });

  void it('ISCA -- a familia da publicacao NAO usa `photo` nem `open_url`, e os dois portoes vizinhos dizem por que', () => {
    // **Os dois nomes foram cobrados por portao desta casa, antes do commit:**
    //
    //   - `foto-de-pessoa-nao-sai-em-publico.test.ts` conta os campos `photo:`
    //     do contrato inteiro e exige DOIS. A palavra `photo` ali significa foto
    //     de PESSOA, e um terceiro e "uma superficie a mais";
    //   - `vitrine-nao-sai-para-terceiro.test.ts` varre `grid_url` e `open_url`
    //     por NOME DE CAMPO, em profundidade, para pegar "um schema novo,
    //     chamado de outra coisa, com uma das duas derivadas dentro".
    //
    // Os dois reprovaram quando esta familia usava `photo:` e `open_url`, e
    // **nenhum foi afrouxado**: os nomes mudaram para `image` e `url`. Esta
    // isca e o que impede a volta -- e ela reprova AQUI, na propria familia,
    // em vez de deixar o vizinho reprovar depois.
    const familia = [
      ...schemasAlcancados({ $ref: '#/components/schemas/Publication' }),
      ...schemasAlcancados({ $ref: '#/components/schemas/MyPublication' }),
    ];
    for (const nome of new Set(familia)) {
      const propriedades = Object.keys(
        (spec.components.schemas[nome] as { properties?: Record<string, unknown> })?.properties ??
          {},
      );
      for (const proibido of ['photo', 'open_url', 'grid_url']) {
        assert.ok(
          !propriedades.includes(proibido),
          `\`${nome}.${proibido}\`: \`photo\` e o nome da foto de PESSOA nesta casa e ` +
            '`open_url`/`grid_url` sao os da VITRINE. A imagem da publicacao e `image`/`url`, ' +
            'e os dois portoes vizinhos cobram isso',
        );
      }
    }
  });

  void it('ISCA -- NAO HA campo de visibilidade a escolher na escrita', () => {
    // Decisao do cliente: *"se elas forem amigas nao tem problema, o que nao
    // pode e ser publico, sem ter nenhum relacionamento"*. A visibilidade e
    // UMA, e um seletor com uma opcao nao e uma escolha -- seria um campo que o
    // servidor tem de ignorar, e campo ignorado e o `if` esperando nascer.
    const entrada = spec.components.schemas.PublicationInput as {
      properties?: Record<string, unknown>;
      additionalProperties?: boolean;
    };
    assert.deepEqual(Object.keys(entrada.properties ?? {}), ['body', 'upload_id', 'alt_text']);
    assert.equal(entrada.additionalProperties, false);
  });
});

void describe('ISCA (b): as etiquetas fechadas nao foram tocadas', () => {
  function contarEtiqueta(etiqueta: string): number {
    let total = 0;
    for (const { operacao } of OPERACOES) {
      const etiquetas = (operacao.tags ?? []) as readonly string[];
      if (etiquetas.includes(etiqueta)) total += 1;
    }
    return total;
  }

  void it('`connections` continua com CINCO, `people` tem TRES e `safety` SEIS', () => {
    // As tres sao fechadas por portao ou por desenho, e o Mural tem etiqueta
    // propria justamente para nao encostar nelas. Este caso e o aviso de que
    // alguem encostou.
    //
    // **`people` passou de UMA para TRES em 20/10/2026**, por decisao do
    // cliente: entraram `searchPeople` (a busca, com piso de 3 caracteres, teto
    // por conta e campo vazio que nao lista ninguem) e
    // `resolveConnectionInvite` (a mesma leitura de perfil, enderecada pelo
    // token do convite). O numero continua FECHADO -- uma quarta reprova aqui.
    //
    // **`connections` continua com CINCO, e isso nao e coincidencia**: o
    // caminho por apelido entrou como campo no CORPO de `requestConnection`, e
    // as duas operacoes do convite ficaram na etiqueta `connection-invites`
    // justamente para nao encostar neste numero.
    assert.equal(contarEtiqueta('connections'), 5, 'a etiqueta `connections` mudou de tamanho');
    assert.equal(contarEtiqueta('people'), 3, 'a etiqueta `people` mudou de tamanho');
    assert.equal(contarEtiqueta('safety'), 6, 'a etiqueta `safety` mudou de tamanho');
    assert.equal(
      contarEtiqueta('connection-invites'),
      2,
      'a etiqueta `connection-invites` e fechada em DUAS (emitir e revogar). A terceira ' +
        'operacao do convite -- resolver -- mora em `people`, porque a resposta dela e um ' +
        'perfil.',
    );
  });

  void it('`publications` tem DEZ operacoes, e sao estas', () => {
    // Eram CINCO ate 20/10/2026; curtir e comentar trouxeram as outras cinco.
    const ids = OPERACOES.filter(({ operacao }) =>
      ((operacao.tags ?? []) as readonly string[]).includes('publications'),
    )
      .map(({ operacao }) => String(operacao.operationId))
      .sort();
    assert.deepEqual(ids, [
      'commentOnPublication',
      'createPublication',
      'createPublicationPhotoUploadIntent',
      // Era `deleteMyComment` ate 20/10/2026. O nome mudou com a decisao do
      // cliente de que o DONO DA PUBLICACAO tambem apaga: com o segundo caminho,
      // "my" passou a ser falso na metade dos usos -- e `operationId` e o nome
      // que o cliente gerado carrega. oasdiff: nao quebrante.
      'deleteComment',
      'deleteMyPublication',
      'getMyTimeline',
      'likePublication',
      'listMyPublications',
      'listPublicationComments',
      'unlikePublication',
    ]);
  });

  void it('NAO EXISTE "seguir" no contrato: nenhum campo, valor nem operacao de `follow`', () => {
    // O cliente decidiu "os dois, conexao e seguir" em 18/10. **Seguir nao foi
    // construido**, e esta frente para aqui de proposito: ele e objeto novo
    // (tabela, operacoes e a lista "quem me segue"), e o portao
    // `conexao-nao-expoe-lista-nem-identificador.test.ts` nomeia a ausencia num
    // caso proprio. A decisao de abrir a lista e do cliente, com emenda de ADR,
    // e nao desta fatia.
    //
    // A varredura e sobre NOME DE CAMPO, VALOR DE ENUM e `operationId` -- e nao
    // sobre a prosa: a descricao de `getMyTimeline` cita "seguir" de proposito,
    // para dizer que ele nao existe, e uma varredura de texto puro reprovaria
    // exatamente a frase que documenta a ausencia.
    for (const [nome, schema] of Object.entries(spec.components.schemas)) {
      const bloco = schema as { properties?: Record<string, unknown>; enum?: readonly string[] };
      for (const campo of Object.keys(bloco.properties ?? {})) {
        assert.doesNotMatch(campo, /follow/i, `\`${nome}.${campo}\` fala de seguir`);
      }
      for (const valor of bloco.enum ?? []) {
        assert.doesNotMatch(String(valor), /follow/i, `\`${nome}\` tem o valor \`${String(valor)}\``);
      }
    }
    for (const { operacao } of OPERACOES) {
      assert.doesNotMatch(String(operacao.operationId), /follow/i);
    }
  });
});

void describe('CONTRAPESOS -- sem eles a varredura passaria no vazio', () => {
  void it('CONTRAPESO -- `getMyTimeline` CARREGA a publicacao de verdade', () => {
    // Sem ele, todos os casos de omissao acima passariam num mundo em que a
    // publicacao nao existe em contrato nenhum -- que e a forma mais facil de um
    // teste de omissao ficar verde sem ter medido nada.
    const linha = OPERACOES.find(({ chave }) => chave === 'get /timeline');
    assert.ok(linha, '`GET /timeline` nao existe no contrato');
    assert.deepEqual([...linha.carrega].sort(), [
      'Publication',
      'PublicationAuthor',
      'PublicationImage',
      'PublicationPage',
    ]);
  });

  void it('CONTRAPESO -- `listMyPublications` e `createPublication` carregam a forma do DONO', () => {
    for (const chave of ['get /me/publications', 'post /me/publications']) {
      const achada = OPERACOES.find((o) => o.chave === chave);
      assert.ok(achada, `${chave} nao existe`);
      assert.ok(
        achada.carrega.includes('MyPublication'),
        `${chave} nao carrega \`MyPublication\`: a leitura do dono perdeu o estado da foto`,
      );
      assert.ok(
        !achada.carrega.includes('Publication'),
        `${chave} carrega \`Publication\`: a forma do dono e a da linha do tempo sao ` +
          'diferentes de proposito, e misturar as duas devolveria `mine` ao proprio dono',
      );
    }
  });

  void it('CONTRAPESO -- a forma do DONO tem estado e a da linha do tempo NAO', () => {
    // E a mesma reducao que `PersonShowcasePhoto` fez sobre `ShowcasePhoto`:
    // motivo de recusa e assunto entre o dono e quem modera.
    const doDono = Object.keys(
      (spec.components.schemas.MyPublicationImage as { properties?: Record<string, unknown> })
        .properties ?? {},
    );
    const daLinha = Object.keys(
      (spec.components.schemas.PublicationImage as { properties?: Record<string, unknown> })
        .properties ?? {},
    );
    assert.ok(doDono.includes('status') && doDono.includes('rejection_reason'));
    assert.deepEqual(daLinha, ['url', 'alt_text']);
  });
});
