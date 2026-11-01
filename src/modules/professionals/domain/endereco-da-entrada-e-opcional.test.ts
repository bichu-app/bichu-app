import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { comoData } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';
import {
  faltasParaPublicar,
  ORDEM_DA_FALTA,
  projetarEntradaAdministrativa,
  retratoDaEntrada,
  type EntradaAdministrativa,
} from './escrita-do-diretorio.js';

const URL_DE_MIDIA = (chave: string): string => `https://midia.invalido/${chave}`;

const NASCEU_EM = Date.UTC(2026, 9, 18, 12, 0, 0) as Instant;

const AUTONOMO: EntradaAdministrativa = {
  slug: 'passeios-da-bia',
  kinds: ['walker'],
  entityKind: 'professional',
  displayName: 'Passeios da Bia',
  about: null,
  city: 'São Paulo',
  state: 'SP',
  neighborhood: 'Sumarezinho',
  logo: null,
  photo: null,
  imagens: [],
  postalCode: null,
  street: null,
  streetNumber: null,
  complement: null,
  phoneE164: '+5511987654321',
  siteUrl: null,
  status: 'published',
  source: 'import',
  claimStatus: 'unclaimed',
  verificacoes: [],
  publishedAt: comoData(NASCEU_EM),
  createdAt: comoData(NASCEU_EM),
  updatedAt: comoData(NASCEU_EM),
  version: 1,
};

void describe('o endereco de rua da entrada do diretorio', () => {
  void it('ISCA: nenhum dos quatro campos entra na lista do que falta para publicar', () => {
    for (const campo of ['postal_code', 'street', 'street_number', 'complement']) {
      assert.ok(
        !ORDEM_DA_FALTA.includes(campo as never),
        `${campo} nao pode ser exigido para publicar: quem nao tem endereco fixo tem de poder aparecer`,
      );
    }
  });

  void it('ISCA: um autonomo SEM endereco nenhum nao tem nada faltando', () => {
    assert.deepEqual(faltasParaPublicar(AUTONOMO), []);
    assert.deepEqual(projetarEntradaAdministrativa(AUTONOMO, URL_DE_MIDIA).missing_to_publish, []);
  });

  void it('ISCA: com endereco preenchido, continua sem nada faltando', () => {
    const comEndereco: EntradaAdministrativa = {
      ...AUTONOMO,
      postalCode: '05435000',
      street: 'Rua Harmonia',
      streetNumber: 's/n',
      complement: null,
    };
    assert.deepEqual(faltasParaPublicar(comEndereco), []);
  });

  void it('ISCA: a projecao do painel MOSTRA o endereco, porque a tela de edicao precisa dele', () => {
    const projetada = projetarEntradaAdministrativa({
      ...AUTONOMO,
      postalCode: '05435000',
      street: 'Rua Harmonia',
      streetNumber: '120A',
      complement: 'Sala 2',
    }, URL_DE_MIDIA);
    assert.equal(projetada.postal_code, '05435000');
    assert.equal(projetada.street, 'Rua Harmonia');
    assert.equal(projetada.street_number, '120A');
    assert.equal(projetada.complement, 'Sala 2');
  });

  void it('ISCA: o endereco NAO vai para a trilha de auditoria', () => {
    const retrato = retratoDaEntrada({
      ...AUTONOMO,
      postalCode: '05435000',
      street: 'Rua Harmonia',
      streetNumber: '120A',
      complement: 'Sala 2',
    });
    const serializado = JSON.stringify(retrato);
    for (const proibido of ['05435000', 'Rua Harmonia', '120A', 'Sala 2']) {
      assert.ok(!serializado.includes(proibido), `${proibido} nao pode entrar no retrato da trilha`);
    }
  });
});
