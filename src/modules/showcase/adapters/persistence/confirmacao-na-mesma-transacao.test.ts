/**
 * ISCA (d): A VARREDURA DE VENCIDOS NÃO APAGA A FOTO DA VITRINE — e a prova é a
 * confirmação estar na MESMA TRANSAÇÃO da escrita.
 *
 * ## O defeito que estes casos existem para não deixar voltar
 *
 * `varrer-envios-vencidos.ts` apaga intenção de envio **não confirmada e
 * vencida**, e apaga o objeto do balde junto. A foto do ACHADO foi apagada por
 * ela — medido com hora: subida 01:18:44, apagada 01:29:10; subida 01:33:35,
 * apagada 01:44:10. Dez minutos, e **sempre**. A causa não era o filtro: era a
 * foto do achado não ter operação de confirmação, de propósito, e portanto
 * `confirmed_at` nunca deixar de ser nulo nela.
 *
 * Então a pergunta certa sobre um propósito NOVO não é "a varredura o filtra?",
 * e sim **"existe algum instante em que a foto existe e a intenção dela ainda
 * não está confirmada?"**. Se existir, a varredura entra por ali.
 *
 * Para a vitrine a resposta é não, e é isso que estes casos medem: o `UPDATE
 * ... SET confirmed_at` e o `INSERT INTO user_showcase_images` chegam no **MESMO
 * executor** — a mesma transação. Não há janela: ou os dois valem, ou nenhum.
 *
 * A outra metade desta isca -- o que a varredura faz e o que ela NAO faz, com
 * os contrapesos -- mora em
 * `media/application/varredura-nao-apaga-a-vitrine.test.ts`, junto do caso de
 * uso que ela mede: a fronteira da arquitetura nao deixa `showcase` importar
 * `media/application`, e ela esta certa.
 *
 * ## Por que o teste olha o EXECUTOR, e não o resultado
 *
 * Confirmar numa transação à parte produz exatamente o mesmo resultado final, e
 * passaria em qualquer teste de resultado. O que muda é só a existência da
 * janela entre as duas — e janela não aparece em asserção de resultado. Foi um
 * comentário afirmando não haver risco que deixou o defeito nascer; aqui o que
 * afirma é a medição.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DbExecutor } from '../../../../shared/db/pool.js';
import type { Instant, UserId } from '../../../../shared/types/brands.js';
import { gravarVitrineNaTransacao } from './kysely-vitrine.js';

const DONO = 'a0000000-0000-7000-8000-000000000001' as UserId;
const ENVIO = '018f7c1e-7a2b-7c3d-9e4f-000000000001';
const AGORA = Date.parse('2026-10-18T12:00:00Z') as Instant;

/** Uma operação registrada: o que foi feito, em que tabela, e por qual executor. */
interface Operacao {
  readonly acao: string;
  readonly tabela: string;
  readonly executor: object;
  readonly valores?: Record<string, unknown>;
}

/**
 * Um executor de banco de MENTIRA, encadeável como o Kysely, que só registra.
 *
 * Ele não executa SQL nenhum: o que este teste mede é **qual executor recebeu
 * cada escrita**, e para isso o SQL é irrelevante. A `SELECT` do envio devolve
 * uma intenção aberta, que é o caminho em que a confirmação acontece.
 */
function executorQueRegistra(registro: Operacao[]): DbExecutor {
  const executor: Record<string, unknown> = {};
  const encadear = (acao: string, tabela: string) => {
    const elo: Record<string, unknown> = {};
    const devolveElo = () => elo;
    for (const metodo of ['where', 'set', 'leftJoin', 'innerJoin', 'select', 'forUpdate', 'orderBy']) {
      elo[metodo] = devolveElo;
    }
    elo['values'] = (valores: Record<string, unknown>) => {
      registro.push({ acao, tabela, executor, valores });
      return elo;
    };
    elo['execute'] = () => {
      if (acao !== 'insert') registro.push({ acao, tabela, executor });
      return Promise.resolve([]);
    };
    elo['executeTakeFirst'] = () => {
      registro.push({ acao, tabela, executor });
      // A intenção ABERTA do dono: não confirmada e dentro do prazo. É o
      // caminho em que `confirmed_at` passa a ser gravado.
      return Promise.resolve({
        id: ENVIO,
        purpose: 'user_showcase',
        expires_at: new Date(Number(AGORA) + 600_000),
        confirmed_at: null,
        catalog_image_id: null,
      });
    };
    return elo;
  };
  executor['deleteFrom'] = (t: string) => encadear('delete', t);
  executor['selectFrom'] = (t: string) => encadear('select', t);
  executor['updateTable'] = (t: string) => encadear('update', t);
  executor['insertInto'] = (t: string) => encadear('insert', t);
  return executor as unknown as DbExecutor;
}

const ids = {
  uuidv7: () => '018f7c1e-7a2b-7c3d-9e4f-0000000000ff',
  random128: () => new Uint8Array(16),
};

void describe('a confirmação do envio da vitrine vai na MESMA transação da escrita', () => {
  void it('ISCA -- `confirmed_at` e a linha da vitrine chegam no MESMO executor', async () => {
    const registro: Operacao[] = [];
    const trx = executorQueRegistra(registro);

    await gravarVitrineNaTransacao(trx, {
      dono: DONO,
      fotos: [{ uploadId: ENVIO, position: 0, altText: null }],
      agora: AGORA,
      ids: ids as never,
    });

    const confirmacao = registro.find(
      (o) => o.acao === 'update' && o.tabela === 'catalog_upload_intents',
    );
    const linhaDaVitrine = registro.find(
      (o) => o.acao === 'insert' && o.tabela === 'user_showcase_images',
    );

    assert.ok(confirmacao, 'sem gravar `confirmed_at` a intenção fica eternamente varrível');
    assert.ok(linhaDaVitrine, 'sem a linha da vitrine não há foto nenhuma');
    assert.strictEqual(
      confirmacao.executor,
      linhaDaVitrine.executor,
      'MESMO executor = MESMA transação. Executores diferentes abrem a janela em que a ' +
        'intenção está vencida e não confirmada, que é a condição exata em que a varredura ' +
        'apagou a foto do achado',
    );
  });

  void it('ISCA -- a imagem de catálogo nasce no MESMO executor, com o propósito da vitrine', async () => {
    const registro: Operacao[] = [];
    const trx = executorQueRegistra(registro);
    await gravarVitrineNaTransacao(trx, {
      dono: DONO,
      fotos: [{ uploadId: ENVIO, position: 0, altText: null }],
      agora: AGORA,
      ids: ids as never,
    });
    const imagem = registro.find((o) => o.acao === 'insert' && o.tabela === 'catalog_images');
    assert.ok(imagem);
    assert.equal(
      imagem.valores?.['purpose'],
      'user_showcase',
      'o propósito gravado é o da vitrine: é ele que escolhe a derivada de 320 px',
    );
    const trabalho = registro.find((o) => o.acao === 'insert' && o.tabela === 'jobs');
    assert.ok(trabalho, 'imagem sem trabalho enfileirado fica `processing` para sempre');
    assert.strictEqual(imagem.executor, trabalho.executor, 'os dois na mesma transação');
  });

  void it('`photos: []` não confirma envio nenhum, e só apaga as ligações', async () => {
    const registro: Operacao[] = [];
    await gravarVitrineNaTransacao(executorQueRegistra(registro), {
      dono: DONO,
      fotos: [],
      agora: AGORA,
      ids: ids as never,
    });
    assert.ok(registro.some((o) => o.acao === 'delete' && o.tabela === 'user_showcase_images'));
    assert.equal(
      registro.filter((o) => o.acao === 'insert' && o.tabela === 'user_showcase_images').length,
      0,
    );
  });
});
