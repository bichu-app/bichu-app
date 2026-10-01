/**
 * Massa do duble, tipada pelos schemas do contrato: se o contrato muda de
 * forma, isto deixa de compilar. Lugares e nomes sao ficticios ou publicos.
 */
import type { Encontro, Pedido } from '../dominio/tipos.ts';

const UUID = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;

export function encontroDeExemplo(sobrescrever: Partial<Encontro> = {}): Encontro {
  return {
    slug: 'encontro-de-caes-no-parque',
    title: 'Encontro de cães no parque',
    summary: 'Encontro aberto para cães de todos os portes. Leve água.',
    place: {
      place_name: 'Parque da Aclimação',
      neighborhood: 'Aclimação',
      city: 'São Paulo',
      state: 'SP',
      point: { lat: -23.5731, lon: -46.6293 },
    },
    starts_at: '2026-10-11T12:00:00Z',
    ends_at: '2026-10-11T14:00:00Z',
    time_zone: 'America/Sao_Paulo',
    images: [
      { source: 'uploaded', status: 'ready', url: null, rejection_reason: null, upload_id: UUID(1), position: 0, alt_text: 'Cães correndo no gramado do parque' },
    ],
    accepted_sizes: ['P', 'M', 'G', 'GG'],
    dog_age: 'any',
    vaccination_required: true,
    fenced_off_leash_area: true,
    amenities: ['level_ground_or_ramp', 'shade', 'dog_water_fountain'],
    origin: 'admin',
    visibility: 'public',
    admission: { kind: 'free', price: null },
    bring_items: ['water', 'water_bowl', 'poop_bags', 'leash'],
    notes: 'Ponto de encontro ao lado do lago.',
    street_address: null,
    pending_request_count: 0,
    publication_status: 'published',
    timing: 'upcoming',
    published_at: '2026-09-20T13:00:00Z',
    cancelled_at: null,
    cancellation_note: null,
    created_at: '2026-09-20T13:00:00Z',
    updated_at: '2026-09-20T13:00:00Z',
    version: 1,
    ...sobrescrever,
  };
}

export function encontrosDeExemplo(): Encontro[] {
  return [
    encontroDeExemplo(),
    encontroDeExemplo({
      slug: 'k3Jx9QpL2mZt7VwR4cYb',
      title: 'Socialização para filhotes',
      summary: 'Para filhotes com a vacinação em dia.',
      place: { place_name: 'Praça Benedito Calixto', neighborhood: 'Pinheiros', city: 'São Paulo', state: 'SP', point: { lat: -23.5586, lon: -46.6814 } },
      starts_at: '2026-10-04T13:00:00Z',
      ends_at: '2026-10-04T15:00:00Z',
      images: [],
      accepted_sizes: ['P'],
      dog_age: 'up_to_1_year',
      fenced_off_leash_area: false,
      amenities: ['shade', 'benches'],
      visibility: 'private',
      admission: { kind: 'paid', price: { amount: 3000, currency: 'BRL', unit: 'per_dog' } },
      bring_items: ['water', 'vaccination_card', 'poop_bags'],
      notes: 'Até 10 filhotes por turma.',
      pending_request_count: 3,
      updated_at: '2026-09-22T19:20:00Z',
    }),
    encontroDeExemplo({
      slug: 'caminhada-de-fim-de-tarde',
      title: 'Caminhada de fim de tarde',
      summary: 'Volta tranquila pela praça, ritmo de passeio.',
      place: { place_name: 'Praça Buenos Aires', neighborhood: 'Higienópolis', city: 'São Paulo', state: 'SP', point: null },
      starts_at: '2026-09-28T20:00:00Z',
      ends_at: null,
      images: [],
      notes: null,
      timing: 'happening',
      updated_at: '2026-09-21T10:00:00Z',
    }),
    encontroDeExemplo({
      slug: 'piquenique-dos-vira-latas',
      title: 'Piquenique dos vira-latas',
      summary: 'Tragam toalha e petisco para dividir.',
      place: { place_name: 'Praça do Pôr do Sol', neighborhood: 'Alto de Pinheiros', city: 'São Paulo', state: 'SP', point: { lat: -23.5513, lon: -46.7139 } },
      starts_at: '2026-09-14T19:00:00Z',
      ends_at: '2026-09-14T21:00:00Z',
      images: [],
      timing: 'ended',
      updated_at: '2026-09-15T09:00:00Z',
    }),
  ];
}

export function pedidosDeExemplo(evento: Pick<Encontro, 'slug' | 'title' | 'starts_at' | 'time_zone'>): Pedido[] {
  const ev = { slug: evento.slug, title: evento.title, starts_at: evento.starts_at, time_zone: evento.time_zone };
  const p = (ref: string, nome: string | null, desde: string, validada: boolean, status: Pedido['status'], em: string): Pedido => ({
    ref,
    event: ev,
    requester: { display_name: nome, member_since: desde, email_verified: validada },
    status,
    requested_at: em,
    decided_at: status === 'pending' ? null : '2026-09-23T12:00:00Z',
    withdrawn_at: null,
  });
  return [
    p('rq_Carla_0001aaaaaaaaaaaa', 'Carla M.', '2026-03', true, 'pending', '2026-09-21T17:32:00Z'),
    p('rq_Joao_0002bbbbbbbbbbbbb', 'João Pedro', '2025-07', false, 'pending', '2026-09-21T21:05:00Z'),
    p('rq_SemNome_0003cccccccccc', null, '2026-09', true, 'pending', '2026-09-22T12:10:00Z'),
    p('rq_Rafael_0004dddddddddd', 'Rafael T.', '2026-01', true, 'approved', '2026-09-19T14:40:00Z'),
    p('rq_Marcos_0005eeeeeeeeee', 'Marcos V.', '2026-08', true, 'declined', '2026-09-20T10:55:00Z'),
  ];
}
