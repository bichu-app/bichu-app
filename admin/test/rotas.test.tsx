import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { rotas } from '../src/rotas.tsx';

describe('rotas', () => {
  it('a raiz carrega sob demanda e mostra o titulo dentro de main', async () => {
    render(<RouterProvider router={createMemoryRouter(rotas, { initialEntries: ['/'] })} />);

    const titulo = await screen.findByRole('heading', { level: 1, name: 'Backoffice Bichu' });
    expect(screen.getByRole('main')).toContainElement(titulo);
  });
});
