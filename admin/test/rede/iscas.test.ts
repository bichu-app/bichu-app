/**
 * Iscas permanentes das duas verificacoes que os testes de tela usam. Se uma
 * delas deixar de acusar o caso ruim, este arquivo reprova, e os testes de
 * tela que dependem dela deixam de valer por confianca.
 */
import { describe, expect, it } from 'vitest';

import type { Requisicao } from '../../src/rede/duble/servidor.ts';
import { observacoesComContatoEnviadas, pedidosDeSenha } from './verificacoes.ts';

const req = (metodo: string, caminho: string, cabecalhos: Record<string, string> = {}, corpo?: unknown): Requisicao => ({
  metodo,
  caminho: `/v1${caminho}`,
  consulta: new URLSearchParams(),
  cabecalhos,
  corpo,
});

const REAUTH = (scope: string, password = 'uma senha') => req('POST', '/admin/auth/reauth', {}, { password, scope });

describe('isca: nenhuma escrita pede senha (07/10)', () => {
  it('REPROVA chamar a reautenticação', () => {
    expect(pedidosDeSenha([REAUTH('network_event_cancellation')])).toHaveLength(1);
  });

  it('REPROVA escrita com X-Admin-Reauth-Token', () => {
    expect(pedidosDeSenha([req('DELETE', '/admin/network/events/x', { 'x-admin-reauth-token': 't', 'if-match': '"1"' })])).toHaveLength(1);
  });

  it('aprova cancelar e remover só com If-Match', () => {
    expect(
      pedidosDeSenha([
        req('POST', '/admin/network/events/x/cancellation', { 'if-match': '"1"' }, { note: 'chuva' }),
        req('DELETE', '/admin/network/events/x', { 'if-match': '"2"' }),
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
