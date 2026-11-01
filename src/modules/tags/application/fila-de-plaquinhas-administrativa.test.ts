import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AdminAccountId, Instant } from '../../../shared/types/brands.js';
import type { Clock } from '../../../shared/ports/index.js';
import { comoData } from '../../../shared/time/clock.js';
import type { AuditEvent, EscritaAuditada } from '../../audit/ports/audit-log.js';
import type { AtorAdministrativo } from '../../audit/ports/trilha-administrativa.js';
import type {
  PassoDaEntrega,
  PedidoDePlaquinhaRepository,
  PedidoNaFilaDePlaquinhas,
} from '../ports/pedido-de-plaquinha.js';
import { FilaDePlaquinhasAdministrativa } from './pedido-de-plaquinha-service.js';
import {
  rotaDeAtenderPedidoDePlaquinha,
  rotaDeAtualizarEntregaDaPlaquinha,
  rotaDeRecusarPedidoDePlaquinha,
} from '../adapters/http/admin-pedido-de-plaquinha-routes.js';

const AGORA = 1_800_000_000_000 as Instant;
const ADMIN = '018f3a2b-0000-7000-8000-00000000ad01' as AdminAccountId;
const ID_INTERNO = '018f3a2b-0000-7000-8000-0000000000e1';
const REF = 'yjJwZ3hBc0RmR2hKa0xtTg';
const REF_DESCONHECIDO = 'bmFvRXhpc3RlRXN0ZVJlZkFx';

const NOME_DE_QUEM_PEDIU = 'Mariana Solicitante';

const RASTREIO = 'XQ771230045BR';

const ENDERECO = {
  destinatario: 'Mariana Destinataria',
  telefone: '+5511987654321',
  cep: '01311000',
  logradouro: 'Avenida Paulista Ficticia',
  numero: '1578B',
  complemento: 'apto 92 fundos',
  bairro: 'Bela Vista Inventada',
  cidade: 'Sao Paulo dos Testes',
  uf: 'SP',
} as const;

const ATOR: AtorAdministrativo = {
  adminAccountId: ADMIN,
  ip: '203.0.113.7',
  correlationId: 'corr-1',
  sessao: 'a1b2c3d4',
};

function pedido(
  status: PedidoNaFilaDePlaquinhas['status'],
  entrega: PassoDaEntrega = 'requested',
  rastreio: string | null = null,
): PedidoNaFilaDePlaquinhas {
  return {
    id: ID_INTERNO,
    ref: REF,
    petNome: 'Bidu',
    petEspecie: 'dog',
    endereco: ENDERECO,
    observacao: 'coleira vermelha',
    status,
    solicitadoEm: comoData(AGORA),
    decididoEm: status === 'pending' ? null : comoData(AGORA),
    passoDaEntrega: entrega,
    codigoDeRastreio: rastreio,
    despachadoEm: entrega === 'requested' ? null : comoData(AGORA),
    entregueEm: entrega === 'arrived' ? comoData(AGORA) : null,
  };
}

function naoUsado(nome: string): never {
  throw new Error(`o duble nao implementa ${nome}: nenhum caso deste arquivo chega la`);
}

interface Bancada {
  readonly fila: FilaDePlaquinhasAdministrativa;
  readonly eventos: AuditEvent[];
  readonly decisoes: { readonly id: string; readonly decisao: string }[];
  readonly entregas: {
    readonly id: string;
    readonly passo: PassoDaEntrega;
    readonly rastreio: string | null | undefined;
  }[];
}

function bancada(
  estado: PedidoNaFilaDePlaquinhas['status'] | 'ausente',
  entrega: PassoDaEntrega = 'requested',
  rastreio: string | null = null,
): Bancada {
  const eventos: AuditEvent[] = [];
  const decisoes: { id: string; decisao: string }[] = [];
  const entregas: {
    id: string;
    passo: PassoDaEntrega;
    rastreio: string | null | undefined;
  }[] = [];
  let atual = estado === 'ausente' ? undefined : pedido(estado, entrega, rastreio);

  const repositorio: PedidoDePlaquinhaRepository = {
    criarOuDevolverPendente: () => naoUsado('criarOuDevolverPendente'),
    listarDoPet: () => naoUsado('listarDoPet'),
    listarFila: () => naoUsado('listarFila'),
    pedidoPorRef: (_trx, ref) =>
      Promise.resolve(ref === REF ? atual : undefined),
    pedidoParaLeitura: (ref) => Promise.resolve(ref === REF ? atual : undefined),
    decidir: (_trx, id, decisao) => {
      decisoes.push({ id, decisao });
      atual = { ...pedido(decisao), status: decisao, decididoEm: comoData(AGORA) };
      return Promise.resolve(atual);
    },
    atualizarEntrega: (_trx, id, pedida) => {
      entregas.push({ id, passo: pedida.passo, rastreio: pedida.rastreio });
      const anterior = atual?.codigoDeRastreio ?? null;
      const gravado =
        pedida.rastreio === undefined ? anterior : pedida.rastreio;
      atual = pedido('fulfilled', pedida.passo, gravado);
      return Promise.resolve(atual);
    },
  };

  const escrita: EscritaAuditada = {
    executar: async (trabalho) => {
      const { resultado, evento } = await trabalho(
        undefined as unknown as Parameters<typeof trabalho>[0],
      );
      eventos.push(evento);
      return resultado;
    },
  };

  const clock: Clock = { now: () => AGORA };
  return {
    fila: new FilaDePlaquinhasAdministrativa({ repositorio, escrita, clock }),
    eventos,
    decisoes,
    entregas,
  };
}

void describe('a decisao do painel sobre o pedido da plaquinha', () => {
  void it('1. atender grava a trilha junto da escrita, com a acao do contrato', async () => {
    const b = bancada('pending');
    const atendido = await b.fila.atender(
      rotaDeAtenderPedidoDePlaquinha.audit,
      ATOR,
      REF,
    );
    assert.equal(atendido.status, 'fulfilled');
    assert.equal(b.decisoes.length, 1);
    assert.equal(b.eventos.length, 1);
    assert.equal(b.eventos[0]?.action, 'admin.collar_tag_request.fulfilled');
    assert.equal(b.eventos[0]?.actorKind, 'admin');
    assert.equal(b.eventos[0]?.actorAdminId, ADMIN);
  });

  void it('1b. recusar grava a propria acao, e nao a de atender', async () => {
    const b = bancada('pending');
    const recusado = await b.fila.recusar(
      rotaDeRecusarPedidoDePlaquinha.audit,
      ATOR,
      REF,
    );
    assert.equal(recusado.status, 'declined');
    assert.equal(b.eventos[0]?.action, 'admin.collar_tag_request.declined');
  });

  void it('2. a trilha identifica pelo `id` e pelo `ref`, e nada do solicitante entra', async () => {
    const b = bancada('pending');
    await b.fila.atender(rotaDeAtenderPedidoDePlaquinha.audit, ATOR, REF);
    const evento = b.eventos[0];
    assert.equal(evento?.resourceId, ID_INTERNO);
    assert.equal(evento?.resourceKind, 'collar_tag_request');
    assert.equal((evento?.metadata as { ref?: string } | undefined)?.ref, REF);
    assert.doesNotMatch(JSON.stringify(evento), new RegExp(NOME_DE_QUEM_PEDIU, 'i'));
  });

  void it('2b. endereco e telefone nao entram na trilha, campo por campo', async () => {
    const b = bancada('pending');
    await b.fila.atender(rotaDeAtenderPedidoDePlaquinha.audit, ATOR, REF);
    const serializado = JSON.stringify(b.eventos[0]);

    for (const valor of Object.values(ENDERECO)) {
      assert.ok(
        !serializado.includes(valor),
        `o evento de trilha carrega um campo do endereco ou o telefone: ${valor}`,
      );
    }
    assert.equal(b.eventos[0]?.resourceId, ID_INTERNO);
  });

  void it('3. pedido ja atendido responde 400 `request_not_pending`', async () => {
    const b = bancada('fulfilled');
    await assert.rejects(
      () => b.fila.atender(rotaDeAtenderPedidoDePlaquinha.audit, ATOR, REF),
      (erro: unknown) => {
        const problema = erro as { status?: number; errors?: { code?: string }[] };
        assert.equal(problema.status, 400);
        assert.equal(problema.errors?.[0]?.code, 'request_not_pending');
        return true;
      },
    );
    assert.equal(b.decisoes.length, 0);
    assert.equal(b.eventos.length, 0);
  });

  void it('4. `ref` desconhecido responde 404', async () => {
    const b = bancada('ausente');
    await assert.rejects(
      () => b.fila.atender(rotaDeAtenderPedidoDePlaquinha.audit, ATOR, REF_DESCONHECIDO),
      (erro: unknown) => {
        assert.equal((erro as { status?: number }).status, 404);
        return true;
      },
    );
  });

  void it('5. decidir nao emite codigo: nenhum campo de codigo sai da decisao', async () => {
    const b = bancada('pending');
    const atendido = await b.fila.atender(
      rotaDeAtenderPedidoDePlaquinha.audit,
      ATOR,
      REF,
    );
    assert.deepEqual(Object.keys(atendido).sort(), [
      'codigoDeRastreio',
      'decididoEm',
      'despachadoEm',
      'endereco',
      'entregueEm',
      'id',
      'observacao',
      'passoDaEntrega',
      'petEspecie',
      'petNome',
      'ref',
      'solicitadoEm',
      'status',
    ]);
  });

  void it('6. a transicao valida passa: `requested` -> `in_transit` grava passo e rastreio', async () => {
    const b = bancada('fulfilled', 'requested');
    const despachado = await b.fila.atualizarEntrega(
      rotaDeAtualizarEntregaDaPlaquinha.audit,
      ATOR,
      REF,
      'in_transit',
      RASTREIO,
    );
    assert.equal(despachado.passoDaEntrega, 'in_transit');
    assert.equal(despachado.codigoDeRastreio, RASTREIO);
    assert.deepEqual(b.entregas, [{ id: ID_INTERNO, passo: 'in_transit', rastreio: RASTREIO }]);
    assert.equal(b.eventos.length, 1);
    assert.equal(b.eventos[0]?.action, 'admin.collar_tag_request.delivery_updated');
  });

  void it('7. voltar atras e recusado: `arrived` -> `in_transit` responde 400 e NAO escreve', async () => {
    const b = bancada('fulfilled', 'arrived', RASTREIO);
    await assert.rejects(
      () =>
        b.fila.atualizarEntrega(
          rotaDeAtualizarEntregaDaPlaquinha.audit,
          ATOR,
          REF,
          'in_transit',
          undefined,
        ),
      (erro: unknown) => {
        const problema = erro as { status?: number; errors?: { code?: string }[] };
        assert.equal(problema.status, 400);
        assert.equal(problema.errors?.[0]?.code, 'invalid_delivery_transition');
        return true;
      },
    );
    assert.equal(b.entregas.length, 0);
    assert.equal(b.eventos.length, 0);
  });

  void it('7b. pular o despacho e recusado: `requested` -> `arrived` responde 400', async () => {
    const b = bancada('fulfilled', 'requested');
    await assert.rejects(
      () =>
        b.fila.atualizarEntrega(
          rotaDeAtualizarEntregaDaPlaquinha.audit,
          ATOR,
          REF,
          'arrived',
          undefined,
        ),
      (erro: unknown) => {
        const problema = erro as { errors?: { code?: string }[] };
        assert.equal(problema.errors?.[0]?.code, 'invalid_delivery_transition');
        return true;
      },
    );
    assert.equal(b.entregas.length, 0);
  });

  void it('8. pedido nao atendido nao anda: `pending` responde 400 `request_not_fulfilled`', async () => {
    const b = bancada('pending', 'requested');
    await assert.rejects(
      () =>
        b.fila.atualizarEntrega(
          rotaDeAtualizarEntregaDaPlaquinha.audit,
          ATOR,
          REF,
          'in_transit',
          RASTREIO,
        ),
      (erro: unknown) => {
        const problema = erro as { status?: number; errors?: { code?: string }[] };
        assert.equal(problema.status, 400);
        assert.equal(problema.errors?.[0]?.code, 'request_not_fulfilled');
        return true;
      },
    );
    assert.equal(b.entregas.length, 0);
    assert.equal(b.eventos.length, 0);
  });

  void it('8b. pedido recusado nao anda, pela mesma recusa', async () => {
    const b = bancada('declined', 'requested');
    await assert.rejects(
      () =>
        b.fila.atualizarEntrega(
          rotaDeAtualizarEntregaDaPlaquinha.audit,
          ATOR,
          REF,
          'in_transit',
          RASTREIO,
        ),
      (erro: unknown) => {
        assert.equal((erro as { errors?: { code?: string }[] }).errors?.[0]?.code, 'request_not_fulfilled');
        return true;
      },
    );
    assert.equal(b.entregas.length, 0);
  });

  void it('9. rastreio ausente MANTEM, `null` apaga, e so espaco e recusado', async () => {
    const mantem = bancada('fulfilled', 'in_transit', RASTREIO);
    const chegou = await mantem.fila.atualizarEntrega(
      rotaDeAtualizarEntregaDaPlaquinha.audit,
      ATOR,
      REF,
      'arrived',
      undefined,
    );
    assert.equal(chegou.passoDaEntrega, 'arrived');
    assert.equal(chegou.codigoDeRastreio, RASTREIO);
    assert.equal(mantem.entregas[0]?.rastreio, undefined);

    const apaga = bancada('fulfilled', 'in_transit', RASTREIO);
    const semRastreio = await apaga.fila.atualizarEntrega(
      rotaDeAtualizarEntregaDaPlaquinha.audit,
      ATOR,
      REF,
      'in_transit',
      null,
    );
    assert.equal(semRastreio.codigoDeRastreio, null);

    const branco = bancada('fulfilled', 'in_transit', RASTREIO);
    await assert.rejects(
      () =>
        branco.fila.atualizarEntrega(
          rotaDeAtualizarEntregaDaPlaquinha.audit,
          ATOR,
          REF,
          'in_transit',
          '   ',
        ),
      (erro: unknown) => {
        const problema = erro as { status?: number; errors?: { code?: string }[] };
        assert.equal(problema.status, 400);
        assert.equal(problema.errors?.[0]?.code, 'blank_tracking_code');
        return true;
      },
    );
    assert.equal(branco.entregas.length, 0);
  });

  void it('9b. rastreio acima de 64 simbolos e recusado, e nada de formato e cobrado', async () => {
    const b = bancada('fulfilled', 'in_transit');
    await assert.rejects(
      () =>
        b.fila.atualizarEntrega(
          rotaDeAtualizarEntregaDaPlaquinha.audit,
          ATOR,
          REF,
          'in_transit',
          'X'.repeat(65),
        ),
      (erro: unknown) => {
        assert.equal(
          (erro as { errors?: { code?: string }[] }).errors?.[0]?.code,
          'tracking_code_too_long',
        );
        return true;
      },
    );
    const estranho = bancada('fulfilled', 'in_transit');
    const aceito = await estranho.fila.atualizarEntrega(
      rotaDeAtualizarEntregaDaPlaquinha.audit,
      ATOR,
      REF,
      'in_transit',
      'entrega-em-maos-2026',
    );
    assert.equal(aceito.codigoDeRastreio, 'entrega-em-maos-2026');
  });

  void it('10. a trilha da entrega registra passo e rastreio, e NUNCA o endereco', async () => {
    const b = bancada('fulfilled', 'requested');
    await b.fila.atualizarEntrega(
      rotaDeAtualizarEntregaDaPlaquinha.audit,
      ATOR,
      REF,
      'in_transit',
      RASTREIO,
    );
    const evento = b.eventos[0];
    const serializado = JSON.stringify(evento);

    assert.equal(evento?.resourceId, ID_INTERNO);
    assert.equal(evento?.resourceKind, 'collar_tag_request');
    assert.equal((evento?.metadata as { ref?: string } | undefined)?.ref, REF);
    assert.deepEqual(evento?.before, { delivery_state: 'requested', tracking_code: null });
    assert.deepEqual(evento?.after, { delivery_state: 'in_transit', tracking_code: RASTREIO });

    for (const valor of Object.values(ENDERECO)) {
      assert.ok(
        !serializado.includes(valor),
        `o evento de trilha da entrega carrega um campo do endereco ou o telefone: ${valor}`,
      );
    }
    assert.doesNotMatch(serializado, new RegExp(NOME_DE_QUEM_PEDIU, 'i'));
  });

  void it('11. `ref` desconhecido na entrega responde 404, e na leitura tambem', async () => {
    const b = bancada('ausente');
    await assert.rejects(
      () =>
        b.fila.atualizarEntrega(
          rotaDeAtualizarEntregaDaPlaquinha.audit,
          ATOR,
          REF_DESCONHECIDO,
          'in_transit',
          RASTREIO,
        ),
      (erro: unknown) => {
        assert.equal((erro as { status?: number }).status, 404);
        return true;
      },
    );
    await assert.rejects(
      () => b.fila.ler(REF_DESCONHECIDO),
      (erro: unknown) => {
        assert.equal((erro as { status?: number }).status, 404);
        return true;
      },
    );
  });
});
