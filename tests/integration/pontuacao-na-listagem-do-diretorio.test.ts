/**
 * **A pontuacao agregada na LISTAGEM do diretorio, contra Postgres de verdade**
 * (BICHUS-313).
 *
 * ## Por que este arquivo nao pode ser unitario
 *
 * Nada do que ele mede existe fora do Postgres:
 *
 * - **`round(avg(rating), 1)`** e a media NULA de conjunto vazio. Um duble
 *   devolve o que se puser nele -- e `media: 0` e exatamente o que um duble
 *   deixa passar.
 * - **`conta_habilitada(author_user_id)`** e uma funcao do banco. O recorte da
 *   media precisa ser o MESMO da lista de avaliacoes, e "o mesmo" so e
 *   verificavel com as duas consultas no mesmo banco, sobre as mesmas linhas.
 * - **o `CROSS JOIN LATERAL`** correlacionado. Em memoria ele nao existe: o que
 *   se mediria e um `map`.
 *
 * A contagem de CONSULTAS da rota e medida noutro lugar, em unidade e sem banco
 * (`pontuacao-da-listagem-sai-em-uma-consulta.test.ts`): ela e uma propriedade
 * do SQL emitido e nao precisa de Postgres para ser contada.
 *
 * ## O QUE DESLIGAR PARA VER CADA CASO REPROVAR
 *
 * Em `kysely-directory-repository.ts`:
 *
 * - tire `.crossJoinLateral(PONTUACAO_DO_CARTAO)` e as sete colunas de
 *   `pontuacao.*` -> nao compila, que e o portao certo. Devolva
 *   `PONTUACAO_VAZIA` no lugar de `comoPontuacao(l)` para ver o arquivo
 *   reprovar: cai `a media e a contagem do cartao sao as do local`.
 *
 * Numa migracao nova (NAO altere as que ja subiram), sobre
 * `pontuacao_do_local`:
 *
 * - troque `round(avg(r.rating)::numeric, 1)` por
 *   `COALESCE(round(avg(r.rating)::numeric, 1), 0)` -> reprova
 *   `local SEM avaliacao devolve media NULA, e nunca zero`. E a regressao mais
 *   plausivel desta regra, porque parece limpeza;
 * - tire `AND conta_habilitada(r.author_user_id)` -> reprovam
 *   `avaliacao de autor DESABILITADO nao entra na media nem na contagem` e
 *   `o numero do cartao e o da lista de avaliacoes CONCORDAM`. Este e o controle
 *   que importa: sem ele a lista mostra 1 avaliacao e o cartao diz 2.
 *
 * O controle positivo do terceiro caso foi rodado em 28/10/2026 derrubando o
 * predicado na sessao do teste (`CREATE OR REPLACE FUNCTION
 * pontuacao_do_local` sem `conta_habilitada`), e esta no proprio arquivo: ver
 * `CONTROLE_POSITIVO`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';

import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarDirectoryRepository } from '../../src/modules/professionals/adapters/persistence/kysely-directory-repository.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { projetarEntrada } from '../../src/modules/professionals/domain/entrada-do-diretorio.js';
import type { DirectoryRepository } from '../../src/modules/professionals/ports/directory-repository.js';
import type { Instant, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

const AGORA = 1_800_000_000_000 as Instant;
const URL_DE_MIDIA = (chave: string): string => `https://img.bichu.test/${chave}`;
/** `.invalid` e reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';
/** Prefixo proprio: a limpeza apaga so o que este arquivo criou. */
const PREFIXO = 'bichus313-';

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let repo: DirectoryRepository;

const contas: UserId[] = [];
const locais: string[] = [];

async function criarConta(): Promise<UserId> {
  const id = randomUUID() as UserId;
  await cliente.query(
    `INSERT INTO users (id, email, public_ref)
     VALUES ($1, $2, translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_'))`,
    [id, `${PREFIXO}${id}@${DOMINIO_DE_TESTE}`],
  );
  contas.push(id);
  return id;
}

async function criarLocal(slug: string, titular: UserId): Promise<string> {
  const id = randomUUID();
  await cliente.query(
    `INSERT INTO professionals (
       id, kinds, display_name, city, state, neighborhood,
       source, claim_status, claimed_at, claimed_by_user_id,
       verification_level, slug, status, published_at
     ) VALUES ($1, $2, $3, 'São Paulo', 'SP', 'Pinheiros',
               'self', 'claimed', now(), $4, 'none', $5, 'published', now())`,
    [id, ['vet'], `Local ${slug}`, titular, slug],
  );
  locais.push(id);
  return id;
}

/** `ref` no formato que o CHECK exige: 22 caracteres de `[A-Za-z0-9_-]`. */
function ref(semente: string): string {
  return semente.replace(/[^A-Za-z0-9_-]/g, 'x').padEnd(22, 'x').slice(0, 22);
}

async function avaliar(local: string, autor: UserId, nota: number): Promise<void> {
  await cliente.query(
    `INSERT INTO professional_reviews (id, ref, professional_id, author_user_id, rating, status)
     VALUES ($1, $2, $3, $4, $5, 'published')`,
    [randomUUID(), ref(`${PREFIXO}${randomUUID()}`), local, autor, nota],
  );
}

/** A exclusao logica, que e o que `conta_habilitada` le. */
async function desabilitar(conta: UserId): Promise<void> {
  await cliente.query(`UPDATE users SET deleted_at = now() WHERE id = $1`, [conta]);
}

/**
 * O cartao DESTE slug, pela listagem -- e nao pela pagina do local.
 *
 * Passa por `projetarEntrada`, de proposito: o que o cliente ve e a RESPOSTA, e
 * ler `pontuacao` direto do repositorio deixaria de medir o unico lugar que
 * decide "`average` nulo quando `count` e zero".
 */
async function cartao(
  slug: string,
  chamador: UserId,
): Promise<{ average: number | null; count: number; histogram: Record<string, number> }> {
  const pagina = await repo.listarPublicados({
    chamador,
    familia: undefined,
    agora: AGORA,
    q: `Local ${slug}`,
    sort: 'name',
    page: 1,
    limit: 20,
  });
  const itens = pagina.itens.filter((e) => e.slug === slug);
  const unico = itens[0];
  // **O filtro tem de PROVAR que casou.** Filtro que nao casa devolve zero de
  // tudo, e um `?? PONTUACAO_VAZIA` aqui transformaria "o cartao desapareceu da
  // lista" em "o local nao tem avaliacao" -- aprovando o caso da media nula
  // pelo motivo errado.
  assert.equal(itens.length, 1, `o cartao de ${slug} nao saiu na listagem (busca por nome)`);
  assert.ok(unico !== undefined);
  const projetado = projetarEntrada(unico, URL_DE_MIDIA);
  return {
    average: projetado.rating.average,
    count: projetado.rating.count,
    histogram: { ...projetado.rating.histogram },
  };
}

/**
 * O CONTROLE POSITIVO do recorte, ligavel por variavel de ambiente.
 *
 * Com `BICHUS313_SEM_RECORTE=1` a sessao do teste substitui
 * `pontuacao_do_local` por uma versao SEM `conta_habilitada` -- e os dois casos
 * do autor desabilitado tem de reprovar. **Nao e uma migracao**: o `CREATE OR
 * REPLACE` roda na pilha efemera, que e derrubada com `-v` ao fim, e so quando
 * a variavel esta ligada.
 *
 * Ele existe escrito, e nao so descrito num comentario, porque "eu desliguei e
 * reprovou" nao e verificavel por quem le depois.
 */
const CONTROLE_POSITIVO = process.env['BICHUS313_SEM_RECORTE'] === '1';

const SEM_RECORTE = `
CREATE OR REPLACE FUNCTION pontuacao_do_local(p_professional uuid)
RETURNS TABLE (media numeric, quantidade bigint,
               n1 bigint, n2 bigint, n3 bigint, n4 bigint, n5 bigint)
LANGUAGE sql STABLE AS $$
  SELECT round(avg(r.rating)::numeric, 1),
         count(*),
         count(*) FILTER (WHERE r.rating = 1),
         count(*) FILTER (WHERE r.rating = 2),
         count(*) FILTER (WHERE r.rating = 3),
         count(*) FILTER (WHERE r.rating = 4),
         count(*) FILTER (WHERE r.rating = 5)
    FROM professional_reviews r
   WHERE r.professional_id = p_professional
     AND r.status = 'published'
$$;`;

void describe(
  'a pontuacao agregada na listagem do diretorio, contra Postgres',
  { skip: CONEXAO === undefined ? 'sem DATABASE_URL: a pilha efêmera não está de pé' : false },
  () => {
    before(async () => {
      assert.ok(CONEXAO !== undefined);
      banco = createDb(CONEXAO);
      db = banco.db;
      cliente = new pg.Client({ connectionString: CONEXAO });
      await cliente.connect();
      repo = criarDirectoryRepository(db, criarIdGenerator(() => Date.now()));
      if (CONTROLE_POSITIVO) await cliente.query(SEM_RECORTE);
    });

    after(async () => {
      if (locais.length > 0) {
        await cliente.query(`DELETE FROM professional_reviews WHERE professional_id = ANY($1)`, [
          locais,
        ]);
        await cliente.query(`DELETE FROM professionals WHERE id = ANY($1)`, [locais]);
      }
      if (contas.length > 0) {
        await cliente.query(`DELETE FROM users WHERE id = ANY($1)`, [contas]);
      }
      await cliente.end();
      await banco.close();
    });

    void it('a media e a contagem do cartao sao as do local', async () => {
      const quemLe = await criarConta();
      const slug = `bichus313-com-avaliacao-${randomUUID().slice(0, 8)}`;
      const local = await criarLocal(slug, await criarConta());
      // 5, 4 e 3 -> media 4,0 exata, e tres barras distintas no histograma.
      for (const nota of [5, 4, 3]) await avaliar(local, await criarConta(), nota);

      const r = await cartao(slug, quemLe);
      assert.equal(r.count, 3);
      assert.equal(r.average, 4);
      // Por CONJUNTO e nao por soma: um histograma todo em `n5` tambem somaria 3.
      assert.deepEqual(r.histogram, { '1': 0, '2': 0, '3': 1, '4': 1, '5': 1 });
    });

    void it('a media sai com UMA casa decimal, arredondada no servidor', async () => {
      const quemLe = await criarConta();
      const slug = `bichus313-uma-casa-${randomUUID().slice(0, 8)}`;
      const local = await criarLocal(slug, await criarConta());
      // 5, 4, 4 -> 13/3 = 4,333... -> 4,3. Sem o `round` viria 4.333333333333.
      for (const nota of [5, 4, 4]) await avaliar(local, await criarConta(), nota);

      const r = await cartao(slug, quemLe);
      assert.equal(r.average, 4.3, 'a media do cartao nao foi arredondada a uma casa');
    });

    void it('local SEM avaliacao devolve media NULA, e nunca zero', async () => {
      const quemLe = await criarConta();
      const slug = `bichus313-sem-avaliacao-${randomUUID().slice(0, 8)}`;
      await criarLocal(slug, await criarConta());

      const r = await cartao(slug, quemLe);
      assert.equal(r.count, 0);
      // `strictEqual` com `null`, e nao `assert.ok(!r.average)`: zero tambem e
      // falsy, e zero e precisamente o valor que nao pode sair daqui -- numa
      // escala de 1 a 5 ele se le como "pessimo", e um local que ninguem
      // avaliou nao e pessimo.
      // O "nao e zero" vem ANTES do "e nulo": depois do `strictEqual(null)` o
      // TypeScript ja estreitou o tipo para `null`, e a comparacao com zero
      // viraria uma assercao que o compilador sabe impossivel -- o `eslint`
      // reprova, e com razao: ela deixaria de medir qualquer coisa.
      assert.notStrictEqual(r.average, 0, 'media zero: um local sem avaliacao nao e "pessimo"');
      assert.strictEqual(r.average, null, 'media de local sem avaliacao tem de ser NULA');
      assert.deepEqual(r.histogram, { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 });
    });

    void it('avaliacao de autor DESABILITADO nao entra na media nem na contagem', async () => {
      const quemLe = await criarConta();
      const slug = `bichus313-autor-desabilitado-${randomUUID().slice(0, 8)}`;
      const local = await criarLocal(slug, await criarConta());

      const habilitado = await criarConta();
      const desabilitado = await criarConta();
      await avaliar(local, habilitado, 5);
      await avaliar(local, desabilitado, 1);

      // ANTES: as duas contam, e a media e 3,0. Medir o antes e o que separa
      // "o predicado funciona" de "a segunda avaliacao nunca existiu".
      const antes = await cartao(slug, quemLe);
      assert.equal(antes.count, 2, 'as duas avaliacoes deveriam contar antes de desabilitar');
      assert.equal(antes.average, 3);

      await desabilitar(desabilitado);

      const depois = await cartao(slug, quemLe);
      assert.equal(
        depois.count,
        1,
        'a avaliacao do autor desabilitado continuou na CONTAGEM do cartao',
      );
      assert.equal(depois.average, 5, 'a avaliacao do autor desabilitado continuou na MEDIA');
      assert.deepEqual(depois.histogram, { '1': 0, '2': 0, '3': 0, '4': 0, '5': 1 });
    });

    void it('o numero do cartao e o da lista de avaliacoes CONCORDAM', async () => {
      const quemLe = await criarConta();
      const slug = `bichus313-concordam-${randomUUID().slice(0, 8)}`;
      const local = await criarLocal(slug, await criarConta());

      for (const nota of [5, 4, 3]) await avaliar(local, await criarConta(), nota);
      const vaiSair = await criarConta();
      await avaliar(local, vaiSair, 1);
      await desabilitar(vaiSair);

      const r = await cartao(slug, quemLe);
      const lista = await repo.listarAvaliacoes({
        slug,
        chamador: quemLe,
        sort: 'recent',
        page: 1,
        limit: 20,
      });
      assert.ok(lista !== undefined, 'a lista de avaliacoes nao achou o local');
      // OS TRES numeros, e nao dois: `count` do cartao, `total` da lista e as
      // linhas que a lista de fato devolveu. E o defeito que a duplicacao de
      // recorte produz -- "128 avaliacoes" sobre uma lista que mostra 126 --, e
      // comparar so dois deles deixa um dos lados mentir sozinho.
      assert.equal(r.count, lista.total, 'o cartao e o total da lista discordam');
      assert.equal(
        r.count,
        lista.itens.length,
        'o cartao conta mais avaliacoes do que a lista mostra',
      );
      assert.equal(r.count, 3);
    });
  },
);
