/**
 * O diretorio de `Perto` contra Postgres de verdade (a leitura do diretorio de `Perto`).
 *
 * ## Por que este arquivo nao pode ser unitario
 *
 * O dobre em memoria prova a borda e nao prova a consulta. Nada do que esta
 * aqui existe fora do Postgres, e a lista nao e teorica -- cada item e uma
 * coisa que a suite unitaria inteira aprova com o mecanismo desligado:
 *
 * - **o `WHERE status = 'published'`.** Um `Map` devolve o que o dobre colocar
 *   nele. So a consulta de verdade prova que rascunho, oculto e removido nao
 *   saem -- e foi assim que a BICHUS-91 passou 1037 casos com `revogarDoDono`
 *   virado num `no-op`.
 * - **a derivacao do selo a partir de `entity_verifications`.** A coluna
 *   `professionals.verification_level` e cache, e o caso "a coluna mente"
 *   abaixo so significa alguma coisa com as duas tabelas no mesmo banco.
 * - **o tipo `geography(Point, 4326)`** e a extensao PostGIS. Um `text`
 *   guardando `"-23.561,-46.656"` passaria em todo teste unitario e quebraria
 *   na primeira consulta de distancia.
 * - **a ordem `(lon, lat)` de `ST_MakePoint`**, que e o erro classico do
 *   PostGIS porque ele nao falha: ele grava o Brasil no meio da Somalia. So
 *   medindo a distancia de volta e que isso aparece.
 * - **`expires_at > agora` na subconsulta da localizacao.** Uma localizacao
 *   vencida precisa produzir distancia NULA, e nao a ultima que existiu.
 * - **`NULLS LAST`**, que decide se a entrada sem coordenada aparece por ultimo
 *   ou desaparece da lista.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * A pilha e efemera, o projeto do compose e derivado do caminho do worktree e o
 * banco e derrubado com `-v` no fim.
 *
 * ## As iscas deste arquivo, e como cada uma foi provada
 *
 * Cada linha foi desligada no codigo de producao, conferida no disco, a suite
 * rodou e reprovou, e o arquivo foi restaurado. 22/09/2026.
 *
 * | o que foi desligado em `kysely-directory-repository.ts` | `fail` |
 * |---|---|
 * | `.where('status', '=', 'published')` | 3 |
 * | `decision = 'approved'` na subconsulta de evidencias | 2 |
 * | `entity_kind = 'professional'` na subconsulta de evidencias | 1 |
 * | `expires_at > agora` na subconsulta da localizacao | 1 |
 * | `nulls last` na ordenacao por distancia | 1 |
 * | `ST_MakePoint(lon, lat)` invertido no `seed` | 2 |
 *
 * As iscas da BUSCA, provadas do mesmo jeito em 22/09. A troca so acontece se
 * o trecho casar exatamente uma vez e se o arquivo mudar no disco; o placar da
 * base e `367 casos, 360 passaram, 7 falharam`, e os 7 sao de `troca-de-email`
 * e nao desta historia.
 *
 * | o que foi desligado | `fail` alem dos 7 da base |
 * |---|---|
 * | `where('status', '=', 'published')` em `construtorDaListagem` | 3, uma delas `BUSCA NAO ENXERGA RASCUNHO, OCULTO NEM REMOVIDO` |
 * | `unaccent` dentro de `texto_para_busca` | 2: a busca sem acento e o plano com mil linhas |
 * | o `replace` dos curingas em `padrao_de_busca` | 1: `%` e `_` deixam de ser literais |
 * | o indice GIN trocado por um B-tree de `slug` | 2: as duas provas de plano |
 *
 * A linha do `unaccent` merece nota, porque ela nao era esperada e e o proprio
 * assunto do caso do indice: mexer na funcao muda a expressao dos DOIS lados,
 * e o plano por indice some junto. Normalizacao e indice sao uma coisa so.
 *
 * ## O que sobrevive a execucao
 *
 * Nada. As contas e as entradas criadas sao apagadas no `after`.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { semear } from '../../src/bin/seed.js';
import { MASSA_DO_DIRETORIO, PUBLICADAS } from '../../src/bin/massa-do-diretorio.js';
import { criarDirectoryRepository } from '../../src/modules/professionals/adapters/persistence/kysely-directory-repository.js';
import { projetarEntrada } from '../../src/modules/professionals/domain/entrada-do-diretorio.js';
import type { DirectoryRepository } from '../../src/modules/professionals/ports/directory-repository.js';
import type { Instant, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

const AGORA = 1_800_000_000_000 as Instant;
const DIA = 24 * 60 * 60 * 1000;

/** `.invalid` e reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

/** Avenida Paulista, 1578. O centro de todas as distancias deste arquivo. */
const PAULISTA = { lat: -23.5614, lon: -46.656 };
/** Praca da Se, cerca de 2,7 km da Paulista. */
const SE = { lat: -23.5503, lon: -46.6339 };
/** Tatuape, uns 9 km a leste da Paulista. */
const TATUAPE = { lat: -23.5404, lon: -46.5766 };

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let repo: DirectoryRepository;
const contasCriadas: UserId[] = [];
const entradasCriadas: string[] = [];

async function criarConta(): Promise<UserId> {
  const id = randomUUID() as UserId;
  await cliente.query('INSERT INTO users (id, email) VALUES ($1, $2)', [
    id,
    `bichus234-${id}@${DOMINIO_DE_TESTE}`,
  ]);
  contasCriadas.push(id);
  return id;
}

interface EntradaDeTeste {
  readonly titular: UserId;
  readonly slug: string;
  readonly nome?: string;
  readonly kind?: string;
  readonly status?: string;
  readonly cidade?: string | null;
  readonly uf?: string | null;
  readonly bairro?: string | null;
  readonly ponto?: { lat: number; lon: number } | null;
  readonly telefone?: string | null;
  /** O valor da COLUNA derivada. Separado de proposito: ele pode mentir. */
  readonly nivelNaColuna?: string;
}

async function criarEntrada(dados: EntradaDeTeste): Promise<string> {
  const id = randomUUID();
  const ponto = dados.ponto ?? null;
  await cliente.query(
    `INSERT INTO professionals (
       id, kind, display_name, city, state, neighborhood, geo,
       source, claim_status, claimed_at, verification_level,
       phone_e164, slug, status, published_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       CASE WHEN $7::float8 IS NULL THEN NULL
            ELSE ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography END,
       'self', 'claimed', now(), $9, $10, $11, $12,
       CASE WHEN $12 = 'published' THEN now() ELSE NULL END
     )`,
    [
      id,
      dados.kind ?? 'vet',
      dados.nome ?? `Entrada ${dados.slug}`,
      dados.cidade === undefined ? 'São Paulo' : dados.cidade,
      dados.uf === undefined ? 'SP' : dados.uf,
      dados.bairro === undefined ? 'Pinheiros' : dados.bairro,
      ponto === null ? null : ponto.lon,
      ponto === null ? null : ponto.lat,
      dados.nivelNaColuna ?? 'none',
      dados.telefone === undefined ? '+551130612200' : dados.telefone,
      dados.slug,
      dados.status ?? 'published',
    ],
  );
  entradasCriadas.push(id);
  return id;
}

async function criarVerificacao(
  entrada: string,
  solicitante: UserId,
  evidencia: string,
  decisao: 'pending' | 'approved' | 'rejected',
  tipoDaEntidade = 'professional',
): Promise<void> {
  await cliente.query(
    `INSERT INTO entity_verifications (
       id, entity_kind, entity_id, claimant_user_id, evidence_kind, decision, reviewed_at
     ) VALUES ($1, $2, $3, $4, $5, $6,
               CASE WHEN $6 = 'pending' THEN NULL ELSE now() END)`,
    [randomUUID(), tipoDaEntidade, entrada, solicitante, evidencia, decisao],
  );
}

/**
 * A localizacao de referencia de quem chama, com validade explicita.
 *
 * `captured_at` sai de `validaAte` menos os 30 dias da janela, e nao de um
 * instante fixo: o CHECK `user_reference_locations_validade_no_futuro` exige
 * `expires_at > captured_at`, e uma linha VENCIDA com captura recente e
 * inexprimivel no banco -- como tem de ser.
 */
async function darLocalizacao(
  dono: UserId,
  ponto: { lat: number; lon: number },
  validaAte: number,
): Promise<void> {
  await cliente.query(
    `INSERT INTO user_reference_locations
       (user_id, reference_point, precision_m, source, captured_at, expires_at)
     VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 100, 'map_pin', $4, $5)
     ON CONFLICT (user_id) DO UPDATE
       SET reference_point = EXCLUDED.reference_point,
           captured_at = EXCLUDED.captured_at,
           expires_at = EXCLUDED.expires_at`,
    [dono, ponto.lon, ponto.lat, new Date(validaAte - 30 * DIA), new Date(validaAte)],
  );
}

/**
 * Todas as paginas de São Paulo, por nome.
 *
 * Por nome e nao por distancia porque a ordem precisa ser ESTAVEL entre duas
 * chamadas para a paginacao por deslocamento significar alguma coisa, e o
 * chamador deste auxiliar nao tem localizacao.
 */
async function todasAsPaginas(chamador: UserId): Promise<{ slug: string; nivel: string }[]> {
  const todas: { slug: string; nivel: string }[] = [];
  for (let pagina = 1; pagina <= 10; pagina += 1) {
    const resultado = await repo.listarPublicados(
      recorte(chamador, { city: 'São Paulo', sort: 'name', page: pagina }),
    );
    for (const item of resultado.itens) {
      todas.push({ slug: item.slug, nivel: projetarEntrada(item).verification.level });
    }
    if (todas.length >= resultado.total) break;
  }
  return todas;
}

function recorte(chamador: UserId, ajustes: Record<string, unknown> = {}) {
  return {
    chamador,
    agora: AGORA,
    sort: 'distance' as const,
    page: 1,
    limit: 20,
    ...ajustes,
  };
}

void describe('o diretorio de `Perto`, contra Postgres', { skip: CONEXAO === undefined ? 'sem DATABASE_URL: a pilha efêmera não está de pé' : false }, () => {
  before(async () => {
    assert.ok(CONEXAO !== undefined);
    banco = createDb(CONEXAO);
    db = banco.db;
    cliente = new pg.Client({ connectionString: CONEXAO });
    await cliente.connect();
    repo = criarDirectoryRepository(db);
  });

  after(async () => {
    if (entradasCriadas.length > 0) {
      await cliente.query('DELETE FROM entity_verifications WHERE entity_id = ANY($1::uuid[])', [
        entradasCriadas,
      ]);
      await cliente.query('DELETE FROM professionals WHERE id = ANY($1::uuid[])', [
        entradasCriadas,
      ]);
    }
    if (contasCriadas.length > 0) {
      await cliente.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [contasCriadas]);
    }
    await cliente.end();
    await banco.close();
  });

  void it('o que nao esta publicado NAO aparece, nos tres estados', async () => {
    const titular = await criarConta();
    const bairro = `bairro-${randomUUID().slice(0, 8)}`;
    await criarEntrada({ titular, slug: `pub-${randomUUID().slice(0, 8)}`, bairro, status: 'published' });
    await criarEntrada({ titular, slug: `dft-${randomUUID().slice(0, 8)}`, bairro, status: 'draft' });
    await criarEntrada({ titular, slug: `hid-${randomUUID().slice(0, 8)}`, bairro, status: 'hidden' });
    await criarEntrada({ titular, slug: `rmv-${randomUUID().slice(0, 8)}`, bairro, status: 'removed' });

    const pagina = await repo.listarPublicados(recorte(titular, { neighborhood: bairro }));

    assert.equal(
      pagina.total,
      1,
      'ISCA: sem `WHERE status = \'published\'` na consulta, as quatro saem. ' +
        'Um rascunho e um cadastro que ninguem terminou; um oculto e alguem que ' +
        'pediu para sair da vitrine; um removido e alguem que saiu.',
    );
    assert.equal(pagina.itens.length, 1);
    assert.ok(pagina.itens[0]?.slug.startsWith('pub-'));
  });

  void it('o nivel sai das VERIFICACOES, mesmo com a coluna derivada mentindo', async () => {
    const titular = await criarConta();
    const bairro = `bairro-${randomUUID().slice(0, 8)}`;
    // A COLUNA DIZ `document_verified`. A fonte diz outra coisa: so um retorno
    // de telefone foi aprovado. Ninguem mantem essa coluna hoje -- nao ha painel
    // de moderacao --, e e exatamente por isso que a leitura nao acredita nela.
    const entrada = await criarEntrada({
      titular,
      slug: `mentira-${randomUUID().slice(0, 8)}`,
      bairro,
      nivelNaColuna: 'document_verified',
    });
    await criarVerificacao(entrada, titular, 'phone_callback', 'approved');
    await criarVerificacao(entrada, titular, 'crmv', 'pending');
    await criarVerificacao(entrada, titular, 'cnpj', 'rejected');

    const pagina = await repo.listarPublicados(recorte(titular, { neighborhood: bairro }));
    const projetada = projetarEntrada(pagina.itens[0]!);

    assert.deepEqual(
      projetada.verification,
      { level: 'contact_verified', evidence_kinds: ['phone_callback'] },
      'ISCA: lendo `professionals.verification_level`, esta entrada sairia como ' +
        '`document_verified` -- um selo de documento sobre uma entidade de que ' +
        'so se sabe que alguem atende ao telefone.',
    );
  });

  void it('verificacao de OUTRO tipo de entidade nao vale como prova', async () => {
    const titular = await criarConta();
    const bairro = `bairro-${randomUUID().slice(0, 8)}`;
    const entrada = await criarEntrada({ titular, slug: `poli-${randomUUID().slice(0, 8)}`, bairro });
    // `entity_verifications` e polimorfica e NAO tem chave estrangeira (decisao
    // de 17/09). O tipo faz parte da chave: sem ele, uma verificacao de
    // organizacao com este mesmo UUID passaria a valer como prova.
    await criarVerificacao(entrada, titular, 'cnpj', 'approved', 'organization');

    const pagina = await repo.listarPublicados(recorte(titular, { neighborhood: bairro }));
    assert.deepEqual(projetarEntrada(pagina.itens[0]!).verification, {
      level: 'none',
      evidence_kinds: [],
    });
  });

  void it('ordena por distancia real, e a ordem (lon, lat) esta certa', async () => {
    const titular = await criarConta();
    const bairro = `bairro-${randomUUID().slice(0, 8)}`;
    await darLocalizacao(titular, PAULISTA, Number(AGORA) + 10 * DIA);
    await criarEntrada({ titular, slug: `longe-${randomUUID().slice(0, 8)}`, bairro, ponto: TATUAPE });
    await criarEntrada({ titular, slug: `perto-${randomUUID().slice(0, 8)}`, bairro, ponto: SE });

    const pagina = await repo.listarPublicados(recorte(titular, { neighborhood: bairro }));

    assert.equal(pagina.distanciaDisponivel, true);
    assert.ok(pagina.itens[0]?.slug.startsWith('perto-'), 'a Sé vem antes do Tatuapé');
    const perto = projetarEntrada(pagina.itens[0]!).distance_m;
    const longe = projetarEntrada(pagina.itens[1]!).distance_m;
    assert.ok(perto !== null && longe !== null);
    // A Sé fica a uns 2,7 km da Paulista. Com (lat, lon) invertidos o ponto cai
    // no meio da Somália e esta distância vira milhares de quilômetros.
    assert.ok(
      perto > 2000 && perto < 3500,
      `ISCA: distância medida de ${String(perto)} m. Fora desta faixa, ou o ` +
        'par está invertido em ST_MakePoint, ou não é a Sé.',
    );
    assert.ok(longe > perto);
    assert.equal(perto % 100, 0, 'a distância sai na grade de 100 m');
  });

  void it('entrada SEM coordenada aparece por ultimo, e nao some', async () => {
    const titular = await criarConta();
    const bairro = `bairro-${randomUUID().slice(0, 8)}`;
    await darLocalizacao(titular, PAULISTA, Number(AGORA) + 10 * DIA);
    await criarEntrada({ titular, slug: `com-${randomUUID().slice(0, 8)}`, bairro, ponto: SE });
    await criarEntrada({ titular, slug: `sem-${randomUUID().slice(0, 8)}`, bairro, ponto: null });

    const pagina = await repo.listarPublicados(recorte(titular, { neighborhood: bairro }));

    assert.equal(
      pagina.total,
      2,
      'ISCA: excluir quem nao tem `geo` esconderia uma entrada PUBLICADA por ' +
        'causa de um campo que hoje ninguem consegue preencher -- nao ha painel.',
    );
    assert.ok(pagina.itens[1]?.slug.startsWith('sem-'), '`nulls last` poe a sem ponto no fim');
    assert.equal(projetarEntrada(pagina.itens[1]!).distance_m, null);
  });

  void it('localizacao VENCIDA nao mede: distance_available falso, nunca zero', async () => {
    const titular = await criarConta();
    const bairro = `bairro-${randomUUID().slice(0, 8)}`;
    // Vencida ontem. ADR-0006: localizacao vencida e, para todo efeito de
    // produto, localizacao que nao existe.
    await darLocalizacao(titular, PAULISTA, Number(AGORA) - DIA);
    await criarEntrada({ titular, slug: `venc-${randomUUID().slice(0, 8)}`, bairro, ponto: SE });

    const pagina = await repo.listarPublicados(recorte(titular, { neighborhood: bairro }));

    assert.equal(
      pagina.distanciaDisponivel,
      false,
      'ISCA: sem `expires_at > agora` na subconsulta, a lista sairia ordenada ' +
        'por uma localizacao de trinta dias atras, sem ninguem saber.',
    );
    assert.equal(projetarEntrada(pagina.itens[0]!).distance_m, null);
  });

  void it('sem localizacao nenhuma, ordena por nome e diz que nao mediu', async () => {
    const titular = await criarConta();
    const bairro = `bairro-${randomUUID().slice(0, 8)}`;
    await criarEntrada({ titular, slug: `z-${randomUUID().slice(0, 8)}`, nome: 'Zoo Vet', bairro, ponto: SE });
    await criarEntrada({ titular, slug: `a-${randomUUID().slice(0, 8)}`, nome: 'Alfa Vet', bairro, ponto: TATUAPE });

    const pagina = await repo.listarPublicados(recorte(titular, { neighborhood: bairro }));

    assert.equal(pagina.distanciaDisponivel, false);
    assert.deepEqual(
      pagina.itens.map((uma) => uma.displayName),
      ['Alfa Vet', 'Zoo Vet'],
      'sem localizacao, a ordem cai para nome -- e nao para "a que o banco devolver".',
    );
  });

  void it('sort=name nao mede distancia, mesmo com localizacao valida', async () => {
    const titular = await criarConta();
    const bairro = `bairro-${randomUUID().slice(0, 8)}`;
    await darLocalizacao(titular, PAULISTA, Number(AGORA) + 10 * DIA);
    await criarEntrada({ titular, slug: `n1-${randomUUID().slice(0, 8)}`, nome: 'Zeta', bairro, ponto: SE });
    await criarEntrada({ titular, slug: `n2-${randomUUID().slice(0, 8)}`, nome: 'Alfa', bairro, ponto: TATUAPE });

    const pagina = await repo.listarPublicados(recorte(titular, { neighborhood: bairro, sort: 'name' }));

    assert.equal(pagina.distanciaDisponivel, false);
    assert.deepEqual(pagina.itens.map((uma) => uma.displayName), ['Alfa', 'Zeta']);
  });

  void it('o piso de verificacao traz o nivel mais forte junto', async () => {
    const titular = await criarConta();
    const bairro = `bairro-${randomUUID().slice(0, 8)}`;
    const comDocumento = await criarEntrada({ titular, slug: `doc-${randomUUID().slice(0, 8)}`, bairro });
    const comContato = await criarEntrada({ titular, slug: `con-${randomUUID().slice(0, 8)}`, bairro });
    await criarEntrada({ titular, slug: `nen-${randomUUID().slice(0, 8)}`, bairro });
    await criarVerificacao(comDocumento, titular, 'crmv', 'approved');
    await criarVerificacao(comContato, titular, 'phone_callback', 'approved');

    const piso = await repo.listarPublicados(
      recorte(titular, { neighborhood: bairro, verificationLevel: 'contact_verified' }),
    );
    assert.equal(
      piso.total,
      2,
      'ISCA: com igualdade no lugar do piso, quem pediu `contact_verified` ' +
        'deixaria de ver a entidade com CRMV -- o oposto do que pediu.',
    );

    const soDocumento = await repo.listarPublicados(
      recorte(titular, { neighborhood: bairro, verificationLevel: 'document_verified' }),
    );
    assert.equal(soDocumento.total, 1);
  });

  void it('o total e o do RECORTE, e a pagina respeita limite e deslocamento', async () => {
    const titular = await criarConta();
    const bairro = `bairro-${randomUUID().slice(0, 8)}`;
    for (const nome of ['Aa', 'Bb', 'Cc']) {
      await criarEntrada({ titular, slug: `pag-${nome.toLowerCase()}-${randomUUID().slice(0, 8)}`, nome, bairro });
    }

    const primeira = await repo.listarPublicados(
      recorte(titular, { neighborhood: bairro, limit: 2, page: 1 }),
    );
    const segunda = await repo.listarPublicados(
      recorte(titular, { neighborhood: bairro, limit: 2, page: 2 }),
    );

    assert.equal(primeira.total, 3, 'o total e do recorte, nao da pagina nem da tabela');
    assert.equal(primeira.itens.length, 2);
    assert.equal(segunda.total, 3);
    assert.equal(segunda.itens.length, 1);
    assert.deepEqual(
      [...primeira.itens, ...segunda.itens].map((uma) => uma.displayName),
      ['Aa', 'Bb', 'Cc'],
    );
  });

  void it('cidade e bairro filtram sem caixa, porque e texto digitado', async () => {
    const titular = await criarConta();
    const bairro = `Bairro-${randomUUID().slice(0, 8)}`;
    await criarEntrada({ titular, slug: `cx-${randomUUID().slice(0, 8)}`, bairro, cidade: 'São Paulo' });

    const achou = await repo.listarPublicados(
      recorte(titular, { neighborhood: bairro.toUpperCase(), city: 'são paulo', state: 'sp' }),
    );
    assert.equal(achou.total, 1);
  });

  void it('a MASSA DE QA grava e a secao aparece ocupada: dez entradas publicadas', async () => {
    // Este caso e o unico que roda `semear` de verdade. Massa que ninguem
    // executa e massa que se descobre quebrada no dia da demonstracao, contra
    // um CHECK que o teste unitario nao tem como conhecer: `display_name` de 2
    // a 120, formato do slug, `claim_status` com marco, `phone_e164` no padrao
    // internacional. Todos so existem no banco.
    await semear(db);
    for (const entrada of MASSA_DO_DIRETORIO) {
      entradasCriadas.push(entrada.id);
      contasCriadas.push(entrada.titularId as UserId);
    }

    const chamador = await criarConta();
    // As paginas inteiras, e nao a primeira: os casos acima deste tambem
    // criaram entradas em São Paulo, e o teto de 20 do contrato e real. Um
    // caso que olha so a primeira pagina passa hoje e reprova no dia em que
    // alguem acrescentar um cenario antes dele -- que e ruido, nao defeito.
    const todas = await todasAsPaginas(chamador);
    assert.ok(
      todas.length >= PUBLICADAS.filter((uma) => uma.city === 'São Paulo').length,
      `a secao precisa aparecer ocupada: ${String(todas.length)} entradas em São Paulo.`,
    );
    const slugs = new Set(todas.map((uma) => uma.slug));
    for (const publicada of PUBLICADAS.filter((uma) => uma.city === 'São Paulo')) {
      assert.ok(slugs.has(publicada.slug), `${publicada.slug} nao apareceu na lista`);
    }
    for (const escondida of MASSA_DO_DIRETORIO.filter((uma) => uma.status !== 'published')) {
      assert.equal(
        slugs.has(escondida.slug),
        false,
        `${escondida.slug} esta em '${escondida.status}' e apareceu na vitrine`,
      );
    }

    // O selo de cada uma sai da FONTE, e a massa tem os tres niveis.
    const niveis = new Set(todas.map((uma) => uma.nivel));
    assert.deepEqual(
      [...niveis].sort(),
      ['contact_verified', 'document_verified', 'none'],
      'os tres niveis precisam chegar a tela: e o selo que o cliente vai julgar.',
    );
  });

  void it('semear duas vezes deixa o mesmo estado: a massa e fixa', async () => {
    await semear(db);
    await semear(db);
    const chamador = await criarConta();
    const slugs = (await todasAsPaginas(chamador)).map((uma) => uma.slug);
    assert.equal(
      new Set(slugs).size,
      slugs.length,
      'ISCA: sem a limpeza da massa anterior, a segunda semeadura duplicaria ' +
        '-- ou estouraria na unicidade do slug, que e o mesmo defeito acusando mais cedo.',
    );
  });

  // =========================================================================
  // A BUSCA POR NOME (`q`)
  // =========================================================================
  //
  // Nada disto existe fora do Postgres. A normalizacao de acento e caixa e uma
  // funcao do banco, o escape dos curingas e outra, e o indice que torna a
  // busca viavel e um GIN de trigrama -- um dobre em memoria aprovaria os tres
  // com qualquer implementacao, inclusive com nenhuma.

  void it('acha sem acento e sem caixa: `veterinaria` acha `Veterinária`', async () => {
    const titular = await criarConta();
    const bairro = `bairro-${randomUUID().slice(0, 8)}`;
    await criarEntrada({
      titular,
      slug: `ac-${randomUUID().slice(0, 8)}`,
      nome: 'Clínica Veterinária Santa Bárbara',
      bairro,
    });

    for (const termo of ['veterinaria', 'VETERINÁRIA', 'Veterinaria', 'bárbara', 'barbara']) {
      const pagina = await repo.listarPublicados(recorte(titular, { neighborhood: bairro, q: termo }));
      assert.equal(
        pagina.total,
        1,
        `ISCA: o termo '${termo}' nao achou. Sem \`texto_para_busca\` nos DOIS ` +
          'lados da comparacao, quem digita sem acento -- que e como se digita ' +
          'no celular -- nao acha nada e conclui que o diretorio esta vazio.',
      );
    }
  });

  void it('BUSCA NAO ENXERGA RASCUNHO, OCULTO NEM REMOVIDO', async () => {
    const titular = await criarConta();
    const bairro = `bairro-${randomUUID().slice(0, 8)}`;
    // O MESMO nome nos quatro estados. E esta a forma do vazamento: quem busca
    // por um nome especifico ja sabe o nome, e so quer saber se ele existe.
    const nome = `Petshop Sigiloso ${randomUUID().slice(0, 8)}`;
    await criarEntrada({ titular, slug: `bp-${randomUUID().slice(0, 8)}`, nome, bairro, status: 'published' });
    await criarEntrada({ titular, slug: `bd-${randomUUID().slice(0, 8)}`, nome, bairro, status: 'draft' });
    await criarEntrada({ titular, slug: `bh-${randomUUID().slice(0, 8)}`, nome, bairro, status: 'hidden' });
    await criarEntrada({ titular, slug: `br-${randomUUID().slice(0, 8)}`, nome, bairro, status: 'removed' });

    const pagina = await repo.listarPublicados(recorte(titular, { q: nome }));

    assert.equal(
      pagina.total,
      1,
      'ISCA: se a busca deixar de casar sobre o mesmo `where status = ' +
        "'published'`, as quatro saem -- e a resposta vira um oraculo de " +
        'existencia: "este cadastro existe, so nao esta publicado". Um rascunho ' +
        'e um cadastro que ninguem terminou; um oculto e alguem que PEDIU para ' +
        'sair da vitrine.',
    );
    assert.ok(pagina.itens[0]?.slug.startsWith('bp-'));
  });

  void it('`%` e `_` do termo sao literais, e nao curingas', async () => {
    const titular = await criarConta();
    const bairro = `bairro-${randomUUID().slice(0, 8)}`;
    await criarEntrada({ titular, slug: `cu-${randomUUID().slice(0, 8)}`, nome: 'Abcdef Pet', bairro });

    const comSublinhado = await repo.listarPublicados(
      recorte(titular, { neighborhood: bairro, q: 'a_cdef' }),
    );
    assert.equal(
      comSublinhado.total,
      0,
      'ISCA: sem o escape, `_` casa qualquer caractere e `a_cdef` acha `Abcdef`.',
    );

    const comPorcento = await repo.listarPublicados(
      recorte(titular, { neighborhood: bairro, q: 'a%f' }),
    );
    assert.equal(
      comPorcento.total,
      0,
      'ISCA: sem o escape, `%` casa qualquer coisa. O caso extremo e `q=%` ' +
        'sozinho, que devolve a tabela inteira com uma varredura completa -- e ' +
        'sem nenhum caractere suspeito na URL.',
    );

    const literal = await repo.listarPublicados(recorte(titular, { neighborhood: bairro, q: 'bcdef' }));
    assert.equal(literal.total, 1, 'o termo sem curinga continua achando');
  });

  void it('`q` casa SO no nome: nem em `about`, nem no bairro', async () => {
    const titular = await criarConta();
    const marca = `zzz${randomUUID().slice(0, 8)}`;
    const bairro = `bairro-${marca}`;
    const entrada = await criarEntrada({
      titular,
      slug: `so-${randomUUID().slice(0, 8)}`,
      nome: 'Alfa Pet',
      bairro,
    });
    await cliente.query('UPDATE professionals SET about = $1 WHERE id = $2', [
      `Atendimento ${marca} 24 horas`,
      entrada,
    ]);

    const pagina = await repo.listarPublicados(recorte(titular, { neighborhood: bairro, q: marca }));
    assert.equal(
      pagina.total,
      0,
      'a decisao e de produto e esta no contrato: todo campo do cartao alem do ' +
        'nome ja tem controle proprio no topo da tela. Casar tambem neles poria ' +
        'dois controles disputando o mesmo trabalho e deixaria `applied_filters` ' +
        'sem como explicar por que a linha entrou.',
    );

    const porNome = await repo.listarPublicados(recorte(titular, { neighborhood: bairro, q: 'alfa' }));
    assert.equal(porNome.total, 1);
  });

  void it('o indice GIN de trigrama e USADO pela busca', async () => {
    // Com poucas linhas o planejador escolhe varredura sequencial por ser mais
    // barata, e isso nao diz nada sobre o indice. Desligar a sequencial forca a
    // pergunta que interessa: "existe um plano por indice para este LIKE?".
    // Mesmo desenho da prova do GIST em `localizacao-de-referencia.test.ts`.
    //
    // DUAS COISAS AQUI FORAM APRENDIDAS MEDINDO, EM 22/09, E CADA UMA FEZ ESTE
    // CASO APONTAR PARA O INDICE ERRADO ANTES DE ESTAR ASSIM:
    //
    // 1. **So com `enable_seqscan = off`** o plano que saiu foi `Index Scan
    //    using professionals_publicados_por_atividade` com o `LIKE` no
    //    `Filter` -- percorrer OUTRO indice inteiro e filtrar linha a linha, que
    //    e a varredura completa com outro nome. Numa tabela de dezenas de
    //    linhas isso custa menos que o custo fixo de partida do GIN. Por isso o
    //    percurso de indice tambem e desligado: sobram os planos por mapa de
    //    bits.
    // 2. **Com `status = 'published'` na consulta**, o plano virou
    //    `Bitmap Index Scan on professionals_publicados_por_atividade` -- o
    //    indice PARCIAL de publicados atende aquela igualdade sozinho e o
    //    `LIKE` volta para o `Filter`. Por isso esta consulta traz so o
    //    predicado da busca: a pergunta deste caso e "existe plano por indice
    //    para ESTE `LIKE`", e nenhum outro indice tem como responde-la.
    //
    // A consulta completa, com o `status` junto, e a do caso seguinte, que e
    // onde ela precisa mesmo ser respondida.
    await cliente.query('BEGIN');
    try {
      await cliente.query('SET LOCAL enable_seqscan = off');
      await cliente.query('SET LOCAL enable_indexscan = off');
      const r = await cliente.query<Record<string, string>>(
        `EXPLAIN SELECT slug FROM professionals
          WHERE texto_para_busca(display_name) LIKE padrao_de_busca($1)`,
        ['veterinaria'],
      );
      const plano = r.rows.map((linha) => Object.values(linha).join(' ')).join('\n');
      assert.match(
        plano,
        /professionals_busca_por_nome/,
        'ISCA: o predicado precisa ser a MESMA expressao do indice, caractere a ' +
          'caractere. Normalizar em TypeScript e comparar com a coluna crua ' +
          `deixa a busca CORRETA e lenta, sem erro nenhum. Plano:\n${plano}`,
      );
    } finally {
      await cliente.query('ROLLBACK');
    }
  });

  void it('com mil entradas o planejador escolhe o indice SOZINHO', async () => {
    // O caso acima prova que o plano por indice existe. Este prova que ele e o
    // escolhido quando a tabela cresce -- que e a pergunta de producao, e a
    // unica que responde "o que acontece quando o diretorio tiver mil linhas".
    //
    // Tudo dentro de uma transacao revertida: mil linhas nao sobrevivem a este
    // caso, e o `ANALYZE` de dentro dela tambem nao.
    await cliente.query('BEGIN');
    try {
      // `source = 'import'` com `claim_status = 'unclaimed'` e o UNICO par que o
      // CHECK `professionals_aceite_antes_do_perfil` admite sem titular, e e o
      // que esta massa precisa: mil perfis com mil contas seria semear a tabela
      // de usuarios para medir um plano de consulta.
      await cliente.query(
        `INSERT INTO professionals (id, kind, display_name, city, state, neighborhood,
                                    source, claim_status, verification_level, slug, status, published_at)
         SELECT gen_random_uuid(), 'vet', 'Clinica Massa ' || n, 'São Paulo', 'SP', 'Centro',
                'import', 'unclaimed', 'none', 'massa-' || n, 'published', now()
           FROM generate_series(1, 1000) AS n`,
      );
      await cliente.query('ANALYZE professionals');
      const r = await cliente.query<Record<string, string>>(
        `EXPLAIN SELECT slug FROM professionals
          WHERE status = 'published'
            AND texto_para_busca(display_name) LIKE padrao_de_busca($1)`,
        ['massa 777'],
      );
      const plano = r.rows.map((linha) => Object.values(linha).join(' ')).join('\n');
      assert.match(
        plano,
        /professionals_busca_por_nome/,
        'ISCA: sem o indice, esta consulta e uma varredura completa POR ' +
          `REQUISICAO. Plano com mil linhas:\n${plano}`,
      );
      assert.doesNotMatch(
        plano,
        /Seq Scan on professionals/,
        `o planejador voltou a varrer a tabela inteira. Plano:\n${plano}`,
      );
    } finally {
      await cliente.query('ROLLBACK');
    }
  });

  void it('nenhuma coluna de vinculo atravessa o repositorio', async () => {
    const titular = await criarConta();
    const bairro = `bairro-${randomUUID().slice(0, 8)}`;
    await criarEntrada({ titular, slug: `vinc-${randomUUID().slice(0, 8)}`, bairro });

    const pagina = await repo.listarPublicados(recorte(titular, { neighborhood: bairro }));
    const bruto = JSON.stringify(pagina.itens);

    // `created_by_user_id` e `claimed_by_user_id` carregam a marca `NUNCA sai do
    // servidor`. O que nao e selecionado nao tem como vazar, e este caso e o que
    // impede alguem de "completar" a lista de colunas um dia.
    assert.equal(bruto.includes(titular), false);
    assert.equal(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(bruto),
      false,
      'nenhum UUID sai do repositorio: nem o da entrada, nem o de conta nenhuma.',
    );
  });
});
