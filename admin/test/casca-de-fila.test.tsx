/**
 * A CASCA COMPARTILHADA DAS TRES FILAS DO PAINEL.
 *
 * O cliente registrou de cabeca tres blocos repetidos de *122, 83 e 64 linhas*
 * entre as listas e as filas do painel, e pediu que a medicao fosse refeita. O
 * `jscpd 4.0.5 --min-lines 5` sobre `admin/src` em 31/10/2026 achou 28 clones
 * entre esses arquivos, e NENHUM par de 122 nem de 64: o maior par entre
 * arquivos e `FilaDeModeracao` <-> `FilaDePlaquinhas`, com 82 linhas em 6
 * blocos -- o 83 de memoria. Depois vinham `ListaDeProdutos` <->
 * `ListaDeEncontros` (50 em 4), `ListaDeEntradas` <-> `ListaDeParceiros` (40 em
 * 3) e `FilaDeAjuda` <-> `FilaDePlaquinhas` (37 em 3).
 *
 * Comparando o CODIGO, e nao a aparencia, o painel tem duas familias de tela
 * com registros, e so uma estava duplicada. A refatoracao mexeu na familia
 * FILA (as tres telas e os quatro `fila.ts`) e deixou a familia LISTA DE
 * CADASTRO como estava -- a secao (3) deste arquivo e o registro de POR QUE,
 * para que a decisao nao precise ser redescoberta.
 *
 * ## O que este arquivo mede, em tres partes
 *
 * **(1) COMPORTAMENTO IDENTICO.** A refatoracao nao pode mudar nada que a
 * pessoa do painel veja, e isso aqui e PROVADO, nao afirmado: cada peca e
 * medida contra o DOM e contra as transicoes que as copias produziam -- a
 * guarda de fase de cada bloco, o esqueleto de carga com o mesmo numero de
 * colunas do cabecalho, a diferenca entre "quantas linhas sobraram da busca" e
 * "quantas linhas ja vieram do servidor", o `aria-busy` do `Carregar mais` e a
 * carga de contagem que e descartada no desmonte.
 *
 * **(2) ISCA.** A parte (1) passaria inteira se uma fila tivesse uma copia
 * PRIVADA da casca -- ela mede a peca, nao quem a consome. A isca mede a FONTE
 * das tres filas e dos quatro `fila.ts`, e reprova POR NOME quando a copia
 * renasce, no mesmo espirito de `admin/test/casca-de-formulario.test.tsx`.
 *
 * **O controle positivo da isca** esta em `o marcador existe na casca`: todo
 * marcador procurado nas filas e procurado TAMBEM dentro da casca, onde precisa
 * existir. Marcador com erro de digitacao daria zero nas tres filas e passaria
 * calado -- e zero sem controle positivo nao mede nada.
 *
 * **(3) O QUE NAO FOI UNIFICADO**, com a medicao que sustenta cada decisao.
 */
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { useCallback, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import {
  AvisosDaFila,
  CabecalhoDaFila,
  dataCurta,
  ErroDaFila,
  RodapeDaFila,
  TabelaDaFila,
  usePendentesDaFila,
  type EstadoVistoPelaCasca,
} from '../src/componentes/casca-de-fila.tsx';

function comRota(no: ReactNode) {
  return render(<MemoryRouter>{no}</MemoryRouter>);
}

/** Um estado de lista como `useListaPaginada` o entrega. */
function estadoDe(extra: Partial<EstadoVistoPelaCasca> = {}): EstadoVistoPelaCasca {
  return { fase: 'pronto', itens: [], total: 0, ...extra };
}

const COLUNAS = ['Pet', 'Entrega', 'Ações'];

// ===========================================================================
// (1) COMPORTAMENTO IDENTICO
// ===========================================================================

describe('(1) o cabecalho da fila diz o mesmo que as copias diziam', () => {
  it('o titulo e um h1, e a prosa da tela entra embaixo dele', () => {
    comRota(
      <CabecalhoDaFila titulo="Plaquinhas da coleira">
        <p>Os pedidos do objeto físico.</p>
      </CabecalhoDaFila>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Plaquinhas da coleira');
    expect(screen.getByText('Os pedidos do objeto físico.')).toBeInTheDocument();
  });

  it('aceita MAIS DE UM paragrafo: a fila de ajuda tem dois', () => {
    comRota(
      <CabecalhoDaFila titulo="Ajuda">
        <p>As dúvidas que chegam pelo botão.</p>
        <p data-cy="aviso-sem-resposta">O painel não mostra quem escreveu.</p>
      </CabecalhoDaFila>,
    );
    expect(screen.getByText('O painel não mostra quem escreveu.')).toBeInTheDocument();
  });
});

describe('(1) o par de banners da fila', () => {
  it('sem aviso e sem falha nao desenha nada -- eram duas guardas', () => {
    const { container } = comRota(
      <AvisosDaFila aviso={undefined} aoFecharAviso={vi.fn()} falha={undefined} />,
    );
    expect(container.querySelector('.banner')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('o aviso de sucesso oferece Fechar, e Fechar chama de volta a tela', () => {
    const fechar = vi.fn();
    comRota(<AvisosDaFila aviso="Pedido atendido." aoFecharAviso={fechar} falha={undefined} />);
    expect(screen.getByText('Pedido atendido.')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Fechar aviso' }).click();
    expect(fechar).toHaveBeenCalledTimes(1);
  });

  it('a falha da linha NAO oferece Fechar: ela sai na proxima tentativa', () => {
    comRota(
      <AvisosDaFila aviso={undefined} aoFecharAviso={vi.fn()} falha="Este pedido não existe mais." />,
    );
    expect(screen.getByText('Este pedido não existe mais.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fechar aviso' })).toBeNull();
  });

  it('os dois aparecem juntos: decidir uma linha e falhar na seguinte', () => {
    comRota(<AvisosDaFila aviso="Denúncia descartada." aoFecharAviso={vi.fn()} falha="Teto de escritas." />);
    expect(screen.getByText('Denúncia descartada.')).toBeInTheDocument();
    expect(screen.getByText('Teto de escritas.')).toBeInTheDocument();
  });
});

describe('(1) a carga que falhou', () => {
  it('nas fases carregando e pronto nao desenha nada -- era `{fase === \'erro\' && …}`', () => {
    for (const fase of ['carregando', 'pronto'] as const) {
      const { container, unmount } = comRota(
        <ErroDaFila estado={estadoDe({ fase })} aoTentarDeNovo={vi.fn()} />,
      );
      expect(container.textContent, `fase ${fase} deveria ficar calada`).toBe('');
      unmount();
    }
  });

  it('na fase erro diz a frase e o botao recarrega a fila', () => {
    const recarregar = vi.fn();
    comRota(<ErroDaFila estado={estadoDe({ fase: 'erro' })} aoTentarDeNovo={recarregar} />);
    expect(screen.getByText(/Não conseguimos carregar a fila\./)).toBeInTheDocument();
    screen.getByRole('button', { name: 'Tentar de novo' }).click();
    expect(recarregar).toHaveBeenCalledTimes(1);
  });
});

describe('(1) a tabela da fila', () => {
  it('o cabecalho sai de `colunas`, na ordem', () => {
    comRota(
      <TabelaDaFila colunas={COLUNAS} estado={estadoDe()}>
        <tr>
          <td>uma linha</td>
        </tr>
      </TabelaDaFila>,
    );
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(COLUNAS);
    expect(screen.getByText('uma linha')).toBeInTheDocument();
  });

  it('coluna de rotulo VAZIO nao colide: a fila de ajuda tem uma, e podia ter duas', () => {
    const aviso = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    comRota(
      <TabelaDaFila colunas={['Assunto', '', '']} estado={estadoDe()}>
        <tr>
          <td>x</td>
        </tr>
      </TabelaDaFila>,
    );
    expect(screen.getAllByRole('columnheader')).toHaveLength(3);
    // Chave repetida sai no console do React, e nao como excecao: medir o aviso.
    expect(aviso.mock.calls.flat().join(' ')).not.toMatch(/same key|unique "key"/i);
    aviso.mockRestore();
  });

  /**
   * ALFINETE DE UM DEFEITO HERDADO, e nao um comportamento desejado.
   *
   * `LinhasCarregando` desenha UMA celula fixa (a do `prod`) MAIS uma por
   * coluna recebida, e as tres filas lhe passam o `COLUNAS` inteiro: o
   * esqueleto sai com uma celula a mais que o cabecalho. A familia LISTA usa a
   * mesma peca certo, passando so as colunas DEPOIS da primeira
   * (`['w-preco', 'w-upd', …]`).
   *
   * O comentario de `ajuda/fila.ts` afirma o contrario -- *"o esqueleto nunca
   * desenha um numero de colunas diferente do da tabela"* --, e ele esta
   * errado. A refatoracao NAO conserta isso de proposito: seria mudar o que
   * tres telas desenham, e o conserto e de `LinhasCarregando` ou dos tres
   * pontos de chamada, com o cliente na mesa. Este caso prende o numero de
   * hoje, para que o conserto seja um ato deliberado e nao uma deriva.
   */
  it('o esqueleto so aparece carregando (e herda a celula a mais: colunas + 1)', () => {
    const carregando = comRota(
      <TabelaDaFila colunas={COLUNAS} estado={estadoDe({ fase: 'carregando' })}>
        {null}
      </TabelaDaFila>,
    );
    const esqueleto = carregando.container.querySelectorAll('tr[aria-hidden="true"]');
    expect(esqueleto).toHaveLength(5);
    expect(esqueleto[0]?.querySelectorAll('td')).toHaveLength(COLUNAS.length + 1);
    expect(screen.getAllByRole('columnheader')).toHaveLength(COLUNAS.length);
    carregando.unmount();

    const pronto = comRota(
      <TabelaDaFila colunas={COLUNAS} estado={estadoDe()}>
        {null}
      </TabelaDaFila>,
    );
    expect(pronto.container.querySelectorAll('tr[aria-hidden="true"]')).toHaveLength(0);
  });
});

describe('(1) o fim da fila', () => {
  it('fora da fase pronto nao desenha estado vazio nem Carregar mais', () => {
    for (const fase of ['carregando', 'erro'] as const) {
      const { container, unmount } = comRota(
        <RodapeDaFila
          estado={estadoDe({ fase, itens: [1, 2], total: 9 })}
          visiveis={0}
          corpoVazio="nada"
          destino="/plaquinhas"
          aoCarregarMais={vi.fn()}
        />,
      );
      expect(container.textContent, `fase ${fase} deveria ficar calada`).toBe('');
      unmount();
    }
  });

  it('a aba vazia mostra `Nada por aqui` com a frase do dominio e a saida', () => {
    comRota(
      <RodapeDaFila
        estado={estadoDe()}
        visiveis={0}
        corpoVazio="Nenhum pedido de plaquinha esperando."
        destino="/plaquinhas"
        aoCarregarMais={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Nada por aqui' })).toBeInTheDocument();
    expect(screen.getByText('Nenhum pedido de plaquinha esperando.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver a fila' })).toHaveAttribute('href', '/plaquinhas');
  });

  it('`visiveis` e `itens.length` NAO sao a mesma contagem, e as copias usavam as duas', () => {
    // Busca local que nao casou com nada da pagina, e ainda ha pagina por vir:
    // o estado vazio aparece E o `Carregar mais` continua la.
    comRota(
      <RodapeDaFila
        estado={estadoDe({ itens: [1, 2, 3], total: 30 })}
        visiveis={0}
        corpoVazio="Nenhum pedido desta página casa com a busca."
        destino="/plaquinhas"
        aoCarregarMais={vi.fn()}
      />,
    );
    expect(screen.getByText('Nenhum pedido desta página casa com a busca.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Carregar mais' })).toBeInTheDocument();
  });

  it('pagina inteira na tela: sem estado vazio e sem Carregar mais', () => {
    const { container } = comRota(
      <RodapeDaFila
        estado={estadoDe({ itens: [1, 2, 3], total: 3 })}
        visiveis={3}
        corpoVazio="nada"
        destino="/plaquinhas"
        aoCarregarMais={vi.fn()}
      />,
    );
    expect(container.textContent).toBe('');
  });

  it('`Carregar mais` leva `aria-busy` quando a proxima pagina esta vindo, e chama de volta', () => {
    const mais = vi.fn();
    const vindo = comRota(
      <RodapeDaFila
        estado={estadoDe({ itens: [1], total: 9, carregandoMais: true })}
        visiveis={1}
        corpoVazio="nada"
        destino="/plaquinhas"
        aoCarregarMais={mais}
      />,
    );
    expect(screen.getByRole('button', { name: 'Carregar mais' })).toHaveAttribute('aria-busy', 'true');
    vindo.unmount();

    comRota(
      <RodapeDaFila
        estado={estadoDe({ itens: [1], total: 9, carregandoMais: false })}
        visiveis={1}
        corpoVazio="nada"
        destino="/plaquinhas"
        aoCarregarMais={mais}
      />,
    );
    const botao = screen.getByRole('button', { name: 'Carregar mais' });
    expect(botao).not.toHaveAttribute('aria-busy');
    botao.click();
    expect(mais).toHaveBeenCalledTimes(1);
  });
});

describe('(1) a contagem do aviso do menu', () => {
  it('nasce indefinida e vira o numero que a consulta devolveu', async () => {
    const buscar = vi.fn(() => Promise.resolve(7));
    const { result } = renderHook(() => usePendentesDaFila(buscar));
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBe(7));
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it('consulta que falha nao derruba a tela nem grava numero -- era um `catch` engolido', async () => {
    const buscar = vi.fn(() => Promise.reject(new Error('rede')));
    const { result } = renderHook(() => usePendentesDaFila(buscar));
    await act(() => Promise.resolve());
    expect(result.current).toBeUndefined();
  });

  it('`undefined` da consulta (resposta sem `pending_total`) nao vira numero', async () => {
    const buscar = vi.fn(() => Promise.resolve(undefined));
    const { result } = renderHook(() => usePendentesDaFila(buscar));
    await act(() => Promise.resolve());
    expect(result.current).toBeUndefined();
  });

  it('o desmonte ABORTA a consulta, e a resposta que chega depois nao grava', async () => {
    let abortado = false;
    let resolver: (n: number) => void = () => undefined;
    const buscar = (sinal: AbortSignal) => {
      sinal.addEventListener('abort', () => {
        abortado = true;
      });
      return new Promise<number>((r) => {
        resolver = r;
      });
    };
    const { result, unmount } = renderHook(() => usePendentesDaFila(buscar));
    unmount();
    expect(abortado, 'o desmonte deveria abortar a consulta').toBe(true);
    await act(() => {
      resolver(5);
      return Promise.resolve();
    });
    expect(result.current).toBeUndefined();
  });

  it('`versao` nova pede a contagem outra vez -- e como a tela atualiza o aviso', async () => {
    const buscar = vi.fn(() => Promise.resolve(2));
    const { result, rerender } = renderHook(({ v }: { v: number }) => usePendentesDaFila(buscar, v), {
      initialProps: { v: 0 },
    });
    await waitFor(() => expect(result.current).toBe(2));
    rerender({ v: 1 });
    await waitFor(() => expect(buscar).toHaveBeenCalledTimes(2));
  });

  it('consulta ESTAVEL nao e refeita a cada pintura -- era o `useCallback([api])` das copias', async () => {
    const buscar = vi.fn(() => Promise.resolve(3));
    function Consumidora() {
      const estavel = useCallback(buscar, []);
      return <p>{usePendentesDaFila(estavel) ?? '—'}</p>;
    }
    const { rerender } = render(<Consumidora />);
    await screen.findByText('3');
    rerender(<Consumidora />);
    rerender(<Consumidora />);
    expect(buscar).toHaveBeenCalledTimes(1);
  });
});

describe('(1) a data como o painel a escreve', () => {
  it('sem data escreve o travessao -- nulo, indefinido e vazio', () => {
    expect(dataCurta(null)).toBe('—');
    expect(dataCurta(undefined)).toBe('—');
    expect(dataCurta('')).toBe('—');
  });

  it('a data sai em pt-BR', () => {
    expect(dataCurta('2026-10-29T23:14:54.000Z')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});

// ===========================================================================
// (2) ISCA: a copia privada da casca nao renasce
// ===========================================================================

const RAIZ = path.resolve(import.meta.dirname, '../src');

/** As tres filas e os quatro vocabularios que a refatoracao limpou. */
const FILAS = [
  'ajuda/FilaDeAjuda.tsx',
  'moderacao/FilaDeModeracao.tsx',
  'plaquinhas/FilaDePlaquinhas.tsx',
];
const VOCABULARIOS = ['ajuda/fila.ts', 'moderacao/fila.ts', 'diretorio/fila.ts', 'plaquinhas/fila.ts'];

const CASCA = 'componentes/casca-de-fila.tsx';

function fonte(relativo: string): string {
  return readFileSync(path.join(RAIZ, relativo), 'utf8');
}

/**
 * Cada marcador e um pedaco da casca que estava escrito a mao em cada fila. O
 * `onde` diz em quais arquivos ele NAO pode mais aparecer.
 */
const MARCADORES: { marcador: string; onde: string[] }[] = [
  { marcador: '<header className="cab">', onde: FILAS },
  { marcador: 'className="tabela"', onde: FILAS },
  { marcador: '<LinhasCarregando', onde: FILAS },
  { marcador: '<EstadoVazio', onde: FILAS },
  { marcador: 'Nada por aqui', onde: FILAS },
  { marcador: 'data-cy="carregar-mais"', onde: FILAS },
  { marcador: 'Carregar mais', onde: FILAS },
  { marcador: 'Tentar de novo', onde: FILAS },
  { marcador: 'Não conseguimos carregar a fila.', onde: FILAS },
  { marcador: 'new AbortController()', onde: VOCABULARIOS },
  { marcador: "toLocaleDateString('pt-BR')", onde: [...FILAS, ...VOCABULARIOS] },
];

describe('(2) isca: nenhuma fila volta a escrever a casca a mao', () => {
  it('o marcador existe na casca (CONTROLE POSITIVO da isca)', () => {
    const casca = fonte(CASCA);
    const ausentes = MARCADORES.filter(({ marcador }) => !casca.includes(marcador)).map(
      ({ marcador }) => marcador,
    );
    expect(
      ausentes,
      'marcador que nao existe na casca daria zero nas filas e passaria calado',
    ).toEqual([]);
  });

  it('a isca REPROVA uma copia privada da casca (isca da isca)', () => {
    const copia = [
      'export default function FilaInventada() {',
      '  return (',
      '    <>',
      '      <header className="cab">',
      '        <h1 className="t-title-lg">Fila inventada</h1>',
      '      </header>',
      '      <table className="tabela" />',
      '      <button type="button" data-cy="carregar-mais">Carregar mais</button>',
      '    </>',
      '  );',
      '}',
    ].join('\n');
    const pegos = MARCADORES.filter(({ marcador }) => copia.includes(marcador)).map(
      ({ marcador }) => marcador,
    );
    expect(pegos.length, 'a isca precisa pegar a copia').toBeGreaterThanOrEqual(4);
  });

  it('as filas de verdade passam: nenhuma delas tem a casca escrita a mao', () => {
    const achados: string[] = [];
    for (const { marcador, onde } of MARCADORES) {
      for (const arquivo of onde) {
        if (fonte(arquivo).includes(marcador)) achados.push(`${arquivo}: ${marcador}`);
      }
    }
    expect(achados).toEqual([]);
  });

  it('as tres filas e os tres vocabularios CONSOMEM a casca', () => {
    for (const arquivo of FILAS) {
      expect(fonte(arquivo), `${arquivo} deveria importar a casca`).toMatch(
        /from '\.\.\/componentes\/casca-de-fila\.tsx'/,
      );
    }
    for (const arquivo of ['ajuda/fila.ts', 'moderacao/fila.ts', 'diretorio/fila.ts']) {
      expect(fonte(arquivo), `${arquivo} deveria usar usePendentesDaFila`).toContain(
        'usePendentesDaFila',
      );
    }
  });

  it('a REGRA DE PRODUTO continua valendo: busca, filtro e ordenacao no topo do CORPO', () => {
    // A casca nao desenha campo de busca nenhum: quem desenha e a
    // `BarraDeListagem`, e ela vem ANTES da tabela nas tres filas.
    const casca = fonte(CASCA);
    expect(casca).not.toMatch(/type="search"|<select|className="barra"/);

    for (const arquivo of FILAS) {
      const texto = fonte(arquivo);
      const barra = texto.indexOf('<BarraDeListagem');
      const tabela = texto.indexOf('<TabelaDaFila');
      expect(barra, `${arquivo} deveria montar a BarraDeListagem`).toBeGreaterThan(0);
      expect(tabela, `${arquivo} deveria montar a TabelaDaFila`).toBeGreaterThan(0);
      expect(barra, `${arquivo}: a barra vem antes da tabela, no corpo da tela`).toBeLessThan(tabela);
    }
  });
});

// ===========================================================================
// (3) O QUE NAO FOI UNIFICADO, e por que
// ===========================================================================

describe('(3) o que a medicao disse para NAO unificar', () => {
  /**
   * `mensagemDaFalha` existe nas tres filas e parece o mesmo bloco. NAO e: os
   * conjuntos de status DIVERGEM (ajuda nao tem caso 400; moderacao e
   * plaquinhas tem) e os textos de 400 e 404 sao copy do dominio. Unificar faria
   * uma tela afirmar um caso que a rota dela nao devolve.
   */
  it('`mensagemDaFalha`: so a ultima frase e comum; os status divergem', () => {
    const ajuda = fonte('ajuda/FilaDeAjuda.tsx');
    const plaquinhas = fonte('plaquinhas/FilaDePlaquinhas.tsx');
    expect(ajuda).not.toContain('status === 400');
    expect(plaquinhas).toContain('status === 400');
    for (const texto of [ajuda, plaquinhas, fonte('moderacao/FilaDeModeracao.tsx')]) {
      expect(texto).toContain('Não conseguimos falar com o servidor.');
    }
  });

  /**
   * `ABAS` / `ROTULO_DA_ABA` / `VAZIO_DA_ABA` tem a MESMA forma nos quatro
   * `fila.ts` e dominios DIFERENTES. O que protege cada um e o
   * `satisfies Record<EnumDoContrato, string>`: e ele que reprova a aba que o
   * contrato ganhou e a tela nao nomeou. Um generico apagaria essa conferencia.
   */
  it('o trio de abas fica em cada dominio, com a conferencia de exaustividade', () => {
    for (const arquivo of VOCABULARIOS) {
      const texto = fonte(arquivo);
      expect(texto, `${arquivo}: ROTULO_DA_ABA`).toContain('export const ROTULO_DA_ABA');
      expect(texto, `${arquivo}: satisfies Record`).toMatch(/as const satisfies Record</);
    }
  });

  /**
   * `rede/dominio/horario.ts` tambem exporta uma `dataCurta`, e ela NAO e a
   * mesma funcao: pede fuso e escreve o dia da semana. Unificar pelo nome
   * trocaria o formato de duas telas.
   */
  it('a `dataCurta` da Rede tem outra assinatura e outro formato: nao e a mesma funcao', () => {
    expect(fonte('rede/dominio/horario.ts')).toContain(
      'export function dataCurta(iso: string, fuso = FUSO_PADRAO)',
    );
    expect(dataCurta('2026-10-03T12:00:00Z')).not.toMatch(/sáb/);
  });

  /**
   * A familia LISTA DE CADASTRO (`pghead`, `tabwrap`, contagem em `aria-live`,
   * `semres`, `rodape-lista`, aviso vindo da navegacao) tem 6 telas e NAO foi
   * unificada: a contagem divergiria. `ListaDeParceiros` emenda `com "<busca>"`
   * e `em <filtro>` na frase; `ListaDeComunicados` nao tem busca nenhuma e por
   * isso nao tem o bloco `semres`; `FilaDeIndicacoes` nao tem busca e escreve
   * os seus proprios chips porque `BarraDeListagem` exige campo de busca. Uma
   * casca que servisse as seis mal serviria exatamente a tela menos exercitada.
   */
  it('a familia LISTA continua com a casca propria, e a divergencia e real', () => {
    const parceiros = fonte('loja/ListaDeParceiros.tsx');
    const comunicados = fonte('comunicados/ListaDeComunicados.tsx');
    const indicacoes = fonte('diretorio/FilaDeIndicacoes.tsx');

    // A contagem de parceiros emenda busca e filtro; a de comunicados, nao.
    expect(parceiros).toContain('com “');
    expect(comunicados).not.toContain('com “');

    // Comunicados nao tem busca, logo nao tem `semres`; parceiros tem os dois.
    expect(comunicados).not.toContain('<BarraDeListagem');
    expect(comunicados).not.toContain('className="semres"');
    expect(parceiros).toContain('className="semres"');

    // A fila de indicacoes e, estruturalmente, uma lista de cadastro.
    expect(indicacoes).toContain('className="pghead"');
    expect(indicacoes).not.toContain('className="cab"');

    // E ela nao usa a BarraDeListagem porque la a busca nao existe.
    expect(indicacoes).not.toContain('<BarraDeListagem');
    expect(fonte('componentes/BarraDeListagem.tsx')).toContain('rotuloDaBusca: string;');
  });

  /**
   * Os 59 clones internos de `FilaDeIndicacoes` (3 blocos, medidos pelo jscpd)
   * sao os DOIS DIALOGOS de aprovar e recusar, e nao codigo de lista. Ficam
   * para quem for mexer em dialogo.
   */
  it('o clone interno da fila de indicacoes e de dialogo, nao de lista', () => {
    const texto = fonte('diretorio/FilaDeIndicacoes.tsx');
    expect(texto.match(/<Dialogo\n/g) ?? []).toHaveLength(2);
  });
});

describe('(3) a casca nao carrega o que so um consumidor precisa', () => {
  it('nenhum nome de dominio entra na casca', () => {
    const casca = fonte(CASCA);
    for (const palavra of ['duvida', 'denuncia', 'plaquinha', 'pedido', 'indicacao']) {
      expect(casca.toLowerCase(), `a casca nao deveria citar \`${palavra}\` em codigo`).not.toMatch(
        new RegExp(`(const|function|interface|type)\\s+\\w*${palavra}`, 'i'),
      );
    }
  });

  it('a casca nao desenha linha: ela nao conhece o item', () => {
    // Uma celula de dado dentro da casca seria dominio escondido na peca
    // compartilhada. O `<tr>` do cabecalho e o esqueleto de `LinhasCarregando`
    // (que ja era compartilhado) sao os unicos que ela desenha.
    expect(fonte(CASCA)).not.toMatch(/<td[ >]/);
  });
});

describe('(3) a tabela aceita os tres cabecalhos de verdade', () => {
  it('as colunas das tres filas passam pela mesma tabela', () => {
    const cabecalhos = [
      ['Assunto', 'Dúvida', 'Quando', 'Situação', ''],
      ['O que foi denunciado', 'Conteúdo', 'Motivo', 'Denúncias', 'Quando', 'Ações'],
      ['Pet', 'Entrega', 'Rastreio', 'Pedido em', 'Ações'],
    ];
    for (const colunas of cabecalhos) {
      const { unmount } = comRota(
        <TabelaDaFila colunas={colunas} estado={estadoDe()}>
          {null}
        </TabelaDaFila>,
      );
      expect(within(screen.getByRole('table')).getAllByRole('columnheader')).toHaveLength(
        colunas.length,
      );
      unmount();
    }
  });
});
