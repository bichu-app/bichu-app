/**
 * ISCA ESTRUTURAL: a foto e o nome do pet saem no achado de PLAQUINHA e de
 * LINK, e **não existe consulta** que os traga no achado avulso cruzado por
 * semelhança.
 *
 * ## A autorização, e o que ela não disse
 *
 * Cliente, 28/10/2026, literal: *"pode colocar a foto e o nome do pet."* Ela
 * responde a uma queixa repetida — o achado registrado aparecia sem foto nem
 * nome — e está na emenda 7 do ADR-0010, no nome dele.
 *
 * A frase não recortou onde. O recorte é da emenda, e é este: foto e nome saem
 * nos dois caminhos em que **quem lê já sabe qual animal é** — a plaquinha foi
 * lida (`origin: 'tag_scan'`), ou a pessoa colou o `share_token` que o tutor
 * publicou (e aquele link já carrega foto e nome). Nos dois, foto e nome não
 * contam nada novo.
 *
 * No achado **avulso**, cruzado por semelhança, eles não saem. O risco é
 * nominal e foi medido pelo próprio cliente em 20/10/2026: no golpe do falso
 * achador um estranho diz "achei seu pet" para extorquir o tutor. Foto e nome
 * de uma correspondência que a **máquina palpitou** seriam exatamente o insumo
 * que falta para a frase soar verdadeira — e o cruzamento *sugere*, não
 * confirma (BICHUS-35, critério 7).
 *
 * ## Por que o SQL, e não a resposta
 *
 * A resposta é medida em `found-report-routes.test.ts`, com dublê de
 * repositório. Aquele arquivo é necessário e **não é suficiente**: o dublê
 * devolve o que o caso lhe manda devolver, então ele prova que a borda
 * *projeta* o pet quando o recebe — nunca que a consulta de verdade deixa de
 * trazê-lo no achado avulso. Um `JOIN` em `match_candidates` acrescentado
 * amanhã passaria por lá inteiro.
 *
 * Este arquivo compila o SQL das CINCO consultas de produção, chamando os
 * métodos reais do repositório sobre um Kysely que compila e não executa. O que
 * ele afirma não é observável na resposta.
 *
 * ## A afirmação central é uma AUSÊNCIA, e ausência precisa de controle
 *
 * `assert(!sql.includes('match_candidates'))` fica verde com a consulta
 * apagada, com o método renomeado e com a agulha escrita errada. Este
 * repositório já produziu portão cego mais de uma vez. Então:
 *
 *  1. todo caso de ausência ancora primeiro no que **tem** de existir —
 *     `pets`, `name`, `pet_photos`, `card_key` e as duas colunas do `COALESCE`;
 *  2. a agulha `match_candidates` é provada por **controle positivo**: uma
 *     consulta escrita neste arquivo, que referencia a tabela, casa com a mesma
 *     função de busca. Se a agulha estivesse errada, o controle reprovaria.
 *
 * ## DESLIGAR PARA VER REPROVAR
 *
 * Em `kysely-found-report-repository.ts`:
 *
 *  1. troque o `COALESCE` de `PET_ALVO` por só `found_reports.pet_id`
 *     -> reprova `o link do tutor (share_token) resolve o pet pelo caso`;
 *  2. troque-o por só a subconsulta de `lost_cases`
 *     -> reprova `a plaquinha resolve o pet direto por found_reports.pet_id`;
 *  3. tire `AND f.status = 'ready'` de `PET_CHAVE_DA_FOTO`
 *     -> reprova `a capa sai só quando a derivada esta PRONTA`;
 *  4. acrescente `.leftJoin('match_candidates', ...)` a `construtorDaLeitura`
 *     -> reprova `nenhuma leitura do achado toca match_candidates`;
 *  5. apague as duas linhas `PET_NOME`/`PET_CHAVE_DA_FOTO` de `COLUNAS`
 *     -> reprova a âncora de `o registro ja traz o pet certo`.
 */
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

/** Toda consulta compilada nesta execução, na ordem. */
let compiladas: string[] = [];

/**
 * Kysely que COMPILA e não executa, com o SQL capturado pelo log.
 *
 * `DummyDriver` devolve zero linhas, então os métodos que leem acabam
 * devolvendo `null` — e isso não importa: o que este arquivo mede é o **texto
 * da consulta que o driver recebeu**, que é o mesmo que produção manda ao
 * Postgres. Chamar o método real e não recompilar a consulta à mão é o ponto:
 * uma bancada que montasse a consulta por conta própria mediria a bancada.
 */
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

/** Minúsculas: o compilador cita identificadores, e caixa não é a afirmação. */
function tem(agulha: string): boolean {
  return compiladas.some((s) => s.toLowerCase().includes(agulha.toLowerCase()));
}

function tudo(): string {
  return compiladas.join('\n---\n');
}

beforeEach(() => {
  compiladas = [];
});

/**
 * As cinco consultas que leem um achado e projetam a resposta.
 *
 * `criar` entra porque o 201 do registro é montado pelo `RETURNING` dele — é a
 * resposta que a tela do achado lê primeiro, e foi dela que o cliente reclamou.
 */
async function compilarAsCincoLeituras(): Promise<void> {
  // `criar` LEVANTA aqui, e isso é correto: o `INSERT ... RETURNING` é
  // compilado e entregue ao driver, o `DummyDriver` devolve zero linhas, e a
  // guarda do repositório ("o INSERT não devolveu linha") faz o que deve fazer.
  // O SQL já foi capturado pelo log quando a exceção sobe -- é ele que este
  // arquivo mede, e não a guarda. Engolir a exceção aqui é o que deixa a
  // consulta do registro ser medida sem um Postgres de verdade; o comportamento
  // do 201 é medido em `found-report-routes.test.ts` e na suíte de integração.
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
    // Sem este caso, toda a prova de ausência abaixo poderia estar medindo uma
    // agulha escrita errada -- `match_candidate`, `matchCandidates`, um erro de
    // digitação -- e ficaria verde com um `JOIN` na tabela.
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
    // A segunda metade do controle: se o log parasse de capturar, `compiladas`
    // ficaria vazio e TODA ausência passaria vacuamente.
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
    await compilarAsCincoLeituras();

    // ÂNCORA: sem estas quatro, os casos de ausência abaixo ficariam verdes com
    // a projeção do pet apagada -- que é o defeito de 28/10, não o conserto.
    for (const agulha of ['pets', 'name', 'pet_photos', 'card_key']) {
      assert.ok(
        tem(agulha),
        `REPROVA NA ÂNCORA: \`${agulha}\` não aparece em nenhuma das cinco ` +
          'leituras do achado. A foto e o nome do pet são a autorização de ' +
          '28/10/2026 ("pode colocar a foto e o nome do pet"); sem eles a tela ' +
          'volta à queixa que o cliente repetiu. ' +
          `SQL capturado: ${tudo()}`,
      );
    }
  });

  void it('a plaquinha resolve o pet direto por `found_reports.pet_id`', async () => {
    await compilarAsCincoLeituras();

    assert.ok(
      tem('found_reports"."pet_id') || tem('found_reports.pet_id'),
      'REPROVA: a consulta não resolve o pet por `found_reports.pet_id`. É o ' +
        'braço da PLAQUINHA do `COALESCE`: `pet_id` é escrito só por ' +
        '`registrarAviso` em `kysely-tag-repository.ts`, junto com ' +
        '`origin: \'tag_scan\'`. Sem ele, o achado vindo de plaquinha lida ' +
        `perde a foto e o nome -- e é o caminho que o cliente usa. SQL: ${tudo()}`,
    );
  });

  void it('o link do tutor (`share_token`) resolve o pet pelo caso', async () => {
    await compilarAsCincoLeituras();

    assert.ok(
      tem('lost_cases'),
      'REPROVA: a consulta não alcança `lost_cases`. É o segundo braço do ' +
        '`COALESCE`, e o único caminho do `share_token`: `found_reports.case_id` ' +
        'é escrito só pelo INSERT de `criar`, a partir do token que o tutor ' +
        'publicou (critério 10). Sem ele, quem colou o link do tutor não vê a ' +
        `foto nem o nome do animal que o próprio link já mostra. SQL: ${tudo()}`,
    );
    assert.ok(
      tem('case_id'),
      'REPROVA: `lost_cases` aparece mas `case_id` não liga os dois. ' +
        `SQL: ${tudo()}`,
    );
  });

  void it('a capa sai só quando a derivada está PRONTA, e é a primária', async () => {
    await compilarAsCincoLeituras();

    assert.ok(
      tem("'ready'"),
      'REPROVA: a capa do pet é lida sem exigir `status = \'ready\'`. Sem o ' +
        'predicado, a resposta monta endereço para uma derivada que o worker ' +
        'ainda não gravou -- e a tela promete uma foto que vai dar 404. É a ' +
        'mesma razão pela qual `kysely-tag-repository.ts` cobra os quatro ' +
        `predicados. SQL: ${tudo()}`,
    );
    assert.ok(
      tem('is_primary'),
      'REPROVA: a capa é lida sem `is_primary`. Um pet com três fotos prontas ' +
        `devolveria a que o Postgres achar primeiro. SQL: ${tudo()}`,
    );
  });
});

void describe('O ACHADO AVULSO: não existe consulta que traga o palpite', () => {
  void it('nenhuma leitura do achado toca `match_candidates`', async () => {
    await compilarAsCincoLeituras();

    // ÂNCORA primeiro: a projeção do pet existe (ver o caso de âncora acima).
    // Sem ela esta ausência passaria com a consulta inteira apagada.
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

    // Três nomes vizinhos, pelo mesmo motivo que `portao-contrato-publico.ts`
    // compara por nome EXATO e precisou de `complement` e `street_address`
    // separados: alcançar a sugestão por uma coluna e não pela tabela (uma
    // junção por `score`, um `EXISTS` por `link_origin`) atravessaria o caso
    // acima sem um achado.
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
    // O complemento de comportamento da prova estrutural: com zero linhas (que
    // é o que `DummyDriver` devolve, e o que o Postgres devolve no achado
    // avulso), o que chega ao domínio é `null` -- e não um objeto meio montado
    // com `nome: undefined`, que a borda serializaria como `matched_pet` com
    // nome ausente e o contrato declara `required`.
    const achado = await repositorio.buscarDoRelator(ACHADO, DONO);

    assert.equal(
      achado,
      null,
      'REPROVA: a leitura sem linha devolveu algo. Este caso existe para fixar ' +
        'que a ausência de pet vira ausência, e não objeto pela metade.',
    );
  });
});

void describe('a subconsulta é CORRELACIONADA, e não um produto cartesiano', () => {
  void it('a capa é filtrada por `f.pet_id`, e o nome por `p.id`', async () => {
    await compilarAsCincoLeituras();

    const texto = tudo().toLowerCase();
    assert.ok(
      texto.includes('f.pet_id ='),
      'REPROVA: a subconsulta da capa não correlaciona por `f.pet_id`. Sem a ' +
        'correlação ela devolveria a primeira capa pronta DE QUALQUER PET -- ' +
        'a foto de um animal na ficha de outro, que é o defeito mais caro que ' +
        `esta tela pode ter. SQL: ${tudo()}`,
    );
    assert.ok(
      texto.includes('p.id ='),
      'REPROVA: a subconsulta do nome não correlaciona por `p.id`. ' +
        `SQL: ${tudo()}`,
    );
  });

  void it('a capa tem `limit`, e o nome não precisa dele', async () => {
    await compilarAsCincoLeituras();

    // `pet_photos` não tem índice único por `(pet_id, is_primary)`: duas capas
    // marcadas primárias são representáveis no banco, e subconsulta escalar que
    // devolve duas linhas é erro 21000 em tempo de execução -- um 500 na tela
    // do achado, e não uma foto errada. O `LIMIT 1` é o que torna isso
    // impossível. `pets.id` é chave primária e não tem como devolver duas.
    assert.ok(
      tudo().toLowerCase().includes('limit 1'),
      'REPROVA: a subconsulta da capa perdeu o `LIMIT 1`. Duas fotos marcadas ' +
        '`is_primary` são representáveis em `pet_photos` (não há índice único ' +
        'que as proíba), e subconsulta escalar com duas linhas levanta 21000 -- ' +
        `500 na tela de quem está na rua com um animal no colo. SQL: ${tudo()}`,
    );
  });
});

void describe('ISCA DA ISCA: a busca não é cega a maiúsculas nem a espaços', () => {
  void it('uma agulha que NÃO está no SQL não é encontrada', async () => {
    await compilarAsCincoLeituras();

    // Se `tem()` devolvesse `true` para tudo (um `includes` invertido, uma
    // regex gulosa), todas as âncoras passariam e todas as ausências
    // reprovariam -- ou o contrário. Este caso fixa que a função discrimina.
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
