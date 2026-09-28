import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';

import { criarRotas } from './rotas.tsx';
import './theme/tokens.g.css';
import './theme/base.css';
import './theme/componentes.css';

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('index.html sem o elemento #raiz');

createRoot(raiz).render(
  <StrictMode>
    <RouterProvider router={createBrowserRouter(criarRotas())} />
  </StrictMode>,
);
