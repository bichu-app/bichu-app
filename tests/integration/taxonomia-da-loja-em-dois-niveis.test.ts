/**
 * A categoria da `Loja` em DOIS NIVEIS, contra Postgres de verdade.
 *
 * ## Por que este arquivo existe
 *
 * O cliente decidiu em 17/10/2026, por extenso: "dois niveis, com
 * subcategorias como a petlove". A `20261017000003` apagou o
 * `CHECK (category IN (...))` de seis valores e poe no lugar duas tabelas de
 * vocabulario mais duas chaves estrangeiras.
 *
 * Essa troca **moveu uma garantia de lugar**, e e por isso que este arquivo
 * precisa existir. Enquanto a lista era um `CHECK`,
 * `conjunto-exato-dos-checks.test.ts` afirmava o conjunto inteiro de valores,
 * por extenso, e um valor que entrasse sem ninguem declarar reprovava. Agora o
 * conjunto esta em LINHAS, e nenhum portao existente olha para linha de
 * semente: sem este arquivo, uma subcategoria perdida numa mescla, ou uma
 * categoria que nasce sem rotulo, atravessaria tudo em silencio.
 *
 * ## As quatro perguntas, e o defeito que cada uma pega
 *
 * 1. **A semente esta inteira?** 14 categorias e 83 subcategorias, e os SEIS
 *    codigos antigos entre elas. O defeito: uma mescla que perde metade do
 *    `INSERT` e deixa o painel sem categoria para oferecer.
 * 2. **O APK publicado continua respondido?** Os seis codigos que ele filtra
 *    (`food`, `toy`, `hygiene`, `accessory`, `health`, `bed`) tem de estar
 *    ATIVOS. O defeito: desativar um deles num ajuste de vocabulario e
 *    derrubar o filtro de um binario que ninguem atualiza por decreto.
 * 3. **O par (categoria, subcategoria) e invariante de BANCO?** A chave
 *    estrangeira composta recusa subcategoria de outra categoria, e aceita
 *    nulo. O defeito: a conferencia existir so na aplicacao e um `UPDATE`
 *    direto, ou um caso de uso novo, gravar o par incoerente.
 * 4. **A arvore levantada e a de CACHORRO?** Toda subcategoria tem `dog` em
 *    `store_subcategory_species`, e nenhuma tem gato, passaro ou peixe. O
 *    defeito e o oposto do habitual: alguem INVENTAR a arvore de gato e ela
 *    passar a parecer levantada.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * ## Este arquivo REPROVA quando nao consegue verificar
 *
 * Sem banco nao ha caso a pular: ha falha ruidosa com o motivo. Arquivo de
 * inspecao que se pula sozinho termina verde e ocupa o lugar de um que
 * funcionaria.
 *
 * ## O que sobrevive a execucao
 *
 * Nada. O parceiro e os itens criados sao apagados no `after`; a semente da
 * taxonomia nao e tocada em nenhum caso -- ela e lida, nunca escrita.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

/** `23503` e `foreign_key_violation`; `23514` e `check_violation`. */
const VIOLACAO_DE_CHAVE_ESTRANGEIRA = '23503';

/**
 * Os SEIS codigos que existiam antes de 17/10 e que o APK publicado filtra.
 *
 * Esta lista nao e o vocabulario -- ele tem 14 --, e ela esta aqui por um
 * motivo so: o binario no bolso do cliente manda estes seis em
 * `?category=`, e nenhum deles pode sair nem ficar inativo sem uma versao
 * nova do aplicativo.
 */
const CODIGOS_QUE_O_APK_PUBLICADO_USA = [
  'accessory',
  'bed',
  'food',
  'health',
  'hygiene',
  'toy',
] as const;

const TOTAL_DE_CATEGORIAS = 14;
const TOTAL_DE_SUBCATEGORIAS = 83;

let cliente: pg.Client;

const parceirosCriados: string[] = [];
const itensCriados: string[] = [];

function sufixo(): string {
  return randomUUID().slice(0, 8);
}

async function criarParceiro(): Promise<string> {
  const id = randomUUID();
  await cliente.query(
    `INSERT INTO store_partners (id, slug, name, host, active, sort_order)
     VALUES ($1, $2, $3, 'exemplo.invalid', true, 0)`,
    [id, `parc-${sufixo()}`, 'Parceiro de teste'],
  );
  parceirosCriados.push(id);
  return id;
}

/** Insere um item com a classificacao pedida. Devolve o `id`, ou lanca. */
async function criarItem(
  partnerId: string,
  category: string,
  subcategory: string | null,
): Promise<string> {
  const id = randomUUID();
  await cliente.query(
    `INSERT INTO store_items (
       id, slug, partner_id, title, summary, category, subcategory,
       target_path, active, sort_order, published_at
     ) VALUES ($1, $2, $3, 'Item de teste', 'Resumo do item', $4, $5, '/item', true, 0, now())`,
    [id, `item-${sufixo()}`, partnerId, category, subcategory],
  );
  itensCriados.push(id);
  return id;
}

void describe('a categoria da Loja em dois niveis, contra Postgres', () => {
  before(async () => {
    if (CONEXAO === undefined) {
      throw new Error(
        'sem DATABASE_URL nem TEST_DATABASE_URL: este arquivo pergunta ao banco e nao tem o ' +
          'que perguntar. Reprovar e o comportamento correto -- pular deixaria a decisao de ' +
          '17/10 protegida so por confianca.',
      );
    }
    cliente = new pg.Client({ connectionString: CONEXAO });
    await cliente.connect();

    // Sem as tres tabelas todos os casos abaixo passariam por nao ter olhado
    // para nada. Mesma trava de `TABELAS_ESPERADAS` em `esquema.test.ts`.
    const { rows } = await cliente.query<{ tabela: string }>(
      `SELECT table_name AS tabela FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('store_categories', 'store_subcategories', 'store_subcategory_species')`,
    );
    assert.deepEqual(
      rows.map((r) => r.tabela).sort(),
      ['store_categories', 'store_subcategories', 'store_subcategory_species'],
      'a 20261017000003 nao esta aplicada: nao ha o que inspecionar, e isso e reprovacao',
    );
  });

  after(async () => {
    if (itensCriados.length > 0) {
      await cliente.query('DELETE FROM store_items WHERE id = ANY($1::uuid[])', [itensCriados]);
    }
    if (parceirosCriados.length > 0) {
      await cliente.query('DELETE FROM store_partners WHERE id = ANY($1::uuid[])', [
        parceirosCriados,
      ]);
    }
    await cliente.end();
  });

  // -----------------------------------------------------------------------
  // 1 e 2: a semente, e o que o APK publicado precisa encontrar
  // -----------------------------------------------------------------------

  void it('a semente traz as 14 categorias, todas com rotulo e ordem', async () => {
    const { rows } = await cliente.query<{ total: string; sem_rotulo: string }>(
      `SELECT count(*) AS total,
              count(*) FILTER (WHERE btrim(label) = '') AS sem_rotulo
         FROM store_categories WHERE active`,
    );
    assert.equal(Number(rows[0]?.total), TOTAL_DE_CATEGORIAS);
    assert.equal(Number(rows[0]?.sem_rotulo), 0);
  });

  void it('a ordem de exibicao nao tem empate: 14 valores distintos de `sort_order`', async () => {
    // Empate na ordem faz a lista do painel e a do app sairem diferentes entre
    // si e diferentes de si mesmas entre duas chamadas.
    const { rows } = await cliente.query<{ distintas: string }>(
      'SELECT count(DISTINCT sort_order) AS distintas FROM store_categories',
    );
    assert.equal(Number(rows[0]?.distintas), TOTAL_DE_CATEGORIAS);
  });

  void it('ISCA DO APK PUBLICADO: os seis codigos antigos existem e estao ATIVOS', async () => {
    const { rows } = await cliente.query<{ code: string }>(
      `SELECT code FROM store_categories
        WHERE active AND code = ANY($1::text[]) ORDER BY code`,
      [[...CODIGOS_QUE_O_APK_PUBLICADO_USA]],
    );
    assert.deepEqual(
      rows.map((r) => r.code),
      [...CODIGOS_QUE_O_APK_PUBLICADO_USA],
      'um codigo que o APK publicado filtra saiu do vocabulario: o binario no bolso do ' +
        'cliente passaria a receber lista vazia num filtro que funcionava',
    );
  });

  void it('o rotulo de `food` mudou para "Rações", e o CODIGO nao mudou', async () => {
    // O que a decisao de 17/10 troca nos seis antigos e o rotulo, e so ele:
    // `food` passou a se chamar "Rações" porque agora existe `treats`
    // ("Petiscos e ossos") ao lado.
    const { rows } = await cliente.query<{ label: string }>(
      "SELECT label FROM store_categories WHERE code = 'food'",
    );
    assert.equal(rows[0]?.label, 'Rações');
  });

  void it('a semente traz as 83 subcategorias da arvore de cachorro', async () => {
    const { rows } = await cliente.query<{ total: string }>(
      'SELECT count(*) AS total FROM store_subcategories WHERE active',
    );
    assert.equal(Number(rows[0]?.total), TOTAL_DE_SUBCATEGORIAS);
  });

  void it('toda subcategoria pertence a uma categoria que existe', async () => {
    // A chave estrangeira ja garante; o caso existe para pegar a semente que
    // escreve `treat` onde queria `treats` e sai com 82 em vez de 83.
    const { rows } = await cliente.query<{ orfas: string }>(
      `SELECT count(*) AS orfas FROM store_subcategories s
        WHERE NOT EXISTS (SELECT 1 FROM store_categories c WHERE c.code = s.category_code)`,
    );
    assert.equal(Number(rows[0]?.orfas), 0);
  });

  void it('Rações tem as seis subcategorias que o cliente leu na petlove, na ordem', async () => {
    const { rows } = await cliente.query<{ code: string }>(
      `SELECT code FROM store_subcategories
        WHERE category_code = 'food' AND active ORDER BY sort_order`,
    );
    assert.deepEqual(
      rows.map((r) => r.code),
      [
        'racao_seca',
        'racao_natural',
        'racao_umida',
        'racao_medicamentosa',
        'alimentacao_natural_fresca',
        'alimentacao_natural_congelada',
      ],
    );
  });

  // -----------------------------------------------------------------------
  // 3: o par e invariante de BANCO, nao conferencia de aplicacao
  // -----------------------------------------------------------------------

  void it('item com subcategoria DA sua categoria e aceito', async () => {
    const parceiro = await criarParceiro();
    await criarItem(parceiro, 'food', 'racao_seca');
  });

  void it('item SEM subcategoria e aceito -- o segundo nivel e opcional', async () => {
    // E o caso que decide a forma da chave estrangeira: ela e composta e
    // `MATCH SIMPLE`, entao a coluna nula nao e cobrada. Exigir o par
    // invalidaria todo cadastro anterior de uma vez.
    const parceiro = await criarParceiro();
    await criarItem(parceiro, 'food', null);
  });

  void it('ISCA: subcategoria de OUTRA categoria e RECUSADA pelo banco (23503)', async () => {
    const parceiro = await criarParceiro();
    await assert.rejects(
      () => criarItem(parceiro, 'food', 'bifinhos'),
      (erro: unknown) => {
        assert.equal((erro as { code?: string }).code, VIOLACAO_DE_CHAVE_ESTRANGEIRA);
        return true;
      },
      '`bifinhos` e de `treats`: o par incoerente precisa morrer no banco, e nao depender ' +
        'de a aplicacao ter lembrado de conferir',
    );
  });

  void it('ISCA: subcategoria inexistente e RECUSADA pelo banco', async () => {
    const parceiro = await criarParceiro();
    await assert.rejects(
      () => criarItem(parceiro, 'food', 'arranhador'),
      (erro: unknown) => {
        assert.equal((erro as { code?: string }).code, VIOLACAO_DE_CHAVE_ESTRANGEIRA);
        return true;
      },
    );
  });

  void it('ISCA: categoria fora do vocabulario e RECUSADA pelo banco', async () => {
    // A trava que o `CHECK` de seis valores fazia continua existindo; ela
    // mudou de forma, e este caso e a prova de que nao foi perdida na troca.
    const parceiro = await criarParceiro();
    await assert.rejects(
      () => criarItem(parceiro, 'areia', null),
      (erro: unknown) => {
        assert.equal((erro as { code?: string }).code, VIOLACAO_DE_CHAVE_ESTRANGEIRA);
        return true;
      },
    );
  });

  void it('ISCA: trocar a categoria de um item e deixar a subcategoria antiga e RECUSADO', async () => {
    // O caso real: o painel troca a categoria e esquece o segundo nivel. A
    // aplicacao recusa com `subcategory_not_in_category`; aqui se prova que,
    // se ela nao recusar, o banco recusa.
    const parceiro = await criarParceiro();
    const item = await criarItem(parceiro, 'food', 'racao_seca');
    await assert.rejects(
      () => cliente.query("UPDATE store_items SET category = 'treats' WHERE id = $1", [item]),
      (erro: unknown) => {
        assert.equal((erro as { code?: string }).code, VIOLACAO_DE_CHAVE_ESTRANGEIRA);
        return true;
      },
    );
  });

  void it('categoria com item nao pode ser APAGADA do vocabulario', async () => {
    // E por isso que categoria retirada fica INATIVA: apagar arrastaria os
    // itens pela chave estrangeira, e a Loja perderia produto cadastrado.
    const parceiro = await criarParceiro();
    await criarItem(parceiro, 'bed', null);
    await assert.rejects(
      () => cliente.query("DELETE FROM store_categories WHERE code = 'bed'"),
      (erro: unknown) => {
        assert.equal((erro as { code?: string }).code, VIOLACAO_DE_CHAVE_ESTRANGEIRA);
        return true;
      },
    );
  });

  // -----------------------------------------------------------------------
  // 4: a arvore levantada e a de CACHORRO, e dizer isso e metade da entrega
  // -----------------------------------------------------------------------

  void it('toda subcategoria foi levantada para `dog`', async () => {
    const { rows } = await cliente.query<{ sem_dog: string }>(
      `SELECT count(*) AS sem_dog FROM store_subcategories s
        WHERE NOT EXISTS (
          SELECT 1 FROM store_subcategory_species e
           WHERE e.category_code = s.category_code AND e.code = s.code
             AND e.species_code = 'dog')`,
    );
    assert.equal(Number(rows[0]?.sem_dog), 0);
  });

  void it('ISCA AO CONTRARIO: NENHUMA especie alem de `dog` foi levantada', async () => {
    // Este caso reprova quando alguem INVENTA a arvore de gato. Ela e
    // diferente (areia, banheiro, arranhador), o cliente nao a levantou, e
    // semear um palpite faria o vocabulario parecer conferido sem ter sido.
    //
    // Quando a arvore de gato chegar DE VERDADE, este caso muda junto -- e e
    // nesse momento que alguem olha para o conjunto inteiro, que e o ponto.
    const { rows } = await cliente.query<{ species_code: string }>(
      'SELECT DISTINCT species_code FROM store_subcategory_species ORDER BY species_code',
    );
    assert.deepEqual(
      rows.map((r) => r.species_code),
      ['dog'],
      'ha especie alem de cachorro em store_subcategory_species: as arvores de gato, ' +
        'passaro, peixe e outros nao foram levantadas em 17/10',
    );
  });
});
