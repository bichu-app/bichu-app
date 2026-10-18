/**
 * As regras da escrita administrativa da `Loja` (ADR-0027 item 14), sem banco e
 * sem servidor.
 *
 * ## O que mora aqui, e o que nao mora
 *
 * Aqui: o estado de publicacao derivado, o destino que precisa terminar no host
 * do parceiro, a data de consulta que nao pode ser futura, o `ETag`, e as duas
 * projecoes que o painel recebe. Todas sao funcoes puras, testadas em
 * `escrita-da-vitrine.test.ts`.
 *
 * Nao mora aqui: **papel**. A guarda do prefixo `/v1/admin` decide quem entra
 * antes de qualquer leitura do recurso (ADR-0027 item 7), e o item 7 diz com
 * essas palavras que nao ha verificacao de papel dentro de caso de uso.
 *
 * ## O painel ve o preco vencido; o app nao
 *
 * `projetarItemAdministrativo` devolve `amount` mesmo depois de `valid_until`:
 * quem reconfere o preco precisa do numero antigo. A omissao do valor vencido e
 * de `projetarItem`, em `item-da-vitrine.ts`, e continua la. As duas usam o
 * MESMO `estadoDoPreco`, entao "vencido" quer dizer a mesma coisa nas duas
 * superficies.
 *
 * ## Nenhum UUID na saida
 *
 * `ItemAdministrativo` carrega o `id` interno porque a trilha grava por ele
 * (ADR-0027 item 8: o `slug` muda, o `id` nao). As projecoes nao o copiam, e
 * o teste reprova se alguma copiar.
 */
import { comoData } from '../../../shared/time/clock.js';
import { errosDoEnderecoCompleto } from '../../../shared/url/endereco-completo.js';
import type { Instant } from '../../../shared/types/brands.js';
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import {
  DIAS_DE_VALIDADE_DO_PRECO,
  diasDeCalendario,
  estadoDoPreco,
  type CategoriaDaVitrine,
  type SubcategoriaDaVitrine,
  type EspecieDoItem,
  type EstadoDoPreco,
} from './item-da-vitrine.js';

/** Derivado no servidor, nunca gravado (`AdminStoreItemPublicationState`). */
export type EstadoDePublicacao = 'draft' | 'published' | 'retired';

export type EstadoDaImagem = 'processing' | 'ready' | 'rejected';

/** Uma imagem da galeria do item, como a escrita a enxerga. */
export interface ImagemDoItem {
  /**
   * O envio (`upload_intents.id`) de que ela nasceu: e o que o painel devolve
   * em `images`. Nulo depois que a conta que enviou foi apagada: a imagem
   * continua no item, sem envio a que apontar.
   */
  readonly uploadId: string | null;
  /** `catalog_images.id`, interno. So a trilha e a escrita o veem. */
  readonly imageId: string;
  readonly position: number;
  /**
   * Nulo quando o painel gravou a imagem sem descricao: o texto alternativo
   * virou OPCIONAL na `Loja` em 17/10/2026 (pedido do cliente). Quem desenha
   * cai no titulo do item; na `Rede` ele continua obrigatorio.
   */
  readonly altText: string | null;
  readonly status: EstadoDaImagem;
  readonly publicKey: string | null;
  readonly rejectionReason: string | null;
}

/** A tag ligada a um item, como o painel a ve: inclusive a inativa. */
export interface TagDoItem {
  readonly slug: string;
  readonly label: string;
  readonly active: boolean;
}

/** A tag do vocabulario. `id` e interno e nunca sai. */
export interface TagAdministrativa {
  readonly id: string;
  readonly slug: string;
  readonly label: string;
  readonly active: boolean;
  readonly itemCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

/** O parceiro como a escrita o enxerga. `id` e interno e nunca sai. */
export interface ParceiroAdministrativo {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly host: string;
  readonly active: boolean;
  readonly sortOrder: number;
  readonly itemCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

/** O item como a escrita o enxerga. `id` e interno e nunca sai. */
export interface ItemAdministrativo {
  readonly id: string;
  readonly slug: string;
  /**
   * **Nulo so no rascunho.** As quatro coisas que a publicacao exige --
   * parceiro, descricao, categoria e destino -- passaram a ser anulaveis na
   * `20261017000002` para o rascunho poder guardar trabalho incompleto (pedido
   * do cliente de 17/10/2026). Quem decide se o conjunto esta completo e
   * `faltaParaPublicar`, e o `CHECK store_items_publicado_esta_completo` e a
   * rede embaixo dele.
   */
  readonly partner: { readonly slug: string; readonly name: string; readonly host: string } | null;
  /** O minimo do rascunho: nunca nulo. */
  readonly title: string;
  readonly summary: string | null;
  readonly category: CategoriaDaVitrine | null;
  /**
   * O rotulo da categoria, lido de `store_categories` na mesma consulta.
   * **Nulo junto com `category`**, que e anulavel no rascunho desde a
   * `20261017000002`: sem codigo nao ha rotulo para resolver.
   */
  readonly categoryLabel: string | null;
  /** O segundo nivel, OPCIONAL. Nulo e estado normal. */
  readonly subcategory: SubcategoriaDaVitrine | null;
  /** O rotulo da subcategoria. Nulo junto com `subcategory`. */
  readonly subcategoryLabel: string | null;
  readonly targetUrl: string | null;
  /**
   * URL do parceiro, so em dado da massa. O painel nunca a escreve (ADR-0027
   * item 6); o que ele escreve e `imagens`.
   */
  readonly imageUrl: string | null;
  readonly species: readonly EspecieDoItem[];
  readonly tags: readonly TagDoItem[];
  /** Em ordem de `position`. */
  readonly imagens: readonly ImagemDoItem[];
  readonly priceAmount: number | null;
  readonly priceCurrency: string | null;
  /** `AAAA-MM-DD`. */
  readonly priceCheckedAt: string | null;
  readonly active: boolean;
  readonly publishedAt: Date | null;
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

// ---------------------------------------------------------------------------
// As duas reguas: o rascunho e a publicacao
// ---------------------------------------------------------------------------

/**
 * O que a publicacao exige e o rascunho nao (pedido do cliente de 17/10/2026).
 *
 * Os nomes sao os CAMPOS DO CONTRATO, e nao as colunas: e esta lista que o
 * painel recebe em `missing_to_publish` e que o 400 da publicacao repete em
 * `errors[].field`, para a tela poder apontar o campo certo sem traduzir nada.
 */
export type FaltaDaPublicacao = 'partner_slug' | 'summary' | 'category' | 'target_url' | 'species';

/**
 * A ordem em que a tela mostra os campos, que e a ordem do resumo de erros.
 * Fixa, e nao a ordem em que a verificacao acontece: duas chamadas com as
 * mesmas faltas devolvem a mesma lista.
 */
export const ORDEM_DA_FALTA: readonly FaltaDaPublicacao[] = [
  'summary',
  'category',
  'species',
  'partner_slug',
  'target_url',
];

/**
 * **A SEGUNDA REGUA.** O rascunho exige so `title` (o minimo para o registro
 * existir e para a pessoa reencontra-lo na lista); a publicacao exige o
 * conjunto inteiro, e esta funcao e quem diz o que falta, campo por campo.
 *
 * Por que uma funcao pura e nao uma validacao do caso de uso: a MESMA resposta
 * precisa sair em dois lugares -- em `missing_to_publish` de toda leitura do
 * item (para o painel dizer o que falta antes de a pessoa clicar) e no `400`
 * de `publishAdminStoreItem`. Duas contas separadas divergiriam, e a tela
 * passaria a prometer uma publicacao que o servidor recusa.
 *
 * `species` entra aqui porque sempre foi regra da publicacao (ADR-0027 A.2.1):
 * o item da massa nasceu sem especie e nao volta ao app sem uma. O que mudou
 * em 17/10/2026 e que as outras quatro passaram a acompanha-la.
 */
export function faltaParaPublicar(item: {
  readonly partner: { readonly slug: string } | null;
  readonly summary: string | null;
  readonly category: CategoriaDaVitrine | null;
  readonly targetUrl: string | null;
  readonly species: readonly EspecieDoItem[];
}): readonly FaltaDaPublicacao[] {
  const falta = new Set<FaltaDaPublicacao>();
  if (item.partner === null) falta.add('partner_slug');
  if (item.summary === null) falta.add('summary');
  if (item.category === null) falta.add('category');
  if (item.targetUrl === null) falta.add('target_url');
  if (item.species.length === 0) falta.add('species');
  return ORDEM_DA_FALTA.filter((campo) => falta.has(campo));
}

/** A frase curta de cada falta, como o `400` da publicacao a escreve. */
export const MENSAGEM_DA_FALTA: Record<FaltaDaPublicacao, string> = {
  summary: 'Escreva a descrição antes de publicar.',
  category: 'Escolha a categoria antes de publicar.',
  species: 'Diga a que espécie o produto serve antes de publicar.',
  partner_slug: 'Escolha o parceiro antes de publicar.',
  target_url: 'Informe o link do produto no parceiro antes de publicar.',
};

/**
 * As faltas na forma de erro de campo do contrato. O `code` segue o
 * `species_required` que a publicacao ja usava desde a BICHUS-267: um
 * `<campo>_required` por campo, e nao um codigo novo com a lista dentro.
 */
export function errosDaFalta(faltas: readonly FaltaDaPublicacao[]): ProblemFieldError[] {
  return faltas.map((campo) => ({
    field: campo,
    code: campo === 'partner_slug' ? 'partner_required' : `${campo}_required`,
    message: MENSAGEM_DA_FALTA[campo],
  }));
}

/**
 * `draft` nunca foi publicado; `published` esta na vitrine; `retired` foi
 * publicado e esta fora. `published_at` e a PRIMEIRA publicacao, e e ele que
 * separa o rascunho do retirado: os dois tem `active = false`.
 */
export function estadoDePublicacao(item: {
  readonly active: boolean;
  readonly publishedAt: Date | null;
}): EstadoDePublicacao {
  if (item.active) return 'published';
  return item.publishedAt === null ? 'draft' : 'retired';
}

/** `AAAA-MM-DD` + `dias`, pelo calendario UTC, que e como `diasDeCalendario` conta. */
export function somarDias(data: string, dias: number): string {
  const [ano, mes, dia] = data.split('-').map(Number);
  if (ano === undefined || mes === undefined || dia === undefined) {
    throw new TypeError(`data fora do formato AAAA-MM-DD: "${data}"`);
  }
  return comoData(Date.UTC(ano, mes - 1, dia + dias) as Instant).toISOString().slice(0, 10);
}

/**
 * O ultimo dia em que o app mostra o valor.
 *
 * `checked_at + 30`, e nao `+ 29`: `estadoDoPreco` so vence com MAIS de 30
 * dias, entao o trigesimo dia ainda vale. Se as duas contas divergissem, o
 * painel diria "vale ate dia 9" e o app pararia de mostrar no dia 9.
 */
export function validoAte(checkedAt: string): string {
  return somarDias(checkedAt, DIAS_DE_VALIDADE_DO_PRECO);
}

/** A data de consulta do preco esta no futuro? Uma pessoa nao consultou amanha. */
export function dataDeConsultaNoFuturo(checkedAt: string, agora: Instant): boolean {
  return diasDeCalendario(checkedAt, agora) < 0;
}

/** Hoje, `AAAA-MM-DD`, pelo calendario UTC. E o corte que a listagem por validade usa. */
export function hojeUtc(agora: Instant): string {
  return comoData(agora).toISOString().slice(0, 10);
}

/**
 * IPv4 em quatro partes decimais, ou IPv6 entre colchetes, que e como o `URL`
 * do WHATWG devolve `hostname`. O contrato nao consegue separar `10.0.0.1` de um
 * nome pela expressao, e diz isso (`HttpsUrl`): a recusa e daqui.
 */
function ehIpLiteral(hostname: string): boolean {
  return hostname.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

/** O teto do contrato para URL de entrada (D47). */
export const TETO_DA_URL = 2048;

/**
 * O site do parceiro, **completo e com `https://`** (padrao do cliente de
 * 17/10/2026).
 *
 * ## O campo mudou de forma, e a coluna NAO
 *
 * `store_partners.host` guarda o nome pelado (`cobasi.com.br`) e continua
 * assim: a leitura compoe `https://<host><caminho>`, o `CHECK` da migracao
 * `20260922000023` cobra o formato de host, e `ehDoParceiro` compara o destino
 * do item contra ele. Trocar a COLUNA para guardar uma URL mexeria nas tres
 * coisas sem o cliente ter pedido nenhuma delas.
 *
 * O que o cliente pediu foi sobre o que a PESSOA DIGITA. Entao a entrada passa
 * a ser `site_url` (`https://parceiro.exemplo.test`), e o host sai dela por
 * `hostDoEndereco`. **Nao ha completacao em silencio na direcao proibida**: o
 * campo nao aceita `cobasi.com.br` e poe `https://` por baixo -- ele recusa e
 * diz o que falta.
 *
 * ## O que isto muda para quem cadastra, e vale avisar
 *
 * Digitar `https://www.parceiro.exemplo.test` guarda o host `www.cobasi.com.br`, e
 * dai em diante os links dos produtos precisam estar nele ou abaixo dele --
 * `https://parceiro.exemplo.test/p`, sem o `www.`, passa a ser recusado para esse
 * parceiro. Nao e defeito: e o parceiro declarando qual e o site dele. Mas e
 * uma escolha que o formulario precisa deixar visivel, e por isso a ajuda do
 * campo mostra o exemplo sem `www.`.
 *
 * ## Caminho no fim e aceito, e descartado
 *
 * `https://parceiro.exemplo.test/` e `https://parceiro.exemplo.test/loja` dao o mesmo host.
 * Recusar a barra final seria recusar o que todo navegador mostra ao copiar um
 * endereco, e e exatamente o tipo de rigor que bloqueou o cliente hoje de
 * manha.
 */
export function errosDoSiteDoParceiro(campo: string, siteUrl: string): ProblemFieldError[] {
  // `253` e o teto de um nome de dominio, e o do contrato para `host`. Com o
  // `https://` na frente, o teto do campo e o do dominio mais o esquema.
  return errosDoEnderecoCompleto(campo, siteUrl, { prefixo: 'site_url', teto: 253 + 'https://'.length });
}

/**
 * Confere a URL de destino de um item contra o host do parceiro (D47 e ADR-0027
 * item 14).
 *
 * ## O host e o do parceiro OU UM SUBDOMINIO DELE, e a diferenca custou caro
 *
 * Ate 17/10/2026 esta funcao exigia o host **exato**, e isso derrubava
 * `www.cobasi.com.br` para o parceiro `cobasi.com.br` -- ou seja, derrubava a
 * forma como a maioria das lojas publica os proprios links. O cliente ficou
 * bloqueado cadastrando um produto legitimo por causa disto.
 *
 * O vinculo com o parceiro **continua sendo a protecao**, e nao foi relaxado
 * para "qualquer host": o que mudou e que `loja.`, `www.` e `produtos.` do
 * MESMO dominio passam a casar.
 *
 * **A comparacao e por sufixo COM FRONTEIRA DE ROTULO, e nunca `endsWith`
 * cru**, porque `endsWith` cru e a armadilha inteira deste problema:
 * `malcobasi.com.br` termina em `cobasi.com.br` e **nao pode passar**. A regra
 * esta em [ehDoParceiro]: ou o host e igual ao do parceiro, ou ele termina em
 * `'.' + hostDoParceiro`. O ponto obrigatorio e o que separa um subdominio de
 * um dominio que so compartilha as ultimas letras, e e por isso que a
 * concatenacao do ponto acontece ali e nao na chamada.
 *
 * ## Query e fragmento PASSAM, e a proibicao anterior era o instrumento errado
 *
 * `?idsku=1197673` e o numero do produto no catalogo do parceiro, nao rastreio
 * de pessoa. A consequencia 3 da BICHUS-185 continua valendo e continua tendo
 * dono: ela e sobre o que o APLICATIVO acrescenta na saida, garantido na tela
 * (`loja_abre_no_navegador_test.dart` reprova parametro acrescentado). O que o
 * parceiro ja publicou na propria URL nunca foi o risco.
 *
 * ## CADA RECUSA DIZ O MOTIVO REAL, e isso nao e cosmetico
 *
 * Todas as recusas devolviam `invalid_url`, e o painel traduzia `invalid_url`
 * para "O link precisa comecar com https://". O cliente leu essa frase sobre um
 * link que comecava com `https://`, e passou a achar que o link dele estava
 * errado. **Mensagem generica nao e so feia: ela manda a pessoa consertar a
 * coisa errada.** Agora cada motivo tem `code` proprio, e o painel tem como
 * dizer a verdade.
 *
 * Devolve os erros de campo, e nao lanca: quem chama junta com os outros erros
 * do corpo e responde um 400 so.
 */
/**
 * O que o vocabulario de categorias respondeu sobre uma classificacao, lido
 * pela transacao e entregue a esta funcao.
 *
 * E uma estrutura, e nao tres booleanos soltos nos parametros, porque os tres
 * so fazem sentido juntos: "a subcategoria existe em outra categoria" nao quer
 * dizer nada sem "ela nao existe nesta".
 */
export interface ClassificacaoDoVocabulario {
  readonly categoriaAtiva: boolean;
  /** A subcategoria existe e esta ativa DENTRO da categoria conferida. */
  readonly subcategoriaNaCategoria: boolean;
  /** A subcategoria existe e esta ativa em ALGUMA categoria -- talvez outra. */
  readonly subcategoriaEmAlgumaCategoria: boolean;
}

/**
 * O `achado` de quem NAO consultou o vocabulario, porque nao havia categoria
 * para consultar (rascunho com `category` nula, `20261017000002`).
 *
 * Existe para que o caminho sem categoria nao precise inventar uma consulta
 * nem o porto precise aceitar `null`: `errosDaClassificacao` devolve antes de
 * olhar para qualquer campo desta estrutura. Os tres `false` sao a verdade --
 * nada foi encontrado, porque nada foi procurado.
 */
export const SEM_CATEGORIA_PARA_CONFERIR: ClassificacaoDoVocabulario = {
  categoriaAtiva: false,
  subcategoriaNaCategoria: false,
  subcategoriaEmAlgumaCategoria: false,
};

/**
 * Os erros de campo da classificacao em dois niveis (decisao do cliente de
 * 17/10: "dois niveis, com subcategorias como a petlove").
 *
 * ## Por que esta conferencia precisa existir na aplicacao
 *
 * Ate 17/10 a categoria era `enum` no contrato, e quem recusava valor
 * desconhecido era o esquema de corpo instalado a partir dele -- esta camada
 * nunca precisou conferir. Agora o vocabulario e DADO (`store_categories`), o
 * contrato declara `string` com formato, e sem esta funcao a unica recusa
 * restante seria a chave estrangeira do banco: o painel receberia erro de
 * integridade em vez de erro de CAMPO, e a tela nao teria onde pintar a
 * mensagem.
 *
 * A chave estrangeira continua la, e continua sendo a trava final. Esta funcao
 * nao a substitui -- ela traduz a mesma regra para a linguagem do formulario.
 *
 * ## QUATRO recusas, e a quarta nasceu na mescla dos dois lotes de 17/10
 *
 * - `unknown_category`: categoria inexistente ou inativa.
 * - `subcategory_not_in_category`: a subcategoria existe no vocabulario, mas
 *   em OUTRA categoria. E o caso de trocar a categoria de um item e deixar a
 *   subcategoria antiga para tras, e a mensagem precisa dizer isso -- "nao
 *   existe" faria a pessoa procurar um erro de digitacao que nao esta la.
 * - `unknown_subcategory`: nao existe em nenhuma, ou esta inativa.
 * - `subcategory_without_category`: subcategoria COM a categoria nula.
 *
 * ## O BURACO QUE A QUARTA RECUSA FECHA
 *
 * As duas mudancas de 17/10 nasceram em branches que nao se enxergavam, e so
 * JUNTAS abrem este caso:
 *
 * - a `20261017000002` deixou `store_items.category` ANULAVEL, para o rascunho
 *   incompleto caber;
 * - esta mudanca poe a subcategoria atras de uma chave estrangeira COMPOSTA
 *   `(category, subcategory)`, e o `MATCH SIMPLE` do Postgres (o padrao) **nao
 *   cobra a restricao quando qualquer coluna da chave e nula**.
 *
 * Resultado: rascunho com `category = NULL` e `subcategory = 'racao_seca'`
 * passava pelo banco e pela aplicacao -- subcategoria SOLTA, pendurada em
 * categoria nenhuma, que nenhuma tela sabe desenhar e que a publicacao
 * descobriria tarde.
 *
 * **Nao fechamos isso somando `subcategory` ao `CHECK
 * store_items_publicado_esta_completo`**, que era a saida obvia, por duas
 * razoes: aquele `CHECK` e `NOT active OR (...)`, entao ele nao olha rascunho
 * -- e o buraco E no rascunho; e somar a coluna la passaria a EXIGIR
 * subcategoria para publicar, o oposto de "o segundo nivel e opcional". O que
 * entrou foi um `CHECK` proprio,
 * `store_items_subcategoria_exige_categoria` (`subcategory IS NULL OR category
 * IS NOT NULL`), cobrado em rascunho E em publicado; esta recusa e a traducao
 * dele para a linguagem do formulario.
 *
 * Devolve os erros de campo, e nao lanca: quem chama junta com os outros erros
 * do corpo e responde um 400 so, como `errosDoDestino` ja faz.
 */
export function errosDaClassificacao(
  categoria: CategoriaDaVitrine | null,
  subcategoria: SubcategoriaDaVitrine | null,
  achado: ClassificacaoDoVocabulario,
): ProblemFieldError[] {
  // Sem categoria nao ha vocabulario a consultar: `achado` nao foi lido (ver
  // `SEM_CATEGORIA_PARA_CONFERIR`) e a unica pergunta que resta e a coerencia
  // dos dois niveis.
  if (categoria === null) {
    return subcategoria === null
      ? []
      : [
          {
            field: 'subcategory',
            code: 'subcategory_without_category',
            message: 'Escolha a categoria antes da subcategoria.',
          },
        ];
  }
  const erros: ProblemFieldError[] = [];
  if (!achado.categoriaAtiva) {
    erros.push({
      field: 'category',
      code: 'unknown_category',
      message: 'Essa categoria não está no vocabulário da Loja.',
    });
  }
  if (subcategoria !== null && !achado.subcategoriaNaCategoria) {
    erros.push(
      achado.subcategoriaEmAlgumaCategoria
        ? {
            field: 'subcategory',
            code: 'subcategory_not_in_category',
            message: 'Essa subcategoria é de outra categoria. Escolha uma da categoria selecionada.',
          }
        : {
            field: 'subcategory',
            code: 'unknown_subcategory',
            message: 'Essa subcategoria não está no vocabulário da Loja.',
          },
    );
  }
  return erros;
}

export function errosDoDestino(
  campo: string,
  targetUrl: string,
  hostDoParceiro: string,
): ProblemFieldError[] {
  if (targetUrl.length > TETO_DA_URL) {
    return [
      {
        field: campo,
        code: 'url_too_long',
        message: `O link passa de ${String(TETO_DA_URL)} caracteres.`,
      },
    ];
  }
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return [{ field: campo, code: 'invalid_url', message: 'Esse texto não é um endereço válido.' }];
  }
  if (url.protocol !== 'https:') {
    return [{ field: campo, code: 'url_not_https', message: 'O link precisa começar com https://.' }];
  }
  if (url.username !== '' || url.password !== '') {
    return [
      {
        field: campo,
        code: 'url_has_credentials',
        message: 'O link tem usuário e senha embutidos. Use o endereço sem eles.',
      },
    ];
  }
  if (ehIpLiteral(url.hostname)) {
    return [
      {
        field: campo,
        code: 'url_ip_literal',
        message: 'O link aponta para um número de IP. Use o endereço com nome.',
      },
    ];
  }
  if (!ehDoParceiro(url.hostname, hostDoParceiro)) {
    return [
      {
        field: campo,
        code: 'host_mismatch',
        message: `O link precisa ser do site do parceiro (${hostDoParceiro}).`,
      },
    ];
  }
  return [];
}

/**
 * O host do destino pertence ao parceiro: e ele mesmo, ou um subdominio dele.
 *
 * **O ponto na concatenacao e a regra inteira.** `'malcobasi.com.br'` termina
 * em `'cobasi.com.br'`, e so nao termina em `'.cobasi.com.br'`. Sem o ponto
 * esta funcao aprovaria qualquer dominio que alguem registrasse terminando com
 * o nome do parceiro, que e o jeito mais barato de fazer um link nosso levar
 * para fora -- e o jeito que ninguem percebe lendo o codigo com pressa.
 *
 * Exportada porque `escrita-da-vitrine.test.ts` a exercita direto: a fronteira
 * de rotulo merece casos proprios, e nao so o reflexo deles em `errosDoDestino`.
 */
export function ehDoParceiro(hostname: string, hostDoParceiro: string): boolean {
  const host = hostname.toLowerCase();
  const alvo = hostDoParceiro.toLowerCase();
  return host === alvo || host.endsWith(`.${alvo}`);
}

/**
 * O host a GUARDAR, ou `null` quando ele e o do proprio parceiro.
 *
 * Nulo no caso comum e deliberado (ver a migracao
 * `20261017000001_link-do-produto-com-query-e-subdominio`): e o que faz trocar
 * o dominio de um parceiro continuar sendo o `UPDATE` de uma coluna so. So o
 * item que mora num subdominio carrega o proprio host.
 *
 * Pressupoe uma URL que `errosDoDestino` ja aprovou.
 */
export function hostDoDestino(targetUrl: string, hostDoParceiro: string): string | null {
  const host = new URL(targetUrl).hostname.toLowerCase();
  return host === hostDoParceiro.toLowerCase() ? null : host;
}

/**
 * O caminho que o banco guarda, a partir de uma URL que `errosDoDestino` ja
 * aprovou. O host sai porque ele vai para `target_host` (ou e o do proprio
 * parceiro), e o esquema porque e sempre `https` na composicao
 * (`enderecoNoParceiro`).
 *
 * **`search` e `hash` ENTRAM**, e ate 17/10/2026 nao entravam: `pathname`
 * sozinho transformava `/racao-granplus-.../p?idsku=1197673` em
 * `/racao-granplus-.../p`, que no site da Cobasi e outra pagina. O defeito
 * seria SILENCIOSO -- o item gravaria, a vitrine mostraria, e a pessoa cairia
 * na pagina errada --, e e por isso que a recusa de `?` na escrita escondia
 * este aqui: enquanto a URL com query era rejeitada na porta, ninguem
 * descobria que o truncamento existia logo atras dela.
 */
export function caminhoDoDestino(targetUrl: string): string {
  const url = new URL(targetUrl);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Tamanho de texto como o `CHECK` do banco o mede: depois de `btrim`.
 *
 * O contrato mede `minLength` sobre o texto cru, entao `"  a "` passa na borda e
 * morreria no `CHECK` como 500. O texto e gravado aparado, e o tamanho e medido
 * sobre o que vai ser gravado.
 */
export function errosDeTexto(
  campo: string,
  valor: string,
  minimo: number,
  maximo: number,
): ProblemFieldError[] {
  const tamanho = valor.trim().length;
  if (tamanho < minimo || tamanho > maximo) {
    return [
      {
        field: campo,
        code: 'length',
        message: `Entre ${String(minimo)} e ${String(maximo)} caracteres.`,
      },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// ETag e If-Match
// ---------------------------------------------------------------------------

/** O `ETag` e a `version` do banco, entre aspas (`components/headers/ETag`). */
export function comoEtag(version: number): string {
  return `"${String(version)}"`;
}

// `lerIfMatch` e `VersaoLida` moram em `shared/http/if-match.ts`, num ponto so
// para a Loja e a Rede: a borda sufixa o ETag (`"3-gzip"`) e as duas leem igual.
export { lerIfMatch, type VersaoLida } from '../../../shared/http/if-match.js';

// ---------------------------------------------------------------------------
// Projecoes do painel
// ---------------------------------------------------------------------------

export interface ParceiroProjetado {
  readonly slug: string;
  readonly name: string;
  readonly host: string;
  readonly active: boolean;
  readonly sort_order: number;
  readonly item_count: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly version: number;
}

export function projetarParceiro(p: ParceiroAdministrativo): ParceiroProjetado {
  return {
    slug: p.slug,
    name: p.name,
    host: p.host,
    active: p.active,
    sort_order: p.sortOrder,
    item_count: p.itemCount,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
    version: p.version,
  };
}

/** `AdminCatalogGalleryImage`: a imagem da galeria como o painel a ve. */
export interface ImagemProjetada {
  readonly upload_id: string | null;
  readonly position: number;
  /** Nulo quando o painel gravou a imagem sem descricao (opcional desde 17/10/2026). */
  readonly alt_text: string | null;
  readonly source: 'uploaded';
  readonly status: EstadoDaImagem;
  readonly url: string | null;
  readonly rejection_reason: string | null;
}

export interface PrecoProjetado {
  readonly amount: number;
  readonly currency: 'BRL';
  readonly checked_at: string;
  readonly valid_until: string;
}

export interface ItemAdministrativoProjetado {
  readonly slug: string;
  /** Nulo so no rascunho (ver `ItemAdministrativo`). */
  readonly partner: { readonly slug: string; readonly name: string; readonly host: string } | null;
  readonly title: string;
  readonly summary: string | null;
  readonly category: CategoriaDaVitrine | null;
  /** Nulo junto com `category` (rascunho incompleto, `20261017000002`). */
  readonly category_label: string | null;
  readonly subcategory: SubcategoriaDaVitrine | null;
  readonly subcategory_label: string | null;
  readonly target_url: string | null;
  /**
   * O que ainda falta para publicar, na ordem dos campos da tela. Vazio quer
   * dizer "da para publicar". O painel o usa para dizer o que falta em vez de
   * so desabilitar o botao.
   *
   * `subcategory` NAO entra aqui: o segundo nivel e opcional. O que se cobra
   * dos dois niveis e a coerencia (`subcategory` sem `category` nao existe), e
   * quem cobra e `errosDaClassificacao` mais o `CHECK
   * store_items_subcategoria_exige_categoria`.
   */
  readonly missing_to_publish: readonly FaltaDaPublicacao[];
  readonly species: readonly EspecieDoItem[];
  readonly tags: readonly TagDoItem[];
  readonly images: readonly ImagemProjetada[];
  readonly price: PrecoProjetado | null;
  readonly price_status: EstadoDoPreco;
  readonly publication_state: EstadoDePublicacao;
  readonly published_at: string | null;
  readonly sort_order: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly version: number;
}

/**
 * A galeria como o painel a ve (`AdminCatalogGalleryImage`). So a imagem
 * pronta ganha `url`: a derivada nao e servida antes (ADR-0027 item 10). O
 * `upload_id` e o identificador que o painel devolve em `images` para manter,
 * reordenar ou remover a imagem, e e o unico UUID que esta resposta carrega,
 * porque o contrato o declara.
 *
 * A URL externa da massa (`image_url`) NAO entra aqui: a galeria exige
 * `upload_id`, e a imagem externa nao tem envio. Ver a entrega da BICHUS-267.
 */
function projetarImagens(
  item: ItemAdministrativo,
  urlDeMidia: (chave: string) => string,
): ImagemProjetada[] {
  return item.imagens.map((i) => ({
    upload_id: i.uploadId,
    position: i.position,
    alt_text: i.altText,
    source: 'uploaded',
    status: i.status,
    url: i.status === 'ready' && i.publicKey !== null ? urlDeMidia(i.publicKey) : null,
    rejection_reason: i.status === 'rejected' ? i.rejectionReason : null,
  }));
}

/**
 * Projeta o item para o painel, **com o preco mesmo vencido**.
 *
 * `price` e objeto unico ou `null`; os tres campos do banco andam juntos
 * (`store_items_preco_anda_completo`), entao "preco sem data" nao tem como
 * aparecer aqui.
 */
export function projetarItemAdministrativo(
  item: ItemAdministrativo,
  agora: Instant,
  urlDeMidia: (chave: string) => string,
): ItemAdministrativoProjetado {
  return {
    slug: item.slug,
    partner:
      item.partner === null
        ? null
        : { slug: item.partner.slug, name: item.partner.name, host: item.partner.host },
    title: item.title,
    summary: item.summary,
    category: item.category,
    category_label: item.categoryLabel,
    subcategory: item.subcategory,
    subcategory_label: item.subcategoryLabel,
    target_url: item.targetUrl,
    missing_to_publish: faltaParaPublicar(item),
    species: [...item.species],
    tags: item.tags.map((t) => ({ slug: t.slug, label: t.label, active: t.active })),
    images: projetarImagens(item, urlDeMidia),
    price:
      item.priceAmount !== null && item.priceCheckedAt !== null && item.priceCurrency === 'BRL'
        ? {
            amount: item.priceAmount,
            currency: 'BRL',
            checked_at: item.priceCheckedAt,
            valid_until: validoAte(item.priceCheckedAt),
          }
        : null,
    price_status: estadoDoPreco(item, agora),
    publication_state: estadoDePublicacao(item),
    published_at: item.publishedAt === null ? null : item.publishedAt.toISOString(),
    sort_order: item.sortOrder,
    created_at: item.createdAt.toISOString(),
    updated_at: item.updatedAt.toISOString(),
    version: item.version,
  };
}

// ---------------------------------------------------------------------------
// O vocabulario de tags (ADR-0027 item 16)
// ---------------------------------------------------------------------------

/** Ate 5 tags por item, e ate 40 ativas no vocabulario: um filtro com duzentas opcoes nao filtra. */
export const TETO_DE_TAGS_POR_ITEM = 5;
export const TETO_DE_TAGS_ATIVAS = 40;
/** Ate 8 imagens por item; `position` de 0 a 7. */
export const TETO_DE_IMAGENS_POR_ITEM = 8;

/**
 * O teto da "Descricao" do produto (`store_items.summary`), em caracteres.
 *
 * **3000 desde 17/10/2026**, decisao do cliente no mesmo dia em que o campo
 * virou area de texto. Era 180, o numero que a `20260922000023` escolheu para
 * "manter uma linha" -- e manter uma linha deixou de ser o objetivo.
 *
 * Esta constante nao e a autoridade: o `CHECK` da `20261017000002` e o
 * `maxLength` do contrato tambem dizem 3000, e os tres precisam dizer o mesmo
 * numero. Ela existe para que o caso de uso nao carregue um literal solto, que
 * e o que faz um dos tres ficar atras dos outros.
 *
 * **`network_events.summary` tem teto PROPRIO (200)** e nao usa esta.
 */
export const TETO_DA_DESCRICAO_DO_ITEM = 3000;

/** Mesmo formato de `Slug` no contrato e de `store_tags_slug_formato` no banco. */
const FORMATO_DE_SLUG = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

/**
 * O que a normalizacao trata como espaco: o espaco que alguem digita -- barra
 * de espaco, tabulacao, quebra de linha -- e os separadores de espaco Unicode.
 *
 * **Nao inclui `U+FEFF`, `U+2028` nem `U+2029`, que o `\s` do JavaScript
 * inclui.** Esses tres sao INVISIVEIS, e sao da alcada de
 * `INVISIVEL_OU_DE_CONTROLE`: aparar ou juntar um deles aqui esconderia do
 * proprio detetor o caractere que ele existe para recusar. Com `\s`,
 * `Ra<BOM>cao` chegava a `conferirRotulo` como `Ra cao` -- outro nome, outro
 * `slug`, e nenhum erro. Tabulacao e quebra continuam espaco de proposito: e
 * o que faz um rotulo so com elas ser recusado pelo PISO, e nao pelo
 * invisivel.
 */
const ESPACO_DO_ROTULO = '[\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u202f\\u205f\\u3000]';
const ESPACO_NAS_PONTAS = new RegExp(`^(?:${ESPACO_DO_ROTULO})+|(?:${ESPACO_DO_ROTULO})+$`, 'gu');
const ESPACO_REPETIDO = new RegExp(`(?:${ESPACO_DO_ROTULO})+`, 'gu');

/**
 * O rotulo como vai ser gravado: pontas aparadas e espacos repetidos juntados.
 * E sobre ESTE valor que o tamanho e o conjunto de caracteres sao conferidos.
 */
export function normalizarRotulo(rotulo: string): string {
  return rotulo.replace(ESPACO_NAS_PONTAS, '').replace(ESPACO_REPETIDO, ' ');
}

/**
 * O `slug` da tag, derivado do rotulo: NFKD, sem marca diacritica, minusculo,
 * espaco vira hifen, hifens repetidos viram um, e nenhum hifen nas pontas.
 * `Ração`, `racao` e `RACAO` dao `racao`, e e isso que faz o indice unico do
 * `slug` recusar a segunda grafia.
 *
 * **`&` e `+` viram hifen; o apostrofo sai.** Sem isso `N&D` daria o `slug`
 * `n&d`, que `FORMATO_DE_SLUG` recusa, e o rotulo que o cliente precisa
 * cadastrar morria na derivacao mesmo depois de passar no alfabeto. `N&D` da
 * `n-d` (tres caracteres, cabe no formato), `Hill's` da `hills` e
 * `Farmina N&D Ocean` da `farmina-n-d-ocean`. Como nenhum deles sobra no
 * `slug`, o filtro publico (`GET /store/items?tag=`) continua recebendo so
 * `[a-z0-9-]`: o `&` do rotulo nunca chega a uma query string.
 */
export function slugDaTag(rotulo: string): string {
  return normalizarRotulo(rotulo)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[ &+]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * O teto do rotulo de tag. Mantido em 24 de proposito: e o `maxLength` do
 * contrato E o `CHECK store_tags_rotulo_tem_tamanho` do banco, e e o que o
 * cartao da Loja comporta numa linha. Mexer nele e migracao mais contrato nas
 * quatro aplicacoes, e nenhum nome de marca real precisa de mais (`Farmina N&D
 * Ocean` tem 17).
 */
export const MAXIMO_DO_ROTULO_DE_TAG = 24;

/**
 * O piso do rotulo. **Nao e o que recusava `N&D`** (tres caracteres passavam no
 * tamanho; o que recusava era o alfabeto e, depois dele, o `slug` `n&d`).
 * Continua 2 porque e o piso do `CHECK` do banco: baixa-lo aqui sem migracao
 * trocaria um 400 honesto por um 500.
 */
export const MINIMO_DO_ROTULO_DE_TAG = 2;

/**
 * Caractere invisivel ou de controle: controle C0/C1, formato (marca de direcao
 * bidirecional, juntor de largura zero, BOM) e separador de linha e paragrafo.
 *
 * **Isto nao e "caractere especial", e a recusa nao e de estetica.** Sao os
 * caracteres que deixam escrever um nome que PARECE uma coisa e e outra -- a
 * marca bidi reordena o que a pessoa le, o espaco de largura zero parte uma
 * palavra sem aparecer. Num rotulo que a Loja publica, isso e confianca.
 * Recusado antes do alfabeto, e com codigo proprio, para a tela poder dizer o
 * que de fato aconteceu.
 */
const INVISIVEL_OU_DE_CONTROLE =
  /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/u;

/**
 * O alfabeto do rotulo: letra (com acento e cedilha, em NFC ou em NFD, por isso
 * `\p{M}`), digito, espaco, e a pontuacao que nome de marca usa -- `&`, hifen,
 * apostrofo reto ou curvo, e `+`.
 *
 * **`.` e `/` ficam de fora, de proposito.** O alfabeto antigo (so letra,
 * digito, espaco e hifen) era o que impedia link, dominio e e-mail num texto
 * que a Loja publica sem revisao. `@` e `:` ja nao entram; com `.` e `/`
 * dentro, `bit.ly/x` e `loja.com.br` voltariam a ser rotulos validos, e o
 * detector de D59 (`temContatoOuPagamento`) vive em `modules/network/domain` --
 * a fronteira de modulo nao deixa este dominio importa-lo, e escrever um
 * segundo detector aqui seria manter dois. Nenhum dos nomes pedidos (`N&D`,
 * `Pro Plan`, `Hill's`, `Royal Canin`, `Farmina N&D Ocean`, `3 Coracoes`)
 * precisa de ponto nem de barra. Para libera-los, o caminho e mover o detector
 * para `shared/` primeiro.
 */
const ALFABETO_DO_ROTULO = /^[\p{L}\p{M}\p{N} &'\u2019+-]+$/u;

/**
 * Confere o rotulo e devolve o que gravar, em quatro passos e nesta ordem:
 * tamanho, caractere invisivel, alfabeto, e `slug` derivado.
 *
 * O `slug` derivado precisa caber no formato de `Slug` (3 a 30 caracteres), que
 * e compartilhado com parceiro, item e encontro e e tambem o `CHECK` do banco.
 * E ELE o piso de tres caracteres que o cliente sentiu: rotulo de um ou dois
 * caracteres (`N`, `Pé`) continua recusado com `code: tag_slug_invalid`, porque
 * um `slug` de um caractere quebraria o filtro publico (`tag` no contrato e
 * `Slug`) alem do banco. Aceitar rotulo de um caractere visivel e migracao mais
 * um `StoreTagSlug` novo no contrato; vai na entrega, nao aqui.
 */
export function conferirRotulo(
  campo: string,
  rotulo: string,
): { readonly erros: ProblemFieldError[]; readonly rotulo: string; readonly slug: string } {
  const normalizado = normalizarRotulo(rotulo);
  const slug = slugDaTag(normalizado);
  if (normalizado.length < MINIMO_DO_ROTULO_DE_TAG || normalizado.length > MAXIMO_DO_ROTULO_DE_TAG) {
    return {
      erros: [
        {
          field: campo,
          code: 'length',
          message: `Entre ${String(MINIMO_DO_ROTULO_DE_TAG)} e ${String(MAXIMO_DO_ROTULO_DE_TAG)} caracteres.`,
        },
      ],
      rotulo: normalizado,
      slug,
    };
  }
  if (INVISIVEL_OU_DE_CONTROLE.test(normalizado)) {
    return {
      erros: [
        {
          field: campo,
          code: 'tag_invisible_char',
          message: 'Este nome tem caractere invisível. Apague o campo e digite o nome de novo.',
        },
      ],
      rotulo: normalizado,
      slug,
    };
  }
  if (!ALFABETO_DO_ROTULO.test(normalizado)) {
    return {
      erros: [
        {
          field: campo,
          code: 'tag_charset',
          message: 'Só letras, números, espaço e os sinais & - ’ +.',
        },
      ],
      rotulo: normalizado,
      slug,
    };
  }
  if (!FORMATO_DE_SLUG.test(slug)) {
    return {
      erros: [
        {
          field: campo,
          code: 'tag_slug_invalid',
          message: 'Este rótulo não forma um endereço válido. Use pelo menos três letras, números ou hífens.',
        },
      ],
      rotulo: normalizado,
      slug,
    };
  }
  return { erros: [], rotulo: normalizado, slug };
}

export interface TagProjetada {
  readonly slug: string;
  readonly label: string;
  readonly active: boolean;
  readonly item_count: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly version: number;
}

export function projetarTag(t: TagAdministrativa): TagProjetada {
  return {
    slug: t.slug,
    label: t.label,
    active: t.active,
    item_count: t.itemCount,
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt.toISOString(),
    version: t.version,
  };
}

/**
 * O `slug` do item derivado do titulo (`AdminStoreItemInput.slug`, opcional
 * desde 23/09): a mesma normalizacao da tag, cortada para caber no formato de
 * `Slug` (3 a 30) junto com o sufixo. Sem sufixo, devolve `undefined` quando o
 * titulo nao da um endereco valido (`Pé`): quem chama passa a usar sufixo.
 */
export function slugDoItem(titulo: string): string | undefined;
export function slugDoItem(titulo: string, sufixo: string): string;
export function slugDoItem(titulo: string, sufixo?: string): string | undefined {
  const base = slugDaTag(titulo);
  const espacoDoSufixo = sufixo === undefined ? 0 : sufixo.length + 1;
  const cortado = base.slice(0, 30 - espacoDoSufixo).replace(/-+$/, '');
  if (sufixo === undefined) return FORMATO_DE_SLUG.test(cortado) ? cortado : undefined;
  return cortado === '' ? `item-${sufixo}` : `${cortado}-${sufixo}`;
}

/** Quatro caracteres base36 (cerca de 20 bits) tirados do CSPRNG. */
export function sufixoCurto(aleatorio: Uint8Array): string {
  const n = ((aleatorio[0] ?? 0) << 16) | ((aleatorio[1] ?? 0) << 8) | (aleatorio[2] ?? 0);
  return (n % 1_679_616).toString(36).padStart(4, '0');
}
