/**
 * O contador de teto de chamada em Postgres, contra um Postgres de verdade.
 *
 * ## Por que este arquivo existe
 *
 * A BICHUS-178 fez o teto passar a ser aplicado, e `criarContadorEmPostgres` e a
 * UNICA implementacao que producao usa -- `RATE_LIMIT_DRIVER=postgres` e o valor
 * do `.env.example`, e `memory` so e correto com uma instancia. Ainda assim ela
 * fechou sem nenhum teste automatizado contra banco: o driver em memoria tem
 * cobertura, e ele e justamente aquele cujo comportamento **nao depende** de
 * transacao, de isolamento nem de `ON CONFLICT`. Provar o balde em memoria e
 * provar um `Map`.
 *
 * ## O que esta sob prova, e o que nao esta
 *
 * `peek()` NAO e atomico, e isso esta escrito no codigo como decisao:
 *
 *   > Le sem somar, e por isso nao precisa ser atomico: dois pedidos simultaneos
 *   > lendo o mesmo balde podem ambos passar, e o pior caso e uma tentativa
 *   > invalida a mais sendo conferida. O que nao pode escapar e a contagem, e
 *   > ela continua no `hit()` atomico de cima.
 *
 * Uma decisao dessas so vale enquanto as duas metades continuarem verdadeiras, e
 * nenhuma das duas e obvia no codigo:
 *
 * - **a metade permissiva** -- duas leituras simultaneas passam -- e o custo
 *   aceito. Este arquivo a MEDE, para que ela seja um numero conhecido e nao uma
 *   surpresa. Se um dia alguem apertar `peek()` para ser atomico, os casos aqui
 *   reprovam e a pessoa le por que aquilo foi aceito;
 * - **a metade que nao pode ceder** -- a contagem nao escapa -- e o que
 *   `ON CONFLICT ... DO UPDATE SET count = count + 1` sustenta. Trocar isso por
 *   ler-e-depois-somar continuaria passando em teste sequencial, em teste de
 *   unidade e na esteira; so a concorrencia real acusa. E por isso que este
 *   arquivo dispara dezenas de chamadas de uma vez em vez de uma de cada vez.
 *
 * ## O que NAO esta sob prova aqui
 *
 * A aplicacao dos ganchos nas rotas (isso e `registrar-rota.test.ts`), a escolha
 * das dimensoes, e o resumo de `email`/`code`/`finder_identity` na chave do
 * balde (SEC-010). Aqui e a porta contra o banco, e nada alem dela.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

// Concorrencia de verdade exige conexao de verdade. O padrao do pool e 10, e
// com ele vinte chamadas "simultaneas" viram duas levas de dez -- o que ainda
// expoe perda de incremento, mas mede outra coisa. Precisa ser definido ANTES
// de `createDb`, que le a variavel na criacao do pool.
process.env['DATABASE_POOL_MAX'] ??= '32';

const { createDb } = await import('../../src/shared/db/pool.js');
const { criarContadorEmPostgres } = await import('../../src/shared/http/rate-limit.js');
type DbHandle = ReturnType<typeof createDb>;

/**
 * Prefixo exclusivo deste arquivo.
 *
 * `reset()` apaga por prefixo, e nao a tabela inteira: dois arquivos de
 * integracao rodando no mesmo banco nao podem zerar o balde um do outro. Com
 * `reset()` sem argumento, o segundo arquivo apagaria a contagem que o primeiro
 * estivesse medindo, e a falha sairia como "perdeu incremento" -- a acusacao
 * exata que este arquivo existe para levantar, vinda do lugar errado.
 */
const PREFIXO = 'teste:integracao:teto:';

/** Uma chave nova por caso: cenario nunca herda balde de cenario anterior. */
let contador = 0;
const chave = (nome: string): string => {
  contador += 1;
  return `${PREFIXO}${nome}:${String(contador)}`;
};

const CONEXAO = process.env['DATABASE_URL'];
const JANELA_EM_SEGUNDOS = 60;

let banco: DbHandle;
let loja: ReturnType<typeof criarContadorEmPostgres>;
/** Relogio fixo: a janela nao pode virar no meio de um caso. */
let agoraFixo = 0;

async function contagemDe(bucketKey: string): Promise<number | undefined> {
  const linha = await banco.db
    .selectFrom('rate_limit_counters')
    .select(['count'])
    .where('bucket_key', '=', bucketKey)
    .executeTakeFirst();
  return linha?.count;
}

before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    throw new Error(
      'DATABASE_URL nao esta definida. Este arquivo mede o contador de teto CONTRA UM BANCO; ' +
        'sem banco ele nao tem o que medir, e passar verde sem medir e pior do que nao existir. ' +
        'Rode `npm run test:integration`, que sobe a pilha efemera.',
    );
  }
  banco = createDb(CONEXAO);
  await banco.ping();

  // A tabela precisa existir: banco sem migracao aplicada REPROVA, e nunca passa
  // por nao ter achado nada.
  const tabela = await banco.db
    .selectFrom('rate_limit_counters')
    .select(['bucket_key'])
    .limit(1)
    .execute()
    .catch((erro: unknown) => {
      throw new Error(
        '`rate_limit_counters` nao respondeu. Banco sem as migracoes aplicadas nao prova nada ' +
          `sobre o teto de chamada: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
    });
  assert.ok(Array.isArray(tabela));

  agoraFixo = Date.now();
  loja = criarContadorEmPostgres(banco.db, () => agoraFixo, false);
});

beforeEach(async () => {
  // O relogio anda entre casos (janela nova se o caso anterior demorou), mas
  // fica parado DENTRO de um caso.
  agoraFixo = Date.now();
  await loja.reset(PREFIXO);
});

after(async () => {
  if (banco !== undefined) {
    await loja.reset(PREFIXO);
    await banco.close();
  }
});

void describe('BICHUS-178 — o contador de teto em Postgres, contra um banco de verdade', () => {
  void describe('a metade que nao pode ceder: a contagem nao escapa', () => {
    void it('trinta hit() simultaneos somam exatamente trinta', async () => {
      const balde = chave('hit-simultaneo');
      const CHAMADAS = 30;

      await Promise.all(
        Array.from({ length: CHAMADAS }, () => loja.hit(balde, 1000, JANELA_EM_SEGUNDOS)),
      );

      assert.equal(
        await contagemDe(balde),
        CHAMADAS,
        'a contagem final nao bate com o numero de chamadas. Incremento perdido e o defeito ' +
          'que `ON CONFLICT ... DO UPDATE SET count = count + 1` existe para impedir: ler e ' +
          'depois somar deixaria duas chamadas simultaneas gravarem o mesmo valor, e o teto ' +
          'passaria a valer mais do que o numero escrito na politica.',
      );
    });

    void it('com teto de dez e trinta chamadas simultaneas, exatamente dez sao permitidas', async () => {
      const balde = chave('teto-sob-concorrencia');
      const TETO = 10;
      const CHAMADAS = 30;

      const decisoes = await Promise.all(
        Array.from({ length: CHAMADAS }, () => loja.hit(balde, TETO, JANELA_EM_SEGUNDOS)),
      );

      const permitidas = decisoes.filter((d) => d.allowed).length;
      assert.equal(
        permitidas,
        TETO,
        `${String(permitidas)} chamadas passaram com teto de ${String(TETO)}. Este e o numero ` +
          'que a politica de docs/04-seguranca.md promete, e ele so vale se o incremento for ' +
          'atomico: com leitura e escrita separadas, mais de dez veriam contagem abaixo do teto ' +
          'ao mesmo tempo e todas passariam.',
      );
      assert.equal(await contagemDe(balde), CHAMADAS, 'toda chamada conta, inclusive a recusada');

      const recusadas = decisoes.filter((d) => !d.allowed);
      assert.equal(recusadas.length, CHAMADAS - TETO);
      for (const decisao of recusadas) {
        assert.equal(decisao.remaining, 0);
        assert.ok(
          (decisao.retryAfterSeconds ?? 0) > 0,
          'recusa sem `retryAfterSeconds` vira 429 sem `Retry-After`, e o app nao sabe quando ' +
            'voltar. O contrato promete o cabecalho.',
        );
      }
    });
  });

  void describe('peek() le sem somar', () => {
    void it('cinquenta peek() simultaneos nao criam linha nenhuma', async () => {
      const balde = chave('peek-nao-cria');

      await Promise.all(Array.from({ length: 50 }, () => loja.peek(balde, 10, JANELA_EM_SEGUNDOS)));

      assert.equal(
        await contagemDe(balde),
        undefined,
        'o balde passou a existir so por ter sido consultado. `peek()` na ENTRADA de toda ' +
          'requisicao e o desenho de `applies_to: invalid_attempts` (criterio 8 da BICHUS-178): ' +
          'se consultar contasse, toda tentativa VALIDA consumiria o contador de invalidas e o ' +
          'teto fecharia sozinho na cara de quem acertou a senha.',
      );
    });

    void it('peek() nao mexe na contagem que hit() ja gravou', async () => {
      const balde = chave('peek-nao-mexe');
      await loja.hit(balde, 10, JANELA_EM_SEGUNDOS);
      await loja.hit(balde, 10, JANELA_EM_SEGUNDOS);
      await loja.hit(balde, 10, JANELA_EM_SEGUNDOS);

      await Promise.all(Array.from({ length: 50 }, () => loja.peek(balde, 10, JANELA_EM_SEGUNDOS)));

      assert.equal(await contagemDe(balde), 3, 'cinquenta consultas mudaram a contagem de tres');
    });

    void it('peek() e hit() simultaneos: a contagem final e o numero de hit(), e mais nada', async () => {
      const balde = chave('peek-e-hit');
      const HITS = 20;
      const PEEKS = 40;

      // Embaralhados de proposito: leitura e escrita disputando o MESMO balde ao
      // mesmo tempo e o que acontece numa rota real sob ataque, e o que um
      // `peek()` que escrevesse por engano estragaria.
      const trabalhos = [
        ...Array.from({ length: HITS }, () => () => loja.hit(balde, 1000, JANELA_EM_SEGUNDOS)),
        ...Array.from({ length: PEEKS }, () => () => loja.peek(balde, 1000, JANELA_EM_SEGUNDOS)),
      ];
      await Promise.all(trabalhos.map((f) => f()));

      assert.equal(
        await contagemDe(balde),
        HITS,
        'a contagem nao e exatamente o numero de hit(). Ou peek() escreveu, ou hit() perdeu.',
      );
    });
  });

  void describe('a fronteira: peek() pergunta o que aconteceria se a PROXIMA entrasse', () => {
    void it('com o balde uma abaixo do teto, peek() ainda permite e nao sobra nada', async () => {
      const balde = chave('fronteira-abaixo');
      const TETO = 20;
      for (let i = 0; i < TETO - 1; i += 1) await loja.hit(balde, TETO, JANELA_EM_SEGUNDOS);

      const decisao = await loja.peek(balde, TETO, JANELA_EM_SEGUNDOS);

      assert.equal(decisao.allowed, true, 'a vigesima de um teto de vinte precisa passar');
      assert.equal(
        decisao.remaining,
        0,
        '`remaining` precisa contar a propria chamada consultada: com dezenove gravadas e a ' +
          'vigesima em questao, nao sobra nenhuma.',
      );
    });

    void it('com o balde NO teto, peek() ja recusa — antes de a tentativa custar trabalho', async () => {
      const balde = chave('fronteira-no-teto');
      const TETO = 20;
      for (let i = 0; i < TETO; i += 1) await loja.hit(balde, TETO, JANELA_EM_SEGUNDOS);

      const decisao = await loja.peek(balde, TETO, JANELA_EM_SEGUNDOS);

      assert.equal(
        decisao.allowed,
        false,
        'a vigesima primeira passou. `peek()` pergunta o que aconteceria SE a proxima entrasse, ' +
          'e por isso soma um a contagem lida. Sem esse mais um a 21a de um teto de 20 ainda ' +
          'entraria e so a 22a seria barrada -- e no webhook de entrega e exatamente essa ' +
          'requisicao que precisa sair 429 SEM a assinatura ser conferida em tempo constante.',
      );
      assert.equal(decisao.remaining, 0);
      assert.ok((decisao.retryAfterSeconds ?? 0) > 0);
    });
  });

  void describe('a metade permissiva, medida em vez de suposta', () => {
    void it('com uma vaga sobrando, leituras simultaneas passam TODAS — e nada foi contado', async () => {
      const balde = chave('nao-atomico-por-desenho');
      const TETO = 20;
      const LEITORES = 12;
      for (let i = 0; i < TETO - 1; i += 1) await loja.hit(balde, TETO, JANELA_EM_SEGUNDOS);

      const decisoes = await Promise.all(
        Array.from({ length: LEITORES }, () => loja.peek(balde, TETO, JANELA_EM_SEGUNDOS)),
      );

      assert.equal(
        decisoes.filter((d) => d.allowed).length,
        LEITORES,
        'nem todos passaram. `peek()` NAO e atomico por decisao, e este caso existe para que a ' +
          'decisao seja um numero conhecido: com uma vaga e doze leitores simultaneos, os doze ' +
          'passam. Se este caso reprovar porque alguem tornou `peek()` atomico, leia o comentario ' +
          'de `peek` em src/shared/http/rate-limit.ts antes de mudar este numero: o custo aceito ' +
          'e uma tentativa invalida a mais sendo conferida, nunca uma contagem perdida.',
      );
      assert.equal(
        await contagemDe(balde),
        TETO - 1,
        'doze leituras otimistas mexeram na contagem. O que o desenho aceita e passar demais na ' +
          'LEITURA; o que ele nao aceita e escapar da CONTAGEM.',
      );
    });

    void it('o excesso que a leitura otimista deixa entrar e cobrado pelo hit() e fecha na proxima', async () => {
      const balde = chave('excesso-cobrado');
      const TETO = 20;
      for (let i = 0; i < TETO - 1; i += 1) await loja.hit(balde, TETO, JANELA_EM_SEGUNDOS);

      // Duas tentativas chegam juntas, as duas consultam, as duas passam.
      const [a, b] = await Promise.all([
        loja.peek(balde, TETO, JANELA_EM_SEGUNDOS),
        loja.peek(balde, TETO, JANELA_EM_SEGUNDOS),
      ]);
      assert.equal(a?.allowed, true);
      assert.equal(b?.allowed, true);

      // As duas se revelam invalidas, e so ai contam.
      await Promise.all([
        loja.hit(balde, TETO, JANELA_EM_SEGUNDOS),
        loja.hit(balde, TETO, JANELA_EM_SEGUNDOS),
      ]);

      assert.equal(
        await contagemDe(balde),
        TETO + 1,
        'o excesso precisa APARECER na contagem. E ele que faz a janela fechar em vez de o ' +
          'balde ficar eternamente uma abaixo do teto.',
      );
      const depois = await loja.peek(balde, TETO, JANELA_EM_SEGUNDOS);
      assert.equal(
        depois.allowed,
        false,
        'depois do excesso o balde precisa estar fechado. Se a leitura otimista nao fosse ' +
          'cobrada, duas tentativas a mais virariam quatro, depois oito, e o teto deixaria de ' +
          'existir sob carga -- que e justamente a condicao em que ele importa.',
      );
    });
  });

  void describe('a janela', () => {
    void it('o balde de uma janela nao e o balde da seguinte', async () => {
      const balde = chave('janela');
      const JANELA = 2;
      agoraFixo = Math.ceil(Date.now() / (JANELA * 1000)) * JANELA * 1000;

      await loja.hit(balde, 5, JANELA);
      await loja.hit(balde, 5, JANELA);
      const naJanela = await loja.peek(balde, 5, JANELA);
      assert.equal(naJanela.remaining, 2, 'duas gravadas mais a consultada, de um teto de cinco');

      // O relogio anda para a janela seguinte. Nada e apagado: a chave primaria
      // e (bucket_key, window_start), entao a janela nova e outra LINHA.
      agoraFixo += JANELA * 1000;

      const naSeguinte = await loja.peek(balde, 5, JANELA);
      assert.equal(
        naSeguinte.remaining,
        4,
        'a janela virou e a contagem da anterior veio junto. `window_start` faz parte da chave ' +
          'primaria justamente para isso.',
      );

      const linhas = await banco.db
        .selectFrom('rate_limit_counters')
        .select(['window_start'])
        .where('bucket_key', '=', balde)
        .execute();
      assert.equal(linhas.length, 1, 'a consulta na janela nova nao pode ter criado linha');
    });
  });
});
