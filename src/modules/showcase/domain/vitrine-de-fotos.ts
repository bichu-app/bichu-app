import { problemas } from '../../../shared/http/errors.js';
import type { ProblemFieldError } from '../../../shared/http/problem.js';

/** O TETO DE FOTOS DA VITRINE: nove. */
export const TETO_DE_FOTOS_DA_VITRINE = 9;

/** A recusa do teto, com a FRASE que a pessoa le -- em uma fonte so. */
export function recusarTetoDaVitrine(): never {
  throw problemas.validacao([
    {
      field: 'photos',
      code: 'maximum',
      message: `No máximo ${String(TETO_DE_FOTOS_DA_VITRINE)} fotos na vitrine.`,
    },
  ]);
}

const MINIMO_DO_TEXTO_ALTERNATIVO = 2;
const MAXIMO_DO_TEXTO_ALTERNATIVO = 150;

const CONTROLE_BIDIRECIONAL = /[‪-‮⁦-⁩]/u;

const FORMA_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Uma foto como o corpo da escrita a declara. */
export interface FotoPedidaNaVitrine {
  readonly upload_id: string;
  readonly alt_text?: string | null;
}

/** Uma foto como a transação a grava: posição já resolvida pelo índice. */
export interface FotoDaVitrineParaGravar {
  readonly uploadId: string;
  readonly position: number;
  readonly altText: string | null;
}

/** Confere a vitrine pedida e devolve as linhas a gravar, em ordem. */
export function conferirVitrinePedida(
  fotos: readonly FotoPedidaNaVitrine[],
): readonly FotoDaVitrineParaGravar[] {
  if (fotos.length > TETO_DE_FOTOS_DA_VITRINE) {
    recusarTetoDaVitrine();
  }

  const erros: ProblemFieldError[] = [];
  const vistos = new Set<string>();
  const paraGravar: FotoDaVitrineParaGravar[] = [];

  fotos.forEach((foto, indice) => {
    const campo = `photos[${String(indice)}].upload_id`;
    if (typeof foto.upload_id !== 'string' || !FORMA_DE_UUID.test(foto.upload_id)) {
      erros.push({ field: campo, code: 'format', message: 'O envio não tem a forma de um identificador.' });
      return;
    }
    if (vistos.has(foto.upload_id.toLowerCase())) {
      erros.push({ field: campo, code: 'duplicate', message: 'Essa foto aparece duas vezes.' });
      return;
    }
    vistos.add(foto.upload_id.toLowerCase());

    const rotulo = foto.alt_text;
    let altText: string | null = null;
    if (typeof rotulo === 'string' && rotulo.trim() !== '') {
      const campoDoTexto = `photos[${String(indice)}].alt_text`;
      if (CONTROLE_BIDIRECIONAL.test(rotulo)) {
        erros.push({
          field: campoDoTexto,
          code: 'bidi_control',
          message: 'O texto tem um caractere de controle de direção.',
        });
        return;
      }
      const tamanho = [...rotulo.trim()].length;
      if (tamanho < MINIMO_DO_TEXTO_ALTERNATIVO || tamanho > MAXIMO_DO_TEXTO_ALTERNATIVO) {
        erros.push({
          field: campoDoTexto,
          code: 'length',
          message: `De ${String(MINIMO_DO_TEXTO_ALTERNATIVO)} a ${String(MAXIMO_DO_TEXTO_ALTERNATIVO)} caracteres.`,
        });
        return;
      }
      altText = rotulo.trim();
    }

    paraGravar.push({ uploadId: foto.upload_id, position: indice, altText });
  });

  if (erros.length > 0) throw problemas.validacao(erros);
  return paraGravar;
}
