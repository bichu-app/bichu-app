/**
 * A decisao do painel sobre o pedido da plaquinha.
 *
 * ===========================================================================
 * ESTE ARQUIVO FOI ESCRITO E **NAO FOI EXECUTADO**
 * ===========================================================================
 * Mesma razao do irmao `adapters/http/pedido-de-plaquinha.test.ts`: por
 * decisao de quem pediu a entrega (17/10/2026), nenhuma suite rodou nesta
 * branch. **Nenhuma afirmacao aqui esta provada.**
 *
 * ===========================================================================
 * O QUE CADA CASO MEDE
 * ===========================================================================
 *
 * 1. **Atender e recusar gravam a trilha NA MESMA transacao da escrita** (D49).
 *    O duble de `EscritaAuditada` so conclui quando o trabalho devolve o par
 *    `{resultado, evento}`; um caso de uso que decidisse sem montar evento nao
 *    compila, e um que montasse evento fora da transacao nao apareceria aqui.
 *
 * 2. **A trilha identifica o pedido pelo `id` interno e pelo `ref`, e NUNCA
 *    por quem pediu.** A assercao e sobre o evento inteiro serializado: um
 *    campo novo que amanha carregue dado do solicitante reprova aqui sem
 *    ninguem lembrar de incluir o nome dele.
 *
 * 2b. **O ENDERECO E O TELEFONE NAO ENTRAM NA TRILHA.** Esta e a isca que o
 *    cliente comprou junto do endereco: `audit.events` pode registrar que
 *    houve pedido e qual foi a decisao, **nunca o endereco**. A varredura
 *    procura cada um dos NOVE campos no evento serializado -- o telefone de
 *    quem recebe entre eles --, com valores que
 *    nao aparecem em mais lugar nenhum do arquivo -- um `before`/`after` que
 *    passasse a copiar a linha inteira reprova aqui, e e esse o jeito mais
 *    provavel de o endereco vazar para la sem ninguem notar.
 *
 * 3. **Pedido que nao esta `pending` responde 400 `request_not_pending`**, e
 *    nao 409 nem 200 calado. Atender duas vezes nao atende duas vezes.
 *
 * 4. **`ref` desconhecido responde 404.** Nao ha 403 nesta superficie: quem
 *    chega ate aqui passou pela guarda do prefixo `/v1/admin`.
 *
 * 5. **Decidir NAO emite codigo.** O duble do repositorio nao tem como emitir,
 *    e e isso que o caso afirma: nenhuma chamada de emissao existe no caminho.
 *    Emitir e `issuePetTag`, irreversivel (ADR-0004), e um painel que emitisse
 *    criaria plaquinha sem o tutor pedir.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AdminAccountId, Instant } from '../../../shared/types/brands.js';
import type { Clock } from '../../../shared/ports/index.js';
import { comoData } from '../../../shared/time/clock.js';
import type { AuditEvent, EscritaAuditada } from '../../audit/ports/audit-log.js';
import type { AtorAdministrativo } from '../../audit/ports/trilha-administrativa.js';
import type {
  PedidoDePlaquinhaRepository,
  PedidoNaFilaDePlaquinhas,
} from '../ports/pedido-de-plaquinha.js';
import { FilaDePlaquinhasAdministrativa } from './pedido-de-plaquinha-service.js';
import {
  rotaDeAtenderPedidoDePlaquinha,
  rotaDeRecusarPedidoDePlaquinha,
} from '../adapters/http/admin-pedido-de-plaquinha-routes.js';

const AGORA = 1_800_000_000_000 as Instant;
const ADMIN = '018f3a2b-0000-7000-8000-00000000ad01' as AdminAccountId;
const ID_INTERNO = '018f3a2b-0000-7000-8000-0000000000e1';
const REF = 'yjJwZ3hBc0RmR2hKa0xtTg';
const REF_DESCONHECIDO = 'bmFvRXhpc3RlRXN0ZVJlZkFx';

/** O nome do solicitante, que NUNCA deve aparecer em lugar nenhum. */
const NOME_DE_QUEM_PEDIU = 'Mariana Solicitante';

/**
 * O endereco do pedido. **Cada valor e unico neste arquivo**, para a varredura
 * da isca 2b nao casar com outra coisa por acidente.
 */
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
  };
}

function naoUsado(nome: string): never {
  throw new Error(`o duble nao implementa ${nome}: nenhum caso deste arquivo chega la`);
}

interface Bancada {
  readonly fila: FilaDePlaquinhasAdministrativa;
  /** Os eventos que a unidade de trabalho gravou. E o que o caso 2 le. */
  readonly eventos: AuditEvent[];
  /** As decisoes que chegaram ao repositorio. */
  readonly decisoes: { readonly id: string; readonly decisao: string }[];
}

function bancada(estado: PedidoNaFilaDePlaquinhas['status'] | 'ausente'): Bancada {
  const eventos: AuditEvent[] = [];
  const decisoes: { id: string; decisao: string }[] = [];
  let atual = estado === 'ausente' ? undefined : pedido(estado);

  const repositorio: PedidoDePlaquinhaRepository = {
    criarOuDevolverPendente: () => naoUsado('criarOuDevolverPendente'),
    listarFila: () => naoUsado('listarFila'),
    pedidoPorRef: (_trx, ref) =>
      Promise.resolve(ref === REF ? atual : undefined),
    decidir: (_trx, id, decisao) => {
      decisoes.push({ id, decisao });
      atual = { ...pedido(decisao), status: decisao, decididoEm: comoData(AGORA) };
      return Promise.resolve(atual);
    },
  };

  // A unidade de trabalho de verdade abre uma transacao; aqui ela so prova que
  // o trabalho devolveu evento junto do resultado, que e a propriedade de D49
  // que este arquivo consegue medir sem banco.
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
    // A varredura e sobre o evento INTEIRO, e nao sobre uma lista de campos.
    assert.doesNotMatch(JSON.stringify(evento), new RegExp(NOME_DE_QUEM_PEDIU, 'i'));
  });

  void it('2b. endereco e telefone nao entram na trilha, campo por campo', async () => {
    const b = bancada('pending');
    await b.fila.atender(rotaDeAtenderPedidoDePlaquinha.audit, ATOR, REF);
    const serializado = JSON.stringify(b.eventos[0]);

    // Os nove campos, um a um -- telefone inclusive. Afirmar so "nao contem o
    // CEP" deixaria passar um evento que copiasse logradouro e telefone.
    for (const valor of Object.values(ENDERECO)) {
      assert.ok(
        !serializado.includes(valor),
        `o evento de trilha carrega um campo do endereco ou o telefone: ${valor}`,
      );
    }
    // E o que ele PRECISA carregar continua la, para a isca nao ficar verde
    // por um evento vazio.
    assert.equal(b.eventos[0]?.resourceId, ID_INTERNO);
  });

  void it('3. pedido ja atendido responde 400 `request_not_pending`', async () => {
    const b = bancada('fulfilled');
    await assert.rejects(
      () => b.fila.atender(rotaDeAtenderPedidoDePlaquinha.audit, ATOR, REF),
      (erro: unknown) => {
        // `errors`, e nao `campos`: e o nome do campo em `AppError`
        // (`src/shared/http/errors.ts`, linha 53) e o que `problemas.validacao`
        // preenche (linha 106). Com `campos` a leitura dava `undefined` e a
        // isca nao media `code` nenhum.
        const problema = erro as { status?: number; errors?: { code?: string }[] };
        assert.equal(problema.status, 400);
        assert.equal(problema.errors?.[0]?.code, 'request_not_pending');
        return true;
      },
    );
    // Nao decidiu, e nao gravou trilha de uma decisao que nao aconteceu.
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
    // A projecao da fila nao tem onde carregar codigo, e e isso que se afirma:
    // o conjunto de campos e fechado e nenhum deles e a credencial.
    assert.deepEqual(Object.keys(atendido).sort(), [
      'decididoEm',
      'endereco',
      'id',
      'observacao',
      'petEspecie',
      'petNome',
      'ref',
      'solicitadoEm',
      'status',
    ]);
  });
});
