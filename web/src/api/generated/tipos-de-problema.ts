// GERADO por web/scripts/gerar-tipos-da-api.mjs a partir de `x-problem-types` de
// api/openapi.yaml. NAO EDITE: rode `npm run generate:api` de dentro de web/.
//
// A tela decide por `type` (o slug depois de /problems/), nunca pelo texto e nunca
// so pelo status. Esta e a lista fechada, com o unico status de cada tipo.
export const TIPOS_DE_PROBLEMA = {
  "validation-failed": 400,
  "unauthenticated": 401,
  "invalid-credentials": 401,
  "token-expired": 401,
  "reauthentication-required": 401,
  "forbidden": 403,
  "not-found": 404,
  "email-already-registered": 409,
  "slug-taken": 409,
  "pet-already-lost": 409,
  "open-case-limit-reached": 409,
  "pet-limit-reached": 409,
  "tag-limit-reached": 409,
  "contact-channel-unverified": 409,
  "pet-photo-missing": 409,
  "transfer-not-for-this-account": 409,
  "transfer-already-in-progress": 409,
  "transfer-already-effective": 409,
  "conversation-closed": 410,
  "lost-case-closed": 410,
  "tag-revoked": 410,
  "tag-code-not-found": 404,
  "tag-code-malformed": 400,
  "unsupported-media-type": 415,
  "verification-token-expired": 410,
  "upload-not-received": 409,
  "weak-password": 422,
  "rate-limited": 429,
  "internal": 500,
} as const;

export type TipoDeProblema = keyof typeof TIPOS_DE_PROBLEMA;
