import { useId, useState } from 'react';

import { Banner } from './basicos.tsx';
import { Dialogo } from './Dialogo.tsx';

export type ResultadoDaAcaoConfirmada = { ok: true } | { ok: false; mensagem: string };

/**
 * `BO/Dialogo de confirmacao`, variante Destrutivo (secao 25.4). Desde 07/10
 * nenhuma escrita do painel pede senha (decisao do cliente, ADR-0027 item 23):
 * a acao destrutiva continua confirmada aqui, com a consequencia escrita, e sem
 * campo de senha. O foco inicial vai para Cancelar, que e o lado seguro.
 */
export function DialogoDeConfirmacao({
  titulo,
  corpo,
  rotuloDaAcao,
  perigo = true,
  executar,
  aoFechar,
}: {
  titulo: string;
  corpo: string;
  rotuloDaAcao: string;
  perigo?: boolean;
  executar: () => Promise<ResultadoDaAcaoConfirmada>;
  aoFechar: () => void;
}) {
  const [falha, setFalha] = useState<string>();
  const [carregando, setCarregando] = useState(false);
  const idDoCorpo = useId();

  async function confirmar() {
    if (carregando) return;
    setFalha(undefined);
    setCarregando(true);
    try {
      const resultado = await executar();
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
      {falha && <Banner tipo="erro">{falha}</Banner>}
      <div className="acoes">
        <button type="button" className="btn sec" onClick={aoFechar} data-foco-inicial>
          Cancelar
        </button>
        <button type="button" className={perigo ? 'btn danger' : 'btn pri'} aria-busy={carregando || undefined} onClick={() => void confirmar()}>
          {carregando && <span className="spin" aria-hidden="true" />}
          {rotuloDaAcao}
        </button>
      </div>
    </Dialogo>
  );
}
