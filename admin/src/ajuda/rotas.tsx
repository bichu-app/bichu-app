import type { RouteObject } from 'react-router';

/**
 * A rota da fila de duvidas. A tela carrega o proprio modulo sob demanda
 * (`lazy`): tela nao visitada nao e baixada.
 *
 * `ajuda` e nao `help-requests`: o painel fala a lingua do produto, e o
 * caminho da API continua sendo `/admin/help-requests`. As duas coisas nao
 * precisam coincidir -- `plaquinhas` x `/admin/tag-requests` e `moderacao` x
 * `/admin/moderation/reports` sao o mesmo arranjo.
 */
export const rotasDaAjuda: RouteObject[] = [
  { path: 'ajuda', lazy: async () => ({ Component: (await import('./FilaDeAjuda.tsx')).default }) },
];
