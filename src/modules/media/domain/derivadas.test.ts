import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DERIVADAS_DA_FOTO_DE_PET,
  DERIVADAS_DA_GALERIA_DO_DIRETORIO,
  DERIVADAS_DO_ENCONTRO,
  DERIVADAS_DO_PRODUTO,
  DERIVADA_DA_FOTO_DO_ACHADO,
  DIMENSAO_MINIMA_DA_FOTO_DE_PET,
  ESCADA_DA_FAIXA,
  ESCADA_ENXUTA,
  FORMATO_DAS_DERIVADAS,
  ORIENTACAO_DE_TAMANHO_DA_IMAGEM,
  PISO_DE_BYTES_DA_DERIVADA_GRANDE,
  TETO_DE_BYTES_DA_DERIVADA,
  TETO_DE_BYTES_DO_ENVIO,
  escadaDo,
} from './derivadas.js';
import {
  ehExtensaoDeDerivada,
  ehTipoDeDerivada,
  ehVarianteDeDerivada,
} from './chave-de-objeto.js';

void describe('o formato de saída: JPEG com extensão .jpeg (cliente, 17/10/2026)', () => {
  void it('é o que o cliente pediu', () => {
    assert.equal(FORMATO_DAS_DERIVADAS.nome, 'jpeg');
    assert.equal(FORMATO_DAS_DERIVADAS.contentType, 'image/jpeg');
    assert.equal(FORMATO_DAS_DERIVADAS.extensao, 'jpeg');
  });

  void it('o tipo e a extensão são ACEITOS pelas listas que a gravação confere', () => {
    assert.ok(ehTipoDeDerivada(FORMATO_DAS_DERIVADAS.contentType));
    assert.ok(ehExtensaoDeDerivada(FORMATO_DAS_DERIVADAS.extensao));
  });

  void it('JPEG achata o alfa, porque o formato não guarda canal alfa', () => {
    assert.equal(FORMATO_DAS_DERIVADAS.achataAlfa, FORMATO_DAS_DERIVADAS.nome === 'jpeg');
  });
});

void describe('o teto do envio: 5 MB, um número só', () => {
  void it('é 5 MiB', () => {
    assert.equal(TETO_DE_BYTES_DO_ENVIO, 5_242_880);
  });

  void it('a orientação de tela diz o mesmo número, em uma linha', () => {
    assert.match(ORIENTACAO_DE_TAMANHO_DA_IMAGEM, /5 MB/);
    assert.ok(!ORIENTACAO_DE_TAMANHO_DA_IMAGEM.includes('\n'));
    assert.ok(
      ORIENTACAO_DE_TAMANHO_DA_IMAGEM.length <= 60,
      `orientação com ${String(ORIENTACAO_DE_TAMANHO_DA_IMAGEM.length)} caracteres`,
    );
  });
});

void describe('a faixa de bytes: teto de 500 KB, alvo de 300 a 500 KB', () => {
  void it('são os números do cliente', () => {
    assert.equal(TETO_DE_BYTES_DA_DERIVADA, 512_000);
    assert.equal(PISO_DE_BYTES_DA_DERIVADA_GRANDE, 307_200);
  });

  void it('o piso é menor que o teto, senão a faixa é vazia', () => {
    assert.ok(PISO_DE_BYTES_DA_DERIVADA_GRANDE < TETO_DE_BYTES_DA_DERIVADA);
  });
});

void describe('as duas escadas de qualidade', () => {
  for (const [nome, escada] of [
    ['faixa', ESCADA_DA_FAIXA],
    ['enxuta', ESCADA_ENXUTA],
  ] as const) {
    void it(`${nome}: é DECRESCENTE, porque o adaptador para no primeiro que cabe`, () => {
      for (let i = 1; i < escada.length; i += 1) {
        assert.ok(
          (escada[i] ?? 0) < (escada[i - 1] ?? 0),
          `degrau ${String(i)} não é menor que o anterior`,
        );
      }
    });

    void it(`${nome}: todo degrau é qualidade JPEG válida`, () => {
      for (const q of escada) {
        assert.ok(q >= 1 && q <= 100, `degrau fora de 1..100: ${String(q)}`);
      }
    });

    void it(`${nome}: não é vazia — escada vazia não produz derivada nenhuma`, () => {
      assert.ok(escada.length > 0);
    });
  }

  void it('a da faixa começa ACIMA da enxuta: é ela que alcança 300 a 500 KB', () => {
    assert.ok((ESCADA_DA_FAIXA[0] ?? 0) > (ESCADA_ENXUTA[0] ?? 0));
  });

  void it('`escadaDo` liga o porte à escada, e os dois portes são cobertos', () => {
    assert.equal(escadaDo('grande'), ESCADA_DA_FAIXA);
    assert.equal(escadaDo('enxuta'), ESCADA_ENXUTA);
  });
});

void describe('as derivadas batem com o LAYOUT medido', () => {
  const todas = [
    ...DERIVADAS_DA_FOTO_DE_PET,
    ...DERIVADAS_DO_ENCONTRO,
    ...DERIVADAS_DO_PRODUTO,
    DERIVADA_DA_FOTO_DO_ACHADO,
  ];

  void it('toda variante declarada é uma variante que a chave aceita', () => {
    for (const d of todas) {
      assert.ok(ehVarianteDeDerivada(d.variante), `variante desconhecida: ${d.variante}`);
    }
  });

  void it('nenhuma lista repete uma variante: a segunda sobrescreveria a primeira', () => {
    for (const lista of [DERIVADAS_DA_FOTO_DE_PET, DERIVADAS_DO_ENCONTRO, DERIVADAS_DO_PRODUTO]) {
      const variantes = lista.map((d) => d.variante);
      assert.equal(new Set(variantes).size, variantes.length);
    }
  });

  void it('pet: `thumb` cobre 56 x 61,6 dp a 3x, e `card` são os 1024 do cartaz', () => {
    const thumb = DERIVADAS_DA_FOTO_DE_PET.find((d) => d.variante === 'thumb');
    const card = DERIVADAS_DA_FOTO_DE_PET.find((d) => d.variante === 'card');
    assert.ok(thumb !== undefined && card !== undefined);
    assert.ok(thumb.largura >= 56 * 3, `thumb de ${String(thumb.largura)} px não cobre 3x`);
    assert.equal(card.largura, 1024);
  });

  void it('pet: as duas são cortadas em 1 : 1,1, a proporção da moldura', () => {
    for (const d of DERIVADAS_DA_FOTO_DE_PET) {
      assert.notEqual(d.altura, undefined, `${d.variante} sem altura: não corta`);
      const proporcao = (d.altura ?? 0) / d.largura;
      assert.ok(
        Math.abs(proporcao - 1.1) < 0.02,
        `${d.variante} em ${proporcao.toFixed(3)}, e a moldura é 1,1`,
      );
    }
  });

  void it('encontro: a galeria de 144 dp tem miniatura própria, e ela cobre 3x', () => {
    const thumb = DERIVADAS_DO_ENCONTRO.find((d) => d.variante === 'thumb');
    assert.ok(thumb !== undefined, 'sem `thumb` a galeria volta a baixar 1024 px para 432');
    assert.ok(thumb.largura >= 144 * 3);
  });

  void it('encontro: o `banner` cobre 430 dp a 3x, e o `card` cobre 328 dp a 3x', () => {
    const banner = DERIVADAS_DO_ENCONTRO.find((d) => d.variante === 'banner');
    const card = DERIVADAS_DO_ENCONTRO.find((d) => d.variante === 'card');
    assert.ok(banner !== undefined && card !== undefined);
    assert.ok(banner.largura >= 430 * 3 - 10, `banner de ${String(banner.largura)} px`);
    assert.ok(card.largura >= 328 * 3, `card de ${String(card.largura)} px`);
  });

  // ==========================================================================
  // SÓ A CAPA CORTA (cliente, 05/11/2026)
  // ==========================================================================
  // *"as imagens do evento que subimos, a capa esta correta, fazendo o crop,
  // mas deve subir tambem a foto no formato original e quando clicar para
  // expandir deve mostrar a imagem inteira, hoje as fotos estao sendo cropadas,
  // e a unica cropada tem que ser a da capa."*
  //
  // Até 05/11 as três derivadas do encontro tinham altura, e as três cortavam:
  // `card` em 1024 x 576 e `thumb` em 480 x 360. A `card` é o que o
  // visualizador amplia nas posições 1+ (`urlsParaAmpliar`), então a foto que
  // ele abria JÁ vinha cortada -- e o `BoxFit.contain` do visualizador mostrava
  // essa derivada inteira, o que fazia o defeito parecer não existir no app.
  //
  // ISCA: devolva `altura` à `card` ou à `thumb` em `DERIVADAS_DO_ENCONTRO`.
  // Compila, `tsc` cala, o lint cala, e a foto volta a ser cortada no servidor.
  // Este caso reprova.
  void it('encontro: SÓ o `banner` corta — `card` e `thumb` vão inteiras', () => {
    const comAltura = DERIVADAS_DO_ENCONTRO.filter((d) => d.altura !== undefined).map((d) => d.variante);
    assert.deepEqual(
      comAltura,
      ['banner'],
      'a capa é a ÚNICA recortada (cliente, 05/11/2026): `altura` presente = corta',
    );
  });

  void it('encontro: a `banner` da CAPA continua 16:9, que é o que ele chamou de correto', () => {
    const banner = DERIVADAS_DO_ENCONTRO.find((d) => d.variante === 'banner');
    assert.ok(banner !== undefined);
    assert.ok(
      Math.abs((banner.altura ?? 0) / banner.largura - 9 / 16) < 0.02,
      'a moldura da capa (no painel e no app) é derivada DESTA proporção',
    );
  });

  // A galeria do DIRETÓRIO foi separada da do encontro em 05/11/2026, e este
  // caso é o que impede alguém de "limpar" as duas por simetria: o pedido do
  // cliente falou do ENCONTRO, e nenhuma decisão dele pediu que a foto de
  // estabelecimento parasse de ser recortada.
  void it('diretório: a galeria MANTÉM as três cortando — a decisão foi sobre o encontro', () => {
    assert.equal(DERIVADAS_DA_GALERIA_DO_DIRETORIO.length, 3);
    for (const d of DERIVADAS_DA_GALERIA_DO_DIRETORIO) {
      assert.notEqual(d.altura, undefined, `${d.variante} do diretório perdeu a altura`);
    }
    const banner = DERIVADAS_DA_GALERIA_DO_DIRETORIO.find((d) => d.variante === 'banner');
    assert.ok(banner !== undefined);
    assert.ok(Math.abs((banner.altura ?? 0) / banner.largura - 9 / 16) < 0.02);
  });

  void it('encontro: o `banner` é MAIOR que o `card`, senão não há o que ganhar', () => {
    const banner = DERIVADAS_DO_ENCONTRO.find((d) => d.variante === 'banner');
    const card = DERIVADAS_DO_ENCONTRO.find((d) => d.variante === 'card');
    assert.ok((banner?.largura ?? 0) > (card?.largura ?? 0));
  });

  void it('encontro: só o `banner` é `grande` — a listagem desenha muitos cartões', () => {
    assert.deepEqual(
      DERIVADAS_DO_ENCONTRO.filter((d) => d.porte === 'grande').map((d) => d.variante),
      ['banner'],
    );
  });

  void it('produto da Loja: UMA derivada e SEM corte, porque a tela não foi medida', () => {
    assert.equal(DERIVADAS_DO_PRODUTO.length, 1);
    assert.equal(DERIVADAS_DO_PRODUTO[0]?.altura, undefined);
  });

  void it('achado: uma derivada, na geometria do `card` do pet', () => {
    const card = DERIVADAS_DA_FOTO_DE_PET.find((d) => d.variante === 'card');
    assert.equal(DERIVADA_DA_FOTO_DO_ACHADO.largura, card?.largura);
    assert.equal(DERIVADA_DA_FOTO_DO_ACHADO.altura, card?.altura);
    assert.equal(DERIVADA_DA_FOTO_DO_ACHADO.porte, 'grande');
  });
});

void describe('a dimensão mínima da foto de pet', () => {
  // A capa do encontro saiu desta comparação em 03/11/2026: ela é enquadrada
  // em 16:9 e passou a 600 x 338. A foto de pet é recortada em 1024 x 1126 e
  // o piso dela continua quadrado.
  void it('é 600 x 600, e já NÃO é o número da capa do encontro', () => {
    assert.deepEqual(DIMENSAO_MINIMA_DA_FOTO_DE_PET, { largura: 600, altura: 600 });
  });

  void it('é MENOR que a derivada `card`: acima dela a recusa viraria regra', () => {
    const card = DERIVADAS_DA_FOTO_DE_PET.find((d) => d.variante === 'card');
    assert.ok(DIMENSAO_MINIMA_DA_FOTO_DE_PET.largura < (card?.largura ?? 0));
  });

  void it('é MAIOR que a `thumb`: abaixo dela nem a miniatura se preenche', () => {
    const thumb = DERIVADAS_DA_FOTO_DE_PET.find((d) => d.variante === 'thumb');
    assert.ok(DIMENSAO_MINIMA_DA_FOTO_DE_PET.largura > (thumb?.largura ?? 0));
  });
});
