// Frases montadas a partir dos campos do contrato. O site so mostra o que a API
// devolve (ADR-0028, item 3): campo ausente nao vira texto inventado.
import type { ResolucaoDaTag } from './telas-da-tag.ts';

type Pet = ResolucaoDaTag['pet'];

const ESPECIE: Record<Pet['species'], string> = { dog: 'Cão', cat: 'Gato', other: 'Pet' };
const PORTE: Record<Pet['size'], string> = {
  P: 'porte pequeno',
  M: 'porte médio',
  G: 'porte grande',
  GG: 'porte muito grande',
};

/** "Cão, SRD, porte médio, preto e branco." Os sinais do tutor ficam em frase propria. */
export function descricaoDoPet(pet: Pet): string {
  const partes = [ESPECIE[pet.species], pet.breed_label, PORTE[pet.size], pet.primary_color]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter((p) => p.length > 0);
  return `${partes.join(', ')}.`;
}

/** Texto livre do tutor, com ponto final se faltar. */
export function frase(texto: string | null | undefined): string | null {
  const t = (texto ?? '').trim();
  if (!t) return null;
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

const FUSO = 'America/Sao_Paulo';

function diaCivil(instante: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instante);
}

/** "desde hoje", "desde ontem" ou "desde 16/09", no fuso de Sao Paulo. */
export function desde(since: string | null | undefined, agora: Date = new Date()): string | null {
  if (!since) return null;
  const inicio = new Date(since);
  if (Number.isNaN(inicio.getTime())) return null;
  const hoje = diaCivil(agora);
  const ontem = diaCivil(new Date(agora.getTime() - 24 * 60 * 60 * 1000));
  const dia = diaCivil(inicio);
  if (dia === hoje) return 'desde hoje';
  if (dia === ontem) return 'desde ontem';
  const dm = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' }).format(inicio);
  return `desde ${dm}`;
}

/** "10 minutos", "1 minuto", "40 segundos"; null quando a API nao disse quanto. */
export function espera(segundos: number | null): string | null {
  if (segundos === null || !Number.isFinite(segundos) || segundos <= 0) return null;
  if (segundos < 60) return segundos === 1 ? '1 segundo' : `${segundos} segundos`;
  const minutos = Math.ceil(segundos / 60);
  if (minutos < 60) return minutos === 1 ? '1 minuto' : `${minutos} minutos`;
  const horas = Math.ceil(minutos / 60);
  return horas === 1 ? '1 hora' : `${horas} horas`;
}

