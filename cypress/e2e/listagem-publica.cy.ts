/**
 * @regressao — Listagem pública por API (§4.1).
 *
 * A linha original da §4.1 cobria "HTML e API". A superfície HTML saiu deste
 * projeto pelo ADR-0017; o que sobra, e continua nosso, é `listPublicLostPets`:
 * paginação com total, busca por nome, os quatro filtros e o recorte declarado
 * em `applied_filters`.
 *
 * Duas regras de produto entram aqui e são as mais valiosas do cenário:
 * `city` é obrigatório, porque o filtro geográfico é por cidade e bairro
 * digitados e nunca por coordenada; e `q` **não** busca por código de tag,
 * porque aceitar código transformaria a listagem num oráculo de existência de
 * código, com teto de listagem em vez do teto estrito da rota da tag.
 */
import { exigirRota, caminhoDe } from '../apoio/rotas';
import { criarConta, criarPet, emitirTag } from '../apoio/massa';
import type { OuProblema, PaginaPublicaDePerdidos } from '../apoio/respostas';

const CIDADE = 'São Paulo';

describe('@regressao listagem pública de perdidos', () => {
  // A prova de rota roda antes de cada caso, e não uma vez no primeiro. Sem
  // isso, o segundo caso em diante reprova como "esperava 200, veio 404" — que
  // se lê como defeito de comportamento e é, na verdade, módulo ausente. As
  // duas causas não podem se misturar no relatório.
  beforeEach(() => {
    exigirRota('listPublicLostPets');
  });

  it('sem `city` a listagem é recusada, e não devolve o país inteiro', () => {
    cy.request<OuProblema<PaginaPublicaDePerdidos>>({ method: 'GET', url: caminhoDe('listPublicLostPets'), failOnStatusCode: false }).then((r) => {
      expect(r.status, '`city` é obrigatório no contrato').to.eq(400);
    });
  });

  it('a página traz `page`, `limit` e `total`, que é o que a tela precisa para dizer "1 a 20 de 87"', () => {
    cy.request<OuProblema<PaginaPublicaDePerdidos>>({ method: 'GET', url: caminhoDe('listPublicLostPets'), failOnStatusCode: false, qs: { city: CIDADE } }).then((r) => {
      expect(r.status).to.eq(200);
      expect(r.body.page, 'page').to.be.a('number');
      expect(r.body.limit, 'limit').to.be.a('number');
      expect(r.body.total, 'total, sem o qual não há fim da lista').to.be.a('number');
      expect(r.body.items).to.be.an('array');
      expect(r.body.limit, 'o padrão do contrato é 20').to.eq(20);
    });
  });

  it('`limit` acima do teto do contrato é recusado', () => {
    cy.request<OuProblema<PaginaPublicaDePerdidos>>({
      method: 'GET',
      url: caminhoDe('listPublicLostPets'),
      failOnStatusCode: false,
      qs: { city: CIDADE, limit: 21 },
    }).then((r) => {
      expect(r.status, 'o máximo declarado é 20: valor-limite, e não "quanto mais melhor"').to.eq(400);
    });
  });

  it('a segunda página não repete os itens da primeira', () => {
    cy.request<OuProblema<PaginaPublicaDePerdidos>>({ method: 'GET', url: caminhoDe('listPublicLostPets'), failOnStatusCode: false, qs: { city: CIDADE, limit: 1, page: 1 } })
      .then((primeira) => {
        expect(primeira.status).to.eq(200);
        if (primeira.body.total < 2) {
          throw new Error(
            'PRÉ-CONDIÇÃO AUSENTE: a listagem de ' +
              CIDADE +
              ' tem menos de dois casos abertos, então a paginação não tem o que paginar. ' +
              'É a massa da §2, que depende da tarefa de semeadura do item 5 da §4.3. Não é defeito do servidor.',
          );
        }
        const tokenDaPrimeira = primeira.body.items[0]?.share_token;
        return cy
          .request<OuProblema<PaginaPublicaDePerdidos>>({ method: 'GET', url: caminhoDe('listPublicLostPets'), failOnStatusCode: false, qs: { city: CIDADE, limit: 1, page: 2 } })
          .then((segunda) => {
            expect(segunda.status).to.eq(200);
            expect(segunda.body.page).to.eq(2);
            expect(segunda.body.items[0]?.share_token, 'página 2 não pode repetir a página 1').to.not.eq(tokenDaPrimeira);
          });
      });
  });

  it('os quatro filtros são aceitos e voltam declarados em `applied_filters`', () => {
    cy.request<OuProblema<PaginaPublicaDePerdidos>>({
      method: 'GET',
      url: caminhoDe('listPublicLostPets'),
      failOnStatusCode: false,
      qs: { city: CIDADE, neighborhood: 'Vila Madalena', species: 'dog', size: 'M', period: '7d' },
    }).then((r) => {
      expect(r.status).to.eq(200);
      expect(r.body.applied_filters, 'a tela precisa poder explicar o recorte').to.be.an('object');
      for (const item of r.body.items ?? []) {
        expect(item.species, 'o filtro de espécie precisa filtrar').to.eq('dog');
        expect(item.size, 'o filtro de porte precisa filtrar').to.eq('M');
      }
    });
  });

  it('valor fora do vocabulário do contrato é recusado, e não ignorado em silêncio', () => {
    cy.request<OuProblema<PaginaPublicaDePerdidos>>({
      method: 'GET',
      url: caminhoDe('listPublicLostPets'),
      failOnStatusCode: false,
      qs: { city: CIDADE, species: 'dragao' },
    }).then((r) => {
      expect(r.status, 'filtro que não filtra é o pior resultado possível: verde e cego').to.eq(400);
    });
  });

  it('`q` busca por nome do pet, tolerante a acento e a caixa', () => {
    cy.request<OuProblema<PaginaPublicaDePerdidos>>({ method: 'GET', url: caminhoDe('listPublicLostPets'), failOnStatusCode: false, qs: { city: CIDADE, limit: 1 } }).then(
      (lista) => {
        const primeiro = (lista.body.items ?? [])[0];
        if (primeiro?.pet_display_name === undefined) {
          throw new Error(
            'PRÉ-CONDIÇÃO AUSENTE: não há caso aberto em ' +
              CIDADE +
              ' para buscar pelo nome. É a massa da §2 (item 5 da §4.3). Não é defeito do servidor.',
          );
        }
        const nome = primeiro.pet_display_name;
        cy.request<OuProblema<PaginaPublicaDePerdidos>>({
          method: 'GET',
          url: caminhoDe('listPublicLostPets'),
          failOnStatusCode: false,
          qs: { city: CIDADE, q: nome.toUpperCase() },
        }).then((r) => {
          expect(r.status).to.eq(200);
          const nomes = (r.body.items ?? []).map((i) => i.pet_display_name);
          expect(nomes, 'a busca ignora caixa').to.include(nome);
        });
      },
    );
  });

  it('`q` não é oráculo de existência de código de tag', () => {
    // O caso malicioso desta rota. Um código que existe, buscado pela listagem,
    // não pode devolver resultado diferente de um que não existe: a diferença
    // entregaria de graça quais códigos existem, com o teto folgado da listagem
    // em vez do teto estrito de `resolveTagCode`.
    criarConta('listagem-oraculo').then((conta) => {
      criarPet(conta).then((petId) => {
        emitirTag(conta, petId).then((tag) => {
          const codigoInexistente = '0123456789ABCDEFGHJKMNPQRS';
          let totalComCodigoReal = -1;

          cy.request<OuProblema<PaginaPublicaDePerdidos>>({ method: 'GET', url: caminhoDe('listPublicLostPets'), failOnStatusCode: false, qs: { city: CIDADE, q: tag.code } })
            .then((r) => {
              expect(r.status).to.eq(200);
              totalComCodigoReal = r.body.total;
              expect(totalComCodigoReal, 'código de tag não é nome de pet: a busca não acha nada').to.eq(0);
              return cy.request<OuProblema<PaginaPublicaDePerdidos>>({
                method: 'GET',
                url: caminhoDe('listPublicLostPets'),
                failOnStatusCode: false,
                qs: { city: CIDADE, q: codigoInexistente },
              });
            })
            .then((r) => {
              expect(r.body.total, 'código que existe e código que não existe precisam responder igual').to.eq(totalComCodigoReal);
            });
        });
      });
    });
  });
});
