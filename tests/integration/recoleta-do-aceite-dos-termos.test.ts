/**
 * O ACEITE RECOLHIDO CHEGA AO BANCO **COM A VERSÃO**, e o anterior continua lá.
 *
 * ## O defeito, medido
 *
 * Medido em 01/11/2026. O APK distribuído registrava aceite de `2026-09-17`, e
 * essa data **não é de nenhum texto legal** — é a dos primeiros ADRs. O texto
 * publicado é versão 0.3 de 23/09/2026. Havia consentimento gravado apontando
 * para um documento que nunca esteve no ar.
 *
 * E havia um segundo defeito, no mesmo banco local: de **37** registros de
 * aceite, **1** com a data antiga e **36 NULOS** — consentimento sem versão
 * nenhuma, que é pior que versão errada. (Homologação e produção **não foram
 * medidas**; o SQL está no PR #142.)
 *
 * ## Por que não pode ser unitário
 *
 * Porque o que está em dúvida é **o estado gravado**, e não a resposta da rota.
 * Um servidor que respondesse `204` sem inserir linha daria o mesmo verde do
 * lado do aplicativo — e a suíte do aplicativo
 * (`app/test/telas/recoleta_do_aceite_test.dart`) mede o CORPO enviado, que é a
 * outra metade e não esta. Quem acusa esta é o `SELECT` cru em
 * `terms_acceptances`, **fora do repositório**.
 *
 * E há uma segunda razão, que nenhum teste em memória alcança: `version` é
 * `NOT NULL` com `CHECK` contra vazio no Postgres. Quem prova que o caminho
 * novo é **incapaz** de gravar aceite sem versão é o banco recusando — não o
 * `if` do serviço, que alguém pode apagar.
 *
 * ## As iscas, nos dois sentidos
 *
 * | o que foi desligado | o que reprova |
 * |---|---|
 * | o `INSERT` em `terms_acceptances` no `registrarAceiteDosTermos` | `a recoleta GRAVA uma linha nova COM a versão` |
 * | `version NOT NULL` virar anulável na migração | `REPLANTE: o Postgres RECUSA aceite sem versão` |
 * | o `UPDATE` de `users` sobrescrever a trilha em vez de apendar | `o aceite ANTERIOR continua na trilha` |
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * ## O que sobrevive à execução
 *
 * Nada. As contas criadas saem no `after`, e o `ON DELETE CASCADE` de
 * `terms_acceptances.user_id` leva a trilha junto.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarIdentityRepository } from '../../src/modules/identity/adapters/persistence/kysely-identity-repository.js';
import type { IdentityRepository } from '../../src/modules/identity/ports/identity-repository.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import type { Instant, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

const AGORA = 1_800_000_000_000 as Instant;
const DEPOIS = 1_800_000_060_000 as Instant;

/** A versão que o site publica hoje (`web/src/conteudo/versao-legal.json`). */
const EXIGIDA = '2026-09-23';

/** A versão que o APK distribuído gravava, e que nunca esteve no ar. */
const A_ANTIGA = '2026-09-17';

/**
 * Um PHC de forma válida para `local_credentials_phc_pbkdf2_sha512`, que é o
 * `CHECK` da migração `20260917000001`. Nada neste arquivo verifica senha: o
 * hash existe porque `criarContaLocal` grava a credencial junto com a conta, e
 * um PHC de outra família (argon2, por exemplo) faz o `INSERT` morrer no
 * `CHECK` — medido, e foi o motivo da primeira reprovação deste arquivo.
 */
const SENHA_PHC = '$pbkdf2-sha512$i=1$c2Fs$aGFzaA';

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let repositorio: IdentityRepository;
const contasCriadas: UserId[] = [];

/** Uma conta por SQL direto, **sem** aceite: é o estado dos 36 nulos. */
async function criarConta(): Promise<UserId> {
  const id = randomUUID() as UserId;
  await cliente.query(
    `INSERT INTO users (id, email, public_ref)
     VALUES ($1, $2, translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_'))`,
    [id, `recoleta-do-aceite-${id}@${DOMINIO_DE_TESTE}`],
  );
  contasCriadas.push(id);
  return id;
}

/** A trilha desta conta, em ordem de aceite. **`SELECT` cru.** */
async function trilhaDe(
  conta: UserId,
): Promise<readonly { version: string; source: string }[]> {
  const r = await cliente.query<{ version: string; source: string }>(
    'SELECT version, source FROM terms_acceptances WHERE user_id = $1 ORDER BY accepted_at ASC',
    [conta],
  );
  return r.rows;
}

/** O valor CORRENTE em `users`. **`SELECT` cru.** */
async function correnteDe(
  conta: UserId,
): Promise<{ version: string | null; at: Date | null }> {
  const r = await cliente.query<{ accepted_terms_version: string | null; accepted_terms_at: Date | null }>(
    'SELECT accepted_terms_version, accepted_terms_at FROM users WHERE id = $1',
    [conta],
  );
  const linha = r.rows[0];
  assert.ok(linha !== undefined, 'a conta saiu da tabela no meio do teste');
  return { version: linha.accepted_terms_version, at: linha.accepted_terms_at };
}

void before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    // Verificação que não consegue verificar precisa REPROVAR. Pular aqui faria
    // a suíte ficar verde sem nunca ter lido `terms_acceptances` dentro do
    // Postgres, que é a única coisa que este arquivo existe para fazer.
    throw new Error(
      'DATABASE_URL não está definida. Este arquivo mede o aceite CHEGANDO à trilha, contra ' +
        'Postgres de verdade, e não tem versão em memória. Rode `npm run test:integration`, ' +
        'que sobe a pilha efêmera.',
    );
  }
  banco = createDb(CONEXAO);
  db = banco.db;
  await banco.ping();
  repositorio = criarIdentityRepository(db, criarIdGenerator(() => Number(AGORA)));

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

void describe('a recoleta do aceite dos termos chega a `terms_acceptances`', () => {
  void it('CONTROLE POSITIVO: a tabela `terms_acceptances` EXISTE e responde', async () => {
    // Vem primeiro de propósito. Sem ele, uma migração que não rodou faria os
    // casos abaixo falharem por motivo nenhum a ver com o que eles medem — e
    // "não achei a tabela" e "conferi e está certo" sairiam com a mesma cor.
    const r = await cliente.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM terms_acceptances',
    );
    assert.ok(
      r.rows[0] !== undefined,
      'REPROVA: `terms_acceptances` não respondeu a um `SELECT`. Sem a tabela não há trilha de ' +
        'consentimento, e o aceite volta a ser uma coluna que o próximo `UPDATE` apaga.',
    );
  });

  void it('ISCA 4: a recoleta GRAVA uma linha nova COM a versão, lida da TABELA', async () => {
    const conta = await criarConta();

    // A LINHA DE BASE, e ela é o defeito medido: conta sem aceite nenhum.
    assert.deepEqual(await trilhaDe(conta), [], 'a conta nasceu com trilha, e deveria nascer vazia');
    assert.equal((await correnteDe(conta)).version, null);

    const gravou = await repositorio.registrarAceiteDosTermos(conta, EXIGIDA, AGORA);
    assert.equal(gravou, true, 'a recoleta não encontrou a conta');

    const trilha = await trilhaDe(conta);
    assert.equal(
      trilha.length,
      1,
      'REPROVA: a recoleta não inseriu linha em `terms_acceptances`. A rota pode responder 204 ' +
        'sem gravar nada, e é exatamente por isso que este caso lê a tabela e não a resposta.',
    );
    assert.equal(
      trilha[0]?.version,
      EXIGIDA,
      'REPROVA: a linha da trilha não carrega a versão aceita. Aceite que não identifica o ' +
        'texto aceito não prova o que precisa provar — é o defeito de 01/11/2026 com data nova.',
    );
    assert.equal(
      trilha[0]?.source,
      'recollection',
      'REPROVA: a origem gravada não é `recollection`. É ela que responde "quantos aceites ' +
        'vieram da recoleta?", que é a medição do mecanismo.',
    );

    // E o valor CORRENTE aponta para o aceite novo: quem pergunta "qual a
    // versão desta conta hoje?" não tem de agregar nada.
    const corrente = await correnteDe(conta);
    assert.equal(corrente.version, EXIGIDA);
    assert.ok(corrente.at !== null, 'o instante do aceite ficou nulo com a versão presente');
  });

  void it('ISCA 5: o aceite ANTERIOR continua na trilha depois da recoleta', async () => {
    const conta = await criarConta();

    // O PASSADO PLANTADO À MÃO, nos números medidos: o aceite de `2026-09-17`,
    // a versão que nunca esteve no ar. É ele que não pode desaparecer.
    await cliente.query(
      `INSERT INTO terms_acceptances (id, user_id, version, accepted_at, source)
       VALUES (gen_random_uuid(), $1, $2, to_timestamp($3::double precision / 1000), 'signup')`,
      [conta, A_ANTIGA, Number(AGORA)],
    );
    await cliente.query(
      'UPDATE users SET accepted_terms_version = $2, accepted_terms_at = now() WHERE id = $1',
      [conta, A_ANTIGA],
    );

    await repositorio.registrarAceiteDosTermos(conta, EXIGIDA, DEPOIS);

    const trilha = await trilhaDe(conta);
    assert.equal(
      trilha.length,
      2,
      'REPROVA: a trilha tem ' +
        `${trilha.length} linha(s) e deveria ter 2. A recoleta SOBRESCREVEU o aceite anterior: ` +
        'a trilha de consentimento é a prova de quando a pessoa concordou com o quê, e apagá-la ' +
        'destrói a evidência de que houve consentimento antes — defeituoso ou não.',
    );
    assert.deepEqual(
      trilha.map((l) => l.version),
      [A_ANTIGA, EXIGIDA],
      'REPROVA: a ordem ou o conteúdo da trilha não é `2026-09-17` e depois `2026-09-23`. ' +
        'Apenda, nunca substitua.',
    );
    assert.deepEqual(trilha.map((l) => l.source), ['signup', 'recollection']);

    // O CORRENTE anda; a MEMÓRIA não é tocada. São as duas metades do desenho.
    assert.equal((await correnteDe(conta)).version, EXIGIDA);
  });

  void it('ISCA 6 (replante): o Postgres RECUSA aceite SEM versão', async () => {
    // O REPLANTE DO DEFEITO, pelo caminho que nenhum `if` do servidor guarda:
    // SQL direto na tabela, como uma migração futura ou um script de operação
    // faria. Era este o estado de 36 dos 37 registros medidos, e o caminho novo
    // tem de ser INCAPAZ de produzi-lo.
    const conta = await criarConta();

    await assert.rejects(
      cliente.query(
        `INSERT INTO terms_acceptances (id, user_id, version, source)
         VALUES (gen_random_uuid(), $1, NULL, 'recollection')`,
        [conta],
      ),
      (erro: unknown) => {
        const codigo = (erro as { code?: string }).code;
        assert.equal(
          codigo,
          '23502',
          `REPROVA: o Postgres aceitou (ou recusou por outro motivo, código ${String(codigo)}) ` +
            'uma linha de aceite com `version` NULA. `23502` é `not_null_violation`: é ele que ' +
            'torna o caminho novo incapaz de gravar o defeito que esta entrega conserta.',
        );
        return true;
      },
    );

    // E o vazio, que passa por `NOT NULL` e não identifica documento nenhum.
    for (const vazio of ['', '   ']) {
      await assert.rejects(
        cliente.query(
          `INSERT INTO terms_acceptances (id, user_id, version, source)
           VALUES (gen_random_uuid(), $1, $2, 'recollection')`,
          [conta, vazio],
        ),
        (erro: unknown) => {
          const e = erro as { code?: string; constraint?: string };
          assert.equal(
            e.code,
            '23514',
            `REPROVA: o Postgres aceitou \`version = ${JSON.stringify(vazio)}\`. ` +
              '`NOT NULL` não cobre vazio nem espaço, e os dois são aceite que não aponta para ' +
              'texto nenhum. Quem cobre é o `CHECK terms_acceptances_versao_nao_vazia`.',
          );
          assert.equal(e.constraint, 'terms_acceptances_versao_nao_vazia');
          return true;
        },
      );
    }

    // CONTROLE POSITIVO DO REPLANTE: a MESMA tabela, pelo MESMO caminho, aceita
    // a linha COM versão. Sem ele, uma tabela que recusasse tudo (ou um nome de
    // coluna errado) passaria nas três rejeições acima.
    const ok = await repositorio.registrarAceiteDosTermos(conta, EXIGIDA, AGORA);
    assert.equal(ok, true);
    assert.deepEqual((await trilhaDe(conta)).map((l) => l.version), [EXIGIDA]);
  });

  void it('a recoleta de conta INEXISTENTE não deixa trilha órfã', async () => {
    // A transação precisa DESFAZER. Kysely só desfaz ao lançar: um `return
    // false` depois do `INSERT` comitaria a linha de uma conta que não recebeu
    // o valor corrente, e o aceite ficaria registrado em metade dos dois
    // lugares.
    const fantasma = randomUUID() as UserId;
    const antes = await cliente.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM terms_acceptances',
    );

    await assert.rejects(
      repositorio.registrarAceiteDosTermos(fantasma, EXIGIDA, AGORA),
      'REPROVA: a recoleta de conta inexistente não falhou. A chave estrangeira de `user_id` é ' +
        'o que impede trilha órfã.',
    );

    const depois = await cliente.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM terms_acceptances',
    );
    assert.equal(
      depois.rows[0]?.total,
      antes.rows[0]?.total,
      'REPROVA: a contagem de `terms_acceptances` mudou. Sobrou linha de uma conta que não ' +
        'existe.',
    );
  });

  void it('o CADASTRO também nasce na trilha, e só COM versão', async () => {
    // Se a trilha só passasse a existir no dia da recoleta, o PRIMEIRO aceite
    // de cada conta ficaria de fora dela — e a prova de consentimento teria um
    // buraco exatamente no começo.
    const conta = await repositorio.criarContaLocal({
      email: `cadastro-com-aceite-${randomUUID()}@${DOMINIO_DE_TESTE}`,
      birthDate: '1991-03-22',
      handle: undefined,
      displayName: 'Marina',
      acceptedTermsVersion: EXIGIDA,
      passwordPhc: SENHA_PHC,
      agora: AGORA,
    });
    assert.ok(conta !== undefined, 'o cadastro não criou a conta');
    contasCriadas.push(conta.id);

    assert.deepEqual(
      (await trilhaDe(conta.id)).map((l) => ({ v: l.version, s: l.source })),
      [{ v: EXIGIDA, s: 'signup' }],
      'REPROVA: o cadastro não deixou linha na trilha. A recoleta compara contra o que está ' +
        'gravado: conta que nunca entrou na trilha é pedida de novo sem precisar.',
    );

    // E O CONTRÁRIO: cadastro SEM versão — o APK que não recebeu
    // `--dart-define=TERMS_VERSION`, que é a causa dos 36 nulos — **não ganha
    // linha**, porque linha sem versão é o defeito copiado para o lugar novo.
    const semAceite = await repositorio.criarContaLocal({
      email: `cadastro-sem-aceite-${randomUUID()}@${DOMINIO_DE_TESTE}`,
      birthDate: '1991-03-22',
      handle: undefined,
      displayName: 'Marina',
      acceptedTermsVersion: undefined,
      passwordPhc: SENHA_PHC,
      agora: AGORA,
    });
    assert.ok(semAceite !== undefined);
    contasCriadas.push(semAceite.id);

    assert.deepEqual(
      await trilhaDe(semAceite.id),
      [],
      'REPROVA: cadastro sem versão deixou linha na trilha. Seria o aceite sem versão gravado ' +
        'num lugar novo, que é o defeito e não o conserto.',
    );
    assert.equal((await correnteDe(semAceite.id)).version, null);
  });
});
