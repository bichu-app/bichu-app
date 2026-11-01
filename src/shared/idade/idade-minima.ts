import { problemas } from '../http/errors.js';
import type { Instant } from '../types/brands.js';

/** O fuso em que a conta de aniversário é feita. */
export const FUSO_DO_PRODUTO = 'America/Sao_Paulo';

/** A idade mínima, em anos completos (cliente, 18/10/2026). */
export const IDADE_MINIMA_EM_ANOS = 16;

/**
 * O piso de plausibilidade, **igual ao `CHECK` da migração**
 * `20261018000021_data-de-nascimento-do-tutor.sql`.
 */
export const ANO_MAIS_ANTIGO_ACEITO = 1900;

const CAMPO = 'birth_date';

const FORMA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

interface DataCivil {
  readonly ano: number;
  readonly mes: number;
  readonly dia: number;
}

/** O dia de **hoje** no fuso do produto, lido do instante do relógio. */
export function diaCivilNoFuso(instante: Instant, fuso: string = FUSO_DO_PRODUTO): DataCivil {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instante));

  const valor = (tipo: string): number => {
    const parte = partes.find((p) => p.type === tipo);
    if (parte === undefined) {
      throw new Error(
        `Intl nao devolveu "${tipo}" para o fuso ${fuso}: sem o dia civil nao da para conferir idade`,
      );
    }
    return Number(parte.value);
  };

  return { ano: valor('year'), mes: valor('month'), dia: valor('day') };
}

/** A idade em **anos completos** de quem nasceu em `nascimento`, no dia `hoje`. */
export function idadeEmAnosCompletos(nascimento: DataCivil, hoje: DataCivil): number {
  const anos = hoje.ano - nascimento.ano;
  const aniversarioJaPassou =
    hoje.mes > nascimento.mes || (hoje.mes === nascimento.mes && hoje.dia >= nascimento.dia);
  return aniversarioJaPassou ? anos : anos - 1;
}

/** Confere a data de nascimento recebida no cadastro e devolve `YYYY-MM-DD`. */
export function verificarDataDeNascimento(bruto: unknown, agora: Instant): string {
  if (typeof bruto !== 'string' || bruto.trim().length === 0) {
    throw problemas.validacao([
      {
        field: CAMPO,
        code: 'required',
        message: 'Informe a sua data de nascimento.',
      },
    ]);
  }

  const texto = bruto.trim();
  const casado = FORMA_ISO.exec(texto);
  if (casado === null) {
    throw problemas.validacao([
      { field: CAMPO, code: 'invalid', message: 'Use o formato dia/mês/ano.' },
    ]);
  }

  const ano = Number(casado[1]);
  const mes = Number(casado[2]);
  const dia = Number(casado[3]);

  const normalizada = new Date(Date.UTC(ano, mes - 1, dia));
  const existe =
    normalizada.getUTCFullYear() === ano &&
    normalizada.getUTCMonth() === mes - 1 &&
    normalizada.getUTCDate() === dia;
  if (!existe) {
    throw problemas.validacao([
      { field: CAMPO, code: 'invalid', message: 'Confira o dia e o mês: essa data não existe.' },
    ]);
  }

  const nascimento: DataCivil = { ano, mes, dia };
  const hoje = diaCivilNoFuso(agora);

  if (ano < ANO_MAIS_ANTIGO_ACEITO) {
    throw problemas.validacao([
      {
        field: CAMPO,
        code: 'out_of_range',
        message: 'Confira o ano de nascimento.',
      },
    ]);
  }

  const depoisDeHoje =
    nascimento.ano > hoje.ano ||
    (nascimento.ano === hoje.ano && nascimento.mes > hoje.mes) ||
    (nascimento.ano === hoje.ano && nascimento.mes === hoje.mes && nascimento.dia > hoje.dia);
  if (depoisDeHoje) {
    throw problemas.validacao([
      { field: CAMPO, code: 'in_future', message: 'Essa data ainda não chegou.' },
    ]);
  }

  if (idadeEmAnosCompletos(nascimento, hoje) < IDADE_MINIMA_EM_ANOS) {
    throw problemas.validacao([
      {
        field: CAMPO,
        code: 'too_young',
        message: `O Bichu é para quem tem ${IDADE_MINIMA_EM_ANOS} anos ou mais.`,
      },
    ]);
  }

  const doisDigitos = (n: number): string => String(n).padStart(2, '0');
  return `${String(ano).padStart(4, '0')}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}
