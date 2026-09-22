/**
 * Prova de existência de rota, antes de qualquer asserção de comportamento.
 *
 * O motivo é concreto e foi verificado contra o serviço de pé: o Fastify
 * responde caminho não registrado pelo `setNotFoundHandler`, que devolve
 * `problems/not-found` com status 404 — exatamente o mesmo corpo que o contrato
 * declara para o 404 legítimo de `resolveTagCode` e de `getPet`. Um cenário
 * escrito como "espero 404" fica **verde** contra um módulo que não existe, e
 * passa a ser confiança falsa: ninguém procura o que acredita já ter.
 *
 * Por isso cada operação declara aqui uma **prova**, que é um pedido cuja
 * resposta um caminho não registrado não consegue produzir:
 *
 * - `sem-token` — operação com `bearerAuth` obrigatório. Sem o cabeçalho, o
 *   contrato manda 401. Caminho ausente responde 404. Verificado ao vivo em
 *   `POST /v1/auth/logout`, que está implementado: 401 `unauthenticated`.
 * - `sem-parametro-obrigatorio` — operação pública com parâmetro de consulta
 *   obrigatório. Sem ele, o contrato manda 400. Ausente, 404.
 * - `entrada-malformada` — operação pública cujo contrato separa 400 (não
 *   normaliza para um código) de 404 (normalizou e não existe). Um 404 aqui
 *   significa rota ausente **ou** a confusão 400/404, e a mensagem diz as duas
 *   possibilidades em vez de escolher uma.
 * - `sempre-responde` — operação sem credencial e sem parâmetro obrigatório,
 *   que só pode responder 200.
 *
 * A falha é ruidosa e o texto separa as duas causas, porque "reprova por rota
 * ausente" e "reprova por defeito" são achados diferentes e não podem se
 * misturar no relatório.
 */

export type Prova =
  | { readonly tipo: 'sem-token'; readonly metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE' }
  | { readonly tipo: 'sem-parametro-obrigatorio' }
  | { readonly tipo: 'entrada-malformada'; readonly caminho: string }
  | { readonly tipo: 'sempre-responde' };

export interface Operacao {
  /** `operationId` de `api/openapi.yaml`. É a chave de rastreio entre os dois. */
  readonly operationId: string;
  readonly metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Caminho do contrato, com `{marcador}`, sem o prefixo `/v1`. */
  readonly caminho: string;
  readonly prova: Prova;
}

/**
 * Só entra aqui operação que `api/openapi.yaml` declara. Rota inventada por
 * teste é teste que testa a própria imaginação.
 */
export const OPERACOES = {
  registerUser: { operationId: 'registerUser', metodo: 'POST', caminho: '/auth/register', prova: { tipo: 'sem-parametro-obrigatorio' } },
  login: { operationId: 'login', metodo: 'POST', caminho: '/auth/login', prova: { tipo: 'sem-parametro-obrigatorio' } },
  getMe: { operationId: 'getMe', metodo: 'GET', caminho: '/me', prova: { tipo: 'sem-token', metodo: 'GET' } },
  createPet: { operationId: 'createPet', metodo: 'POST', caminho: '/pets', prova: { tipo: 'sem-token', metodo: 'POST' } },
  getPet: { operationId: 'getPet', metodo: 'GET', caminho: '/pets/{petId}', prova: { tipo: 'sem-token', metodo: 'GET' } },
  issuePetTag: { operationId: 'issuePetTag', metodo: 'POST', caminho: '/pets/{petId}/tags', prova: { tipo: 'sem-token', metodo: 'POST' } },
  revokePetTag: { operationId: 'revokePetTag', metodo: 'POST', caminho: '/pets/{petId}/tags/{tagId}/revoke', prova: { tipo: 'sem-token', metodo: 'POST' } },
  resolveTagCode: { operationId: 'resolveTagCode', metodo: 'GET', caminho: '/tags/{code}', prova: { tipo: 'entrada-malformada', caminho: '/tags/CODIGO-QUE-NAO-NORMALIZA' } },
  getTagOwnerContext: { operationId: 'getTagOwnerContext', metodo: 'GET', caminho: '/tags/{code}/owner-context', prova: { tipo: 'sem-token', metodo: 'GET' } },
  createFoundReportFromTag: { operationId: 'createFoundReportFromTag', metodo: 'POST', caminho: '/tags/{code}/found-reports', prova: { tipo: 'entrada-malformada', caminho: '/tags/CODIGO-QUE-NAO-NORMALIZA/found-reports' } },
  previewLostCaseReach: { operationId: 'previewLostCaseReach', metodo: 'GET', caminho: '/pets/{petId}/lost-case-preview', prova: { tipo: 'sem-token', metodo: 'GET' } },
  openLostCase: { operationId: 'openLostCase', metodo: 'POST', caminho: '/pets/{petId}/lost-cases', prova: { tipo: 'sem-token', metodo: 'POST' } },
  getLostCase: { operationId: 'getLostCase', metodo: 'GET', caminho: '/lost-cases/{caseId}', prova: { tipo: 'sem-token', metodo: 'GET' } },
  listLostCaseCandidates: { operationId: 'listLostCaseCandidates', metodo: 'GET', caminho: '/lost-cases/{caseId}/candidates', prova: { tipo: 'sem-token', metodo: 'GET' } },
  decideLostCaseCandidate: { operationId: 'decideLostCaseCandidate', metodo: 'POST', caminho: '/lost-cases/{caseId}/candidates/{candidateId}/decision', prova: { tipo: 'sem-token', metodo: 'POST' } },
  closeLostCase: { operationId: 'closeLostCase', metodo: 'POST', caminho: '/lost-cases/{caseId}/close', prova: { tipo: 'sem-token', metodo: 'POST' } },
  listConversations: { operationId: 'listConversations', metodo: 'GET', caminho: '/conversations', prova: { tipo: 'sem-token', metodo: 'GET' } },
  postConversationMessage: { operationId: 'postConversationMessage', metodo: 'POST', caminho: '/conversations/{conversationId}/messages', prova: { tipo: 'sem-token', metodo: 'POST' } },
  getFinderConversation: { operationId: 'getFinderConversation', metodo: 'GET', caminho: '/finder/conversation', prova: { tipo: 'sem-token', metodo: 'GET' } },
  listPublicLostPets: { operationId: 'listPublicLostPets', metodo: 'GET', caminho: '/public/lost-pets', prova: { tipo: 'sem-parametro-obrigatorio' } },
  getPublicLostCase: { operationId: 'getPublicLostCase', metodo: 'GET', caminho: '/public/lost-cases/{shareToken}', prova: { tipo: 'entrada-malformada', caminho: '/public/lost-cases/curto' } },
  getReferenceData: { operationId: 'getReferenceData', metodo: 'GET', caminho: '/public/reference-data', prova: { tipo: 'sempre-responde' } },
  health: { operationId: 'health', metodo: 'GET', caminho: '/health', prova: { tipo: 'sempre-responde' } },
} as const satisfies Record<string, Operacao>;

export type OperacaoId = keyof typeof OPERACOES;

/** O 404 genérico do `setNotFoundHandler`, que é o que um caminho ausente devolve. */
function ehNaoEncontradoGenerico(corpo: unknown): boolean {
  if (typeof corpo !== 'object' || corpo === null) return false;
  const tipo = (corpo as { type?: unknown }).type;
  return typeof tipo === 'string' && tipo.endsWith('/problems/not-found');
}

export function caminhoDe(id: OperacaoId, valores: Readonly<Record<string, string>> = {}): string {
  const bruto = OPERACOES[id].caminho;
  const resolvido = bruto.replace(/\{(\w+)\}/g, (_todo, chave: string) => {
    const valor = valores[chave];
    if (valor === undefined) {
      throw new Error(`Falta o valor de {${chave}} para montar ${bruto} (${id}).`);
    }
    return encodeURIComponent(valor);
  });
  return `/v1${resolvido}`;
}

function textoDaAusencia(id: OperacaoId, motivo: string): string {
  const op = OPERACOES[id];
  return [
    `ROTA AUSENTE: ${op.operationId} (${op.metodo} /v1${op.caminho}).`,
    motivo,
    'Esta reprovação é por rota não implementada, NÃO por defeito de comportamento.',
    'O contrato declara a operação; o serviço não a registra.',
  ].join(' ');
}

/**
 * Falha ruidosamente quando a operação não está registrada no serviço.
 * Chame antes de qualquer asserção de comportamento do cenário.
 */
export function exigirRota(id: OperacaoId, valores: Readonly<Record<string, string>> = {}): void {
  const op = OPERACOES[id];
  const prova = op.prova;

  const pedido: Partial<Cypress.RequestOptions> = { failOnStatusCode: false, method: op.metodo };

  switch (prova.tipo) {
    case 'sem-token':
      pedido.method = prova.metodo;
      pedido.url = caminhoDe(id, valores);
      if (prova.metodo !== 'GET') pedido.body = {};
      break;
    case 'sem-parametro-obrigatorio':
      pedido.url = caminhoDe(id, valores);
      if (op.metodo !== 'GET') pedido.body = {};
      break;
    case 'entrada-malformada':
      pedido.url = `/v1${prova.caminho}`;
      if (op.metodo === 'POST') {
        pedido.body = {};
        pedido.headers = { 'Idempotency-Key': `prova-${Date.now()}` };
      }
      break;
    case 'sempre-responde':
      pedido.url = caminhoDe(id, valores);
      break;
  }

  cy.request<Record<string, unknown>>(pedido as Cypress.RequestOptions).then((resposta) => {
    if (resposta.status === 404 && ehNaoEncontradoGenerico(resposta.body)) {
      const motivo =
        prova.tipo === 'sem-token'
          ? 'Sem cabeçalho `Authorization`, o contrato manda 401; veio o 404 genérico do tratador de caminho desconhecido.'
          : prova.tipo === 'sem-parametro-obrigatorio'
            ? 'Sem o parâmetro obrigatório, o contrato manda 400; veio o 404 genérico do tratador de caminho desconhecido.'
            : prova.tipo === 'entrada-malformada'
              ? 'Entrada que não normaliza deveria responder 400; veio 404. É rota ausente, ou o defeito de responder 404 onde o contrato separa 400 de 404 — as duas hipóteses continuam abertas e só o código diz qual é.'
              : 'A operação não tem credencial nem parâmetro obrigatório: só pode responder 200.';
      throw new Error(textoDaAusencia(id, motivo));
    }

    const esperado =
      prova.tipo === 'sem-token' ? 401 : prova.tipo === 'sem-parametro-obrigatorio' ? 400 : prova.tipo === 'entrada-malformada' ? 400 : 200;

    expect(resposta.status, `prova de existência de ${op.operationId}`).to.eq(esperado);
  });
}
