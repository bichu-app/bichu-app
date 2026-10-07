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

/**
 * O `If-Match` de um recurso: sempre montado do `version` dele, e nunca do
 * cabecalho `ETag`. A borda comprime e sufixa o ETag (`"1-zstd"`, `"1-gzip"`),
 * e devolver esse valor no If-Match dava 412 em toda escrita (o "nao salva" de
 * hml, 07/10).
 */
export function etagDe(e: { version: number }): string {
  return `"${String(e.version)}"`;
}
