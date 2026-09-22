/**
 * Os sete critérios do ADR-0006 estão na consulta, e o SQL compilado prova.
 *
 * ## Por que conferir o SQL, e não só o comportamento
 *
 * O teste de comportamento existe, roda contra PostGIS de verdade e está em
 * `tests/integration/alcance-e-disparo.test.ts`. Ele é necessário e não é
 * suficiente, pelo mesmo motivo dos arquivos irmãos da BICHUS-91 e da
 * BICHUS-92: ele passa igual se a consulta trouxer a linha e um `if` na
 * aplicação a descartar depois. As duas implementações são indistinguíveis do
 * lado de fora **até** o dia em que alguém mexe no `if` — e aí não existe teste
 * que acuse, porque o `if` era o teste.
 *
 * **A isca daqui tem que provar que a CONSULTA filtra, não que um dublê
 * recusou.** É por isso que este arquivo compila o construtor de verdade, com o
 * mesmo compilador de dialeto que a aplicação usa, em vez de comparar contra um
 * SQL escrito à mão: uma cópia no teste continuaria certa depois de alguém
 * apagar um critério do arquivo real.
 *
 * ## O que esta conferência pega, e o que ela não pega
 *
 * Ela pega a **ausência** de um predicado e a troca de operador. Ela não pega
 * semântica: uma consulta que trocasse `granted` por `denied` nas quatro cópias
 * do predicado ao mesmo tempo passaria por aqui, e quem pega isso é
 * `aparelho.test.ts`, que mede o valor. Dizer o alcance em voz alta é o que
 * impede esta conferência de virar conforto.
 *
 * ## O quarto lugar do mesmo predicado
 *
 * Os critérios 1 e 4 do ADR-0006 estão escritos quatro vezes: no domínio
 * (`podeReceberPush`), no repositório de aparelhos (`construtorDosAlcancaveis`),
 * no predicado parcial do índice `user_devices_alcancaveis`, e agora no `EXISTS`
 * desta consulta. A BICHUS-91 já cobrava as três primeiras; o caso final deste
 * arquivo acrescenta a quarta, porque uma consulta cujo `EXISTS` divergisse do
 * índice pararia de usá-lo e viraria varredura no pior instante do produto, sem
 * ninguém perceber.
 *
 * ## As iscas, e como foram provadas
 *
 * Desligadas em `kysely-alcance-por-postgis.ts`, rodadas e vistas reprovar em
 * 22/09/2026, e depois restauradas. Antes de cada rodada o arquivo foi
 * comparado consigo mesmo por conteúdo, porque uma substituição que não casa
 * deixa o arquivo idêntico e a isca passa por não ter mudado nada:
 *
 * | o que foi desligado | reprovaram, aqui |
 * |---|---|
 * | `url.expires_at > ...` removido (validade de 30 dias) | 1 caso |
 * | `ST_DWithin` trocado por `ST_Distance(...) <= raio` | 1 caso |
 * | `url.user_id <> ...` removido (o próprio tutor) | 1 caso |
 * | o `EXISTS` de `user_devices` removido | 1 caso |
 * | o `count(*)` de `alert_recipients` removido (fadiga) | 4 casos |
 * | `u.deleted_at IS NULL` removido (BICHUS-88) | 1 caso |
 * | `LIMIT` removido (teto de 500) | 1 caso |
 * | `ORDER BY ST_Distance` removido | 1 caso |
 * | um `count(*)` a mais projetado na consulta | 1 caso |
 *
 * A base é 16 casos verdes. A contagem da fadiga derruba quatro porque o
 * `count(*)` dela também é o que sustenta o caso do "não existe COUNT de
 * destinatários" e o do teto por usuário — o mesmo predicado é cobrado de
 * quatro ângulos, e apagá-lo derruba os quatro.
 *
 * **A primeira rodada destas iscas relatou "arquivo idêntico" nas nove**, e era
 * falso: a conferência usava `git diff`, e estes arquivos são novos e não
 * rastreados, então o `git diff` não tinha o que mostrar. Trocada por
 * comparação de conteúdo, cada substituição mostrou a diferença em bytes e cada
 * isca reprovou. Fica registrado porque o modo de falhar — a verificação que
 * não consegue verificar e mesmo assim responde "tudo certo" — é o defeito que
 * a isca existe para não ter.
 *
 * A integração pega o que este arquivo não vê — que o predicado **funciona**
 * contra PostGIS — e este pega o que a integração não vê: que ele está na
 * consulta em vez de num `if`.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';

import type { Database } from '../../../../shared/db/schema.js';
import type { Instant, UserId } from '../../../../shared/types/brands.js';
import { comoData } from '../../../../shared/time/clock.js';
import {
  JANELA_DE_24H_EM_MS,
  TETO_DE_DESTINATARIOS,
  TETO_DE_FADIGA,
} from '../../domain/disparo-do-alerta.js';
import { construtorDoAlcance } from './kysely-alcance-por-postgis.js';

const TUTOR = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const AGORA = 1_800_000_000_000 as Instant;

/**
 * Kysely sem banco: ele compila a consulta e não a executa.
 *
 * É o caminho REAL — o mesmo construtor e o mesmo compilador de dialeto que a
 * aplicação usa. Um SQL escrito à mão aqui seria o atalho que parece
 * equivalente e esconde exatamente o que se foi conferir.
 */
const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

function sqlDoAlcance(): string {
  return construtorDoAlcance({
    centro: { lat: -23.56, lon: -46.68 },
    raioEmMetros: 5000,
    excluir: TUTOR,
    agora: AGORA,
  }).compile(semBanco).sql;
}

/** Espaço em branco não é informação: o construtor indenta, a regex não deve. */
function normalizado(): string {
  return sqlDoAlcance().replace(/\s+/g, ' ').trim();
}

void describe('os sete critérios do ADR-0006 estão na consulta de alcance', () => {
  void it('1. a localização conhecida é a própria tabela de origem', () => {
    // O critério não é um `WHERE`: ele é o `FROM`. Quem não tem linha em
    // `user_reference_locations` não é candidato, e é isso que faz "quem negou
    // a permissão e não tocou no mapa" sair da base de alerta sem nenhum
    // predicado a mais.
    assert.match(
      normalizado(),
      /from user_reference_locations url/i,
      'a consulta deixou de partir de `user_reference_locations`. O critério 1 do ' +
        'ADR-0006 é a existência da linha: partir de `users` traria toda conta sem ' +
        'localização para dentro da contagem.',
    );
  });

  void it('2. a validade de 30 dias está no WHERE, comparando a coluna gravada', () => {
    assert.match(
      normalizado(),
      /url\.expires_at > \$\d+/i,
      'o critério 2 do ADR-0006 saiu da consulta: localização capturada há mais de ' +
        '30 dias voltaria a contar, e o critério 12 da BICHUS-18 diz que aquele ' +
        'usuário está FORA da base de alerta até informar de novo.',
    );
  });

  void it('2. a validade compara uma COLUNA, e não um intervalo recalculado', () => {
    // `expires_at` é coluna por decisão da BICHUS-92: com a data gravada, mudar
    // a janela não reescreve o passado. Uma consulta que calculasse
    // `captured_at > agora - 30 dias` daria outra resposta para as linhas
    // antigas no dia em que alguém mexesse na janela.
    assert.doesNotMatch(
      normalizado(),
      /captured_at/i,
      'a consulta passou a calcular a validade a partir de `captured_at`. A janela ' +
        'é a coluna `expires_at`, gravada na captura; recalculá-la aqui reescreve o ' +
        'passado quando a janela mudar.',
    );
  });

  void it('3. o raio usa ST_DWithin, que é o que o índice GiST acelera', () => {
    assert.match(
      normalizado(),
      /st_dwithin\(\s*url\.reference_point,/i,
      'o critério 3 do ADR-0006 saiu da consulta, ou deixou de usar `ST_DWithin`.',
    );
  });

  void it('3. o raio NÃO é uma comparação de ST_Distance, que ignoraria o índice', () => {
    // Os dois dariam o mesmo conjunto. `ST_Distance(...) <= raio` não usa o
    // índice GiST, e transforma a consulta do segundo seguinte ao "meu pet
    // sumiu" numa varredura da tabela inteira de tutores. É a diferença que
    // nenhum teste de comportamento consegue ver.
    assert.doesNotMatch(
      normalizado(),
      /st_distance\([^)]*\)\s*(<=|<)/i,
      'o filtro de raio virou uma comparação de `ST_Distance`. O conjunto é o mesmo ' +
        'e o plano não: sem `ST_DWithin` o índice GiST deixa de ser usado.',
    );
  });

  void it('4. o aparelho com permissão e token está no EXISTS', () => {
    assert.match(
      normalizado(),
      /exists \(\s*select 1 from user_devices d where d\.user_id = url\.user_id and d\.push_permission = 'granted' and d\.push_token is not null\s*\)/i,
      'o critério 4 do ADR-0006 saiu da consulta. Sem ele, `reachable_tutors` passa ' +
        'a contar quem não tem para onde receber — a mesma classe de mentira que o ' +
        'zero inventado.',
    );
  });

  void it('5. o próprio tutor sai por DESIGUALDADE, e não por um filtro depois', () => {
    assert.match(
      normalizado(),
      /url\.user_id <> \$\d+/i,
      'o critério 5 do ADR-0006 saiu da consulta. O tutor receberia o alerta do ' +
        'próprio pet, e o número da tela contaria a própria tutora entre os vizinhos.',
    );
  });

  void it('6. o teto de fadiga conta linhas de alert_recipients na janela', () => {
    const sql = normalizado();
    assert.match(
      sql,
      /select count\(\*\) from alert_recipients ar where ar\.user_id = url\.user_id and ar\.notified_at > \$\d+/i,
      'o critério 6 do ADR-0006 saiu da consulta: quem já recebeu três alertas nas ' +
        'últimas 24 h voltaria a ser acordado pelo quarto caso.',
    );
    assert.match(
      sql,
      new RegExp(`\\) < \\$\\d+`, 'i'),
      'a comparação do teto de fadiga sumiu. Um `count(*)` que ninguém compara não ' +
        'filtra nada, e a consulta passaria por esta suíte contando todo mundo.',
    );
  });

  void it('6. o teto de fadiga vale POR USUÁRIO, e a correlação prova', () => {
    // Critério 10 da BICHUS-18, textual: "o teto de fadiga é por usuário, não
    // por caso". A subconsulta correlaciona por `ar.user_id = url.user_id` e
    // não por caso; sem essa correlação ela contaria os alertas do mundo
    // inteiro e zeraria a base de alerta no quarto disparo do dia.
    assert.match(
      normalizado(),
      /alert_recipients ar where ar\.user_id = url\.user_id/i,
      'o teto de fadiga deixou de ser por usuário. Correlacionado por outra coluna, ' +
        'ele vira um teto global e o produto para de alertar depois do terceiro caso ' +
        'do dia em qualquer lugar do Brasil.',
    );
  });

  void it('BICHUS-88: a conta logicamente excluída não entra no alcance', () => {
    // Entre a exclusão lógica (imediata, critério 12 da BICHUS-88) e o expurgo
    // de 30 dias, a linha de `user_reference_locations` continua casando com
    // `ST_DWithin`. Esta junção é o que impede o alerta de ir para quem pediu
    // para sair. Ela não conserta a BICHUS-88 e não tenta.
    const sql = normalizado();
    assert.match(
      sql,
      /join users u on u\.id = url\.user_id/i,
      'a junção com `users` sumiu, e com ela a única defesa desta consulta contra a ' +
        'BICHUS-88.',
    );
    assert.match(
      sql,
      /u\.deleted_at is null/i,
      'a consulta voltaria a alertar contas logicamente excluídas: entre a exclusão ' +
        'e o expurgo de 30 dias a linha de localização ainda casa com `ST_DWithin`.',
    );
  });

  void it('9. o teto de 500 é LIMIT no banco, e pede uma linha a mais', () => {
    const { sql, parameters } = construtorDoAlcance({
      centro: { lat: -23.56, lon: -46.68 },
      raioEmMetros: 5000,
      excluir: TUTOR,
      agora: AGORA,
    }).compile(semBanco);

    assert.match(
      sql.replace(/\s+/g, ' '),
      /limit \$\d+/i,
      'o teto do critério 9 da BICHUS-18 saiu do banco. Cortar a lista em memória ' +
        'traz uma região densa inteira para o worker, e o `LIMIT` existe para isso ' +
        'não acontecer.',
    );
    assert.ok(
      parameters.includes(TETO_DE_DESTINATARIOS + 1),
      'o limite deixou de pedir uma linha a mais que o teto. Sem ela não há como ' +
        `distinguir "havia exatamente ${String(TETO_DE_DESTINATARIOS)} " de "havia mais e cortamos", ` +
        'e `cap_reached` passaria a ser um chute.',
    );
    assert.ok(
      parameters.includes(TETO_DE_FADIGA),
      'o teto de fadiga deixou de vir da constante do domínio. Um número escrito à ' +
        'mão na consulta diverge da regra no dia em que alguém mudar a regra.',
    );
  });

  void it('9. a ordem é por distância crescente, porque o corte é por ela', () => {
    assert.match(
      normalizado(),
      /order by st_distance\(\s*url\.reference_point,.*?\) asc/i,
      'a ordenação por distância sumiu. Com o teto de 500 e sem ordem, quem fica de ' +
        'fora passa a ser sorteado pelo plano do banco em vez de ser quem está mais ' +
        'longe — e quem tem chance de ver o animal na rua é quem está perto.',
    );
  });

  void it('a distância ordena e NÃO sai: nenhuma coluna de distância é projetada', () => {
    // ADR-0010: `distance_m` é proibido em superfície pública, e guardá-la sem
    // ninguém precisar dela acumula o dano sem o benefício. Três casos abertos
    // perto da mesma pessoa e a distância de cada um a põem num círculo de
    // poucos metros.
    const projecao = normalizado().split(/ from user_reference_locations/i)[0] ?? '';
    assert.doesNotMatch(
      projecao,
      /st_distance/i,
      'a distância passou a ser SELECIONADA. Ela ordena e é descartada: projetada, ' +
        'ela vira trilateração pronta na primeira vez que alguém a gravar ou logar.',
    );
  });

  void it('a consulta não seleciona coordenada de tutor nenhum', () => {
    const sql = normalizado();
    assert.doesNotMatch(
      sql,
      /st_y\(|st_x\(/i,
      'a consulta passou a ler lat/lon dos tutores. O critério 8 da BICHUS-18 ' +
        'proíbe coordenada de tutor sair do servidor, e o jeito de garantir isso é ' +
        'o dado não existir no caminho.',
    );
  });

  void it('não existe COUNT de destinatários: a contagem é o tamanho da lista', () => {
    // O critério 9 da BICHUS-20 no lugar onde ele pode ser quebrado. Um
    // `COUNT(*)` de tutores ao lado seria a segunda definição de "quantos", e
    // ela divergiria da lista no dia em que alguém acrescentasse um critério a
    // uma e esquecesse a outra — com a tela prometendo 12 e o envio entregando 9.
    const sql = normalizado();
    const contagens = sql.match(/count\(\*\)/gi) ?? [];
    assert.equal(
      contagens.length,
      1,
      'apareceu um `count(*)` a mais na consulta de alcance. O único legítimo é o do ' +
        'teto de fadiga; qualquer outro é uma segunda definição de "quantos", e é ' +
        `exatamente o que a porta existe para não ter. Encontrados: ${String(contagens.length)}.`,
    );
  });
});

/**
 * O valor LIGADO em cada `$n`, e não só a existência do predicado.
 *
 * Esta seção existe por um tropeço real de outro par hoje: uma isca que cobrava
 * o predicado esperado ficou VERDE com a cláusula removida, porque a
 * autorização era por outra coluna; e outra passou com a correlação entre
 * tabelas ausente, o que trocou "este pet é desta conta?" por "esta conta tem
 * algum pet?".
 *
 * A lição aplicada aqui: **conferir a cláusula que existe, não a que se espera
 * encontrar, e cobrar a correlação junto do predicado.** E não basta perguntar
 * "o valor está na lista de parâmetros": com oito valores ligados, essa
 * pergunta é quase sempre sim por acidente. O que estes casos fazem é ler o
 * `$n` de DENTRO da cláusula e conferir o que está naquela posição.
 */
function parametroDa(regex: RegExp): unknown {
  const { sql, parameters } = construtorDoAlcance({
    centro: { lat: -23.56, lon: -46.68 },
    raioEmMetros: 5000,
    excluir: TUTOR,
    agora: AGORA,
  }).compile(semBanco);

  const achado = regex.exec(sql.replace(/\s+/g, ' '));
  if (achado === null) {
    throw new Error(
      `a cláusula não existe mais na consulta: ${String(regex)}. Uma conferência que ` +
        'não acha o que conferir precisa REPROVAR, e nunca passar por vacuidade.',
    );
  }
  const posicao = Number(achado[1]);
  return parameters[posicao - 1];
}

void describe('cada cláusula liga o valor CERTO, e não um valor qualquer', () => {
  void it('a desigualdade do tutor liga o tutor, e não outro dos oito valores', () => {
    // O caso que o tropeço de hoje pede. `url.user_id <> $6` com o `$6` apontando
    // para o raio compilaria, rodaria, e tiraria do alcance uma conta cujo UUID
    // ninguém consegue prever — com a tutora recebendo o alerta do próprio pet.
    assert.equal(
      parametroDa(/url\.user_id <> \$(\d+)/i),
      TUTOR,
      'a desigualdade do critério 5 está ligada a outro valor que não o tutor do caso.',
    );
  });

  void it('o raio do ST_DWithin liga o raio, e não a janela nem o teto', () => {
    assert.equal(
      parametroDa(/st_dwithin\([^$]*\$\d+[^$]*\$\d+[^$]*\$(\d+)\s*\)/i),
      5000,
      'o terceiro argumento de `ST_DWithin` deixou de ser o raio. Ligado à janela de ' +
        'fadiga, ele viraria um raio de 86.400 km e o alerta sairia para o país inteiro.',
    );
  });

  void it('a validade compara o AGORA, e não o início da janela de fadiga', () => {
    // Os dois são instantes e os dois compilam. Ligado ao início da janela, o
    // filtro de validade passaria a aceitar localizações vencidas há até 24 h.
    assert.deepEqual(
      parametroDa(/url\.expires_at > \$(\d+)/i),
      comoData(AGORA),
      'o critério 2 está comparando `expires_at` com o instante errado.',
    );
  });

  void it('a janela de fadiga compara 24 h atrás, e não o agora', () => {
    // Ligado ao agora, o `count(*)` daria sempre zero e o teto de fadiga nunca
    // barraria ninguém — passando por todos os casos de predicado acima.
    assert.deepEqual(
      parametroDa(/ar\.notified_at > \$(\d+)/i),
      comoData((Number(AGORA) - JANELA_DE_24H_EM_MS) as Instant),
      'a janela do critério 6 está ligada ao instante errado: com o agora, o ' +
        '`count(*)` é sempre zero e o teto de fadiga nunca barra ninguém.',
    );
  });

  void it('a comparação do teto de fadiga liga 3, e não o raio', () => {
    assert.equal(
      parametroDa(/\) < \$(\d+)/i),
      TETO_DE_FADIGA,
      'o teto de fadiga está ligado a outro valor. Comparado com 5000, ele nunca ' +
        'barraria ninguém e o critério 6 seria decorativo.',
    );
  });

  void it('o LIMIT liga o teto mais um, e não o teto de fadiga', () => {
    assert.equal(
      parametroDa(/limit \$(\d+)/i),
      TETO_DE_DESTINATARIOS + 1,
      'o `LIMIT` está ligado a outro valor. Ligado ao teto de fadiga, o alerta sairia ' +
        'para três pessoas e a tela diria três.',
    );
  });

  void it('a correlação do EXISTS é com url.user_id, e não uma tabela solta', () => {
    // O segundo tropeço de hoje, traduzido para esta consulta. Sem
    // `d.user_id = url.user_id`, o `EXISTS` pergunta "existe ALGUM aparelho
    // alcançável no sistema?" — verdadeiro o tempo todo — e o critério 4 deixa
    // de filtrar qualquer coisa sem que nenhum predicado tenha sumido.
    assert.match(
      normalizado(),
      /from user_devices d where d\.user_id = url\.user_id/i,
      'o `EXISTS` do critério 4 perdeu a correlação com a linha de fora. Ele passa a ' +
        'perguntar "existe algum aparelho alcançável?" em vez de "esta conta tem um?".',
    );
  });

  void it('a correlação do count de fadiga é com url.user_id, e a junção de users também', () => {
    const sql = normalizado();
    assert.match(
      sql,
      /from alert_recipients ar where ar\.user_id = url\.user_id/i,
      'o `count(*)` do critério 6 perdeu a correlação: ele passa a contar os alertas ' +
        'do mundo inteiro e zera a base de alerta no quarto disparo do dia.',
    );
    assert.match(
      sql,
      /join users u on u\.id = url\.user_id/i,
      'a junção com `users` perdeu a correlação, e `u.deleted_at IS NULL` passa a ' +
        'falar de uma linha de `users` arbitrária em vez da dona da localização.',
    );
  });
});

void describe('o predicado do aparelho diz a mesma coisa nos quatro lugares', () => {
  /** A migração do aparelho, lida do disco. Ver `readdirSync` abaixo. */
  function migracaoDoAparelho(): string {
    const dir = 'migrations';
    const nome = readdirSync(dir).find((f) => f.includes('aparelho-e-token-de-push'));
    if (nome === undefined) {
      throw new Error(
        'não achei a migração do aparelho em `migrations/`. Uma conferência que não ' +
          'acha o que conferir precisa REPROVAR, e nunca passar por vacuidade.',
      );
    }
    return readFileSync(join(dir, nome), 'utf8');
  }

  void it('o EXISTS da consulta e o predicado parcial do índice coincidem', () => {
    // Se o índice divergir, o Postgres para de usá-lo e a consulta do pânico
    // vira varredura sem ninguém perceber. É a divergência mais cara e a mais
    // silenciosa das quatro.
    assert.match(
      migracaoDoAparelho(),
      /CREATE INDEX user_devices_alcancaveis[^;]*WHERE\s+push_permission\s*=\s*'granted'\s+AND\s+push_token\s+IS\s+NOT\s+NULL/i,
      'o predicado parcial de `user_devices_alcancaveis` mudou e deixou de casar com ' +
        'o `EXISTS` da consulta de alcance.',
    );
    assert.match(
      normalizado(),
      /d\.push_permission = 'granted' and d\.push_token is not null/i,
      'o `EXISTS` da consulta de alcance mudou e deixou de casar com o predicado do ' +
        'índice `user_devices_alcancaveis`.',
    );
  });
});
