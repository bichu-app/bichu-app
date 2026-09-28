import type { RouteObject } from 'react-router';

/**
 * As rotas da Rede, dentro da casca do painel. Cada tela carrega o proprio
 * modulo sob demanda (`lazy`): tela nao visitada nao e baixada.
 */
export const rotasDaRede: RouteObject[] = [
  { path: 'rede', lazy: async () => ({ Component: (await import('./telas/ListaDeEncontros.tsx')).default }) },
  { path: 'rede/novo', lazy: async () => ({ Component: (await import('./telas/FormularioDoEncontro.tsx')).default }) },
  { path: 'rede/:eventSlug', lazy: async () => ({ Component: (await import('./telas/FormularioDoEncontro.tsx')).default }) },
  { path: 'rede/:eventSlug/pedidos', lazy: async () => ({ Component: (await import('./telas/PedidosDoEncontro.tsx')).default }) },
];
