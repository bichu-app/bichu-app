/**
 * @regressao — Tag revogada devolve 410 com `next_action`, nunca 404; código
 * inexistente devolve 404; texto que não normaliza devolve 400 (§4.1, ADR-0004).
 *
 * Os três são respostas diferentes para três situações diferentes, e confundi-las
 * leva quem está com o animal no colo a um beco sem saída. O 410 é o único que
 * carrega o caminho alternativo.
 *
 * O cenário confere o `type`, e não o texto: o cliente decide por `type`
 * (RFC 9457), e um teste que casa a frase amarra o contrato à redação.
 */
import { exigirRota, caminhoDe } from '../apoio/rotas';
import { criarConta, criarPet, emitirTag, autorizacao, chaveDeIdempotencia } from '../apoio/massa';
import type { AvisoCriado, OuProblema, ResolucaoDeTag } from '../apoio/respostas';

/** 26 caracteres do alfabeto Crockford, bem formado e inexistente. */
const CODIGO_BEM_FORMADO_INEXISTENTE = '0123456789ABCDEFGHJKMNPQRS';
/** `U` está fora do alfabeto Crockford: não normaliza para um código. */
const TEXTO_QUE_NAO_NORMALIZA = 'UUUUUUUUUUUUUUUUUUUUUUUUUU';

describe('@regressao tag revogada, código inexistente e texto que não normaliza', () => {
  // Antes de cada caso, e não uma vez só: sem a prova de rota, "esperava 400,
  // veio 404" se lê como confusão entre os dois status quando a causa é a rota
  // não existir.
  beforeEach(() => {
    exigirRota('resolveTagCode', { code: CODIGO_BEM_FORMADO_INEXISTENTE });
  });

  it('tag revogada responde 410 com next_action, e nunca 404', () => {
    criarConta('revogada').then((conta) => {
      criarPet(conta).then((petId) => {
        emitirTag(conta, petId).then((tag) => {
          exigirRota('revokePetTag', { petId, tagId: tag.tagId });

          cy.request<OuProblema<Record<string, unknown>>>({
            method: 'POST',
            url: caminhoDe('revokePetTag', { petId, tagId: tag.tagId }),
            headers: autorizacao(conta),
            failOnStatusCode: false,
            body: { reason: 'lost_tag' },
          }).then((r) => {
            expect(r.status, 'revogação aceita').to.be.oneOf([200, 204]);
          });

          cy.then(() => {
            cy.request<OuProblema<ResolucaoDeTag>>({ method: 'GET', url: caminhoDe('resolveTagCode', { code: tag.code }), failOnStatusCode: false }).then((r) => {
              expect(r.status, 'revogada é 410, nunca 404').to.eq(410);
              expect(r.headers['content-type']).to.include('application/problem+json');
              expect(r.body.type, 'o cliente decide por type').to.include('tag-revoked');
              expect(
                r.body.next_action,
                'quem está com o animal no colo precisa do caminho alternativo',
              ).to.eq('register_stray_found_report');
              expect(r.body.correlation_id).to.be.a('string');
            });
          });

          // Avisar por uma tag revogada também é 410, e não 404.
          cy.then(() => {
            cy.request<OuProblema<AvisoCriado>>({
              method: 'POST',
              url: caminhoDe('createFoundReportFromTag', { code: tag.code }),
              failOnStatusCode: false,
              headers: { 'Idempotency-Key': chaveDeIdempotencia('revogada') },
              body: {},
            }).then((r) => {
              expect(r.status, 'a rota de aviso segue a mesma regra').to.eq(410);
            });
          });
        });
      });
    });
  });

  it('código bem formado e inexistente responde 404, com type diferente do 410', () => {
    cy.request<OuProblema<ResolucaoDeTag>>({
      method: 'GET',
      url: caminhoDe('resolveTagCode', { code: CODIGO_BEM_FORMADO_INEXISTENTE }),
      failOnStatusCode: false,
    }).then((r) => {
      expect(r.status, 'normalizou e não existe').to.eq(404);
      expect(r.body.type, 'o type do 404 não pode ser o do 410').to.not.include('tag-revoked');
      expect(r.body.next_action, 'o 404 não oferece caminho alternativo de tag revogada').to.not.eq('register_stray_found_report');
    });
  });

  it('texto que não normaliza responde 400, e não 404', () => {
    cy.request<OuProblema<ResolucaoDeTag>>({
      method: 'GET',
      url: caminhoDe('resolveTagCode', { code: TEXTO_QUE_NAO_NORMALIZA }),
      failOnStatusCode: false,
    }).then((r) => {
      expect(
        r.status,
        'para quem está na rua a diferença é útil: 400 diz "confira o que você digitou", 404 diz "não encontramos este código"',
      ).to.eq(400);
    });
  });

  it('os três responderam com `type` distinto entre si', () => {
    // Três respostas com o mesmo `type` seriam três telas iguais para três
    // situações que a UX distingue, e o defeito passaria por cada caso isolado.
    const tipos: string[] = [];
    cy.request<OuProblema<ResolucaoDeTag>>({ method: 'GET', url: caminhoDe('resolveTagCode', { code: CODIGO_BEM_FORMADO_INEXISTENTE }), failOnStatusCode: false })
      .then((r) => {
        tipos.push(String(r.body?.type));
        return cy.request<OuProblema<ResolucaoDeTag>>({ method: 'GET', url: caminhoDe('resolveTagCode', { code: TEXTO_QUE_NAO_NORMALIZA }), failOnStatusCode: false });
      })
      .then((r) => {
        tipos.push(String(r.body?.type));
        expect(new Set(tipos).size, `404 e 400 precisam ter type diferente: ${tipos.join(' / ')}`).to.eq(2);
      });
  });
});
