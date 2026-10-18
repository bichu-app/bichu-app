/**
 * O COMUNICADO -- as iscas da trava.
 *
 * ===========================================================================
 * O QUE CADA CASO MEDE
 * ===========================================================================
 *
 * 1. **O disparo grava a trilha NA MESMA transacao da escrita** (D49). O duble
 *    de `EscritaAuditada` so conclui quando o trabalho devolve o par
 *    `{resultado, evento}`; um disparo que nao montasse evento nao compila, e
 *    um que o montasse fora da transacao nao apareceria aqui. **E a acao e a do
 *    contrato**, `admin.broadcast.dispatched`, com ator `admin` e o `id`
 *    INTERNO em `resourceId` -- nunca o `ref` (ADR-0027 item 8).
 *
 * 2. **O CORPO DO COMUNICADO NAO ENTRA NA TRILHA.** A varredura procura o texto
 *    do corpo no evento inteiro serializado, com um valor que nao aparece em
 *    mais lugar nenhum deste arquivo: um `before`/`after`/`metadata` que amanha
 *    carregue o corpo reprova aqui sem ninguem lembrar de incluir o campo. A
 *    razao e que a trilha sobrevive a exclusao da conta de proposito, e o corpo
 *    ja vive em `notification_broadcasts`, que nao tem caminho de exclusao.
 *
 * 3. **O TETO DIARIO recusa com 409 e NAO GRAVA NADA.** O porto devolve
 *    `undefined`, o servico lanca, e a excecao sobe por dentro de
 *    `EscritaAuditada.executar` -- que por isso NAO confirma a transacao. A
 *    isca mede as duas coisas: o tipo do problema e o fato de a transacao nao
 *    ter sido confirmada. CONTRAPESO: abaixo do teto, grava e confirma.
 *
 * 4. **409 e nao 429.** 429 e teto de CHAMADA e passa em um minuto, entao a
 *    tela oferece "tentar de novo"; este e teto de PRODUTO, e tentar de novo
 *    nao resolve. Um dia alguem vai achar que sao a mesma coisa.
 *
 * 5. **A janela de disparo nao grava e nao toca a transacao.** Ela nao passa por
 *    `EscritaAuditada` nenhuma: o duble registraria a chamada, e o caso afirma
 *    que ela nao houve. Um caminho de escrita que aceita "nao escreva de
 *    verdade" e um caminho de escrita que um dia escreve por engano, e aqui o
 *    engano alcanca todas as caixas de uma vez.
 *
 * ===========================================================================
 * O QUE ESTE ARQUIVO NAO MEDE, e onde isso foi medido
 * ===========================================================================
 *
 * O **papel de administrador** nao e conferido aqui: ele e `x-admin-roles` no
 * contrato e `adminRoles` na rota, e quem o aplica e
 * `escoparRotasAdministrativas`, ANTES de qualquer gancho desta camada. A isca
 * do papel esta em `adapters/http/comunicado-exige-papel.test.ts`.
 *
 * O **teto de verdade** -- a contagem do dia -- mora dentro de
 * `comunicado_disparar` na migracao `20261018000020`, e so um Postgres o
 * executa. Ele foi exercitado em `BEGIN`/`ROLLBACK`: tres passaram, o quarto
 * devolveu zero linhas e nada foi gravado. Aqui o duble devolve `undefined`
 * para medir o que a APLICACAO faz com essa resposta.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AppError } from '../../../shared/http/errors.js';
import { comoData } from '../../../shared/time/clock.js';
import type { AdminAccountId, Instant } from '../../../shared/types/brands.js';
import type { AuditEvent, EscritaAuditada } from '../../audit/ports/audit-log.js';
import type { AtorAdministrativo } from '../../audit/ports/trilha-administrativa.js';
import type {
  ComunicadoGravado,
  RepositorioDeComunicados,
  TransacaoDoComunicado,
} from '../ports/comunicados.js';
import { ComunicadosAdministrativos } from './comunicados-administrativos.js';

const DECLARACAO = {
  action: 'admin.broadcast.dispatched',
  resourceKind: 'broadcast',
} as const;

const ATOR: AtorAdministrativo = {
  adminAccountId: 'ad000000-0000-4000-8000-00000000000a' as AdminAccountId,
  ip: '203.0.113.7',
  correlationId: 'corr-1',
  sessao: 'deadbeefdeadbeef',
};

const ID_INTERNO = 'bc000000-0000-4000-8000-00000000000b';
const REF_PUBLICO = 'refDoComunicadoAAAAAA';

/**
 * O corpo do comunicado, com um valor que NAO aparece em mais lugar nenhum
 * deste arquivo. E essa unicidade que faz a varredura do caso 2 valer: se o
 * texto estivesse tambem num titulo, achar a cadeia no evento nao provaria de
 * onde ela veio.
 */
const CORPO_SECRETO = 'texto-do-corpo-que-nao-pode-entrar-na-trilha-9f3a';

function gravado(): ComunicadoGravado {
  return {
    id: ID_INTERNO,
    comunicado: {
      ref: REF_PUBLICO,
      titulo: 'Manutencao',
      corpo: CORPO_SECRETO,
      // `comoData` sobre um `Instant`, e nunca `new Date(...)`: tempo real so
      // em `shared/time/clock.ts`, e o lint deste repositorio cobra isso.
      disparadoEm: comoData(1_760_788_800_000 as Instant),
      disparadoPor: 'Operadora',
      destinatarios: 42,
    },
  };
}

interface Bancada {
  servico: ComunicadosAdministrativos;
  eventos: AuditEvent[];
  confirmadas: number;
  disparos: { adminId: string; titulo: string; corpo: string }[];
  previas: number;
}

/**
 * `tetoAtingido` troca a resposta do porto para `undefined`, que e como o banco
 * diz "nao cabe mais hoje".
 */
function bancada(opcoes: { tetoAtingido?: boolean } = {}): Bancada {
  const estado = { confirmadas: 0, previas: 0 };
  const eventos: AuditEvent[] = [];
  const disparos: { adminId: string; titulo: string; corpo: string }[] = [];

  // Sem `async`: duble que nao espera nada nao e assincrono.
  const repositorio: RepositorioDeComunicados = {
    listar(pagina, limite) {
      return Promise.resolve({ itens: [], pagina, limite, total: 0 });
    },
    janelaDeDisparo() {
      estado.previas += 1;
      return Promise.resolve({ alcancaria: 42, restamHoje: 2, tetoDiario: 3 });
    },
    disparar(_trx, adminId, rascunho) {
      disparos.push({ adminId, titulo: rascunho.titulo, corpo: rascunho.corpo });
      return Promise.resolve(opcoes.tetoAtingido === true ? undefined : gravado());
    },
  };

  // O duble de `EscritaAuditada`: ele so grava o evento e conta a confirmacao
  // quando o trabalho CONCLUI. Um lancamento de dentro do trabalho sai por aqui
  // sem passar por nenhum dos dois -- que e exatamente o ROLLBACK.
  const escrita: EscritaAuditada = {
    async executar(trabalho) {
      const { resultado, evento } = await trabalho({} as TransacaoDoComunicado);
      eventos.push(evento);
      estado.confirmadas += 1;
      return resultado;
    },
  };

  return {
    servico: new ComunicadosAdministrativos({ repositorio, escrita }),
    eventos,
    disparos,
    get confirmadas() {
      return estado.confirmadas;
    },
    get previas() {
      return estado.previas;
    },
  };
}

void describe('o comunicado do painel', () => {
  void it('1. o disparo grava a trilha junto da escrita, com a acao do contrato', async () => {
    const b = bancada();

    const comunicado = await b.servico.disparar(DECLARACAO, ATOR, {
      titulo: 'Manutencao',
      corpo: CORPO_SECRETO,
    });

    assert.equal(comunicado.ref, REF_PUBLICO, 'REPROVA: nao devolveu o comunicado gravado');
    assert.equal(b.confirmadas, 1, 'REPROVA: a transacao auditada nao foi confirmada uma vez');
    assert.equal(b.eventos.length, 1, 'REPROVA: o disparo nao gravou evento de trilha');

    const evento = b.eventos[0]!;
    assert.equal(
      evento.action,
      'admin.broadcast.dispatched',
      'REPROVA: a acao da trilha nao e a declarada no x-audit do contrato',
    );
    assert.equal(evento.resourceKind, 'broadcast', 'REPROVA: resource_kind errado');
    assert.equal(evento.actorKind, 'admin', 'REPROVA: o ator nao e a conta do painel');
    assert.equal(
      evento.actorAdminId,
      ATOR.adminAccountId,
      'REPROVA: a trilha nao registrou QUEM disparou -- megafone sem trilha e o que vira incidente',
    );
    assert.equal(
      evento.resourceId,
      ID_INTERNO,
      'REPROVA: resourceId nao e o id INTERNO. O ref nao serve na trilha (ADR-0027 item 8)',
    );
  });

  void it('2. o CORPO do comunicado nao entra na trilha em lugar nenhum do evento', async () => {
    const b = bancada();

    await b.servico.disparar(DECLARACAO, ATOR, { titulo: 'Manutencao', corpo: CORPO_SECRETO });

    const serializado = JSON.stringify(b.eventos[0]);
    assert.ok(
      !serializado.includes(CORPO_SECRETO),
      'REPROVA: o corpo do comunicado apareceu no evento de trilha. A trilha sobrevive a ' +
        'exclusao da conta de proposito, e o corpo ja vive em notification_broadcasts, ' +
        `que nao tem caminho de exclusao. Evento: ${serializado}`,
    );
    assert.ok(
      serializado.includes('Manutencao'),
      'REPROVA: o TITULO nao entrou na trilha. Sem ele a trilha nao diz o que saiu, ' +
        'e o caso acima estaria passando por um evento vazio',
    );
    assert.ok(
      serializado.includes(REF_PUBLICO),
      'REPROVA: o ref nao entrou no metadata -- e por ele que se acha o comunicado na tabela',
    );
  });

  void it('3. o teto diario recusa e NAO confirma a transacao', async () => {
    const b = bancada({ tetoAtingido: true });

    const erro = await b.servico
      .disparar(DECLARACAO, ATOR, { titulo: 'O quarto', corpo: 'Nao deve sair.' })
      .then(
        () => undefined,
        (e: unknown) => e,
      );

    assert.ok(erro instanceof AppError, 'REPROVA: o teto nao lancou AppError');
    assert.equal(
      erro.problemType,
      'broadcast-daily-cap-reached',
      'REPROVA: o tipo do problema do teto nao e o do contrato',
    );
    assert.equal(
      b.confirmadas,
      0,
      'REPROVA: a transacao foi CONFIRMADA depois do teto. Nada pode ter sido gravado',
    );
    assert.equal(b.eventos.length, 0, 'REPROVA: gravou trilha de um disparo que nao aconteceu');
  });

  void it('3b. CONTRAPESO: abaixo do teto, grava e confirma', async () => {
    const b = bancada({ tetoAtingido: false });
    await b.servico.disparar(DECLARACAO, ATOR, { titulo: 'Cabe', corpo: 'Corpo.' });
    assert.equal(
      b.confirmadas,
      1,
      'REPROVA: nao confirmou abaixo do teto -- o caso 3 estaria passando por nunca confirmar',
    );
  });

  void it('4. o teto e 409 e nao 429: tentar de novo nao resolve', async () => {
    const b = bancada({ tetoAtingido: true });

    const erro = await b.servico
      .disparar(DECLARACAO, ATOR, { titulo: 'O quarto', corpo: 'Nao deve sair.' })
      .then(
        () => undefined,
        (e: unknown) => e,
      );

    assert.ok(erro instanceof AppError);
    assert.equal(
      erro.status,
      409,
      'REPROVA: o teto diario saiu com status diferente de 409. Um 429 faria o painel ' +
        'oferecer "tentar de novo" para o unico caso em que tentar de novo nao resolve',
    );
  });

  void it('5. a janela de disparo nao grava e nao abre transacao auditada', async () => {
    const b = bancada();

    const janela = await b.servico.janelaDeDisparo();

    assert.equal(janela.alcancaria, 42, 'REPROVA: a janela nao devolveu o alcance');
    assert.equal(janela.restamHoje, 2, 'REPROVA: a janela nao devolveu quantos cabem hoje');
    assert.equal(
      janela.tetoDiario,
      3,
      'REPROVA: a janela nao devolveu o teto. Ele sai do servidor para o painel nao guardar ' +
        'uma segunda copia do numero, que e a copia que diverge',
    );
    assert.equal(b.previas, 1, 'REPROVA: a janela nao chegou ao porto');
    assert.equal(
      b.confirmadas,
      0,
      'REPROVA: a janela de disparo confirmou uma transacao. Ela e leitura',
    );
    assert.equal(
      b.eventos.length,
      0,
      'REPROVA: a janela de disparo gravou trilha. Uma trilha por tecla digitada afogaria a do disparo',
    );
    assert.deepEqual(
      b.disparos,
      [],
      'REPROVA: a janela de disparo chamou o disparo. Um caminho de escrita que aceita "nao escreva de ' +
        'verdade" e um caminho de escrita que um dia escreve por engano',
    );
  });
});
