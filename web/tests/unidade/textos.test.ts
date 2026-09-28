import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descricaoDoPet, desde, espera, frase } from '../../src/dominio/texto-do-pet.ts';
import { fotoPermitida, origemDaMidia } from '../../src/dominio/midia.ts';
import { ehProducao, mapaDoSite, robots } from '../../src/dominio/mapa-do-site.ts';

test('descricao so com o que a API devolveu', () => {
  assert.equal(descricaoDoPet({ display_name: 'Thor', species: 'dog', size: 'M', primary_color: 'preto e branco' }), 'Cão, porte médio, preto e branco.');
  assert.equal(descricaoDoPet({ display_name: 'Nina', species: 'cat', size: 'P', breed_label: 'SRD', primary_color: null }), 'Gato, SRD, porte pequeno.');
});

test('frase do tutor ganha ponto final e texto vazio some', () => {
  assert.equal(frase('É medroso, não corra atrás'), 'É medroso, não corra atrás.');
  assert.equal(frase('Coleira vermelha.'), 'Coleira vermelha.');
  assert.equal(frase('   '), null);
  assert.equal(frase(null), null);
});

test('desde: hoje, ontem ou a data, no fuso de Sao Paulo', () => {
  const agora = new Date('2026-09-23T15:00:00-03:00');
  assert.equal(desde('2026-09-23T10:00:00-03:00', agora), 'desde hoje');
  assert.equal(desde('2026-09-22T23:30:00-03:00', agora), 'desde ontem');
  assert.equal(desde('2026-09-16T18:20:00Z', agora), 'desde 16/09');
  // 01:00 UTC do dia 23 ainda e dia 22 em Sao Paulo
  assert.equal(desde('2026-09-23T01:00:00Z', agora), 'desde ontem');
  assert.equal(desde(null, agora), null);
});

test('espera legivel a partir do Retry-After', () => {
  assert.equal(espera(600), '10 minutos');
  assert.equal(espera(60), '1 minuto');
  assert.equal(espera(45), '45 segundos');
  assert.equal(espera(3600), '1 hora');
  assert.equal(espera(null), null);
});

test('foto so da origem da midia, que e a unica na CSP', () => {
  const origem = origemDaMidia('https://img.bichu.app/qualquer/caminho');
  assert.equal(origem, 'https://img.bichu.app');
  assert.equal(fotoPermitida('https://img.bichu.app/p/1/card.webp', origem), 'https://img.bichu.app/p/1/card.webp');
  assert.equal(fotoPermitida('https://outro.exemplo/p.webp', origem), null);
  assert.equal(fotoPermitida('https://img.bichu.app/p.webp', null), null);
  assert.equal(origemDaMidia('javascript:alert(1)'), null);
});

test('mapa do site e robots so em producao', () => {
  assert.equal(ehProducao('https://bichu.app'), true);
  assert.equal(ehProducao('https://hml.bichu.app'), false);
  assert.equal(ehProducao(undefined), false);
  assert.match(mapaDoSite('https://bichu.app'), /<loc>https:\/\/bichu\.app\/comunidade<\/loc>/);
  assert.doesNotMatch(mapaDoSite('https://bichu.app'), /termos|privacidade|\/t\//);
  assert.match(robots('https://bichu.app', true), /Sitemap: https:\/\/bichu\.app\/sitemap\.xml/);
  assert.doesNotMatch(robots('https://hml.bichu.app', false), /Disallow|Sitemap/);
});
