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

/** O nome do solicitante, que NUNCA deve aparecer em lugar nenhum. */
const NOME_DE_QUEM_PEDIU = 'Mariana Solicitante';

/**
 * O codigo de rastreio das iscas da entrega. Valor unico no arquivo, para a
 * varredura da isca 10 nao casar com outra coisa por acidente.
 */
const RASTREIO = 'XQ771230045BR';

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
  /** Os eventos que a unidade de trabalho gravou. E o que o caso 2 le. */
  readonly eventos: AuditEvent[];
  /** As decisoes que chegaram ao repositorio. */
  readonly decisoes: { readonly id: string; readonly decisao: string }[];
  /** As ENTREGAS que chegaram ao repositorio. E o que as iscas 6 a 10 leem. */
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
      // O duble imita o `UPDATE` real: `undefined` MANTEM o rastreio que ja
      // estava la, e so `null` apaga. Um duble que achatasse os tres casos em
      // um nao teria como reprovar a isca 9.
      const anterior = atual?.codigoDeRastreio ?? null;
      const gravado =
        pedida.rastreio === undefined ? anterior : pedida.rastreio;
      atual = pedido('fulfilled', pedida.passo, gravado);
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
    // O conjunto e FECHADO, e os quatro campos da entrega entraram nele em
    // 18/10 (migracao `20261018000004`). Nenhum deles e a credencial: o codigo
    // da plaquinha e de `pet_tags` e nao passa por esta projecao -- o que
    // `codigoDeRastreio` carrega e numero de encomenda.
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

  // =========================================================================
  // A ENTREGA (18/10/2026). Pedido do cliente: "mudar o status da entrega e
  // inserir o codigo de rastreio e atualizar a entrega".
  //
  // O DESLIGAMENTO de cada isca esta escrito no caso, e e o que separa isca de
  // decoracao. As quatro que o despacho cobrou estao aqui: (a) transicao
  // invalida recusada com a valida de contrapeso, (b) o rastreio na leitura do
  // dono -- medido no irmao `pedido-de-plaquinha.test.ts`, caso 9 --, (c) conta
  // desabilitada fora da fila -- medido em `autorizacao-na-clausula-where.test.ts`
  // --, e (d) a trilha sem o endereco, que e a isca 10 daqui.
  // =========================================================================

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
    // CONTRAPESO da isca 7: sem este caso, uma implementacao que recusasse TUDO
    // passaria nela. Desligamento: trocar `TRANSICOES` por um mapa vazio
    // reprova aqui e deixa a 7 verde.
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
    // O que faz esta isca valer: NAO escreveu e NAO gravou trilha de uma
    // mudanca que nao aconteceu. Desligamento: tirar `arrived` de `TRANSICOES`
    // -- ou dar a ele `['in_transit']` -- reprova aqui.
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
        // `request_not_fulfilled` e nao `invalid_delivery_transition`: a
        // transicao `requested -> in_transit` E permitida, e o que falta e o
        // ATENDIMENTO. Quem clicou precisa ouvir isso, e nao uma frase sobre
        // passos. Desligamento: trocar a ordem das duas recusas no caso de uso
        // reprova aqui.
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
    // (i) ausente: marcar a chegada nao limpa o codigo que ja estava la. E o
    // defeito que um `?? null` no caminho produziria.
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

    // (ii) `null` apaga, e e explicito.
    const apaga = bancada('fulfilled', 'in_transit', RASTREIO);
    const semRastreio = await apaga.fila.atualizarEntrega(
      rotaDeAtualizarEntregaDaPlaquinha.audit,
      ATOR,
      REF,
      'in_transit',
      null,
    );
    assert.equal(semRastreio.codigoDeRastreio, null);

    // (iii) so espaco e RECUSADO, e nao tratado como "apagar": quem mandou
    // `"   "` quis escrever um codigo e errou, e apagar em silencio o que
    // estava la seria a pior leitura desse engano.
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
    // CONTRAPESO: um rastreio que NAO e dos Correios, nem da FedEx, nem de
    // ninguem, passa. E o que prova que nao ha validacao de formato -- um
    // `CHECK` ou regex de transportadora reprova aqui.
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

    // O que a trilha PRECISA carregar, para a isca nao ficar verde por um
    // evento vazio.
    assert.equal(evento?.resourceId, ID_INTERNO);
    assert.equal(evento?.resourceKind, 'collar_tag_request');
    assert.equal((evento?.metadata as { ref?: string } | undefined)?.ref, REF);
    assert.deepEqual(evento?.before, { delivery_state: 'requested', tracking_code: null });
    assert.deepEqual(evento?.after, { delivery_state: 'in_transit', tracking_code: RASTREIO });

    // O ENDERECO NAO ENTRA, campo por campo -- os nove, telefone inclusive.
    // Desligamento: fazer `before`/`after` copiarem o pedido inteiro
    // (`{ ...atual }`) reprova aqui, e e esse o jeito mais provavel de o
    // endereco vazar para a trilha sem ninguem notar.
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
    // A leitura de um pedido que o `WHERE` nao encontra -- `ref` desconhecido OU
    // conta desabilitada -- responde 404 e nunca 403 (ADR-0021).
    await assert.rejects(
      () => b.fila.ler(REF_DESCONHECIDO),
      (erro: unknown) => {
        assert.equal((erro as { status?: number }).status, 404);
        return true;
      },
    );
  });
});
