/**
 * O nivel de verificacao de uma entidade, DERIVADO das verificacoes aprovadas.
 *
 * `professionals.verification_level` e coluna derivada, e a migracao de 21/09 o
 * diz em `COMMENT`: "NUNCA escrito a mao por rota de escrita de perfil: se o
 * perfil pudesse declarar o proprio nivel, a verificacao seria decorativa".
 * Esta funcao e a regra que a coluna espelha, e ela mora no dominio porque
 * precisa valer em qualquer caminho de escrita que venha a existir -- painel de
 * moderacao, importacao de parceria ou a massa de qa.
 *
 * ## A regra, e o porque de cada linha
 *
 * As quatro evidencias nao provam a mesma coisa, e o produto se recusa a dizer
 * so "verificado" (BICHUS-165):
 *
 * - `crmv`, `cnpj` e `document` sao **documento**: os tres foram conferidos
 *   contra um registro de fora do Bichu. Dao `document_verified`.
 * - `phone_callback` e **contato**: prova que alguem atende naquele numero, e
 *   nao prova quem e. Da `contact_verified`, que e menos -- e dizer que e mais
 *   seria o Bichu assumindo uma responsabilidade que nao sustenta.
 *
 * **So verificacao `approved` conta.** `pending` e a fila de moderacao e
 * `rejected` e um "nao" ja dado; contar qualquer uma das duas transformaria
 * "pedi para ser verificado" em "fui verificado", que e exatamente o engano que
 * o selo existe para nao permitir.
 *
 * Sem nenhuma aprovada, `none` -- e `none` e um resultado publicavel, nao
 * ausencia de resultado: passeador, hospedagem, tosa e adestramento nao tem
 * conselho nem registro obrigatorio.
 */

/**
 * As quatro evidencias de `entity_verifications.evidence_kind`, **espelhadas**
 * em `src/shared/db/schema.ts`. O dominio declara o vocabulario; o modelo de
 * persistencia o repete. Importar o esquema aqui faria a regra de negocio
 * depender do banco, que e o que a pureza de dominio da secao 6 proibe.
 */
export type TipoDeEvidencia = 'crmv' | 'cnpj' | 'phone_callback' | 'document';

export type DecisaoDaVerificacao = 'pending' | 'approved' | 'rejected';

/** O que foi verificado, e nao um selo generico (BICHUS-165). */
export type NivelDeVerificacao = 'none' | 'contact_verified' | 'document_verified';

export interface VerificacaoDaEntidade {
  readonly evidenceKind: TipoDeEvidencia;
  readonly decision: DecisaoDaVerificacao;
}

/**
 * As evidencias em ordem decrescente de forca, escrita por EXTENSO.
 *
 * Por extenso e nao derivada porque "tudo o que nao for `phone_callback` vale
 * documento" faria a proxima evidencia nova nascer valendo documento sem
 * ninguem decidir -- e a proxima evidencia nova e exatamente o momento em que
 * alguem precisa decidir.
 */
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

/**
 * Os tipos de prova aprovados, sem repeticao e em ordem de forca.
 *
 * E ele que sustenta o selo na tela: dizer "verificado" sem dizer O QUE foi
 * verificado e o que o ADR-0011 proibe. Vazio quando o nivel e `none`, e o
 * vazio e coerente por construcao -- os dois saem da mesma lista.
 */
export function evidenciasAprovadas(
  verificacoes: readonly VerificacaoDaEntidade[],
): TipoDeEvidencia[] {
  const aprovadas = new Set(
    verificacoes.filter((uma) => uma.decision === 'approved').map((uma) => uma.evidenceKind),
  );
  return EVIDENCIAS_POR_FORCA.filter((tipo) => aprovadas.has(tipo));
}
