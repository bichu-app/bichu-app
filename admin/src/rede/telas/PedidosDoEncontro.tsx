/**
 * 4 · Rede: pedidos para participar (25.5.2, UX 29.10, BO-10 e BO-11).
 *
 * So existe em encontro privado. Abas Pendentes, Aprovados e Recusados, com a
 * contagem de cada uma. **Aprovar nao tem volta** (o tutor ja viu o local); a
 * recusa pode ser desfeita aprovando depois, e nao avisa a pessoa.
 *
 * A leitura da fila e a unica leitura de pessoa do painel (D53 a D57): cada
 * chamada vai para a trilha e o teto conta LINHAS devolvidas (300 por hora).
 * Por isso a aba aberta pede a pagina (ate 50) e as outras duas pedem so a
 * contagem, com `limit=1`: tres abas custam no maximo 52 linhas, e nao 150.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';

import { Banner, LinhasCarregando } from '../../componentes/basicos.tsx';
import { Icone } from '../../componentes/Icone.tsx';
import { mensagemDaFalha } from '../api/mensagens.ts';
import { esperaPorExtenso, type Falha, type Resultado } from '../api/redeApi.ts';
import { SeloDoEncontro } from '../componentes/SeloDoEncontro.tsx';
import { dataCurta, dataEHora, faixaDeHorario, mesPorExtenso } from '../dominio/horario.ts';
import { ABAS_DE_PEDIDOS, chaves, VAZIO_DE_PEDIDOS } from '../dominio/rotulos.ts';
import type { Encontro, EstadoDoPedido, PaginaDePedidos, Pedido } from '../dominio/tipos.ts';
import estilos from '../rede.module.css';
import { useRede } from '../usarRede.ts';

const ABAS = chaves(ABAS_DE_PEDIDOS);
const ehAba = (v: string | null): v is EstadoDoPedido => v !== null && (ABAS as string[]).includes(v);

export const SEM_NOME = 'Conta sem nome de exibição';
const nomeDe = (p: Pedido) => p.requester.display_name?.trim() || SEM_NOME;

type Fila =
  | { fase: 'carregando' }
  | { fase: 'erro'; texto: string }
  | { fase: 'pronto'; itens: Pedido[]; total: number; pagina: number; carregandoMais: boolean };

/** A fila carregada vale para uma chave (aba e versao); chave nova e 'carregando'. */
type FilaDaChave = { chave: string } & Fila;

function textoDoErroDaFila(falha: Falha): string {
  if (falha.tipo === 'limite') return `A fila foi consultada muitas vezes na última hora. Tente de novo em ${esperaPorExtenso(falha.esperaSegundos)}.`;
  return 'Não conseguimos carregar os pedidos.';
}

export default function PedidosDoEncontro() {
  const { eventSlug = '' } = useParams();
  const { rede } = useRede();
  const [busca, setBusca] = useSearchParams();
  const aba: EstadoDoPedido = ehAba(busca.get('aba')) ? (busca.get('aba') as EstadoDoPedido) : 'pending';
  const [encontro, setEncontro] = useState<Encontro | 'erro' | 'nao-encontrado'>();
  const [filaGuardada, setFila] = useState<FilaDaChave>({ chave: '', fase: 'carregando' });
  const [contagens, setContagens] = useState<Partial<Record<EstadoDoPedido, number>>>({});
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string; desfazer?: Pedido }>();
  const [decidindo, setDecidindo] = useState<string>();
  const [versao, setVersao] = useState(0);
  const idDoPainel = useId();
  const abasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ativo = true;
    void rede.obter(eventSlug).then((r) => {
      if (!ativo) return;
      if (r.ok) setEncontro(r.dados);
      else setEncontro(r.falha.tipo === 'nao-encontrado' ? 'nao-encontrado' : 'erro');
    });
    return () => {
      ativo = false;
    };
  }, [rede, eventSlug]);

  const privado = typeof encontro === 'object' && encontro.visibility === 'private';
  const chaveDaFila = `${aba}:${versao}`;
  const fila: Fila = filaGuardada.chave === chaveDaFila ? filaGuardada : { fase: 'carregando' };

  const aplicar = useCallback(
    (r: Resultado<PaginaDePedidos>, pagina: number) => {
      if (!r.ok) {
        setFila({ chave: chaveDaFila, fase: 'erro', texto: textoDoErroDaFila(r.falha) });
        return;
      }
      setContagens((c) => ({ ...c, [aba]: r.dados.total }));
      setFila((f) => ({
        chave: chaveDaFila,
        fase: 'pronto',
        itens: pagina === 1 || f.fase !== 'pronto' || f.chave !== chaveDaFila ? r.dados.items : [...f.itens, ...r.dados.items],
        total: r.dados.total,
        pagina,
        carregandoMais: false,
      }));
    },
    [aba, chaveDaFila],
  );

  useEffect(() => {
    if (!privado) return;
    let ativo = true;
    void rede.pedidos(eventSlug, aba, 1).then((r) => ativo && aplicar(r, 1));
    // So a contagem das outras abas: `limit=1` devolve no maximo uma linha.
    for (const outra of ABAS.filter((x) => x !== aba)) {
      void rede.contarPedidos(eventSlug, outra).then((r) => {
        if (ativo && r.ok) setContagens((c) => ({ ...c, [outra]: r.dados.total }));
      });
    }
    return () => {
      ativo = false;
    };
  }, [privado, aplicar, rede, eventSlug, aba]);

  function carregarMais(pagina: number) {
    setFila((f) => (f.fase === 'pronto' ? { ...f, carregandoMais: true } : f));
    void rede.pedidos(eventSlug, aba, pagina).then((r) => aplicar(r, pagina));
  }

  function trocarDeAba(nova: EstadoDoPedido, focar = false) {
    setBusca((b) => {
      const n = new URLSearchParams(b);
      if (nova === 'pending') n.delete('aba');
      else n.set('aba', nova);
      return n;
    });
    // As tres abas estao sempre na arvore: o foco vai direto, sem esperar a troca da URL.
    if (focar) abasRef.current?.querySelector<HTMLButtonElement>(`[data-aba="${nova}"]`)?.focus();
  }

  function aoTeclarNasAbas(e: React.KeyboardEvent) {
    const i = ABAS.indexOf(aba);
    const destino =
      e.key === 'ArrowRight' ? ABAS[(i + 1) % ABAS.length] : e.key === 'ArrowLeft' ? ABAS[(i - 1 + ABAS.length) % ABAS.length] : e.key === 'Home' ? ABAS[0] : e.key === 'End' ? ABAS[ABAS.length - 1] : undefined;
    if (!destino) return;
    e.preventDefault();
    trocarDeAba(destino, true);
  }

  /**
   * Depois da decisao, a fila e as contagens mudam aqui mesmo, sem nova leitura: cada
   * leitura da fila vai para a trilha e conta no teto de 300 linhas por hora (D56).
   */
  function aplicarDecisao(antes: EstadoDoPedido, depois: Pedido) {
    setContagens((c) => ({
      ...c,
      ...(c[antes] !== undefined ? { [antes]: Math.max(0, (c[antes] ?? 1) - 1) } : {}),
      ...(c[depois.status] !== undefined ? { [depois.status]: (c[depois.status] ?? 0) + 1 } : {}),
    }));
    setFila((f) => {
      if (f.fase !== 'pronto' || f.chave !== chaveDaFila) return f;
      const estava = f.itens.some((x) => x.ref === depois.ref);
      if (antes === aba && estava) return { ...f, itens: f.itens.filter((x) => x.ref !== depois.ref), total: Math.max(0, f.total - 1) };
      if (depois.status === aba && !estava) return { ...f, itens: [...f.itens, depois], total: f.total + 1 };
      return f;
    });
  }

  async function decidir(p: Pedido, decisao: 'aprovar' | 'recusar') {
    if (decidindo) return;
    setDecidindo(p.ref);
    const r = decisao === 'aprovar' ? await rede.aprovar(p.ref) : await rede.recusar(p.ref);
    setDecidindo(undefined);
    const nome = nomeDe(p);
    if (!r.ok) {
      setAviso({ tipo: 'erro', texto: mensagemDaFalha(r.falha, decisao === 'aprovar' ? 'aprovar o pedido' : 'recusar o pedido') });
      // Pedido ja decidido por outra pessoa: a fila em tela esta velha, e so entao se rele.
      if (r.falha.tipo === 'validacao') setVersao((v) => v + 1);
      return;
    }
    aplicarDecisao(p.status, r.dados);
    setAviso(
      decisao === 'aprovar'
        ? { tipo: 'ok', texto: `Pedido de ${nome} aprovado.` }
        : { tipo: 'ok', texto: `Pedido de ${nome} recusado. A pessoa não é avisada.`, desfazer: r.dados },
    );
  }


  if (encontro === undefined) {
    return (
      <p className="t-body-sm c-sec" role="status">
        Carregando o encontro…
      </p>
    );
  }
  if (encontro === 'erro' || encontro === 'nao-encontrado') {
    return (
      <>
        <Voltar />
        <Banner tipo="erro">{encontro === 'erro' ? 'Não conseguimos carregar o encontro.' : 'Este encontro não existe mais.'}</Banner>
      </>
    );
  }

  const cabecalho = (
    <>
      <Voltar />
      <header className={estilos.cabecalho}>
        <div className={estilos.cabecalhoTexto}>
          <h1 className="t-headline">{encontro.title}</h1>
          <p className="t-body c-sec">
            {dataCurta(encontro.starts_at, encontro.time_zone)}, {faixaDeHorario(encontro.starts_at, encontro.ends_at, encontro.time_zone)} · {encontro.place.place_name},{' '}
            {encontro.place.neighborhood}
          </p>
          <div className={estilos.linhaVis}>
            <SeloDoEncontro encontro={encontro} />
            <span className={`t-caption c-sec ${estilos.vis ?? ''}`}>
              {encontro.visibility === 'private' && <Icone nome="hide" tamanho="s16" />}
              {encontro.visibility === 'private' ? 'Privado' : 'Público'}
            </span>
          </div>
        </div>
        {encontro.publication_status !== 'removed' && (
          <Link className="btn sec" to={`/rede/${encontro.slug}`}>
            <Icone nome="edit" tamanho="s20" />
            Editar encontro
          </Link>
        )}
      </header>
    </>
  );

  if (!privado) {
    return (
      <>
        {cabecalho}
        <div className="semres">
          <p className="t-title">Este encontro é público.</p>
          <p className="t-body c-sec">Qualquer pessoa pode ir, sem pedido. A fila de pedidos só existe em encontro privado.</p>
        </div>
      </>
    );
  }

  return (
    <>
      {cabecalho}
      <section className={estilos.fila} aria-labelledby={`${idDoPainel}-titulo`}>
        <h2 className="t-title-lg" id={`${idDoPainel}-titulo`}>
          Pedidos para participar
        </h2>
        <p className="t-body-sm c-sec">Aprovar não tem volta: quem foi aprovado já viu o local. Recusar pode ser desfeito, aprovando depois.</p>
        <p className="t-body-sm c-sec">
          Aqui aparecem só o nome de exibição, se a conta está validada (e-mail confirmado), o mês em que a conta foi criada e a data do pedido. Pets e contato não
          aparecem. Quem for aprovado passa a ver no app o local e os detalhes. Não há como mandar mensagem pelo Bichu.
        </p>
        <Banner tipo="info">Recusar não avisa a pessoa. No app, o pedido dela continua como “Pedido enviado” até a data do encontro.</Banner>
        {aviso && (
          <Banner
            tipo={aviso.tipo}
            aoFechar={() => setAviso(undefined)}
            acao={
              aviso.desfazer ? (
                <button type="button" className="btn ghost sm" onClick={() => aviso.desfazer && void decidir(aviso.desfazer, 'aprovar')}>
                  Desfazer
                </button>
              ) : undefined
            }
          >
            {aviso.texto}
          </Banner>
        )}
        <div ref={abasRef} className={estilos.abas} role="tablist" aria-label="Pedidos para participar" onKeyDown={aoTeclarNasAbas}>
          {ABAS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={`${idDoPainel}-aba-${k}`}
              data-aba={k}
              className={estilos.aba}
              aria-selected={aba === k}
              aria-controls={idDoPainel}
              tabIndex={aba === k ? 0 : -1}
              onClick={() => trocarDeAba(k)}
            >
              {ABAS_DE_PEDIDOS[k]}{' '}
              {contagens[k] !== undefined && <span className={`${estilos.abaN ?? ''} t-label`}>{contagens[k]}</span>}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={idDoPainel} aria-labelledby={`${idDoPainel}-aba-${aba}`} tabIndex={0}>
          {fila.fase === 'carregando' && (
            <div className="tabwrap">
              <table aria-busy="true">
                <caption className="sr">Carregando pedidos</caption>
                <tbody>
                  <LinhasCarregando linhas={3} colunas={['w-acts']} />
                </tbody>
              </table>
            </div>
          )}
          {fila.fase === 'erro' && (
            <Banner
              tipo="erro"
              acao={
                <button type="button" className="btn ghost sm" onClick={() => setVersao((v) => v + 1)}>
                  Atualizar
                </button>
              }
            >
              {fila.texto}
            </Banner>
          )}
          {fila.fase === 'pronto' && fila.itens.length === 0 && (
            <div className="semres">
              <p className="t-title">{VAZIO_DE_PEDIDOS[aba]}</p>
            </div>
          )}
          {fila.fase === 'pronto' && fila.itens.length > 0 && (
            <ul className={estilos.pedidos}>
              {fila.itens.map((p) => (
                <LinhaDoPedido key={p.ref} pedido={p} aba={aba} ocupado={decidindo === p.ref} aoDecidir={(d) => void decidir(p, d)} />
              ))}
            </ul>
          )}
          {fila.fase === 'pronto' && fila.itens.length < fila.total && (
            <button
              type="button"
              className={`btn sec ${estilos.carregarMais ?? ''}`}
              aria-busy={fila.carregandoMais || undefined}
              onClick={() => carregarMais(fila.pagina + 1)}
            >
              Carregar mais
            </button>
          )}
        </div>
      </section>
    </>
  );
}

function Voltar() {
  return (
    <Link className={`btn ghost voltar ${estilos.voltar ?? ''}`} to="/rede">
      <Icone nome="back" tamanho="s20" />
      Voltar para a Rede
    </Link>
  );
}

function LinhaDoPedido({ pedido: p, aba, ocupado, aoDecidir }: { pedido: Pedido; aba: EstadoDoPedido; ocupado: boolean; aoDecidir: (d: 'aprovar' | 'recusar') => void }) {
  const nome = nomeDe(p);
  const semNome = !p.requester.display_name?.trim();
  const desistiu = !!p.withdrawn_at;
  return (
    <li className={estilos.pedido}>
      <div className={estilos.pedidoTexto}>
        <span className={`t-label ${estilos.pedidoNome ?? ''}`}>
          <span className={semNome ? estilos.semNome : undefined}>{nome}</span>
          <span className={`selo t-overline ${p.requester.email_verified ? (estilos.validada ?? '') : (estilos.naoValidada ?? '')}`}>
            <Icone nome={p.requester.email_verified ? 'check' : 'info'} tamanho="s16" />
            {p.requester.email_verified ? 'Conta validada' : 'Conta não validada'}
          </span>
        </span>
        <span className="t-body-sm c-sec">
          Conta criada em {mesPorExtenso(p.requester.member_since)} · Pediu em {dataEHora(p.requested_at, p.event.time_zone)}
        </span>
      </div>
      {desistiu ? (
        <span className="t-body-sm c-sec">A pessoa desistiu do pedido.</span>
      ) : aba === 'pending' ? (
        <div className={estilos.pedidoAcoes}>
          <button type="button" className="btn sec" disabled={ocupado} aria-label={`Recusar o pedido de ${nome}`} onClick={() => aoDecidir('recusar')}>
            Recusar
          </button>
          <button type="button" className="btn pri" aria-busy={ocupado || undefined} aria-label={`Aprovar o pedido de ${nome}`} onClick={() => aoDecidir('aprovar')}>
            Aprovar
          </button>
        </div>
      ) : aba === 'approved' ? (
        <span className="t-body-sm c-sec">Aprovado</span>
      ) : (
        <div className={estilos.pedidoAcoes}>
          <span className="t-body-sm c-sec">Recusado</span>
          <button type="button" className="btn ghost sm" aria-busy={ocupado || undefined} aria-label={`Aprovar o pedido de ${nome}`} onClick={() => aoDecidir('aprovar')}>
            Aprovar
          </button>
        </div>
      )}
    </li>
  );
}
