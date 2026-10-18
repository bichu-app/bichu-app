import { Navigate, type RouteObject } from 'react-router';

import { Casca } from './casca/Casca.tsx';
import NaoFuiEu from './naoFuiEu/NaoFuiEu.tsx';
import { rotasDaLoja } from './loja/rotas.tsx';
import { rotasDaRede } from './rede/rotas.tsx';
import { rotasDoDiretorio } from './diretorio/rotas.tsx';
import { rotasDasPlaquinhas } from './plaquinhas/rotas.tsx';
import { rotasDaModeracao } from './moderacao/rotas.tsx';
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
        // BICHUS-189 (17/10/2026): o diretorio de `Perto`, o menu que faltava.
        ...rotasDoDiretorio,
        // 18/10/2026: a fila da plaquinha da coleira e a entrega. O backend das
        // tres operacoes existia desde 17/10 e nenhuma tela as chamava.
        ...rotasDasPlaquinhas,
        // 18/10/2026: a fila de moderacao. `conversation_reports` gravava
        // denuncia desde 28/09 e nenhuma tela a lia.
        ...rotasDaModeracao,
        { path: '*', element: <NaoEncontrada /> },
      ],
    },
  ];
}
