/**
 * O que os bytes dizem, contra o que o cliente declarou.
 *
 * Os casos negativos são o motivo do arquivo. Um teste que só confirmasse "JPEG
 * é reconhecido como JPEG" passaria com a função devolvendo o tipo declarado.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatoRealDe } from './numeros-magicos.js';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);
const heic = Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp'), Buffer.from('heic'), Buffer.alloc(8)]);

void describe('números mágicos — o que é aceito', () => {
  void it('reconhece os quatro formatos do contrato', () => {
    assert.equal(formatoRealDe(jpeg), 'jpeg');
    assert.equal(formatoRealDe(png), 'png');
    assert.equal(formatoRealDe(webp), 'webp');
    assert.equal(formatoRealDe(heic), 'heic');
  });

  void it('aceita as variantes de HEIC que a câmera do iPhone produz', () => {
    for (const marca of ['mif1', 'msf1', 'heix']) {
      const b = Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp'), Buffer.from(marca), Buffer.alloc(8)]);
      assert.equal(formatoRealDe(b), 'heic', marca);
    }
  });
});

void describe('números mágicos — o que precisa ser recusado', () => {
  void it('RECUSA SVG, inclusive com o cabeçalho XML na frente', () => {
    // SVG é documento com script. Ele entraria por aqui declarado como
    // `image/svg+xml`, que parece imagem para qualquer lista feita por analogia.
    // A fixture vai sem `xmlns` de proposito: o namespace e uma URL literal, o
    // portao de portabilidade reprova URL literal em `src/`, e ele esta certo em
    // ser cego. O que se testa aqui e o numero magico, que nunca olha o conteudo.
    assert.equal(formatoRealDe(Buffer.from('<svg width="10" height="10"></svg>')), null);
    assert.equal(formatoRealDe(Buffer.from('<?xml version="1.0"?><svg></svg>')), null);
  });

  void it('RECUSA HTML declarado como imagem', () => {
    assert.equal(formatoRealDe(Buffer.from('<!DOCTYPE html><html><script>1</script>')), null);
  });

  void it('RECUSA GIF, que não está no contrato', () => {
    assert.equal(formatoRealDe(Buffer.from('GIF89a')), null);
  });

  void it('RECUSA um RIFF que não é WebP: um .wav não vira imagem', () => {
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(8)]);
    assert.equal(formatoRealDe(wav), null);
  });

  void it('RECUSA um poliglota: JPEG só nos três primeiros bytes não basta', () => {
    // Um arquivo que começa com a assinatura certa e continua sendo outra coisa
    // ainda é recusado pela biblioteca ao reescrever; aqui o que se garante é
    // que a assinatura é conferida no OFFSET certo, e não procurada no arquivo.
    const escondido = Buffer.concat([Buffer.from('GIF89a'), jpeg]);
    assert.equal(formatoRealDe(escondido), null);
  });

  void it('não quebra com arquivo vazio nem com dois bytes', () => {
    assert.equal(formatoRealDe(Buffer.alloc(0)), null);
    assert.equal(formatoRealDe(Buffer.from([0xff, 0xd8])), null);
  });
});
