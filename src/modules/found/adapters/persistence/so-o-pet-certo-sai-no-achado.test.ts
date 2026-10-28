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
 * ## DESLIGAR PARA VER REPROVAR -- medido, com o `fail` de cada um
 *
 * Linha de base: **13 casos, 13 passam, 0 reprovam** (Node 22.23.2 nesta
 * máquina, 28/10/2026). Cada linha abaixo foi desligada em
 * `kysely-found-report-repository.ts`, a suíte rodou, e o arquivo foi
 * restaurado com `git diff --stat` vazio ao fim.
 *
 * | o que foi desligado | `fail` | caso que reprovou |
 * |---|---|---|
 * | `PET_ALVO` virando só `found_reports.pet_id` | 2 | a plaquinha / o link do tutor |
 * | `PET_ALVO` virando só a subconsulta de `lost_cases` | 1 | a plaquinha |
 * | `AND f.status = 'ready'` fora de `PET_CHAVE_DA_FOTO` | 1 | a capa sai só quando PRONTA |
 * | `.leftJoin('match_candidates', ...)` em `construtorDaLeitura` | 1 | nenhuma leitura toca `match_candidates` |
 * | as duas linhas do pet fora de `COLUNAS` | 1 | o registro já traz o pet certo |
 *
 * ## DOIS PORTÕES CEGOS FORAM PEGOS AQUI, e não por leitura
 *
 * As duas primeiras versões deste arquivo tinham afirmação que passava com o
 * código quebrado, e **as duas só apareceram rodando o desligamento**:
 *
 *  1. "a plaquinha resolve o pet por `found_reports.pet_id`" procurava a agulha
 *     no SQL das cinco consultas juntas, e passava com o braço da plaquinha
 *     arrancado -- porque `construtorDoAvisoParaFoto` já tinha um `leftJoin` em
 *     `found_reports.pet_id`, posto ali pela autorização do tutor, e aquele
 *     join sozinho satisfazia a busca;
 *  2. "o registro já traz o pet certo" fazia o mesmo, e passava com as duas
 *     linhas do pet fora de `COLUNAS` -- porque as outras quatro leituras
 *     continuavam trazendo `pets` e `card_key`.
 *
 * A correção dos dois é a mesma: medir **por consulta**, e escolher a consulta
 * em que a agulha só pode estar por um motivo. Ver `sqlDe`, `leituraDoRelator`
 * e `registroDoAchado`.
 *
 * Isto fica escrito porque a lição não é sobre estes dois casos: é que agulha
 * procurada num texto grande encontra o motivo errado, e só o desligamento
 * conta a verdade.
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

/**
 * O SQL de UMA chamada, isolado.
 *
 * ## Por que por chamada, e não tudo junto -- isto foi MEDIDO
 *
 * A primeira versão deste arquivo afirmava "a plaquinha resolve o pet por
 * `found_reports.pet_id`" procurando a agulha no SQL das cinco consultas
 * juntas. **Ela passou com o braço da plaquinha arrancado do `COALESCE`**, e o
 * motivo é um `leftJoin` que já existia: `construtorDoAvisoParaFoto` junta
 * `pets` em `found_reports.pet_id` para a autorização do tutor (a ampliação da
 * BICHUS-35), e aquele join sozinho satisfazia a busca.
 *
 * Era portão cego -- o defeito recorrente desta casa --, e foi pego rodando o
 * desligamento em vez de confiando na leitura. A correção é medir no
 * `buscarDoRelator`, que é a leitura SEM junção nenhuma em `pets`: ali a única
 * razão para `found_reports.pet_id` aparecer é a resolução do pet.
 */
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

/** A leitura LIMPA: nenhuma junção em `pets` além da resolução do pet. */
const leituraDoRelator = (): Promise<unknown> => repositorio.buscarDoRelator(ACHADO, DONO);

/**
 * O `INSERT ... RETURNING` do registro, medido SOZINHO.
 *
 * ## Por que ele tem probe próprio -- também MEDIDO
 *
 * O `RETURNING` de `criar` não usa os mesmos construtores das leituras: ele
 * monta as colunas pelo template `COLUNAS`, que é outra definição. A primeira
 * versão deste arquivo ancorava "o registro já traz o pet certo" no texto das
 * CINCO consultas juntas, e **passou com as duas linhas do pet arrancadas de
 * `COLUNAS`** -- as outras quatro leituras continuavam trazendo `pets` e
 * `card_key`, e a busca se satisfazia com elas.
 *
 * Isso importa mais que as outras quatro: o 201 do registro é a PRIMEIRA
 * resposta que a tela do achado lê, e é dela que o cliente reclamou. Um portão
 * que não a cobre deixa passar exatamente o defeito que esta entrega conserta.
 */
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
    // O `RETURNING` de `criar`, SOZINHO -- ver `registroDoAchado` para o
    // desligamento que a versão anterior deste caso deixou passar.
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

    // ÂNCORA: é a leitura certa, e ela projeta o pet.
    assert.ok(
      sqlDaLeitura.includes('pets') && sqlDaLeitura.includes('card_key'),
      `REPROVA NA ÂNCORA: a leitura do relator não projeta o pet. SQL: ${sqlDaLeitura}`,
    );

    // A agulha é o `COALESCE` COM o braço dentro, e não `found_reports.pet_id`
    // solto: ver `sqlDe` para o desligamento que a versão anterior deixou
    // passar.
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

    // `pet_photos` não tem índice único por `(pet_id, is_primary)`: duas capas
    // marcadas primárias são representáveis no banco, e subconsulta escalar que
    // devolve duas linhas levanta 21000 em tempo de execução -- um 500 na tela
    // do achado, e não uma foto errada. `pets.id` é chave primária e não tem
    // como devolver duas, então o nome não precisa de `LIMIT`.
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
