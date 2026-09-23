/**
 * As regras que a massa da vitrine precisa respeitar, afirmadas sem subir
 * banco.
 *
 * ## Por que este arquivo existe, e o que ele ja pegou
 *
 * A massa foi escrita e inserida num Postgres de verdade antes deste arquivo
 * existir, e o `CHECK` `store_items_resumo_tem_tamanho` **reprovou**: o resumo
 * do "caso feio" tinha 183 caracteres contra um teto de 180. Isso ia chegar ao
 * `make seed` de quem fosse rodar depois, com a massa parcialmente gravada.
 *
 * As afirmacoes abaixo sao as mesmas dos `CHECK` da migracao
 * `20260922000009`, escritas aqui para reprovarem em SEGUNDOS e sem Postgres.
 * Elas nao substituem o banco -- o banco continua sendo a autoridade --, mas
 * mudam o momento em que se descobre.
 *
 * ## A regra dos deslocamentos, que e a mais sutil
 *
 * O criterio 14 da BICHUS-185 pede uma verificacao que reprove se **todas as
 * datas do catalogo forem iguais a data de aplicacao**, porque esse e o
 * sintoma de uma data derivada de carimbo automatico. Aqui a forma equivalente
 * e: nenhum deslocamento e zero, e nenhum se repete.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ITENS_VISIVEIS,
  MASSA_DA_VITRINE,
  PARCEIROS_DA_VITRINE,
} from './massa-da-vitrine.js';
import { CATEGORIAS_DA_VITRINE, DIAS_DE_VALIDADE_DO_PRECO } from '../modules/store/domain/item-da-vitrine.js';

/** Copiado do `CHECK` da migracao, e nao importado: duas copias divergem, e e
 * a divergencia que este teste existe para acusar. */
const FORMATO_DO_SLUG = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

void describe('a massa cabe nos CHECK da migracao', () => {
  void it('todo slug tem o formato que o banco aceita', () => {
    for (const item of MASSA_DA_VITRINE) {
      assert.match(item.slug, FORMATO_DO_SLUG, `slug fora do formato: ${item.slug}`);
    }
    for (const parceiro of PARCEIROS_DA_VITRINE) {
      assert.match(parceiro.slug, FORMATO_DO_SLUG, `slug de parceiro fora do formato: ${parceiro.slug}`);
    }
  });

  void it('ISCA -- o resumo cabe em 180 e o titulo em 120', () => {
    for (const item of MASSA_DA_VITRINE) {
      const resumo = item.summary.trim().length;
      const titulo = item.title.trim().length;
      assert.ok(
        resumo >= 2 && resumo <= 180,
        `resumo de "${item.slug}" tem ${String(resumo)} caracteres, e o teto e 180`,
      );
      assert.ok(
        titulo >= 2 && titulo <= 120,
        `titulo de "${item.slug}" tem ${String(titulo)} caracteres, e o teto e 120`,
      );
    }
  });

  void it('todo destino e https, e no host do parceiro que o item declara', () => {
    const hosts = new Map(PARCEIROS_DA_VITRINE.map((p) => [p.slug, p.host]));
    for (const item of MASSA_DA_VITRINE) {
      const url = new URL(item.targetUrl);
      assert.equal(url.protocol, 'https:', `destino de "${item.slug}" nao e https`);
      // O `CHECK` nao consegue conferir isto: ele nao enxerga a outra tabela.
      assert.equal(
        url.hostname,
        hosts.get(item.partnerSlug),
        `"${item.slug}" aponta para fora do host do parceiro que ele declara`,
      );
      if (item.imageUrl !== null) {
        assert.equal(new URL(item.imageUrl).protocol, 'https:');
      }
    }
  });

  void it('os tres campos de preco andam juntos', () => {
    for (const item of MASSA_DA_VITRINE) {
      assert.equal(
        item.priceAmount === null,
        item.precoConsultadoHaDias === null,
        `"${item.slug}" tem preco sem data ou data sem preco`,
      );
      if (item.priceAmount !== null) {
        assert.ok(item.priceAmount > 0, `"${item.slug}" tem preco nao positivo`);
        assert.ok(
          Number.isInteger(item.priceAmount),
          `"${item.slug}" tem preco fracionario -- o valor e em CENTAVOS, inteiro`,
        );
      }
    }
  });

  void it('toda categoria esta na lista fechada', () => {
    for (const item of MASSA_DA_VITRINE) {
      assert.ok(
        CATEGORIAS_DA_VITRINE.includes(item.category),
        `"${item.slug}" tem categoria fora da lista: ${item.category}`,
      );
    }
  });

  void it('nenhum slug se repete, e todo item aponta para um parceiro que existe', () => {
    const slugs = MASSA_DA_VITRINE.map((i) => i.slug);
    assert.equal(new Set(slugs).size, slugs.length, 'ha slug repetido na massa');
    const parceiros = new Set(PARCEIROS_DA_VITRINE.map((p) => p.slug));
    for (const item of MASSA_DA_VITRINE) {
      assert.ok(parceiros.has(item.partnerSlug), `"${item.slug}" aponta para parceiro inexistente`);
    }
  });
});

void describe('a massa serve para JULGAR O VISUAL', () => {
  void it('sao dez itens visiveis, e dois que nunca aparecem', () => {
    assert.equal(ITENS_VISIVEIS.length, 10);
    assert.equal(MASSA_DA_VITRINE.length, 12);

    // Um inativo e um de parceiro inativo. Eles sao o que da o que medir a
    // isca do predicado de vitrine: sem eles, um teste de "item retirado nao
    // aparece" passaria contra uma consulta que nunca filtrou nada.
    const escondidos = MASSA_DA_VITRINE.filter((i) => !ITENS_VISIVEIS.includes(i));
    assert.equal(escondidos.length, 2);
    assert.ok(escondidos.some((i) => !i.active), 'falta o item inativo');
    assert.ok(
      escondidos.some((i) => i.active),
      'falta o item ATIVO de parceiro inativo -- e um caso diferente do item inativo',
    );
  });

  void it('ISCA -- a variedade que muda o DESENHO esta toda representada', () => {
    // Dez linhas iguais com sufixo numerico atenderiam a contagem e nao
    // mostrariam nada. Cada afirmacao abaixo e um caso de desenho que uma
    // lista homogenea esconderia.
    const comImagem = ITENS_VISIVEIS.filter((i) => i.imageUrl !== null);
    const semImagem = ITENS_VISIVEIS.filter((i) => i.imageUrl === null);
    assert.ok(comImagem.length >= 3, 'faltam itens com imagem');
    assert.ok(semImagem.length >= 3, 'faltam itens sem imagem');

    const comPreco = ITENS_VISIVEIS.filter((i) => i.priceAmount !== null);
    const semPreco = ITENS_VISIVEIS.filter((i) => i.priceAmount === null);
    assert.ok(comPreco.length >= 3, 'faltam itens com preco');
    assert.ok(semPreco.length >= 2, 'faltam itens sem preco');

    // O vencido, sem o qual o caminho de vencimento nunca seria visto.
    assert.ok(
      ITENS_VISIVEIS.some(
        (i) => i.precoConsultadoHaDias !== null && i.precoConsultadoHaDias > DIAS_DE_VALIDADE_DO_PRECO,
      ),
      'falta um item com preco VENCIDO',
    );
    // E o do limite exato, que cobra o `>` no lugar do `>=`.
    assert.ok(
      ITENS_VISIVEIS.some((i) => i.precoConsultadoHaDias === DIAS_DE_VALIDADE_DO_PRECO),
      'falta um item com preco no limite EXATO da validade',
    );

    // As duas pontas da formatacao brasileira: abaixo de dez reais (sem ponto
    // de milhar) e acima de mil (com ele).
    assert.ok(
      comPreco.some((i) => i.priceAmount! < 1000),
      'falta um preco abaixo de dez reais',
    );
    assert.ok(
      comPreco.some((i) => i.priceAmount! >= 100_000),
      'falta um preco de milhar, que e onde o ponto de milhar aparece',
    );
    // Um valor redondo, que e onde uma formatacao que corta zero a direita
    // aparece como `R$ 100,0`.
    assert.ok(
      comPreco.some((i) => i.priceAmount! % 100 === 0),
      'falta um preco de centavos redondos',
    );

    // Titulo curto ao lado de titulo que quebra em varias linhas.
    assert.ok(
      ITENS_VISIVEIS.some((i) => i.title.length <= 12),
      'falta um titulo curtissimo',
    );
    assert.ok(
      ITENS_VISIVEIS.some((i) => i.title.length >= 80),
      'falta um titulo longo, que quebra em varias linhas',
    );

    // Acento e cedilha, que e onde fonte e quebra de linha costumam falhar.
    assert.ok(
      ITENS_VISIVEIS.some((i) => /[áéíóúâêôãõà]/i.test(i.title)),
      'falta um titulo com acento',
    );
    assert.ok(
      ITENS_VISIVEIS.some((i) => /ç/i.test(i.title)),
      'falta um titulo com cedilha',
    );

    // O CASO FEIO: titulo longo, resumo no teto, sem imagem e sem preco.
    assert.ok(
      ITENS_VISIVEIS.some(
        (i) =>
          i.title.length >= 80 &&
          i.summary.length >= 170 &&
          i.imageUrl === null &&
          i.priceAmount === null,
      ),
      'falta o caso feio -- e para isso que serve olhar',
    );
  });

  void it('ISCA -- nenhum deslocamento de data e zero, e nenhum se repete', () => {
    // A forma equivalente, sem banco, do criterio 14: datas todas iguais a
    // data de aplicacao e o sintoma de derivacao automatica.
    const dias = MASSA_DA_VITRINE.map((i) => i.precoConsultadoHaDias).filter(
      (d): d is number => d !== null,
    );
    assert.ok(dias.length >= 5, 'poucos precos para a regra valer alguma coisa');
    for (const d of dias) {
      assert.ok(d > 0, 'um deslocamento e zero: a data seria a da propria semeadura');
    }
    assert.equal(
      new Set(dias).size,
      dias.length,
      'ha deslocamentos repetidos: datas iguais sao o sintoma de derivacao automatica',
    );
  });

  void it('nada na massa e dado pessoal nem segredo', () => {
    // Criterio 23: todo valor do catalogo e publicavel.
    const tudo = JSON.stringify(MASSA_DA_VITRINE) + JSON.stringify(PARCEIROS_DA_VITRINE);
    for (const agulha of ['@', 'token', 'secret', 'api_key', 'apikey', 'password', 'Bearer']) {
      assert.ok(
        !tudo.toLowerCase().includes(agulha.toLowerCase()),
        `a massa carrega algo que parece dado pessoal ou segredo: "${agulha}"`,
      );
    }
    // E nenhuma URL de saida leva parametro de consulta: e por parametro que
    // identificador de pessoa vaza (consequencia 3 da BICHUS-185).
    for (const item of MASSA_DA_VITRINE) {
      assert.equal(
        new URL(item.targetUrl).search,
        '',
        `"${item.slug}" tem parametro na URL de saida`,
      );
    }
  });
});
