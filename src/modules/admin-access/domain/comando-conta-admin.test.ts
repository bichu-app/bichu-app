import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  SAIDA,
  interpretarArgumentos,
  validarNome,
  validarNomeDoOperador,
  validarSenhaAdministrativa,
} from './comando-conta-admin.js';

const SENTINELA = 'SENTINELA-dominio-7c1f';

function recusa(argumentos: string[]): { codigo: number; mensagem: string } {
  const r = interpretarArgumentos(argumentos);
  assert.equal(r.tipo, 'recusa', JSON.stringify(r));
  return r.tipo === 'recusa' ? { codigo: r.codigo, mensagem: r.mensagem } : { codigo: -1, mensagem: '' };
}

void describe('conta-admin: argumentos', () => {
  void it('os seis subcomandos existem, e so eles', () => {
    for (const sub of ['redefinir-senha', 'desativar', 'reativar', 'encerrar-sessoes']) {
      const r = interpretarArgumentos([sub, '--email', 'Operacao@Exemplo.com.br']);
      assert.equal(r.tipo, 'pedido', sub);
      if (r.tipo === 'pedido' && r.pedido.subcomando !== 'listar') {
        assert.equal(r.pedido.subcomando, sub);
        assert.equal(r.pedido.email, 'operacao@exemplo.com.br', 'o e-mail sai normalizado');
      }
    }
    const criar = interpretarArgumentos(['criar', '--email', 'a@exemplo.com.br', '--nome', ' Operacao ']);
    assert.ok(criar.tipo === 'pedido' && criar.pedido.subcomando === 'criar' && criar.pedido.nome === 'Operacao');
    assert.deepEqual(interpretarArgumentos(['listar']), { tipo: 'pedido', pedido: { subcomando: 'listar' } });
    assert.equal(recusa(['conceder', '--email', 'a@exemplo.com.br']).codigo, SAIDA.USO);
    assert.equal(recusa([]).codigo, SAIDA.USO);
  });

  void it('ISCA: senha por opcao e recusada pelo NOME, em qualquer forma, sem repetir o valor', () => {
    for (const argumentos of [
      ['criar', '--email', 'a@exemplo.com.br', '--nome', 'Op', '--senha', SENTINELA],
      ['redefinir-senha', '--email', 'a@exemplo.com.br', `--password=${SENTINELA}`],
      ['reativar', '-p', SENTINELA, '--email', 'a@exemplo.com.br'],
      ['criar', `--SENHA=${SENTINELA}`],
      ['--nova-senha', SENTINELA],
    ]) {
      const { codigo, mensagem } = recusa(argumentos);
      assert.equal(codigo, SAIDA.USO);
      assert.match(mensagem, /senha nao e aceita por argumento/);
      assert.ok(!mensagem.includes(SENTINELA), 'a recusa repetiu a senha');
    }
  });

  void it('ISCA: valor posicional ou subcomando desconhecido nao aparecem na mensagem', () => {
    assert.ok(!recusa([SENTINELA]).mensagem.includes(SENTINELA));
    assert.ok(!recusa(['desativar', '--email', 'a@exemplo.com.br', SENTINELA]).mensagem.includes(SENTINELA));
  });

  void it('criar exige --nome; --nome fora do criar e recusado; listar nao recebe opcao', () => {
    assert.match(recusa(['criar', '--email', 'a@exemplo.com.br']).mensagem, /criar exige --nome/);
    assert.match(recusa(['desativar', '--email', 'a@exemplo.com.br', '--nome', 'X Y']).mensagem, /so vale para criar/);
    assert.match(recusa(['listar', '--email', 'a@exemplo.com.br']).mensagem, /listar nao recebe opcao/);
    assert.match(recusa(['desativar']).mensagem, /--email e obrigatorio/);
    assert.match(recusa(['desativar', '--email', 'sem-arroba']).mensagem, /forma de e-mail/);
    assert.match(recusa(['desativar', '--email', 'a@exemplo.com.br', '--email', 'b@exemplo.com.br']).mensagem, /repetida/);
  });

  void it('operador e nome sem caractere de controle, e nos tamanhos da tabela', () => {
    assert.equal(validarNomeDoOperador('Leandro'), undefined);
    assert.match(validarNomeDoOperador('\u001b[2J') ?? '', /controle/);
    assert.match(validarNomeDoOperador('   ') ?? '', /vazio/);
    assert.equal(validarNome('Op'), undefined);
    assert.match(validarNome('X') ?? '', /de 2 a 60/);
    assert.match(validarNome('a'.repeat(61)) ?? '', /de 2 a 60/);
  });
});

void describe('conta-admin: politica da senha (D43)', () => {
  const email = 'operacao@exemplo.com.br';

  void it('14 caracteres recusados; 15 aceitos', () => {
    const curta = validarSenhaAdministrativa('abcdefghijklmn', { email });
    assert.ok(curta.some((e) => e.code === 'too_short'));
    assert.deepEqual(validarSenhaAdministrativa('abcdefghijklmno', { email }), []);
  });

  void it('acima de 256 recusada; so espacos recusada', () => {
    assert.ok(validarSenhaAdministrativa('a'.repeat(257), { email }).some((e) => e.code === 'too_long'));
    assert.ok(validarSenhaAdministrativa(' '.repeat(20), { email }).some((e) => e.code === 'blank'));
  });

  void it('nenhuma mensagem de recusa cita a senha', () => {
    const erros = validarSenhaAdministrativa(`${SENTINELA}`.slice(0, 14), { email });
    assert.ok(!JSON.stringify(erros).includes(SENTINELA.slice(0, 14)));
  });
});
