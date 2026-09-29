/**
 * O comando `conta-admin` com portas de teste: sem banco, sem terminal e sem
 * rede. Toda saida (terminal, avisos, escritas) e conferida contra a
 * sentinela, que e a senha digitada: ela nunca pode aparecer em lugar nenhum.
 *
 * As senhas daqui sao valores de teste, nunca de conta real.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AdminAccountId, Instant } from '../../../shared/types/brands.js';
import { SAIDA, type PedidoDoComando } from '../domain/comando-conta-admin.js';
import type { MensagemDoPainel } from '../ports/aviso-por-email.js';
import type { ComandoDeContas, ContaListada, ContaNoComando } from '../ports/comando-de-contas.js';
import { executarComandoContaAdmin, type DependenciasDoComandoContaAdmin } from './comando-conta-admin.js';

const SENTINELA = 'SENTINELA-senha-de-teste-9d3e';
const CURTA = 'catorze-carac';
const VAZADA = 'senha-de-teste-que-a-dubla-diz-vazada';
const DO_APP = 'senha-de-teste-igual-a-da-conta-do-app';
const AGORA = Date.UTC(2026, 8, 28, 12, 0, 0) as Instant;

interface Conta extends ContaNoComando {
  phc: string;
  sessoes: number;
}

function montar(opcoes: { respostas?: string[]; senhas?: string[]; vazadas?: 'fora' } = {}) {
  const terminal: string[] = [];
  const avisos: MensagemDoPainel[] = [];
  const escritas: string[] = [];
  const contas = new Map<string, Conta>();
  const respostas = [...(opcoes.respostas ?? ['sim'])];
  const senhas = [...(opcoes.senhas ?? [SENTINELA, SENTINELA])];
  let proximo = 1;

  const comando: ComandoDeContas = {
    buscarPorEmail: (email) => Promise.resolve(contas.get(email)),
    listar: () =>
      Promise.resolve(
        [...contas.values()].map(
          (c): ContaListada => ({
            email: c.email,
            displayName: c.displayName,
            status: c.status,
            blockedReason: c.blockedReason,
            lastLoginAt: null,
          }),
        ),
      ),
    criar: (nova) => {
      if (contas.has(nova.email)) return Promise.resolve('email_em_uso');
      const id = `0192a3b4-0000-7000-8000-00000000000${String(proximo++)}` as AdminAccountId;
      contas.set(nova.email, {
        id, email: nova.email, displayName: nova.nome, status: 'active', blockedReason: null, phc: nova.passwordPhc, sessoes: 0,
      });
      escritas.push(`criar ${nova.email} ${nova.operador} ${nova.passwordPhc}`);
      return Promise.resolve(id);
    },
    redefinirSenha: (troca) => {
      const c = [...contas.values()].find((x) => x.id === troca.id);
      assert.ok(c);
      const sessoesRevogadas = c.sessoes;
      Object.assign(c, { phc: troca.passwordPhc, blockedReason: null, sessoes: 0 });
      escritas.push(`redefinir ${c.email} ${troca.passwordPhc}`);
      return Promise.resolve({ sessoesRevogadas });
    },
    desativar: (m) => {
      const c = [...contas.values()].find((x) => x.id === m.id);
      assert.ok(c);
      const sessoesRevogadas = c.sessoes;
      Object.assign(c, { status: 'disabled', sessoes: 0 });
      escritas.push(`desativar ${c.email}`);
      return Promise.resolve({ mudou: true, sessoesRevogadas });
    },
    reativar: (troca) => {
      const c = [...contas.values()].find((x) => x.id === troca.id);
      assert.ok(c);
      Object.assign(c, { status: 'active', phc: troca.passwordPhc, blockedReason: null });
      escritas.push(`reativar ${c.email}`);
      return Promise.resolve({ mudou: true });
    },
    encerrarSessoes: (m) => {
      const c = [...contas.values()].find((x) => x.id === m.id);
      assert.ok(c);
      const sessoesRevogadas = c.sessoes;
      c.sessoes = 0;
      escritas.push(`encerrar ${c.email}`);
      return Promise.resolve({ sessoesRevogadas });
    },
  };

  const deps: DependenciasDoComandoContaAdmin = {
    contas: comando,
    senhasVazadas: {
      contem: (senha) => Promise.resolve(opcoes.vazadas === 'fora' ? 'desconhecido' : senha === VAZADA),
    },
    contaDoApp: { mesmaSenhaDaContaDoApp: (_email, senha) => Promise.resolve(senha === DO_APP) },
    avisos: {
      enviar: (m) => {
        if (m.para.startsWith('quebrado')) return Promise.reject(new Error('smtp recusou'));
        avisos.push(m);
        return Promise.resolve();
      },
    },
    interacao: {
      mostrar: (t) => void terminal.push(t),
      perguntar: () => Promise.resolve(respostas.shift() ?? ''),
      perguntarSenha: () => Promise.resolve({ bytes: Buffer.from(senhas.shift() ?? '', 'utf8'), excedeu: false }),
    },
    clock: { now: () => AGORA },
    gerarHash: (senha) => Promise.resolve(`$pbkdf2-sha512$teste$${String(senha.length)}`),
  };

  const semear = (email: string, status: 'active' | 'disabled' = 'active', extra: Partial<Conta> = {}) => {
    contas.set(email, {
      id: `0192a3b4-0000-7000-8000-0000000009${String(proximo++).padStart(2, '0')}` as AdminAccountId,
      email, displayName: 'Existente', status, blockedReason: null, phc: 'x', sessoes: 0, ...extra,
    });
  };

  const tudo = () => JSON.stringify({ terminal, avisos, escritas });
  return { deps, terminal, avisos, escritas, contas, semear, tudo };
}

const pedido = (subcomando: Exclude<PedidoDoComando['subcomando'], 'listar'>, email = 'nova@exemplo.com.br'): PedidoDoComando => ({
  subcomando, email, nome: subcomando === 'criar' ? 'Nova Pessoa' : undefined, operador: 'Operador de teste',
});

void describe('conta-admin criar', () => {
  void it('cria, avisa todos os administradores ativos E o dono do endereco novo, e a senha nao aparece', async () => {
    const m = montar();
    m.semear('ativa@exemplo.com.br');
    m.semear('desativada@exemplo.com.br', 'disabled');
    assert.equal(await executarComandoContaAdmin(pedido('criar'), m.deps), SAIDA.OK);
    assert.equal(m.contas.get('nova@exemplo.com.br')?.status, 'active');
    const para = m.avisos.map((a) => a.para).sort();
    assert.deepEqual(para, ['ativa@exemplo.com.br', 'nova@exemplo.com.br']);
    assert.ok(!m.tudo().includes(SENTINELA), 'a senha apareceu no terminal, num aviso ou numa escrita');
  });

  void it('ISCA: 14 caracteres recusados (saida 4) e nada gravado', async () => {
    const m = montar({ senhas: [CURTA, CURTA] });
    assert.equal(await executarComandoContaAdmin(pedido('criar'), m.deps), SAIDA.SENHA_RECUSADA);
    assert.equal(m.escritas.length, 0);
    assert.ok(m.terminal.some((t) => /pelo menos 15/.test(t)));
  });

  void it('ISCA: senha da lista de vazadas recusada; base fora do ar tambem recusa', async () => {
    const vazada = montar({ senhas: [VAZADA, VAZADA] });
    assert.equal(await executarComandoContaAdmin(pedido('criar'), vazada.deps), SAIDA.SENHA_RECUSADA);
    assert.equal(vazada.escritas.length, 0);
    const fora = montar({ vazadas: 'fora' });
    assert.equal(await executarComandoContaAdmin(pedido('criar'), fora.deps), SAIDA.SENHA_RECUSADA);
    assert.equal(fora.escritas.length, 0);
  });

  void it('ISCA D63: a mesma senha da conta do app de mesmo e-mail e recusada', async () => {
    const m = montar({ senhas: [DO_APP, DO_APP] });
    assert.equal(await executarComandoContaAdmin(pedido('criar'), m.deps), SAIDA.SENHA_RECUSADA);
    assert.equal(m.escritas.length, 0);
    assert.ok(m.terminal.some((t) => /D63/.test(t)));
    assert.ok(!m.tudo().includes(DO_APP));
  });

  void it('digitacoes diferentes recusadas; e-mail ja existente e conflito; sem "sim" cancela', async () => {
    const diferentes = montar({ senhas: [SENTINELA, `${SENTINELA}x`] });
    assert.equal(await executarComandoContaAdmin(pedido('criar'), diferentes.deps), SAIDA.SENHA_RECUSADA);
    const existe = montar();
    existe.semear('nova@exemplo.com.br');
    assert.equal(await executarComandoContaAdmin(pedido('criar'), existe.deps), SAIDA.CONFLITO);
    const cancela = montar({ respostas: ['nao'] });
    assert.equal(await executarComandoContaAdmin(pedido('criar'), cancela.deps), SAIDA.CANCELADO);
    assert.equal(cancela.escritas.length, 0);
  });

  void it('falha do envio nao desfaz a escrita, e o terminal diz quem nao recebeu', async () => {
    const m = montar();
    m.semear('quebrado@exemplo.com.br');
    assert.equal(await executarComandoContaAdmin(pedido('criar'), m.deps), SAIDA.OK);
    assert.ok(m.contas.has('nova@exemplo.com.br'));
    assert.ok(m.terminal.some((t) => t.includes('quebrado@exemplo.com.br') && /nao chegou/.test(t)));
  });
});

void describe('conta-admin redefinir, desativar, reativar, encerrar e listar', () => {
  void it('redefinir-senha limpa o bloqueio, derruba as sessoes e avisa', async () => {
    const m = montar();
    m.semear('ativa@exemplo.com.br', 'active', { blockedReason: 'failed_logins', sessoes: 2 });
    assert.equal(await executarComandoContaAdmin(pedido('redefinir-senha', 'ativa@exemplo.com.br'), m.deps), SAIDA.OK);
    const c = m.contas.get('ativa@exemplo.com.br');
    assert.equal(c?.blockedReason, null);
    assert.equal(c?.sessoes, 0);
    assert.ok(m.terminal.some((t) => /2 sessao/.test(t) && /bloqueio removido/.test(t)));
    assert.equal(m.avisos.length, 1);
    assert.ok(!m.tudo().includes(SENTINELA));
  });

  void it('conta inexistente sai 3 em todo subcomando com e-mail', async () => {
    for (const sub of ['redefinir-senha', 'desativar', 'reativar', 'encerrar-sessoes'] as const) {
      const m = montar();
      assert.equal(await executarComandoContaAdmin(pedido(sub, 'ninguem@exemplo.com.br'), m.deps), SAIDA.CONTA_INEXISTENTE, sub);
      assert.equal(m.escritas.length, 0, sub);
    }
  });

  void it('desativar derruba as sessoes e avisa; ja desativada e nada a fazer', async () => {
    const m = montar();
    m.semear('ativa@exemplo.com.br', 'active', { sessoes: 1 });
    assert.equal(await executarComandoContaAdmin(pedido('desativar', 'ativa@exemplo.com.br'), m.deps), SAIDA.OK);
    assert.equal(m.contas.get('ativa@exemplo.com.br')?.status, 'disabled');
    assert.equal(m.contas.get('ativa@exemplo.com.br')?.sessoes, 0);
    const jaDesativada = montar();
    jaDesativada.semear('parada@exemplo.com.br', 'disabled');
    assert.equal(await executarComandoContaAdmin(pedido('desativar', 'parada@exemplo.com.br'), jaDesativada.deps), SAIDA.OK);
    assert.equal(jaDesativada.escritas.length, 0);
  });

  void it('reativar exige senha nova no mesmo passo, com a mesma politica', async () => {
    const curta = montar({ senhas: [CURTA, CURTA] });
    curta.semear('parada@exemplo.com.br', 'disabled');
    assert.equal(await executarComandoContaAdmin(pedido('reativar', 'parada@exemplo.com.br'), curta.deps), SAIDA.SENHA_RECUSADA);
    assert.equal(curta.contas.get('parada@exemplo.com.br')?.status, 'disabled');
    const m = montar();
    m.semear('parada@exemplo.com.br', 'disabled');
    assert.equal(await executarComandoContaAdmin(pedido('reativar', 'parada@exemplo.com.br'), m.deps), SAIDA.OK);
    assert.equal(m.contas.get('parada@exemplo.com.br')?.status, 'active');
    assert.notEqual(m.contas.get('parada@exemplo.com.br')?.phc, 'x', 'reativou sem trocar a senha');
  });

  void it('encerrar-sessoes derruba as sessoes sem pedir senha', async () => {
    const m = montar({ senhas: [] });
    m.semear('ativa@exemplo.com.br', 'active', { sessoes: 3 });
    assert.equal(await executarComandoContaAdmin(pedido('encerrar-sessoes', 'ativa@exemplo.com.br'), m.deps), SAIDA.OK);
    assert.equal(m.contas.get('ativa@exemplo.com.br')?.sessoes, 0);
    assert.ok(m.terminal.some((t) => /3 sessao/.test(t)));
  });

  void it('listar mostra estado e bloqueio, e nunca o hash', async () => {
    const m = montar();
    m.semear('ativa@exemplo.com.br', 'active', { blockedReason: 'disavowed', phc: '$pbkdf2-sha512$HASH-QUE-NAO-SAI' });
    assert.equal(await executarComandoContaAdmin({ subcomando: 'listar' }, m.deps), SAIDA.OK);
    assert.ok(m.terminal.some((t) => t.includes('ativa@exemplo.com.br') && t.includes('disavowed')));
    assert.ok(!m.tudo().includes('HASH-QUE-NAO-SAI'));
  });
});
