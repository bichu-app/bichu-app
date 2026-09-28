/**
 * 4 · Rede: lista (25.3 quadros 4.1 a 4.8, 25.5.2, UX 29.5 e 29.10). Busca,
 * filtro e ordenacao no topo do corpo, na URL; contagem, "Carregar mais",
 * menu da linha com Editar, Ver pedidos, Cancelar encontro e Remover.
 */
import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { BarraDeListagem } from '../../componentes/BarraDeListagem.tsx';
import { Banner, EstadoVazio, LinhasCarregando } from '../../componentes/basicos.tsx';
import { DialogoComSenha, type ResultadoDaAcaoComSenha } from '../../componentes/DialogoComSenha.tsx';
import { Icone } from '../../componentes/Icone.tsx';
import { useAvisoDaNavegacao, useListaPaginada, useParametrosDaLista } from '../../componentes/lista.ts';
import { MenuDeAcoes, type ItemDoMenu } from '../../componentes/MenuDeAcoes.tsx';
import { mensagemDaFalha } from '../api/mensagens.ts';
import { DialogoComMotivoESenha, type ResultadoDaAcao } from '../componentes/DialogoComMotivoESenha.tsx';
import { SeloDoEncontro } from '../componentes/SeloDoEncontro.tsx';
import { dataCurta, faixaDeHorario } from '../dominio/horario.ts';
import { acoesDoEncontro, consultaDaLista, ehFiltro, ehOrdem, FILTROS, textoDaContagem, textoSemResultado, type Filtro } from '../dominio/lista.ts';
import { ORDENS } from '../dominio/rotulos.ts';
import type { Encontro, OrdemDaLista } from '../dominio/tipos.ts';
import { valorComoOAppMostra } from '../dominio/valor.ts';
import estilos from '../rede.module.css';
import { etagDe, useRede } from '../usarRede.ts';

const POR_PAGINA = 20;
const PADROES = { q: '', filtro: 'todos', ordem: 'agenda' };

function textoDoAcesso(e: Encontro): string {
  const preco = e.admission.price;
  return e.admission.kind === 'paid' && preco ? valorComoOAppMostra(preco.amount, preco.unit) : 'Gratuito';
}

export default function ListaDeEncontros() {
  const { rede } = useRede();
  const navigate = useNavigate();
  const [p, mudar] = useParametrosDaLista(PADROES);
  const [aviso, fecharAviso] = useAvisoDaNavegacao();
  const [avisoLocal, setAvisoLocal] = useState<{ tipo: 'ok' | 'erro'; texto: string }>();
  const [cancelar, setCancelar] = useState<Encontro>();
  const [remover, setRemover] = useState<Encontro>();

  const filtro: Filtro = ehFiltro(p.filtro) ? p.filtro : 'todos';
  const ordem: OrdemDaLista = ehOrdem(p.ordem) ? p.ordem : 'agenda';
  const q = p.q.trim().length >= 2 ? p.q.trim() : '';
  const chave = JSON.stringify([q, filtro, ordem]);

  const buscar = useCallback(
    async (pagina: number) => {
      const r = await rede.listar(consultaDaLista(filtro, q, ordem, pagina, POR_PAGINA));
      return r.ok ? { itens: r.dados.items, total: r.dados.total } : undefined;
    },
    // `chave` resume os filtros; `rede` e estavel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rede, chave],
  );
  const { estado, carregarMais, recarregar, substituir } = useListaPaginada<Encontro>(chave, buscar);

  const temFiltro = filtro !== 'todos';
  const temBusca = p.q.trim() !== '';
  const semNada = estado.fase === 'pronto' && estado.total === 0 && !temFiltro && !q;

  function mostrar(tipo: 'ok' | 'erro', texto: string) {
    fecharAviso();
    setAvisoLocal({ tipo, texto });
  }

  async function executarCancelamento(e: Encontro, token: string | undefined, motivo: string): Promise<ResultadoDaAcao> {
    if (!token) return { ok: false, mensagem: 'Confirme sua senha de novo.' };
    const r = await rede.cancelar(token, e.slug, etagDe(e), motivo);
    if (r.ok) {
      substituir((x) => x.slug === e.slug, r.dados);
      mostrar('ok', 'Encontro cancelado. O app mostra o aviso de cancelado até o horário previsto de fim.');
      return { ok: true };
    }
    if (r.falha.tipo === 'versao') recarregar();
    return { ok: false, mensagem: mensagemDaFalha(r.falha, 'cancelar o encontro') };
  }

  async function executarRemocao(e: Encontro, token: string): Promise<ResultadoDaAcaoComSenha> {
    const r = await rede.remover(token, e.slug, etagDe(e));
    if (r.ok) {
      recarregar();
      mostrar('ok', 'Encontro removido. Ele saiu da Rede do app.');
      return { ok: true };
    }
    if (r.falha.tipo === 'versao') recarregar();
    return { ok: false, mensagem: mensagemDaFalha(r.falha, 'remover o encontro') };
  }

  function itensDoMenu(e: Encontro): ItemDoMenu[] {
    const a = acoesDoEncontro(e);
    const itens: ItemDoMenu[] = [];
    if (a.editar) itens.push({ rotulo: 'Editar', icone: 'edit', aoEscolher: () => void navigate(`/rede/${e.slug}`) });
    if (a.pedidos) itens.push({ rotulo: 'Ver pedidos para participar', icone: 'groups', aoEscolher: () => void navigate(`/rede/${e.slug}/pedidos`) });
    if (a.cancelar) itens.push({ rotulo: 'Cancelar encontro', icone: 'close', perigo: true, aoEscolher: () => setCancelar(e) });
    if (a.remover) itens.push({ rotulo: 'Remover', icone: 'delete', perigo: true, aoEscolher: () => setRemover(e) });
    return itens;
  }

  const cabecalho = (
    <header className="pghead">
      <div>
        <h1 className="t-headline">Rede</h1>
        <p className="t-body-sm c-sec">Encontros presenciais de cães em praças e parques.</p>
      </div>
      <Link className="btn pri" to="/rede/novo">
        <Icone nome="add" tamanho="s20" />
        Novo encontro
      </Link>
    </header>
  );

  const avisoVisivel = avisoLocal ?? (aviso ? { tipo: 'ok' as const, texto: aviso } : undefined);
  const bannerDeAviso = avisoVisivel && (
    <Banner
      tipo={avisoVisivel.tipo}
      aoFechar={() => {
        setAvisoLocal(undefined);
        fecharAviso();
      }}
    >
      {avisoVisivel.texto}
    </Banner>
  );

  const dialogos = (
    <>
      {cancelar && (
        <DialogoComMotivoESenha
          titulo={`Cancelar “${cancelar.title}”?`}
          corpo={[
            'O encontro continua no app, marcado como cancelado, até o horário previsto de fim. Não dá para desfazer: se ele for acontecer em outra data, crie um encontro novo. Todos os administradores recebem aviso.',
          ]}
          rotuloDoMotivo="Motivo"
          ajudaDoMotivo="Só a equipe vê. Não aparece no app."
          rotuloDaAcao="Cancelar encontro"
          rotuloDeVoltar="Voltar"
          perigo
          escopos={['network_event_cancellation']}
          executar={(tokens, motivo) => executarCancelamento(cancelar, tokens.network_event_cancellation, motivo)}
          aoFechar={() => setCancelar(undefined)}
        />
      )}
      {remover && (
        <DialogoComSenha
          titulo={`Remover “${remover.title}”?`}
          corpo="O encontro some do app e desta lista, e não dá para desfazer. Para avisar que ele não vai acontecer, use Cancelar encontro."
          rotuloDaAcao="Remover"
          escopo="network_event_removal"
          executar={(token) => executarRemocao(remover, token)}
          aoFechar={() => setRemover(undefined)}
        />
      )}
    </>
  );

  if (semNada) {
    return (
      <>
        {cabecalho}
        {bannerDeAviso}
        <EstadoVazio
          titulo="A Rede ainda não tem encontros"
          corpo="Cadastre o primeiro. Ele aparece no app quando for publicado."
          acao="Novo encontro"
          destino="/rede/novo"
        />
      </>
    );
  }

  const semResultado = textoSemResultado(filtro, p.q);
  const limpar = temBusca && temFiltro ? 'Limpar busca e filtro' : temBusca ? 'Limpar busca' : temFiltro ? 'Limpar filtro' : undefined;
  const limparTudo = () => mudar({ q: '', filtro: 'todos' });

  return (
    <>
      {cabecalho}
      {bannerDeAviso}
      {estado.fase === 'erro' && (
        <Banner
          tipo="erro"
          acao={
            <button type="button" className="btn ghost sm" onClick={recarregar}>
              Atualizar
            </button>
          }
        >
          Não conseguimos carregar os encontros.
        </Banner>
      )}
      <BarraDeListagem
        rotuloDaBusca="Buscar encontros"
        placeholder="Buscar pelo título do encontro"
        busca={p.q}
        aoBuscar={(v) => mudar({ q: v })}
        seletores={[
          {
            id: 'ordem',
            rotuloAcessivel: 'Ordenar',
            prefixoVisivel: 'Ordenar:',
            valor: ordem,
            opcoes: Object.entries(ORDENS).map(([valor, rotulo]) => ({ valor, rotulo })),
            aoMudar: (v) => mudar({ ordem: v }),
          },
        ]}
        chips={Object.entries(FILTROS).map(([valor, rotulo]) => ({ valor, rotulo }))}
        chipAtivo={filtro}
        aoEscolherChip={(v) => mudar({ filtro: v })}
        rotuloDosChips="Filtrar por status"
        limpar={limpar ? { rotulo: limpar, aoLimpar: limparTudo } : undefined}
      />
      {estado.fase === 'carregando' && (
        <p className="t-body-sm c-sec" role="status">
          Carregando encontros…
        </p>
      )}
      {estado.fase === 'pronto' && estado.total > 0 && (
        <p className="t-body-sm c-sec" aria-live="polite">
          {textoDaContagem(estado.itens.length, estado.total, filtro, q)}
        </p>
      )}
      {estado.fase === 'pronto' && estado.total === 0 ? (
        <div className="semres">
          <p className="t-title">{semResultado.frase}</p>
          <button type="button" className="btn sec" onClick={limparTudo}>
            {semResultado.limpar}
          </button>
        </div>
      ) : (
        estado.fase !== 'erro' && (
          <div className="tabwrap">
            <table aria-busy={estado.fase === 'carregando' || undefined}>
              <caption className="sr">Encontros da Rede</caption>
              <thead>
                <tr>
                  <th scope="col">Encontro, local e acesso</th>
                  <th scope="col" className={estilos.colData}>
                    Data
                  </th>
                  <th scope="col" className={estilos.colStatus}>
                    Status
                  </th>
                  <th scope="col" className="w-upd col-upd">
                    Atualizado
                  </th>
                  <th scope="col" className="w-acts">
                    <span className="sr">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {estado.fase === 'carregando' ? (
                  <LinhasCarregando linhas={6} colunas={[estilos.colData ?? '', estilos.colStatus ?? '', 'w-upd col-upd', 'w-acts']} />
                ) : (
                  estado.itens.map((e) => <LinhaDoEncontro key={e.slug} encontro={e} itens={itensDoMenu(e)} />)
                )}
              </tbody>
            </table>
          </div>
        )
      )}
      {estado.fase === 'pronto' && estado.itens.length < estado.total && (
        <button type="button" className={`btn sec ${estilos.carregarMais ?? ''}`} onClick={carregarMais} aria-busy={estado.carregandoMais || undefined}>
          {estado.carregandoMais && <span className="spin" aria-hidden="true" />}
          Carregar mais
        </button>
      )}
      {dialogos}
    </>
  );
}

function LinhaDoEncontro({ encontro: e, itens }: { encontro: Encontro; itens: ItemDoMenu[] }) {
  const removido = e.publication_status === 'removed';
  const fuso = e.time_zone;
  return (
    <tr className={removido ? estilos.removido : undefined}>
      <td>
        <div className="prod">
          <span className="tx">
            {removido ? (
              <span className="nome t-label" title={e.title}>
                {e.title}
              </span>
            ) : (
              <Link className="nome" to={`/rede/${e.slug}`} title={e.title}>
                {e.title}
              </Link>
            )}
            <span className="sub t-body-sm">
              {e.place.place_name} · {e.place.neighborhood}, {e.place.city}
            </span>
            <span className={estilos.linhaVis}>
              <span className={`t-caption c-sec ${estilos.vis ?? ''}`}>
                {e.visibility === 'private' && <Icone nome="hide" tamanho="s16" />}
                {e.visibility === 'private' ? 'Privado' : 'Público'}
              </span>
              <span className="t-caption c-sec">· {textoDoAcesso(e)}</span>
              {e.visibility === 'private' && e.pending_request_count > 0 && !removido && (
                <Link className={`${estilos.pendentes ?? ''} t-label`} to={`/rede/${e.slug}/pedidos`}>
                  {e.pending_request_count} {e.pending_request_count === 1 ? 'pedido pendente' : 'pedidos pendentes'}
                </Link>
              )}
            </span>
          </span>
        </div>
      </td>
      <td className={estilos.colData}>
        <span className="t-label">{dataCurta(e.starts_at, fuso)}</span>
        <br />
        <span className="t-body-sm c-sec">{faixaDeHorario(e.starts_at, e.ends_at, fuso)}</span>
      </td>
      <td className={estilos.colStatus}>
        <SeloDoEncontro encontro={e} />
      </td>
      <td className="w-upd col-upd t-body-sm c-sec">{dataCurta(e.updated_at, fuso).slice(5)}</td>
      <td className="w-acts">
        {itens.length > 0 && (
          <div className="acts">
            {!removido && (
              <Link className="ibtn" to={`/rede/${e.slug}`} aria-label={`Editar ${e.title}`} title="Editar">
                <Icone nome="edit" />
              </Link>
            )}
            <MenuDeAcoes rotuloDoBotao={`Mais ações para ${e.title}`} titulo="Mais ações" itens={itens} />
          </div>
        )}
      </td>
    </tr>
  );
}
