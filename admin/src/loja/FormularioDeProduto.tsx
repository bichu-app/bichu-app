import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import type { Esquemas } from '../api/cliente.ts';
import { errosDoProblema, tipoDoProblema } from '../api/problema.ts';
import { Banner, CampoDeTexto, ErroDoCampo, ResumoDeErros } from '../componentes/basicos.tsx';
import { DialogoComSenha, type ResultadoDaAcaoComSenha } from '../componentes/DialogoComSenha.tsx';
import { enviarImagem } from '../componentes/envio-de-imagem.ts';
import { Galeria, type ImagemDaGaleria } from '../componentes/Galeria.tsx';
import { Icone } from '../componentes/Icone.tsx';
import { SairSemSalvar } from '../componentes/SairSemSalvar.tsx';
import { useSessao } from '../sessao/ProvedorDeSessao.tsx';
import { guardarRascunho, retomarRascunho } from '../sessao/rascunho.ts';
import { DialogoCriarTag } from './DialogoCriarTag.tsx';
import { DialogoRenovarPreco } from './DialogoRenovarPreco.tsx';
import { CATEGORIAS, dataCivilParaTexto, eCategoria, ESPECIES, hojeCivil, MAXIMO_DE_TAGS, type Especie } from './dominio.ts';
import {
  corpoDeAlteracao,
  corpoDeCriacao,
  errosDoServidor,
  ORDEM_DOS_CAMPOS,
  ROTULO_DO_CAMPO,
  validarProduto,
  valoresDoItem,
  VALORES_VAZIOS,
  type CampoDoProduto,
  type ErrosDoProduto,
  type ValoresDoProduto,
} from './formulario-do-produto.ts';

type Item = Esquemas['AdminStoreItem'];
type Parceiro = Esquemas['AdminStorePartner'];
type Tag = Esquemas['AdminStoreTag'];
type Acao = 'rascunho' | 'publicar' | 'salvar';

const AVISO = {
  rascunho: 'Rascunho salvo. Ele não aparece no app até ser publicado.',
  publicado: 'Produto publicado. Ele já aparece na Loja do app.',
  salvo: 'Alterações salvas.',
  retirado: 'Produto retirado. Ele saiu da Loja do app.',
};

const FALHA_DE_REDE = 'Não conseguimos falar com o servidor. Confira a internet e tente de novo.';
const CONFLITO = 'Alguém alterou este produto antes de você. Nada foi gravado. Recarregue para ver a versão atual antes de salvar.';

/** O que vai para o rascunho da sessao: sem arquivo e sem previa local, que nao sobrevivem a recarga. */
function paraRascunho(v: ValoresDoProduto): ValoresDoProduto {
  return {
    ...v,
    imagens: v.imagens
      .filter((im) => im.uploadId)
      .map((im) => ({ chave: im.chave, uploadId: im.uploadId, alt: im.alt, estado: im.estado === 'enviada' ? 'enviada' : im.estado, previa: im.previa?.startsWith('blob:') ? null : (im.previa ?? null) }) as ImagemDaGaleria),
  };
}

function comparavel(v: ValoresDoProduto): string {
  return JSON.stringify({ ...v, imagens: v.imagens.map((im) => [im.uploadId ?? im.chave, im.alt]) });
}

export default function FormularioDeProduto() {
  const { itemSlug } = useParams();
  const editando = itemSlug !== undefined;
  const { api, registrarRascunho } = useSessao();
  const navigate = useNavigate();
  const location = useLocation();
  const rotaDoRascunho = location.pathname;

  const [carga, setCarga] = useState<{ chave: string; fase: 'pronto' | 'erro' | 'nao-encontrado' }>();
  const [item, setItem] = useState<Item>();
  const [etag, setEtag] = useState<string>();
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [valores, setValores] = useState<ValoresDoProduto>(VALORES_VAZIOS);
  const [base, setBase] = useState<ValoresDoProduto>(VALORES_VAZIOS);
  const [errosDoServidorNaTela, setErrosDoServidorNaTela] = useState<ErrosDoProduto>({});
  const [tentouSalvar, setTentouSalvar] = useState<Acao>();
  const [salvando, setSalvando] = useState<Acao>();
  const [falha, setFalha] = useState<{ texto: string; recarregar?: boolean }>();
  const [criarTag, setCriarTag] = useState(false);
  const [retirar, setRetirar] = useState(false);
  const [renovar, setRenovar] = useState(false);
  const [versao, setVersao] = useState(0);
  const resumo = useRef<HTMLDivElement>(null);
  const liberado = useRef(false);
  const falhaDaNavegacao = (location.state as { falha?: string } | null)?.falha;

  const chaveDaCarga = `${itemSlug ?? 'novo'}#${versao}`;
  const fase = carga?.chave === chaveDaCarga ? carga.fase : 'carregando';

  // Mudar um campo tira o erro que o servidor tinha apontado: a validacao local reassume.
  const mudar = useCallback(<K extends keyof ValoresDoProduto>(campo: K, valor: ValoresDoProduto[K]) => {
    setValores((v) => ({ ...v, [campo]: valor }));
    setErrosDoServidorNaTela({});
  }, []);

  // Carga: item (com ETag), parceiros ativos e o vocabulario de tags ativas.
  useEffect(() => {
    const controle = new AbortController();
    const sinal = controle.signal;
    const chave = chaveDaCarga;
    async function carregar() {
      const [respostaDoItem, respostaDosParceiros, respostaDasTags] = await Promise.all([
        itemSlug ? api.GET('/admin/store/items/{itemSlug}', { params: { path: { itemSlug } }, signal: sinal }) : Promise.resolve(undefined),
        api.GET('/admin/store/partners', { params: { query: { active: true, limit: 100 } }, signal: sinal }),
        api.GET('/admin/store/tags', { params: { query: { active: true, limit: 100 } }, signal: sinal }),
      ]);
      if (sinal.aborted) return;
      if (respostaDoItem && !respostaDoItem.data) {
        setCarga({ chave, fase: respostaDoItem.response.status === 404 ? 'nao-encontrado' : 'erro' });
        return;
      }
      if (!respostaDosParceiros.data || !respostaDasTags.data) {
        setCarga({ chave, fase: 'erro' });
        return;
      }
      setParceiros(respostaDosParceiros.data.items);
      setTags(respostaDasTags.data.items);
      let doServidor = VALORES_VAZIOS;
      if (respostaDoItem?.data) {
        setItem(respostaDoItem.data);
        setEtag(respostaDoItem.response.headers.get('ETag') ?? `"${respostaDoItem.data.version}"`);
        doServidor = valoresDoItem(respostaDoItem.data);
      }
      setBase(doServidor);
      const rascunho = retomarRascunho<ValoresDoProduto>(rotaDoRascunho);
      setValores(rascunho ?? doServidor);
      setErrosDoServidorNaTela({});
      setTentouSalvar(undefined);
      setCarga({ chave, fase: 'pronto' });
    }
    carregar().catch(() => {
      if (!sinal.aborted) setCarga({ chave, fase: 'erro' });
    });
    return () => controle.abort();
  }, [api, itemSlug, rotaDoRascunho, chaveDaCarga]);

  // UX 29.2: se a sessao cair, o formulario fica guardado para depois do login.
  const valoresRef = useRef(valores);
  useLayoutEffect(() => {
    valoresRef.current = valores;
  });
  useEffect(() => registrarRascunho(() => guardarRascunho(rotaDoRascunho, paraRascunho(valoresRef.current))), [registrarRascunho, rotaDoRascunho]);

  // Imagem em conferencia (`processing`): o worker muda o estado depois da escrita.
  const temConferencia = valores.imagens.some((im) => im.estado === 'processing');
  useEffect(() => {
    if (!itemSlug || !temConferencia) return;
    let tentativas = 0;
    const id = setInterval(() => {
      tentativas += 1;
      if (tentativas > 20) {
        clearInterval(id);
        return;
      }
      void api.GET('/admin/store/items/{itemSlug}', { params: { path: { itemSlug } } }).then(({ data }) => {
        if (!data) return;
        const doServidor = new Map(data.images.map((im) => [im.upload_id, im]));
        setValores((v) => ({
          ...v,
          imagens: v.imagens.map((im) => {
            const s = im.uploadId ? doServidor.get(im.uploadId) : undefined;
            return s ? { ...im, estado: s.status, motivo: s.rejection_reason ?? null, previa: s.url ?? im.previa ?? null } : im;
          }),
        }));
      });
    }, 4000);
    return () => clearInterval(id);
  }, [api, itemSlug, temConferencia]);

  const parceiroEscolhido = useMemo(() => {
    const ativo = parceiros.find((p) => p.slug === valores.parceiro);
    if (ativo) return { host: ativo.host };
    if (item && item.partner.slug === valores.parceiro) return { host: item.partner.host };
    return undefined;
  }, [parceiros, item, valores.parceiro]);

  const sujo = fase === 'pronto' && comparavel(valores) !== comparavel(base);
  const publicado = item?.publication_state === 'published';

  // Depois da primeira tentativa, a validacao acompanha a digitacao: o erro some quando o campo fica certo.
  const erros: ErrosDoProduto = tentouSalvar
    ? { ...errosDoServidorNaTela, ...validarProduto(valores, { hostDoParceiro: parceiroEscolhido?.host, hoje: hojeCivil() }) }
    : errosDoServidorNaTela;

  function focarResumo() {
    requestAnimationFrame(() => resumo.current?.focus());
  }

  function sair(aviso: string) {
    liberado.current = true;
    void navigate('/loja', { state: { aviso } });
  }

  async function salvar(acao: Acao) {
    if (salvando) return;
    setTentouSalvar(acao);
    setFalha(undefined);
    const locais = validarProduto(valores, { hostDoParceiro: parceiroEscolhido?.host, hoje: hojeCivil() });
    if (Object.keys(locais).length > 0) {
      focarResumo();
      return;
    }
    setSalvando(acao);
    try {
      let atual = item;
      let versaoAtual = etag;
      if (!editando) {
        const { data, error, response } = await api.POST('/admin/store/items', { body: corpoDeCriacao(valores) });
        if (!data) return tratarRecusa(error, response.status);
        atual = data;
        versaoAtual = response.headers.get('ETag') ?? `"${data.version}"`;
        if (acao === 'rascunho') return sair(AVISO.rascunho);
      } else if (atual && versaoAtual) {
        const { data, error, response } = await api.PATCH('/admin/store/items/{itemSlug}', {
          params: { path: { itemSlug: atual.slug }, header: { 'If-Match': versaoAtual } },
          body: corpoDeAlteracao(valores),
        });
        if (!data) return tratarRecusa(error, response.status);
        atual = data;
        versaoAtual = response.headers.get('ETag') ?? `"${data.version}"`;
        if (acao !== 'publicar') return sair(AVISO.salvo);
      }
      if (!atual || !versaoAtual) return;
      const { data } = await api.PUT('/admin/store/items/{itemSlug}/publication', {
        params: { path: { itemSlug: atual.slug }, header: { 'If-Match': versaoAtual } },
      });
      if (data) return sair(AVISO.publicado);
      // O rascunho ficou gravado; a publicacao nao. A pessoa continua no item.
      liberado.current = true;
      void navigate(`/loja/${atual.slug}`, {
        replace: true,
        state: { falha: 'O produto foi salvo, mas não conseguimos publicar. Tente publicar de novo.' },
      });
    } catch {
      setFalha({ texto: FALHA_DE_REDE });
    } finally {
      setSalvando(undefined);
    }
  }

  function tratarRecusa(error: unknown, status: number) {
    const tipo = tipoDoProblema(error);
    if (tipo === 'validation-failed') {
      const doServidor = errosDoServidor(errosDoProblema(error));
      if (Object.keys(doServidor).length > 0) {
        setErrosDoServidorNaTela(doServidor);
        return focarResumo();
      }
    }
    if (tipo === 'precondition-failed') return setFalha({ texto: CONFLITO, recarregar: true });
    if (status === 401) return; // a sessao caiu: o provedor guarda o formulario e manda entrar
    setFalha({ texto: 'Não conseguimos salvar o produto. Confira os campos e tente de novo.' });
  }

  async function executarRetirada(token: string): Promise<ResultadoDaAcaoComSenha> {
    if (!item || !etag) return { ok: false, mensagem: FALHA_DE_REDE };
    const { data, error } = await api.DELETE('/admin/store/items/{itemSlug}/publication', {
      params: { path: { itemSlug: item.slug }, header: { 'If-Match': etag } },
      headers: { 'X-Admin-Reauth-Token': token },
    });
    if (data) {
      sair(AVISO.retirado);
      return { ok: true };
    }
    if (tipoDoProblema(error) === 'precondition-failed') return { ok: false, mensagem: CONFLITO };
    return { ok: false, mensagem: 'Não conseguimos retirar o produto. Tente de novo.' };
  }

  if (fase === 'carregando') return <p role="status">Carregando…</p>;
  if (fase === 'nao-encontrado' || fase === 'erro') {
    return (
      <div className="form">
        <Link className="btn ghost voltar" to="/loja">
          <Icone nome="back" tamanho="s20" />
          Voltar para a Loja
        </Link>
        <Banner
          tipo="erro"
          acao={
            fase === 'erro' ? (
              <button type="button" className="btn ghost sm" onClick={() => setVersao((n) => n + 1)}>
                Atualizar
              </button>
            ) : undefined
          }
        >
          {fase === 'nao-encontrado' ? 'Este produto não existe mais.' : 'Não conseguimos carregar o produto.'}
        </Banner>
      </div>
    );
  }

  const listaDeErros = ORDEM_DOS_CAMPOS.filter((c) => erros[c]).map((c) => ({ campo: c, rotulo: ROTULO_DO_CAMPO[c] }));
  const n = listaDeErros.length;
  const erro = (c: CampoDoProduto) => erros[c];
  const tagsAtivas = new Set(tags.map((t) => t.slug));
  // A tag desativada que ja estava no item continua aparecendo, marcada; desmarcada, nao volta (inactive_tag).
  const tagsDoItemInativas = (item?.tags ?? []).filter((t) => !t.active && !tagsAtivas.has(t.slug));
  const cheio = valores.tags.length >= MAXIMO_DE_TAGS;
  const opcoesDeParceiro = [
    ...parceiros.map((p) => ({ slug: p.slug, nome: p.name })),
    ...(item && !parceiros.some((p) => p.slug === item.partner.slug) ? [{ slug: item.partner.slug, nome: `${item.partner.name} (inativo)` }] : []),
  ];

  return (
    <>
    <form
      className="form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void salvar(publicado ? 'salvar' : 'publicar');
      }}
    >
      <Link className="btn ghost voltar" to="/loja">
        <Icone nome="back" tamanho="s20" />
        Voltar para a Loja
      </Link>
      <h1 className="t-headline">{item ? item.title : 'Novo produto'}</h1>
      {n > 0 && (
        <ResumoDeErros
          referencia={resumo}
          titulo={`Corrija ${n} ${n === 1 ? 'campo' : 'campos'} para ${tentouSalvar === 'publicar' ? 'publicar' : 'salvar'}:`}
          erros={listaDeErros}
        />
      )}
      {(falha || falhaDaNavegacao) && (
        <Banner
          tipo="erro"
          acao={
            falha?.recarregar ? (
              <button type="button" className="btn ghost sm" onClick={() => setVersao((v) => v + 1)}>
                Recarregar
              </button>
            ) : undefined
          }
        >
          {falha?.texto ?? falhaDaNavegacao}
        </Banner>
      )}
      <p className="t-body-sm c-sec">Campos com * são obrigatórios.</p>

      <CampoDeTexto id="f-nome" rotulo="Nome *" valor={valores.titulo} aoMudar={(v) => mudar('titulo', v)} maximo={120} erro={erro('f-nome')} />
      <CampoDeTexto id="f-desc" rotulo="Descrição *" valor={valores.resumo} aoMudar={(v) => mudar('resumo', v)} maximo={180} contador erro={erro('f-desc')} />

      <div className="row2">
        <div className={erro('f-categoria') ? 'field err' : 'field'}>
          <label htmlFor="f-categoria">Categoria *</label>
          <div className="ordem sel campo-sel">
            <select
              id="f-categoria"
              value={valores.categoria}
              onChange={(e) => mudar('categoria', eCategoria(e.target.value) ? e.target.value : '')}
              aria-invalid={erro('f-categoria') ? true : undefined}
              aria-describedby={erro('f-categoria') ? 'f-categoria-erro' : undefined}
            >
              <option value="">Escolha a categoria</option>
              {Object.entries(CATEGORIAS).map(([codigo, rotulo]) => (
                <option key={codigo} value={codigo}>
                  {rotulo}
                </option>
              ))}
            </select>
            <Icone nome="expand" tamanho="s20" />
          </div>
          {erro('f-categoria') && <ErroDoCampo id="f-categoria-erro">{erro('f-categoria')}</ErroDoCampo>}
        </div>

        <fieldset className={erro('f-especies') ? 'field err' : 'field'} aria-describedby={erro('f-especies') ? 'f-especies-erro' : 'f-especies-ajuda'}>
          <legend className="lab-row">
            <span className="lab">Para quais animais *</span>
          </legend>
          <div className="checks">
            {(Object.entries(ESPECIES) as [Especie, string][]).map(([codigo, rotulo], i) => (
              <label key={codigo} className="check">
                <input
                  type="checkbox"
                  {...(i === 0 ? { id: 'f-especies' } : {})}
                  checked={valores.especies.includes(codigo)}
                  onChange={(e) =>
                    mudar('especies', e.target.checked ? [...valores.especies, codigo] : valores.especies.filter((x) => x !== codigo))
                  }
                />
                <span>{rotulo}</span>
              </label>
            ))}
          </div>
          {erro('f-especies') ? (
            <ErroDoCampo id="f-especies-erro">{erro('f-especies')}</ErroDoCampo>
          ) : (
            <span className="help" id="f-especies-ajuda">
              Marque para quais animais é o produto.
            </span>
          )}
        </fieldset>
      </div>

      <div className={erro('f-tags') ? 'field err' : 'field'}>
        <div className="lab-row">
          <span className="lab" id="f-tags-rotulo">
            Tags
          </span>
          <span className="t-body-sm c-sec contador-img" aria-live="polite">
            {valores.tags.length} de {MAXIMO_DE_TAGS}
          </span>
        </div>
        <div className="checks" role="group" aria-labelledby="f-tags-rotulo" aria-describedby="f-tags-ajuda" id="f-tags" tabIndex={-1}>
          {tagsDoItemInativas.map((t) => {
            const marcada = valores.tags.includes(t.slug);
            return (
              <button
                key={t.slug}
                type="button"
                className="chip"
                aria-pressed={marcada}
                disabled={!marcada}
                onClick={() => mudar('tags', valores.tags.filter((x) => x !== t.slug))}
              >
                {marcada && <Icone nome="tick" tamanho="s16" />}
                {t.label} (inativa)
              </button>
            );
          })}
          {tags.map((t) => {
            const marcada = valores.tags.includes(t.slug);
            return (
              <button
                key={t.slug}
                type="button"
                className="chip"
                aria-pressed={marcada}
                disabled={!marcada && cheio}
                onClick={() => mudar('tags', marcada ? valores.tags.filter((x) => x !== t.slug) : [...valores.tags, t.slug])}
              >
                {marcada && <Icone nome="tick" tamanho="s16" />}
                {t.label}
              </button>
            );
          })}
          <button type="button" className="btn ghost sm" onClick={() => setCriarTag(true)}>
            <Icone nome="add" tamanho="s20" />
            Criar tag
          </button>
        </div>
        {erro('f-tags') && <ErroDoCampo id="f-tags-erro">{erro('f-tags')}</ErroDoCampo>}
        <span className="help" id="f-tags-ajuda">
          Palavras que ajudam a achar o produto na busca do app. Escolha até {MAXIMO_DE_TAGS} entre as tags que já existem.
        </span>
      </div>

      <Galeria
        id="imagens"
        imagens={valores.imagens}
        aoMudar={(atualizar) => {
          setValores((v) => ({ ...v, imagens: atualizar(v.imagens) }));
          setErrosDoServidorNaTela({});
        }}
        enviar={(arquivo, aoProgredir) => enviarImagem(api, arquivo, 'store_item', aoProgredir)}
        proposito="store_item"
        mostrarErrosDeDescricao={!!tentouSalvar}
        erro={erro('imagens')}
      />

      <div className={erro('f-parceiro') ? 'field err' : 'field'}>
        <label htmlFor="f-parceiro">Parceiro *</label>
        <div className="ordem sel campo-sel">
          <select
            id="f-parceiro"
            value={valores.parceiro}
            onChange={(e) => mudar('parceiro', e.target.value)}
            aria-invalid={erro('f-parceiro') ? true : undefined}
            aria-describedby={erro('f-parceiro') ? 'f-parceiro-erro' : 'f-parceiro-ajuda'}
          >
            <option value="">Escolha o parceiro</option>
            {opcoesDeParceiro.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.nome}
              </option>
            ))}
          </select>
          <Icone nome="expand" tamanho="s20" />
        </div>
        {erro('f-parceiro') ? (
          <ErroDoCampo id="f-parceiro-erro">{erro('f-parceiro')}</ErroDoCampo>
        ) : (
          <span className="help" id="f-parceiro-ajuda">
            Só aparecem parceiros ativos. Para cadastrar um, use <Link to="/loja/parceiros">Parceiros</Link>.
          </span>
        )}
      </div>

      <CampoDeTexto
        id="f-link"
        rotulo="Link do produto no parceiro *"
        valor={valores.link}
        aoMudar={(v) => mudar('link', v)}
        tipo="url"
        maximo={2048}
        erro={erro('f-link')}
        ajuda="Começa com https:// e precisa ser do site do parceiro escolhido."
      />

      <fieldset className="bloco">
        <legend className="t-title">Preço de referência (opcional)</legend>
        {item?.price_status === 'vencido' && item.price && (
          <Banner
            tipo="alerta"
            acao={
              <button type="button" className="btn ghost sm" onClick={() => setRenovar(true)}>
                Renovar consulta
              </button>
            }
          >
            O preço venceu em {dataCivilParaTexto(item.price.valid_until)}. O app mostra “preço não confirmado” até a consulta ser renovada.
          </Banner>
        )}
        <div className="row2">
          <CampoDeTexto id="f-preco" rotulo="Preço (R$)" valor={valores.preco} aoMudar={(v) => mudar('preco', v)} modoDeEntrada="decimal" erro={erro('f-preco')} />
          <CampoDeTexto id="f-data" rotulo="Consultado em" valor={valores.consultadoEm} aoMudar={(v) => mudar('consultadoEm', v)} tipo="date" erro={erro('f-data')} />
        </div>
        <button type="button" className="btn ghost sm voltar" onClick={() => mudar('consultadoEm', hojeCivil())}>
          Consultei hoje
        </button>
        <span className="help">
          O app mostra este preço por 30 dias depois da consulta. Depois disso, mostra “preço não confirmado” até a consulta ser renovada.
        </span>
      </fieldset>

      <div className="rodape-form">
        {publicado ? (
          <>
            <button type="button" className="btn sec" disabled={!!salvando} onClick={() => setRetirar(true)}>
              Retirar
            </button>
            <BotaoDeSalvar acao="salvar" salvando={salvando} rotulo="Salvar alterações" primario />
          </>
        ) : (
          <>
            <BotaoDeSalvar
              acao={editando && item?.publication_state === 'retired' ? 'salvar' : 'rascunho'}
              salvando={salvando}
              rotulo={editando && item?.publication_state === 'retired' ? 'Salvar alterações' : 'Salvar rascunho'}
              aoClicar={(a) => void salvar(a)}
            />
            <BotaoDeSalvar
              acao="publicar"
              salvando={salvando}
              rotulo={item?.publication_state === 'retired' ? 'Publicar de novo' : 'Publicar'}
              primario
            />
          </>
        )}
      </div>
    </form>

      <SairSemSalvar sujo={sujo && !salvando} liberado={liberado} />
      {criarTag && (
        <DialogoCriarTag
          aoFechar={() => setCriarTag(false)}
          aoCriar={(tag) => {
            setCriarTag(false);
            setTags((t) => [...t, tag].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')));
            if (valores.tags.length < MAXIMO_DE_TAGS) mudar('tags', [...valores.tags, tag.slug]);
          }}
        />
      )}
      {retirar && item && (
        <DialogoComSenha
          titulo={`Retirar “${item.title}”?`}
          corpo="O produto sai da Loja do app. Ele continua aqui como Retirado e pode ser publicado de novo."
          rotuloDaAcao="Retirar"
          escopo="store_item_retirement"
          executar={executarRetirada}
          aoFechar={() => setRetirar(false)}
        />
      )}
      {renovar && item && (
        <DialogoRenovarPreco
          item={{ ...item, version: Number.parseInt((etag ?? '').replace(/\D/g, ''), 10) || item.version }}
          aoFechar={() => setRenovar(false)}
          aoRenovar={(novo) => {
            setRenovar(false);
            setItem(novo);
            setEtag(`"${novo.version}"`);
            const preco = valoresDoItem(novo);
            setValores((v) => ({ ...v, preco: preco.preco, consultadoEm: preco.consultadoEm }));
            setBase((b) => ({ ...b, preco: preco.preco, consultadoEm: preco.consultadoEm }));
          }}
          aoConflito={() => {
            setRenovar(false);
            setFalha({ texto: CONFLITO, recarregar: true });
          }}
        />
      )}
    </>
  );
}

function BotaoDeSalvar({
  acao,
  salvando,
  rotulo,
  primario = false,
  aoClicar,
}: {
  acao: Acao;
  salvando: Acao | undefined;
  rotulo: string;
  primario?: boolean;
  aoClicar?: (acao: Acao) => void;
}) {
  const carregando = salvando === acao;
  return (
    <button
      type={primario ? 'submit' : 'button'}
      className={primario ? 'btn pri' : 'btn sec'}
      disabled={!!salvando && !carregando}
      aria-busy={carregando || undefined}
      onClick={aoClicar ? () => aoClicar(acao) : undefined}
    >
      {carregando && <span className="spin" aria-hidden="true" />}
      {rotulo}
    </button>
  );
}
