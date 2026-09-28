import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { criarClienteDaApi } from '../api/cliente.ts';
import { esperaPorExtenso, segundosDeEspera, tipoDoProblema } from '../api/problema.ts';
import { Banner, CampoDeSenha, CampoDeTexto } from '../componentes/basicos.tsx';
import { LogoHorizontal } from '../componentes/Icone.tsx';
import { lerMotivo, voltaSegura } from '../sessao/entrar-url.ts';
import { CaptchaIndisponivel, type ObterTokenDoCaptcha } from './captcha.ts';

/**
 * 1 · Login (secao 25.3, UX 29.1). Conta inexistente, senha errada e conta sem
 * papel administrativo dao **a mesma tela** (D44): mesma mensagem, e-mail
 * mantido, senha limpa, foco na senha. Nada aqui distingue os tres casos, e o
 * teste `test/entrar.test.tsx` confere isso.
 */
export const MENSAGEM_UNICA =
  'E-mail ou senha incorretos, ou esta conta não tem acesso ao backoffice. O acesso usa uma conta de administrador, separada da conta do app.';

type Aviso = { tipo: 'erro' | 'alerta' | 'info'; texto: string };

const AVISO_DO_MOTIVO: Record<string, Aviso> = {
  expirada: { tipo: 'info', texto: 'Sua sessão terminou. Entre de novo para continuar.' },
  saiu: { tipo: 'info', texto: 'Você saiu do backoffice.' },
  saiu_todas: { tipo: 'info', texto: 'Você saiu do backoffice em todos os navegadores e computadores.' },
};

const SEM_CONEXAO: Aviso = { tipo: 'erro', texto: 'Não conseguimos falar com o servidor. Confira a internet e tente entrar de novo.' };
const VERIFICACAO_RECUSADA: Aviso = {
  tipo: 'erro',
  texto: 'Não conseguimos confirmar este acesso. Tente de outra rede ou fale com o responsável pelo backoffice.',
};
const VERIFICACAO_NAO_CARREGOU: Aviso = {
  tipo: 'alerta',
  texto: 'A verificação de segurança do login não carregou. Desative o bloqueador de anúncios nesta página ou use outro navegador.',
};

export interface PropsDoEntrar {
  obterToken: ObterTokenDoCaptcha;
  busca: string;
  navegarParaFora: (url: string) => void;
  fetch?: typeof globalThis.fetch;
}

export function Entrar({ obterToken, busca, navegarParaFora, fetch }: PropsDoEntrar) {
  const parametros = useMemo(() => new URLSearchParams(busca), [busca]);
  const api = useMemo(() => criarClienteDaApi(fetch ? { fetch } : {}), [fetch]);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [aviso, setAviso] = useState<Aviso | undefined>(AVISO_DO_MOTIVO[lerMotivo(parametros.get('motivo')) ?? '']);
  const [bloqueadoAte, setBloqueadoAte] = useState<number>();
  const [errosDosCampos, setErrosDosCampos] = useState<{ email?: string; senha?: string }>({});
  const campoDaSenha = useRef<HTMLInputElement>(null);
  const campoDoEmail = useRef<HTMLInputElement>(null);

  // 1.4: Entrar volta sozinho quando o prazo passa, sem contagem ao vivo.
  useEffect(() => {
    if (bloqueadoAte === undefined) return;
    const id = setTimeout(() => setBloqueadoAte(undefined), Math.max(0, bloqueadoAte - Date.now()));
    return () => clearTimeout(id);
  }, [bloqueadoAte]);

  async function entrar() {
    if (entrando || bloqueadoAte !== undefined) return;
    const erros: { email?: string; senha?: string } = {};
    if (email.trim() === '') erros.email = 'Informe o e-mail.';
    if (senha === '') erros.senha = 'Informe a senha.';
    setErrosDosCampos(erros);
    if (erros.email) return campoDoEmail.current?.focus();
    if (erros.senha) return campoDaSenha.current?.focus();

    setEntrando(true);
    setAviso(undefined);
    try {
      let token: string;
      try {
        token = await obterToken();
      } catch (e) {
        setAviso(e instanceof CaptchaIndisponivel ? VERIFICACAO_NAO_CARREGOU : SEM_CONEXAO);
        return;
      }
      const { data, error, response } = await api.POST('/admin/auth/login', {
        params: { header: { 'X-Captcha-Token': token } },
        body: { email: email.trim(), password: senha },
      });
      if (data) {
        // Recarga completa: o painel busca a sessao (e o token anti-CSRF) sozinho.
        setSenha('');
        navegarParaFora(voltaSegura(parametros.get('volta')));
        return;
      }
      const tipo = tipoDoProblema(error);
      if (response.status === 429 || tipo === 'rate-limited') {
        const retry = response.headers.get('Retry-After');
        setAviso({ tipo: 'alerta', texto: `Muitas tentativas de entrar. Tente de novo em ${esperaPorExtenso(retry)}.` });
        setBloqueadoAte(Date.now() + segundosDeEspera(retry) * 1000);
        setSenha('');
        return;
      }
      if (tipo === 'captcha-rejected') {
        setAviso(VERIFICACAO_RECUSADA);
        return;
      }
      // invalid-credentials, validation-failed e qualquer outra recusa: a mesma tela (D44).
      setSenha('');
      setAviso({ tipo: 'erro', texto: MENSAGEM_UNICA });
      requestAnimationFrame(() => campoDaSenha.current?.focus());
    } catch {
      setAviso(SEM_CONEXAO);
    } finally {
      setEntrando(false);
    }
  }

  const bloqueado = bloqueadoAte !== undefined;
  let banner: ReactNode = null;
  if (aviso) {
    banner = (
      <Banner tipo={aviso.tipo} {...(bloqueado ? { id: 'motivo-do-bloqueio' } : {})}>
        {aviso.texto}
      </Banner>
    );
  }

  return (
    <main className="login">
      <form
        className="cartao"
        noValidate
        aria-labelledby="titulo-entrar"
        onSubmit={(e) => {
          e.preventDefault();
          void entrar();
        }}
      >
        <div className="marca">
          <LogoHorizontal />
          <span className="t-overline c-sec">Backoffice</span>
        </div>
        <h1 className="t-title-lg" id="titulo-entrar">
          Entrar no backoffice
        </h1>
        {/* Os avisos sao anunciados: erro e role=alert, o resto role=status. */}
        {banner}
        <CampoDeTexto
          id="l-email"
          rotulo="E-mail"
          tipo="email"
          autoComplete="username"
          valor={email}
          aoMudar={setEmail}
          somenteLeitura={entrando}
          erro={errosDosCampos.email}
          referencia={campoDoEmail}
        />
        <CampoDeSenha
          id="l-senha"
          rotulo="Senha"
          valor={senha}
          aoMudar={setSenha}
          somenteLeitura={entrando}
          erro={errosDosCampos.senha}
          referencia={campoDaSenha}
        />
        <button
          className="btn pri"
          type="submit"
          disabled={bloqueado}
          aria-describedby={bloqueado ? 'motivo-do-bloqueio' : undefined}
          aria-busy={entrando || undefined}
        >
          {entrando && <span className="spin" aria-hidden="true" />}
          Entrar
        </button>
      </form>
    </main>
  );
}
