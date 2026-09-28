import { useCallback, useEffect, useState } from 'react';

import type { Esquemas } from '../api/cliente.ts';
import { errosDoProblema, tipoDoProblema, versaoComoEtag } from '../api/problema.ts';
import { BarraDeListagem, rotuloDeLimpar } from '../componentes/BarraDeListagem.tsx';
import { Banner, CampoDeTexto, LinhasCarregando, Selo } from '../componentes/basicos.tsx';
import { Dialogo } from '../componentes/Dialogo.tsx';
import { Icone } from '../componentes/Icone.tsx';
import { useListaPaginada, useParametrosDaLista } from '../componentes/lista.ts';
import { useSessao } from '../sessao/ProvedorDeSessao.tsx';
import { conferirRotulo, DialogoCriarTag, mensagemDeErroDaTag } from './DialogoCriarTag.tsx';
import { MAXIMO_DE_TAGS, MAXIMO_DE_TAGS_ATIVAS } from './dominio.ts';

type Tag = Esquemas['AdminStoreTag'];

const POR_PAGINA = 100;
const PADROES = { q: '', situacao: 'todas' };
const CHIPS = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'ativas', rotulo: 'Ativas' },
  { valor: 'inativas', rotulo: 'Inativas' },
];

/**
 * 6 · Tags (secao 25.5.4): o vocabulario curado da Loja. Nao ha exclusao;
 * desativar tira a tag do app e mantem o vinculo com os produtos, e reativar o
 * devolve (contrato, `updateAdminStoreTag`). A ordem e alfabetica, a unica do
 * contrato para esta lista.
 */
export default function Tags() {
  const { api } = useSessao();
  const [p, mudar] = useParametrosDaLista(PADROES);
  const [contagem, setContagem] = useState<{ ativas: number; inativas: number }>();
  const [versaoDaContagem, setVersaoDaContagem] = useState(0);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string }>();
  const [criar, setCriar] = useState(false);
  const [renomear, setRenomear] = useState<Tag>();
  const q = p.q.trim();
  const chave = JSON.stringify([q, p.situacao]);

  const buscar = useCallback(
    async (pagina: number, sinal: AbortSignal) => {
      const { data } = await api.GET('/admin/store/tags', {
        params: {
          query: {
            ...(q ? { q } : {}),
            ...(p.situacao === 'ativas' ? { active: true } : p.situacao === 'inativas' ? { active: false } : {}),
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
  const { estado, carregarMais, recarregar, substituir } = useListaPaginada<Tag>(chave, buscar);

  // "{n} de 40 tags ativas · {m} inativas": dois totais, pedidos com limit=1.
  useEffect(() => {
    const controle = new AbortController();
    void Promise.all([
      api.GET('/admin/store/tags', { params: { query: { active: true, limit: 1 } }, signal: controle.signal }),
      api.GET('/admin/store/tags', { params: { query: { active: false, limit: 1 } }, signal: controle.signal }),
    ])
      .then(([ativas, inativas]) => {
        if (ativas.data && inativas.data) setContagem({ ativas: ativas.data.total, inativas: inativas.data.total });
      })
      .catch(() => undefined);
    return () => controle.abort();
  }, [api, versaoDaContagem]);

  const cheio = (contagem?.ativas ?? 0) >= MAXIMO_DE_TAGS_ATIVAS;

  async function alternar(tag: Tag) {
    const { data, error } = await api.PATCH('/admin/store/tags/{tagSlug}', {
      params: { path: { tagSlug: tag.slug }, header: { 'If-Match': versaoComoEtag(tag.version) } },
      body: { active: !tag.active },
    });
    if (data) {
      substituir((t) => t.slug === tag.slug, data);
      setVersaoDaContagem((n) => n + 1);
      setAviso({
        tipo: 'ok',
        texto: data.active
          ? `Tag “${data.label}” reativada. Ela volta a aparecer no app nos produtos que já a tinham.`
          : `Tag “${data.label}” desativada. Ela some do app e não pode ser escolhida em produtos novos. Os produtos que já a tinham voltam a mostrá-la se você a reativar.`,
      });
      return;
    }
    const codigos = errosDoProblema(error).map((e) => e.code);
    if (tipoDoProblema(error) === 'precondition-failed') {
      recarregar();
      setAviso({ tipo: 'erro', texto: 'Alguém alterou esta tag antes de você. A lista foi atualizada; confira e tente de novo.' });
    } else setAviso({ tipo: 'erro', texto: mensagemDeErroDaTag(tipoDoProblema(error), codigos) });
  }

  const temBusca = q !== '';
  const temFiltro = p.situacao !== 'todas';
  const limpar = rotuloDeLimpar(temBusca, temFiltro);

  return (
    <>
      <header className="pghead">
        <div>
          <h1 className="t-headline">Tags</h1>
          <p className="t-body-sm c-sec">O vocabulário que os produtos usam. Cada produto escolhe até {MAXIMO_DE_TAGS} destas.</p>
        </div>
        <button type="button" className="btn pri" disabled={cheio} aria-describedby={cheio ? 'tags-limite' : undefined} onClick={() => setCriar(true)}>
          <Icone nome="add" tamanho="s20" />
          Criar tag
        </button>
      </header>
      {aviso && (
        <Banner tipo={aviso.tipo} aoFechar={() => setAviso(undefined)}>
          {aviso.texto}
        </Banner>
      )}
      {cheio && (
        <Banner tipo="alerta" id="tags-limite">
          Há {MAXIMO_DE_TAGS_ATIVAS} tags ativas, o limite. Para criar outra, desative uma que não é usada.
        </Banner>
      )}
      {estado.fase === 'erro' && (
        <Banner
          tipo="erro"
          acao={
            <button type="button" className="btn ghost sm" onClick={recarregar}>
              Atualizar
            </button>
          }
        >
          Não conseguimos carregar as tags.
        </Banner>
      )}
      <BarraDeListagem
        rotuloDaBusca="Buscar tags"
        placeholder="Buscar pelo nome da tag"
        busca={p.q}
        aoBuscar={(v) => mudar({ q: v })}
        chips={CHIPS}
        chipAtivo={p.situacao}
        aoEscolherChip={(v) => mudar({ situacao: v })}
        rotuloDosChips="Filtrar por situação"
        limpar={limpar ? { rotulo: limpar, aoLimpar: () => mudar({ q: '', situacao: 'todas' }) } : undefined}
      />
      {contagem && (
        <p className="t-body-sm c-sec" aria-live="polite">
          {contagem.ativas} de {MAXIMO_DE_TAGS_ATIVAS} tags ativas · {contagem.inativas} {contagem.inativas === 1 ? 'inativa' : 'inativas'}
        </p>
      )}
      {estado.fase === 'pronto' && estado.total === 0 ? (
        <div className="semres">
          <p className="t-title">{temBusca ? `Nenhuma tag com “${q}”.` : temFiltro ? 'Nenhuma tag nesta situação.' : 'Nenhuma tag cadastrada ainda.'}</p>
          {limpar && (
            <button type="button" className="btn sec" onClick={() => mudar({ q: '', situacao: 'todas' })}>
              {limpar}
            </button>
          )}
        </div>
      ) : (
        estado.fase !== 'erro' && (
          <div className="tabwrap">
            <table aria-busy={estado.fase === 'carregando' || undefined}>
              <caption className="sr">Tags</caption>
              <thead>
                <tr>
                  <th scope="col">Tag</th>
                  <th scope="col" className="w-upd">
                    Produtos
                  </th>
                  <th scope="col" className="w-status">
                    Situação
                  </th>
                  <th scope="col" className="w-preco">
                    <span className="sr">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {estado.fase === 'carregando' ? (
                  <LinhasCarregando linhas={6} colunas={['w-upd', 'w-status', 'w-preco']} />
                ) : (
                  estado.itens.map((tag) => (
                    <tr key={tag.slug}>
                      <td className="t-label">{tag.label}</td>
                      <td className="w-upd t-body-sm">{tag.item_count}</td>
                      <td className="w-status">
                        <Selo tipo={tag.active ? 'ativa' : 'inativa'} />
                      </td>
                      <td className="w-preco">
                        <div className="acts">
                          <button type="button" className="btn ghost sm" aria-label={`Renomear a tag ${tag.label}`} onClick={() => setRenomear(tag)}>
                            Renomear
                          </button>
                          <button
                            type="button"
                            className="btn ghost sm"
                            disabled={!tag.active && cheio}
                            aria-label={`${tag.active ? 'Desativar' : 'Reativar'} a tag ${tag.label}`}
                            onClick={() => void alternar(tag)}
                          >
                            {tag.active ? 'Desativar' : 'Reativar'}
                          </button>
                        </div>
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
      {criar && (
        <DialogoCriarTag
          aoFechar={() => setCriar(false)}
          aoCriar={(tag) => {
            setCriar(false);
            recarregar();
            setVersaoDaContagem((n) => n + 1);
            setAviso({ tipo: 'ok', texto: `Tag “${tag.label}” criada. Ela já pode ser escolhida nos produtos.` });
          }}
        />
      )}
      {renomear && (
        <DialogoRenomearTag
          tag={renomear}
          aoFechar={() => setRenomear(undefined)}
          aoRenomear={(nova) => {
            substituir((t) => t.slug === renomear.slug, nova);
            setRenomear(undefined);
            setAviso({ tipo: 'ok', texto: `Tag renomeada para “${nova.label}”.` });
          }}
        />
      )}
    </>
  );
}

function DialogoRenomearTag({ tag, aoFechar, aoRenomear }: { tag: Tag; aoFechar: () => void; aoRenomear: (t: Tag) => void }) {
  const { api } = useSessao();
  const [rotulo, setRotulo] = useState(tag.label);
  const [erro, setErro] = useState<string>();
  const [falha, setFalha] = useState<string>();
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const recusa = conferirRotulo(rotulo);
    if (recusa) {
      setErro(recusa);
      return;
    }
    const label = rotulo.trim().replace(/\s+/g, ' ');
    if (label === tag.label) return aoFechar();
    setErro(undefined);
    setFalha(undefined);
    setSalvando(true);
    try {
      const { data, error } = await api.PATCH('/admin/store/tags/{tagSlug}', {
        params: { path: { tagSlug: tag.slug }, header: { 'If-Match': versaoComoEtag(tag.version) } },
        body: { label },
      });
      if (data) return aoRenomear(data);
      const tipo = tipoDoProblema(error);
      if (tipo === 'precondition-failed') setFalha('Alguém alterou esta tag antes de você. Feche e confira a lista.');
      else if (tipo === 'slug-taken' || tipo === 'validation-failed') setErro(mensagemDeErroDaTag(tipo, errosDoProblema(error).map((e) => e.code)));
      else setFalha(mensagemDeErroDaTag(tipo, []));
    } catch {
      setFalha('Não conseguimos falar com o servidor. Confira a internet e tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialogo titulo={`Renomear a tag “${tag.label}”`} aoFechar={salvando ? undefined : aoFechar}>
      <p className="t-body c-sec">
        O nome muda em todos os produtos que usam esta tag{tag.item_count ? ` (${tag.item_count})` : ''}.
      </p>
      {falha && <Banner tipo="erro">{falha}</Banner>}
      <form
        className="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        <CampoDeTexto
          id="ren-tag"
          rotulo="Nome da tag"
          valor={rotulo}
          aoMudar={setRotulo}
          maximo={24}
          erro={erro}
          ajuda="De 2 a 24 caracteres: letras, números, espaço e hífen."
          autoFoco
        />
        <div className="acoes">
          <button type="button" className="btn sec" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn pri" aria-busy={salvando || undefined}>
            {salvando && <span className="spin" aria-hidden="true" />}
            Renomear
          </button>
        </div>
      </form>
    </Dialogo>
  );
}
