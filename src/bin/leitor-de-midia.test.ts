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
      // A variante `banner`, que entrou com a capa de borda a borda do
      // detalhe do encontro (1280 px).
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
   * desligado: com a alternação `(?:pets|products|events)` digitada à mão de
   * volta no lugar da derivação de `CATEGORIAS_PUBLICAS`, os casos `people` e
   * `directory` deste bloco falham, e o `TODA categoria` falha junto.
   *
   * Não é asserção genérica: o laço percorre `CATEGORIAS_PUBLICAS`, que é a
   * MESMA constante que `comoObjectKey` usa para aceitar a chave. É isso que
   * faz a sétima categoria não poder entrar no domínio e ficar 404 no leitor —
   * o modo de falha que custou a foto do perfil, a vitrine, o Mural e o
   * diretório ao mesmo tempo.
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

    // As DUAS que estavam 404 em homologação, nomeadas uma por uma: um laço
    // sobre a constante passaria a valer sozinho se alguém tirasse `people` de
    // `CATEGORIAS_PUBLICAS`, e esses dois casos é que não deixam.
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

    // O CONTROLE POSITIVO DA ISCA: `pets/card` servia antes do conserto e
    // continua servindo. Sem ele, uma isca que passasse por acidente (por
    // exemplo um `FORMA_DE_DERIVADA` que aceitasse qualquer primeiro segmento)
    // não se distinguiria de uma que mede o que diz medir.
    void it('pets/card continua servindo — o controle positivo da isca', () => {
      assert.equal(chaveDeDerivadaPublica('pets/card/abc123.jpeg'), 'pets/card/abc123.jpeg');
    });

    // E a recusa continua recusando: derivar a forma da constante não pode ter
    // afrouxado o primeiro segmento. `found-reports` é categoria de verdade no
    // armazenamento e **não** é pública (a foto do achado nunca é).
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
      // AS QUATRO FORMAS DE ORIGINAL, e o app nunca recebe nenhuma delas.
      // Esta é a prova de que "o app nunca baixa o original" é estrutural e
      // não feliz: toda chave de original tem `original` onde esta forma
      // exige `thumb`, `card` ou `banner`.
      ['original do pet, com o id no caminho', 'pets/1111/original/abc123'],
      ['original do achado', 'found-reports/1111/original/abc123'],
      ['original do achador sem conta', 'found-reports/sem-conta/original/abc123'],
      ['original de produto', 'products/original/abc123'],
      ['original de encontro', 'events/original/abc123'],
      // A DERIVADA HIGIENIZADA DO ACHADO também não: ela é privada, vista
      // dentro da conversa mediada e só (critério 9 da BICHUS-35).
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
