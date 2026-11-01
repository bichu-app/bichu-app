import { useCallback } from 'react';
import { Link } from 'react-router';

import { Banner, EstadoVazio, LinhasCarregando } from '../componentes/basicos.tsx';
import { Icone } from '../componentes/Icone.tsx';
import { useAvisoDaNavegacao, useListaPaginada } from '../componentes/lista.ts';
import { useSessao } from '../sessao/ProvedorDeSessao.tsx';
import estilos from './comunicados.module.css';
import { plural, POR_PAGINA, quandoFoi, type Comunicado } from './dominio.ts';
import { CAMINHO_DO_NOVO } from './rotas.tsx';

const CHAVE = 'comunicados';

/** O REGISTRO PERMANENTE dos comunicados disparados. */
export default function ListaDeComunicados() {
  const { api } = useSessao();
  const [aviso, fecharAviso] = useAvisoDaNavegacao();

  const buscar = useCallback(
    async (pagina: number, sinal: AbortSignal) => {
      const { data } = await api.GET('/admin/broadcasts', {
        params: { query: { page: pagina, limit: POR_PAGINA } },
        signal: sinal,
      });
      return data ? { itens: data.items, total: data.total } : undefined;
    },
    [api],
  );
  const { estado, carregarMais, recarregar } = useListaPaginada<Comunicado>(CHAVE, buscar);

  const cabecalho = (
    <header className="pghead">
      <div>
        <h1 className="t-headline">Comunicados</h1>
        <p className="t-body-sm c-sec">
          {
}
          A mensagem que vai para a caixa de notificações de todo mundo. Há um teto de comunicados por dia, e um comunicado
          disparado não pode ser desfeito, editado nem apagado.
        </p>
      </div>
      <Link className="btn pri" to={CAMINHO_DO_NOVO} data-cy="comunicado-novo">
        <Icone nome="add" tamanho="s20" />
        Novo comunicado
      </Link>
    </header>
  );
  const banner = aviso && (
    <Banner tipo="ok" aoFechar={fecharAviso}>
      {aviso}
    </Banner>
  );

  if (estado.fase === 'pronto' && estado.total === 0) {
    return (
      <>
        {cabecalho}
        {banner}
        <EstadoVazio
          titulo="Nenhum comunicado disparado"
          corpo="Quando um comunicado for disparado, ele fica registrado aqui para sempre: o texto, quem mandou e quantas caixas ele alcançou."
          acao="Novo comunicado"
          destino={CAMINHO_DO_NOVO}
        />
      </>
    );
  }

  let contagem = '';
  if (estado.fase === 'pronto') {
    contagem =
      estado.itens.length < estado.total
        ? `Mostrando ${estado.itens.length} de ${estado.total} ${plural(estado.total, 'comunicado', 'comunicados')}`
        : `${estado.total} ${plural(estado.total, 'comunicado', 'comunicados')}`;
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
          Não conseguimos carregar os comunicados.
        </Banner>
      )}
      {estado.fase === 'pronto' && (
        <p className="t-body-sm c-sec" aria-live="polite">
          {contagem}
        </p>
      )}
      {estado.fase !== 'erro' && (
        <div className="tabwrap">
          <table aria-busy={estado.fase === 'carregando' || undefined}>
            <caption className="sr">Comunicados disparados</caption>
            <thead>
              <tr>
                <th scope="col">Comunicado</th>
                <th scope="col" className={estilos.colQuem}>
                  Quem mandou
                </th>
                <th scope="col" className={estilos.colCaixas}>
                  Caixas alcançadas
                </th>
                <th scope="col" className={estilos.colQuando}>
                  Quando
                </th>
              </tr>
            </thead>
            <tbody>
              {estado.fase === 'carregando' ? (
                <LinhasCarregando
                  linhas={5}
                  colunas={[estilos.colQuem ?? '', estilos.colCaixas ?? '', estilos.colQuando ?? '']}
                />
              ) : (
                estado.itens.map((c) => (
                  <tr key={c.ref} data-cy="comunicado-linha" data-ref={c.ref}>
                    <td>
                      <span className="t-label">{c.title}</span>
                      <br />
                      {
}
                      <span className={`t-caption c-sec ${estilos.trecho ?? ''}`}>{c.body}</span>
                    </td>
                    {
}
                    <td className={`${estilos.colQuem ?? ''} t-body-sm`}>{c.dispatched_by}</td>
                    <td className={`${estilos.colCaixas ?? ''} t-body-sm`}>
                      {c.recipients_total.toLocaleString('pt-BR')}
                    </td>
                    <td className={`${estilos.colQuando ?? ''} t-body-sm`}>{quandoFoi(c.dispatched_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
