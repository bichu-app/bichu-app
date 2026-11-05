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

import { DIMENSAO_MINIMA, LARGURA_MINIMA, alturaDoPiso, type Proposito } from '../src/componentes/envio-de-imagem.ts';
import {
  ENQUADRAMENTO_INICIAL,
  formatosDeSaida,
  janelaEmPixels,
  LADO_MAXIMO_DO_ENVIO,
  PROPORCAO_DA_MOLDURA,
  proporcaoDaMolduraNaPosicao,
  regiaoEnquadrada,
  tamanhoDoEnvio,
} from '../src/componentes/recorte-de-imagem.ts';

/** Um retrato de celular: é a foto que a heurística do servidor decapita. */
const RETRATO = { largura: 1600, altura: 2000 };

function emPixeis(imagem: { largura: number; altura: number }, proporcao: number | null, enquadramento = ENQUADRAMENTO_INICIAL) {
  return janelaEmPixels(regiaoEnquadrada(imagem, proporcao, enquadramento), imagem.largura, imagem.altura);
}

// ===========================================================================
// A MOLDURA DA POSIÇÃO: só a CAPA do encontro é recortada
// ===========================================================================
// Cliente, 05/11/2026, verbatim: *"as imagens do evento que subimos, a capa
// esta correta, fazendo o crop, mas deve subir tambem a foto no formato
// original e quando clicar para expandir deve mostrar a imagem inteira, hoje as
// fotos estao sendo cropadas, e a unica cropada tem que ser a da capa."*
//
// No encontro a capa **é a posição 0** da mesma lista e com o mesmo propósito
// (`network_event`), então uma moldura por propósito não consegue dizer "a
// primeira corta e as outras não".
describe('a moldura, pela POSIÇÃO na galeria', () => {
  it('encontro: a posição 0 corta em 16:9 e as posições 1+ são livres', () => {
    expect(proporcaoDaMolduraNaPosicao('network_event', 0)).toBe(16 / 9);
    for (const posicao of [1, 2, 3, 7]) {
      expect(proporcaoDaMolduraNaPosicao('network_event', posicao)).toBeNull();
    }
  });

  // ISCA: tire a guarda `posicao > 0` de `proporcaoDaMolduraNaPosicao`, ou
  // troque o propósito testado. Compila, `tsc` cala, o lint cala, e o painel
  // volta a recortar a foto da galeria em 16:9 antes de enviar -- jogando fora
  // pixel que o servidor ia entregar inteiro. Estes casos reprovam.
  it('os OUTROS propósitos não mudam com a posição: a decisão foi sobre o encontro', () => {
    const outros = (Object.keys(PROPORCAO_DA_MOLDURA) as Proposito[]).filter((p) => p !== 'network_event');
    // A contagem vai junto do veredito: lista vazia aprovaria qualquer coisa.
    expect(outros.length).toBeGreaterThan(0);
    expect(outros.sort()).toEqual(['directory_gallery', 'directory_logo', 'directory_photo', 'store_item']);
    for (const proposito of outros) {
      for (const posicao of [0, 1, 5]) {
        expect(proporcaoDaMolduraNaPosicao(proposito, posicao)).toBe(PROPORCAO_DA_MOLDURA[proposito]);
      }
    }
  });

  it('a foto livre nasce INTEIRA, e a capa da MESMA foto sai recortada', () => {
    const inteira = emPixeis(RETRATO, proporcaoDaMolduraNaPosicao('network_event', 1));
    expect(inteira).toEqual({ left: 0, top: 0, width: 1600, height: 2000 });
    const capa = emPixeis(RETRATO, proporcaoDaMolduraNaPosicao('network_event', 0));
    expect(capa.height).toBeLessThan(inteira.height);
  });

  // ========================================================================
  // O QUE EU AFIRMEI ERRADO, E O QUE A MEDIÇÃO DISSE
  // ========================================================================
  // Eu escrevi aqui que "o recorte só REMOVE pixel, então a altura do envio
  // livre é sempre >= a do recortado; se a capa passa no piso, a foto passa".
  // **É FALSO**, e este caso existe porque ele me reprovou:
  //
  //   imagem 4000 x 1000  ->  capa 16:9 sai 1778 x 1000
  //                       ->  foto livre sai 2048 x  512
  //
  // A causa é [LADO_MAXIMO_DO_ENVIO]: `tamanhoDoEnvio` escala pelo lado MAIOR.
  // A janela livre é mais larga, então ela bate no teto de 2048 primeiro e a
  // ALTURA desce junto. Soltar a moldura pode, sim, apertar o piso de altura.
  //
  // O piso do propósito continua `{ 600, 338 }`, derivado da `banner` da capa
  // (a maior derivada com altura), e não muda com a posição.
  it('a foto livre passa no piso nas proporções que uma câmera produz', () => {
    const imagens = [
      { largura: 600, altura: 1200 },
      { largura: 4000, altura: 1000 },
      { largura: 1000, altura: 350 },
      { largura: 4032, altura: 3024 },
      { largura: 3024, altura: 4032 },
      RETRATO,
    ];
    // A contagem vai junto do veredito: lista vazia aprovaria qualquer coisa.
    expect(imagens.length).toBe(6);
    for (const imagem of imagens) {
      const foto = tamanhoDoEnvio(emPixeis(imagem, proporcaoDaMolduraNaPosicao('network_event', 1)));
      expect(foto.largura).toBeGreaterThanOrEqual(DIMENSAO_MINIMA.network_event.largura);
      expect(foto.altura).toBeGreaterThanOrEqual(DIMENSAO_MINIMA.network_event.altura);
    }
  });

  // ========================================================================
  // DÍVIDA, E NÃO DECISÃO: o piso é por PROPÓSITO e a moldura é por POSIÇÃO
  // ========================================================================
  // **O número 6,06:1 deste caso não é uma regra que alguém escolheu.** Ele é
  // o SINTOMA de uma incoerência que esta mudança introduziu e não consertou, e
  // está travado aqui só para que ninguém o mova sem perceber.
  //
  // A incoerência, com endereço:
  //
  // - a MOLDURA passou a sair da derivada que aquela posição consome
  //   (`proporcaoDaMolduraNaPosicao`, neste arquivo de produção);
  // - o PISO continua saindo do PROPÓSITO -- `DIMENSAO_MINIMA` em
  //   `src/modules/media/ports/imagem-de-catalogo.ts`, cuja altura vem de
  //   `alturaDoPiso(largura, proporcaoDaMoldura(purpose))`, e `proporcaoDaMoldura`
  //   lê a MAIOR derivada com altura, que é a `banner` 1280 x 720 **da capa**.
  //
  // Resultado: a foto herda um piso de ALTURA derivado do 16:9 da capa, enquanto
  // as derivadas dela (`card` largura 1024 e `thumb` largura 480, em
  // `src/modules/media/domain/derivadas.ts`) restringem **só a largura**. Uma
  // imagem 8000 x 600 desce para 2048 x 154 pelo teto do envio, e dela sairiam
  // `card` 1024 x 77 e `thumb` 480 x 36 -- **derivadas válidas, sem ampliação
  // nenhuma**. O piso de 338 de altura recusa uma imagem que produziria derivada
  // boa; ele não protege nada neste caminho, porque o que o piso existe para
  // evitar é ampliação, e sem `altura` na derivada a altura não participa disso.
  //
  // ## POR QUE O PISO POR POSIÇÃO NÃO FOI FEITO AQUI
  //
  // Não é economia de PR: **a posição não existe no instante em que o piso é
  // avaliado**, e isso foi medido nos dois instantes em que ele é avaliado:
  //
  // 1. no INTENT -- `AdminCatalogImageIntentInput` tem `purpose`, `content_type`,
  //    `byte_size`, `width`, `height` (e os campos da indicação), **não tem
  //    posição**, e é `additionalProperties: false`. O envio é anônimo quanto ao
  //    destino **por desenho**: o contrato diz, com estas palavras, que "não há
  //    nada que distinga a segunda imagem da primeira no envio";
  // 2. no WORKER -- `processar-imagem-de-catalogo.ts` indexa
  //    `DIMENSAO_MINIMA[imagem.purpose]`, e `ImagemParaProcessar` carrega `id`,
  //    `purpose`, `status` e `originalKey`. Sem posição, e a imagem de catálogo
  //    não conhece o dono.
  //
  // E, mesmo que carregasse: **a posição muda por reordenação depois do envio,
  // sem reprocessar**. Um piso por posição seria avaliado num instante e
  // invalidado no seguinte. A moldura escapa disso porque é escolhida no
  // CLIENTE, no enquadramento, onde a posição futura já é conhecida localmente.
  //
  // Então isto fica como **pendência nomeada para o cliente**, não como regra:
  // a foto panorâmica mais deitada que 2048/338 é recusada HOJE.
  it('ISCA — DÍVIDA: a panorâmica é recusada como foto hoje, e isso não é decisão', () => {
    const limite = LADO_MAXIMO_DO_ENVIO / DIMENSAO_MINIMA.network_event.altura;
    expect(limite).toBeCloseTo(6.06, 1);

    const passa = tamanhoDoEnvio(emPixeis({ largura: 6000, altura: 1000 }, null));
    expect(passa.altura).toBeGreaterThanOrEqual(DIMENSAO_MINIMA.network_event.altura);

    // 13:1 -- acima da fronteira: a altura sai abaixo do piso.
    const recusada = tamanhoDoEnvio(emPixeis({ largura: 8000, altura: 600 }, null));
    expect(recusada.altura).toBeLessThan(DIMENSAO_MINIMA.network_event.altura);

    // E a MESMA imagem, enquadrada como CAPA, passa -- que é o que faz disto
    // uma mudança de comportamento e não um limite que sempre existiu.
    const comoCapa = tamanhoDoEnvio(
      emPixeis({ largura: 8000, altura: 600 }, proporcaoDaMolduraNaPosicao('network_event', 0)),
    );
    expect(comoCapa.altura).toBeGreaterThanOrEqual(DIMENSAO_MINIMA.network_event.altura);
  });
});

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
 * ## O PISO É DERIVADO DA MOLDURA, E A LARGURA É A DECIDIDA
 *
 * O defeito de 02/11/2026, nas palavras do cliente: *"na recomendação dos
 * estabelecimentos, o upload da foto está diminuindo a foto para 578, mas o
 * mínimo são 600px e está bloqueando eu publicar"*. A moldura de
 * `directory_photo` é 16:9 e o piso era 600 × 600, que é QUADRADO: uma faixa
 * 16:9 só alcança 600 de altura com 1067 de largura, então a foto de 1028 de
 * largura saía com 578 e era recusada por uma regra que o próprio recorte
 * não conseguia cumprir.
 *
 * Em 03/11/2026 ele travou igual na capa do encontro, e fixou a regra: *"sempre
 * que estivermos falando de upload de imagem, isso deve ser tratado no mesmo
 * lugar, e as correções devem ser realizadas em todos os lugares por ser o
 * mesmo código"*. Então o piso deixou de ser uma tabela de PARES escritos à mão
 * e passou a ser **derivado**: só a largura é decidida, e a altura sai da
 * proporção da moldura.
 *
 * ## Por que estes três casos, e não um
 *
 * Recalcular a altura com a MESMA `alturaDoPiso` que monta a tabela e comparar
 * seria **tautologia** -- o portão passaria com qualquer defeito. Então:
 *
 * | caso | o que desligar para ele reprovar |
 * |---|---|
 * | a largura de cada propósito é a DECIDIDA | mudar um número em `LARGURA_MINIMA` |
 * | o par de cada propósito é o esperado, escrito aqui à mão de propósito | quebrar `alturaDoPiso` |
 * | o piso é alcançável NA moldura, medido pelo recorte de verdade | pôr piso quadrado num propósito 16:9 |
 *
 * O terceiro é o que vale para a CLASSE, e ele não tem mais lista de exceção:
 * `network_event` saiu dela em 03/11/2026 quando o cliente decidiu, e exceção
 * que sobra aprova o furo quando ele voltar.
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

  it('a LARGURA mínima de cada propósito é a decidida', () => {
    expect(LARGURA_MINIMA).toEqual({
      store_item: 800,
      network_event: 600,
      directory_logo: 256,
      directory_photo: 1280,
      directory_gallery: 1280,
    });
  });

  it('o par de cada propósito é o que a moldura impõe à largura decidida', () => {
    // Escritos à mão AQUI de propósito: é o controle independente da derivação.
    expect(DIMENSAO_MINIMA).toEqual({
      store_item: { largura: 800, altura: 800 },
      network_event: { largura: 600, altura: 338 },
      directory_logo: { largura: 256, altura: 256 },
      directory_photo: { largura: 1280, altura: 720 },
      directory_gallery: { largura: 1280, altura: 720 },
    });
  });

  it('a altura NÃO é escrita ao lado da largura: ela sai da proporção', () => {
    for (const proposito of Object.keys(LARGURA_MINIMA) as Proposito[]) {
      expect(DIMENSAO_MINIMA[proposito].altura).toBe(
        alturaDoPiso(LARGURA_MINIMA[proposito], PROPORCAO_DA_MOLDURA[proposito]),
      );
    }
    // 600 em 16:9 cai no empate exato do arredondamento, e é o caso do cliente.
    expect(alturaDoPiso(600, 16 / 9)).toBe(338);
    expect(alturaDoPiso(1280, 16 / 9)).toBe(720);
    expect(alturaDoPiso(256, 1)).toBe(256);
    expect(alturaDoPiso(800, null)).toBe(800);
  });

  it('o piso de todo propósito com moldura é alcançável NA moldura dele', () => {
    const comMoldura = (Object.keys(PROPORCAO_DA_MOLDURA) as Proposito[]).filter(
      (p) => PROPORCAO_DA_MOLDURA[p] !== null,
    );
    // O filtro prova que casou antes de a contagem valer: filtro vazio aprovaria tudo.
    expect(comMoldura).toEqual(['network_event', 'directory_logo', 'directory_photo', 'directory_gallery']);

    // SEM lista de exceção: paga a dívida, a dispensa vai com ela.
    expect(comMoldura.filter(pisoInalcancavel)).toEqual([]);
  });

  it('o piso derivado é PONTO FIXO: uma imagem no piso sai do recorte no piso', () => {
    for (const proposito of Object.keys(DIMENSAO_MINIMA) as Proposito[]) {
      expect(recorteDeUmaImagemNoPiso(proposito)).toEqual(DIMENSAO_MINIMA[proposito]);
    }
  });

  it('a capa do encontro: a foto de 600 de largura e alta PASSA, e é o pedido do cliente', () => {
    // Cliente, 03/11/2026: *"as vezes a foto ja tem 600px de largura e e muito
    // grande na altura, ai precisa manter os 600px que e o minimo, mas realizar
    // o crop na altura"*.
    const recorte = tamanhoDoEnvio(emPixeis({ largura: 600, altura: 1200 }, PROPORCAO_DA_MOLDURA.network_event));
    expect(recorte).toEqual({ largura: 600, altura: 338 });
    expect(recorte.largura).toBeGreaterThanOrEqual(DIMENSAO_MINIMA.network_event.largura);
    expect(recorte.altura).toBeGreaterThanOrEqual(DIMENSAO_MINIMA.network_event.altura);
  });

  it('a foto e a galeria do local FICAM em 1280 × 720: o número já era coerente', () => {
    for (const proposito of ['directory_photo', 'directory_gallery'] as const) {
      expect(DIMENSAO_MINIMA[proposito]).toEqual({ largura: 1280, altura: 720 });
      expect(recorteDeUmaImagemNoPiso(proposito)).toEqual({ largura: 1280, altura: 720 });
    }
    // 1280/720 É exatamente 16/9, então a derivação não mexe neles.
    expect(1280 / 720).toBe(16 / 9);
  });

  it('a foto de 1028 × 578 continua medida: ela é pequena para a faixa de 1280', () => {
    const recorte = tamanhoDoEnvio(emPixeis({ largura: 1028, altura: 1028 }, PROPORCAO_DA_MOLDURA.directory_photo));
    expect(recorte).toEqual({ largura: 1028, altura: 578 });
    expect(recorte.largura).toBeLessThan(DIMENSAO_MINIMA.directory_photo.largura);
  });

  it('imagem estreita continua RECUSADA: o piso não foi afrouxado', () => {
    // 599 de largura falha por 1 pixel, e é o que separa conserto de afrouxamento.
    const recorte = tamanhoDoEnvio(emPixeis({ largura: 599, altura: 1200 }, PROPORCAO_DA_MOLDURA.network_event));
    expect(recorte.largura).toBeLessThan(DIMENSAO_MINIMA.network_event.largura);
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
