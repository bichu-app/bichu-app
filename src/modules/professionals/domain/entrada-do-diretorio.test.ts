import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  distanciaNaGrade,
  GRADE_EM_METROS,
  projetarEnderecoComercial,
  projetarEntrada,
  type EntradaDoDiretorio,
  urlDaDerivada,
} from './entrada-do-diretorio.js';
import { PONTUACAO_VAZIA } from './avaliacao-do-local.js';
import {
  evidenciasAprovadas,
  nivelDerivado,
  type VerificacaoDaEntidade,
} from './nivel-de-verificacao.js';

const URL_DE_MIDIA = (chave: string): string => `https://img.bichu.test/${chave}`;

function entrada(ajustes: Partial<EntradaDoDiretorio> = {}): EntradaDoDiretorio {
  return {
    slug: 'clinica-veterinaria-santa-barbara',
    kinds: ['clinic'],
    entityKind: 'professional',
    displayName: 'Clínica Veterinária Santa Bárbara',
    about: 'Pronto atendimento 24 horas.',
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Pinheiros',
    phoneE164: '+551130612200',
    siteUrl: null,
    verificacoes: [],
    distanciaEmMetros: null,
    logoPublicKey: null,
    pontuacao: PONTUACAO_VAZIA,
    ...ajustes,
  };
}

const aprovada = (evidenceKind: VerificacaoDaEntidade['evidenceKind']): VerificacaoDaEntidade => ({
  evidenceKind,
  decision: 'approved',
});
const pendente = (evidenceKind: VerificacaoDaEntidade['evidenceKind']): VerificacaoDaEntidade => ({
  evidenceKind,
  decision: 'pending',
});
const recusada = (evidenceKind: VerificacaoDaEntidade['evidenceKind']): VerificacaoDaEntidade => ({
  evidenceKind,
  decision: 'rejected',
});

void describe('o nivel de verificacao e DERIVADO, e so prova aprovada conta', () => {
  void it('sem verificacao nenhuma, none -- que e estado publicavel', () => {
    assert.equal(nivelDerivado([]), 'none');
  });

  void it('CRMV, CNPJ e documento aprovados dao document_verified', () => {
    assert.equal(nivelDerivado([aprovada('crmv')]), 'document_verified');
    assert.equal(nivelDerivado([aprovada('cnpj')]), 'document_verified');
    assert.equal(nivelDerivado([aprovada('document')]), 'document_verified');
  });

  void it('retorno de telefone prova CONTATO, e nao identidade', () => {
    assert.equal(
      nivelDerivado([aprovada('phone_callback')]),
      'contact_verified',
      'ISCA: com `phone_callback` em EVIDENCIAS_DE_DOCUMENTO, atender ao ' +
        'telefone passaria a valer por documento conferido.',
    );
  });

  void it('PENDENTE nao conta: pedir verificacao nao e ser verificado', () => {
    assert.equal(nivelDerivado([pendente('crmv')]), 'none');
    assert.equal(
      nivelDerivado([aprovada('phone_callback'), pendente('document')]),
      'contact_verified',
      'a prova pendente ao lado de uma aprovada nao pode levantar o nivel.',
    );
  });

  void it('RECUSADA nao conta: um "nao" ja dado nao vira selo', () => {
    assert.equal(nivelDerivado([recusada('cnpj')]), 'none');
    assert.equal(nivelDerivado([recusada('document'), aprovada('phone_callback')]), 'contact_verified');
  });

  void it('a prova mais forte vence, na ordem em que ela chegar', () => {
    assert.equal(nivelDerivado([aprovada('phone_callback'), aprovada('crmv')]), 'document_verified');
    assert.equal(nivelDerivado([aprovada('crmv'), aprovada('phone_callback')]), 'document_verified');
  });

  void it('as evidencias saem sem repeticao, em ordem de forca, e vazias em none', () => {
    assert.deepEqual(
      evidenciasAprovadas([aprovada('phone_callback'), aprovada('cnpj'), aprovada('cnpj')]),
      ['cnpj', 'phone_callback'],
    );
    assert.deepEqual(evidenciasAprovadas([pendente('crmv')]), []);
  });

  void it('o selo e a lista de provas sao coerentes por construcao', () => {
    const verificacoes = [aprovada('crmv'), pendente('cnpj')];
    assert.equal(nivelDerivado(verificacoes), 'document_verified');
    assert.deepEqual(
      evidenciasAprovadas(verificacoes),
      ['crmv'],
      'dizer "verificado" sem dizer O QUE foi verificado e o que o ADR-0011 proibe.',
    );
  });
});

void describe('a distancia sai na grade de 100 m, e nunca mente', () => {
  void it('sem medicao, nulo -- e nulo e um resultado', () => {
    assert.equal(
      distanciaNaGrade(null),
      null,
      'ISCA: devolver 0 aqui poria "0 m" no cartao de quem nao foi medido.',
    );
  });

  void it('arredonda para a grade em que o proprio ponto foi quantizado', () => {
    assert.equal(distanciaNaGrade(1234), 1200);
    assert.equal(distanciaNaGrade(1250), 1300);
    assert.equal(distanciaNaGrade(4980), 5000);
  });

  void it('quem esta pertissimo nao vira zero: o piso e uma celula', () => {
    assert.equal(
      distanciaNaGrade(12),
      GRADE_EM_METROS,
      'ISCA: com `Math.round` puro, 12 m viram 0 -- e "0 m" numa lista le-se ' +
        '"esta aqui dentro", sobre um ponto que ja foi arredondado a 100 m.',
    );
    assert.equal(distanciaNaGrade(0), GRADE_EM_METROS);
  });

  void it('valor nao finito e tratado como ausencia, e nao propagado', () => {
    assert.equal(distanciaNaGrade(Number.NaN), null);
    assert.equal(distanciaNaGrade(Number.POSITIVE_INFINITY), null);
  });
});

void describe('a projecao publica da entrada', () => {
  void it('devolve quinze campos, e nenhum a mais', () => {
    const projetada = projetarEntrada(entrada({ verificacoes: [aprovada('crmv')] }), URL_DE_MIDIA);
    assert.deepEqual(Object.keys(projetada).sort(), [
      'about',
      'city',
      'display_name',
      'distance_m',
      'entity_kind',
      'kind',
      'kinds',
      'logo_url',
      'neighborhood',
      'phone_e164',
      'rating',
      'site_url',
      'slug',
      'state',
      'verification',
    ]);
  });

  void it('ISCA: o ORIGINAL nao vaza para a resposta de leitura, em nenhuma categoria', () => {
    for (const original of [
      'directory/original/KioqKioqKioqKioqKioqKg',
      'people/original/KioqKioqKioqKioqKioqKg',
      'pets/original/KioqKioqKioqKioqKioqKg',
      'products/original/KioqKioqKioqKioqKioqKg',
      'found-reports/abc/original/KioqKioqKioqKioqKioqKg',
      'found-reports/abc/sanitized/KioqKioqKioqKioqKioqKg.jpeg',
    ]) {
      assert.equal(urlDaDerivada(original, URL_DE_MIDIA), null, original);
      assert.equal(
        projetarEntrada(entrada({ logoPublicKey: original }), URL_DE_MIDIA).logo_url,
        null,
        original,
      );
    }

    assert.equal(
      projetarEntrada(
        entrada({ logoPublicKey: 'directory/card/KioqKioqKioqKioqKioqKg.jpeg' }),
        URL_DE_MIDIA,
      ).logo_url,
      'https://img.bichu.test/directory/card/KioqKioqKioqKioqKioqKg.jpeg',
    );
  });

  void it('ISCA: entrada SEM logo nao quebra a listagem -- o cartao sai sem imagem', () => {
    const semLogo = projetarEntrada(entrada({ logoPublicKey: null }), URL_DE_MIDIA);
    assert.equal(semLogo.logo_url, null);
    assert.equal(semLogo.display_name, entrada().displayName);
    assert.ok(semLogo.slug.length > 0);
    assert.equal(semLogo.verification.level, 'none');

    const pagina = [
      entrada({ logoPublicKey: 'directory/card/AAAAAAAAAAAAAAAAAAAAAA.jpeg' }),
      entrada({ logoPublicKey: null }),
      entrada({ logoPublicKey: 'directory/thumb/BBBBBBBBBBBBBBBBBBBBBB.jpeg' }),
    ].map((e) => projetarEntrada(e, URL_DE_MIDIA));
    assert.equal(pagina.length, 3);
    assert.deepEqual(
      pagina.map((p) => p.logo_url === null),
      [false, true, false],
    );
  });

  void it('a entrada de ONG nao traz nem um campo a mais que a comum', () => {
    const ong = projetarEntrada(entrada({ entityKind: 'organization' }), URL_DE_MIDIA);
    const comum = projetarEntrada(entrada({ entityKind: 'professional' }), URL_DE_MIDIA);
    assert.deepEqual(Object.keys(ong).sort(), Object.keys(comum).sort());
    assert.equal(JSON.stringify(ong).includes('created_by'), false);
    assert.equal(JSON.stringify(ong).includes('claimed_by'), false);
  });

  void it('NAO devolve identificador interno: o endereco e o slug (ADR-0010)', () => {
    const bruto = JSON.stringify(projetarEntrada(entrada(), URL_DE_MIDIA));
    assert.equal(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(bruto),
      false,
      'nenhum UUID na projecao: nem o da entrada, nem o de conta nenhuma.',
    );
    for (const proibido of ['"id"', 'user_id', 'geo', '"lat"', '"lon"']) {
      assert.equal(
        bruto.includes(proibido),
        false,
        `ISCA: ${proibido} apareceu na projecao. O portao de contrato so procura ` +
          'o que SUMIU da resposta; propriedade a mais passa por ele.',
      );
    }
  });

  void it('o selo sai derivado das provas, e nao copiado de um campo', () => {
    assert.deepEqual(projetarEntrada(entrada({ verificacoes: [aprovada('cnpj')] }), URL_DE_MIDIA).verification, {
      level: 'document_verified',
      evidence_kinds: ['cnpj'],
    });
    assert.deepEqual(projetarEntrada(entrada(), URL_DE_MIDIA).verification, {
      level: 'none',
      evidence_kinds: [],
    });
  });

  void it('leva a distancia ja na grade, e o nulo intacto', () => {
    assert.equal(projetarEntrada(entrada({ distanciaEmMetros: 2740 }), URL_DE_MIDIA).distance_m, 2700);
    assert.equal(projetarEntrada(entrada({ distanciaEmMetros: null }), URL_DE_MIDIA).distance_m, null);
  });

  void it('cidade, UF e bairro saem como texto, e nao viram rotulo unico', () => {
    const projetada = projetarEntrada(entrada(), URL_DE_MIDIA);
    assert.equal(projetada.city, 'São Paulo');
    assert.equal(projetada.state, 'SP');
    assert.equal(projetada.neighborhood, 'Pinheiros');
  });

  void it('entrada sem lugar nenhum projeta nulos, e nao texto vazio', () => {
    const projetada = projetarEntrada(entrada({ city: null, state: null, neighborhood: null }), URL_DE_MIDIA);
    assert.equal(projetada.city, null);
    assert.equal(projetada.neighborhood, null);
  });
});

void describe('o tipo de entidade e eixo SEPARADO da atividade', () => {
  void it('a ONG projeta organization, e a atividade dela continua sendo a atividade', () => {
    const projetada = projetarEntrada(entrada({ entityKind: 'organization', kinds: ['clinic'] }), URL_DE_MIDIA);
    assert.equal(projetada.entity_kind, 'organization');
    assert.equal(projetada.kind, 'clinic');
  });

  void it('entrada comum projeta professional', () => {
    const projetada = projetarEntrada(entrada({ entityKind: 'professional' }), URL_DE_MIDIA);
    assert.equal(projetada.entity_kind, 'professional');
  });

  void it('os dois eixos saem SEMPRE os dois, e nenhum substitui o outro', () => {
    const projetada = projetarEntrada(entrada({ entityKind: 'organization', kinds: ['vet'] }), URL_DE_MIDIA);
    assert.equal(projetada.kind, 'vet');
    assert.notEqual(projetada.kind, 'organization');
    assert.equal(projetada.entity_kind, 'organization');
  });
});

void describe('o endereco comercial da entrada', () => {
  void it('os quatro campos atravessam como GRAVADOS, sem compor e sem normalizar', () => {
    const projetado = projetarEnderecoComercial({
      postalCode: '05422030',
      street: 'Rua Teodoro Sampaio',
      streetNumber: 's/n',
      complement: 'Sala 3',
    });
    assert.deepEqual(projetado, {
      postal_code: '05422030',
      street: 'Rua Teodoro Sampaio',
      street_number: 's/n',
      complement: 'Sala 3',
    });
  });

  void it('sem endereco, os quatro saem NULOS -- e nulo e o estado normal', () => {
    assert.deepEqual(
      projetarEnderecoComercial({
        postalCode: null,
        street: null,
        streetNumber: null,
        complement: null,
      }),
      { postal_code: null, street: null, street_number: null, complement: null },
    );
  });

  void it('ISCA DE FRONTEIRA: a projecao da LISTA nao carrega nenhum dos quatro', () => {
    const chaves = Object.keys(projetarEntrada(entrada(), URL_DE_MIDIA));
    for (const campo of ['postal_code', 'street', 'street_number', 'complement']) {
      assert.ok(
        !chaves.includes(campo),
        `\`${campo}\` entrou na projecao COMUM: a listagem passaria a devolver ` +
          'endereco de porta em ate vinte cartoes, que nenhuma tela pediu',
      );
    }
  });
});
