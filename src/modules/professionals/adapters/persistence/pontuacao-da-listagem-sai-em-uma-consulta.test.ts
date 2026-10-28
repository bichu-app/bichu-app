/**
 * ISCA — a pontuacao dos cartoes sai na MESMA consulta da pagina, e o numero de
 * consultas da rota **nao cresce com o numero de cartoes**.
 *
 * ## Por que este arquivo existe
 *
 * `listarPublicados` passou a devolver `rating` (BICHUS-313). A forma obvia de
 * conseguir isso e a errada: `pontuacaoDe(db, id)` por item, dentro do `map`.
 * Ela produz o resultado CERTO -- cada leitura esta correta, cada caso de
 * conteudo passa verde -- e leva a rota de 3 consultas a 23 numa pagina de 20.
 * Nenhum portao deste repositorio ve isso: nao e erro de tipo, nao e erro de
 * lint, e a resposta e identica. **So contar as consultas ve.**
 *
 * E por isso que este arquivo conta o SQL compilado em vez de conferir conteudo:
 * conteudo e o que os outros arquivos ja medem.
 *
 * ## O CONTROLE desta medicao
 *
 * Contar "3" com um item nao prova nada: um N+1 com um item tambem da 3. O que
 * prova e a IGUALDADE entre a contagem com 1 cartao e com 20 -- com N+1 elas
 * seriam 3 e 22. Os dois numeros estao no mesmo caso, de proposito.
 *
 * ## COMO DESLIGAR O MECANISMO E VER CADA CASO REPROVAR
 *
 * Em `kysely-directory-repository.ts`:
 *
 * - tire o `.crossJoinLateral(PONTUACAO_DO_CARTAO)` e as sete colunas de
 *   `pontuacao.*` da projecao, e leia a pontuacao com um
 *   `await pontuacaoDe(db, id)` dentro do `map` -> reprovam
 *   `a listagem emite o MESMO numero de consultas com 1 e com 20 cartoes` e
 *   `a pontuacao sai da consulta da PAGINA, uma vez por pagina`;
 * - troque `pontuacao_do_local(professionals.id)` por um `GROUP BY` escrito a
 *   mao na consulta -> reprova `a pontuacao vem da FUNCAO do banco, e nao de um
 *   recorte reescrito`, que e a guarda contra a segunda copia de
 *   `status = 'published' AND conta_habilitada(...)`;
 * - devolva `PONTUACAO_VAZIA` fixa em vez de `comoPontuacao(l)` -> reprova
 *   `a pontuacao de CADA cartao e a da linha dele`, que e a vacuidade conhecida
 *   deste repositorio (duble que devolve o que o servidor nao devolve).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bancoDeMentira } from '../../../../shared/db/banco-de-teste-que-devolve-linha.js';
import type { Database } from '../../../../shared/db/schema.js';
import type { Instant, OpaqueToken, UserId } from '../../../../shared/types/brands.js';
import type { FamiliaDeSessao } from '../../../identity/ports/localizacao-de-referencia-repository.js';
import type { PaginaDoDiretorio, RecorteDoDiretorio } from '../../ports/directory-repository.js';
import { criarDirectoryRepository } from './kysely-directory-repository.js';

const CONTA = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const APARELHO = '018f3a2b-0000-7000-8000-0000000000cc' as FamiliaDeSessao;
const AGORA = 1_792_500_000_000 as Instant;

/** O `ids` nao e exercitado por `listarPublicados`: so a escrita sorteia `ref`. */
const IDS = {
  uuidv7: () => '018f3a2b-0000-7000-8000-00000000ffff',
  opaqueToken: () => 'nao-usado' as OpaqueToken,
  random128: () => new Uint8Array(16),
  random80: () => new Uint8Array(10),
};

/**
 * Uma linha da pagina, com as colunas da entrada E as sete da pontuacao.
 *
 * Os valores de `numeric`/`bigint` vem como TEXTO, que e o que o driver do
 * Postgres entrega -- devolver numero aqui esconderia a conversao que
 * `comoPontuacao` faz.
 */
function linha(n: number): Record<string, unknown> {
  return {
    slug: `local-${String(n)}`,
    kinds: ['clinic'],
    entity_kind: 'professional',
    display_name: `Local ${String(n)}`,
    about: null,
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Pinheiros',
    phone_e164: null,
    site_url: null,
    evidencias: null,
    distancia_em_metros: null,
    logo_public_key: null,
    // media distinta por linha: e o que torna o caso de CONJUNTO possivel.
    media: `${String(n % 5)}.${String(n % 10)}`,
    quantidade: String(n),
    n1: '0',
    n2: '0',
    n3: '0',
    n4: '0',
    n5: String(n),
  };
}

interface Medicao {
  readonly pagina: PaginaDoDiretorio;
  readonly consultas: readonly string[];
}

/**
 * A consulta da PAGINA, reconhecida por uma coluna da projecao dela.
 *
 * **Nao por `pontuacao_do_local`, e a diferenca importa.** Reconhecer a pagina
 * pelo mecanismo que se esta medindo faz o duble parar de responder a pagina no
 * instante em que o mecanismo muda -- e entao TODO caso deste arquivo reprova
 * junto, inclusive os que nao tem nada a ver com a mudanca. `logo_public_key`
 * esta na projecao da pagina e em nenhuma outra consulta do adaptador, e nao
 * depende da pontuacao.
 */
const DA_PAGINA = (sql: string): boolean => sql.includes('as "logo_public_key"');

/** A consulta que CHAMA a funcao da pontuacao, seja ela qual for. */
const CHAMA_A_PONTUACAO = (sql: string): boolean => sql.includes('pontuacao_do_local');

/**
 * `comConta` e uma propriedade EXPLICITA e nao um parametro com padrao: um
 * padrao (`chamador = CONTA`) e aplicado tambem quando se passa `undefined` de
 * proposito, e o caso "sem conta" media a leitura COM conta sem acusar nada.
 */
async function listar(opcoes: { cartoes: number; comConta: boolean }): Promise<Medicao> {
  const { cartoes, comConta } = opcoes;
  const { db, compilado } = bancoDeMentira<Database>((sql) => {
    // Pela forma do SQL e nunca pela posicao: reordenar as leituras do
    // adaptador nao pode trocar as respostas em silencio.
    //
    // **A PONTUACAO PRIMEIRO, e a ordem destes tres `if` e um defeito que este
    // arquivo ja teve.** A consulta da PAGINA tambem nomeia
    // `user_reference_locations`, na subconsulta do ponto do aparelho -- ela
    // casava o ramo da localizacao, a pagina recebia a linha errada e os 20
    // cartoes viravam 1 com todos os campos indefinidos. O ramo mais
    // especifico tem de vir antes.
    if (DA_PAGINA(sql)) return Array.from({ length: cartoes }, (_, i) => linha(i + 1));
    if (sql.startsWith('select "user_id" from "user_reference_locations"')) {
      return [{ user_id: CONTA }];
    }
    return [{ total: String(cartoes) }];
  });
  const recorte: RecorteDoDiretorio = {
    chamador: comConta ? CONTA : undefined,
    familia: comConta ? APARELHO : undefined,
    agora: AGORA,
    sort: 'distance',
    page: 1,
    limit: 20,
  };
  const pagina = await criarDirectoryRepository(db, IDS).listarPublicados(recorte);
  return { pagina, consultas: [...compilado] };
}

void describe('ISCA: a pontuacao da listagem do diretorio', () => {
  void it('a listagem emite o MESMO numero de consultas com 1 e com 20 cartoes', async () => {
    const um = await listar({ cartoes: 1, comConta: true });
    const vinte = await listar({ cartoes: 20, comConta: true });
    assert.equal(
      vinte.consultas.length,
      um.consultas.length,
      'REPROVA: a listagem emite mais consultas quando a pagina tem mais ' +
        `cartoes (${String(um.consultas.length)} com 1, ` +
        `${String(vinte.consultas.length)} com 20). E o N+1: uma leitura de ` +
        'pontuacao por item. O agregado tem de sair da consulta da pagina. ' +
        `SQL: ${vinte.consultas.join(' ||| ')}`,
    );
    // O numero EXATO, para a igualdade nao poder ser satisfeita por dois
    // numeros errados iguais: localizacao de referencia, pagina e contagem.
    assert.equal(vinte.consultas.length, 3, `SQL: ${vinte.consultas.join(' ||| ')}`);
    // E 20 cartoes de verdade chegaram: filtro que nao casa devolve zero de
    // tudo, e uma pagina vazia tambem emitiria 3 consultas.
    assert.equal(vinte.pagina.itens.length, 20);
  });

  void it('a pontuacao sai da consulta da PAGINA, uma vez por pagina', async () => {
    const { consultas } = await listar({ cartoes: 20, comConta: true });
    const comPontuacao = consultas.filter(CHAMA_A_PONTUACAO);
    assert.equal(
      comPontuacao.length,
      1,
      'REPROVA: a pontuacao nao e lida UMA vez. Zero quer dizer que a listagem ' +
        'voltou a nao agregar nada (o defeito da BICHUS-313); mais de uma quer ' +
        `dizer leitura por item. SQL: ${consultas.join(' ||| ')}`,
    );
    assert.ok(
      /cross join lateral/i.test(comPontuacao[0] ?? ''),
      'REPROVA: a funcao da pontuacao nao entrou como lateral da consulta da ' +
        `pagina. SQL: ${String(comPontuacao[0])}`,
    );
  });

  void it('a pontuacao vem da FUNCAO do banco, e nao de um recorte reescrito', async () => {
    const { consultas } = await listar({ cartoes: 20, comConta: true });
    const pagina = consultas.find(DA_PAGINA) ?? '';
    assert.ok(
      pagina.includes('pontuacao_do_local(professionals.id)'),
      'REPROVA: a consulta da pagina nao chama `pontuacao_do_local`. Um agregado ' +
        'escrito a mao aqui seria a SEGUNDA copia do recorte ' +
        "(`status = 'published'` e `conta_habilitada(author_user_id)`), e o modo " +
        'de falha dessa copia esta na migracao `20261017000017`: "128 avaliacoes" ' +
        `sobre uma lista que mostra 126. SQL: ${pagina}`,
    );
    assert.ok(
      !/avg\s*\(/i.test(pagina) && !/count\s*\(\s*\*\s*\)\s*filter/i.test(pagina),
      'REPROVA: a consulta da pagina calcula a media ou o histograma por conta ' +
        `propria. A regra mora na funcao do banco, e so la. SQL: ${pagina}`,
    );
  });

  void it('a pontuacao de CADA cartao e a da linha dele', async () => {
    const { pagina } = await listar({ cartoes: 20, comConta: true });
    // Por CONJUNTO e nao por contagem: uma pontuacao fixa repetida nos 20
    // cartoes tambem daria 20 itens.
    assert.deepEqual(
      pagina.itens.map((e) => [e.slug, e.pontuacao.media, e.pontuacao.quantidade]),
      Array.from({ length: 20 }, (_, i) => {
        const n = i + 1;
        return [`local-${String(n)}`, Number(`${String(n % 5)}.${String(n % 10)}`), n];
      }),
      'REPROVA: a pontuacao nao acompanha a linha. Pontuacao fixa (ou a vazia ' +
        'para todos) e o duble que aprova sem mecanismo.',
    );
  });

  void it('SEM conta a listagem nao pergunta pela localizacao, e ainda agrega', async () => {
    const { pagina, consultas } = await listar({ cartoes: 5, comConta: false });
    assert.equal(
      consultas.length,
      2,
      `REPROVA: a listagem sem conta nao emite 2 consultas. SQL: ${consultas.join(' ||| ')}`,
    );
    assert.equal(consultas.filter(CHAMA_A_PONTUACAO).length, 1);
    assert.equal(pagina.itens.length, 5);
  });
});
