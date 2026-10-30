/** A CAIXA DE NOTIFICACOES -- as iscas da camada de aplicacao. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AppError } from '../../../shared/http/errors.js';
import { comoData } from '../../../shared/time/clock.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { ComunicadoDaCaixa, PaginaDaCaixa } from '../domain/caixa.js';
import type { CaixaDeNotificacoes } from '../ports/caixa-de-notificacoes.js';
import { CaixaDeNotificacoesService } from './caixa-de-notificacoes-service.js';

const DONO = 'c0ffee00-0000-4000-8000-000000000001' as UserId;
/** A data do comunicado, por `comoData` sobre um `Instant`. */
const DISPARADO_EM = comoData(Date.UTC(2026, 9, 20, 12, 0, 0) as Instant);
const OUTRA_CONTA = 'c0ffee00-0000-4000-8000-000000000002' as UserId;

interface Chamadas {
  listar: { usuario: UserId; pagina: number; limite: number }[];
  contar: UserId[];
  marcarLida: { usuario: UserId; ref: string }[];
  marcarTodasLidas: UserId[];
  listaVista: UserId[];
  dispensar: { usuario: UserId; ref: string }[];
  buscarComunicado: { usuario: UserId; ref: string }[];
}

function paginaVazia(pagina: number, limite: number): PaginaDaCaixa {
  return { itens: [], pagina, limite, total: 0, naoLidos: 0 };
}

/**
 * O duble do porto. `marcarLidaDevolve` e o unico comportamento configuravel: e
 * ele que separa "achei" de "nao achei", que e a diferenca entre 204 e 404.
 */
function dubleDaCaixa(
  opcoes: {
    marcarLidaDevolve?: boolean;
    dispensarDevolve?: boolean;
    comunicadoDevolve?: ComunicadoDaCaixa | undefined;
  } = {},
): {
  porto: CaixaDeNotificacoes;
  chamadas: Chamadas;
} {
  const chamadas: Chamadas = {
    listar: [],
    contar: [],
    marcarLida: [],
    marcarTodasLidas: [],
    listaVista: [],
    dispensar: [],
    buscarComunicado: [],
  };
  const porto: CaixaDeNotificacoes = {
    listar(usuario, pagina, limite) {
      chamadas.listar.push({ usuario, pagina, limite });
      return Promise.resolve(paginaVazia(pagina, limite));
    },
    contar(usuario) {
      chamadas.contar.push(usuario);
      return Promise.resolve(7);
    },
    marcarLida(usuario, ref) {
      chamadas.marcarLida.push({ usuario, ref });
      return Promise.resolve(opcoes.marcarLidaDevolve ?? true);
    },
    marcarTodasLidas(usuario) {
      chamadas.marcarTodasLidas.push(usuario);
      return Promise.resolve(4);
    },
    listaVista(usuario) {
      chamadas.listaVista.push(usuario);
      return Promise.resolve();
    },
    dispensar(usuario, ref) {
      chamadas.dispensar.push({ usuario, ref });
      return Promise.resolve(opcoes.dispensarDevolve ?? true);
    },
    buscarComunicado(usuario, ref) {
      chamadas.buscarComunicado.push({ usuario, ref });
      return Promise.resolve(opcoes.comunicadoDevolve);
    },
  };
  return { porto, chamadas };
}

void describe('a caixa de notificacoes, na camada de aplicacao', () => {
  void it('1. leva ao porto o dono vindo do token, e so ele', async () => {
    const { porto, chamadas } = dubleDaCaixa();
    const servico = new CaixaDeNotificacoesService({ caixa: porto });

    await servico.listar({ userId: DONO }, { pagina: 2, limite: 10 });
    await servico.contar({ userId: DONO });
    await servico.marcarTodasLidas({ userId: DONO });

    assert.deepEqual(
      chamadas.listar,
      [{ usuario: DONO, pagina: 2, limite: 10 }],
      'REPROVA: a listagem nao foi ao porto com o dono do token e a pagina pedida',
    );
    assert.deepEqual(chamadas.contar, [DONO], 'REPROVA: a contagem nao usou o dono do token');
    assert.deepEqual(
      chamadas.marcarTodasLidas,
      [DONO],
      'REPROVA: marcar todas nao usou o dono do token',
    );
  });

  void it('2. marcar um aviso que o porto nao acha vira 404, e nunca 403', async () => {
    const { porto, chamadas } = dubleDaCaixa({ marcarLidaDevolve: false });
    const servico = new CaixaDeNotificacoesService({ caixa: porto });

    const erro = await servico
      .marcarLida({ userId: OUTRA_CONTA }, 'refDeOutraContaAAAAAA')
      .then(
        () => undefined,
        (e: unknown) => e,
      );

    assert.ok(erro instanceof AppError, 'REPROVA: nao lancou AppError para aviso nao encontrado');
    assert.equal(
      erro.problemType,
      'not-found',
      'REPROVA: o tipo do problema nao e `not-found`. Um 403 aqui confirmaria que o ref existe (ADR-0021)',
    );
    assert.notEqual(
      erro.problemType,
      'forbidden',
      'REPROVA: respondeu `forbidden`. Recurso de outra conta responde 404, nao 403',
    );
    assert.deepEqual(
      chamadas.marcarLida,
      [{ usuario: OUTRA_CONTA, ref: 'refDeOutraContaAAAAAA' }],
      'REPROVA: o dono nao foi ao porto junto do ref -- a autorizacao e a propria clausula WHERE',
    );
  });

  void it('2b. CONTRAPESO: quando o porto acha o aviso, nada e lancado', async () => {
    const { porto } = dubleDaCaixa({ marcarLidaDevolve: true });
    const servico = new CaixaDeNotificacoesService({ caixa: porto });

    await assert.doesNotReject(
      servico.marcarLida({ userId: DONO }, 'refDoProprioDonoAAAAA'),
      'REPROVA: lancou para um aviso que o porto encontrou -- o caso 2 estaria passando por vazio',
    );
  });

  void it('3. listar NAO zera o contador, e zerar NAO marca item', async () => {
    const { porto, chamadas } = dubleDaCaixa();
    const servico = new CaixaDeNotificacoesService({ caixa: porto });

    await servico.listar({ userId: DONO }, {});
    assert.deepEqual(
      chamadas.listaVista,
      [],
      'REPROVA: listar zerou o contador. Abrir a lista zera o numero por uma operacao PROPRIA, ' +
        'e um GET que escreve nao pode ser repetido nem cacheado',
    );

    await servico.listaVista({ userId: DONO });
    assert.deepEqual(chamadas.listaVista, [DONO], 'REPROVA: zerar nao chegou ao porto');
    assert.deepEqual(
      chamadas.marcarLida,
      [],
      'REPROVA: zerar o contador marcou aviso como lido. "Lido" e o item ABERTO, nao a lista vista',
    );
    assert.deepEqual(
      chamadas.marcarTodasLidas,
      [],
      'REPROVA: zerar o contador marcou todas como lidas',
    );
  });

  void it('4. o limite e recortado em 30, e um pedido maior nao atravessa', async () => {
    const { porto, chamadas } = dubleDaCaixa();
    const servico = new CaixaDeNotificacoesService({ caixa: porto });

    await servico.listar({ userId: DONO }, { pagina: 1, limite: 10_000 });

    assert.equal(
      chamadas.listar[0]?.limite,
      30,
      'REPROVA: um pedido de 10000 linhas atravessou. O contrato recusa 31 na borda, e este ' +
        'recorte e o que protege a porta de um chamador interno',
    );
  });

  void it('4b. pagina e limite fora de faixa pelo lado de baixo viram o minimo', async () => {
    const { porto, chamadas } = dubleDaCaixa();
    const servico = new CaixaDeNotificacoesService({ caixa: porto });

    await servico.listar({ userId: DONO }, { pagina: 0, limite: 0 });

    assert.equal(chamadas.listar[0]?.pagina, 1, 'REPROVA: pagina 0 chegou ao porto');
    assert.equal(chamadas.listar[0]?.limite, 1, 'REPROVA: limite 0 chegou ao porto');
  });

  void it('5. dispensar um aviso que o porto nao acha vira 404, e nunca 403', async () => {
    const { porto, chamadas } = dubleDaCaixa({ dispensarDevolve: false });
    const servico = new CaixaDeNotificacoesService({ caixa: porto });

    const erro = await servico
      .dispensar({ userId: OUTRA_CONTA }, 'refDeOutraContaAAAAAA')
      .then(
        () => undefined,
        (e: unknown) => e,
      );

    assert.ok(erro instanceof AppError, 'REPROVA: nao lancou AppError para aviso nao encontrado');
    assert.equal(
      erro.problemType,
      'not-found',
      'REPROVA: o tipo do problema nao e `not-found`. Um 403 aqui confirmaria que o ref existe (ADR-0021)',
    );
    assert.notEqual(
      erro.problemType,
      'forbidden',
      'REPROVA: respondeu `forbidden`. Recurso de outra conta responde 404, nao 403',
    );
    assert.deepEqual(
      chamadas.dispensar,
      [{ usuario: OUTRA_CONTA, ref: 'refDeOutraContaAAAAAA' }],
      'REPROVA: o dono nao foi ao porto junto do ref -- a autorizacao e a propria clausula WHERE',
    );
  });

  void it('5b. CONTRAPESO: quando o porto dispensa o aviso, nada e lancado', async () => {
    const { porto } = dubleDaCaixa({ dispensarDevolve: true });
    const servico = new CaixaDeNotificacoesService({ caixa: porto });

    await assert.doesNotReject(
      servico.dispensar({ userId: DONO }, 'refDoProprioDonoAAAAA'),
      'REPROVA: lancou para um aviso que o porto dispensou -- o caso 5 estaria passando por vazio',
    );
  });

  void it('6. dispensar NAO marca como lida, e marcar como lida NAO dispensa', async () => {
    const { porto, chamadas } = dubleDaCaixa();
    const servico = new CaixaDeNotificacoesService({ caixa: porto });

    await servico.dispensar({ userId: DONO }, 'refQueFoiDispensado01');

    assert.deepEqual(
      chamadas.dispensar,
      [{ usuario: DONO, ref: 'refQueFoiDispensado01' }],
      'REPROVA: dispensar nao chegou ao porto -- o resto deste caso passaria por vazio',
    );
    assert.deepEqual(
      chamadas.marcarLida,
      [],
      'REPROVA: dispensar marcou o aviso como LIDO. Os dois eixos sao independentes: dispensar ' +
        'tira da LISTA e ler tira do CONTADOR, e dispensar sem ter lido e o caso comum -- quem ' +
        'limpa a lista nao abre cada linha antes',
    );
    assert.deepEqual(
      chamadas.marcarTodasLidas,
      [],
      'REPROVA: dispensar chamou "marcar todas como lidas"',
    );

    await servico.marcarLida({ userId: DONO }, 'refQueFoiLidoAAAAAAAA');

    assert.deepEqual(
      chamadas.marcarLida,
      [{ usuario: DONO, ref: 'refQueFoiLidoAAAAAAAA' }],
      'REPROVA: marcar como lida nao chegou ao porto',
    );
    assert.deepEqual(
      chamadas.dispensar,
      [{ usuario: DONO, ref: 'refQueFoiDispensado01' }],
      'REPROVA: marcar como lida DISPENSOU o aviso. Ler tira do contador e deixa a linha na ' +
        'lista dizendo `Lido`; so o "x" a tira da lista',
    );
  });

  void it('7. comunicado que nao chegou a esta conta vira 404, e nunca 403', async () => {
    const { porto, chamadas } = dubleDaCaixa({ comunicadoDevolve: undefined });
    const servico = new CaixaDeNotificacoesService({ caixa: porto });

    const erro = await servico.buscarComunicado({ userId: OUTRA_CONTA }, 'refDeComunicado00001').then(
      () => undefined,
      (e: unknown) => e,
    );

    assert.ok(erro instanceof AppError, 'REPROVA: nao lancou AppError para comunicado nao encontrado');
    assert.equal(
      erro.problemType,
      'not-found',
      'REPROVA: o tipo do problema nao e `not-found`. Um 403 aqui confirmaria que aquele `ref` foi disparado (ADR-0021)',
    );
    assert.notEqual(
      erro.problemType,
      'forbidden',
      'REPROVA: respondeu `forbidden`. Comunicado de outra conta responde 404, nao 403',
    );
    assert.deepEqual(
      chamadas.buscarComunicado,
      [{ usuario: OUTRA_CONTA, ref: 'refDeComunicado00001' }],
      'REPROVA: o dono nao foi ao porto junto do ref -- o recorte pelo destinatario e a propria clausula WHERE',
    );
  });

  void it('7b. CONTRAPESO: quando o porto acha, o comunicado volta inteiro', async () => {
    const { porto } = dubleDaCaixa({
      comunicadoDevolve: {
        ref: 'refDeComunicado00001',
        titulo: 'Manutencao no sabado',
        corpo: 'O app fica fora do ar das 2h as 4h.',
        disparadoEm: DISPARADO_EM,
      },
    });
    const servico = new CaixaDeNotificacoesService({ caixa: porto });

    const comunicado = await servico.buscarComunicado({ userId: DONO }, 'refDeComunicado00001');

    assert.equal(comunicado.titulo, 'Manutencao no sabado', 'REPROVA: o titulo nao atravessou');
    assert.equal(
      comunicado.corpo,
      'O app fica fora do ar das 2h as 4h.',
      'REPROVA: o CORPO nao atravessou -- e ele a razao desta operacao existir, porque a caixa ' +
        'carrega so o titulo',
    );
    assert.equal(comunicado.disparadoEm, DISPARADO_EM, 'REPROVA: a data nao atravessou');
  });

  void it('8. ler o comunicado NAO marca o aviso como lido nem o dispensa', async () => {
    const { porto, chamadas } = dubleDaCaixa({
      comunicadoDevolve: {
        ref: 'refDeComunicado00001',
        titulo: 'Recado',
        corpo: 'Texto do recado.',
        disparadoEm: DISPARADO_EM,
      },
    });
    const servico = new CaixaDeNotificacoesService({ caixa: porto });

    await servico.buscarComunicado({ userId: DONO }, 'refDeComunicado00001');

    assert.deepEqual(
      chamadas.buscarComunicado,
      [{ usuario: DONO, ref: 'refDeComunicado00001' }],
      'REPROVA: a leitura nao chegou ao porto -- o resto deste caso passaria por vazio',
    );
    assert.deepEqual(
      chamadas.marcarLida,
      [],
      'REPROVA: abrir a pagina do comunicado marcou o AVISO como lido. Sao dois fatos, e o `ref` ' +
        'do comunicado nao e o `ref` da notificacao',
    );
    assert.deepEqual(
      chamadas.dispensar,
      [],
      'REPROVA: abrir a pagina do comunicado DISPENSOU o aviso da caixa',
    );
    assert.deepEqual(
      chamadas.marcarTodasLidas,
      [],
      'REPROVA: abrir a pagina do comunicado marcou todas como lidas',
    );
  });
});
