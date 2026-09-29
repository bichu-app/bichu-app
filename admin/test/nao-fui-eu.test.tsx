/**
 * /nao-fui-eu (D62, disavowAdminSessionAlert): o token vem no fragmento, sai da
 * barra de endereco, e so vai ao servidor por POST depois do clique. A pagina
 * nao abre sessao nem precisa de uma.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { criarRotas } from '../src/rotas.tsx';
import { criarServidorFalso, problema, type Resposta } from './apoio/servidor-falso.ts';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcde';

function montar(resposta: Resposta, fragmento = `#t=${TOKEN}`) {
  window.history.replaceState(null, '', `/nao-fui-eu${fragmento}`);
  const servidor = criarServidorFalso({ 'POST /admin/auth/disavow': resposta });
  const router = createMemoryRouter(criarRotas({ fetch: servidor.fetch, navegarParaFora: vi.fn() }), { initialEntries: ['/nao-fui-eu'] });
  render(<RouterProvider router={router} />);
  return { servidor };
}

afterEach(() => window.history.replaceState(null, '', '/'));

describe('/nao-fui-eu', () => {
  it('abrir o link nao dispara nada: sem POST, sem sessao, e o token sai da barra de endereco', async () => {
    const { servidor } = montar({ status: 204 });
    expect(await screen.findByRole('heading', { name: 'Não foi você que entrou?' })).toBeInTheDocument();
    expect(servidor.requisicoes).toHaveLength(0);
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain(TOKEN);
  });

  it('o clique manda o token por POST, sem cabecalho de sessao, e diz o que aconteceu', async () => {
    const { servidor } = montar({ status: 204 });
    fireEvent.click(await screen.findByRole('button', { name: 'Encerrar as sessões e bloquear a conta' }));
    expect(await screen.findByRole('heading', { name: 'Sessões encerradas e conta bloqueada' })).toBeInTheDocument();
    expect(servidor.requisicoes).toHaveLength(1);
    const [req] = servidor.requisicoes;
    expect(req?.metodo).toBe('POST');
    expect(req?.caminho).toBe('/admin/auth/disavow');
    expect(req?.corpo).toEqual({ token: TOKEN });
    expect(req?.cabecalhos.get('X-CSRF-Token')).toBeNull();
    expect(screen.queryByRole('button', { name: /Encerrar/ })).toBeNull();
  });

  it('410: vencido, usado ou inexistente, a mesma tela', async () => {
    montar(problema(410, 'token-expired'));
    fireEvent.click(await screen.findByRole('button', { name: 'Encerrar as sessões e bloquear a conta' }));
    expect(await screen.findByRole('heading', { name: 'Este link não vale mais' })).toBeInTheDocument();
  });

  it('link sem token, ou com token fora do formato, nao oferece o botao nem chama o servidor', async () => {
    for (const fragmento of ['', '#t=curto', `#t=${TOKEN}!`]) {
      const { servidor } = montar({ status: 204 }, fragmento);
      expect(await screen.findByRole('heading', { name: 'Este link está incompleto' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Encerrar/ })).toBeNull();
      expect(servidor.requisicoes).toHaveLength(0);
      document.body.innerHTML = '';
    }
  });

  it('403 da guarda de Origin e falha de rede mantem o botao para tentar de novo', async () => {
    montar(problema(403, 'forbidden'));
    fireEvent.click(await screen.findByRole('button', { name: 'Encerrar as sessões e bloquear a conta' }));
    expect(await screen.findByText(/Não conseguimos confirmar este pedido\./)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Encerrar as sessões e bloquear a conta' })).toBeEnabled());
  });
});
