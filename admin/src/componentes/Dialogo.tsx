import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface PropsDoDialogo {
  titulo: ReactNode;
  children: ReactNode;
  /** Esc e o retorno de foco. Ausente, Esc nao fecha. */
  aoFechar?: (() => void) | undefined;
  /** `alertdialog` para confirmacao (secao 25.4.1); `dialog` para formulario simples. */
  papel?: 'dialog' | 'alertdialog';
  largo?: boolean;
  /** Id do texto que descreve a consequencia, para `aria-describedby`. */
  descricaoId?: string;
}

/**
 * O dialogo base do backoffice: modal, foco preso, Esc fecha, foco volta a
 * quem o abriu (WAI-ARIA APG, Dialog Modal). O foco inicial vai para o
 * elemento marcado com `data-foco-inicial`, ou para o primeiro focavel.
 */
export function Dialogo({ titulo, children, aoFechar, papel = 'alertdialog', largo = false, descricaoId }: PropsDoDialogo) {
  const idDoTitulo = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const aoFecharRef = useRef(aoFechar);
  useLayoutEffect(() => {
    aoFecharRef.current = aoFechar;
  });

  useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = caixa.current;
    if (!el) return;
    const inicial = el.querySelector<HTMLElement>('[data-foco-inicial]') ?? el.querySelector<HTMLElement>(FOCAVEIS);
    (inicial ?? el).focus();

    function aoTeclar(evento: KeyboardEvent) {
      if (!el) return;
      if (evento.key === 'Escape' && aoFecharRef.current) {
        evento.preventDefault();
        aoFecharRef.current();
        return;
      }
      if (evento.key !== 'Tab') return;
      const focaveis = [...el.querySelectorAll<HTMLElement>(FOCAVEIS)];
      if (focaveis.length === 0) {
        evento.preventDefault();
        return;
      }
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo?.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro?.focus();
      }
    }
    // Foco que escapa (clique fora, leitor de tela) volta para dentro.
    function aoFocar(evento: FocusEvent) {
      if (el && evento.target instanceof Node && !el.contains(evento.target)) {
        (el.querySelector<HTMLElement>(FOCAVEIS) ?? el).focus();
      }
    }
    document.addEventListener('keydown', aoTeclar);
    document.addEventListener('focusin', aoFocar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.removeEventListener('focusin', aoFocar);
      if (anterior && document.body.contains(anterior)) anterior.focus();
    };
  }, []);

  return createPortal(
    <div className="scrim">
      <div
        ref={caixa}
        className={largo ? 'dialog lg' : 'dialog'}
        role={papel}
        aria-modal="true"
        aria-labelledby={idDoTitulo}
        {...(descricaoId ? { 'aria-describedby': descricaoId } : {})}
        tabIndex={-1}
      >
        <h2 className="t-title-lg" id={idDoTitulo}>
          {titulo}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
