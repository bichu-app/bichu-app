/** As paginas publicas do site sobre as quais existe interruptor. */
export type PaginaPublica = 'lost_case' | 'poster' | 'network_event';

export const PAGINAS_PUBLICAS: readonly PaginaPublica[] = [
  'lost_case',
  'poster',
  'network_event',
];

export interface DisponibilidadeDaPagina {
  /** A pagina existe e serve 200 com as marcas de Open Graph? */
  estaPublicada(pagina: PaginaPublica): Promise<boolean>;
}

/** A disponibilidade de quem nao tem banco: tudo escondido. */
export const paginaNenhumaPublicada: DisponibilidadeDaPagina = {
  estaPublicada: () => Promise.resolve(false),
};
