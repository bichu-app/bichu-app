/** O registro do achado: o que ele exige, e o que ele nunca deriva. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  RETENCAO_EM_DIAS,
  recusasDoRegistro,
  retencaoAPartirDe,
  rotuloDaArea,
  temCoordenada,
  temOndeSuficiente,
  type AchadoAvulso,
} from './registro-de-achado.js';
import type { Instant } from '../../../shared/types/brands.js';

const AGORA = 1_800_000_000_000 as Instant;
const DIA = 24 * 60 * 60 * 1000;

/** Avenida Paulista, 1578. Qualquer ponto do Brasil serve. */
const PAULISTA = { lat: -23.5614, lon: -46.656 };

function achado(ajustes: Partial<AchadoAvulso> = {}): AchadoAvulso {
  return {
    especie: 'dog',
    porte: 'M',
    achadoEm: (Number(AGORA) - 2 * DIA) as Instant,
    onde: { ...PAULISTA },
    ...ajustes,
  };
}

function campos(recusas: readonly { field: string }[]): string[] {
  return recusas.map((r) => r.field).sort();
}

void describe('critério 6: sem coordenada, o achado é registrado do mesmo jeito', () => {
  void it('só bairro e cidade basta', () => {
    const so_texto = achado({ onde: { neighborhood: 'Vila Madalena', city: 'São Paulo' } });
    assert.equal(temCoordenada(so_texto.onde), false);
    assert.equal(temOndeSuficiente(so_texto.onde), true);
    assert.deepEqual(recusasDoRegistro(so_texto, AGORA), []);
  });

  void it('só coordenada basta', () => {
    assert.deepEqual(recusasDoRegistro(achado(), AGORA), []);
  });

  void it('sem nenhum dos dois, recusa — e o campo apontado é `area`', () => {
    const sem = achado({ onde: {} });
    assert.deepEqual(campos(recusasDoRegistro(sem, AGORA)), ['area']);
  });

  void it('meia coordenada não é meio lugar', () => {
    const meia = achado({ onde: { lat: PAULISTA.lat } });
    assert.ok(campos(recusasDoRegistro(meia, AGORA)).includes('location.lon'));
  });

  void it('coordenada fora do retângulo do Brasil é recusada', () => {
    const trocada = achado({ onde: { lat: PAULISTA.lon, lon: PAULISTA.lat } });
    assert.deepEqual(campos(recusasDoRegistro(trocada, AGORA)), ['location.lat', 'location.lon']);
  });
});

void describe('as outras recusas', () => {
  void it('"achei amanhã" é recusado, com um minuto de folga de relógio', () => {
    const daqui30s = achado({ achadoEm: (Number(AGORA) + 30_000) as Instant });
    assert.deepEqual(recusasDoRegistro(daqui30s, AGORA), []);
    const amanha = achado({ achadoEm: (Number(AGORA) + DIA) as Instant });
    assert.deepEqual(campos(recusasDoRegistro(amanha, AGORA)), ['found_at']);
  });

  void it('raça em texto livre sem código é recusada', () => {
    const solto = achado({ racaTextoLivre: 'vira-lata caramelo' });
    assert.deepEqual(campos(recusasDoRegistro(solto, AGORA)), ['breed_free_text']);
    const comCodigo = achado({ racaTextoLivre: 'vira-lata caramelo', racaCodigo: 'srd' });
    assert.deepEqual(recusasDoRegistro(comCodigo, AGORA), []);
  });

  void it('as recusas vêm TODAS de uma vez, e não uma por requisição', () => {
    const tudoErrado = achado({
      onde: {},
      achadoEm: (Number(AGORA) + DIA) as Instant,
      racaTextoLivre: 'caramelo',
    });
    assert.deepEqual(campos(recusasDoRegistro(tudoErrado, AGORA)), [
      'area',
      'breed_free_text',
      'found_at',
    ]);
  });
});

void describe('a retenção é 30 dias a partir da CRIAÇÃO', () => {
  void it('e não a partir de quando o animal foi visto', () => {
    assert.equal(Number(retencaoAPartirDe(AGORA)), Number(AGORA) + RETENCAO_EM_DIAS * DIA);
    assert.equal(RETENCAO_EM_DIAS, 30);
  });
});

void describe('ISCA: nenhuma coordenada vira endereço (ADR-0006)', () => {
  void it('o achado só com ponto sai com `area_label` NULO, e não com um bairro', () => {
    const soPonto = achado({ onde: { ...PAULISTA } });
    assert.deepEqual(recusasDoRegistro(soPonto, AGORA), []);
    assert.equal(
      rotuloDaArea({ city: undefined, neighborhood: undefined }),
      null,
      'o rótulo passou a ser derivado de alguma coisa que não é o texto digitado',
    );
  });

  void it('`rotuloDaArea` lê SÓ bairro e cidade, e é a mesma função de `lostfound`', () => {
    assert.equal(rotuloDaArea({ neighborhood: 'Pinheiros', city: 'São Paulo' }), 'Pinheiros, São Paulo');
    assert.equal(rotuloDaArea({ city: 'São Paulo' }), 'São Paulo');
    assert.equal(rotuloDaArea({ neighborhood: 'Pinheiros' }), 'Pinheiros');
    assert.equal(rotuloDaArea({}), null);
  });

  void it('a mesma conferência ACUSA um rótulo montado a partir de coordenada', () => {
    const geocodificadorDeMentira = (onde: { lat?: number; lon?: number }): string | null =>
      onde.lat === undefined ? null : `Bairro de ${String(onde.lat)}`;
    assert.notEqual(
      geocodificadorDeMentira(PAULISTA),
      null,
      'a isca precisa mesmo produzir um rótulo a partir do ponto, senão ela não prova nada',
    );
    assert.equal(
      rotuloDaArea({ ...PAULISTA }),
      null,
      'o rótulo passou a ser derivado da coordenada: alguém ligou geocodificação',
    );
  });
});
