/**
 * A tela da fila de duvidas, montada com as rotas de verdade.
 *
 * O caso que importa mais e `a fila LE o que o app gravou`: ele e a isca
 * contra o defeito que esta tela existe para impedir -- dado gravado que
 * nenhum humano alcanca, como o passkey foi entregue.
 *
 * | mexa em | reprova |
 * |---|---|
 * | tirar `...rotasDaAjuda` de `src/rotas.tsx` | todos (a rota nao abre) |
 * | trocar o caminho em `FilaDeAjuda.tsx` | `a fila LE o que o app gravou` |
 * | mostrar o autor | `a tela nao mostra autor nenhum` |
 * | engolir a falha de carga | `falha de carga vira banner com Tentar de novo` |
 * | nao abrir o dialogo | `abrir uma duvida mostra o texto inteiro` |
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { criarRotas } from '../../src/rotas.tsx';
import { pagina } from '../apoio/massa.ts';
import {
  criarServidorFalso,
  json,
  problema,
  SESSAO,
  type Resposta,
  type Rota,
} from '../apoio/servidor-falso.ts';

function duvida(extra: Record<string, unknown> = {}) {
  return {
    ref: 'AAAAAAAAAAAAAAAAAAAAAA',
    subject: 'Não salva o segundo pet',
    body: 'A tela volta para o começo quando eu aperto salvar.\n\nJá tentei pelo Wi-Fi.',
    created_at: '2026-10-29T23:14:54.000Z',
    status: 'open',
    ...extra,
  };
}

/** `pagina` da massa nao conhece `pending_total`; a fila do painel exige. */
function paginaDaFila(itens: ReturnType<typeof duvida>[], pendentes = itens.length) {
  return { ...pagina(itens), pending_total: pendentes };
}

function montar(rotas: Record<string, Rota | Resposta>) {
  const servidor = criarServidorFalso({ 'GET /admin/session': json(200, SESSAO), ...rotas });
  const router = createMemoryRouter(
    criarRotas({ fetch: servidor.fetch, navegarParaFora: vi.fn() }),
    { initialEntries: ['/ajuda'] },
  );
  render(<RouterProvider router={router} />);
  return { servidor };
}

describe('`Ajuda` — a fila de dúvidas no painel', () => {
  it('a fila LÊ o que o app gravou', async () => {
    const { servidor } = montar({
      'GET /admin/help-requests': json(200, paginaDaFila([duvida()])),
    });

    expect(await screen.findByText('Não salva o segundo pet')).toBeInTheDocument();

    const pedido = servidor.requisicoes.find((r) => r.caminho === '/admin/help-requests');
    expect(
      pedido,
      'REPROVA: a tela não chamou `GET /v1/admin/help-requests`. Sem esta chamada a ' +
        'dúvida fica gravada e nenhum humano a alcança — que é como o passkey foi ' +
        'entregue, com o banco em zero credenciais e nenhum portão acusando.',
    ).toBeDefined();
    expect(pedido!.busca.get('limit')).toBe('50');
    expect(pedido!.busca.get('page')).toBe('1');
    expect(
      pedido!.busca.get('status'),
      'REPROVA: a tela não pediu a aba aberta. Sem `status=open` ela mistura o que ' +
        'espera com o que já foi atendido, e a fila deixa de ser uma fila.',
    ).toBe('open');
  });

  it('a tela não mostra autor nenhum', async () => {
    const { servidor } = montar({
      'GET /admin/help-requests': json(200, paginaDaFila([duvida()])),
    });
    await screen.findByText('Não salva o segundo pet');

    // A âncora acima garante que a varredura abaixo olha a tela carregada, e
    // não uma tela vazia que passaria por não ter texto nenhum.
    const corpo = document.body.textContent ?? '';
    for (const proibido of ['@', 'Autor', 'autor', 'Tutor', 'E-mail']) {
      expect(
        corpo.includes(proibido),
        `REPROVA: a tela mostra "${proibido}". Este painel lê pessoa num lugar só — a ` +
          'fila de pedidos de encontro —, e o contrato afirma isso em TRÊS pontos com ' +
          'as decisões D53 a D57. `AdminHelpRequest` nem traz campo de autor, então ' +
          'isto só aparece se alguém o acrescentou ao contrato.',
      ).toBe(false);
    }
    // E o servidor falso não devolveu campo de pessoa: se devolvesse, o caso
    // acima estaria medindo a massa e não a tela.
    expect(Object.keys(duvida()).sort()).toEqual([
      'body',
      'created_at',
      'ref',
      'status',
      'subject',
    ]);
    expect(servidor.requisicoes.length).toBeGreaterThan(0);
  });

  it('abrir uma dúvida mostra o texto inteiro, com os parágrafos', async () => {
    montar({ 'GET /admin/help-requests': json(200, paginaDaFila([duvida()])) });
    await screen.findByText('Não salva o segundo pet');

    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));

    const dialogo = await screen.findByRole('dialog');
    expect(
      within(dialogo).getByText(/Já tentei pelo Wi-Fi/),
      'REPROVA: o diálogo não trouxe o fim do texto. A linha da tabela mostra uma ' +
        'prévia cortada; se o diálogo cortar também, o fim da dúvida — onde o tutor ' +
        'diz o que já tentou — não é lido por ninguém.',
    ).toBeInTheDocument();
  });

  it('falha de carga vira banner com Tentar de novo, e recarrega', async () => {
    let falhar = true;
    montar({
      'GET /admin/help-requests': () =>
        falhar ? problema(500, 'internal') : json(200, paginaDaFila([duvida()])),
    });

    expect(await screen.findByText('Não conseguimos carregar a fila.')).toBeInTheDocument();
    falhar = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Não salva o segundo pet')).toBeInTheDocument();
  });

  it('fila vazia diz que ninguém perguntou, e não finge erro', async () => {
    montar({ 'GET /admin/help-requests': json(200, paginaDaFila([], 0)) });
    expect(await screen.findByText('Nada por aqui')).toBeInTheDocument();
    expect(screen.getByText('Ninguém mandou dúvida ainda.')).toBeInTheDocument();
  });

  it('a busca é local e o vazio dela diz que o recorte é da PÁGINA', async () => {
    montar({ 'GET /admin/help-requests': json(200, paginaDaFila([duvida()])) });
    await screen.findByText('Não salva o segundo pet');

    fireEvent.change(screen.getByLabelText('Buscar dúvida'), {
      target: { value: 'plaquinha' },
    });

    await waitFor(() =>
      expect(screen.getByText('Nenhuma dúvida desta página casa com a busca.')).toBeInTheDocument(),
    );
  });

  it('o aviso de que não dá para responder está na tela', async () => {
    montar({ 'GET /admin/help-requests': json(200, paginaDaFila([duvida()])) });
    // Pelo `data-cy` e nao pela frase: o texto do aviso e copy e vai ser
    // reescrito; o que este caso protege e que o aviso EXISTA.
    await screen.findByText('Não salva o segundo pet');
    const aviso = document.querySelector('[data-cy="aviso-sem-resposta"]');
    expect(aviso?.textContent ?? '').toMatch(/responder/);
    expect(
      aviso,
      'REPROVA: a tela não diz ao operador que não há como responder. Deixá-lo ' +
        'procurar um botão que não existe é pior do que dizer a limitação.',
    ).toBeInTheDocument();
  });
});

describe('o ESTADO da dúvida (cliente, 30/10/2026)', () => {
  function atendida(extra: Record<string, unknown> = {}) {
    return duvida({
      ref: 'BBBBBBBBBBBBBBBBBBBBBB',
      subject: 'Já respondida',
      status: 'attended',
      attended_at: '2026-10-30T10:00:00.000Z',
      attended_by: 'Rita da Operacao',
      ...extra,
    });
  }

  it('marcar como atendida CHAMA a rota e recarrega a fila', async () => {
    let jaMarcou = false;
    const { servidor } = montar({
      'GET /admin/help-requests': () =>
        json(200, jaMarcou ? paginaDaFila([], 0) : paginaDaFila([duvida()])),
      'POST /admin/help-requests/{ref}/attendance': () => {
        jaMarcou = true;
        return json(200, atendida({ ref: 'AAAAAAAAAAAAAAAAAAAAAA' }));
      },
    });

    await screen.findByText('Não salva o segundo pet');
    fireEvent.click(screen.getByRole('button', { name: 'Marcar atendida' }));

    await waitFor(() =>
      expect(
        servidor.requisicoes.some(
          (r) => r.metodo === 'POST' && r.caminho.endsWith('/attendance'),
        ),
        'REPROVA: o botão não chamou a rota de atendimento. Um botão que troca o selo ' +
          'na tela e não escreve no servidor faz a operadora acreditar que fechou um ' +
          'trabalho que continua na fila de todo mundo.',
      ).toBe(true),
    );

    // Recarregar e não trocar o item no lugar: a aba é `open` e a dúvida saiu
    // dela. Deixá-la ali com o selo trocado mostraria em `Na fila` uma dúvida
    // que já não pertence à aba.
    expect(await screen.findByText('Nada por aqui')).toBeInTheDocument();
  });

  it('a aba `Atendidas` pede `status=attended` e mostra quem marcou', async () => {
    const { servidor } = montar({
      'GET /admin/help-requests': (req) =>
        json(
          200,
          req.busca.get('status') === 'attended'
            ? paginaDaFila([atendida()], 0)
            : paginaDaFila([duvida()], 1),
        ),
    });

    await screen.findByText('Não salva o segundo pet');
    // Os chips sao `role="radio"` num `radiogroup`, e nao `button`: a barra de
    // listagem os desenha como escolha unica, que e o que uma aba e.
    fireEvent.click(screen.getByRole('radio', { name: 'Atendidas' }));

    expect(await screen.findByText('Já respondida')).toBeInTheDocument();
    expect(
      screen.getByText(/Rita da Operacao/),
      'REPROVA: a tela nao diz QUEM marcou. A decisao do cliente pede transicao ' +
        'auditavel, e o painel nao le a trilha -- esta coluna e o unico lugar onde a ' +
        'autoria aparece para quem opera.',
    ).toBeInTheDocument();
    expect(
      servidor.requisicoes.some((r) => r.busca.get('status') === 'attended'),
      'REPROVA: trocar de aba não trocou o recorte no servidor. A busca é local, mas a ' +
        'ABA não pode ser: filtrar atendidas na página carregada mostraria só as que ' +
        'coubessem nela.',
    ).toBe(true);
  });

  it('a dúvida atendida NÃO oferece o botão — não há desmarcar', async () => {
    montar({ 'GET /admin/help-requests': json(200, paginaDaFila([atendida()], 0)) });
    await screen.findByText('Já respondida');
    expect(
      screen.queryByRole('button', { name: 'Marcar atendida' }),
      'REPROVA: a tela oferece marcar o que já está atendido. Não existe desmarcar, e ' +
        'um botão que não faz nada é pior do que botão nenhum.',
    ).toBeNull();
  });

  it('falha ao marcar vira banner, e a dúvida NÃO sai da fila', async () => {
    montar({
      'GET /admin/help-requests': json(200, paginaDaFila([duvida()])),
      'POST /admin/help-requests/{ref}/attendance': problema(429, 'rate-limited'),
    });
    await screen.findByText('Não salva o segundo pet');
    fireEvent.click(screen.getByRole('button', { name: 'Marcar atendida' }));

    expect(await screen.findByText(/Muitas marcações/)).toBeInTheDocument();
    expect(
      screen.getByText('Não salva o segundo pet'),
      'REPROVA: a linha sumiu mesmo com o servidor recusando. A operadora acreditaria ' +
        'ter fechado o trabalho.',
    ).toBeInTheDocument();
  });

  it('a tela diz que marcar NÃO apaga', async () => {
    montar({ 'GET /admin/help-requests': json(200, paginaDaFila([duvida()])) });
    await screen.findByText('Não salva o segundo pet');
    expect(screen.getByText(/não apaga nada/)).toBeInTheDocument();
  });
});
