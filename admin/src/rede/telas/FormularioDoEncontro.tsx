/**
 * 4 · Rede: formulario (25.3 quadros 4.9 a 4.13, 25.5.2, UX 29.5 e 29.10).
 *
 * Criar e publicar e uma operacao so (12.9). Na edicao, o que mudou decide o
 * caminho (`planoDeEdicao`): titulo, descricao, fotos, o que levar,
 * observacoes e detalhes vao sem senha; data, horario e lugar, e visibilidade
 * e custo, abrem o dialogo com motivo e senha, porque o contrato os separa em
 * operacoes com reautenticacao e aviso a todos os administradores.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import { Banner, CampoDeTexto, ErroDoCampo, ResumoDeErros } from '../../componentes/basicos.tsx';
import { enviarImagem } from '../../componentes/envio-de-imagem.ts';
import { Galeria } from '../../componentes/Galeria.tsx';
import { Icone } from '../../componentes/Icone.tsx';
import { SairSemSalvar } from '../../componentes/SairSemSalvar.tsx';
import { guardarRascunho, retomarRascunho } from '../../sessao/rascunho.ts';
import { useSessao } from '../../sessao/ProvedorDeSessao.tsx';
import { mensagemDaFalha } from '../api/mensagens.ts';
import { precisaReler, type Falha } from '../api/redeApi.ts';
import { DialogoComMotivoESenha, type ResultadoDaAcao } from '../componentes/DialogoComMotivoESenha.tsx';
import {
  corpoDaMudanca,
  formularioDoEncontro,
  formularioVazio,
  avisoDeFotosSemEnvio,
  LIMITE_DAS_OBSERVACOES,
  MARCA_SEM_ENVIO,
  semEnvio,
  LIMITE_DO_RESUMO,
  montarCriacao,
  planoDeEdicao,
  tituloDaMudanca,
  validar,
  type Campo,
  type ErroDeCampo,
  type EstadoDoFormulario,
  type PlanoDeEdicao,
} from '../dominio/formulario.ts';
import { chaves, ESTRUTURAS, IDADES, ITENS_PARA_LEVAR, PORTES, UFS, UNIDADES } from '../dominio/rotulos.ts';
import type { Encontro, EscopoDeReautenticacao } from '../dominio/tipos.ts';
import { centavosDoTexto, valorComoOAppMostra } from '../dominio/valor.ts';
import { SeletorDePonto } from '../mapa/SeletorDePonto.tsx';
import estilos from '../rede.module.css';
import { etagDe, useRede } from '../usarRede.ts';

const AJUDA_DAS_FOTOS =
  'JPG, PNG ou WebP, até 5 MB cada, com pelo menos 600 × 600 pixels. A primeira é a capa: ela aparece na lista e no app. Arraste para reordenar, ou use os botões de mover. Opcional.';

/** O id do elemento que recebe o foco pelo resumo de erros. */
function idDoCampo(campo: Campo): string {
  if (campo.startsWith('alt-')) return `fotos-${campo}`;
  if (campo === 'fotos') return 'fotos';
  return `enc-${campo}`;
}

const ROTULO_DO_CAMPO: Partial<Record<Campo, string>> = {
  titulo: 'Título',
  resumo: 'Descrição',
  fotos: 'Fotos',
  inicio: 'Início',
  fim: 'Fim',
  local: 'Nome do local',
  bairro: 'Bairro',
  cidade: 'Cidade',
  valor: 'Valor em reais',
  observacoes: 'Observações',
  portes: 'Portes aceitos',
};

/** Erro que o servidor devolveu, no campo da tela. */
const CAMPO_DO_SERVIDOR: Record<string, Campo> = {
  title: 'titulo',
  summary: 'resumo',
  starts_at: 'inicio',
  ends_at: 'fim',
  'place.place_name': 'local',
  'place.neighborhood': 'bairro',
  'place.city': 'cidade',
  notes: 'observacoes',
  'admission.price': 'valor',
  'admission.price.amount': 'valor',
  accepted_sizes: 'portes',
  images: 'fotos',
};

function errosDoServidor(falha: Falha): ErroDeCampo[] {
  if (falha.tipo !== 'validacao') return [];
  const texto = mensagemDaFalha(falha, 'salvar');
  return falha.erros.flatMap((e) => {
    const campo = CAMPO_DO_SERVIDOR[e.field];
    return campo ? [{ campo, rotulo: ROTULO_DO_CAMPO[campo] ?? campo, mensagem: texto }] : [];
  });
}

function comparavel(f: EstadoDoFormulario): string {
  return JSON.stringify({ ...f, fotos: f.fotos.map((x) => [x.uploadId ?? x.chave, x.alt]) });
}

interface DialogoPendente {
  plano: PlanoDeEdicao;
  escopos: EscopoDeReautenticacao[];
}

export default function FormularioDoEncontro() {
  const { eventSlug } = useParams();
  const editando = eventSlug !== undefined;
  const modo = editando ? 'editar' : 'novo';
  const { rede, cliente } = useRede();
  const sessao = useSessao();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [encontro, setEncontro] = useState<Encontro>();
  const [etag, setEtag] = useState<string>();
  const [f, setF] = useState<EstadoDoFormulario>(() => (editando ? formularioVazio() : (retomarRascunho<EstadoDoFormulario>(pathname) ?? formularioVazio())));
  const [base, setBase] = useState<EstadoDoFormulario>(formularioVazio);
  const [tentou, setTentou] = useState(false);
  const [doServidor, setDoServidor] = useState<ErroDeCampo[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState<string>();
  const [dialogo, setDialogo] = useState<DialogoPendente>();
  const [versao, setVersao] = useState(0);
  // A carga vale para uma chave (encontro e versao): chave nova e 'carregando' sem setState no efeito.
  const chaveDaCarga = `${eventSlug ?? ''}:${versao}`;
  const [carga, setCarga] = useState<{ chave: string; fase: 'pronto' | 'erro' | 'nao-encontrado' }>(() => ({ chave: editando ? '' : chaveDaCarga, fase: 'pronto' }));
  const fase = carga.chave === chaveDaCarga ? carga.fase : 'carregando';
  const resumo = useRef<HTMLDivElement>(null);
  const liberado = useRef(false);

  const mudar = useCallback(<K extends keyof EstadoDoFormulario>(campo: K, valor: EstadoDoFormulario[K]) => {
    setF((atual) => ({ ...atual, [campo]: valor }));
    setDoServidor((e) => e.filter((x) => x.campo !== campo));
  }, []);

  useEffect(() => {
    if (!eventSlug) return;
    let ativo = true;
    const chave = `${eventSlug}:${versao}`;
    void rede.obter(eventSlug).then((r) => {
      if (!ativo) return;
      if (!r.ok) {
        setCarga({ chave, fase: r.falha.tipo === 'nao-encontrado' ? 'nao-encontrado' : 'erro' });
        return;
      }
      const doEncontro = formularioDoEncontro(r.dados);
      setEncontro(r.dados);
      setEtag(etagDe(r.dados, r.etag));
      setBase(doEncontro);
      setF(retomarRascunho<EstadoDoFormulario>(pathname) ?? doEncontro);
      setTentou(false);
      setDoServidor([]);
      setCarga({ chave, fase: 'pronto' });
    });
    return () => {
      ativo = false;
    };
  }, [rede, eventSlug, pathname, versao]);

  // UX 29.2: se a sessao cair, o formulario fica guardado para depois do login.
  const fRef = useRef(f);
  useEffect(() => {
    fRef.current = f;
  });
  useEffect(
    () => sessao.registrarRascunho(() => guardarRascunho(pathname, { ...fRef.current, fotos: fRef.current.fotos.filter((x) => x.uploadId) })),
    [sessao, pathname],
  );

  const errosLocais = useMemo(() => (tentou ? validar(f, modo) : []), [tentou, f, modo]);
  const erros = [...errosLocais, ...doServidor.filter((s) => !errosLocais.some((l) => l.campo === s.campo))];
  const erroDe = (campo: Campo) => erros.find((e) => e.campo === campo)?.mensagem;

  const sujo = fase === 'pronto' && comparavel(f) !== comparavel(editando ? base : formularioVazio());
  const publicado = encontro?.publication_status === 'published';
  const cancelado = encontro?.publication_status === 'cancelled';
  const removido = encontro?.publication_status === 'removed';
  const travarLugarEAcesso = editando && !publicado;

  function sair(aviso: string) {
    liberado.current = true;
    void navigate('/rede', { state: { aviso } });
  }

  function mostrarErros() {
    requestAnimationFrame(() => resumo.current?.focus());
  }

  function tratarFalha(r: Falha, acao: string) {
    const noCampo = errosDoServidor(r);
    if (noCampo.length) {
      setDoServidor(noCampo);
      mostrarErros();
      return;
    }
    if (precisaReler(r)) setVersao((n) => n + 1);
    setFalha(mensagemDaFalha(r, acao));
  }

  async function salvar() {
    if (salvando) return;
    setTentou(true);
    setFalha(undefined);
    setDoServidor([]);
    if (validar(f, modo).length > 0) {
      mostrarErros();
      return;
    }
    if (!editando) {
      setSalvando(true);
      const r = await rede.criar(montarCriacao(f));
      setSalvando(false);
      if (r.ok) sair('Encontro publicado. Ele já aparece na Rede do app.');
      else tratarFalha(r.falha, 'publicar o encontro');
      return;
    }
    if (!encontro || !etag) return;
    const plano = planoDeEdicao(encontro, travarLugarEAcesso ? { ...f, ...lugarEAcessoDe(base) } : f);
    if (!plano.patch && !plano.mudanca && !plano.acesso) {
      sair('Alterações salvas. O app já mostra os dados novos.');
      return;
    }
    if (plano.mudanca || plano.acesso) {
      const escopos: EscopoDeReautenticacao[] = [];
      if (plano.mudanca) escopos.push('network_event_relocation');
      if (plano.acesso) escopos.push('network_event_access_change');
      setDialogo({ plano, escopos });
      return;
    }
    setSalvando(true);
    const r = await rede.atualizar(encontro.slug, etag, plano.patch ?? {});
    setSalvando(false);
    if (r.ok) sair('Alterações salvas. O app já mostra os dados novos.');
    else tratarFalha(r.falha, 'salvar as alterações');
  }

  /** Patch sem senha primeiro; depois mudanca e acesso, cada um com o seu token, cada um com o ETag da resposta anterior. */
  async function executarComSenha(plano: PlanoDeEdicao, tokens: Partial<Record<EscopoDeReautenticacao, string>>, motivo: string): Promise<ResultadoDaAcao> {
    if (!encontro || !etag) return { ok: false, mensagem: 'Recarregue a página e tente de novo.' };
    let slug = encontro.slug;
    let versaoAtual = etag;
    const passos: Array<() => Promise<{ ok: true; dados: Encontro; etag: string | null } | { ok: false; falha: Falha }>> = [];
    if (plano.patch) {
      const patch = plano.patch;
      passos.push(() => rede.atualizar(slug, versaoAtual, patch));
    }
    if (plano.mudanca) {
      const mudanca = plano.mudanca;
      const token = tokens.network_event_relocation ?? '';
      passos.push(() => rede.mover(token, slug, versaoAtual, { ...mudanca, reason: motivo }));
    }
    if (plano.acesso) {
      const acesso = plano.acesso;
      const token = tokens.network_event_access_change ?? '';
      passos.push(() => rede.mudarAcesso(token, slug, versaoAtual, { ...acesso, reason: motivo }));
    }
    for (const [i, passo] of passos.entries()) {
      const r = await passo();
      if (!r.ok) {
        const parcial = i > 0 ? ' Uma parte das alterações já foi salva; a página foi atualizada.' : '';
        if (i > 0 || precisaReler(r.falha)) setVersao((n) => n + 1);
        return { ok: false, mensagem: mensagemDaFalha(r.falha, 'salvar a mudança') + parcial };
      }
      slug = r.dados.slug;
      versaoAtual = etagDe(r.dados, r.etag);
    }
    sair('Alterações salvas. O app já mostra os dados novos.');
    return { ok: true };
  }

  if (fase === 'carregando') {
    return (
      <p className="t-body-sm c-sec" role="status">
        Carregando o encontro…
      </p>
    );
  }
  if (fase === 'nao-encontrado' || fase === 'erro') {
    return (
      <>
        <VoltarParaARede />
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
          {fase === 'erro' ? 'Não conseguimos carregar o encontro.' : 'Este encontro não existe mais.'}
        </Banner>
      </>
    );
  }
  if (removido) {
    return (
      <>
        <VoltarParaARede />
        <h1 className="t-headline">{encontro?.title}</h1>
        <Banner tipo="info">Este encontro foi removido. Ele não aparece no app e não pode mais ser alterado.</Banner>
      </>
    );
  }

  const centavos = f.pago ? centavosDoTexto(f.valor) : null;
  const previa = centavos ? valorComoOAppMostra(centavos, f.unidade) : `R$ 15 ${UNIDADES[f.unidade]}`;
  const nErros = erros.length;

  return (
    <form
      className="form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void salvar();
      }}
    >
      <VoltarParaARede />
      <h1 className="t-headline">{editando ? encontro?.title : 'Novo encontro'}</h1>
      {editando && encontro?.visibility === 'private' && (
        <Link className="btn sec" style={{ alignSelf: 'flex-start' }} to={`/rede/${encontro.slug}/pedidos`}>
          <Icone nome="groups" tamanho="s20" />
          Pedidos para participar{encontro.pending_request_count ? ` (${encontro.pending_request_count} pendentes)` : ''}
        </Link>
      )}
      {encontro?.timing === 'ended' && publicado && (
        <Banner tipo="info">Este encontro já aconteceu. Você ainda pode corrigir os dados, e a correção aparece no app.</Banner>
      )}
      {cancelado && (
        <Banner tipo="info">
          Este encontro foi cancelado. Você ainda pode corrigir título, descrição, fotos e detalhes; data, local e acesso não mudam mais.
        </Banner>
      )}
      {falha && <Banner tipo="erro">{falha}</Banner>}
      {nErros > 0 && (
        <ResumoDeErros
          referencia={resumo}
          titulo={`Corrija ${nErros} ${nErros === 1 ? 'campo' : 'campos'} para ${editando ? 'salvar' : 'publicar'}:`}
          erros={erros.map((e) => ({ campo: idDoCampo(e.campo), rotulo: e.rotulo }))}
        />
      )}
      <p className="t-body-sm c-sec">Campos com * são obrigatórios.</p>

      <CampoDeTexto id="enc-titulo" rotulo="Título *" valor={f.titulo} aoMudar={(v) => mudar('titulo', v)} maximo={120} erro={erroDe('titulo')} />
      <CampoDaDescricao valor={f.resumo} aoMudar={(v) => mudar('resumo', v)} erro={erroDe('resumo')} />
      <Galeria
        id="fotos"
        titulo="Fotos"
        principal="Capa"
        ajuda={AJUDA_DAS_FOTOS}
        proposito="network_event"
        imagens={f.fotos}
        aoMudar={(atualizar) => setF((atual) => ({ ...atual, fotos: atualizar(atual.fotos) }))}
        enviar={(arquivo, aoProgredir) => enviarImagem(cliente, arquivo, 'network_event', aoProgredir)}
        mostrarErrosDeDescricao={tentou}
        erro={erroDe('fotos')}
        marca={(im) => (semEnvio(im) ? MARCA_SEM_ENVIO : undefined)}
      />
      {avisoDeFotosSemEnvio(f) && <Banner tipo="alerta">{avisoDeFotosSemEnvio(f)}</Banner>}

      <h2 className={`t-title ${estilos.secao ?? ''}`}>Quando e onde</h2>
      <fieldset className={estilos.grupo} disabled={travarLugarEAcesso}>
        <legend className="sr">Quando e onde</legend>
        <div className="form">
          <div className="row2">
            <CampoDeDataEHora id="enc-inicio" rotulo="Início *" valor={f.inicio} aoMudar={(v) => mudar('inicio', v)} erro={erroDe('inicio')} />
            <CampoDeDataEHora id="enc-fim" rotulo="Fim" valor={f.fim} aoMudar={(v) => mudar('fim', v)} erro={erroDe('fim')} />
          </div>
          <div className="field">
            <span className="lab">Ponto do encontro no mapa</span>
            <span className="help">Clique no mapa onde o encontro acontece. Use um lugar público, como praça, parque ou rua. Nunca uma casa.</span>
            <SeletorDePonto ponto={f.ponto} aoMudar={(p) => mudar('ponto', p)} desabilitado={travarLugarEAcesso} />
            <span className="help">Recomendado. Sem ponto, o app não mostra o mapa nem a distância do encontro.</span>
          </div>
          <CampoDeTexto
            id="enc-local"
            rotulo="Nome do local *"
            valor={f.local}
            aoMudar={(v) => mudar('local', v)}
            maximo={80}
            ajuda="Como aparece no app. Por exemplo: Praça Benedito Calixto."
            erro={erroDe('local')}
          />
          <div className={estilos.row3}>
            <CampoDeTexto id="enc-bairro" rotulo="Bairro *" valor={f.bairro} aoMudar={(v) => mudar('bairro', v)} maximo={60} erro={erroDe('bairro')} />
            <CampoDeTexto id="enc-cidade" rotulo="Cidade *" valor={f.cidade} aoMudar={(v) => mudar('cidade', v)} maximo={60} erro={erroDe('cidade')} />
            <div className="field">
              <label htmlFor="enc-uf">UF *</label>
              <select id="enc-uf" className={estilos.selecao} value={f.uf} onChange={(e) => mudar('uf', e.target.value)}>
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </fieldset>

      <h2 className={`t-title ${estilos.secao ?? ''}`}>Participação</h2>
      <fieldset className={estilos.grupo} disabled={travarLugarEAcesso}>
        <legend className="sr">Participação</legend>
        <div className="form">
          <GrupoDeOpcoes rotulo="Quem pode participar *">
            <Opcao nome="visibilidade" marcada={f.visibilidade === 'public'} aoMarcar={() => mudar('visibilidade', 'public')} titulo="Público">
              Qualquer pessoa vê o encontro no app e pode ir.
            </Opcao>
            <Opcao nome="visibilidade" marcada={f.visibilidade === 'private'} aoMarcar={() => mudar('visibilidade', 'private')} titulo="Privado">
              Quem quer ir faz um pedido, e você aprova ou recusa aqui. No app, o local e os detalhes só aparecem para quem for aprovado. Quem for recusado não é avisado.
            </Opcao>
          </GrupoDeOpcoes>
          <GrupoDeOpcoes rotulo="Custo *">
            <Opcao nome="custo" marcada={!f.pago} aoMarcar={() => mudar('pago', false)} titulo="Gratuito">
              Sem custo para participar.
            </Opcao>
            <Opcao nome="custo" marcada={f.pago} aoMarcar={() => mudar('pago', true)} titulo="Pago">
              O app mostra o valor. O Bichu não cobra, não recebe e não mostra como pagar.
            </Opcao>
          </GrupoDeOpcoes>
          {f.pago && (
            <div className={estilos.blocoInterno}>
              <div className="row2">
                <CampoDeTexto
                  id="enc-valor"
                  rotulo="Valor em reais *"
                  valor={f.valor}
                  aoMudar={(v) => mudar('valor', v)}
                  modoDeEntrada="decimal"
                  maximo={12}
                  erro={erroDe('valor')}
                />
                <div className="field">
                  <label htmlFor="enc-unidade">Cobrado</label>
                  <select
                    id="enc-unidade"
                    className={estilos.selecao}
                    value={f.unidade}
                    onChange={(e) => mudar('unidade', e.target.value as EstadoDoFormulario['unidade'])}
                  >
                    {chaves(UNIDADES).map((u) => (
                      <option key={u} value={u}>
                        {UNIDADES[u]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="t-body-sm" aria-live="polite">
                O app mostra: <strong>{previa}</strong>
              </p>
            </div>
          )}
        </div>
      </fieldset>

      <GrupoDeCaixas
        rotulo="O que levar"
        ajuda="Marque o que aparece no app."
        opcoes={ITENS_PARA_LEVAR}
        marcadas={f.levar}
        aoMudar={(v) => mudar('levar', v)}
      />

      <CampoDeObservacoes valor={f.observacoes} aoMudar={(v) => mudar('observacoes', v)} erro={erroDe('observacoes')} />

      <h2 className={`t-title ${estilos.secao ?? ''}`}>Detalhes</h2>
      <GrupoDeCaixas
        id="enc-portes"
        rotulo="Portes aceitos *"
        ajuda="Com os quatro marcados, o app mostra “Todos os portes”."
        opcoes={PORTES}
        marcadas={f.portes}
        aoMudar={(v) => mudar('portes', v)}
        erro={erroDe('portes')}
      />
      <GrupoDeRadios rotulo="Idade dos cães *" nome="idade" opcoes={IDADES} valor={f.idade} aoMudar={(v) => mudar('idade', v)} />
      <div className="row2">
        <SimOuNao
          rotulo="Vacinação em dia exigida *"
          nome="vacina"
          valor={f.vacina}
          aoMudar={(v) => mudar('vacina', v)}
          ajuda="Sim: o app mostra “Vacinação em dia” em Para quais cães."
        />
        <SimOuNao
          rotulo="O local tem área cercada para cães soltos *"
          nome="cercada"
          valor={f.cercada}
          aoMudar={(v) => mudar('cercada', v)}
          ajuda="Muda uma linha dos cuidados no app: com área cercada, o cão pode ficar solto dentro dela; sem, fica na guia o tempo todo."
        />
      </div>
      <GrupoDeCaixas
        rotulo="Acessibilidade e estrutura do local"
        ajuda="Marque só o que existe no local."
        opcoes={ESTRUTURAS}
        marcadas={f.estrutura}
        aoMudar={(v) => mudar('estrutura', v)}
      />

      <div className="rodape-form">
        <Link className="btn sec" to="/rede" aria-disabled={salvando || undefined}>
          Cancelar
        </Link>
        <button type="submit" className="btn pri" aria-busy={salvando || undefined}>
          {salvando && <span className="spin" aria-hidden="true" />}
          {editando ? 'Salvar alterações' : 'Publicar encontro'}
        </button>
      </div>

      <SairSemSalvar sujo={sujo && !salvando} liberado={liberado} />
      {dialogo && encontro && (
        <DialogoComMotivoESenha
          titulo={tituloDaMudanca(dialogo.plano)}
          corpo={corpoDaMudanca(encontro, f, dialogo.plano)}
          rotuloDoMotivo="Motivo"
          ajudaDoMotivo="Vai no e-mail que avisa os administradores. Não aparece no app."
          rotuloDaAcao="Salvar a mudança"
          perigo={false}
          escopos={dialogo.escopos}
          executar={(tokens, motivo) => executarComSenha(dialogo.plano, tokens, motivo)}
          aoFechar={() => setDialogo(undefined)}
        />
      )}
    </form>
  );
}

/** Com o encontro cancelado, lugar e acesso ficam como estavam: o plano nao os toca. */
function lugarEAcessoDe(b: EstadoDoFormulario): Partial<EstadoDoFormulario> {
  const { inicio, fim, ponto, local, bairro, cidade, uf, visibilidade, pago, valor, unidade } = b;
  return { inicio, fim, ponto, local, bairro, cidade, uf, visibilidade, pago, valor, unidade };
}

function VoltarParaARede() {
  return (
    <Link className={`btn ghost voltar ${estilos.voltar ?? ''}`} to="/rede">
      <Icone nome="back" tamanho="s20" />
      Voltar para a Rede
    </Link>
  );
}

function CampoDeDataEHora({ id, rotulo, valor, aoMudar, erro }: { id: string; rotulo: string; valor: string; aoMudar: (v: string) => void; erro?: string | undefined }) {
  return (
    <div className={erro ? 'field err' : 'field'}>
      <label htmlFor={id}>{rotulo}</label>
      <input
        className="input"
        id={id}
        type="datetime-local"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        aria-invalid={erro ? true : undefined}
        aria-describedby={`${id}-ajuda`}
      />
      {erro ? (
        <ErroDoCampo id={`${id}-ajuda`}>{erro}</ErroDoCampo>
      ) : (
        <span className="help" id={`${id}-ajuda`}>
          Horário de Brasília.
        </span>
      )}
    </div>
  );
}

/**
 * Descricao do encontro (`summary`, ate 200): area de varias linhas que cresce
 * com o texto, com contador. `field-sizing: content` onde o navegador sabe; nos
 * outros, a altura acompanha o `scrollHeight` a cada mudanca.
 */
function CampoDaDescricao({ valor, aoMudar, erro }: { valor: string; aoMudar: (v: string) => void; erro?: string | undefined }) {
  const id = 'enc-resumo';
  const area = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${String(el.scrollHeight)}px`;
  }, [valor]);
  return (
    <div className={erro ? 'field err' : 'field'}>
      <label htmlFor={id}>Descrição *</label>
      <textarea
        ref={area}
        id={id}
        rows={3}
        className={`input ${estilos.areaQueCresce ?? ''}`}
        maxLength={LIMITE_DO_RESUMO}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        aria-invalid={erro ? true : undefined}
        aria-describedby={`${id}-ajuda ${id}-contador`}
      />
      {erro ? (
        <span className="help err" id={`${id}-ajuda`} aria-live="polite">
          <Icone nome="error" tamanho="s20" />
          {erro}
        </span>
      ) : (
        <span className="help" id={`${id}-ajuda`}>
          Aparece no cartão e no topo da página do encontro.
        </span>
      )}
      <span className="help contador" id={`${id}-contador`}>
        {valor.length}/{LIMITE_DO_RESUMO}
      </span>
    </div>
  );
}

function CampoDeObservacoes({ valor, aoMudar, erro }: { valor: string; aoMudar: (v: string) => void; erro?: string | undefined }) {
  const id = 'enc-observacoes';
  return (
    <div className={erro ? 'field err' : 'field'}>
      <label htmlFor={id}>Observações</label>
      <textarea
        id={id}
        className={`input ${estilos.area ?? ''}`}
        maxLength={LIMITE_DAS_OBSERVACOES}
        placeholder="Algo que quem vai precisa saber."
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        aria-invalid={erro ? true : undefined}
        aria-describedby={`${id}-ajuda ${id}-contador`}
      />
      {erro ? (
        <span className="help err" id={`${id}-ajuda`} aria-live="polite">
          <Icone nome="error" tamanho="s20" />
          {erro}
        </span>
      ) : (
        <span className="help" id={`${id}-ajuda`}>
          Aparece para todos, no fim da página do encontro. Não coloque telefone, e-mail, chave Pix nem dados de outra pessoa.
        </span>
      )}
      <span className="help contador" id={`${id}-contador`}>
        {valor.length}/{LIMITE_DAS_OBSERVACOES}
      </span>
    </div>
  );
}

function GrupoDeOpcoes({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <fieldset className={`field ${estilos.grupo ?? ''}`}>
      <legend className="lab">{rotulo}</legend>
      <div className={estilos.opcoes}>{children}</div>
    </fieldset>
  );
}

function Opcao({ nome, marcada, aoMarcar, titulo, children }: { nome: string; marcada: boolean; aoMarcar: () => void; titulo: string; children: ReactNode }) {
  const id = useId();
  return (
    <label className={estilos.opcao}>
      <input type="radio" name={nome} checked={marcada} onChange={aoMarcar} aria-describedby={id} />
      <span className={estilos.opcaoTexto}>
        <span className="t-label">{titulo}</span>
        <span className={`t-body-sm ${estilos.opcaoAjuda ?? ''}`} id={id}>
          {children}
        </span>
      </span>
    </label>
  );
}

function GrupoDeCaixas<K extends string>({
  id,
  rotulo,
  ajuda,
  opcoes,
  marcadas,
  aoMudar,
  erro,
}: {
  id?: string;
  rotulo: string;
  ajuda: string;
  opcoes: Record<K, string>;
  marcadas: K[];
  aoMudar: (v: K[]) => void;
  erro?: string | undefined;
}) {
  const idDaAjuda = useId();
  return (
    <fieldset className={`field ${estilos.grupo ?? ''} ${erro ? 'err' : ''}`} aria-describedby={idDaAjuda} {...(id ? { id, tabIndex: -1 } : {})}>
      <legend className="lab">{rotulo}</legend>
      <div className="checks">
        {chaves(opcoes).map((k) => (
          <label key={k} className="check">
            <input
              type="checkbox"
              checked={marcadas.includes(k)}
              onChange={(e) => aoMudar(e.target.checked ? [...marcadas, k] : marcadas.filter((x) => x !== k))}
            />
            <span>{opcoes[k]}</span>
          </label>
        ))}
      </div>
      {erro ? (
        <ErroDoCampo id={idDaAjuda}>{erro}</ErroDoCampo>
      ) : (
        <span className="help" id={idDaAjuda}>
          {ajuda}
        </span>
      )}
    </fieldset>
  );
}

function GrupoDeRadios<K extends string>({ rotulo, nome, opcoes, valor, aoMudar }: { rotulo: string; nome: string; opcoes: Record<K, string>; valor: K; aoMudar: (v: K) => void }) {
  return (
    <fieldset className={`field ${estilos.grupo ?? ''}`}>
      <legend className="lab">{rotulo}</legend>
      <div className="checks">
        {chaves(opcoes).map((k) => (
          <label key={k} className="check">
            <input type="radio" name={nome} checked={valor === k} onChange={() => aoMudar(k)} />
            <span>{opcoes[k]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SimOuNao({ rotulo, nome, valor, aoMudar, ajuda }: { rotulo: string; nome: string; valor: boolean; aoMudar: (v: boolean) => void; ajuda: string }) {
  const id = useId();
  return (
    <fieldset className={`field ${estilos.grupo ?? ''}`} aria-describedby={id}>
      <legend className="lab">{rotulo}</legend>
      <div className="checks">
        <label className="check">
          <input type="radio" name={nome} checked={valor} onChange={() => aoMudar(true)} />
          <span>Sim</span>
        </label>
        <label className="check">
          <input type="radio" name={nome} checked={!valor} onChange={() => aoMudar(false)} />
          <span>Não</span>
        </label>
      </div>
      <span className="help" id={id}>
        {ajuda}
      </span>
    </fieldset>
  );
}
