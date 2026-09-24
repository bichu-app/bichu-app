/**
 * O comando de papel com as tres portas trocadas: sem banco, sem terminal e
 * sem rede. O banco de verdade esta em `tests/integration/conceder-papel.test.ts`.
 *
 * A sentinela e a prova de que a senha nao sai por nenhum canal que este
 * arquivo alcanca: mensagens, perguntas, argumentos do repositorio e o que a
 * trilha receberia.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Instant, UserId } from '../../../shared/types/brands.js';
import { SAIDA, type PedidoDePapel } from '../domain/concessao-de-papel.js';
import type { ListaDeSenhasVazadas } from '../ports/lista-de-senhas-vazadas.js';
import type {
  ContaParaPapel,
  NovaContaAdministrativa,
  PedidoDeMudancaDePapel,
  RepositorioDePapeis,
} from '../ports/repositorio-de-papeis.js';
import { executarPedidoDePapel, type Interacao, type SenhaDigitada } from './conceder-papel.js';

const SENTINELA = 'SENTINELA-conceder-papel-e41b';
const CONTA = '01900000-0000-7000-8000-000000000001' as UserId;

function pedido(campos: Partial<PedidoDePapel> = {}): PedidoDePapel {
  return {
    acao: 'conceder',
    email: 'operacao@exemplo.com.br',
    papel: 'admin',
    criarConta: false,
    operador: 'Leandro',
    ...campos,
  };
}

class RepositorioFalso implements RepositorioDePapeis {
  conta: ContaParaPapel | undefined;
  chamadas: { metodo: string; argumento: unknown }[] = [];
  constructor(conta: ContaParaPapel | undefined) {
    this.conta = conta;
  }
  buscarContaPorEmail(email: string) {
    this.chamadas.push({ metodo: 'buscar', argumento: email });
    return Promise.resolve(this.conta);
  }
  conceder(p: PedidoDeMudancaDePapel) {
    this.chamadas.push({ metodo: 'conceder', argumento: p });
    return Promise.resolve({ mudou: true, familiasMoveisDerrubadas: 2 });
  }
  revogar(p: PedidoDeMudancaDePapel) {
    this.chamadas.push({ metodo: 'revogar', argumento: p });
    return Promise.resolve({ mudou: true, sessoesAdministrativasRevogadas: 1, papeisRestantes: [] });
  }
  criarContaAdministrativa(nova: NovaContaAdministrativa) {
    this.chamadas.push({ metodo: 'criar', argumento: nova });
    return Promise.resolve(CONTA);
  }
  escritas(): string[] {
    return this.chamadas.filter((c) => c.metodo !== 'buscar').map((c) => c.metodo);
  }
}

class InteracaoFalsa implements Interacao {
  mostrado: string[] = [];
  perguntado: string[] = [];
  senhasEntregues: Buffer[] = [];
  constructor(
    private readonly respostas: string[],
    private readonly senhas: string[] = [],
  ) {}
  mostrar(texto: string): void {
    this.mostrado.push(texto);
  }
  perguntar(rotulo: string): Promise<string> {
    this.perguntado.push(rotulo);
    return Promise.resolve(this.respostas.shift() ?? '');
  }
  perguntarSenha(rotulo: string): Promise<SenhaDigitada> {
    this.perguntado.push(rotulo);
    const bytes = Buffer.from(this.senhas.shift() ?? '', 'utf8');
    this.senhasEntregues.push(bytes);
    return Promise.resolve({ bytes, excedeu: false });
  }
  tudo(): string {
    return [...this.mostrado, ...this.perguntado].join('\n');
  }
}

function base(
  conta: ContaParaPapel | undefined,
  interacao: InteracaoFalsa,
  vazada: Awaited<ReturnType<ListaDeSenhasVazadas['contem']>> = false,
) {
  const repositorio = new RepositorioFalso(conta);
  const hashes: string[] = [];
  const consultas: string[] = [];
  const deps = {
    repositorio,
    interacao,
    clock: { now: () => 1_000 as Instant },
    senhasVazadas: {
      contem: (senha: string) => {
        consultas.push(senha);
        return Promise.resolve(vazada);
      },
    },
    gerarHash: (senha: string) => {
      hashes.push(senha);
      return Promise.resolve('$pbkdf2-sha512$i=210000$c2Fs$aGFzaA');
    },
  };
  return { deps, repositorio, hashes, consultas };
}

const TUTOR: ContaParaPapel = { id: CONTA, status: 'active', papeis: ['tutor'] };
const ADMIN: ContaParaPapel = { id: CONTA, status: 'active', papeis: ['admin'] };

void describe('conceder admin a conta existente', () => {
  void it('avisa da D42, pede confirmacao e concede', async () => {
    const interacao = new InteracaoFalsa(['sim']);
    const { deps, repositorio } = base(TUTOR, interacao);
    assert.equal(await executarPedidoDePapel(pedido(), deps), SAIDA.OK);
    assert.deepEqual(repositorio.escritas(), ['conceder']);
    assert.deepEqual(repositorio.chamadas[1]?.argumento, {
      userId: CONTA,
      papel: 'admin',
      operador: 'Leandro',
      agora: 1_000,
    });
    assert.match(interacao.tudo(), /D42/);
    assert.match(interacao.tudo(), /deixa de entrar pelo app/);
    assert.match(interacao.tudo(), /esta conta e de tutor/);
  });

  void it('idempotente: quem ja e admin nao e reescrito nem confirmado', async () => {
    const interacao = new InteracaoFalsa([]);
    const { deps, repositorio } = base(ADMIN, interacao);
    assert.equal(await executarPedidoDePapel(pedido(), deps), SAIDA.OK);
    assert.deepEqual(repositorio.escritas(), []);
    assert.deepEqual(interacao.perguntado, []);
  });

  void it('isca: e-mail sem conta sai diferente de zero e nao cria conta', async () => {
    const interacao = new InteracaoFalsa(['sim']);
    const { deps, repositorio } = base(undefined, interacao);
    const codigo = await executarPedidoDePapel(pedido(), deps);
    assert.equal(codigo, SAIDA.CONTA_INEXISTENTE);
    assert.notEqual(codigo, 0);
    assert.deepEqual(repositorio.escritas(), []);
  });

  void it('sem "sim" nada e gravado', async () => {
    const interacao = new InteracaoFalsa(['s']);
    const { deps, repositorio } = base(TUTOR, interacao);
    assert.equal(await executarPedidoDePapel(pedido(), deps), SAIDA.CANCELADO);
    assert.deepEqual(repositorio.escritas(), []);
  });

  void it('conta suspensa e recusada', async () => {
    const interacao = new InteracaoFalsa(['sim']);
    const { deps, repositorio } = base({ ...TUTOR, status: 'suspended' }, interacao);
    assert.equal(await executarPedidoDePapel(pedido(), deps), SAIDA.CONFLITO);
    assert.deepEqual(repositorio.escritas(), []);
  });

  void it('sem --operador pergunta; nome invalido recusa antes de tocar o banco', async () => {
    const interacao = new InteracaoFalsa(['\u001b[2J']);
    const { deps, repositorio } = base(TUTOR, interacao);
    assert.equal(await executarPedidoDePapel(pedido({ operador: undefined }), deps), SAIDA.USO);
    assert.deepEqual(repositorio.chamadas, []);
  });
});

void describe('revogar admin', () => {
  void it('revoga, e diz que sem tutor a conta continua fora do app', async () => {
    const interacao = new InteracaoFalsa(['sim']);
    const { deps, repositorio } = base(ADMIN, interacao);
    assert.equal(await executarPedidoDePapel(pedido({ acao: 'revogar' }), deps), SAIDA.OK);
    assert.deepEqual(repositorio.escritas(), ['revogar']);
    assert.match(interacao.tudo(), /continua sem entrar pelo app/);
  });

  void it('idempotente: quem nao tem o papel nao e reescrito', async () => {
    const interacao = new InteracaoFalsa([]);
    const { deps, repositorio } = base(TUTOR, interacao);
    assert.equal(await executarPedidoDePapel(pedido({ acao: 'revogar' }), deps), SAIDA.OK);
    assert.deepEqual(repositorio.escritas(), []);
  });
});

void describe('--criar-conta: a senha e do cliente', () => {
  const SENHA_BOA = `${SENTINELA}-frase-longa`;

  void it('isca da sentinela: cria com o hash, zera os buffers, e a senha nao aparece em canal nenhum', async () => {
    const interacao = new InteracaoFalsa(['sim'], [SENHA_BOA, SENHA_BOA]);
    const { deps, repositorio, hashes } = base(undefined, interacao);
    assert.equal(await executarPedidoDePapel(pedido({ criarConta: true }), deps), SAIDA.OK);

    assert.deepEqual(hashes, [SENHA_BOA], 'a derivacao nao recebeu a senha digitada');
    assert.deepEqual(repositorio.escritas(), ['criar']);
    for (const bytes of interacao.senhasEntregues) {
      assert.ok(bytes.every((b) => b === 0), 'um buffer de senha nao foi zerado');
    }
    assert.ok(!interacao.tudo().includes(SENTINELA), 'a senha apareceu numa mensagem ou pergunta');
    assert.ok(!JSON.stringify(repositorio.chamadas).includes(SENTINELA), 'a senha chegou ao repositorio');
    assert.match(interacao.tudo(), /D42/);
  });

  for (const [caso, senhas, vazada, trecho] of [
    ['senha curta', ['curta-demais', 'curta-demais'], false, /15 caracteres/],
    ['digitacoes diferentes', [SENHA_BOA, `${SENHA_BOA}x`], false, /nao conferem/],
    ['senha vazada', [SENHA_BOA, SENHA_BOA], true, /vazamento publico/],
    ['base de vazadas fora do ar', [SENHA_BOA, SENHA_BOA], 'desconhecido', /nao consegui consultar/],
  ] as const) {
    void it(`isca: ${caso} e recusada, nada e criado, os buffers sao zerados`, async () => {
      const interacao = new InteracaoFalsa(['sim'], [...senhas]);
      const { deps, repositorio, hashes } = base(undefined, interacao, vazada);
      assert.equal(await executarPedidoDePapel(pedido({ criarConta: true }), deps), SAIDA.SENHA_RECUSADA);
      assert.deepEqual(repositorio.escritas(), []);
      assert.deepEqual(hashes, [], 'derivou hash de senha recusada');
      assert.match(interacao.tudo(), trecho);
      for (const bytes of interacao.senhasEntregues) assert.ok(bytes.every((b) => b === 0));
      assert.ok(!interacao.tudo().includes(SENTINELA));
    });
  }

  void it('e-mail que ja tem conta e recusado sem pedir senha', async () => {
    const interacao = new InteracaoFalsa(['sim'], [SENHA_BOA, SENHA_BOA]);
    const { deps, repositorio } = base(TUTOR, interacao);
    assert.equal(await executarPedidoDePapel(pedido({ criarConta: true }), deps), SAIDA.CONFLITO);
    assert.deepEqual(repositorio.escritas(), []);
    assert.deepEqual(interacao.senhasEntregues, []);
  });
});
