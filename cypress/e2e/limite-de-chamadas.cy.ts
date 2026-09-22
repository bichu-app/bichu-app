/**
 * @regressao — Limite de chamadas: a sexta tentativa na mesma hora para o mesmo
 * código (§4.1, §6.2).
 *
 * A armadilha deste cenário é acreditar que limite estourado significa 429. No
 * contrato, `on_exceed` tem vocabulário fechado e **`deny_429` existe em um
 * lugar só**: a adivinhação de código. `serve_cache`, `challenge`,
 * `log_and_alert`, `group_notification`, `notify_owner` e `hold_for_review` não
 * são recusa — o pedido é aceito e gravado.
 *
 * A regra de produto que governa tudo aqui: **o achador nunca vê mensagem de
 * segurança, e o primeiro aviso de uma identidade para um código passa sempre.**
 * Um cenário que trate `challenge` como erro está testando outra coisa.
 *
 * Os avisos deste arquivo usam uma tag por caso, emitida no próprio cenário, em
 * vez de um código fixo: código compartilhado estoura o teto de `[ip, code]` em
 * poucas execuções e devolve uma suíte vermelha pelo motivo errado, que é como
 * se ensina um time a ignorar vermelho.
 */
import { exigirRota, caminhoDe } from '../apoio/rotas';
import { criarConta, criarPet, emitirTag, chaveDeIdempotencia } from '../apoio/massa';
import { codigoBemFormadoInexistente } from '../apoio/codigo-da-tag';
import type { AvisoCriado, OuProblema, PaginaPublicaDePerdidos, ResolucaoDeTag } from '../apoio/respostas';

/**
 * Um código bem formado e inexistente, com **símbolo de verificação válido**.
 *
 * Sem o símbolo, todas as tentativas abaixo viram 400 por erro de formato, e o
 * teto de `invalid_attempts` deixa de ser exercitado — o cenário continuaria
 * verde medindo outra coisa (ADR-0004, Emenda 1, §13.4).
 */
const CODIGO_INVALIDO_BEM_FORMADO = codigoBemFormadoInexistente;

describe('@regressao limite de chamadas', () => {
  it('a sexta tentativa de aviso na mesma hora para o mesmo código não é recusada', () => {
    criarConta('limite-aviso').then((conta) => {
      criarPet(conta).then((petId) => {
        emitirTag(conta, petId).then((tag) => {
          exigirRota('createFoundReportFromTag', { code: tag.code });

          const url = caminhoDe('createFoundReportFromTag', { code: tag.code });
          const respostas: number[] = [];

          // O teto de `[ip, code]` é 5 por hora, com `on_exceed: challenge`.
          // Seis envios, e nenhum deles pode virar erro na cara do achador.
          Cypress._.range(6).forEach((i) => {
            cy.request<OuProblema<AvisoCriado>>({
              method: 'POST',
              url,
              failOnStatusCode: false,
              headers: { 'Idempotency-Key': chaveDeIdempotencia(`limite-${i}`) },
              body: {},
            }).then((r) => {
              respostas.push(r.status);
            });
          });

          cy.then(() => {
            expect(respostas, 'seis envios registrados').to.have.length(6);
            expect(respostas[5], 'o sexto envio: `challenge` não é recusa, e o aviso nunca é descartado').to.not.eq(429);
            expect(respostas[5], 'e também não é 500').to.be.lessThan(500);
            expect(
              respostas.filter((s) => s === 201).length,
              'todo envio precisa ser aceito e gravado: agrupar o push é uma coisa, descartar o registro é outra',
            ).to.be.greaterThan(0);
          });
        });
      });
    });
  });

  it('adivinhação de código é a única recusa do fluxo, e responde 429 com Retry-After', () => {
    exigirRota('resolveTagCode', { code: CODIGO_INVALIDO_BEM_FORMADO() });

    const respostas: Array<{ status: number; retryAfter: string | undefined }> = [];

    // O teto é 5 tentativas inválidas em 10 minutos por identidade de achador.
    Cypress._.range(6).forEach(() => {
      cy.request<OuProblema<ResolucaoDeTag>>({
        method: 'GET',
        url: caminhoDe('resolveTagCode', { code: CODIGO_INVALIDO_BEM_FORMADO() }),
        failOnStatusCode: false,
      }).then((r) => {
        respostas.push({ status: r.status, retryAfter: r.headers['retry-after'] as string | undefined });
      });
    });

    cy.then(() => {
      const recusada = respostas.find((r) => r.status === 429);
      if (recusada === undefined) {
        throw new Error(
          'A sexta tentativa inválida não foi recusada. O contrato declara ' +
            '`dimension: [finder_identity], limit: 5, window: 10m, on_exceed: deny_429, applies_to: invalid_attempts`. ' +
            `Respostas obtidas: ${respostas.map((r) => r.status).join(', ')}. ` +
            'Se o serviço não reconhece a identidade do achador por trás do Cypress, isto é o item 3 da §4.3 ' +
            '(identidade de esteira com limite próprio) e não defeito.',
        );
      }
      expect(recusada.retryAfter, 'Retry-After de 600 segundos, para a tela dizer quanto tempo esperar').to.eq('600');
    });
  });

  it('um código válido continua passando depois da recusa por adivinhação', () => {
    // O caso malicioso: a varredura quer saber quais códigos existem. Se a
    // recusa responder diferente para código válido e inválido, ela entrega
    // exatamente isso. E o achador de verdade, que errou a digitação e depois
    // acertou, não pode ficar preso do lado de fora.
    criarConta('limite-valido').then((conta) => {
      criarPet(conta).then((petId) => {
        emitirTag(conta, petId).then((tag) => {
          Cypress._.range(6).forEach(() => {
            cy.request<OuProblema<ResolucaoDeTag>>({
              method: 'GET',
              url: caminhoDe('resolveTagCode', { code: CODIGO_INVALIDO_BEM_FORMADO() }),
              failOnStatusCode: false,
            });
          });

          cy.request<OuProblema<ResolucaoDeTag>>({ method: 'GET', url: caminhoDe('resolveTagCode', { code: tag.code }), failOnStatusCode: false }).then((r) => {
            expect(r.status, 'nunca 429 para código válido: o contrato escreve isso como nota da própria entrada de limite').to.eq(200);
          });
        });
      });
    });
  });

  it('o limite da listagem pública desafia, e não revela existência', () => {
    // `listPublicLostPets` tem `on_exceed: challenge` nas três entradas. Nenhuma
    // delas pode virar 500, e nenhuma pode responder diferente conforme o que
    // foi buscado.
    //
    // A prova de rota vem antes, e não é formalidade: sem ela, cinco 404 iguais
    // satisfariam "todas as respostas iguais e nenhuma é 500" e este caso ficaria
    // verde contra um módulo que não existe.
    exigirRota('listPublicLostPets');

    const respostas: number[] = [];
    Cypress._.range(5).forEach(() => {
      cy.request<OuProblema<PaginaPublicaDePerdidos>>({
        method: 'GET',
        url: caminhoDe('listPublicLostPets'),
        failOnStatusCode: false,
        qs: { city: 'São Paulo', q: CODIGO_INVALIDO_BEM_FORMADO() },
      }).then((r) => {
        respostas.push(r.status);
      });
    });

    cy.then(() => {
      expect(new Set(respostas).size, `a listagem respondeu de formas diferentes: ${respostas.join(', ')}`).to.eq(1);
      expect(respostas[0], 'challenge não é 500').to.be.lessThan(500);
    });
  });
});
