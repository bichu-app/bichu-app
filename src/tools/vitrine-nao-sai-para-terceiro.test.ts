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
 * Mostrar a vitrine a terceiro contraria decisão registrada e seria decisão do
 * cliente. Enquanto não houver essa decisão, a superfície que a mostraria **não
 * existe** — e é mais barato não existir do que existir com uma regra de
 * autorização que alguém esquece de repetir na segunda rota.
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

/** Os esquemas da vitrine que carregam FOTO. `*Input` são de escrita. */
const ESQUEMAS_DE_LEITURA = ['MyShowcase', 'ShowcasePhoto'] as const;

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
      'a vitrine de OUTRA pessoa não tem rota, e a ausência é a defesa: regra de autorização alguém esquece de repetir',
    );
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
