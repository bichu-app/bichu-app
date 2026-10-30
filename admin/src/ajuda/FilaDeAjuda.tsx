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
 * **A situacao.** Nao ha abas nem selo de resolvida: o cliente decidiu que a
 * duvida vai para o backoffice, e nao decidiu o que a encerra. Ver o cabecalho
 * de `fila.ts`.
 *
 * ## O DETALHE E UM DIALOGO, e nao uma rota
 *
 * E a convencao das tres filas que ja existem (`FilaDeModeracao`,
 * `FilaDePlaquinhas`, `FilaDeIndicacoes`): nenhuma tem `:ref` na URL. O item
 * ja vem inteiro na pagina -- o contrato devolve `body` completo --, entao
 * abrir nao custa viagem nenhuma.
 */
import { useCallback, useId, useState } from 'react';

import { Banner, EstadoVazio, LinhasCarregando } from '../componentes/basicos.tsx';
import { BarraDeListagem, rotuloDeLimpar } from '../componentes/BarraDeListagem.tsx';
import { Dialogo } from '../componentes/Dialogo.tsx';
import { useListaPaginada, useParametrosDaLista } from '../componentes/lista.ts';
import { useSessao } from '../sessao/ProvedorDeSessao.tsx';
import { casaComABusca, COLUNAS, dataCurta, PADROES, previa, type Duvida } from './fila.ts';

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

export default function FilaDeAjuda() {
  const { api } = useSessao();
  const [parametros, mudar] = useParametrosDaLista(PADROES);
  const busca = parametros.busca.trim().toLowerCase();
  const [aberta, setAberta] = useState<Duvida>();

  const buscar = useCallback(
    async (pagina: number, sinal: AbortSignal) => {
      const { data } = await api.GET('/admin/help-requests', {
        params: { query: { page: pagina, limit: 50 } },
        signal: sinal,
      });
      return data === undefined ? undefined : { itens: data.items ?? [], total: data.total ?? 0 };
    },
    [api],
  );

  // A chave e constante porque nao ha filtro de servidor nesta fila: a busca e
  // local, sobre a pagina ja carregada. Com a busca na chave, cada tecla
  // recomecaria a lista da pagina 1 e jogaria fora o que ja foi rolado.
  const { estado, carregarMais, recarregar } = useListaPaginada<Duvida>('ajuda', buscar);

  const itens = estado.itens.filter((d) => casaComABusca(d, busca));

  return (
    <>
      <header className="cab">
        <h1 className="t-title-lg">Ajuda</h1>
        <p className="t-body c-sec">
          As dúvidas que chegam pelo botão <strong>Ajuda</strong> do aplicativo, da mais nova
          para a mais velha. Nada é enviado quando uma dúvida chega: ela espera aqui.
        </p>
        {/* A limitacao, dita ao operador em vez de descoberta por ele. */}
        <p className="t-body c-sec" data-cy="aviso-sem-resposta">
          O painel não mostra quem escreveu nem tem como responder: só uma tela deste
          backoffice lê dados de pessoa, e não é esta.
        </p>
      </header>

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
                <button
                  type="button"
                  className="btn ghost"
                  data-cy="abrir-duvida"
                  onClick={() => setAberta(duvida)}
                >
                  Abrir
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {estado.fase === 'pronto' && itens.length === 0 && (
        <EstadoVazio
          titulo="Nada por aqui"
          corpo={
            busca === ''
              ? 'Ninguém mandou dúvida ainda.'
              : 'Nenhuma dúvida desta página casa com a busca.'
          }
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
