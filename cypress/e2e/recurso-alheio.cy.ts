/**
 * @regressao — Pet de outro tutor responde 404, e não 403 (§4.1).
 *
 * A diferença não é estética. 403 confirma que o recurso existe, e confirmar a
 * existência de um pet alheio a qualquer pessoa com um cadastro grátis já é o
 * vazamento: basta varrer identificadores e separar 403 de 404 para saber
 * quantos pets a base tem e quais ids são válidos.
 *
 * O contrário também é regra e está no mesmo lugar: sem permissão sobre o
 * **próprio** recurso é 403, e sem token é 401. Três respostas para três
 * situações, e um teste que só confere "não deu 200" não enxerga nenhuma delas.
 */
import { exigirRota, caminhoDe } from '../apoio/rotas';
import { criarConta, criarPet, emitirTag, autorizacao } from '../apoio/massa';
import type { ContextoDeDonoDaTag, OuProblema, Pet } from '../apoio/respostas';

describe('@regressao recurso de outro tutor', () => {
  beforeEach(() => {
    exigirRota('getPet', { petId: '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f' });
  });

  it('GET /v1/pets/{petId} de outro tutor responde 404, e não 403', () => {
    criarConta('alheio-dono').then((dono) => {
      criarPet(dono, 'Thor').then((petId) => {
        criarConta('alheio-intruso').then((intruso) => {
          cy.request<OuProblema<Pet>>({
            method: 'GET',
            url: caminhoDe('getPet', { petId }),
            headers: autorizacao(intruso),
            failOnStatusCode: false,
          }).then((r) => {
            expect(r.status, 'confirmar a existência de pet alheio já é vazamento').to.eq(404);
            expect(r.body.type, 'o type precisa ser o de não encontrado, e não o de proibido').to.include('not-found');
          });

          // O mesmo id, para o dono, responde 200: sem isto o 404 acima poderia
          // ser só o pet não existir, e o cenário estaria verde sem verificar
          // nada.
          cy.request<OuProblema<Pet>>({ method: 'GET', url: caminhoDe('getPet', { petId }), headers: autorizacao(dono), failOnStatusCode: false }).then((r) => {
            expect(r.status, 'o mesmo id responde 200 para o dono').to.eq(200);
            expect(r.body.id).to.eq(petId);
          });
        });
      });
    });
  });

  it('escrever no pet alheio também responde 404', () => {
    criarConta('alheio-escrita-dono').then((dono) => {
      criarPet(dono).then((petId) => {
        criarConta('alheio-escrita-intruso').then((intruso) => {
          cy.request<OuProblema<Pet>>({
            method: 'PATCH',
            url: caminhoDe('getPet', { petId }),
            headers: autorizacao(intruso),
            failOnStatusCode: false,
            body: { name: 'Renomeado pelo intruso' },
          }).then((r) => {
            expect(r.status, 'leitura e escrita precisam responder igual, senão a escrita vira o oráculo').to.eq(404);
          });
        });
      });
    });
  });

  it('a tag de outro tutor responde 404 em `owner-context`, e o achador continua vendo 410 ou 404 na rota dele', () => {
    criarConta('alheio-tag-dono').then((dono) => {
      criarPet(dono).then((petId) => {
        emitirTag(dono, petId).then((tag) => {
          criarConta('alheio-tag-intruso').then((intruso) => {
            exigirRota('getTagOwnerContext', { code: tag.code });

            cy.request<OuProblema<ContextoDeDonoDaTag>>({
              method: 'GET',
              url: caminhoDe('getTagOwnerContext', { code: tag.code }),
              headers: autorizacao(intruso),
              failOnStatusCode: false,
            }).then((r) => {
              expect(
                r.status,
                'um 404 para três casos: não existe, foi revogada, ou é de outro tutor. Distinguir faria desta rota um oráculo de enumeração com cadastro grátis na frente',
              ).to.eq(404);
            });

            cy.request<OuProblema<ContextoDeDonoDaTag>>({
              method: 'GET',
              url: caminhoDe('getTagOwnerContext', { code: tag.code }),
              headers: autorizacao(dono),
              failOnStatusCode: false,
            }).then((r) => {
              expect(r.status, 'para o dono, 200 com os dois identificadores').to.eq(200);
              expect(r.body.pet_id).to.eq(petId);
              expect(r.body.tag_id).to.eq(tag.tagId);
            });
          });
        });
      });
    });
  });

  it('sem token nenhum, a resposta é 401 e não 404', () => {
    criarConta('alheio-sem-token').then((dono) => {
      criarPet(dono).then((petId) => {
        cy.request<OuProblema<Pet>>({ method: 'GET', url: caminhoDe('getPet', { petId }), failOnStatusCode: false }).then((r) => {
          expect(r.status, '401 manda entrar; 404 faria o app esconder um recurso que é da pessoa').to.eq(401);
          expect(r.body.next_action).to.eq('sign_in');
        });
      });
    });
  });
});
