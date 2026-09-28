import type { RouteObject } from 'react-router';

/**
 * As rotas da Loja. Cada tela carrega o proprio modulo sob demanda (`lazy`):
 * tela nao visitada nao e baixada.
 */
export const rotasDaLoja: RouteObject[] = [
  { path: 'loja', lazy: async () => ({ Component: (await import('./ListaDeProdutos.tsx')).default }) },
  { path: 'loja/novo', lazy: async () => ({ Component: (await import('./FormularioDeProduto.tsx')).default }) },
  { path: 'loja/parceiros', lazy: async () => ({ Component: (await import('./ListaDeParceiros.tsx')).default }) },
  { path: 'loja/parceiros/novo', lazy: async () => ({ Component: (await import('./FormularioDeParceiro.tsx')).default }) },
  { path: 'loja/parceiros/:partnerSlug', lazy: async () => ({ Component: (await import('./FormularioDeParceiro.tsx')).default }) },
  { path: 'loja/tags', lazy: async () => ({ Component: (await import('./Tags.tsx')).default }) },
  { path: 'loja/:itemSlug', lazy: async () => ({ Component: (await import('./FormularioDeProduto.tsx')).default }) },
];
