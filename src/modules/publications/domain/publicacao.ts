/**
 * O domínio da publicação do Mural: **a forma do que se publica, e o cursor da
 * linha do tempo.**
 *
 * Fino de propósito, como o da vitrine. A autorização não mora aqui — ela é a
 * cláusula `WHERE` do repositório (ADR-0021). A geometria da foto não mora aqui
 * — ela é `media/domain/derivadas.ts`. O que sobra é o que o banco também cobra
 * e o que a borda precisa recusar com motivo legível **antes** de abrir
 * transação.
 *
 * ## Por que conferir aqui se o `CHECK` do banco já confere
 *
 * Porque os dois dizem coisas diferentes a quem chama. O `CHECK` devolve um
 * erro de banco sem campo e sem código; esta camada devolve
 * `400 validation-failed` com `field` e `code`, que é o que a tela traduz. E
 * porque a conferência tem de vir **antes** da transação: abrir transação para
 * descobrir que o corpo tem 300 caracteres é segurar conexão do pool por nada —
 * a mesma razão que `conferirVitrinePedida` registra.
 *
 * **Os dois continuam existindo, e isso é o desenho e não redundância.** Um
 * caminho novo que esquecesse esta camada ainda bate no `CHECK`; o `CHECK`
 * sozinho não sabe dizer qual campo.
 *
 * ## O que NÃO se confere aqui, e a ausência é decisão do cliente
 *
 * **Conteúdo.** Não há lista de palavra, não há recusa por texto e não há
 * normalização que apague nada: *"deixe o texto livre na timeline"* e *"quem
 * modera vai ser o administrador, deve ir para a página de backoffice"*
 * (cliente, 18/10/2026). A moderação é `reportPublication` somada à fila do
 * painel. O único tratamento é `trim`, e ele existe para que um corpo de
 * espaços não passe por "1 caractere".
 */

import { comoInstante, comoIso } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';

/** 280, e o número tem dono: `publication_reports.publication_body` já o cobrava. */
export const TETO_DO_CORPO_DA_PUBLICACAO = 280;

/** A faixa do rótulo de leitor de tela. A mesma de `network_event_images.alt_text`. */
export const PISO_DO_TEXTO_ALTERNATIVO = 2;
export const TETO_DO_TEXTO_ALTERNATIVO = 150;

/** Quantas publicações uma página de linha do tempo traz quando ninguém pede. */
export const PAGINA_PADRAO_DA_LINHA_DO_TEMPO = 20;

/** O teto por página. O mesmo do parâmetro `Limit` do contrato. */
export const PAGINA_MAXIMA_DA_LINHA_DO_TEMPO = 50;

/** Um campo que a borda recusa, na forma que `problemas.validacao` recebe. */
export interface CampoRecusado {
  readonly field: string;
  readonly code: string;
  readonly message?: string;
}

/** A publicação pedida, já conferida e pronta para gravar. */
export interface PublicacaoConferida {
  readonly corpo: string;
  readonly uploadId: string | null;
  readonly textoAlternativo: string | null;
}

/** O corpo de `createPublication`, como o contrato o declara. */
export interface PublicacaoPedida {
  readonly body?: unknown;
  readonly upload_id?: unknown;
  readonly alt_text?: unknown;
}

/**
 * Confere a publicação pedida e devolve o que gravar, ou a lista de recusas.
 *
 * Devolve a lista em vez de lançar porque **as recusas somam**: corpo vazio e
 * texto alternativo sem foto são dois problemas, e entregar um por vez faria a
 * pessoa corrigir, enviar e descobrir o segundo.
 */
export function conferirPublicacaoPedida(
  pedida: PublicacaoPedida,
): { readonly ok: PublicacaoConferida } | { readonly recusas: readonly CampoRecusado[] } {
  const recusas: CampoRecusado[] = [];

  // `trim` e nada mais. Ver o cabeçalho: não há filtro de conteúdo, por decisão
  // do cliente. O `trim` existe para que "   " não passe como um caractere.
  const corpo = typeof pedida.body === 'string' ? pedida.body.trim() : '';
  if (corpo === '') {
    recusas.push({
      field: 'body',
      code: 'required',
      message: 'Escreva uma mensagem.',
    });
  } else if ([...corpo].length > TETO_DO_CORPO_DA_PUBLICACAO) {
    // `[...corpo]` e não `corpo.length`: `length` conta unidades UTF-16, e um
    // emoji fora do BMP conta DOIS. O `char_length` do Postgres conta pontos de
    // código, e a divergência faria esta camada aceitar um texto que o `CHECK`
    // recusa — o cliente receberia erro de banco sem campo em vez de `400` com
    // motivo.
    recusas.push({
      field: 'body',
      code: 'maximum',
      message: `No máximo ${String(TETO_DO_CORPO_DA_PUBLICACAO)} caracteres.`,
    });
  }

  const uploadId = typeof pedida.upload_id === 'string' && pedida.upload_id !== '' ? pedida.upload_id : null;

  const textoAlternativo =
    typeof pedida.alt_text === 'string' && pedida.alt_text.trim() !== ''
      ? pedida.alt_text.trim()
      : null;

  if (textoAlternativo !== null) {
    if (uploadId === null) {
      // O `CHECK user_publications_texto_alternativo_pede_imagem` cobra o mesmo.
      // Aqui ele vira `400` com o campo, que é o que a tela sabe apontar.
      recusas.push({
        field: 'alt_text',
        code: 'conflict',
        message: 'A descrição da foto só vale com uma foto.',
      });
    }
    const tamanho = [...textoAlternativo].length;
    if (tamanho < PISO_DO_TEXTO_ALTERNATIVO || tamanho > TETO_DO_TEXTO_ALTERNATIVO) {
      recusas.push({
        field: 'alt_text',
        code: tamanho < PISO_DO_TEXTO_ALTERNATIVO ? 'minimum' : 'maximum',
        message: `Entre ${String(PISO_DO_TEXTO_ALTERNATIVO)} e ${String(TETO_DO_TEXTO_ALTERNATIVO)} caracteres.`,
      });
    }
  }

  if (recusas.length > 0) return { recusas };
  return { ok: { corpo, uploadId, textoAlternativo } };
}

/**
 * O cursor da linha do tempo: **o instante e o `ref` público da última linha.**
 *
 * ## Por que os dois, e não só o instante
 *
 * Duas publicações no mesmo milissegundo empatam em `created_at`, e um cursor
 * que só carregasse o instante devolveria a mesma linha duas vezes (`<=`) ou
 * pularia uma (`<`). O par `(created_at, ref)` é único — `public_ref` é
 * `UNIQUE` — e a comparação lexicográfica de linha do Postgres sobre ele é
 * total.
 *
 * ## Por que `ref` e não `id`
 *
 * **Item 6 do ADR-0010.** O cursor vai para o cliente e volta; um cursor que
 * carregasse `user_publications.id` poria um UUID interno em saída, e base64
 * não é segredo — qualquer um decodifica. `public_ref` já é o endereço público
 * da linha, e por isso ele pode sair.
 *
 * A consequência é no índice: `user_publications_da_linha_do_tempo` tem
 * `public_ref` como terceira coluna justamente por isto. Cursor cuja coluna de
 * desempate não está na árvore vira varredura.
 *
 * ## Não é assinado, e a ausência de assinatura é segura aqui
 *
 * Um cursor forjado só consegue pedir "publicações anteriores a tal instante" —
 * e o recorte de **quem** pode ver continua inteiro na cláusula `WHERE`, que o
 * cursor não toca. Assinar protegeria contra nada e acrescentaria um segredo a
 * girar.
 */
export interface CursoDaLinhaDoTempo {
  /**
   * O instante da última linha da página anterior. `Instant` e não `Date`: o
   * tipo marcado é o que impede um `number` cru de atravessar, e a conversão
   * para `Date` mora em `comoData`, no único arquivo autorizado a construí-la.
   */
  readonly antesDe: Instant;
  readonly ref: string;
}

/** O separador. `|` não aparece em base64url nem em ISO-8601, então não escapa nada. */
const SEPARADOR_DO_CURSOR = '|';

export function escreverCursor(curso: CursoDaLinhaDoTempo): string {
  return Buffer.from(
    `${comoIso(curso.antesDe)}${SEPARADOR_DO_CURSOR}${curso.ref}`,
    'utf8',
  ).toString('base64url');
}

/**
 * Lê o cursor, ou `undefined` quando ele não tem a forma.
 *
 * `undefined` e não exceção: cursor ilegível é `400 validation-failed` com
 * `field: cursor`, decidido pela borda — e não um 500. A borda é que sabe que
 * isso é um parâmetro de consulta.
 */
export function lerCursor(texto: string): CursoDaLinhaDoTempo | undefined {
  let bruto: string;
  try {
    bruto = Buffer.from(texto, 'base64url').toString('utf8');
  } catch {
    return undefined;
  }
  const corte = bruto.indexOf(SEPARADOR_DO_CURSOR);
  if (corte <= 0) return undefined;
  const instante = bruto.slice(0, corte);
  const ref = bruto.slice(corte + 1);
  // A MESMA forma que o `CHECK` do banco e o contrato cobram. Sem ela, um
  // cursor forjado levaria texto arbitrário para a comparação da consulta.
  if (!/^[A-Za-z0-9_-]{22}$/.test(ref)) return undefined;
  const quando = comoInstante(instante);
  if (quando === undefined) return undefined;
  return { antesDe: quando, ref };
}

/**
 * O limite pedido, dentro da faixa. Fora da faixa é recusa e não aparo: um
 * `limit=500` aparado em silêncio faria o cliente achar que recebeu tudo.
 */
export function conferirLimite(pedido: unknown): { readonly limite: number } | { readonly recusa: CampoRecusado } {
  if (pedido === undefined || pedido === null || pedido === '') {
    return { limite: PAGINA_PADRAO_DA_LINHA_DO_TEMPO };
  }
  const numero = typeof pedido === 'number' ? pedido : Number(pedido);
  if (
    !Number.isInteger(numero) ||
    numero < 1 ||
    numero > PAGINA_MAXIMA_DA_LINHA_DO_TEMPO
  ) {
    return {
      recusa: {
        field: 'limit',
        code: 'maximum',
        message: `Entre 1 e ${String(PAGINA_MAXIMA_DA_LINHA_DO_TEMPO)}.`,
      },
    };
  }
  return { limite: numero };
}
