import type { RouteObject } from 'react-router';

/**
 * As rotas da fila da plaquinha da coleira. A tela carrega o proprio modulo sob
 * demanda (`lazy`): tela nao visitada nao e baixada.
 *
 * `plaquinhas` e nao `tag-requests`: o painel fala a lingua do produto, e
 * "plaquinha da coleira" e como o cliente e o aplicativo a chamam. O caminho da
 * API continua sendo `/admin/tag-requests`, e as duas coisas nao precisam
 * coincidir -- `perto` x `/admin/directory` e o mesmo arranjo.
 */
export const rotasDasPlaquinhas: RouteObject[] = [
  { path: 'plaquinhas', lazy: async () => ({ Component: (await import('./FilaDePlaquinhas.tsx')).default }) },
];
