import type { RouteObject } from 'react-router';

/**
 * As rotas do diretorio de `Perto`. Cada tela carrega o proprio modulo sob
 * demanda (`lazy`): tela nao visitada nao e baixada.
 */
export const rotasDoDiretorio: RouteObject[] = [
  { path: 'perto', lazy: async () => ({ Component: (await import('./ListaDeEntradas.tsx')).default }) },
  { path: 'perto/novo', lazy: async () => ({ Component: (await import('./FormularioDaEntrada.tsx')).default }) },
  { path: 'perto/:entrySlug', lazy: async () => ({ Component: (await import('./FormularioDaEntrada.tsx')).default }) },
];
