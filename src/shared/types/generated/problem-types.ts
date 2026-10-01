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
  'event-not-open':                 409, // o pedido de participacao nao pode ser decidido porque o encontro foi cancelado, removido ou ja terminou (BICHUS-292). Separado de `validation-failed`/`request_not_pending`: ali o problema e o PEDIDO; aqui e o ENCONTRO, e nenhuma decisao sobre esse pedido vai valer
  'pet-already-lost':               409, // este pet ja tem caso aberto. O banco impoe (indice unico parcial), e o tipo existe para a tela dizer 'voce ja marcou' em vez de 'erro'
  'open-case-limit-reached':        409, // teto de 3 casos ABERTOS SIMULTANEOS por conta (BICHUS-21 criterio 8). Separado de `pet-already-lost`: um diz 'este pet ja esta perdido' e o outro 'voce ja tem tres animais perdidos'. A saida e diferente -- no primeiro a pessoa abre o caso que ja existe, no segundo ela precisa encerrar um. Alem de produto, e privacidade: a lista publica mostra bairro e data, e sem teto uma conta entregaria uma SERIE de pontos no tempo e no espaco da mesma pessoa
  'pet-limit-reached':              409, // teto de pets DA CONTA
  'tag-limit-reached':              409, // teto de tags ativas DO PET (ADR-0004). Separado de `pet-limit-reached` porque sao dois tetos diferentes: um app que decida por `type` tratava o teto de plaquinhas como limite de pets da conta, e oferecia a saida errada
  'contact-channel-unverified':     409,
  'pet-photo-missing':              409,
  'transfer-not-for-this-account':  409,
  'transfer-already-in-progress':   409, // BICHUS-66: este pet ja tem transferencia viva. O banco impoe (indice unico parcial `pet_transfers_uma_viva_por_pet`), e o tipo existe para a tela oferecer a SAIDA -- cancelar a que esta em andamento -- em vez de 'erro'. Separado de `pet-already-lost`, que e o OUTRO 409 da mesma operacao e tem saida oposta: ali a pessoa encerra o caso de perdido, aqui ela cancela um convite
  'transfer-already-effective':     409, // BICHUS-66: a transferencia ja se consumou, e depois disso o caminho e transferir de volta, nao cancelar. E 409 e nao 410 de proposito: a rota EXIGE conta e o tutor tem direito de saber em que pe esta a propria transferencia -- o 410 sem distincao e da superficie PUBLICA do token, onde dizer qual dos tres casos ocorreu entregaria a um estranho o estado de uma transferencia alheia
  'conversation-closed':            410, // BICHUS-41: nas rotas do achador sem conta, o token existiu e venceu. O corpo e FIXO: nao conta o desfecho do caso, pela mesma regra de `lost-case-closed`
  'lost-case-closed':               410, // o link publico do caso (`/p/`, `/cartaz/`, destino do push) nao leva mais a caso aberto: encerrado, pet excluido, falecido ou arquivado, e token desconhecido. Os cinco sao a MESMA resposta de proposito -- distinguir contaria a um estranho o que aconteceu com o animal de outra pessoa, ou se aquele token existiu. Separado de `conversation-closed` porque a tela e outra: quem abre o cartaz nao esta numa conversa, e o site e o app decidem pelo `type`
  'finder-link-invalid':            401, // BICHUS-41: token do achador ausente, malformado ou desconhecido, com o MESMO corpo. E 401 porque falta credencial que autentique, e nao `unauthenticated` porque este tipo manda entrar, e quem tem este link nao tem conta. Nunca `forbidden`: nao ha ninguem autenticado para ser recusado
  'tag-revoked':                    410, // tag revogada e SEMPRE 410 com `next_action`, nunca 404 (ADR-0004)
  'tag-code-not-found':             404,
  'tag-code-malformed':             400,
  'unsupported-media-type':         415, // quatro operacoes ja respondiam 415 e nenhum slug significava isso: o corpo do problema saia com um `type` fora desta lista fechada, que e exatamente o que ela existe para impedir
  'verification-token-expired':     410, // token de USO UNICO (verificacao de e-mail, redefinicao de senha) expirado, ja usado ou inexistente. Separado de `token-expired`, que e 401: as duas operacoes declaram 410 e o slug de 401 nao podia responder por elas. Os tres casos sao a MESMA resposta de proposito -- distinguir contaria a um estranho se aquele token existiu
  'upload-not-received':            409, // o cliente confirmou um envio cujos bytes nao chegaram ao armazenamento. Sem este estado, a foto nascia `processing` para sempre: um cartao de pet carregando eternamente, que ninguem sabe explicar
  'precondition-failed':            412, // ADR-0027: `If-Match` nao corresponde a versao atual do recurso do backoffice. Outra pessoa salvou depois da leitura, e nada foi gravado
  'captcha-rejected':               403, // ADR-0027 / D41: login administrativo sem X-Captcha-Token ou com nota abaixo de 0,5. So existe no login do backoffice; no login do tutor a ausencia do token nunca recusa (ADR-0020)
  'method-not-allowed':             405, // ADR-0027 item 20.5: metodo que a rota administrativa nao aceita (o `GET` do "nao fui eu", que so existe por `POST`). Vem com `Allow`. So na superficie administrativa, e so com `X-Internal-Surface: admin`: sem ele a resposta continua 404 (D33)
  'weak-password':                  422,
  'image-too-small':                422, // a imagem de catalogo declarada no pedido de envio e menor que a dimensao minima do proposito (600 x 600 no encontro da Rede, 800 x 800 no produto da Loja). Separado de `validation-failed`: o corpo esta bem formado, e a saida e outra -- escolher outra imagem, nao corrigir o formulario. A dimensao real continua conferida pelo worker nos bytes
  'precondition-required':          428, // ADR-0027: escrita sobre recurso existente do backoffice sem `If-Match`
  'rate-limited':                   429,
  'internal':                       500,
} as const;

/** União fechada dos 36 tipos declarados no contrato. */
export type ProblemType = keyof typeof STATUS_DO_PROBLEMA;

/** O status é consequência do tipo, nunca um argumento de quem chama. */
export type StatusDoProblema<T extends ProblemType> = (typeof STATUS_DO_PROBLEMA)[T];
