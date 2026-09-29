/**
 * Sessao do backoffice no navegador (ADR-0027 itens 2 e 3).
 *
 * - A credencial e o cookie `__Host-bichu_adm`, `HttpOnly`: este codigo nunca a
 *   ve, e nao tem como guarda-la em lugar nenhum.
 * - O token anti-CSRF vem no corpo de `openAdminSession`, `getAdminSession` e
 *   `reauthenticateAdmin`, e fica **so em memoria**, nesta variavel de modulo.
 *   Nunca em `localStorage`, `sessionStorage` nem cookie: `test/iscas.test.ts`
 *   reprova se ele aparecer em qualquer armazenamento do navegador.
 * - Todo metodo que nao e `GET`/`HEAD` leva `X-CSRF-Token`. A mesma origem manda
 *   o cookie sozinho (`credentials: 'same-origin'`, explicito aqui).
 */
export interface EstrategiaDeSessao {
  /** Ajusta a requisicao antes do envio. */
  prepararRequisicao(requisicao: Request): Request | Promise<Request>;
  /** Chamado quando a API responde 401. */
  aoPerderAutorizacao?(resposta: Response): void;
  /** Chamado a cada resposta que nao e 401: a sessao foi usada, a inatividade renovou. */
  aoUsar?(): void;
}

export const CABECALHO_ANTI_CSRF = 'X-CSRF-Token';
export const CABECALHO_DE_REAUTENTICACAO = 'X-Admin-Reauth-Token';

const METODOS_SEGUROS = new Set(['GET', 'HEAD']);

export interface GuardaDoTokenAntiCsrf {
  ler(): string | undefined;
  trocar(token: string | undefined): void;
}

/** O token em memoria. Uma instancia por pagina; F5 o perde, e `getAdminSession` o devolve. */
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
 * Levantada quando o painel sai para `/entrar` por conta propria (sessao
 * caiu, Sair). O aviso de formulario sujo nao pergunta nada nessa hora: o
 * formulario ja foi guardado como rascunho.
 */
export const saidaDoPainel = { liberada: false };
