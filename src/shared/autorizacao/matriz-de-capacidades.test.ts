import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Instant } from '../types/brands.js';
import {
  CAPACIDADES_NO_PRAZO_DO_TELEFONE,
  NIVEIS_POR_EXIGENCIA,
  NIVEL_EXIGIDO,
  NO_PRAZO_DO_TELEFONE,
  PRAZO_DO_TELEFONE_EM_DIAS,
  PRAZO_DO_TELEFONE_LIGADO,
  TELEFONE_SEM_VALIDACAO_POSSIVEL,
  nivelCumpre,
  nivelDaConta,
  nivelDoCanalConfirmado,
  recusaDaCapacidade,
  recusaPorNivel,
  recusaPorPrazoDoTelefone,
  telefoneForaDoPrazo,
  type Capacidade,
  type NivelDeVerificacao,
} from './matriz-de-capacidades.js';
import { comoData } from '../time/clock.js';

/** Todas as capacidades, a partir da PROPRIA matriz. */
const TODAS = Object.keys(NIVEL_EXIGIDO) as Capacidade[];

const AGORA = Date.UTC(2026, 10, 2, 12, 0, 0) as Instant;

function conta(nivel: NivelDeVerificacao) {
  return { nivel, telefone: TELEFONE_SEM_VALIDACAO_POSSIVEL } as const;
}

/** O nivel imediatamente abaixo, ou `undefined` quando ja e o mais baixo. */
function umDegrauAbaixo(nivel: NivelDeVerificacao): NivelDeVerificacao | undefined {
  const i = NIVEIS_POR_EXIGENCIA.indexOf(nivel);
  return i <= 0 ? undefined : NIVEIS_POR_EXIGENCIA[i - 1];
}

void describe('a matriz de capacidades (cliente, 02/11/2026)', () => {
  void it('ISCA: a varredura enxerga capacidades -- lista vazia nao mede nada', () => {
    assert.ok(TODAS.length > 0, 'a matriz esta vazia: todos os casos abaixo passariam vacuos');
    assert.equal(TODAS.length, Object.keys(NO_PRAZO_DO_TELEFONE).length);
  });

  void it('a tabela do cliente esta no codigo, nivel por nivel', () => {
    assert.deepEqual(NIVEL_EXIGIDO, {
      cadastrar_achado: 'nao_verificado',
      mensagem_ao_tutor_do_achado: 'nao_verificado',
      ver_a_loja: 'nao_verificado',
      pedir_conexao: 'nao_verificado',
      cadastrar_evento: 'canal_verificado',
      recomendar_profissional: 'canal_verificado',
    });
  });

  void it('a regra dos 15 dias alcanca as DUAS que o cliente nomeou, e so elas', () => {
    assert.deepEqual([...CAPACIDADES_NO_PRAZO_DO_TELEFONE].sort(), [
      'cadastrar_evento',
      'pedir_conexao',
    ]);
  });

  /**
   * **O CASO DE RECUSA, UMA CAPACIDADE POR VEZ, EXAUSTIVO SOBRE A MATRIZ.**
   *
   * A lista vem de `NIVEL_EXIGIDO`, entao capacidade nova entra aqui sozinha e
   * precisa provar a sua recusa -- nao ha como acrescentar uma e esquecer o caso.
   *
   * Para a capacidade que exige mais que o piso, recusa e recusa: a conta um
   * degrau abaixo e barrada. Para a que exige o piso, **a decisao do cliente E
   * que nao ha recusa** (*"nao verificado: cadastrar pet que encontrou, enviar
   * mensagem ao tutor, ver a Loja"*), e o que precisa ser provado e o oposto: a
   * conta sem evidencia NENHUMA passa. Provar recusa onde o cliente decidiu que
   * nao ha seria inventar uma trava que ele nao pediu.
   */
  for (const capacidade of TODAS) {
    const exigido = NIVEL_EXIGIDO[capacidade];
    const abaixo = umDegrauAbaixo(exigido);

    if (abaixo === undefined) {
      void it(`${capacidade}: conta SEM evidencia nenhuma passa -- e a decisao do cliente`, () => {
        assert.equal(recusaDaCapacidade(capacidade, conta('nao_verificado'), AGORA), null);
      });
      continue;
    }

    void it(`${capacidade}: conta em \`${abaixo}\` e RECUSADA por nivel`, () => {
      assert.equal(
        recusaDaCapacidade(capacidade, conta(abaixo), AGORA),
        'nivel_insuficiente',
        `${capacidade} exige ${exigido} e deixou passar uma conta em ${abaixo}`,
      );
    });

    void it(`${capacidade}: conta em \`${exigido}\` passa`, () => {
      assert.equal(recusaDaCapacidade(capacidade, conta(exigido), AGORA), null);
    });
  }

  void it('capacidade que exige o piso nao e recusada por nivel em nivel nenhum', () => {
    for (const capacidade of TODAS) {
      if (NIVEL_EXIGIDO[capacidade] !== 'nao_verificado') continue;
      for (const nivel of NIVEIS_POR_EXIGENCIA) {
        assert.notEqual(
          recusaDaCapacidade(capacidade, conta(nivel), AGORA),
          'nivel_insuficiente',
          `${capacidade} recusou ${nivel} por nivel, e ela exige o piso`,
        );
      }
    }
  });
});

void describe('a REGRA DOS 15 DIAS -- inerte hoje, e provada recusando', () => {
  void it('o interruptor esta DESLIGADO em 02/11/2026, e isso e medido e nao suposto', () => {
    assert.equal(
      PRAZO_DO_TELEFONE_LIGADO,
      false,
      'o interruptor do prazo do telefone foi LIGADO. Nenhum usuario deste produto tem como ' +
        'validar telefone (nada escreve `users.phone_verified_at`, nao ha provedor de SMS em ' +
        '`src/` e nao ha operacao no contrato), entao ligar isto bloqueia a BASE INTEIRA em ' +
        '`cadastrar_evento` e `pedir_conexao`. Se a validacao de telefone entrou, troque este ' +
        'caso junto com o interruptor -- e conscientemente.',
    );
  });

  void it('o prazo sao 15 dias', () => {
    assert.equal(PRAZO_DO_TELEFONE_EM_DIAS, 15);
  });

  void it('`TELEFONE_SEM_VALIDACAO_POSSIVEL` nunca esta fora do prazo, nem em 10 anos', () => {
    const daquiA10Anos = (Number(AGORA) + 3650 * 24 * 60 * 60 * 1000) as Instant;
    assert.equal(telefoneForaDoPrazo(TELEFONE_SEM_VALIDACAO_POSSIVEL, daquiA10Anos), false);
  });

  void it('no dia 15 ainda esta dentro; no dia 16 esta fora', () => {
    const comecou = Date.UTC(2026, 10, 2) as Instant;
    const dia = 24 * 60 * 60 * 1000;
    const estado = { validadoEm: null, prazoComecouEm: comecou } as const;
    const mais = (ms: number): Instant => (Number(comecou) + ms) as Instant;
    assert.equal(
      telefoneForaDoPrazo(estado, mais(15 * dia - 1)),
      false,
      'o prazo venceu antes de os 15 dias fecharem',
    );
    assert.equal(telefoneForaDoPrazo(estado, mais(15 * dia)), true);
    assert.equal(telefoneForaDoPrazo(estado, mais(16 * dia)), true);
  });

  void it('telefone VALIDADO nunca esta fora do prazo', () => {
    const comecou = Date.UTC(2026, 10, 2) as Instant;
    assert.equal(
      telefoneForaDoPrazo(
        { validadoEm: Date.UTC(2026, 10, 3) as Instant, prazoComecouEm: comecou },
        Date.UTC(2030, 0, 1) as Instant,
      ),
      false,
    );
  });

  /**
   * **A RECUSA DO PRAZO, PROVADA DE VERDADE** -- com o interruptor passado por
   * parametro, que e a razao de ele ser parametro. A regra que so existe no dia
   * em que e ligada e a regra que nunca foi medida.
   */
  for (const capacidade of CAPACIDADES_NO_PRAZO_DO_TELEFONE) {
    void it(`${capacidade}: com o interruptor LIGADO e o prazo vencido, RECUSA`, () => {
      const vencido = {
        validadoEm: null,
        prazoComecouEm: Date.UTC(2026, 9, 1) as Instant,
      } as const;
      assert.equal(
        recusaDaCapacidade(
          capacidade,
          { nivel: 'canal_verificado', telefone: vencido },
          AGORA,
          true,
        ),
        'telefone_nao_validado_no_prazo',
      );
    });

    void it(`${capacidade}: com o interruptor DESLIGADO, o mesmo estado PASSA`, () => {
      const vencido = {
        validadoEm: null,
        prazoComecouEm: Date.UTC(2026, 9, 1) as Instant,
      } as const;
      assert.equal(
        recusaDaCapacidade(
          capacidade,
          { nivel: 'canal_verificado', telefone: vencido },
          AGORA,
          false,
        ),
        null,
      );
    });
  }

  void it('capacidade FORA do prazo nao e recusada por prazo, nem com o interruptor ligado', () => {
    const vencido = {
      validadoEm: null,
      prazoComecouEm: Date.UTC(2026, 9, 1) as Instant,
    } as const;
    for (const capacidade of TODAS) {
      if (NO_PRAZO_DO_TELEFONE[capacidade]) continue;
      assert.equal(
        recusaPorPrazoDoTelefone(capacidade, vencido, AGORA, true),
        null,
        `${capacidade} nao esta na regra dos 15 dias e foi recusada por ela`,
      );
    }
  });
});

void describe('`recusaPorNivel` recusa em voz alta em vez de aprovar em silencio', () => {
  void it('LANCA para capacidade que esta na regra dos 15 dias', () => {
    for (const capacidade of CAPACIDADES_NO_PRAZO_DO_TELEFONE) {
      assert.throws(
        () => recusaPorNivel(capacidade, 'canal_verificado'),
        /regra dos 15 dias/,
        `${capacidade} passou por \`recusaPorNivel\` sem o prazo ser aplicado nem acusado`,
      );
    }
  });

  void it('decide igual a `recusaDaCapacidade` para quem esta fora do prazo', () => {
    for (const capacidade of TODAS) {
      if (NO_PRAZO_DO_TELEFONE[capacidade]) continue;
      for (const nivel of NIVEIS_POR_EXIGENCIA) {
        assert.equal(
          recusaPorNivel(capacidade, nivel),
          recusaDaCapacidade(capacidade, conta(nivel), AGORA),
          `${capacidade} em ${nivel}: as duas portas da matriz discordaram`,
        );
      }
    }
  });
});

void describe('o nivel e DERIVADO, nunca gravado', () => {
  void it('`nivelDaConta` sai dos instantes, pela regua de `canal-de-contato-confirmado`', () => {
    const data = comoData(Date.UTC(2026, 9, 1) as Instant);
    assert.equal(nivelDaConta({ emailVerifiedAt: null, phoneVerifiedAt: null }), 'nao_verificado');
    assert.equal(
      nivelDaConta({ emailVerifiedAt: data, phoneVerifiedAt: null }),
      'canal_verificado',
      'e-mail confirmado e a unica porta de hoje, e ela nao abriu',
    );
    assert.equal(
      nivelDaConta({ emailVerifiedAt: null, phoneVerifiedAt: data }),
      'canal_verificado',
      'a regua e e-mail OU telefone (emenda do ADR-0010, 21/10/2026), e nao so e-mail',
    );
  });

  void it('`nivelDoCanalConfirmado` e a MESMA traducao, para quem derivou em SQL', () => {
    assert.equal(nivelDoCanalConfirmado(true), 'canal_verificado');
    assert.equal(nivelDoCanalConfirmado(false), 'nao_verificado');
    const data = comoData(0 as Instant);
    assert.equal(
      nivelDoCanalConfirmado(true),
      nivelDaConta({ emailVerifiedAt: data, phoneVerifiedAt: null }),
      'as duas portas de derivacao divergiram',
    );
  });

  void it('`nivelCumpre` e ordem e nao igualdade: nivel ACIMA do exigido cumpre', () => {
    assert.ok(nivelCumpre('canal_verificado', 'nao_verificado'));
    assert.ok(nivelCumpre('nao_verificado', 'nao_verificado'));
    assert.ok(!nivelCumpre('nao_verificado', 'canal_verificado'));
  });
});
