import { useMemo } from 'react';

import { useSessao } from '../sessao/ProvedorDeSessao.tsx';
import { criarApiDaRede } from './api/redeApi.ts';

/** As chamadas da Rede sobre o cliente da sessao do painel. */
export function useRede() {
  const sessao = useSessao();
  const cliente = sessao.api;
  const rede = useMemo(() => criarApiDaRede({ cliente }), [cliente]);
  return { rede, cliente };
}

/** O `If-Match` de um recurso lido: o ETag da resposta, ou a versao no formato dele. */
export function etagDe(e: { version: number }, doCabecalho?: string | null): string {
  return doCabecalho ?? `"${e.version}"`;
}
