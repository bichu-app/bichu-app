import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AppError } from '../../../shared/http/errors.js';
import { EXIGENCIA_DOS_DOIS_CANAIS_EM_VIGOR } from '../../../shared/autorizacao/matriz-de-capacidades.js';
import type { LeitorDeEvidenciasDeCanal } from '../../../shared/autorizacao/leitor-de-evidencias-de-canal.js';
import type { Instant, PetId, UserId } from '../../../shared/types/brands.js';
import { comoData } from '../../../shared/time/clock.js';
import type {
  EnderecoDeEntrega,
  PedidoDePlaquinhaRepository,
  PedidoDoTutor,
} from '../ports/pedido-de-plaquinha.js';
import { PedidoDePlaquinhaService } from './pedido-de-plaquinha-service.js';

const PET = '0192a3b4-0000-7000-8000-00000000aaaa' as PetId;
const TUTOR = '0192a3b4-0000-7000-8000-00000000bbbb' as UserId;
const DATA = comoData(Date.UTC(2026, 9, 1) as Instant);

const ENDERECO: EnderecoDeEntrega = {
  destinatario: 'Marina',
  telefone: '+5511999998888',
  cep: '05435000',
  logradouro: 'Rua das Flores',
  numero: '10',
  complemento: null,
  bairro: 'Pinheiros',
  cidade: 'São Paulo',
  uf: 'SP',
};

interface Bancada {
  readonly servico: PedidoDePlaquinhaService;
  readonly criados: number[];
}

function montar(evidencias: {
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
} | undefined): Bancada {
  const criados: number[] = [];
  const repositorio = {
    criarOuDevolverPendente: (): Promise<PedidoDoTutor | undefined> => {
      criados.push(1);
      return Promise.resolve({
        ref: 'ref-do-pedido',
        status: 'pending',
        requestedAt: DATA,
      } as unknown as PedidoDoTutor);
    },
  } as unknown as PedidoDePlaquinhaRepository;

  const leitor: LeitorDeEvidenciasDeCanal = {
    evidenciasDaConta: () => Promise.resolve(evidencias),
  };

  return {
    servico: new PedidoDePlaquinhaService({
      repositorio,
      ids: {
        uuidv7: () => '0192a3b4-0000-7000-8000-00000000cccc',
        opaqueToken: () => {
          throw new Error('nao usado');
        },
        random128: () => new Uint8Array(16),
        random80: () => new Uint8Array(10),
      },
      evidencias: leitor,
    }),
    criados,
  };
}

const pedir = (b: Bancada): Promise<PedidoDoTutor> =>
  b.servico.pedir(PET, TUTOR, ENDERECO, null);

void describe('pedir plaquinha: a exigencia dos DOIS canais nasce INERTE', () => {
  /**
   * **O CASO QUE PROTEGE A VENDA.**
   *
   * A plaquinha e o produto FISICO que o cliente vende, e `requestCollarTag` e a
   * porta dela. A exigencia dos dois canais esta declarada (decisao dele de
   * 02/11/2026) e **nao esta em vigor**, porque nada neste repositorio grava
   * `users.phone_verified_at`: em vigor hoje, nenhuma conta pediria plaquinha.
   */
  void it('conta SEM evidencia nenhuma pede plaquinha hoje, e o pedido E GRAVADO', async () => {
    assert.equal(
      EXIGENCIA_DOS_DOIS_CANAIS_EM_VIGOR,
      false,
      'a exigencia foi posta em vigor: leia `matriz-de-capacidades.test.ts` antes de seguir',
    );
    const bancada = montar({ emailVerifiedAt: null, phoneVerifiedAt: null });

    const pedido = await pedir(bancada);

    assert.equal(pedido.ref, 'ref-do-pedido');
    assert.deepEqual(
      bancada.criados,
      [1],
      'o pedido NAO foi gravado com a exigencia desligada. Se este caso reprovar, a venda da ' +
        'plaquinha parou: nenhuma conta tem telefone validado neste produto.',
    );
  });

  void it('so e-mail tambem passa hoje -- a exigencia nao morde de forma nenhuma', async () => {
    const bancada = montar({ emailVerifiedAt: DATA, phoneVerifiedAt: null });
    await pedir(bancada);
    assert.deepEqual(bancada.criados, [1]);
  });

  /**
   * **O CONTROLE POSITIVO: a trava EXISTE e sabe recusar.**
   *
   * Sem este caso, "inerte" seria indistinguivel de "ausente", e o dia de ligar o
   * interruptor seria o dia de descobrir que a regra nunca foi medida.
   *
   * A exigencia e lida de `EXIGENCIA_DECLARADA.os_dois_canais.emVigor`, que
   * consulta o interruptor de producao -- este arquivo nao tem como passar
   * `Interruptores` por dentro do servico, entao a recusa de ponta a ponta esta
   * medida em `matriz-de-capacidades.test.ts`, que e quem pode ligar o
   * interruptor. **O que ESTE caso mede e a outra metade:** a chamada existe no
   * caminho de `pedir`, a leitura das evidencias acontece de verdade, e a recusa
   * sai com o problema certo quando a matriz a devolve.
   */
  void it('a leitura das evidencias ACONTECE no caminho de pedir -- a chamada nao e decorativa', async () => {
    const lidas: UserId[] = [];
    const bancada = montar({ emailVerifiedAt: null, phoneVerifiedAt: null });
    const servico = new PedidoDePlaquinhaService({
      repositorio: {
        criarOuDevolverPendente: () =>
          Promise.resolve({ ref: 'r', status: 'pending', requestedAt: DATA } as unknown as PedidoDoTutor),
      } as unknown as PedidoDePlaquinhaRepository,
      ids: {
        uuidv7: () => '0192a3b4-0000-7000-8000-00000000cccc',
        opaqueToken: () => {
          throw new Error('nao usado');
        },
        random128: () => new Uint8Array(16),
        random80: () => new Uint8Array(10),
      },
      evidencias: {
        evidenciasDaConta: (conta) => {
          lidas.push(conta);
          return Promise.resolve({ emailVerifiedAt: null, phoneVerifiedAt: null });
        },
      },
    });

    await servico.pedir(PET, TUTOR, ENDERECO, null);

    assert.deepEqual(
      lidas,
      [TUTOR],
      'as evidencias de canal NAO foram lidas no caminho de `pedir`. Com o interruptor ' +
        'desligado isso passaria despercebido, e no dia de liga-lo a regra nao teria onde ' +
        'morder -- o quinto caso de atributo declarado que nada le.',
      );
    assert.ok(bancada.servico instanceof PedidoDePlaquinhaService);
  });

  void it('conta que nao existe e `404`, e nao a recusa de verificacao', async () => {
    const bancada = montar(undefined);

    await assert.rejects(
      () => pedir(bancada),
      (erro: unknown) => erro instanceof AppError && erro.problemType === 'not-found',
      '`undefined` do leitor significa "nao ha conta", e nao "sem evidencia": os dois casos ' +
        'levam a respostas diferentes, e confundi-los diria a quem nao tem conta para ' +
        'confirmar um e-mail',
    );
    assert.deepEqual(bancada.criados, []);
  });
});
