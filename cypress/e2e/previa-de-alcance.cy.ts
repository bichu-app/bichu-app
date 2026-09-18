/**
 * @regressao — Prévia de alcance: as variantes de `reach_status` (§4.1, §5.8).
 *
 * A regra do produto é uma frase: **mostrar zero no lugar de `unavailable` ou de
 * `no_location` é mentir para alguém em pânico.** Zero tutores é um fato;
 * "não consegui calcular" é outra coisa; "não existe raio porque o caso não tem
 * coordenada" é uma terceira. A tela tem texto diferente para cada uma.
 *
 * Divergência que eu registro em vez de contornar: a §4.1 fala em "as quatro
 * variantes", mas `LostCaseReachPreview.reach_status` declara **três**
 * (`computed`, `unavailable`, `no_location`). A quarta, `queued`, existe só em
 * `AlertDispatch`, que é a resposta de `openLostCase` — e é lá que ela é
 * exercitada, no cenário do ciclo completo. Escrever aqui um caso para `queued`
 * seria escrever contra um vocabulário que esta operação não tem.
 */
import { exigirRota, caminhoDe } from '../apoio/rotas';
import { criarConta, criarPet, autorizacao } from '../apoio/massa';
import type { OuProblema, PreviaDeAlcance } from '../apoio/respostas';

const ESTADOS_DA_PREVIA = ['computed', 'unavailable', 'no_location'];
const BLOQUEIOS = ['contact_channel_unverified', 'pet_photo_missing', 'pet_already_lost'];

describe('@regressao prévia de alcance', () => {
  it('com coordenada, o estado é do vocabulário fechado e o corpo é coerente', () => {
    criarConta('previa-com-ponto').then((conta) => {
      criarPet(conta).then((petId) => {
        exigirRota('previewLostCaseReach', { petId });

        exigirRota('previewLostCaseReach', { petId });
        cy.request<OuProblema<PreviaDeAlcance>>({
          method: 'GET',
          url: caminhoDe('previewLostCaseReach', { petId }),
          headers: autorizacao(conta),
          failOnStatusCode: false,
          qs: { lat: -23.5505, lon: -46.6333 },
        }).then((r) => {
          expect(r.status).to.eq(200);
          expect(r.body.reach_status, `vocabulário fechado: ${ESTADOS_DA_PREVIA.join(', ')}`).to.be.oneOf(ESTADOS_DA_PREVIA);
          expect(r.body.radius_m, 'radius_m é obrigatório').to.be.a('number');
          expect(r.body.blockers, 'blockers é obrigatório, mesmo vazio').to.be.an('array');

          if (r.body.reach_status === 'computed') {
            expect(r.body.reachable_tutors, 'computed conta tutores, inclusive zero').to.be.a('number');
          }
          if (r.body.reach_status === 'unavailable') {
            expect(r.body.reachable_tutors, 'unavailable precisa ser nulo, e nunca zero').to.eq(null);
          }
        });
      });
    });
  });

  it('sem coordenada nenhuma, o estado é `no_location` e não `computed` com zero', () => {
    criarConta('previa-sem-ponto').then((conta) => {
      criarPet(conta).then((petId) => {
        exigirRota('previewLostCaseReach', { petId });
        cy.request<OuProblema<PreviaDeAlcance>>({
          method: 'GET',
          url: caminhoDe('previewLostCaseReach', { petId }),
          headers: autorizacao(conta),
          failOnStatusCode: false,
        }).then((r) => {
          expect(r.status).to.eq(200);
          expect(
            r.body.reach_status,
            'a conta nova não tem localização de referência e nenhuma coordenada foi passada: não há raio',
          ).to.eq('no_location');
          expect(r.body.reachable_tutors, 'sem raio não há contagem: zero aqui seria mentira').to.not.eq(0);
        });
      });
    });
  });

  it('falta de coordenada não é bloqueio de abertura', () => {
    criarConta('previa-bloqueio').then((conta) => {
      criarPet(conta).then((petId) => {
        exigirRota('previewLostCaseReach', { petId });
        cy.request<OuProblema<PreviaDeAlcance>>({
          method: 'GET',
          url: caminhoDe('previewLostCaseReach', { petId }),
          headers: autorizacao(conta),
          failOnStatusCode: false,
        }).then((r) => {
          expect(r.status).to.eq(200);
          for (const bloqueio of r.body.blockers as string[]) {
            expect(bloqueio, `bloqueio fora do vocabulário: ${bloqueio}`).to.be.oneOf(BLOQUEIOS);
          }
          expect(
            r.body.blockers,
            'falta de coordenada reduz o alcance, não a existência do caso, e por isso não pode aparecer como bloqueio',
          ).to.not.include('no_location');
        });
      });
    });
  });

  it('a conta recém-criada traz o bloqueio de canal não verificado, e a tela tem o texto sem segunda chamada', () => {
    criarConta('previa-nao-verificada').then((conta) => {
      criarPet(conta).then((petId) => {
        exigirRota('previewLostCaseReach', { petId });
        cy.request<OuProblema<PreviaDeAlcance>>({
          method: 'GET',
          url: caminhoDe('previewLostCaseReach', { petId }),
          headers: autorizacao(conta),
          failOnStatusCode: false,
          qs: { lat: -23.5505, lon: -46.6333 },
        }).then((r) => {
          expect(r.status).to.eq(200);
          expect(
            r.body.blockers,
            'a conta nasce com e-mail não verificado; a prévia precisa dizer isso antes de a pessoa tentar abrir o caso',
          ).to.include('contact_channel_unverified');
        });
      });
    });
  });

  it('coordenada fora da faixa do contrato é recusada', () => {
    criarConta('previa-limite').then((conta) => {
      criarPet(conta).then((petId) => {
        exigirRota('previewLostCaseReach', { petId });
        cy.request<OuProblema<PreviaDeAlcance>>({
          method: 'GET',
          url: caminhoDe('previewLostCaseReach', { petId }),
          headers: autorizacao(conta),
          failOnStatusCode: false,
          qs: { lat: 40.7128, lon: -74.006 },
        }).then((r) => {
          expect(r.status, 'a faixa declarada é lat -34 a 6 e lon -74 a -32: Nova York está fora').to.eq(400);
        });
      });
    });
  });

  it('a prévia de pet alheio responde 404', () => {
    criarConta('previa-dono').then((dono) => {
      criarPet(dono).then((petId) => {
        criarConta('previa-intruso').then((intruso) => {
          exigirRota('previewLostCaseReach', { petId });
          cy.request<OuProblema<PreviaDeAlcance>>({
            method: 'GET',
            url: caminhoDe('previewLostCaseReach', { petId }),
            headers: autorizacao(intruso),
            failOnStatusCode: false,
          }).then((r) => {
            expect(r.status, 'a prévia roda consulta geoespacial: é a rota mais cara para servir de oráculo').to.eq(404);
          });
        });
      });
    });
  });
});
