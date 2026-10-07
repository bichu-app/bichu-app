/**
 * Verificacoes sobre o registro do duble, usadas pelos testes de tela e
 * cobradas por iscas em `iscas.test.ts`: cada uma tem o caso que PRECISA
 * reprovar guardado no repositorio, para que uma verificacao que parou de
 * enxergar nao termine verde.
 */
import { achadosNasObservacoes } from '../../src/rede/dominio/observacoes.ts';
import type { Requisicao } from '../../src/rede/duble/servidor.ts';

/**
 * Pedido de senha que voltou (decisao do cliente de 07/10, ADR-0027 item 23):
 * qualquer chamada a `/admin/auth/reauth` e qualquer escrita que leve
 * `X-Admin-Reauth-Token` reprovam.
 */
export function pedidosDeSenha(registro: readonly Requisicao[]): string[] {
  return registro.flatMap((r) => {
    if (r.caminho.endsWith('/admin/auth/reauth')) return [`${r.metodo} ${r.caminho}: reautenticacao`];
    if (r.cabecalhos['x-admin-reauth-token']) return [`${r.metodo} ${r.caminho} com X-Admin-Reauth-Token`];
    return [];
  });
}

/** Criacao ou edicao que levou observacao com telefone (ou outro contato) ao servidor. */
export function observacoesComContatoEnviadas(registro: readonly Requisicao[]): string[] {
  return registro
    .filter((r) => (r.metodo === 'POST' && /\/admin\/network\/events$/.test(r.caminho)) || (r.metodo === 'PATCH' && /\/admin\/network\/events\/[^/]+$/.test(r.caminho)))
    .map((r) => (r.corpo as { notes?: unknown } | undefined)?.notes)
    .filter((n): n is string => typeof n === 'string' && achadosNasObservacoes(n).length > 0);
}
