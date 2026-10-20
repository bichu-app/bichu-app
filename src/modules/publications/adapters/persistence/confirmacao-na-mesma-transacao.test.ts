/**
 * ISCA (d), METADE DO SERVIDOR: **a foto da publicação é confirmada na MESMA
 * transação da escrita, e a publicação ABANDONADA não confirma nada.**
 *
 * ## O padrão de foto, e qual metade dele este arquivo mede
 *
 * Decisão do cliente de 19/10/2026: escolher **envia na hora**, a prévia é do
 * arquivo local, e o `Publicar` **confirma**. Nada de botão separado de salvar
 * foto — foi exatamente o defeito que ele relatou duas vezes.
 *
 * Isso tem duas metades, em dois lugares:
 *
 * - **no aplicativo**, a prévia aparece na escolha e o `upload_id` só é enviado
 *   no `Publicar`. Medido em `app/test/mural/...`;
 * - **no servidor**, `confirmed_at` passa a valer no mesmo instante em que a
 *   publicação passa a existir. É o que este arquivo mede.
 *
 * ## Por que a segunda metade é um teste de EXECUTOR, e não de resultado
 *
 * Porque a promessa não é "a confirmação acontece": é "ela acontece na MESMA
 * transação". A varredura de vencidos apaga intenção **não confirmada e
 * vencida**, e apagou a foto do achado — medido com hora: subida 01:18:44,
 * apagada 01:29:10. Dez minutos, e sempre. A causa era a foto do achado não ter
 * confirmação nenhuma.
 *
 * Com a confirmação em transação SEPARADA da escrita existiria uma janela em
 * que a publicação está gravada e a intenção dela ainda não — e nessa janela a
 * varredura é correta em recolher o objeto, e a foto desaparece de uma
 * publicação que a pessoa já publicou. **Medir o resultado não enxerga essa
 * janela**; medir qual executor recebeu cada escrita, sim. É a forma de
 * `showcase/adapters/persistence/confirmacao-na-mesma-transacao.test.ts`.
 *
 * A suíte não tem banco: o dublê abaixo não executa SQL nenhum, porque o que
 * está sendo medido é **quem** recebeu cada escrita.
 */
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

/** O envio que a `SELECT` do dublê devolve. Trocado por caso. */
interface EnvioDoDuble {
  readonly id: string;
  readonly expires_at: Date;
  readonly confirmed_at: Date | null;
  readonly catalog_image_id: string | null;
}

/** Um executor de banco de MENTIRA, encadeável como o Kysely, que só registra. */
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
    // O caminho comum, e ele tem de ser barato: nenhuma ida ao banco atras de
    // envio, nenhuma imagem, nenhum trabalho.
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
    // `undefined` do dublê é o que o `WHERE` devolve para envio de outra conta,
    // de outro propósito, ou inexistente. **Nada pode ser gravado**: uma
    // publicação que nascesse sem a foto deixaria a pessoa com um texto que ela
    // não pediso publicar sozinho.
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
    // `catalog_images.upload_intent_id` é `UNIQUE`, então o banco recusaria --
    // mas com erro de banco sem campo. Aqui a recusa vira `400` com
    // `code: conflict`, e nada é gravado antes dela.
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
    // A intenção vence em 600 s (medido contra a homologação em 19/10/2026:
    // `expires_at` veio 599 s à frente do instante do pedido). Confirmar uma
    // intenção vencida criaria uma imagem cujo objeto o varredor já pode ter
    // recolhido.
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
    // Sem ele, todos os casos de "nada foi gravado" passariam num mundo em que
    // NADA e gravado nunca -- que e a forma mais facil de um teste de omissao
    // ficar verde sem ter medido nada.
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
    // Antes de o worker reescrever a derivada a foto carrega o EXIF do celular
    // (ADR-0010 item 4). O contrato diz isso no `status`, em vez de deixar o
    // aplicativo descobrir pela ausencia da URL.
    const desfecho = await publicar([], envioAberto, ENVIO);
    assert.notEqual(typeof desfecho, 'string');
    if (typeof desfecho === 'string') return;
    assert.equal(desfecho.foto?.status, 'processing');
    assert.equal(desfecho.foto?.abertaKey, null);
    assert.equal(desfecho.foto?.uploadId, ENVIO);
    assert.equal(desfecho.ref, REF);
  });
});
