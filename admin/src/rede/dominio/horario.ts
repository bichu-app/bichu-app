/**
 * Conversao entre o campo `datetime-local` (hora de parede, sem fuso) e o
 * instante do contrato (`date-time` em UTC), sempre pelo fuso do encontro
 * (`time_zone`, padrao `America/Sao_Paulo`, que a tela chama de "Horario de
 * Brasilia"). O deslocamento vem do `Intl`, nunca de um -03:00 fixo: se o
 * horario de verao voltar, o calculo continua certo.
 */

export const FUSO_PADRAO = 'America/Sao_Paulo';

interface Partes {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
}

function partesNoFuso(instante: number, fuso: string): Partes & { semana: string } {
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(instante)).map((x) => [x.type, x.value]));
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    hora: Number(p.hour),
    minuto: Number(p.minute),
    semana: (p.weekday ?? '').replace('.', ''),
  };
}

function deslocamento(instante: number, fuso: string): number {
  const p = partesNoFuso(instante, fuso);
  return Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto) - Math.floor(instante / 60_000) * 60_000;
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** "2026-10-10T09:00" no fuso dado vira "2026-10-10T12:00:00.000Z". */
export function instanteDoCampo(valor: string, fuso = FUSO_PADRAO): string | null {
  const m = LOCAL.exec(valor);
  if (!m) return null;
  const [, a, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  const parede = Date.UTC(a, mo - 1, d, h, mi);
  let instante = parede - deslocamento(parede, fuso);
  instante = parede - deslocamento(instante, fuso);
  return new Date(instante).toISOString();
}

const dois = (n: number) => n.toString().padStart(2, '0');

/** O inverso: o instante do contrato como valor de `datetime-local`. */
export function campoDoInstante(iso: string, fuso = FUSO_PADRAO): string {
  const p = partesNoFuso(Date.parse(iso), fuso);
  return `${p.ano}-${dois(p.mes)}-${dois(p.dia)}T${dois(p.hora)}:${dois(p.minuto)}`;
}

/** "sáb, 27/09/2026" */
export function dataCurta(iso: string, fuso = FUSO_PADRAO): string {
  const p = partesNoFuso(Date.parse(iso), fuso);
  return `${p.semana}, ${dois(p.dia)}/${dois(p.mes)}/${p.ano}`;
}

/** "9:00" */
export function hora(iso: string, fuso = FUSO_PADRAO): string {
  const p = partesNoFuso(Date.parse(iso), fuso);
  return `${p.hora}:${dois(p.minuto)}`;
}

/** "9:00 às 11:00", ou so o inicio quando o encontro nao declara fim. */
export function faixaDeHorario(inicio: string, fim: string | null | undefined, fuso = FUSO_PADRAO): string {
  return fim ? `${hora(inicio, fuso)} às ${hora(fim, fuso)}` : hora(inicio, fuso);
}

/** "21/09/2026 às 14:32" */
export function dataEHora(iso: string, fuso = FUSO_PADRAO): string {
  const p = partesNoFuso(Date.parse(iso), fuso);
  return `${dois(p.dia)}/${dois(p.mes)}/${p.ano} às ${dois(p.hora)}:${dois(p.minuto)}`;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** `member_since` ("2026-03") vira "março de 2026". */
export function mesPorExtenso(anoMes: string): string {
  const [a, m] = anoMes.split('-').map(Number);
  const nome = m && MESES[m - 1];
  return nome && a ? `${nome} de ${a}` : anoMes;
}
