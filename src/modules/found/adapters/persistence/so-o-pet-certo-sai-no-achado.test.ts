import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';

import type { Database } from '../../../../shared/db/schema.js';
import type {
  CaseId,
  FoundReportId,
  Instant,
  UserId,
} from '../../../../shared/types/brands.js';
import { criarFoundReportRepository } from './kysely-found-report-repository.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const ACHADO = '018f3a2b-0000-7000-8000-00000000f001' as FoundReportId;
const CASO = '018f3a2b-0000-7000-8000-00000000c001' as CaseId;
const AGORA = 1_800_000_000_000 as Instant;

let compiladas: string[] = [];

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
  log: (evento) => {
    if (evento.level === 'query') compiladas.push(evento.query.sql);
  },
});

const repositorio = criarFoundReportRepository(semBanco);

function tem(agulha: string): boolean {
  return compiladas.some((s) => s.toLowerCase().includes(agulha.toLowerCase()));
}

function tudo(): string {
  return compiladas.join('\n---\n');
}

async function sqlDe(chamada: () => Promise<unknown>): Promise<string> {
  compiladas = [];
  await chamada();
  assert.ok(
    compiladas.length > 0,
    'REPROVA NO CONTROLE: a chamada não compilou consulta nenhuma, e qualquer ' +
      'afirmação sobre o texto dela seria vácuo.',
  );
  return compiladas.join('\n---\n').toLowerCase();
}

const leituraDoRelator = (): Promise<unknown> => repositorio.buscarDoRelator(ACHADO, DONO);

const registroDoAchado = (): Promise<unknown> =>
  assert.rejects(() =>
    repositorio.criar({
      id: ACHADO,
      reporterUserId: DONO,
      especie: 'dog',
      porte: 'M',
      sexo: null,
      racaCodigo: null,
      racaTextoLivre: null,
      versaoDosDadosDeReferencia: null,
      corPrimariaCodigo: null,
      achadoEm: AGORA,
      lat: undefined,
      lon: undefined,
      cidade: 'São Paulo',
      bairro: 'Pinheiros',
      uf: 'SP',
      observacao: null,
      caseId: CASO,
      retencaoAte: AGORA,
    }),
  );

beforeEach(() => {
  compiladas = [];
});

async function compilarAsCincoLeituras(): Promise<void> {
  await assert.rejects(() =>
    repositorio.criar({
      id: ACHADO,
      reporterUserId: DONO,
      especie: 'dog',
      porte: 'M',
      sexo: null,
      racaCodigo: null,
      racaTextoLivre: null,
      versaoDosDadosDeReferencia: null,
      corPrimariaCodigo: null,
      achadoEm: AGORA,
      lat: undefined,
      lon: undefined,
      cidade: 'São Paulo',
      bairro: 'Pinheiros',
      uf: 'SP',
      observacao: null,
      caseId: CASO,
      retencaoAte: AGORA,
    }),
  );
  await repositorio.buscarDoRelator(ACHADO, DONO);
  await repositorio.listarDoRelator(DONO, 20, null);
  await repositorio.avisoParaAnexarFoto(ACHADO, DONO);
  await repositorio.enriquecer(ACHADO, DONO, { observacao: 'mais sinais' }, AGORA);
}

void describe('CONTROLE POSITIVO: a agulha `match_candidates` casa quando a tabela está lá', () => {
  void it('uma consulta que referencia a tabela é encontrada pela MESMA função de busca', async () => {
    await semBanco.selectFrom('match_candidates').select('id').execute();

    assert.ok(
      tem('match_candidates'),
      'REPROVA NO CONTROLE: uma consulta que seleciona de `match_candidates` não ' +
        'foi encontrada pela função de busca deste arquivo. Enquanto este caso ' +
        'não passar, NENHUMA afirmação de ausência abaixo vale -- elas estariam ' +
        `procurando uma agulha que não casa. SQL capturado: ${tudo()}`,
    );
  });

  void it('o log captura as cinco leituras, e não um subconjunto', async () => {
    await compilarAsCincoLeituras();

    assert.ok(
      compiladas.length >= 5,
      `REPROVA NO CONTROLE: só ${compiladas.length} consulta(s) foram capturadas, e ` +
        'as leituras do achado são cinco (`criar`, `buscarDoRelator`, ' +
        '`listarDoRelator`, `avisoParaAnexarFoto`, `enriquecer`). Ausência medida ' +
        'sobre lista vazia é o portão cego que este repositório já produziu.',
    );
  });
});

void describe('o pet certo SAI, e as duas colunas que o resolvem estão na consulta', () => {
  void it('o registro já traz o pet certo: `pets.name` e a capa', async () => {
    const sqlDoRegistro = await sqlDe(registroDoAchado);

    assert.ok(
      sqlDoRegistro.includes('insert into'),
      `REPROVA NA ÂNCORA: a consulta medida não é o INSERT. SQL: ${sqlDoRegistro}`,
    );
    for (const agulha of ['pets', 'name', 'pet_photos', 'card_key']) {
      assert.ok(
        sqlDoRegistro.includes(agulha),
        `REPROVA: \`${agulha}\` não aparece no \`RETURNING\` do registro. O 201 do ` +
          'registro é a PRIMEIRA resposta que a tela do achado lê, e é dela que o ' +
          'cliente reclamou ("não tem foto do pet"). A autorização de 28/10/2026 ' +
          'foi "pode colocar a foto e o nome do pet", e sem estas colunas a tela ' +
          `volta à queixa. SQL: ${sqlDoRegistro}`,
      );
    }
    assert.match(
      sqlDoRegistro,
      /coalesce\(\s*"?found_reports"?\."?pet_id"?/,
      'REPROVA: o `RETURNING` do registro não resolve o pet pelos dois braços do ' +
        `\`COALESCE\`. SQL: ${sqlDoRegistro}`,
    );
  });

  void it('a plaquinha resolve o pet direto por `found_reports.pet_id`', async () => {
    const sqlDaLeitura = await sqlDe(leituraDoRelator);

    assert.ok(
      sqlDaLeitura.includes('pets') && sqlDaLeitura.includes('card_key'),
      `REPROVA NA ÂNCORA: a leitura do relator não projeta o pet. SQL: ${sqlDaLeitura}`,
    );

    assert.match(
      sqlDaLeitura,
      /coalesce\(\s*"?found_reports"?\."?pet_id"?/,
      'REPROVA: a leitura não resolve o pet por `found_reports.pet_id` dentro do ' +
        '`COALESCE`. É o braço da PLAQUINHA: `pet_id` é escrito só por ' +
        '`registrarAviso` em `kysely-tag-repository.ts`, junto com ' +
        '`origin: tag_scan`. Sem ele, o achado vindo de plaquinha lida perde a ' +
        `foto e o nome -- e é o caminho que o cliente mais usa. SQL: ${sqlDaLeitura}`,
    );
  });

  void it('o link do tutor (`share_token`) resolve o pet pelo caso', async () => {
    const sqlDaLeitura = await sqlDe(leituraDoRelator);

    assert.ok(
      sqlDaLeitura.includes('lost_cases'),
      'REPROVA: a leitura não alcança `lost_cases`. É o segundo braço do ' +
        '`COALESCE`, e o único caminho do `share_token`: `found_reports.case_id` ' +
        'é escrito só pelo INSERT de `criar`, a partir do token que o tutor ' +
        'publicou (critério 10). Sem ele, quem colou o link do tutor não vê a ' +
        `foto nem o nome do animal que o próprio link já mostra. SQL: ${sqlDaLeitura}`,
    );
    assert.match(
      sqlDaLeitura,
      /lc\.id\s*=\s*"?found_reports"?\."?case_id"?/,
      'REPROVA: `lost_cases` aparece mas não está correlacionada por ' +
        '`found_reports.case_id`. Sem a correlação ela traria o pet de um caso ' +
        `qualquer -- o animal de outra pessoa na ficha deste achado. SQL: ${sqlDaLeitura}`,
    );
  });

  void it('a capa sai só quando a derivada está PRONTA, e é a primária', async () => {
    const sqlDaLeitura = await sqlDe(leituraDoRelator);

    assert.ok(
      sqlDaLeitura.includes('card_key'),
      `REPROVA NA ÂNCORA: a leitura não lê a capa do pet. SQL: ${sqlDaLeitura}`,
    );
    assert.ok(
      sqlDaLeitura.includes("'ready'"),
      "REPROVA: a capa do pet é lida sem exigir `status = 'ready'`. Sem o " +
        'predicado, a resposta monta endereço para uma derivada que o worker ' +
        'ainda não gravou -- e a tela promete uma foto que vai dar 404. É a ' +
        'mesma razão pela qual `kysely-tag-repository.ts` cobra os quatro ' +
        `predicados. SQL: ${sqlDaLeitura}`,
    );
    assert.ok(
      sqlDaLeitura.includes('is_primary'),
      'REPROVA: a capa é lida sem `is_primary`. Um pet com três fotos prontas ' +
        `devolveria a que o Postgres achar primeiro. SQL: ${sqlDaLeitura}`,
    );
    assert.ok(
      sqlDaLeitura.includes('deleted_at'),
      'REPROVA: a capa é lida sem excluir foto apagada. A derivada de uma foto ' +
        `que o tutor apagou continuaria endereçável. SQL: ${sqlDaLeitura}`,
    );
  });

  void it('a resolução é CORRELACIONADA, e não um produto cartesiano', async () => {
    const sqlDaLeitura = await sqlDe(leituraDoRelator);

    assert.match(
      sqlDaLeitura,
      /f\.pet_id\s*=/,
      'REPROVA: a subconsulta da capa não correlaciona por `f.pet_id`. Sem a ' +
        'correlação ela devolveria a primeira capa pronta DE QUALQUER PET -- a ' +
        'foto de um animal na ficha de outro, que é o defeito mais caro que ' +
        `esta tela pode ter. SQL: ${sqlDaLeitura}`,
    );
    assert.match(
      sqlDaLeitura,
      /p\.id\s*=/,
      `REPROVA: a subconsulta do nome não correlaciona por \`p.id\`. SQL: ${sqlDaLeitura}`,
    );
  });

  void it('a capa tem `limit 1`, porque duas primárias são representáveis', async () => {
    const sqlDaLeitura = await sqlDe(leituraDoRelator);

    assert.ok(
      sqlDaLeitura.includes('limit 1'),
      'REPROVA: a subconsulta da capa perdeu o `LIMIT 1`. Duas fotos marcadas ' +
        '`is_primary` são representáveis em `pet_photos` (não há índice único ' +
        'que as proíba), e subconsulta escalar com duas linhas levanta 21000 -- ' +
        `500 na tela de quem está na rua com um animal no colo. SQL: ${sqlDaLeitura}`,
    );
  });
});

void describe('O ACHADO AVULSO: não existe consulta que traga o palpite', () => {
  void it('nenhuma leitura do achado toca `match_candidates`', async () => {
    await compilarAsCincoLeituras();

    assert.ok(
      tem('pets') && tem('card_key'),
      'REPROVA NA ÂNCORA: a projeção do pet não está na consulta, então a ' +
        'ausência cobrada abaixo não significa nada. Conserte a âncora primeiro.',
    );

    assert.ok(
      !tem('match_candidates'),
      'REPROVA: uma leitura do achado passou a tocar `match_candidates`. É ali ' +
        'que mora o vínculo do achado AVULSO cruzado por semelhança, com ' +
        '`link_origin = \'attribute_match\'` e `status = \'suggested\'` -- um ' +
        'PALPITE da máquina. Trazer foto e nome por esse caminho entrega ao ' +
        'golpista do falso achador exatamente o insumo que lhe falta para ' +
        '"achei seu pet" soar verdadeiro, e o cliente mediu esse golpe em ' +
        '20/10/2026. A emenda 7 do ADR-0010 abriu os dois caminhos em que quem ' +
        'lê JÁ SABE qual animal é (plaquinha e link do tutor), e só eles. ' +
        `SQL: ${tudo()}`,
    );
  });

  void it('nem `link_origin`, nem `score`, nem `attribute_match` aparecem', async () => {
    await compilarAsCincoLeituras();

    assert.ok(tem('pets'), 'REPROVA NA ÂNCORA: a projeção do pet não está na consulta.');

    for (const agulha of ['link_origin', 'attribute_match', 'score']) {
      assert.ok(
        !tem(agulha),
        `REPROVA: \`${agulha}\` apareceu numa leitura do achado. A sugestão do ` +
          'cruzamento não entra na resposta por NENHUM caminho -- nem pela ' +
          'tabela, nem por uma coluna dela. ' +
          `SQL: ${tudo()}`,
      );
    }
  });

  void it('a projeção devolve `petCorrespondente` nulo quando o banco não dá linha', async () => {
    const achado = await repositorio.buscarDoRelator(ACHADO, DONO);

    assert.equal(
      achado,
      null,
      'REPROVA: a leitura sem linha devolveu algo. Este caso existe para fixar ' +
        'que a ausência de pet vira ausência, e não objeto pela metade.',
    );
  });
});

void describe('ISCA DA ISCA: a busca não é cega a maiúsculas nem a espaços', () => {
  void it('uma agulha que NÃO está no SQL não é encontrada', async () => {
    await compilarAsCincoLeituras();

    assert.ok(
      !tem('tabela_que_nao_existe_em_lugar_nenhum'),
      'REPROVA: a função de busca deste arquivo encontra o que não está no SQL. ' +
        'Com ela assim, nenhuma afirmação do arquivo vale.',
    );
    assert.ok(
      tem('FOUND_REPORTS'),
      'REPROVA: a função de busca é sensível a caixa. O compilador do Kysely ' +
        'cita identificadores em minúsculas, e uma comparação sensível a caixa ' +
        'faria as âncoras reprovarem por motivo errado.',
    );
  });
});

void describe('a suíte não deixa o Kysely pendurado', () => {
  void it('encerra o Kysely de compilação', async () => {
    await semBanco.destroy();
    assert.ok(true);
  });
});
