#!/usr/bin/env node
/* global console, process, fetch, FormData, Blob, Buffer, setTimeout, URL */
/**
 * A PROVA da remocao das IMAGENS, contra o armazenamento de verdade.
 *
 *   BASE_URL=http://127.0.0.1:3000 DATABASE_URL=... MASSA_SENHA=... \
 *     node infra/massa-de-homologacao/prova-da-remocao-de-imagem.mjs
 *
 * ===========================================================================
 * POR QUE ESTA PROVA NAO E A OUTRA, E POR QUE ELA RODA EM HOMOLOGACAO
 * ===========================================================================
 * `prova-da-remocao.mjs` prova as LINHAS, em Postgres descartavel. Ela nao
 * prova byte nenhum, e nao poderia: naquele banco nao ha armazenamento de
 * objeto, e o manifesto so alcanca linha.
 *
 * O que precisa de prova aqui e outra coisa: que `remover.mjs` apaga do BALDE
 * os objetos que o manifesto lista, e **nao apaga nenhum outro**. Isso nao se
 * prova sem um balde, e o balde que importa e o de homologacao -- um MinIO
 * local provaria o comportamento de um armazenamento que ninguem usa.
 *
 * ===========================================================================
 * COMO ELA NAO DESTROI A MASSA QUE O CLIENTE ESTA OLHANDO
 * ===========================================================================
 * Ela cria um LOTE DE SONDA proprio -- uma conta, um pet, uma foto, um caso --,
 * com manifesto proprio, e remove SO ELE. A massa de verdade
 * (`massa-hml-2026-10-19`) entra na prova do outro lado: como "o de fora" que
 * tem de continuar inteiro.
 *
 * Entao a afirmacao final e exatamente a que se quer: os objetos da sonda
 * sairam do balde, e os 99 objetos da massa mais os do cliente continuam
 * sendo servidos.
 *
 * A sonda usa o dominio `.invalid` e um prefixo PROPRIO (`provadeimagem`), que
 * nao e `massateste`: se algo falhar no meio, o que sobra se distingue da massa
 * pelo nome e pelo manifesto, e nao se confunde com ela.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { Client } from 'pg';

import { svgDaFoto } from './massa.mjs';

const BASE = process.env['BASE_URL'] ?? 'http://127.0.0.1:3000';
const PREFIXO = 'provadeimagem';
const DOMINIO = 'exemplo-de-teste.invalid';

async function chamar(metodo, caminho, { token, corpo } = {}) {
  const cab = { accept: 'application/json' };
  if (corpo !== undefined) cab['content-type'] = 'application/json';
  if (token !== undefined) cab['authorization'] = `Bearer ${token}`;
  const r = await fetch(`${BASE}/v1${caminho}`, {
    method: metodo, headers: cab,
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${metodo} ${caminho} -> ${String(r.status)}: ${t.slice(0, 400)}`);
  return t === '' ? undefined : JSON.parse(t);
}

/** O mesmo resumo que a coluna guarda. Ver o comentario em `criar.mjs`. */
function resumoComoAColunaGuarda(texto) {
  return Buffer.from(createHash('sha256').update(texto, 'utf8').digest().toString('base64'), 'utf8');
}

async function principal() {
  const senha = process.env['MASSA_SENHA'];
  if (senha === undefined || senha === '') throw new Error('MASSA_SENHA ausente.');
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url === '') throw new Error('DATABASE_URL ausente.');

  const dist = process.env['BICHU_DIST'] ?? '/app/dist';
  const { criarObjectStorage } = await import(`${dist}/modules/media/adapters/external/s3-object-storage.js`);
  const { loadAppConfig } = await import(`${dist}/shared/config/app-config.js`);
  const armazenamento = criarObjectStorage(loadAppConfig().objectStorage);

  const cliente = new Client({ connectionString: url });
  await cliente.connect();
  const pasta = mkdtempSync(join(tmpdir(), 'prova-imagem-'));
  const caminhoDoManifesto = join(pasta, 'MANIFESTO-SONDA.json');
  const sufixo = String(Date.now()).slice(-6);
  const lote = `prova-de-imagem-${sufixo}`;

  // O manifesto da sonda tem a MESMA forma do da massa: e o mesmo `remover.mjs`
  // que o le, e uma forma diferente aqui provaria outro programa.
  const sonda = {
    lote, criado_em: new Date().toISOString(), base_url: BASE,
    marcas: { audit_event_id: null },
    conversation_messages_por_conversa: [], conversations: [], found_reports: [],
    tag_scans_por_tag: [], pet_tags: [], objetos: [], lost_cases: [], pet_photos: [],
    upload_intents: [], pets: [], network_events: [], store_items: [], store_partners: [],
    professionals: [], user_reference_locations_por_usuario: [], users: [], handles: [],
  };

  try {
    // ----------------------------------------------- 1. o inventario DE FORA
    //
    // Tudo que NAO e da sonda e tem de continuar no balde: os objetos da massa
    // (lidos do banco, nao do manifesto dela -- a pergunta e sobre o balde) e
    // os do cliente.
    const { rows: deFora } = await cliente.query(
      `select f.original_key, f.thumb_key, f.card_key from pet_photos f`,
    );
    const objetosDeFora = [];
    for (const l of deFora) {
      objetosDeFora.push({ classe: 'privado', chave: l.original_key });
      if (l.thumb_key !== null) objetosDeFora.push({ classe: 'publico', chave: l.thumb_key });
      if (l.card_key !== null) objetosDeFora.push({ classe: 'publico', chave: l.card_key });
    }
    console.error(`objetos DE FORA a preservar: ${String(objetosDeFora.length)}`);

    // -------------------------------------------------- 2. criar a sonda
    const email = `${PREFIXO}${sufixo}@${DOMINIO}`;
    const apelido = `${PREFIXO}${sufixo}`;
    const conta = await chamar('POST', '/auth/register', {
      corpo: {
        email, password: senha, display_name: '[teste] Sonda de imagem',
        birth_date: '1990-05-14', accepted_terms_version: '2026-09-17', handle: apelido,
      },
    });
    sonda.users.push({ indice: 1, id: conta.user.id, email });
    sonda.handles.push(apelido);
    const bruto = randomBytes(32).toString('base64url');
    await cliente.query(
      `insert into verification_tokens (id, user_id, purpose, token_hash, sent_to, expires_at)
       values ($1, $2, 'email_verify', $3, $4, now() + interval '24 hours')`,
      [randomUUID(), conta.user.id, resumoComoAColunaGuarda(bruto), email],
    );
    const verificada = await chamar('POST', '/auth/email-verification/confirm', {
      corpo: { token: bruto },
    });
    const token = verificada.access_token;

    const pet = await chamar('POST', '/pets', {
      token, corpo: { name: '[teste] Sonda', species: 'dog', size: 'M', sex: 'unknown' },
    });
    sonda.pets.push({ indice: 1, id: pet.id, conta: 1 });

    const { default: sharp } = await import('sharp');
    const jpeg = await sharp(Buffer.from(svgDaFoto(7))).jpeg({ quality: 82 }).toBuffer();
    const autorizacao = await chamar('POST', '/media/pet-photo-intents', {
      token,
      corpo: { pet_id: pet.id, content_type: 'image/jpeg', byte_size: jpeg.length, width: 600, height: 600 },
    });
    const formulario = new FormData();
    for (const [k, v] of Object.entries(autorizacao.fields ?? {})) formulario.append(k, v);
    formulario.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 'foto.jpeg');
    const envio = await fetch(autorizacao.url, { method: 'POST', body: formulario });
    if (!envio.ok) throw new Error(`envio ao armazenamento -> ${String(envio.status)}`);
    const foto = await chamar('POST', `/pets/${pet.id}/photos`, {
      token, corpo: { upload_id: autorizacao.upload_id, set_as_primary: true },
    });
    sonda.pet_photos.push({ indice: 1, id: foto.id, pet: pet.id });
    sonda.upload_intents.push(autorizacao.upload_id);

    for (let i = 0; i < 90; i += 1) {
      const { rows } = await cliente.query('select status from pet_photos where id = $1', [foto.id]);
      if (rows[0].status === 'ready') break;
      if (rows[0].status === 'rejected') throw new Error('a foto da sonda foi recusada.');
      await new Promise((r) => setTimeout(r, 2000));
    }
    const { rows: chaves } = await cliente.query(
      'select original_key, thumb_key, card_key from pet_photos where id = $1', [foto.id],
    );
    sonda.objetos.push({ classe: 'privado', chave: chaves[0].original_key });
    sonda.objetos.push({ classe: 'publico', chave: chaves[0].thumb_key });
    sonda.objetos.push({ classe: 'publico', chave: chaves[0].card_key });

    const caso = await chamar('POST', `/pets/${pet.id}/lost-cases`, {
      token,
      corpo: {
        last_seen_at: new Date(Date.now() - 86400000).toISOString(),
        description: '[teste] sonda da prova de remocao de imagem',
        last_seen_area: { city: 'Sao Paulo', neighborhood: 'Bela Vista', state: 'SP' },
        share_to_public_list: true,
      },
    });
    sonda.lost_cases.push({ indice: 1, id: caso.id, pet: pet.id, cidade: 'Sao Paulo', com_ponto: false });
    writeFileSync(caminhoDoManifesto, `${JSON.stringify(sonda, null, 2)}\n`);
    console.error(`sonda criada: lote ${lote}, ${String(sonda.objetos.length)} objetos.`);

    // ---------------------------------------------- 3. medir ANTES
    const existe = async (o) => (await armazenamento.head(o.classe, o.chave)) !== null;
    const antesSonda = [];
    for (const o of sonda.objetos) antesSonda.push(await existe(o));
    let antesFora = 0;
    for (const o of objetosDeFora) if (await existe(o)) antesFora += 1;
    console.error(
      `ANTES: sonda ${String(antesSonda.filter(Boolean).length)}/${String(sonda.objetos.length)} no balde; `
      + `de fora ${String(antesFora)}/${String(objetosDeFora.length)}`,
    );
    if (antesSonda.some((x) => !x)) throw new Error('a sonda nao tem os 3 objetos no balde; nao ha o que provar.');
    if (antesFora !== objetosDeFora.length) {
      throw new Error(`${String(objetosDeFora.length - antesFora)} objeto(s) de fora JA faltavam antes. Paro aqui.`);
    }

    const { rows: aA } = await cliente.query('select count(*)::int n from pet_photos');
    const { rows: bA } = await cliente.query('select count(*)::int n from lost_cases');
    const { rows: cA } = await cliente.query('select count(*)::int n from users');

    // ------------------------------------- 4. remover a sonda, pelo manifesto
    const r = spawnSync(
      process.execPath,
      [new URL('./remover.mjs', import.meta.url).pathname, '--manifesto', caminhoDoManifesto],
      { env: { ...process.env }, encoding: 'utf8' },
    );
    console.error(`${r.stdout ?? ''}${r.stderr ?? ''}`);
    if (r.status !== 0) throw new Error('a remocao da sonda falhou.');

    // ---------------------------------------------- 5. medir DEPOIS
    const depoisSonda = [];
    for (const o of sonda.objetos) depoisSonda.push(await existe(o));
    let depoisFora = 0;
    const faltando = [];
    for (const o of objetosDeFora) {
      if (await existe(o)) depoisFora += 1;
      else faltando.push(o);
    }
    const { rows: aD } = await cliente.query('select count(*)::int n from pet_photos');
    const { rows: bD } = await cliente.query('select count(*)::int n from lost_cases');
    const { rows: cD } = await cliente.query('select count(*)::int n from users');

    console.error('\n=== A PROVA ===');
    console.error(`objetos da sonda ainda no balde: ${String(depoisSonda.filter(Boolean).length)} (tem de ser 0)`);
    console.error(`objetos de fora ainda no balde:  ${String(depoisFora)} de ${String(objetosDeFora.length)} (tem de ser todos)`);
    console.error(`pet_photos: ${String(aA[0].n)} -> ${String(aD[0].n)} (esperado -1)`);
    console.error(`lost_cases: ${String(bA[0].n)} -> ${String(bD[0].n)} (esperado -1)`);
    console.error(`users:      ${String(cA[0].n)} -> ${String(cD[0].n)} (esperado -1)`);

    const erros = [];
    if (depoisSonda.some(Boolean)) erros.push('sobrou objeto da sonda no balde');
    if (depoisFora !== objetosDeFora.length) {
      erros.push(`SUMIRAM ${String(objetosDeFora.length - depoisFora)} objeto(s) de fora: ${JSON.stringify(faltando.slice(0, 5))}`);
    }
    if (aD[0].n !== aA[0].n - 1) erros.push('pet_photos nao caiu exatamente 1');
    if (bD[0].n !== bA[0].n - 1) erros.push('lost_cases nao caiu exatamente 1');
    if (cD[0].n !== cA[0].n - 1) erros.push('users nao caiu exatamente 1');
    if (erros.length > 0) throw new Error(`REPROVA:\n  ${erros.join('\n  ')}`);
    console.error('\nAPROVADO: os 3 objetos da sonda sairam do balde e nenhum dos demais foi tocado.');
  } finally {
    await cliente.end();
  }
}

if (process.argv[1]?.endsWith('prova-da-remocao-de-imagem.mjs')) {
  principal().catch((erro) => {
    console.error(erro instanceof Error ? erro.message : String(erro));
    process.exit(1);
  });
}
