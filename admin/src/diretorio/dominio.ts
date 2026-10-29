/**
 * O vocabulario e as regras locais do diretorio de `Perto`, num lugar so.
 *
 * ## OS ROTULOS SAO DAQUI, E ISSO E DIFERENTE DA LOJA
 *
 * A `Loja` apagou o mapa fixo de categorias em 17/10/2026 porque o vocabulario
 * dela virou DADO (14 categorias, 83 subcategorias, semeadas no banco). Aqui e o
 * oposto, e por um motivo: `professionals.kinds` e **lista fechada de `CHECK`**,
 * com seis valores, espelhada em `src/shared/db/schema.ts` e conferida por
 * `tests/integration/conjunto-exato-dos-checks.test.ts`. Ela nao cresce sem
 * migracao, e por isso o `satisfies Record<...>` abaixo vale como trava: se o
 * `enum` do contrato ganhar um valor, o compilador do painel reprova aqui em vez
 * de a tela mostrar um codigo cru.
 *
 * ## ONG NAO ESTA NESTA LISTA, E AGORA ISSO E DESENHO E NAO FALTA
 *
 * O cliente pediu "estabelecimentos, profissionais, ongs, etc". Os dois
 * primeiros estao aqui: estabelecimento e `clinic`, e profissional sao os
 * outros cinco. **ONG nao e uma ATIVIDADE, e por isso nao entra aqui** -- ela
 * e um TIPO DE ENTIDADE, que desde a `20261018000012` tem eixo proprio em
 * `TIPOS_DE_ENTIDADE`, abaixo.
 *
 * O texto anterior aqui dizia que "ONG nao tem onde ser uma linha do diretorio
 * hoje" porque `professionals` nao tinha `entity_kind`. Ela tem. A decisao 9.1
 * de `api/contrato-de-escrita-do-diretorio.md` esta respondida, e a resposta
 * nao foi alargar esta lista: acrescentar valor a um `enum` que sai em resposta
 * quebraria o contrato (`oasdiff`, `response-property-enum-value-added`, 12
 * erros medidos em 18/10) e afirmaria que organizacao e um tipo de
 * profissional. Uma ONG tem as DUAS coisas: atividade (`clinic`) e tipo de
 * entidade (`organization`).
 */
import type { Esquemas } from '../api/cliente.ts';

export type Entrada = Esquemas['AdminDirectoryEntry'];
export type TipoDaEntrada = Esquemas['ProfessionalKind'];
export type TipoDeEntidadeDaEntrada = Esquemas['EntityKind'];
export type StatusDaEntrada = Esquemas['DirectoryEntryStatus'];
export type FaltaParaPublicar = Esquemas['AdminDirectoryEntryMissingField'];

/**
 * O rotulo de cada TIPO DE ENTIDADE. **Mapa proprio, e nao linha em
 * `ATIVIDADES`**: os dois eixos sao perguntas diferentes na tela ("o que e?" e
 * "o que faz?"), e uma ONG responde as duas. Juntar os dois num seletor so
 * seria repetir no painel o erro que o eixo proprio evitou no contrato.
 *
 * O `satisfies Record<...>` vale como trava do mesmo jeito que o de
 * `ATIVIDADES`: se `EntityKind` ganhar um valor no contrato, o compilador
 * reprova aqui em vez de a tela mostrar um codigo cru.
 */
export const TIPOS_DE_ENTIDADE = {
  professional: 'Profissional ou estabelecimento',
  organization: 'ONG',
} as const satisfies Record<TipoDeEntidadeDaEntrada, string>;

/**
 * A ordem do seletor. `professional` primeiro porque e o padrao do contrato e o
 * caso comum; `organization` e a excecao que o operador escolhe de proposito.
 */
export const ORDEM_DOS_TIPOS_DE_ENTIDADE: readonly TipoDeEntidadeDaEntrada[] = [
  'professional',
  'organization',
];

/**
 * O rotulo de cada atividade, no singular e como o operador fala.
 *
 * ## OS DOIS EIXOS FICAM SEPARADOS, E ISSO E DECISAO DO CLIENTE DE 28/10/2026
 *
 * Nesta data ele considerou pôr "Profissional autônomo" aqui e **se corrigiu**,
 * verbatim: *"na verdade, nao inclua profissional autonomo como atividade, ja
 * esta no tipo"*. Entao a fronteira vale escrita, porque ela nao e obvia para
 * quem chega depois:
 *
 * - **atividade (este mapa) e O QUE A ENTRADA FAZ** -- o que se contrata dela;
 * - **`TIPOS_DE_ENTIDADE` e O QUE ELA E** -- `professional` ou `organization`.
 *
 * Os dois eixos existem AO MESMO TEMPO e nenhum substitui o outro: uma ONG que
 * atende como clinica tem atividade `clinic` **e** tipo `organization`. Quem
 * sentir falta de "profissional autônomo", "estabelecimento" ou "ONG" nesta
 * lista esta olhando para o eixo errado -- os tres sao resposta de
 * `TIPOS_DE_ENTIDADE`, que na mesma data ganhou os rotulos
 * *"Profissional ou estabelecimento"* e *"ONG"*.
 *
 * ## OS ROTULOS DE 28/10/2026, e o que neles NAO e valor de fio
 *
 * Verbatim: *"alterar para clinica ao inves de clinica e estabelecimento,
 * alterar passeador para Dog Walker"*, e `sitter` virou *"Pet Sitter"*.
 *
 * **Os tres sao renomeacao de ROTULO, e nenhum tocou o contrato.** `sitter` ja
 * existia -- "Pet Sitter" e o nome dele na tela, nao um valor novo --, e
 * `clinic` deixou de dizer "ou estabelecimento" porque estabelecimento passou a
 * ser dito no eixo do tipo. `walker` e `sitter` sao renomeados **nos dois
 * lados** (aqui e em `app/lib/api/modelos_diretorio.dart`): rotulo divergente
 * entre painel e app e defeito, e `test/diretorio/rotulos-das-atividades.test.ts`
 * passou a reprovar a divergencia -- que existia em silencio, com `clinic`
 * valendo `'Clínica'` no Dart e `'Clínica ou estabelecimento'` aqui.
 */
export const ATIVIDADES = {
  clinic: 'Clínica',
  // `hospital` e `store` entraram em 28/10/2026 com a migracao
  // `20261028000001`. `hospital` e separado de `clinic` porque hospital interna
  // e tem plantao, e `Loja` aqui e o PETSHOP que aparece em `Perto` -- nao a
  // secao `Loja` do produto, que e catalogo e vive em `src/loja/`.
  hospital: 'Hospital',
  store: 'Loja',
  vet: 'Veterinário',
  groomer: 'Banho e tosa',
  walker: 'Dog Walker',
  // `sitter` = **Pet Sitter**, e ele NAO voltou a ser "Hospedagem".
  //
  // O rotulo dele era "Hospedagem" desde o primeiro commit da listagem de
  // `Perto`, e divergia do valor: `sitter` diz *pet sitter*, e hospedagem e o
  // pet FICAR no estabelecimento enquanto pet sitter e alguem que CUIDA, muitas
  // vezes na casa do tutor. A troca de 28/10/2026 CORRIGIU um rotulo errado de
  // meses -- a pergunta do cliente fecha o assunto: *"o que sitter tem a ver com
  // hospedagem?"*. Nada.
  //
  // `boarding` entrou em 29/10 para cobrir o que o rotulo errado representava.
  sitter: 'Pet Sitter',
  // `boarding` e `daycare` (cliente, 29/10/2026, migracao `20261029000002`):
  // *"Nao e um ou outro, sao todos .. hospedagem, pet sitter, sao coisas
  // diferentes"* e *"Acrescentar Creche junto"*.
  boarding: 'Hospedagem',
  daycare: 'Creche',
  trainer: 'Adestrador',
} as const satisfies Record<TipoDaEntrada, string>;

/**
 * A ordem do seletor, escrita por EXTENSO.
 *
 * `clinic` vem primeiro porque estabelecimento e o que o operador cadastra mais,
 * e nao porque e o ultimo valor do `CHECK`. A ordem de uma lista fechada no banco
 * e a ordem em que ela foi escrita na migracao, e ela nao e ordem de tela.
 */
export const ORDEM_DAS_ATIVIDADES: readonly TipoDaEntrada[] = [
  // Os ESTABELECIMENTOS primeiro (`clinic` na frente, como antes de 28/10, por
  // ser o que o operador cadastra mais), e as PESSOAS depois, na mesma ordem
  // relativa de sempre. `hospital` e `store` entraram no primeiro grupo em vez
  // de no fim da lista porque quem procura um deles esta procurando um lugar, e
  // nao alguem -- e porque "o valor novo vai no fim" produziria uma lista em
  // ordem de migracao, que nao e ordem de tela.
  'clinic',
  'hospital',
  'store',
  // `boarding` (Hospedagem) entra no grupo dos ESTABELECIMENTOS, e nao no das
  // pessoas: hospedagem e um LUGAR onde o pet fica. `daycare` (Creche) tambem.
  'boarding',
  'daycare',
  'vet',
  'groomer',
  'walker',
  // `sitter` (Pet Sitter) fica com as PESSOAS, e e por isso que ele nao esta ao
  // lado de `boarding`: pet sitter e alguem que vai cuidar, e hospedagem e um
  // lugar. A separacao na tela e a mesma distincao que o cliente fez em 29/10.
  'sitter',
  'trainer',
];

export const SITUACOES = {
  draft: 'Rascunho',
  published: 'No ar',
  hidden: 'Retirada',
  removed: 'Removida',
} as const satisfies Record<StatusDaEntrada, string>;

/**
 * AS SITUACOES QUE O CADASTRO OFERECE (cliente, 29/10/2026).
 *
 * **Duas, e `published` na frente porque e o PADRAO** -- *"ele ja deve salvar
 * com o padrao publicado e nao como rascunho"*. `draft` fica ao lado porque o
 * cliente confirmou que o rascunho continua existindo como escolha explicita.
 *
 * `hidden` e `removed` **nao entram**, e o contrato concorda
 * (`AdminDirectoryEntryCreateStatus` so tem dois valores): as duas sao
 * RETIRADA, e "nasce retirada" nao e estado que signifique algo. Oferece-las no
 * cadastro ofereceria um `400`.
 */
export const SITUACOES_DO_CADASTRO: readonly StatusDaEntrada[] = ['published', 'draft'];

/**
 * AS SITUACOES QUE A EDICAO OFERECE: as quatro, na ordem de sempre.
 *
 * Lista nomeada, e nao literal dentro do JSX, para o cadastro e a edicao
 * passarem a divergir num lugar so -- e para a divergencia ficar legivel ao
 * lado da razao dela.
 */
export const SITUACOES_DA_EDICAO: readonly StatusDaEntrada[] = [
  'published',
  'draft',
  'hidden',
  'removed',
];

/** O selo da lista. `Selo` de `basicos.tsx` tem vocabulario proprio e fechado. */
export const SELO_DA_SITUACAO = {
  draft: 'rascunho',
  published: 'publicado',
  hidden: 'inativo',
  removed: 'retirado',
} as const satisfies Record<StatusDaEntrada, 'rascunho' | 'publicado' | 'inativo' | 'retirado'>;

/** O que falta, dito para o operador e nao para o programador. */
export const ROTULO_DA_FALTA = {
  slug: 'o identificador',
  city: 'a cidade',
  state: 'a UF',
  phone_e164: 'o telefone',
} as const satisfies Record<FaltaParaPublicar, string>;

/**
 * A frase que diz o que falta para publicar.
 *
 * `undefined` quando nada falta -- e e por `undefined`, e nao por string vazia,
 * que a tela decide mostrar ou nao o aviso: string vazia renderiza um banner
 * vazio, e isso ja aconteceu neste painel.
 */
export function frasePendente(faltas: readonly FaltaParaPublicar[]): string | undefined {
  if (faltas.length === 0) return undefined;
  const nomes = faltas.map((falta) => ROTULO_DA_FALTA[falta]);
  const lista =
    nomes.length === 1
      ? nomes[0]
      : `${nomes.slice(0, -1).join(', ')} e ${String(nomes[nomes.length - 1])}`;
  return `Para esta entrada aparecer em Perto, falta ${String(lista)}.`;
}

/**
 * O formato de `professionals.slug`, copiado do `CHECK
 * professionals_slug_formato` da migracao `20260922000021`.
 *
 * De 3 a 30 caracteres, minusculas, numeros e hifen, sem hifen no comeco nem no
 * fim. **Igual ao de `pets.slug` e ao da `Loja`**, e isso e proposito e nao
 * coincidencia: sao enderecos publicos do mesmo produto, e dois formatos para a
 * mesma coisa e o defeito que a duplicacao produz. A regra esta repetida aqui, e
 * nao importada de `loja/dominio.ts`, porque uma secao do painel que importa o
 * dominio de outra secao e o acoplamento que a revisao da `Rede` pediu para
 * evitar.
 */
export const PADRAO_DO_SLUG = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

export const MENSAGEM_DO_SLUG =
  'Use de 3 a 30 letras minúsculas, números ou hífen, sem hífen no começo nem no fim.';

/**
 * O endereco sugerido a partir do nome: sem acento, minusculo, espaco vira
 * hifen.
 *
 * O corte em 30 e o do `CHECK`, e o `replace` final tira hifen que sobrou na
 * borda depois do corte -- sem ele, "Clinica Veterinaria Santa Barbara 24" vira
 * um slug terminado em hifen, que o banco recusa.
 */
export function slugSugerido(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/g, '');
}

/** A UF, duas letras. A mesma recusa que o servidor da, para a tela nao esperar a rede. */
export const PADRAO_DA_UF = /^[A-Za-z]{2}$/;
