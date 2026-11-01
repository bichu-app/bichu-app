import { useCallback, useId, useState } from 'react';

import { Selo } from '../componentes/basicos.tsx';
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
import { useListaPaginada, useParametrosDaLista } from '../componentes/lista.ts';
import { useSessao } from '../sessao/ProvedorDeSessao.tsx';
import {
  ABAS,
  atendimentoDe,
  casaComABusca,
  COLUNAS,
  PADROES,
  previa,
  ROTULO_DA_ABA,
  VAZIO_DA_ABA,
  type Duvida,
  type SituacaoDaDuvida,
} from './fila.ts';

function DialogoDaDuvida({ duvida, aoFechar }: { duvida: Duvida; aoFechar: () => void }) {
  const idDoCorpo = useId();
  return (
    <Dialogo titulo={duvida.subject} aoFechar={aoFechar} papel="dialog" descricaoId={idDoCorpo} largo>
      <div id={idDoCorpo}>
        <p className="t-body c-sec">Chegou em {dataCurta(duvida.created_at)}</p>
        {
}
        <p className="t-body" style={{ whiteSpace: 'pre-wrap' }} data-cy="texto-da-duvida">
          {duvida.body}
        </p>
      </div>
    </Dialogo>
  );
}

function mensagemDaFalha(status: number | undefined): string {
  if (status === 404) return 'Esta dúvida não está mais na fila: alguém marcou antes.';
  if (status === 429) return 'Muitas marcações em pouco tempo. Tente de novo em alguns minutos.';
  return 'Não conseguimos falar com o servidor. Confira a internet e tente de novo.';
}

export default function FilaDeAjuda() {
  const { api } = useSessao();
  const [parametros, mudar] = useParametrosDaLista(PADROES);
  const busca = parametros.busca.trim().toLowerCase();
  const aba = (ABAS as readonly string[]).includes(parametros.estado)
    ? (parametros.estado as SituacaoDaDuvida)
    : 'open';
  const [aberta, setAberta] = useState<Duvida>();
  const [marcando, setMarcando] = useState<string>();
  const [aviso, setAviso] = useState<string>();
  const [falha, setFalha] = useState<string>();

  const buscar = useCallback(
    async (pagina: number, sinal: AbortSignal) => {
      const { data } = await api.GET('/admin/help-requests', {
        params: { query: { status: aba, page: pagina, limit: 50 } },
        signal: sinal,
      });
      return data === undefined ? undefined : { itens: data.items ?? [], total: data.total ?? 0 };
    },
    [api, aba],
  );

  const { estado, carregarMais, recarregar } = useListaPaginada<Duvida>(aba, buscar);

  const itens = estado.itens.filter((d) => casaComABusca(d, busca));

  async function marcarAtendida(duvida: Duvida) {
    setMarcando(duvida.ref);
    setFalha(undefined);
    const { data, response } = await api.POST('/admin/help-requests/{requestRef}/attendance', {
      params: { path: { requestRef: duvida.ref } },
    });
    setMarcando(undefined);
    if (data === undefined) {
      setFalha(mensagemDaFalha(response.status));
      return;
    }
    recarregar();
    setAviso(`“${duvida.subject}” marcada como atendida.`);
    if (aberta?.ref === duvida.ref) setAberta(data);
  }

  return (
    <>
      <CabecalhoDaFila titulo="Ajuda">
        <p className="t-body c-sec">
          As dúvidas que chegam pelo botão <strong>Ajuda</strong> do aplicativo, da mais nova
          para a mais velha. Nada é enviado quando uma dúvida chega: ela espera aqui.
          Marcar como atendida <strong>não apaga nada</strong> — a dúvida muda de aba e
          continua guardada.
        </p>
        {}
        <p className="t-body c-sec" data-cy="aviso-sem-resposta">
          O painel não mostra quem escreveu nem tem como responder: só uma tela deste
          backoffice lê dados de pessoa, e não é esta.
        </p>
      </CabecalhoDaFila>

      <AvisosDaFila aviso={aviso} aoFecharAviso={() => setAviso(undefined)} falha={falha} />

      <ErroDaFila estado={estado} aoTentarDeNovo={recarregar} />

      {
}
      <BarraDeListagem
        rotuloDaBusca="Buscar dúvida"
        placeholder="Assunto ou texto"
        busca={parametros.busca}
        aoBuscar={(valor) => mudar({ busca: valor })}
        chips={ABAS.map((a) => ({ valor: a, rotulo: ROTULO_DA_ABA[a] }))}
        chipAtivo={aba}
        aoEscolherChip={(valor) => mudar({ estado: valor, busca: '' })}
        rotuloDosChips="Situação da dúvida"
        limpar={
          rotuloDeLimpar(parametros.busca !== '', false)
            ? {
                rotulo: rotuloDeLimpar(parametros.busca !== '', false) ?? 'Limpar',
                aoLimpar: () => mudar({ busca: '' }),
              }
            : undefined
        }
      />

      <TabelaDaFila colunas={COLUNAS} estado={estado}>
        {itens.map((duvida) => (
          <tr key={duvida.ref} data-cy="linha-da-duvida">
            <td>
              <span className="t-label-lg">{duvida.subject}</span>
            </td>
            <td>
              <span className="t-body c-sec">{previa(duvida.body)}</span>
            </td>
            <td>
              <span className="t-body c-sec">{dataCurta(duvida.created_at)}</span>
            </td>
            <td>
              {duvida.status === 'attended' ? (
                <>
                  <Selo tipo="ativa" />
                  <span className="t-body c-sec bloco" data-cy="atendimento">
                    {atendimentoDe(duvida)}
                  </span>
                </>
              ) : (
                <span className="t-body c-sec">Na fila</span>
              )}
            </td>
            <td>
              <button
                type="button"
                className="btn ghost"
                data-cy="abrir-duvida"
                onClick={() => setAberta(duvida)}
              >
                Abrir
              </button>
              {duvida.status === 'open' && (
                <button
                  type="button"
                  className="btn sec"
                  data-cy="marcar-atendida"
                  aria-busy={marcando === duvida.ref || undefined}
                  disabled={marcando !== undefined}
                  onClick={() => void marcarAtendida(duvida)}
                >
                  Marcar atendida
                </button>
              )}
            </td>
          </tr>
        ))}
      </TabelaDaFila>

      <RodapeDaFila
        estado={estado}
        visiveis={itens.length}
        corpoVazio={
          busca === '' ? VAZIO_DA_ABA[aba] : 'Nenhuma dúvida desta página casa com a busca.'
        }
        destino="/ajuda"
        aoCarregarMais={carregarMais}
      />

      {aberta && <DialogoDaDuvida duvida={aberta} aoFechar={() => setAberta(undefined)} />}
    </>
  );
}
