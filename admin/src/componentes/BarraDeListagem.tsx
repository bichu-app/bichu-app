import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { Icone } from './Icone.tsx';

export interface OpcaoDeSelecao {
  valor: string;
  rotulo: string;
}

export interface SeletorDaBarra {
  id: string;
  rotuloAcessivel: string;
  valor: string;
  opcoes: OpcaoDeSelecao[];
  aoMudar: (valor: string) => void;
  /** O seletor de ordenacao mostra "Ordenar:" visivel; os filtros, so o rotulo acessivel. */
  prefixoVisivel?: string;
}

/**
 * A Barra de listagem (`BO/Barra de listagem`, padrao de listagem do projeto):
 * busca, filtros e ordenacao no topo do corpo, nunca na barra do app.
 *
 * A busca guarda o que se digita em estado local e so escreve para fora depois
 * de uma pausa. O valor externo (a URL) muda de forma assincrona; controlar o
 * campo por ele perderia caractere. Quando a URL muda por fora (voltar, link
 * colado), o efeito reconcilia o campo.
 */
export function BarraDeListagem({
  rotuloDaBusca,
  placeholder,
  busca,
  aoBuscar,
  seletores,
  chips,
  chipAtivo,
  aoEscolherChip,
  rotuloDosChips,
  limpar,
  extra,
}: {
  rotuloDaBusca: string;
  placeholder: string;
  busca: string;
  aoBuscar: (valor: string) => void;
  seletores?: SeletorDaBarra[];
  chips?: OpcaoDeSelecao[];
  chipAtivo?: string;
  aoEscolherChip?: (valor: string) => void;
  rotuloDosChips?: string;
  limpar?: { rotulo: string; aoLimpar: () => void } | undefined;
  extra?: ReactNode;
}) {
  const [texto, setTexto] = useState(busca);
  // O ultimo valor que este campo mandou para fora, e o ultimo valor externo visto.
  const [enviado, setEnviado] = useState(busca);
  const [externoVisto, setExternoVisto] = useState(busca);
  const aoBuscarRef = useRef(aoBuscar);
  useLayoutEffect(() => {
    aoBuscarRef.current = aoBuscar;
  });

  // Reconcilia quando a busca muda por fora (voltar, link colado) e nao foi este
  // campo que mandou. Ajuste durante a renderizacao, sem efeito.
  if (busca !== externoVisto) {
    setExternoVisto(busca);
    if (busca !== enviado) {
      setTexto(busca);
      setEnviado(busca);
    }
  }

  useEffect(() => {
    if (texto === enviado) return;
    const id = setTimeout(() => {
      setEnviado(texto);
      aoBuscarRef.current(texto);
    }, 300);
    return () => clearTimeout(id);
  }, [texto, enviado]);

  function enviarAgora(valor: string) {
    setEnviado(valor);
    aoBuscarRef.current(valor);
  }

  return (
    <section className="barra" aria-label="Busca, filtro e ordenação">
      <div className="l1">
        <label className="busca">
          <Icone nome="search" />
          <span className="sr">{rotuloDaBusca}</span>
          <input
            type="search"
            value={texto}
            placeholder={placeholder}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') enviarAgora(texto);
            }}
          />
          {texto && (
            <button
              type="button"
              className="ibtn"
              aria-label="Limpar busca"
              onClick={() => {
                setTexto('');
                enviarAgora('');
              }}
            >
              <Icone nome="close" />
            </button>
          )}
        </label>
        {seletores?.map((s) => (
          <label key={s.id} className={s.prefixoVisivel ? 'ordem' : 'ordem sel'}>
            {s.prefixoVisivel ? <span className="t-body-sm c-sec">{s.prefixoVisivel}</span> : <span className="sr">{s.rotuloAcessivel}</span>}
            <select id={s.id} value={s.valor} onChange={(e) => s.aoMudar(e.target.value)}>
              {s.opcoes.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </select>
            <Icone nome="expand" tamanho="s20" />
          </label>
        ))}
        {extra}
      </div>
      {(chips || limpar) && (
        <div className="chips">
          <div className="chips-grupo" role="radiogroup" aria-label={rotuloDosChips ?? 'Filtrar'}>
          {chips?.map((c) => (
            <button
              key={c.valor}
              type="button"
              className="chip"
              role="radio"
              aria-checked={chipAtivo === c.valor}
              onClick={() => aoEscolherChip?.(c.valor)}
            >
              {chipAtivo === c.valor && <Icone nome="tick" tamanho="s16" />}
              {c.rotulo}
            </button>
          ))}
          </div>
          {limpar && (
            <button type="button" className="btn ghost sm limpar" onClick={limpar.aoLimpar}>
              {limpar.rotulo}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** O texto do botao que limpa diz o que limpa (UX 29.4). */
export function rotuloDeLimpar(temBusca: boolean, temFiltro: boolean): string | undefined {
  if (temBusca && temFiltro) return 'Limpar busca e filtro';
  if (temBusca) return 'Limpar busca';
  if (temFiltro) return 'Limpar filtro';
  return undefined;
}
