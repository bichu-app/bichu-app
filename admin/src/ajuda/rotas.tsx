import type { RouteObject } from 'react-router';

/** A rota da fila de duvidas. */
export const rotasDaAjuda: RouteObject[] = [
  { path: 'ajuda', lazy: async () => ({ Component: (await import('./FilaDeAjuda.tsx')).default }) },
];
