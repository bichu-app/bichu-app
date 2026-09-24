/**
 * As acoes da trilha administrativa contra o `x-audit` do contrato, e a
 * montagem do evento.
 *
 * `ACOES_ADMINISTRATIVAS` e escrita a mao, e o contrato tambem. Os dois
 * sentidos importam: `x-audit.action` que nao esta na lista faria a primeira
 * escrita daquela operacao lancar em producao; valor na lista que nenhuma
 * operacao declara e nenhum evento interno usa e acao que ninguem grava.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';

import { carregarContrato } from '../../../shared/http/contract.js';
import type { UserId } from '../../../shared/types/brands.js';
import { ACOES_ADMINISTRATIVAS } from './audit-log.js';
import { eventoAdministrativo } from './trilha-administrativa.js';

/**
 * As duas acoes que o item 8 do ADR-0027 manda gravar e que nao sao escrita de
 * operacao nenhuma: o login recusado e a recusa da guarda do prefixo.
 */
const ACOES_SEM_OPERACAO = ['admin.session.denied', 'admin.guard.denied'];

function acoesDoContrato(): string[] {
  const contrato = carregarContrato(resolve(process.cwd(), 'api/openapi.yaml'));
  const acoes: string[] = [];
  for (const operacao of contrato.operacoes.values()) {
    const trilha = operacao.raw['x-audit'] as { action?: unknown } | undefined;
    if (trilha !== undefined && typeof trilha.action === 'string') acoes.push(trilha.action);
  }
  return acoes;
}

void describe('ACOES_ADMINISTRATIVAS contra o x-audit do contrato', () => {
  void it('todo x-audit.action do contrato esta na lista', () => {
    const doContrato = acoesDoContrato();
    assert.ok(doContrato.length >= 10, `so ${String(doContrato.length)} x-audit lidos do contrato`);
    const fora = doContrato.filter((acao) => !(ACOES_ADMINISTRATIVAS as readonly string[]).includes(acao));
    assert.deepEqual(fora, []);
  });

  void it('todo valor da lista e declarado por uma operacao, ou e um dos eventos sem operacao', () => {
    const doContrato = new Set(acoesDoContrato());
    const orfas = ACOES_ADMINISTRATIVAS.filter(
      (acao) => !doContrato.has(acao) && !ACOES_SEM_OPERACAO.includes(acao),
    );
    assert.deepEqual(orfas, []);
  });
});

void describe('eventoAdministrativo', () => {
  const ator = {
    userId: '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f' as UserId,
    ip: '203.0.113.9',
    correlationId: '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e70',
    sessao: '0011223344556677',
  };

  void it('monta o evento com a sessao e a superficie, que o trabalho nao consegue sobrescrever', () => {
    const evento = eventoAdministrativo(
      { action: 'admin.store_item.created', resourceKind: 'store_item' },
      ator,
      { resourceId: 'id-interno', after: { title: 'x' }, metadata: { surface: 'app', session: 'outra', extra: 1 } },
    );
    assert.equal(evento.actorKind, 'user');
    assert.equal(evento.actorUserId, ator.userId);
    assert.equal(evento.action, 'admin.store_item.created');
    assert.equal(evento.resourceId, 'id-interno');
    assert.deepEqual(evento.metadata, { extra: 1, surface: 'admin', session: '0011223344556677' });
  });

  void it('acao fora da lista lanca, em vez de gravar uma acao que ninguem declarou', () => {
    assert.throws(
      () => eventoAdministrativo({ action: 'admin.qualquer.coisa', resourceKind: 'x' }, ator, { resourceId: 'y' }),
      /ACOES_ADMINISTRATIVAS/,
    );
  });
});
