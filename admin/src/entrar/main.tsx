import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '../theme/tokens.g.css';
import '../theme/base.css';
import '../theme/componentes.css';
import { criarObtencaoDoToken, preCarregar } from './captcha.ts';
import { Entrar } from './Entrar.tsx';

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('entrar/index.html sem o elemento #raiz');

const chave = import.meta.env.VITE_CAPTCHA_SITE_KEY;
preCarregar(chave);

createRoot(raiz).render(
  <StrictMode>
    <Entrar
      obterToken={criarObtencaoDoToken(chave, import.meta.env.DEV)}
      busca={globalThis.location.search}
      navegarParaFora={(url) => globalThis.location.assign(url)}
    />
  </StrictMode>,
);
