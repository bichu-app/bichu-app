/**
 * Os sete critérios do ADR-0006 contra PostGIS de verdade (BICHUS-20 e 18).
 *
 * ## Por que este arquivo não pode ser unitário
 *
 * **Dublê não prova nada aqui.** Um `Map` em memória devolve a lista que eu
 * escrevi nele, e nada do que está abaixo existe fora do banco:
 *
 * - **`ST_DWithin` sobre `geography`.** A distância é esférica, em metros, sobre
 *   o elipsoide. Um dublê que comparasse coordenadas com Pitágoras daria outro
 *   conjunto nas bordas, e daria conjuntos diferentes em Manaus e em Porto
 *   Alegre — que é exatamente o motivo de o ADR-0006 ter escolhido `geography`
 *   em vez de `geometry`.
 * - **O `EXISTS` sobre `user_devices`**, que é uma semi-junção que o planejador
 *   resolve com o índice parcial `user_devices_alcancaveis`. Em memória ele é
 *   um `.some()`.
 * - **O `count(*)` correlacionado de `alert_recipients`**, e junto dele o
 *   `ON DELETE CASCADE` que apaga os destinatários quando o disparo morre.
 * - **Os dois CHECK de `alert_dispatches`**: `reach_status = 'computed'` se e
 *   somente se `recipients_total IS NOT NULL`, e `dispatched_at >= requested_at`.
 *   Eles são a razão de o par mentiroso não ser exprimível, e um dublê não tem
 *   como recusar o que não conhece.
 * - **A chave composta de `alert_recipients`**, que torna a duplicata
 *   inexprimível e é o que impede o teto de fadiga de ser consumido duas vezes
 *   pela mesma pessoa no mesmo disparo.
 *
 * A medida exata disso está registrada pela BICHUS-91: com `revogarDoDono`
 * transformado em `no-op`, a **suíte unitária inteira ficou verde** — 1037
 * casos — e só a integração reprovou. A consulta desta história é PostGIS: o
 * ponto cego seria maior, não menor.
 *
 * ## Como rodar
 *
 *   npm run test:integration
 *
 * Pilha efêmera, projeto do compose derivado do caminho do worktree, banco
 * derrubado com `-v` no fim. Nada aqui toca a pilha de desenvolvimento.
 *
 * ## As iscas, e como foram provadas
 *
 * Desligadas uma a uma, rodadas contra a pilha efêmera e vistas reprovar em
 * 22/09/2026, e depois restauradas. A conferência de que o arquivo mudou foi
 * por CONTEÚDO e não por `git diff` — os arquivos desta história são novos e
 * não rastreados, e o `git diff` não teria o que mostrar.
 *
 * | o que foi desligado | integração |
 * |---|---|
 * | o `EXISTS` de `user_devices` (critério 4) | 3 casos |
 * | o `count(*)` de fadiga (critério 6) | 45 casos |
 * | `u.deleted_at IS NULL` (BICHUS-88) | **0 casos, desde 22/09** — ver abaixo |
 * | `url.user_id <> ...` (critério 5) | 1 caso |
 * | `url.expires_at > ...` (critério 2) | 1 caso |
 * | `concluir` virado `no-op` | 3 casos |
 *
 * A fadiga derruba 45 porque, sem ela, cada caso passa a enxergar as contas que
 * os outros criaram: a asserção de lista exata deixa de casar em quase toda a
 * suíte. Reprovação barulhenta, e é o que se quer de uma isca.
 *
 * **A linha da BICHUS-88 mudou de veredito em 22/09, e a mudança está medida.**
 * Com o gatilho da migração `20260922000006` no lugar, a linha de localização da
 * conta excluída deixa de existir no instante da exclusão lógica. Tirar
 * `u.deleted_at IS NULL` da consulta passou a NÃO reprovar caso nenhum desta
 * suíte: medido, 252 de 252 verdes com a cláusula removida. Isso não quer dizer
 * que a cláusula sobre; quer dizer que ela virou a SEGUNDA camada, e que esta
 * suíte deixou de ser quem a segura. Quem a segura agora é
 * `src/modules/lostfound/adapters/persistence/sete-criterios-na-consulta.test.ts`,
 * pelo texto do SQL — a mesma isca derruba 2 casos lá. Registrado aqui porque
 * uma tabela de iscas que promete uma reprovação que não acontece mais é pior
 * que nenhuma tabela: ela é a confiança falsa que ninguém vai conferir.
 *
 * **A última linha é a razão de este arquivo existir.** Com `concluir`
 * transformado em `no-op`, a suíte unitária inteira ficou **verde — 1106 casos,
 * zero falhas** — porque todo teste sem banco fala com um dublê de
 * `RegistroDeDisparos` que guarda o que recebeu. Aqui reprovaram três: o
 * disparo não virou `computed`, `alert_recipients` ficou vazia, e o teto de
 * fadiga não foi consumido. É a medida exata do que só o banco prova, e é o
 * mesmo número que a BICHUS-91 mediu com `revogarDoDono`.
 *
 * ## O que sobrevive à execução
 *
 * Nada. As contas criadas são apagadas no `after`, e o `ON DELETE CASCADE` leva
 * localização, aparelho, pet, caso, disparo e destinatários junto.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type Db, type DbHandle } from '../../src/shared/db/pool.js';
import { criarAlcancePorPostGIS } from '../../src/modules/lostfound/adapters/persistence/kysely-alcance-por-postgis.js';
import { criarRegistroDeDisparos } from '../../src/modules/lostfound/adapters/persistence/kysely-registro-de-disparos.js';
import { DisparoDoAlertaService } from '../../src/modules/lostfound/application/disparo-do-alerta-service.js';
import {
  contagemDe,
  JANELA_DE_24H_EM_MS,
  TETO_DE_FADIGA,
} from '../../src/modules/lostfound/domain/disparo-do-alerta.js';
import type { AlcanceDoAlerta } from '../../src/modules/lostfound/ports/alcance-do-alerta.js';
import type { RegistroDeDisparos } from '../../src/modules/lostfound/ports/registro-de-disparos.js';
import type { AvisoDeVizinhanca } from '../../src/modules/lostfound/ports/entrega-do-alerta.js';
import type { CaseId, Instant, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

const AGORA = 1_800_000_000_000 as Instant;
const RAIO = 5000;

/** Onde o pet sumiu. Praça em Pinheiros, São Paulo. */
const CENTRO = { lat: -23.5665, lon: -46.6935 };

/** `.invalid` é reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

/**
 * Um grau de latitude são ~111.320 m no equador. Deslocar só a latitude mantém
 * a conta simples e independente da longitude, que encolhe com o cosseno da
 * latitude e daria distâncias diferentes em cada região.
 *
 * **Isto é uma aproximação, e o erro é real**: o meridiano encolhe para ~110.900
 * m por grau nesta latitude, então um ponto pedido a 5.000 m cai a ~4.981 m.
 * Para os casos folgados (4 km contra 6 km) isso não muda nada; o caso da borda
 * mede a distância no próprio banco antes de afirmar de que lado cada ponto
 * está, em vez de confiar nesta função.
 */
function aNorteDoCentro(metros: number): { lat: number; lon: number } {
  return { lat: CENTRO.lat + metros / 111_320, lon: CENTRO.lon };
}

let banco: DbHandle;
let db: Db;
let cliente: pg.Client;
let alcance: AlcanceDoAlerta;
let disparos: RegistroDeDisparos;
const contasCriadas: UserId[] = [];

async function criarConta(): Promise<UserId> {
  const id = randomUUID() as UserId;
  await cliente.query('INSERT INTO users (id, email) VALUES ($1, $2)', [
    id,
    `bichus20-${id}@${DOMINIO_DE_TESTE}`,
  ]);
  contasCriadas.push(id);
  return id;
}

async function darLocalizacao(
  dono: UserId,
  ponto: { lat: number; lon: number },
  opcoes: { vencida?: boolean; familia?: string } = {},
): Promise<void> {
  const { familia } = opcoes;
  const capturada = new Date(Number(AGORA) - 60_000);
  // Vencida = `expires_at` no passado. É a coluna que a consulta compara, e a
  // BICHUS-92 a gravou justamente para que mudar a janela não reescreva o
  // passado.
  const expira = new Date(Number(AGORA) + (opcoes.vencida === true ? -1000 : 86_400_000));
  await cliente.query(
    // SEC-021: `session_family_id` é a sessão de aparelho, e é NOT NULL desde a
    // migração 20260923000001. Um valor sorteado por chamada é o que permite a
    // mesma pessoa aparecer com DOIS aparelhos quando o caso precisa disso.
    `INSERT INTO user_reference_locations
       (user_id, session_family_id, reference_point, precision_m, source,
        captured_at, expires_at)
     VALUES ($1, $6, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 100, 'map_pin', $4, $5)`,
    [dono, ponto.lon, ponto.lat, capturada, expira, familia ?? randomUUID()],
  );
}

async function darAparelho(
  dono: UserId,
  opcoes: { permissao?: string; comToken?: boolean } = {},
): Promise<string> {
  const id = randomUUID();
  const permissao = opcoes.permissao ?? 'granted';
  const temToken = opcoes.comToken ?? true;
  await cliente.query(
    `INSERT INTO user_devices
       (id, user_id, platform, push_token, push_permission, registered_at, last_seen_at)
     VALUES ($1, $2, 'android', $3, $4, $5, $5)`,
    [id, dono, temToken ? `fcm-${id}` : null, permissao, new Date(Number(AGORA))],
  );
  return id;
}

/** Um vizinho completo: localização válida no ponto dado e um aparelho alcançável. */
async function vizinhoEm(ponto: { lat: number; lon: number }): Promise<UserId> {
  const conta = await criarConta();
  await darLocalizacao(conta, ponto);
  await darAparelho(conta);
  return conta;
}

async function criarPetECaso(
  tutor: UserId,
  opcoes: { comPonto?: boolean } = {},
): Promise<CaseId> {
  const pet = randomUUID();
  await cliente.query(
    `INSERT INTO pets (id, owner_user_id, name, species_code, size_code)
     VALUES ($1, $2, 'Maia', 'dog', 'M')`,
    [pet, tutor],
  );
  const caso = randomUUID() as CaseId;
  const comPonto = opcoes.comPonto ?? true;
  await cliente.query(
    `INSERT INTO lost_cases
       (id, pet_id, owner_user_id, last_seen_at, last_seen_point,
        last_seen_city, last_seen_neighborhood, share_token)
     VALUES ($1, $2, $3, $4,
             CASE WHEN $5::boolean
                  THEN ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography
                  ELSE NULL END,
             'São Paulo', 'Pinheiros', $8)`,
    [caso, pet, tutor, new Date(Number(AGORA) - 3_600_000), comPonto, CENTRO.lon, CENTRO.lat, `c-${caso}`],
  );
  return caso;
}

/** Marca que esta conta recebeu `n` alertas dentro da janela de fadiga. */
async function darAlertasRecebidos(conta: UserId, n: number, haQuantoMs = 3_600_000): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    const caso = await criarPetECaso(await criarConta());
    const disparo = randomUUID();
    await cliente.query(
      `INSERT INTO alert_dispatches
         (id, case_id, radius_m, reach_status, recipients_total, requested_at, dispatched_at)
       VALUES ($1, $2, $3, 'computed', 1, $4, $4)`,
      [disparo, caso, RAIO, new Date(Number(AGORA) - haQuantoMs)],
    );
    await cliente.query(
      `INSERT INTO alert_recipients (dispatch_id, user_id, notified_at) VALUES ($1, $2, $3)`,
      [disparo, conta, new Date(Number(AGORA) - haQuantoMs)],
    );
  }
}

function consulta(tutor: UserId) {
  return { centro: CENTRO, raioEmMetros: RAIO, excluir: tutor, agora: AGORA };
}

async function contasAlcancadas(tutor: UserId): Promise<UserId[]> {
  const r = await alcance.alcancaveis(consulta(tutor));
  assert.ok(r !== null, 'a consulta devolveu `null` contra um banco que respondeu');
  return r.destinatarios.map((d) => d.usuario);
}

void before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    // Verificação que não consegue verificar precisa REPROVAR. Pular aqui faria
    // a suíte ficar verde sem nunca ter tocado em `ST_DWithin`, que é
    // exatamente o que este arquivo existe para provar.
    throw new Error(
      'DATABASE_URL não está definida. Este arquivo mede `ST_DWithin` sobre ' +
        '`geography`, um `EXISTS` sobre índice parcial e dois CHECK de esquema contra ' +
        'Postgres de verdade, e não tem versão em memória. Rode ' +
        '`npm run test:integration`, que sobe a pilha efêmera.',
    );
  }
  banco = createDb(CONEXAO);
  db = banco.db;
  await banco.ping();
  alcance = criarAlcancePorPostGIS(db);
  disparos = criarRegistroDeDisparos(db);

  cliente = new pg.Client({ connectionString: CONEXAO });
  await cliente.connect();
});

void beforeEach(async () => {
  // Cada caso monta a sua vizinhança. Sem esta limpeza, o teto de fadiga de um
  // caso contaria os destinatários do anterior, e o defeito apareceria como
  // "passa sozinho e reprova na suíte" — a família mais cara de investigar.
  if (contasCriadas.length > 0) {
    await cliente.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [contasCriadas]);
    contasCriadas.length = 0;
  }
});

void after(async () => {
  if (contasCriadas.length > 0) {
    await cliente.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [contasCriadas]);
  }
  await cliente.end();
  await banco.close();
});

void describe('critério 3: o raio de 5 km é medido sobre o elipsoide', () => {
  void it('o vizinho a 4 km entra e o de 6 km fica de fora', async () => {
    const tutor = await criarConta();
    const perto = await vizinhoEm(aNorteDoCentro(4000));
    const longe = await vizinhoEm(aNorteDoCentro(6000));

    const alcancados = await contasAlcancadas(tutor);

    assert.ok(alcancados.includes(perto), 'o vizinho a 4 km ficou de fora do raio de 5 km');
    assert.ok(!alcancados.includes(longe), 'o vizinho a 6 km entrou num raio de 5 km');
  });

  void it('a borda separa os dois lados, e o BANCO diz de que lado cada um está', async () => {
    // A diferença entre `geography` e `geometry` mora aqui: a distância é
    // esférica, em metros sobre o elipsoide.
    //
    // **O teste não confia na minha aritmética de graus para metros**, e a
    // primeira versão dele mostrou por quê: `aNorteDoCentro` usa 111.320 m por
    // grau, que é o comprimento no equador, e o meridiano encolhe para ~110.900
    // nesta latitude. Um ponto pedido a 5.010 m caiu a 4.992 m reais, DENTRO do
    // raio, e o caso reprovou acusando a consulta de um defeito que era do
    // fixture. Agora o lado de cada ponto é medido pelo próprio PostGIS antes
    // da asserção: a régua do teste passa a ser a mesma régua da consulta.
    const tutor = await criarConta();
    const dentro = await vizinhoEm(aNorteDoCentro(4900));
    const fora = await vizinhoEm(aNorteDoCentro(5100));

    const medida = await cliente.query<{ user_id: string; metros: number }>(
      `SELECT user_id,
              ST_Distance(reference_point,
                          ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography) AS metros
         FROM user_reference_locations WHERE user_id = ANY($1::uuid[])`,
      [[dentro, fora], CENTRO.lon, CENTRO.lat],
    );
    const metrosDe = new Map(medida.rows.map((l) => [l.user_id, Number(l.metros)]));
    assert.ok(
      (metrosDe.get(dentro) ?? Infinity) < RAIO,
      `o fixture "dentro" caiu a ${String(metrosDe.get(dentro))} m, fora do raio`,
    );
    assert.ok(
      (metrosDe.get(fora) ?? 0) > RAIO,
      `o fixture "fora" caiu a ${String(metrosDe.get(fora))} m, dentro do raio`,
    );

    const alcancados = await contasAlcancadas(tutor);

    assert.ok(alcancados.includes(dentro));
    assert.ok(!alcancados.includes(fora));
  });

  void it('a ordem é por distância crescente', async () => {
    // Critério 9 da BICHUS-18. Com o teto de 500 e sem ordem, quem fica de fora
    // passa a ser sorteado pelo plano do banco em vez de ser quem está mais
    // longe.
    const tutor = await criarConta();
    const longe = await vizinhoEm(aNorteDoCentro(4000));
    const meio = await vizinhoEm(aNorteDoCentro(2000));
    const perto = await vizinhoEm(aNorteDoCentro(500));

    assert.deepEqual(await contasAlcancadas(tutor), [perto, meio, longe]);
  });
});

void describe('SEC-021: dois aparelhos da mesma pessoa, um destinatário só', () => {
  void it('duas regiões dentro do raio NÃO devolvem a pessoa duas vezes', async () => {
    const tutor = await criarConta();
    const vizinha = await criarConta();
    await darAparelho(vizinha);
    // A MESMA pessoa em dois aparelhos, os dois dentro do raio de 5 km: o
    // tablet a 1 km e o celular a 4 km. É o estado que a decisão do cliente de
    // 23/09 tornou possível.
    await darLocalizacao(vizinha, aNorteDoCentro(1000), { familia: randomUUID() });
    await darLocalizacao(vizinha, aNorteDoCentro(4000), { familia: randomUUID() });

    const r = await alcance.alcancaveis(consulta(tutor));
    assert.ok(r !== null);

    const quantasVezes = r.destinatarios.filter((d) => d.usuario === vizinha).length;
    // ISCA: tire `GROUP BY url.user_id` de `construtorDoAlcance` e este caso
    // reprova com 2. O estrago não é cosmético: a pessoa receberia o MESMO
    // alerta duas vezes, gastaria dois dos três lugares do teto de fadiga de
    // 24 h e ocuparia dois dos 500 lugares do teto de destinatários — tirando
    // outro tutor do alerta.
    assert.equal(
      quantasVezes,
      1,
      `a pessoa apareceu ${quantasVezes} vezes na lista de destinatários. Com a ` +
        'localização por aparelho, cada aparelho dentro do raio é uma linha, e sem ' +
        'agrupamento cada linha vira um destinatário.',
    );
  });

  void it('a região do OUTRO aparelho basta: perto do trabalho, longe de casa', async () => {
    const tutor = await criarConta();
    const vizinha = await criarConta();
    await darAparelho(vizinha);
    // Casa longe (9 km, fora do raio), trabalho perto (2 km, dentro). Antes da
    // SEC-021 a pessoa só tinha a ÚLTIMA localização informada; agora tem as
    // duas, e é alcançada pela que está perto.
    await darLocalizacao(vizinha, aNorteDoCentro(9000), { familia: randomUUID() });
    await darLocalizacao(vizinha, aNorteDoCentro(2000), { familia: randomUUID() });

    const alcancados = await contasAlcancadas(tutor);

    assert.ok(
      alcancados.includes(vizinha),
      'a pessoa ficou de fora do alerta mesmo tendo um aparelho a 2 km do caso. É o ' +
        'ganho que a decisão do cliente de 23/09 pediu: ser alcançável por caso aberto ' +
        'perto de qualquer um dos lugares em que ela está.',
    );
  });
});

void describe('critério 2: a localização vale 30 dias', () => {
  void it('a localização vencida tira a conta da base de alerta', async () => {
    // Critério 12 da BICHUS-18: aquele usuário está fora até informar de novo.
    // A linha continua no banco até o expurgo do worker; o que a tira do
    // alerta é o `WHERE`, e não o expurgo.
    const tutor = await criarConta();
    const vencido = await criarConta();
    await darLocalizacao(vencido, aNorteDoCentro(1000), { vencida: true });
    await darAparelho(vencido);

    assert.ok(!(await contasAlcancadas(tutor)).includes(vencido));
  });
});

void describe('critérios 1 e 4: quem tem como receber', () => {
  void it('sem localização a conta não é candidata, mesmo com aparelho pronto', async () => {
    const tutor = await criarConta();
    const semLugar = await criarConta();
    await darAparelho(semLugar);

    assert.ok(!(await contasAlcancadas(tutor)).includes(semLugar));
  });

  void it('permissão `denied` não recebe, e continua registrada no banco', async () => {
    // O ADR-0008 manda registrar quem negou para a métrica ser honesta: a linha
    // existe, e a consulta não a conta.
    const tutor = await criarConta();
    const negou = await criarConta();
    await darLocalizacao(negou, aNorteDoCentro(1000));
    await darAparelho(negou, { permissao: 'denied' });

    assert.ok(!(await contasAlcancadas(tutor)).includes(negou));
    const r = await cliente.query('SELECT 1 FROM user_devices WHERE user_id = $1', [negou]);
    assert.equal(r.rowCount, 1, 'a linha de quem negou sumiu do banco');
  });

  void it('`granted` SEM token não recebe: não há endereço para onde mandar', async () => {
    // A janela real do iOS entre "a pessoa tocou em Permitir" e "o token
    // chegou". Contá-la infla `reachable_tutors` com aparelhos inalcançáveis.
    const tutor = await criarConta();
    const semToken = await criarConta();
    await darLocalizacao(semToken, aNorteDoCentro(1000));
    await darAparelho(semToken, { comToken: false });

    assert.ok(!(await contasAlcancadas(tutor)).includes(semToken));
  });

  void it('um aparelho alcançável basta, e os identificadores vêm junto', async () => {
    const tutor = await criarConta();
    const conta = await criarConta();
    await darLocalizacao(conta, aNorteDoCentro(1000));
    await darAparelho(conta, { permissao: 'denied' });
    const bom = await darAparelho(conta);

    const r = await alcance.alcancaveis(consulta(tutor));
    const destinatario = r?.destinatarios.find((d) => d.usuario === conta);

    assert.ok(destinatario !== undefined, 'a conta com um aparelho bom ficou de fora');
    // SÓ o alcançável. Se o `denied` viesse junto, o disparo tentaria mandar
    // para ele, `enderecoDeEnvio` devolveria `null` e a tentativa seria pura
    // perda — mas o número de pessoas continuaria certo, e é por isso que este
    // caso olha a lista de aparelhos e não a contagem.
    assert.deepEqual(destinatario.aparelhos, [bom]);
  });
});

void describe('critério 5: o tutor não se alerta a si mesmo', () => {
  void it('o tutor do caso fica de fora mesmo estando perto e alcançável', async () => {
    const tutor = await criarConta();
    await darLocalizacao(tutor, aNorteDoCentro(500));
    await darAparelho(tutor);
    const vizinho = await vizinhoEm(aNorteDoCentro(1000));

    const alcancados = await contasAlcancadas(tutor);

    assert.ok(!alcancados.includes(tutor), 'o tutor recebeu o alerta do próprio pet');
    assert.deepEqual(alcancados, [vizinho]);
  });
});

void describe('critério 6: o teto de fadiga é por usuário', () => {
  void it('quem recebeu 3 alertas em 24 h não recebe o quarto', async () => {
    const tutor = await criarConta();
    const cansado = await vizinhoEm(aNorteDoCentro(500));
    await darAlertasRecebidos(cansado, TETO_DE_FADIGA);

    assert.ok(!(await contasAlcancadas(tutor)).includes(cansado));
  });

  void it('quem recebeu 2 ainda recebe o terceiro', async () => {
    // A borda do outro lado. Sem este caso, um teto quebrado para `>= 1`
    // passaria pelo caso acima sem ninguém notar.
    const tutor = await criarConta();
    const quase = await vizinhoEm(aNorteDoCentro(500));
    await darAlertasRecebidos(quase, TETO_DE_FADIGA - 1);

    assert.ok((await contasAlcancadas(tutor)).includes(quase));
  });

  void it('alerta de 25 h atrás não conta: a janela anda', async () => {
    const tutor = await criarConta();
    const conta = await vizinhoEm(aNorteDoCentro(500));
    await darAlertasRecebidos(conta, TETO_DE_FADIGA, JANELA_DE_24H_EM_MS + 3_600_000);

    assert.ok((await contasAlcancadas(tutor)).includes(conta));
  });

  void it('o teto é POR USUÁRIO: o vizinho cansado sai e o descansado fica', async () => {
    // Critério 10 da BICHUS-18, textual. Um teto correlacionado errado viraria
    // global e tiraria os dois — e o produto pararia de alertar depois do
    // terceiro caso do dia em qualquer lugar do Brasil.
    const tutor = await criarConta();
    const cansado = await vizinhoEm(aNorteDoCentro(500));
    const descansado = await vizinhoEm(aNorteDoCentro(1000));
    await darAlertasRecebidos(cansado, TETO_DE_FADIGA);

    assert.deepEqual(await contasAlcancadas(tutor), [descansado]);
  });
});

void describe('BICHUS-88: a conta logicamente excluída sai do alcance', () => {
  void it('entre a exclusão lógica e o expurgo, a conta NÃO é alertada', async () => {
    // O critério 12 da BICHUS-88 diz que a exclusão lógica é imediata e o
    // expurgo definitivo acontece em 30 dias. Este caso é a prova de que o
    // `WHERE` desta consulta já a exclui.
    const tutor = await criarConta();
    const saindo = await vizinhoEm(aNorteDoCentro(500));
    await cliente.query('UPDATE users SET deleted_at = $2 WHERE id = $1', [
      saindo,
      new Date(Number(AGORA) - 1000),
    ]);

    assert.ok(
      !(await contasAlcancadas(tutor)).includes(saindo),
      'o alerta iria para quem pediu para sair do produto',
    );
  });

  void it('e a linha de localização dela também não casa mais com ST_DWithin', async () => {
    // ESTE CASO ESTAVA INVERTIDO ATÉ 22/09/2026, E DE PROPÓSITO. Ele exigia
    // `count = '1'` e a mensagem dizia: "a linha de localização da conta
    // excluída sumiu sozinha. Se isso mudou, a BICHUS-88 foi consertada em
    // outro lugar e a junção com `users` desta consulta merece ser revisitada
    // — mas não removida sem prova." Ele era o registro do defeito, não uma
    // regra: quem o escreveu provou os dois lados e não consertou de lado.
    //
    // O defeito foi consertado, e em outro lugar mesmo: a migração
    // `20260922000006` apaga a linha no instante da exclusão lógica, por
    // gatilho em `users`. A prova pedida está em
    // `tests/integration/localizacao-apos-exclusao-logica.test.ts`, que mede
    // com consultas que NÃO juntam `users` e NÃO mencionam `deleted_at`.
    //
    // A junção com `users` desta consulta fica onde está. Ela deixou de ser a
    // única defesa e virou a segunda; tirá-la agora trocaria duas camadas por
    // uma, sem ganho nenhum.
    const saindo = await vizinhoEm(aNorteDoCentro(500));
    await cliente.query('UPDATE users SET deleted_at = now() WHERE id = $1', [saindo]);

    const r = await cliente.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM user_reference_locations url
        WHERE url.user_id = $1
          AND ST_DWithin(url.reference_point,
                         ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4)`,
      [saindo, CENTRO.lon, CENTRO.lat, RAIO],
    );
    assert.equal(
      r.rows[0]?.n,
      '0',
      'a linha de localização sobreviveu à exclusão lógica. O gatilho da migração ' +
        '`20260922000006` saiu, e a proteção voltou a morar na cláusula `u.deleted_at ' +
        'IS NULL` da consulta de quem lê — que é o defeito da BICHUS-88 de volta.',
    );
  });
});

void describe('a contagem e a lista saem da MESMA consulta', () => {
  void it('`reachable_tutors` é o tamanho exato da lista de destinatários', async () => {
    // O critério 9 da BICHUS-20 contra o banco. Com duas consultas, este caso
    // passaria nos dias em que elas concordassem — que são todos, até o dia em
    // que alguém mexer numa só.
    const tutor = await criarConta();
    await vizinhoEm(aNorteDoCentro(500));
    await vizinhoEm(aNorteDoCentro(1500));
    await vizinhoEm(aNorteDoCentro(6000));

    const r = await alcance.alcancaveis(consulta(tutor));

    assert.equal(contagemDe(r), 2);
    assert.equal(r?.destinatarios.length, 2);
  });

  void it('sem ninguém por perto a resposta é lista VAZIA, e não `null`', async () => {
    // A distinção que a BICHUS-20 existe para preservar: "não há ninguém num
    // raio de 5 km" é uma resposta, e `unavailable` é outra.
    const tutor = await criarConta();

    const r = await alcance.alcancaveis(consulta(tutor));

    assert.deepEqual(r, { destinatarios: [], tetoAtingido: false });
    assert.equal(contagemDe(r), 0);
  });
});

void describe('o esquema do disparo recusa o par mentiroso', () => {
  void it('`computed` sem total é recusado pelo banco', async () => {
    const caso = await criarPetECaso(await criarConta());
    await assert.rejects(
      () =>
        cliente.query(
          `INSERT INTO alert_dispatches (id, case_id, radius_m, reach_status, recipients_total, requested_at)
           VALUES ($1, $2, $3, 'computed', NULL, now())`,
          [randomUUID(), caso, RAIO],
        ),
      /alert_dispatches_total_so_quando_calculado/,
      'o banco aceitou um disparo que diz ter calculado e não tem número',
    );
  });

  void it('`unavailable` COM total é recusado pelo banco', async () => {
    // O lado que engana de verdade: um número ao lado de "não conseguimos
    // calcular" seria lido como número.
    const caso = await criarPetECaso(await criarConta());
    await assert.rejects(
      () =>
        cliente.query(
          `INSERT INTO alert_dispatches (id, case_id, radius_m, reach_status, recipients_total, requested_at)
           VALUES ($1, $2, $3, 'unavailable', 12, now())`,
          [randomUUID(), caso, RAIO],
        ),
      /alert_dispatches_total_so_quando_calculado/,
      'o banco aceitou um disparo que não calculou e mesmo assim tem número',
    );
  });

  void it('a mesma conta não entra duas vezes no mesmo disparo', async () => {
    // A chave composta. Uma segunda linha consumiria o teto de fadiga duas
    // vezes e tiraria do alerta seguinte alguém que tinha direito a ele.
    const caso = await criarPetECaso(await criarConta());
    const conta = await criarConta();
    const disparo = randomUUID();
    await cliente.query(
      `INSERT INTO alert_dispatches (id, case_id, radius_m, reach_status, recipients_total, requested_at, dispatched_at)
       VALUES ($1, $2, $3, 'computed', 1, now(), now())`,
      [disparo, caso, RAIO],
    );
    await cliente.query(
      'INSERT INTO alert_recipients (dispatch_id, user_id, notified_at) VALUES ($1, $2, now())',
      [disparo, conta],
    );

    await assert.rejects(
      () =>
        cliente.query(
          'INSERT INTO alert_recipients (dispatch_id, user_id, notified_at) VALUES ($1, $2, now())',
          [disparo, conta],
        ),
      /alert_recipients_pkey/,
    );
  });
});

void describe('o disparo inteiro, contra o banco', () => {
  /** O serviço com uma entrega que só registra: o transporte não é o assunto aqui. */
  function servico(avisos: AvisoDeVizinhanca[]): DisparoDoAlertaService {
    return new DisparoDoAlertaService({
      disparos,
      alcance,
      entrega: {
        avisar: (aviso) => {
          avisos.push(aviso);
          return Promise.resolve('aceito');
        },
      },
      clock: { now: () => AGORA },
      urlDeMidia: (chave) => `https://midia.bichu.test/${chave}`,
    });
  }

  void it('grava o disparo, os destinatários, e manda para cada aparelho', async () => {
    const tutor = await criarConta();
    const caso = await criarPetECaso(tutor);
    const perto = await vizinhoEm(aNorteDoCentro(500));
    const longe = await vizinhoEm(aNorteDoCentro(6000));
    await disparos.abrir({
      id: randomUUID(),
      caso,
      raioEmMetros: RAIO,
      estado: 'queued',
      pedidoEm: AGORA,
    });

    const avisos: AvisoDeVizinhanca[] = [];
    const desfecho = await servico(avisos).disparar(caso);

    assert.deepEqual(desfecho, { tipo: 'rodou', estado: 'computed', avisados: 1 });

    const gravado = await disparos.ultimoDoCaso(caso);
    assert.equal(gravado?.estado, 'computed');
    assert.equal(gravado?.destinatarios, 1);
    assert.ok(gravado?.enviadoEm !== null);

    const r = await cliente.query<{ user_id: string }>(
      'SELECT user_id FROM alert_recipients WHERE dispatch_id = $1',
      [gravado?.id],
    );
    assert.deepEqual(
      r.rows.map((l) => l.user_id),
      [perto],
    );
    assert.equal(avisos.length, 1);
    assert.ok(!r.rows.some((l) => l.user_id === longe));
    assert.ok(!r.rows.some((l) => l.user_id === tutor));
  });

  void it('critério 7: o segundo disparo do mesmo caso em 24 h é recusado', async () => {
    // O que só o banco prova aqui: que `dispatched_at` gravado pela primeira
    // passada é lido pela segunda. Em memória, isto seria um booleano no dublê.
    const tutor = await criarConta();
    const caso = await criarPetECaso(tutor);
    await vizinhoEm(aNorteDoCentro(500));
    await disparos.abrir({
      id: randomUUID(),
      caso,
      raioEmMetros: RAIO,
      estado: 'queued',
      pedidoEm: AGORA,
    });

    const avisos: AvisoDeVizinhanca[] = [];
    const s = servico(avisos);
    await s.disparar(caso);
    const segundo = await s.disparar(caso);

    assert.deepEqual(segundo, { tipo: 'jaDisparou' });
    assert.equal(avisos.length, 1, 'a vizinhança foi acordada duas vezes pelo mesmo caso');
  });

  void it('o disparo consome o teto de fadiga de quem foi avisado', async () => {
    // A ponta solta que fecha o ciclo: o que o disparo GRAVA é o que o
    // critério 6 LÊ. Sem este caso, as duas metades poderiam estar certas
    // separadamente e não se encontrar nunca.
    const caso = await criarPetECaso(await criarConta());
    const vizinho = await vizinhoEm(aNorteDoCentro(500));
    await disparos.abrir({
      id: randomUUID(),
      caso,
      raioEmMetros: RAIO,
      estado: 'queued',
      pedidoEm: AGORA,
    });
    await servico([]).disparar(caso);

    // Depois de um alerta recebido, ele ainda tem dois. Depois de mais dois,
    // não tem mais nenhum.
    const outroTutor = await criarConta();
    assert.ok((await contasAlcancadas(outroTutor)).includes(vizinho));
    await darAlertasRecebidos(vizinho, TETO_DE_FADIGA - 1);
    assert.ok(!(await contasAlcancadas(outroTutor)).includes(vizinho));
  });

  void it('caso sem coordenada não dispara, e o estado inicial diz por quê', async () => {
    // Critério 14 da BICHUS-18: sem centro não há raio. `no_location` e não
    // falha de envio, e sem retentativa.
    const tutor = await criarConta();
    const caso = await criarPetECaso(tutor, { comPonto: false });
    await vizinhoEm(aNorteDoCentro(500));
    await disparos.abrir({
      id: randomUUID(),
      caso,
      raioEmMetros: RAIO,
      estado: 'no_location',
      pedidoEm: AGORA,
    });

    const avisos: AvisoDeVizinhanca[] = [];
    assert.deepEqual(await servico(avisos).disparar(caso), { tipo: 'semCentro' });
    assert.deepEqual(avisos, []);
  });
});

void describe('o plano do banco usa os índices que a migração criou', () => {
  void it('a consulta de alcance usa o índice GiST da localização', async () => {
    // Um índice que o planejador ignora é um índice que não existe no momento
    // em que ele importa, e nada além do banco diz isso. `SET enable_seqscan`
    // é desligado para que a escolha apareça: com poucas linhas o planejador
    // prefere varrer, e a pergunta aqui é se ele CONSEGUE usar o índice.
    await cliente.query('SET enable_seqscan = off');
    try {
      const r = await cliente.query<{ 'QUERY PLAN': string }>(
        `EXPLAIN SELECT 1 FROM user_reference_locations url
          WHERE ST_DWithin(url.reference_point,
                           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)`,
        [CENTRO.lon, CENTRO.lat, RAIO],
      );
      const plano = r.rows.map((l) => l['QUERY PLAN']).join('\n');
      assert.match(
        plano,
        /user_reference_locations_por_lugar/,
        `o planejador não alcançou o índice GiST. Plano:\n${plano}`,
      );
    } finally {
      await cliente.query('SET enable_seqscan = on');
    }
  });
});
