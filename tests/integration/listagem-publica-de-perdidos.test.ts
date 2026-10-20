/**
 * A listagem publica de perdidos contra Postgres de verdade, depois de `city`
 * deixar de ser obrigatoria (`listPublicLostPets`).
 *
 * ## POR QUE ESTE ARQUIVO PRECISOU EXISTIR, e e uma lacuna medida e nao zelo
 *
 * A suite unitaria desta rota tem dois arquivos, e **nenhum dos dois consegue
 * provar a ORDEM**:
 *
 * - `adapters/http/listagem-publica-de-perdidos.test.ts` poe um dobre no lugar
 *   da porta. O dobre devolve a lista que o teste lhe der, na ordem em que ele
 *   a der; a ordem do servidor nao participa.
 * - `adapters/persistence/listagem-publica-de-perdidos-sem-id-interno.test.ts`
 *   le o SQL compilado, mas compila so
 *   `construtorDaListagemPublicaDePerdidos`, que e a consulta BASE -- os
 *   predicados e as juncoes. O `ORDER BY last_seen_at DESC, share_token ASC`, o
 *   `LIMIT` e o `OFFSET` moram em `criarListagemPublicaDePerdidos`, DEPOIS do
 *   construtor, e nao aparecem naquele SQL.
 *
 * MEDIDO em 19/10/2026, e e o motivo deste arquivo: uma isca escrita contra
 * `sqlDaPagina` para provar `ORDER BY last_seen_at desc` **reprovou de
 * imediato**, porque a clausula nao esta lah. Escrever o `ORDER BY` a mao no
 * ajudante do teste teria feito o caso passar medindo a copia do teste em vez
 * da ordenacao do produto -- vacuidade exata, e com a aparencia de prova.
 *
 * Entao "os 20 ultimos pets" -- o recorte que o cliente pediu em 19/10/2026
 * (*"devemos filtrar pelos 20 ultimos pets cadastrados"*) -- so se prova com
 * banco: inserindo casos com datas conhecidas e lendo de volta a ordem e o
 * corte.
 *
 * ## O QUE ESTE ARQUIVO NAO MEDE, dito em voz alta
 *
 * **Nada aqui mede distancia ou proximidade, porque a rota nao a tem.** A ordem
 * desta lista e temporal, e a ausencia da ordem por proximidade e decisao de
 * ADR e nao lacuna: o ADR-0006 proibe nominalmente latitude e longitude nesta
 * listagem, e o ADR-0010 (itens 4 e 5) proibe distancia em superficie
 * alcancavel sem conta. O que protege o lado do PEDIDO e a isca do arquivo
 * HTTP; o que protege o lado da RESPOSTA e `portao-contrato-publico.ts`.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * ## Este arquivo nao se pula em silencio
 *
 * Sem `DATABASE_URL` ele se pula com o motivo escrito, como os vizinhos; com
 * banco e sem as tabelas ele REPROVA, porque arquivo que aprova por nao ter
 * olhado ocupa o lugar de um que funcionaria.
 *
 * ## O que sobrevive a execucao
 *
 * Nada. O `after` apaga exatamente os casos, pets e contas que este arquivo
 * criou, por id, e nao encosta na massa do seed.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarListagemPublicaDePerdidos } from '../../src/modules/lostfound/adapters/persistence/kysely-listagem-publica-de-perdidos.js';
import type {
  ListagemPublicaDePerdidos,
  RecorteDePerdidos,
} from '../../src/modules/lostfound/ports/listagem-publica-de-perdidos.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let listagem: ListagemPublicaDePerdidos;

/** So o que este arquivo criou. */
const casosCriados: string[] = [];
const petsCriados: string[] = [];
const contasCriadas: string[] = [];

/** O instante de referencia, fixo: a janela nao sai do relogio da maquina. */
const AGORA = new Date('2026-10-19T12:00:00.000Z');

/**
 * A cidade deste arquivo e UNICA por execucao.
 *
 * Sem isso, o caso "sem cidade" leria tambem a massa do seed e de qualquer
 * outro arquivo que tenha deixado caso aberto, e as assercoes de ORDEM e de
 * CORTE passariam ou reprovariam por causa de dado que nao e deste teste. Com
 * uma cidade propria, o caso "com cidade" mede exatamente a massa daqui, e o
 * caso "sem cidade" prova o que tem de provar de outro jeito: que a massa daqui
 * aparece numa consulta que nao pediu cidade nenhuma.
 */
const CIDADE = `Cidade-${randomUUID().slice(0, 8)}`;

interface Semente {
  readonly horasAtras: number;
  readonly nome: string;
  /** Com ponto marcado no mapa, ou sem. */
  readonly comPonto?: boolean;
  /** `null` grava caso SEM rotulo de cidade (so coordenada). */
  readonly cidade?: string | null;
}

async function criarCaso(s: Semente): Promise<string> {
  const contaId = randomUUID();
  const petId = randomUUID();
  const casoId = randomUUID();
  const visto = new Date(AGORA.getTime() - s.horasAtras * 3_600_000);

  await cliente.query(
    `INSERT INTO users (id, email, public_ref, display_name, status)
     VALUES ($1, $2, $3, $4, 'active')`,
    [
      contaId,
      `perdidos-${contaId}@exemplo-de-teste.invalid`,
      randomUUID().replace(/-/g, '').slice(0, 22),
      'Tutor de teste',
    ],
  );
  contasCriadas.push(contaId);

  await cliente.query(
    `INSERT INTO pets (id, owner_user_id, name, species_code, size_code, status)
     VALUES ($1, $2, $3, 'dog', 'M', 'active')`,
    [petId, contaId, s.nome],
  );
  petsCriados.push(petId);

  const cidade = s.cidade === undefined ? CIDADE : s.cidade;
  // `ST_MakePoint(lon, lat)` -- nesta ordem, que e o erro classico do PostGIS
  // porque ele nao falha. O ponto existe aqui so para provar que a presenca
  // dele NAO muda nem a inclusao nem a ordem desta lista.
  const ponto = s.comPonto === true ? 'ST_SetSRID(ST_MakePoint(-46.65, -23.56), 4326)' : 'NULL';
  await cliente.query(
    `INSERT INTO lost_cases (
       id, pet_id, owner_user_id, status, last_seen_at, last_seen_point,
       last_seen_city, share_to_public_list, share_token, opened_at
     ) VALUES ($1, $2, $3, 'open', $4, ${ponto}, $5, true, $6, $4)`,
    [casoId, petId, contaId, visto, cidade, `tok-${casoId}`],
  );
  casosCriados.push(casoId);
  return casoId;
}

function recorte(ajustes: Partial<RecorteDePerdidos> = {}): RecorteDePerdidos {
  // `conjunto: 'aberto'` é SOMENTE os abertos, que é o que este arquivo sempre
  // mediu. A ausência de `case_state` passou a ser `padrao` (a união com os
  // reencontrados) em 20/10/2026, e a união é medida em
  // `selo-de-reencontro-na-listagem-publica.test.ts` — inclusive a propriedade
  // de que ela não tira nenhum aberto.
  return { conjunto: 'aberto', pagina: 1, limite: 20, agora: AGORA, ...ajustes };
}

void describe(
  'a listagem publica de perdidos, contra Postgres',
  {
    skip:
      CONEXAO === undefined
        ? 'sem DATABASE_URL: a pilha efemera nao esta de pe'
        : false,
  },
  () => {
    before(async () => {
      assert.ok(CONEXAO !== undefined);
      banco = createDb(CONEXAO);
      db = banco.db;
      cliente = new pg.Client({ connectionString: CONEXAO });
      await cliente.connect();
      listagem = criarListagemPublicaDePerdidos(db);

      // Sem as tabelas e sem as funcoes, todo caso abaixo passaria por nao ter
      // olhado para nada.
      const { rows } = await cliente.query<{ nome: string }>(
        `SELECT proname AS nome FROM pg_proc
          WHERE proname IN ('texto_para_busca', 'conta_habilitada')`,
      );
      const achadas = [...new Set(rows.map((r) => r.nome))].sort();
      assert.deepEqual(
        achadas,
        ['conta_habilitada', 'texto_para_busca'],
        'as funcoes que esta consulta chama nao estao aplicadas: nao ha o que medir, e isso e reprovacao',
      );

      // 25 casos, um por hora: mais de uma pagina, para o corte de 20 ter o que
      // cortar. `nome` carrega a posicao esperada para a mensagem de falha ser
      // legivel.
      for (let h = 0; h < 25; h += 1) {
        await criarCaso({ horasAtras: h, nome: `Pet ${String(h).padStart(2, '0')}` });
      }
    });

    after(async () => {
      if (casosCriados.length > 0) {
        await cliente.query('DELETE FROM lost_cases WHERE id = ANY($1::uuid[])', [casosCriados]);
      }
      if (petsCriados.length > 0) {
        await cliente.query('DELETE FROM pets WHERE id = ANY($1::uuid[])', [petsCriados]);
      }
      if (contasCriadas.length > 0) {
        await cliente.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [contasCriadas]);
      }
      await cliente.end();
      await banco.close();
    });

    /**
     * ISCA (a): a lista abre SEM cidade e TRAZ item.
     *
     * DESLIGANDO: reponha o predicado de cidade incondicional no adaptador
     * (tire o `if (recorte.cidade !== undefined)`) e este caso reprova pelo
     * nome -- sem cidade o predicado compararia contra `undefined` e a pagina
     * voltaria vazia.
     */
    void it('ISCA: sem cidade a lista traz itens, e o total conta mais de uma pagina', async () => {
      const pagina = await listagem.listar(recorte());
      assert.ok(pagina.itens.length > 0, 'a lista sem cidade tem de trazer item');
      assert.ok(
        pagina.total >= 25,
        `o total sem cidade deveria contar ao menos os 25 deste arquivo, e contou ${pagina.total}`,
      );
    });

    /**
     * ISCA (f), primeira metade: o corte padrao traz EXATAMENTE 20.
     */
    void it('ISCA: o recorte padrao traz exatamente 20 itens', async () => {
      const pagina = await listagem.listar(recorte());
      assert.equal(pagina.itens.length, 20);
    });

    /**
     * ISCA (f), segunda metade: **e eles sao os mais recentes, provado pela
     * DATA.**
     *
     * Nao basta contar 20: 20 quaisquer sao 20. O que se le aqui e
     * `vistoPorUltimoEm` de cada item, em ordem nao-crescente, e o mais antigo
     * da pagina tem de ser mais novo que o mais novo que ficou FORA dela.
     *
     * DESLIGANDO: troque `.orderBy('lost_cases.last_seen_at', 'desc')` por
     * `'asc'` em `criarListagemPublicaDePerdidos`, ou troque `last_seen_at` por
     * `opened_at`, e este caso reprova pelo nome.
     */
    void it('ISCA: os 20 do recorte padrao sao os mais RECENTES, pela data', async () => {
      const pagina = await listagem.listar(recorte({ cidade: CIDADE }));
      const datas = pagina.itens.map((i) => i.vistoPorUltimoEm.getTime());
      assert.equal(datas.length, 20);

      const emOrdem = [...datas].sort((a, b) => b - a);
      assert.deepEqual(datas, emOrdem, 'a pagina nao veio em ordem decrescente de data');

      // E o corte e pelo TOPO: a pagina 2 tem de ser toda mais antiga que a 1.
      const segunda = await listagem.listar(recorte({ cidade: CIDADE, pagina: 2 }));
      assert.equal(segunda.itens.length, 5, 'faltou a sobra de 25 - 20');
      const maisAntigoDaPrimeira = Math.min(...datas);
      for (const item of segunda.itens) {
        assert.ok(
          item.vistoPorUltimoEm.getTime() < maisAntigoDaPrimeira,
          `${item.petNome} esta na pagina 2 e e mais NOVO que o ultimo da pagina 1: ` +
            'o corte nao foi pelo topo',
        );
      }
    });

    /**
     * ISCA (e): o filtro muda o recorte de verdade.
     *
     * DESLIGANDO: tire o `if (recorte.cidade !== undefined)` OU o predicado de
     * dentro dele, e este caso reprova pelo nome -- a cidade inexistente
     * passaria a devolver a lista inteira.
     */
    void it('ISCA: pedir uma cidade recorta, e cidade inexistente devolve pagina vazia', async () => {
      const daCidade = await listagem.listar(recorte({ cidade: CIDADE }));
      assert.equal(daCidade.total, 25, 'a cidade deste arquivo tem exatamente 25 casos');

      const deNinguem = await listagem.listar(
        recorte({ cidade: `Nao-Existe-${randomUUID().slice(0, 8)}` }),
      );
      assert.equal(deNinguem.total, 0);
      assert.deepEqual(deNinguem.itens, []);
    });

    void it('CONTRAPESO: a cidade compara SEM acento e SEM caixa', async () => {
      // `texto_para_busca` dos dois lados. Sem este caso, trocar a comparacao
      // normalizada por `=` cru passaria pelas iscas acima, e a listagem
      // responderia vazio para quem digitou com acento diferente do gravado.
      const criada = await criarCaso({ horasAtras: 1, nome: 'Acentuado', cidade: 'São Paulo' });
      assert.ok(criada.length > 0);
      const pagina = await listagem.listar(recorte({ cidade: 'sao paulo' }));
      assert.ok(
        pagina.itens.some((i) => i.petNome === 'Acentuado'),
        'o caso gravado como "São Paulo" nao voltou para "sao paulo"',
      );
    });

    /**
     * ISCA (c)/(d) na forma que esta rota permite medir: **a coordenada nao
     * participa.**
     *
     * As provas (b), (c) e (d) do briefing eram sobre ordem por distancia, e
     * essa ordem nao existe nesta rota por decisao de ADR. O que resta medivel,
     * e o que de fato protege a tela, e o complemento: ter ou nao ter
     * coordenada **nao muda nada** -- nem inclusao, nem posicao. Sem isto,
     * alguem que acrescentasse um `WHERE last_seen_point IS NOT NULL` "para
     * ordenar melhor" sumiria com a maioria dos casos (medido em 19/10/2026:
     * em homologacao, 0 de 1 caso tem coordenada), e nenhum outro caso veria.
     *
     * DESLIGANDO: acrescente `.where('lost_cases.last_seen_point', 'is not', null)`
     * ao construtor e este caso reprova pelo nome.
     */
    void it('ISCA: caso SEM coordenada aparece igual, e na mesma posicao temporal', async () => {
      const marca = `Zz-${randomUUID().slice(0, 6)}`;
      // Duas horas de diferenca, o SEM ponto mais NOVO que o COM ponto. Se a
      // coordenada tivesse qualquer peso, a ordem entre os dois mudaria.
      await criarCaso({ horasAtras: 2, nome: `${marca}-com-ponto`, comPonto: true });
      await criarCaso({ horasAtras: 1, nome: `${marca}-sem-ponto`, comPonto: false });

      const pagina = await listagem.listar(recorte({ cidade: CIDADE }));
      const nomes = pagina.itens.map((i) => i.petNome);
      const semPonto = nomes.indexOf(`${marca}-sem-ponto`);
      const comPonto = nomes.indexOf(`${marca}-com-ponto`);

      assert.ok(semPonto >= 0, 'o caso SEM coordenada desapareceu da lista');
      assert.ok(comPonto >= 0, 'o caso COM coordenada desapareceu da lista');
      assert.ok(
        semPonto < comPonto,
        'o caso sem coordenada e mais recente e tinha de vir antes: a coordenada pesou na ordem',
      );
    });

    void it('ISCA: nenhum item devolvido carrega coordenada ou distancia', async () => {
      // A projecao da porta nao tem campo de coordenada, e este caso le as
      // CHAVES do que volta -- nao o tipo, que o compilador apaga.
      const pagina = await listagem.listar(recorte());
      const proibidas = [
        'lat',
        'lon',
        'latitude',
        'longitude',
        'point',
        'lastSeenPoint',
        'coordinate',
        'coordinates',
        'distanceM',
        'distance_m',
        'distancia',
      ];
      for (const item of pagina.itens) {
        const chaves = Object.keys(item as unknown as Record<string, unknown>);
        const vazadas = chaves.filter((c) => proibidas.includes(c));
        assert.deepEqual(
          vazadas,
          [],
          `o item ${item.petNome} voltou com ${vazadas.join(', ')} (ADR-0006, ADR-0010 item 4)`,
        );
      }
    });
  },
);
