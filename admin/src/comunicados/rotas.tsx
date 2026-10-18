import type { RouteObject } from 'react-router';

/** Os dois enderecos da frente, num lugar so: a lista e o formulario. */
export const CAMINHO_DA_LISTA = '/comunicados';
export const CAMINHO_DO_NOVO = '/comunicados/novo';

/**
 * As rotas do comunicado, filhas de `comunicados` na casca. Cada tela carrega
 * o proprio modulo sob demanda (`lazy`): tela nao visitada nao e baixada.
 *
 * **Nao ha rota de edicao nem de detalhe.** Comunicado disparado nao se edita
 * nem se apaga, e uma rota `comunicados/:ref` prometeria uma tela de item que
 * nao existe de proposito.
 *
 * `src/rotas.tsx` monta estas mesmas duas entradas na forma embutida, para que
 * a tabela de rotas do painel nao precise de mais uma linha de `import`; o
 * teste `comunicados.test.tsx` confere que as duas listas nao divergiram.
 */
export const rotasDosComunicados: RouteObject[] = [
  { index: true, lazy: async () => ({ Component: (await import('./ListaDeComunicados.tsx')).default }) },
  { path: 'novo', lazy: async () => ({ Component: (await import('./FormularioDeComunicado.tsx')).default }) },
];
