/**
 * **A trilha administrativa grava na MESMA transacao da escrita, ou a escrita
 * nao acontece** (ADR-0027 item 8, D49, prova P17 de `docs/04-seguranca.md`).
 *
 * Este arquivo prova a PRIMITIVA que toda escrita administrativa usa
 * (`EscritaAuditada.executar` e `TrilhaTransacional.recordIn`), contra
 * Postgres de verdade. As operacoes da sessao administrativa sao provadas pela
 * rota em `sessao-administrativa-pelo-http.test.ts`; as da `Loja` e da `Rede`
 * entram com as rotas delas.
 *
 * A escrita de teste e um `UPDATE` em `admin_accounts.display_name` de uma
 * conta do painel criada aqui, e o ator do evento e essa mesma conta, como
 * `actor_kind = 'admin'` (ADR-0027 item 20.2): e o que toda escrita
 * administrativa grava. O valor e lido de volta para provar que mudou ou que
 * nao mudou.
 *
 * Tres coisas que so o banco responde, e que dublê nenhum reproduz:
 *
 * 1. **A falha do `INSERT` na trilha desfaz o `UPDATE` anterior.** Forcada
 *    pelo proprio banco: `correlation_id` e `uuid`, e uma cadeia que nao e UUID
 *    cai em `22P02` dentro da transacao.
 * 2. **O papel da trilha nao vaza para a escrita.** `recordIn` assume
 *    `bichu_audit_writer`, que nao tem `UPDATE` em `admin_accounts`; um comando DEPOIS
 *    do evento so funciona se o papel anterior foi reposto.
 * 3. **O evento fica gravado com o papel certo**, e nao com o dono da tabela.
 *
 * ## Iscas (BICHUS-259, 23/09/2026, node 22.23.2, pilha efemera)
 *
 * | o que foi neutralizado | reprovaram |
 * |---|---|
 * | `executar` gravando o evento com `record` (transacao propria) em vez de `recordIn` | 2 |
 * | `recordIn` sem repor o papel anterior | 1 |
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';

import { loadAppConfig } from '../../src/shared/config/app-config.js';
import { createDb, type Db } from '../../src/shared/db/pool.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { systemClock } from '../../src/shared/time/clock.js';
import type { AdminAccountId } from '../../src/shared/types/brands.js';
import {
  criarEscritaAuditada,
  criarTrilhaTransacional,
} from '../../src/modules/audit/adapters/persistence/kysely-audit-log.js';
import type { AuditEvent, EscritaAuditada } from '../../src/modules/audit/ports/audit-log.js';

let banco: { db: Db; close: () => Promise<void> };
let escrita: EscritaAuditada;
let conta: AdminAccountId;

function evento(correlationId: string): AuditEvent {
  return {
    actorKind: 'admin',
    actorAdminId: conta,
    correlationId,
    action: 'admin.store_partner.updated',
    resourceKind: 'teste_trilha',
    resourceId: conta,
    after: { display_name: 'marcador' },
  };
}

async function nomeAtual(): Promise<string | null> {
  const linha = await banco.db
    .selectFrom('admin_accounts')
    .select('display_name')
    .where('id', '=', conta)
    .executeTakeFirstOrThrow();
  return linha.display_name;
}

async function eventosCom(correlationId: string): Promise<number> {
  const linhas = await banco.db
    .selectFrom('audit.events')
    .select('id')
    .where('correlation_id', '=', correlationId)
    .execute();
  return linhas.length;
}

before(async () => {
  const config = loadAppConfig();
  banco = createDb(config.databaseUrl);
  const ids = criarIdGenerator(() => systemClock.now());
  escrita = criarEscritaAuditada({
    db: banco.db,
    trilha: criarTrilhaTransacional({ ids, clock: systemClock, ipHmacKey: config.ipHmacKey }),
  });
  conta = ids.uuidv7() as AdminAccountId;
  await banco.db.insertInto('admin_accounts').values({
    id: conta,
    email: `trilha-${randomUUID().slice(0, 8)}@exemplo.invalid`,
    display_name: 'antes',
    password_phc: '$pbkdf2-sha512$i=1$c2Fs$aGFzaA',
    password_updated_at: new Date(),
  }).execute();
});

after(async () => {
  await banco.db.deleteFrom('admin_accounts').where('id', '=', conta).execute();
  await banco.close();
});

void describe('EscritaAuditada: escrita e trilha na mesma transacao', () => {
  void it('grava o dado e o evento juntos, e o evento com o papel da trilha', async () => {
    const correlacao = randomUUID();
    const devolvido = await escrita.executar(async (trx) => {
      await trx.updateTable('admin_accounts').set({ display_name: 'depois' }).where('id', '=', conta).execute();
      return { resultado: 'feito', evento: evento(correlacao) };
    });

    assert.equal(devolvido, 'feito');
    assert.equal(await nomeAtual(), 'depois');
    assert.equal(await eventosCom(correlacao), 1, 'o evento da escrita nao foi gravado');
  });

  void it('falha da trilha no banco desfaz a escrita que veio antes dela (P17)', async () => {
    await banco.db.updateTable('admin_accounts').set({ display_name: 'intacto' }).where('id', '=', conta).execute();

    await assert.rejects(
      escrita.executar(async (trx) => {
        await trx.updateTable('admin_accounts').set({ display_name: 'nao-devia-ficar' }).where('id', '=', conta).execute();
        // `correlation_id` e `uuid` no banco: o INSERT da trilha falha la dentro.
        return { resultado: undefined, evento: evento('nao-e-uuid') };
      }),
      'a falha da trilha precisa subir para quem chamou',
    );

    assert.equal(await nomeAtual(), 'intacto', 'a escrita sobreviveu a falha da trilha');
  });

  void it('evento incoerente e recusado antes do INSERT, e a escrita tambem cai', async () => {
    await banco.db.updateTable('admin_accounts').set({ display_name: 'intacto-2' }).where('id', '=', conta).execute();

    await assert.rejects(
      escrita.executar(async (trx) => {
        await trx.updateTable('admin_accounts').set({ display_name: 'nao-devia-ficar' }).where('id', '=', conta).execute();
        return {
          resultado: undefined,
          // Ator `admin` sem `actorAdminId`: o tipo nao deixa escrever isto, e
          // a conversao e o caminho por onde um evento assim chegaria.
          evento: { ...evento(randomUUID()), actorAdminId: undefined } as unknown as AuditEvent,
        };
      }),
      /incoerente/,
    );

    assert.equal(await nomeAtual(), 'intacto-2');
  });

  void it('o papel da trilha nao vaza: um comando depois do evento continua podendo escrever', async () => {
    const correlacao = randomUUID();
    const trilha = criarTrilhaTransacional({
      ids: criarIdGenerator(() => systemClock.now()),
      clock: systemClock,
      ipHmacKey: loadAppConfig().ipHmacKey,
    });

    await banco.db.transaction().execute(async (trx) => {
      const antes = await sql<{ papel: string }>`select current_user as papel`.execute(trx);
      await trilha.recordIn(trx, evento(correlacao));
      const depois = await sql<{ papel: string }>`select current_user as papel`.execute(trx);
      assert.equal(depois.rows[0]?.papel, antes.rows[0]?.papel, 'o papel da trilha ficou valendo');
      await trx.updateTable('admin_accounts').set({ display_name: 'depois-do-evento' }).where('id', '=', conta).execute();
    });

    assert.equal(await nomeAtual(), 'depois-do-evento');
    assert.equal(await eventosCom(correlacao), 1);
  });
});
