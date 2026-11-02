/**
 * **OS SETE PREDICADOS DA LISTAGEM DA REGIÃO MORAM NA CLÁUSULA `WHERE`**
 * (ADR-0021) — e cada um tem um caso, porque cada um tem um motivo.
 *
 * Decisão do cliente de 02/11/2026, e as duas escolhas dele:
 *
 *  1. **só quem optar aparece**, e ele recusou listar todo mundo sabendo que a
 *     lista começa menor;
 *  2. **o piso de 3 caracteres da busca FICA** — `searchPeople` não muda.
 *
 * **O QUE `ADERIR` SIGNIFICA, DEPOIS DO REFINAMENTO DELE**: *"o aderir é apenas
 * referente a criar um perfil público e que o perfil dela e os posts podem
 * aparecer para outras pessoas"*, e **o que coloca a pessoa na listagem é foto
 * + perfil público**. Esta frente não tem adesão própria: ela LÊ a regra de
 * `shared/perfil-publico/perfil-publico-de-pessoa.ts`. Por isso os casos 2 e 3
 * afirmam a PRESENÇA daquele predicado e não a redação dele — a redação é
 * cobrada lá, por `perfil-publico-nas-duas-formas.test.ts`.
 *
 * Este arquivo lê o SQL **compilado** e não executa nada: ele prova *onde* cada
 * predicado mora. O irmão de integração
 * (`tests/integration/lista-da-regiao-por-adesao.test.ts`) prova o que a
 * resposta traz, contra Postgres de verdade.
 *
 * ## A ARMADILHA DESTA CLASSE DE CASO, E O CONTROLE QUE A COBRE
 *
 * Um caso que afirma *"a agulha está no SQL"* passa por engano quando a agulha
 * está ali por outro motivo, e **reprova por engano quando a consulta deixa de
 * compilar** — mas um caso que afirma *"a agulha NÃO está"* passa quando a
 * leitura não leu nada. Por isso o primeiro grupo é um CONTROLE POSITIVO: ele
 * prova que a leitura produziu SQL com as duas junções e os parâmetros dentro,
 * antes de qualquer caso negativo afirmar ausência.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Database } from '../../../../shared/db/schema.js';
import type { UserId } from '../../../../shared/types/brands.js';
import { construtorDaListaDaRegiao } from './kysely-lista-da-regiao.js';

const QUEM_VE = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const consulta = () => construtorDaListaDaRegiao(semBanco, QUEM_VE, 1, 20);
const sqlDaLista = (): string => consulta().sql;

void describe('CONTROLE POSITIVO: a leitura produziu SQL de verdade', () => {
  void it('o SQL tem as DUAS junções de `users` — a pessoa listada e quem olha', () => {
    const sql = sqlDaLista();
    assert.match(
      sql,
      /from "handles" as "h"/i,
      'a consulta não parte de `handles`: sem isto, todos os casos abaixo medem outra coisa',
    );
    assert.match(sql, /join "users" as "u"/i, 'a junção da pessoa LISTADA saiu');
    assert.match(
      sql,
      /join "users" as "eu"/i,
      'a junção de QUEM OLHA saiu, e é dela que a região sai: sem ela a listagem não tem ' +
        'com o que casar, e o predicado de cidade compararia a pessoa consigo mesma',
    );
  });

  void it('quem olha chega como PARÂMETRO, nunca interpolado no texto', () => {
    const { sql, parameters } = consulta();
    assert.ok(
      !sql.includes(QUEM_VE),
      'a conta de quem olha foi INTERPOLADA no texto do SQL em vez de ir como parâmetro',
    );
    assert.ok(parameters.includes(QUEM_VE), 'quem olha não chegou como parâmetro');
  });

  void it('CONTRAPESO: a seleção traz os QUATRO campos e o total, e nada mais', () => {
    const sql = sqlDaLista();
    const corte = sql.toLowerCase().indexOf(' from "handles"');
    assert.ok(corte > 0, 'não achei o `FROM` de topo: o corte da lista de seleção não sabe onde parar');
    const selecao = sql.slice(0, corte);
    assert.match(selecao, /"h"\."handle" as "handle"/);
    assert.match(selecao, /"u"\."display_name" as "display_name"/);
    assert.match(selecao, /as "pets_count"/);
    assert.match(selecao, /as "connections_count"/);
    assert.match(selecao, /count\(\*\) OVER \(\) as "total"/i);
    assert.equal(
      (selecao.match(/ as "/g) ?? []).length,
      5,
      'a lista de seleção saiu de CINCO colunas (quatro campos e o total): uma a mais é ' +
        'um campo a mais na resposta, e `RegionPerson` é fechado em cinco propriedades',
    );
  });
});

void describe('os SETE predicados da listagem da região', () => {
  void it('1. A MESMA REGIÃO: cidade E estado, pela MESMA normalização dos dois lados', () => {
    const sql = sqlDaLista();
    assert.match(
      sql,
      /texto_para_busca\(u\.reference_city\) = texto_para_busca\(eu\.reference_city\)/,
      'o recorte da listagem saiu: sem este predicado ela lista o país inteiro',
    );
    assert.match(
      sql,
      /texto_para_busca\(u\.reference_state\) = texto_para_busca\(eu\.reference_state\)/,
      'o ESTADO saiu do predicado: há muitas `Santa Maria` no Brasil, e cidade sozinha ' +
        'juntaria pessoas a mil quilômetros numa lista que promete vizinhança',
    );
  });

  void it('2. APARECE: foto + perfil publico, e a regra VEM da peca compartilhada', () => {
    const sql = sqlDaLista();
    assert.match(
      sql,
      /"?u"?\.public_profile_enabled/i,
      'o interruptor do perfil público saiu do WHERE: sem ele a listagem lista TODO ' +
        'MUNDO da cidade, que é exatamente o que o cliente recusou',
    );
    assert.match(
      sql,
      /foto\.purpose = 'user_photo'[\s\S]*foto\.status = 'ready'/i,
      'a FOTO saiu do WHERE. Ela é METADE da regra que o cliente definiu em 02/11/2026 ' +
        '(*"o que coloca a pessoa na listagem é foto + perfil público"*), e sem ela a ' +
        'listagem contraria a decisão enquanto parece obedecê-la',
    );
    assert.match(
      sql,
      /"?u"?\.handle IS NOT NULL/i,
      'o APELIDO saiu do WHERE: sem apelido o perfil não tem endereço, e aparecer numa ' +
        'listagem sem endereço é oferecer um link que não abre',
    );
    assert.match(
      sql,
      /foto\.id = "?u"?\.photo_image_id/i,
      'o `EXISTS` da foto não está amarrado à conta da linha: ele ficaria verdadeiro ' +
        'para qualquer foto `ready` do catálogo, e TODA conta com perfil público ' +
        'apareceria sem ter foto nenhuma',
    );
  });

  void it('2b. a regra NAO esta reescrita aqui: ela vem de `shared/perfil-publico/`', () => {
    // **Este caso mede a FONTE, e não o texto do SQL** — e é ele que impede o
    // defeito que consolidou esta frente: duas definições de "aparece". Um
    // predicado reescrito à mão aqui produziria o MESMO SQL, e os casos acima
    // continuariam verdes.
    // **O caminho sai de `process.cwd()` e NÃO de `import.meta.url`**: a suíte
    // roda o JavaScript compilado de `dist/_tests/`, e um caminho relativo ao
    // módulo aponta para lá -- onde o `.ts` não existe. Medido: a primeira
    // versão deste caso reprovou com `ENOENT`, que é o desfecho certo (um
    // portão que não consegue ler reprova), mas pelo motivo errado.
    const CAMINHO = 'src/modules/people/adapters/persistence/kysely-lista-da-regiao.ts';
    const fonte = readFileSync(resolve(process.cwd(), CAMINHO), 'utf8');
    // CONTROLE POSITIVO: leu o arquivo certo, e não um vazio.
    assert.ok(
      fonte.includes('construtorDaListaDaRegiao'),
      `li \`${CAMINHO}\` e não achei a função que ele define. O caminho mudou, e as duas ` +
        'conferências abaixo passariam sobre o arquivo errado.',
    );
    assert.match(
      fonte,
      /import \{ apareceNaListagemNoSql \} from '[^']*shared\/perfil-publico\/perfil-publico-de-pessoa\.js'/,
      'o adaptador deixou de importar a regra compartilhada. A regra de quem APARECE tem ' +
        'UMA fonte, e duas definições dela foi o defeito que fez esta frente ser ' +
        'consolidada: a adesão própria desta listagem e `users.public_profile_enabled` ' +
        'eram DUAS chaves para a mesma porta.',
    );
    const semProsa = fonte.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(
      !semProsa.includes('public_profile_enabled'),
      'o nome da coluna do perfil público aparece em CÓDIGO deste adaptador: o predicado ' +
        'foi reescrito aqui em vez de vir da peça compartilhada.',
    );
  });

  void it('3. RECIPROCIDADE: a MESMA regra para quem CHAMA (reversivel NESTA linha)', () => {
    const sql = sqlDaLista();
    assert.match(
      sql,
      /"?eu"?\.public_profile_enabled/i,
      'a reciprocidade saiu. Ela é a RECOMENDAÇÃO desta frente e não uma decisão do ' +
        'cliente — ele decidiu quem APARECE, e a pergunta segue aberta com ele. Tirá-la ' +
        'é UMA linha, e o custo de tirá-la é que quem quer só raspar o catálogo deixa de ' +
        'pôr o próprio nome nele',
    );
    assert.match(
      sql,
      /foto\.id = "?eu"?\.photo_image_id/i,
      'a reciprocidade cobra MENOS de quem chama do que de quem é listado: ela é a MESMA ' +
        'expressão com o outro apelido, e não uma segunda redação da regra',
    );
    assert.match(sql, /"?eu"?\.handle IS NOT NULL/i);
  });

  void it('4. VERIFICADO nos DOIS lados, pela MESMA régua do selo', () => {
    const sql = sqlDaLista();
    assert.match(
      sql,
      /\(u\.email_verified_at IS NOT NULL OR u\.phone_verified_at IS NOT NULL\)/i,
      'a régua do canal de contato confirmado saiu do lado de quem é listado',
    );
    assert.match(
      sql,
      /\(eu\.email_verified_at IS NOT NULL OR eu\.phone_verified_at IS NOT NULL\)/i,
      'a régua saiu do lado de QUEM OLHA',
    );
    assert.ok(
      !/"u"\."email_verified_at" as /i.test(sql) && !/"u"\."phone_verified_at" as /i.test(sql),
      'a DATA de confirmação entrou na lista de seleção: a régua é derivada no WHERE, e ' +
        'o booleano nem sai — todo mundo nesta lista é verificado, e um campo que vale ' +
        '`true` em cem por cento das linhas não informa nada',
    );
  });

  void it('5. CONTA HABILITADA nos DOIS lados (decisão de 17/10/2026)', () => {
    const sql = sqlDaLista();
    assert.match(sql, /conta_habilitada\("?u"?\."?id"?\)/, 'o lado de quem é listado saiu do WHERE');
    assert.match(
      sql,
      /conta_habilitada\(\$\d+::uuid\)/,
      'o lado de QUEM OLHA saiu: conta desabilitada *não é mais encontrada em nenhuma ' +
        'página ou funcionalidade*, e ser listado é literalmente ser encontrado',
    );
  });

  void it('6. BLOQUEIO: `bloqueio_entre`, que é SIMÉTRICA e cobre os dois sentidos', () => {
    assert.match(
      sqlDaLista(),
      /NOT bloqueio_entre\("?u"?\."?id"?, \$\d+::uuid\)/,
      'sem este predicado, quem foi bloqueado continua vendo quem o bloqueou numa lista ' +
        'de vizinhos — que é a situação de quem bloqueia por estar sendo perseguido',
    );
  });

  void it('7. QUEM OLHA NÃO APARECE PARA SI MESMO', () => {
    assert.match(
      sqlDaLista(),
      /"?u"?\."?id"? <> \$\d+::uuid/,
      'a conta não se conecta consigo mesma, e o único botão de um item é `Pedir conexão`',
    );
  });

  void it('O OITAVO, que a busca também tem: perfil que quem olha DENUNCIOU não aparece', () => {
    assert.match(
      sqlDaLista(),
      /NOT perfil_ocultado_para_quem_denunciou\("?u"?\."?public_ref"?, \$\d+::uuid\)/,
      'a ocultação imediata é o que faz a denúncia valer sem prazo prometido',
    );
  });

  void it('só PESSOA: apelido de pet e apelido reservado não entram', () => {
    assert.match(sqlDaLista(), /"?h"?\."?kind"? = \$\d+/);
    assert.ok(
      consulta().parameters.includes('pessoa'),
      'o valor tem de ser `pessoa`, e não um parâmetro que alguém passe de fora',
    );
  });

  void it('nenhum ramo escolhe visibilidade: sem `UNION` e sem `CASE WHEN`', () => {
    const sql = sqlDaLista();
    assert.ok(!/\bUNION\b/i.test(sql), 'UNION é um segundo ramo de leitura');
    assert.ok(!/\bCASE\s+WHEN\b/i.test(sql), 'CASE WHEN no WHERE é o `if` que o ADR-0021 proíbe');
  });
});

void describe('o que a listagem NÃO faz', () => {
  void it('a foto e criterio de ENTRADA e NAO conteudo de SAIDA', () => {
    const sql = sqlDaLista();
    const corte = sql.toLowerCase().indexOf(' from "handles"');
    const selecao = sql.slice(0, corte);

    // ENTRADA: a foto está no WHERE, e é metade da regra do cliente.
    assert.match(
      sql,
      /EXISTS \(SELECT 1 FROM catalog_images foto/i,
      'a foto saiu do critério de entrada: a regra é foto + perfil público',
    );

    // SAÍDA: nenhuma derivada e nenhuma chave de imagem na lista de seleção.
    for (const agulha of ['thumb_key', 'public_key', 'photo_key', 'photo_icon_url']) {
      assert.ok(
        !selecao.includes(agulha),
        `\`${agulha}\` entrou na RESPOSTA da listagem. O motivo NÃO é a emenda 5 item 2 ` +
          '(que o cliente emendou em 21/10/2026, e a busca TEM foto desde então): é o ' +
          'argumento com que a foto ENTROU na busca — os três freios dela garantem que ' +
          'quem vê a foto já sabe aproximadamente quem procura, e esta lista é folhear. ' +
          '**Ter foto é o que deixa entrar; servi-la é outra decisão.**',
      );
    }
    assert.ok(
      !/catalog_images/i.test(selecao),
      '`catalog_images` entrou na LISTA DE SELEÇÃO: a imagem é lida para decidir quem ' +
        'entra, e não para sair na resposta',
    );
  });

  void it('NÃO há termo de busca: a decisão 2 do cliente, e nem há parâmetro por onde entrar', () => {
    const sql = sqlDaLista();
    for (const agulha of ['padrao_de_busca', 'LIKE', 'ilike', 'similarity', '%'])
      assert.ok(
        !sql.includes(agulha),
        `\`${agulha}\` entrou na listagem: um termo aqui seria uma SEGUNDA busca de ` +
          'pessoas sem nenhum dos freios da primeira, e o cliente decidiu que a busca ' +
          'não muda em nada',
      );
    assert.ok(
      !/texto_para_busca\(u\.display_name\)/.test(sql),
      'a listagem passou a casar NOME: ela não aceita texto, e o piso de três caracteres ' +
        'continua sendo da busca',
    );
  });

  void it('NÃO sai região: nem cidade, nem estado, nem bairro na lista de seleção', () => {
    const sql = sqlDaLista();
    const corte = sql.toLowerCase().indexOf(' from "handles"');
    const selecao = sql.slice(0, corte);
    for (const coluna of ['reference_city', 'reference_state', 'reference_neighborhood', 'reference_postal_code'])
      assert.ok(
        !selecao.includes(coluna),
        `\`${coluna}\` saiu na resposta. A única região em jogo é a de QUEM OLHA, e ela ` +
          'já volta em `Me.reference_area`; a de cada pessoa da lista seria o item 1 do ' +
          'ADR-0010 saindo por porta nova',
      );
  });

  void it('O BAIRRO NÃO ORDENA, e isso é um caso e não um detalhe', () => {
    const sql = sqlDaLista();
    assert.match(
      sql,
      /order by "u"\."display_name" asc, "h"\."handle" asc/i,
      'a ordem é nome e depois apelido, a MESMA da busca',
    );
    assert.ok(
      !/order by[\s\S]*reference_neighborhood/i.test(sql),
      'ordenar por bairro entregaria o bairro PELA POSIÇÃO, mesmo sem nenhum campo de ' +
        'bairro na resposta — e `reference_neighborhood` é texto livre sem forma canônica, ' +
        'então o agrupamento estaria errado além de apertado',
    );
    assert.ok(
      !sql.includes('reference_neighborhood'),
      '`reference_neighborhood` entrou na consulta em algum lugar',
    );
  });

  void it('NÃO há segunda consulta para o total: `count(*) OVER ()`', () => {
    const sql = sqlDaLista();
    assert.match(sql, /count\(\*\) OVER \(\)/i);
    assert.equal(
      (sql.match(/from "handles"/gi) ?? []).length,
      1,
      'duas consultas seriam duas chances de a página e o total discordarem sem nada acusar',
    );
  });

  void it('a página é paginada por `limit`/`offset`, e a página 1 não tem deslocamento', () => {
    const { sql, parameters } = construtorDaListaDaRegiao(semBanco, QUEM_VE, 3, 20);
    assert.match(sql, /limit \$\d+ offset \$\d+/i);
    assert.ok(parameters.includes(20), 'o teto da página não chegou como parâmetro');
    assert.ok(parameters.includes(40), 'o deslocamento da página 3 com teto 20 é 40');
    assert.ok(
      consulta().parameters.includes(0),
      'a página 1 tem deslocamento 0',
    );
  });
});
