import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

import { Banner, CampoDeTexto, ResumoDeErros } from '../componentes/basicos.tsx';
import { Dialogo } from '../componentes/Dialogo.tsx';
import { Icone } from '../componentes/Icone.tsx';
import { SairSemSalvar } from '../componentes/SairSemSalvar.tsx';
import { useSessao } from '../sessao/ProvedorDeSessao.tsx';
import { guardarRascunho, retomarRascunho } from '../sessao/rascunho.ts';
import estilos from './comunicados.module.css';
import {
  alcanceEmPalavras,
  LIMITE_DO_CORPO,
  LIMITE_DO_TITULO,
  mensagemDoErroDaJanela,
  mensagemDoErroDoDisparo,
  motivoDaTrava,
  ORDEM_DOS_CAMPOS,
  plural,
  rascunhoDe,
  ROTULOS,
  tetoEmPalavras,
  textoDoComunicado,
  textoDoRascunho,
  travaDoDisparo,
  validarComunicado,
  VAZIO,
  type CampoDoComunicado,
  type JanelaGuardada,
  type ValoresDoComunicado,
} from './dominio.ts';
import { CAMINHO_DA_LISTA } from './rotas.tsx';

type Resultado = { ok: true } | { ok: false; mensagem: string };

/** A tela de disparo do comunicado. */
export default function FormularioDeComunicado() {
  const { api, registrarRascunho } = useSessao();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [valores, setValores] = useState<ValoresDoComunicado>(() => retomarRascunho<ValoresDoComunicado>(pathname) ?? VAZIO);
  const [errosDoServidor, setErrosDoServidor] = useState<Partial<Record<CampoDoComunicado, string>>>({});
  const [tentou, setTentou] = useState(false);
  const [guardada, setGuardada] = useState<JanelaGuardada>();
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);
  const [falha, setFalha] = useState<string>();
  const [confirmando, setConfirmando] = useState(false);
  const resumo = useRef<HTMLDivElement>(null);
  const liberado = useRef(false);
  const idDaTrava = useId();
  const idDaPrevia = useId();

  const valoresRef = useRef(valores);
  useLayoutEffect(() => {
    valoresRef.current = valores;
  });
  useEffect(() => registrarRascunho(() => guardarRascunho(pathname, valoresRef.current)), [registrarRascunho, pathname]);

  const erros = tentou ? { ...errosDoServidor, ...validarComunicado(valores) } : errosDoServidor;
  const trava = travaDoDisparo(valores, guardada);
  const vencida = guardada !== undefined && textoDoRascunho(guardada.rascunho) !== textoDoComunicado(valores);

  function mudar(mudanca: Partial<ValoresDoComunicado>) {
    setErrosDoServidor({});
    setFalha(undefined);
    setValores((v) => ({ ...v, ...mudanca }));
  }

  function mostrar(doServidor: Partial<Record<CampoDoComunicado, string>>) {
    setErrosDoServidor(doServidor);
    requestAnimationFrame(() => resumo.current?.focus());
  }

  async function verPrevia() {
    if (carregandoPrevia) return;
    setTentou(true);
    setFalha(undefined);
    const locais = validarComunicado(valores);
    if (Object.keys(locais).length) {
      mostrar(locais);
      return;
    }
    setCarregandoPrevia(true);
    const rascunho = rascunhoDe(valores);
    try {
      const { data, response } = await api.GET('/admin/broadcasts/dispatch-window');
      if (data) {
        setErrosDoServidor({});
        setGuardada({ rascunho, janela: data });
        return;
      }
      setFalha(mensagemDoErroDaJanela(response.status));
    } catch {
      setFalha(mensagemDoErroDaJanela(0));
    } finally {
      setCarregandoPrevia(false);
    }
  }

  async function disparar(): Promise<Resultado> {
    const travaAgora = travaDoDisparo(valores, guardada);
    if (travaAgora !== undefined || !guardada) {
      return { ok: false, mensagem: motivoDaTrava(travaAgora ?? 'sem-previa', guardada?.janela) };
    }
    const { data, error, response } = await api.POST('/admin/broadcasts', { body: guardada.rascunho });
    if (data) {
      liberado.current = true;
      void navigate(CAMINHO_DA_LISTA, {
        state: {
          aviso: `Comunicado disparado para ${data.recipients_total.toLocaleString('pt-BR')} ${plural(data.recipients_total, 'caixa', 'caixas')} de notificação. Ele não pode ser desfeito nem apagado.`,
        },
      });
      return { ok: true };
    }
    return { ok: false, mensagem: mensagemDoErroDoDisparo(response.status, error, guardada.janela.daily_cap) };
  }

  const lista = ORDEM_DOS_CAMPOS.filter((c) => erros[c]).map((c) => ({ campo: c, rotulo: ROTULOS[c] }));
  const sujo = textoDoComunicado(valores) !== textoDoComunicado(VAZIO);

  return (
    <>
      <form
        className="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void verPrevia();
        }}
      >
        <Link className="btn ghost voltar" to={CAMINHO_DA_LISTA}>
          <Icone nome="back" tamanho="s20" />
          Voltar para Comunicados
        </Link>
        <h1 className="t-headline">Novo comunicado</h1>
        <p className="t-body c-sec">
          Vai para a caixa de notificações de todo mundo. Veja a prévia antes de disparar: depois de disparado, o comunicado
          não pode ser desfeito, editado nem apagado.
        </p>
        {lista.length > 0 && (
          <ResumoDeErros
            referencia={resumo}
            titulo={`Corrija ${lista.length} ${lista.length === 1 ? 'campo' : 'campos'} para ver a prévia:`}
            erros={lista}
          />
        )}
        {falha && <Banner tipo="erro">{falha}</Banner>}
        <p className="t-body-sm c-sec">Campos com * são obrigatórios.</p>
        <CampoDeTexto
          id="c-titulo"
          dataCy="comunicado-titulo"
          rotulo="Título *"
          valor={valores.titulo}
          aoMudar={(v) => mudar({ titulo: v })}
          maximo={LIMITE_DO_TITULO}
          contador
          erro={erros['c-titulo']}
          ajuda="A primeira linha da notificação. Diga o assunto em poucas palavras."
        />
        <CampoDeTexto
          id="c-corpo"
          dataCy="comunicado-corpo"
          rotulo="Mensagem *"
          valor={valores.corpo}
          aoMudar={(v) => mudar({ corpo: v })}
          maximo={LIMITE_DO_CORPO}
          contador
          linhas={8}
          erro={erros['c-corpo']}
          ajuda="Texto puro. A quebra de linha que você digitar aparece na caixa; etiquetas de HTML aparecem como letras."
        />
        <div className="acoes">
          <button
            type="submit"
            className="btn sec"
            data-cy="comunicado-previa"
            aria-busy={carregandoPrevia || undefined}
            disabled={carregandoPrevia}
          >
            {carregandoPrevia && <span className="spin" aria-hidden="true" />}
            Ver prévia
          </button>
        </div>
        {guardada && (
          <section className="bloco" aria-labelledby={idDaPrevia} data-cy="comunicado-previa-caixa">
            <h2 className="t-title" id={idDaPrevia}>
              Prévia
            </h2>
            {vencida && <Banner tipo="alerta">{motivoDaTrava('previa-vencida', guardada.janela)}</Banner>}
            <p className="t-body-sm c-sec">Como a notificação vai aparecer:</p>
            <div className={estilos.caixa}>
              <strong className="t-label-lg" data-cy="previa-titulo">
                {guardada.rascunho.title}
              </strong>
              {
}
              <p className={`t-body ${estilos.corpo ?? ''}`} data-cy="previa-corpo">
                {guardada.rascunho.body}
              </p>
            </div>
            <p className="t-body-sm c-sec">{alcanceEmPalavras(guardada.janela.would_reach)}</p>
            <p className="t-body-sm c-sec" data-cy="previa-teto">
              {tetoEmPalavras(guardada.janela.remaining_today, guardada.janela.daily_cap)}
            </p>
          </section>
        )}
        {trava !== undefined && (
          <p className="t-body-sm c-sec" id={idDaTrava} data-cy="comunicado-trava" role="status">
            {motivoDaTrava(trava, guardada?.janela)}
          </p>
        )}
        <div className="rodape-form">
          <Link className="btn sec" to={CAMINHO_DA_LISTA}>
            Cancelar
          </Link>
          <button
            type="button"
            className="btn pri"
            data-cy="comunicado-disparar"
            disabled={trava !== undefined}
            {...(trava !== undefined ? { 'aria-describedby': idDaTrava } : {})}
            onClick={() => setConfirmando(true)}
          >
            Disparar comunicado
          </button>
        </div>
      </form>
      {confirmando && guardada && (
        <DialogoDeDisparo
          titulo={guardada.rascunho.title}
          alcance={guardada.janela.would_reach}
          restam={guardada.janela.remaining_today}
          executar={disparar}
          aoFechar={() => setConfirmando(false)}
        />
      )}
      <SairSemSalvar sujo={sujo} liberado={liberado} />
    </>
  );
}

/** A confirmacao do disparo: a consequencia escrita em paragrafos, e nada mais. */
function DialogoDeDisparo({
  titulo,
  alcance,
  restam,
  executar,
  aoFechar,
}: {
  titulo: string;
  alcance: number;
  restam: number;
  executar: () => Promise<Resultado>;
  aoFechar: () => void;
}) {
  const [falha, setFalha] = useState<string>();
  const [carregando, setCarregando] = useState(false);
  const idDoCorpo = useId();

  const corpo = [
    alcanceEmPalavras(alcance),
    'Comunicado disparado não pode ser desfeito, editado nem apagado: ele fica na caixa de quem recebeu e no registro do painel.',
    restam === 1
      ? 'Este é o último comunicado que cabe hoje.'
      : `Depois deste, ainda ${plural(restam - 1, 'cabe', 'cabem')} ${restam - 1} hoje.`,
  ];

  async function confirmar() {
    if (carregando) return;
    setFalha(undefined);
    setCarregando(true);
    try {
      const resultado = await executar();
      if (!resultado.ok) setFalha(resultado.mensagem);
    } catch {
      setFalha('Não conseguimos falar com o servidor. Confira a internet e tente de novo. Nada foi enviado.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Dialogo titulo={`Disparar “${titulo}”?`} aoFechar={carregando ? undefined : aoFechar} descricaoId={idDoCorpo}>
      <div id={idDoCorpo}>
        {corpo.map((frase) => (
          <p key={frase} className="t-body c-sec">
            {frase}
          </p>
        ))}
      </div>
      {falha && <Banner tipo="erro">{falha}</Banner>}
      <div className="acoes">
        <button type="button" className="btn sec" data-foco-inicial onClick={aoFechar}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn pri"
          data-cy="confirmar-disparo"
          aria-busy={carregando || undefined}
          onClick={() => void confirmar()}
        >
          {carregando && <span className="spin" aria-hidden="true" />}
          Disparar agora
        </button>
      </div>
    </Dialogo>
  );
}
