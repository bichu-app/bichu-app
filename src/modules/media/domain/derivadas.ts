/**
 * **O PONTO ÚNICO DE CONFIGURAÇÃO DO TRATAMENTO DE IMAGEM.**
 *
 * Teto de envio, formato de saída, faixa de bytes, escada de qualidade e a
 * geometria de cada uso moram aqui e em nenhum outro lugar. Antes disso o teto
 * de envio estava em TRÊS lugares com TRÊS números (10 MiB na foto de pet,
 * 2 MiB na do achado, 5 MiB no catálogo), a qualidade (`82`) estava dentro do
 * adaptador do `sharp` e as larguras (`160`, `1024`) dentro de dois casos de
 * uso diferentes. Uma regra espalhada por cinco arquivos não é uma regra: é
 * cinco regras que concordam por enquanto — e foi assim que a capa do evento
 * continuou recebendo 1024 px enquanto a galeria baixava 1024 px para desenhar
 * 144 dp.
 *
 * ## O teto do envio: 5 MB, em todos os caminhos (cliente, 17/10/2026)
 *
 * *"as imagens devem conter no maximo 5mb ... em toda a aplicação, seja para
 * foto do pet, evento, loja ou qualquer outro recurso que utilize imagem"*, e
 * *"para o usuário e administrador não conseguir subir"*. Então é um número só,
 * [TETO_DE_BYTES_DO_ENVIO], e ele vai para a **política assinada** de todos os
 * cinco caminhos — é lá que ele vale, porque o backend não recebe os bytes e
 * recusar depois seria recusar o que já foi gravado.
 *
 * ## O formato de saída: JPEG, extensão `.jpeg` (cliente, 17/10/2026)
 *
 * *"todas elas devem ter a extensão .jpeg"*. O ponto único continua existindo,
 * mas o valor é decisão dele: [FORMATO_DAS_DERIVADAS]. Trocá-lo muda o
 * `Content-Type`, a extensão da chave, o achatamento do alfa e a chamada de
 * codificação de uma vez, porque os quatro saem deste objeto.
 *
 * **O que isso custa, e é medida e não suposição:** JPEG é maior que WebP na
 * mesma qualidade visual — na mesma geometria, o WebP q82 de ontem chegava ao
 * peso que o JPEG só alcança uns seis a dez pontos de qualidade abaixo. É o
 * que empurra as derivadas grandes para o alto da faixa de 300–500 KB, e é por
 * isso que a escada abaixo começa em 92 e não em 82.
 *
 * **A extensão é de saída, nunca de entrada.** Foto de iPhone sai em HEIC e
 * Android manda JPEG ou WebP; recusar na entrada o que não é JPEG tiraria o
 * produto da mão de metade dos aparelhos. A lista da entrada é
 * `TIPOS_ACEITOS`, e a conversão para JPEG é nossa, no servidor.
 *
 * ## A faixa de 300–500 KB vale para a imagem que a pessoa olha GRANDE
 *
 * *"devemos fazer o crop das imagens para um tamanho maximo de 300 a 500kb"*.
 * Uma miniatura de 144 dp **tem** de pesar menos que 300 KB: empurrá-la para
 * dentro da faixa seria pagar 300 KB por um ícone. Então cada derivada declara
 * qual das duas escadas usa — [ESCADA_DA_FAIXA] para a imagem grande,
 * [ESCADA_ENXUTA] para a miniatura — e o teto de 500 KB vale para as duas, sem
 * exceção, porque é o que o app baixa.
 *
 * ## O original nunca é tocado
 *
 * O corte é da DERIVADA. O original fica no bucket privado, inteiro, e é o que
 * permite gerar uma derivada nova amanhã com outra proporção. Cortar o arquivo
 * guardado e descartar o que sobrou decapita o cachorro na foto e não tem
 * volta. O app nunca recebe o original: o leitor de mídia pública
 * (`src/bin/leitor-de-midia.ts`) só abre a classe `publico` e só aceita chave
 * com a forma de derivada, e nenhuma forma de original casa com ela.
 */

/** 5 MB (5 MiB, 5 242 880 bytes). O MESMO número nos cinco caminhos de envio. */
export const TETO_DE_BYTES_DO_ENVIO = 5 * 1024 * 1024;

/** O texto de orientação da tela. Uma linha, porque o cliente reprovou texto longo. */
export const ORIENTACAO_DE_TAMANHO_DA_IMAGEM = 'Envie uma imagem de até 5 MB.';

/**
 * O formato de saída das derivadas, num lugar só.
 *
 * `extensao` precisa estar em `EXTENSOES_DE_DERIVADA` e `contentType` em
 * `TIPOS_DE_DERIVADA` (`chave-de-objeto.ts`): as duas listas são o que a
 * gravação e a montagem de chave conferem, e elas recusam em vez de sanear.
 */
export interface FormatoDaDerivada {
  readonly nome: 'jpeg' | 'webp';
  readonly contentType: 'image/jpeg' | 'image/webp';
  readonly extensao: 'jpeg' | 'webp';
  /**
   * O formato não guarda canal alfa, então a transparência precisa virar uma
   * cor antes de codificar. Sem isso um PNG com fundo transparente sai com o
   * fundo preto — e o que o libvips faz com o alfa descartado não é promessa
   * de versão.
   */
  readonly achataAlfa: boolean;
}

/** JPEG com extensão `.jpeg`, por decisão do cliente. */
export const FORMATO_DAS_DERIVADAS: FormatoDaDerivada = {
  nome: 'jpeg',
  contentType: 'image/jpeg',
  extensao: 'jpeg',
  achataAlfa: true,
};

/** O teto de 500 KB. Vale para TODA derivada que o app baixa. */
export const TETO_DE_BYTES_DA_DERIVADA = 500 * 1024;

/** O piso de 300 KB. Alvo da imagem grande, e NÃO exigência da miniatura. */
export const PISO_DE_BYTES_DA_DERIVADA_GRANDE = 300 * 1024;

/**
 * A ESCADA DE QUALIDADE da imagem grande: 92 no topo, 40 no fim.
 *
 * O jeito errado de respeitar um teto de bytes é escolher uma qualidade fixa e
 * esperar que dê: a mesma qualidade produz 40 KB numa foto de parede lisa e
 * 900 KB numa de folhagem, porque o que manda é o detalhe da imagem e não o
 * número. Então: codifica, MEDE, e desce um degrau até caber.
 *
 * A escada é percorrida **de cima para baixo e para no primeiro degrau que
 * cabe** — o que sai é sempre a melhor qualidade que respeita o teto, e não a
 * primeira que não estoura. Começar em 92 é o que faz uma imagem lisa subir
 * para dentro da faixa de 300–500 KB em vez de parar em 90 KB de qualidade 82
 * e desperdiçar a faixa que o cliente pediu.
 *
 * Os degraus não são lineares de propósito. De 82 para 74 o olho quase não vê
 * e o arquivo cai um terço; abaixo de 58 o bloco do JPEG começa a aparecer em
 * pelo liso, que é exatamente a textura de um cachorro. 40 é o último degrau e
 * existe para o caso patológico — e quando nem ele couber, a derivada sai no
 * 40 mesmo, **acima do teto**, com o tamanho registrado em
 * `Derivada.acimaDoTeto`. Borrar até caber em silêncio seria pior que estourar
 * o teto e dizer.
 */
export const ESCADA_DA_FAIXA: readonly number[] = [92, 86, 82, 74, 66, 58, 48, 40];

/**
 * A ESCADA da miniatura: começa em 82 e não tenta subir.
 *
 * Uma miniatura de 176 px tem 34 mil pixels. Em qualquer degrau desta escada
 * ela pesa dezenas de kilobytes, não centenas, e é isso que faz uma listagem
 * cheia caber: o peso de uma TELA é a soma das derivadas que ela desenha, e
 * não o teto de cada arquivo.
 */
export const ESCADA_ENXUTA: readonly number[] = [82, 74, 66, 58, 48, 40];

/**
 * Uma derivada: a variante da chave, a geometria do uso e qual escada usar.
 *
 * `altura` presente = CORTA na proporção `largura:altura` (`fit: 'cover'`),
 * que é o que o cliente pediu com estas palavras: *"vamos cropar a imagem na
 * proporção correta e redimensionar da melhor forma"*.
 *
 * `altura` ausente = só reduz para caber na largura, sem cortar
 * (`fit: 'inside'`), que é o que a imagem da Loja faz hoje e não é meu para
 * mudar sem medir aquela tela.
 */
export interface EspecificacaoDaDerivada {
  readonly variante: 'thumb' | 'card' | 'banner';
  readonly largura: number;
  readonly altura?: number;
  /** `grande` usa [ESCADA_DA_FAIXA] e mira a faixa; `enxuta` usa [ESCADA_ENXUTA]. */
  readonly porte: 'grande' | 'enxuta';
}

/**
 * ## As derivadas da foto de pet
 *
 * A proporção é `1 : 1,1` porque é a da moldura: `BichuMoldura.proporcao` vale
 * 1,1 (altura dividida pela largura) e é token do design system. A auditoria
 * disse "56 dp quadrado"; o widget diz 56 × 61,6. Quem manda é o widget.
 *
 * - `card` 1024 × 1126 — e os 1024 **não são escolha minha**: eles estão no
 *   contrato, em `LostCasePoster.photo_url`, com a conta feita ("1024 px em
 *   meia folha A4 dá uns 150 dpi, o bastante para um cartaz lido a dois
 *   metros"). Reduzir esta derivada estragaria o cartaz impresso, que é a
 *   única coisa que ele faz. É `grande`: o cartaz e a página pública do caso
 *   são onde alguém olha a foto do animal para reconhecê-lo.
 * - `thumb` 176 × 194 — o cartão da lista tem 56 × 61,6 dp, e 176 px cobre os
 *   3x com folga. Antes eram 160 px no lado maior SEM corte, o que em foto
 *   retrato entregava menos de 160 px de largura para uma moldura de 168 px.
 */
export const DERIVADAS_DA_FOTO_DE_PET: readonly EspecificacaoDaDerivada[] = [
  { variante: 'card', largura: 1024, altura: 1126, porte: 'grande' },
  { variante: 'thumb', largura: 176, altura: 194, porte: 'enxuta' },
];

/**
 * ## As derivadas da imagem do encontro da comunidade
 *
 * Medidas na tela, não escolhidas:
 *
 * - `banner` 1280 × 720 (16:9), `grande` — a capa do detalhe é de borda a
 *   borda, 360 a 430 dp, ou 1080 a 1290 px a 3x. Com 1024 ela borra de leve.
 *   Uma derivada separada e não um `card` maior: o cartão da agenda usa a
 *   mesma imagem, e subir o `card` para 1280 engordaria **cada** cartão da
 *   listagem em metade do peso para ganhar nitidez numa tela que desenha um só.
 * - `card` 1024 × 576 (16:9), `enxuta` — o cartão da agenda tem ~328 dp de
 *   largura em 16:9 (`proporcaoDaCapa`), ou ~984 px a 3x. É o tamanho de hoje,
 *   e ele está certo para ESTE uso. `enxuta` de propósito: a listagem desenha
 *   muitos, e aqui o que importa é o peso da tela e não o do arquivo.
 * - `thumb` 480 × 360 (4:3), `enxuta` — a galeria do encontro desenha 144 dp
 *   em 4:3 (`proporcaoDaFoto`, `encontro_da_rede.dart`), ou 432 px a 3x. Ela
 *   baixava 1024 px, que é cinco vezes o dado que ela pinta.
 */
export const DERIVADAS_DO_ENCONTRO: readonly EspecificacaoDaDerivada[] = [
  { variante: 'banner', largura: 1280, altura: 720, porte: 'grande' },
  { variante: 'card', largura: 1024, altura: 576, porte: 'enxuta' },
  { variante: 'thumb', largura: 480, altura: 360, porte: 'enxuta' },
];

/**
 * ## A derivada da imagem de produto da Loja
 *
 * **Sem corte, e a ausência é deliberada.** A vitrine da Loja é de outra
 * esteira e eu não medi aquela tela; cortar imagem de produto numa proporção
 * que eu supus é como se decepa o rótulo de uma embalagem. Fica como está —
 * reduz para 1024 px no lado maior e preserva a proporção do arquivo — e passa
 * a respeitar o formato e o teto de bytes, que é o que o cliente pediu.
 */
export const DERIVADAS_DO_PRODUTO: readonly EspecificacaoDaDerivada[] = [
  { variante: 'card', largura: 1024, porte: 'enxuta' },
];

/**
 * ## As derivadas da VITRINE DE FOTOS DO USUÁRIO — e por que 320 px existe
 *
 * **O achado que obrigou um tamanho novo, e ele é medido e não suposto.** A
 * foto única da pessoa tem `card` 512 × 512 e `thumb` 176 × 176
 * (`DERIVADAS_DA_FOTO_DE_USUARIO`, da frente das imagens). **Nenhuma das duas
 * serve à grade da vitrine**, e a conta é esta: a célula da grade tem 104 dp, e
 * a 3x isso são **312 px reais**. A `thumb` de 176 px seria **AMPLIADA 1,8×** —
 * e ampliar não acrescenta informação nenhuma, só borra; a `card` de 512 px é
 * **1,6× mais dado do que a célula pinta**, e a grade desenha NOVE delas de uma
 * vez, então esse desperdício é multiplicado por nove.
 *
 * Então: `thumb` **320 × 320**, que é o primeiro número redondo acima de 312.
 *
 * **Isto é um PARÂMETRO, e não uma segunda esteira.** A geometria da derivada é
 * por propósito desde este arquivo, e `thumb` já vale 176 × 194 no pet e
 * 480 × 360 no encontro: a variante é o nome do segmento da chave, e a medida é
 * da TELA. Acrescentar um tamanho aqui é exatamente o que este arquivo existe
 * para que seja possível sem tocar em worker, em chave, nem em contrato.
 *
 * - `thumb` 320 × 320 (1:1), `enxuta` — **a derivada da GRADE**. `enxuta` de
 *   propósito e o motivo é o peso da TELA, não o do arquivo: o perfil desenha
 *   até nove de uma vez, e o que importa é a soma. Medido: nove destas somam
 *   centenas de kilobytes; nove `card` de 512 px passariam de 4 MB, que é o
 *   defeito dos 9,8 MB da Loja outra vez.
 * - `card` 1024 × 1024 (1:1), `grande` — a foto ABERTA, que é a única que a
 *   pessoa olha grande, e portanto a única que mira a faixa de 300–500 KB.
 *   `card` é obrigatória: `processar-imagem-de-catalogo.ts` falha ruidosamente
 *   sem ela, e com razão — é ela que sai quando não há `thumb`.
 *
 * Quadrada nas duas, e o corte é deliberado (`altura` presente = `fit: cover`):
 * a grade da vitrine é 1:1 e um retrato sem corte deixaria faixa vazia em cada
 * célula. O ORIGINAL continua inteiro no bucket privado, e é dele que sai
 * qualquer proporção futura.
 */
export const DERIVADAS_DA_VITRINE_DO_USUARIO: readonly EspecificacaoDaDerivada[] = [
  { variante: 'card', largura: 1024, altura: 1024, porte: 'grande' },
  { variante: 'thumb', largura: 320, altura: 320, porte: 'enxuta' },
];

/**
 * A dimensão mínima da foto de pet, que não existia.
 *
 * 600 × 600, e o número tem dois motivos. O primeiro: é o mesmo mínimo que o
 * cliente já aceitou para a capa do encontro da comunidade (01/10), e duas
 * regras com o mesmo propósito e números diferentes é o que ninguém consegue
 * explicar depois. O segundo: abaixo disso a derivada `card` não se preenche
 * sem ampliar, e `withoutEnlargement` não amplia — uma foto de 100 × 100
 * virava um cartaz impresso de 100 px, lido a dois metros como uma mancha.
 *
 * É recusa FINAL, com motivo na tela, e não ampliação em silêncio: ampliar não
 * acrescenta informação nenhuma e esconde da pessoa que a foto não serve.
 */
export const DIMENSAO_MINIMA_DA_FOTO_DE_PET = { largura: 600, altura: 600 } as const;

/**
 * ## A derivada da foto do ACHADO — privada, e uma só
 *
 * 1024 × 1126, a mesma geometria do `card` do pet, e pelo mesmo motivo: é a
 * foto de um animal que alguém vai olhar para reconhecer. `grande`, porque é
 * exatamente a imagem que a pessoa olha grande.
 *
 * **Uma só.** A conversa mediada mostra a foto para o tutor decidir se é o
 * animal dele; não há galeria, cartaz nem miniatura neste caminho, e uma
 * derivada que ninguém pede é um objeto pago a mais.
 *
 * Ela vai para o bucket **privado** (critério 9 da BICHUS-35) — a geometria
 * mora aqui, mas a classe de armazenamento é decisão de
 * `higienizar-foto-do-achado.ts`.
 */
export const DERIVADA_DA_FOTO_DO_ACHADO: EspecificacaoDaDerivada = {
  variante: 'card',
  largura: 1024,
  altura: 1126,
  porte: 'grande',
};

/** A escada que o porte pede. Uma função para não haver um `if` em cada chamador. */
export function escadaDo(porte: EspecificacaoDaDerivada['porte']): readonly number[] {
  return porte === 'grande' ? ESCADA_DA_FAIXA : ESCADA_ENXUTA;
}
