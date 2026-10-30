/** O que NUNCA pode chegar ao denunciado, por nenhum caminho. */
export const AVISOS_PROIBIDOS = [
  'aviso ao denunciado',
  'notificar o denunciado',
  'notify_reported',
  'reported_user_notified',
  'notified_at',
] as const;

/** O que NUNCA pode ser prometido a quem denuncia. */
export const PRAZOS_PROIBIDOS = [
  'sla',
  'prazo de resposta',
  'responderemos em',
  'review_deadline',
  'expected_resolution_at',
] as const;

/** O que o denunciante vê, e é tudo o que ele vê. */
export const O_QUE_O_DENUNCIANTE_RECEBE = { status: 'accepted' } as const;
