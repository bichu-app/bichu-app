import { useCallback } from 'react';
import { Link } from 'react-router';

import { BarraDeListagem, rotuloDeLimpar } from '../componentes/BarraDeListagem.tsx';
import { Banner, EstadoVazio, LinhasCarregando, Selo } from '../componentes/basicos.tsx';
import { Icone } from '../componentes/Icone.tsx';
import { useAvisoDaNavegacao, useListaPaginada, useParametrosDaLista } from '../componentes/lista.ts';
import { telefoneDoE164 } from '../formato/telefone.ts';
import { useSessao } from '../sessao/ProvedorDeSessao.tsx';
import {
  ATIVIDADES,
  ORDEM_DAS_ATIVIDADES,
  SELO_DA_SITUACAO,
  SITUACOES,
  type Entrada,
  type StatusDaEntrada,
  type TipoDaEntrada,
} from './dominio.ts';

const POR_PAGINA = 50;

/**
 * Busca, filtro e ordenacao **no topo do corpo da tela**, e nunca na barra do
 * app: e o padrao de listagem do projeto, e e o mesmo da `Loja` e da `Rede`.
 *
 * `padroes` e constante de modulo porque `useParametrosDaLista` o exige estavel:
 * um objeto novo a cada render recriaria o `useCallback` do filtro e a lista
 * recomecaria da pagina 1 sozinha.
 */
const PADROES = { q: '', atividade: 'todas', situacao: 'todas', ordem: 'name' };

const CHIPS = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'published', rotulo: SITUACOES.published },
  { valor: 'draft', rotulo: SITUACOES.draft },
  { valor: 'hidden', rotulo: SITUACOES.hidden },
  { valor: 'removed', rotulo: SITUACOES.removed },
];

const ATIVIDADE_TODAS = [
  { valor: 'todas', rotulo: 'Todas as atividades' },
  ...ORDEM_DAS_ATIVIDADES.map((tipo) => ({ valor: tipo, rotulo: ATIVIDADES[tipo] })),
];

const ORDENS = [
  { valor: 'name', rotulo: 'Nome' },
  { valor: 'updated', rotulo: 'Última alteração' },
];

function plural(n: number) {
  return n === 1 ? 'entrada' : 'entradas';
}

/** Cidade e UF numa celula. Uma entrada em rascunho pode nao ter nenhuma das duas. */
function lugarDa(entrada: Entrada): string {
  const partes = [entrada.city, entrada.state].filter((p): p is string => typeof p === 'string' && p !== '');
  return partes.length === 0 ? '—' : partes.join(' · ');
}

/**
 * O diretorio de `Perto` no painel: a lista que faltava.
 *
 * **Ela mostra rascunho, retirada e removida junto com a publicada**, e e essa a
 * diferenca da listagem do aplicativo. Quem administra precisa achar o que
 * ainda nao esta no ar -- uma lista que so mostrasse publicados esconderia
 * exatamente o trabalho em andamento.
 *
 * **Nao ha ordem por distancia.** Distancia depende da localizacao de
 * referencia de quem chama, e o painel e operado de uma mesa que nao tem relacao
 * nenhuma com onde a entrada atende.
 */
export default function ListaDeEntradas() {
  const { api } = useSessao();
  const [p, mudar] = useParametrosDaLista(PADROES);
  const [aviso, fecharAviso] = useAvisoDaNavegacao();
  // O servidor exige 3 caracteres em `q` (o piso do indice trigrama: um padrao
  // menor nao produz trigrama nenhum e a busca vira varredura da tabela). Abaixo
  // disso a tela nao manda o parametro, em vez de mandar e levar 400.
  const q = p.q.trim().length >= 3 ? p.q.trim() : '';
  const chave = JSON.stringify([q, p.atividade, p.situacao, p.ordem]);

  const buscar = useCallback(
    async (pagina: number, sinal: AbortSignal) => {
      const { data } = await api.GET('/admin/directory/entries', {
        params: {
          query: {
            ...(q ? { q } : {}),
            ...(p.atividade === 'todas' ? {} : { kind: p.atividade as TipoDaEntrada }),
            ...(p.situacao === 'todas' ? {} : { status: p.situacao as StatusDaEntrada }),
            sort: p.ordem as 'name' | 'updated',
            page: pagina,
            limit: POR_PAGINA,
          },
        },
        signal: sinal,
      });
      return data ? { itens: data.items, total: data.total } : undefined;
    },
    [api, q, p.atividade, p.situacao, p.ordem],
  );
  const { estado, carregarMais, recarregar } = useListaPaginada<Entrada>(chave, buscar);

  const temBusca = p.q.trim() !== '';
  const temFiltro = p.atividade !== 'todas' || p.situacao !== 'todas';
  const limpar = rotuloDeLimpar(temBusca, temFiltro);
  const limparTudo = () => mudar({ q: '', atividade: 'todas', situacao: 'todas' });

  const cabecalho = (
    <header className="pghead">
      <div>
        <h1 className="t-headline">Perto</h1>
        <p className="t-body-sm c-sec">
          Estabelecimentos, clínicas e profissionais que aparecem na seção Perto do aplicativo.
        </p>
      </div>
      <Link className="btn pri" to="/perto/novo" data-cy="entrada-nova">
        <Icone nome="add" tamanho="s20" />
        Nova entrada
      </Link>
    </header>
  );
  const banner = aviso && (
    <Banner tipo="ok" aoFechar={fecharAviso}>
      {aviso}
    </Banner>
  );

  if (estado.fase === 'pronto' && estado.total === 0 && !q && !temFiltro) {
    return (
      <>
        {cabecalho}
        {banner}
        <EstadoVazio
          titulo="Nenhuma entrada cadastrada"
          corpo="Cadastre a primeira clínica, estabelecimento ou profissional. Enquanto não houver nenhuma no ar, a seção Perto do aplicativo fica vazia."
          acao="Nova entrada"
          destino="/perto/novo"
        />
      </>
    );
  }

  const nomeDaAtividade =
    p.atividade === 'todas' ? undefined : ATIVIDADES[p.atividade as TipoDaEntrada];
  const nomeDaSituacao = p.situacao === 'todas' ? undefined : SITUACOES[p.situacao as StatusDaEntrada];

  let contagem = '';
  if (estado.fase === 'pronto') {
    if (estado.itens.length < estado.total) {
      contagem = `Mostrando ${estado.itens.length} de ${estado.total} ${plural(estado.total)}`;
    } else {
      contagem = `${estado.total} ${plural(estado.total)}`;
      if (q) contagem += ` com “${q}”`;
      if (nomeDaAtividade) contagem += ` em ${nomeDaAtividade}`;
      if (nomeDaSituacao) contagem += ` em ${nomeDaSituacao}`;
    }
  }

  return (
    <>
      {cabecalho}
      {banner}
      {estado.fase === 'erro' && (
        <Banner
          tipo="erro"
          acao={
            <button type="button" className="btn ghost sm" onClick={recarregar}>
              Atualizar
            </button>
          }
        >
          Não conseguimos carregar as entradas do diretório.
        </Banner>
      )}
      <BarraDeListagem
        rotuloDaBusca="Buscar entradas"
        placeholder="Buscar pelo nome (a partir de 3 letras)"
        busca={p.q}
        aoBuscar={(v) => mudar({ q: v })}
        seletores={[
          {
            id: 'filtro-atividade',
            rotuloAcessivel: 'Filtrar por atividade',
            valor: p.atividade,
            opcoes: ATIVIDADE_TODAS,
            aoMudar: (v) => mudar({ atividade: v }),
          },
          {
            id: 'ordem',
            rotuloAcessivel: 'Ordenar',
            valor: p.ordem,
            opcoes: ORDENS,
            aoMudar: (v) => mudar({ ordem: v }),
            prefixoVisivel: 'Ordenar:',
          },
        ]}
        chips={CHIPS}
        chipAtivo={p.situacao}
        aoEscolherChip={(v) => mudar({ situacao: v })}
        rotuloDosChips="Filtrar por situação"
        limpar={limpar ? { rotulo: limpar, aoLimpar: limparTudo } : undefined}
      />
      {estado.fase === 'pronto' && (
        <p className="t-body-sm c-sec" aria-live="polite">
          {contagem}
        </p>
      )}
      {estado.fase === 'pronto' && estado.total === 0 ? (
        <div className="semres">
          <p className="t-title">Nenhuma entrada com esse recorte.</p>
          {limpar && (
            <button type="button" className="btn sec" onClick={limparTudo}>
              {limpar}
            </button>
          )}
        </div>
      ) : (
        estado.fase !== 'erro' && (
          <div className="tabwrap">
            <table aria-busy={estado.fase === 'carregando' || undefined}>
              <caption className="sr">Entradas do diretório de Perto</caption>
              <thead>
                <tr>
                  <th scope="col">Entrada</th>
                  <th scope="col" className="w-preco">
                    Onde atende
                  </th>
                  <th scope="col" className="w-upd">
                    Telefone
                  </th>
                  <th scope="col" className="w-status">
                    Situação
                  </th>
                  <th scope="col" className="w-acts">
                    <span className="sr">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {estado.fase === 'carregando' ? (
                  <LinhasCarregando linhas={5} colunas={['w-preco', 'w-upd', 'w-status', 'w-acts']} />
                ) : (
                  estado.itens.map((entrada) => (
                    <tr key={entrada.slug} data-cy="entrada-linha" data-slug={entrada.slug}>
                      <td>
                        <Link className="t-label" to={`/perto/${entrada.slug}`}>
                          {entrada.display_name}
                        </Link>
                        <br />
                        <span className="t-caption c-sec">{ATIVIDADES[entrada.kind]}</span>
                      </td>
                      <td className="w-preco t-body-sm">{lugarDa(entrada)}</td>
                      {/* O E.164 gravado, de volta na gramatica de quem le. */}
                      <td className="w-upd t-body-sm">{telefoneDoE164(entrada.phone_e164) || '—'}</td>
                      <td className="w-status">
                        <Selo tipo={SELO_DA_SITUACAO[entrada.status]} />
                      </td>
                      <td className="w-acts">
                        <Link
                          className="ibtn"
                          to={`/perto/${entrada.slug}`}
                          aria-label={`Editar ${entrada.display_name}`}
                          title="Editar"
                        >
                          <Icone nome="edit" />
                        </Link>
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
    </>
  );
}
