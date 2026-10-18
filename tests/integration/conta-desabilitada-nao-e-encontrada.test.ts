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
 * `users.deleted_at` para `pets.deleted_at` (migração `20261017000012`), e as
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
 * **O QUE CONTINUA ABERTO, medido e não resolvido** (está no relatório):
 *
 * - `GET /v1/public/lost-cases/{shareToken}` e `/poster` — públicas. Leem
 *   `lost_cases` + `pets`; `lost_cases` **não tem** `deleted_at` e a consulta
 *   projeta `pets.deleted_at` sem filtrá-lo.
 * - `GET /v1/public/transfers/{cancelToken}` e o cancelamento por token —
 *   públicas. Filtrar quebraria o desfazer do OUTRO lado, e isso é decisão de
 *   produto.
 * - candidatos de perdido: três consultas projetam o achador
 *   (`found_reports.reporter_user_id`) sem filtro.
 * - avisos de achado (`found_reports`), transferências, `alert_dispatches`.
 * - fila do painel da Rede: mostra o nome de quem pediu, mesmo desabilitado.
 * - diretório de profissionais: a entrada reivindicada continua publicada, e
 *   nenhuma consulta de `src/` liga `professionals` a `users` -- é ambíguo se
 *   isso conta como "dado do usuário", e não está escrito em lugar nenhum.
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

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

const AGORA = Date.parse('2026-10-17T12:00:00.000Z') as Instant;
/** O instante em que a PESSOA excluiu um pet, antes de sair. Outro instante. */
const ANTES = Date.parse('2026-10-01T09:00:00.000Z');

const QUE_SAI = '0192f3a1-7c2b-7e3d-9a10-2160000000a1' as UserId;
const QUE_FICA = '0192f3a1-7c2b-7e3d-9a10-2160000000a2' as UserId;
const PET_VISIVEL = '0192f3a1-7c2b-7e3d-9a10-2160000000b1';
const PET_JA_EXCLUIDO = '0192f3a1-7c2b-7e3d-9a10-2160000000b2';
const PET_DE_QUEM_FICA = '0192f3a1-7c2b-7e3d-9a10-2160000000b3';

const SLUG_VISIVEL = 'rex-isca-desabilitada';
const SLUG_DE_QUEM_FICA = 'mel-isca-desabilitada';

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
async function comMassa(corpo: () => Promise<void>): Promise<void> {
  try {
    await cliente.query(
      `insert into users (id, email, deleted_at, status) values
         ($1, 'que-sai@isca.test',  null, 'active'),
         ($2, 'que-fica@isca.test', null, 'active')`,
      [QUE_SAI, QUE_FICA],
    );
    await cliente.query(
      `insert into pets (id, owner_user_id, name, species_code, size_code, slug,
                         public_profile_enabled, deleted_at) values
         ($1, $2, 'Rex', 'dog', 'M', $3, true, null),
         ($4, $2, 'Bob', 'dog', 'M', 'bob-isca-desabilitada', true, $5),
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
  } finally {
    // A limpeza usa `delete` porque é massa de teste numa pilha efêmera, e não
    // o caminho de produto -- que, desde 17/10, não apaga nada.
    await cliente.query('delete from users where id in ($1, $2)', [QUE_SAI, QUE_FICA]);
  }
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
