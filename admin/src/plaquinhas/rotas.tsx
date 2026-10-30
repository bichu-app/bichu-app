import type { RouteObject } from 'react-router';

/** As rotas da fila da plaquinha da coleira. */
export const rotasDasPlaquinhas: RouteObject[] = [
  { path: 'plaquinhas', lazy: async () => ({ Component: (await import('./FilaDePlaquinhas.tsx')).default }) },
];
