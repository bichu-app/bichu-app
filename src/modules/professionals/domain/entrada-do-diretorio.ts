/**
 * A projecao de uma entrada do diretorio: o que a secao `Perto` mostra.
 *
 * ## O que NAO sai daqui, e por que cada ausencia e decisao
 *
 * - **`id`.** `professionals.id` e UUID interno, e o ADR-0010 item 6 o proibe
 *   em saida. O endereco de uma entrada e o `slug`, como o do pet.
 * - **Quem convidou, e quem e o titular.** As duas colunas ligam a entrada a
 *   uma conta de pessoa, e a BICHUS-174 proibe expor vinculo entre duas pessoas
 *   inclusive como contagem e como existencia. Nenhuma das duas aparece no tipo
 *   de entrada desta funcao: o que nao chega aqui nao tem como sair daqui.
 * - **A coordenada.** `professionals.geo` nunca atravessa esta funcao. O que
 *   sai e distancia em metros, arredondada, que e um numero e nao uma posicao.
 * - **CRMV e CNPJ.** `verification` ja diz o que foi verificado, e pelo tipo de
 *   prova. Publicar o numero de registro de um terceiro numa lista acrescenta
 *   exposicao sem acrescentar decisao para quem le.
 *
 * ## `status` tambem nao sai, e por um motivo diferente
 *
 * Nao e privacidade: e que so `published` chega ate aqui. O filtro vive na
 * clausula `WHERE` da consulta (ADR-0021, o mesmo desenho da autorizacao), e
 * nao num `if` desta funcao. Projecao que filtra e projecao que um dia esquece.
 */
import {
  projetarPontuacao,
  type PontuacaoDoLocal,
  type PontuacaoPublica,
} from './avaliacao-do-local.js';
import {
  evidenciasAprovadas,
  nivelDerivado,
  type NivelDeVerificacao,
  type TipoDeEvidencia,
  type VerificacaoDaEntidade,
} from './nivel-de-verificacao.js';

/**
 * A lista fechada de `professionals.kinds`: a ATIVIDADE, o que se contrata.
 * **Espelhada** em `src/shared/db/schema.ts` e conferida pela entrada
 * `public.professionals.professionals_atividades_conhecidas` de
 * `tests/integration/conjunto-exato-dos-checks.test.ts`.
 *
 * **Continua sem valor para ONG, e a ausencia agora e desenho concluido.** O
 * texto anterior aqui dizia "decisao pendente do modelo" e nomeava a coluna que
 * faltava; desde `20261018000012` ela existe, e o tipo de entidade e eixo
 * proprio (`TipoDeEntidade`). ONG nao entra nesta lista porque **uma ONG nao e
 * uma atividade**: ela tem atividade (`clinic`, `vet`) E tipo de entidade
 * (`organization`), os dois ao mesmo tempo.
 *
 * **ELA CRESCEU EM 28/10/2026, e isso nao afrouxa a frase acima.** O cliente
 * pediu `store` e `hospital` (migracao `20261028000001`), e os dois sao
 * ATIVIDADE -- nenhum deles e tipo de entidade. "Profissional autonomo" foi
 * pedido e depois RETIRADO por ele mesmo, verbatim: *"na verdade, nao inclua
 * profissional autonomo como atividade, ja esta no tipo"*.
 *
 * O preco foi pago de proposito: acrescentar valor a um `enum` que sai em
 * RESPOSTA quebra o contrato (`oasdiff`,
 * `response-property-enum-value-added`), e para estes dois valores foram
 * **26 erros e 16 avisos em 12 operacoes**, medidos em 28/10 contra o
 * `development` em `6b60db94`, com dispensa datada em
 * `.github/quality-gates.yml`. **Nao reuse a contagem**: o numero que esta
 * prosa carregava antes ("12 erros medidos em 18/10") era de um valor
 * hipotetico num contrato mais pequeno, e quem alargar a lista de novo tem de
 * medir outra vez.
 */
export type TipoDeProfissional =
  | 'vet'
  | 'groomer'
  | 'walker'
  | 'sitter'
  | 'trainer'
  | 'clinic'
  // `store` e `hospital` (cliente, 28/10/2026, migracao `20261028000001`).
  //
  // `store` NAO e a secao `Loja` do produto (`store_items`): aqui e um
  // estabelecimento que vende aparecendo em `Perto` -- um petshop. `hospital`
  // existe separado de `clinic` porque hospital interna e tem plantao, e com
  // um valor so a distincao ficaria no NOME do estabelecimento, onde nenhum
  // filtro alcanca.
  | 'store'
  | 'hospital';

/**
 * A lista fechada de `professionals.entity_kind`: o QUE a entrada e.
 *
 * Mesmo nome e mesmos valores de `entity_verifications.entity_kind`
 * (`20260921000002`), que carrega `organization` desde antes de existir linha
 * -- a revisao de 17/09 do ADR-0011 generalizou a verificacao para ENTIDADE
 * exatamente para isso. Segunda convencao para o mesmo conceito e a convencao
 * que diverge.
 */
export type TipoDeEntidade = 'professional' | 'organization';

/**
 * A grade em que o produto quantiza a localizacao do usuario (ADR-0006).
 *
 * Arredondar a distancia nela nao e zelo defensivo: **precisao maior nao existe
 * na origem**. Devolver "1 237 m" a partir de um ponto que ja foi arredondado
 * para uma celula de 100 m seria anunciar uma exatidao que o dado nao tem.
 */
export const GRADE_EM_METROS = 100;

/** A entrada como o repositorio a entrega. Sem `id`, sem ponto, sem vinculo. */
export interface EntradaDoDiretorio {
  readonly slug: string;
  /**
   * AS ATIVIDADES, de 1 a 6 (cliente, 21/10/2026). Nunca vazia: o banco cobra
   * o minimo 1 (`professionals_atividades_tamanho`) e o caso de uso tambem.
   *
   * A ordem so importa para uma coisa: `kinds[0]` e o que a projecao publica em
   * `kind`, o campo de compatibilidade que o APK em campo le.
   */
  readonly kinds: readonly TipoDeProfissional[];
  readonly entityKind: TipoDeEntidade;
  readonly displayName: string;
  readonly about: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly neighborhood: string | null;
  readonly phoneE164: string | null;
  /**
   * O SITE (cliente, 21/10/2026). A URL inteira, como gravada -- nunca so o
   * host e nunca normalizada. Sai ao lado de `phoneE164` e pela mesma razao:
   * canal que a entidade publicou de proposito para ser procurada (ADR-0011
   * secao 4).
   */
  readonly siteUrl: string | null;
  readonly verificacoes: readonly VerificacaoDaEntidade[];
  /**
   * Metros cruas, como o banco as calculou. **Nulo** quando a entrada nao tem
   * coordenada ou quando quem chama nao tem localizacao valida. Nulo e um
   * resultado; zero seria uma mentira a 100 m de distancia.
   */
  readonly distanciaEmMetros: number | null;
  /**
   * A LOGO, liberada para o aplicativo pelo cliente em 18/10/2026.
   *
   * `null` em TRES casos que a tela trata igual: a entrada nao tem logo; a logo
   * existe e o worker ainda nao terminou (`status <> 'ready'`); a logo foi
   * recusada nos bytes. Quem resolve os tres e a consulta, que seleciona a
   * chave so quando `status = 'ready'` -- e e por isso que o tipo aqui e uma
   * chave e nao um objeto de estado: o aplicativo nao tem o que fazer com
   * "processando" numa lista.
   */
  readonly logoPublicKey: string | null;
  /**
   * A PONTUACAO AGREGADA do local -- media, contagem e histograma.
   *
   * **Ela e CALCULADA na consulta da pagina e nunca materializada**: nao ha
   * coluna `rating_average` em `professionals` e nao ha gatilho. Media guardada
   * tem quatro caminhos de invalidacao (criar, editar, apagar, moderar) mais um
   * quinto que nenhum gatilho em `professional_reviews` enxerga -- o autor
   * desabilitar a conta muda a media de todo local que ele avaliou sem tocar em
   * nenhuma avaliacao --, e a media ficaria errada em silencio.
   *
   * **E um campo de `EntradaDoDiretorio`, e nao do tipo do DETALHE**, porque o
   * cliente pediu media e quantidade "na lista e na pagina" (18/10/2026): posta
   * aqui, ela atravessa `projetarEntrada`, que e o caminho dos dois -- e o
   * recorte da conta e um so, entao a media do cartao e a da pagina nao tem como
   * discordar.
   *
   * **Nunca `undefined` e nunca "ausente"**: local sem avaliacao tem
   * `PONTUACAO_VAZIA`, com `media` NULA e `quantidade` zero. Media zero seria a
   * mentira que esta regra existe para impedir.
   */
  readonly pontuacao: PontuacaoDoLocal;
}

export interface VerificacaoPublica {
  readonly level: NivelDeVerificacao;
  readonly evidence_kinds: readonly TipoDeEvidencia[];
}

/** `DirectoryEntrySummary` do contrato. */
export interface EntradaPublica {
  readonly slug: string;
  /**
   * A PRIMEIRA atividade, **e ela existe para compatibilidade**. O APK
   * publicado le `kind` como string; trocar o tipo dele por lista seria
   * `response-property-type-changed` e quebraria a tela de quem ja tem o
   * aplicativo instalado. Quem desenha a entrada nova le `kinds`.
   */
  readonly kind: TipoDeProfissional;
  readonly kinds: readonly TipoDeProfissional[];
  readonly entity_kind: TipoDeEntidade;
  readonly display_name: string;
  readonly city: string | null;
  readonly state: string | null;
  readonly neighborhood: string | null;
  readonly about: string | null;
  readonly phone_e164: string | null;
  readonly site_url: string | null;
  readonly verification: VerificacaoPublica;
  readonly distance_m: number | null;
  readonly logo_url: string | null;
  /**
   * `DirectoryRating`: a media (NULA sem avaliacao), a quantidade e o
   * histograma.
   *
   * **O histograma vem no cartao da lista, e isso foi medido e nao aceito por
   * costume.** As cinco chaves sao cinco inteiros pequenos, e elas saem da MESMA
   * varredura que a media e a contagem (`count(*) FILTER` sobre o mesmo indice),
   * entao nao custam consulta, nem linha, nem acesso a mais. O que custariam e
   * um agregado proprio da lista -- schema novo, quatro arquivos de tipo
   * regerados e um modelo diferente no aplicativo --, e esse custo e maior que o
   * de cinco inteiros por cartao.
   */
  readonly rating: PontuacaoPublica;
}

/**
 * `PublicDirectoryEntrySummary` do contrato: o cartao de quem NAO tem conta.
 *
 * **E `EntradaPublica` menos quatro campos**, e cada ausencia tem razao
 * propria -- `listPublicDirectoryEntries` as escreve por extenso:
 *
 * - `phone_e164` e `site_url`: canal de contato que so sai com conta.
 *   `portao-contrato-publico.ts` proibe o primeiro por NOME EXATO em operacao
 *   alcancavel sem conta, e o segundo sai pela razao declarada no proprio
 *   campo dele ("sai ao lado de `phone_e164` e pela mesma razao"). O portao
 *   nao nomeia `site_url` hoje, e isso nao e permissao.
 * - `distance_m`: distancia implica centro, e distancias a partir de centros
 *   conhecidos trilateram o centro desconhecido. Sem conta nao ha nem ponto de
 *   onde medir.
 * - `about`: o cartao nao o desenha, nem aqui nem com conta.
 *
 * **O tipo e a trava, e nao a boa intencao de quem escreve a projecao.**
 * `Omit` em vez de uma interface escrita a mao: com a interface solta, um campo
 * acrescentado a `EntradaPublica` amanha nao apareceria aqui e ninguem seria
 * avisado -- enquanto com `Omit` o campo novo CHEGA a esta projecao e o
 * compilador cobra a decisao sobre ele, que e exatamente o momento em que a
 * decisao deve ser tomada.
 */
export type EntradaPublicaSemConta = Omit<
  EntradaPublica,
  'phone_e164' | 'site_url' | 'distance_m' | 'about'
>;

/**
 * Metros para a grade de 100 m, **sem nunca virar zero para quem esta longe**.
 *
 * `Math.round` levaria 40 m a 0, e "0 m" numa lista e "esta aqui dentro". O
 * piso e uma celula: a menor distancia que este produto sabe afirmar e
 * "ate 100 m".
 */
export function distanciaNaGrade(metros: number | null): number | null {
  if (metros === null || !Number.isFinite(metros)) return null;
  return Math.max(GRADE_EM_METROS, Math.round(metros / GRADE_EM_METROS) * GRADE_EM_METROS);
}

/**
 * A FORMA DE UMA CHAVE DE DERIVADA PUBLICA, e por que ela e conferida AQUI.
 *
 * `{categoria}/{thumb|card|banner}/{nome}.{ext}`. O original tem a forma
 * `{categoria}/original/{128 bits}` e **nunca** casa com esta expressao.
 *
 * A conferencia existe porque o que sai desta projecao vai para o aplicativo, e
 * o original mora no armazenamento PRIVADO: uma URL de original seria ou um 403
 * na tela, ou -- no dia em que alguem afrouxasse a politica do balde -- a foto
 * com EXIF, com a coordenada de onde ela foi tirada, servida publicamente. O
 * tipo `string | null` nao distingue as duas chaves; esta funcao distingue.
 *
 * Ela devolve `null` em vez de lancar: uma linha com chave torta e defeito de
 * dado, e derrubar a listagem inteira por causa de uma entrada seria trocar um
 * cartao sem imagem por uma tela sem nada.
 */
const FORMA_DA_DERIVADA = /^[a-z-]+\/(?:thumb|card|banner)\/[A-Za-z0-9_-]+\.[a-z]+$/;

export function urlDaDerivada(
  chave: string | null,
  urlDeMidia: (chave: string) => string,
): string | null {
  if (chave === null || !FORMA_DA_DERIVADA.test(chave)) return null;
  return urlDeMidia(chave);
}

/**
 * A ATIVIDADE PRINCIPAL: o primeiro item de `kinds`.
 *
 * **Uma funcao, e nao `kinds[0]` espalhado pelas projecoes.** Duas copias de
 * "qual e a principal" divergiriam no dia em que a regra deixasse de ser "a
 * primeira" -- e ela e so "a primeira" porque nada ainda pediu outra coisa.
 *
 * O `??` NUNCA dispara em dado vindo do banco: `professionals_atividades_tamanho`
 * cobra minimo 1 e o caso de uso tambem. Ele existe porque o TIPO de um array
 * nao carrega "nao vazio", e devolver `undefined` daqui poria `kind: undefined`
 * numa resposta que o contrato declara `required` -- `'vet'` e errado de um jeito
 * visivel, `undefined` desaparece.
 */
export function atividadePrincipal(kinds: readonly TipoDeProfissional[]): TipoDeProfissional {
  return kinds[0] ?? 'vet';
}

/**
 * O ENDERECO COMERCIAL da entrada, como as quatro colunas o guardam.
 *
 * ## Por que ele e um tipo SEPARADO, e nao mais quatro campos de
 * `EntradaDoDiretorio`
 *
 * `EntradaDoDiretorio` e o que a LISTAGEM projeta, e `projetarEntrada` e o
 * caminho dos dois (a listagem e o detalhe). Endereco de porta em ate vinte
 * cartoes de `Perto` nao foi pedido por nenhuma tela e alarga a superficie de
 * graca -- entao ele segue o caminho da FOTO EM FAIXA, que e campo proprio de
 * `LocalDoDiretorio` e por isso **nao tem como escorregar para a lista** no dia
 * em que alguem acrescentar um campo a projecao comum.
 *
 * O arranjo nao e zelo: a diferenca entre "esta aqui" e "esta no outro tipo" e
 * a unica coisa que, em TypeScript, impede a listagem de devolver isto.
 *
 * ## O que ele NAO e
 *
 * Nao e endereco de PESSOA. A secao 4 do ADR-0011 separa os dois casos: *"a
 * pagina do tutor e uma pessoa que nao pediu para ser achada; o perfil do
 * profissional e uma entidade que aceitou aparecer para ser contratada"*. O
 * endereco de residencia de um usuario nao sai em superficie nenhuma, e nada
 * aqui o alcanca -- estas colunas sao de `professionals`.
 *
 * Nao e coordenada e nao vira uma. ADR-0006: e TEXTO. Quem abre o mapa e o
 * aplicativo de mapas do aparelho, a partir do texto.
 */
export interface EnderecoComercial {
  readonly postalCode: string | null;
  readonly street: string | null;
  readonly streetNumber: string | null;
  readonly complement: string | null;
}

/** Os quatro campos de endereco de `DirectoryEntryDetail`. */
export interface EnderecoComercialPublico {
  readonly postal_code: string | null;
  readonly street: string | null;
  readonly street_number: string | null;
  readonly complement: string | null;
}

/**
 * As quatro colunas viram os quatro campos do detalhe, **sem compor e sem
 * normalizar**.
 *
 * O servidor nao monta uma linha unica: o que ele gravou foi o que o operador
 * conferiu na tela do painel, e juntar os pedacos aqui seria inventar um
 * formato que ninguem decidiu, num lugar onde o painel nao poderia mais
 * corrigi-lo. Quem desenha a linha e quem monta o texto da busca de mapa e a
 * tela.
 *
 * Nulo atravessa como nulo nos quatro, e nulo e o estado normal: profissional
 * autonomo nao tem endereco comercial, e a migracao `20261018000001` deixou as
 * quatro anulaveis exatamente por isso.
 */
export function projetarEnderecoComercial(
  endereco: EnderecoComercial,
): EnderecoComercialPublico {
  return {
    postal_code: endereco.postalCode,
    street: endereco.street,
    street_number: endereco.streetNumber,
    complement: endereco.complement,
  };
}

export function projetarEntrada(
  entrada: EntradaDoDiretorio,
  urlDeMidia: (chave: string) => string,
): EntradaPublica {
  return {
    slug: entrada.slug,
    // `kind` e a PRIMEIRA de `kinds`, para o APK em campo. Ver `EntradaPublica`.
    kind: atividadePrincipal(entrada.kinds),
    kinds: [...entrada.kinds],
    entity_kind: entrada.entityKind,
    display_name: entrada.displayName,
    city: entrada.city,
    state: entrada.state,
    neighborhood: entrada.neighborhood,
    about: entrada.about,
    phone_e164: entrada.phoneE164,
    site_url: entrada.siteUrl,
    verification: {
      level: nivelDerivado(entrada.verificacoes),
      evidence_kinds: evidenciasAprovadas(entrada.verificacoes),
    },
    distance_m: distanciaNaGrade(entrada.distanciaEmMetros),
    // A derivada, nunca o original. `urlDaDerivada` recusa pela FORMA da chave.
    logo_url: urlDaDerivada(entrada.logoPublicKey, urlDeMidia),
    // A PONTUACAO sai AQUI, na projecao comum da lista e do detalhe, e nao em
    // cada rota: duas chamadas a `projetarPontuacao` em dois lugares e como a
    // media do cartao e a da pagina passam a discordar. O detalhe nao reescreve
    // `rating` depois do espalhamento por isso.
    rating: projetarPontuacao(entrada.pontuacao),
  };
}

/**
 * A projecao SEM CONTA, **derivada da de conta e nao paralela a ela**.
 *
 * Ela parte de `projetarEntrada` em vez de ler `entrada` de novo, e isso e
 * deliberado: uma segunda leitura do agregado duplicaria as regras que aquela
 * funcao aplica -- `atividadePrincipal`, `nivelDerivado`, `evidenciasAprovadas`
 * e `urlDaDerivada` --, e o modo de falha dessa duplicacao e o pior possivel:
 * as duas projecoes divergindo em silencio, com a publica ficando para tras e
 * ninguem percebendo, porque nenhum teste compara as duas campo por campo.
 *
 * **A lista e explicita, e nao um `...resto` depois de tirar os quatro.** A
 * desestruturacao com resto era a forma obvia e e a FRACA: com ela, um campo
 * novo em `EntradaPublica` cai dentro de `resto` e **vaza para a resposta
 * publica sozinho**, sem ninguem decidir nada. Nomear os dez campos inverte
 * isso -- `EntradaPublicaSemConta` ganha o campo novo pelo `Omit`, este objeto
 * literal fica incompleto e **nao compila**. O compilador passa a cobrar a
 * decisao sobre o campo novo na hora em que ele nasce, que e quando ela custa
 * menos.
 *
 * (A forma com `...resto` tambem reprovava no `eslint` deste repositorio:
 * `no-unused-vars` nao aceita os quatro nomes descartados, nem com `_`.)
 */
export function projetarEntradaSemConta(
  entrada: EntradaDoDiretorio,
  urlDeMidia: (chave: string) => string,
): EntradaPublicaSemConta {
  const cheia = projetarEntrada(entrada, urlDeMidia);
  return {
    slug: cheia.slug,
    kind: cheia.kind,
    kinds: cheia.kinds,
    entity_kind: cheia.entity_kind,
    display_name: cheia.display_name,
    city: cheia.city,
    state: cheia.state,
    neighborhood: cheia.neighborhood,
    verification: cheia.verification,
    logo_url: cheia.logo_url,
    // A PONTUACAO SAI TAMBEM SEM CONTA, e o `Omit` e quem cobrou a decisao: ela
    // nao esta entre os quatro campos removidos, entao este objeto nao compilava
    // sem ela. E e a resposta certa -- o contrato escreveu que a agregacao entra
    // "nas DUAS projecoes no mesmo commit", com o MESMO recorte, para a media do
    // cartao deslogado e a do logado nunca discordarem. Avaliacao de local
    // publicado nao e dado de pessoa: o que sai e media, contagem e histograma,
    // sem nenhum autor.
    rating: cheia.rating,
  };
}
