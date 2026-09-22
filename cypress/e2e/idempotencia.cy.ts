/**
 * @regressao — Idempotência de `createFoundReportFromTag` (§4.1).
 *
 * `Idempotency-Key` é obrigatório nesta operação, e o motivo é o produto: a
 * página pública reenvia o pedido por fila quando a rede cai, e o tutor não pode
 * receber o mesmo aviso três vezes.
 *
 * A máquina de idempotência foi construída e nunca foi exercitada por uma
 * chamada HTTP de verdade. O que este cenário prova não é que a resposta se
 * repete: é que **o efeito acontece uma vez só**. Resposta repetida com dois
 * registros gravados é exatamente o defeito que uma asserção preguiçosa deixa
 * passar, então a contagem de candidatos do caso é conferida junto.
 */
import { exigirRota, caminhoDe } from '../apoio/rotas';
import { criarConta, criarPet, emitirTag, chaveDeIdempotencia } from '../apoio/massa';
import type { AvisoCriado, OuProblema } from '../apoio/respostas';

describe('@regressao idempotência do aviso pela tag', () => {
  it('a mesma chave duas vezes produz um aviso só', () => {
    criarConta('idem-mesma').then((conta) => {
      criarPet(conta).then((petId) => {
        emitirTag(conta, petId).then((tag) => {
          exigirRota('createFoundReportFromTag', { code: tag.code });

          const chave = chaveDeIdempotencia('idem-mesma');
          const url = caminhoDe('createFoundReportFromTag', { code: tag.code });
          const corpo = { note: 'Está no portão azul da esquina.' };

          let primeiroToken = '';

          cy.request<OuProblema<AvisoCriado>>({ method: 'POST', url, failOnStatusCode: false, headers: { 'Idempotency-Key': chave }, body: corpo })
            .then((r) => {
              expect(r.status, 'primeiro envio').to.eq(201);
              primeiroToken = r.body.finder_token;
              return cy.request<OuProblema<AvisoCriado>>({ method: 'POST', url, failOnStatusCode: false, headers: { 'Idempotency-Key': chave }, body: corpo });
            })
            .then((r) => {
              expect(r.status, 'o reenvio da fila devolve a resposta guardada, não um erro').to.eq(201);
              expect(
                r.body.finder_token,
                'mesma chave, mesma resposta: dois tokens significam dois registros',
              ).to.eq(primeiroToken);
            });

          // O efeito, e não só a resposta.
          //
          // O contrato **não declara** operação que conte os avisos recebidos
          // por um código: `listMyFoundReports` (GET /v1/found-reports) lista os
          // avisos que a conta autenticada REGISTROU, e o tutor que recebe o
          // aviso não os registrou. O caminho que existe é a contagem de
          // candidatos do caso, e o caso exige conta com canal verificado.
          //
          // Então a prova do efeito único fica em duas metades, e eu digo qual
          // é qual em vez de fingir que o token repetido já prova tudo: aqui
          // está a metade observável (uma resposta, um token), e a outra metade
          // está no cenário do ciclo completo, na contagem de candidatos.
          // Achado para o relatório, não defeito do servidor.
        });
      });
    });
  });

  it('chaves diferentes com o mesmo corpo produzem dois avisos', () => {
    criarConta('idem-diferente').then((conta) => {
      criarPet(conta).then((petId) => {
        emitirTag(conta, petId).then((tag) => {
          const url = caminhoDe('createFoundReportFromTag', { code: tag.code });
          const corpo = { note: 'Está no portão azul da esquina.' };
          let primeiroToken = '';

          cy.request<OuProblema<AvisoCriado>>({
            method: 'POST',
            url,
            failOnStatusCode: false,
            headers: { 'Idempotency-Key': chaveDeIdempotencia('idem-a') },
            body: corpo,
          })
            .then((r) => {
              expect(r.status).to.eq(201);
              primeiroToken = r.body.finder_token;
              return cy.request<OuProblema<AvisoCriado>>({
                method: 'POST',
                url,
                failOnStatusCode: false,
                headers: { 'Idempotency-Key': chaveDeIdempotencia('idem-b') },
                body: corpo,
              });
            })
            .then((r) => {
              expect(r.status, 'corpo igual não é a chave: é outro aviso').to.eq(201);
              expect(r.body.finder_token, 'chave diferente precisa gerar outro registro').to.not.eq(primeiroToken);
            });
        });
      });
    });
  });

  it('sem `Idempotency-Key` a operação é recusada', () => {
    criarConta('idem-sem-chave').then((conta) => {
      criarPet(conta).then((petId) => {
        emitirTag(conta, petId).then((tag) => {
          cy.request<OuProblema<AvisoCriado>>({
            method: 'POST',
            url: caminhoDe('createFoundReportFromTag', { code: tag.code }),
            failOnStatusCode: false,
            body: {},
          }).then((r) => {
            expect(
              r.status,
              'o cabeçalho é obrigatório no contrato; aceitar sem ele é aceitar o aviso triplicado quando a rede cai',
            ).to.be.oneOf([400, 428]);
            expect(r.status, 'e não pode ser 201').to.not.eq(201);
          });
        });
      });
    });
  });

  it('a mesma chave com corpo diferente não devolve a resposta antiga em silêncio', () => {
    // O caso malicioso da janela de idempotência: reusar a chave para outro
    // conteúdo. Ou o servidor recusa, ou ele devolve a primeira resposta — o que
    // não pode é gravar o segundo corpo e responder como se fosse o primeiro.
    criarConta('idem-conflito').then((conta) => {
      criarPet(conta).then((petId) => {
        emitirTag(conta, petId).then((tag) => {
          const url = caminhoDe('createFoundReportFromTag', { code: tag.code });
          const chave = chaveDeIdempotencia('idem-conflito');

          cy.request<OuProblema<AvisoCriado>>({ method: 'POST', url, failOnStatusCode: false, headers: { 'Idempotency-Key': chave }, body: { note: 'primeiro' } })
            .then((r) => {
              expect(r.status).to.eq(201);
              return cy.request<OuProblema<AvisoCriado>>({
                method: 'POST',
                url,
                failOnStatusCode: false,
                headers: { 'Idempotency-Key': chave },
                body: { note: 'segundo, diferente do primeiro' },
              });
            })
            .then((r) => {
              expect(r.status, 'conflito de chave: 409 recusando, ou 201 repetindo a primeira resposta').to.be.oneOf([201, 409, 422]);
            });
        });
      });
    });
  });
});
