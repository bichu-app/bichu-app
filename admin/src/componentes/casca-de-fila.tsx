import { useEffect, useState, type ReactNode } from 'react';

import { Banner, EstadoVazio, LinhasCarregando } from './basicos.tsx';
import type { EstadoDaLista } from './lista.ts';

/**
 * O que a casca LE do estado da lista -- e nunca os itens em si.
 *
 * `EstadoDaLista<T>` entra aqui direto: `T[]` serve como `readonly unknown[]`, e
 * `carregandoMais` e opcional porque so a fase `pronto` o tem. A casca nao e
 * generica em `T` porque nao desenha linha nenhuma: quem desenha a linha e a
 * fila, que e quem conhece o dominio.
 */
export interface EstadoVistoPelaCasca {
  fase: EstadoDaLista<unknown>['fase'];
  itens: readonly unknown[];
  total: number;
  carregandoMais?: boolean;
}

/** O cabecalho que abre toda fila: o titulo e o que a tela faz, em prosa. */
export function CabecalhoDaFila({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <header className="cab">
      <h1 className="t-title-lg">{titulo}</h1>
      {children}
    </header>
  );
}

/**
 * O par de banners da fila: o sucesso da ultima acao, com `Fechar`, e a falha
 * da linha, sem.
 *
 * Os dois moram em estado LOCAL da tela -- e e isso que separa a fila da lista
 * de cadastro, onde o aviso vem da navegacao (`useAvisoDaNavegacao`). A falha
 * nao oferece `Fechar` porque ela sai sozinha na proxima tentativa.
 */
export function AvisosDaFila({
  aviso,
  aoFecharAviso,
  falha,
}: {
  aviso: string | undefined;
  aoFecharAviso: () => void;
  falha: string | undefined;
}) {
  return (
    <>
      {aviso !== undefined && (
        <Banner tipo="ok" aoFechar={aoFecharAviso}>
          {aviso}
        </Banner>
      )}
      {falha !== undefined && <Banner tipo="erro">{falha}</Banner>}
    </>
  );
}

/**
 * A carga que falhou, com `Tentar de novo`.
 *
 * A guarda da fase mora DENTRO: era ela, repetida nas tres filas, que decidia
 * se o banner aparecia, e deixa-la fora seria manter a copia na linha de cima.
 * O texto nao e parametro porque as tres diziam a MESMA frase.
 */
export function ErroDaFila({
  estado,
  aoTentarDeNovo,
}: {
  estado: EstadoVistoPelaCasca;
  aoTentarDeNovo: () => void;
}) {
  if (estado.fase !== 'erro') return null;
  return (
    <Banner tipo="erro">
      Não conseguimos carregar a fila.{' '}
      <button type="button" className="btn ghost" onClick={aoTentarDeNovo}>
        Tentar de novo
      </button>
    </Banner>
  );
}

/**
 * A tabela da fila: o cabecalho tirado de `colunas` e o esqueleto de carga.
 *
 * A chave do `<th>` leva o indice porque a coluna de acoes de uma das filas tem
 * rotulo vazio, e duas colunas vazias dariam chave repetida. As linhas entram
 * como `children`: a casca nao conhece o dominio e nao desenha linha.
 *
 * CUIDADO, defeito HERDADO e preservado de proposito: `LinhasCarregando`
 * desenha uma celula fixa MAIS uma por coluna recebida, e as tres filas lhe
 * passam o `colunas` inteiro -- o esqueleto sai com uma celula a mais que o
 * cabecalho. A familia LISTA usa a mesma peca passando so as colunas depois da
 * primeira. Esta casca repassa `colunas` sem mexer, porque consertar aqui
 * mudaria o que tres telas desenham; o numero de hoje esta preso em
 * `admin/test/casca-de-fila.test.tsx`, no caso `o esqueleto so aparece
 * carregando`.
 */
export function TabelaDaFila({
  colunas,
  estado,
  children,
}: {
  colunas: string[];
  estado: EstadoVistoPelaCasca;
  children: ReactNode;
}) {
  return (
    <table className="tabela">
      <thead>
        <tr>
          {colunas.map((c, i) => (
            <th key={`${c}#${String(i)}`} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {estado.fase === 'carregando' && <LinhasCarregando linhas={5} colunas={colunas} />}
        {children}
      </tbody>
    </table>
  );
}

/**
 * O fim da fila: o estado vazio e o `Carregar mais`.
 *
 * `visiveis` e `estado.itens.length` NAO sao a mesma contagem, e as duas eram
 * usadas lado a lado nas tres copias: o estado vazio olha o que sobrou DEPOIS
 * da busca local (`visiveis`), e o `Carregar mais` olha o que ja veio do
 * servidor (`estado.itens.length`) contra o `total`. Trocar uma pela outra
 * esconde o botao numa busca que nao casou, ou o mostra sem ter o que buscar.
 *
 * `corpoVazio` fica com a fila: e a frase que diz, nas palavras do dominio, por
 * que a aba esta vazia ou que a busca nao casou.
 */
export function RodapeDaFila({
  estado,
  visiveis,
  corpoVazio,
  destino,
  aoCarregarMais,
}: {
  estado: EstadoVistoPelaCasca;
  visiveis: number;
  corpoVazio: string;
  destino: string;
  aoCarregarMais: () => void;
}) {
  if (estado.fase !== 'pronto') return null;
  return (
    <>
      {visiveis === 0 && (
        <EstadoVazio titulo="Nada por aqui" corpo={corpoVazio} acao="Ver a fila" destino={destino} />
      )}
      {estado.itens.length < estado.total && (
        <button
          type="button"
          className="btn sec"
          data-cy="carregar-mais"
          aria-busy={estado.carregandoMais || undefined}
          onClick={aoCarregarMais}
        >
          Carregar mais
        </button>
      )}
    </>
  );
}

/**
 * A CONTAGEM DO AVISO do item do menu: quantas linhas esperam decisao.
 *
 * O que estava copiado em tres `fila.ts` era isto, e nao a consulta: abrir o
 * `AbortController`, conferir `aborted` antes de gravar, engolir a falha (um
 * aviso de menu que nao carregou nao e erro de tela) e devolver a limpeza. A
 * consulta fica FORA, porque a rota e os parametros sao do contrato de cada
 * fila -- e e o `useCallback` de quem chama que diz quando ela vale de novo.
 *
 * `versao` existe para a tela pedir a contagem outra vez depois de decidir uma
 * linha.
 */
export function usePendentesDaFila(
  buscar: (sinal: AbortSignal) => Promise<number | undefined>,
  versao = 0,
): number | undefined {
  const [pendentes, setPendentes] = useState<number>();

  useEffect(() => {
    const controle = new AbortController();
    void buscar(controle.signal)
      .then((n) => {
        if (!controle.signal.aborted && n !== undefined) setPendentes(n);
      })
      .catch(() => undefined);
    return () => controle.abort();
  }, [buscar, versao]);

  return pendentes;
}

/** A data como o painel a escreve. Era a MESMA funcao em tres `fila.ts`. */
export function dataCurta(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso === '') return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}
