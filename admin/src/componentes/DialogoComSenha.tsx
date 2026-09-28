import { useEffect, useId, useRef, useState } from 'react';

import type { Esquemas } from '../api/cliente.ts';
import { useSessao } from '../sessao/ProvedorDeSessao.tsx';
import { Banner, CampoDeSenha } from './basicos.tsx';
import { Dialogo } from './Dialogo.tsx';

export type ResultadoDaAcaoComSenha = { ok: true } | { ok: false; mensagem: string };

/**
 * `BO/Dialogo de confirmacao`, variante Destrutivo com senha (secao 25.4.1,
 * D40, UX 29.6). Pede a senha **toda vez** que abre; a senha nunca e guardada.
 * O botao da acao fica sempre habilitado e a falta de senha vira erro no envio.
 *
 * Fluxo: `reauthenticateAdmin` com o escopo -> token de uso unico -> `executar`
 * leva o token em `X-Admin-Reauth-Token`.
 */
export function DialogoComSenha({
  titulo,
  corpo,
  rotuloDaAcao,
  perigo = true,
  escopo,
  executar,
  aoFechar,
}: {
  titulo: string;
  corpo: string;
  rotuloDaAcao: string;
  perigo?: boolean;
  escopo: Esquemas['AdminReauthScope'];
  executar: (tokenDeReautenticacao: string) => Promise<ResultadoDaAcaoComSenha>;
  aoFechar: () => void;
}) {
  const { reautenticar } = useSessao();
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string>();
  const [falha, setFalha] = useState<string>();
  const [bloqueio, setBloqueio] = useState<{ texto: string; segundos: number }>();
  const [carregando, setCarregando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const idDoCorpo = useId();

  useEffect(() => {
    if (!bloqueio) return;
    // O prazo passa sozinho, sem contagem regressiva ao vivo (UX 29.1).
    const id = setTimeout(() => setBloqueio(undefined), bloqueio.segundos * 1000);
    return () => clearTimeout(id);
  }, [bloqueio]);

  async function confirmar() {
    if (carregando || bloqueio) return;
    setFalha(undefined);
    if (senha === '') {
      setErro('Digite sua senha para confirmar.');
      campo.current?.focus();
      return;
    }
    setErro(undefined);
    setCarregando(true);
    try {
      const r = await reautenticar(senha, escopo);
      if (!r.ok) {
        if (r.motivo === 'incorreta') {
          setSenha('');
          setErro('Senha incorreta.');
          campo.current?.focus();
        } else if (r.motivo === 'tentativas') {
          setBloqueio({ texto: `Muitas tentativas. Tente de novo em ${r.espera}.`, segundos: r.segundos });
        } else {
          setFalha('Não conseguimos falar com o servidor. Confira a internet e tente de novo.');
        }
        return;
      }
      setSenha('');
      const resultado = await executar(r.token);
      if (resultado.ok) aoFechar();
      else setFalha(resultado.mensagem);
    } catch {
      setFalha('Não conseguimos falar com o servidor. Confira a internet e tente de novo.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Dialogo titulo={titulo} aoFechar={carregando ? undefined : aoFechar} descricaoId={idDoCorpo}>
      <p className="t-body c-sec" id={idDoCorpo}>
        {corpo}
      </p>
      {bloqueio && <Banner tipo="alerta">{bloqueio.texto}</Banner>}
      {falha && <Banner tipo="erro">{falha}</Banner>}
      <form
        className="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void confirmar();
        }}
      >
        <p className="t-body-sm c-sec">Digite sua senha para confirmar.</p>
        <CampoDeSenha
          id="senha-de-confirmacao"
          rotulo="Sua senha"
          valor={senha}
          aoMudar={setSenha}
          erro={erro}
          desabilitado={!!bloqueio}
          somenteLeitura={carregando}
          autoFoco
          referencia={campo}
        />
        <div className="acoes">
          <button type="button" className="btn sec" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className={perigo ? 'btn danger' : 'btn pri'} disabled={!!bloqueio} aria-busy={carregando || undefined}>
            {carregando && <span className="spin" aria-hidden="true" />}
            {rotuloDaAcao}
          </button>
        </div>
      </form>
    </Dialogo>
  );
}
