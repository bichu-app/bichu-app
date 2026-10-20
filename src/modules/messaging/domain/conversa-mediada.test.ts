/**
 * A mediação, como regra.
 *
 * O caso mais importante deste arquivo é o último: **nenhum campo do
 * participante carrega telefone, e-mail, endereço ou identificador de conta.**
 * Ele é escrito como varredura do objeto inteiro, e não como "confira que não
 * tem `phone`", porque a forma fraca aprova o campo que alguém acrescentar
 * amanhã com outro nome — e o dia em que alguém acrescenta é exatamente o dia
 * em que o teste precisava acusar.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { comoData } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';
import {
  aceitaMensagem,
  estadoDaConversa,
  participantesVisiveis,
  primeiroNomeOuApelido,
} from './conversa-mediada.js';

const ABERTA = {
  encerradaEm: null,
  bloqueadaEm: null,
  casoEncerrado: false,
  participanteDesabilitado: false,
};
const UM_INSTANTE = comoData(Date.parse('2026-09-22T12:00:00.000Z') as Instant);

void describe('o estado sai de três sinais, e não de uma coluna `status`', () => {
  void it('sem encerramento e sem bloqueio, ela está aberta', () => {
    assert.equal(estadoDaConversa(ABERTA), 'open');
    assert.ok(aceitaMensagem('open'));
  });

  void it('o caso encerrado fecha a conversa, mesmo sem `closed_at` próprio', () => {
    // Critério 8: caso encerrado, conversa em modo leitura. É este caso que
    // dispensa o `lostfound` de escrever na tabela de conversa ao fechar — e
    // com isso dispensa os dois de concordarem sobre quem atualiza o quê.
    assert.equal(estadoDaConversa({ ...ABERTA, casoEncerrado: true }), 'closed');
    assert.ok(!aceitaMensagem('closed'));
  });

  void it('o bloqueio fecha para escrita, e a conversa continua legível', () => {
    assert.equal(estadoDaConversa({ ...ABERTA, bloqueadaEm: UM_INSTANTE }), 'blocked');
    assert.ok(!aceitaMensagem('blocked'));
  });

  void it('encerrada E bloqueada responde `closed`', () => {
    // A ordem não é arbitrária: o encerramento carrega a explicação que a
    // pessoa precisa ler, e o bloqueio já obteve o que existe para obter.
    assert.equal(
      estadoDaConversa({ ...ABERTA, encerradaEm: UM_INSTANTE, bloqueadaEm: UM_INSTANTE, casoEncerrado: true }),
      'closed',
    );
  });
});

void describe('o nome de exibição é o primeiro termo, nunca o sobrenome', () => {
  void it('nome inteiro vira primeiro nome', () => {
    assert.equal(primeiroNomeOuApelido('Leandro Panegassi', 'Tutor'), 'Leandro');
  });

  void it('apelido de uma palavra sobrevive inteiro', () => {
    assert.equal(primeiroNomeOuApelido('Léo', 'Tutor'), 'Léo');
  });

  void it('nome composto entrega só o primeiro termo', () => {
    // "Maria Clara Souza" com bairro na mesma tela é identificação por outro
    // caminho. O contrato promete "nunca sobrenome completo", e a promessa não
    // pode depender de o sobrenome estar no segundo campo.
    assert.equal(primeiroNomeOuApelido('Maria Clara Souza', 'Tutor'), 'Maria');
  });

  void it('vazio, espaços e nulo caem no rótulo neutro', () => {
    for (const entrada of [null, '', '   ']) {
      assert.equal(primeiroNomeOuApelido(entrada, 'Quem achou'), 'Quem achou');
    }
  });

  void it('nome absurdamente longo é cortado', () => {
    assert.equal(primeiroNomeOuApelido('A'.repeat(200), 'Tutor').length, 40);
  });
});

/**
 * A bancada de quem **não é conexão aceita**, que é o estado normal da conversa
 * de achado: os dois campos da emenda 3 chegam nulos, como a consulta os
 * entrega a quem não tem aresta `accepted` com o outro lado.
 */
const SEM_CONEXAO = {
  nomeDoTutor: 'Leandro Panegassi',
  nomeDoAchador: 'Ana Paula Ribeiro',
  tutorDesabilitado: false,
  achadorDesabilitado: false,
  papelDoChamador: 'tutor',
  apelidoDoOutro: null,
  chaveDaFotoDoOutro: null,
} as const;

/** A lista FECHADA de campos de um participante. Um quinto reprova. */
const CHAVES_DO_PARTICIPANTE = ['displayName', 'handle', 'photoKey', 'role'];

void describe('o participante que sai não permite deduzir nada do outro lado', () => {
  void it('cada participante tem exatamente QUATRO campos, e a lista é fechada', () => {
    // Eram dois (papel e nome) até 19/10/2026; a emenda 3 do ADR-0010
    // acrescentou `handle` e `photoKey`, e **os dois só valem para conexão
    // aceita**. A lista continua fechada: um quinto campo reprova aqui, e
    // trocar este literal continua custando uma decisão com nome no diff.
    const participantes = participantesVisiveis(SEM_CONEXAO);
    for (const p of participantes) {
      assert.deepEqual(
        Object.keys(p).sort(),
        CHAVES_DO_PARTICIPANTE,
        `participante com campo a mais: ${JSON.stringify(p)}`,
      );
    }
  });

  void it('ISCA (a) — sem conexão aceita, NEM FOTO NEM APELIDO saem, nos dois lados', () => {
    // **A isca central da emenda 3**: *"a foto aparece SÓ quando as duas
    // pessoas já aceitaram conexão"*. Este caso mede o estado em que ela NÃO
    // aparece, que é o da conversa de achado com um estranho -- e o estranho é
    // exatamente quem o golpe do falso achador usa.
    //
    // Mede os DOIS itens e não só o do outro lado: um defeito que preenchesse
    // o item errado passaria por uma conferência que olhasse um item só.
    for (const p of participantesVisiveis(SEM_CONEXAO)) {
      assert.equal(p.handle, null, `apelido vazou em ${p.role}`);
      assert.equal(p.photoKey, null, `foto vazou em ${p.role}`);
    }
  });

  void it('ISCA (c) — com conexão aceita a foto sai, e SÓ no OUTRO lado', () => {
    // O CONTRAPESO da isca acima: sem ele, todos os casos de nulo passariam num
    // mundo em que a foto nunca sai de lugar nenhum -- que é a forma mais fácil
    // de um teste de omissão ficar verde sem ter medido nada.
    //
    // E mede a metade que ninguém lembra: o lado de QUEM CHAMA não recebe foto
    // nem apelido. A própria foto do dono já sai em `getMe`, e repeti-la aqui
    // seria uma terceira superfície dela sem consumidor.
    const participantes = participantesVisiveis({
      ...SEM_CONEXAO,
      papelDoChamador: 'tutor',
      apelidoDoOutro: 'ana-paula',
      chaveDaFotoDoOutro: 'thumb/ab12.jpg',
    });
    const outro = participantes.find((p) => p.role === 'finder');
    const euMesmo = participantes.find((p) => p.role === 'tutor');
    assert.equal(outro?.handle, 'ana-paula');
    assert.equal(outro?.photoKey, 'thumb/ab12.jpg');
    assert.equal(euMesmo?.handle, null, 'o próprio lado não recebe apelido');
    assert.equal(euMesmo?.photoKey, null, 'o próprio lado não recebe foto');
  });

  void it('ISCA (c) — nos DOIS SENTIDOS do par: o achador vê a foto do tutor', () => {
    // A conexão é simétrica, e quem pediu não decide quem vê. Sem este caso, um
    // defeito que atribuísse a foto sempre ao item `finder` passaria -- e o
    // sintoma seria a foto de uma pessoa desenhada como se fosse de outra.
    const participantes = participantesVisiveis({
      ...SEM_CONEXAO,
      papelDoChamador: 'finder',
      apelidoDoOutro: 'leandro-p',
      chaveDaFotoDoOutro: 'thumb/cd34.jpg',
    });
    const outro = participantes.find((p) => p.role === 'tutor');
    const euMesmo = participantes.find((p) => p.role === 'finder');
    assert.equal(outro?.handle, 'leandro-p');
    assert.equal(outro?.photoKey, 'thumb/cd34.jpg');
    assert.equal(euMesmo?.handle, null);
    assert.equal(euMesmo?.photoKey, null);
  });

  void it('ISCA — o objeto inteiro não casa com telefone, e-mail, endereço nem UUID', () => {
    // A varredura é sobre o JSON inteiro, e não sobre nomes de campo
    // esperados: um campo novo chamado `contato` ou `perfil` seria aprovado por
    // uma conferência que só procurasse `phone`.
    //
    // **Com a conexão ACEITA e os dois campos preenchidos**, de propósito: a
    // varredura tem de valer no estado em que mais dado sai, e não no estado
    // em que tudo é nulo. O apelido é alias escolhido e não carrega UUID, nem
    // `@`, nem dígito em sequência; a chave da derivada também não -- e se
    // alguém trocar `thumb_key` por um id de banco, este caso acusa.
    const serializado = JSON.stringify(
      participantesVisiveis({
        ...SEM_CONEXAO,
        apelidoDoOutro: 'ana-paula',
        chaveDaFotoDoOutro: 'thumb/ab12cd.jpg',
      }),
    );
    assert.doesNotMatch(serializado, /\d{8,}/, `sobrou sequência de dígitos: ${serializado}`);
    assert.doesNotMatch(serializado, /@/, `sobrou arroba: ${serializado}`);
    assert.doesNotMatch(
      serializado,
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      `sobrou UUID: ${serializado}`,
    );
    assert.doesNotMatch(
      serializado,
      /Panegassi|Ribeiro/,
      `o sobrenome atravessou: ${serializado}`,
    );
  });

  void it('duas conversas do mesmo tutor não entregam nada que as ligue', () => {
    // ADR-0010, item 7: nada que permita agrupar os pets de um mesmo tutor. Se
    // o participante carregasse um id estável, duas plaquinhas escaneadas por
    // duas pessoas diferentes passariam a ser reconhecíveis como do mesmo dono.
    // AS DUAS CONVERSAS SÃO DE QUEM NÃO É CONEXÃO, que é o caminho que o item 7
    // protege: o estranho que escaneou a plaquinha. Para ele o apelido é nulo,
    // e por isso duas plaquinhas escaneadas por duas pessoas diferentes
    // continuam sem nada que as ligue ao mesmo dono.
    const uma = participantesVisiveis({ ...SEM_CONEXAO, nomeDoTutor: 'Leandro P', nomeDoAchador: 'Ana' });
    const outra = participantesVisiveis({ ...SEM_CONEXAO, nomeDoTutor: 'Leandro P', nomeDoAchador: 'Bruno' });
    const tutorDeUma = uma.find((p) => p.role === 'tutor');
    const tutorDeOutra = outra.find((p) => p.role === 'tutor');
    assert.deepEqual(Object.keys(tutorDeUma ?? {}).sort(), CHAVES_DO_PARTICIPANTE);
    // O primeiro nome coincide, e é o que o contrato manda mostrar. O que não
    // pode existir é um valor único por tutor ao lado dele.
    assert.deepEqual(tutorDeUma, tutorDeOutra);
  });
});
