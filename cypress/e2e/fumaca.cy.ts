/**
 * @smoke — Sonda de saúde, spec servida e Swagger UI de pé (§4.1).
 *
 * É o cenário mais curto e o único que precisa estar verde antes de qualquer
 * outro fazer sentido: os nove restantes reprovam por motivo ilegível quando a
 * pilha não está de pé.
 *
 * A sonda toca o banco de verdade. Sonda que não sonda nada sempre responde que
 * está tudo bem, e é assim que se produz confiança falsa.
 *
 * Sobre a UI do contrato: o ADR-0018 a fecha atrás de autenticação básica na
 * borda, nos três ambientes onde ela existe, e a proíbe em produção. Então o que
 * este cenário afirma é que **o caminho está roteado e o portão está de pé** —
 * 401 com `WWW-Authenticate`. A conferência de que a UI abre com a credencial
 * certa tem verificação própria em `infra/verificacao/`, e duplicá-la aqui seria
 * escrever um segundo dono para a mesma regra.
 */
import type { DadosDeReferencia, DescobertaOpenId, Jwks, Saude } from '../apoio/respostas';

describe('@smoke a pilha está de pé', () => {
  it('a sonda de saúde responde 200 e diz o que checou', () => {
    cy.request<Saude>({ method: 'GET', url: '/v1/health', failOnStatusCode: false }).then((r) => {
      expect(r.status).to.eq(200);
      expect(r.body.status, 'status').to.eq('ok');
      expect(r.body.version, 'version').to.be.a('string').and.have.length.greaterThan(0);
      expect(r.body.checks, 'a sonda precisa dizer o que ela checou').to.be.an('object');
      expect(r.body.checks.database, 'a sonda toca o banco de verdade').to.eq('ok');
    });
  });

  it('a descoberta de identidade está na raiz do host, fora de /v1', () => {
    cy.request<Jwks>({ method: 'GET', url: '/.well-known/jwks.json', failOnStatusCode: false }).then((r) => {
      expect(r.status, 'quem consulta isto é biblioteca, e o contrato declara servidor próprio').to.eq(200);
      expect(r.body.keys, 'keys').to.be.an('array').and.have.length.greaterThan(0);
    });

    cy.request<DescobertaOpenId>({ method: 'GET', url: '/.well-known/openid-configuration', failOnStatusCode: false }).then((r) => {
      expect(r.status).to.eq(200);
      expect(r.body.issuer, 'issuer').to.be.a('string');
      expect(r.body.jwks_uri, 'jwks_uri').to.be.a('string');
    });
  });

  it('a spec e a Swagger UI estão roteadas e fechadas pelo portão da borda', () => {
    for (const caminho of ['/v1/openapi.yaml', '/v1/docs']) {
      cy.request<unknown>({ method: 'GET', url: caminho, failOnStatusCode: false }).then((r) => {
        expect(r.status, `${caminho}: o ADR-0018 fecha a UI por autenticação básica na borda`).to.eq(401);
        expect(
          r.headers['www-authenticate'],
          `${caminho}: 401 sem WWW-Authenticate seria o serviço recusando, e não o portão da borda`,
        ).to.match(/^Basic/i);
      });
    }
  });

  it('os dados de referência servem o cadastro, e a cor sai rotulada em texto', () => {
    cy.request<DadosDeReferencia>({ method: 'GET', url: '/v1/public/reference-data', failOnStatusCode: false }).then((r) => {
      expect(r.status).to.eq(200);
      expect(r.body.version, 'version, que é o que o ETag carrega').to.be.a('string');
      expect(r.body.species, 'species').to.be.an('array').and.have.length.greaterThan(0);
      expect(r.body.breeds, 'breeds').to.be.an('array').and.have.length.greaterThan(0);
      expect(r.body.colors, 'colors').to.be.an('array').and.have.length.greaterThan(0);
      expect(r.body.sizes, 'sizes').to.be.an('array').and.have.length.greaterThan(0);
      for (const cor of r.body.colors) {
        expect(cor, 'amostra de cor sem nome é adivinhação sob sol e para quem não distingue cores').to.have.property('label');
        expect(cor, 'a resposta não tem valor hexadecimal').to.not.have.property('hex');
      }
      expect(r.headers.etag, 'o revalidador barato existe de graça: a lista só muda por migração').to.be.a('string');
    });
  });
});
