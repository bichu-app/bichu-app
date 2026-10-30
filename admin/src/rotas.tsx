import { Navigate, type RouteObject } from 'react-router';

import { Casca } from './casca/Casca.tsx';
import NaoFuiEu from './naoFuiEu/NaoFuiEu.tsx';
import { rotasDaLoja } from './loja/rotas.tsx';
import { rotasDaRede } from './rede/rotas.tsx';
import { rotasDoDiretorio } from './diretorio/rotas.tsx';
import { rotasDasPlaquinhas } from './plaquinhas/rotas.tsx';
import { rotasDaModeracao } from './moderacao/rotas.tsx';
import { rotasDaAjuda } from './ajuda/rotas.tsx';
import Carregando from './rotas/Carregando.tsx';
import NaoEncontrada from './rotas/NaoEncontrada.tsx';
import { ProvedorDeSessao, type PropsDoProvedor } from './sessao/ProvedorDeSessao.tsx';

export type OpcoesDasRotas = Omit<PropsDoProvedor, 'children'>;

/** A tabela de rotas do painel autenticado. */
export function criarRotas(opcoes: OpcoesDasRotas = {}): RouteObject[] {
  return [
    { path: '/nao-fui-eu', element: <NaoFuiEu {...(opcoes.fetch ? { fetch: opcoes.fetch } : {})} /> },
    {
      path: '/',
      HydrateFallback: Carregando,
      element: (
        <ProvedorDeSessao {...opcoes}>
          <Casca />
        </ProvedorDeSessao>
      ),
      children: [
        { index: true, element: <Navigate to="/loja" replace /> },
        ...rotasDaLoja,
        ...rotasDaRede,
        ...rotasDoDiretorio,
        ...rotasDasPlaquinhas,
        ...rotasDaModeracao,
        ...rotasDaAjuda,
        { path: 'comunicados', children: [{ index: true, lazy: async () => ({ Component: (await import('./comunicados/ListaDeComunicados.tsx')).default }) }, { path: 'novo', lazy: async () => ({ Component: (await import('./comunicados/FormularioDeComunicado.tsx')).default }) }] },
        { path: '*', element: <NaoEncontrada /> },
      ],
    },
  ];
}
