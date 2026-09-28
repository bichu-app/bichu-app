/**
 * Iscas permanentes das duas verificacoes que os testes de tela usam. Se uma
 * delas deixar de acusar o caso ruim, este arquivo reprova, e os testes de
 * tela que dependem dela deixam de valer por confianca.
 */
import { describe, expect, it } from 'vitest';

import type { Requisicao } from '../../src/rede/duble/servidor.ts';
import { observacoesComContatoEnviadas, sensiveisSemReautenticacao } from './verificacoes.ts';

const req = (metodo: string, caminho: string, cabecalhos: Record<string, string> = {}, corpo?: unknown): Requisicao => ({
  metodo,
  caminho: `/v1${caminho}`,
  consulta: new URLSearchParams(),
  cabecalhos,
  corpo,
});

const REAUTH = (scope: string, password = 'uma senha') => req('POST', '/admin/auth/reauth', {}, { password, scope });

describe('isca: cancelar e remover sem a senha de reautenticação', () => {
  it('REPROVA cancelar sem X-Admin-Reauth-Token', () => {
    const falhas = sensiveisSemReautenticacao([req('POST', '/admin/network/events/x/cancellation', { 'if-match': '"1"' }, { note: 'chuva' })]);
    expect(falhas).toEqual(['POST /v1/admin/network/events/x/cancellation sem X-Admin-Reauth-Token']);
  });

  it('REPROVA remover com um token que não veio de uma senha', () => {
    const falhas = sensiveisSemReautenticacao([req('DELETE', '/admin/network/events/x', { 'x-admin-reauth-token': 'inventado' })]);
    expect(falhas).toHaveLength(1);
  });

  it('REPROVA remover com a senha vazia na reautenticação', () => {
    const falhas = sensiveisSemReautenticacao([
      REAUTH('network_event_removal', ''),
      req('DELETE', '/admin/network/events/x', { 'x-admin-reauth-token': 't' }),
    ]);
    expect(falhas).toHaveLength(1);
  });

  it('REPROVA reaproveitar a reautenticação de outro escopo, ou a mesma duas vezes', () => {
    expect(
      sensiveisSemReautenticacao([REAUTH('network_event_cancellation'), req('DELETE', '/admin/network/events/x', { 'x-admin-reauth-token': 't' })]),
    ).toHaveLength(1);
    expect(
      sensiveisSemReautenticacao([
        REAUTH('network_event_removal'),
        req('DELETE', '/admin/network/events/x', { 'x-admin-reauth-token': 't' }),
        req('DELETE', '/admin/network/events/y', { 'x-admin-reauth-token': 't' }),
      ]),
    ).toHaveLength(1);
  });

  it('aprova o caminho certo', () => {
    expect(
      sensiveisSemReautenticacao([
        REAUTH('network_event_cancellation'),
        req('POST', '/admin/network/events/x/cancellation', { 'x-admin-reauth-token': 't' }),
        REAUTH('network_event_removal'),
        req('DELETE', '/admin/network/events/x', { 'x-admin-reauth-token': 't2' }),
      ]),
    ).toEqual([]);
  });
});

describe('isca: observação com telefone chegando ao servidor', () => {
  it('REPROVA criação com telefone nas observações', () => {
    expect(observacoesComContatoEnviadas([req('POST', '/admin/network/events', {}, { notes: 'Liga 11 98765-4321' })])).toHaveLength(1);
  });
  it('REPROVA edição com telefone nas observações', () => {
    expect(observacoesComContatoEnviadas([req('PATCH', '/admin/network/events/x', {}, { notes: 'zap 11987654321' })])).toHaveLength(1);
  });
  it('aprova observação limpa e ausência de observação', () => {
    expect(
      observacoesComContatoEnviadas([
        req('POST', '/admin/network/events', {}, { notes: 'Ponto de encontro ao lado do lago.' }),
        req('PATCH', '/admin/network/events/x', {}, { title: 'Outro' }),
      ]),
    ).toEqual([]);
  });
});
