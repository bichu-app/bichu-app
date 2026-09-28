import { useEffect, useId, useRef, useState } from 'react';

import { Banner, CampoDeSenha } from '../../componentes/basicos.tsx';
import { Dialogo } from '../../componentes/Dialogo.tsx';
import { Icone } from '../../componentes/Icone.tsx';
import { LIMITE_DO_MOTIVO } from '../dominio/formulario.ts';
import type { EscopoDeReautenticacao } from '../dominio/tipos.ts';
import { useRede } from '../usarRede.ts';
import estilos from '../rede.module.css';

export type ResultadoDaAcao = { ok: true } | { ok: false; mensagem: string };

/**
 * A variante com senha do dialogo de confirmacao (25.4.1, D40) com um campo
 * de motivo, que o contrato exige em `cancelAdminNetworkEvent` (`note`),
 * `relocateAdminNetworkEvent` e `changeAdminNetworkEventAccess` (`reason`).
 *
 * A senha e pedida toda vez e nunca e guardada. Cada escopo em `escopos` e uma
 * reautenticacao propria, porque o token e de uso unico e de um escopo so:
 * salvar data e acesso juntos pede a senha uma vez e emite dois tokens.
 * O botao da acao fica sempre habilitado; campo vazio vira erro no envio.
 */
export function DialogoComMotivoESenha({
  titulo,
  corpo,
  rotuloDoMotivo,
  ajudaDoMotivo,
  rotuloDaAcao,
  rotuloDeVoltar = 'Cancelar',
  perigo,
  escopos,
  executar,
  aoFechar,
}: {
  titulo: string;
  corpo: string[];
  rotuloDoMotivo: string;
  ajudaDoMotivo: string;
  rotuloDaAcao: string;
  rotuloDeVoltar?: string;
  perigo: boolean;
  escopos: EscopoDeReautenticacao[];
  executar: (tokens: Partial<Record<EscopoDeReautenticacao, string>>, motivo: string) => Promise<ResultadoDaAcao>;
  aoFechar: () => void;
}) {
  const { reautenticar } = useRede();
  const [motivo, setMotivo] = useState('');
  const [senha, setSenha] = useState('');
  const [erroDoMotivo, setErroDoMotivo] = useState<string>();
  const [erroDaSenha, setErroDaSenha] = useState<string>();
  const [falha, setFalha] = useState<string>();
  const [bloqueio, setBloqueio] = useState<{ texto: string; segundos: number }>();
  const [carregando, setCarregando] = useState(false);
  const campoDoMotivo = useRef<HTMLTextAreaElement>(null);
  const campoDaSenha = useRef<HTMLInputElement>(null);
  const idDoCorpo = useId();
  const idDoMotivo = useId();

  useEffect(() => {
    if (!bloqueio) return;
    // O prazo passa sozinho, sem contagem regressiva ao vivo (UX 29.1).
    const id = setTimeout(() => setBloqueio(undefined), Math.max(1, bloqueio.segundos) * 1000);
    return () => clearTimeout(id);
  }, [bloqueio]);

  async function confirmar() {
    if (carregando || bloqueio) return;
    setFalha(undefined);
    const m = motivo.trim();
    const semMotivo = m.length < 2;
    const semSenha = senha === '';
    setErroDoMotivo(semMotivo ? 'Escreva o motivo.' : undefined);
    setErroDaSenha(semSenha ? 'Digite sua senha para confirmar.' : undefined);
    if (semMotivo) {
      campoDoMotivo.current?.focus();
      return;
    }
    if (semSenha) {
      campoDaSenha.current?.focus();
      return;
    }
    setCarregando(true);
    try {
      const tokens: Partial<Record<EscopoDeReautenticacao, string>> = {};
      for (const escopo of escopos) {
        const r = await reautenticar(senha, escopo);
        if (r.ok) {
          tokens[escopo] = r.token;
          continue;
        }
        if (r.motivo === 'incorreta') {
          setSenha('');
          setErroDaSenha('Senha incorreta.');
          campoDaSenha.current?.focus();
        } else if (r.motivo === 'tentativas') {
          setBloqueio({ texto: `Muitas tentativas. Tente de novo em ${r.espera}.`, segundos: r.segundos });
        } else {
          setFalha('Não conseguimos falar com o servidor. Confira a internet e tente de novo.');
        }
        return;
      }
      setSenha('');
      const resultado = await executar(tokens, m);
      if (resultado.ok) aoFechar();
      else setFalha(resultado.mensagem);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Dialogo titulo={titulo} aoFechar={carregando ? undefined : aoFechar} descricaoId={idDoCorpo} largo>
      <div id={idDoCorpo}>
        {corpo.map((frase) => (
          <p key={frase} className="t-body c-sec">
            {frase}
          </p>
        ))}
      </div>
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
        <div className={erroDoMotivo ? 'field err' : 'field'}>
          <label htmlFor={idDoMotivo}>{rotuloDoMotivo} *</label>
          <textarea
            ref={campoDoMotivo}
            id={idDoMotivo}
            className={`input ${estilos.area ?? ''}`}
            maxLength={LIMITE_DO_MOTIVO}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            readOnly={carregando}
            aria-invalid={erroDoMotivo ? true : undefined}
            aria-describedby={`${idDoMotivo}-ajuda`}
            data-foco-inicial
          />
          {erroDoMotivo ? (
            <span className="help err" id={`${idDoMotivo}-ajuda`} aria-live="polite">
              <Icone nome="error" tamanho="s20" />
              {erroDoMotivo}
            </span>
          ) : (
            <span className="help" id={`${idDoMotivo}-ajuda`}>
              {ajudaDoMotivo}
            </span>
          )}
        </div>
        <CampoDeSenha
          id="senha-do-encontro"
          rotulo="Sua senha"
          valor={senha}
          aoMudar={setSenha}
          erro={erroDaSenha}
          ajuda="Digite sua senha para confirmar."
          desabilitado={!!bloqueio}
          somenteLeitura={carregando}
          referencia={campoDaSenha}
        />
        <div className="acoes">
          <button type="button" className="btn sec" onClick={aoFechar}>
            {rotuloDeVoltar}
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
