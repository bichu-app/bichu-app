/**
 * A FILA DA PLAQUINHA DA COLEIRA no painel: atender, recusar e, agora, ACOMPANHAR
 * A ENTREGA.
 */
import { useCallback, useId, useRef, useState } from 'react';

import { Banner, EstadoVazio, LinhasCarregando, Selo } from '../componentes/basicos.tsx';
import { BarraDeListagem, rotuloDeLimpar } from '../componentes/BarraDeListagem.tsx';
import { Dialogo } from '../componentes/Dialogo.tsx';
import { useListaPaginada, useParametrosDaLista } from '../componentes/lista.ts';
import { useSessao } from '../sessao/ProvedorDeSessao.tsx';
import {
  ABAS,
  AJUDA_DO_RASTREIO,
  LIMITE_DO_RASTREIO,
  PASSO_DA_ACAO,
  ROTULO_DA_ABA,
  ROTULO_DA_ACAO,
  ROTULO_DO_PASSO,
  SELO_DO_PASSO,
  VAZIO_DA_ABA,
  corpoDaEntrega,
  dataCurta,
  enderecoEmLinhas,
  erroDoRastreio,
  petDo,
  podeCorrigirRastreio,
  proximaAcao,
  type DecisaoDoPedido,
  type Pedido,
} from './fila.ts';

/**
 * Os padroes da lista, constante de modulo porque `useParametrosDaLista` o exige
 * estavel.
 */
const PADROES = { status: 'pending', passo: '', busca: '' };

const COLUNAS = ['Pet', 'Entrega', 'Rastreio', 'Pedido em', 'Ações'];

type Resultado = { ok: true; pedido: Pedido } | { ok: false; mensagem: string };

function mensagemDaFalha(status: number | undefined): string {
  if (status === 400) return 'Este pedido não aceita esta mudança agora. Recarregue a fila.';
  if (status === 404) return 'Este pedido não existe mais.';
  if (status === 429) return 'Muitas escritas em pouco tempo. Tente de novo em alguns minutos.';
  return 'Não conseguimos falar com o servidor. Confira a internet e tente de novo.';
}

/**
 * O dialogo da ENTREGA: o passo e o codigo de rastreio, numa confirmacao so -- que
 * e como o cliente pediu, numa frase so.
 */
function DialogoDaEntrega({
  pedido,
  acao,
  aoConfirmar,
  aoFechar,
}: {
  pedido: Pedido;
  acao: 'despachar' | 'confirmar' | 'rastreio';
  aoConfirmar: (corpo: ReturnType<typeof corpoDaEntrega>) => Promise<Resultado>;
  aoFechar: () => void;
}) {
  const [rastreio, setRastreio] = useState(pedido.tracking_code ?? '');
  const [erro, setErro] = useState<string>();
  const [falha, setFalha] = useState<string>();
  const [carregando, setCarregando] = useState(false);
  const idDoCorpo = useId();
  const idDoRastreio = useId();
  const campo = useRef<HTMLInputElement>(null);

  const passo =
    acao === 'rastreio'
      ? (pedido.delivery_state as 'in_transit' | 'arrived')
      : PASSO_DA_ACAO[acao];

  const titulo =
    acao === 'rastreio'
      ? `Código de rastreio de ${pedido.pet.display_name}`
      : `${ROTULO_DA_ACAO[acao]} — ${pedido.pet.display_name}?`;

  async function confirmar() {
    if (carregando) return;
    setFalha(undefined);
    const problema = erroDoRastreio(rastreio);
    if (problema !== undefined) {
      setErro(problema);
      campo.current?.focus();
      return;
    }
    setErro(undefined);
    setCarregando(true);
    try {
      const r = await aoConfirmar(corpoDaEntrega(pedido, passo, rastreio));
      if (r.ok) aoFechar();
      else setFalha(r.mensagem);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Dialogo titulo={titulo} aoFechar={carregando ? undefined : aoFechar} descricaoId={idDoCorpo} largo>
      <div id={idDoCorpo}>
        {acao === 'despachar' && (
          <p className="t-body c-sec">
            Registra que a plaquinha saiu. A pessoa passa a ver <strong>Em transporte</strong> no
            aplicativo, com o código de rastreio se houver um.
          </p>
        )}
        {acao === 'confirmar' && (
          <p className="t-body c-sec">
            Registra que a plaquinha chegou. <strong>Não tem volta por aqui</strong>: depois de
            marcada, a chegada não é desfeita nesta tela.
          </p>
        )}
        {acao === 'rastreio' && (
          <p className="t-body c-sec">
            Corrige o código sem mudar o passo da entrega. Apagar o campo remove o código.
          </p>
        )}
        <p className="t-body c-sec">
          Envio para: {enderecoEmLinhas(pedido).join(' · ')}
        </p>
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
          <label htmlFor={idDoRastreio}>Código de rastreio</label>
          <input
            ref={campo}
            id={idDoRastreio}
            className="input"
            data-cy="rastreio-da-entrega"
            value={rastreio}
            maxLength={LIMITE_DO_RASTREIO}
            onChange={(e) => setRastreio(e.target.value)}
            onBlur={() => setErro(erroDoRastreio(rastreio))}
            readOnly={carregando}
            aria-invalid={erro ? true : undefined}
            aria-describedby={`${idDoRastreio}-ajuda`}
            data-foco-inicial
          />
          <span className={erro ? 'help err' : 'help'} id={`${idDoRastreio}-ajuda`}>
            {erro ?? AJUDA_DO_RASTREIO}
          </span>
        </div>
        <div className="acoes">
          <button type="button" className="btn sec" onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn pri"
            data-cy="confirmar-entrega"
            aria-busy={carregando || undefined}
          >
            {carregando && <span className="spin" aria-hidden="true" />}
            {acao === 'rastreio' ? 'Salvar código' : ROTULO_DA_ACAO[acao]}
          </button>
        </div>
      </form>
    </Dialogo>
  );
}

export default function FilaDePlaquinhas() {
  const { api } = useSessao();
  const [parametros, mudar] = useParametrosDaLista(PADROES);
  const aba = (ABAS.includes(parametros.status as DecisaoDoPedido)
    ? parametros.status
    : 'pending') as DecisaoDoPedido;
  const passoFiltrado = parametros.passo;
  const busca = parametros.busca.trim().toLowerCase();

  const [emEntrega, setEmEntrega] = useState<{
    pedido: Pedido;
    acao: 'despachar' | 'confirmar' | 'rastreio';
  }>();
  const [aviso, setAviso] = useState<string>();
  const [falhaDaLinha, setFalhaDaLinha] = useState<string>();

  const buscar = useCallback(
    async (pagina: number, sinal: AbortSignal) => {
      const { data } = await api.GET('/admin/tag-requests', {
        params: {
          query: {
            status: aba,
            ...(passoFiltrado === '' ? {} : { delivery_state: passoFiltrado as 'requested' }),
            page: pagina,
            limit: 50,
          },
        },
        signal: sinal,
      });
      return data === undefined ? undefined : { itens: data.items ?? [], total: data.total ?? 0 };
    },
    [api, aba, passoFiltrado],
  );

  const { estado, carregarMais, recarregar, substituir } = useListaPaginada<Pedido>(
    `${aba}|${passoFiltrado}`,
    buscar,
  );

  /**
   * A BUSCA E LOCAL, sobre a pagina carregada, e a escolha e declarada: o contrato
   * de `listAdminCollarTagRequests` nao tem `q`, e inventar um aqui faria a tela
   * mandar um parametro que o servidor ignora -- que e pior que nao ter busca,
   * porque parece funcionar.
   */
  const itens = busca === ''
    ? estado.itens
    : estado.itens.filter(
        (p) =>
          p.pet.display_name.toLowerCase().includes(busca) ||
          p.delivery_address.recipient_name.toLowerCase().includes(busca) ||
          (p.tracking_code ?? '').toLowerCase().includes(busca),
      );

  async function atender(pedido: Pedido): Promise<void> {
    setFalhaDaLinha(undefined);
    const { data, response } = await api.POST('/admin/tag-requests/{requestRef}/fulfillment', {
      params: { path: { requestRef: pedido.ref } },
    });
    if (data === undefined) {
      setFalhaDaLinha(mensagemDaFalha(response.status));
      return;
    }
    substituir((p) => p.ref === pedido.ref, data);
    recarregar();
    setAviso(`Pedido de ${pedido.pet.display_name} atendido. Agora registre a entrega.`);
  }

  async function recusar(pedido: Pedido): Promise<void> {
    setFalhaDaLinha(undefined);
    const { data, response } = await api.POST('/admin/tag-requests/{requestRef}/decline', {
      params: { path: { requestRef: pedido.ref } },
    });
    if (data === undefined) {
      setFalhaDaLinha(mensagemDaFalha(response.status));
      return;
    }
    recarregar();
    setAviso(`Pedido de ${pedido.pet.display_name} recusado.`);
  }

  async function salvarEntrega(
    pedido: Pedido,
    corpo: ReturnType<typeof corpoDaEntrega>,
  ): Promise<Resultado> {
    const { data, response } = await api.POST('/admin/tag-requests/{requestRef}/delivery', {
      params: { path: { requestRef: pedido.ref } },
      body: corpo,
    });
    if (data === undefined) return { ok: false, mensagem: mensagemDaFalha(response.status) };
    substituir((p) => p.ref === pedido.ref, data);
    setAviso(
      `Entrega de ${pedido.pet.display_name}: ${ROTULO_DO_PASSO[data.delivery_state ?? 'requested']}.`,
    );
    return { ok: true, pedido: data };
  }

  return (
    <>
      <header className="cab">
        <h1 className="t-title-lg">Plaquinhas da coleira</h1>
        <p className="t-body c-sec">
          Os pedidos do objeto físico. Atender não emite código nenhum: o código da plaquinha já
          existe, e quem o emitiu foi o tutor.
        </p>
      </header>

      {aviso && (
        <Banner tipo="ok" aoFechar={() => setAviso(undefined)}>
          {aviso}
        </Banner>
      )}
      {falhaDaLinha && <Banner tipo="erro">{falhaDaLinha}</Banner>}

      {
}
      <BarraDeListagem
        rotuloDaBusca="Buscar pedido"
        placeholder="Pet, quem recebe ou rastreio"
        busca={parametros.busca}
        aoBuscar={(valor) => mudar({ busca: valor })}
        chips={ABAS.map((a) => ({ valor: a, rotulo: ROTULO_DA_ABA[a] }))}
        chipAtivo={aba}
        aoEscolherChip={(valor) => mudar({ status: valor, passo: '' })}
        rotuloDosChips="Situação do pedido"
        seletores={[
          {
            id: 'passo-da-entrega',
            rotuloAcessivel: 'Passo da entrega',
            prefixoVisivel: 'Entrega',
            valor: passoFiltrado,
            opcoes: [
              { valor: '', rotulo: 'Todos os passos' },
              { valor: 'requested', rotulo: ROTULO_DO_PASSO.requested },
              { valor: 'in_transit', rotulo: ROTULO_DO_PASSO.in_transit },
              { valor: 'arrived', rotulo: ROTULO_DO_PASSO.arrived },
            ],
            aoMudar: (valor) => mudar({ passo: valor }),
          },
        ]}
        limpar={
          rotuloDeLimpar(parametros.busca !== '', passoFiltrado !== '')
            ? {
                rotulo: rotuloDeLimpar(parametros.busca !== '', passoFiltrado !== '') ?? 'Limpar',
                aoLimpar: () => mudar({ busca: '', passo: '' }),
              }
            : undefined
        }
      />

      {estado.fase === 'erro' && (
        <Banner tipo="erro">
          Não conseguimos carregar a fila. <button type="button" className="btn ghost" onClick={recarregar}>Tentar de novo</button>
        </Banner>
      )}

      <table className="tabela">
        <thead>
          <tr>
            {COLUNAS.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {estado.fase === 'carregando' && <LinhasCarregando linhas={5} colunas={COLUNAS} />}
          {itens.map((pedido) => {
            const acao = proximaAcao(pedido);
            return (
              <tr key={pedido.ref} data-cy="linha-do-pedido">
                <td>
                  <span className="t-label-lg">{petDo(pedido)}</span>
                  {
}
                  <span className="t-body c-sec bloco">{enderecoEmLinhas(pedido).join(' · ')}</span>
                  {pedido.notes && <span className="t-body c-sec bloco">“{pedido.notes}”</span>}
                </td>
                <td>
                  {pedido.status === 'declined' ? (
                    <Selo tipo="retirado" />
                  ) : (
                    <>
                      <Selo tipo={SELO_DO_PASSO[pedido.delivery_state ?? 'requested']} />
                      <span className="t-body c-sec bloco">
                        {ROTULO_DO_PASSO[pedido.delivery_state ?? 'requested']}
                        {pedido.shipped_at ? ` · saiu ${dataCurta(pedido.shipped_at)}` : ''}
                        {pedido.delivered_at ? ` · chegou ${dataCurta(pedido.delivered_at)}` : ''}
                      </span>
                    </>
                  )}
                </td>
                <td>
                  <span className="t-body">{pedido.tracking_code ?? '—'}</span>
                  {podeCorrigirRastreio(pedido) && (
                    <button
                      type="button"
                      className="btn ghost"
                      data-cy="corrigir-rastreio"
                      onClick={() => setEmEntrega({ pedido, acao: 'rastreio' })}
                    >
                      {pedido.tracking_code ? 'Corrigir' : 'Informar'}
                    </button>
                  )}
                </td>
                <td>{dataCurta(pedido.requested_at)}</td>
                <td>
                  {acao === 'atender' && (
                    <>
                      <button
                        type="button"
                        className="btn pri"
                        data-cy="atender-pedido"
                        onClick={() => void atender(pedido)}
                      >
                        {ROTULO_DA_ACAO.atender}
                      </button>
                      <button
                        type="button"
                        className="btn sec"
                        data-cy="recusar-pedido"
                        onClick={() => void recusar(pedido)}
                      >
                        Recusar
                      </button>
                    </>
                  )}
                  {(acao === 'despachar' || acao === 'confirmar') && (
                    <button
                      type="button"
                      className="btn pri"
                      data-cy={`entrega-${acao}`}
                      onClick={() => setEmEntrega({ pedido, acao })}
                    >
                      {ROTULO_DA_ACAO[acao]}
                    </button>
                  )}
                  {acao === undefined && <span className="t-body c-sec">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {estado.fase === 'pronto' && itens.length === 0 && (
        <EstadoVazio
          titulo="Nada por aqui"
          corpo={busca === '' ? VAZIO_DA_ABA[aba] : 'Nenhum pedido desta página casa com a busca.'}
          acao="Ver a fila"
          destino="/plaquinhas"
        />
      )}

      {estado.fase === 'pronto' && estado.itens.length < estado.total && (
        <button
          type="button"
          className="btn sec"
          data-cy="carregar-mais"
          aria-busy={estado.carregandoMais || undefined}
          onClick={carregarMais}
        >
          Carregar mais
        </button>
      )}

      {emEntrega && (
        <DialogoDaEntrega
          pedido={emEntrega.pedido}
          acao={emEntrega.acao}
          aoConfirmar={(corpo) => salvarEntrega(emEntrega.pedido, corpo)}
          aoFechar={() => setEmEntrega(undefined)}
        />
      )}
    </>
  );
}
