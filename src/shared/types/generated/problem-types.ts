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
  'pet-already-lost':               409, // este pet ja tem caso aberto. O banco impoe (indice unico parcial), e o tipo existe para a tela dizer 'voce ja marcou' em vez de 'erro'
  'open-case-limit-reached':        409, // teto de 3 casos ABERTOS SIMULTANEOS por conta (BICHUS-21 criterio 8). Separado de `pet-already-lost`: um diz 'este pet ja esta perdido' e o outro 'voce ja tem tres animais perdidos'. A saida e diferente -- no primeiro a pessoa abre o caso que ja existe, no segundo ela precisa encerrar um. Alem de produto, e privacidade: a lista publica mostra bairro e data, e sem teto uma conta entregaria uma SERIE de pontos no tempo e no espaco da mesma pessoa
  'pet-limit-reached':              409, // teto de pets DA CONTA
  'tag-limit-reached':              409, // teto de tags ativas DO PET (ADR-0004). Separado de `pet-limit-reached` porque sao dois tetos diferentes: um app que decida por `type` tratava o teto de plaquinhas como limite de pets da conta, e oferecia a saida errada
  'contact-channel-unverified':     409,
  'pet-photo-missing':              409,
  'transfer-not-for-this-account':  409,
  'conversation-closed':            410,
  'tag-revoked':                    410, // tag revogada e SEMPRE 410 com `next_action`, nunca 404 (ADR-0004)
  'tag-code-not-found':             404,
  'tag-code-malformed':             400,
  'unsupported-media-type':         415, // quatro operacoes ja respondiam 415 e nenhum slug significava isso: o corpo do problema saia com um `type` fora desta lista fechada, que e exatamente o que ela existe para impedir
  'verification-token-expired':     410, // token de USO UNICO (verificacao de e-mail, redefinicao de senha) expirado, ja usado ou inexistente. Separado de `token-expired`, que e 401: as duas operacoes declaram 410 e o slug de 401 nao podia responder por elas. Os tres casos sao a MESMA resposta de proposito -- distinguir contaria a um estranho se aquele token existiu
  'upload-not-received':            409, // o cliente confirmou um envio cujos bytes nao chegaram ao armazenamento. Sem este estado, a foto nascia `processing` para sempre: um cartao de pet carregando eternamente, que ninguem sabe explicar
  'weak-password':                  422,
  'rate-limited':                   429,
  'internal':                       500,
} as const;

/** União fechada dos 26 tipos declarados no contrato. */
export type ProblemType = keyof typeof STATUS_DO_PROBLEMA;

/** O status é consequência do tipo, nunca um argumento de quem chama. */
export type StatusDoProblema<T extends ProblemType> = (typeof STATUS_DO_PROBLEMA)[T];
