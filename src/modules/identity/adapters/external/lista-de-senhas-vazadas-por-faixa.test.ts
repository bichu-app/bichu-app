/**
 * A consulta de faixa, com a rede substituida: o que se prova aqui e o que sai
 * da maquina (so o prefixo de 5) e o que a resposta vira.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  criarListaDeSenhasVazadasPorFaixa,
  ENDERECO_DA_FAIXA,
  sufixoPresente,
  type Buscar,
} from './lista-de-senhas-vazadas-por-faixa.js';

const SENHA = 'SENTINELA-faixa-3c9e';
const HASH = createHash('sha1').update(SENHA, 'utf8').digest('hex').toUpperCase();
const PREFIXO = HASH.slice(0, 5);
const SUFIXO = HASH.slice(5);
const OUTRO = 'F'.repeat(35);

function buscaQueResponde(corpo: string, status = 200) {
  const pedidos: { url: string; init: RequestInit | undefined }[] = [];
  const buscar: Buscar = (url, init) => {
    pedidos.push({ url: url instanceof Request ? url.url : url.toString(), init });
    return Promise.resolve(new Response(corpo, { status }));
  };
  return { buscar, pedidos };
}

void describe('lista de senhas vazadas por faixa', () => {
  void it('isca: so o prefixo de 5 caracteres do SHA-1 sai da maquina, com preenchimento', async () => {
    const { buscar, pedidos } = buscaQueResponde(`${OUTRO}:3\r\n`);
    await criarListaDeSenhasVazadasPorFaixa(buscar).contem(SENHA);

    assert.equal(pedidos.length, 1);
    const pedido = pedidos[0];
    assert.ok(pedido !== undefined);
    assert.equal(pedido.url, `${ENDERECO_DA_FAIXA}${PREFIXO}`);
    const serializado = JSON.stringify(pedido);
    assert.ok(!serializado.includes(SENHA), 'a senha saiu da maquina');
    assert.ok(!serializado.includes(SUFIXO), 'o hash inteiro saiu da maquina');
    assert.deepEqual((pedido.init?.headers as Record<string, string>)['Add-Padding'], 'true');
  });

  void it('sufixo presente com contagem positiva: vazada', async () => {
    const { buscar } = buscaQueResponde(`${OUTRO}:3\r\n${SUFIXO}:12\r\n`);
    assert.equal(await criarListaDeSenhasVazadasPorFaixa(buscar).contem(SENHA), true);
  });

  void it('sufixo de preenchimento (contagem zero) nao conta', async () => {
    const { buscar } = buscaQueResponde(`${OUTRO}:3\r\n${SUFIXO}:0\r\n`);
    assert.equal(await criarListaDeSenhasVazadasPorFaixa(buscar).contem(SENHA), false);
  });

  void it('isca: falha de rede, status ruim ou corpo estranho viram desconhecido, nunca limpa', async () => {
    const quebrada: Buscar = () => Promise.reject(new Error('sem rede'));
    assert.equal(await criarListaDeSenhasVazadasPorFaixa(quebrada).contem(SENHA), 'desconhecido');
    assert.equal(
      await criarListaDeSenhasVazadasPorFaixa(buscaQueResponde('', 503).buscar).contem(SENHA),
      'desconhecido',
    );
    assert.equal(
      await criarListaDeSenhasVazadasPorFaixa(buscaQueResponde('<html>portal cativo</html>').buscar).contem(SENHA),
      'desconhecido',
    );
  });

  void it('sufixoPresente compara sem caixa e ignora linha malformada', () => {
    assert.equal(sufixoPresente(`lixo\n${SUFIXO.toLowerCase()}:2`, SUFIXO), true);
    assert.equal(sufixoPresente('', SUFIXO), false);
  });
});
