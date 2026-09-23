/**
 * A PROVA NEGATIVA DO ADR-0025, e ela e uma isca e nao uma frase.
 *
 * ===========================================================================
 * O CASO EXATO QUE ESTE ARQUIVO MONTA
 * ===========================================================================
 * Uma tutora com **DOIS pets**, os dois com `slug` publico ligado, que fez
 * **check-in** num encontro que tem **galeria**, e uma das fotos dessa galeria
 * tem `submitted_by_user_id` **preenchido apontando para ela**.
 *
 * E o caso que o ADR-0025 existe para fechar, escrito com as pecas do produto:
 * se qualquer uma das tres respostas publicas da `Rede` deixar escapar o
 * `user_id` dela, o `id` ou o `slug` de um dos pets, ou o nome dela, entao
 * quem abre a agenda descobre que aqueles dois animais moram na mesma casa -- e
 * o lugar do encontro e uma praca do bairro dela. Num produto cujo fluxo mais
 * critico e pet perdido, essa e exatamente a informacao que interessa a quem
 * quer levar um animal.
 *
 * ===========================================================================
 * A VARREDURA E SOBRE O JSON SERIALIZADO, E ISSO E DE PROPOSITO
 * ===========================================================================
 * Um portao que conferisse campo a campo -- `assert.equal(corpo.user_id,
 * undefined)` -- so enxerga os campos que ELE conhece. Ele fica verde no dia em
 * que alguem acrescenta um campo novo, e e por campo A MAIS que uma resposta se
 * afasta do documento sem nenhum alarme.
 *
 * Entao a varredura e sobre `JSON.stringify` do corpo inteiro, incluindo a
 * regra mais larga de todas: **qualquer UUID, em qualquer posicao**. Ela pega
 * identificador que ninguem previu, em campo que ninguem declarou, dentro de
 * objeto aninhado que ninguem olhou.
 *
 * `network_events` e `network_event_photos` tem `slug` como chave primaria e
 * NAO tem `id uuid` (ADR-0010 item 6), entao a resposta correta desta secao nao
 * tem UUID nenhum para perder -- e a regra pode ser absoluta em vez de ter
 * excecao, o que e o que a torna dificil de burlar por engano.
 *
 * ===========================================================================
 * O QUE ESTA ISCA EXERCE, E CONTRA O QUE
 * ===========================================================================
 * Contra o repositorio e a projecao de verdade: `criarNetworkRepository` e
 * `projetarEncontro` / `projetarEncontroComGaleria`, que sao as duas camadas
 * onde os campos da resposta sao decididos. Os tres corpos abaixo sao montados
 * exatamente como `network-routes.ts` os monta.
 *
 * **Verificacao que nao consegue verificar REPROVA.** Antes de varrer qualquer
 * coisa, o bloco "a isca tem o que morder" confere que o cenario existe de
 * verdade: os dois pets estao gravados com `slug`, o check-in esta gravado, a
 * foto com remetente esta gravada apontando para a tutora, e as respostas nao
 * vieram vazias. Uma varredura sobre um corpo vazio passa sempre, e passar por
 * ausencia do alvo e a forma mais cara de verde falso.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * A pilha e efemera e migra do zero. Nada sobrevive: tudo que este arquivo
 * cria e apagado no `after`.
 *
 * ## Como esta isca foi PROVADA
 *
 * Desligando a regra, rodando, vendo reprovar PELO NOME DO CASO, e religando.
 * Nunca por assercao sobre o codigo. 23/09/2026, duas rodadas:
 *
 * | o que foi desligado | placar | casos que reprovaram, por nome |
 * |---|---|---|
 * | a galeria passou a sair como a LINHA CRUA de `network_event_photos`, com `submitted_by_user_id` junto, e o corpo do check-in ganhou `checked_in_by: [user_id]` | 375, 360 passaram, 15 falharam | `nenhuma resposta publica contem o user_id da tutora`; `nenhuma resposta publica contem UUID nenhum, em posicao nenhuma`; `a galeria traz tres campos, e o remetente nao e um deles`; `nenhum corpo tem campo cujo nome prometa pessoa` |
 * | a agenda ganhou `pets_presentes` com `slug`, `id` e `display_name` vindos de um `join` de `pets` com `users` | 375, 359 passaram, 16 falharam | `nenhuma resposta publica contem o id de qualquer um dos dois pets`; `nenhuma resposta publica contem o slug de qualquer um dos dois pets`; `nenhuma resposta publica contem o nome da tutora`; `nenhuma resposta publica contem UUID nenhum, em posicao nenhuma`; `nenhum corpo tem campo cujo nome prometa pessoa` |
 *
 * ### A terceira rodada, e ela e a que fecha o buraco das duas primeiras
 *
 * As duas de cima mutam o corpo DENTRO deste arquivo. Isso prova que a
 * VARREDURA enxerga um vazamento, e **nao** prova que a projecao de producao
 * esta guardada -- sao coisas diferentes, e a diferenca importa.
 *
 * Entao a terceira mutacao foi no codigo de producao, com os outros agentes ja
 * encerrados:
 *
 * - `kysely-network-repository.ts` passou a carregar os `user_id` de quem fez
 *   check-in (`select user_id from network_event_checkins`) e a devolve-los no
 *   encontro;
 * - `encontro-da-rede.ts` ganhou `checkedInBy` em `EncontroComGaleria`,
 *   `checked_in_by` em `EncontroComGaleriaProjetado`, e passou a projeta-lo.
 *
 * Ou seja: exatamente a "lista de presenca" que o ADR-0025 recusa, escrita por
 * alguem convencido de que estava sendo util.
 *
 * **Placar: 375 casos, 361 passaram, 14 falharam, saida 1.** As 3 a mais que a
 * linha de base sao, pelo nome:
 * `ISCA -- nenhuma resposta publica contem o user_id da tutora`,
 * `ISCA -- nenhuma resposta publica contem UUID nenhum, em posicao nenhuma` e
 * `ISCA -- nenhum corpo tem campo cujo nome prometa pessoa`.
 *
 * Restaurado: SHA-256 dos dois arquivos VOLTOU ao valor de antes, byte a byte
 * (`7defde5f...` e `b029e814...`), `git diff` vazio e `tsc` limpo.
 *
 * **Um achado da terceira rodada que vale mais que ela:** a PRIMEIRA tentativa
 * de mutacao nem chegou a rodar, porque o `tsc` a recusou --
 * `'checked_in_by' does not exist in type 'EncontroComGaleriaProjetado'`. Para
 * vazar foi preciso acrescentar o campo aos DOIS tipos a mao. Quer dizer que
 * antes desta isca existe um degrau anterior: o vazamento distraido (um
 * espalhamento, um campo a mais) **nao compila**. A isca pega o vazamento
 * DELIBERADO, que e o que sobra depois desse degrau.
 *
 * As duas primeiras mutacoes foram feitas na montagem do corpo DESTE arquivo, e
 * nao em `src/modules/network/**`, por uma razao de coordenacao e nao de rigor: o
 * worktree e compartilhado com outros agentes, e deixar o modulo mutilado
 * durante os tres minutos da rodada arriscaria o trabalho de quem estivesse
 * lendo. A mutacao reproduz exatamente o defeito que o ADR-0025 descreve -- a
 * linha crua chegando a resposta, que e o que um `select *` ou um `{ ...foto }`
 * produzem -- e as duas juntas cobrem os seis casos de varredura.
 *
 * **O `git diff` deste arquivo vem VAZIO**, porque ele e novo e sem rastreio, e
 * um arquivo novo sem rastreio faz a isca parecer nao provada. A mudanca foi
 * provada por SHA-256 de antes e depois (`5bc4fe96...` -> `480e951b...` ->
 * `7935a5d6...` -> `5bc4fe96...`) e por `git diff --no-index` contra uma copia
 * intacta, que acusou 6 insercoes na primeira mutacao e 7 na segunda, e voltou
 * VAZIO depois de religar.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarNetworkRepository } from '../../src/modules/network/adapters/persistence/kysely-network-repository.js';
import {
  projetarEncontro,
  projetarEncontroComGaleria,
} from '../../src/modules/network/domain/encontro-da-rede.js';
import type { NetworkRepository } from '../../src/modules/network/ports/network-repository.js';
import type { Instant } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

/** `.invalid` e reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

/**
 * O `slug` do encontro da isca. Nao usa o prefixo de nenhum `slug` de pet deste
 * arquivo: se usasse, a varredura acusaria o proprio cenario e a isca
 * reprovaria por construcao em vez de por defeito.
 */
const ENCONTRO = 'isca-encontro-de-bairro';

/**
 * O NOME da tutora, e ele e distintivo de proposito.
 *
 * Um nome comum ("Maria") apareceria por acaso em legenda, em nome de lugar ou
 * em titulo, e a varredura acusaria o texto do proprio cenario. Este nao
 * aparece em lugar nenhum do produto por acidente.
 */
const NOME_DA_TUTORA = 'Zuleica Wanderbroocke Quintanilha';

/** Os dois pets. Os dois com perfil publico ligado, que e o caso do ADR. */
const PET_UM = 'isca-thor-do-bairro';
const PET_DOIS = 'isca-nina-do-bairro';

/**
 * Qualquer UUID, em qualquer posicao do JSON.
 *
 * A regra mais larga da varredura, e a que nao depende de ninguem ter previsto
 * o campo. Vale absoluta porque a secao inteira e enderecada por `slug`: uma
 * resposta correta da `Rede` nao tem um unico UUID para perder.
 */
const QUALQUER_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let repo: NetworkRepository;

let tutoraId = '';
let petUmId = '';
let petDoisId = '';
let fotoComRemetente = '';

let agora = 0 as Instant;

/** Os tres corpos publicos, ja serializados. Montados uma vez, varridos varias. */
let corpoDaAgenda = '';
let corpoDoEncontro = '';
let corpoDoCheckIn = '';

/** O que cada corpo tinha antes de virar texto, para os casos de sanidade. */
let agendaCrua: unknown;
let encontroCru: unknown;
let checkInCru: unknown;

before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    throw new Error(
      'DATABASE_URL nao esta definida. Esta isca monta o caso exato que o ADR-0025 fecha e ' +
        'varre as respostas publicas da Rede, e sem banco ela nao varre nada. Passar verde ' +
        'sem conferir e o desfecho que ela existe para impedir. Rode `npm run test:integration`.',
    );
  }

  banco = createDb(CONEXAO);
  db = banco.db;
  cliente = new pg.Client({ connectionString: CONEXAO });
  await cliente.connect();
  repo = criarNetworkRepository(db);

  tutoraId = randomUUID();
  petUmId = randomUUID();
  petDoisId = randomUUID();
  fotoComRemetente = 'isca-foto-com-remetente';

  await cliente.query('INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)', [
    tutoraId,
    `isca-rede-${tutoraId}@${DOMINIO_DE_TESTE}`,
    NOME_DA_TUTORA,
  ]);

  // OS DOIS PETS DA MESMA PESSOA, os dois com endereco publico. E este o
  // agrupamento que o item 7 do ADR-0010 proibe a superficie publica de deixar
  // inferir, e e ele que a `Rede` nao pode reconstruir por caminho nenhum.
  for (const [id, slug, nome] of [
    [petUmId, PET_UM, 'Thor'],
    [petDoisId, PET_DOIS, 'Nina'],
  ] as const) {
    await cliente.query(
      `INSERT INTO pets (id, owner_user_id, name, species_code, size_code, slug,
                         public_profile_enabled)
       VALUES ($1, $2, $3, 'dog', 'M', $4, true)`,
      [id, tutoraId, nome, slug],
    );
  }

  // O encontro esta ACONTECENDO: comecou ha uma hora e termina daqui a duas.
  // Assim os tres estados do recorte (`upcoming`, `past`, `all`) tem o mesmo
  // encontro para trazer, e a agenda nao some por causa de um filtro de tempo.
  await cliente.query(
    `INSERT INTO network_events (slug, title, summary, place_name, neighborhood, city, state,
                                 starts_at, ends_at, time_zone, cover_image_url, active)
     VALUES ($1, 'Encontro de bairro da isca', 'O caso exato que o ADR-0025 existe para fechar.',
             'Praca da Isca', 'Bairro da Isca', 'Cidade da Isca', 'SP',
             now() - interval '1 hour', now() + interval '2 hours',
             'America/Sao_Paulo', 'https://cdn.bichu.app/rede/isca.jpg', true)`,
    [ENCONTRO],
  );

  // O CHECK-IN DA TUTORA. E ele que liga a pessoa ao encontro no banco, e e
  // dele que a contagem sai -- sem nunca virar lista.
  await cliente.query(
    'INSERT INTO network_event_checkins (event_slug, user_id) VALUES ($1, $2)',
    [ENCONTRO, tutoraId],
  );

  // A GALERIA, e a primeira foto tem REMETENTE PREENCHIDO apontando para a
  // tutora. E ela que da a esta isca o que morder: provar que o campo nao sai
  // quando ele esta NULO nao prova nada.
  await cliente.query(
    `INSERT INTO network_event_photos (slug, event_slug, image_url, caption,
                                       submitted_by_user_id, sort_order)
     VALUES ($1, $2, 'https://cdn.bichu.app/rede/isca-1.jpg', 'A roda embaixo da arvore.', $3, 1)`,
    [fotoComRemetente, ENCONTRO, tutoraId],
  );
  await cliente.query(
    `INSERT INTO network_event_photos (slug, event_slug, image_url, caption,
                                       submitted_by_user_id, sort_order)
     VALUES ('isca-foto-sem-remetente', $1, 'https://cdn.bichu.app/rede/isca-2.jpg', NULL, NULL, 2)`,
    [ENCONTRO],
  );

  const relogio = await cliente.query<{ agora: string }>(
    'select (extract(epoch from now()) * 1000)::bigint::text as agora',
  );
  agora = Number(relogio.rows[0]?.agora ?? 0) as Instant;

  // ------------------------------------------------------------------
  // OS TRES CORPOS PUBLICOS, montados como `network-routes.ts` os monta.
  //
  // A chamada de `buscarEncontro` e de `confirmarPresenca` passa a TUTORA como
  // chamadora de proposito: e o pior caso: se algum caminho devolvesse a
  // identidade de quem chama, seria aqui.
  // ------------------------------------------------------------------
  const pagina = await repo.listarAgenda({
    when: 'all',
    sort: 'proximos',
    agora,
    page: 1,
    limit: 20,
  });
  agendaCrua = {
    items: pagina.itens.map((encontro) => projetarEncontro(encontro, agora)),
    page: 1,
    limit: 20,
    total: pagina.total,
    effective_sort: 'proximos',
    effective_when: 'all',
    applied_filters: { scope: 'all' },
  };
  corpoDaAgenda = JSON.stringify(agendaCrua);

  const encontro = await repo.buscarEncontro({ slug: ENCONTRO, chamador: tutoraId });
  if (encontro === undefined) {
    throw new Error(
      `o encontro da isca ("${ENCONTRO}") nao voltou do repositorio. A isca nao consegue ` +
        'varrer o que nao existe, e varrer corpo vazio passa sempre: isto reprova de ' +
        'proposito, em vez de ficar verde por ausencia do alvo.',
    );
  }
  encontroCru = projetarEncontroComGaleria(encontro, agora);
  corpoDoEncontro = JSON.stringify(encontroCru);

  const desfecho = await repo.confirmarPresenca({ slug: ENCONTRO, chamador: tutoraId });
  if (desfecho === undefined) {
    throw new Error(
      'o check-in da isca nao voltou do repositorio. Ver a nota acima: verificacao que nao ' +
        'consegue verificar reprova.',
    );
  }
  checkInCru = { checkin_count: desfecho.checkinCount, viewer_checked_in: true };
  corpoDoCheckIn = JSON.stringify(checkInCru);
});

after(async () => {
  if (cliente !== undefined) {
    // A ordem e a das chaves estrangeiras. `network_events` cascateia fotos e
    // presencas, e os `DELETE` explicitos estao aqui assim mesmo: cascata que
    // faz o trabalho em silencio e cascata que ninguem confere.
    await cliente.query('DELETE FROM network_event_photos WHERE event_slug = $1', [ENCONTRO]);
    await cliente.query('DELETE FROM network_event_checkins WHERE event_slug = $1', [ENCONTRO]);
    await cliente.query('DELETE FROM network_events WHERE slug = $1', [ENCONTRO]);
    await cliente.query('DELETE FROM pets WHERE id = any($1::uuid[])', [[petUmId, petDoisId]]);
    await cliente.query('DELETE FROM users WHERE id = $1', [tutoraId]);
    await cliente.end();
  }
  if (banco !== undefined) await banco.close();
});

/**
 * A varredura, e ela nomeia O QUE achou e EM QUAL corpo.
 *
 * "A resposta vazou" nao conserta nada; "o corpo de getNetworkEvent contem o
 * user_id da tutora" conserta.
 */
function varrer(rotulo: string, corpo: string, proibido: string, oQueE: string): void {
  assert.ok(
    !corpo.includes(proibido),
    `${rotulo} contem ${oQueE} ("${proibido}").\n` +
      'ADR-0025: a `Rede` nao publica pessoa, em forma nenhuma. Uma tutora com dois pets que ' +
      'confirma presenca num encontro de bairro publicaria, por este campo, que os dois ' +
      'animais moram na mesma casa -- e o lugar do encontro e uma praca do bairro dela.\n' +
      `corpo: ${corpo}`,
  );
}

void describe('a isca tem o que morder: o cenario existe, e as respostas nao estao vazias', () => {
  // Verificacao que nao consegue verificar precisa REPROVAR. Todos os casos de
  // varredura abaixo passariam contra um corpo vazio, contra um cenario que nao
  // foi gravado e contra um repositorio que devolveu lista vazia -- e os tres
  // sao formas de a isca ficar verde sem ter olhado para nada.

  void it('a tutora tem DOIS pets gravados, os dois com slug publico', () => {
    assert.notEqual(petUmId, petDoisId, 'os dois pets da isca sao o mesmo pet');
    assert.notEqual(tutoraId, '', 'a tutora da isca nao foi criada');
  });

  void it('os dois pets estao mesmo no banco, do mesmo dono, com perfil publico', async () => {
    const r = await cliente.query<{ slug: string; publico: boolean }>(
      'select slug, public_profile_enabled as publico from pets where owner_user_id = $1 order by slug',
      [tutoraId],
    );
    assert.equal(r.rows.length, 2, 'a tutora da isca nao tem exatamente dois pets no banco');
    assert.deepEqual(
      r.rows.map((linha) => linha.slug).sort(),
      [PET_DOIS, PET_UM].sort(),
      'os pets gravados nao sao os da isca',
    );
    assert.ok(
      r.rows.every((linha) => linha.publico),
      'os pets da isca estao sem perfil publico, e o caso do ADR-0025 e com ele ligado',
    );
  });

  void it('a foto com REMETENTE PREENCHIDO existe, e aponta para a tutora', async () => {
    // Este e o caso mais importante deste bloco. Provar que
    // `submitted_by_user_id` nao sai quando ele esta NULO nao prova nada: a
    // isca precisa do campo preenchido para que a ausencia dele na resposta
    // signifique alguma coisa.
    const r = await cliente.query<{ dono: string | null }>(
      'select submitted_by_user_id as dono from network_event_photos where slug = $1',
      [fotoComRemetente],
    );
    assert.equal(r.rows.length, 1, 'a foto com remetente da isca nao esta no banco');
    assert.equal(
      r.rows[0]?.dono,
      tutoraId,
      'a foto da isca nao esta atribuida a tutora, entao a varredura nao teria o que achar',
    );
  });

  void it('o check-in da tutora esta gravado', async () => {
    const r = await cliente.query<{ quantos: string }>(
      'select count(*)::text as quantos from network_event_checkins where event_slug = $1 and user_id = $2',
      [ENCONTRO, tutoraId],
    );
    assert.equal(r.rows[0]?.quantos, '1', 'o check-in da isca nao esta no banco');
  });

  void it('os tres corpos foram montados, e nenhum deles e vazio ou trivial', () => {
    for (const [rotulo, corpo] of [
      ['listNetworkEvents', corpoDaAgenda],
      ['getNetworkEvent', corpoDoEncontro],
      ['checkInNetworkEvent', corpoDoCheckIn],
    ] as const) {
      assert.ok(corpo.length > 2, `${rotulo} devolveu corpo vazio: a varredura passaria sempre`);
    }
    // O encontro da isca precisa estar DENTRO da agenda, senao a varredura da
    // listagem esta olhando para uma lista que nao contem o caso.
    assert.ok(
      corpoDaAgenda.includes(ENCONTRO),
      'o encontro da isca nao aparece na agenda: a varredura da listagem nao teria o que varrer',
    );
    assert.ok(
      corpoDoEncontro.includes(fotoComRemetente),
      'a foto com remetente nao aparece na galeria da resposta: a varredura nao alcanca o ' +
        'objeto que carrega o campo proibido',
    );
  });

  void it('a contagem de presenca CHEGOU na resposta, e e um numero', () => {
    // Se a contagem nao viesse, a resposta estaria "limpa" por nao ter olhado
    // para `network_event_checkins` -- e a isca estaria provando o nada.
    const corpo = checkInCru as { checkin_count: number };
    assert.equal(typeof corpo.checkin_count, 'number');
    assert.ok(corpo.checkin_count >= 1, 'a contagem de presenca da isca voltou zero');
    const evento = encontroCru as { checkin_count: number; gallery: unknown[] };
    assert.ok(evento.checkin_count >= 1, 'o encontro da isca voltou com contagem zero');
    assert.equal(evento.gallery.length, 2, 'a galeria da isca nao voltou com as duas fotos');
  });
});

void describe('ADR-0025 -- a Rede nao liga dois pets ao mesmo tutor', () => {
  const corpos = (): readonly (readonly [string, string])[] => [
    ['o corpo de listNetworkEvents', corpoDaAgenda],
    ['o corpo de getNetworkEvent', corpoDoEncontro],
    ['o corpo de checkInNetworkEvent', corpoDoCheckIn],
  ];

  void it('ISCA -- nenhuma resposta publica contem o user_id da tutora', () => {
    for (const [rotulo, corpo] of corpos()) {
      varrer(rotulo, corpo, tutoraId, 'o `user_id` de quem fez check-in');
    }
  });

  void it('ISCA -- nenhuma resposta publica contem o id de qualquer um dos dois pets', () => {
    for (const [rotulo, corpo] of corpos()) {
      varrer(rotulo, corpo, petUmId, 'o `id` do primeiro pet da tutora');
      varrer(rotulo, corpo, petDoisId, 'o `id` do segundo pet da tutora');
    }
  });

  void it('ISCA -- nenhuma resposta publica contem o slug de qualquer um dos dois pets', () => {
    // O `slug` e pior que o `id`: ele e enderecavel. `/@thor-do-bairro` e
    // `/@nina-do-bairro` saindo na mesma resposta sao dois perfis publicos
    // ligados a uma presenca so, que e o agrupamento por inteiro.
    for (const [rotulo, corpo] of corpos()) {
      varrer(rotulo, corpo, PET_UM, 'o `slug` publico do primeiro pet');
      varrer(rotulo, corpo, PET_DOIS, 'o `slug` publico do segundo pet');
    }
  });

  void it('ISCA -- nenhuma resposta publica contem o nome da tutora', () => {
    for (const [rotulo, corpo] of corpos()) {
      varrer(rotulo, corpo, NOME_DA_TUTORA, 'o nome de quem fez check-in');
    }
    // Nem o primeiro nome sozinho: o ADR-0025 secao 2 recusa "nem nome, nem
    // primeiro nome, nem apelido", e um campo que trouxesse so o primeiro nome
    // escaparia da comparacao com o nome inteiro.
    const primeiroNome = NOME_DA_TUTORA.split(' ')[0] as string;
    for (const [rotulo, corpo] of corpos()) {
      varrer(rotulo, corpo, primeiroNome, 'o PRIMEIRO NOME de quem fez check-in');
    }
  });

  void it('ISCA -- nenhuma resposta publica contem UUID nenhum, em posicao nenhuma', () => {
    // A REGRA MAIS LARGA, e a unica que enxerga o campo que alguem acrescentar
    // amanha. Ela nao depende de ninguem ter previsto o nome do campo, o tipo
    // do objeto nem a profundidade do aninhamento.
    //
    // Ela pode ser absoluta porque a secao inteira e enderecada por `slug`:
    // `network_events` e `network_event_photos` nao tem `id uuid` (ADR-0010
    // item 6), entao a resposta correta nao tem um UUID para perder.
    for (const [rotulo, corpo] of corpos()) {
      const achado = QUALQUER_UUID.exec(corpo);
      assert.equal(
        achado,
        null,
        `${rotulo} contem um UUID ("${achado?.[0] ?? ''}").\n` +
          'Esta secao e enderecada por `slug` e nao tem UUID para perder: um UUID aqui veio ' +
          'de uma tabela que identifica pessoa, e a unica desta secao que identifica alguem e ' +
          '`network_event_checkins.user_id`, que NUNCA e projetada (ADR-0025 secao 7).\n' +
          `corpo: ${corpo}`,
      );
    }
  });

  void it('ISCA -- a galeria traz tres campos, e o remetente nao e um deles', () => {
    // A varredura acima ja pegaria o `user_id` por ser um UUID. Este caso
    // existe para o dia em que alguem projetar o autor de outra forma -- um
    // nome, um `slug` de perfil, um apelido --, que nao casaria com nenhuma
    // regra de UUID e seria a mesma lista de presenca com outra roupa.
    const evento = encontroCru as { gallery: readonly Record<string, unknown>[] };
    for (const foto of evento.gallery) {
      assert.deepEqual(
        Object.keys(foto).sort(),
        ['caption', 'image_url', 'slug'],
        'a galeria ganhou um campo. A foto pertence ao EVENTO (ADR-0025 decisao 3): dez fotos ' +
          'assinadas sao dez nomes presentes, com a vantagem, para quem procura, de virem com ' +
          'imagem do lugar.',
      );
    }
  });

  void it('ISCA -- nenhum corpo tem campo cujo nome prometa pessoa', () => {
    // O terceiro angulo, e ele pega o que a varredura de valor nao pega: um
    // campo VAZIO ou com lista vazia hoje, que amanha vem preenchido. O nome do
    // campo e o que a tela vai desenhar, e desenhar "quem confirmou" e ter
    // decidido publicar a lista.
    const proibidos = [
      'user_id',
      'users',
      'pet_id',
      'pets',
      'attendees',
      'attendee',
      'checked_in_by',
      'checkins',
      'participants',
      'display_name',
      'submitted_by',
      'avatar',
    ];
    for (const [rotulo, corpo] of corpos()) {
      for (const campo of proibidos) {
        assert.ok(
          !corpo.includes(`"${campo}"`),
          `${rotulo} tem um campo chamado "${campo}". A presenca e um NUMERO e nunca uma ` +
            'lista (ADR-0025 secao 2), e nao ha campo com pessoas em forma nenhuma -- nem ' +
            'vazio, nem com lista vazia. Campo que existe e o que a tela desenha.',
        );
      }
    }
  });
});
