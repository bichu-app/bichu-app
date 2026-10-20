/**
 * As ISCAS de comportamento da fila de moderacao, por DESLIGAMENTO.
 *
 * Cada caso aponta o que exatamente deixa de passar se a protecao for
 * removida, e cada um tem o seu contrapeso -- o caso que prova que a condicao
 * NAO esta sempre verdadeira, que e o que separa isca de teste que passaria
 * sobre codigo vazio.
 *
 * | o que apagar | reprova |
 * |---|---|
 * | `tx.removerConteudo` em `remover` | 1a (o conteudo nao fica escondido) |
 * | o motivo do `after` da trilha em `remover` | 1b (motivo nao chega a trilha) |
 * | `tx.resolverDenuncias` em `descartar` | 2 |
 * | trocar `resolverDenuncias` por um `delete` | 2 (a denuncia sumiria) |
 * | `erroSeJaResolvido` em `itemAberto` | 4a |
 * | o `if (resolucao.quantidade === 0)` de `descartar` | 4b |
 * | `registrarNaTrilha` em qualquer das duas | 5 |
 *
 * A isca (c) -- denuncia de conta desabilitada fora da listagem, da leitura e
 * da contagem -- mora em
 * `adapters/persistence/conta-desabilitada-sai-da-fila-de-moderacao.test.ts`,
 * porque ali o que se mede e o SQL compilado: um caso de comportamento
 * passaria igual sobre um `filter` na aplicacao, e e justamente o `filter` que
 * nao se quer.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { comoData } from '../../../shared/time/clock.js';
import type { AdminAccountId, Instant } from '../../../shared/types/brands.js';
import type { AuditEvent } from '../../audit/ports/audit-log.js';
import type { ItemDaFila, OrigemDaDenuncia } from '../domain/fila-de-moderacao.js';
import type {
  AlvoRemovido,
  FilaDeModeracaoRepository,
  TransacaoDaModeracao,
} from '../ports/fila-de-moderacao.js';
import { FilaDeModeracao, type Autor } from './fila-de-moderacao.js';

const AGORA = 1_760_000_000_000 as Instant;
const ALVO = 'yjJwZ3hBc0RmR2hKa0xtTg';

const AUTOR: Autor = {
  adminAccountId: '0192f3a1-0000-7000-8000-000000000001' as AdminAccountId,
  ip: '203.0.113.7',
  correlationId: 'corr-1',
  sessao: 'a1b2c3d4',
};

const MOTIVO = 'Ataque pessoal ao dono do local; nao descreve servico nenhum.';

function itemDeExemplo(parcial: Partial<ItemDaFila> = {}): ItemDaFila {
  return {
    origem: 'review',
    targetRef: ALVO,
    assunto: 'Clinica Sao Jorge',
    conteudo: 'texto da avaliacao',
    nota: 1,
    motivo: 'offensive',
    motivos: ['offensive', 'spam'],
    detalhe: 'o texto fala do dono e nao do servico',
    reportCount: 3,
    repeatTotal: 7,
    // `comoData` e nao `new Date(...)`: a regra de arquitetura proibe construir
    // tempo em `application/`, e vale para o teste tambem -- e com razao, porque
    // e justamente aqui que um `new Date()` sem argumento passaria despercebido.
    primeiraEm: comoData((AGORA - 86_400_000) as Instant),
    ultimaEm: comoData(AGORA),
    conteudoRemovido: false,
    decisao: null,
    motivoDaDecisao: null,
    decididaEm: null,
    ...parcial,
  };
}

/**
 * O BANCO DE MENTIRA, e ele guarda o estado de verdade.
 *
 * Nao e um espiao de chamadas: ele mantem `conteudoEscondido` e a LISTA de
 * denuncias, e as leituras publicas simuladas (`lerPublico`) consultam esse
 * estado. E o que faz o caso 1a medir o EFEITO -- "o conteudo deixou de
 * aparecer" -- e nao a chamada de um metodo.
 */
function bancada(inicial: Partial<ItemDaFila> = {}) {
  const estado = {
    item: itemDeExemplo(inicial),
    /** As denuncias, como linhas: `resolvida` nula enquanto na fila. */
    denuncias: [
      { id: 'd1', resolvida: null as string | null, motivo: null as string | null },
      { id: 'd2', resolvida: null as string | null, motivo: null as string | null },
      { id: 'd3', resolvida: null as string | null, motivo: null as string | null },
    ],
    /** O motivo gravado na linha DO CONTEUDO (nao na da denuncia). */
    motivoNoConteudo: null as string | null,
    eventos: [] as AuditEvent[],
  };

  /**
   * A LEITURA PUBLICA simulada: o conteudo aparece enquanto nao foi escondido.
   *
   * E o espelho das quatro clausulas `WHERE` de
   * `kysely-conversation-repository.ts` e do filtro `status = 'published'` da
   * leitura da avaliacao. O caso 1a le por aqui.
   */
  const lerPublico = (): string | null => (estado.item.conteudoRemovido ? null : estado.item.conteudo);

  const transacao: TransacaoDaModeracao = {
    itemPorAlvo: () => {
      const abertas = estado.denuncias.filter((d) => d.resolvida === null);
      // A LEITURA DA TRANSACAO so ve item com denuncia ABERTA, igual ao
      // adaptador (`apenasAbertas`). Mas a decisao ja gravada permanece
      // visivel no item, porque e ela que o caso 4a le.
      if (abertas.length === 0 && estado.item.decisao === null) return Promise.resolve(null);
      return Promise.resolve({ ...estado.item, reportCount: abertas.length });
    },

    removerConteudo: (
      _origem: OrigemDaDenuncia,
      _ref: string,
      motivo: string,
    ): Promise<AlvoRemovido | null> => {
      // `null` quando JA estava fora do ar: o motivo da primeira remocao e de
      // quem auditar, e sobrescreve-lo apagaria a decisao que valeu.
      if (estado.item.conteudoRemovido) return Promise.resolve(null);
      estado.item = { ...estado.item, conteudoRemovido: true };
      estado.motivoNoConteudo = motivo;
      return Promise.resolve({ id: 'review-interno-1', notaAntes: 1 });
    },

    resolverDenuncias: (_origem, _ref, decisao, motivo) => {
      const abertas = estado.denuncias.filter((d) => d.resolvida === null);
      for (const d of abertas) {
        d.resolvida = decisao;
        d.motivo = motivo;
      }
      estado.item = { ...estado.item, decisao, motivoDaDecisao: motivo };
      return Promise.resolve({ quantidade: abertas.length, decididaEm: comoData(AGORA) });
    },

    registrarNaTrilha: (evento: AuditEvent) => {
      estado.eventos.push(evento);
      return Promise.resolve();
    },
  };

  const repositorio: FilaDeModeracaoRepository = {
    emTransacao: (trabalho) => trabalho(transacao),
    listar: () => Promise.resolve({ itens: [estado.item], total: 1, pendentes: 1 }),
    itemPorAlvo: () => Promise.resolve(estado.item),
  };

  const fila = new FilaDeModeracao({
    repositorio,
    // O detector de D59 de verdade e de `network/domain` e chega por porta; aqui
    // o dobre aprova o que passar pelo tamanho, porque o que estes casos medem
    // nao e a deteccao de contato.
    conferencias: {
      errosDeTextoDeUsuario: (campo, valor, minimo, maximo) =>
        valor.trim().length >= minimo && valor.trim().length <= maximo
          ? []
          : [{ field: campo, code: 'required', message: 'motivo invalido' }],
    },
    clock: { now: () => AGORA },
  });

  return { fila, estado, lerPublico };
}

void describe('(a) remover conteudo esconde das leituras publicas E registra motivo na trilha', () => {
  void it('1a. CONTRAPESO: antes de remover, o conteudo APARECE na leitura publica', () => {
    const { lerPublico } = bancada();
    assert.equal(
      lerPublico(),
      'texto da avaliacao',
      'o contrapeso falhou: se o conteudo ja estivesse escondido antes da remocao, o caso 1a ' +
        'passaria sobre uma funcao vazia e nao mediria nada.',
    );
  });

  void it('1a. depois de remover, o conteudo NAO aparece mais -- e nada foi apagado', async () => {
    const { fila, estado, lerPublico } = bancada();
    await fila.remover(AUTOR, 'review', ALVO, { reason: MOTIVO });

    assert.equal(
      lerPublico(),
      null,
      'o conteudo continua visivel depois da remocao: a exclusao logica nao chegou as leituras.',
    );
    // **Exclusao LOGICA**: o conteudo continua gravado, com o motivo ao lado.
    assert.equal(
      estado.item.conteudo,
      'texto da avaliacao',
      'o conteudo foi APAGADO. A remocao e logica: a trilha aponta para esta linha, e trilha que ' +
        'aponta para linha apagada nao e trilha.',
    );
    assert.equal(
      estado.motivoNoConteudo,
      MOTIVO,
      'o motivo nao foi gravado na linha do conteudo (`moderation_reason`), e o `CHECK` cruzado da ' +
        'migracao exige os dois juntos.',
    );
  });

  void it('1b. o MOTIVO chega a trilha, e o conteudo denunciado NAO chega', async () => {
    const { fila, estado } = bancada();
    await fila.remover(AUTOR, 'review', ALVO, { reason: MOTIVO });

    const evento = estado.eventos[0];
    assert.ok(evento !== undefined, 'nenhum evento de trilha foi gravado na remocao.');
    assert.equal(evento.action, 'admin.moderation_report.content_removed');
    assert.equal(evento.resourceKind, 'moderation_report');
    assert.equal(evento.actorKind, 'admin');
    assert.equal(
      (evento.after as Record<string, unknown>).reason,
      MOTIVO,
      'o motivo nao chegou ao `after` da trilha: sem ele, a trilha registra que alguem removeu e ' +
        'nao registra por que, que e a diferenca entre moderacao e arbitrio.',
    );
    assert.equal((evento.after as Record<string, unknown>).content_removed, true);
    // A NOTA entra (explica o efeito na media do local); o TEXTO nao.
    assert.equal((evento.before as Record<string, unknown>).rating, 1);
    const trilhaInteira = JSON.stringify(evento);
    assert.ok(
      !trilhaInteira.includes('texto da avaliacao'),
      'o TEXTO DENUNCIADO foi copiado para a trilha. A trilha sobrevive a exclusao da conta de ' +
        'proposito, e o texto ficaria gravado onde nao tem o mesmo controle de acesso ' +
        `(docs/04-seguranca.md 9). Evento: ${trilhaInteira}`,
    );
    assert.ok(
      !trilhaInteira.includes('o texto fala do dono'),
      `o RELATO DE QUEM DENUNCIOU foi copiado para a trilha. Evento: ${trilhaInteira}`,
    );
    // E os dois numeros da repeticao vao, porque sao o que explica a decisao.
    assert.equal((evento.before as Record<string, unknown>).repeat_total, 7);
  });
});

void describe('(b) descartar NAO apaga a denuncia', () => {
  void it('2. a denuncia fica, com a decisao e o motivo -- e o conteudo continua no ar', async () => {
    const { fila, estado, lerPublico } = bancada();
    const antes = estado.denuncias.length;

    await fila.descartar(AUTOR, 'review', ALVO, { reason: 'Desentendimento; nao quebra regra.' });

    assert.equal(
      estado.denuncias.length,
      antes,
      'uma denuncia deixou de existir: descartar virou `DELETE`. Nada e apagado de verdade nesta ' +
        'fila, e o `down` da migracao recusa a propria descida justamente para que a linha continue.',
    );
    for (const d of estado.denuncias) {
      assert.equal(d.resolvida, 'dismissed', `a denuncia ${d.id} nao recebeu a decisao.`);
      assert.equal(
        d.motivo,
        'Desentendimento; nao quebra regra.',
        `a denuncia ${d.id} foi resolvida SEM motivo gravado.`,
      );
    }
    assert.equal(
      lerPublico(),
      'texto da avaliacao',
      'descartar escondeu o conteudo. Descartar quer dizer que a denuncia nao procedia: o conteudo ' +
        'fica no ar, e e isso que o distingue de remover.',
    );
    const evento = estado.eventos[0];
    assert.ok(evento !== undefined, 'nenhum evento de trilha foi gravado no descarte.');
    assert.equal(evento.action, 'admin.moderation_report.dismissed');
    assert.equal(
      (evento.after as Record<string, unknown>).content_removed,
      false,
      'a trilha do descarte diz que o conteudo saiu do ar. Quem auditar precisa ver que ele NAO foi tocado.',
    );
  });
});

void describe('(d) a mesma denuncia nao se resolve duas vezes', () => {
  void it('4a. o segundo REMOVER sobre item ja resolvido e recusado', async () => {
    const { fila, estado } = bancada();
    await fila.remover(AUTOR, 'review', ALVO, { reason: MOTIVO });

    await assert.rejects(
      () => fila.remover(AUTOR, 'review', ALVO, { reason: 'outro motivo qualquer' }),
      (erro: unknown) => {
        const status = (erro as { statusCode?: number; status?: number }).statusCode
          ?? (erro as { status?: number }).status;
        assert.ok(
          status === 400 || status === 404,
          `esperava 400 (ja resolvida) ou 404 (nada aberto); veio ${String(status)}`,
        );
        return true;
      },
      'o segundo remover foi ACEITO: o motivo da decisao que valeu seria sobrescrito, e a memoria ' +
        'de quem decidiu o que desapareceria.',
    );

    assert.equal(
      estado.motivoNoConteudo,
      MOTIVO,
      'o motivo da PRIMEIRA remocao foi sobrescrito pela segunda tentativa.',
    );
    assert.equal(estado.eventos.length, 1, 'a segunda tentativa gravou um segundo evento de trilha.');
  });

  void it('4b. o segundo DESCARTAR sobre item ja resolvido e recusado', async () => {
    const { fila, estado } = bancada();
    await fila.descartar(AUTOR, 'review', ALVO, { reason: 'nao procede' });

    await assert.rejects(
      () => fila.descartar(AUTOR, 'review', ALVO, { reason: 'segunda tentativa' }),
      'o segundo descarte foi ACEITO sobre denuncia ja resolvida.',
    );
    assert.equal(estado.eventos.length, 1, 'a segunda tentativa gravou um segundo evento de trilha.');
    assert.equal(
      estado.denuncias[0]?.motivo,
      'nao procede',
      'o motivo da primeira decisao foi sobrescrito.',
    );
  });

  void it('4c. CONTRAPESO: a PRIMEIRA decisao passa -- a recusa nao e sempre', async () => {
    const { fila, estado } = bancada();
    const item = await fila.descartar(AUTOR, 'review', ALVO, { reason: 'nao procede' });
    assert.equal(item.resolution, 'dismissed');
    assert.equal(
      estado.eventos.length,
      1,
      'o contrapeso falhou: se a primeira decisao tambem fosse recusada, os casos 4a e 4b ' +
        'passariam sobre um metodo que recusa tudo.',
    );
  });
});

void describe('o motivo e obrigatorio nas DUAS acoes', () => {
  void it('5. remover sem motivo e recusado, e nada e escondido', async () => {
    const { fila, estado, lerPublico } = bancada();
    await assert.rejects(() => fila.remover(AUTOR, 'review', ALVO, { reason: '  ' }));
    assert.equal(lerPublico(), 'texto da avaliacao', 'o conteudo foi escondido sem motivo escrito.');
    assert.equal(estado.eventos.length, 0);
  });

  void it('6. descartar sem motivo e recusado, e nenhuma denuncia e marcada', async () => {
    const { fila, estado } = bancada();
    await assert.rejects(() => fila.descartar(AUTOR, 'review', ALVO, { reason: '' }));
    assert.equal(estado.denuncias[0]?.resolvida, null, 'a denuncia foi resolvida sem motivo escrito.');
    assert.equal(estado.eventos.length, 0);
  });
});

void describe('nenhuma acao sobre a conta da pessoa', () => {
  void it('7. a transacao da fila nao oferece metodo que toque conta nenhuma', () => {
    const { fila } = bancada();
    const metodos = [
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(fila) as object),
      ...Object.keys(fila),
    ];
    const suspeitos = metodos.filter((m) => /conta|account|user|desabilit|disable|suspend|ban/iu.test(m));
    assert.deepEqual(
      suspeitos,
      [],
      'apareceu metodo de conta na fila de moderacao. Desabilitar conta e OUTRO poder, com outro ' +
        `evento de trilha, e nao entra nesta fila: ${suspeitos.join(', ')}`,
    );
  });
});
