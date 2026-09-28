import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { Banner } from '../componentes/basicos.tsx';
import { Dialogo } from '../componentes/Dialogo.tsx';
import { Icone, MarcaDaNavegacao, type NomeDoIcone } from '../componentes/Icone.tsx';
import { MenuDeAcoes } from '../componentes/MenuDeAcoes.tsx';
import { useSessao } from '../sessao/ProvedorDeSessao.tsx';

interface ItemDaNavegacao {
  para: string;
  rotulo: string;
  icone: NomeDoIcone;
  sub?: boolean;
  ativo: (caminho: string) => boolean;
}

const eSubDaLoja = (c: string) => c.startsWith('/loja/parceiros') || c.startsWith('/loja/tags');

/**
 * A secao Rede e de outra frente (feat/backoffice-telas-rede): aqui so o item
 * da navegacao, que leva a `/rede`. A rota e dela.
 */
const ITENS: ItemDaNavegacao[] = [
  { para: '/loja', rotulo: 'Loja', icone: 'storefront', ativo: (c) => (c === '/loja' || c.startsWith('/loja/')) && !eSubDaLoja(c) },
  { para: '/loja/parceiros', rotulo: 'Parceiros', icone: 'open', sub: true, ativo: (c) => c.startsWith('/loja/parceiros') },
  { para: '/loja/tags', rotulo: 'Tags', icone: 'tick', sub: true, ativo: (c) => c.startsWith('/loja/tags') },
  { para: '/rede', rotulo: 'Rede', icone: 'groups', ativo: (c) => c === '/rede' || c.startsWith('/rede/') },
];

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : '';
  return (primeira + ultima).toUpperCase();
}

/**
 * A casca de toda tela autenticada (secoes 25.2 e 25.5.4): navegacao lateral
 * de 256, que vira trilho de icones abaixo de 1024; o rodape mostra so o nome
 * de exibicao (BO-1) e abre o menu da conta.
 */
export function Casca() {
  const { nome, avisoDoTeto, sair, sairDeTodas } = useSessao();
  const { pathname } = useLocation();
  const [confirmarTodas, setConfirmarTodas] = useState(false);
  const [saindoDeTodas, setSaindoDeTodas] = useState(false);
  const [falhaAoSair, setFalhaAoSair] = useState(false);

  return (
    <div className="app">
      <nav className="nav" aria-label="Seções">
        <div className="marca">
          <MarcaDaNavegacao />
          <span className="t-overline c-sec">Backoffice</span>
        </div>
        <ul>
          {ITENS.map((item) => {
            const ativo = item.ativo(pathname);
            return (
              <li key={item.para}>
                <Link
                  to={item.para}
                  className={item.sub ? 'navitem sub t-label' : 'navitem t-label-lg'}
                  aria-current={ativo ? 'page' : undefined}
                  title={item.rotulo}
                >
                  <Icone nome={item.icone} />
                  <span className="rot">{item.rotulo}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="conta">
          <div className="conta-menu-wrap">
            <MenuDeAcoes
              rotuloDoBotao={`Conta de ${nome}`}
              titulo={`Conta de ${nome}`}
              classeDoBotao="ident ident-btn"
              classeDoMenu="menu menu-conta"
              conteudoDoBotao={
                <>
                  <span className="avatar t-label" aria-hidden="true">
                    {iniciais(nome)}
                  </span>
                  <span className="nm t-label">{nome}</span>
                  <Icone nome="expand" tamanho="s20" />
                </>
              }
              itens={[
                { rotulo: 'Sair', icone: 'logout', aoEscolher: () => void sair() },
                { rotulo: 'Sair de todas as sessões', icone: 'logout', aoEscolher: () => setConfirmarTodas(true) },
              ]}
            />
          </div>
          <button type="button" className="btn ghost" title="Sair" onClick={() => void sair()}>
            <Icone nome="logout" />
            <span className="rot">Sair</span>
          </button>
        </div>
      </nav>
      <main className="main" id="conteudo">
        <Banner tipo="info" className="estreita">
          Esta janela é estreita para o backoffice. Aumente a janela do navegador ou use um computador.
        </Banner>
        {avisoDoTeto && (
          <Banner tipo="alerta">Sua sessão termina em 10 minutos. Salve o que estiver fazendo; depois, entre de novo.</Banner>
        )}
        <Outlet />
      </main>
      {confirmarTodas && (
        <Dialogo titulo="Sair de todas as sessões?" aoFechar={saindoDeTodas ? undefined : () => setConfirmarTodas(false)}>
          <p className="t-body c-sec">
            Encerra o backoffice em todos os navegadores e computadores em que você entrou, inclusive neste. Depois, é preciso
            entrar de novo.
          </p>
          {falhaAoSair && (
            <Banner tipo="erro">Não conseguimos falar com o servidor. Confira a internet e tente de novo.</Banner>
          )}
          <div className="acoes">
            <button type="button" className="btn sec" data-foco-inicial onClick={() => setConfirmarTodas(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn pri"
              aria-busy={saindoDeTodas || undefined}
              onClick={() => {
                setSaindoDeTodas(true);
                setFalhaAoSair(false);
                sairDeTodas().catch(() => {
                  setFalhaAoSair(true);
                  setSaindoDeTodas(false);
                });
              }}
            >
              {saindoDeTodas && <span className="spin" aria-hidden="true" />}
              Sair de todas
            </button>
          </div>
        </Dialogo>
      )}
    </div>
  );
}
