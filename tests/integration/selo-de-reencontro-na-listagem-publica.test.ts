/**
 * O selo de "encontrado pela comunidade" na listagem publica, contra Postgres de
 * verdade: a BORDA dos 30 dias e o SINAL da comunidade.
 *
 * ## A decisao, e de quem ela e
 *
 * Cliente, 20/10/2026: *"o pet ganha um selo/filtro na pagina de pets como
 * encontrado por 30 dias e depois ele expira e sai"*, e *"se o usuario remover
 * que o cachorro estiver perdido, depois de um usuario ter escaneado a tag do
 * usuario ou ter entrado em contato"*. Exposicao nova em superficie alcancavel
 * sem conta, escrita na Emenda 4 do ADR-0010.
 *
 * ## Por que nao pode ser unitario
 *
 * Os dois predicados que decidem se um animal aparece numa pagina publica so se
 * notam com dado:
 *
 * - **a janela** e uma comparacao de `timestamptz` que o Postgres faz. Um dubla
 *   em memoria responde o que o autor do dubla acreditou, e o 29o e o 31o dia
 *   sao justamente onde a crenca erra;
 * - **o `EXISTS` da conversa** so distingue algo quando existe um caso
 *   reencontrado SEM conversa na mesma tabela. Sem ele na massa, uma consulta
 *   que perdesse o predicado passaria -- e o selo estaria na rua dizendo que a
 *   comunidade encontrou um animal que o tutor achou sozinho.
 *
 * A FORMA da consulta e de
 * `src/modules/lostfound/adapters/persistence/selo-de-reencontro-na-listagem.test.ts`,
 * que compara o SQL compilado do conjunto aberto com o texto literal da arvore
 * base. Este arquivo le o resultado. Nenhum dos dois basta.
 *
 * ## O RELOGIO, e por que as bordas nao sao redondas
 *
 * `agora` deste arquivo e FIXO, e os casos nascem com deslocamentos de
 * **29 dias 7 h 13 min** e **31 dias 7 h 13 min** -- nao 29 e 31 dias exatos.
 * Janela alinhada a epoca ja produziu falha falsa neste projeto por colisao em
 * multiplo comum, e um deslocamento redondo sobre um `agora` redondo e
 * exatamente o arranjo que colide. A hora UTC foi conferida antes de montar a
 * carga (20/10/2026, `2026-10-20T12:57:13Z` no proprio banco).
 *
 * E a janela da consulta vem de `recorte.agora`, nunca do `now()` do banco:
 * por isso este arquivo pode fixar o instante e as bordas valem.
 *
 * ## A isca, e como ela foi provada
 *
 * Em 20/10/2026, Node v22.23.2, contra `postgis/postgis:16-3.4` descartavel, do
 * hospedeiro (a pilha de conteiner da integracao nao sobe nesta maquina hoje:
 * morre em `resolve image config`, saida 137). Cada desligamento foi confirmado
 * por diferenca de conteudo do arquivo ANTES de a suite rodar.
 *
 * Base deste arquivo: 7 casos, 7 passaram.
 *
 * | o que foi desligado em `kysely-listagem-publica-de-perdidos.ts` | placar | reprovaram, por nome |
 * |---|---|---|
 * | `.where('lost_cases.closed_at', '>=', ...)` | 4/3 | `o caso de 31 dias NAO aparece: a janela expirou`, e por arrasto `o reencontro SEM conversa nao ganha selo` e `encerrar com not_found nunca aparece` -- os tres leem a MESMA lista, e o caso de 31 dias vazando muda os tres |
 * | o `exists` da conversa | 5/2 | `o reencontro SEM conversa nao ganha selo` e, por arrasto, `encerrar com not_found nunca aparece` |
 * | o ramo inteiro (a condicao virando `true`) | 3/4 | os quatro casos do primeiro bloco |
 * | `encontradoPelaComunidade: recorte.conjunto === 'reencontrado'` virando `false` | 6/1 | `o caso de 29 dias com conversa aparece com o selo` |
 *
 * O arrasto esta dito em voz alta de proposito: tres casos deste arquivo leem a
 * mesma lista com nomes esperados diferentes, entao um item a mais reprova mais
 * de um. Nao e um caso medindo outro -- cada um nomeia o item que nao devia
 * estar la --, mas quem for refazer esta tabela precisa saber por que os numeros
 * nao somam um por mecanismo.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * ## O que sobrevive a execucao
 *
 * Nada. A conta criada sai no `after`, e o `ON DELETE CASCADE` leva pets, casos,
 * avisos e conversas junto.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarListagemPublicaDePerdidos } from '../../src/modules/lostfound/adapters/persistence/kysely-listagem-publica-de-perdidos.js';
import type {
  ListagemPublicaDePerdidos,
  RecorteDePerdidos,
} from '../../src/modules/lostfound/ports/listagem-publica-de-perdidos.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

/** `.invalid` e reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

/**
 * O instante de referencia, FIXO. Nao redondo de proposito: ver a secao do
 * relogio no cabecalho.
 */
const AGORA = new Date('2026-10-20T13:07:41.000Z');

/** 29 dias, 7 h e 13 min antes de [AGORA]: DENTRO da janela de 30 dias. */
const DENTRO_DA_JANELA = new Date(
  Number(AGORA) - (29 * 24 + 7) * 3_600_000 - 13 * 60_000,
);
/** 31 dias, 7 h e 13 min antes de [AGORA]: FORA dela. */
const FORA_DA_JANELA = new Date(
  Number(AGORA) - (31 * 24 + 7) * 3_600_000 - 13 * 60_000,
);

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let listagem: ListagemPublicaDePerdidos;

const contasCriadas: string[] = [];

/** O prefixo do `share_token` deste arquivo: e por ele que os casos se isolam. */
const MARCA = `selo-${randomUUID()}`;

interface CasoMontado {
  readonly caso: string;
  readonly pet: string;
  readonly token: string;
  readonly nome: string;
}

/**
 * Quatro caracteres do alfabeto que `pet_tags_code_suffix_alfabeto` aceita
 * (`^[0-9A-HJKMNP-TV-Z]{4}$`), derivados do identificador da tag.
 *
 * Conferido aqui, antes de gravar, para a falha vir com o nome do caso em vez de
 * um `23514` vindo do fundo do fixture -- foi o que aconteceu na primeira
 * escrita deste arquivo.
 */
function sufixoDaTag(tag: string): string {
  const alfabeto = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const limpo = tag.replace(/-/g, '');
  const sufixo = Array.from({ length: 4 }, (_, i) =>
    alfabeto[parseInt(limpo.slice(i * 2, i * 2 + 2), 16) % alfabeto.length],
  ).join('');
  assert.match(sufixo, /^[0-9A-HJKMNP-TV-Z]{4}$/, `sufixo fora do alfabeto: ${sufixo}`);
  return sufixo;
}

function recorte(ajustes: Partial<RecorteDePerdidos> = {}): RecorteDePerdidos {
  return { conjunto: 'aberto', pagina: 1, limite: 20, agora: AGORA, ...ajustes };
}

/**
 * Um caso deste arquivo, com foto `ready` e cidade propria.
 *
 * A cidade e UNICA por execucao (`MARCA`), e e ela que recorta a leitura: a
 * listagem publica le a base inteira, e um `total` medido sem recorte contaria a
 * massa do seed e o que outro arquivo deixou. `texto_para_busca` normaliza
 * acento e caixa, entao a marca entra sem acento.
 */
async function montarCaso(
  nome: string,
  opcoes: {
    readonly estado: 'open' | 'closed_reunited' | 'closed_not_found';
    readonly encerradoEm?: Date;
    readonly comConversa: boolean;
  },
): Promise<CasoMontado> {
  const dono = randomUUID();
  await cliente.query(
    `INSERT INTO users (id, email, public_ref)
     VALUES ($1, $2, translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_'))`,
    [dono, `selo-${dono}@${DOMINIO_DE_TESTE}`],
  );
  contasCriadas.push(dono);

  const pet = randomUUID();
  await cliente.query(
    `INSERT INTO pets (id, owner_user_id, name, species_code, size_code)
     VALUES ($1, $2, $3, 'dog', 'M')`,
    [pet, dono, nome],
  );

  // A FOTO NAO E OPCIONAL NESTE FIXTURE, e nao e enfeite: a listagem junta
  // `pet_photos` por `LEFT JOIN`, entao um pet sem foto apareceria igual. Com
  // foto, o caso tambem mede que a juncao nao multiplica a linha.
  const intencao = randomUUID();
  const foto = randomUUID();
  const chave = `pets/${pet}/original/${foto.replace(/-/g, '')}.jpg`;
  await cliente.query(
    `INSERT INTO upload_intents
       (id, user_id, pet_id, kind, object_key, declared_type, max_bytes, expires_at,
        confirmed_at, sanitize_status)
     VALUES ($1, $2, $3, 'pet_photo', $4, 'image/jpeg', 5000000, $5, $5, 'ausente')`,
    [intencao, dono, pet, chave, AGORA],
  );
  await cliente.query(
    `INSERT INTO pet_photos
       (id, pet_id, upload_intent_id, status, original_key, thumb_key, card_key,
        is_primary, processed_at)
     VALUES ($1, $2, $3, 'ready', $4, $5, $6, true, $7)`,
    [
      foto,
      pet,
      intencao,
      chave,
      `pets/thumb/${foto.replace(/-/g, '')}.jpeg`,
      `pets/card/${foto.replace(/-/g, '')}.jpeg`,
      AGORA,
    ],
  );

  const caso = randomUUID();
  const token = `${MARCA}-${nome.replace(/[^a-z0-9]/gi, '')}`;
  await cliente.query(
    `INSERT INTO lost_cases
       (id, pet_id, owner_user_id, status, last_seen_at, last_seen_city,
        last_seen_neighborhood, last_seen_state, share_to_public_list, share_token,
        closed_at, closure_outcome)
     VALUES ($1, $2, $3, $4, $5, $6, 'Pinheiros', 'SP', true, $7, $8, $9)`,
    [
      caso,
      pet,
      dono,
      opcoes.estado,
      new Date(Number(AGORA) - 40 * 24 * 3_600_000),
      MARCA,
      token,
      opcoes.encerradoEm ?? null,
      opcoes.estado === 'open' ? null : opcoes.estado.replace('closed_', ''),
    ],
  );

  if (opcoes.comConversa) {
    // A CONVERSA pelo caminho da plaquinha (`origin: 'tag_scan'`), que e um dos
    // dois sinais que o cliente nomeou. `conversations.case_id` aponta para o
    // caso, e e esse o predicado que a consulta le.
    const tag = randomUUID();
    const aviso = randomUUID();
    // `sha256(...)` sobre um parametro de TEXTO proprio, e nao sobre o `$1` do
    // `id`: reaproveitar o mesmo `$n` em `uuid` e em `text` faz o Postgres
    // recusar com `inconsistent types deduced for parameter $1`, e a falha vem
    // do fixture em vez do que o caso mede.
    await cliente.query(
      `INSERT INTO pet_tags (id, pet_id, code_hash, code_suffix, status)
       VALUES ($1, $2, sha256($3::bytea), $4, 'active')`,
      // `code_suffix` obedece `^[0-9A-HJKMNP-TV-Z]{4}$` (alfabeto Crockford sem
      // I, L, O e U). Derivado do `tag`, e nao do nome do pet: `Voltou` tem `o`
      // e `u`, e o CHECK recusa.
      [tag, pet, Buffer.from(tag, 'utf8'), sufixoDaTag(tag)],
    );
    await cliente.query(
      `INSERT INTO found_reports
         (id, origin, tag_id, pet_id, found_at, finder_token_hash, finder_token_expires_at)
       VALUES ($1, 'tag_scan', $2, $3, $4, sha256($5::bytea), $6)`,
      [
        aviso,
        tag,
        pet,
        AGORA,
        Buffer.from(aviso, 'utf8'),
        new Date(Number(AGORA) + 30 * 24 * 3_600_000),
      ],
    );
    await cliente.query(
      `INSERT INTO conversations (id, found_report_id, pet_id, case_id, tutor_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), aviso, pet, caso, dono],
    );
  }

  return { caso, pet, token, nome };
}

void before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    // Verificacao que nao consegue verificar precisa REPROVAR. Pular aqui faria
    // a suite ficar verde sem o Postgres nunca ter comparado um `closed_at`, que
    // e exatamente o que este arquivo existe para fazer.
    throw new Error(
      'DATABASE_URL nao esta definida. Este arquivo mede a borda dos 30 dias e o sinal da ' +
        'comunidade contra Postgres de verdade, e nao tem versao em memoria. Rode ' +
        '`npm run test:integration`, que sobe a pilha efemera.',
    );
  }
  banco = createDb(CONEXAO);
  db = banco.db;
  await banco.ping();
  listagem = criarListagemPublicaDePerdidos(db);

  cliente = new pg.Client({ connectionString: CONEXAO });
  await cliente.connect();
});

void after(async () => {
  if (contasCriadas.length > 0) {
    await cliente.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [contasCriadas]);
  }
  await cliente.end();
  await banco.close();
});

void describe('o selo de reencontro pela comunidade, contra Postgres', () => {
  void it('o caso de 29 dias com conversa aparece com o selo', async () => {
    const montado = await montarCaso('Voltou', {
      estado: 'closed_reunited',
      encerradoEm: DENTRO_DA_JANELA,
      comConversa: true,
    });

    const pagina = await listagem.listar(recorte({ conjunto: 'reencontrado', cidade: MARCA }));

    assert.equal(pagina.total, 1, `trouxe ${String(pagina.total)} itens em vez de 1`);
    assert.equal(pagina.itens[0]?.shareToken, montado.token, 'veio o caso errado');
    assert.equal(
      pagina.itens[0]?.encontradoPelaComunidade,
      true,
      '`found_by_community` nao veio verdadeiro no conjunto do selo. O cartao desenha o chip ' +
        'por este campo, e nao pelo `case_state` que a tela pediu: sem ele, o filtro recorta e ' +
        'o selo nao aparece.',
    );
  });

  void it('o caso de 31 dias NAO aparece: a janela expirou', async () => {
    await montarCaso('Expirou', {
      estado: 'closed_reunited',
      encerradoEm: FORA_DA_JANELA,
      comConversa: true,
    });

    const pagina = await listagem.listar(recorte({ conjunto: 'reencontrado', cidade: MARCA }));

    assert.deepEqual(
      pagina.itens.map((i) => i.petNome).sort(),
      ['Voltou'],
      'o caso encerrado ha 31 dias continua na lista publica. A Emenda 4 do ADR-0010 promete ' +
        '30 dias, e o prazo e o unico limite dessa exposicao: sem ele, foto, nome, bairro e ' +
        'data de um animal que ja voltou ficam na rua para sempre.',
    );
  });

  void it('o reencontro SEM conversa nao ganha selo', async () => {
    await montarCaso('Sozinho', {
      estado: 'closed_reunited',
      encerradoEm: DENTRO_DA_JANELA,
      comConversa: false,
    });

    const pagina = await listagem.listar(recorte({ conjunto: 'reencontrado', cidade: MARCA }));

    assert.deepEqual(
      pagina.itens.map((i) => i.petNome).sort(),
      ['Voltou'],
      'o pet que o tutor achou SOZINHO entrou na lista de "encontrado pela comunidade". O selo ' +
        'e uma afirmacao publica sobre o animal, e sem o sinal ela passa a ser uma afirmacao ' +
        'que o proprio dono fabrica.',
    );
  });

  void it('encerrar com not_found nunca aparece', async () => {
    await montarCaso('NaoAchou', {
      estado: 'closed_not_found',
      encerradoEm: DENTRO_DA_JANELA,
      comConversa: true,
    });

    const pagina = await listagem.listar(recorte({ conjunto: 'reencontrado', cidade: MARCA }));

    assert.deepEqual(
      pagina.itens.map((i) => i.petNome).sort(),
      ['Voltou'],
      '`closed_not_found` entrou no conjunto do selo. E a busca que nao acabou bem, e ' +
        'publica-la como reencontro conta uma historia que o tutor nao autorizou.',
    );
  });
});

void describe('a lista de casos ABERTOS nao muda de comportamento', () => {
  void it('o caso ABERTO aparece no conjunto de sempre, e sem selo', async () => {
    const montado = await montarCaso('Procurado', { estado: 'open', comConversa: false });

    const pagina = await listagem.listar(recorte({ cidade: MARCA }));

    assert.equal(pagina.total, 1, `trouxe ${String(pagina.total)} itens em vez de 1`);
    assert.equal(pagina.itens[0]?.shareToken, montado.token);
    assert.equal(
      pagina.itens[0]?.encontradoPelaComunidade,
      false,
      'um caso ABERTO veio com o selo de reencontro. O chip diria que o animal voltou na ' +
        'mesma lista em que a vizinhanca esta procurando por ele.',
    );
  });

  void it('NENHUM reencontrado entra no conjunto de abertos, nem dentro da janela', async () => {
    // Os quatro casos dos blocos acima continuam no banco, e um deles e o
    // reencontrado de 29 dias COM conversa — o unico que o selo aceita. Se o
    // ramo vazar, e aqui que ele vaza: a lista de abertos ganharia um item que
    // ocupa vaga de um animal que ainda esta na rua.
    const pagina = await listagem.listar(recorte({ cidade: MARCA }));

    assert.deepEqual(
      pagina.itens.map((i) => i.petNome).sort(),
      ['Procurado'],
      'reencontrado vazou para a lista de casos abertos. A Emenda 4 do ADR-0010 promete que os ' +
        'dois conjuntos nao se misturam: a lista pela qual a vizinhanca acha o animal que sumiu ' +
        'tem vinte vagas na pagina 1, e nenhuma delas e de um pet que ja voltou.',
    );
    assert.equal(pagina.total, 1, `o \`total\` do conjunto aberto virou ${String(pagina.total)}`);
  });

  void it('a conversa de um caso ABERTO nao o tira da lista nem o marca', async () => {
    // O `EXISTS` nao e avaliado no ramo aberto, e este caso prova que a ausencia
    // de avaliacao nao virou uma avaliacao invertida em algum refatoramento.
    const montado = await montarCaso('ComAviso', { estado: 'open', comConversa: true });

    const pagina = await listagem.listar(recorte({ cidade: MARCA }));

    const item = pagina.itens.find((i) => i.shareToken === montado.token);
    assert.ok(item !== undefined, 'o caso aberto COM conversa saiu da lista de perdidos');
    assert.equal(item.encontradoPelaComunidade, false, 'e ele ganhou selo');
  });
});
