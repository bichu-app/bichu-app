import type { ReactElement } from 'react';

import { LOCKUP, LOGO_HORIZONTAL, SIMBOLO_REDUZIDO } from './marca.g.ts';

/**
 * Os icones provisorios do backoffice (06-design-system.md secao 25.7: saem
 * quando a biblioteca Material Symbols entrar). Traco em `currentColor`, entao
 * a cor e sempre a do texto em volta, que vem de token.
 */
const TRACOS = {
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </>
  ),
  expand: <path d="M6 9l6 6 6-6" />,
  add: <path d="M12 5v14M5 12h14" />,
  edit: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
    </>
  ),
  delete: (
    <>
      <path d="M5 7h14" />
      <path d="M10 7V4h4v3" />
      <path d="M7 7l1 13h8l1-13" />
    </>
  ),
  logout: (
    <>
      <path d="M10 4H5v16h5" />
      <path d="M14 8l4 4-4 4" />
      <path d="M18 12H9" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 17l6-6 5 5 3-3 4 4" />
      <circle cx="15.5" cy="9" r="1.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v5h-5" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  schedule: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  storefront: (
    <>
      <path d="M4 10h16" />
      <path d="M5 10v9h14v-9" />
      <path d="M4 10l2-5h12l2 5" />
      <path d="M10 19v-5h4v5" />
    </>
  ),
  groups: (
    <>
      <circle cx="8" cy="9" r="2.5" />
      <circle cx="16" cy="9" r="2.5" />
      <path d="M3 18c.5-3 2.5-4.5 5-4.5s4.5 1.5 5 4.5" />
      <path d="M13.2 14.6c.8-.7 1.7-1.1 2.8-1.1 2.5 0 4.5 1.5 5 4.5" />
    </>
  ),
  more: (
    <>
      <circle cx="12" cy="5.5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="18.5" r="1" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l3 3 5-6" />
    </>
  ),
  tick: <path d="M5 12l5 5 9-10" />,
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16.5v.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  warning: (
    <>
      <path d="M12 4l9 16H3L12 4z" />
      <path d="M12 10v4M12 17v.5" />
    </>
  ),
  open: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M18 14v5H5V6h5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12C3.5 10 7 6 12 6s8.5 4 9.5 6c-1 2-4.5 6-9.5 6s-8.5-4-9.5-6z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  hide: (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c5 0 8.5 4 9.5 6-.4.8-1.2 2-2.3 3.1M6.6 7.6C4.6 8.9 3.1 10.8 2.5 12c1 2 4.5 6 9.5 6 1.5 0 2.9-.4 4.1-.9" />
    </>
  ),
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
} satisfies Record<string, ReactElement>;

export type NomeDoIcone = keyof typeof TRACOS;

interface PropsDoIcone {
  nome: NomeDoIcone;
  tamanho?: 's16' | 's20';
  espelhado?: boolean;
}

/** Icone decorativo: sempre `aria-hidden`, o nome acessivel e do controle que o contem. */
export function Icone({ nome, tamanho, espelhado = false }: PropsDoIcone) {
  const classes = ['i', tamanho, espelhado ? 'espelhado' : undefined].filter(Boolean).join(' ');
  return (
    <svg className={classes} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {TRACOS[nome]}
    </svg>
  );
}

type Vetor = { readonly viewBox: string; readonly camadas: readonly { readonly classe: string; readonly d: string }[] };

function Vetor({ vetor, classe, rotulo }: { vetor: Vetor; classe: string; rotulo: string }) {
  return (
    <svg className={classe} viewBox={vetor.viewBox} role="img" aria-label={rotulo}>
      {vetor.camadas.map((c) => (
        <path key={c.classe} className={c.classe} fillRule="evenodd" d={c.d} />
      ))}
    </svg>
  );
}

/** Logotipo horizontal, usado no cartao do login. */
export function LogoHorizontal() {
  return <Vetor vetor={LOGO_HORIZONTAL} classe="logo-h" rotulo="Bichu, a rede dos pets" />;
}

/** Lockup sem descritor e simbolo reduzido: a navegacao troca um pelo outro no trilho. */
export function MarcaDaNavegacao() {
  return (
    <>
      <Vetor vetor={LOCKUP} classe="logo-lockup" rotulo="Bichu" />
      <Vetor vetor={SIMBOLO_REDUZIDO} classe="logo-rail" rotulo="Bichu" />
    </>
  );
}
