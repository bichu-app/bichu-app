import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { criarRotas } from '../src/rotas.tsx';
import { criarServidorFalso, json, SESSAO } from './apoio/servidor-falso.ts';

function montar(caminho: string) {
  const servidor = criarServidorFalso({
    'GET /admin/session': json(200, SESSAO),
    'POST /admin/auth/logout': { status: 204 },
    'POST /admin/auth/logout-all': { status: 204 },
    'GET /admin/store/items': json(200, { items: [], page: 1, limit: 20, total: 0, effective_sort: 'atualizado' }),
  });
  const navegarParaFora = vi.fn();
  const router = createMemoryRouter(criarRotas({ fetch: servidor.fetch, navegarParaFora }), { initialEntries: [caminho] });
  render(<RouterProvider router={router} />);
  return { router, servidor, navegarParaFora };
}

describe('casca e rotas', () => {
  it('a raiz leva a Loja, dentro da casca com a navegacao lateral', async () => {
    const { router } = montar('/');
    const nav = await screen.findByRole('navigation', { name: 'Seções' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/loja'));
    for (const nome of ['Loja', 'Parceiros', 'Tags', 'Rede']) expect(within(nav).getByRole('link', { name: nome })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Loja' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('main')).toBeInTheDocument();
    // BO-1: o rodape mostra so o nome de exibicao.
    expect(within(nav).getByRole('button', { name: 'Conta de Marina Rocha' })).toBeInTheDocument();
  });

  it('Sair encerra no servidor e leva ao login com 1.11', async () => {
    const { servidor, navegarParaFora } = montar('/loja');
    fireEvent.click(await screen.findByRole('button', { name: 'Conta de Marina Rocha' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sair' }));
    await waitFor(() => expect(navegarParaFora).toHaveBeenCalledWith('/entrar/?motivo=saiu'));
    expect(servidor.requisicoes.find((r) => r.caminho === '/admin/auth/logout')?.cabecalhos.get('X-CSRF-Token')).toBe(SESSAO.csrf_token);
  });

  it('Sair de todas as sessoes pede confirmacao e leva ao login com 1.12', async () => {
    const { servidor, navegarParaFora } = montar('/loja');
    fireEvent.click(await screen.findByRole('button', { name: 'Conta de Marina Rocha' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sair de todas as sessões' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Sair de todas as sessões?' });
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Sair de todas' }));
    await waitFor(() => expect(navegarParaFora).toHaveBeenCalledWith('/entrar/?motivo=saiu_todas'));
    expect(servidor.requisicoes.some((r) => r.caminho === '/admin/auth/logout-all')).toBe(true);
  });

  it('o dialogo prende o foco e Esc fecha devolvendo o foco a quem abriu', async () => {
    montar('/loja');
    const conta = await screen.findByRole('button', { name: 'Conta de Marina Rocha' });
    fireEvent.click(conta);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sair de todas as sessões' }));
    const dialogo = screen.getByRole('alertdialog');
    const [primeiro, ultimo] = within(dialogo).getAllByRole('button');
    ultimo?.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(primeiro).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(ultimo).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(conta).toHaveFocus();
  });
});
