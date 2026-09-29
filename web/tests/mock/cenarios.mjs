// Qual resposta DO CONTRATO o mock devolve para cada codigo ou token.
// Nada aqui e corpo escrito a mao: `exemplo` e o nome de um `example` de
// api/openapi.yaml, `slug` e um tipo de `x-problem-types`, e `sobrescrever` so
// aceita campo que existe no schema da resposta (o mock confere na subida).
//
// Os codigos tem 16 caracteres, como o contrato define (TagCode).

export const CODIGOS = {
  perdido: '7K3M9QXA2HPV4R8T',
  semFoto: 'SEMF0T0NA0PERD1D',
  jaAvisou: 'JAAV1S0U00000000',
  malformado: '7K3M-9QXA-2HPV-4R',
  inexistente: 'NA0EX1STE0000000',
  desativada: 'DESAT1VADA000000',
  muitasTentativas: 'MU1TASTENTAT1VAS',
  lento: 'LENT0000000000AB',
  foraDoAr: 'F0RAD0AR00000000',
  tipoInesperado: 'T1P01NESPERAD000',
  avisoLento: 'AV1S0LENT0000000',
  avisoNoLimite: 'AV1S0L1M1TE00000',
  avisoDesativada: 'AV1S0DESAT1VADA0',
};

export const TOKENS = {
  emailValido: 'token-email-valido-0000000000',
  emailVencido: 'token-email-vencido-000000000',
  emailLento: 'token-email-lento-00000000000',
  emailLimite: 'token-email-limite-0000000000',
  senhaValido: 'token-senha-valido-0000000000',
  senhaVencido: 'token-senha-vencido-000000000',
  senhaLento: 'token-senha-lento-00000000000',
};

export const SENHAS = {
  vazada: 'senha-que-vazou-1234',
  parecida: 'nome-do-tutor-12345',
  lenta: 'senha-que-demora-123',
  boa: 'uma frase que so eu sei',
};

const perdido = { status: 200, exemplo: 'perdido', sobrescrever: { pet: { care_notes: 'É medroso, não corra atrás.' } } };
const avisado = { status: 201, sobrescrever: { pet_display_name: 'Thor', owner_notified: true } };
const LENTO = 3000; // acima dos 2 s de tempo limite do site (ADR-0028, item 3)

export const CENARIOS = {
  resolveTagCode: {
    [CODIGOS.perdido]: perdido,
    [CODIGOS.semFoto]: { status: 200, exemplo: 'perdido', sobrescrever: { pet: { photo_url: null, care_notes: 'É medroso, não corra atrás.' }, lost: { is_lost: false, since: null } } },
    [CODIGOS.jaAvisou]: { status: 200, exemplo: 'perdido', sobrescrever: { already_notified: true } },
    [CODIGOS.malformado]: { slug: 'tag-code-malformed' },
    [CODIGOS.inexistente]: { slug: 'tag-code-not-found' },
    [CODIGOS.desativada]: { slug: 'tag-revoked', exemplo: 'revogada' },
    [CODIGOS.muitasTentativas]: { slug: 'rate-limited', cabecalhos: { 'Retry-After': '600' } },
    [CODIGOS.lento]: { ...perdido, atrasoMs: LENTO },
    [CODIGOS.foraDoAr]: { slug: 'internal' },
    [CODIGOS.tipoInesperado]: { slug: 'forbidden', foraDaOperacao: true },
    [CODIGOS.avisoLento]: perdido,
    [CODIGOS.avisoNoLimite]: perdido,
    [CODIGOS.avisoDesativada]: perdido,
  },
  createFoundReportFromTag: {
    '*': avisado,
    [CODIGOS.avisoLento]: { ...avisado, atrasoMs: LENTO },
    [CODIGOS.avisoNoLimite]: { slug: 'rate-limited', cabecalhos: { 'Retry-After': '3600' } },
    [CODIGOS.avisoDesativada]: { slug: 'tag-revoked' },
    [CODIGOS.malformado]: { slug: 'tag-code-malformed' },
  },
  confirmEmailVerification: {
    [TOKENS.emailValido]: { status: 200 },
    [TOKENS.emailVencido]: { slug: 'verification-token-expired' },
    [TOKENS.emailLento]: { status: 200, atrasoMs: LENTO },
    [TOKENS.emailLimite]: { slug: 'rate-limited', foraDaOperacao: true, cabecalhos: { 'Retry-After': '120' } },
  },
  checkPasswordResetToken: {
    [TOKENS.senhaValido]: { status: 200 },
    [TOKENS.senhaVencido]: { slug: 'verification-token-expired' },
    [TOKENS.senhaLento]: { status: 200, atrasoMs: LENTO },
  },
  confirmPasswordReset: {
    [`${TOKENS.senhaValido}|${SENHAS.vazada}`]: { slug: 'weak-password', sobrescrever: { errors: [{ field: 'new_password', code: 'breached' }] } },
    [`${TOKENS.senhaValido}|${SENHAS.parecida}`]: { slug: 'weak-password', sobrescrever: { errors: [{ field: 'new_password', code: 'similar_to_identity' }] } },
    [`${TOKENS.senhaValido}|${SENHAS.lenta}`]: { status: 204, atrasoMs: LENTO },
    [TOKENS.senhaValido]: { status: 204 },
    [TOKENS.senhaVencido]: { slug: 'verification-token-expired' },
  },
};
