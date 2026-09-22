/**
 * Massa de teste: cada cenário cria a própria conta, o próprio pet e a própria
 * tag. Nada é reaproveitado entre cenários e nada depende de ordem.
 *
 * O e-mail carrega `Date.now()` mais um contador de processo, porque duas
 * execuções no mesmo segundo colidiriam no `UNIQUE` de e-mail e a suíte ficaria
 * vermelha por motivo errado — que é como se ensina um time a ignorar vermelho.
 *
 * O código da tag é emitido por cenário, e não fixo: `POST /v1/pets/{petId}/tags`
 * é a única resposta que traz o código em claro, e um código fixo compartilhado
 * estouraria o teto de `[ip, code]` da rota de aviso em poucas execuções.
 */

import { exigirRota } from './rotas';
import type { Pet, Sessao, TagEmitidaResposta } from './respostas';

let sequencia = 0;

export const SENHA_PADRAO = 'girassol-de-agosto-9';

export function emailUnico(rotulo: string): string {
  sequencia += 1;
  return `qa-${rotulo}-${Date.now()}-${sequencia}@exemplo.com.br`;
}

export function chaveDeIdempotencia(rotulo: string): string {
  sequencia += 1;
  return `qa-${rotulo}-${Date.now()}-${sequencia}`;
}

export interface Conta {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly userId: string;
  readonly email: string;
}

export function autorizacao(conta: Conta): Record<string, string> {
  return { authorization: `Bearer ${conta.accessToken}` };
}

/**
 * Cria conta pela API, nunca pela interface. `registerUser` já devolve o par de
 * tokens, então não há segundo passo de login.
 *
 * Falha ruidosa quando o cadastro não devolve 201: sem conta, todo cenário que
 * depende dela reprovaria por um motivo que não é o dele, e a mensagem precisa
 * dizer isso na primeira linha.
 */
export function criarConta(rotulo: string): Cypress.Chainable<Conta> {
  const email = emailUnico(rotulo);
  return cy
    .request<Sessao>({
      method: 'POST',
      url: '/v1/auth/register',
      failOnStatusCode: false,
      body: { email, password: SENHA_PADRAO, display_name: 'Tutor de teste' },
    })
    .then((resposta) => {
      if (resposta.status !== 201) {
        throw new Error(
          `PRÉ-CONDIÇÃO FALHOU: registerUser respondeu ${resposta.status} em vez de 201. ` +
            `Sem conta não há cenário. Corpo: ${JSON.stringify(resposta.body)}`,
        );
      }
      const corpo = resposta.body;
      return cy.wrap<Conta>(
        { accessToken: corpo.access_token, refreshToken: corpo.refresh_token, userId: corpo.user.id, email },
        { log: false },
      );
    });
}

/**
 * Cria o pet e devolve o id. Reprova com texto próprio quando `createPet` não
 * existe, para que a causa não seja confundida com defeito do cenário.
 */
export function criarPet(conta: Conta, nome = 'Thor'): Cypress.Chainable<string> {
  exigirRota('createPet');
  return cy
    .request<Pet>({
      method: 'POST',
      url: '/v1/pets',
      failOnStatusCode: false,
      headers: autorizacao(conta),
      body: { name: nome, species: 'dog', size: 'M', primary_color_code: 'preto', distinctive_marks: 'Coleira vermelha.' },
    })
    .then((resposta) => {
      if (resposta.status !== 201) {
        throw new Error(
          `PRÉ-CONDIÇÃO FALHOU: createPet respondeu ${resposta.status} em vez de 201. ` +
            `Corpo: ${JSON.stringify(resposta.body)}`,
        );
      }
      return cy.wrap(resposta.body.id, { log: false });
    });
}

export interface TagEmitida {
  readonly tagId: string;
  readonly code: string;
}

/** `issuePetTag` é a única operação que devolve o código em claro. */
export function emitirTag(conta: Conta, petId: string): Cypress.Chainable<TagEmitida> {
  exigirRota('issuePetTag', { petId });
  return cy
    .request<TagEmitidaResposta>({
      method: 'POST',
      url: `/v1/pets/${petId}/tags`,
      failOnStatusCode: false,
      headers: autorizacao(conta),
    })
    .then((resposta) => {
      if (resposta.status !== 201) {
        throw new Error(
          `PRÉ-CONDIÇÃO FALHOU: issuePetTag respondeu ${resposta.status} em vez de 201. ` +
            `Corpo: ${JSON.stringify(resposta.body)}`,
        );
      }
      const corpo = resposta.body;
      return cy.wrap<TagEmitida>({ tagId: corpo.id, code: corpo.code }, { log: false });
    });
}
