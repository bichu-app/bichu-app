/**
 * O leitor de senha do terminal, contra um terminal de mentira: o que importa
 * aqui e o que ele faz com os bytes, e isso nao precisa de pty.
 *
 * A prova com terminal de verdade (pty, eco desligado, sentinela ausente da
 * saida capturada) esta registrada na entrega da BICHUS-260.
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';

import {
  BYTES_MAXIMOS_DA_SENHA,
  exigirTerminal,
  LeituraInterrompida,
  lerLinhaComEco,
  lerSenhaSemEco,
  SemTerminal,
  type EntradaDeTerminal,
} from './ler-senha-sem-eco.js';

class TerminalFalso extends EventEmitter implements EntradaDeTerminal {
  isTTY: boolean | undefined = true;
  modos: boolean[] = [];
  pausado = true;
  setRawMode = (modo: boolean): void => {
    this.modos.push(modo);
  };
  resume(): void {
    this.pausado = false;
  }
  pause(): void {
    this.pausado = true;
  }
  digitar(...pedacos: Buffer[]): void {
    for (const pedaco of pedacos) this.emit('data', pedaco);
  }
}

function saidaCapturada() {
  const escrito: string[] = [];
  return { escrito, saida: { write: (texto: string) => escrito.push(texto) } };
}

void describe('lerSenhaSemEco', () => {
  void it('isca: sem terminal recusa antes de perguntar', () => {
    const entrada = new TerminalFalso();
    entrada.isTTY = undefined;
    assert.throws(() => exigirTerminal(entrada), SemTerminal);
    const { escrito, saida } = saidaCapturada();
    assert.throws(() => lerSenhaSemEco(entrada, saida, 'Senha: '), SemTerminal);
    assert.deepEqual(escrito, [], 'perguntou sem terminal');
  });

  void it('le ate o Enter, em modo cru, e nao escreve nada do que foi digitado', async () => {
    const entrada = new TerminalFalso();
    const { escrito, saida } = saidaCapturada();
    const lida = lerSenhaSemEco(entrada, saida, 'Senha: ');
    const pedaco = Buffer.from('girassol de mar\r');
    entrada.digitar(pedaco);
    const { bytes, excedeu } = await lida;

    assert.equal(bytes.toString('utf8'), 'girassol de mar');
    assert.equal(excedeu, false);
    assert.deepEqual(entrada.modos, [true, false], 'o modo cru nao foi ligado e desligado');
    assert.equal(entrada.pausado, true);
    assert.deepEqual(escrito, ['Senha: ', '\n']);
    assert.ok(pedaco.every((b) => b === 0), 'o pedaco entregue pelo terminal nao foi zerado');
  });

  void it('isca: o modo cru liga ANTES do rotulo, senao o que se digita logo depois dele ecoa', async () => {
    // Medido num pty de verdade em 23/09: com o rotulo escrito antes do modo
    // cru, a resposta que chegou junto com o rotulo (colar, digitar adiantado)
    // passou pelo eco do terminal, e a segunda senha apareceu na saida.
    const entrada = new TerminalFalso();
    const ordem: string[] = [];
    entrada.setRawMode = (modo: boolean): void => {
      ordem.push(`cru:${String(modo)}`);
    };
    const saida = { write: (texto: string) => ordem.push(`escreve:${texto}`) };
    const lida = lerSenhaSemEco(entrada, saida, 'Senha: ');
    entrada.digitar(Buffer.from('x\r'));
    await lida;
    assert.deepEqual(ordem.slice(0, 2), ['cru:true', 'escreve:Senha: ']);
  });

  void it('apagar recua um caractere UTF-8 inteiro', async () => {
    const entrada = new TerminalFalso();
    const lida = lerSenhaSemEco(entrada, saidaCapturada().saida, '');
    entrada.digitar(Buffer.from('abç'), Buffer.from([0x7f]), Buffer.from('d\n'));
    assert.equal((await lida).bytes.toString('utf8'), 'abd');
  });

  void it('descarta sequencia de escape e controle', async () => {
    const entrada = new TerminalFalso();
    const lida = lerSenhaSemEco(entrada, saidaCapturada().saida, '');
    entrada.digitar(Buffer.from('a\u001b[Db\u0001c\r'));
    assert.equal((await lida).bytes.toString('utf8'), 'abc');
  });

  void it('Ctrl-C interrompe, e o modo cru e desligado', async () => {
    const entrada = new TerminalFalso();
    const lida = lerSenhaSemEco(entrada, saidaCapturada().saida, '');
    entrada.digitar(Buffer.from('abc'), Buffer.from([0x03]));
    await assert.rejects(lida, LeituraInterrompida);
    assert.deepEqual(entrada.modos, [true, false]);
  });

  void it('acima do teto marca excedeu e continua ate o Enter', async () => {
    const entrada = new TerminalFalso();
    const lida = lerSenhaSemEco(entrada, saidaCapturada().saida, '');
    entrada.digitar(Buffer.alloc(BYTES_MAXIMOS_DA_SENHA + 10, 0x61), Buffer.from('\r'));
    const { bytes, excedeu } = await lida;
    assert.equal(excedeu, true);
    assert.equal(bytes.length, BYTES_MAXIMOS_DA_SENHA);
  });
});

void describe('lerLinhaComEco', () => {
  void it('devolve a linha sem o Enter e sem espacos nas pontas', async () => {
    const entrada = new TerminalFalso();
    const lida = lerLinhaComEco(entrada, saidaCapturada().saida, 'Nome: ');
    entrada.digitar(Buffer.from('  Leandro '), Buffer.from('P.\n'));
    assert.equal(await lida, 'Leandro P.');
    assert.deepEqual(entrada.modos, [], 'a linha com eco nao muda o modo do terminal');
  });

  void it('sem terminal recusa', () => {
    const entrada = new TerminalFalso();
    entrada.isTTY = false;
    assert.throws(() => lerLinhaComEco(entrada, saidaCapturada().saida, ''), SemTerminal);
  });
});
