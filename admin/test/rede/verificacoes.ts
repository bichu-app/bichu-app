/**
 * Verificacoes sobre o registro do duble, usadas pelos testes de tela e
 * cobradas por iscas em `iscas.test.ts`: cada uma tem o caso que PRECISA
 * reprovar guardado no repositorio, para que uma verificacao que parou de
 * enxergar nao termine verde.
 */
import { achadosNasObservacoes } from '../../src/rede/dominio/observacoes.ts';
import type { Requisicao } from '../../src/rede/duble/servidor.ts';

const ESCOPO_DA_OPERACAO: Array<[RegExp, string, string]> = [
  [/\/admin\/network\/events\/[^/]+$/, 'DELETE', 'network_event_removal'],
  [/\/admin\/network\/events\/[^/]+\/cancellation$/, 'POST', 'network_event_cancellation'],
  [/\/admin\/network\/events\/[^/]+\/relocation$/, 'POST', 'network_event_relocation'],
  [/\/admin\/network\/events\/[^/]+\/access$/, 'POST', 'network_event_access_change'],
];

/**
 * Operacao sensivel sem senha: nao levou `X-Admin-Reauth-Token`, ou nao foi
 * precedida, desde a operacao sensivel anterior, de uma reautenticacao com
 * senha nao vazia no escopo dela.
 */
export function sensiveisSemReautenticacao(registro: readonly Requisicao[]): string[] {
  const falhas: string[] = [];
  let escoposDisponiveis: string[] = [];
  for (const r of registro) {
    if (r.metodo === 'POST' && r.caminho.endsWith('/admin/auth/reauth')) {
      const corpo = r.corpo as { password?: string; scope?: string; scopes?: string[] } | undefined;
      // Cada reautenticacao rotaciona a sessao: o que a anterior liberou deixa de valer.
      escoposDisponiveis = [];
      if (corpo?.password) escoposDisponiveis.push(...(corpo.scopes ?? (corpo.scope ? [corpo.scope] : [])));
      continue;
    }
    const regra = ESCOPO_DA_OPERACAO.find(([re, metodo]) => r.metodo === metodo && re.test(r.caminho));
    if (!regra) continue;
    const [, , escopo] = regra;
    if (!r.cabecalhos['x-admin-reauth-token']) falhas.push(`${r.metodo} ${r.caminho} sem X-Admin-Reauth-Token`);
    else if (!escoposDisponiveis.includes(escopo)) falhas.push(`${r.metodo} ${r.caminho} sem reautenticacao com senha no escopo ${escopo}`);
    escoposDisponiveis = escoposDisponiveis.filter((e) => e !== escopo);
  }
  return falhas;
}

/** Criacao ou edicao que levou observacao com telefone (ou outro contato) ao servidor. */
export function observacoesComContatoEnviadas(registro: readonly Requisicao[]): string[] {
  return registro
    .filter((r) => (r.metodo === 'POST' && /\/admin\/network\/events$/.test(r.caminho)) || (r.metodo === 'PATCH' && /\/admin\/network\/events\/[^/]+$/.test(r.caminho)))
    .map((r) => (r.corpo as { notes?: unknown } | undefined)?.notes)
    .filter((n): n is string => typeof n === 'string' && achadosNasObservacoes(n).length > 0);
}
