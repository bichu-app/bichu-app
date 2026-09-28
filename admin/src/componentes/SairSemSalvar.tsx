import { useEffect, type RefObject } from 'react';
import { useBlocker } from 'react-router';

import { saidaDoPainel } from '../sessao/sessao.ts';
import { Dialogo } from './Dialogo.tsx';

/**
 * 3.15: formulario sujo pede confirmacao antes de sair (secao 25.5). Cobre a
 * navegacao do painel (link, voltar) e o fechamento da aba.
 */
export function SairSemSalvar({ sujo, liberado }: { sujo: boolean; liberado: RefObject<boolean> }) {
  // `liberado` e ref: quem acabou de salvar navega no mesmo tique, antes de o
  // estado `sujo` chegar a este componente.
  const bloqueio = useBlocker(
    ({ currentLocation, nextLocation }) => sujo && !liberado.current && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!sujo) return;
    const aoSair = (e: BeforeUnloadEvent) => {
      if (saidaDoPainel.liberada) return;
      e.preventDefault();
    };
    window.addEventListener('beforeunload', aoSair);
    return () => window.removeEventListener('beforeunload', aoSair);
  }, [sujo]);

  if (bloqueio.state !== 'blocked') return null;
  return (
    <Dialogo titulo="Sair sem salvar?" aoFechar={() => bloqueio.reset()}>
      <p className="t-body c-sec">O que você mudou neste formulário vai se perder.</p>
      <div className="acoes">
        <button type="button" className="btn sec" data-foco-inicial onClick={() => bloqueio.reset()}>
          Continuar editando
        </button>
        <button type="button" className="btn danger" onClick={() => bloqueio.proceed()}>
          Sair sem salvar
        </button>
      </div>
    </Dialogo>
  );
}
