// Telas de /verificar-email e /redefinir-senha, decididas pelo `type`.
// "GET nunca executa" (ADR-0028, item 2; SEC-005): o GET mostra a pagina e o
// botao, e a acao acontece no POST do formulario.
import type { Resultado } from './resultado.ts';

type Comum =
  | { tela: 'expirado'; http: 400 | 410 }
  | { tela: 'espere'; http: 429; esperaSegundos: number | null }
  | { tela: 'fora-do-ar'; http: 503 }
  | { tela: 'erro'; http: number; correlationId: string | null };

function comum(r: Extract<Resultado<unknown>, { tipo: 'problema' }>): Comum {
  switch (r.slug) {
    // Um texto so para vencido, usado e invalido (UX 7.6.1): distinguir contaria
    // a um estranho se aquele token existiu.
    case 'verification-token-expired':
      return { tela: 'expirado', http: 410 };
    case 'rate-limited':
      return { tela: 'espere', http: 429, esperaSegundos: r.esperaSegundos };
    case 'internal':
      return { tela: 'fora-do-ar', http: 503 };
    default:
      return { tela: 'erro', http: r.status >= 400 && r.status < 600 ? r.status : 502, correlationId: r.problema?.correlation_id ?? null };
  }
}

// ---------------------------------------------------------------- e-mail

export type TelaDoEmail =
  | { tela: 'confirmar'; http: 200 }
  | { tela: 'confirmado'; http: 200 }
  | { tela: 'nao-confirmou'; http: 503 }
  | Comum;

/** POST /v1/auth/email-verification/confirm (confirmEmailVerification). */
export function telaAoConfirmarEmail(r: Resultado<unknown>): TelaDoEmail {
  if (r.tipo === 'ok') return { tela: 'confirmado', http: 200 };
  if (r.tipo === 'falha') return { tela: 'nao-confirmou', http: 503 };
  if (r.slug === null && r.problema === null && r.status >= 500) return { tela: 'nao-confirmou', http: 503 };
  // Token fora do formato (400 validation-failed) e o mesmo link invalido.
  if (r.slug === 'validation-failed') return { tela: 'expirado', http: 400 };
  return comum(r);
}

// ---------------------------------------------------------------- senha

/** Codigos de `errors[].code` do 422 `weak-password` e do 400 de senha (UX 23.7). */
export type CodigoDeSenha = 'too_short' | 'too_long' | 'blank' | 'similar_to_identity' | 'breached' | 'desconhecido';

export type TelaDaSenha =
  | { tela: 'formulario'; http: 200 }
  | { tela: 'formulario-com-erro'; http: 400 | 422; codigo: CodigoDeSenha }
  | { tela: 'nao-salvou'; http: 503 }
  | { tela: 'nao-conferiu'; http: 503 }
  | { tela: 'alterada'; http: 200 }
  | Comum;

/** GET /v1/public/password-reset/{token} (checkPasswordResetToken). */
export function telaAoConferirLink(r: Resultado<unknown>): TelaDaSenha {
  if (r.tipo === 'ok') return { tela: 'formulario', http: 200 };
  if (r.tipo === 'falha') return { tela: 'nao-conferiu', http: 503 };
  if (r.slug === null && r.problema === null && r.status >= 500) return { tela: 'nao-conferiu', http: 503 };
  return comum(r);
}

const CODIGOS: readonly CodigoDeSenha[] = ['too_short', 'too_long', 'blank', 'similar_to_identity', 'breached'];

function codigoDaSenha(erros: unknown): CodigoDeSenha {
  if (!Array.isArray(erros)) return 'desconhecido';
  const doCampo = erros.find((e) => e && typeof e === 'object' && (e as { field?: unknown }).field === 'new_password')
    ?? erros.find((e) => e && typeof e === 'object' && typeof (e as { code?: unknown }).code === 'string');
  const codigo = (doCampo as { code?: unknown } | undefined)?.code;
  return typeof codigo === 'string' && (CODIGOS as readonly string[]).includes(codigo) ? (codigo as CodigoDeSenha) : 'desconhecido';
}

/** POST /v1/auth/password-reset/confirm (confirmPasswordReset). */
export function telaAoSalvarSenha(r: Resultado<unknown>): TelaDaSenha {
  if (r.tipo === 'ok') return { tela: 'alterada', http: 200 };
  // "Nunca enfileirar este POST" (UX C.5): a falha diz que nada mudou, e a pessoa tenta de novo.
  if (r.tipo === 'falha') return { tela: 'nao-salvou', http: 503 };
  if (r.slug === null && r.problema === null && r.status >= 500) return { tela: 'nao-salvou', http: 503 };
  if (r.slug === 'weak-password') return { tela: 'formulario-com-erro', http: 422, codigo: codigoDaSenha(r.problema?.errors) };
  if (r.slug === 'validation-failed') {
    const erros = r.problema?.errors;
    const doToken = Array.isArray(erros) && erros.some((e) => e?.field === 'token');
    if (doToken) return { tela: 'expirado', http: 400 };
    return { tela: 'formulario-com-erro', http: 400, codigo: codigoDaSenha(erros) };
  }
  return comum(r);
}
