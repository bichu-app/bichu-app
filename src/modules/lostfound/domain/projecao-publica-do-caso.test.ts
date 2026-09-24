/**
 * A projeção pública do caso e o cartaz (BICHUS-76), sem servidor e sem banco.
 *
 * O que se prova aqui é regra, não fiação: que links saem nos caminhos do site
 * (ADR-0017, quadro das oito rotas), que texto livre passa pela redação do
 * canal mediado na saída, e que o caso sem área em texto continua tendo um
 * `area_label`, que o contrato declara obrigatório.
 *
 * O teste de não-vazamento de ponta a ponta, contra a resposta HTTP, mora em
 * `adapters/http/leitura-publica-do-caso.test.ts`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AbsoluteUrl, Instant } from '../../../shared/types/brands.js';
import { comoData } from '../../../shared/time/clock.js';
import type { CasoPublico } from '../ports/leitura-publica-do-caso.js';
import {
  cartazDoCaso,
  linksDoCaso,
  projecaoPublicaDoCaso,
} from './projecao-publica-do-caso.js';

const BASES = {
  baseDaWeb: 'https://web.exemplo.invalid/' as AbsoluteUrl,
  baseDeMidia: 'https://midia.exemplo.invalid' as AbsoluteUrl,
};
const TOKEN = 'k3J9-share-token-opaco-0001';
/** 2026-09-20T18:30:00.000Z */
const VISTO_EM = 1_789_929_000_000 as Instant;

function caso(parcial: Partial<CasoPublico> = {}): CasoPublico {
  return {
    shareToken: TOKEN,
    aberto: true,
    petNome: 'Thor',
    especie: 'dog',
    porte: 'M',
    racaRotulo: 'Vira-lata',
    corRotulo: 'Caramelo',
    marcas: 'Coleira vermelha.',
    cuidados: 'É medroso. Não corra atrás.',
    descricao: 'Fugiu pelo portão.',
    vistoPorUltimoEm: comoData(VISTO_EM),
    cidade: 'São Paulo',
    bairro: 'Pinheiros',
    chaveDaFoto: 'pets/abc/card/f00d.webp',
    doChamador: false,
    ...parcial,
  };
}

void describe('links do caso', () => {
  void it('o link compartilhável é a página do caso, /p/, e não a conversa /c/', () => {
    // `/c/{finderToken}` é a conversa de quem avisou sem ter conta (ADR-0017).
    // Um share_token ali faria o site chamar `getFinderConversation` com o
    // token errado, e todo link compartilhado no WhatsApp abriria um erro.
    const links = linksDoCaso(BASES.baseDaWeb, TOKEN);
    assert.equal(links.shareUrl, `https://web.exemplo.invalid/p/${TOKEN}`);
    assert.equal(links.posterUrl, `https://web.exemplo.invalid/cartaz/${TOKEN}`);
  });
});

void describe('projeção pública do caso (PublicLostCase)', () => {
  void it('monta os campos do contrato a partir do caso', () => {
    const corpo = projecaoPublicaDoCaso(caso(), BASES);
    assert.deepEqual(corpo, {
      share_token: TOKEN,
      pet_display_name: 'Thor',
      species: 'dog',
      breed_label: 'Vira-lata',
      size: 'M',
      primary_color: 'Caramelo',
      lost_since: '2026-09-20T18:30:00.000Z',
      area_label: 'Pinheiros, São Paulo',
      photo_url: 'https://midia.exemplo.invalid/pets/abc/card/f00d.webp',
      share_url: `https://web.exemplo.invalid/p/${TOKEN}`,
      description: 'Fugiu pelo portão.',
      care_notes: 'É medroso. Não corra atrás.',
      can_report_sighting: true,
      poster_url: `https://web.exemplo.invalid/cartaz/${TOKEN}`,
    });
  });

  void it('o tutor não vê o botão "vi este pet"', () => {
    assert.equal(projecaoPublicaDoCaso(caso({ doChamador: true }), BASES).can_report_sighting, false);
  });

  void it('sem foto pronta, photo_url é nulo, e não uma URL para um objeto que não existe', () => {
    assert.equal(projecaoPublicaDoCaso(caso({ chaveDaFoto: null }), BASES).photo_url, null);
  });

  void it('caso aberto só com coordenada sai com area_label nulo, e não com um rótulo inventado', () => {
    // O contrato tornou o campo anulável em 23/09: rótulo fixo dentro de um
    // campo de dado é indistinguível de um bairro com esse nome. O texto da
    // tela é do cliente.
    assert.equal(projecaoPublicaDoCaso(caso({ cidade: null, bairro: null }), BASES).area_label, null);
    assert.equal(cartazDoCaso(caso({ cidade: null, bairro: null }), BASES).area_label, null);
  });

  void it('telefone, e-mail e endereço escritos em texto livre saem redigidos', () => {
    const corpo = projecaoPublicaDoCaso(
      caso({
        descricao: 'Me liga no 11 98765-4321 ou tutor@exemplo.com',
        cuidados: 'Devolver na Rua das Flores, 123',
      }),
      BASES,
    );
    const texto = JSON.stringify(corpo);
    assert.doesNotMatch(texto, /98765/);
    assert.doesNotMatch(texto, /tutor@exemplo\.com/);
    assert.doesNotMatch(texto, /Flores, 123/);
  });
});

void describe('cartaz do caso (LostCasePoster)', () => {
  void it('monta os campos do contrato, com o link curto que vira o QR do papel', () => {
    const corpo = cartazDoCaso(caso(), BASES);
    assert.deepEqual(corpo, {
      pet_display_name: 'Thor',
      species: 'dog',
      breed_label: 'Vira-lata',
      size: 'M',
      primary_color: 'Caramelo',
      distinctive_marks: 'Coleira vermelha.',
      lost_since: '2026-09-20T18:30:00.000Z',
      area_label: 'Pinheiros, São Paulo',
      photo_url: 'https://midia.exemplo.invalid/pets/abc/card/f00d.webp',
      short_url: `https://web.exemplo.invalid/p/${TOKEN}`,
    });
  });

  void it('o cartaz não carrega o share_token como campo, nem a descrição do tutor', () => {
    const corpo = cartazDoCaso(caso(), BASES) as Record<string, unknown>;
    assert.equal('share_token' in corpo, false);
    assert.equal('description' in corpo, false);
    assert.equal('care_notes' in corpo, false);
    // ADR-0010: nenhuma recompensa, em nenhuma forma.
    assert.equal('reward_note' in corpo, false);
  });

  void it('marcas com telefone saem redigidas: o cartaz é colado em poste', () => {
    const corpo = cartazDoCaso(caso({ marcas: 'Coleira com o fone 11987654321' }), BASES);
    assert.doesNotMatch(JSON.stringify(corpo), /987654321/);
  });
});
