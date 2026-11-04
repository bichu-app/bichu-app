/**
 * O PISO DA IMAGEM, num ponto so -- a moldura, a largura decidida e a dimensao
 * minima que sai das duas.
 *
 * ## Por que este arquivo existe
 *
 * Em 02/11/2026 o cliente travou publicando uma recomendacao de
 * estabelecimento: a moldura de `directory_photo` e 16:9 e o piso era
 * 600 x 600, que e QUADRADO. Uma faixa 16:9 so alcanca 600 de ALTURA com 1067
 * de largura, entao a foto dele (1028 x 578) era recusada por uma regra que o
 * proprio recorte do produto nao conseguia cumprir. O 600 era o numero da
 * LOGO, que e quadrada, e vazou para a foto em 18/10/2026.
 *
 * Em 03/11/2026 ele travou de novo, agora na capa do encontro -- *"estou
 * testando na capa do evento e nao esta funcionando, ta dando o mesmo erro
 * antigo"* --, e disse o que esperava: *"as vezes a foto ja tem 600px de
 * largura e e muito grande na altura, ai precisa manter os 600px que e o
 * minimo, mas realizar o crop na altura"*.
 *
 * E fixou a regra que decide este desenho: *"sempre que estivermos falando de
 * upload de imagem, isso deve ser tratado no mesmo lugar, e as correcoes devem
 * ser realizadas em todos os lugares por ser o mesmo codigo"*.
 *
 * Por isso a dimensao minima **nao e uma tabela de pares escritos a mao**: a
 * altura e DERIVADA da proporcao da moldura. Par escrito a mao pode discordar
 * da moldura outra vez, e foi exatamente assim que o defeito nasceu -- ele
 * atravessou typecheck, eslint e a suite inteira.
 *
 * O arquivo e separado de `envio-de-imagem.ts` por uma razao mecanica:
 * `recorte-de-imagem.ts` importa VALORES de `envio-de-imagem.ts`, entao o
 * piso nao pode morar la e ler a moldura de la sem fechar um ciclo em tempo de
 * execucao. Aqui o unico import e de TIPO, que desaparece na compilacao.
 */
import type { Esquemas } from '../api/cliente.ts';

export type Proposito = Esquemas['AdminCatalogImageIntentInput']['purpose'];

/**
 * A proporcao da moldura por proposito, e ela NAO e escolha de tela: sai da
 * geometria das derivadas em `src/modules/media/domain/derivadas.ts`. O
 * servidor deriva a dele da MAIOR derivada com altura (`proporcaoDaMoldura`), e
 * este espelho e cobrado contra a largura decidida pelo portao da classe em
 * `test/recorte-de-imagem.test.ts`.
 */
export const PROPORCAO_DA_MOLDURA: Record<Proposito, number | null> = {
  store_item: null,
  network_event: 16 / 9,
  directory_logo: 1,
  directory_photo: 16 / 9,
  directory_gallery: 16 / 9,
};

/**
 * A LARGURA minima decidida de cada proposito -- o unico numero escrito a mao,
 * e o espelho de `LARGURA_MINIMA` em
 * `src/modules/media/ports/imagem-de-catalogo.ts`.
 *
 * `1280` na foto e na galeria do local e a decisao do cliente de 02/11/2026 e
 * **fica**: `1280/720` e exatamente `16/9`, entao aquele piso sempre foi
 * coerente. A premissa que escolheu o 1280 ("no piso nada e ampliado") era
 * falsa -- o servidor usa `withoutEnlargement: true` nas duas formas do
 * `resize` e nunca amplia --, mas o NUMERO continua coerente, e baixa-lo seria
 * decisao nova que o cliente nao tomou.
 */
export const LARGURA_MINIMA: Record<Proposito, number> = {
  store_item: 800,
  network_event: 600,
  directory_logo: 256,
  directory_photo: 1280,
  directory_gallery: 1280,
};

/** A altura do piso: a que a moldura impoe a essa largura. */
export function alturaDoPiso(largura: number, proporcao: number | null): number {
  return proporcao === null ? largura : Math.round(largura / proporcao);
}

/**
 * A dimensao minima, **derivada**: nenhum par e escrito a mao.
 *
 * O piso derivado e PONTO FIXO, e isso foi medido e nao suposto: uma imagem
 * 600 x 338 recortada em 16:9 sai 600 x 338 -- o arredondamento cai no empate
 * exato (337,5), e `Math.round` o resolve para cima.
 */
export const DIMENSAO_MINIMA: Record<Proposito, { largura: number; altura: number }> = Object.fromEntries(
  (Object.keys(LARGURA_MINIMA) as Proposito[]).map((proposito) => {
    const largura = LARGURA_MINIMA[proposito];
    return [proposito, { largura, altura: alturaDoPiso(largura, PROPORCAO_DA_MOLDURA[proposito]) }];
  }),
) as Record<Proposito, { largura: number; altura: number }>;
