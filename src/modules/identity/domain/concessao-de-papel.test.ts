/**
 * As regras do comando de papel (BICHUS-260; ADR-0027 D42, D43 e D51), sem
 * banco, sem terminal e sem rede.
 *
 * O que estes casos seguram, e que nenhum outro lugar segura:
 *
 * - a senha **nunca** entra por argumento, e a recusa nao repete o valor;
 * - papel fora da lista e recusado AQUI, antes de abrir conexao;
 * - `tutor` nao se revoga por este comando;
 * - a politica de D43 (15 caracteres) e a do produto somadas, e nenhuma
 *   mensagem de recusa carrega a senha.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  interpretarArgumentos,
  PAPEIS_CONCEDIVEIS,
  SAIDA,
  TAMANHO_MINIMO_DA_SENHA_ADMINISTRATIVA,
  validarNomeDoOperador,
  validarSenhaAdministrativa,
} from './concessao-de-papel.js';

const SENTINELA = 'SENTINELA-nao-pode-vazar-7d1f';

function recusa(argumentos: readonly string[]) {
  const resultado = interpretarArgumentos(argumentos);
  assert.equal(resultado.tipo, 'recusa', `devia recusar: ${argumentos.join(' ')}`);
  return resultado;
}

void describe('interpretarArgumentos', () => {
  void it('--email sozinho concede admin a conta existente', () => {
    const resultado = interpretarArgumentos(['--email', 'Ana@Exemplo.com.br']);
    assert.deepEqual(resultado, {
      tipo: 'pedido',
      pedido: {
        acao: 'conceder',
        email: 'ana@exemplo.com.br',
        papel: 'admin',
        criarConta: false,
        operador: undefined,
      },
    });
  });

  void it('aceita a forma --chave=valor e o operador', () => {
    const resultado = interpretarArgumentos(['--email=ana@exemplo.com.br', '--operador=Leandro P.']);
    assert.equal(resultado.tipo, 'pedido');
    if (resultado.tipo !== 'pedido') return;
    assert.equal(resultado.pedido.operador, 'Leandro P.');
  });

  void it('--revogar vira acao de revogar', () => {
    const resultado = interpretarArgumentos(['--revogar', '--email', 'ana@exemplo.com.br']);
    assert.equal(resultado.tipo, 'pedido');
    if (resultado.tipo !== 'pedido') return;
    assert.equal(resultado.pedido.acao, 'revogar');
  });

  void it('--criar-conta so vale para conceder', () => {
    const r = recusa(['--revogar', '--criar-conta', '--email', 'ana@exemplo.com.br']);
    assert.equal(r.codigo, SAIDA.USO);
  });

  for (const argumentos of [
    ['--email', 'ana@exemplo.com.br', '--senha', SENTINELA],
    ['--email', 'ana@exemplo.com.br', `--senha=${SENTINELA}`],
    ['--email', 'ana@exemplo.com.br', `--password=${SENTINELA}`],
    ['--email', 'ana@exemplo.com.br', '-p', SENTINELA],
    ['--email', 'ana@exemplo.com.br', `--PASS=${SENTINELA}`],
    ['--email', 'ana@exemplo.com.br', '--secret', SENTINELA],
  ]) {
    void it(`isca: senha por argumento e recusada sem repetir o valor (${argumentos[2] ?? ''})`, () => {
      const r = recusa(argumentos);
      assert.equal(r.codigo, SAIDA.USO);
      assert.match(r.mensagem, /senha nao e aceita por argumento/);
      assert.ok(!r.mensagem.includes(SENTINELA), 'a recusa repetiu a senha');
    });
  }

  void it('argumento posicional e recusado sem ecoar o valor (senha colada depois do e-mail)', () => {
    const r = recusa(['--email', 'ana@exemplo.com.br', SENTINELA]);
    assert.equal(r.codigo, SAIDA.USO);
    assert.ok(!r.mensagem.includes(SENTINELA));
  });

  void it('opcao desconhecida e nomeada, mas o valor dela nao', () => {
    const r = recusa(['--email', 'ana@exemplo.com.br', `--xyz=${SENTINELA}`]);
    assert.match(r.mensagem, /--xyz/);
    assert.ok(!r.mensagem.includes(SENTINELA));
  });

  void it('sem --email e recusa de uso', () => {
    assert.equal(recusa([]).codigo, SAIDA.USO);
    assert.equal(recusa(['--email']).codigo, SAIDA.USO);
  });

  void it('e-mail sem forma valida e recusado antes do banco', () => {
    assert.equal(recusa(['--email', 'nao-e-email']).codigo, SAIDA.USO);
  });

  void it('isca: papel fora da lista e recusado antes do banco', () => {
    for (const papel of ['superuser', 'moderator', 'ADMIN ', 'tutor', '']) {
      const r = recusa(['--email', 'ana@exemplo.com.br', '--papel', papel]);
      assert.equal(r.codigo, SAIDA.USO, `papel '${papel}'`);
    }
    assert.deepEqual([...PAPEIS_CONCEDIVEIS], ['admin']);
  });

  void it('revogar tutor e recusado com o motivo proprio', () => {
    const r = recusa(['--revogar', '--email', 'ana@exemplo.com.br', '--papel', 'tutor']);
    assert.equal(r.codigo, SAIDA.USO);
    assert.match(r.mensagem, /tutor/);
    assert.match(r.mensagem, /nao se revoga/);
  });

  void it('opcao repetida e recusada, para nao valer a ultima em silencio', () => {
    const r = recusa(['--email', 'a@exemplo.com.br', '--email', 'b@exemplo.com.br']);
    assert.equal(r.codigo, SAIDA.USO);
  });

  void it('--ajuda devolve ajuda', () => {
    assert.deepEqual(interpretarArgumentos(['--ajuda']), { tipo: 'ajuda' });
    assert.deepEqual(interpretarArgumentos(['-h']), { tipo: 'ajuda' });
  });
});

void describe('validarNomeDoOperador', () => {
  void it('aceita nome comum e recusa vazio, longo e caractere de controle', () => {
    assert.equal(validarNomeDoOperador('Leandro Panegassi'), undefined);
    assert.ok(validarNomeDoOperador(' ') !== undefined);
    assert.ok(validarNomeDoOperador('x'.repeat(81)) !== undefined);
    assert.ok(validarNomeDoOperador('Ana\u001b[31m') !== undefined);
  });
});

void describe('validarSenhaAdministrativa (D43)', () => {
  const contexto = { email: 'operacao@exemplo.com.br' };

  void it(`recusa abaixo de ${String(TAMANHO_MINIMO_DA_SENHA_ADMINISTRATIVA)} caracteres, mesmo acima do minimo do app`, () => {
    const erros = validarSenhaAdministrativa('catorze-chars!', contexto);
    assert.deepEqual(erros.map((e) => e.code), ['too_short']);
  });

  void it('aceita 15 caracteres sem composicao exigida', () => {
    assert.deepEqual(validarSenhaAdministrativa('girassol de mar', contexto), []);
  });

  void it('herda a recusa do produto: parecida com o e-mail e so espacos', () => {
    assert.ok(
      validarSenhaAdministrativa('operacao-exemplo-2026', contexto).some((e) => e.code === 'similar_to_identity'),
    );
    assert.ok(validarSenhaAdministrativa(' '.repeat(20), contexto).some((e) => e.code === 'blank'));
  });

  void it('recusa acima do teto de 256', () => {
    assert.ok(validarSenhaAdministrativa('a'.repeat(257) + 'b', contexto).some((e) => e.code === 'too_long'));
  });

  void it('isca: nenhuma mensagem de recusa carrega a senha', () => {
    for (const senha of [SENTINELA.slice(0, 10), `${SENTINELA}operacao`, 'x'.repeat(300) + SENTINELA]) {
      for (const erro of validarSenhaAdministrativa(senha, contexto)) {
        assert.ok(!(erro.message ?? '').includes(SENTINELA.slice(0, 10)), `a mensagem '${erro.code}' carregou a senha`);
      }
    }
  });
});
