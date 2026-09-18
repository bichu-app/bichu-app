/**
 * @critico — Lista de permissão sobre toda resposta pública (§3.4 e §4.1).
 *
 * A verificação é estrutural de propósito. Um cenário que confere campo a campo
 * passa hoje e fica cego amanhã, quando alguém acrescenta uma propriedade ao
 * tipo público: portão que só procura o que sumiu não enxerga o campo novo que
 * vazou. Aqui **qualquer chave fora da lista reprova, com o nome dela na
 * mensagem**.
 *
 * Três camadas, e as três precisam passar:
 * 1. chave fora da lista transcrita de `api/openapi.yaml`;
 * 2. valor com telefone, e-mail, CEP, logradouro ou chave de coordenada;
 * 3. UUID em resposta alcançável sem conta (ADR-0010 item 6, SEC-001).
 */
import { exigirRota, caminhoDe } from '../apoio/rotas';
import { criarConta, criarPet, emitirTag, chaveDeIdempotencia } from '../apoio/massa';
import {
  TAG_RESOLUTION,
  FOUND_REPORT_CREATED,
  PUBLIC_LOST_PET_PAGE,
  PUBLIC_LOST_CASE,
  chavesForaDaLista,
  vazamentosDeContato,
  uuidsEmRespostaPublica,
  type ArvoreDePermissao,
} from '../apoio/lista-de-permissao';
import type { AvisoCriado, OuProblema, PaginaPublicaDePerdidos, PetPublico, ResolucaoDeTag } from '../apoio/respostas';

function conferirSuperficiePublica(rotulo: string, corpo: unknown, arvore: ArvoreDePermissao, aceitaUuid = false): void {
  expect(chavesForaDaLista(corpo, arvore), `${rotulo}: chave fora da lista de permissão`).to.deep.eq([]);
  expect(vazamentosDeContato(corpo), `${rotulo}: contato mediado quebrado`).to.deep.eq([]);
  if (!aceitaUuid) {
    expect(uuidsEmRespostaPublica(corpo), `${rotulo}: identificador interno em resposta pública`).to.deep.eq([]);
  }
}

describe('@critico lista de permissão sobre toda resposta pública', () => {
  it('GET /v1/tags/{code} devolve a visão pública mínima e nada além', () => {
    criarConta('permissao-tag').then((conta) => {
      criarPet(conta).then((petId) => {
        emitirTag(conta, petId).then((tag) => {
          exigirRota('resolveTagCode', { code: tag.code });
          cy.request<OuProblema<ResolucaoDeTag>>({ method: 'GET', url: caminhoDe('resolveTagCode', { code: tag.code }), failOnStatusCode: false }).then((r) => {
            expect(r.status).to.eq(200);
            conferirSuperficiePublica('resolveTagCode', r.body, TAG_RESOLUTION);
          });
        });
      });
    });
  });

  it('POST /v1/tags/{code}/found-reports não devolve identificador interno', () => {
    criarConta('permissao-aviso').then((conta) => {
      criarPet(conta).then((petId) => {
        emitirTag(conta, petId).then((tag) => {
          exigirRota('createFoundReportFromTag', { code: tag.code });
          cy.request<OuProblema<AvisoCriado>>({
            method: 'POST',
            url: caminhoDe('createFoundReportFromTag', { code: tag.code }),
            failOnStatusCode: false,
            headers: { 'Idempotency-Key': chaveDeIdempotencia('permissao') },
            body: {},
          }).then((r) => {
            expect(r.status).to.eq(201);
            conferirSuperficiePublica('createFoundReportFromTag', r.body, FOUND_REPORT_CREATED);
          });
        });
      });
    });
  });

  it('GET /v1/public/lost-pets mostra bairro e nada mais preciso', () => {
    exigirRota('listPublicLostPets');

    cy.request<OuProblema<PaginaPublicaDePerdidos>>({
      method: 'GET',
      url: caminhoDe('listPublicLostPets'),
      failOnStatusCode: false,
      qs: { city: 'São Paulo' },
    }).then((r) => {
      expect(r.status).to.eq(200);
      conferirSuperficiePublica('listPublicLostPets', r.body, PUBLIC_LOST_PET_PAGE);

      // `area_label` é o teto de precisão: bairro e cidade, nunca ponto.
      for (const item of r.body.items ?? []) {
        expect(item, 'todo item da lista pública traz o bairro').to.have.property('area_label');
        expect(item, 'share_token é a chave estável, e não o id do caso').to.have.property('share_token');
      }
    });
  });

  it('GET /v1/public/lost-cases/{shareToken} mantém a mesma regra', () => {
    exigirRota('getPublicLostCase', { shareToken: 'irrelevante' });

    cy.request<OuProblema<PaginaPublicaDePerdidos>>({
      method: 'GET',
      url: caminhoDe('listPublicLostPets'),
      failOnStatusCode: false,
      qs: { city: 'São Paulo', limit: 1 },
    }).then((lista) => {
      const primeiro = (lista.body.items ?? [])[0];
      if (primeiro?.share_token === undefined) {
        throw new Error(
          'PRÉ-CONDIÇÃO AUSENTE: a lista pública de São Paulo veio vazia, então não há `share_token` para ' +
            'exercitar getPublicLostCase. É a massa da §2, que depende da tarefa de semeadura do item 5 da §4.3. ' +
            'Não é defeito do servidor.',
        );
      }
      cy.request<OuProblema<PetPublico>>({
        method: 'GET',
        url: caminhoDe('getPublicLostCase', { shareToken: primeiro.share_token }),
        failOnStatusCode: false,
      }).then((r) => {
        expect(r.status).to.eq(200);
        conferirSuperficiePublica('getPublicLostCase', r.body, PUBLIC_LOST_CASE);
      });
    });
  });

  it('a lista de permissão reprova de fato quando um campo a mais aparece', () => {
    // Prova negativa que vive no repositório, e não numa frase do relatório: se
    // o comparador deixar de acusar, este caso fica vermelho e alguém procura.
    const respostaAdulterada = {
      viewer: 'anonymous',
      pet: { display_name: 'Thor', species: 'dog', size: 'M', owner_phone: '+55 11 99999-0000' },
      lost: { is_lost: true, since: '2026-09-16T18:20:00Z' },
      already_notified: false,
    };

    expect(chavesForaDaLista(respostaAdulterada, TAG_RESOLUTION), 'a chave a mais precisa ser acusada pelo nome').to.deep.eq([
      'pet.owner_phone',
    ]);
    expect(vazamentosDeContato(respostaAdulterada).map((v) => v.caminho), 'o telefone precisa ser acusado pelo valor').to.deep.eq([
      'pet.owner_phone',
    ]);
    expect(
      uuidsEmRespostaPublica({ id: '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f' }),
      'UUID em resposta pública precisa ser acusado',
    ).to.deep.eq(['id']);
  });
});
