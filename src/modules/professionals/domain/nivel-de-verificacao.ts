/**
 * As quatro evidencias de `entity_verifications.evidence_kind`, **espelhadas** em
 * `src/shared/db/schema.ts`.
 */
export type TipoDeEvidencia = 'crmv' | 'cnpj' | 'phone_callback' | 'document';

export type DecisaoDaVerificacao = 'pending' | 'approved' | 'rejected';

/** O que foi verificado, e nao um selo generico (BICHUS-165). */
export type NivelDeVerificacao = 'none' | 'contact_verified' | 'document_verified';

export interface VerificacaoDaEntidade {
  readonly evidenceKind: TipoDeEvidencia;
  readonly decision: DecisaoDaVerificacao;
}

/** As evidencias em ordem decrescente de forca, escrita por EXTENSO. */
export const EVIDENCIAS_POR_FORCA: readonly TipoDeEvidencia[] = [
  'crmv',
  'cnpj',
  'document',
  'phone_callback',
];

const EVIDENCIAS_DE_DOCUMENTO: ReadonlySet<TipoDeEvidencia> = new Set<TipoDeEvidencia>([
  'crmv',
  'cnpj',
  'document',
]);

const EVIDENCIAS_DE_CONTATO: ReadonlySet<TipoDeEvidencia> = new Set<TipoDeEvidencia>([
  'phone_callback',
]);

export function nivelDerivado(verificacoes: readonly VerificacaoDaEntidade[]): NivelDeVerificacao {
  const aprovadas = verificacoes.filter((uma) => uma.decision === 'approved');
  if (aprovadas.some((uma) => EVIDENCIAS_DE_DOCUMENTO.has(uma.evidenceKind))) {
    return 'document_verified';
  }
  if (aprovadas.some((uma) => EVIDENCIAS_DE_CONTATO.has(uma.evidenceKind))) {
    return 'contact_verified';
  }
  return 'none';
}

/** Os tipos de prova aprovados, sem repeticao e em ordem de forca. */
export function evidenciasAprovadas(
  verificacoes: readonly VerificacaoDaEntidade[],
): TipoDeEvidencia[] {
  const aprovadas = new Set(
    verificacoes.filter((uma) => uma.decision === 'approved').map((uma) => uma.evidenceKind),
  );
  return EVIDENCIAS_POR_FORCA.filter((tipo) => aprovadas.has(tipo));
}
