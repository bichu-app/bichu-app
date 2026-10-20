/**
 * A LISTA DE PALAVRAS da moderacao. **Este arquivo e dado, nao mecanismo.**
 *
 * Ele existe separado de `moderacao.ts` por um motivo so: a lista muda, e quem
 * a muda nao e quem escreve codigo de regex. Para incluir ou tirar uma palavra
 * basta editar uma linha daqui -- nenhuma palavra proibida esta escrita em
 * qualquer outro arquivo do projeto, e e assim que isto tem de continuar.
 *
 * Pedido do cliente, 18/10/2026, por extenso: *"nos campos de indicacao e
 * recomendacao de profissionais, os campos devem ter moderacao de palavras e
 * nao permitir xingamentos, discriminacao, e tudo que possa prejudicar a
 * imagem do app"*.
 *
 * ## A REGRA QUE DECIDIU O CONTEUDO DESTE ARQUIVO
 *
 * Isto e um diretorio de **negocios reais com nome de gente** dentro de um
 * **aplicativo de animais**. As duas coisas juntas tornam a lista de palavras
 * perigosa de um jeito que ela nao e em outros produtos: a maior parte do
 * palavreado ofensivo do portugues brasileiro e **palavra do dia a dia
 * reaproveitada** -- nome de animal, cor de pelagem, parte do corpo,
 * gentilico, sobrenome. Bloquear por palavra bloqueia a **Clinica Pinto**, a
 * **Cadela** (termo correto de veterinaria) e o **cavalo Crioulo** (raca).
 *
 * Entao o critério de entrada aqui e um teste, e nao uma opiniao:
 *
 *   **uma palavra so entra se nao houver nome proprio nem uso legitimo
 *   plausivel que caia nela.** Na duvida, ela fica FORA.
 *
 * Deixar passar um xingamento custa uma remocao pelo administrador, que ja
 * existe. Bloquear a Clinica Pinto custa o cadastro dela, e o dono nunca
 * descobre por que -- e esse e o defeito que nao aparece em nenhuma medicao.
 *
 * ## AS PALAVRAS QUE FORAM TESTADAS E **REPROVADAS**, com a colisao de cada uma
 *
 * Esta secao e parte do arquivo e nao comentario de rascunho: ela impede que a
 * proxima pessoa re-inclua o que ja foi medido e descartado.
 *
 * **Sobrenome e topónimo** (casariam com o nome do negocio, que e o nome da
 * familia): `pinto` (Clinica Pinto -- e tambem o filhote de galinha),
 * `rola` (sobrenome Rola, e o verbo: "o encontro rola sabado"), `buceta`
 * (sobrenome real), `prego`, `peruca`, `veado` (o cervideo e nome de lugar),
 * `pau` (madeira, pau-brasil), `cacete` (pao cacete, bastao), `mongol`
 * (nacionalidade), `japa` (metade dos restaurantes japoneses do pais).
 *
 * **Termo do dominio -- animal, pelagem, raca, anatomia veterinaria.** Esta e
 * a familia mais cara, porque ela e exatamente o assunto do aplicativo:
 * `cadela` e `cachorra` (femea de cao, termo CORRETO em veterinaria),
 * `cao`, `vaca`, `egua`, `galinha`, `burro`, `besta`, `macaco`, `bicho`,
 * `rabo`, `piranha` (o peixe, e o prendedor de cabelo), `perereca` (o
 * anfibio), `crioulo` (a raca de cavalo Crioulo), `preto` (pelagem),
 * `corno` (**corno uterino** -- anatomia, aparece em ficha de castracao),
 * `escroto` (idem), `retardado` ("crescimento retardado", diagnostico).
 *
 * **Fezes de animal.** `bosta`, `cagar` e `cagada` sairam por serem o uso
 * LITERAL num aplicativo de animais: "a calcada estava cheia de bosta de
 * cachorro" e descricao, nao xingamento. `merda` ficou porque o uso dominante
 * dela e expletivo.
 *
 * **Critica legitima.** A recomendacao e campo de **avaliacao**, e avaliacao
 * ruim tem de passar: `nojento`, `ladrao`, `charlatao`, `desgracado` e
 * `trouxa` sairam por isso. Quem quer barrar critica usa a remocao pelo
 * administrador e responde por ela; o filtro nao serve para calar cliente
 * insatisfeito.
 *
 * **Afeto com animal.** `safado`, `sacana` e `sacanagem` sairam porque
 * "cachorro safado" e carinho, e e dito o tempo todo.
 *
 * **Elogio.** `foda` saiu sozinha: "esse lugar e foda" e elogio no Brasil.
 * `fodase`, `foder`, `fodido` e `fudido` ficaram, e cobrem "foda-se" pela
 * normalizacao de hifen.
 *
 * **Sigla e inicial.** `cu` e `fdp` sairam: duas e tres letras colidem com
 * inicial e abreviatura ("C.U.", "FDP") e o custo do falso positivo e alto
 * demais para o que elas pegam.
 *
 * **Termo historico.** `nazista` saiu; e a palavra que um texto usa para
 * CRITICAR nazismo.
 *
 * ## O QUE ESTA LISTA NAO TEM, e e a ausencia mais importante dela
 *
 * **Nao ha nenhuma palavra de injuria racial.** Nao e esquecimento e nao e
 * recusa em tratar o assunto: em portugues brasileiro a injuria racial e feita
 * quase inteira de palavras reaproveitadas -- nome de animal (`macaco`),
 * cor (`preto`), raca de cavalo (`crioulo`), gentilico (`baiano`,
 * `nordestino`), brasa (`ticao`). **Toda uma delas colide com uso legitimo
 * dentro de um aplicativo de animais**, e varias colidem com a propria
 * identidade de quem elas atacam. Uma lista que as pegasse recusaria "gato
 * preto", "cavalo crioulo" e "clinica do macaco" -- e continuaria sem pegar a
 * frase racista escrita sem nenhuma delas, que e como ela costuma vir.
 *
 * Portanto: **para discriminacao racial, a protecao do produto NAO e este
 * arquivo.** Ela e a remocao pelo administrador e a denuncia. Dizer o
 * contrario ao cliente seria vender o que uma lista de palavras nao entrega.
 *
 * ## Como editar
 *
 * - Uma palavra por linha, **minuscula, sem acento, sem espaco**. A
 *   normalizacao de `moderacao.ts` resolve acento, maiuscula, troca de
 *   caractere e letra repetida: `caralho` pega `C@R4LH0` e `caraaalho`.
 * - **O plural com `s` ja esta coberto**: `puta` pega `putas`. Nao escreva as
 *   duas.
 * - **Nao ha radical nem flexao automatica**: `foder` NAO pega `fodendo`. Se
 *   uma flexao importa, ela entra como linha propria.
 * - Antes de incluir, faca o teste: escreva um nome de clinica, de pet shop ou
 *   de familia plausivel que caia na palavra. Se conseguir, ela nao entra.
 * - Se uma palavra nova puder colidir com nome proprio ou termo de
 *   veterinaria, acrescente a colisao em [EXCECOES] -- **a excecao vence o
 *   bloqueio**, sempre.
 */

/**
 * As palavras recusadas, agrupadas so para leitura humana: a moderacao junta
 * tudo num conjunto e nao distingue grupo. O grupo existe para quem edita
 * saber onde por a proxima.
 */
const VULGARIDADE_SEXUAL: readonly string[] = [
  'porra',
  'caralho', // topónimo em Portugal; aqui o diretorio e brasileiro e o risco e aceito
  'foder',
  'fodase', // tambem pega "foda-se", porque o hifen some na normalizacao
  'fodido',
  'fudido',
  'piroca',
  'xoxota',
  'xereca',
  'boquete',
  'punheta',
  'siririca',
  'putaria',
];

const ESCATOLOGIA: readonly string[] = [
  'merda', // a unica que sobrou: ver a secao de fezes de animal, no cabecalho
];

const XINGAMENTO: readonly string[] = [
  'puta',
  'putinha',
  'vagabunda',
  'vagabundo',
  'otario',
  'idiota',
  'imbecil',
  'babaca',
  'canalha',
  'cretino',
  'panaca',
];

/** Sigla de xingamento. Duas letras nao entram: colidem com inicial. */
const SIGLA: readonly string[] = ['pqp', 'vtnc'];

/**
 * Injuria de orientacao, identidade e capacidade.
 *
 * So as que **nao sao palavra de outra coisa**. `bicha` ficou fora (verme, fila
 * e a um caractere de `bicho`, que e palavra do produto) e nao ha nenhuma de
 * injuria racial -- a razao esta por extenso no cabecalho.
 */
const DISCRIMINACAO: readonly string[] = [
  'viado', // `veado`, o animal, NAO esta aqui e nao deve entrar
  'boiola',
  'traveco',
  'sapatao',
  'mongoloide',
];

export const PALAVRAS_RECUSADAS: readonly string[] = [
  ...VULGARIDADE_SEXUAL,
  ...ESCATOLOGIA,
  ...XINGAMENTO,
  ...SIGLA,
  ...DISCRIMINACAO,
];

/**
 * A LISTA DE EXCECAO, e **ela vence o bloqueio**.
 *
 * Hoje nenhuma destas palavras esta em [PALAVRAS_RECUSADAS] -- elas foram
 * reprovadas no teste de colisao antes de entrar. A excecao nao e redundante
 * por isso: ela e a **rede de seguranca da proxima edicao**. No dia em que
 * alguem incluir `pinto` por achar que esta protegendo o aplicativo, a Clinica
 * Pinto continua conseguindo se cadastrar, e o defeito que ninguem mediria nao
 * acontece.
 *
 * Ela tambem protege a normalizacao de si mesma: letra repetida e troca de
 * caractere podem, em principio, transformar uma palavra inocente numa
 * proibida, e a excecao e conferida **antes** do bloqueio sobre a MESMA forma
 * normalizada.
 *
 * Duas familias, e os motivos sao diferentes:
 *
 * 1. **Nome proprio** -- sobrenome e topónimo que o Brasil tem de verdade e que
 *    aparecem em nome de negocio, porque o negocio leva o nome da familia.
 * 2. **Termo do dominio** -- animal, pelagem, raca e anatomia veterinaria.
 *    `cadela` e o exemplo que decide o desenho: e o termo CORRETO para femea de
 *    cao, e um aplicativo de animais que a recusasse estaria recusando o
 *    vocabulario da propria profissao que ele atende.
 */
const NOME_PROPRIO: readonly string[] = [
  'pinto',
  'pintos',
  'buceta',
  'rola',
  'prego',
  'peruca',
  'cunha',
  'paulo',
  'veado',
  'cacete',
  'pau',
  'mongol',
  'japa',
];

const TERMO_DO_DOMINIO: readonly string[] = [
  'cao',
  'cadela',
  'cachorra',
  'cachorro',
  'bicho',
  'bichano',
  'rabo',
  'vaca',
  'egua',
  'galinha',
  'burro',
  'besta',
  'macaco',
  'piranha', // o peixe, e o prendedor de cabelo
  'perereca', // o anfibio
  'crioulo', // a raca de cavalo
  'preto', // pelagem
  'corno', // corno uterino
  'escroto', // anatomia
  'retardado', // "crescimento retardado"
];

export const EXCECOES: readonly string[] = [...NOME_PROPRIO, ...TERMO_DO_DOMINIO];
