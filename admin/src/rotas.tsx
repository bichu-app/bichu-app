import { Navigate, type RouteObject } from 'react-router';

import { Casca } from './casca/Casca.tsx';
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
    {
      path: '/',
      HydrateFallback: Carregando,
      element: (
        <ProvedorDeSessao {...opcoes}>
          <Casca />
        </ProvedorDeSessao>
      ),
      children: [{ index: true, element: <Navigate to="/loja" replace /> }, { path: '*', element: <NaoEncontrada /> }],
    },
  ];
}
