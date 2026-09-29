/**
 * Lista de encontros: o filtro de escolha unica da tela traduzido nos
 * parametros de `listAdminNetworkEvents`, o selo de cada linha e os textos de
 * contagem e de sem resultado (UX 29.4 e 29.5).
 */
import { dataEHora, hora } from './horario.ts';
import type { Encontro, FiltrosDaLista, OrdemDaLista } from './tipos.ts';

export type Filtro = 'todos' | 'agendados' | 'agora' | 'encerrados' | 'cancelados';

export const FILTROS: Record<Filtro, string> = {
  todos: 'Todos',
  agendados: 'Agendados',
  agora: 'Acontecendo agora',
  encerrados: 'Encerrados',
  cancelados: 'Cancelados',
};

export function ehFiltro(v: string | null): v is Filtro {
  return v !== null && v in FILTROS;
}

export function ehOrdem(v: string | null): v is OrdemDaLista {
  return v === 'agenda' || v === 'atualizado';
}

export function consultaDaLista(filtro: Filtro, q: string, ordem: OrdemDaLista, page: number, limit: number): FiltrosDaLista {
  const base: FiltrosDaLista = { sort: ordem, page, limit };
  const busca = q.trim();
  // `q` tem minLength 2 no contrato: uma letra so nao vai ao servidor.
  if (busca.length >= 2) base.q = busca.slice(0, 80);
  switch (filtro) {
    case 'agendados':
      return { ...base, publication_status: 'published', timing: 'upcoming' };
    case 'agora':
      return { ...base, publication_status: 'published', timing: 'happening' };
    case 'encerrados':
      return { ...base, publication_status: 'published', timing: 'ended' };
    case 'cancelados':
      return { ...base, publication_status: 'cancelled' };
    case 'todos':
      return base;
  }
}

export type Selo = 'agendado' | 'agora' | 'encerrado' | 'cancelado' | 'removido';

export const SELOS: Record<Selo, string> = {
  agendado: 'Agendado',
  agora: 'Acontecendo agora',
  encerrado: 'Encerrado',
  cancelado: 'Cancelado',
  removido: 'Removido',
};

export function seloDoEncontro(e: Pick<Encontro, 'publication_status' | 'timing'>): Selo {
  if (e.publication_status === 'removed') return 'removido';
  if (e.publication_status === 'cancelled') return 'cancelado';
  return e.timing === 'upcoming' ? 'agendado' : e.timing === 'happening' ? 'agora' : 'encerrado';
}

const plural = (n: number) => (n === 1 ? 'encontro' : 'encontros');

export function textoDaContagem(carregados: number, total: number, filtro: Filtro, q: string): string {
  if (carregados < total) return `Mostrando ${carregados} de ${total} ${plural(total)}`;
  let t = `${total} ${plural(total)}`;
  if (q.trim()) t += ` com “${q.trim()}”`;
  if (filtro !== 'todos') t += ` em ${FILTROS[filtro]}`;
  return t;
}

export function textoSemResultado(filtro: Filtro, q: string): { frase: string; limpar: string } {
  const busca = q.trim();
  const temF = filtro !== 'todos';
  if (busca && temF) return { frase: `Nenhum encontro com “${busca}” em ${FILTROS[filtro]}.`, limpar: 'Limpar busca e filtro' };
  if (temF) return { frase: `Nenhum encontro em ${FILTROS[filtro]}.`, limpar: 'Limpar filtro' };
  return { frase: `Nenhum encontro com “${busca}”.`, limpar: 'Limpar busca' };
}

/** O que o menu da linha oferece, pelo estado do encontro (25.5.2). */
export function acoesDoEncontro(e: Pick<Encontro, 'publication_status' | 'timing' | 'visibility'>) {
  const vivo = e.publication_status !== 'removed';
  return {
    editar: vivo,
    pedidos: vivo && e.visibility === 'private',
    cancelar: e.publication_status === 'published' && e.timing !== 'ended',
    remover: vivo,
  };
}

/**
 * Ate quando o encontro cancelado continua no app (decisao do cliente de 23/09
 * e contrato): ate o fim previsto; sem fim declarado, ate 23:59:59 do dia do
 * inicio, no fuso do encontro. O dialogo e o sucesso dizem o prazo certo de cada
 * caso, em vez de "ate o horario previsto de fim" para quem nao tem fim.
 */
export function textosDoCancelamento(e: Pick<Encontro, 'starts_at' | 'ends_at' | 'time_zone'>): { corpo: string; sucesso: string } {
  const fuso = e.time_zone;
  const ate = e.ends_at
    ? `até o horário de fim, às ${hora(e.ends_at, fuso)} de ${dataEHora(e.ends_at, fuso).slice(0, 10)}`
    : `até o fim do dia ${dataEHora(e.starts_at, fuso).slice(0, 10)}`;
  const abertura = e.ends_at
    ? `O encontro continua no app, marcado como cancelado, ${ate}.`
    : `O encontro não tem horário de fim, então continua no app, marcado como cancelado, ${ate}.`;
  return {
    corpo: `${abertura} Não dá para desfazer: se ele for acontecer em outra data, crie um encontro novo. Todos os administradores recebem aviso.`,
    sucesso: `Encontro cancelado. O app mostra o aviso de cancelado ${ate}.`,
  };
}
