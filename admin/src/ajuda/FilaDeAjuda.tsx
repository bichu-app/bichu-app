/**
 * `Ajuda` — a fila das duvidas mandadas pelo botao `Ajuda` do aplicativo.
 *
 * ## POR QUE ESTA TELA EXISTE, e por que ela nao podia esperar
 *
 * `POST /v1/me/help-requests` entrou em 29/10/2026 e grava a duvida numa
 * tabela. Sem esta tela, **nenhum humano alcanca o que foi gravado** -- e
 * funcionalidade que ninguem alcanca equivale a funcionalidade que nao existe.
 *
 * Nao e hipotese nesta casa: o passkey foi entregue com servidor, contrato,
 * entitlement e digital no lugar e **nenhuma porta de interface**. O banco
 * tinha zero credenciais e nenhum portao acusou, porque nenhum portao pergunta
 * se alguem consegue chegar.
 *
 * ## O QUE ESTA TELA NAO MOSTRA, e nao e escolha dela
 *
 * **O autor.** `AdminHelpRequest` nao tem campo de pessoa: nem nome, nem
 * e-mail, nem identificador estavel. Este painel le pessoa num lugar so -- a
 * fila de pedidos de encontro --, e `api/openapi.yaml` afirma isso em TRES
 * pontos, com as decisoes D53 a D57 do cliente (23/09).
 *
 * A consequencia esta na propria tela, no paragrafo do cabecalho, em vez de
 * escondida aqui: quem le a duvida **nao tem por onde responder pelo painel**.
 * Dizer isso ao operador e melhor do que deixa-lo procurar um botao de
 * responder que nao existe.
 *
 * ## O ESTADO, decidido em 30/10/2026
 *
 * Duas abas e um botao por linha. **Atendida e mudanca de estado e nunca
 * `DELETE`**: a linha troca de aba e continua na tabela.
 *
 * **Nao ha desmarcar**, e a ausencia e decisao -- ver `fila.ts`.
 *
 * ## O DETALHE E UM DIALOGO, e nao uma rota
 *
 * E a convencao das tres filas que ja existem (`FilaDeModeracao`,
 * `FilaDePlaquinhas`, `FilaDeIndicacoes`): nenhuma tem `:ref` na URL. O item
 * ja vem inteiro na pagina -- o contrato devolve `body` completo --, entao
 * abrir nao custa viagem nenhuma.
 */
import { useCallback, useId, useState } from 'react';

import { Banner, EstadoVazio, LinhasCarregando, Selo } from '../componentes/basicos.tsx';
import { BarraDeListagem, rotuloDeLimpar } from '../componentes/BarraDeListagem.tsx';
import { Dialogo } from '../componentes/Dialogo.tsx';
import { useListaPaginada, useParametrosDaLista } from '../componentes/lista.ts';
import { useSessao } from '../sessao/ProvedorDeSessao.tsx';
import {
  ABAS,
  atendimentoDe,
  casaComABusca,
  COLUNAS,
  dataCurta,
  PADROES,
  previa,
  ROTULO_DA_ABA,
  VAZIO_DA_ABA,
  type Duvida,
  type SituacaoDaDuvida,
} from './fila.ts';

/** O dialogo com a duvida inteira. So leitura: nao ha acao nenhuma a oferecer. */
function DialogoDaDuvida({ duvida, aoFechar }: { duvida: Duvida; aoFechar: () => void }) {
  const idDoCorpo = useId();
  return (
    <Dialogo titulo={duvida.subject} aoFechar={aoFechar} papel="dialog" descricaoId={idDoCorpo} largo>
      <div id={idDoCorpo}>
        <p className="t-body c-sec">Chegou em {dataCurta(duvida.created_at)}</p>
        {/* `white-space: pre-wrap` e o que preserva os paragrafos que o tutor
            escreveu. Sem ele o texto vira um bloco so e a leitura piora
            exatamente no caso que mais precisa dela: a duvida longa. */}
        <p className="t-body" style={{ whiteSpace: 'pre-wrap' }} data-cy="texto-da-duvida">
          {duvida.body}
        </p>
      </div>
    </Dialogo>
  );
}

/** O que a marcacao devolveu, para a tela dizer a verdade sobre a falha. */
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

  // A chave carrega a ABA e nao a busca: trocar de aba recomeca da pagina 1,
  // que e o certo, e cada tecla da busca NAO -- a busca e local, sobre a
  // pagina ja carregada, e com ela na chave cada tecla jogaria fora o rolado.
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
    // RECARREGAR e nao trocar o item no lugar: a aba e `open` e a duvida
    // deixou de pertencer a ela, entao o que tira a linha da lista e a
    // recarga. Deixa-la ali com o selo trocado mostraria na aba `Na fila`
    // uma duvida que ja saiu dela.
    recarregar();
    setAviso(`“${duvida.subject}” marcada como atendida.`);
    if (aberta?.ref === duvida.ref) setAberta(data);
  }

  return (
    <>
      <header className="cab">
        <h1 className="t-title-lg">Ajuda</h1>
        <p className="t-body c-sec">
          As dúvidas que chegam pelo botão <strong>Ajuda</strong> do aplicativo, da mais nova
          para a mais velha. Nada é enviado quando uma dúvida chega: ela espera aqui.
          Marcar como atendida <strong>não apaga nada</strong> — a dúvida muda de aba e
          continua guardada.
        </p>
        {/* A limitacao, dita ao operador em vez de descoberta por ele. */}
        <p className="t-body c-sec" data-cy="aviso-sem-resposta">
          O painel não mostra quem escreveu nem tem como responder: só uma tela deste
          backoffice lê dados de pessoa, e não é esta.
        </p>
      </header>

      {aviso !== undefined && (
        <Banner tipo="ok" aoFechar={() => setAviso(undefined)}>
          {aviso}
        </Banner>
      )}
      {falha !== undefined && <Banner tipo="erro">{falha}</Banner>}

      {estado.fase === 'erro' && (
        <Banner tipo="erro">
          Não conseguimos carregar a fila.{' '}
          <button type="button" className="btn ghost" onClick={recarregar}>
            Tentar de novo
          </button>
        </Banner>
      )}

      {/* Busca no TOPO DO CORPO da tela, e nunca na barra de navegacao: e o
          padrao de toda pagina com registros neste painel. */}
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

      <table className="tabela">
        <thead>
          <tr>
            {COLUNAS.map((c, i) => (
              <th key={c === '' ? `acoes-${String(i)}` : c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {estado.fase === 'carregando' && <LinhasCarregando linhas={5} colunas={COLUNAS} />}
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
        </tbody>
      </table>

      {estado.fase === 'pronto' && itens.length === 0 && (
        <EstadoVazio
          titulo="Nada por aqui"
          corpo={busca === '' ? VAZIO_DA_ABA[aba] : 'Nenhuma dúvida desta página casa com a busca.'}
          acao="Ver a fila"
          destino="/ajuda"
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

      {aberta && <DialogoDaDuvida duvida={aberta} aoFechar={() => setAberta(undefined)} />}
    </>
  );
}
