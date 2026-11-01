import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';

const texto = readFileSync('api/openapi.yaml', 'utf8');
const spec = parseYaml(texto) as {
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, unknown> };
};

const ESQUEMAS_DE_LEITURA = ['MyShowcase', 'ShowcasePhoto', 'PersonShowcasePhoto'] as const;

const OPERACOES_COM_VITRINE = [
  'get /me/showcase',
  'get /people/{handle}',
  'post /connection-invites/resolution',
  'put /me/showcase',
] as const;

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

  void it('ISCA (a) -- a vitrine sai em QUATRO operacoes nomeadas, e nenhuma quinta', () => {
    const comVitrine = operacoes()
      .filter(({ op }) => {
        const alcancados = schemasAlcancados(op);
        if (ESQUEMAS_DE_LEITURA.some((e) => alcancados.has(e))) return true;
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
      'uma QUINTA operação com vitrine é uma superfície a mais, e precisa de decisão do ' +
        'cliente. As quatro são: as duas de `/me/showcase` (do dono), o perfil pelo ' +
        'apelido (19/10) e o perfil pelo token do convite (20/10) — e esta última é a ' +
        'MESMA projeção da anterior, não uma superfície nova.',
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
    const perfil = spec.components.schemas['PersonProfile'] as {
      required?: readonly string[];
      properties?: Record<string, unknown>;
    };
    assert.ok(perfil.properties?.['showcase'], 'o campo existe: é ele que a conexão aceita recebe');
    assert.ok(
      !(perfil.required ?? []).includes('showcase'),
      '`showcase` obrigatório obrigaria a borda a mandar `[]` para quem não é conexão',
    );
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
    const perfil = JSON.stringify(spec.components.schemas['PersonProfile']);
    assert.ok(!perfil.includes('#/components/schemas/MyShowcase'));
    assert.ok(!perfil.includes('#/components/schemas/ShowcasePhoto'));
  });

  void it('ISCA -- a vitrine não entrou em `Conversation`, `NetworkEvent` nem avaliação', () => {
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
