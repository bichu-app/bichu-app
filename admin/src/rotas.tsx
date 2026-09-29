import { Navigate, type RouteObject } from 'react-router';

import { Casca } from './casca/Casca.tsx';
import NaoFuiEu from './naoFuiEu/NaoFuiEu.tsx';
import { rotasDaLoja } from './loja/rotas.tsx';
import { rotasDaRede } from './rede/rotas.tsx';
import Carregando from './rotas/Carregando.tsx';
import NaoEncontrada from './rotas/NaoEncontrada.tsx';
import { ProvedorDeSessao, type PropsDoProvedor } from './sessao/ProvedorDeSessao.tsx';

export type OpcoesDasRotas = Omit<PropsDoProvedor, 'children'>;

/**
 * A tabela de rotas do painel autenticado. O login e outro documento
 * (`/entrar/`, ADR-0027 item 5) e nao passa por aqui.
 *
 * Cada frente acrescenta as suas rotas como filhas da casca: a Loja em
 * `loja/rotas.tsx`; a Rede, da frente feat/backoffice-telas-rede, entra ao lado
 * dela.
 */
export function criarRotas(opcoes: OpcoesDasRotas = {}): RouteObject[] {
  return [
    // Fora da sessao (D62): serve a quem pode ter perdido a sua.
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
        { path: '*', element: <NaoEncontrada /> },
      ],
    },
  ];
}
