/**
 * A projeção do perfil público do pet (BICHUS-45), sem servidor e sem banco.
 *
 * O teste de não-vazamento de ponta a ponta mora em
 * `adapters/http/perfil-publico.test.ts`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AbsoluteUrl } from '../../../shared/types/brands.js';
import type { PerfilPublicoDoPet } from '../ports/perfil-publico.js';
import { projecaoDoPerfilPublico } from './perfil-publico.js';

const MIDIA = 'https://midia.exemplo.invalid/' as AbsoluteUrl;

function perfil(parcial: Partial<PerfilPublicoDoPet> = {}): PerfilPublicoDoPet {
  return {
    slug: 'thor-da-vila',
    nome: 'Thor',
    especie: 'dog',
    porte: 'M',
    racaRotulo: 'Vira-lata',
    corRotulo: 'Caramelo',
    marcas: 'Coleira vermelha.',
    chaveDaFoto: 'pets/abc/card/f00d.webp',
    estaPerdido: false,
    ...parcial,
  };
}

void describe('projeção do perfil público (PublicPetProfile)', () => {
  void it('monta os campos do contrato, e nenhum a mais', () => {
    assert.deepEqual(projecaoDoPerfilPublico(perfil(), MIDIA), {
      slug: 'thor-da-vila',
      display_name: 'Thor',
      species: 'dog',
      breed_label: 'Vira-lata',
      size: 'M',
      primary_color: 'Caramelo',
      distinctive_marks: 'Coleira vermelha.',
      photo_url: 'https://midia.exemplo.invalid/pets/abc/card/f00d.webp',
      is_lost: false,
    });
  });

  void it('sem foto pronta, photo_url é nulo', () => {
    assert.equal(projecaoDoPerfilPublico(perfil({ chaveDaFoto: null }), MIDIA).photo_url, null);
  });

  void it('pet com caso aberto sai com is_lost verdadeiro', () => {
    assert.equal(projecaoDoPerfilPublico(perfil({ estaPerdido: true }), MIDIA).is_lost, true);
  });

  void it('telefone e e-mail escritos no nome, na raça ou nas marcas saem redigidos', () => {
    const corpo = projecaoDoPerfilPublico(
      perfil({
        nome: 'Thor 11987654321',
        racaRotulo: 'SRD, fala com tutor@exemplo.com',
        marcas: 'Devolver na Rua das Flores, 123',
      }),
      MIDIA,
    );
    const texto = JSON.stringify(corpo);
    assert.doesNotMatch(texto, /87654321/);
    assert.doesNotMatch(texto, /tutor@exemplo\.com/);
    assert.doesNotMatch(texto, /Flores, 123/);
  });
});
