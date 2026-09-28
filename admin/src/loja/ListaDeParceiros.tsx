import { useCallback } from 'react';
import { Link } from 'react-router';

import type { Esquemas } from '../api/cliente.ts';
import { BarraDeListagem, rotuloDeLimpar } from '../componentes/BarraDeListagem.tsx';
import { Banner, EstadoVazio, LinhasCarregando, Selo } from '../componentes/basicos.tsx';
import { Icone } from '../componentes/Icone.tsx';
import { useAvisoDaNavegacao, useListaPaginada, useParametrosDaLista } from '../componentes/lista.ts';
import { useSessao } from '../sessao/ProvedorDeSessao.tsx';

type Parceiro = Esquemas['AdminStorePartner'];

const POR_PAGINA = 50;
const PADROES = { q: '', situacao: 'todos' };
const CHIPS = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'ativos', rotulo: 'Ativos' },
  { valor: 'inativos', rotulo: 'Inativos' },
];

function plural(n: number) {
  return n === 1 ? 'parceiro' : 'parceiros';
}

/**
 * 5 · Parceiros (secao 25.5.4). A ordem e a da vitrine (`sort_order`), a unica
 * que o contrato tem para esta lista: por isso a barra nao tem seletor de ordem.
 */
export default function ListaDeParceiros() {
  const { api } = useSessao();
  const [p, mudar] = useParametrosDaLista(PADROES);
  const [aviso, fecharAviso] = useAvisoDaNavegacao();
  const q = p.q.trim().length >= 2 ? p.q.trim() : '';
  const chave = JSON.stringify([q, p.situacao]);

  const buscar = useCallback(
    async (pagina: number, sinal: AbortSignal) => {
      const { data } = await api.GET('/admin/store/partners', {
        params: {
          query: {
            ...(q ? { q } : {}),
            ...(p.situacao === 'ativos' ? { active: true } : p.situacao === 'inativos' ? { active: false } : {}),
            page: pagina,
            limit: POR_PAGINA,
          },
        },
        signal: sinal,
      });
      return data ? { itens: data.items, total: data.total } : undefined;
    },
    [api, q, p.situacao],
  );
  const { estado, carregarMais, recarregar } = useListaPaginada<Parceiro>(chave, buscar);

  const temBusca = p.q.trim() !== '';
  const temFiltro = p.situacao !== 'todos';
  const limpar = rotuloDeLimpar(temBusca, temFiltro);
  const nomeDoFiltro = CHIPS.find((c) => c.valor === p.situacao && c.valor !== 'todos')?.rotulo;

  const cabecalho = (
    <header className="pghead">
      <div>
        <h1 className="t-headline">Parceiros</h1>
        <p className="t-body-sm c-sec">As lojas para onde os produtos da Loja levam. Cada produto é de um parceiro.</p>
      </div>
      <Link className="btn pri" to="/loja/parceiros/novo">
        <Icone nome="add" tamanho="s20" />
        Novo parceiro
      </Link>
    </header>
  );
  const banner = aviso && (
    <Banner tipo="ok" aoFechar={fecharAviso}>
      {aviso}
    </Banner>
  );

  if (estado.fase === 'pronto' && estado.total === 0 && !q && !temFiltro) {
    return (
      <>
        {cabecalho}
        {banner}
        <EstadoVazio
          titulo="Nenhum parceiro cadastrado"
          corpo="Cadastre o primeiro parceiro. Sem parceiro, não dá para cadastrar produto."
          acao="Novo parceiro"
          destino="/loja/parceiros/novo"
        />
      </>
    );
  }

  let contagem = '';
  if (estado.fase === 'pronto') {
    if (estado.itens.length < estado.total) contagem = `Mostrando ${estado.itens.length} de ${estado.total} ${plural(estado.total)}`;
    else {
      contagem = `${estado.total} ${plural(estado.total)}`;
      if (q) contagem += ` com “${q}”`;
      if (nomeDoFiltro) contagem += ` em ${nomeDoFiltro}`;
    }
  }

  return (
    <>
      {cabecalho}
      {banner}
      {estado.fase === 'erro' && (
        <Banner
          tipo="erro"
          acao={
            <button type="button" className="btn ghost sm" onClick={recarregar}>
              Atualizar
            </button>
          }
        >
          Não conseguimos carregar os parceiros.
        </Banner>
      )}
      <BarraDeListagem
        rotuloDaBusca="Buscar parceiros"
        placeholder="Buscar pelo nome ou pelo site"
        busca={p.q}
        aoBuscar={(v) => mudar({ q: v })}
        chips={CHIPS}
        chipAtivo={p.situacao}
        aoEscolherChip={(v) => mudar({ situacao: v })}
        rotuloDosChips="Filtrar por situação"
        limpar={limpar ? { rotulo: limpar, aoLimpar: () => mudar({ q: '', situacao: 'todos' }) } : undefined}
      />
      {estado.fase === 'pronto' && (
        <p className="t-body-sm c-sec" aria-live="polite">
          {contagem}
        </p>
      )}
      {estado.fase === 'pronto' && estado.total === 0 ? (
        <div className="semres">
          <p className="t-title">
            {q && nomeDoFiltro ? `Nenhum parceiro com “${q}” em ${nomeDoFiltro}.` : q ? `Nenhum parceiro com “${q}”.` : `Nenhum parceiro em ${nomeDoFiltro ?? ''}.`}
          </p>
          {limpar && (
            <button type="button" className="btn sec" onClick={() => mudar({ q: '', situacao: 'todos' })}>
              {limpar}
            </button>
          )}
        </div>
      ) : (
        estado.fase !== 'erro' && (
          <div className="tabwrap">
            <table aria-busy={estado.fase === 'carregando' || undefined}>
              <caption className="sr">Parceiros</caption>
              <thead>
                <tr>
                  <th scope="col">Parceiro</th>
                  <th scope="col" className="w-preco">
                    Site
                  </th>
                  <th scope="col" className="w-upd">
                    Produtos
                  </th>
                  <th scope="col" className="w-status">
                    Situação
                  </th>
                  <th scope="col" className="w-acts">
                    <span className="sr">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {estado.fase === 'carregando' ? (
                  <LinhasCarregando linhas={4} colunas={['w-preco', 'w-upd', 'w-status', 'w-acts']} />
                ) : (
                  estado.itens.map((parceiro) => (
                    <tr key={parceiro.slug}>
                      <td>
                        <Link className="t-label" to={`/loja/parceiros/${parceiro.slug}`}>
                          {parceiro.name}
                        </Link>
                        <br />
                        <span className="t-caption c-sec">Ordem {parceiro.sort_order}</span>
                      </td>
                      <td className="w-preco t-body-sm">{parceiro.host}</td>
                      <td className="w-upd t-body-sm">{parceiro.item_count}</td>
                      <td className="w-status">
                        <Selo tipo={parceiro.active ? 'ativo' : 'inativo'} />
                      </td>
                      <td className="w-acts">
                        <Link className="ibtn" to={`/loja/parceiros/${parceiro.slug}`} aria-label={`Editar ${parceiro.name}`} title="Editar">
                          <Icone nome="edit" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )
      )}
      {estado.fase === 'pronto' && estado.itens.length < estado.total && (
        <div className="rodape-lista">
          <button type="button" className="btn sec" onClick={carregarMais}>
            Carregar mais
          </button>
        </div>
      )}
    </>
  );
}
