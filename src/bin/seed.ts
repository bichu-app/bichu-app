/** Massa fixa de qa. */
import { sql } from 'kysely';
import { optionalEnv, requireEnv } from '../shared/config/env.js';
import { createDb } from '../shared/db/pool.js';
import type { Db } from '../shared/db/pool.js';
import { criarIdGenerator } from '../shared/id/uuidv7.js';
import { nivelDerivado } from '../modules/professionals/domain/nivel-de-verificacao.js';
import {
  MASSA_DO_DIRETORIO,
  MOMENTO_DA_MASSA,
  PUBLICADAS,
  type EntradaSemeada,
} from './massa-do-diretorio.js';
import {
  ITENS_VISIVEIS,
  MASSA_DA_VITRINE,
  PARCEIROS_DA_VITRINE,
  VERSAO_DA_VITRINE,
} from './massa-da-vitrine.js';
import {
  ENCONTROS_COM_PONTO,
  ENCONTROS_PRIVADOS,
  ENCONTROS_VISIVEIS,
  MASSA_DA_REDE,
  MOMENTO_DA_REDE,
  camposDe,
  momentoDoEncontro,
} from './massa-da-rede.js';

/** Sai 2, e nao 1: separa "recusei" de "quebrei" para quem le em esteira. */
const SAIDA_MASSA_NAO_DEFINIDA = 2;

/** Tabelas que a massa precisa encontrar. */
const TABELAS_EXIGIDAS = [
  'users',
  'user_identities',
  'pets',
  'professionals',
  'entity_verifications',
  'store_catalog_versions',
  'store_partners',
  'store_items',
  'network_events',
] as const;

/** Os ambientes em que semear e PERDA DE DADO, e nao recriacao de massa. */
export const AMBIENTES_QUE_ACEITAM_MASSA: ReadonlySet<string> = new Set(['dev', 'test', 'ci']);

export class AmbienteRecusado extends Error {}

/** A trava de ambiente, separada para poder ser exercida sem banco. */
export function conferirAmbiente(env: {
  NODE_ENV?: string | undefined;
  ENVIRONMENT?: string | undefined;
}): void {
  if (env.NODE_ENV === 'production') {
    throw new AmbienteRecusado(
      "recusado: NODE_ENV='production'. A massa fixa sobrescreve dado, e dado de producao nao e descartavel.",
    );
  }
  const ambiente = env.ENVIRONMENT ?? 'dev';
  if (!AMBIENTES_QUE_ACEITAM_MASSA.has(ambiente)) {
    throw new AmbienteRecusado(
      `recusado: semear em ambiente '${ambiente}'. A massa fixa sobrescreve dado, ` +
        `e so ${[...AMBIENTES_QUE_ACEITAM_MASSA].join(', ')} sao descartaveis.`,
    );
  }
}

async function conferirEsquema(db: Db): Promise<void> {
  const resultado = await sql<{ tabela: string }>`
    select table_name as tabela
      from information_schema.tables
     where table_schema = 'public'
       and table_name = any(${sql.val([...TABELAS_EXIGIDAS])})
  `.execute(db);

  const presentes = new Set(resultado.rows.map((linha) => linha.tabela));
  const ausentes = TABELAS_EXIGIDAS.filter((tabela) => !presentes.has(tabela));
  if (ausentes.length > 0) {
    throw new Error(
      `banco sem esquema: faltam ${ausentes.join(', ')}. ` +
        'Rode `make migrar` (ou `make reset` para provar a migracao em banco vazio) antes de semear.',
    );
  }
}

/** Apaga a massa ANTERIOR, e so ela. */
async function limparMassaAnterior(db: Db): Promise<void> {
  const entradas = MASSA_DO_DIRETORIO.map((uma) => uma.id);
  const titulares = MASSA_DO_DIRETORIO.map((uma) => uma.titularId);
  await sql`delete from entity_verifications where entity_id = any(${sql.val(entradas)}::uuid[])`.execute(db);
  await sql`delete from professionals where id = any(${sql.val(entradas)}::uuid[])`.execute(db);
  await sql`delete from users where id = any(${sql.val(titulares)}::uuid[])`.execute(db);

  const itens = MASSA_DA_VITRINE.map((um) => um.slug);
  const parceiros = PARCEIROS_DA_VITRINE.map((um) => um.slug);
  await sql`delete from store_items where slug = any(${sql.val(itens)}::text[])`.execute(db);
  await sql`delete from store_partners where slug = any(${sql.val(parceiros)}::text[])`.execute(db);
  await sql`delete from store_catalog_versions where version = ${VERSAO_DA_VITRINE}`.execute(db);

  const encontros = MASSA_DA_REDE.map((um) => um.slug);
  await sql`delete from network_events where slug = any(${sql.val(encontros)}::text[])`.execute(db);
}

/** A data de consulta de um preco, a partir do deslocamento em dias. */
export function dataDaConsulta(diasAtras: number, hoje: Date): string {
  const base = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  const alvo = new Date(base - diasAtras * 86_400_000);
  const ano = String(alvo.getUTCFullYear()).padStart(4, '0');
  const mes = String(alvo.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(alvo.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/** Grava a vitrine da `Loja`. */
export async function semearVitrine(db: Db, hoje: Date): Promise<void> {
  await sql`
    insert into store_catalog_versions (version, is_current)
    values (${VERSAO_DA_VITRINE}, true)
  `.execute(db);

  const ids = criarIdGenerator(() => Date.now());
  const idDoParceiro = new Map<string, string>();

  for (const parceiro of PARCEIROS_DA_VITRINE) {
    const id = ids.uuidv7();
    idDoParceiro.set(parceiro.slug, id);
    await sql`
      insert into store_partners (id, slug, name, host, active, sort_order)
      values (${id}::uuid, ${parceiro.slug}, ${parceiro.name}, ${parceiro.host},
              ${parceiro.active}, ${parceiro.sortOrder})
    `.execute(db);
  }

  for (const item of MASSA_DA_VITRINE) {
    const data = item.precoConsultadoHaDias === null
      ? null
      : dataDaConsulta(item.precoConsultadoHaDias, hoje);
    const partnerId = idDoParceiro.get(item.partnerSlug);
    if (partnerId === undefined) {
      throw new Error(
        `o item '${item.slug}' aponta para o parceiro '${item.partnerSlug}', que nao esta em PARCEIROS_DA_VITRINE`,
      );
    }
    await sql`
      insert into store_items (
        id, slug, partner_id, title, summary, category, image_path, target_path,
        price_amount, price_currency, price_checked_at, active, sort_order, published_at
      ) values (
        ${ids.uuidv7()}::uuid, ${item.slug}, ${partnerId}::uuid, ${item.title}, ${item.summary},
        ${item.category}, ${item.imagePath}, ${item.targetPath},
        ${item.priceAmount}, ${item.priceAmount === null ? null : 'BRL'},
        ${data}::date, ${item.active}, ${item.sortOrder}, ${hoje}::timestamptz
      )
    `.execute(db);
  }
}

/** Grava os encontros da `Rede`. */
export async function semearRede(db: Db, hoje: Date): Promise<void> {
  const ids = criarIdGenerator(() => Date.now());

  for (const encontro of MASSA_DA_REDE) {
    const momento = momentoDoEncontro(encontro, hoje);
    const campos = camposDe(encontro);
    const id = ids.uuidv7();
    const ponto =
      encontro.ponto === null
        ? sql`null`
        : sql`ST_SetSRID(ST_MakePoint(${encontro.ponto.lon}, ${encontro.ponto.lat}), 4326)::geography`;
    const origemDoPonto = encontro.ponto === null ? null : 'map_pin';
    const pago = campos.admission;
    await sql`
      insert into network_events (
        id, slug, title, summary, place_name, neighborhood, city, state,
        geo, geo_source, starts_at, ends_at, time_zone,
        origin, publication_status, published_at,
        visibility, admission_kind, admission_amount, admission_currency, admission_unit,
        dog_age, vaccination_required, fenced_off_leash_area, notes
      ) values (
        ${id}::uuid, ${encontro.slug}, ${encontro.title}, ${encontro.summary},
        ${encontro.placeName}, ${encontro.neighborhood}, ${encontro.city}, ${encontro.state},
        ${ponto}, ${origemDoPonto},
        ${momento.inicioLocal}::timestamp at time zone ${momento.zonaDeLeitura},
        ${momento.fimLocal}::timestamp at time zone ${momento.zonaDeLeitura},
        ${encontro.timeZone},
        'admin', ${encontro.publicationStatus}, ${MOMENTO_DA_REDE}::timestamptz,
        ${campos.visibility}, ${pago === null ? 'free' : 'paid'},
        ${pago === null ? null : pago.centavos}, ${pago === null ? null : 'BRL'},
        ${pago === null ? null : pago.unidade},
        ${campos.idade}, ${campos.vacinacao}, ${campos.areaCercada}, ${campos.observacoes}
      )
    `.execute(db);
    for (const porte of campos.portes) {
      await sql`insert into network_event_sizes (event_id, size) values (${id}::uuid, ${porte})`.execute(db);
    }
    for (const item of campos.estrutura) {
      await sql`insert into network_event_amenities (event_id, amenity) values (${id}::uuid, ${item})`.execute(db);
    }
    for (const item of campos.paraLevar) {
      await sql`insert into network_event_bring_items (event_id, item) values (${id}::uuid, ${item})`.execute(db);
    }
  }
}

/** O ponto entra por SQL, e a ORDEM E (lon, lat). */
function pontoDaEntrada(entrada: EntradaSemeada) {
  if (entrada.ponto === null) return sql`null`;
  const [lon, lat] = entrada.ponto;
  return sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography`;
}

/**
 * Grava a massa. **Exportada** para que a suite de integracao a rode contra o
 * Postgres efemero: uma massa que ninguem executa e uma massa que se descobre
 * quebrada no dia da demonstracao, contra um CHECK que o teste unitario nao tem
 * como conhecer.
 */
export async function semear(db: Db, hoje: Date = new Date()): Promise<void> {
  await limparMassaAnterior(db);
  await semearVitrine(db, hoje);
  await semearRede(db, hoje);

  for (const entrada of MASSA_DO_DIRETORIO) {
    await sql`
      insert into users (id, email, display_name, public_ref,
                         email_verified_at, created_at, updated_at)
      values (${entrada.titularId}::uuid, ${entrada.titularEmail}, ${entrada.displayName},
              ${entrada.titularPublicRef},
              ${MOMENTO_DA_MASSA}::timestamptz, ${MOMENTO_DA_MASSA}::timestamptz,
              ${MOMENTO_DA_MASSA}::timestamptz)
    `.execute(db);

    await sql`
      insert into professionals (
        id, kinds, display_name, about, city, state, neighborhood, geo,
        source, claim_status, claimed_by_user_id, claimed_at,
        verification_level, crmv_number, crmv_uf, cnpj, phone_e164,
        slug, status, published_at, created_at, updated_at
      ) values (
        -- ARRAY[kind]: a coluna e uma LISTA desde a migracao 20261020000015, e a
        -- massa continua declarando UMA atividade por entrada. A conversao e aqui
        -- e nao na massa de proposito: mudar a massa mudaria o que a QA confere, e
        -- o que o cliente pediu foi a capacidade de ter varias, nao massa nova.
        -- (Sem acento grave neste comentario: ele vive dentro de um template
        -- literal de TypeScript, e um acento grave aqui o encerraria.)
        ${entrada.id}::uuid, ARRAY[${entrada.kind}], ${entrada.displayName}, ${entrada.about},
        ${entrada.city}, ${entrada.state}, ${entrada.neighborhood}, ${pontoDaEntrada(entrada)},
        'self', 'claimed', ${entrada.titularId}::uuid, ${MOMENTO_DA_MASSA}::timestamptz,
        ${nivelDaEntrada(entrada)}, ${entrada.crmvNumber}, ${entrada.crmvUf},
        ${entrada.cnpj}, ${entrada.phoneE164},
        ${entrada.slug}, ${entrada.status},
        ${entrada.status === 'published' ? MOMENTO_DA_MASSA : null}::timestamptz,
        ${MOMENTO_DA_MASSA}::timestamptz, ${MOMENTO_DA_MASSA}::timestamptz
      )
    `.execute(db);

    for (const verificacao of entrada.verificacoes) {
      await sql`
        insert into entity_verifications (
          id, entity_kind, entity_id, claimant_user_id, evidence_kind,
          submitted_at, decision, reviewed_at, created_at
        ) values (
          ${verificacao.id}::uuid, 'professional', ${entrada.id}::uuid,
          ${entrada.titularId}::uuid, ${verificacao.evidenceKind},
          ${MOMENTO_DA_MASSA}::timestamptz,
          ${verificacao.aprovada ? 'approved' : 'pending'},
          ${verificacao.aprovada ? MOMENTO_DA_MASSA : null}::timestamptz,
          ${MOMENTO_DA_MASSA}::timestamptz
        )
      `.execute(db);
    }
  }
}

/** O nivel sai da REGRA, sobre as verificacoes da propria entrada. */
export function nivelDaEntrada(entrada: EntradaSemeada): string {
  return nivelDerivado(
    entrada.verificacoes.map((uma) => ({
      evidenceKind: uma.evidenceKind,
      decision: uma.aprovada ? 'approved' : 'pending',
    })),
  );
}

export async function main(): Promise<void> {
  conferirAmbiente({
    ...(process.env['NODE_ENV'] === undefined ? {} : { NODE_ENV: process.env['NODE_ENV'] }),
    ...(optionalEnv('ENVIRONMENT') === undefined
      ? {}
      : { ENVIRONMENT: optionalEnv('ENVIRONMENT') }),
  });

  const banco = createDb(requireEnv('DATABASE_URL'));
  try {
    await conferirEsquema(banco.db);
    await semear(banco.db);
  } finally {
    await banco.close();
  }

  console.error(
    [
      `massa do diretorio semeada: ${String(MASSA_DO_DIRETORIO.length)} entradas, ` +
        `${String(PUBLICADAS.length)} publicadas.`,
      `massa da vitrine semeada: ${String(MASSA_DA_VITRINE.length)} itens, ` +
        `${String(ITENS_VISIVEIS.length)} visiveis, ` +
        `${String(PARCEIROS_DA_VITRINE.length)} parceiros.`,
      `massa da Rede semeada: ${String(MASSA_DA_REDE.length)} encontros, ` +
        `${String(ENCONTROS_VISIVEIS.length)} visiveis, ` +
        `${String(ENCONTROS_COM_PONTO.length)} com ponto no mapa, ` +
        `${String(ENCONTROS_PRIVADOS.length)} privados.`,
      '',
      'As duas nao publicadas (um rascunho e um oculto) existem de proposito: sao o',
      'que da o que medir a isca do filtro de `status`. Na Rede o equivalente e o',
      'encontro retirado, e ele e FUTURO: no passado, `when=upcoming` o esconderia',
      'sozinho e o filtro de `publication_status` continuaria sem ser exercido.',
      '',
      'AINDA SEM MASSA: conta de tutor, pet e caso de perdido. Quais sao essas e',
      'decisao de QA com produto, nao de quem escreveu o comando.',
    ].join('\n'),
  );
}

if (optionalEnv('BICHU_SUPRESS_AUTOSTART') === undefined) {
  const invocadoDiretamente =
    process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
  if (invocadoDiretamente) {
    main().catch((erro: unknown) => {
      console.error(erro);
      process.exit(erro instanceof AmbienteRecusado ? SAIDA_MASSA_NAO_DEFINIDA : 1);
    });
  }
}
