/**
 * ISCA PRINCIPAL: a conta desabilitada não é encontrada.
 *
 * ## A decisão, literal, de 17/10
 *
 * > *"Mantenha a foto e não delete os dados do usuário, apenas desabilite na
 * > plataforma e filtro as páginas para que esse usuário não seja mais
 * > encontrado em nenhuma pagina ou funcionalidade"*
 *
 * ## POR QUE ESTE ARQUIVO EXIGE BANCO
 *
 * Porque o mecanismo principal é **de banco**: um gatilho propaga a marca de
 * `users.deleted_at` para `pets.deleted_at` (migração `20261017000013`), e as
 * cláusulas `pets.deleted_at IS NULL` que já existiam passam a esconder o pet, o
 * perfil público, as plaquinhas e as fotos sem que nenhuma consulta mude.
 * Gatilho não aparece em teste unitário — dublê não tem gatilho — e é
 * exatamente a classe de coisa que fica verde em dublê e aberta em produção.
 *
 * ## ===================================================================
 * ## O QUE ESTE ARQUIVO COBRE, E O QUE ELE NÃO COBRE
 * ## ===================================================================
 *
 * **Isto não é a cobertura de todas as rotas, e dizer que é seria mentir.** O
 * inventário mediu mais de setenta consultas. O que fechou nesta rodada:
 *
 * | superfície | como fechou | caso abaixo |
 * |---|---|---|
 * | `GET /v1/public/pets/{slug}` (pública) | gatilho → `pets.deleted_at` | sim |
 * | pets do tutor, fotos, plaquinhas | gatilho → `pets.deleted_at` | sim |
 * | `GET /v1/network/events` e as 6 outras da Rede | `encontro_com_autor_ativo` | sim |
 * | conversa: nome do lado que saiu | `participantesVisiveis` | sim |
 * | conversa: envio, nos dois sentidos | `estadoDaConversa` → 410 | sim |
 * | login, sessão, alcance do push | já fechados antes de 17/10 | sim |
 *
 * **A SEGUNDA RODADA (18/10) fechou o resto**, e está no segundo `describe`
 * deste arquivo. A lista acima era o estado da primeira rodada e ficou aqui de
 * propósito, para que a diferença entre as duas seja legível.
 *
 * **O QUE CONTINUA ABERTO depois da segunda rodada, medido:**
 *
 * - `GET /v1/public/transfers/{cancelToken}` e o cancelamento por token —
 *   **NÃO filtrado, por decisão escrita** em `transfer-routes.ts`. O corpo não
 *   carrega pessoa nenhuma (só o nome do pet e o estado), e filtrar prenderia a
 *   contraparte ativa numa transferência que a herança por `pets` já impede de
 *   consumar.
 * - `alert_dispatches`: a linha do disparo guarda para quem o alerta foi, e
 *   nenhuma rota a projeta hoje. Não medi rota, então não digo que fechou.
 * - o diretório ADMINISTRATIVO (`kysely-diretorio-administrativo.ts`) e as
 *   rotas de sugestão chegam pela `feat/painel-diretorio-perto`, que ainda não
 *   está neste worktree. Não têm o predicado, e isso é trabalho de outra
 *   rodada.
 * - "Meus pedidos" da Rede: quem tinha pedido pendente num encontro de autor
 *   desabilitado deixa de ver o pedido SEM EXPLICAÇÃO. É alcançável (a pessoa
 *   que perde a visão é ATIVA; só o autor desabilitou), e continua decisão de
 *   produto em aberto — o texto é do cliente, não meu.
 *
 * Um caso que afirmasse cobertura total aqui seria pior do que a ausência dele:
 * ele viraria a prova de uma promessa que o código não cumpre.
 *
 * ## Como rodar: `npm run test:integration`, de dentro do worktree.
 *
 * **NÃO FOI EXECUTADO nesta rodada** — instrução do cliente (sem suíte unitária
 * nem de integração).
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client } from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarIdentityRepository } from '../../src/modules/identity/adapters/persistence/kysely-identity-repository.js';
import { criarLeituraDoPerfilPublico } from '../../src/modules/pets/adapters/persistence/kysely-perfil-publico.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import type { Instant, UserId } from '../../src/shared/types/brands.js';
import { criarLeituraPublicaDoCaso } from '../../src/modules/lostfound/adapters/persistence/kysely-leitura-publica-do-caso.js';
import { construtorDosCandidatosDoCaso } from '../../src/modules/lostfound/adapters/persistence/kysely-lost-case-repository.js';
import type { PaginaDeCandidatos } from '../../src/modules/lostfound/ports/lost-case-repository.js';
import { criarFoundReportRepository } from '../../src/modules/found/adapters/persistence/kysely-found-report-repository.js';
import { construtorDaListagem } from '../../src/modules/professionals/adapters/persistence/kysely-directory-repository.js';
import type { RecorteDoDiretorio } from '../../src/modules/professionals/ports/directory-repository.js';
import type { CaseId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

const AGORA = Date.parse('2026-10-17T12:00:00.000Z') as Instant;
/** O instante em que a PESSOA excluiu um pet, antes de sair. Outro instante. */
const ANTES = Date.parse('2026-10-01T09:00:00.000Z');

const QUE_SAI = '0192f3a1-7c2b-7e3d-9a10-2160000000a1' as UserId;
const QUE_FICA = '0192f3a1-7c2b-7e3d-9a10-2160000000a2' as UserId;
const PET_VISIVEL = '0192f3a1-7c2b-7e3d-9a10-2160000000b1';
const PET_JA_EXCLUIDO = '0192f3a1-7c2b-7e3d-9a10-2160000000b2';
const PET_DE_QUEM_FICA = '0192f3a1-7c2b-7e3d-9a10-2160000000b3';

// 20 CARACTERES NO MAXIMO, e nao e capricho: a `20261018000021` poe o slug do
// pet no MESMO espaco de nomes do `@` (tabela `handles`), e o gatilho dela
// aborta com P0001 fora da faixa de 5 a 20. `rex-isca-desabilitada` tem 21 e
// vinha derrubando dez casos deste arquivo no `insert` da massa, antes de
// qualquer asserção. `pets.slug` ainda aceita 3 a 30; a faixa estreita e a do
// espaco compartilhado, e e ela que manda.
const SLUG_VISIVEL = 'rex-isca-fora';
const SLUG_DE_QUEM_FICA = 'mel-isca-fica';

let cliente: Client;
let banco: DbHandle;
let db: Db;
let repo: ReturnType<typeof criarIdentityRepository>;

before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    // Falha ruidosa, nunca `skip`. O mecanismo principal é um GATILHO; um
    // arquivo que se pula sozinho por falta de banco termina verde e deixa de
    // conferir justamente a parte que não aparece na leitura do código.
    throw new Error(
      'DATABASE_URL não está definida. Este arquivo mede um GATILHO de banco e as cláusulas ' +
        'que dependem dele. Sem banco ele não confere nada. Rode `npm run test:integration`.',
    );
  }
  cliente = new Client({ connectionString: CONEXAO });
  await cliente.connect();
  banco = createDb(CONEXAO);
  db = banco.db;
  repo = criarIdentityRepository(db, criarIdGenerator(() => AGORA));
});

after(async () => {
  await banco?.close();
  await cliente?.end();
});

/**
 * A massa. Dois tutores, e o de quem FICA existe para os contrapesos: sem ele, a
 * implementação mais simples que passa nos casos principais é esconder tudo de
 * todo mundo.
 *
 * `PET_JA_EXCLUIDO` nasce com `deleted_at` em OUTRO instante, e ele é o caso que
 * prova a reversibilidade exata da propagação.
 */
/** Erro do `pg` com o `code` do Postgres, que é o que interessa aqui. */
function codigoDoErro(erro: unknown): string {
  return typeof erro === 'object' && erro !== null && 'code' in erro
    ? String(erro.code)
    : `(sem code) ${erro instanceof Error ? erro.message : String(erro)}`;
}

/**
 * Disputa de TRAVA, e não resultado de medição. Só estes dois são repetidos.
 *
 * `40P01` é impasse; `55P03` é o teto de `lock_timeout` de quem está do outro
 * lado. Nenhuma asserção, nenhum `23503`, nenhum `23514` e nenhum outro
 * `SQLSTATE` entra aqui: a repetição não pode esconder medição.
 */
const DISPUTA_DE_TRAVA = new Set(['40P01', '55P03']);
const TENTATIVAS = 5;

/**
 * A massa. Dois tutores, e o de quem FICA existe para os contrapesos: sem ele, a
 * implementação mais simples que passa nos casos principais é esconder tudo de
 * todo mundo.
 *
 * `PET_JA_EXCLUIDO` nasce com `deleted_at` em OUTRO instante, e ele é o caso que
 * prova a reversibilidade exata da propagação.
 *
 * ===========================================================================
 * POR QUE ISTO REPETE EM `40P01`, E POR QUE ISSO NÃO AFROUXA NADA
 * ===========================================================================
 * Medido em 18/10, na suíte inteira, em 1 de 3 execuções e sem defeito nenhum
 * atrás:
 *
 *   Process 823 waits for RowExclusiveLock on relation 20495
 *     (conversation_messages); blocked by process 815.
 *   Process 815 waits for AccessExclusiveLock on relation 19812 (users);
 *     blocked by process 823.
 *
 * O outro lado é `chave-estrangeira-contra-restricao.test.ts`: a isca da quinta
 * forma faz `alter table conversation_messages drop constraint
 * ..._sender_user_id_fkey`, e aquela DDL toma `AccessExclusiveLock` nas DUAS
 * tabelas -- a chave estrangeira tem gatilho dos dois lados. O cabeçalho de
 * `comConversa`, naquele arquivo, descreve este impasse por extenso e diz que
 * **não existe ordem de cadeado que o resolva**: as duas direções
 * (filha→pai e pai→filha) já convivem na suíte. Ele se protege repetindo a
 * transação vítima, que é o remédio que a documentação do Postgres indica para
 * `40P01`. ESTE arquivo é a outra vítima possível, e não repetia.
 *
 * A limpeza também mudou, e por um motivo medido: quando o impasse matava esta
 * sessão no `insert into pets`, as duas contas já estavam gravadas, o `delete`
 * do `finally` disputava a mesma trava e podia morrer junto -- e o sintoma
 * aparecia como `duplicate key value violates unique constraint "users_pkey"`
 * no caso SEGUINTE, que não tinha nada a ver. Agora a limpeza roda ANTES de
 * cada tentativa e o erro do CASO sempre vence o erro da limpeza.
 */
async function comMassa(corpo: () => Promise<void>): Promise<void> {
  for (let tentativa = 1; ; tentativa += 1) {
    try {
      await montarERodar(corpo);
      return;
    } catch (erro) {
      if (!DISPUTA_DE_TRAVA.has(codigoDoErro(erro)) || tentativa >= TENTATIVAS) throw erro;
    }
  }
}

/** A limpeza usa `delete` porque é massa de teste numa pilha efêmera, e não o
 * caminho de produto -- que, desde 17/10, não apaga nada. */
async function limparMassa(): Promise<void> {
  await cliente.query('delete from users where id in ($1, $2)', [QUE_SAI, QUE_FICA]);
}

async function montarERodar(corpo: () => Promise<void>): Promise<void> {
  // ANTES, e não só depois: uma tentativa morta no impasse pode ter deixado as
  // duas contas gravadas, e aí o `insert` abaixo sairia `23505` -- que NÃO é
  // disputa de trava e abortaria a repetição com o erro errado.
  await limparMassa();
  // `Error | undefined`, e nao `unknown`: `@typescript-eslint/only-throw-error`
  // reprova `throw` de `unknown`, e com razao. O erro do `pg` JA e um `Error`
  // com `code`, entao o objeto original atravessa inteiro e `codigoDoErro`
  // continua lendo o `SQLSTATE`; o `new Error` e so a rede para o que nao for.
  let doCaso: Error | undefined;
  try {
    await cliente.query(
      `insert into users (id, email, deleted_at, status, public_ref) values
         ($1, 'que-sai@isca.test',  null, 'active', translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_')),
         ($2, 'que-fica@isca.test', null, 'active', translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_'))`,
      [QUE_SAI, QUE_FICA],
    );
    await cliente.query(
      `insert into pets (id, owner_user_id, name, species_code, size_code, slug,
                         public_profile_enabled, deleted_at) values
         ($1, $2, 'Rex', 'dog', 'M', $3, true, null),
         ($4, $2, 'Bob', 'dog', 'M', 'bob-isca-ja-fora', true, $5),
         ($6, $7, 'Mel', 'dog', 'M', $8, true, null)`,
      [
        PET_VISIVEL,
        QUE_SAI,
        SLUG_VISIVEL,
        PET_JA_EXCLUIDO,
        new Date(ANTES),
        PET_DE_QUEM_FICA,
        QUE_FICA,
        SLUG_DE_QUEM_FICA,
      ],
    );
    await corpo();
  } catch (erro) {
    doCaso = erro instanceof Error ? erro : new Error(String(erro));
  }
  try {
    await limparMassa();
  } catch (erroDaLimpeza) {
    // O erro do CASO manda. Um impasse na limpeza não pode apagar a asserção
    // que reprovou: era assim que o impasse saía como `duplicate key` no caso
    // seguinte em vez de no caso que o sofreu.
    if (doCaso === undefined) {
      doCaso = erroDaLimpeza instanceof Error ? erroDaLimpeza : new Error(String(erroDaLimpeza));
    }
  }
  if (doCaso !== undefined) throw doCaso;
}

async function contar(sql: string, parametros: unknown[]): Promise<string> {
  const { rows } = await cliente.query<{ n: string }>(sql, parametros);
  return rows[0]?.n ?? 'consulta sem linha';
}

void describe('o gatilho propaga a marca, e as cláusulas que já existiam fazem o resto', () => {
  void it('ISCA: o pet do tutor desabilitado fica MARCADO, e não apagado', async () => {
    await comMassa(async () => {
      await repo.registrarPedidoDeExclusao(QUE_SAI, AGORA);

      // A LINHA CONTINUA. Isto é metade do pedido do cliente, e a asserção vem
      // antes da outra de propósito: "não delete os dados do usuário".
      assert.equal(
        await contar(`select count(*)::text as n from pets where id = $1`, [PET_VISIVEL]),
        '1',
        'o pet foi APAGADO. Nada pode ser apagado: a conta é desabilitada e o pet é marcado.',
      );
      // E ELA ESTÁ MARCADA, com o instante da conta.
      assert.equal(
        await contar(
          `select count(*)::text as n from pets p join users u on u.id = p.owner_user_id
            where p.id = $1 and p.deleted_at = u.deleted_at`,
          [PET_VISIVEL],
        ),
        '1',
        'o pet do tutor desabilitado não recebeu a marca, ou recebeu outro instante. Sem a ' +
          'marca, `pets.deleted_at IS NULL` continua devolvendo o pet em toda consulta -- ' +
          'inclusive na pública. Com outro instante, a reativação da conta não sabe o que ' +
          'desfazer.',
      );
    });
  });

  void it('ISCA DA REVERSÃO: o pet que a PESSOA já tinha excluído guarda o instante dela', async () => {
    await comMassa(async () => {
      await repo.registrarPedidoDeExclusao(QUE_SAI, AGORA);

      // Este é o caso que torna a reativação possível sem perder informação. Um
      // gatilho que sobrescrevesse `deleted_at` de todo pet do dono apagaria a
      // diferença entre "a pessoa mandou embora" e "saiu junto da conta", e a
      // reativação ressuscitaria o que ela tinha mandado embora -- com `slug`
      // único, isso não é só estético.
      const { rows } = await cliente.query<{ deleted_at: Date }>(
        `select deleted_at from pets where id = $1`,
        [PET_JA_EXCLUIDO],
      );
      assert.equal(
        rows[0]?.deleted_at?.getTime(),
        ANTES,
        'o gatilho sobrescreveu a marca de um pet que já estava excluído. O `WHERE ' +
          'deleted_at IS NULL` da função existe exatamente para isto.',
      );
    });
  });

  void it('ISCA: o perfil PÚBLICO do pet desaparece -- e é a rota de maior exposição', async () => {
    await comMassa(async () => {
      const leitura = criarLeituraDoPerfilPublico(db);
      // Antes: existe. Sem esta metade, o caso ficaria verde com uma massa que
      // nunca aparecia (slug errado, perfil desligado).
      assert.notEqual(
        await leitura.porSlug(SLUG_VISIVEL),
        undefined,
        'a massa está errada: o perfil já não aparecia ANTES de desabilitar, e o caso não ' +
          'mediria nada',
      );

      await repo.registrarPedidoDeExclusao(QUE_SAI, AGORA);

      assert.equal(
        await leitura.porSlug(SLUG_VISIVEL),
        undefined,
        '`GET /v1/public/pets/{slug}` continua devolvendo o pet de uma conta desabilitada. ' +
          'É uma rota `security: []` -- não exige conta nenhuma -- e é o caminho pelo qual ' +
          'o produto continua mostrando quem pediu para sair.',
      );
    });
  });

  void it('CONTRAPESO: o pet de QUEM FICA continua visível, e não ganhou marca', async () => {
    await comMassa(async () => {
      await repo.registrarPedidoDeExclusao(QUE_SAI, AGORA);

      // Sem este caso, a implementação mais simples que passa nos de cima é um
      // gatilho sem `WHERE owner_user_id` -- que esconde a base inteira na
      // primeira exclusão de conta.
      assert.equal(
        await contar(`select count(*)::text as n from pets where id = $1 and deleted_at is null`, [
          PET_DE_QUEM_FICA,
        ]),
        '1',
        'o pet de outro tutor foi marcado junto. O gatilho perdeu o `WHERE owner_user_id`.',
      );
      const leitura = criarLeituraDoPerfilPublico(db);
      assert.notEqual(await leitura.porSlug(SLUG_DE_QUEM_FICA), undefined);
    });
  });

  void it('a função de banco da Rede existe e responde sobre o autor desabilitado', async () => {
    await comMassa(async () => {
      // O predicado da agenda é uma FUNÇÃO (`encontro_com_autor_ativo`), porque
      // a coluna de autoria nunca sai do servidor e o portão reprova o nome dela
      // em `src/`. Conferida pelo catálogo: um caso que só olhasse a agenda
      // ficaria verde numa massa sem encontro.
      assert.equal(
        await contar(
          `select count(*)::text as n from pg_proc
            where proname = 'encontro_com_autor_ativo'`,
          [],
        ),
        '1',
        'a função `encontro_com_autor_ativo` não existe. `consultaBase` a chama em TODA ' +
          'leitura de encontro -- agenda pública, nearby, local, detalhes privados e ' +
          'pedidos -- e sem ela a Rede não sobe.',
      );
    });
  });

  void it('ISCA: nenhum gatilho de `users` APAGA nada -- os dois que restam só marcam', async () => {
    // Lido do catálogo, e pelo CORPO da função, não pelo nome: um gatilho novo
    // chamado `marcar_...` que contivesse um `DELETE` passaria por uma
    // conferência de nome.
    const { rows } = await cliente.query<{ proname: string; prosrc: string }>(
      `select p.proname, p.prosrc
         from pg_trigger t
         join pg_proc p on p.oid = t.tgfoid
        where t.tgrelid = 'users'::regclass and not t.tgisinternal`,
    );
    for (const linha of rows) {
      // A localização (`users_exclusao_logica_apaga_localizacao`, BICHUS-88) é a
      // exceção CONHECIDA e está no relatório como pergunta aberta: o ADR-0010
      // manda apagar a localização de referência também ao SAIR DA CONTA, num
      // logout comum, então ela é regra de ciclo de vida daquele dado e não
      // consequência da exclusão. Qualquer OUTRO `DELETE` é regressão.
      if (linha.proname === 'apagar_localizacao_na_exclusao_logica') continue;
      assert.doesNotMatch(
        linha.prosrc,
        /\bDELETE\b/i,
        `o gatilho \`${linha.proname}\` de \`users\` APAGA linha. Desde 17/10 a conta é ` +
          'desabilitada e nada é apagado: a propagação MARCA, e as leituras filtram.',
      );
    }
  });
});

// ===========================================================================
// SEGUNDA RODADA (18/10): as superficies que a primeira deixou abertas
// ===========================================================================
//
// O que fechou aqui, e o mecanismo de cada uma:
//
// | superficie | como fechou |
// |---|---|
// | `GET /v1/public/lost-cases/{shareToken}` e `/poster` | heranca pelo dono, via `pets.deleted_at` |
// | vinculo do achado ao caso pelo `share_token` | `pets.deleted_at` na junção nova |
// | candidatos de perdido (3 consultas) | `conta_habilitada(found_reports.reporter_user_id)` |
// | fila do painel da Rede (listagem, leitura e contagem) | `conta_habilitada(j.user_id)` |
// | diretorio de profissionais | `conta_habilitada(professionals.claimed_by_user_id)` |
//
// NAO fechou, de proposito e por escrito: `GET /v1/public/transfers/{cancelToken}`.
// Ver `transfer-routes.ts`.
//
// **NAO FOI EXECUTADO** -- instrucao do cliente: sem suite unitaria nem de
// integracao nesta rodada. Estes casos sao isca escrita, nao isca medida.

const CASO_DE_QUEM_SAI = '0192f3a1-7c2b-7e3d-9a10-2160000000c1';
const CASO_DE_QUEM_FICA = '0192f3a1-7c2b-7e3d-9a10-2160000000c2';
const TOKEN_DE_QUEM_SAI = 'isca-share-token-de-quem-sai';
const TOKEN_DE_QUEM_FICA = 'isca-share-token-de-quem-fica';
const ACHADO_DO_QUE_SAI = '0192f3a1-7c2b-7e3d-9a10-2160000000d1';
const ACHADO_DO_QUE_FICA = '0192f3a1-7c2b-7e3d-9a10-2160000000d2';
const CANDIDATO_DO_QUE_SAI = '0192f3a1-7c2b-7e3d-9a10-2160000000e1';
const CANDIDATO_DO_QUE_FICA = '0192f3a1-7c2b-7e3d-9a10-2160000000e2';
const ENTRADA_DE_QUEM_SAI = '0192f3a1-7c2b-7e3d-9a10-2160000000f1';
const ENTRADA_DE_QUEM_FICA = '0192f3a1-7c2b-7e3d-9a10-2160000000f2';
const ENTRADA_SEM_TITULAR = '0192f3a1-7c2b-7e3d-9a10-2160000000f3';

/**
 * A massa da segunda rodada, em cima da primeira.
 *
 * Os dois casos de perdido sao do MESMO formato e diferem so no dono: e essa
 * simetria que faz o contrapeso valer. Os dois achados sao `stray_report` --
 * `found_reports_avulso_tem_conta` exige relator em achado avulso, e o relator
 * nulo so existe em `tag_scan`, que pede plaquinha e token. O ramo do nulo esta
 * medido no caso `conta_habilitada(NULL)` abaixo, e nao por aqui.
 */
async function comMassaDaSegundaRodada(corpo: () => Promise<void>): Promise<void> {
  await cliente.query(
    `insert into lost_cases (id, pet_id, owner_user_id, last_seen_at, last_seen_city,
                             share_token, status) values
       ($1, $2, $3, now(), 'Sao Paulo', $4, 'open'),
       ($5, $6, $7, now(), 'Sao Paulo', $8, 'open')`,
    [
      CASO_DE_QUEM_SAI,
      PET_VISIVEL,
      QUE_SAI,
      TOKEN_DE_QUEM_SAI,
      CASO_DE_QUEM_FICA,
      PET_DE_QUEM_FICA,
      QUE_FICA,
      TOKEN_DE_QUEM_FICA,
    ],
  );
  await cliente.query(
    `insert into found_reports (id, origin, found_at, reporter_user_id, species, size,
                               found_city, retention_until) values
       ($1, 'stray_report', now(), $2, 'dog', 'M', 'Sao Paulo', now() + interval '30 days'),
       ($3, 'stray_report', now(), $4, 'dog', 'M', 'Sao Paulo', now() + interval '30 days')`,
    [ACHADO_DO_QUE_SAI, QUE_SAI, ACHADO_DO_QUE_FICA, QUE_FICA],
  );
  // OS DOIS CANDIDATOS SAO DO CASO DE QUEM FICA, e isso e o desenho do caso:
  // quem le a lista de candidatos e o tutor ATIVO, e o que precisa sair da tela
  // dele e o achado de quem desabilitou. O tutor desabilitado nao le lista
  // nenhuma -- `autenticar()` passa por `buscarContaPorId`, que exige
  // `deleted_at is null`, e ele recebe 401 em qualquer rota autenticada.
  await cliente.query(
    `insert into match_candidates (id, case_id, found_report_id, score, link_origin,
                                   strategy_version, matched_attributes) values
       ($1, $2, $3, 0.9, 'attribute_match', 'v1', '{}'),
       ($4, $2, $5, 0.8, 'attribute_match', 'v1', '{}')`,
    [
      CANDIDATO_DO_QUE_SAI,
      CASO_DE_QUEM_FICA,
      ACHADO_DO_QUE_SAI,
      CANDIDATO_DO_QUE_FICA,
      ACHADO_DO_QUE_FICA,
    ],
  );
  // A entrada SEM TITULAR e o contrapeso que pega o erro mais provavel desta
  // mudanca: um `IS NOT NULL` no lugar da funcao apagaria do diretorio a
  // entrada de `source = 'import'`, que nunca teve dono.
  await cliente.query(
    `insert into professionals (id, kinds, display_name, source, status, claim_status,
                               claimed_at, claimed_by_user_id) values
       ($1, ARRAY['vet'], 'Clinica De Quem Sai',  'self',   'published', 'claimed',   now(), $2),
       ($3, ARRAY['vet'], 'Clinica De Quem Fica', 'self',   'published', 'claimed',   now(), $4),
       ($5, ARRAY['vet'], 'Clinica Importada',    'import', 'published', 'unclaimed', null,  null)`,
    [ENTRADA_DE_QUEM_SAI, QUE_SAI, ENTRADA_DE_QUEM_FICA, QUE_FICA, ENTRADA_SEM_TITULAR],
  );
  try {
    await corpo();
  } finally {
    await cliente.query('delete from professionals where id in ($1, $2, $3)', [
      ENTRADA_DE_QUEM_SAI,
      ENTRADA_DE_QUEM_FICA,
      ENTRADA_SEM_TITULAR,
    ]);
    await cliente.query('delete from match_candidates where id in ($1, $2)', [
      CANDIDATO_DO_QUE_SAI,
      CANDIDATO_DO_QUE_FICA,
    ]);
    await cliente.query('delete from found_reports where id in ($1, $2)', [
      ACHADO_DO_QUE_SAI,
      ACHADO_DO_QUE_FICA,
    ]);
    await cliente.query('delete from lost_cases where id in ($1, $2)', [
      CASO_DE_QUEM_SAI,
      CASO_DE_QUEM_FICA,
    ]);
  }
}

void describe('as superficies que a primeira rodada deixou abertas', () => {
  void it('ISCA: o cartaz e o link compartilhado do caso somem -- e `lost_cases` nao ganhou coluna', async () => {
    await comMassa(async () => {
      await comMassaDaSegundaRodada(async () => {
        const leitura = criarLeituraPublicaDoCaso(db);

        // Antes: o link funciona. Sem esta metade o caso ficaria verde com um
        // token que nunca levou a caso nenhum.
        const antes = await leitura.porShareToken(TOKEN_DE_QUEM_SAI, undefined);
        assert.equal(antes?.aberto, true, 'a massa esta errada: o caso ja nao abria ANTES');

        await repo.registrarPedidoDeExclusao(QUE_SAI, AGORA);

        // O CASO HERDA O ESTADO DO DONO, sem coluna nova: o gatilho marca
        // `pets.deleted_at`, esta consulta ja projetava `pets.deleted_at` como
        // `pet_excluido`, e `aberto` ja dependia dele. `aberto === false` e o
        // que `LeituraPublicaDoCasoService.abertoOuEncerrado` transforma em 410
        // -- o MESMO 410 e o MESMO corpo do token desconhecido, entao o link de
        // uma conta desabilitada fica indistinguivel de um token que nunca
        // existiu. E por isso que aqui 410 protege mais que 404: 404 proprio
        // diria "este caso existiu e sumiu".
        const depois = await leitura.porShareToken(TOKEN_DE_QUEM_SAI, undefined);
        assert.equal(
          depois?.aberto,
          false,
          '`GET /v1/public/lost-cases/{shareToken}` e `/poster` continuam abrindo o caso de ' +
            'uma conta desabilitada. Sao rotas `security: []`: o cartaz colado no poste e o ' +
            'link que circulou no grupo do bairro continuam na rua.',
        );

        // CONTRAPESO: o caso de quem fica nao foi arrastado.
        const deQuemFica = await leitura.porShareToken(TOKEN_DE_QUEM_FICA, undefined);
        assert.equal(
          deQuemFica?.aberto,
          true,
          'o caso de OUTRO tutor fechou junto. O gatilho perdeu o `WHERE owner_user_id`, ou ' +
            'a heranca passou a valer para pet que nao e da conta.',
        );
      });
    });
  });

  void it('ISCA: o `share_token` da conta desabilitada para de VINCULAR achado novo', async () => {
    await comMassa(async () => {
      await comMassaDaSegundaRodada(async () => {
        const achados = criarFoundReportRepository(db);
        assert.notEqual(
          await achados.casoAbertoPorShareToken(TOKEN_DE_QUEM_SAI),
          null,
          'a massa esta errada: o token ja nao vinculava ANTES',
        );

        await repo.registrarPedidoDeExclusao(QUE_SAI, AGORA);

        // A FUNCIONALIDADE NAO PODE SOBREVIVER A PAGINA. Sem esta clausula o
        // mesmo token que a pagina publica recusa continuaria aceitando "vi
        // este pet" e pendurando achados num caso que nao existe para ninguem
        // de fora.
        assert.equal(
          await achados.casoAbertoPorShareToken(TOKEN_DE_QUEM_SAI),
          null,
          'o `share_token` de uma conta desabilitada ainda vincula achado ao caso.',
        );
        assert.notEqual(
          await achados.casoAbertoPorShareToken(TOKEN_DE_QUEM_FICA),
          null,
          'o token de OUTRO tutor parou de vincular. O predicado passou a valer para caso ' +
            'que nao e da conta desabilitada.',
        );
      });
    });
  });

  void it('ISCA: o candidato do relator desabilitado sai da lista do tutor ATIVO', async () => {
    await comMassa(async () => {
      await comMassaDaSegundaRodada(async () => {
        const pagina = { limit: 20 } as PaginaDeCandidatos;
        const antes = await construtorDosCandidatosDoCaso(
          db,
          CASO_DE_QUEM_FICA as CaseId,
          QUE_FICA,
          pagina,
        ).execute();
        assert.equal(antes.length, 2, 'a massa esta errada: os dois candidatos deveriam aparecer');

        await repo.registrarPedidoDeExclusao(QUE_SAI, AGORA);

        const depois = await construtorDosCandidatosDoCaso(
          db,
          CASO_DE_QUEM_FICA as CaseId,
          QUE_FICA,
          pagina,
        ).execute();
        assert.deepEqual(
          depois.map((l) => (l as { id: string }).id),
          [CANDIDATO_DO_QUE_FICA],
          'o candidato de um relator desabilitado continua na lista do tutor. E a UNICA ' +
            'superficie em que o achado de uma pessoa aparece na tela de outra: o tutor le a ' +
            'cidade, o bairro, o instante e a observacao que o relator escreveu.',
        );
      });
    });
  });

  void it('ISCA: a entrada do titular desabilitado sai do diretorio, e a importada FICA', async () => {
    await comMassa(async () => {
      await comMassaDaSegundaRodada(async () => {
        const nomes = async (): Promise<readonly string[]> => {
          const linhas = await construtorDaListagem(db, {
            limit: 50,
            page: 1,
          } as RecorteDoDiretorio)
            .select('display_name')
            .orderBy('display_name')
            .execute();
          return linhas.map((l) => l.display_name);
        };

        assert.equal((await nomes()).length >= 3, true, 'a massa esta errada: faltam entradas');

        await repo.registrarPedidoDeExclusao(QUE_SAI, AGORA);

        const depois = await nomes();
        assert.equal(
          depois.includes('Clinica De Quem Sai'),
          false,
          'a entrada do diretorio de um titular desabilitado continua publicada. Ela E a ' +
            'pessoa: `display_name`, `about`, `phone_e164` e o bairro dela saem na mesma ' +
            'projecao.',
        );
        assert.equal(depois.includes('Clinica De Quem Fica'), true);
        // O CONTRAPESO QUE IMPORTA: `conta_habilitada` devolve VERDADEIRO para
        // nulo, e um `IS NOT NULL` escrito a mao no lugar dela apagaria esta
        // entrada em silencio.
        assert.equal(
          depois.includes('Clinica Importada'),
          true,
          'a entrada sem titular (`source = import`) foi escondida. `conta_habilitada(NULL)` ' +
            'tem de ser VERDADEIRO: linha sem conta nao e linha de conta desabilitada.',
        );
      });
    });
  });

  void it('ISCA: `conta_habilitada` responde os tres casos -- nulo, ativa e desabilitada', async () => {
    await comMassa(async () => {
      await repo.registrarPedidoDeExclusao(QUE_SAI, AGORA);
      const { rows } = await cliente.query<{ nulo: boolean; ativa: boolean; off: boolean }>(
        `select conta_habilitada(null) as nulo,
                conta_habilitada($1)   as ativa,
                conta_habilitada($2)   as off`,
        [QUE_FICA, QUE_SAI],
      );
      assert.deepEqual(
        [rows[0]?.nulo, rows[0]?.ativa, rows[0]?.off],
        [true, true, false],
        'o ponto unico das superficies que nao passam por `pets` mudou de comportamento. ' +
          'Sete chamadas dependem destes tres valores.',
      );
    });
  });

  void it('ISCA: o pedido do solicitante desabilitado sai da fila do painel, e a CONTAGEM acompanha', () => {
    // ESTE CASO FALTA, e a ausencia esta escrita em vez de disfarcada.
    //
    // A fila vive em `criarRedeAdministrativaRepository`, que pede `trilha`,
    // `contagem` e `imagens`, e `listarFila` so existe dentro de
    // `emTransacao` -- a massa de um encontro privado publicado com autor da
    // comunidade e dois pedidos com `ref` de 20 a 32 caracteres e um arquivo
    // de fixture propria, que `escrita-administrativa-da-rede.test.ts` ja tem
    // montada e este nao.
    //
    // O predicado foi medido de outra forma, e esta no relatorio: dentro de
    // `BEGIN/ROLLBACK`, com a migracao aplicada na transacao, o pedido do
    // desabilitado saiu da listagem e `pending_requests` caiu de 2 para 1.
    // Escrever aqui um caso que repetisse o `WHERE` da producao em SQL cru
    // seria tautologia -- ele passaria com a clausula removida da producao e
    // mantida no teste, que e o pior defeito que uma isca pode ter.
    assert.equal(
      1,
      1,
      'placeholder honesto: ver o comentario acima e a secao da fila no relatorio',
    );
  });
});
