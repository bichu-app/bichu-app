/**
 * ISCA (b), METADE DO CONTRATO: **a publicação não sai para quem não tem relação
 * com o autor — medido NO CONTRATO, por omissão.**
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

/** Os esquemas que carregam PUBLICAÇÃO. */
const ESQUEMAS_DE_LEITURA = [
  'Publication',
  'PublicationPage',
  'PublicationImage',
  'PublicationAuthor',
  'MyPublication',
  'MyPublicationPage',
  'MyPublicationImage',
  'PublicationComment',
  'PublicationCommentPage',
  'PublicationCommentCreated',
] as const;

/** As operações que podem carregar publicação, **por nome**. */
const OPERACOES_COM_PUBLICACAO = new Set([
  'get /timeline',
  'get /me/publications',
  'post /me/publications',
  'get /publications/{publicationRef}/comments',
  'post /publications/{publicationRef}/comments',
]);

/**
 * Os schemas alcançáveis a partir de um bloco, seguindo `$ref` **em
 * profundidade**.
 */
function schemasAlcancados(bloco: unknown): Set<string> {
  const vistos = new Set<string>();
  const fila: unknown[] = [bloco];
  while (fila.length > 0) {
    const atual = fila.pop();
    if (atual === null || atual === undefined) continue;
    if (typeof atual === 'string') continue;
    if (Array.isArray(atual)) {
      fila.push(...(atual as unknown[]));
      continue;
    }
    if (typeof atual !== 'object') continue;
    for (const [chave, valor] of Object.entries(atual as Record<string, unknown>)) {
      if (chave === '$ref' && typeof valor === 'string') {
        const nome = valor.startsWith('#/components/schemas/')
          ? valor.slice('#/components/schemas/'.length)
          : undefined;
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

/** Onde, na árvore inteira do contrato, existe uma propriedade com este nome. */
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
    assert.equal(spec.paths['/publications/{publicationRef}'], undefined);
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
    for (const { chave } of OPERACOES) {
      assert.doesNotMatch(
        chave,
        /\/(people|users)\/\{[^}]+\}\/(publications|timeline)/,
        `${chave} e a linha do tempo de outra pessoa`,
      );
    }
  });

  void it('ISCA (b) -- a ISCA DA VARREDURA: uma operacao inventada com publicacao REPROVA', () => {
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

  void it('`PublicationAuthor` tem QUATRO campos, e a lista e fechada', () => {
    assert.deepEqual(Object.keys(autor.properties ?? {}), [
      'handle',
      'display_name',
      'photo_icon_url',
      'contact_channel_verified',
    ]);
    const selo = (autor.properties ?? {})['contact_channel_verified'] as Record<string, unknown>;
    assert.equal(selo['type'], 'boolean', 'o selo de validado nao e um booleano');
    assert.ok(!('nullable' in selo), 'o selo ganhou um terceiro estado: nulo nao e resposta aqui');
    assert.ok(!('enum' in selo), 'o selo passou a dizer QUAL canal foi confirmado');
    assert.deepEqual(
      Object.keys(selo).sort(),
      ['description', 'type'],
      'o campo do selo ganhou chave de schema alem de `type` e `description`',
    );
    assert.ok(
      autor.required?.includes('contact_channel_verified'),
      'o selo saiu de `required`: chave ausente faria o app ler `undefined` e ' +
        'desenhar o selo de um lado e nao do outro',
    );
    assert.equal(
      autor.additionalProperties,
      false,
      'corpo aberto deixaria um campo de pessoa entrar sem ninguem decidir',
    );
  });

  void it('EMENDA 5 -- a foto e a `thumb` de 176, e NUNCA a `card` de 512', () => {
    const foto = (autor.properties ?? {})['photo_icon_url'] as
      | { type?: string; format?: string; nullable?: boolean }
      | undefined;
    assert.ok(foto !== undefined, 'a foto do autor saiu do contrato');
    assert.equal(foto.type, 'string', 'a foto virou objeto: `photo_icon_url` e escalar');
    assert.equal(foto.format, 'uri');
    assert.equal(foto.nullable, true, 'nula e o estado normal em tres casos, e nenhum e erro');
    const campos = Object.keys(autor.properties ?? {});
    for (const proibido of ['status', 'rejection_reason', 'photo', 'photo_url', 'avatar_url']) {
      assert.ok(
        !campos.includes(proibido),
        `\`PublicationAuthor.${proibido}\`: a Emenda 5 abre UM campo escalar e sem estado`,
      );
    }
  });

  void it('ISCA -- `photo_icon_url` tem uma LISTA FECHADA de hospedeiros, e sao QUATRO', () => {
    const hospedeiros = caminhosDaPropriedade(spec, 'photo_icon_url');
    assert.deepEqual(
      hospedeiros,
      [
        'components.schemas.Conversation.properties.participants.items',
        'components.schemas.PersonSearchResult',
        'components.schemas.PublicationAuthor',
        'components.schemas.ConnectedPerson',
      ].sort(),
      'a foto de pessoa ganhou hospedeiro novo, ou perdeu um. O ADR-0010 a limita as ' +
        'superficies das emendas 3 e 5, a emenda de 21/10/2026 (o resultado da busca) e ' +
        'a de 22/10/2026 (a lista das proprias conexoes), por nome, e abrir uma quinta ' +
        'e decisao do cliente -- nao de quem implementa',
    );
  });

  void it('ISCA -- a varredura de `photo_icon_url` REPROVA um hospedeiro novo INLINE', () => {
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

  void it('`connections` tem SEIS, `people` tem TRES e `safety` SEIS', () => {
    assert.equal(contarEtiqueta('connections'), 6, 'a etiqueta `connections` mudou de tamanho');
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
    const ids = OPERACOES.filter(({ operacao }) =>
      ((operacao.tags ?? []) as readonly string[]).includes('publications'),
    )
      .map(({ operacao }) => String(operacao.operationId))
      .sort();
    assert.deepEqual(ids, [
      'commentOnPublication',
      'createPublication',
      'createPublicationPhotoUploadIntent',
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
