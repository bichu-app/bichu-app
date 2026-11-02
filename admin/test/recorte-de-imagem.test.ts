/**
 * A GEOMETRIA DO RECORTE (BICHUS-314).
 *
 * ## O que cada isca prova, e o que desligar para ela reprovar
 *
 * | isca | o que desligar |
 * |---|---|
 * | a moldura 1:1 sobre um retrato devolve um QUADRADO | trocar `alvo / daImagem` por `daImagem / alvo` |
 * | a moldura sai da geometria da derivada, propósito a propósito | mudar `PROPORCAO_DA_MOLDURA` |
 * | a Loja nasce com a imagem inteira (o servidor não corta esse propósito) | pôr uma proporção fixa em `store_item` |
 * | o zoom estreita a região, e a proporção não muda | dividir só um dos lados pela escala |
 * | região que estoura a borda é PRESA, e não recusada | tirar o `preso` de `x`/`y` |
 * | o envio nunca AMPLIA e nunca passa de 2048 px | tirar o `Math.min(1, ...)` de `tamanhoDoEnvio` |
 * | PNG sai PNG (ou WebP), nunca JPEG | devolver `['image/jpeg']` em `formatosDeSaida` |
 *
 * **A isca da moldura 1:1 é a que pega o engano que não dá erro.** Trocar os
 * eixos devolve `w = 1, h = 1` e entrega a imagem inteira achatada dentro de um
 * quadrado: um recorte plausível do lugar errado, sem erro e sem log. Foi o que
 * o protótipo mostrou na primeira execução.
 */
import { describe, expect, it } from 'vitest';

import { DIMENSAO_MINIMA, type Proposito } from '../src/componentes/envio-de-imagem.ts';
import {
  ENQUADRAMENTO_INICIAL,
  formatosDeSaida,
  janelaEmPixels,
  LADO_MAXIMO_DO_ENVIO,
  PROPORCAO_DA_MOLDURA,
  regiaoEnquadrada,
  tamanhoDoEnvio,
} from '../src/componentes/recorte-de-imagem.ts';

/** Um retrato de celular: é a foto que a heurística do servidor decapita. */
const RETRATO = { largura: 1600, altura: 2000 };

function emPixeis(imagem: { largura: number; altura: number }, proporcao: number | null, enquadramento = ENQUADRAMENTO_INICIAL) {
  return janelaEmPixels(regiaoEnquadrada(imagem, proporcao, enquadramento), imagem.largura, imagem.altura);
}

describe('a moldura, por propósito', () => {
  it('1:1 sobre um retrato devolve um QUADRADO, e não a imagem inteira', () => {
    const janela = emPixeis(RETRATO, PROPORCAO_DA_MOLDURA.directory_logo);
    expect(janela).toEqual({ left: 0, top: 200, width: 1600, height: 1600 });
    // O engano dos eixos trocados devolveria a imagem inteira, 1600 x 2000.
    expect(janela.height).not.toBe(RETRATO.altura);
  });

  it('16:9 sobre um quadrado devolve uma faixa deitada centrada', () => {
    expect(emPixeis({ largura: 1000, altura: 1000 }, PROPORCAO_DA_MOLDURA.directory_photo)).toEqual({
      left: 0,
      top: 219,
      width: 1000,
      height: 563,
    });
  });

  it('16:9 sobre uma foto MAIS deitada que 16:9 corta pelos lados, e não por cima', () => {
    expect(emPixeis({ largura: 4000, altura: 1000 }, PROPORCAO_DA_MOLDURA.network_event)).toEqual({
      left: 1111,
      top: 0,
      width: 1778,
      height: 1000,
    });
  });

  it('a Loja nasce com a imagem INTEIRA: o servidor não corta esse propósito', () => {
    expect(PROPORCAO_DA_MOLDURA.store_item).toBeNull();
    expect(emPixeis(RETRATO, PROPORCAO_DA_MOLDURA.store_item)).toEqual({ left: 0, top: 0, width: 1600, height: 2000 });
  });

  it('cada propósito do contrato tem moldura e mínima declaradas', () => {
    const propositos = Object.keys(DIMENSAO_MINIMA) as Proposito[];
    expect(propositos.length).toBeGreaterThan(0);
    expect(Object.keys(PROPORCAO_DA_MOLDURA).sort()).toEqual([...propositos].sort());
    // As quatro superfícies que o servidor CORTA têm proporção; só a Loja é livre.
    expect(propositos.filter((p) => PROPORCAO_DA_MOLDURA[p] === null)).toEqual(['store_item']);
  });
});

/**
 * ## O PISO TEM DE SER ALCANÇÁVEL NA PROPORÇÃO QUE A MOLDURA FORÇA
 *
 * O defeito de 02/11/2026, nas palavras do cliente: *"na recomendação dos
 * estabelecimentos, o upload da foto está diminuindo a foto para 578, mas o
 * mínimo são 600px e está bloqueando eu publicar"*. A moldura de
 * `directory_photo` é 16:9 e o piso era 600 × 600, que é QUADRADO: uma faixa
 * 16:9 só alcança 600 de altura com 1067 de largura, então a foto de 1028 de
 * largura saía com 578 e era recusada por uma regra que o próprio recorte
 * não conseguia cumprir.
 *
 * **Nada comparava o piso com a proporção**, e foi por isso que o número da
 * logo (que É quadrada) vazou para a foto em 18/10/2026 e atravessou
 * typecheck, eslint e a suíte inteira. Este é o caso que faltava, e ele vale
 * para a CLASSE: todo propósito com proporção forçada, e todo propósito novo.
 *
 * A aritmética, de uma vez: o maior recorte de proporção `r` que cabe numa
 * imagem `W × H` é `min(W, H·r) × min(H, W/r)`. Para ele alcançar `W × H` é
 * preciso `W/H = r`. Ou seja: **o piso tem a proporção da moldura, ou é
 * inalcançável** -- não existe piso quadrado numa moldura deitada.
 */
describe('o piso, contra a proporção da moldura', () => {
  /** O maior recorte que a moldura do propósito tira de uma imagem NO piso dele. */
  function recorteDeUmaImagemNoPiso(proposito: Proposito) {
    const piso = DIMENSAO_MINIMA[proposito];
    const imagem = { largura: piso.largura, altura: piso.altura };
    return tamanhoDoEnvio(emPixeis(imagem, PROPORCAO_DA_MOLDURA[proposito]));
  }

  function pisoInalcancavel(proposito: Proposito): boolean {
    const piso = DIMENSAO_MINIMA[proposito];
    const saida = recorteDeUmaImagemNoPiso(proposito);
    return saida.largura < piso.largura || saida.altura < piso.altura;
  }

  /**
   * **`network_event` espera DECISÃO DO CLIENTE, e não zelo meu.** Ele tem o
   * defeito idêntico -- moldura 16:9 com piso 600 × 600 -- e em 02/11/2026 o
   * cliente decidiu sobre a foto do ESTABELECIMENTO, com as três opções na
   * mesa; a capa do encontro não estava na mesa, e consertá-la aqui seria
   * decidir no lugar dele. A linha sai desta lista no dia em que ele decidir,
   * e até lá o defeito está escrito em código, e não só num relatório.
   */
  const PISO_INALCANCAVEL_ESPERANDO_DECISAO: readonly Proposito[] = ['network_event'];

  it('o piso de todo propósito com moldura é alcançável NA moldura dele', () => {
    const comMoldura = (Object.keys(PROPORCAO_DA_MOLDURA) as Proposito[]).filter(
      (p) => PROPORCAO_DA_MOLDURA[p] !== null,
    );
    // O filtro prova que casou antes de a contagem valer: filtro vazio aprovaria tudo.
    expect(comMoldura).toEqual(['network_event', 'directory_logo', 'directory_photo', 'directory_gallery']);

    expect(comMoldura.filter(pisoInalcancavel)).toEqual(PISO_INALCANCAVEL_ESPERANDO_DECISAO);
  });

  it('a foto e a galeria do local: o piso É a faixa 1280 × 720, e o recorte nele passa inteiro', () => {
    for (const proposito of ['directory_photo', 'directory_gallery'] as const) {
      expect(DIMENSAO_MINIMA[proposito]).toEqual({ largura: 1280, altura: 720 });
      // 1280 x 720 é a MAIOR derivada (`banner`): no piso nada é ampliado.
      expect(recorteDeUmaImagemNoPiso(proposito)).toEqual({ largura: 1280, altura: 720 });
    }
  });

  it('a foto de 1028 × 578 do cliente continua recusada, e agora por uma regra alcançável', () => {
    // O que a tela dele fez: 1028 de largura, moldura 16:9, altura 578.
    const recorte = tamanhoDoEnvio(emPixeis({ largura: 1028, altura: 1028 }, PROPORCAO_DA_MOLDURA.directory_photo));
    expect(recorte).toEqual({ largura: 1028, altura: 578 });
    expect(recorte.largura).toBeLessThan(DIMENSAO_MINIMA.directory_photo.largura);
    // E 1067 x 600, que o piso velho dizia bastar, também não basta para a faixa.
    expect(600).toBeLessThan(DIMENSAO_MINIMA.directory_photo.altura);
  });

  it('`network_event` está medido, e não suposto: 600 × 600 em 16:9 sai com 338 de altura', () => {
    expect(PROPORCAO_DA_MOLDURA.network_event).toBe(16 / 9);
    expect(DIMENSAO_MINIMA.network_event).toEqual({ largura: 600, altura: 600 });
    expect(recorteDeUmaImagemNoPiso('network_event')).toEqual({ largura: 600, altura: 338 });
  });
});

describe('zoom e posição', () => {
  it('o zoom estreita a região pela escala, nos dois lados, e a proporção não muda', () => {
    const um = emPixeis(RETRATO, 1);
    const dois = emPixeis(RETRATO, 1, { ...ENQUADRAMENTO_INICIAL, escala: 2 });
    expect(dois.width).toBe(Math.round(um.width / 2));
    expect(dois.height).toBe(Math.round(um.height / 2));
    expect(dois.width).toBe(dois.height);
  });

  it('a posição escolhida é a que sai: mover o centro para cima sobe a janela', () => {
    const centrada = emPixeis(RETRATO, 1);
    const acima = emPixeis(RETRATO, 1, { ...ENQUADRAMENTO_INICIAL, centroY: 0.4 });
    expect(acima.top).toBeLessThan(centrada.top);
    expect(acima.top).toBe(0);
  });

  it('região que estoura a borda é PRESA dentro da imagem, e não recusada', () => {
    for (const centro of [
      { centroX: -5, centroY: -5 },
      { centroX: 9, centroY: 9 },
    ]) {
      const janela = emPixeis(RETRATO, 1, { ...ENQUADRAMENTO_INICIAL, ...centro });
      expect(janela.left).toBeGreaterThanOrEqual(0);
      expect(janela.top).toBeGreaterThanOrEqual(0);
      expect(janela.left + janela.width).toBeLessThanOrEqual(RETRATO.largura);
      expect(janela.top + janela.height).toBeLessThanOrEqual(RETRATO.altura);
    }
  });

  it('a escala é presa na faixa: 0,1 não devolve região maior do que a imagem', () => {
    const janela = emPixeis(RETRATO, 1, { ...ENQUADRAMENTO_INICIAL, escala: 0.1 });
    expect(janela.width).toBeLessThanOrEqual(RETRATO.largura);
    expect(janela.height).toBeLessThanOrEqual(RETRATO.altura);
  });
});

describe('o tamanho do envio', () => {
  it('nunca AMPLIA: um recorte pequeno sai do tamanho que tem', () => {
    expect(tamanhoDoEnvio({ left: 0, top: 0, width: 640, height: 360 })).toEqual({ largura: 640, altura: 360 });
  });

  it('o lado maior é limitado a 2048, e a proporção é preservada', () => {
    const { largura, altura } = tamanhoDoEnvio({ left: 0, top: 0, width: 4000, height: 2250 });
    expect(largura).toBe(LADO_MAXIMO_DO_ENVIO);
    expect(altura).toBe(1152);
  });

  it('o limite cobre a maior derivada do servidor (banner 1280 x 720)', () => {
    expect(LADO_MAXIMO_DO_ENVIO).toBeGreaterThanOrEqual(1280);
  });
});

describe('o formato de saída', () => {
  it('PNG sai PNG, e cai em WebP quando não couber — nunca em JPEG, que perde o alfa', () => {
    expect(formatosDeSaida('image/png')).toEqual(['image/png', 'image/webp']);
  });

  it('JPEG e WebP saem no formato em que entraram', () => {
    expect(formatosDeSaida('image/jpeg')).toEqual(['image/jpeg']);
    expect(formatosDeSaida('image/webp')).toEqual(['image/webp']);
  });
});
