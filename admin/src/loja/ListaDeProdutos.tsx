import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import type { Esquemas } from '../api/cliente.ts';
import { tipoDoProblema, versaoComoEtag } from '../api/problema.ts';
import { BarraDeListagem, rotuloDeLimpar } from '../componentes/BarraDeListagem.tsx';
import { Banner, EstadoVazio, LinhasCarregando, Selo } from '../componentes/basicos.tsx';
import { DialogoDeConfirmacao, type ResultadoDaAcaoConfirmada } from '../componentes/DialogoDeConfirmacao.tsx';
import { Icone } from '../componentes/Icone.tsx';
import { useAvisoDaNavegacao, useListaPaginada, useParametrosDaLista } from '../componentes/lista.ts';
import { MenuDeAcoes, type ItemDoMenu } from '../componentes/MenuDeAcoes.tsx';
import { useSessao } from '../sessao/ProvedorDeSessao.tsx';
import { DialogoRenovarPreco } from './DialogoRenovarPreco.tsx';
import {
  categoriaDoVocabulario,
  centavosParaTexto,
  dataCivilParaTexto,
  eCategoria,
  eEspecie,
  eSubcategoriaDaCategoria,
  ESPECIES,
  instanteParaTexto,
  subcategoriasDaCategoria,
  type Taxonomia,
} from './dominio.ts';

type Item = Esquemas['AdminStoreItem'];

const POR_PAGINA = 20;

/** Chips de escolha unica (secao 25.5): `Preco vencido` e `price_status`, os outros sao `publication_state`. */
const CHIPS = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'published', rotulo: 'Publicados' },
  { valor: 'draft', rotulo: 'Rascunhos' },
  { valor: 'retired', rotulo: 'Retirados' },
  { valor: 'vencido', rotulo: 'Preço vencido' },
] as const;

/** "Atualizados por ultimo" e o padrao da tela; `sort` do contrato em `correspondencia_de_ordem` da matriz. */
const ORDENS = [
  { valor: 'atualizado', rotulo: 'Atualizados por último' },
  { valor: 'nome', rotulo: 'Nome (A a Z)' },
  { valor: 'validade', rotulo: 'Preço vencido primeiro' },
] as const;

type Ordem = (typeof ORDENS)[number]['valor'];
const eOrdem = (v: string): v is Ordem => ORDENS.some((o) => o.valor === v);

const PADROES = { q: '', filtro: 'todos', categoria: '', subcategoria: '', especie: '', ordem: 'atualizado' };

function nomeDoFiltro(filtro: string): string | undefined {
  return filtro === 'todos' ? undefined : CHIPS.find((c) => c.valor === filtro)?.rotulo;
}

function plural(n: number): string {
  return n === 1 ? 'produto' : 'produtos';
}

/** O `q` do contrato tem minimo de 2: uma letra so nao filtra. */
function buscaEfetiva(q: string): string {
  const t = q.trim();
  return t.length >= 2 ? t : '';
}

function textoDaContagem(
  n: number,
  total: number,
  q: string,
  filtro: string,
  categoria: string,
  subcategoria: string,
  especie: string,
  taxonomia: Taxonomia | undefined,
): string {
  if (n < total) return `Mostrando ${n} de ${total} ${plural(total)}`;
  let t = `${total} ${plural(total)}`;
  if (q) t += ` com “${q}”`;
  const f = nomeDoFiltro(filtro);
  if (f) t += ` em ${f}`;
  const doVocabulario = categoriaDoVocabulario(taxonomia, categoria);
  if (doVocabulario) t += ` · ${doVocabulario.label}`;
  // A subcategoria entra DEPOIS da categoria e so com ela: "· Bifinhos" sem
  // "· Petiscos e ossos" na frente deixaria a linha afirmar um recorte menor
  // do que o que de fato valeu.
  const subDoVocabulario = doVocabulario?.subcategories.find((sc) => sc.code === subcategoria);
  if (subDoVocabulario) t += ` · ${subDoVocabulario.label}`;
  if (eEspecie(especie)) t += ` · ${ESPECIES[especie]}`;
  return t;
}

function textoSemResultado(q: string, filtro: string, temOutroFiltro: boolean): string {
  const f = nomeDoFiltro(filtro);
  if (q && f) return `Nenhum produto com “${q}” em ${f}.`;
  if (q) return `Nenhum produto com “${q}”.`;
  if (f) return `Nenhum produto em ${f}.`;
  if (temOutroFiltro) return 'Nenhum produto com estes filtros.';
  return 'Nenhum produto.';
}

export default function ListaDeProdutos() {
  const { api } = useSessao();
  const navigate = useNavigate();
  const [p, mudar] = useParametrosDaLista(PADROES);
  const [aviso, fecharAviso] = useAvisoDaNavegacao();
  const [avisoLocal, setAvisoLocal] = useState<{ tipo: 'ok' | 'erro'; texto: string }>();
  const [renovar, setRenovar] = useState<Item>();
  const [retirar, setRetirar] = useState<Item>();
  /**
   * O vocabulario dos dois niveis. **Nao bloqueia a lista**: sem ele os dois
   * seletores ficam sem opcao e a tabela continua carregando, porque o rotulo
   * da categoria de cada linha vem do proprio item (`category_label`).
   */
  const [taxonomia, setTaxonomia] = useState<Taxonomia>();

  useEffect(() => {
    const controle = new AbortController();
    api
      .GET('/store/taxonomy', { signal: controle.signal })
      .then(({ data }) => {
        if (data) setTaxonomia(data);
      })
      .catch(() => {
        // Silencio deliberado: o recorte por categoria deixa de ser oferecido,
        // e nada mais na tela depende disto.
      });
    return () => controle.abort();
  }, [api]);

  const q = buscaEfetiva(p.q);
  const ordem: Ordem = eOrdem(p.ordem) ? p.ordem : 'atualizado';
  const chave = JSON.stringify([q, p.filtro, p.categoria, p.subcategoria, p.especie, ordem]);

  const buscar = useCallback(
    async (pagina: number, sinal: AbortSignal) => {
      const filtro = p.filtro;
      const { data } = await api.GET('/admin/store/items', {
        params: {
          query: {
            ...(q ? { q } : {}),
            ...(filtro === 'published' || filtro === 'draft' || filtro === 'retired' ? { publication_state: filtro } : {}),
            ...(filtro === 'vencido' ? { price_status: 'vencido' as const } : {}),
            ...(eCategoria(taxonomia, p.categoria) ? { category: p.categoria } : {}),
            ...(eSubcategoriaDaCategoria(taxonomia, p.categoria, p.subcategoria)
              ? { subcategory: p.subcategoria }
              : {}),
            ...(eEspecie(p.especie) ? { species: p.especie } : {}),
            sort: ordem,
            page: pagina,
            limit: POR_PAGINA,
          },
        },
        signal: sinal,
      });
      return data ? { itens: data.items, total: data.total } : undefined;
    },
    [api, q, p.filtro, p.categoria, p.subcategoria, p.especie, ordem, taxonomia],
  );
  const { estado, carregarMais, recarregar, substituir } = useListaPaginada<Item>(chave, buscar);

  const temFiltro =
    p.filtro !== 'todos' || p.categoria !== '' || p.subcategoria !== '' || p.especie !== '';
  const temBusca = p.q.trim() !== '';
  const semNada = estado.fase === 'pronto' && estado.total === 0 && !temFiltro && !q;

  function mostrar(tipo: 'ok' | 'erro', texto: string) {
    fecharAviso();
    setAvisoLocal({ tipo, texto });
  }

  async function publicar(item: Item) {
    const { data, error } = await api.PUT('/admin/store/items/{itemSlug}/publication', {
      params: { path: { itemSlug: item.slug }, header: { 'If-Match': versaoComoEtag(item.version) } },
    });
    if (data) {
      substituir((i) => i.slug === item.slug, data);
      mostrar('ok', 'Produto publicado. Ele já aparece na Loja do app.');
    } else if (tipoDoProblema(error) === 'precondition-failed') {
      mostrar('erro', 'Alguém alterou este produto antes de você. A lista foi atualizada; confira e tente de novo.');
      recarregar();
    } else {
      mostrar('erro', 'Não conseguimos publicar o produto. Tente de novo.');
    }
  }

  async function executarRetirada(item: Item): Promise<ResultadoDaAcaoConfirmada> {
    const { data, error } = await api.DELETE('/admin/store/items/{itemSlug}/publication', {
      params: { path: { itemSlug: item.slug }, header: { 'If-Match': versaoComoEtag(item.version) } },
    });
    if (data) {
      substituir((i) => i.slug === item.slug, data);
      mostrar('ok', 'Produto retirado. Ele saiu da Loja do app.');
      return { ok: true };
    }
    if (tipoDoProblema(error) === 'precondition-failed') {
      recarregar();
      return { ok: false, mensagem: 'Alguém alterou este produto antes de você. A lista foi atualizada; confira e tente de novo.' };
    }
    return { ok: false, mensagem: 'Não conseguimos retirar o produto. Tente de novo.' };
  }

  function itensDoMenu(item: Item): ItemDoMenu[] {
    const editar: ItemDoMenu = { rotulo: 'Editar', icone: 'edit', aoEscolher: () => void navigate(`/loja/${item.slug}`) };
    if (item.publication_state === 'published') {
      return [
        editar,
        { rotulo: 'Renovar consulta de preço', icone: 'refresh', aoEscolher: () => setRenovar(item) },
        { rotulo: 'Retirar', icone: 'hide', perigo: true, aoEscolher: () => setRetirar(item) },
      ];
    }
    return [
      editar,
      { rotulo: item.publication_state === 'retired' ? 'Publicar de novo' : 'Publicar', icone: 'check', aoEscolher: () => void publicar(item) },
    ];
  }

  const cabecalho = (
    <header className="pghead">
      <div>
        <h1 className="t-headline">Loja</h1>
        <p className="t-body-sm c-sec">Produtos que aparecem na Loja do app, com link para o parceiro.</p>
      </div>
      <Link className="btn pri" to="/loja/novo" data-cy="loja-novo-produto">
        <Icone nome="add" tamanho="s20" />
        Novo produto
      </Link>
    </header>
  );

  const avisoVisivel = avisoLocal ?? (aviso ? { tipo: 'ok' as const, texto: aviso } : undefined);
  const bannerDeAviso = avisoVisivel && (
    <Banner
      tipo={avisoVisivel.tipo}
      aoFechar={() => {
        setAvisoLocal(undefined);
        fecharAviso();
      }}
    >
      {avisoVisivel.texto}
    </Banner>
  );

  if (semNada) {
    return (
      <>
        {cabecalho}
        {bannerDeAviso}
        <EstadoVazio
          titulo="A Loja ainda não tem produtos"
          corpo="Cadastre o primeiro. Ele aparece no app quando for publicado."
          acao="Novo produto"
          destino="/loja/novo"
        />
      </>
    );
  }

  const limpar = rotuloDeLimpar(temBusca, temFiltro);

  return (
    <>
      {cabecalho}
      {bannerDeAviso}
      {estado.fase === 'erro' && (
        <Banner
          tipo="erro"
          acao={
            <button type="button" className="btn ghost sm" onClick={recarregar}>
              Atualizar
            </button>
          }
        >
          Não conseguimos carregar os produtos.
        </Banner>
      )}
      <BarraDeListagem
        rotuloDaBusca="Buscar produtos"
        placeholder="Buscar pelo nome do produto"
        busca={p.q}
        aoBuscar={(v) => mudar({ q: v })}
        seletores={[
          {
            id: 'f-cat',
            rotuloAcessivel: 'Categoria',
            valor: p.categoria,
            opcoes: [
              { valor: '', rotulo: 'Todas as categorias' },
              ...(taxonomia?.categories ?? []).map((c) => ({ valor: c.code, rotulo: c.label })),
            ],
            // Trocar a categoria LIMPA a subcategoria, sempre. Manter a
            // anterior deixaria o recorte ser um par que nao existe, e a lista
            // voltaria vazia sem a pessoa entender por que.
            aoMudar: (v) => mudar({ categoria: v, subcategoria: '' }),
          },
          {
            id: 'f-subcat',
            rotuloAcessivel: 'Subcategoria',
            valor: p.subcategoria,
            // Sem categoria escolhida ha uma opcao so, e o seletor nao oferece
            // as 83 de uma vez: oferecer todas devolveria a pessoa ao problema
            // que os dois niveis existem para resolver.
            opcoes: [
              {
                valor: '',
                rotulo:
                  p.categoria === ''
                    ? 'Escolha a categoria primeiro'
                    : 'Todas as subcategorias',
              },
              ...subcategoriasDaCategoria(taxonomia, p.categoria).map((sc) => ({
                valor: sc.code,
                rotulo: sc.label,
              })),
            ],
            aoMudar: (v) => mudar({ subcategoria: v }),
          },
          {
            id: 'f-esp',
            rotuloAcessivel: 'Animal',
            valor: p.especie,
            opcoes: [{ valor: '', rotulo: 'Todos os animais' }, ...Object.entries(ESPECIES).map(([valor, rotulo]) => ({ valor, rotulo }))],
            aoMudar: (v) => mudar({ especie: v }),
          },
          {
            id: 'ordem',
            rotuloAcessivel: 'Ordenar',
            prefixoVisivel: 'Ordenar:',
            valor: ordem,
            opcoes: ORDENS.map((o) => ({ valor: o.valor, rotulo: o.rotulo })),
            aoMudar: (v) => mudar({ ordem: v }),
          },
        ]}
        chips={CHIPS.map((c) => ({ valor: c.valor, rotulo: c.rotulo }))}
        chipAtivo={p.filtro}
        aoEscolherChip={(v) => mudar({ filtro: v })}
        rotuloDosChips="Filtrar por status"
        limpar={limpar ? { rotulo: limpar, aoLimpar: () => mudar({ q: '', filtro: 'todos', categoria: '', subcategoria: '', especie: '' }) } : undefined}
      />
      {estado.fase === 'carregando' && <p className="t-body-sm c-sec">Carregando produtos…</p>}
      {estado.fase === 'pronto' && (
        <p className="t-body-sm c-sec" aria-live="polite">
          {textoDaContagem(estado.itens.length, estado.total, q, p.filtro, p.categoria, p.subcategoria, p.especie, taxonomia)}
        </p>
      )}
      {estado.fase === 'pronto' && estado.total === 0 ? (
        <div className="semres">
          <p className="t-title">{textoSemResultado(q, p.filtro, p.categoria !== '' || p.especie !== '')}</p>
          {limpar && (
            <button type="button" className="btn sec" onClick={() => mudar({ q: '', filtro: 'todos', categoria: '', especie: '' })}>
              {limpar}
            </button>
          )}
        </div>
      ) : (
        estado.fase !== 'erro' && (
          <div className="tabwrap">
            <table aria-busy={estado.fase === 'carregando' || undefined}>
              <caption className="sr">Produtos da Loja</caption>
              <thead>
                <tr>
                  <th scope="col">Produto, parceiro e categoria</th>
                  <th scope="col" className="w-preco">
                    Preço de referência
                  </th>
                  <th scope="col" className="w-status">
                    Status
                  </th>
                  <th scope="col" className="w-upd col-upd">
                    Atualizado
                  </th>
                  <th scope="col" className="w-acts">
                    <span className="sr">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {estado.fase === 'carregando' ? (
                  <LinhasCarregando linhas={6} colunas={['w-preco', 'w-status', 'w-upd col-upd', 'w-acts']} />
                ) : (
                  estado.itens.map((item) => <LinhaDoProduto key={item.slug} item={item} menu={itensDoMenu(item)} aoRenovar={() => setRenovar(item)} />)
                )}
              </tbody>
            </table>
          </div>
        )
      )}
      {estado.fase === 'pronto' && estado.itens.length < estado.total && (
        <div className="rodape-lista">
          <button type="button" className="btn sec" onClick={carregarMais} aria-busy={estado.carregandoMais || undefined}>
            {estado.carregandoMais && <span className="spin" aria-hidden="true" />}
            Carregar mais
          </button>
        </div>
      )}
      {renovar && (
        <DialogoRenovarPreco
          item={renovar}
          aoFechar={() => setRenovar(undefined)}
          aoRenovar={(novo) => {
            substituir((i) => i.slug === novo.slug, novo);
            setRenovar(undefined);
            mostrar('ok', 'Alterações salvas.');
          }}
          aoConflito={() => {
            setRenovar(undefined);
            recarregar();
            mostrar('erro', 'Alguém alterou este produto antes de você. A lista foi atualizada; confira e tente de novo.');
          }}
        />
      )}
      {retirar && (
        <DialogoDeConfirmacao
          titulo={`Retirar “${retirar.title}”?`}
          corpo="O produto sai da Loja do app. Ele continua aqui como Retirado e pode ser publicado de novo."
          rotuloDaAcao="Retirar"
          executar={() => executarRetirada(retirar)}
          aoFechar={() => setRetirar(undefined)}
        />
      )}
    </>
  );
}

function LinhaDoProduto({ item, menu, aoRenovar }: { item: Item; menu: ItemDoMenu[]; aoRenovar: () => void }) {
  const principal = [...item.images].sort((a, b) => a.position - b.position)[0];
  const miniatura = principal?.status === 'ready' && principal.url ? principal.url : undefined;
  const especies = item.species.map((e) => ESPECIES[e]).join(', ');
  const n = item.images.length;
  return (
    <tr data-cy="produto-linha" data-slug={item.slug}>
      <td>
        <div className="prod">
          <span className="thumb">{miniatura ? <img src={miniatura} alt="" loading="lazy" width={48} height={48} /> : <Icone nome="image" tamanho="s20" />}</span>
          <span className="tx">
            <Link className="nome" to={`/loja/${item.slug}`} title={item.title}>
              {item.title}
            </Link>
            {/* Rascunho pode nao ter parceiro nem destino (17/10/2026): sem
                eles a linha vira texto, e nao um link para lugar nenhum. */}
            {item.partner && item.target_url ? (
              <a className="sub t-body-sm" href={item.target_url} target="_blank" rel="noopener noreferrer" title="Abre a página do produto no parceiro, em nova aba">
                {item.partner.name} <Icone nome="open" tamanho="s16" />
                <span className="sr">(abre em nova aba)</span>
              </a>
            ) : (
              <span className="sub t-body-sm c-sec">{item.partner ? item.partner.name : 'Sem parceiro'}</span>
            )}
            <span className="t-caption c-sec">
              {/*
                O rotulo vem do SERVIDOR (`category_label`), e nao de um mapa
                do painel -- o mapa `CATEGORIAS` morreu com o `enum` do
                contrato. `?? item.category` e a reserva para o rotulo que o
                servidor nao resolveu; `'Sem categoria'` e o RASCUNHO sem
                categoria, que a `20261017000002` permitiu e que nao pode
                aparecer como linha vazia na lista.
              */}
              {item.category === null
                ? 'Sem categoria'
                : (item.category_label ?? item.category)}
              {item.subcategory_label ? ` · ${item.subcategory_label}` : ''} · {especies}
              {n > 1 ? ` · ${n} imagens` : ''}
            </span>
          </span>
        </div>
      </td>
      <td className="w-preco">
        <div className="preco">
          {item.price_status === 'vigente' && item.price && (
            <>
              <span className="t-label">{centavosParaTexto(item.price.amount)}</span>
              <span className="t-body-sm c-sec">consultado em {dataCivilParaTexto(item.price.checked_at)}</span>
            </>
          )}
          {item.price_status === 'vencido' && item.price && (
            <>
              <Selo tipo="vencido" />
              <span className="t-body-sm c-sec">
                {centavosParaTexto(item.price.amount)}, consultado em {dataCivilParaTexto(item.price.checked_at)}
              </span>
              <button type="button" className="link t-label" onClick={aoRenovar}>
                Renovar consulta
              </button>
            </>
          )}
          {(item.price_status === 'sem_preco' || !item.price) && <span className="t-body-sm c-sec">Sem preço de referência</span>}
        </div>
      </td>
      <td className="w-status">
        <Selo tipo={item.publication_state === 'published' ? 'publicado' : item.publication_state === 'retired' ? 'retirado' : 'rascunho'} />
      </td>
      <td className="w-upd col-upd t-body-sm c-sec">{instanteParaTexto(item.updated_at)}</td>
      <td className="w-acts">
        <div className="acts">
          <Link className="ibtn" to={`/loja/${item.slug}`} aria-label={`Editar ${item.title}`} title="Editar">
            <Icone nome="edit" />
          </Link>
          <MenuDeAcoes rotuloDoBotao={`Mais ações para ${item.title}`} titulo="Mais ações" itens={menu} />
        </div>
      </td>
    </tr>
  );
}
