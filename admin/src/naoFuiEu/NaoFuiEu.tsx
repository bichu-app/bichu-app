/**
 * "Nao fui eu" do painel (D62, ADR-0027 item 20.5): o e-mail de sessao aberta
 * leva `<painel>/nao-fui-eu#t=<token>`. O token vem no **fragmento**, que o
 * navegador nao manda ao servidor nem poe em `Referer`, e sai da barra de
 * endereco assim que e lido. So vai ao servidor por `POST`
 * (`disavowAdminSessionAlert`) e **so depois do clique**: cliente de e-mail e
 * antivirus que pre-carregam o link nao disparam o bloqueio.
 *
 * Fica fora da sessao: existe para quem pode ter perdido a sua. Sem
 * `X-CSRF-Token`; o navegador manda `Origin`, que o servidor confere.
 */
import { useMemo, useState } from 'react';

import { criarClienteDaApi } from '../api/cliente.ts';
import { Banner } from '../componentes/basicos.tsx';
import { LogoHorizontal } from '../componentes/Icone.tsx';

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Le `#t=<token>` e tira o fragmento da barra de endereco. */
export function lerTokenDoFragmento(): string | null {
  const t = new URLSearchParams(globalThis.location.hash.replace(/^#/, '')).get('t');
  if (globalThis.location.hash) {
    globalThis.history.replaceState(globalThis.history.state, '', globalThis.location.pathname + globalThis.location.search);
  }
  return t && TOKEN.test(t) ? t : null;
}

type Fase = 'confirmar' | 'enviando' | 'feito' | 'vencido' | 'incompleto' | 'recusado' | 'sem-conexao';

export default function NaoFuiEu({ fetch }: { fetch?: typeof globalThis.fetch }) {
  const api = useMemo(() => criarClienteDaApi(fetch ? { fetch } : {}), [fetch]);
  const [token] = useState(lerTokenDoFragmento);
  const [fase, setFase] = useState<Fase>(token ? 'confirmar' : 'incompleto');

  async function confirmar() {
    if (!token || fase === 'enviando') return;
    setFase('enviando');
    try {
      const { response } = await api.POST('/admin/auth/disavow', { body: { token } });
      if (response.status === 204) setFase('feito');
      else if (response.status === 410) setFase('vencido');
      else if (response.status === 400) setFase('incompleto');
      else setFase('recusado');
    } catch {
      setFase('sem-conexao');
    }
  }

  const enviando = fase === 'enviando';

  return (
    <main className="login">
      <div className="cartao">
        <div className="marca">
          <LogoHorizontal />
          <span className="t-overline c-sec">Backoffice</span>
        </div>
        {fase === 'feito' ? (
          <>
            <h1 className="t-title-lg">Sessões encerradas e conta bloqueada</h1>
            <Banner tipo="ok">Todas as sessões da sua conta no backoffice foram encerradas, e ninguém entra com ela até a senha ser trocada.</Banner>
            <p className="t-body">
              Para voltar a entrar, fale com o responsável pelo backoffice: a senha nova é definida por ele, no servidor. Todos os administradores já receberam um aviso.
            </p>
          </>
        ) : fase === 'vencido' ? (
          <>
            <h1 className="t-title-lg">Este link não vale mais</h1>
            <Banner tipo="alerta">O link venceu ou já foi usado. Ele vale por 7 dias e uma vez só.</Banner>
            <p className="t-body">Se você ainda acha que alguém entrou na sua conta, fale com o responsável pelo backoffice.</p>
          </>
        ) : fase === 'incompleto' ? (
          <>
            <h1 className="t-title-lg">Este link está incompleto</h1>
            <Banner tipo="erro">Abra de novo o link do e-mail, sem cortar nem copiar só uma parte.</Banner>
            <p className="t-body">Se não der certo, fale com o responsável pelo backoffice.</p>
          </>
        ) : (
          <>
            <h1 className="t-title-lg">Não foi você que entrou?</h1>
            <p className="t-body">
              Se você não entrou no backoffice na hora do e-mail, confirme abaixo. Todas as sessões da sua conta são encerradas, inclusive a de quem entrou, e a conta fica
              bloqueada até o responsável pelo backoffice trocar a senha. Todos os administradores recebem um aviso.
            </p>
            <p className="t-body c-sec">Se foi você, feche esta página. Nada muda.</p>
            {fase === 'recusado' && (
              <Banner tipo="erro">Não conseguimos confirmar este pedido. Abra o link direto do e-mail, neste navegador, e tente de novo.</Banner>
            )}
            {fase === 'sem-conexao' && <Banner tipo="erro">Não conseguimos falar com o servidor. Confira a internet e tente de novo.</Banner>}
            <button type="button" className="btn danger" onClick={() => void confirmar()} aria-busy={enviando || undefined}>
              {enviando && <span className="spin" aria-hidden="true" />}
              Encerrar as sessões e bloquear a conta
            </button>
          </>
        )}
      </div>
    </main>
  );
}
