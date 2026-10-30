import type { RouteObject } from 'react-router';

/** As rotas do diretorio de `Perto`. */
export const rotasDoDiretorio: RouteObject[] = [
  { path: 'perto', lazy: async () => ({ Component: (await import('./ListaDeEntradas.tsx')).default }) },
  { path: 'perto/indicacoes', lazy: async () => ({ Component: (await import('./FilaDeIndicacoes.tsx')).default }) },
  { path: 'perto/novo', lazy: async () => ({ Component: (await import('./FormularioDaEntrada.tsx')).default }) },
  { path: 'perto/:entrySlug', lazy: async () => ({ Component: (await import('./FormularioDaEntrada.tsx')).default }) },
];
