import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';

import { rotas } from './rotas.tsx';
import './theme/tokens.g.css';
import './theme/base.css';

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('index.html sem o elemento #raiz');

createRoot(raiz).render(
  <StrictMode>
    <RouterProvider router={createBrowserRouter(rotas)} />
  </StrictMode>,
);
