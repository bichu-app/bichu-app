/**
 * O COMUNICADO no painel, em pares de ISCA e CONTRAPESO.
 *
 * A isca de cada par quebra a regra de proposito e precisa REPROVAR a tela (o
 * disparo trava, e nada sai para o servidor); o contrapeso do lado prova que o
 * caminho bom continua funcionando, para que "tudo travado" nao passe por
 * conferencia verde.
 *
 * As tres regras sob conferencia: previa obrigatoria antes do disparo (e previa
 * vencida trava de novo), teto diario travado NA TELA e tambem tratado no
 * `409`, e registro irreversivel -- sem apagar e sem editar em lugar nenhum.
 *
 * A previa le `getAdminBroadcastDispatchWindow`, um `GET` sem corpo que NAO
 * leva o rascunho para a rede: o servidor da os numeros, e o painel renderiza
 * o texto que ja tem na mao. E por isso que as conferencias de texto puro
 * daqui nao dependem de o servidor devolver nada -- o que a caixa de previa
 * mostra e o que o operador digitou.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { rotasDosComunicados } from '../src/comunicados/rotas.tsx';
import { criarRotas } from '../src/rotas.tsx';
import { comunicado, janelaDeDisparo, pagina } from './apoio/massa.ts';
import { criarServidorFalso, json, problema, SESSAO, type Resposta, type Rota } from './apoio/servidor-falso.ts';

function montar(caminho: string, rotas: Record<string, Rota | Resposta>) {
  const servidor = criarServidorFalso({ 'GET /admin/session': json(200, SESSAO), ...rotas });
  const router = createMemoryRouter(criarRotas({ fetch: servidor.fetch, navegarParaFora: vi.fn() }), { initialEntries: [caminho] });
  render(<RouterProvider router={router} />);
  return { servidor, router };
}

/** As rotas do formulario: a janela de disparo, o disparo, e a lista do retorno. */
function rotasDoFormulario(janela: Resposta | Rota, disparo?: Resposta | Rota): Record<string, Rota | Resposta> {
  return {
    'GET /admin/broadcasts/dispatch-window': janela,
    ...(disparo ? { 'POST /admin/broadcasts': disparo } : {}),
    'GET /admin/broadcasts': json(200, pagina([comunicado()])),
  };
}

const TITULO = 'Mutirão de castração no sábado';
const CORPO = 'A prefeitura abriu 120 vagas para castração gratuita.';

async function escrever(titulo = TITULO, corpo = CORPO) {
  fireEvent.change(await screen.findByLabelText('Título *'), { target: { value: titulo } });
  fireEvent.change(screen.getByLabelText('Mensagem *'), { target: { value: corpo } });
}

const botaoDeDisparo = () => screen.getByRole('button', { name: 'Disparar comunicado' });

/** Os POST que criaram comunicado de verdade (a janela e um GET e nao escreve). */
function disparos(requisicoes: { metodo: string; caminho: string }[]) {
  return requisicoes.filter((r) => r.metodo === 'POST' && r.caminho === '/admin/broadcasts');
}

/** As leituras da janela de disparo, que e o que "Ver prévia" faz no servidor. */
function janelas(requisicoes: { metodo: string; caminho: string }[]) {
  return requisicoes.filter((r) => r.metodo === 'GET' && r.caminho === '/admin/broadcasts/dispatch-window');
}

/** O que a caixa de previa esta mostrando como corpo, agora. */
function corpoDaPrevia(): HTMLElement {
  const el = document.querySelector('[data-cy="previa-corpo"]');
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

/**
 * O corpo da previa, para comparacao EXATA.
 *
 * Nao use `toHaveTextContent` para isto: ele casa por SUBSTRING, e uma previa
 * que mostrasse o texto ATUAL (mais longo, porque o teste acrescenta uma frase)
 * em vez do texto CONFERIDO passaria por ele sem reclamar. Foi o que um mutante
 * provou.
 */
function textoDaPrevia(): string | null {
  return corpoDaPrevia().textContent;
}

function tituloDaPrevia(): string | null {
  const el = document.querySelector('[data-cy="previa-titulo"]');
  expect(el).not.toBeNull();
  return (el as HTMLElement).textContent;
}

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('comunicado: a previa e a condicao do disparo', () => {
  it('ISCA: texto escrito e NAO conferido na previa nao dispara, e nada sai para o servidor', async () => {
    const { servidor } = montar('/comunicados/novo', rotasDoFormulario(json(200, janelaDeDisparo()), json(201, comunicado())));
    await escrever();
    expect(botaoDeDisparo()).toBeDisabled();
    expect(
      screen.getByText('Veja a prévia antes de disparar. O comunicado não pode ser desfeito nem apagado.'),
    ).toBeInTheDocument();
    // O botao desligado nao basta como prova: o clique nao pode abrir o
    // dialogo nem mandar nada.
    fireEvent.click(botaoDeDisparo());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(disparos(servidor.requisicoes)).toHaveLength(0);
    // E a previa nem foi pedida: nada no servidor foi tocado por este texto.
    expect(janelas(servidor.requisicoes)).toHaveLength(0);
  });

  it('CONTRAPESO: com a previa do texto atual, o disparo abre e o POST leva o titulo e o corpo digitados', async () => {
    const { servidor, router } = montar(
      '/comunicados/novo',
      rotasDoFormulario(json(200, janelaDeDisparo({ would_reach: 1240, remaining_today: 3, daily_cap: 3 })), json(201, comunicado({ recipients_total: 1240 }))),
    );
    await escrever();
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    // A previa mostra o alcance e o que ainda cabe hoje, que e o que o
    // operador precisa saber ANTES de apertar o botao.
    expect(await screen.findByText('Alcança agora 1.240 caixas de notificação.')).toBeInTheDocument();
    expect(screen.getByText('Ainda cabem 3 comunicados hoje, do teto de 3 por dia.')).toBeInTheDocument();
    // A previa foi UMA leitura da janela, e nenhum POST levou o rascunho a rede.
    expect(janelas(servidor.requisicoes)).toHaveLength(1);
    expect(disparos(servidor.requisicoes)).toHaveLength(0);
    // E o texto na caixa de previa e o do operador, vindo da tela.
    expect(tituloDaPrevia()).toBe(TITULO);
    expect(textoDaPrevia()).toBe(CORPO);
    await waitFor(() => expect(botaoDeDisparo()).toBeEnabled());

    fireEvent.click(botaoDeDisparo());
    const dialogo = screen.getByRole('alertdialog', { name: `Disparar “${TITULO}”?` });
    expect(dialogo).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Disparar agora' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/comunicados'));
    const feitos = disparos(servidor.requisicoes);
    expect(feitos).toHaveLength(1);
    expect(servidor.requisicoes.find((r) => r.caminho === '/admin/broadcasts' && r.metodo === 'POST')?.corpo).toEqual({
      title: TITULO,
      body: CORPO,
    });
    expect(await screen.findByText(/Comunicado disparado para 1\.240 caixas de notificação/)).toBeInTheDocument();
  });

  it('ISCA: texto alterado DEPOIS da previa vence a previa, trava o disparo de novo e nao manda nada', async () => {
    const { servidor } = montar('/comunicados/novo', rotasDoFormulario(json(200, janelaDeDisparo()), json(201, comunicado())));
    await escrever();
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    await waitFor(() => expect(botaoDeDisparo()).toBeEnabled());

    fireEvent.change(screen.getByLabelText('Mensagem *'), { target: { value: `${CORPO} As inscrições vão até sexta.` } });
    await waitFor(() => expect(botaoDeDisparo()).toBeDisabled());
    expect(
      screen.getAllByText('O texto mudou depois da prévia. Veja a prévia de novo antes de disparar.').length,
    ).toBeGreaterThan(0);
    fireEvent.click(botaoDeDisparo());
    expect(disparos(servidor.requisicoes)).toHaveLength(0);
    // A previa VENCIDA continua na tela mostrando o que foi conferido, e nao o
    // que esta sendo digitado agora: ela e a referencia de quem esta
    // corrigindo. Comparacao EXATA: o texto digitado agora tem o conferido como
    // prefixo, e um casamento por substring nao distinguiria os dois.
    expect(textoDaPrevia()).toBe(CORPO);
  });

  it('CONTRAPESO: pedir a previa de novo destrava o disparo do texto novo', async () => {
    const novoCorpo = `${CORPO} As inscrições vão até sexta.`;
    const { servidor } = montar('/comunicados/novo', rotasDoFormulario(json(200, janelaDeDisparo()), json(201, comunicado())));
    await escrever();
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    await waitFor(() => expect(botaoDeDisparo()).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Mensagem *'), { target: { value: novoCorpo } });
    await waitFor(() => expect(botaoDeDisparo()).toBeDisabled());

    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    await waitFor(() => expect(botaoDeDisparo()).toBeEnabled());
    // A previa nova mostra o texto novo, e foram DUAS leituras da janela.
    expect(textoDaPrevia()).toBe(novoCorpo);
    expect(janelas(servidor.requisicoes)).toHaveLength(2);
    fireEvent.click(botaoDeDisparo());
    fireEvent.click(screen.getByRole('button', { name: 'Disparar agora' }));
    await waitFor(() => expect(disparos(servidor.requisicoes)).toHaveLength(1));
    expect((servidor.requisicoes.find((r) => r.metodo === 'POST' && r.caminho === '/admin/broadcasts')?.corpo as { body: string }).body).toBe(novoCorpo);
  });
});

describe('comunicado: o teto de 3 por dia', () => {
  it('ISCA: `remaining_today: 0` trava o disparo NA TELA, com o motivo escrito, sem tentar o servidor', async () => {
    const { servidor } = montar('/comunicados/novo', rotasDoFormulario(json(200, janelaDeDisparo({ remaining_today: 0 })), json(201, comunicado())));
    await escrever();
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    expect(await screen.findByText('Nenhum comunicado cabe mais hoje: o teto é de 3 por dia.')).toBeInTheDocument();
    expect(botaoDeDisparo()).toBeDisabled();
    expect(
      screen.getByText('O teto de 3 comunicados por dia já foi atingido. O próximo pode sair amanhã.'),
    ).toBeInTheDocument();
    fireEvent.click(botaoDeDisparo());
    expect(disparos(servidor.requisicoes)).toHaveLength(0);
  });

  it('CONTRAPESO: `remaining_today: 1` libera o disparo, e o dialogo diz que e o ultimo de hoje', async () => {
    montar('/comunicados/novo', rotasDoFormulario(json(200, janelaDeDisparo({ remaining_today: 1 })), json(201, comunicado())));
    await escrever();
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    expect(await screen.findByText('Ainda cabe 1 comunicado hoje, do teto de 3 por dia.')).toBeInTheDocument();
    await waitFor(() => expect(botaoDeDisparo()).toBeEnabled());
    expect(screen.queryByText('O teto de 3 comunicados por dia já foi atingido. O próximo pode sair amanhã.')).toBeNull();
    fireEvent.click(botaoDeDisparo());
    expect(screen.getByText('Este é o último comunicado que cabe hoje.')).toBeInTheDocument();
  });

  it('ISCA: o teto exibido e o `daily_cap` DO SERVIDOR, e nao um 3 fixo no painel', async () => {
    // `daily_cap: 2` nao e o teto de hoje (3). Um painel que guardasse a sua
    // propria copia do numero diria "3" aqui, e e esse o defeito sob
    // conferencia: duas copias do mesmo numero divergem.
    montar('/comunicados/novo', rotasDoFormulario(json(200, janelaDeDisparo({ remaining_today: 0, daily_cap: 2 })), json(201, comunicado())));
    await escrever();
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    expect(await screen.findByText('Nenhum comunicado cabe mais hoje: o teto é de 2 por dia.')).toBeInTheDocument();
    expect(screen.getByText('O teto de 2 comunicados por dia já foi atingido. O próximo pode sair amanhã.')).toBeInTheDocument();
    expect(screen.queryByText(/teto de 3/)).toBeNull();
    expect(botaoDeDisparo()).toBeDisabled();
  });

  it('ISCA: o 409 `broadcast-daily-cap-reached` vira mensagem de TETO, e nao o erro genérico', async () => {
    montar(
      '/comunicados/novo',
      rotasDoFormulario(json(200, janelaDeDisparo({ remaining_today: 1 })), problema(409, 'broadcast-daily-cap-reached')),
    );
    await escrever();
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    await waitFor(() => expect(botaoDeDisparo()).toBeEnabled());
    fireEvent.click(botaoDeDisparo());
    fireEvent.click(screen.getByRole('button', { name: 'Disparar agora' }));

    // O teto batido por OUTRA pessoa entre a previa e o clique: a tela decide
    // pelo slug do problema, e diz que nada foi enviado.
    expect(
      await screen.findByText(
        'O teto de 3 comunicados por dia já foi atingido, provavelmente por outra pessoa. Nada foi enviado, e o próximo comunicado pode sair amanhã.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Não conseguimos falar com o servidor. Confira a internet e tente de novo. Nada foi enviado.')).toBeNull();
    expect(screen.queryByText('O servidor recusou o texto. Confira o título e a mensagem.')).toBeNull();
  });
});

describe('comunicado: texto puro, nunca HTML', () => {
  it('ISCA: `<b>negrito</b>` no rascunho aparece com os sinais na tela e NAO cria elemento <b>', async () => {
    const comMarcacao = 'Atenção: <b>negrito</b> e <script>alert(1)</script> são letras.';
    // A janela nao devolve texto nenhum: o que a caixa mostra e o que o
    // operador digitou, e e exatamente isso que esta sob conferencia.
    montar('/comunicados/novo', rotasDoFormulario(json(200, janelaDeDisparo())));
    await escrever(TITULO, comMarcacao);
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));

    const caixa = await waitFor(() => {
      const el = document.querySelector('[data-cy="comunicado-previa-caixa"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(caixa.querySelector('[data-cy="previa-corpo"]')).toHaveTextContent(comMarcacao);
    // A prova da isca: nenhum elemento nasceu do texto.
    expect(caixa.querySelector('b')).toBeNull();
    expect(caixa.querySelector('script')).toBeNull();
  });

  it('CONTRAPESO: a quebra de linha do rascunho sobrevive por CSS, e o corpo continua um nó de texto', async () => {
    const duasLinhas = 'Primeira linha.\nSegunda linha.';
    montar('/comunicados/novo', rotasDoFormulario(json(200, janelaDeDisparo())));
    await escrever(TITULO, duasLinhas);
    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));

    const corpo = await waitFor(() => corpoDaPrevia());
    // O `\n` esta no texto, e nao virou `<br>`: quem preserva a quebra e o
    // `white-space: pre-wrap` da folha.
    expect(corpo.textContent).toBe(duasLinhas);
    expect(corpo.querySelector('br')).toBeNull();
    expect(corpo.childElementCount).toBe(0);
  });
});

describe('comunicado: a lista e o registro permanente', () => {
  it('CONTRAPESO: a lista mostra quem mandou e quantas caixas alcançou', async () => {
    const { servidor } = montar('/comunicados', {
      'GET /admin/broadcasts': json(200, pagina([comunicado({ dispatched_by: 'Rafael Lima', recipients_total: 1240 })])),
    });
    expect(await screen.findByText('1 comunicado')).toBeInTheDocument();
    // Dentro da LINHA: o nome de quem opera o painel tambem aparece no rodape
    // da navegacao, e uma busca na tela inteira nao provaria que a coluna
    // "Quem mandou" mostra alguma coisa.
    const linha = screen.getAllByRole('row')[1]!;
    expect(within(linha).getByText(TITULO)).toBeInTheDocument();
    expect(within(linha).getByText('Rafael Lima')).toBeInTheDocument();
    expect(within(linha).getByText('1.240')).toBeInTheDocument();
    expect(within(linha).getByText(/A prefeitura abriu 120 vagas/)).toBeInTheDocument();
    const q = servidor.requisicoes.find((r) => r.caminho === '/admin/broadcasts')!.busca;
    expect(q.get('limit')).toBe('20');
    expect(q.get('page')).toBe('1');
  });

  it('ISCA: a lista NAO oferece apagar nem editar em lugar nenhum -- comunicado e irreversível', async () => {
    montar('/comunicados', {
      'GET /admin/broadcasts': json(200, pagina([comunicado(), comunicado({ ref: 'cmb-20261017-02', title: 'Feira de adoção no domingo', dispatched_by: 'Rafael Lima' })], 2)),
    });
    await screen.findByText('2 comunicados');
    for (const proibido of [/apagar/i, /excluir/i, /remover/i, /editar/i, /desfazer/i, /cancelar/i, /mais ações/i]) {
      expect(screen.queryAllByRole('button', { name: proibido })).toEqual([]);
      expect(screen.queryAllByRole('link', { name: proibido })).toEqual([]);
      expect(screen.queryAllByRole('menuitem', { name: proibido })).toEqual([]);
    }
    // E nenhuma linha leva a uma tela de item: nao existe rota de detalhe.
    const linhas = screen.getAllByRole('row').slice(1);
    expect(linhas).toHaveLength(2);
    for (const linha of linhas) expect(linha.querySelectorAll('a, button')).toHaveLength(0);
  });

  it('a lista vazia convida ao primeiro comunicado, e diz que ele é permanente', async () => {
    montar('/comunicados', { 'GET /admin/broadcasts': json(200, pagina([])) });
    expect(await screen.findByText('Nenhum comunicado disparado')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Quando um comunicado for disparado, ele fica registrado aqui para sempre: o texto, quem mandou e quantas caixas ele alcançou.',
      ),
    ).toBeInTheDocument();
    // Dois caminhos para o primeiro comunicado: o do cabecalho e o do estado vazio.
    expect(screen.getAllByRole('link', { name: 'Novo comunicado' })).toHaveLength(2);
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('comunicado: as rotas montadas', () => {
  it('a linha embutida em src/rotas.tsx monta as MESMAS rotas que comunicados/rotas.tsx declara', () => {
    const raiz = criarRotas().find((r) => r.path === '/');
    const ramo = raiz?.children?.find((r) => r.path === 'comunicados');
    const forma = (rs: RouteObject[] | undefined) => (rs ?? []).map((r) => (r.index ? 'index' : (r.path ?? '?')));
    expect(forma(ramo?.children)).toEqual(['index', 'novo']);
    expect(forma(ramo?.children)).toEqual(forma(rotasDosComunicados));
    // Nenhuma rota de detalhe nem de edicao, nos dois lugares.
    expect(forma(rotasDosComunicados).some((p) => p.includes(':'))).toBe(false);
  });
});
