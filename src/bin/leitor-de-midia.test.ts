/**
 * O que se prova aqui é a **recusa**, e não a aceitação.
 *
 * `chaveDeDerivadaPublica` é a única coisa entre o pedido de quem quiser e o
 * bucket público: o `midia` lê o bucket COM credencial (ADR-0007 Emenda 1,
 * item 4 -- a organização recusa leitura anônima), então o que esta função
 * aceitar, ela aceita autenticada. Um `null` que virasse chave entregaria
 * leitura de original e listagem a quem montasse o caminho na mão.
 *
 * Por isso os casos centrais são negativos: a forma de derivada passar é o
 * fácil de notar quando quebra -- a foto não abre. Original aceito, travessia
 * aceita ou raiz aceita NÃO aparecem em nenhum teste de "a foto aparece".
 *
 * O arquivo é ponto de entrada de processo, mas esta função é pura e exportada
 * de propósito, e o módulo guarda a própria subida com
 * `process.argv[1]?.endsWith(...)`: importar aqui não sobe servidor nenhum.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { chaveDeDerivadaPublica } from './leitor-de-midia.js';

void describe('chaveDeDerivadaPublica', () => {
  void describe('aceita a forma de derivada, e só ela', () => {
    for (const caminho of [
      'thumb/abc123.webp',
      'card/abc123.webp',
      'pets/thumb/abc-123_XYZ.webp',
      'pets/card/abc123.jpg',
      'products/card/abc123.jpeg',
      'events/thumb/abc123.webp',
    ]) {
      void it(caminho, () => {
        assert.equal(chaveDeDerivadaPublica(caminho), caminho);
      });
    }

    void it('a barra da frente é aparada, porque a borda entrega o caminho com ela', () => {
      assert.equal(chaveDeDerivadaPublica('/pets/card/abc123.webp'), 'pets/card/abc123.webp');
    });
  });

  void describe('recusa o que não é derivada pública', () => {
    for (const [nome, caminho] of [
      ['a raiz, que seria listagem', '/'],
      ['a raiz vazia', ''],
      ['o ORIGINAL, que nunca é público', 'catalog/original/abc123.webp'],
      ['original sob categoria', 'pets/original/abc123.webp'],
      ['travessia para fora da derivada', 'pets/card/../original/abc123.webp'],
      ['travessia com ponto-ponto no nome', '../card/abc123.webp'],
      ['categoria que não existe', 'tutors/card/abc123.webp'],
      ['tamanho que não existe', 'pets/grande/abc123.webp'],
      ['extensão que não é imagem aceita', 'pets/card/abc123.svg'],
      ['extensão de executável', 'pets/card/abc123.js'],
      ['sem extensão', 'pets/card/abc123'],
      ['subpasta a mais, que escaparia da forma', 'pets/card/extra/abc123.webp'],
      ['barra no fim, que seria listagem de prefixo', 'pets/card/'],
      ['ponto no nome, que abriria caminho relativo', 'pets/card/.webp'],
      ['chave com identificador de pasta do minio', 'pets/card/.minio.sys.webp'],
      ['nome com caractere fora do conjunto', 'pets/card/abc 123.webp'],
      ['nome com porcento, que seria escape', 'pets/card/abc%2f123.webp'],
    ] as const) {
      void it(nome, () => {
        assert.equal(chaveDeDerivadaPublica(caminho), null);
      });
    }
  });

  void it('nunca lança, nem no caminho mais hostil', () => {
    for (const caminho of ['/'.repeat(5000), '\u0000', '%', '../'.repeat(500), '\n']) {
      assert.doesNotThrow(() => chaveDeDerivadaPublica(caminho));
      assert.equal(chaveDeDerivadaPublica(caminho), null);
    }
  });
});
