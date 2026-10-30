/** O que se prova aqui é a **recusa**, e não a aceitação. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CATEGORIAS_PUBLICAS } from '../modules/media/domain/chave-de-objeto.js';
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
      'events/banner/abc123.jpeg',
      'pets/card/abc123.jpeg',
    ]) {
      void it(caminho, () => {
        assert.equal(chaveDeDerivadaPublica(caminho), caminho);
      });
    }

    void it('a barra da frente é aparada, porque a borda entrega o caminho com ela', () => {
      assert.equal(chaveDeDerivadaPublica('/pets/card/abc123.webp'), 'pets/card/abc123.webp');
    });
  });

  /**
   * A ISCA DO DEFEITO DE 20/10/2026, e ela reprova de verdade com o mecanismo
   * desligado: com a alternação `(?:pets|products|events)` digitada à mão de volta
   * no lugar da derivação de `CATEGORIAS_PUBLICAS`, os casos `people` e `directory`
   * deste bloco falham, e o `TODA categoria` falha junto.
   */
  void describe('serve TODA categoria pública, e a lista não é escrita aqui', () => {
    for (const categoria of CATEGORIAS_PUBLICAS) {
      for (const variante of ['thumb', 'card', 'banner'] as const) {
        const caminho = `${categoria}/${variante}/abc-123_XYZ.jpeg`;
        void it(caminho, () => {
          assert.equal(chaveDeDerivadaPublica(caminho), caminho);
        });
      }
    }

    void it('people/card — a foto do perfil, 404 em homologação até 20/10/2026', () => {
      assert.equal(
        chaveDeDerivadaPublica('people/card/nf-lly4AhMupaRWhfbYZnA.jpeg'),
        'people/card/nf-lly4AhMupaRWhfbYZnA.jpeg',
      );
    });

    void it('people/thumb — a vitrine e o ícone da conversa, pela mesma chave', () => {
      assert.equal(chaveDeDerivadaPublica('people/thumb/abc123.jpeg'), 'people/thumb/abc123.jpeg');
    });

    void it('directory/card — a logo e a foto do profissional do Perto', () => {
      assert.equal(chaveDeDerivadaPublica('directory/card/abc123.jpeg'), 'directory/card/abc123.jpeg');
    });

    void it('pets/card continua servindo — o controle positivo da isca', () => {
      assert.equal(chaveDeDerivadaPublica('pets/card/abc123.jpeg'), 'pets/card/abc123.jpeg');
    });

    void it('found-reports NÃO entra, mesmo com a forma derivada da constante', () => {
      assert.equal(chaveDeDerivadaPublica('found-reports/card/abc123.jpeg'), null);
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
      ['original do pet, com o id no caminho', 'pets/1111/original/abc123'],
      ['original do achado', 'found-reports/1111/original/abc123'],
      ['original do achador sem conta', 'found-reports/sem-conta/original/abc123'],
      ['original de produto', 'products/original/abc123'],
      ['original de encontro', 'events/original/abc123'],
      ['derivada higienizada do achado', 'found-reports/1111/sanitized/abc123.jpeg'],
      ['derivada higienizada do achador sem conta', 'found-reports/sem-conta/sanitized/abc.jpeg'],
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
