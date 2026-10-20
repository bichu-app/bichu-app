#!/usr/bin/env node
/* global console, process, URL */
/**
 * A PROVA da remocao, em Postgres descartavel. Nao toca homologacao.
 *
 *   DATABASE_URL=postgres://...<banco descartavel> \
 *     node infra/massa-de-homologacao/prova-da-remocao.mjs
 *
 * ===========================================================================
 * O QUE ESTA PROVA AFIRMA, E O QUE ELA NAO AFIRMA
 * ===========================================================================
 * AFIRMA tres coisas sobre `remover.mjs`:
 *   1. que ele apaga TODA linha da massa listada no manifesto;
 *   2. que ele nao apaga NENHUMA linha de fora -- medido contando, antes e
 *      depois, as linhas que nao estao no manifesto, em 53 tabelas;
 *   3. que ele RECUSA, sem apagar nada, quando existe linha de fora ligada a
 *      massa (bloqueio, conexao ou denuncia de terceiro).
 *
 * NAO afirma nada sobre `criar.mjs`: aqui a massa entra por `INSERT` direto,
 * porque nao ha API subindo contra este banco. O que esta sob prova e a
 * REMOCAO, e ela le um manifesto -- a procedencia das linhas e irrelevante
 * para ela. O que precisa ser identico, e e, sao as FORMAS das linhas e as
 * chaves estrangeiras entre elas, porque e delas que vem a cascata.
 *
 * ===========================================================================
 * O DADO DE FORA IMITA HOMOLOGACAO, MEDIDA A MEDIDA
 * ===========================================================================
 * As contagens de "fora" abaixo sao as que eu LI em homologacao em 19/10/2026,
 * antes de subir massa nenhuma. Nao sao numeros redondos escolhidos por mim:
 * se a prova rodasse contra um banco vazio, ela nao mediria o unico risco que
 * importa, que e o dado de teste manual do cliente sair junto.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from 'pg';

import { MARCA_DE_HOMOLOGACAO } from './criar.mjs';
import {
  DOMINIO_INVALIDO,
  LOTE,
  MARCA_VISIVEL,
  PARCEIRO,
  PETS_DA_VITRINE,
  PLAQUINHAS_POR_PET,
  PREFIXO_ESTRUTURAL,
  QUANTIDADE,
  contas,
  coordenadaDe,
  encontros,
  itensDaLoja,
  pets,
  profissionais,
  temCoordenada,
} from './massa.mjs';

/** O que homologacao tinha em 19/10/2026, antes da massa. Medido. */
const FORA_COMO_EM_HOMOLOGACAO = {
  users: 12, pets: 7, network_events: 13, professionals: 1, store_items: 1,
  store_partners: 4, conversations: 3, conversation_messages: 6,
  found_reports: 7, lost_cases: 1, pet_tags: 4, handles: 52,
  // Fotos dele: 4 linhas em `pet_photos` em 19/10, cada uma com 3 objetos.
  pet_photos_dele: 4,
};

function refPublica() {
  // O mesmo formato de `users.public_ref`: 22 caracteres base64url. A coluna e
  // NOT NULL SEM DEFAULT (migracao 20261018000031) e a producao a preenche em
  // `kysely-identity-repository.ts`. `INSERT` que a esqueca reprova com 23502.
  return randomBytes(16).toString('base64url').slice(0, 22);
}

const ESPECIES = ['dog', 'cat', 'other'];
const PORTES = ['P', 'M', 'G', 'GG'];

/**
 * Cria uma conta por `INSERT`, na unica ordem que satisfaz os tres vinculos.
 *
 * `users.handle` referencia `handles.handle` e `handles.user_id` referencia
 * `users.id`: o par e circular. E `handles_pessoa_tem_dono` proibe
 * `kind = 'pessoa'` sem dono, entao nao da para criar o apelido primeiro.
 * A ordem e: conta sem apelido, apelido com dono, conta aponta para o apelido.
 */
async function criarConta(cliente, { email, displayName, handle, birthDate }) {
  const id = randomUUID();
  await cliente.query(
    `insert into users (id, email, display_name, public_ref, birth_date,
                        accepted_terms_version, accepted_terms_at,
                        email_verified_at, created_at, updated_at)
     values ($1, $2, $3, $4, $5, '2026-09-17', now(), now(), now(), now())`,
    [id, email, displayName, refPublica(), birthDate],
  );
  if (handle !== null) {
    await cliente.query(
      `insert into handles (handle, handle_esqueleto, kind, user_id)
       values ($1, '', 'pessoa', $2)`,
      [handle, id],
    );
    await cliente.query('update users set handle = $1 where id = $2', [handle, id]);
  }
  const identidade = randomUUID();
  await cliente.query(
    `insert into user_identities (id, user_id, provider, provider_subject)
     values ($1, $2, 'local', $3)`,
    [identidade, id, email],
  );
  await cliente.query(
    `insert into local_credentials (identity_id, password_phc)
     values ($1, '$pbkdf2-sha512$i=210000,l=64$aaaa$bbbb')`,
    [identidade],
  );
  return id;
}

async function criarPet(cliente, dono, nome, i) {
  const id = randomUUID();
  await cliente.query(
    `insert into pets (id, owner_user_id, name, species_code, size_code, sex,
                       created_at, updated_at)
     values ($1, $2, $3, $4, $5, 'unknown', now(), now())`,
    [id, dono, nome, ESPECIES[i % 3], PORTES[i % 4]],
  );
  return id;
}

const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function sufixoDeTag() {
  return Array.from({ length: 4 }, () => ALFABETO[Math.floor(Math.random() * ALFABETO.length)]).join('');
}

async function criarPlaquinha(cliente, pet) {
  const id = randomUUID();
  await cliente.query(
    `insert into pet_tags (id, pet_id, code_hash, code_ciphertext, code_suffix)
     values ($1, $2, $3, $4, $5)`,
    [id, pet, randomBytes(32), randomBytes(48), sufixoDeTag()],
  );
  return id;
}

/** Aviso de plaquinha + conversa + duas mensagens, como a rota os cria. */
async function criarAvisoEConversa(cliente, { pet, tag, tutor }) {
  const aviso = randomUUID();
  await cliente.query(
    `insert into found_reports (id, origin, tag_id, pet_id, finder_token_hash,
                               finder_token_expires_at, found_at, created_at)
     values ($1, 'tag_scan', $2, $3, $4, now() + interval '7 days', now(), now())`,
    [aviso, tag, pet, randomBytes(32)],
  );
  const conversa = randomUUID();
  await cliente.query(
    `insert into conversations (id, found_report_id, pet_id, tutor_user_id)
     values ($1, $2, $3, $4)`,
    [conversa, aviso, pet, tutor],
  );
  await cliente.query(
    `insert into conversation_messages (id, conversation_id, sender_role, sender_user_id, body)
     values ($1, $2, 'tutor', $3, $4)`,
    [randomUUID(), conversa, tutor, `${MARCA_VISIVEL} mensagem do tutor`],
  );
  await cliente.query(
    `insert into conversation_messages (id, conversation_id, sender_role, body)
     values ($1, $2, 'finder', $3)`,
    [randomUUID(), conversa, `${MARCA_VISIVEL} mensagem do achador`],
  );
  await cliente.query(
    `insert into conversation_reads (conversation_id, role, last_read_at)
     values ($1, 'tutor', now())`,
    [conversa],
  );
  return { aviso, conversa };
}

/**
 * Foto de pet + a intencao de envio que a sustenta, por `INSERT`.
 *
 * `pet_photos.upload_intent_id` e `ON DELETE RESTRICT`, e e exatamente essa
 * aresta que a ordem de remocao tem de respeitar -- entao a prova precisa
 * dela de pe. As chaves de objeto sao nomes plausiveis: aqui nao ha balde, e
 * o que esta sob prova e a LINHA. Os bytes tem prova propria, contra o
 * armazenamento de verdade (`prova-da-remocao-de-imagem.mjs`).
 */
async function criarFoto(cliente, dono, pet, k) {
  const intencao = randomUUID();
  const original = `pets/${pet}/original/sonda-${String(k)}`;
  await cliente.query(
    `insert into upload_intents (id, user_id, pet_id, kind, object_key, declared_type,
                                 max_bytes, expires_at, confirmed_at)
     values ($1, $2, $3, 'pet_photo', $4, 'image/jpeg', 5242880,
             now() + interval '10 minutes', now())`,
    [intencao, dono, pet, original],
  );
  const foto = randomUUID();
  await cliente.query(
    `insert into pet_photos (id, pet_id, upload_intent_id, status, original_key,
                             thumb_key, card_key, is_primary, processed_at)
     values ($1, $2, $3, 'ready', $4, $5, $6, true, now())`,
    [foto, pet, intencao, original, `pets/thumb/sonda-${String(k)}`, `pets/card/sonda-${String(k)}`],
  );
  return { foto, intencao, objetos: [
    { classe: 'privado', chave: original },
    { classe: 'publico', chave: `pets/thumb/sonda-${String(k)}` },
    { classe: 'publico', chave: `pets/card/sonda-${String(k)}` },
  ] };
}

async function criarCaso(cliente, pet, cidade, k) {
  const id = randomUUID();
  await cliente.query(
    `insert into lost_cases (id, pet_id, owner_user_id, last_seen_at, last_seen_city,
                             last_seen_neighborhood, last_seen_state, share_token)
     values ($1, $2, (select owner_user_id from pets where id = $2),
             now() - ($3 || ' days')::interval, $4, 'Centro', 'SP', $5)`,
    [id, pet, String(k + 1), cidade, randomBytes(16).toString('base64url')],
  );
  // O despacho do alerta, que e o que a remocao tem de tirar antes do caso.
  const despacho = randomUUID();
  await cliente.query(
    `insert into alert_dispatches (id, case_id, radius_m, reach_status,
                                   recipients_total, requested_at, dispatched_at)
     values ($1, $2, 5000, 'computed', 0, now(), now())`,
    [despacho, id],
  );
  return { id, despacho };
}

async function criarEncontro(cliente, autor, { slug, title, summary, place, starts_at, ends_at }) {
  const id = randomUUID();
  await cliente.query(
    `insert into network_events (
       id, slug, title, summary, place_name, neighborhood, city, state,
       starts_at, ends_at, visibility, admission_kind, dog_age,
       origin, created_by_user_id, publication_status, published_at,
       created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'public', 'free', 'any',
             'community', $11, 'published', now(), now(), now())`,
    [id, slug, title, summary, place.place_name, place.neighborhood, place.city,
      place.state, starts_at, ends_at, autor],
  );
  return id;
}

async function principal() {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url === '') throw new Error('DATABASE_URL ausente.');
  const cliente = new Client({ connectionString: url });
  await cliente.connect();
  const pasta = mkdtempSync(join(tmpdir(), 'prova-massa-'));
  const caminhoDoManifesto = join(pasta, 'MANIFESTO.json');

  try {
    // A remocao exige a marca de homologacao. Este banco e descartavel e a
    // ganha aqui, de propria mao -- que e exatamente o ponto da guarda: ela
    // pergunta ao BANCO, e um banco de producao nunca teve ninguem a marcar.
    const { rows: nome } = await cliente.query('select current_database() as b');
    await cliente.query(`comment on database "${nome[0].b}" is '${MARCA_DE_HOMOLOGACAO}'`);

    // ------------------------------------------- 1. o dado DE FORA (dele)
    console.error('--- semeando o dado DE FORA, nas contagens de homologacao ---');
    const deFora = { usuarios: [], pets: [], tags: [], conversas: [], avisos: [], encontros: [] };
    for (let i = 0; i < FORA_COMO_EM_HOMOLOGACAO.users; i += 1) {
      deFora.usuarios.push(await criarConta(cliente, {
        email: `dele${String(i)}@teste-de-fora.example`,
        displayName: `Conta de verdade ${String(i)}`,
        handle: `pessoadefora${String(i).padStart(2, '0')}`,
        birthDate: '1990-05-14',
      }));
    }
    for (let i = 0; i < FORA_COMO_EM_HOMOLOGACAO.pets; i += 1) {
      deFora.pets.push(await criarPet(cliente, deFora.usuarios[i % deFora.usuarios.length], `Pet dele ${String(i)}`, i));
    }
    for (let i = 0; i < FORA_COMO_EM_HOMOLOGACAO.pet_tags; i += 1) {
      deFora.tags.push(await criarPlaquinha(cliente, deFora.pets[i]));
    }
    for (let i = 0; i < FORA_COMO_EM_HOMOLOGACAO.conversations; i += 1) {
      const { rows } = await cliente.query('select owner_user_id from pets where id = $1', [deFora.pets[i]]);
      const par = await criarAvisoEConversa(cliente, {
        pet: deFora.pets[i], tag: deFora.tags[i], tutor: rows[0].owner_user_id,
      });
      deFora.conversas.push(par.conversa);
      deFora.avisos.push(par.aviso);
    }
    // As fotos DELE, e o caso de perdido DELE. Desde o acrescimo de 19/10 a
    // massa TAMBEM escreve nessas duas tabelas, entao elas deixaram de ser
    // "tabelas em que a massa nao mexe" e passaram a ser onde um `DELETE` mal
    // recortado faria o estrago menos visivel.
    for (let i = 0; i < FORA_COMO_EM_HOMOLOGACAO.pet_photos_dele; i += 1) {
      const { rows } = await cliente.query('select owner_user_id from pets where id = $1', [deFora.pets[i]]);
      await criarFoto(cliente, rows[0].owner_user_id, deFora.pets[i], 1000 + i);
    }
    await criarCaso(cliente, deFora.pets[0], 'Sao Paulo', 0);
    for (let i = 0; i < FORA_COMO_EM_HOMOLOGACAO.network_events; i += 1) {
      deFora.encontros.push(await criarEncontro(cliente, deFora.usuarios[i % deFora.usuarios.length], {
        slug: `encontro-dele-${String(i).padStart(2, '0')}`,
        title: `Encontro de verdade ${String(i)}`,
        summary: 'Encontro que nao e massa.',
        place: { place_name: 'Praca de Verdade', neighborhood: 'Centro', city: 'Sao Paulo', state: 'SP' },
        starts_at: new Date(Date.now() + 86400000 * (i + 1)).toISOString(),
        ends_at: new Date(Date.now() + 86400000 * (i + 1) + 7200000).toISOString(),
      }));
    }
    const parceiroDele = randomUUID();
    await cliente.query(
      `insert into store_partners (id, slug, name, host) values ($1, 'parceiro-dele', 'Parceiro de verdade', 'loja-dele.example')`,
      [parceiroDele],
    );
    for (let i = 1; i < FORA_COMO_EM_HOMOLOGACAO.store_partners; i += 1) {
      await cliente.query(
        `insert into store_partners (id, slug, name, host) values ($1, $2, $3, $4)`,
        [randomUUID(), `parceiro-dele-${String(i)}`, `Parceiro ${String(i)}`, `p${String(i)}.example`],
      );
    }
    const { rows: parDele } = await cliente.query(
      'select category_code, code from store_subcategories limit 1',
    );
    await cliente.query(
      `insert into store_items (id, slug, partner_id, title, summary, category, subcategory,
                                target_path, active, sort_order, published_at)
       values ($1, 'item-dele', $2, 'Item de verdade', 'Resumo do item dele', $3, $4, '/dele', true, 1, now())`,
      [randomUUID(), parceiroDele, parDele[0].category_code, parDele[0].code],
    );
    const profDele = randomUUID();
    await cliente.query(
      `insert into professionals (id, kind, display_name, city, state, source,
                                  claim_status, claimed_by_user_id, claimed_at, slug,
                                  status, published_at, phone_e164)
       values ($1, 'vet', 'Clinica de verdade', 'Sao Paulo', 'SP', 'self',
               'claimed', $2, now(), 'clinica-de-verdade', 'published', now(), '+5511999990000')`,
      [profDele, deFora.usuarios[0]],
    );

    // ------------------------------------------------- 2. a massa (o lote)
    console.error('--- semeando a MASSA, com as formas de criar.mjs ---');
    const manifesto = {
      lote: LOTE,
      criado_em: new Date().toISOString(),
      base_url: '(prova por INSERT, sem API)',
      marcas: { audit_event_id: null },
      conversation_messages_por_conversa: [],
      conversations: [], found_reports: [], tag_scans_por_tag: [], pet_tags: [],
      pets: [], network_events: [], store_items: [], store_partners: [],
      professionals: [], user_reference_locations_por_usuario: [], users: [], handles: [],
      objetos: [], lost_cases: [], pet_photos: [], upload_intents: [],
    };

    for (const conta of contas()) {
      const id = await criarConta(cliente, {
        email: conta.email, displayName: conta.displayName,
        handle: conta.handle, birthDate: conta.birthDate,
      });
      manifesto.users.push({ indice: conta.indice, id, email: conta.email });
      manifesto.handles.push(conta.handle);
      await cliente.query(
        `insert into verification_tokens (id, user_id, purpose, token_hash, sent_to, expires_at)
         values ($1, $2, 'email_verify', $3, $4, now() + interval '24 hours')`,
        [randomUUID(), id, randomBytes(32), conta.email],
      );
      if (temCoordenada(conta.indice)) {
        const { lat, lon } = coordenadaDe(conta.indice);
        await cliente.query(
          `insert into user_reference_locations
             (user_id, reference_point, precision_m, source, captured_at, expires_at, session_family_id)
           values ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 100, 'device_gps',
                   now(), now() + interval '30 days', $4)`,
          [id, lon, lat, randomUUID()],
        );
        manifesto.user_reference_locations_por_usuario.push(id);
      }
    }
    const idDaConta = (indice) => manifesto.users.find((u) => u.indice === indice).id;

    for (const pet of pets()) {
      const id = await criarPet(cliente, idDaConta(pet.contaIndice), pet.name, pet.indice);
      manifesto.pets.push({ indice: pet.indice, id, conta: pet.contaIndice });
    }

    // Foto em TODO pet da massa, e caso de perdido em 30 deles -- a mesma forma
    // do que o acrescimo de 19/10 pos em homologacao.
    for (const pet of manifesto.pets) {
      const r = await criarFoto(cliente, idDaConta(pet.conta), pet.id, pet.indice);
      manifesto.pet_photos.push({ indice: pet.indice, id: r.foto, pet: pet.id });
      manifesto.upload_intents.push(r.intencao);
      for (const o of r.objetos) manifesto.objetos.push(o);
    }
    const CIDADES_DO_CASO = ['Sao Paulo', 'Guarulhos', 'Campinas', 'Santos', 'Niteroi'];
    for (let k = 0; k < QUANTIDADE; k += 1) {
      const pet = manifesto.pets[k];
      const r = await criarCaso(cliente, pet.id, CIDADES_DO_CASO[k % CIDADES_DO_CASO.length], k);
      manifesto.lost_cases.push({ indice: k + 1, id: r.id, pet: pet.id });
    }

    const petsDaVitrine = manifesto.pets.filter((p) => p.conta === 1).slice(0, PETS_DA_VITRINE);
    for (const pet of petsDaVitrine) {
      for (let k = 0; k < PLAQUINHAS_POR_PET; k += 1) {
        const tag = await criarPlaquinha(cliente, pet.id);
        manifesto.pet_tags.push({ id: tag, pet: pet.id });
        manifesto.tag_scans_por_tag.push(tag);
        const par = await criarAvisoEConversa(cliente, { pet: pet.id, tag, tutor: idDaConta(1) });
        manifesto.found_reports.push(par.aviso);
        manifesto.conversations.push(par.conversa);
        manifesto.conversation_messages_por_conversa.push(par.conversa);
      }
    }

    for (const encontro of encontros(Date.now())) {
      const slug = `${PREFIXO_ESTRUTURAL}-rede-${String(encontro.indice).padStart(2, '0')}`;
      await criarEncontro(cliente, idDaConta(encontro.contaIndice), { ...encontro, slug });
      manifesto.network_events.push({ indice: encontro.indice, slug });
    }

    for (const entrada of profissionais()) {
      const id = randomUUID();
      await cliente.query(
        `insert into professionals (id, kind, entity_kind, display_name, city, state,
                                    neighborhood, geo, source, claim_status, slug,
                                    status, published_at, phone_e164)
         values ($1, $2, $3, $4, $5, $6, $7,
                 case when $8::float8 is null then null
                      else ST_SetSRID(ST_MakePoint($8::float8, $9::float8), 4326)::geography end,
                 'import', 'unclaimed', $10, 'published', now(), $11)`,
        [id, entrada.kind, entrada.entity_kind, entrada.display_name, entrada.city,
          entrada.state, entrada.neighborhood,
          entrada.coordenada === null ? null : entrada.coordenada.lon,
          entrada.coordenada === null ? null : entrada.coordenada.lat,
          entrada.slug, entrada.phone_e164],
      );
      manifesto.professionals.push({ indice: entrada.indice, id, slug: entrada.slug });
    }

    const parceiroDaMassa = randomUUID();
    await cliente.query(
      'insert into store_partners (id, slug, name, host) values ($1, $2, $3, $4)',
      [parceiroDaMassa, PARCEIRO.slug, PARCEIRO.name, PARCEIRO.host],
    );
    manifesto.store_partners.push({ id: parceiroDaMassa, slug: PARCEIRO.slug });
    const { rows: pares } = await cliente.query(
      'select category_code, code from store_subcategories where active order by category_code, code limit 30',
    );
    for (const item of itensDaLoja()) {
      const par = pares[(item.indice - 1) % pares.length];
      const id = randomUUID();
      await cliente.query(
        `insert into store_items (id, slug, partner_id, title, summary, category, subcategory,
                                  target_path, active, sort_order, published_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, now())`,
        [id, item.slug, parceiroDaMassa, item.title, item.summary,
          par.category_code, par.code, item.target_path, item.sort_order],
      );
      manifesto.store_items.push({ indice: item.indice, id, slug: item.slug });
    }

    const idDaTrilha = randomUUID();
    await cliente.query(
      `insert into audit.events (id, actor_kind, action, resource_kind, resource_id)
       values ($1, 'system', 'massa_de_teste.lote_criado', 'lote_de_massa', $2)`,
      [idDaTrilha, LOTE],
    );
    manifesto.marcas.audit_event_id = idDaTrilha;
    writeFileSync(caminhoDoManifesto, `${JSON.stringify(manifesto, null, 2)}\n`);

    const conferir = async (rotulo, sql, parametros = []) => {
      const { rows } = await cliente.query(sql, parametros);
      console.error(`  ${rotulo}: ${JSON.stringify(rows[0])}`);
      return rows[0];
    };
    console.error('\n--- o banco antes da remocao ---');
    await conferir('users', 'select count(*)::int as n from users');
    await conferir('da massa', 'select count(*)::int as n from users where email like $1', [`%@${DOMINIO_INVALIDO}`]);
    await conferir('conversas', 'select count(*)::int as n from conversations');
    await conferir('profissionais', 'select count(*)::int as n from professionals');
    await conferir('itens da loja', 'select count(*)::int as n from store_items');
    await conferir('encontros', 'select count(*)::int as n from network_events');

    // ------------------------------- 3. a recusa: linha de fora ligada a massa
    //
    // Este e o caso que o aviso 1 do briefing descreve. O cliente vai NAVEGAR
    // com a massa dentro: ele pode bloquear um perfil de teste. Se isso
    // acontecer, o `DELETE` da conta da massa levaria a linha DELE embora.
    console.error('\n--- 3. a recusa: bloqueio DELE contra um perfil da massa ---');
    await cliente.query(
      'insert into user_blocks (id, blocker_user_id, blocked_user_id, created_at) values ($1, $2, $3, now())',
      [randomUUID(), deFora.usuarios[0], idDaConta(5)],
    );
    const recusa = await rodarRemocao(caminhoDoManifesto, url);
    if (recusa.code === 0) {
      throw new Error('REPROVA: a remocao NAO recusou com bloqueio de fora ligado a massa.');
    }
    if (!recusa.saida.includes('RECUSADO')) {
      throw new Error(`REPROVA: recusou, mas nao pelo motivo certo:\n${recusa.saida}`);
    }
    console.error('  recusou, como devia. Trecho:');
    console.error(`    ${recusa.saida.split('\n').slice(0, 6).join('\n    ')}`);
    const { rows: aindaLa } = await cliente.query('select count(*)::int as n from users where email like $1', [`%@${DOMINIO_INVALIDO}`]);
    if (aindaLa[0].n !== QUANTIDADE) {
      throw new Error(`REPROVA: a recusa apagou algo. Restaram ${String(aindaLa[0].n)} contas de massa.`);
    }
    console.error(`  e nao apagou nada: as ${String(QUANTIDADE)} contas da massa continuam la.`);

    // ------------------------------------------ 4. a remocao, com a prova
    console.error('\n--- 4. desfeito o bloqueio, a remocao de verdade ---');
    await cliente.query('delete from user_blocks where blocker_user_id = $1 and blocked_user_id = $2',
      [deFora.usuarios[0], idDaConta(5)]);
    const feito = await rodarRemocao(caminhoDoManifesto, url);
    console.error(feito.saida);
    if (feito.code !== 0) throw new Error('REPROVA: a remocao falhou.');

    console.error('\n--- o banco depois da remocao ---');
    const sobrouDaMassa = await conferir('contas da massa (tem de ser 0)',
      'select count(*)::int as n from users where email like $1', [`%@${DOMINIO_INVALIDO}`]);
    const apelidosDaMassa = await conferir('apelidos da massa (tem de ser 0)',
      'select count(*)::int as n from handles where handle like $1', [`${PREFIXO_ESTRUTURAL}%`]);
    const usuariosDele = await conferir('contas DELE (tem de ser 12)', 'select count(*)::int as n from users');
    const petsDele = await conferir('pets DELE (tem de ser 7)', 'select count(*)::int as n from pets');
    const conversasDele = await conferir('conversas DELE (tem de ser 3)', 'select count(*)::int as n from conversations');
    const mensagensDele = await conferir('mensagens DELE (tem de ser 6)', 'select count(*)::int as n from conversation_messages');
    const avisosDele = await conferir('avisos DELE (tem de ser 3)', 'select count(*)::int as n from found_reports');
    const tagsDele = await conferir('plaquinhas DELE (tem de ser 4)', 'select count(*)::int as n from pet_tags');
    const casosDele = await conferir('casos de perdido DELE (tem de ser 1)', 'select count(*)::int as n from lost_cases');
    const encontrosDele = await conferir('encontros DELE (tem de ser 13)', 'select count(*)::int as n from network_events');
    const profDeles = await conferir('profissionais DELE (tem de ser 1)', 'select count(*)::int as n from professionals');
    const itensDele = await conferir('itens DELE (tem de ser 1)', 'select count(*)::int as n from store_items');
    const parceirosDele = await conferir('parceiros DELE (tem de ser 4)', 'select count(*)::int as n from store_partners');
    const fotosDele = await conferir('fotos DELE (tem de ser 4)', 'select count(*)::int as n from pet_photos');
    const intencoesDele = await conferir('intencoes DELE (tem de ser 4)', 'select count(*)::int as n from upload_intents');
    const despachosDele = await conferir('despachos de alerta DELE (tem de ser 1)', 'select count(*)::int as n from alert_dispatches');
    const trilha = await conferir('audit.events do lote (2: criacao e remocao)',
      "select count(*)::int as n from audit.events where resource_kind = 'lote_de_massa'");

    const esperado = [
      ['massa restante em users', sobrouDaMassa.n, 0],
      ['massa restante em handles', apelidosDaMassa.n, 0],
      ['users dele', usuariosDele.n, FORA_COMO_EM_HOMOLOGACAO.users],
      ['pets dele', petsDele.n, FORA_COMO_EM_HOMOLOGACAO.pets],
      ['conversations dele', conversasDele.n, FORA_COMO_EM_HOMOLOGACAO.conversations],
      ['conversation_messages dele', mensagensDele.n, FORA_COMO_EM_HOMOLOGACAO.conversation_messages],
      ['found_reports dele', avisosDele.n, FORA_COMO_EM_HOMOLOGACAO.conversations],
      ['pet_tags dele', tagsDele.n, FORA_COMO_EM_HOMOLOGACAO.pet_tags],
      ['lost_cases dele', casosDele.n, FORA_COMO_EM_HOMOLOGACAO.lost_cases],
      ['network_events dele', encontrosDele.n, FORA_COMO_EM_HOMOLOGACAO.network_events],
      ['professionals dele', profDeles.n, FORA_COMO_EM_HOMOLOGACAO.professionals],
      ['store_items dele', itensDele.n, FORA_COMO_EM_HOMOLOGACAO.store_items],
      ['store_partners dele', parceirosDele.n, FORA_COMO_EM_HOMOLOGACAO.store_partners],
      ['pet_photos dele', fotosDele.n, FORA_COMO_EM_HOMOLOGACAO.pet_photos_dele],
      ['upload_intents dele', intencoesDele.n, FORA_COMO_EM_HOMOLOGACAO.pet_photos_dele],
      ['alert_dispatches dele', despachosDele.n, FORA_COMO_EM_HOMOLOGACAO.lost_cases],
      ['audit.events do lote', trilha.n, 2],
    ];
    const erradas = esperado.filter(([, obtido, alvo]) => obtido !== alvo);
    if (erradas.length > 0) {
      throw new Error(
        `REPROVA:\n  ${erradas.map(([r, o, a]) => `${r}: ${String(o)}, esperado ${String(a)}`).join('\n  ')}`,
      );
    }
    console.error('\nAPROVADO: a massa saiu inteira e nenhuma linha de fora foi tocada.');
  } finally {
    await cliente.end();
  }
}

async function rodarRemocao(manifesto, url) {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(
    process.execPath,
    [new URL('./remover.mjs', import.meta.url).pathname, '--manifesto', manifesto,
      // Aqui NAO HA armazenamento. `remover.mjs` recusa pular os objetos em
      // silencio -- quem quer pular tem de dizer, e e isto que diz.
      '--sem-objetos'],
    { env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' },
  );
  return { code: r.status, saida: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

if (process.argv[1]?.endsWith('prova-da-remocao.mjs')) {
  principal().catch((erro) => {
    console.error(erro instanceof Error ? erro.message : String(erro));
    process.exit(1);
  });
}
