/**
 * O comportamento da conexão, ponta a ponta no caso de uso, com as quatro iscas
 * que não se respondem lendo SQL:
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AppError } from '../../../shared/http/errors.js';
import type { Clock } from '../../../shared/ports/index.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { AuditEvent, AuditLog } from '../../audit/ports/audit-log.js';
import {
  conexoesEmMemoria,
  type BancadaDeConexoes,
  type PessoaDeTeste,
} from '../adapters/persistence/conexoes-em-memoria-de-teste.js';
import { habilitaDadoDeConectado } from '../domain/conexao.js';
import { TETO_DE_CONEXOES } from '../domain/teto-de-conexoes.js';
import type { LeitorDeBloqueio } from '../ports/leitor-de-bloqueio.js';
import type {
  ResolvedorDeApelido,
  ResolvedorDeConvite,
} from '../ports/convite-de-conexao.js';
import { ConexaoEntrePessoas, type ContextoDoChamador } from './conexao-entre-pessoas.js';

/**
 * **Um resolvedor que não resolve nada**, e ele é um dublê de teste — não a fiação
 * de produção.
 */
const nadaResolve: ResolvedorDeConvite = { resolver: () => Promise.resolve(undefined) };

/** O mesmo, para o caminho por apelido. */
const nenhumApelidoResolve: ResolvedorDeApelido = {
  resolver: () => Promise.resolve(undefined),
};

const AGORA = 1_800_000_000_000 as Instant;
const DIA = 86_400_000;

const ANA = '018f3a2b-0000-7000-8000-0000000000a1' as UserId;
const BIA = '018f3a2b-0000-7000-8000-0000000000b2' as UserId;
const CLE = '018f3a2b-0000-7000-8000-0000000000c3' as UserId;

const PESSOAS: readonly PessoaDeTeste[] = [
  { id: ANA, apelido: 'ana-do-bairro', nomeDeExibicao: 'Ana', habilitada: true },
  { id: BIA, apelido: null, nomeDeExibicao: 'Bia', habilitada: true },
  { id: CLE, apelido: 'cleide', nomeDeExibicao: 'Cleide', habilitada: true },
];

function contexto(quem: UserId): ContextoDoChamador {
  return { userId: quem, correlationId: 'corr-1', ip: '203.0.113.7' };
}

interface Montagem {
  readonly servico: ConexaoEntrePessoas;
  readonly bancada: BancadaDeConexoes;
  readonly trilha: AuditEvent[];
}

function montar(opcoes: {
  convitePara?: UserId;
  /** O alvo que o APELIDO resolve, para o caminho aberto em 20/10/2026. */
  apelidoPara?: UserId;
  bloqueado?: boolean;
  agora?: Instant;
  /**
   * Quem tem pet com foto `ready` -- o segundo sinal do contador de convidados
   * (21/10/2026).
   */
  comPetComFotoPronta?: readonly UserId[];
} = {}): Montagem {
  const comFoto = opcoes.comPetComFotoPronta ?? [];
  const pessoas: readonly PessoaDeTeste[] = PESSOAS.map((pessoa) =>
    comFoto.includes(pessoa.id) ? { ...pessoa, petComFotoPronta: true } : pessoa,
  );
  const bancada = conexoesEmMemoria(pessoas, opcoes.agora ?? AGORA);
  const trilha: AuditEvent[] = [];
  let sorteio = 0;

  const convites: ResolvedorDeConvite =
    opcoes.convitePara === undefined
      ? nadaResolve
      : {
          resolver: () =>
            Promise.resolve({
              alvo: opcoes.convitePara as UserId,
              origem: 'invite_link',
              apelido: 'ana-do-bairro',
            }),
        };

  const apelidos: ResolvedorDeApelido =
    opcoes.apelidoPara === undefined
      ? nenhumApelidoResolve
      : { resolver: () => Promise.resolve(opcoes.apelidoPara as UserId) };

  const bloqueios: LeitorDeBloqueio = {
    existeBloqueioEntre: () => Promise.resolve(opcoes.bloqueado === true),
  };

  const ids: IdGenerator = {
    uuidv7: () => {
      sorteio += 1;
      return `018f3a2b-0000-7000-8000-00000000${String(sorteio).padStart(4, '0')}`;
    },
    opaqueToken: () => {
      throw new Error('opaqueToken: a conexão não usa');
    },
    random128: () => {
      sorteio += 1;
      const bytes = new Uint8Array(16);
      bytes[0] = sorteio;
      return bytes;
    },
    random80: () => {
      throw new Error('random80: a conexão não usa');
    },
  };

  const clock: Clock = { now: () => opcoes.agora ?? AGORA };
  const log: AuditLog = {
    record: (evento: AuditEvent) => {
      trilha.push(evento);
      return Promise.resolve();
    },
  };

  return {
    servico: new ConexaoEntrePessoas({
      conexoes: bancada.repositorio,
      convites,
      apelidos,
      bloqueios,
      trilha: log,
      ids,
      clock,
    }),
    bancada,
    trilha,
  };
}

async function erroDe(acao: () => Promise<unknown>): Promise<AppError> {
  try {
    await acao();
  } catch (erro) {
    assert.ok(erro instanceof AppError, `esperava AppError, veio ${String(erro)}`);
    return erro;
  }
  throw new Error('a ação não falhou, e era o que o teste media');
}

/** **O ESCOPO DESTE BLOCO MUDOU EM 20/10/2026.** */
void describe('sem credencial que resolva, não nasce aresta — e o 404 é um só', () => {
  void it('token que não resolve responde 404, qualquer que seja o token', async () => {
    const { servico, bancada } = montar();
    for (const token of ['', 'token-inventado', 'ana-do-bairro', ANA, 'A'.repeat(64)]) {
      const erro = await erroDe(() => servico.pedir(contexto(BIA), token));
      assert.equal(erro.problemType, 'not-found', `o token ${token} não respondeu 404`);
    }
    assert.equal(bancada.linhas.length, 0, 'nenhuma aresta pode ter nascido');
  });

  void it('apelido que não resolve responde 404, e também não cria aresta', async () => {
    const { servico, bancada } = montar();
    for (const apelido of ['', 'nao-existe', 'ana-do-bairro', 'bidu-o-cachorro']) {
      const erro = await erroDe(() => servico.pedirPorApelido(contexto(BIA), apelido));
      assert.equal(erro.problemType, 'not-found', `o apelido ${apelido} não respondeu 404`);
    }
    assert.equal(bancada.linhas.length, 0, 'nenhuma aresta pode ter nascido');
  });

  void it('o 404 é o MESMO para token inexistente e para alvo bloqueado — nunca 403', async () => {
    const semConvite = montar();
    const comBloqueio = montar({ convitePara: ANA, bloqueado: true });
    const a = await erroDe(() => semConvite.servico.pedir(contexto(BIA), 'qualquer'));
    const b = await erroDe(() => comBloqueio.servico.pedir(contexto(BIA), 'qualquer'));
    assert.equal(a.problemType, b.problemType);
    assert.equal(a.problemType, 'not-found');
  });

  /** **O caminho por apelido cria aresta, e grava `people_search`.** */
  void it('apelido que resolve CRIA a aresta, com `origin: people_search`', async () => {
    const { servico, bancada, trilha } = montar({ apelidoPara: ANA });
    const conexao = await servico.pedirPorApelido(contexto(BIA), 'ana-do-bairro');
    assert.equal(conexao.state, 'pending_sent');
    assert.equal(bancada.linhas.length, 1);
    assert.equal(bancada.linhas[0]?.origem, 'people_search');
    const registrada = trilha.find((e) => e.action === 'connection.requested');
    assert.equal(registrada?.metadata?.origin, 'people_search');
  });

  /** O mesmo pelo convite, para os dois caminhos ficarem medidos lado a lado. */
  void it('token que resolve CRIA a aresta, com `origin: invite_link`', async () => {
    const { servico, bancada } = montar({ convitePara: ANA });
    const conexao = await servico.pedir(contexto(BIA), 'um-token-que-resolve');
    assert.equal(conexao.state, 'pending_sent');
    assert.equal(bancada.linhas.length, 1);
    assert.equal(bancada.linhas[0]?.origem, 'invite_link');
  });

  void it('CONTRAPESO: com um convite resolvido, o pedido nasce', async () => {
    const { servico, bancada } = montar({ convitePara: ANA });
    const pedido = await servico.pedir(contexto(BIA), 'convite-valido');
    assert.equal(pedido.state, 'pending_sent');
    assert.equal(bancada.linhas.length, 1);
  });
});

void describe('ISCA (a): sem aceite, nenhum dado de conectado', () => {
  void it('o pedido pendente NÃO conecta, dos dois lados', async () => {
    const { servico, bancada } = montar({ convitePara: ANA });
    await servico.pedir(contexto(BIA), 'convite');
    assert.equal(await bancada.repositorio.estaConectado(ANA, BIA), false);
    assert.equal(await bancada.repositorio.estaConectado(BIA, ANA), false);
    const resumoDeAna = await servico.resumo(contexto(ANA));
    assert.equal(resumoDeAna.connected_count, 0);
  });

  void it('CONTRAPESO: depois do aceite, conecta — e o resumo dos dois sobe', async () => {
    const { servico, bancada } = montar({ convitePara: ANA });
    const pedido = await servico.pedir(contexto(BIA), 'convite');
    const aceita = await servico.aceitar(contexto(ANA), pedido.ref);
    assert.equal(aceita.state, 'connected');
    assert.equal(await bancada.repositorio.estaConectado(ANA, BIA), true);
    assert.equal(await bancada.repositorio.estaConectado(BIA, ANA), true);
    assert.equal((await servico.resumo(contexto(ANA))).connected_count, 1);
    assert.equal((await servico.resumo(contexto(BIA))).connected_count, 1);
  });

  void it('quem PEDIU não pode aceitar o próprio pedido: 404', async () => {
    const { servico } = montar({ convitePara: ANA });
    const pedido = await servico.pedir(contexto(BIA), 'convite');
    const erro = await erroDe(() => servico.aceitar(contexto(BIA), pedido.ref));
    assert.equal(erro.problemType, 'not-found');
  });

  void it('terceiro com o `ref` na mão não aceita nada: 404', async () => {
    const { servico } = montar({ convitePara: ANA });
    const pedido = await servico.pedir(contexto(BIA), 'convite');
    const erro = await erroDe(() => servico.aceitar(contexto(CLE), pedido.ref));
    assert.equal(erro.problemType, 'not-found');
  });

  void it('o predicado do domínio e o do repositório dão a MESMA resposta', async () => {
    const { servico, bancada } = montar({ convitePara: ANA });
    await servico.pedir(contexto(BIA), 'convite');
    const pendente = await bancada.repositorio.arestaDoPar(ANA, BIA, AGORA);
    assert.equal(habilitaDadoDeConectado(pendente, AGORA), false);
    assert.equal(await bancada.repositorio.estaConectado(ANA, BIA), false);
  });
});

void describe('ISCA (c): o teto de 150, pelo caminho inteiro', () => {
  function comConexoes(quantas: number): Montagem {
    const montagem = montar({ convitePara: ANA });
    for (let i = 0; i < quantas; i += 1) {
      montagem.bancada.semear({
        pedinte: `018f3a2b-0000-7000-8000-9000000${String(i).padStart(5, '0')}` as UserId,
        destinatario: ANA,
        estado: 'accepted',
      });
    }
    return montagem;
  }

  void it('CONTRAPESO: com 149 conexões, o 150º pedido a Ana passa', async () => {
    const { servico } = comConexoes(TETO_DE_CONEXOES - 1);
    const pedido = await servico.pedir(contexto(BIA), 'convite');
    assert.equal(pedido.state, 'pending_sent');
  });

  void it('ISCA: com 150 conexões, o 151º é recusado — e não é 404', async () => {
    const { servico, bancada } = comConexoes(TETO_DE_CONEXOES);
    const erro = await erroDe(() => servico.pedir(contexto(BIA), 'convite'));
    assert.equal(erro.problemType, 'validation-failed');
    assert.match(JSON.stringify(erro.errors), /addressee_connection_limit_reached/);
    assert.equal(
      bancada.linhas.filter((l) => l.estado === 'pending').length,
      0,
      'o 151º não pode ter deixado linha pendente para trás',
    );
  });

  void it('o resumo do dono anuncia o teto, e ele vem do servidor', async () => {
    const { servico } = comConexoes(3);
    const resumo = await servico.resumo(contexto(ANA));
    assert.equal(resumo.connection_limit, TETO_DE_CONEXOES);
    assert.equal(resumo.connected_count, 3);
  });
});

void describe('ISCA (d): par bloqueado responde 404', () => {
  void it('pedir a quem bloqueou: 404, nunca 403', async () => {
    const { servico } = montar({ convitePara: ANA, bloqueado: true });
    const erro = await erroDe(() => servico.pedir(contexto(BIA), 'convite'));
    assert.equal(erro.problemType, 'not-found');
    assert.equal(erro.status, 404, 'o status tem de ser 404, nunca 403');
  });

  void it('CONTRAPESO: sem bloqueio, o mesmo convite e o mesmo token funcionam', async () => {
    const { servico } = montar({ convitePara: ANA, bloqueado: false });
    assert.equal((await servico.pedir(contexto(BIA), 'convite')).state, 'pending_sent');
  });

  void it('nenhum caminho desta fatia produz 403 — a autorização é 404', async () => {
    const { servico } = montar({ convitePara: ANA, bloqueado: true });
    const tentativas = [
      () => servico.pedir(contexto(BIA), 'convite'),
      () => servico.aceitar(contexto(BIA), 'refQueNaoExiste00000000'),
      () => servico.encerrar(contexto(BIA), 'refQueNaoExiste00000000'),
    ];
    for (const tentativa of tentativas) {
      assert.equal((await erroDe(tentativa)).problemType, 'not-found');
    }
  });

  void it('CONTRATO COM A FATIA E: o bloqueio apaga o pendente das DUAS direções', async () => {
    const { servico, bancada } = montar({ convitePara: ANA });
    await servico.pedir(contexto(BIA), 'convite');
    bancada.semear({ pedinte: ANA, destinatario: CLE, estado: 'pending' });

    const apagadas = await bancada.repositorio.desfazerPorBloqueio(ANA, BIA, AGORA);
    assert.equal(apagadas, 1);
    assert.equal(await bancada.repositorio.arestaDoPar(ANA, BIA, AGORA), undefined);
    assert.notEqual(
      await bancada.repositorio.arestaDoPar(ANA, CLE, AGORA),
      undefined,
      'o bloqueio de Bia não pode alcançar a aresta de Cleide',
    );
  });

  void it('CONTRATO COM A FATIA E: desfaz a conexão aceita, e é idempotente', async () => {
    const { servico, bancada } = montar({ convitePara: ANA });
    const pedido = await servico.pedir(contexto(BIA), 'convite');
    await servico.aceitar(contexto(ANA), pedido.ref);

    assert.equal(await bancada.repositorio.desfazerPorBloqueio(BIA, ANA, AGORA), 1);
    assert.equal(await bancada.repositorio.estaConectado(ANA, BIA), false);
    assert.equal(
      await bancada.repositorio.desfazerPorBloqueio(BIA, ANA, AGORA),
      0,
      'chamar de novo sobre um par já limpo devolve 0 e não falha',
    );
  });
});

void describe('ISCA (e): conta desabilitada — a conexão SOME, a linha FICA', () => {
  async function conectadas(): Promise<Montagem> {
    const montagem = montar({ convitePara: ANA });
    const pedido = await montagem.servico.pedir(contexto(BIA), 'convite');
    await montagem.servico.aceitar(contexto(ANA), pedido.ref);
    return montagem;
  }

  void it('CONTRAPESO: com as duas habilitadas, a conexão aparece e conta', async () => {
    const { servico, bancada } = await conectadas();
    assert.equal(await bancada.repositorio.estaConectado(ANA, BIA), true);
    assert.equal((await servico.resumo(contexto(ANA))).connected_count, 1);
  });

  void it('ISCA: desabilitada Bia, a conexão sai da leitura E da contagem de Ana', async () => {
    const { servico, bancada } = await conectadas();
    bancada.desabilitar(BIA);
    assert.equal(await bancada.repositorio.estaConectado(ANA, BIA), false);
    assert.equal((await servico.resumo(contexto(ANA))).connected_count, 0);
    assert.equal(await bancada.repositorio.arestaDoPar(ANA, BIA, AGORA), undefined);
  });

  void it('sem fantasma: a leitura não devolve marca, rótulo nem linha vazia', async () => {
    const { bancada } = await conectadas();
    bancada.desabilitar(BIA);
    const caixa = await bancada.repositorio.pedidos(ANA, {
      direcao: 'received',
      pagina: 1,
      limite: 20,
      agora: AGORA,
    });
    assert.deepEqual(caixa.itens, []);
    assert.equal(caixa.total, 0);
  });

  void it('A LINHA NÃO É APAGADA: reabilitar devolve a conexão intacta', async () => {
    const { servico, bancada } = await conectadas();
    bancada.desabilitar(BIA);
    assert.equal(bancada.linhas.length, 1, 'a linha tem de continuar no banco');
    bancada.reabilitar(BIA);
    assert.equal(await bancada.repositorio.estaConectado(ANA, BIA), true);
    assert.equal((await servico.resumo(contexto(ANA))).connected_count, 1);
  });

  void it('o pendente de quem desabilitou também sai da caixa do outro lado', async () => {
    const { servico, bancada } = montar({ convitePara: ANA });
    await servico.pedir(contexto(BIA), 'convite');
    const antes = await bancada.repositorio.pedidos(ANA, {
      direcao: 'received',
      pagina: 1,
      limite: 20,
      agora: AGORA,
    });
    assert.equal(antes.total, 1);
    bancada.desabilitar(BIA);
    const depois = await bancada.repositorio.pedidos(ANA, {
      direcao: 'received',
      pagina: 1,
      limite: 20,
      agora: AGORA,
    });
    assert.equal(depois.total, 0);
  });
});

void describe('a caixa de pedidos NUNCA traz conexão aceita', () => {
  void it('aceito sai das duas caixas, e é isso que impede a lista de nascer aqui', async () => {
    const { servico } = montar({ convitePara: ANA });
    const pedido = await servico.pedir(contexto(BIA), 'convite');
    await servico.aceitar(contexto(ANA), pedido.ref);

    for (const [quem, direcao] of [
      [ANA, 'received'],
      [ANA, 'sent'],
      [BIA, 'received'],
      [BIA, 'sent'],
    ] as const) {
      const caixa = await servico.pedidos(contexto(quem), direcao, 1, 20);
      assert.equal(
        caixa.itens.filter((i) => i.state === 'connected').length,
        0,
        `a caixa ${direcao} de ${quem} trouxe uma conexão aceita`,
      );
    }
  });
});

void describe('recusar, cancelar e desfazer — e o silêncio da recusa', () => {
  void it('a recusa guarda a linha, e pedir de novo NÃO cria linha nem conta nada', async () => {
    const { servico, bancada } = montar({ convitePara: ANA });
    const pedido = await servico.pedir(contexto(BIA), 'convite');
    await servico.encerrar(contexto(ANA), pedido.ref);
    assert.equal(bancada.linhas.length, 1, 'a recusa não apaga a linha: apagá-la lavaria a recusa');
    assert.equal(bancada.linhas[0]?.estado, 'declined');

    const denovo = await servico.pedir(contexto(BIA), 'convite');
    assert.equal(denovo.state, 'pending_sent');
    assert.equal(denovo.ref, pedido.ref);
    assert.equal(bancada.linhas.length, 1);
    assert.equal(bancada.linhas[0]?.estado, 'declined', 'o pedido novo não ressuscita o pendente');
  });

  void it('para quem pediu, a recusa continua parecendo "enviado"', async () => {
    const { servico } = montar({ convitePara: ANA });
    const pedido = await servico.pedir(contexto(BIA), 'convite');
    await servico.encerrar(contexto(ANA), pedido.ref);
    const caixa = await servico.pedidos(contexto(BIA), 'sent', 1, 20);
    assert.equal(caixa.itens.length, 1);
    assert.equal(caixa.itens[0]?.state, 'pending_sent');
  });

  void it('o cancelamento de quem pediu APAGA a linha, e não é recusa de ninguém', async () => {
    const { servico, bancada } = montar({ convitePara: ANA });
    const pedido = await servico.pedir(contexto(BIA), 'convite');
    await servico.encerrar(contexto(BIA), pedido.ref);
    assert.equal(bancada.linhas.length, 0);
  });

  void it('desfazer apaga a conexão, e qualquer um dos dois pode', async () => {
    const { servico, bancada } = montar({ convitePara: ANA });
    const pedido = await servico.pedir(contexto(BIA), 'convite');
    await servico.aceitar(contexto(ANA), pedido.ref);
    await servico.encerrar(contexto(ANA), pedido.ref);
    assert.equal(bancada.linhas.length, 0);
    assert.equal(await bancada.repositorio.estaConectado(ANA, BIA), false);
  });

  void it('a trilha diz qual das três aconteceu, e nomeia a ARESTA', async () => {
    const { servico, trilha } = montar({ convitePara: ANA });
    const pedido = await servico.pedir(contexto(BIA), 'convite');
    await servico.encerrar(contexto(ANA), pedido.ref);
    const acoes = trilha.map((e) => e.action);
    assert.deepEqual(acoes, ['connection.requested', 'connection.declined']);
    for (const evento of trilha) {
      assert.equal(evento.resourceKind, 'user_connection');
      assert.equal(evento.resourceId, pedido.ref);
      assert.doesNotMatch(
        JSON.stringify(evento.metadata ?? {}),
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
        'a trilha não nomeia o outro lado: trilha que nomeia uma recusa conta a recusa',
      );
    }
  });
});

void describe('o pedido é idempotente, e a aresta morta é reaproveitada', () => {
  void it('pedir de novo sobre pendente vivo devolve o mesmo, sem criar linha', async () => {
    const { servico, bancada } = montar({ convitePara: ANA });
    const primeiro = await servico.pedir(contexto(BIA), 'convite');
    const segundo = await servico.pedir(contexto(BIA), 'convite');
    assert.equal(segundo.ref, primeiro.ref);
    assert.equal(bancada.linhas.length, 1);
  });

  void it('passados os 90 dias da recusa, o pedido novo reaproveita a linha', async () => {
    const montagem = montar({ convitePara: ANA });
    const pedido = await montagem.servico.pedir(contexto(BIA), 'convite');
    await montagem.servico.encerrar(contexto(ANA), pedido.ref);

    const depois = montar({ convitePara: ANA, agora: (Number(AGORA) + 91 * DIA) as Instant });
    depois.bancada.semear({
      pedinte: BIA,
      destinatario: ANA,
      estado: 'declined',
      pedidoEm: Number(AGORA),
      expiraEm: Number(AGORA) + 30 * DIA,
      descansoAte: Number(AGORA) + 90 * DIA,
    });
    const renovado = await depois.servico.pedir(contexto(BIA), 'convite');
    assert.equal(renovado.state, 'pending_sent');
    assert.equal(depois.bancada.linhas.length, 1, 'reaproveita a linha: uma linha por par');
  });
});

void describe('ISCA: o contador de convidados conta quem ACEITOU e tem pet com foto', () => {

  void it('pedido pendente NAO conta: falta o aceite', async () => {
    const { servico } = montar({ convitePara: ANA, comPetComFotoPronta: [BIA] });
    await servico.pedir(contexto(BIA), 'convite');

    assert.equal(
      (await servico.resumo(contexto(ANA))).invited_joined_count,
      0,
      'REPROVA: um pedido pendente ja conta como tutor trazido. O aceite e ' +
        'obrigatorio, e sem ele a pessoa nao entrou na rede de ninguem.',
    );
  });

  void it('CONTRAPESO: aceito E com pet de foto pronta conta UM', async () => {
    const { servico } = montar({ convitePara: ANA, comPetComFotoPronta: [BIA] });
    const pedido = await servico.pedir(contexto(BIA), 'convite');
    await servico.aceitar(contexto(ANA), pedido.ref);

    assert.equal(
      (await servico.resumo(contexto(ANA))).invited_joined_count,
      1,
      'REPROVA: a conexao aceita de quem entrou pelo convite, com pet de foto ' +
        'pronta, nao contou.',
    );
  });

  void it('aceito e SEM pet com foto pronta NAO conta: e o freio anti-abuso', async () => {
    const { servico } = montar({ convitePara: ANA });
    const pedido = await servico.pedir(contexto(BIA), 'convite');
    await servico.aceitar(contexto(ANA), pedido.ref);

    assert.equal(
      (await servico.resumo(contexto(ANA))).connected_count,
      1,
      'REPROVA: o contrapeso deste caso caiu -- a conexao nao foi aceita, e ' +
        'entao ele nao mede o freio do pet.',
    );
    assert.equal(
      (await servico.resumo(contexto(ANA))).invited_joined_count,
      0,
      'REPROVA: contou quem nao tem pet com foto pronta. O segundo sinal e o ' +
        'freio anti-abuso, e sem ele o contador se enche com contas vazias.',
    );
  });

  void it('quem CONVIDOU nao aparece no contador de quem foi convidado', async () => {
    const { servico } = montar({ convitePara: ANA, comPetComFotoPronta: [BIA] });
    const pedido = await servico.pedir(contexto(BIA), 'convite');
    await servico.aceitar(contexto(ANA), pedido.ref);

    assert.equal((await servico.resumo(contexto(ANA))).invited_joined_count, 1);
    assert.equal(
      (await servico.resumo(contexto(BIA))).invited_joined_count,
      0,
      'REPROVA: quem usou o convite de alguem viu o proprio contador subir. O ' +
        'numero e de quem TROUXE, e nao de quem veio.',
    );
    assert.equal(
      (await servico.resumo(contexto(BIA))).connected_count,
      1,
      'REPROVA: o contrapeso caiu -- a conexao deveria contar para os dois.',
    );
  });

  void it('quem entrou pela BUSCA nao conta: a origem e outra', async () => {
    const { servico } = montar({ apelidoPara: ANA, comPetComFotoPronta: [BIA] });
    const pedido = await servico.pedirPorApelido(contexto(BIA), 'ana-do-bairro');
    await servico.aceitar(contexto(ANA), pedido.ref);

    assert.equal((await servico.resumo(contexto(ANA))).connected_count, 1);
    assert.equal(
      (await servico.resumo(contexto(ANA))).invited_joined_count,
      0,
      'REPROVA: conexao nascida da BUSCA contou como tutor trazido pelo ' +
        'convite. As duas origens existem para serem distinguidas.',
    );
  });
});
