// GERADO por src/tools/gerar-tipos-de-problema.mjs a partir de api/openapi.yaml.
// NÃO EDITE À MÃO: a próxima geração desfaz a edição em silêncio.
//
// `type` é sempre `https://{domínio}/problems/<slug>` e o cliente decide por
// ele, nunca pelo texto. A lista é fechada no contrato: tipo novo entra lá
// antes de existir aqui.
//
// O número ao lado é o **único** status HTTP com que o tipo pode sair.

export const STATUS_DO_PROBLEMA = {
  'validation-failed':              400,
  'unauthenticated':                401, // sem token, token ausente ou assinatura invalida
  'invalid-credentials':            401, // e-mail ou senha nao conferem. Corpo IDENTICO para conta inexistente e senha errada
  'token-expired':                  401, // token de acesso, de renovacao ou de uso unico expirado, ja usado ou revogado
  'reauthentication-required':      401, // a sessao continua valida; falta a janela de reautenticacao
  'forbidden':                      403, // SOMENTE 403. Recurso de outro tutor responde 404, nao 403
  'not-found':                      404,
  'email-already-registered':       409,
  'slug-taken':                     409,
  'pet-already-lost':               409,
  'pet-limit-reached':              409,
  'contact-channel-unverified':     409,
  'pet-photo-missing':              409,
  'transfer-not-for-this-account':  409,
  'conversation-closed':            410,
  'tag-revoked':                    410, // tag revogada e SEMPRE 410 com `next_action`, nunca 404 (ADR-0004)
  'tag-code-not-found':             404,
  'tag-code-malformed':             400,
  'weak-password':                  422,
  'rate-limited':                   429,
  'internal':                       500,
} as const;

/** União fechada dos 21 tipos declarados no contrato. */
export type ProblemType = keyof typeof STATUS_DO_PROBLEMA;

/** O status é consequência do tipo, nunca um argumento de quem chama. */
export type StatusDoProblema<T extends ProblemType> = (typeof STATUS_DO_PROBLEMA)[T];
