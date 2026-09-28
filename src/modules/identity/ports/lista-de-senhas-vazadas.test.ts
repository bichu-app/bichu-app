/**
 * A base de senhas vazadas de hoje nao existe, e a porta diz isso (D43).
 *
 * `desconhecido`, e nunca `false`: "limpa" e uma afirmacao que ninguem
 * conferiu. O login administrativo trata as duas respostas de jeitos
 * diferentes, e trocar uma pela outra aqui desligaria a regra em silencio no
 * dia em que a base entrar.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { listaDeSenhasVazadasIndisponivel } from './lista-de-senhas-vazadas.js';

void describe('lista de senhas vazadas indisponivel', () => {
  void it('responde desconhecido, e nunca que a senha esta limpa', async () => {
    assert.equal(await listaDeSenhasVazadasIndisponivel.contem('qualquer frase longa de teste'), 'desconhecido');
  });
});
