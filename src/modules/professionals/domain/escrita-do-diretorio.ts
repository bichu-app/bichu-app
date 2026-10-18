/**
 * A regra de uma escrita administrativa de entrada do diretorio de `Perto`.
 *
 * Ela vive aqui, e nao no manipulador nem no repositorio, por um motivo de
 * verificabilidade: a pergunta "esta escrita pode acontecer?" precisa ter uma
 * resposta que se testa sem Fastify, sem Postgres e sem Docker. O manipulador
 * traduz HTTP; o repositorio traduz SQL; a decisao e destas funcoes.
 *
 * ## A PROCEDENCIA DESTE ARQUIVO, PORQUE ELA IMPORTA
 *
 * O nucleo de `planejarEdicao` e `faltasParaPublicar` vem da branch parada
 * `feat/BICHUS-189-escrita-do-backoffice` (`domain/edicao-da-entrada.ts`,
 * 23/09/2026), que nunca foi mesclada porque o desenho de AUTENTICACAO dela --
 * credencial de servico compartilhada entre duas esteiras -- foi substituido
 * pelo ADR-0027 (sessao opaca em cookie). **A regra de completude nao tinha nada
 * a ver com aquela autenticacao**, e por isso ela foi aproveitada em vez de
 * reescrita. O que mudou aqui:
 *
 * - `faltasParaPublicar` passou a devolver os NOMES dos campos
 *   (`missing_to_publish`), e nao so os erros: a tela precisa dizer o que falta
 *   ANTES de alguem clicar em publicar, e a mesma lista vira `400` quando a
 *   escrita tenta publicar sem eles. Duas listas seriam duas definicoes de
 *   "completo", que e o que o ADR-0023 secao 2 proibe.
 * - entrou `planejarCriacao`, que a branch parada nao tinha: ela so editava, e
 *   editar nao resolve o pedido do cliente, que e **cadastrar**.
 *
 * ## As quatro coisas que esta regra decide
 *
 * 1. **A entrada nasce rascunho.** Nao ha caminho de criacao que publique.
 * 2. **Editar nao despublica.** Uma entrada publicada continua publicada depois
 *    de uma edicao de campo. Se editar derrubasse para rascunho, o operador
 *    corrigiria um telefone e a clinica sumiria de `Perto` sem ninguem ser
 *    avisado -- o modo de falhar mais caro que um diretorio tem, porque e
 *    silencioso e do lado de quem nao consegue ver.
 * 3. **A edicao nao pode quebrar a publicacao.** O que deixaria uma entrada
 *    publicada incompleta e recusado, nomeando os campos, e nao aceito e
 *    despublicado em silencio.
 * 4. **Despublicar e ato explicito**, com `status` no corpo, e nunca efeito
 *    colateral de outra coisa.
 *
 * ## O que esta regra NAO decide, e cada ausencia e estrutural
 *
 * `verification_level` nao aparece em nenhum tipo deste arquivo. Nao ha campo
 * para envia-lo, nao ha caminho para escreve-lo, e o corpo do contrato e fechado
 * (`additionalProperties: false`), entao manda-lo e 400 e nao campo ignorado. O
 * nivel sai da verificacao aprovada mais forte em `entity_verifications`
 * (`nivel-de-verificacao.ts`): um perfil que declarasse o proprio nivel tornaria
 * a verificacao decorativa, e o selo passaria a afirmar, para quem escolhe quem
 * cuida do animal, algo que ninguem provou.
 *
 * `geo` tambem nao aparece, e e a decisao 9.4 pendente de
 * `api/contrato-de-escrita-do-diretorio.md`: sem geocodificacao (ADR-0006) a
 * coordenada so poderia vir de um mapa de toque no painel.
 *
 * `cnpj`, `crmv_number` e `crmv_uf` nao aparecem **por decisao de produto**: um
 * profissional pode ser pessoa fisica, e o painel nao precisa de documento dele
 * para publicar uma entrada de diretorio. As tres colunas continuam existindo e
 * continuam sendo escritas pelo fluxo de verificacao, que nao passa por aqui.
 */
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import type { TipoDeProfissional } from './entrada-do-diretorio.js';
import {
  evidenciasAprovadas,
  nivelDerivado,
  type TipoDeEvidencia,
  type NivelDeVerificacao,
  type VerificacaoDaEntidade,
} from './nivel-de-verificacao.js';

/**
 * `professionals.status`, **espelhado** em `src/shared/db/schema.ts`.
 *
 * `hidden` e retirada temporaria e `removed` e retirada definitiva **sem apagar
 * a linha**: a entrada sai do diretorio e continua existindo para a trilha.
 */
export type StatusDaEntrada = 'draft' | 'published' | 'hidden' | 'removed';

/** `professionals.source`. O painel grava sempre `import` -- ver `ORIGEM_DO_PAINEL`. */
export type OrigemDaEntrada = 'self' | 'invited' | 'import';

/** `professionals.claim_status`. */
export type TitularidadeDaEntrada = 'unclaimed' | 'claim_pending' | 'claimed' | 'disputed';

/**
 * COMO A ENTRADA DO PAINEL NASCE, e os dois valores andam juntos.
 *
 * Nao e atalho: sao os unicos valores que o `CHECK
 * professionals_aceite_antes_do_perfil` admite para uma entrada SEM TITULAR, e e
 * exatamente o que esta acontecendo -- o painel cadastrou a entidade e ninguem
 * do outro lado reivindicou o perfil ainda.
 *
 * `self` e `invited` sao os caminhos que passam pelo aceite de quem o perfil
 * descreve (emenda 1 do ADR-0011), e o painel nao tem como produzir esse
 * aceite. Dizer um deles aqui gravaria um aceite que nao houve.
 *
 * A migracao de 21/09 previu este caso em voz alta: ela manteve
 * `claim_snapshot_at` justamente porque "`source = 'import'` continua previsto,
 * e no dia em que ele for usado o marco volta a significar algo". Este e o dia.
 */
export const ORIGEM_DO_PAINEL: OrigemDaEntrada = 'import';
export const TITULARIDADE_DO_PAINEL: TitularidadeDaEntrada = 'unclaimed';

/** O estado em que a entrada nasce. `professionals.status` tem `DEFAULT 'draft'`. */
export const STATUS_INICIAL: StatusDaEntrada = 'draft';

export const MINIMO_DO_NOME = 2;
export const MAXIMO_DO_NOME = 120;
export const MINIMO_DO_SOBRE = 2;
export const MAXIMO_DO_SOBRE = 2000;
export const MINIMO_DA_CIDADE = 2;
export const MAXIMO_DA_CIDADE = 80;
export const MAXIMO_DO_BAIRRO = 80;

// O endereco de rua (decisao 9.2, respondida em 18/10/2026). Os tetos sao os
// do `CHECK` da migracao `20261018000001` e os do contrato, COPIADOS deles.
export const MAXIMO_DO_LOGRADOURO = 120;
export const MINIMO_DO_NUMERO = 1;
export const MAXIMO_DO_NUMERO = 20;
export const MINIMO_DO_COMPLEMENTO = 1;
export const MAXIMO_DO_COMPLEMENTO = 80;

/**
 * Oito digitos, sem mascara e sem hifen.
 *
 * A MESMA forma do `CHECK professionals_cep_oito_digitos`, do `pattern` do
 * contrato e do CEP do pedido da plaquinha. A mascara e do painel
 * (`admin/src/formato/cep.ts`); o que chega aqui e sempre oito digitos, e o
 * que nao for e `400`.
 */
export const FORMA_DO_CEP = /^[0-9]{8}$/;

/** A entrada como o repositorio administrativo a entrega. Sem `id`, sem ponto, sem vinculo. */
export interface EntradaAdministrativa {
  readonly slug: string;
  readonly kind: TipoDeProfissional;
  readonly displayName: string;
  readonly about: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly neighborhood: string | null;
  /**
   * O endereco de rua. Lido e escrito **so pela superficie administrativa**:
   * `projetarEntrada` (a projecao do aplicativo, em `entrada-do-diretorio.ts`)
   * nao os conhece, e por isso nao ha caminho em que eles saiam em `Perto`.
   */
  readonly postalCode: string | null;
  readonly street: string | null;
  readonly streetNumber: string | null;
  readonly complement: string | null;
  readonly phoneE164: string | null;
  readonly status: StatusDaEntrada;
  readonly source: OrigemDaEntrada;
  readonly claimStatus: TitularidadeDaEntrada;
  readonly verificacoes: readonly VerificacaoDaEntidade[];
  readonly publishedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

/**
 * O corpo da criacao, com a forma ja conferida pelo schema do contrato.
 *
 * `slug` e obrigatorio ja no rascunho, e isso e decisao: a unicidade e global
 * sobre nao-nulo desde a `20260922000021`, e exigir o endereco no cadastro move
 * a recusa de conflito de nome para quem esta cadastrando, com o formulario na
 * tela, em vez de para o momento de publicar -- que e o pior momento possivel
 * para descobrir um conflito.
 */
export interface CriacaoDaEntrada {
  readonly slug: string;
  readonly kind: TipoDeProfissional;
  readonly display_name: string;
  readonly about?: string;
  readonly city?: string;
  readonly state?: string;
  readonly neighborhood?: string;
  readonly postal_code?: string;
  readonly street?: string;
  readonly street_number?: string;
  readonly complement?: string;
  readonly phone_e164?: string;
}

/**
 * O corpo da edicao.
 *
 * `null` e valor legitimo e significa **apagar**; `undefined` significa **nao
 * mexer**. A distincao e o que separa "limpar o bairro" de "editar so o
 * telefone", e ela precisa sobreviver ate o `UPDATE`.
 */
export interface EdicaoDaEntrada {
  readonly slug?: string;
  readonly kind?: TipoDeProfissional;
  readonly display_name?: string;
  readonly about?: string | null;
  readonly city?: string | null;
  readonly state?: string | null;
  readonly neighborhood?: string | null;
  readonly postal_code?: string | null;
  readonly street?: string | null;
  readonly street_number?: string | null;
  readonly complement?: string | null;
  readonly phone_e164?: string | null;
  readonly status?: StatusDaEntrada;
}

/** Os campos sem os quais uma entrada nao pode estar no ar. */
export type FaltaParaPublicar = 'slug' | 'city' | 'state' | 'phone_e164';

/**
 * A ordem em que as faltas sao listadas, escrita por EXTENSO.
 *
 * Por extenso porque e a ordem do formulario, e nao a ordem em que o codigo
 * acontece de testar: a tela lista o que falta de cima para baixo, e uma ordem
 * que mudasse com um refator faria o resumo de erros pular.
 */
export const ORDEM_DA_FALTA: readonly FaltaParaPublicar[] = ['slug', 'city', 'state', 'phone_e164'];

export const MENSAGEM_DA_FALTA: Record<FaltaParaPublicar, string> = {
  slug:
    'Uma entrada no ar precisa de endereço público: a listagem do aplicativo devolve o ' +
    'endereço como chave obrigatória de cada item, e nunca o identificador interno.',
  city: 'Sem cidade a entrada não aparece em nenhuma busca de Perto.',
  state: 'Informe a UF, com duas letras.',
  phone_e164:
    'Uma entrada no ar precisa de ao menos um canal de contato, e hoje o telefone ' +
    'comercial é o único que o cadastro tem.',
};

export function errosDaFalta(faltas: readonly FaltaParaPublicar[]): ProblemFieldError[] {
  return ORDEM_DA_FALTA.filter((falta) => faltas.includes(falta)).map((falta) => ({
    field: falta,
    code: 'required',
    message: MENSAGEM_DA_FALTA[falta],
  }));
}

/**
 * O valor que vale depois da edicao: o do corpo quando ele veio, o gravado
 * quando nao veio. `null` do corpo apaga, e e por isso que o teste e contra
 * `undefined` e nao contra falsidade.
 */
function valorResultante(doCorpo: string | null | undefined, gravado: string | null): string | null {
  return doCorpo === undefined ? gravado : doCorpo;
}

/**
 * O que falta para esta entrada poder ir ao ar.
 *
 * **Uma funcao so**, usada em tres lugares: a projecao de toda leitura
 * (`missing_to_publish`), a recusa da publicacao, e a recusa de uma edicao que
 * quebraria uma entrada ja publicada. Tres copias seriam tres definicoes de
 * "completo", e o ADR-0023 secao 2 existe por causa disso.
 *
 * `phone_e164` e hoje o UNICO canal de contato que a tabela tem. Site, e-mail,
 * WhatsApp e rede social nao existem como coluna, e a regra vai ter de crescer
 * junto com elas -- quando crescer, "ao menos um" passa a ser uma disjuncao, e
 * este e o lugar onde ela cresce.
 */
export function faltasParaPublicar(
  atual: Pick<EntradaAdministrativa, 'slug' | 'city' | 'state' | 'phoneE164'>,
  edicao: EdicaoDaEntrada = {},
): FaltaParaPublicar[] {
  const faltas: FaltaParaPublicar[] = [];
  // `slug` e `NOT NULL` do lado do painel (o contrato o exige na criacao), mas
  // a coluna aceita nulo e a massa de qa pode ter linha sem ele: a falta
  // continua sendo conferida, e nao assumida.
  if (valorResultante(edicao.slug, atual.slug) === null) faltas.push('slug');
  if (valorResultante(edicao.city, atual.city) === null) faltas.push('city');
  if (valorResultante(edicao.state, atual.state) === null) faltas.push('state');
  if (valorResultante(edicao.phone_e164, atual.phoneE164) === null) faltas.push('phone_e164');
  return ORDEM_DA_FALTA.filter((falta) => faltas.includes(falta));
}

export interface PlanoDaEdicao {
  readonly edicao: EdicaoDaEntrada;
  /** O estado em que a entrada vai ficar. E ele que decide a completude. */
  readonly statusResultante: StatusDaEntrada;
  /**
   * Verdadeiro **so** na transicao para `published`. E o que grava
   * `published_at`: ele responde "desde quando esta no ar", e uma correcao de
   * telefone numa entrada ja publicada nao muda essa resposta.
   */
  readonly gravaMarcoDePublicacao: boolean;
}

export type ResultadoDaEdicao =
  | { readonly ok: true; readonly plano: PlanoDaEdicao }
  | { readonly ok: false; readonly erros: readonly ProblemFieldError[] };

/**
 * Decide a edicao.
 *
 * Recusa devolvendo os erros em vez de lancar: quem chama precisa da **lista**
 * de campos para a tela marcar todos de uma vez, e uma excecao por campo faria o
 * operador descobrir um por requisicao.
 */
export function planejarEdicao(
  atual: EntradaAdministrativa,
  edicao: EdicaoDaEntrada,
): ResultadoDaEdicao {
  // Sem `status` no corpo, o estado nao muda. E aqui que "editar nao
  // despublica" deixa de ser uma frase: nao existe ramo que mexa em `status`
  // sem que o corpo o tenha pedido.
  const statusResultante = edicao.status ?? atual.status;

  if (statusResultante === 'published') {
    const faltas = faltasParaPublicar(atual, edicao);
    if (faltas.length > 0) return { ok: false, erros: errosDaFalta(faltas) };
  }

  return {
    ok: true,
    plano: {
      edicao,
      statusResultante,
      gravaMarcoDePublicacao: statusResultante === 'published' && atual.status !== 'published',
    },
  };
}

// ---------------------------------------------------------------------------
// Forma dos textos
// ---------------------------------------------------------------------------

/**
 * O tamanho e medido sobre o texto APARADO, que e o que vai ser gravado.
 *
 * O contrato mede `minLength` sobre o texto cru, entao `"  a "` passa na borda e
 * morreria no `CHECK` como 500. Mesma funcao que a `Loja` tem em
 * `escrita-da-vitrine.ts`; ela esta repetida aqui, e nao importada de la, porque
 * um modulo de dominio que importa o dominio de outro modulo cria a dependencia
 * que a secao 6 proibe -- e e a mesma razao pela qual a `Rede` tem a sua.
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

/** A UF, duas letras. O `CHECK` do banco mede so o tamanho; a tela precisa da recusa antes. */
/**
 * O CEP, oito digitos.
 *
 * A mensagem fala de oito digitos e nao do hifen de proposito: o painel manda
 * sem mascara, e quem vier por outro caminho precisa saber o que a coluna
 * aceita, nao o que a tela desenha.
 */
export function errosDoCep(campo: string, valor: string): ProblemFieldError[] {
  return FORMA_DO_CEP.test(valor.trim())
    ? []
    : [{ field: campo, code: 'postal_code_invalid', message: 'O CEP tem oito dígitos.' }];
}

export function errosDaUf(campo: string, valor: string): ProblemFieldError[] {
  return /^[A-Za-z]{2}$/.test(valor.trim())
    ? []
    : [{ field: campo, code: 'uf_invalid', message: 'Use a sigla do estado, com duas letras.' }];
}

/**
 * O telefone comercial, em E.164.
 *
 * A forma e a MESMA do `CHECK professionals_telefone_formato` e a MESMA do
 * `pattern` do contrato: `+` e 8 a 15 digitos, sem zero depois do `+`. Ela e
 * deliberadamente mais larga que a do telefone de conta de usuario, que aceita
 * so Brasil -- este e o telefone de uma entidade que aceitou aparecer para ser
 * contratada, e o produto nao promete que toda clinica do diretorio seja
 * brasileira.
 *
 * **A mascara brasileira e do painel, nao daqui.** `admin/src/formato/telefone.ts`
 * monta `+55` + DDD + numero a partir do que a pessoa digitou; o que chega neste
 * lado e sempre E.164, e o que nao for e `400`.
 */
export const FORMA_DO_TELEFONE = /^\+[1-9][0-9]{7,14}$/;

export function errosDoTelefone(campo: string, valor: string): ProblemFieldError[] {
  return FORMA_DO_TELEFONE.test(valor.trim())
    ? []
    : [
        {
          field: campo,
          code: 'phone_invalid',
          message: 'Informe o telefone com DDD. Por exemplo: (11) 3061-2200.',
        },
      ];
}

// ---------------------------------------------------------------------------
// ETag e projecao
// ---------------------------------------------------------------------------

/** O `ETag` e a `version` do banco, entre aspas (`components/headers/ETag`). */
export function comoEtag(version: number): string {
  return `"${String(version)}"`;
}

// `lerIfMatch` mora em `shared/http/if-match.ts`, num ponto so para a Loja, a
// Rede e agora o diretorio: a borda sufixa o ETag (`"3-gzip"`) e os tres leem
// igual. Reimplementar a leitura aqui era o caminho mais curto para o 412 que
// custou dias de "nao esta sendo salvo".
export { lerIfMatch, type VersaoLida } from '../../../shared/http/if-match.js';

export interface VerificacaoProjetada {
  readonly level: NivelDeVerificacao;
  readonly evidence_kinds: readonly TipoDeEvidencia[];
}

/** `AdminDirectoryEntry` do contrato. */
export interface EntradaProjetada {
  readonly slug: string;
  readonly kind: TipoDeProfissional;
  readonly display_name: string;
  readonly about: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly neighborhood: string | null;
  readonly postal_code: string | null;
  readonly street: string | null;
  readonly street_number: string | null;
  readonly complement: string | null;
  readonly phone_e164: string | null;
  readonly status: StatusDaEntrada;
  readonly verification: VerificacaoProjetada;
  readonly source: OrigemDaEntrada;
  readonly claim_status: TitularidadeDaEntrada;
  readonly missing_to_publish: readonly FaltaParaPublicar[];
  readonly published_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly version: number;
}

/**
 * A entrada como o painel a ve.
 *
 * **Nada de `id`** (ADR-0010 item 6; o painel endereca por `slug`, como em
 * `Loja` e `Rede`), nada de coordenada, nada de quem convidou a entidade, nada
 * de quem a reivindicou, e nada de `cnpj` nem `crmv_*`. O que nao chega ao tipo
 * `EntradaAdministrativa` nao tem como sair daqui.
 */
export function projetarEntradaAdministrativa(entrada: EntradaAdministrativa): EntradaProjetada {
  return {
    slug: entrada.slug,
    kind: entrada.kind,
    display_name: entrada.displayName,
    about: entrada.about,
    city: entrada.city,
    state: entrada.state,
    neighborhood: entrada.neighborhood,
    // O endereco de rua sai NESTA projecao, que e a do painel: a tela de
    // edicao precisa mostrar o que gravou. A projecao do aplicativo e outra
    // funcao, em outro arquivo, e ela nao tem estes campos.
    postal_code: entrada.postalCode,
    street: entrada.street,
    street_number: entrada.streetNumber,
    complement: entrada.complement,
    phone_e164: entrada.phoneE164,
    status: entrada.status,
    verification: {
      level: nivelDerivado(entrada.verificacoes),
      evidence_kinds: evidenciasAprovadas(entrada.verificacoes),
    },
    source: entrada.source,
    claim_status: entrada.claimStatus,
    missing_to_publish: faltasParaPublicar(entrada),
    published_at: entrada.publishedAt === null ? null : entrada.publishedAt.toISOString(),
    created_at: entrada.createdAt.toISOString(),
    updated_at: entrada.updatedAt.toISOString(),
    version: entrada.version,
  };
}

/**
 * O retrato que vai para a trilha: os campos de negocio, sem marca de tempo e
 * sem versao.
 *
 * `updated_at` e `version` mudam em TODA escrita, e deixa-los aqui faria a
 * diferenca "antes/depois" acusar mudanca em toda linha da trilha -- o que
 * esconderia a unica informacao que interessa, que e QUAL campo o operador
 * mexeu.
 */
export function retratoDaEntrada(entrada: EntradaAdministrativa): Record<string, unknown> {
  return {
    slug: entrada.slug,
    kind: entrada.kind,
    display_name: entrada.displayName,
    about: entrada.about,
    city: entrada.city,
    state: entrada.state,
    neighborhood: entrada.neighborhood,
    // ---------------------------------------------------------------------
    // O ENDERECO DE RUA NAO ENTRA NO RETRATO DA TRILHA, e a ausencia e regra.
    // ---------------------------------------------------------------------
    // O precedente e medido e e deste repositorio: o endereco de entrega do
    // pedido da plaquinha sai "so nesta superficie, nunca em resposta sem
    // conta, **nunca na trilha de auditoria** e nunca geocodificado"
    // (contrato, `listAdminCollarTagRequests`, decisao do cliente de 17/10).
    //
    // Aqui vale o mesmo com uma razao a mais: o "endereco comercial" de um
    // profissional autonomo -- adestrador, passeador, veterinario que atende
    // em casa -- e a CASA dele, e a trilha e append-only por desenho. Copiar
    // o endereco para dentro dela a cada edicao criaria um historico de
    // enderecos residenciais que nenhuma correcao de cadastro alcanca.
    //
    // O que a trilha perde, dito em voz alta: ela registra QUE a entrada
    // mudou e nao mostra o antes/depois dos quatro campos de endereco. Para
    // os demais campos ela continua inteira.
    phone_e164: entrada.phoneE164,
    status: entrada.status,
  };
}
