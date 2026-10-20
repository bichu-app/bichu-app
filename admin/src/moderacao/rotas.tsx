import type { RouteObject } from 'react-router';

/**
 * As rotas da fila de moderacao. A tela carrega o proprio modulo sob demanda
 * (`lazy`): tela nao visitada nao e baixada.
 *
 * `moderacao` e nao `moderation/reports`: o painel fala a lingua do produto. O
 * caminho da API continua sendo `/admin/moderation/reports`, e as duas coisas
 * nao precisam coincidir -- `plaquinhas` x `/admin/tag-requests` e `perto` x
 * `/admin/directory` sao o mesmo arranjo.
 */
export const rotasDaModeracao: RouteObject[] = [
  { path: 'moderacao', lazy: async () => ({ Component: (await import('./FilaDeModeracao.tsx')).default }) },
];
