import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { Banner } from '../componentes/basicos.tsx';
import { Dialogo } from '../componentes/Dialogo.tsx';
import { Icone, MarcaDaNavegacao, type NomeDoIcone } from '../componentes/Icone.tsx';
import { MenuDeAcoes } from '../componentes/MenuDeAcoes.tsx';
import { useIndicacoesPendentes } from '../diretorio/fila.ts';
import { useSessao } from '../sessao/ProvedorDeSessao.tsx';

interface ItemDaNavegacao {
  para: string;
  rotulo: string;
  icone: NomeDoIcone;
  sub?: boolean;
  ativo: (caminho: string) => boolean;
}

const eSubDaLoja = (c: string) => c.startsWith('/loja/parceiros') || c.startsWith('/loja/tags');

/** O mesmo arranjo de `eSubDaLoja`: o item pai nao fica aceso quando o filho esta. */
const ehSubDoPerto = (c: string) => c.startsWith('/perto/indicacoes');

/**
 * A secao Rede e de outra frente (feat/backoffice-telas-rede): aqui so o item
 * da navegacao, que leva a `/rede`. A rota e dela.
 */
const ITENS: ItemDaNavegacao[] = [
  { para: '/loja', rotulo: 'Loja', icone: 'storefront', ativo: (c) => (c === '/loja' || c.startsWith('/loja/')) && !eSubDaLoja(c) },
  { para: '/loja/parceiros', rotulo: 'Parceiros', icone: 'open', sub: true, ativo: (c) => c.startsWith('/loja/parceiros') },
  { para: '/loja/tags', rotulo: 'Tags', icone: 'tick', sub: true, ativo: (c) => c.startsWith('/loja/tags') },
  { para: '/rede', rotulo: 'Rede', icone: 'groups', ativo: (c) => c === '/rede' || c.startsWith('/rede/') },
  // BICHUS-189. O diretorio de `Perto`: estabelecimentos, clinicas e
  // profissionais. O caminho e `/perto` e nao `/diretorio` porque e assim que a
  // secao se chama no aplicativo, e o painel fala a lingua do produto.
  { para: '/perto', rotulo: 'Perto', icone: 'search', ativo: (c) => c === '/perto' || c.startsWith('/perto/') && !ehSubDoPerto(c) },
  // 18/10/2026. A fila de indicacoes da comunidade: o menu que o cliente mediu
  // que faltava ("no backoffice nao tem um menu para aprovar os profissionais
  // que as pessoas estao indicando"). Sub-item de `Perto` pela mesma forma que
  // Parceiros e Tags sao sub-itens da Loja: e o mesmo assunto, e nao uma secao
  // nova.
  { para: '/perto/indicacoes', rotulo: 'Indicações', icone: 'add', sub: true, ativo: (c) => c.startsWith('/perto/indicacoes') },
  // 18/10/2026. A fila da plaquinha da coleira e a ENTREGA dela. Secao propria,
  // e nao sub-item: o pedido do objeto fisico nao e assunto da Loja (que vende)
  // nem do Perto (que lista lugares) -- e trabalho de expedicao, e e dele que
  // quem atende cuida. **Sem aviso de contagem**: `AdminCollarTagRequestPage`
  // nao tem `pending_total`, e inventar uma soma na tela contaria o que a
  // listagem nao mostra, que e o defeito de "1 pendente" sobre fila vazia.
  { para: '/plaquinhas', rotulo: 'Plaquinhas', icone: 'tick', ativo: (c) => c === '/plaquinhas' || c.startsWith('/plaquinhas/') },
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
  const { nome, avisoDoTeto, sair, sairDeTodas, api } = useSessao();
  // A CONTAGEM DO AVISO do menu. O numero vem do servidor (`pending_total`), e
  // nao de uma soma na tela: ele passa pelo mesmo filtro de conta desabilitada
  // da listagem e da leitura, e uma soma local contaria o que a fila nao mostra
  // -- que e o defeito de dizer "1 pendente" sobre fila vazia.
  const indicacoesPendentes = useIndicacoesPendentes(api);
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
            // So o item da fila carrega aviso, e so quando o servidor respondeu:
            // `undefined` deixa o item sem numero, e isso e diferente de zero.
            const aviso =
              item.para === '/perto/indicacoes' && indicacoesPendentes ? indicacoesPendentes : undefined;
            const rotulo = aviso === undefined ? item.rotulo : `${item.rotulo} (${aviso})`;
            return (
              <li key={item.para}>
                <Link
                  to={item.para}
                  className={item.sub ? 'navitem sub t-label' : 'navitem t-label-lg'}
                  aria-current={ativo ? 'page' : undefined}
                  data-cy={`nav-${item.rotulo.toLowerCase()}`}
                  title={rotulo}
                >
                  <Icone nome={item.icone} />
                  {/* O numero vai DENTRO de `.rot`: abaixo de 1024 a navegacao
                      vira trilho de icones e `.rot` e escondido, e um aviso
                      solto sobraria sem rotulo nenhum ao lado. O `title` leva o
                      numero para quem ve so o icone. */}
                  <span className="rot">{rotulo}</span>
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
          <button type="button" className="btn ghost" data-cy="sair" title="Sair" onClick={() => void sair()}>
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
