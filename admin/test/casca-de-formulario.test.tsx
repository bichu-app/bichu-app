/**
 * A CASCA COMPARTILHADA DOS FORMULARIOS DO PAINEL.
 *
 * O cliente pediu refatoracao em 28/10/2026 (*"revisar o codigo, fazer uma
 * refatoracao, reaproveitar as funcoes e metodos, escrever os testes e rodar
 * toda a suite completa"*). A medicao daquele dia apontou `admin/src` como o
 * ponto mais denso de clone textual das tres pilhas, e dentro dele o par
 * `FormularioDaEntrada` <-> `FormularioDeParceiro` sozinho respondia por 135
 * linhas em 10 blocos: era a MESMA casca escrita cinco vezes.
 *
 * ## O que este arquivo mede, em duas partes
 *
 * **(1) COMPORTAMENTO IDENTICO.** A refatoracao nao pode mudar nada que a
 * pessoa do painel veja, e isso aqui e PROVADO, nao afirmado: cada peca da
 * casca e medida contra o DOM e contra as transicoes que as copias produziam
 * -- plural do resumo, verbo do botao, `role` do banner, `Recarregar` que so
 * aparece em conflito de versao, `aria-busy`/`disabled`/ampulheta do envio,
 * resposta de carga vencida que NAO pinta a tela.
 *
 * **(2) ISCA.** A parte (1) passaria inteira se um formulario tivesse uma
 * copia PRIVADA da casca -- ela mede a peca, nao quem a consome. A isca mede a
 * FONTE dos cinco formularios e reprova POR NOME quando a copia renasce, no
 * mesmo espirito do caso que o app ja tem para o `_BotaoVoltarSobreMidia`
 * (`app/test/telas/casca_da_pagina_interna_test.dart`).
 *
 * **O controle positivo da isca** esta em `o marcador existe na casca`: todo
 * marcador procurado nos formularios e procurado TAMBEM dentro da casca, onde
 * precisa existir. Marcador com erro de digitacao daria zero nos cinco
 * formularios e passaria calado -- e zero sem controle positivo nao mede nada.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { useState, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import {
  BannerDaFalha,
  carregarPorChave,
  CargaQueFalhou,
  ResumoDosCampos,
  RodapeDoFormulario,
  useCargaDoFormulario,
  useRascunhoDoFormulario,
  useResumoDeErros,
  VoltarPara,
  type FaseGravada,
} from '../src/componentes/casca-de-formulario.tsx';

const rascunhosRegistrados: (() => void)[] = [];

vi.mock('../src/sessao/ProvedorDeSessao.tsx', () => ({
  useSessao: () => ({
    registrarRascunho: (guardar: () => void) => {
      rascunhosRegistrados.push(guardar);
      return () => {
        const i = rascunhosRegistrados.indexOf(guardar);
        if (i >= 0) rascunhosRegistrados.splice(i, 1);
      };
    },
  }),
}));

function comRota(no: ReactNode) {
  return render(<MemoryRouter>{no}</MemoryRouter>);
}

// ===========================================================================
// (1) COMPORTAMENTO IDENTICO
// ===========================================================================

describe('(1) o resumo de erros diz o mesmo que as copias diziam', () => {
  it('nao desenha nada quando nao ha erro -- era `{lista.length > 0 && …}`', () => {
    comRota(<ResumoDosCampos referencia={{ current: null }} erros={[]} acao="salvar" />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('UM erro fala no singular', () => {
    comRota(
      <ResumoDosCampos referencia={{ current: null }} erros={[{ campo: 'p-nome', rotulo: 'Nome' }]} acao="salvar" />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Corrija 1 campo para salvar:');
  });

  it('DOIS erros falam no plural', () => {
    comRota(
      <ResumoDosCampos
        referencia={{ current: null }}
        erros={[
          { campo: 'p-nome', rotulo: 'Nome' },
          { campo: 'p-slug', rotulo: 'Identificador' },
        ]}
        acao="salvar"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Corrija 2 campos para salvar:');
  });

  it('o VERBO e o do botao que a pessoa apertou, e nao sempre `salvar`', () => {
    comRota(
      <ResumoDosCampos referencia={{ current: null }} erros={[{ campo: 'f-nome', rotulo: 'Nome' }]} acao="publicar" />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Corrija 1 campo para publicar:');
  });

  it('o comunicado continua dizendo `para ver a prévia`', () => {
    comRota(
      <ResumoDosCampos
        referencia={{ current: null }}
        erros={[{ campo: 'c-titulo', rotulo: 'Título' }]}
        acao="ver a prévia"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Corrija 1 campo para ver a prévia:');
  });

  it('cada erro e um atalho que FOCA o campo, como antes', () => {
    comRota(
      <>
        <input id="p-slug" />
        <ResumoDosCampos
          referencia={{ current: null }}
          erros={[{ campo: 'p-slug', rotulo: 'Identificador' }]}
          acao="salvar"
        />
      </>,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Identificador' }));
    expect(document.activeElement).toBe(document.getElementById('p-slug'));
  });
});

/** Uma tela de mentira que mostra o resumo e pede foco nele, como o `mostrar`. */
function TelaQueFocaOResumo() {
  const { referencia, focar } = useResumoDeErros();
  return (
    <>
      <ResumoDosCampos referencia={referencia} erros={[{ campo: 'p-nome', rotulo: 'Nome' }]} acao="salvar" />
      <button type="button" onClick={focar}>
        mostrar erros
      </button>
    </>
  );
}

describe('(1) o foco vai para o resumo quando o servidor recusa', () => {
  it('o resumo recebe o foco, e e ele que o leitor de tela le primeiro', async () => {
    comRota(<TelaQueFocaOResumo />);
    const resumo = screen.getByRole('alert');
    expect(resumo).toHaveAttribute('tabindex', '-1');
    fireEvent.click(screen.getByRole('button', { name: 'mostrar erros' }));
    await waitFor(() => {
      expect(document.activeElement).toBe(resumo);
    });
  });
});

describe('(1) o banner da falha mantem os tres estados das copias', () => {
  it('sem falha nao desenha nada', () => {
    comRota(<BannerDaFalha falha={undefined} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('falha comum e VERMELHA e anunciada como alerta', () => {
    comRota(<BannerDaFalha falha={{ texto: 'Não conseguimos salvar o parceiro.' }} />);
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('Não conseguimos salvar o parceiro.');
    expect(banner).toHaveClass('banner', 'erro');
    expect(screen.queryByRole('button', { name: 'Recarregar' })).toBeNull();
  });

  it('`informativo` e AZUL e anunciado como status -- era o "Nada mudou"', () => {
    comRota(<BannerDaFalha falha={{ texto: 'Nada mudou. Altere algum campo antes de salvar.', informativo: true }} />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveClass('banner', 'info');
    expect(banner).toHaveTextContent('Nada mudou. Altere algum campo antes de salvar.');
  });

  it('`recarregar` oferece o botao, e ele chama de volta', () => {
    const aoRecarregar = vi.fn();
    comRota(<BannerDaFalha falha={{ texto: 'Alguém alterou este parceiro.', recarregar: true }} aoRecarregar={aoRecarregar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar' }));
    expect(aoRecarregar).toHaveBeenCalledTimes(1);
  });

  it('`recarregar` sem quem recarregue nao desenha botao morto', () => {
    comRota(<BannerDaFalha falha={{ texto: 'Conflito.', recarregar: true }} />);
    expect(screen.queryByRole('button', { name: 'Recarregar' })).toBeNull();
  });
});

describe('(1) o voltar e a tela de carga que falhou', () => {
  it('o voltar e um link com a classe e o destino das copias', () => {
    comRota(<VoltarPara para="/perto">Voltar para Perto</VoltarPara>);
    const link = screen.getByRole('link', { name: 'Voltar para Perto' });
    expect(link).toHaveClass('btn', 'ghost', 'voltar');
    expect(link).toHaveAttribute('href', '/perto');
  });

  it('a classe extra entra SEM apagar as da casca -- e o caso da Rede', () => {
    comRota(
      <VoltarPara para="/rede" className="voltar-da-rede">
        Voltar para a Rede
      </VoltarPara>,
    );
    expect(screen.getByRole('link', { name: 'Voltar para a Rede' })).toHaveClass(
      'btn',
      'ghost',
      'voltar',
      'voltar-da-rede',
    );
  });

  it('a carga que falhou guarda a saida dentro de `.form`, como antes', () => {
    const { container } = comRota(
      <CargaQueFalhou voltar={<VoltarPara para="/loja/parceiros">Voltar para Parceiros</VoltarPara>}>
        Este parceiro não existe mais.
      </CargaQueFalhou>,
    );
    expect(container.querySelector('div.form')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Voltar para Parceiros' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Este parceiro não existe mais.');
  });

  it('404 NAO oferece `Atualizar`: nao ha o que reler', () => {
    comRota(
      <CargaQueFalhou voltar={<VoltarPara para="/loja">Voltar para a Loja</VoltarPara>}>
        Este produto não existe mais.
      </CargaQueFalhou>,
    );
    expect(screen.queryByRole('button', { name: 'Atualizar' })).toBeNull();
  });

  it('erro de rede oferece `Atualizar`, e ele chama de volta', () => {
    const aoAtualizar = vi.fn();
    comRota(
      <CargaQueFalhou voltar={<VoltarPara para="/loja">Voltar para a Loja</VoltarPara>} aoAtualizar={aoAtualizar}>
        Não conseguimos carregar o produto.
      </CargaQueFalhou>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(aoAtualizar).toHaveBeenCalledTimes(1);
  });
});

describe('(1) o rodape do formulario', () => {
  it('parado: `Cancelar`, o rotulo do envio e nenhuma ampulheta', () => {
    const { container } = comRota(
      <RodapeDoFormulario cancelarPara="/perto" rotulo="Cadastrar entrada" salvando={false} dataCy="entrada-salvar" />,
    );
    expect(screen.getByRole('link', { name: 'Cancelar' })).toHaveAttribute('href', '/perto');
    const botao = screen.getByRole('button', { name: 'Cadastrar entrada' });
    expect(botao).toHaveAttribute('type', 'submit');
    expect(botao).toHaveAttribute('data-cy', 'entrada-salvar');
    expect(botao).not.toBeDisabled();
    expect(botao).not.toHaveAttribute('aria-busy');
    expect(container.querySelector('.spin')).toBeNull();
  });

  it('gravando: `aria-busy`, desabilitado e a ampulheta -- os tres juntos', () => {
    const { container } = comRota(
      <RodapeDoFormulario cancelarPara="/perto" rotulo="Salvar alterações" salvando dataCy="entrada-salvar" />,
    );
    const botao = screen.getByRole('button', { name: 'Salvar alterações' });
    expect(botao).toHaveAttribute('aria-busy', 'true');
    expect(botao).toBeDisabled();
    expect(container.querySelector('.spin')).not.toBeNull();
  });

  it('o rodape mora em `.rodape-form`, que e o que o CSS do painel desenha', () => {
    const { container } = comRota(
      <RodapeDoFormulario cancelarPara="/loja/parceiros" rotulo="Cadastrar parceiro" salvando={false} />,
    );
    expect(container.querySelector('.rodape-form')).not.toBeNull();
  });
});

/** Uma tela de mentira que so expoe a maquina de carga. */
function TelaDeCarga({ identidade, carregaSempre }: { identidade: string | undefined; carregaSempre?: boolean }) {
  const { chave, fase, definir, recarregar } = useCargaDoFormulario(
    identidade,
    carregaSempre === undefined ? undefined : { carregaSempre },
  );
  return (
    <>
      <p data-testid="fase">{fase}</p>
      <p data-testid="chave">{chave}</p>
      <button type="button" onClick={() => definir({ chave, fase: 'pronto' })}>
        responder agora
      </button>
      <button type="button" onClick={() => definir({ chave: 'chave-vencida#0', fase: 'erro' })}>
        responder vencido
      </button>
      <button type="button" onClick={recarregar}>
        recarregar
      </button>
    </>
  );
}

describe('(1) a maquina de carga por chave', () => {
  it('cadastro NOVO ja nasce pronto: nao ha registro para buscar', () => {
    comRota(<TelaDeCarga identidade={undefined} />);
    expect(screen.getByTestId('fase')).toHaveTextContent('pronto');
  });

  it('edicao nasce `carregando`', () => {
    comRota(<TelaDeCarga identidade="loja-do-bairro" />);
    expect(screen.getByTestId('fase')).toHaveTextContent('carregando');
  });

  it('`carregaSempre` carrega até no cadastro novo -- e o caso do Produto', () => {
    comRota(<TelaDeCarga identidade={undefined} carregaSempre />);
    expect(screen.getByTestId('fase')).toHaveTextContent('carregando');
    expect(screen.getByTestId('chave')).toHaveTextContent('novo#0');
  });

  it('a resposta DESTA carga pinta a tela', () => {
    comRota(<TelaDeCarga identidade="loja-do-bairro" />);
    fireEvent.click(screen.getByRole('button', { name: 'responder agora' }));
    expect(screen.getByTestId('fase')).toHaveTextContent('pronto');
  });

  it('a resposta de uma carga VENCIDA nao pinta a tela', () => {
    comRota(<TelaDeCarga identidade="loja-do-bairro" />);
    fireEvent.click(screen.getByRole('button', { name: 'responder vencido' }));
    expect(screen.getByTestId('fase')).toHaveTextContent('carregando');
  });

  it('`recarregar` troca a chave e volta para `carregando`', () => {
    comRota(<TelaDeCarga identidade="loja-do-bairro" />);
    fireEvent.click(screen.getByRole('button', { name: 'responder agora' }));
    expect(screen.getByTestId('fase')).toHaveTextContent('pronto');
    fireEvent.click(screen.getByRole('button', { name: 'recarregar' }));
    expect(screen.getByTestId('fase')).toHaveTextContent('carregando');
    expect(screen.getByTestId('chave')).toHaveTextContent('loja-do-bairro#1');
  });
});

describe('(1) `carregarPorChave`: o abortar e o `catch` que estavam copiados', () => {
  it('grava a fase que a busca devolveu', async () => {
    const definir = vi.fn();
    carregarPorChave('x#0', definir, () => Promise.resolve<FaseGravada>('pronto'));
    await waitFor(() => {
      expect(definir).toHaveBeenCalledWith({ chave: 'x#0', fase: 'pronto' });
    });
  });

  it('`undefined` nao pinta nada -- era o `if (aborted) return` do meio', async () => {
    const definir = vi.fn();
    const chegou = carregarPorChave('x#0', definir, () => Promise.resolve(undefined));
    await new Promise((r) => setTimeout(r, 0));
    expect(definir).not.toHaveBeenCalled();
    chegou();
  });

  it('busca que estourou vira `erro`, e nao excecao solta', async () => {
    const definir = vi.fn();
    carregarPorChave('x#0', definir, () => Promise.reject(new Error('rede caiu')));
    await waitFor(() => {
      expect(definir).toHaveBeenCalledWith({ chave: 'x#0', fase: 'erro' });
    });
  });

  it('a limpeza ABORTA, e resposta de carga abortada nao pinta a tela', async () => {
    const definir = vi.fn();
    let visto: AbortSignal | undefined;
    const limpar = carregarPorChave('x#0', definir, (sinal) => {
      visto = sinal;
      return new Promise<FaseGravada>((resolver) => setTimeout(() => resolver('pronto'), 5));
    });
    limpar();
    expect(visto?.aborted).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(definir).not.toHaveBeenCalled();
  });

  it('abortada DEPOIS de estourar tambem fica calada', async () => {
    const definir = vi.fn();
    const limpar = carregarPorChave('x#0', definir, () => Promise.reject(new Error('rede caiu')));
    limpar();
    await new Promise((r) => setTimeout(r, 20));
    expect(definir).not.toHaveBeenCalled();
  });
});

function TelaComRascunho({ rota }: { rota: string }) {
  const [valor, setValor] = useState('primeiro');
  useRascunhoDoFormulario(rota, { nome: valor, arquivo: 'blob:nao-sobrevive' }, (v) => ({ nome: v.nome }));
  return (
    <button type="button" onClick={() => setValor('último')}>
      mudar
    </button>
  );
}

describe('(1) o rascunho da sessao guarda o ULTIMO valor, recortado', () => {
  it('guarda o valor mais recente, e nao o da renderizacao do registro', () => {
    sessionStorage.clear();
    comRota(<TelaComRascunho rota="/loja/parceiros/novo" />);
    fireEvent.click(screen.getByRole('button', { name: 'mudar' }));
    expect(rascunhosRegistrados).toHaveLength(1);
    rascunhosRegistrados[0]?.();
    expect(sessionStorage.getItem('bichu-adm-rascunho:/loja/parceiros/novo')).toBe('{"nome":"último"}');
  });

  it('o recorte sai: o que nao sobrevive a recarga nao e guardado', () => {
    sessionStorage.clear();
    comRota(<TelaComRascunho rota="/loja/parceiros/novo" />);
    rascunhosRegistrados[0]?.();
    expect(sessionStorage.getItem('bichu-adm-rascunho:/loja/parceiros/novo')).not.toContain('blob:');
  });
});

// ===========================================================================
// (2) ISCA: a casca nao pode ser copiada de volta para dentro dos formularios
// ===========================================================================

const FONTE = path.join(import.meta.dirname, '..', 'src');
const CAMINHO_DA_CASCA = 'componentes/casca-de-formulario.tsx';

/** Os cinco formularios do painel. Formulario novo entra NESTA lista. */
const FORMULARIOS = [
  'diretorio/FormularioDaEntrada.tsx',
  'loja/FormularioDeParceiro.tsx',
  'loja/FormularioDeProduto.tsx',
  'comunicados/FormularioDeComunicado.tsx',
  'rede/telas/FormularioDoEncontro.tsx',
] as const;

/**
 * Le a fonte do painel e REPROVA ALTO quando nao acha o arquivo: leitura que
 * devolvesse cadeia vazia faria toda assercao de ausencia passar no vazio.
 */
function lerDoPainel(relativo: string): string {
  const texto = readFileSync(path.join(FONTE, relativo), 'utf8');
  if (texto.trim().length === 0) throw new Error(`${relativo} veio VAZIO: a isca mediria o nada.`);
  return texto;
}

/**
 * Cada marcador e um pedaco da casca que estava copiado. `so` limita o
 * marcador aos formularios que de fato terceirizaram aquela peca -- o rodape do
 * Produto, do Comunicado e do Encontro tem botao proprio, e continuar com
 * `rodape-form` la e desenho, nao copia.
 */
const MARCADORES: { marcador: string; oQueE: string; so?: readonly string[] }[] = [
  { marcador: 'requestAnimationFrame(', oQueE: 'o foco no resumo de erros (`useResumoDeErros`)' },
  { marcador: 'btn ghost voltar', oQueE: 'o link de voltar (`VoltarPara`)' },
  { marcador: 'new AbortController()', oQueE: 'o abortar da carga (`carregarPorChave`)' },
  { marcador: 'registrarRascunho', oQueE: 'o rascunho da sessao (`useRascunhoDoFormulario`)' },
  { marcador: '<ResumoDeErros', oQueE: 'o resumo de erros cru (`ResumoDosCampos`)' },
  { marcador: 'Corrija ${', oQueE: 'o titulo `Corrija N campos para …` (`ResumoDosCampos`)' },
  {
    marcador: 'rodape-form',
    oQueE: 'o rodape `Cancelar` + envio (`RodapeDoFormulario`)',
    so: ['diretorio/FormularioDaEntrada.tsx', 'loja/FormularioDeParceiro.tsx'],
  },
  {
    marcador: 'spin" aria-hidden',
    oQueE: 'a ampulheta do botao de envio (`RodapeDoFormulario`)',
    so: ['diretorio/FormularioDaEntrada.tsx', 'loja/FormularioDeParceiro.tsx'],
  },
];

describe('(2) ISCA: a casca dos formularios do painel mora num lugar so', () => {
  it('CONTROLE POSITIVO: todo marcador procurado existe DENTRO da casca', () => {
    const casca = lerDoPainel(CAMINHO_DA_CASCA);
    for (const { marcador, oQueE } of MARCADORES) {
      expect(
        casca.includes(marcador),
        `REPROVA: o marcador ${JSON.stringify(marcador)} (${oQueE}) nao existe em ` +
          `${CAMINHO_DA_CASCA}. Sem ele na casca, a busca pelos formularios daria ` +
          `zero por erro de digitacao e a isca passaria sem medir nada.`,
      ).toBe(true);
    }
  });

  it.each(FORMULARIOS)('%s consome a casca compartilhada', (formulario) => {
    expect(
      lerDoPainel(formulario),
      `REPROVA: \`${formulario}\` nao importa \`${CAMINHO_DA_CASCA}\`. Formulario do ` +
        `painel que nao consome a casca tem uma casca propria, e duas copias da ` +
        `mesma regra divergem na primeira edicao -- que e o defeito que esta ` +
        `refatoracao conserta.`,
      // `../` ou `../../`: o Encontro mora um nivel mais fundo (`rede/telas/`).
    ).toContain("componentes/casca-de-formulario.tsx'");
  });

  it.each(FORMULARIOS)('%s nao tem copia PRIVADA de nenhuma peca da casca', (formulario) => {
    const fonte = lerDoPainel(formulario);
    for (const { marcador, oQueE, so } of MARCADORES) {
      if (so && !so.includes(formulario)) continue;
      expect(
        fonte.includes(marcador),
        `REPROVA: \`${formulario}\` voltou a ter ${oQueE} em casa -- achei ` +
          `${JSON.stringify(marcador)} na fonte. Essa peca saiu para ` +
          `\`${CAMINHO_DA_CASCA}\`, e deixar as duas e deixar a divergencia nascer.`,
      ).toBe(false);
    }
  });
});
