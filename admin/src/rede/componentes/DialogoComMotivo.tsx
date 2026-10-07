import { useId, useRef, useState } from 'react';

import { Banner } from '../../componentes/basicos.tsx';
import { Dialogo } from '../../componentes/Dialogo.tsx';
import { Icone } from '../../componentes/Icone.tsx';
import { LIMITE_DO_MOTIVO } from '../dominio/formulario.ts';
import estilos from '../rede.module.css';

export type ResultadoDaAcao = { ok: true } | { ok: false; mensagem: string };

/**
 * Confirmacao com motivo: o contrato exige `reason` em
 * `relocateAdminNetworkEvent` e `changeAdminNetworkEventAccess` e `note` em
 * `cancelAdminNetworkEvent`, e o motivo vai no e-mail aos administradores.
 * Sem senha desde 07/10 (decisao do cliente, ADR-0027 item 23).
 */
export function DialogoComMotivo({
  titulo,
  corpo,
  rotuloDoMotivo,
  ajudaDoMotivo,
  rotuloDaAcao,
  rotuloDeVoltar = 'Cancelar',
  perigo,
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
  executar: (motivo: string) => Promise<ResultadoDaAcao>;
  aoFechar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [erroDoMotivo, setErroDoMotivo] = useState<string>();
  const [falha, setFalha] = useState<string>();
  const [carregando, setCarregando] = useState(false);
  const campoDoMotivo = useRef<HTMLTextAreaElement>(null);
  const idDoCorpo = useId();
  const idDoMotivo = useId();

  async function confirmar() {
    if (carregando) return;
    setFalha(undefined);
    const m = motivo.trim();
    if (m.length < 2) {
      setErroDoMotivo('Escreva o motivo.');
      campoDoMotivo.current?.focus();
      return;
    }
    setErroDoMotivo(undefined);
    setCarregando(true);
    try {
      const resultado = await executar(m);
      if (resultado.ok) aoFechar();
      else setFalha(resultado.mensagem);
    } catch {
      setFalha('Não conseguimos falar com o servidor. Confira a internet e tente de novo.');
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
        <div className="acoes">
          <button type="button" className="btn sec" onClick={aoFechar}>
            {rotuloDeVoltar}
          </button>
          <button type="submit" className={perigo ? 'btn danger' : 'btn pri'} aria-busy={carregando || undefined}>
            {carregando && <span className="spin" aria-hidden="true" />}
            {rotuloDaAcao}
          </button>
        </div>
      </form>
    </Dialogo>
  );
}
