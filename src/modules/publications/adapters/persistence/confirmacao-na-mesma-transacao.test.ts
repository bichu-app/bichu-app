import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DbExecutor } from '../../../../shared/db/pool.js';
import type { Instant, UserId } from '../../../../shared/types/brands.js';
import { gravarPublicacaoNaTransacao } from './kysely-publicacoes.js';

const AUTOR = 'a0000000-0000-7000-8000-000000000001' as UserId;
const ENVIO = '018f7c1e-7a2b-7c3d-9e4f-000000000001';
const AGORA = Date.parse('2026-10-20T12:00:00Z') as Instant;
const REF = 'AaBbCcDdEeFfGgHhIiJjKk';

interface Operacao {
  readonly acao: string;
  readonly tabela: string;
  readonly executor: object;
  readonly valores?: Record<string, unknown>;
}

interface EnvioDoDuble {
  readonly id: string;
  readonly expires_at: Date;
  readonly confirmed_at: Date | null;
  readonly catalog_image_id: string | null;
}

function executorQueRegistra(registro: Operacao[], envio: EnvioDoDuble | undefined): DbExecutor {
  const executor: Record<string, unknown> = {};
  const encadear = (acao: string, tabela: string) => {
    const elo: Record<string, unknown> = {};
    const devolveElo = (): unknown => elo;
    for (const metodo of [
      'where',
      'set',
      'leftJoin',
      'innerJoin',
      'select',
      'forUpdate',
      'orderBy',
      'limit',
    ]) {
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
      return Promise.resolve(envio);
    };
    return elo;
  };
  executor['deleteFrom'] = (t: string) => encadear('delete', t);
  executor['selectFrom'] = (t: string) => encadear('select', t);
  executor['updateTable'] = (t: string) => encadear('update', t);
  executor['insertInto'] = (t: string) => encadear('insert', t);
  return executor as unknown as DbExecutor;
}

const envioAberto: EnvioDoDuble = {
  id: ENVIO,
  expires_at: new Date(Number(AGORA) + 600_000),
  confirmed_at: null,
  catalog_image_id: null,
};

const ids = {
  uuidv7: () => '018f7c1e-7a2b-7c3d-9e4f-0000000000ff',
  random128: () => new Uint8Array(16),
};

function publicar(registro: Operacao[], envio: EnvioDoDuble | undefined, uploadId: string | null) {
  return gravarPublicacaoNaTransacao(
    executorQueRegistra(registro, envio),
    {
      autor: AUTOR,
      ref: REF,
      corpo: 'o Bidu no parque hoje',
      uploadId,
      textoAlternativo: uploadId === null ? null : 'o Bidu correndo na grama',
      agora: AGORA,
    },
    ids as never,
  );
}

void describe('ISCA (d): a foto da publicacao confirma na MESMA transacao do publicar', () => {
  void it('ISCA (d) -- `confirmed_at` e a linha da publicacao chegam no MESMO executor', async () => {
    const registro: Operacao[] = [];
    await publicar(registro, envioAberto, ENVIO);

    const confirmacao = registro.find(
      (o) => o.acao === 'update' && o.tabela === 'catalog_upload_intents',
    );
    const publicacao = registro.find(
      (o) => o.acao === 'insert' && o.tabela === 'user_publications',
    );

    assert.ok(confirmacao, 'sem gravar `confirmed_at` a intencao fica eternamente varrivel');
    assert.ok(publicacao, 'sem a linha de `user_publications` nao ha publicacao nenhuma');
    assert.strictEqual(
      confirmacao.executor,
      publicacao.executor,
      'MESMO executor = MESMA transacao. Executores diferentes abrem a janela em que a ' +
        'publicacao existe e a intencao dela ainda nao esta confirmada, que e a condicao ' +
        'exata em que a varredura apagou a foto do achado',
    );
  });

  void it('ISCA (d) -- a imagem nasce no MESMO executor, com o proposito da PUBLICACAO', async () => {
    const registro: Operacao[] = [];
    await publicar(registro, envioAberto, ENVIO);

    const imagem = registro.find((o) => o.acao === 'insert' && o.tabela === 'catalog_images');
    assert.ok(imagem);
    assert.equal(
      imagem.valores?.['purpose'],
      'user_publication',
      'o proposito gravado e o da publicacao: e ele que escolhe a derivada `card` de 1024 px, ' +
        'e um proposito errado aqui faz a confirmacao nao achar o envio -- o defeito de 18/10',
    );
    const trabalho = registro.find((o) => o.acao === 'insert' && o.tabela === 'jobs');
    assert.ok(trabalho, 'imagem sem trabalho enfileirado fica `processing` para sempre');
    assert.strictEqual(imagem.executor, trabalho.executor, 'os dois na mesma transacao');
    assert.strictEqual(
      imagem.executor,
      registro.find((o) => o.acao === 'insert' && o.tabela === 'user_publications')?.executor,
    );
  });

  void it('ISCA (d) -- publicacao de TEXTO PURO nao confirma envio nenhum', async () => {
    const registro: Operacao[] = [];
    const desfecho = await publicar(registro, undefined, null);

    assert.notEqual(typeof desfecho, 'string', 'texto puro foi recusado');
    assert.equal(
      registro.filter((o) => o.tabela === 'catalog_upload_intents').length,
      0,
      'texto puro foi procurar envio: ida ao banco paga por nada',
    );
    assert.equal(registro.filter((o) => o.tabela === 'catalog_images').length, 0);
    assert.equal(registro.filter((o) => o.tabela === 'jobs').length, 0);
    const publicacao = registro.find(
      (o) => o.acao === 'insert' && o.tabela === 'user_publications',
    );
    assert.equal(publicacao?.valores?.['image_id'], null);
    assert.equal(
      publicacao?.valores?.['alt_text'],
      null,
      'texto alternativo sem imagem nao descreve nada, e o `CHECK` do banco o recusa',
    );
  });

  void it('ISCA (d) -- ENVIO ABANDONADO (nao encontrado) nao grava publicacao nenhuma', async () => {
    const registro: Operacao[] = [];
    const desfecho = await publicar(registro, undefined, ENVIO);

    assert.equal(desfecho, 'envio-nao-encontrado');
    assert.equal(
      registro.filter((o) => o.acao === 'insert').length,
      0,
      'o envio nao foi encontrado e alguma coisa foi gravada: `404` tem de ser escrita nenhuma',
    );
  });

  void it('ISCA (d) -- envio JA USADO nao vira uma segunda publicacao', async () => {
    const registro: Operacao[] = [];
    const desfecho = await publicar(
      registro,
      { ...envioAberto, catalog_image_id: '018f7c1e-7a2b-7c3d-9e4f-00000000aaaa' },
      ENVIO,
    );
    assert.equal(desfecho, 'envio-ja-usado');
    assert.equal(registro.filter((o) => o.acao === 'insert').length, 0);
  });

  void it('ISCA (d) -- envio VENCIDO nao grava, e a mensagem manda enviar de novo', async () => {
    const registro: Operacao[] = [];
    const desfecho = await publicar(
      registro,
      { ...envioAberto, expires_at: new Date(Number(AGORA) - 1) },
      ENVIO,
    );
    assert.equal(desfecho, 'envio-vencido');
    assert.equal(registro.filter((o) => o.acao === 'insert').length, 0);
  });

  void it('CONTRAPESO -- a publicacao gravada leva autor, endereco, corpo e texto alternativo', async () => {
    const registro: Operacao[] = [];
    await publicar(registro, envioAberto, ENVIO);
    const publicacao = registro.find(
      (o) => o.acao === 'insert' && o.tabela === 'user_publications',
    );
    assert.equal(publicacao?.valores?.['author_user_id'], AUTOR);
    assert.equal(publicacao?.valores?.['public_ref'], REF);
    assert.equal(publicacao?.valores?.['body'], 'o Bidu no parque hoje');
    assert.equal(publicacao?.valores?.['alt_text'], 'o Bidu correndo na grama');
    assert.ok(publicacao?.valores?.['image_id'] !== null);
  });

  void it('CONTRAPESO -- a resposta do publicar sai com a foto em `processing` e sem URL', async () => {
    const desfecho = await publicar([], envioAberto, ENVIO);
    assert.notEqual(typeof desfecho, 'string');
    if (typeof desfecho === 'string') return;
    assert.equal(desfecho.foto?.status, 'processing');
    assert.equal(desfecho.foto?.abertaKey, null);
    assert.equal(desfecho.foto?.uploadId, ENVIO);
    assert.equal(desfecho.ref, REF);
  });
});
