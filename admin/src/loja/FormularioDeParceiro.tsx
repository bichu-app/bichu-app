import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import type { Esquemas } from '../api/cliente.ts';
import { errosDoProblema, tipoDoProblema } from '../api/problema.ts';
import { Banner, CampoDeTexto, ResumoDeErros } from '../componentes/basicos.tsx';
import { Icone } from '../componentes/Icone.tsx';
import { SairSemSalvar } from '../componentes/SairSemSalvar.tsx';
import { useSessao } from '../sessao/ProvedorDeSessao.tsx';
import { guardarRascunho, retomarRascunho } from '../sessao/rascunho.ts';
import { PADRAO_DO_HOST, PADRAO_DO_SLUG, slugSugerido } from './dominio.ts';

type Parceiro = Esquemas['AdminStorePartner'];

interface Valores {
  nome: string;
  slug: string;
  slugEditado: boolean;
  host: string;
  ordem: string;
  ativo: boolean;
}

type Campo = 'p-nome' | 'p-slug' | 'p-host' | 'p-ordem';
const ROTULOS: Record<Campo, string> = { 'p-nome': 'Nome', 'p-slug': 'Identificador', 'p-host': 'Site do parceiro', 'p-ordem': 'Ordem na Loja' };
const ORDEM: Campo[] = ['p-nome', 'p-slug', 'p-host', 'p-ordem'];

const VAZIO: Valores = { nome: '', slug: '', slugEditado: false, host: '', ordem: '0', ativo: true };

export function validarParceiro(v: Valores): Partial<Record<Campo, string>> {
  const e: Partial<Record<Campo, string>> = {};
  const nome = v.nome.trim();
  if (nome.length < 2 || nome.length > 80) e['p-nome'] = 'Informe o nome do parceiro, de 2 a 80 caracteres.';
  if (!PADRAO_DO_SLUG.test(v.slug)) e['p-slug'] = 'Use de 3 a 30 letras minúsculas, números ou hífen, sem hífen no começo nem no fim.';
  if (!PADRAO_DO_HOST.test(v.host.trim()) || v.host.trim().length > 253) e['p-host'] = 'Escreva só o endereço do site, sem https:// e sem barra.';
  const ordem = Number(v.ordem);
  if (v.ordem.trim() === '' || !Number.isInteger(ordem) || ordem < -32768 || ordem > 32767) e['p-ordem'] = 'Use um número inteiro, por exemplo 0 ou 10.';
  return e;
}

function valoresDo(p: Parceiro): Valores {
  return { nome: p.name, slug: p.slug, slugEditado: true, host: p.host, ordem: String(p.sort_order), ativo: p.active };
}

/** 5.3 a 5.5: novo parceiro, edicao e erros (secao 25.5.4). */
export default function FormularioDeParceiro() {
  const { partnerSlug } = useParams();
  const editando = partnerSlug !== undefined;
  const { api, registrarRascunho } = useSessao();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [carga, setCarga] = useState<{ chave: string; fase: 'pronto' | 'erro' | 'nao-encontrado' }>();
  const [parceiro, setParceiro] = useState<Parceiro>();
  const [etag, setEtag] = useState<string>();
  const [valores, setValores] = useState<Valores>(() => (editando ? VAZIO : (retomarRascunho<Valores>(pathname) ?? VAZIO)));
  const [base, setBase] = useState<Valores>(VAZIO);
  const [errosDoServidor, setErrosDoServidor] = useState<Partial<Record<Campo, string>>>({});
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState<{ texto: string; recarregar?: boolean }>();
  const [versao, setVersao] = useState(0);
  const resumo = useRef<HTMLDivElement>(null);
  const liberado = useRef(false);

  const chaveDaCarga = `${partnerSlug ?? 'novo'}#${versao}`;
  const fase = !editando ? 'pronto' : carga?.chave === chaveDaCarga ? carga.fase : 'carregando';

  useEffect(() => {
    if (!partnerSlug) return;
    const controle = new AbortController();
    const chave = chaveDaCarga;
    api
      .GET('/admin/store/partners/{partnerSlug}', { params: { path: { partnerSlug } }, signal: controle.signal })
      .then(({ data, response }) => {
        if (controle.signal.aborted) return;
        if (!data) {
          setCarga({ chave, fase: response.status === 404 ? 'nao-encontrado' : 'erro' });
          return;
        }
        setParceiro(data);
        setEtag(response.headers.get('ETag') ?? `"${data.version}"`);
        setBase(valoresDo(data));
        setValores(retomarRascunho<Valores>(pathname) ?? valoresDo(data));
        setCarga({ chave, fase: 'pronto' });
      })
      .catch(() => {
        if (!controle.signal.aborted) setCarga({ chave, fase: 'erro' });
      });
    return () => controle.abort();
  }, [api, partnerSlug, pathname, chaveDaCarga]);

  const valoresRef = useRef(valores);
  useLayoutEffect(() => {
    valoresRef.current = valores;
  });
  useEffect(() => registrarRascunho(() => guardarRascunho(pathname, valoresRef.current)), [registrarRascunho, pathname]);

  const erros = tentou ? { ...errosDoServidor, ...validarParceiro(valores) } : errosDoServidor;

  function mudar(mudanca: Partial<Valores>) {
    setErrosDoServidor({});
    setValores((v) => {
      const novo = { ...v, ...mudanca };
      if (mudanca.nome !== undefined && !novo.slugEditado) novo.slug = slugSugerido(mudanca.nome);
      return novo;
    });
  }

  function mostrar(doServidor: Partial<Record<Campo, string>>) {
    setErrosDoServidor(doServidor);
    requestAnimationFrame(() => resumo.current?.focus());
  }

  function voltar(aviso?: string) {
    liberado.current = true;
    void navigate('/loja/parceiros', aviso ? { state: { aviso } } : {});
  }

  async function salvar() {
    setTentou(true);
    setFalha(undefined);
    const locais = validarParceiro(valores);
    if (Object.keys(locais).length) return mostrar(locais);
    setSalvando(true);
    try {
      const nome = valores.nome.trim();
      const host = valores.host.trim();
      const ordem = Number(valores.ordem);
      if (!editando) {
        const { data, error } = await api.POST('/admin/store/partners', { body: { slug: valores.slug, name: nome, host, sort_order: ordem } });
        if (data) return voltar('Parceiro cadastrado. Ele já pode ser escolhido nos produtos.');
        return recusa(error);
      }
      if (!parceiro || !etag) return;
      const patch: Esquemas['AdminStorePartnerPatch'] = {
        ...(nome !== parceiro.name ? { name: nome } : {}),
        ...(valores.slug !== parceiro.slug ? { slug: valores.slug } : {}),
        ...(host !== parceiro.host ? { host } : {}),
        ...(ordem !== parceiro.sort_order ? { sort_order: ordem } : {}),
        ...(valores.ativo !== parceiro.active ? { active: valores.ativo } : {}),
      };
      if (Object.keys(patch).length === 0) return voltar();
      const { data, error } = await api.PATCH('/admin/store/partners/{partnerSlug}', {
        params: { path: { partnerSlug: parceiro.slug }, header: { 'If-Match': etag } },
        body: patch,
      });
      if (data) return voltar('Alterações salvas.');
      return recusa(error);
    } catch {
      setFalha({ texto: 'Não conseguimos falar com o servidor. Confira a internet e tente de novo.' });
    } finally {
      setSalvando(false);
    }
  }

  function recusa(error: unknown) {
    const tipo = tipoDoProblema(error);
    if (tipo === 'slug-taken') return mostrar({ 'p-slug': 'Já existe um parceiro com este identificador. Escolha outro.' });
    if (tipo === 'precondition-failed')
      return setFalha({ texto: 'Alguém alterou este parceiro enquanto você editava, e nada foi gravado. Recarregar traz a versão atual e descarta o que você mudou aqui.', recarregar: true });
    if (tipo === 'validation-failed') {
      const e: Partial<Record<Campo, string>> = {};
      for (const erro of errosDoProblema(error)) {
        if (erro.code === 'host_mismatch_items') e['p-host'] = 'Os produtos deste parceiro têm links do site atual. Troque os links deles antes de trocar o site do parceiro.';
        else if (erro.field === 'host') e['p-host'] = 'Escreva só o endereço do site, sem https:// e sem barra.';
        else if (erro.field === 'name') e['p-nome'] = 'Informe o nome do parceiro, de 2 a 80 caracteres.';
        else if (erro.field === 'slug') e['p-slug'] = 'Use de 3 a 30 letras minúsculas, números ou hífen, sem hífen no começo nem no fim.';
        else if (erro.field === 'sort_order') e['p-ordem'] = 'Use um número inteiro, por exemplo 0 ou 10.';
      }
      if (Object.keys(e).length) return mostrar(e);
    }
    setFalha({ texto: 'Não conseguimos salvar o parceiro. Confira os campos e tente de novo.' });
  }

  const voltarLink = (
    <Link className="btn ghost voltar" to="/loja/parceiros">
      <Icone nome="back" tamanho="s20" />
      Voltar para Parceiros
    </Link>
  );

  if (fase === 'carregando') return <p role="status">Carregando…</p>;
  if (fase !== 'pronto') {
    return (
      <div className="form">
        {voltarLink}
        <Banner tipo="erro">{fase === 'nao-encontrado' ? 'Este parceiro não existe mais.' : 'Não conseguimos carregar o parceiro.'}</Banner>
      </div>
    );
  }

  const lista = ORDEM.filter((c) => erros[c]).map((c) => ({ campo: c, rotulo: ROTULOS[c] }));
  const sujo = JSON.stringify({ ...valores, slugEditado: 0 }) !== JSON.stringify({ ...(editando ? base : VAZIO), slugEditado: 0 });

  return (
    <>
      <form
        className="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        {voltarLink}
        <h1 className="t-headline">{parceiro ? parceiro.name : 'Novo parceiro'}</h1>
        {lista.length > 0 && (
          <ResumoDeErros referencia={resumo} titulo={`Corrija ${lista.length} ${lista.length === 1 ? 'campo' : 'campos'} para salvar:`} erros={lista} />
        )}
        {falha && (
          <Banner
            tipo="erro"
            acao={
              falha.recarregar ? (
                <button type="button" className="btn ghost sm" onClick={() => setVersao((n) => n + 1)}>
                  Recarregar
                </button>
              ) : undefined
            }
          >
            {falha.texto}
          </Banner>
        )}
        <p className="t-body-sm c-sec">Campos com * são obrigatórios.</p>
        <CampoDeTexto
          id="p-nome"
          dataCy="parceiro-nome"
          rotulo="Nome *"
          valor={valores.nome}
          aoMudar={(v) => mudar({ nome: v })}
          maximo={80}
          erro={erros['p-nome']}
          ajuda="Como aparece no app, abaixo de cada produto."
        />
        <CampoDeTexto
          id="p-slug"
          dataCy="parceiro-identificador"
          rotulo="Identificador *"
          valor={valores.slug}
          aoMudar={(v) => mudar({ slug: v.toLowerCase(), slugEditado: true })}
          maximo={30}
          erro={erros['p-slug']}
          ajuda={
            editando
              ? 'Aparece no endereço da lista de produtos filtrada por este parceiro. Letras minúsculas, números e hífen. Vem do nome, e você pode mudar. Se mudar, os links já salvos da lista filtrada param de filtrar.'
              : 'Aparece no endereço da lista de produtos filtrada por este parceiro. Letras minúsculas, números e hífen. Vem do nome, e você pode mudar.'
          }
        />
        <CampoDeTexto
          id="p-host"
          dataCy="parceiro-site"
          rotulo="Site do parceiro *"
          valor={valores.host}
          aoMudar={(v) => mudar({ host: v.toLowerCase() })}
          maximo={253}
          modoDeEntrada="url"
          erro={erros['p-host']}
          ajuda="Só o endereço, sem https:// e sem barra. Por exemplo: petcenteraurora.com.br. Os links dos produtos precisam ser deste site."
        />
        <CampoDeTexto
          id="p-ordem"
          dataCy="parceiro-ordem"
          rotulo="Ordem na Loja"
          valor={valores.ordem}
          aoMudar={(v) => mudar({ ordem: v })}
          modoDeEntrada="numeric"
          erro={erros['p-ordem']}
          ajuda="Número menor aparece antes."
        />
        {editando && (
          <fieldset className="field" aria-describedby="p-ativo-ajuda">
            <legend className="lab">Situação</legend>
            <div className="checks">
              <label className="check">
                <input type="radio" name="p-ativo" checked={valores.ativo} onChange={() => mudar({ ativo: true })} />
                <span>Ativo</span>
              </label>
              <label className="check">
                <input type="radio" name="p-ativo" checked={!valores.ativo} onChange={() => mudar({ ativo: false })} />
                <span>Inativo</span>
              </label>
            </div>
            <span className="help" id="p-ativo-ajuda">
              Parceiro inativo tira todos os produtos dele da Loja do app, sem mudar o estado de cada produto.
            </span>
          </fieldset>
        )}
        <div className="rodape-form">
          <Link className="btn sec" to="/loja/parceiros">
            Cancelar
          </Link>
          <button type="submit" className="btn pri" data-cy="parceiro-salvar" aria-busy={salvando || undefined} disabled={salvando}>
            {salvando && <span className="spin" aria-hidden="true" />}
            {editando ? 'Salvar alterações' : 'Cadastrar parceiro'}
          </button>
        </div>
      </form>
      <SairSemSalvar sujo={sujo && !salvando} liberado={liberado} />
    </>
  );
}
