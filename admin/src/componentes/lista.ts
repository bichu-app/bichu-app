import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';

/**
 * Busca, filtro e ordenacao moram na URL (sobrevivem a recarga, dao link e voltar
 * do detalhe preserva).
 */
export function useParametrosDaLista<T extends Record<string, string>>(padroes: T) {
  const [busca, setBusca] = useSearchParams();
  const valores = Object.fromEntries(Object.entries(padroes).map(([k, padrao]) => [k, busca.get(k) ?? padrao])) as T;

  const mudar = useCallback(
    (mudancas: Partial<T>) => {
      setBusca(
        (atual) => {
          const nova = new URLSearchParams(atual);
          for (const [k, v] of Object.entries(mudancas) as [string, string | undefined][]) {
            if (v === undefined || v === padroes[k]) nova.delete(k);
            else nova.set(k, v);
          }
          return nova;
        },
        { replace: true },
      );
    },
    [setBusca, padroes],
  );
  return [valores, mudar] as const;
}

/**
 * O aviso de sucesso que o formulario deixa para a lista (banner persistente com
 * Fechar, secao 25.5).
 */
export function useAvisoDaNavegacao(): [string | undefined, () => void] {
  const location = useLocation();
  const navigate = useNavigate();
  const aviso = (location.state as { aviso?: string } | null)?.aviso;
  const fechar = useCallback(() => {
    void navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [navigate, location.pathname, location.search]);
  return [aviso, fechar];
}

export type EstadoDaLista<T> =
  | { fase: 'carregando'; itens: T[]; total: number }
  | { fase: 'pronto'; itens: T[]; total: number; carregandoMais: boolean }
  | { fase: 'erro'; itens: T[]; total: number };

interface Resultado<T> {
  chave: string;
  pagina: number;
  itens: T[];
  total: number;
  erro: boolean;
}

/** Lista paginada por "Carregar mais" (secao 11.20). */
export function useListaPaginada<T>(
  chave: string,
  buscar: (pagina: number, sinal: AbortSignal) => Promise<{ itens: T[]; total: number } | undefined>,
) {
  const [versao, setVersao] = useState(0);
  const chaveCompleta = `${chave}#${versao}`;
  const [paginaDe, setPaginaDe] = useState({ chave: chaveCompleta, n: 1 });
  const pagina = paginaDe.chave === chaveCompleta ? paginaDe.n : 1;
  const [resultado, setResultado] = useState<Resultado<T>>();

  useEffect(() => {
    const controle = new AbortController();
    const guardar = (r: { itens: T[]; total: number } | undefined) =>
      setResultado((anterior) => {
        const acumulado = anterior && anterior.chave === chaveCompleta && pagina > 1 ? anterior.itens : [];
        if (!r) return { chave: chaveCompleta, pagina, itens: acumulado, total: anterior?.chave === chaveCompleta ? anterior.total : 0, erro: true };
        return { chave: chaveCompleta, pagina, itens: [...acumulado, ...r.itens], total: r.total, erro: false };
      });
    buscar(pagina, controle.signal)
      .then((r) => {
        if (!controle.signal.aborted) guardar(r);
      })
      .catch(() => {
        if (!controle.signal.aborted) guardar(undefined);
      });
    return () => controle.abort();
  }, [buscar, chaveCompleta, pagina]);

  let estado: EstadoDaLista<T>;
  if (!resultado || resultado.chave !== chaveCompleta) estado = { fase: 'carregando', itens: [], total: 0 };
  else if (resultado.erro) estado = { fase: 'erro', itens: resultado.itens, total: resultado.total };
  else estado = { fase: 'pronto', itens: resultado.itens, total: resultado.total, carregandoMais: resultado.pagina < pagina };

  const carregarMais = useCallback(() => setPaginaDe({ chave: chaveCompleta, n: pagina + 1 }), [chaveCompleta, pagina]);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  /** Troca um item no lugar, depois de uma acao na linha, sem recarregar a lista. */
  const substituir = useCallback((igual: (item: T) => boolean, novo: T) => {
    setResultado((r) => (r ? { ...r, itens: r.itens.map((i) => (igual(i) ? novo : i)) } : r));
  }, []);
  return { estado, carregarMais, recarregar, substituir };
}
