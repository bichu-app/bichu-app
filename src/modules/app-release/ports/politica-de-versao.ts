/** As plataformas sobre as quais existe politica. */
export type PlataformaDoApp = 'android' | 'ios';

export const PLATAFORMAS_DO_APP: readonly PlataformaDoApp[] = ['android', 'ios'];

/** A politica de uma plataforma, como ela esta no banco. */
export interface PoliticaDeVersao {
  readonly minimumVersion: string | null;
  readonly recommendedVersion: string | null;
  readonly storeUrl: string | null;
}

export interface LeituraDaPoliticaDeVersao {
  /** A politica da plataforma, ou `undefined` quando nao ha linha. */
  politicaDe(plataforma: PlataformaDoApp): Promise<PoliticaDeVersao | undefined>;
}
