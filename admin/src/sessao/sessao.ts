export interface EstrategiaDeSessao {
  prepararRequisicao(requisicao: Request): Request | Promise<Request>;
  /** Chamado quando a API responde 401. */
  aoPerderAutorizacao?(resposta: Response): void;
  /**
   * Chamado a cada resposta que nao e 401: a sessao foi usada, a inatividade
   * renovou.
   */
  aoUsar?(): void;
}

export const CABECALHO_ANTI_CSRF = 'X-CSRF-Token';
export const CABECALHO_DE_REAUTENTICACAO = 'X-Admin-Reauth-Token';

const METODOS_SEGUROS = new Set(['GET', 'HEAD']);

export interface GuardaDoTokenAntiCsrf {
  ler(): string | undefined;
  trocar(token: string | undefined): void;
}

/**
 * O token em memoria. Uma instancia por pagina; F5 o perde, e `getAdminSession` o
 * devolve.
 */
export function criarGuardaEmMemoria(): GuardaDoTokenAntiCsrf {
  let token: string | undefined;
  return {
    ler: () => token,
    trocar: (novo) => {
      token = novo;
    },
  };
}

export interface OpcoesDaSessaoPorCookie {
  guarda: GuardaDoTokenAntiCsrf;
  aoPerderAutorizacao?: (resposta: Response) => void;
  aoUsar?: () => void;
}

export function sessaoPorCookie(opcoes: OpcoesDaSessaoPorCookie): EstrategiaDeSessao {
  return {
    prepararRequisicao(requisicao) {
      const nova = new Request(requisicao, { credentials: 'same-origin' });
      if (!METODOS_SEGUROS.has(nova.method.toUpperCase())) {
        const token = opcoes.guarda.ler();
        if (token !== undefined) nova.headers.set(CABECALHO_ANTI_CSRF, token);
      }
      return nova;
    },
    ...(opcoes.aoPerderAutorizacao ? { aoPerderAutorizacao: opcoes.aoPerderAutorizacao } : {}),
    ...(opcoes.aoUsar ? { aoUsar: opcoes.aoUsar } : {}),
  };
}

/** Sem credencial nenhuma: o que o login usa antes de existir sessao. */
export const semSessao: EstrategiaDeSessao = {
  prepararRequisicao: (requisicao) => new Request(requisicao, { credentials: 'same-origin' }),
};

/**
 * Levantada quando o painel sai para `/entrar` por conta propria (sessao caiu,
 * Sair).
 */
export const saidaDoPainel = { liberada: false };
