#!/usr/bin/env node
/* global console, process, fetch, FormData, Blob, Buffer, setTimeout */
/**
 * ACRESCENTA ao lote existente: foto de verdade nos 30 pets e 30 casos de
 * perdido, pelas rotas. Nao recria e nao apaga nada do que ja esta la.
 *
 *   BASE_URL=http://127.0.0.1:3000 DATABASE_URL=... MASSA_SENHA=... \
 *     node infra/massa-de-homologacao/acrescentar-perdidos.mjs \
 *       --manifesto infra/massa-de-homologacao/MANIFESTO-massa-hml-2026-10-19.json
 *
 * ===========================================================================
 * POR QUE ISTO E UM SEGUNDO PROGRAMA, E NAO UMA EMENDA EM `criar.mjs`
 * ===========================================================================
 * O lote `massa-hml-2026-10-19` JA ESTA EM HOMOLOGACAO e o cliente ja pode
 * estar olhando. Reexecutar `criar.mjs` reprovaria no primeiro cadastro (409
 * `email-already-registered`), e torna-lo "idempotente" seria dar a ele um
 * caminho de reescrita -- exatamente o que a massa fixa de `src/bin/seed.ts`
 * tem e por isso NAO pode rodar aqui.
 *
 * Este programa so SOMA, e recusa se achar que o acrescimo ja aconteceu.
 *
 * ===========================================================================
 * A FOTO DE PET NAO EXIGE O PAINEL. A DA LOJA E A DO DIRETORIO EXIGEM.
 * ===========================================================================
 * A primeira rodada concluiu que "imagem exige administrador" e deixou os 30
 * pets sem foto -- e, por consequencia, `lost_cases` sem massa, porque
 * `openLostCase` responde 409 enquanto o pet nao tem foto `ready`
 * (`kysely-lost-case-repository.ts:119`). A conclusao era larga demais:
 *
 *   - `POST /v1/media/pet-photo-intents` e rota do APLICATIVO (`bearerAuth`),
 *     com `UploadIntentInput`: `content_type` em `[image/jpeg, image/png,
 *     image/heic, image/webp]` e `byte_size` ate 5 MiB. Nenhum painel.
 *   - o que exige painel e `AdminCatalogImageIntentInput`, o unico schema que
 *     declara `purpose` -- e e dele que dependem a imagem de PRODUTO da Loja
 *     (`store_item`) e as do DIRETORIO (`directory_logo`, `directory_photo`).
 *
 * Entao a Loja e o diretorio continuam sem imagem, e isso segue correto; os 30
 * pets passam a ter foto, e com ela vem a aba de Pets cheia.
 *
 * ===========================================================================
 * O PROBLEMA QUE A FOTO TRAZ, E QUE O MANIFESTO SOZINHO NAO RESOLVIA
 * ===========================================================================
 * O manifesto alcanca linha de banco. Os BYTES vivem fora dele, em dois baldes
 * de objeto (ADR-0007), e a pergunta e se alguem os varre quando a linha sai.
 *
 * MEDIDO NO REPOSITORIO, e a resposta e NAO, por tres caminhos independentes:
 *
 *   1. `varrer-envios-vencidos.ts` varre INTENCAO NAO CONFIRMADA (10 min de
 *      validade). Foto confirmada deixa aquela lista no instante em que vira
 *      `pet_photos`, entao ela nunca e candidata. O proprio cabecalho do
 *      arquivo registra a decisao do cliente de 17/10 que estreita isso ainda
 *      mais: *"Nenhum apagamento automatico toca informacao de perdido ou
 *      achado"*.
 *   2. `apagar-objetos-da-conta.ts` -- a unica funcao do repositorio que apaga
 *      objeto de armazenamento -- esta **DESLIGADA desde 17/10**, por decisao
 *      escrita do cliente (*"Mantenha a foto e nao delete os dados do usuario,
 *      apenas desabilite na plataforma"*). O cabecalho dela comeca com
 *      "NINGUEM CHAMA ESTA FUNCAO PARA APAGAR NADA", e
 *      `expurgarContasExcluidas` ignora a dependencia.
 *   3. O mesmo cabecalho afirma, sobre objeto sem ponteiro: *"Permanente, e nao
 *      existe varredura de orfaos em lugar nenhum deste repositorio"*.
 *
 * Logo: **nao ha prazo nem rotina**. Se a remocao da massa apagar so as linhas,
 * os 90 objetos (30 originais privados + 60 derivadas publicas) ficam no balde
 * para sempre, sem ponteiro e sem ninguem capaz de nomea-los. Por isso este
 * programa grava no manifesto o PAR `(classe, chave)` de cada objeto, e
 * `remover.mjs` ganhou uma fase que os apaga ANTES das linhas -- a ordem que
 * `varrer-envios-vencidos.ts` ja prescreve: *"Objeto primeiro, linha depois.
 * Sempre."*, porque a ordem inversa perde o unico ponteiro que existe.
 *
 * ===========================================================================
 * O QUE CONTINUA ALCANCAVEL DEPOIS DE APAGAR, E PRECISA SER DITO
 * ===========================================================================
 * As derivadas publicas sao servidas com `max-age=31536000, immutable`, e o
 * ADR-0014 decidiu que NAO existe operacao de invalidacao. Quem tiver a URL
 * exata e uma copia em cache continua vendo a imagem por ate 12 meses depois do
 * apagamento. Para massa de teste isso e irrelevante; esta escrito porque a
 * frase "apagamos completamente" seria falsa, e alguem vai copiar daqui.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

import { Client } from 'pg';

import { MARCA_DE_HOMOLOGACAO } from './criar.mjs';
import {
  LOTE,
  MARCA_VISIVEL,
  QUANTIDADE,
  casosDePerdido,
  petsExtras,
  svgDaFoto,
} from './massa.mjs';

const BASE = process.env['BASE_URL'] ?? 'http://127.0.0.1:3000';

/** 600 x 600: o minimo que `DIMENSAO_MINIMA_DA_FOTO_DE_PET` exige. */
const LADO = 600;

async function chamar(metodo, caminho, { token, corpo } = {}) {
  const cabecalhos = { accept: 'application/json' };
  if (corpo !== undefined) cabecalhos['content-type'] = 'application/json';
  if (token !== undefined) cabecalhos['authorization'] = `Bearer ${token}`;
  const r = await fetch(`${BASE}/v1${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const texto = await r.text();
  if (!r.ok) {
    throw new Error(`${metodo} ${caminho} respondeu ${String(r.status)}: ${texto.slice(0, 500)}`);
  }
  return texto === '' ? undefined : JSON.parse(texto);
}

/**
 * Envia os bytes DIRETO ao armazenamento, lendo `metodo` da autorizacao.
 *
 * O cliente LE o campo em vez de presumir a forma -- e o que o contrato manda
 * ("o cliente le o campo em vez de presumir a forma") e o que faz a troca de
 * provedor nao virar versao nova do aplicativo. Em `POST`, os campos assinados
 * vao ANTES do arquivo: a politica do S3/MinIO e avaliada na ordem das partes,
 * e `file` em primeiro lugar e recusado.
 */
async function enviarBytes(autorizacao, bytes, tipo) {
  if (autorizacao.method === 'PUT') {
    const r = await fetch(autorizacao.url, {
      method: 'PUT',
      headers: { ...(autorizacao.headers ?? {}), 'content-type': tipo },
      body: bytes,
    });
    if (!r.ok) throw new Error(`PUT no armazenamento respondeu ${String(r.status)}: ${(await r.text()).slice(0, 300)}`);
    return;
  }
  const formulario = new FormData();
  for (const [chave, valor] of Object.entries(autorizacao.fields ?? {})) {
    formulario.append(chave, valor);
  }
  formulario.append('file', new Blob([bytes], { type: tipo }), 'foto.jpeg');
  const r = await fetch(autorizacao.url, { method: 'POST', body: formulario });
  if (!r.ok) throw new Error(`POST no armazenamento respondeu ${String(r.status)}: ${(await r.text()).slice(0, 300)}`);
}

async function principal() {
  const i = process.argv.indexOf('--manifesto');
  if (i === -1 || process.argv[i + 1] === undefined) throw new Error('passe --manifesto <caminho.json>');
  const caminho = process.argv[i + 1];
  const manifesto = JSON.parse(readFileSync(caminho, 'utf8'));
  if (manifesto.lote !== LOTE) {
    throw new Error(`o manifesto e do lote ${String(manifesto.lote)} e eu sei acrescentar ao ${LOTE}.`);
  }
  const senha = process.env['MASSA_SENHA'];
  if (senha === undefined || senha === '') {
    throw new Error('MASSA_SENHA ausente. Ela vive no Secret Manager (ADR-0022) e entra por ambiente.');
  }
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url === '') throw new Error('DATABASE_URL ausente.');

  // As chaves novas do manifesto, se ainda nao existirem. A ORDEM delas e a
  // ordem de remocao, e `remover.mjs` depende disso -- leia o cabecalho dele
  // antes de reordenar.
  manifesto.objetos ??= [];
  manifesto.lost_cases ??= [];
  manifesto.pet_photos ??= [];
  manifesto.upload_intents ??= [];
  // SEM RECUSA PELO NUMERO, e a razao e que "ja tem 30" nao quer dizer "nao ha
  // nada a fazer": o reparo da cidade (ultima fase) age sobre casos que JA
  // existem. A protecao contra duplicar nao vem de uma contagem na entrada --
  // vem de cada fase perguntar ao manifesto o que ela ja fez.
  //
  // RETOMADA, e nao reexecucao. Cada fase pergunta ao MANIFESTO o que ja fez e
  // continua dali: foto de pet que ja tem foto nao sobe de novo, caso de pet
  // que ja tem caso nao abre de novo. O manifesto e gravado depois de CADA
  // item, entao a retomada e exata -- e isto nao e luxo: a primeira execucao
  // parou no 409 do teto de casos abertos, com 30 fotos gravadas, e sem
  // retomada o unico caminho seria apagar as 30 e subir tudo outra vez.
  if (manifesto.pet_photos.length > 0 || manifesto.lost_cases.length > 0) {
    console.error(
      `retomando: ${String(manifesto.pet_photos.length)} foto(s) e `
      + `${String(manifesto.lost_cases.length)} caso(s) ja no manifesto.`,
    );
  }

  const cliente = new Client({ connectionString: url });
  await cliente.connect();
  const gravar = () => writeFileSync(caminho, `${JSON.stringify(manifesto, null, 2)}\n`);

  try {
    const { rows: catalogo } = await cliente.query(
      `select current_database() as banco, shobj_description(d.oid,'pg_database') as marca
         from pg_database d where d.datname = current_database()`,
    );
    if (catalogo[0]?.marca !== MARCA_DE_HOMOLOGACAO) {
      throw new Error(
        `RECUSADO: este banco nao se declara como homologacao (marca: ${String(catalogo[0]?.marca)}).`,
      );
    }
    console.error(`banco de homologacao confirmado: ${String(catalogo[0].banco)}`);

    // sharp vem do proprio projeto: ele JA e dependencia (o worker usa o mesmo
    // para gerar as derivadas), e gerar a imagem com outra biblioteca seria
    // trazer uma segunda para fazer o que a primeira faz.
    const { default: sharp } = await import('sharp');

    // Uma sessao por conta dona de pet. A conta vitrine tem 6 pets; as outras,
    // um cada -- entao sao poucas sessoes e elas valem 15 min, de sobra.
    const sessoes = new Map();
    const sessaoDe = async (indiceDaConta) => {
      if (sessoes.has(indiceDaConta)) return sessoes.get(indiceDaConta);
      const conta = manifesto.users.find((u) => u.indice === indiceDaConta);
      const s = await chamar('POST', '/auth/login', {
        corpo: { email: conta.email, password: senha },
      });
      sessoes.set(indiceDaConta, s.access_token);
      return s.access_token;
    };

    // ------------------------------------------------------------- 1. as fotos
    let bytesTotais = 0;
    const tamanhos = [];
    const comFoto = new Set(manifesto.pet_photos.map((f) => f.pet));
    const subirFoto = async (pet) => {
      if (comFoto.has(pet.id)) return;
      const token = await sessaoDe(pet.conta);
      const jpeg = await sharp(Buffer.from(svgDaFoto(pet.indice)))
        .jpeg({ quality: 82 })
        .toBuffer();
      bytesTotais += jpeg.length;
      tamanhos.push({ indice: pet.indice, bytes: jpeg.length });

      const autorizacao = await chamar('POST', '/media/pet-photo-intents', {
        token,
        corpo: {
          pet_id: pet.id,
          content_type: 'image/jpeg',
          byte_size: jpeg.length,
          width: LADO,
          height: LADO,
        },
      });
      await enviarBytes(autorizacao, jpeg, 'image/jpeg');
      const foto = await chamar('POST', `/pets/${pet.id}/photos`, {
        token,
        corpo: { upload_id: autorizacao.upload_id, set_as_primary: true },
      });
      manifesto.pet_photos.push({ indice: pet.indice, id: foto.id, pet: pet.id });
      manifesto.upload_intents.push(autorizacao.upload_id);
      comFoto.add(pet.id);
      gravar();
      console.error(
        `foto do pet ${String(pet.indice).padStart(2, '0')}: ${String(jpeg.length)} bytes, `
        + `${String(foto.status)}`,
      );
    };
    for (const pet of manifesto.pets) await subirFoto(pet);
    if (tamanhos.length > 0) {
      console.error(
        `\n${String(tamanhos.length)} fotos enviadas nesta rodada, `
        + `${String(bytesTotais)} bytes `
        + `(menor ${String(Math.min(...tamanhos.map((t) => t.bytes)))}, `
        + `maior ${String(Math.max(...tamanhos.map((t) => t.bytes)))}).`,
      );
    } else {
      console.error('nenhuma foto nova nesta rodada: as do manifesto ja estavam no lugar.');
    }

    // ------------------------------- 2. esperar o worker: `processing` -> `ready`
    //
    // A confirmacao ENFILEIRA; quem processa e o worker. Sem foto `ready` o
    // caso de perdido responde 409, entao esperar aqui nao e cortesia: e a
    // precondicao do passo seguinte. Espero pelo BANCO e nao pela rota porque e
    // uma consulta so para as 30.
    const idsDasFotos = manifesto.pet_photos.map((f) => f.id);
    await esperarProntas(cliente, idsDasFotos);

    // ---------------------- 3. as chaves de objeto, do banco, com a CLASSE
    //
    // Tres objetos por foto, e as classes NAO sao a mesma: o original e
    // privado, as duas derivadas sao publicas. O par `(classe, chave)` e a
    // identidade -- o mesmo nome em dois baldes sao dois arquivos. Esta e a
    // mesma leitura que `chavesDaConta` faz em
    // `kysely-media-repository.ts:461`, e a juncao por `upload_intents` esta
    // aqui pelo mesmo motivo que esta la: `upload_intents.object_key` e o
    // MESMO objeto que `pet_photos.original_key`, e contar os dois inflaria o
    // numero sem haver arquivo a mais.
    await registrarObjetos(cliente, manifesto, gravar);

    // ------------------------------------------- 4. os 30 casos de perdido
    //
    // ===================================================================
    // O TETO DE TRES CASOS ABERTOS POR CONTA, E A ARITMETICA QUE ELE IMPOE
    // ===================================================================
    // `TETO_DE_CASOS_ABERTOS_POR_CONTA = 3`
    // (`src/modules/lostfound/domain/abertura-do-caso.ts:53`). NAO e defeito e
    // nao se contorna: o cabecalho da constante da a segunda razao dela, que e
    // a menos obvia -- *"a lista publica mostra bairro e data, e uma conta que
    // pudesse abrir vinte casos entregaria a um observador uma SERIE de vinte
    // pontos no tempo e no espaco da mesma pessoa"*. O 409 e
    // `open-case-limit-reached`.
    //
    // Combinado com `lost_cases_um_aberto_por_pet` (UNIQUE em `pet_id` onde
    // `status = 'open'`), o numero maximo de casos abertos e
    // `soma(min(pets_da_conta, 3))`.
    //
    // A massa tem 30 pets distribuidos como 6 + 24 x 1, porque a conta vitrine
    // PRECISA de 6 pets: sao eles que carregam as 5 plaquinhas cada e dao as 30
    // conversas numa lista so. Logo o maximo com os pets que existem e
    // 3 + 24 = **27**, e 30 casos com 30 pets e aritmeticamente impossivel.
    //
    // A saida e acrescentar pet as contas que estao SEM pet (a massa deixou 5
    // assim de proposito, porque conta sem pet tambem e um estado da tela).
    // Cada pet novo vem com foto, porque sem foto `ready` nao ha caso. O
    // conjunto de pets cresce de 30 para 33 -- e e isso que esta no manifesto e
    // no relatorio, em vez de 30 casos anunciados e 27 entregues.
    const TETO_POR_CONTA = 3;
    const comCaso = new Set(manifesto.lost_cases.map((c) => c.pet));
    const abertosPorConta = new Map();
    for (const c of manifesto.lost_cases) {
      const pet = manifesto.pets.find((x) => x.id === c.pet);
      abertosPorConta.set(pet.conta, (abertosPorConta.get(pet.conta) ?? 0) + 1);
    }
    const cabeMais = (conta) => (abertosPorConta.get(conta) ?? 0) < TETO_POR_CONTA;

    const fila = [];
    for (const pet of manifesto.pets) {
      if (comCaso.has(pet.id)) continue;
      fila.push(pet);
    }
    // Quantos cabem com os pets de hoje, respeitando o teto por conta.
    const simulado = new Map(abertosPorConta);
    const elegiveis = fila.filter((pet) => {
      const n = simulado.get(pet.conta) ?? 0;
      if (n >= TETO_POR_CONTA) return false;
      simulado.set(pet.conta, n + 1);
      return true;
    });
    const faltam = QUANTIDADE - manifesto.lost_cases.length - elegiveis.length;
    if (faltam > 0) {
      // As contas sem pet nenhum, em ordem de indice, para o acrescimo ser
      // deterministico e nao "a primeira que aparecer".
      const semPet = manifesto.users
        .map((u) => u.indice)
        .filter((indice) => !manifesto.pets.some((pet) => pet.conta === indice))
        .sort((a, b) => a - b);
      if (semPet.length < faltam) {
        throw new Error(
          `PARO AQUI: faltam ${String(faltam)} casos e so ha ${String(semPet.length)} conta(s) `
          + `sem pet. Com o teto de ${String(TETO_POR_CONTA)} casos abertos por conta, a massa `
          + 'nao alcanca 30 casos sem mais contas -- e criar conta a mais muda o conjunto que o '
          + 'cliente pediu. Decida antes de eu contornar.',
        );
      }
      console.error(
        `\nfaltam ${String(faltam)} casos pelo teto de ${String(TETO_POR_CONTA)} por conta: `
        + `acrescento ${String(faltam)} pet(s) as contas ${semPet.slice(0, faltam).join(', ')}.`,
      );
      const extras = petsExtras(faltam, semPet.slice(0, faltam), manifesto.pets.length);
      for (const extra of extras) {
        const token = await sessaoDe(extra.contaIndice);
        const criado = await chamar('POST', '/pets', {
          token,
          corpo: {
            name: extra.name,
            species: extra.species,
            size: extra.size,
            sex: extra.sex,
            neutered: extra.neutered,
            distinctive_marks: extra.distinctive_marks,
          },
        });
        const pet = { indice: extra.indice, id: criado.id, conta: extra.contaIndice };
        manifesto.pets.push(pet);
        gravar();
        await subirFoto(pet);
        elegiveis.push(pet);
      }
      // As fotos novas tambem precisam ficar `ready` antes dos casos.
      await esperarProntas(cliente, manifesto.pet_photos.map((f) => f.id));
      await registrarObjetos(cliente, manifesto, gravar);
    }

    const roteiro = casosDePerdido(Date.now());
    for (let k = 0; k < elegiveis.length && manifesto.lost_cases.length < QUANTIDADE; k += 1) {
      const pet = elegiveis[k];
      const caso = roteiro[manifesto.lost_cases.length];
      if (!cabeMais(pet.conta)) continue;
      const token = await sessaoDe(pet.conta);
      const corpo = corpoDoCaso(caso);
      const aberto = await chamar('POST', `/pets/${pet.id}/lost-cases`, { token, corpo });
      manifesto.lost_cases.push({
        indice: caso.indice,
        id: aberto.id,
        pet: pet.id,
        cidade: caso.lugar.city,
        com_ponto: caso.comPonto,
      });
      abertosPorConta.set(pet.conta, (abertosPorConta.get(pet.conta) ?? 0) + 1);
      gravar();
    }
    if (manifesto.lost_cases.length !== QUANTIDADE) {
      throw new Error(
        `abri ${String(manifesto.lost_cases.length)} casos e o alvo era ${String(QUANTIDADE)}.`,
      );
    }

    // ============================================================
    // REPARO: o caso que nasceu sem cidade volta pela MESMA rota
    // ============================================================
    // Quem abriu caso com a primeira versao do corpo (so `last_seen_location`)
    // ficou com `last_seen_city` nulo e invisivel na listagem por cidade. O
    // conserto NAO e um `UPDATE` em `lost_cases`: seria escrever a consequencia
    // e saltar o ato, e a cidade passaria a existir sem ninguem ter digitado.
    //
    // O caso e apagado PELO ID DO MANIFESTO -- a mesma operacao que
    // `remover.mjs` faz, sobre linha que e minha -- e reaberto pela rota com o
    // corpo completo. `lost_cases_um_aberto_por_pet` exige essa ordem: com o
    // caso antigo aberto, o novo responderia 409 `pet_already_lost`.
    const porId = new Map(manifesto.lost_cases.map((c) => [c.id, c]));
    const { rows: semCidade } = await cliente.query(
      `select id from lost_cases
        where id = any($1::uuid[]) and last_seen_city is null`,
      [[...porId.keys()]],
    );
    if (semCidade.length > 0) {
      console.error(`\nreparando ${String(semCidade.length)} caso(s) que nasceram sem cidade.`);
      const roteiroPorIndice = new Map(roteiro.map((c) => [c.indice, c]));
      for (const linha of semCidade) {
        const antigo = porId.get(linha.id);
        const pet = manifesto.pets.find((x) => x.id === antigo.pet);
        const caso = roteiroPorIndice.get(antigo.indice);
        await cliente.query('delete from lost_cases where id = $1', [linha.id]);
        const token = await sessaoDe(pet.conta);
        const reaberto = await chamar('POST', `/pets/${pet.id}/lost-cases`, {
          token, corpo: corpoDoCaso(caso),
        });
        antigo.id = reaberto.id;
        antigo.cidade = caso.lugar.city;
        gravar();
      }
      const { rows: restantes } = await cliente.query(
        `select count(*)::int as n from lost_cases
          where id = any($1::uuid[]) and last_seen_city is null`,
        [manifesto.lost_cases.map((c) => c.id)],
      );
      if (restantes[0].n !== 0) {
        throw new Error(`ainda ha ${String(restantes[0].n)} caso(s) sem cidade depois do reparo.`);
      }
      console.error('reparo concluido: todos os casos tem cidade.');
    }
    console.error(`casos de perdido abertos: ${String(manifesto.lost_cases.length)}`);

    // Com `last_seen_location` o servidor deriva a cidade do ponto? NAO -- o
    // ADR-0006 proibe geocodificacao reversa. Entao o caso com ponto fica SEM
    // `last_seen_city`, e a listagem publica filtrada por cidade nao o enxerga.
    // Medido aqui em vez de suposto, porque muda o que a tela mostra.
    const { rows: comCidade } = await cliente.query(
      `select (last_seen_city is not null) as tem_cidade,
              (last_seen_point is not null) as tem_ponto, count(*)::int as n
         from lost_cases where id = any($1::uuid[]) group by 1,2 order by 1,2`,
      [manifesto.lost_cases.map((c) => c.id)],
    );
    console.error(`cidade x ponto nos casos: ${JSON.stringify(comCidade)}`);

    // ------------------------------------- 5. a marca do acrescimo na trilha
    const idDaTrilha = randomUUID();
    await cliente.query(
      `insert into audit.events (id, actor_kind, action, resource_kind, resource_id, after, metadata)
       values ($1, 'system', 'massa_de_teste.lote_acrescido', 'lote_de_massa', $2, $3, $4)`,
      [
        idDaTrilha, LOTE,
        JSON.stringify({
          pet_photos: manifesto.pet_photos.length,
          lost_cases: manifesto.lost_cases.length,
          upload_intents: manifesto.upload_intents.length,
          objetos_de_armazenamento: manifesto.objetos.length,
          bytes_das_imagens: bytesTotais,
        }),
        JSON.stringify({
          marca_visivel: MARCA_VISIVEL,
          imagens: 'geradas pelo proprio programa, 600x600 JPEG, sem texto (o conteiner nao tem fontconfig)',
          remocao_dos_objetos: 'remover.mjs apaga os objetos ANTES das linhas; nao existe varredura de orfaos no projeto',
        }),
      ],
    );
    manifesto.marcas.audit_event_do_acrescimo = idDaTrilha;
    gravar();

    // --------------------------------------- 6. conferencia de cobertura
    const faltas = [];
    const conferir = async (rotulo, sql, parametros, conhecidos) => {
      const { rows } = await cliente.query(sql, parametros);
      const dentro = new Set(conhecidos.map(String));
      const sobrando = rows.map((r) => String(r.id)).filter((x) => !dentro.has(x));
      if (sobrando.length > 0) faltas.push(`${rotulo}: ${sobrando.join(', ')}`);
    };
    const contas = manifesto.users.map((u) => u.id);
    await conferir(
      'lost_cases', 'select id from lost_cases where owner_user_id = any($1::uuid[])',
      [contas], manifesto.lost_cases.map((c) => c.id),
    );
    await conferir(
      'pet_photos',
      `select f.id from pet_photos f join pets p on p.id = f.pet_id
        where p.owner_user_id = any($1::uuid[])`,
      [contas], manifesto.pet_photos.map((f) => f.id),
    );
    await conferir(
      'upload_intents', 'select id from upload_intents where user_id = any($1::uuid[])',
      [contas], manifesto.upload_intents,
    );
    if (faltas.length > 0) {
      throw new Error(
        `REPROVA: ha linha do acrescimo FORA do manifesto:\n  ${faltas.join('\n  ')}`,
      );
    }
    console.error('\ncobertura conferida: nada do acrescimo ficou fora do manifesto.');
    console.error(JSON.stringify({
      pet_photos: manifesto.pet_photos.length,
      lost_cases: manifesto.lost_cases.length,
      upload_intents: manifesto.upload_intents.length,
      objetos: manifesto.objetos.length,
      bytes_das_imagens: bytesTotais,
      media_de_bytes: Math.round(bytesTotais / QUANTIDADE),
    }, null, 2));
  } finally {
    await cliente.end();
  }
}

/**
 * O corpo de `POST /v1/pets/{petId}/lost-cases`.
 *
 * `last_seen_area` SEMPRE, e `last_seen_location` so quando o caso tem ponto.
 * Ver o cabecalho de `casosDePerdido` em `massa.mjs`: mandar so o ponto deixa
 * `last_seen_city` nulo (nao ha geocodificacao reversa, ADR-0006) e o caso sai
 * da listagem publica filtrada por cidade.
 */
function corpoDoCaso(caso) {
  return {
    last_seen_at: caso.vistoEm,
    description: caso.descricao,
    share_to_public_list: true,
    last_seen_area: {
      city: caso.lugar.city,
      neighborhood: caso.lugar.neighborhood,
      state: caso.lugar.state,
    },
    ...(caso.comPonto
      ? { last_seen_location: { lat: caso.ponto.lat, lon: caso.ponto.lon } }
      : {}),
  };
}

/**
 * Espera o worker virar `processing` em `ready`, e REPROVA se alguma foi
 * recusada.
 *
 * A confirmacao ENFILEIRA; quem processa e o worker. Sem foto `ready` o caso de
 * perdido responde 409, entao esperar aqui nao e cortesia: e a precondicao do
 * passo seguinte. Pergunto ao BANCO e nao a rota porque e uma consulta so para
 * as trinta.
 *
 * `rejected` nao e espera mais longa: os bytes reais nao passaram pelo numero
 * magico ou pela dimensao minima, e tentar de novo com os mesmos bytes daria o
 * mesmo resultado. Entao levanta, com o motivo que a coluna guarda.
 */
async function esperarProntas(cliente, ids) {
  let prontas = 0;
  for (let tentativa = 1; tentativa <= 90; tentativa += 1) {
    const { rows } = await cliente.query(
      `select status, count(*)::int as n from pet_photos
        where id = any($1::uuid[]) group by status`,
      [ids],
    );
    const porEstado = Object.fromEntries(rows.map((r) => [r.status, r.n]));
    prontas = porEstado['ready'] ?? 0;
    const recusadas = porEstado['rejected'] ?? 0;
    if (recusadas > 0) {
      const { rows: motivos } = await cliente.query(
        `select distinct rejection_reason from pet_photos
          where id = any($1::uuid[]) and status = 'rejected'`,
        [ids],
      );
      throw new Error(
        `${String(recusadas)} foto(s) recusadas pelo processamento: `
        + `${motivos.map((m) => String(m.rejection_reason)).join(' | ')}`,
      );
    }
    if (prontas === ids.length) break;
    console.error(`  processando: ${String(prontas)}/${String(ids.length)} prontas`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (prontas !== ids.length) {
    throw new Error(`so ${String(prontas)} de ${String(ids.length)} fotos ficaram prontas.`);
  }
  console.error(`as ${String(prontas)} fotos estao 'ready'.`);
}

/**
 * Grava no manifesto o par `(classe, chave)` de cada objeto de armazenamento.
 *
 * Tres objetos por foto, e as classes NAO sao a mesma: o original e privado, as
 * duas derivadas sao publicas. O par e a identidade -- o mesmo nome em dois
 * baldes sao dois arquivos, e os dois tem de sair.
 *
 * A juncao com `upload_intents` existe pelo mesmo motivo que existe em
 * `chavesDaConta` (`kysely-media-repository.ts:461`): `upload_intents.object_key`
 * e o MESMO objeto que `pet_photos.original_key`, e contar os dois inflaria o
 * numero sem haver arquivo a mais. `vistos` abaixo faz essa deduplicacao, e ela
 * tambem e o que torna esta funcao repetivel numa retomada.
 */
async function registrarObjetos(cliente, manifesto, gravar) {
  const vistos = new Set(manifesto.objetos.map((o) => `${o.classe}|${o.chave}`));
  const guardar = (classe, chave) => {
    if (chave === null || chave === undefined) return;
    const identidade = `${classe}|${chave}`;
    if (vistos.has(identidade)) return;
    vistos.add(identidade);
    manifesto.objetos.push({ classe, chave });
  };
  const { rows: chaves } = await cliente.query(
    'select original_key, thumb_key, card_key from pet_photos where id = any($1::uuid[])',
    [manifesto.pet_photos.map((f) => f.id)],
  );
  for (const linha of chaves) {
    guardar('privado', linha.original_key);
    guardar('publico', linha.thumb_key);
    guardar('publico', linha.card_key);
  }
  const { rows: intencoes } = await cliente.query(
    'select object_key, sanitized_key from upload_intents where id = any($1::uuid[])',
    [manifesto.upload_intents],
  );
  for (const linha of intencoes) {
    guardar('privado', linha.object_key);
    guardar('privado', linha.sanitized_key);
  }
  gravar();
  const privados = manifesto.objetos.filter((o) => o.classe === 'privado').length;
  const publicos = manifesto.objetos.filter((o) => o.classe === 'publico').length;
  console.error(
    `objetos no manifesto: ${String(manifesto.objetos.length)} `
    + `(${String(privados)} no balde privado, ${String(publicos)} no publico)`,
  );
}

if (process.argv[1]?.endsWith('acrescentar-perdidos.mjs')) {
  principal().catch((erro) => {
    console.error(erro instanceof Error ? erro.message : String(erro));
    process.exit(1);
  });
}
