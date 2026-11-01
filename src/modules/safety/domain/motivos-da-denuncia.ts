import type { ProblemFieldError } from '../../../shared/http/problem.js';

/** Denúncia de PERFIL: sobre quem a pessoa é. */
export const MOTIVOS_DE_PERFIL = [
  'impersonation',
  'harassment',
  'pet_ransom_scam',
  'minor_suspected',
  'other',
] as const;

/** Denúncia de FOTO: seis, e as duas exclusivas são de imagem. */
export const MOTIVOS_DE_FOTO = [
  'nudity_or_sexual',
  'child_at_risk',
  'animal_violence',
  'i_am_in_it',
  'impersonation',
  'other',
] as const;

/** Denúncia de PUBLICAÇÃO: cinco, e a terceira é só deste produto. */
export const MOTIVOS_DE_PUBLICACAO = [
  'offensive_or_discriminatory',
  'scam_or_animal_sale',
  'false_lost_pet_info',
  'spam_or_repetition',
  'other',
] as const;

export type MotivoDePerfil = (typeof MOTIVOS_DE_PERFIL)[number];
export type MotivoDeFoto = (typeof MOTIVOS_DE_FOTO)[number];
export type MotivoDePublicacao = (typeof MOTIVOS_DE_PUBLICACAO)[number];

/** Os três alvos que esta fatia acrescenta à fila do administrador. */
export const ALVOS_DA_DENUNCIA = ['profile', 'photo', 'publication'] as const;
export type AlvoDaDenuncia = (typeof ALVOS_DA_DENUNCIA)[number];

const LISTA_POR_ALVO: Record<AlvoDaDenuncia, readonly string[]> = {
  profile: MOTIVOS_DE_PERFIL,
  photo: MOTIVOS_DE_FOTO,
  publication: MOTIVOS_DE_PUBLICACAO,
};

/** O teto de `detail`, igual ao de `conversation_reports` e da avaliação. */
export const TAMANHO_MAXIMO_DO_RELATO = 1000;

export interface DenunciaValidada {
  readonly motivo: string;
  readonly relato: string | null;
}

/** Valida o corpo de uma denúncia, para qualquer dos três alvos. */
export function validarDenuncia(
  alvo: AlvoDaDenuncia,
  corpo: unknown,
): { denuncia?: DenunciaValidada; erros: readonly ProblemFieldError[] } {
  const erros: ProblemFieldError[] = [];
  const c = (corpo ?? {}) as Record<string, unknown>;
  const lista = LISTA_POR_ALVO[alvo];

  const motivoCru = c['reason'];
  let motivo: string | undefined;
  if (typeof motivoCru !== 'string' || !lista.includes(motivoCru)) {
    erros.push({ field: 'reason', code: 'required', message: 'Diga o motivo da denúncia.' });
  } else {
    motivo = motivoCru;
  }

  const relatoCru = c['detail'];
  let relato: string | null = null;
  if (relatoCru !== undefined && relatoCru !== null) {
    if (typeof relatoCru !== 'string') {
      erros.push({ field: 'detail', code: 'invalid', message: 'O relato precisa ser texto.' });
    } else {
      const aparado = relatoCru.trim();
      if (aparado === '') relato = null;
      else if (aparado.length > TAMANHO_MAXIMO_DO_RELATO) {
        erros.push({
          field: 'detail',
          code: 'too_long',
          message: `O relato vai até ${String(TAMANHO_MAXIMO_DO_RELATO)} caracteres.`,
        });
      } else if (/[<>]/.test(aparado)) {
        erros.push({ field: 'detail', code: 'html_not_allowed', message: 'Escreva sem os sinais < e >.' });
      } else relato = aparado;
    }
  }

  if (erros.length > 0 || motivo === undefined) return { erros };
  return { denuncia: { motivo, relato }, erros: [] };
}
