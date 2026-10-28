/**
 * A avaliacao de um local do diretorio `Perto`: a validacao e a projecao.
 *
 * Pedido literal do cliente em 18/10/2026: "os locais indicados devem ser
 * clicados, para visualizar mais informacoes e para que os usuarios possam dar
 * pontuacao e fazer recomendacoes em texto, onde ficara disponivel para outros
 * usuarios, como acontece na playstore".
 *
 * ## O que NAO sai daqui, e cada ausencia e a mesma regra de `projetarEntrada`
 *
 * - **`id` da avaliacao.** UUID interno, proibido em saida pelo ADR-0010 item
 *   6. O que sai e `ref`, opaco e sorteado por linha.
 * - **Qualquer identificador do autor.** Nem conta, nem `slug`, nem um ref
 *   estavel entre locais. So o nome de exibicao, e ele e nulavel. A BICHUS-174
 *   proibe expor vinculo entre duas pessoas "inclusive como contagem e como
 *   existencia", e um ref de autor permitiria montar o historico de avaliacoes
 *   de qualquer um -- que e exatamente esse vinculo.
 * - **`moderation_reason` e `moderated_at`.** O motivo da moderacao e para
 *   quem audita, nao para quem le a pagina. Eles nao entram no tipo de entrada
 *   destas funcoes: o que nao chega aqui nao tem como sair daqui.
 * - **`service_kind`.** Existe na tabela porque o ADR-0011 o nomeia, e nenhuma
 *   rota o preenche nem o le hoje. Projetar campo que ninguem escreve
 *   publicaria `null` em toda linha.
 *
 * ## `status` tambem nao sai, e por um motivo diferente
 *
 * Nao e privacidade: e que so `published` chega ate aqui. O filtro vive na
 * clausula `WHERE` da consulta (ADR-0021), junto com `conta_habilitada`, e nao
 * num `if` destas funcoes. Projecao que filtra e projecao que um dia esquece.
 */

import type { ProblemFieldError } from '../../../shared/http/problem.js';
import { errosDeModeracao } from '../../../shared/texto/moderacao.js';

/** O limite de `professional_reviews.body`, e o mesmo do contrato. */
export const TAMANHO_MAXIMO_DO_TEXTO = 1500;

export const NOTA_MINIMA = 1;
export const NOTA_MAXIMA = 5;

/** As notas possiveis, que sao tambem as chaves do histograma. */
export const NOTAS = [1, 2, 3, 4, 5] as const;

export type Nota = (typeof NOTAS)[number];

export type MotivoDaDenuncia =
  | 'spam'
  | 'offensive'
  | 'false_information'
  | 'not_about_this_place'
  | 'other';

export const MOTIVOS_DA_DENUNCIA: readonly MotivoDaDenuncia[] = [
  'spam',
  'offensive',
  'false_information',
  'not_about_this_place',
  'other',
];

/**
 * A avaliacao como a persistencia a entrega: ja recortada, sem nada que nao
 * possa sair.
 */
export interface AvaliacaoDoLocal {
  readonly ref: string;
  readonly nota: number;
  readonly texto: string | null;
  readonly nomeDeExibicaoDoAutor: string | null;
  readonly criadaEm: Date;
  readonly editadaEm: Date | null;
  /** Verdadeiro na avaliacao de quem chama. */
  readonly minha: boolean;
}

/** A pontuacao agregada, como `pontuacao_do_local` a devolve. */
export interface PontuacaoDoLocal {
  /** **Nulo quando `quantidade` e zero**, e nunca zero. Ver `projetarPontuacao`. */
  readonly media: number | null;
  readonly quantidade: number;
  readonly histograma: Readonly<Record<Nota, number>>;
}

/** A pontuacao vazia: o que um local sem nenhuma avaliacao tem. */
export const PONTUACAO_VAZIA: PontuacaoDoLocal = {
  media: null,
  quantidade: 0,
  histograma: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
};

/**
 * `DirectoryRating` do contrato.
 *
 * **`average` nulo e nao zero quando nao ha avaliacao**, e esta e a unica linha
 * desta funcao que precisa de defesa: zero se le como "pessimo" numa escala de
 * 1 a 5, e um local que ninguem avaliou nao e pessimo. A tela escreve "Ainda
 * sem avaliacoes" e nao desenha estrela nenhuma. Um `COALESCE(..., 0)` em
 * qualquer ponto deste caminho -- SQL, aqui, ou no app -- reintroduz a mentira.
 *
 * **As cinco chaves do histograma vem sempre**, inclusive com zero: a barra de
 * uma nota que ninguem deu precisa existir vazia, senao o grafico muda de forma
 * e deixa de ser comparavel entre locais.
 */
export function projetarPontuacao(p: PontuacaoDoLocal): {
  average: number | null;
  count: number;
  histogram: Record<string, number>;
} {
  return {
    average: p.quantidade === 0 ? null : p.media,
    count: p.quantidade,
    histogram: {
      '1': p.histograma[1],
      '2': p.histograma[2],
      '3': p.histograma[3],
      '4': p.histograma[4],
      '5': p.histograma[5],
    },
  };
}

/** `DirectoryReview` do contrato. */
export function projetarAvaliacao(a: AvaliacaoDoLocal): {
  ref: string;
  rating: number;
  body: string | null;
  author_display_name: string | null;
  created_at: string;
  edited_at: string | null;
  mine: boolean;
} {
  return {
    ref: a.ref,
    rating: a.nota,
    body: a.texto,
    author_display_name: a.nomeDeExibicaoDoAutor,
    created_at: a.criadaEm.toISOString(),
    edited_at: a.editadaEm === null ? null : a.editadaEm.toISOString(),
    mine: a.minha,
  };
}

export interface ErroDeCampo {
  readonly field: string;
  readonly code: string;
  readonly message: string;
}

/**
 * O que a escrita aceita, depois de validada e normalizada.
 *
 * `texto: null` representa "sem texto" **de uma unica forma**. String vazia nao
 * chega aqui: `validarEntradaDaAvaliacao` a converte para `null`, porque duas
 * representacoes de ausencia obrigariam cada tela e cada consulta a conhecer as
 * duas, e a primeira que esquecesse mostraria um paragrafo vazio.
 */
export interface EntradaDaAvaliacao {
  readonly nota: Nota;
  readonly texto: string | null;
}

/**
 * Valida o corpo de `putMyDirectoryEntryReview`.
 *
 * **Esta funcao e a SEGUNDA recusa e nao a unica.** A primeira e o schema do
 * contrato, instalado por `vigiarParametrosDasRotas`; a terceira sao os
 * `CHECK` de `professional_reviews`. As tres existem porque cada uma e a que
 * sobra quando as outras forem contornadas, e porque a mensagem de campo que a
 * tela mostra precisa nascer aqui, onde o nome do campo e conhecido.
 *
 * ## Por que o HTML e recusado na ENTRADA, e nao escapado na saida
 *
 * Escapar na saida depende de **toda** tela futura lembrar de escapar -- quatro
 * aplicacoes leem este contrato. Recusar na entrada vale uma vez, e o `CHECK`
 * do banco repete a recusa para quem escrever por outro caminho.
 *
 * O custo e conhecido e aceito: quem escrever "nota 10 <3" leva `400`. O
 * inverso -- aceitar e escapar -- troca esse incomodo por um `<script>` que
 * depende de ninguem errar nunca, num texto que aparece na pagina de um negocio
 * real.
 */
export function validarEntradaDaAvaliacao(corpo: unknown): {
  entrada?: EntradaDaAvaliacao;
  erros: readonly ErroDeCampo[];
} {
  const erros: ErroDeCampo[] = [];
  const c = (corpo ?? {}) as Record<string, unknown>;

  const notaCrua = c['rating'];
  let nota: Nota | undefined;
  if (typeof notaCrua !== 'number' || !Number.isInteger(notaCrua)) {
    erros.push({
      field: 'rating',
      code: 'required',
      message: 'Dê uma nota de 1 a 5.',
    });
  } else if (notaCrua < NOTA_MINIMA || notaCrua > NOTA_MAXIMA) {
    // A FAIXA, e ela e recusada aqui tambem e nao so no banco: o `CHECK`
    // devolveria 500 na cara de quem usa, e o que a pessoa precisa ler e qual
    // campo esta errado.
    erros.push({
      field: 'rating',
      code: 'out_of_range',
      message: 'A nota vai de 1 a 5.',
    });
  } else {
    nota = notaCrua as Nota;
  }

  const textoCru = c['body'];
  let texto: string | null = null;
  if (textoCru !== undefined && textoCru !== null) {
    if (typeof textoCru !== 'string') {
      erros.push({ field: 'body', code: 'invalid', message: 'O texto precisa ser texto.' });
    } else {
      // APARADO ANTES DE MEDIR. Mil e quinhentos espacos nao sao um texto de
      // 1500 caracteres, e recusa-los pelo tamanho explicaria a coisa errada.
      const aparado = textoCru.trim();
      if (aparado === '') {
        // **Vazio e ausente sao a MESMA coisa**, e nao um erro: quem apagou o
        // texto e deixou so a nota fez algo legitimo (o texto e opcional). Vira
        // `null`, que e a unica representacao de "sem texto".
        texto = null;
      } else if (aparado.length > TAMANHO_MAXIMO_DO_TEXTO) {
        erros.push({
          field: 'body',
          code: 'too_long',
          message: `O texto vai até ${String(TAMANHO_MAXIMO_DO_TEXTO)} caracteres.`,
        });
      } else if (/[<>]/.test(aparado)) {
        erros.push({
          field: 'body',
          code: 'html_not_allowed',
          message: 'Escreva sem os sinais < e >.',
        });
      } else {
        texto = aparado;
      }
    }
  }

  if (erros.length > 0 || nota === undefined) return { erros };
  return { entrada: { nota, texto }, erros: [] };
}

/**
 * A MODERACAO DE PALAVRAS do texto da avaliacao: xingamento, injuria e o que
 * prejudica a imagem do aplicativo. Pedido do cliente de 18/10/2026, com as
 * mesmas palavras que cobriram a indicacao -- "nos campos de indicacao e
 * recomendacao de profissionais".
 *
 * E a MESMA funcao da indicacao (`shared/texto/moderacao.ts`,
 * `code: inappropriate_language`), import direto e nao copia: a lista de
 * palavras, a normalizacao e a mensagem sao as de la, e esta funcao nao
 * acrescenta nem uma palavra.
 *
 * ## POR QUE ELA NAO MORA DENTRO DE `validarEntradaDaAvaliacao`
 *
 * **Por causa da ORDEM.** `validarEntradaDaAvaliacao` roda antes de tocar o
 * banco, e a trava de canal verificado (`409 contact-channel-unverified`)
 * precisa vir ANTES da moderacao -- e assim que a indicacao se comporta
 * (`application/sugestao-do-diretorio.ts`: o `if` do canal vem antes de
 * `errosDaSugestao`), e dois comportamentos diferentes para a mesma regra do
 * cliente fariam a tela decidir por dois caminhos onde ha um.
 *
 * Se a moderacao entrasse na validacao estrutural, quem nao confirmou o e-mail
 * receberia `400` sobre o texto em vez do `409` que explica o que de fato
 * falta. A conferencia de FORMA (`required`, `too_long`, `html_not_allowed`)
 * continua antes do `409`, como sempre esteve: ela nao depende da conta, e e
 * a borda quem ordena os dois.
 *
 * `null` nao e moderado porque nao ha texto: avaliacao de nota sozinha e
 * legitima e e o caso comum.
 */
/*
 * O tipo e `ProblemFieldError` e nao o `ErroDeCampo` local: e o tipo que
 * `errosDeModeracao` devolve e o que `problemas.validacao` recebe, igual a
 * indicacao. Reempacotar para o tipo local so criaria uma conversao que nao
 * muda nada.
 */
export function errosDeModeracaoDaAvaliacao(texto: string | null): readonly ProblemFieldError[] {
  if (texto === null) return [];
  return errosDeModeracao('body', texto);
}

/** Valida o corpo de `reportDirectoryEntryReview`. */
export function validarDenuncia(corpo: unknown): {
  denuncia?: { motivo: MotivoDaDenuncia; detalhe: string | null };
  erros: readonly ErroDeCampo[];
} {
  const erros: ErroDeCampo[] = [];
  const c = (corpo ?? {}) as Record<string, unknown>;

  const motivoCru = c['reason'];
  let motivo: MotivoDaDenuncia | undefined;
  if (typeof motivoCru !== 'string' || !MOTIVOS_DA_DENUNCIA.includes(motivoCru as MotivoDaDenuncia)) {
    erros.push({ field: 'reason', code: 'required', message: 'Diga o motivo da denúncia.' });
  } else {
    motivo = motivoCru as MotivoDaDenuncia;
  }

  const detalheCru = c['detail'];
  let detalhe: string | null = null;
  if (detalheCru !== undefined && detalheCru !== null) {
    if (typeof detalheCru !== 'string') {
      erros.push({ field: 'detail', code: 'invalid', message: 'O detalhe precisa ser texto.' });
    } else {
      const aparado = detalheCru.trim();
      if (aparado === '') detalhe = null;
      else if (aparado.length > 1000) {
        erros.push({ field: 'detail', code: 'too_long', message: 'O detalhe vai até 1000 caracteres.' });
      } else if (/[<>]/.test(aparado)) {
        erros.push({ field: 'detail', code: 'html_not_allowed', message: 'Escreva sem os sinais < e >.' });
      } else detalhe = aparado;
    }
  }

  if (erros.length > 0 || motivo === undefined) return { erros };
  return { denuncia: { motivo, detalhe }, erros: [] };
}

export type OrdemDasAvaliacoes = 'recent' | 'rating_desc' | 'rating_asc';
