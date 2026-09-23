import type { RouteObject } from 'react-router';

import Carregando from './rotas/Carregando.tsx';

/**
 * Tabela de rotas. Cada rota carrega o proprio modulo sob demanda (`lazy`),
 * para que tela nao visitada nao seja baixada.
 */
export const rotas: RouteObject[] = [
  {
    path: '/',
    HydrateFallback: Carregando,
    lazy: async () => ({ Component: (await import('./rotas/Inicio.tsx')).default }),
  },
];
