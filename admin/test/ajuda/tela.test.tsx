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
    ...extra,
  };
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
      'GET /admin/help-requests': json(200, pagina([duvida()])),
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
  });

  it('a tela não mostra autor nenhum', async () => {
    const { servidor } = montar({
      'GET /admin/help-requests': json(200, pagina([duvida()])),
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
    expect(Object.keys(duvida()).sort()).toEqual(['body', 'created_at', 'ref', 'subject']);
    expect(servidor.requisicoes.length).toBeGreaterThan(0);
  });

  it('abrir uma dúvida mostra o texto inteiro, com os parágrafos', async () => {
    montar({ 'GET /admin/help-requests': json(200, pagina([duvida()])) });
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
        falhar ? problema(500, 'internal') : json(200, pagina([duvida()])),
    });

    expect(await screen.findByText('Não conseguimos carregar a fila.')).toBeInTheDocument();
    falhar = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Não salva o segundo pet')).toBeInTheDocument();
  });

  it('fila vazia diz que ninguém perguntou, e não finge erro', async () => {
    montar({ 'GET /admin/help-requests': json(200, pagina([])) });
    expect(await screen.findByText('Nada por aqui')).toBeInTheDocument();
    expect(screen.getByText('Ninguém mandou dúvida ainda.')).toBeInTheDocument();
  });

  it('a busca é local e o vazio dela diz que o recorte é da PÁGINA', async () => {
    montar({ 'GET /admin/help-requests': json(200, pagina([duvida()])) });
    await screen.findByText('Não salva o segundo pet');

    fireEvent.change(screen.getByLabelText('Buscar dúvida'), {
      target: { value: 'plaquinha' },
    });

    await waitFor(() =>
      expect(screen.getByText('Nenhuma dúvida desta página casa com a busca.')).toBeInTheDocument(),
    );
  });

  it('o aviso de que não dá para responder está na tela', async () => {
    montar({ 'GET /admin/help-requests': json(200, pagina([duvida()])) });
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
