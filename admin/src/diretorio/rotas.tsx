import type { RouteObject } from 'react-router';

/**
 * As rotas do diretorio de `Perto`. Cada tela carrega o proprio modulo sob
 * demanda (`lazy`): tela nao visitada nao e baixada.
 */
export const rotasDoDiretorio: RouteObject[] = [
  { path: 'perto', lazy: async () => ({ Component: (await import('./ListaDeEntradas.tsx')).default }) },
  // 18/10/2026. A fila de indicacoes da comunidade. ANTES de `perto/:entrySlug`,
  // porque `indicacoes` casaria com o parametro e abriria o formulario de uma
  // entrada que nao existe -- o mesmo cuidado que `perto/novo` ja exigia.
  { path: 'perto/indicacoes', lazy: async () => ({ Component: (await import('./FilaDeIndicacoes.tsx')).default }) },
  { path: 'perto/novo', lazy: async () => ({ Component: (await import('./FormularioDaEntrada.tsx')).default }) },
  { path: 'perto/:entrySlug', lazy: async () => ({ Component: (await import('./FormularioDaEntrada.tsx')).default }) },
];
