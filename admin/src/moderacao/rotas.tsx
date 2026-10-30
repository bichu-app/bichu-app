import type { RouteObject } from 'react-router';

/** As rotas da fila de moderacao. */
export const rotasDaModeracao: RouteObject[] = [
  { path: 'moderacao', lazy: async () => ({ Component: (await import('./FilaDeModeracao.tsx')).default }) },
];
