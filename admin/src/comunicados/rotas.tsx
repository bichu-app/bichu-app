import type { RouteObject } from 'react-router';

/** Os dois enderecos da frente, num lugar so: a lista e o formulario. */
export const CAMINHO_DA_LISTA = '/comunicados';
export const CAMINHO_DO_NOVO = '/comunicados/novo';

/** As rotas do comunicado, filhas de `comunicados` na casca. */
export const rotasDosComunicados: RouteObject[] = [
  { index: true, lazy: async () => ({ Component: (await import('./ListaDeComunicados.tsx')).default }) },
  { path: 'novo', lazy: async () => ({ Component: (await import('./FormularioDeComunicado.tsx')).default }) },
];
