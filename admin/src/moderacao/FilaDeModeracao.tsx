/** A FILA DE MODERACAO no painel: remover o conteudo ou descartar a denuncia. */
import { useCallback, useId, useRef, useState } from 'react';

import { Banner, Selo } from '../componentes/basicos.tsx';
import { BarraDeListagem, rotuloDeLimpar } from '../componentes/BarraDeListagem.tsx';
import {
  AvisosDaFila,
  CabecalhoDaFila,
  dataCurta,
  ErroDaFila,
  RodapeDaFila,
  TabelaDaFila,
} from '../componentes/casca-de-fila.tsx';
import { Dialogo } from '../componentes/Dialogo.tsx';
import { Icone } from '../componentes/Icone.tsx';
import { useListaPaginada, useParametrosDaLista } from '../componentes/lista.ts';
import { useSessao } from '../sessao/ProvedorDeSessao.tsx';
import {
  ABAS,
  AJUDA_DO_MOTIVO,
  LIMITE_DO_MOTIVO,
  ROTULO_DA_ABA,
  ROTULO_DA_DECISAO,
  ROTULO_DA_ORIGEM,
  SELO_DA_DECISAO,
  VAZIO_DA_ABA,
  conteudoDo,
  eInsistente,
  erroDoMotivo,
  notaDe,
  repeticaoDe,
  rotuloDoMotivo,
  type EstadoDaFila,
  type Item,
  type Origem,
} from './fila.ts';

/**
 * Os padroes da lista, constante de modulo porque `useParametrosDaLista` o exige
 * estavel.
 */
const PADROES = { estado: 'open', origem: '', busca: '' };

const COLUNAS = ['O que foi denunciado', 'Conteúdo', 'Motivo', 'Denúncias', 'Quando', 'Ações'];

type Acao = 'remover' | 'descartar';

const TITULO_DA_ACAO = {
  remover: 'Remover o conteúdo?',
  descartar: 'Descartar a denúncia?',
} as const satisfies Record<Acao, string>;

const BOTAO_DA_ACAO = {
  remover: 'Remover conteúdo',
  descartar: 'Descartar denúncia',
} as const satisfies Record<Acao, string>;

const CORPO_DA_ACAO = {
  remover: [
    'O conteúdo sai do ar para todo mundo. Nada é apagado de verdade: ele continua gravado, com o seu motivo ao lado, para quem auditar.',
    'Ninguém é avisado — nem quem denunciou, nem quem foi denunciado.',
  ],
  descartar: [
    'O conteúdo fica no ar. A denúncia não é apagada: ela fica registrada como descartada, com o seu motivo.',
    'Ninguém é avisado — nem quem denunciou, nem quem foi denunciado.',
  ],
} as const satisfies Record<Acao, readonly string[]>;

type Resultado = { ok: true } | { ok: false; mensagem: string };

function mensagemDaFalha(status: number | undefined): string {
  if (status === 400) return 'Esta denúncia já foi decidida. Recarregue a fila.';
  if (status === 404) return 'Esta denúncia não está mais na fila: alguém decidiu antes.';
  if (status === 429) return 'Muitas escritas em pouco tempo. Tente de novo em alguns minutos.';
  return 'Não conseguimos falar com o servidor. Confira a internet e tente de novo.';
}

/** A confirmacao com MOTIVO OBRIGATORIO, uma para as duas acoes. */
function DialogoDaDecisao({
  item,
  acao,
  aoConfirmar,
  aoFechar,
}: {
  item: Item;
  acao: Acao;
  aoConfirmar: (motivo: string) => Promise<Resultado>;
  aoFechar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string>();
  const [falha, setFalha] = useState<string>();
  const [carregando, setCarregando] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);
  const idDoCorpo = useId();
  const idDoMotivo = useId();

  async function confirmar() {
    if (carregando) return;
    setFalha(undefined);
    const problema = erroDoMotivo(motivo);
    if (problema !== undefined) {
      setErro(problema);
      campo.current?.focus();
      return;
    }
    setErro(undefined);
    setCarregando(true);
    try {
      const resultado = await aoConfirmar(motivo.trim());
      if (resultado.ok) aoFechar();
      else setFalha(resultado.mensagem);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Dialogo
      titulo={TITULO_DA_ACAO[acao]}
      aoFechar={carregando ? undefined : aoFechar}
      descricaoId={idDoCorpo}
      largo
    >
      <div id={idDoCorpo}>
        <p className="t-body">
          <strong>{ROTULO_DA_ORIGEM[item.origin]}</strong> · {item.subject} · {repeticaoDe(item)}
        </p>
        {CORPO_DA_ACAO[acao].map((frase) => (
          <p key={frase} className="t-body c-sec">
            {frase}
          </p>
        ))}
      </div>
      {falha && <Banner tipo="erro">{falha}</Banner>}
      <form
        className="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void confirmar();
        }}
      >
        <div className={erro ? 'field err' : 'field'}>
          <label htmlFor={idDoMotivo}>Motivo da decisão *</label>
          <textarea
            ref={campo}
            id={idDoMotivo}
            className="input"
            rows={3}
            maxLength={LIMITE_DO_MOTIVO}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            readOnly={carregando}
            aria-invalid={erro ? true : undefined}
            aria-describedby={`${idDoMotivo}-ajuda`}
            data-cy="motivo-da-decisao"
            data-foco-inicial
          />
          {erro ? (
            <span className="help err" id={`${idDoMotivo}-ajuda`} aria-live="polite">
              <Icone nome="error" tamanho="s20" />
              {erro}
            </span>
          ) : (
            <span className="help" id={`${idDoMotivo}-ajuda`}>
              {AJUDA_DO_MOTIVO}
            </span>
          )}
        </div>
        <div className="acoes">
          <button type="button" className="btn sec" onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="submit"
            className={acao === 'remover' ? 'btn danger' : 'btn pri'}
            data-cy={`confirmar-${acao}`}
            aria-busy={carregando || undefined}
          >
            {carregando && <span className="spin" aria-hidden="true" />}
            {BOTAO_DA_ACAO[acao]}
          </button>
        </div>
      </form>
    </Dialogo>
  );
}

export default function FilaDeModeracao() {
  const { api } = useSessao();
  const [parametros, mudar] = useParametrosDaLista(PADROES);
  const aba = (ABAS.includes(parametros.estado as EstadoDaFila)
    ? parametros.estado
    : 'open') as EstadoDaFila;
  const origemFiltrada = parametros.origem;
  const busca = parametros.busca.trim().toLowerCase();

  const [emDecisao, setEmDecisao] = useState<{ item: Item; acao: Acao }>();
  const [aviso, setAviso] = useState<string>();
  const [falhaDaLinha, setFalhaDaLinha] = useState<string>();

  const buscar = useCallback(
    async (pagina: number, sinal: AbortSignal) => {
      const { data } = await api.GET('/admin/moderation/reports', {
        params: {
          query: {
            state: aba,
            ...(origemFiltrada === '' ? {} : { origin: origemFiltrada as Origem }),
            page: pagina,
            limit: 50,
          },
        },
        signal: sinal,
      });
      return data === undefined ? undefined : { itens: data.items ?? [], total: data.total ?? 0 };
    },
    [api, aba, origemFiltrada],
  );

  const { estado, carregarMais, recarregar } = useListaPaginada<Item>(
    `${aba}|${origemFiltrada}`,
    buscar,
  );

  /**
   * A BUSCA E LOCAL, sobre a pagina carregada, e a escolha e declarada: o contrato
   * de `listAdminModerationReports` nao tem `q`, e inventar um aqui faria a tela
   * mandar um parametro que o servidor ignora -- que e pior que nao ter busca,
   * porque parece funcionar.
   */
  const itens =
    busca === ''
      ? estado.itens
      : estado.itens.filter(
          (i) =>
            i.subject.toLowerCase().includes(busca) ||
            (i.detail ?? '').toLowerCase().includes(busca) ||
            (i.content ?? '').toLowerCase().includes(busca),
        );

  async function decidir(item: Item, acao: Acao, motivo: string): Promise<Resultado> {
    setFalhaDaLinha(undefined);
    const caminho =
      acao === 'remover'
        ? ('/admin/moderation/reports/{origin}/{targetRef}/removal' as const)
        : ('/admin/moderation/reports/{origin}/{targetRef}/dismissal' as const);
    const { data, response } = await api.POST(caminho, {
      params: { path: { origin: item.origin, targetRef: item.target_ref } },
      body: { reason: motivo },
    });
    if (data === undefined) return { ok: false, mensagem: mensagemDaFalha(response.status) };
    recarregar();
    setAviso(
      acao === 'remover'
        ? `Conteúdo de ${item.subject} removido do ar, com o motivo registrado.`
        : `Denúncia sobre ${item.subject} descartada, com o motivo registrado.`,
    );
    return { ok: true };
  }

  return (
    <>
      <CabecalhoDaFila titulo="Moderação">
        <p className="t-body c-sec">
          O que a comunidade denunciou. Remover esconde o conteúdo e não apaga nada; descartar
          deixa o conteúdo no ar. As duas pedem motivo, e ninguém é avisado.
        </p>
      </CabecalhoDaFila>

      <AvisosDaFila
        aviso={aviso}
        aoFecharAviso={() => setAviso(undefined)}
        falha={falhaDaLinha}
      />

      {
}
      <BarraDeListagem
        rotuloDaBusca="Buscar denúncia"
        placeholder="Local, pet ou relato"
        busca={parametros.busca}
        aoBuscar={(valor) => mudar({ busca: valor })}
        chips={ABAS.map((a) => ({ valor: a, rotulo: ROTULO_DA_ABA[a] }))}
        chipAtivo={aba}
        aoEscolherChip={(valor) => mudar({ estado: valor, origem: '' })}
        rotuloDosChips="Situação da denúncia"
        seletores={[
          {
            id: 'origem-da-denuncia',
            rotuloAcessivel: 'Origem da denúncia',
            prefixoVisivel: 'Origem',
            valor: origemFiltrada,
            opcoes: [
              { valor: '', rotulo: 'Todas as origens' },
              ...Object.entries(ROTULO_DA_ORIGEM).map(([valor, rotulo]) => ({ valor, rotulo })),
            ],
            aoMudar: (valor) => mudar({ origem: valor }),
          },
        ]}
        limpar={
          rotuloDeLimpar(parametros.busca !== '', origemFiltrada !== '')
            ? {
                rotulo: rotuloDeLimpar(parametros.busca !== '', origemFiltrada !== '') ?? 'Limpar',
                aoLimpar: () => mudar({ busca: '', origem: '' }),
              }
            : undefined
        }
      />

      <ErroDaFila estado={estado} aoTentarDeNovo={recarregar} />

      <TabelaDaFila colunas={COLUNAS} estado={estado}>
        {itens.map((item) => {
          const conteudo = conteudoDo(item);
          return (
            <tr key={`${item.origin}|${item.target_ref}`} data-cy="linha-da-denuncia">
              <td>
                <span className="t-label-lg">{ROTULO_DA_ORIGEM[item.origin]}</span>
                <span className="t-body c-sec bloco">{item.subject}</span>
                {item.rating !== null && item.rating !== undefined && (
                  <span className="t-body c-sec bloco">Nota {notaDe(item)}</span>
                )}
              </td>
              <td>
                <span className={conteudo.ausente ? 't-body c-sec' : 't-body'}>
                  {conteudo.ausente ? conteudo.texto : `“${conteudo.texto}”`}
                </span>
                {item.detail && (
                  <span className="t-body c-sec bloco" data-cy="relato-do-denunciante">
                    Relato: “{item.detail}”
                  </span>
                )}
              </td>
              <td>
                <span className="t-body">{rotuloDoMotivo(item.reason)}</span>
                {item.reasons.length > 1 && (
                  <span className="t-body c-sec bloco">
                    {item.reasons.map(rotuloDoMotivo).join(' · ')}
                  </span>
                )}
              </td>
              <td data-cy="repeticao">
                {
}
                <span className={eInsistente(item) ? 't-label-lg' : 't-body'}>
                  {repeticaoDe(item)}
                </span>
                {eInsistente(item) && (
                  <span className="t-body c-sec bloco">Muitos denunciantes diferentes.</span>
                )}
              </td>
              <td>
                <span className="t-body">{dataCurta(item.first_reported_at)}</span>
                {item.last_reported_at !== item.first_reported_at && (
                  <span className="t-body c-sec bloco">
                    última {dataCurta(item.last_reported_at)}
                  </span>
                )}
              </td>
              <td>
                {item.resolution ? (
                  <>
                    <Selo tipo={SELO_DA_DECISAO[item.resolution]} />
                    <span className="t-body c-sec bloco">
                      {ROTULO_DA_DECISAO[item.resolution]} · {dataCurta(item.resolved_at)}
                    </span>
                    {item.resolution_reason && (
                      <span className="t-body c-sec bloco">“{item.resolution_reason}”</span>
                    )}
                  </>
                ) : (
                  <>
                    {!item.content_removed && (
                      <button
                        type="button"
                        className="btn danger"
                        data-cy="remover-conteudo"
                        onClick={() => setEmDecisao({ item, acao: 'remover' })}
                      >
                        {BOTAO_DA_ACAO.remover}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn sec"
                      data-cy="descartar-denuncia"
                      onClick={() => setEmDecisao({ item, acao: 'descartar' })}
                    >
                      {BOTAO_DA_ACAO.descartar}
                    </button>
                    {item.content_removed && (
                      <span className="t-body c-sec bloco">
                        O conteúdo já está fora do ar. Resta decidir a denúncia.
                      </span>
                    )}
                  </>
                )}
              </td>
            </tr>
          );
        })}
      </TabelaDaFila>

      <RodapeDaFila
        estado={estado}
        visiveis={itens.length}
        corpoVazio={
          busca === '' ? VAZIO_DA_ABA[aba] : 'Nenhuma denúncia desta página casa com a busca.'
        }
        destino="/moderacao"
        aoCarregarMais={carregarMais}
      />

      {emDecisao && (
        <DialogoDaDecisao
          item={emDecisao.item}
          acao={emDecisao.acao}
          aoConfirmar={(motivo) => decidir(emDecisao.item, emDecisao.acao, motivo)}
          aoFechar={() => setEmDecisao(undefined)}
        />
      )}
    </>
  );
}
