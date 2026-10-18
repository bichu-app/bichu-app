/**
 * Bloqueio e denúncia, no banco. **A AUTORIZAÇÃO É A PRÓPRIA CLÁUSULA `WHERE`.**
 *
 * ADR-0021, e aqui ele vale duas vezes:
 *
 * 1. **toda escrita carrega quem chama no `WHERE`** — não existe caminho por
 *    aqui para bloquear em nome de outra pessoa nem para desfazer o bloqueio
 *    dela;
 * 2. **o alvo é resolvido por uma consulta que já exclui o que quem chama não
 *    pode ver** — conta desabilitada, conta inexistente e **conta que bloqueou
 *    quem chama** caem no MESMO `undefined`, que a borda traduz no MESMO `404`.
 *
 * O segundo ponto é o que faz o bloqueio ser silencioso de verdade. Um `403`,
 * ou um `404` com corpo diferente, seria um oráculo: *"ela te bloqueou"*. E
 * descobrir que foi bloqueado é o que gera retaliação.
 *
 * ## `bloqueio_entre(uuid, uuid)` é o PONTO ÚNICO do predicado
 *
 * A pergunta "há bloqueio entre estes dois?" vai aparecer em toda leitura que
 * mostre uma pessoa a outra — perfil, conexão, timeline, vitrine. Ela mora na
 * função SQL da migração `20261018000031`, e não em `N` expressões de Kysely:
 * `N` cópias do predicado são `N` lugares onde uma correção pode faltar, e foi
 * exatamente assim que a fila da `Rede` filtrou em um lugar só.
 *
 * **A função é SIMÉTRICA**, e a simetria é a segunda metade do desenho: quem
 * bloqueou não vê o bloqueado, **e o bloqueado não vê quem bloqueou**.
 *
 * ## `conta_habilitada(uuid)` entra em TODA resolução de alvo
 *
 * Decisão do cliente de 17/10: conta desabilitada *"não é mais encontrada em
 * nenhuma página ou funcionalidade"*. Bloquear ou denunciar uma conta
 * desabilitada é apontar para quem já não está lá, e a resposta é `404`.
 *
 * ## A ocultação imediata NÃO está neste arquivo
 *
 * Ela é filtro de LEITURA, e as leituras que ela filtra são de outras fatias
 * (perfil, timeline, vitrine). O mecanismo está pronto e é das funções
 * `perfil_ocultado_para_quem_denunciou`, `foto_ocultada_para_quem_denunciou` e
 * `publicacao_ocultada_para_quem_denunciou` (`20261018000032`): cada leitura
 * nova acrescenta `AND NOT <função>(<ref>, <leitor>)` ao `WHERE`. Está relatado
 * como o que falta ligar, por tela.
 */
import { sql, type Kysely } from 'kysely';

import type { Database } from '../../../../shared/db/schema.js';
import { comoData } from '../../../../shared/time/clock.js';
import type { IdGenerator } from '../../../../shared/ports/index.js';
import type {
  DesfechoDaEscrita,
  RefPublicoDaPessoa,
  SafetyRepository,
} from '../../ports/safety-repository.js';

/**
 * Resolve o endereço público numa conta **visível para quem chama**.
 *
 * Os três `WHERE` na mesma consulta, e nenhum deles é dispensável:
 *
 * - `public_ref` — o endereço, que é o que a borda recebeu;
 * - `conta_habilitada(users.id)` — conta desabilitada não é encontrada;
 * - `NOT bloqueio_entre(users.id, chamador)` — **se o alvo já bloqueou quem
 *   chama, ele não existe para quem chama**.
 *
 * Devolve `undefined` nos três casos, de propósito: um valor por caso viraria
 * um `404` por caso, e a diferença entre eles é a informação que não queremos
 * dar.
 */
async function contaVisivelPara(
  db: Kysely<Database>,
  ref: RefPublicoDaPessoa,
  chamador: string,
): Promise<string | undefined> {
  const linha = await db
    .selectFrom('users')
    .select('id')
    .where('public_ref', '=', ref)
    .where(sql<boolean>`conta_habilitada(users.id)`)
    .where(sql<boolean>`NOT bloqueio_entre(users.id, ${chamador}::uuid)`)
    .executeTakeFirst();
  return linha?.id;
}

export function criarSafetyRepository(db: Kysely<Database>, ids: IdGenerator): SafetyRepository {
  return {
    async bloquear(chamador, alvo, agora): Promise<DesfechoDaEscrita> {
      // O alvo é resolvido com `bloqueio_entre` no `WHERE`, o que significa que
      // quem JÁ bloqueou quem chama devolve `ausente`. Isso é certo: bloquear
      // de volta quem te bloqueou não tem efeito nenhum (a função é simétrica,
      // o canal já está fechado nos dois sentidos) e a resposta não pode
      // revelar que o bloqueio existe.
      const idDoAlvo = await contaVisivelPara(db, alvo, chamador);
      if (idDoAlvo === undefined) return 'ausente';
      if (idDoAlvo === chamador) return 'eu_mesmo';

      // IDEMPOTENTE. `DO NOTHING` e não `409`: erro aqui contaria a quem chama
      // um estado que ele mesmo escolheu, e obrigaria a tela a ter um segundo
      // caminho para nada.
      await sql`
        INSERT INTO user_blocks (id, blocker_user_id, blocked_user_id, created_at)
        VALUES (${ids.uuidv7()}::uuid, ${chamador}::uuid, ${idDoAlvo}::uuid, ${comoData(agora)}::timestamptz)
        ON CONFLICT (blocker_user_id, blocked_user_id) DO NOTHING
      `.execute(db);

      return 'feito';
    },

    async desbloquear(chamador, alvo): Promise<DesfechoDaEscrita> {
      // `contaVisivelPara` NÃO serve aqui, e a diferença é a razão de esta
      // consulta existir à parte: quem desbloqueia está, por definição, num par
      // em que `bloqueio_entre` é VERDADEIRO — o predicado do bloqueio
      // esconderia justamente a pessoa que se quer desbloquear.
      //
      // `conta_habilitada` também sai: desbloquear alguém que desabilitou a
      // conta é limpar a própria lista, e recusar deixaria a linha presa para
      // sempre.
      const linha = await db
        .selectFrom('users')
        .select('id')
        .where('public_ref', '=', alvo)
        .executeTakeFirst();
      if (linha === undefined) return 'ausente';

      // QUEM CHAMA ESTÁ NO `WHERE` DA PRÓPRIA ESCRITA. Um `DELETE` por alvo
      // sozinho desfaria o bloqueio de outra pessoa.
      await db
        .deleteFrom('user_blocks')
        .where('blocker_user_id', '=', chamador)
        .where('blocked_user_id', '=', linha.id)
        .execute();

      // IDEMPOTENTE: não havia bloqueio é o mesmo `204` de havia.
      return 'feito';
    },

    async denunciarPerfil(chamador, alvo, denuncia, agora): Promise<DesfechoDaEscrita> {
      // O alvo é resolvido ANTES, e com os mesmos três `WHERE`: denunciar quem
      // já bloqueou quem chama devolve o mesmo `404` de pessoa inexistente.
      const idDoAlvo = await contaVisivelPara(db, alvo, chamador);
      if (idDoAlvo === undefined) return 'ausente';
      // O próprio perfil não se denuncia: não há a quem pedir moderação de si
      // mesmo, e o caminho de mudar o próprio perfil é outro e é imediato.
      if (idDoAlvo === chamador) return 'eu_mesmo';

      const quando = comoData(agora);

      // DENUNCIAR DE NOVO SOMA e não duplica, e não é erro: erro ensinaria a
      // quem denuncia que ele já denunciou, o que não é informação dele.
      //
      // `ON CONFLICT (...) WHERE resolved_at IS NULL` casa com o índice
      // PARCIAL: resolvida, a denúncia LIBERA o par, e a próxima cria linha
      // nova — um abuso novo depois da decisão é um item de fila novo.
      //
      // `reason` e `detail` são atualizados: a segunda denúncia costuma ser a
      // mais informada. `created_at` não muda, porque a fila lê por chegada.
      await sql`
        INSERT INTO profile_reports
          (id, subject_user_id, subject_ref, reporter_user_id, reason, detail,
           created_at, last_reported_at)
        VALUES
          (${ids.uuidv7()}::uuid, ${idDoAlvo}::uuid, ${alvo}, ${chamador}::uuid,
           ${denuncia.motivo}, ${denuncia.relato},
           ${quando}::timestamptz, ${quando}::timestamptz)
        ON CONFLICT (subject_ref, reporter_user_id) WHERE resolved_at IS NULL DO UPDATE SET
          reason           = EXCLUDED.reason,
          detail           = EXCLUDED.detail,
          repeat_count     = profile_reports.repeat_count + 1,
          last_reported_at = EXCLUDED.last_reported_at
      `.execute(db);

      return 'feito';
    },

    async denunciarFoto(chamador, chaveDaFoto, denuncia, agora): Promise<DesfechoDaEscrita> {
      // A FOTO é resolvida pela chave da derivada pública, e a consulta leva o
      // dono para duas coisas: recusar a denúncia da própria foto e guardar de
      // quem é a foto, que é o que a fila mostra.
      //
      // `catalog_images.status = 'ready'` no `WHERE`: imagem que não está no ar
      // não tem alvo, e responder outra coisa que `404` revelaria que aquela
      // chave existiu.
      const alvo = await db
        .selectFrom('catalog_images')
        .leftJoin('users', 'users.photo_image_id', 'catalog_images.id')
        .select(['catalog_images.id as imagem', 'users.id as dono'])
        .where('catalog_images.public_key', '=', chaveDaFoto)
        .where('catalog_images.status', '=', 'ready')
        .executeTakeFirst();

      if (alvo === undefined) return 'ausente';
      // A própria foto não se denuncia: o caminho é removê-la, que é imediato.
      if (alvo.dono !== null && alvo.dono === chamador) return 'eu_mesmo';
      // DONO QUE BLOQUEOU QUEM CHAMA: a foto não existe para quem chama, e a
      // resposta é o mesmo `404` de chave inexistente. O predicado vem da
      // função — que é o ponto único dele — e não de uma segunda expressão
      // escrita aqui.
      if (alvo.dono !== null) {
        const { rows } = await sql<{ bloqueado: boolean }>`
          SELECT bloqueio_entre(${alvo.dono}::uuid, ${chamador}::uuid) AS bloqueado
        `.execute(db);
        if (rows[0]?.bloqueado === true) return 'ausente';
      }

      const quando = comoData(agora);

      await sql`
        INSERT INTO photo_reports
          (id, image_id, image_public_key, owner_user_id, reporter_user_id, reason, detail,
           created_at, last_reported_at)
        VALUES
          (${ids.uuidv7()}::uuid, ${alvo.imagem}::uuid, ${chaveDaFoto}, ${alvo.dono}::uuid,
           ${chamador}::uuid, ${denuncia.motivo}, ${denuncia.relato},
           ${quando}::timestamptz, ${quando}::timestamptz)
        ON CONFLICT (image_public_key, reporter_user_id) WHERE resolved_at IS NULL DO UPDATE SET
          reason           = EXCLUDED.reason,
          detail           = EXCLUDED.detail,
          repeat_count     = photo_reports.repeat_count + 1,
          last_reported_at = EXCLUDED.last_reported_at
      `.execute(db);

      return 'feito';
    },

    async denunciarPublicacao(chamador, refDaPublicacao, denuncia, agora): Promise<DesfechoDaEscrita> {
      // **NÃO HÁ CONFERÊNCIA DE ALVO, e a ausência está declarada.**
      // `user_publications` é de outra fatia e não existe nesta base: medido na
      // lista de tabelas de `shared/db/schema.ts`. Conferir contra uma tabela
      // inexistente não compila, e criar a tabela aqui seria construir a fatia
      // de outro agente.
      //
      // O que isso custa, dito por extenso: hoje esta rota aceita um endereço
      // de publicação que não existe, e grava a denúncia dele. Os tetos valem,
      // a ocultação imediata funciona e a fila recebe a linha; o que falta é o
      // `404` de publicação inexistente. É uma linha quando a tabela pousar, e
      // ela está escrita no fim da `20261018000032`.
      const quando = comoData(agora);

      await sql`
        INSERT INTO publication_reports
          (id, publication_ref, reporter_user_id, reason, detail,
           created_at, last_reported_at)
        VALUES
          (${ids.uuidv7()}::uuid, ${refDaPublicacao}, ${chamador}::uuid,
           ${denuncia.motivo}, ${denuncia.relato},
           ${quando}::timestamptz, ${quando}::timestamptz)
        ON CONFLICT (publication_ref, reporter_user_id) WHERE resolved_at IS NULL DO UPDATE SET
          reason           = EXCLUDED.reason,
          detail           = EXCLUDED.detail,
          repeat_count     = publication_reports.repeat_count + 1,
          last_reported_at = EXCLUDED.last_reported_at
      `.execute(db);

      return 'feito';
    },
  };
}
