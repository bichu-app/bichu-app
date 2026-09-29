import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { criarClienteDaApi, type ClienteDaApi, type Esquemas } from '../api/cliente.ts';
import { esperaPorExtenso, segundosDeEspera, tipoDoProblema } from '../api/problema.ts';
import { Dialogo } from '../componentes/Dialogo.tsx';
import { urlDeEntrar, type MotivoDeEntrar } from './entrar-url.ts';
import { lerPrazos, prazosDaResposta, renovarPorUso, type Prazos } from './prazos.ts';
import { criarGuardaEmMemoria, saidaDoPainel, sessaoPorCookie, type GuardaDoTokenAntiCsrf } from './sessao.ts';

type EscopoDeReautenticacao = Esquemas['AdminReauthScope'];

export type ResultadoDaReautenticacao =
  | { ok: true; token: string }
  | { ok: false; motivo: 'incorreta' }
  | { ok: false; motivo: 'tentativas'; espera: string; segundos: number }
  | { ok: false; motivo: 'falha' };

/** Uma senha, um ou dois escopos (`scopes`): um token por escopo, todos da mesma sessao rotacionada. */
export type ResultadoDaReautenticacaoDeEscopos =
  | { ok: true; tokens: Partial<Record<EscopoDeReautenticacao, string>> }
  | Exclude<ResultadoDaReautenticacao, { ok: true }>;

export interface ContextoDaSessao {
  api: ClienteDaApi;
  nome: string;
  /** S.2: faltam 10 minutos para o teto de 12 h. */
  avisoDoTeto: boolean;
  sair: () => Promise<void>;
  sairDeTodas: () => Promise<void>;
  /** D40: confere a senha e devolve o token de uso unico do escopo. A sessao rotaciona. */
  reautenticar: (senha: string, escopo: EscopoDeReautenticacao) => Promise<ResultadoDaReautenticacao>;
  /**
   * D40 com `scopes`: UMA reautenticacao para as duas operacoes sensiveis gravadas
   * juntas (lugar e acesso do encontro). Duas reautenticacoes seguidas nao servem:
   * cada uma rotaciona a sessao, e o token da primeira fica preso a sessao revogada.
   */
  reautenticarEscopos: (senha: string, escopos: EscopoDeReautenticacao[]) => Promise<ResultadoDaReautenticacaoDeEscopos>;
  /**
   * Registra quem guarda o formulario quando a sessao cai (UX 29.2). Devolve a
   * funcao que tira o registro.
   */
  registrarRascunho: (guardar: () => void) => () => void;
}

const Contexto = createContext<ContextoDaSessao | undefined>(undefined);

export function useSessao(): ContextoDaSessao {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useSessao fora de <ProvedorDeSessao>');
  return valor;
}

export interface PropsDoProvedor {
  children: ReactNode;
  /** Navegacao de documento inteiro (para `/entrar/`). Injetavel para teste. */
  navegarParaFora?: (url: string) => void;
  /** Injetavel para teste. */
  fetch?: typeof globalThis.fetch;
  /** Relogio injetavel para teste. */
  agora?: () => number;
  /** Rota atual, para voltar depois de entrar. */
  rotaAtual?: () => string;
}

const TIPOS_DE_SESSAO_PERDIDA = new Set(['unauthenticated', 'token-expired']);

function rotaDoNavegador(): string {
  return `${globalThis.location.pathname}${globalThis.location.search}`;
}
function navegarNoNavegador(url: string): void {
  globalThis.location.assign(url);
}

interface Conexao {
  api: ClienteDaApi;
  guarda: GuardaDoTokenAntiCsrf;
}

/**
 * A sessao do painel: carrega `getAdminSession` (nome, prazos e o token
 * anti-CSRF, que fica so em memoria), manda para `/entrar/` quando a sessao
 * cai, e cuida dos avisos S.1 e S.2 (UX 29.2).
 */
export function ProvedorDeSessao({
  children,
  navegarParaFora = navegarNoNavegador,
  fetch,
  agora = Date.now,
  rotaAtual = rotaDoNavegador,
}: PropsDoProvedor) {
  const [conexao, setConexao] = useState<Conexao>();
  const [nome, setNome] = useState<string>();
  const [prazos, setPrazos] = useState<Prazos>();
  const [instante, setInstante] = useState(0);
  const [rascunhos] = useState(() => new Set<() => void>());
  const saindo = useRef(false);
  const dependencias = useRef({ navegarParaFora, agora, rotaAtual });
  useLayoutEffect(() => {
    dependencias.current = { navegarParaFora, agora, rotaAtual };
  });

  const derrubar = useCallback(
    (motivo: MotivoDeEntrar | undefined, voltarDepois: boolean, guarda?: GuardaDoTokenAntiCsrf) => {
      if (saindo.current) return;
      saindo.current = true;
      // Quem volta depois de entrar volta com o formulario (UX 29.2).
      if (voltarDepois) rascunhos.forEach((guardar) => guardar());
      guarda?.trocar(undefined);
      saidaDoPainel.liberada = true;
      const { navegarParaFora: navegar, rotaAtual: rota } = dependencias.current;
      navegar(urlDeEntrar({ ...(motivo ? { motivo } : {}), ...(voltarDepois ? { volta: rota() } : {}) }));
    },
    [rascunhos],
  );

  const aplicar = useCallback((dados: Esquemas['AdminSession'], guarda: GuardaDoTokenAntiCsrf) => {
    guarda.trocar(dados.csrf_token);
    const agoraMs = dependencias.current.agora();
    setNome(dados.display_name);
    setPrazos(prazosDaResposta(dados, agoraMs));
    setInstante(agoraMs);
  }, []);

  // O cliente nasce aqui, fora da renderizacao: ele guarda o token em memoria
  // e avisa quando a sessao e usada ou perdida.
  useEffect(() => {
    let ativo = true;
    let conectado = false;
    const guarda = criarGuardaEmMemoria();
    const api = criarClienteDaApi({
      ...(fetch ? { fetch } : {}),
      sessao: sessaoPorCookie({
        guarda,
        aoUsar: () => {
          const agoraMs = dependencias.current.agora();
          setPrazos((p) => (p ? renovarPorUso(p, agoraMs) : p));
          setInstante(agoraMs);
        },
        aoPerderAutorizacao: (resposta) => {
          // 401 de senha errada na reautenticacao nao derruba nada: so os dois
          // tipos de sessao perdida mandam entrar de novo.
          void resposta
            .clone()
            .json()
            .catch(() => undefined)
            .then((corpo: unknown) => {
              const tipo = tipoDoProblema(corpo) ?? '';
              if (!ativo || !TIPOS_DE_SESSAO_PERDIDA.has(tipo)) return;
              // Primeira visita sem cookie so manda entrar; sessao que existia e caiu diz que terminou (1.7).
              derrubar(conectado || tipo === 'token-expired' ? 'expirada' : undefined, true, guarda);
            });
        },
      }),
    });
    api
      .GET('/admin/session')
      .then(({ data, response }) => {
        if (!ativo) return;
        if (data) {
          conectado = true;
          aplicar(data, guarda);
          setConexao({ api, guarda });
        } else if (response.status !== 401) derrubar(undefined, false, guarda); // 401: o middleware ja mandou entrar
      })
      .catch(() => {
        if (ativo) derrubar(undefined, false, guarda);
      });
    return () => {
      ativo = false;
    };
  }, [fetch, aplicar, derrubar]);

  // S.1 e S.2: um relogio so, que acorda no proximo limiar.
  const leitura = useMemo(() => (prazos ? lerPrazos(prazos, instante) : undefined), [prazos, instante]);
  useEffect(() => {
    if (!leitura) return;
    if (leitura.vencida) {
      derrubar('expirada', true, conexao?.guarda);
      return;
    }
    const espera = Math.max(250, leitura.proximaMudanca - dependencias.current.agora());
    const id = setTimeout(() => setInstante(dependencias.current.agora()), espera);
    return () => clearTimeout(id);
  }, [leitura, derrubar, conexao]);

  const continuarConectado = useCallback(async () => {
    if (!conexao) return;
    const { data } = await conexao.api.GET('/admin/session');
    if (data) aplicar(data, conexao.guarda);
  }, [conexao, aplicar]);

  const sair = useCallback(async () => {
    if (!conexao) return;
    try {
      await conexao.api.POST('/admin/auth/logout');
    } finally {
      derrubar('saiu', false, conexao.guarda);
    }
  }, [conexao, derrubar]);

  const sairDeTodas = useCallback(async () => {
    if (!conexao) return;
    const { response } = await conexao.api.POST('/admin/auth/logout-all');
    if (response.ok || response.status === 401) derrubar('saiu_todas', false, conexao.guarda);
    else throw new Error(`logout-all respondeu ${response.status}`);
  }, [conexao, derrubar]);

  const reautenticarEscopos = useCallback(
    async (senha: string, escopos: EscopoDeReautenticacao[]): Promise<ResultadoDaReautenticacaoDeEscopos> => {
      if (!conexao || escopos.length < 1 || escopos.length > 2) return { ok: false, motivo: 'falha' };
      const { data, error, response } = await conexao.api.POST('/admin/auth/reauth', {
        // Um escopo vai em `scope`; dois, em `scopes` (oneOf do contrato).
        body: escopos.length === 1 && escopos[0] ? { password: senha, scope: escopos[0] } : { password: senha, scopes: escopos },
      });
      if (data) {
        conexao.guarda.trocar(data.csrf_token);
        return { ok: true, tokens: Object.fromEntries(data.tokens.map((t) => [t.scope, t.reauth_token])) };
      }
      if (response.status === 429) {
        const retry = response.headers.get('Retry-After');
        return { ok: false, motivo: 'tentativas', espera: esperaPorExtenso(retry), segundos: segundosDeEspera(retry) };
      }
      if (tipoDoProblema(error) === 'invalid-credentials') return { ok: false, motivo: 'incorreta' };
      return { ok: false, motivo: 'falha' };
    },
    [conexao],
  );

  const reautenticar = useCallback(
    async (senha: string, escopo: EscopoDeReautenticacao): Promise<ResultadoDaReautenticacao> => {
      const r = await reautenticarEscopos(senha, [escopo]);
      if (!r.ok) return r;
      const token = r.tokens[escopo];
      return token ? { ok: true, token } : { ok: false, motivo: 'falha' };
    },
    [reautenticarEscopos],
  );

  const registrarRascunho = useCallback(
    (guardar: () => void) => {
      rascunhos.add(guardar);
      return () => {
        rascunhos.delete(guardar);
      };
    },
    [rascunhos],
  );

  const avisoDoTeto = leitura?.avisarTeto ?? false;
  const api = conexao?.api;
  const valor = useMemo<ContextoDaSessao | undefined>(
    () => (api && nome !== undefined ? { api, nome, avisoDoTeto, sair, sairDeTodas, reautenticar, reautenticarEscopos, registrarRascunho } : undefined),
    [api, nome, avisoDoTeto, sair, sairDeTodas, reautenticar, reautenticarEscopos, registrarRascunho],
  );

  if (!api || nome === undefined) return <p role="status">Carregando…</p>;

  return (
    <Contexto.Provider value={valor}>
      {children}
      {leitura?.avisarInatividade && <AvisoDeInatividade aoSair={() => void sair()} aoContinuar={continuarConectado} />}
    </Contexto.Provider>
  );
}

/** S.1: aos 28 min sem uso. Foco inicial em "Continuar conectado". */
function AvisoDeInatividade({ aoSair, aoContinuar }: { aoSair: () => void; aoContinuar: () => Promise<void> }) {
  const [renovando, setRenovando] = useState(false);
  return (
    <Dialogo titulo="Sua sessão termina em 2 minutos por falta de uso." aoFechar={() => void aoContinuar()}>
      <div className="acoes">
        <button type="button" className="btn sec" onClick={aoSair}>
          Sair
        </button>
        <button
          type="button"
          className="btn pri"
          data-foco-inicial
          aria-busy={renovando || undefined}
          onClick={() => {
            setRenovando(true);
            void aoContinuar().finally(() => setRenovando(false));
          }}
        >
          Continuar conectado
        </button>
      </div>
    </Dialogo>
  );
}
