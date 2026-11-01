import { problemas } from '../../../shared/http/errors.js';
import type { Clock } from '../../../shared/time/clock.js';
import type { UserId } from '../../../shared/types/brands.js';
import type { DuvidasDeAjuda } from '../ports/duvidas-de-ajuda.js';

/** Os mesmos numeros de `HelpRequestInput` e dos dois `CHECK` da migracao. */
export const TETO_DO_ASSUNTO = 120;
export const TETO_DO_TEXTO = 4000;
const PISO = 2;

export interface ChamadorDaAjuda {
  readonly userId: UserId;
}

export interface DuvidaDeAjudaService {
  registrar(chamador: ChamadorDaAjuda, assunto: string, texto: string): Promise<void>;
}

function aparado(
  valor: string,
  campo: string,
  teto: number,
): { readonly texto: string } | { readonly erro: { field: string; code: string; message: string } } {
  const limpo = valor.trim();
  if (limpo.length < PISO) {
    return {
      erro: {
        field: campo,
        code: 'too_short',
        message: 'Escreva um pouco mais: tem de sobrar texto depois dos espaços.',
      },
    };
  }
  if (limpo.length > teto) {
    return {
      erro: {
        field: campo,
        code: 'too_long',
        message: `Encurte para no máximo ${String(teto)} caracteres.`,
      },
    };
  }
  return { texto: limpo };
}

export function criarDuvidaDeAjudaService(
  duvidas: DuvidasDeAjuda,
  relogio: Clock,
): DuvidaDeAjudaService {
  return {
    async registrar(chamador: ChamadorDaAjuda, assunto: string, texto: string): Promise<void> {
      const a = aparado(assunto, 'subject', TETO_DO_ASSUNTO);
      const t = aparado(texto, 'body', TETO_DO_TEXTO);

      if ('erro' in a || 'erro' in t) {
        throw problemas.validacao([
          ...('erro' in a ? [a.erro] : []),
          ...('erro' in t ? [t.erro] : []),
        ]);
      }

      await duvidas.registrar(
        { autor: chamador.userId, assunto: a.texto, texto: t.texto },
        relogio.now(),
      );
    },
  };
}
