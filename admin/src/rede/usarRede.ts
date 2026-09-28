import { useMemo } from 'react';

import { useSessao } from '../sessao/ProvedorDeSessao.tsx';
import { criarApiDaRede, type Reautenticar } from './api/redeApi.ts';

/** As chamadas da Rede sobre o cliente e a reautenticacao da sessao do painel. */
export function useRede() {
  const sessao = useSessao();
  const cliente = sessao.api;
  const rede = useMemo(() => criarApiDaRede({ cliente }), [cliente]);
  const reautenticar = useMemo<Reautenticar>(() => (senha, escopo) => sessao.reautenticar(senha, escopo), [sessao]);
  return { rede, reautenticar, cliente };
}

/** O `If-Match` de um recurso lido: o ETag da resposta, ou a versao no formato dele. */
export function etagDe(e: { version: number }, doCabecalho?: string | null): string {
  return doCabecalho ?? `"${e.version}"`;
}
