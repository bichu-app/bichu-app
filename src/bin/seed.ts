/**
 * Massa fixa de qa.
 *
 * O QUE ESTE ARQUIVO FAZ: confere que da para semear, recusa dizendo o que
 * falta, e grava a massa do diretorio de `Perto`.
 *
 * ## As tres travas, e por que nenhuma delas e zelo
 *
 * 1. **Ambiente.** Semear e destrutivo por natureza: a massa fixa so e fixa se
 *    sobrescreve o que estava la. A recusa vem ANTES de abrir conexao, porque
 *    conectar em producao para so entao decidir nao escrever e confiar na ordem
 *    das linhas. `conferirAmbiente` esta separada e exportada por um motivo:
 *    trava sem teste e trava por confianca, e esta estava a 0% de cobertura --
 *    `seed.test.ts` agora a exerce nos dois sentidos.
 * 2. **Esquema.** Semear antes de migrar produz erro de relacao inexistente no
 *    meio das insercoes, com parte da massa gravada.
 * 3. **Determinismo.** `make seed` recria "a massa fixa de qa, deterministica".
 *    Nenhum `Math.random()`, nenhum `now()`: todo identificador e todo instante
 *    vem de `massa-do-diretorio.ts`, literais. Massa que muda faz o mesmo teste
 *    passar hoje e falhar amanha, e a investigacao comeca pelo teste, que esta
 *    certo.
 *
 * ## O que ela semeia, e o que continua sem massa
 *
 * Semeia o **diretorio**: contas titulares, entradas de `professionals` e as
 * verificacoes de `entity_verifications` que sustentam o selo de cada uma. Foi
 * o que o cliente pediu para ver na tela.
 *
 * NAO semeia conta de tutor, pet nem caso de perdido. Quais sao essas e decisao
 * de QA com produto, e massa inventada aqui vira a massa oficial por inercia --
 * no dia em que o teste de aceite precisar de um pet perdido ha 8 dias, ninguem
 * vai saber se o que existe foi pensado ou foi o que sobrou.
 *
 * ## `verification_level` e escrito aqui, e e derivado
 *
 * A coluna e cache de uma regra que mora no dominio (`nivelDerivado`). A massa a
 * preenche CHAMANDO a regra sobre as verificacoes que ela mesma grava, e nunca
 * escolhendo o valor a mao: uma massa que declara o proprio nivel semearia
 * exatamente a incoerencia que a leitura existe para nao ter. A rota, de todo
 * modo, nao le esta coluna -- ela deriva de novo, da fonte.
 */
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

/**
 * Tabelas que a massa precisa encontrar. Semear antes de migrar produz erro de
 * relacao inexistente no meio das insercoes, com parte da massa gravada.
 */
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

/**
 * Os ambientes em que semear e PERDA DE DADO, e nao recriacao de massa.
 *
 * Lista de PROIBIDOS e o arranjo errado aqui, e por isso a funcao abaixo nao
 * usa uma: um ambiente novo que ninguem lembrou de listar cairia no caso
 * padrao, que seria semear. A pergunta certa e a inversa -- **e `dev` ou
 * `test`?** --, e qualquer outra coisa recusa.
 */
export const AMBIENTES_QUE_ACEITAM_MASSA: ReadonlySet<string> = new Set(['dev', 'test', 'ci']);

export class AmbienteRecusado extends Error {}

/**
 * A trava de ambiente, separada para poder ser exercida sem banco.
 *
 * Duas condicoes independentes, e as duas precisam existir: `NODE_ENV` e o que
 * o Node conhece e o que uma imagem de producao carrega por padrao; `ENVIRONMENT`
 * e o que este projeto usa para distinguir `preprod` de `prod`. Uma so deixaria
 * passar o caso em que a outra esta certa.
 */
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

/**
 * Apaga a massa ANTERIOR, e so ela.
 *
 * Pelos identificadores que este arquivo conhece, e nao por `truncate`: a massa
 * fixa convive com o que quem desenvolve criou a mao, e varrer a tabela inteira
 * apagaria o trabalho de alguem sem avisar. Determinismo nao exige terra
 * arrasada; exige que o resultado seja o mesmo.
 */
async function limparMassaAnterior(db: Db): Promise<void> {
  const entradas = MASSA_DO_DIRETORIO.map((uma) => uma.id);
  const titulares = MASSA_DO_DIRETORIO.map((uma) => uma.titularId);
  await sql`delete from entity_verifications where entity_id = any(${sql.val(entradas)}::uuid[])`.execute(db);
  await sql`delete from professionals where id = any(${sql.val(entradas)}::uuid[])`.execute(db);
  await sql`delete from users where id = any(${sql.val(titulares)}::uuid[])`.execute(db);

  // A vitrine. Os itens saem antes dos parceiros por causa da chave
  // estrangeira, e a versao por ultimo porque nada depende dela.
  const itens = MASSA_DA_VITRINE.map((um) => um.slug);
  const parceiros = PARCEIROS_DA_VITRINE.map((um) => um.slug);
  await sql`delete from store_items where slug = any(${sql.val(itens)}::text[])`.execute(db);
  await sql`delete from store_partners where slug = any(${sql.val(parceiros)}::text[])`.execute(db);
  await sql`delete from store_catalog_versions where version = ${VERSAO_DA_VITRINE}`.execute(db);

  // A `Rede`. So os encontros da massa, pelo `slug`, que e o identificador que
  // ESTE arquivo conhece: o `id` e gerado a cada semeadura. Nunca `truncate` --
  // a massa fixa convive com o que quem desenvolve criou a mao.
  const encontros = MASSA_DA_REDE.map((um) => um.slug);
  await sql`delete from network_events where slug = any(${sql.val(encontros)}::text[])`.execute(db);
}

/**
 * A data de consulta de um preco, a partir do deslocamento em dias.
 *
 * Calculada e nao literal, e o cabecalho de `massa-da-vitrine.ts` diz por que:
 * com datas literais a massa inteira vence sozinha em trinta dias e a vitrine
 * de QA passa a mostrar "preco nao confirmado" nos dez itens. O que precisa
 * ser preservado e a RELACAO -- um vencido, um no limite, os outros vigentes.
 *
 * Em UTC, porque `price_checked_at` e data pura: montar a partir do fuso local
 * faria a data virar o dia anterior em fuso negativo, aproximando o vencimento
 * em silencio.
 */
export function dataDaConsulta(diasAtras: number, hoje: Date): string {
  const base = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  const alvo = new Date(base - diasAtras * 86_400_000);
  const ano = String(alvo.getUTCFullYear()).padStart(4, '0');
  const mes = String(alvo.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(alvo.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/** Grava a vitrine da `Loja`. Idempotente pelo `limparMassaAnterior`. */
export async function semearVitrine(db: Db, hoje: Date): Promise<void> {
  await sql`
    insert into store_catalog_versions (version, is_current)
    values (${VERSAO_DA_VITRINE}, true)
  `.execute(db);

  // A identidade interna e gerada AQUI, e de proposito nao esta na massa
  // (ADR-0024). A massa descreve o catalogo -- o que a tela mostra --, e o `id`
  // nao e catalogo: ele nunca sai em resposta. Gerar na hora tambem prova a
  // decisao pelo caminho mais curto: se alguma consulta, algum teste ou algum
  // campo de contrato dependesse do valor do `id`, esta semeadura quebraria a
  // cada execucao. Ela nao quebra.
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
    // Os tres campos de preco andam juntos: o CHECK
    // `store_items_preco_anda_completo` recusa qualquer combinacao parcial, e
    // e ele que garante que "preco sem data" nao exista nem por engano.
    const data = item.precoConsultadoHaDias === null
      ? null
      : dataDaConsulta(item.precoConsultadoHaDias, hoje);
    const partnerId = idDoParceiro.get(item.partnerSlug);
    if (partnerId === undefined) {
      // Massa que aponta para parceiro inexistente precisa PARAR a semeadura,
      // e nao seguir sem o item: um `continue` aqui produziria uma vitrine
      // menor do que a massa declara, e o teste que conta itens acusaria o
      // sintoma sem nomear a causa.
      throw new Error(
        `o item '${item.slug}' aponta para o parceiro '${item.partnerSlug}', que nao esta em PARCEIROS_DA_VITRINE`,
      );
    }
    await sql`
      insert into store_items (
        id, slug, partner_id, title, summary, category, image_path, target_path,
        price_amount, price_currency, price_checked_at, active, sort_order
      ) values (
        ${ids.uuidv7()}::uuid, ${item.slug}, ${partnerId}::uuid, ${item.title}, ${item.summary},
        ${item.category}, ${item.imagePath}, ${item.targetPath},
        ${item.priceAmount}, ${item.priceAmount === null ? null : 'BRL'},
        ${data}::date, ${item.active}, ${item.sortOrder}
      )
    `.execute(db);
  }
}

/**
 * Grava os encontros da `Rede`. Idempotente pelo `limparMassaAnterior`.
 *
 * ## O INSTANTE E MONTADO PELO POSTGRES, e nao aqui
 *
 * `massa-da-rede.ts` produz o TEXTO da hora de parede e o nome IANA da zona em
 * que esse texto deve ser lido; quem resolve o deslocamento e o
 * `::timestamp AT TIME ZONE` abaixo. Somar `-03:00` a mao seria reimplementar
 * horario de verao.
 *
 * ## O ponto entra por SQL, e a ORDEM E (lon, lat)
 *
 * `ST_MakePoint(x, y)` e `(longitude, latitude)`, ao contrario de como as
 * pessoas escrevem. A massa guarda `{ lat, lon }` com nome, e a troca acontece
 * so aqui, a vista. `geo_source` anda junto por `CHECK`.
 *
 * ## Publicacao
 *
 * `origin = 'admin'` e `published_at` preenchido em todo encontro publicado
 * (ADR-0027 12.8). O retirado tambem foi publicado antes de sair, entao ele
 * tambem tem `published_at`.
 */
export async function semearRede(db: Db, hoje: Date): Promise<void> {
  // A identidade interna e gerada AQUI, e de proposito nao esta na massa
  // (ADR-0024): o `id` nao e catalogo, ele nunca sai em resposta. Gerar na hora
  // prova a decisao pelo caminho mais curto: se alguma consulta dependesse do
  // valor do `id`, esta semeadura quebraria a cada execucao.
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

/**
 * O ponto entra por SQL, e a ORDEM E (lon, lat).
 *
 * `ST_MakePoint` recebe X antes de Y, e trocar os dois e o erro classico do
 * PostGIS: ele nao falha, ele grava o Brasil no meio da Somalia. A massa guarda
 * o par ja nessa ordem, e o teste de integracao mede a distancia de volta -- que
 * e a unica forma de a troca aparecer.
 */
function pontoDaEntrada(entrada: EntradaSemeada) {
  if (entrada.ponto === null) return sql`null`;
  const [lon, lat] = entrada.ponto;
  return sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography`;
}

/**
 * Grava a massa. **Exportada** para que a suite de integracao a rode contra o
 * Postgres efemero: uma massa que ninguem executa e uma massa que se descobre
 * quebrada no dia da demonstracao, contra um CHECK que o teste unitario nao
 * tem como conhecer.
 */
export async function semear(db: Db, hoje: Date = new Date()): Promise<void> {
  await limparMassaAnterior(db);
  await semearVitrine(db, hoje);
  await semearRede(db, hoje);

  for (const entrada of MASSA_DO_DIRETORIO) {
    await sql`
      insert into users (id, email, display_name, email_verified_at, created_at, updated_at)
      values (${entrada.titularId}::uuid, ${entrada.titularEmail}, ${entrada.displayName},
              ${MOMENTO_DA_MASSA}::timestamptz, ${MOMENTO_DA_MASSA}::timestamptz,
              ${MOMENTO_DA_MASSA}::timestamptz)
    `.execute(db);

    // `claim_status = 'claimed'` com `claimed_at` preenchido: o CHECK
    // `professionals_titularidade_tem_marco` exige o marco, e o
    // `professionals_aceite_antes_do_perfil` exige que `self` e `invited` nunca
    // estejam sem titular. A massa e de perfis ACEITOS, que e a regra da emenda
    // 1 -- nenhum perfil nasce sem o aceite de quem ele descreve.
    await sql`
      insert into professionals (
        id, kind, display_name, about, city, state, neighborhood, geo,
        source, claim_status, claimed_by_user_id, claimed_at,
        verification_level, crmv_number, crmv_uf, cnpj, phone_e164,
        slug, status, published_at, created_at, updated_at
      ) values (
        ${entrada.id}::uuid, ${entrada.kind}, ${entrada.displayName}, ${entrada.about},
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

/** O nivel sai da REGRA, sobre as verificacoes da propria entrada. Ver o cabecalho. */
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
