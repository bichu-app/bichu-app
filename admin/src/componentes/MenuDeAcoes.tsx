import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { Icone, type NomeDoIcone } from './Icone.tsx';

export interface ItemDoMenu {
  rotulo: string;
  icone: NomeDoIcone;
  aoEscolher: () => void;
  perigo?: boolean;
}

/**
 * Botao de menu (WAI-ARIA APG, Menu Button): Enter, Espaco e seta para baixo
 * abrem com o foco no primeiro item; setas percorrem; Esc fecha e devolve o foco
 * ao botao; clique fora fecha.
 */
export function MenuDeAcoes({
  rotuloDoBotao,
  itens,
  conteudoDoBotao,
  classeDoBotao = 'ibtn',
  classeDoMenu = 'menu',
  titulo,
}: {
  rotuloDoBotao: string;
  itens: ItemDoMenu[];
  conteudoDoBotao?: ReactNode;
  classeDoBotao?: string;
  classeDoMenu?: string;
  titulo?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const idDoMenu = useId();
  const botao = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!aberto) return;
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    function fora(evento: MouseEvent) {
      const alvo = evento.target as Node;
      if (!menu.current?.contains(alvo) && !botao.current?.contains(alvo)) setAberto(false);
    }
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  function fechar(devolverFoco: boolean) {
    setAberto(false);
    if (devolverFoco) botao.current?.focus();
  }

  function aoTeclarNoMenu(evento: React.KeyboardEvent) {
    const itensDoMenu = [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const atual = itensDoMenu.indexOf(document.activeElement as HTMLButtonElement);
    if (evento.key === 'Escape') {
      evento.preventDefault();
      evento.stopPropagation();
      fechar(true);
    } else if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      itensDoMenu[(atual + 1) % itensDoMenu.length]?.focus();
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      itensDoMenu[(atual - 1 + itensDoMenu.length) % itensDoMenu.length]?.focus();
    } else if (evento.key === 'Home') {
      evento.preventDefault();
      itensDoMenu[0]?.focus();
    } else if (evento.key === 'End') {
      evento.preventDefault();
      itensDoMenu[itensDoMenu.length - 1]?.focus();
    } else if (evento.key === 'Tab') {
      fechar(false);
    }
  }

  return (
    <>
      <button
        ref={botao}
        type="button"
        className={classeDoBotao}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? idDoMenu : undefined}
        aria-label={rotuloDoBotao}
        {...(titulo ? { title: titulo } : {})}
        onClick={() => setAberto((a) => !a)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setAberto(true);
          }
        }}
      >
        {conteudoDoBotao ?? <Icone nome="more" />}
      </button>
      {aberto && (
        <ul ref={menu} id={idDoMenu} className={classeDoMenu} role="menu" aria-label={rotuloDoBotao} onKeyDown={aoTeclarNoMenu}>
          {itens.map((item) => (
            <li key={item.rotulo} role="none">
              <button
                type="button"
                role="menuitem"
                className={item.perigo ? 'del' : undefined}
                onClick={() => {
                  fechar(true);
                  item.aoEscolher();
                }}
              >
                <Icone nome={item.icone} />
                {item.rotulo}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
