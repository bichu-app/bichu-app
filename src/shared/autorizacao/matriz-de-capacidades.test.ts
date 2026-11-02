import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Instant } from '../types/brands.js';
import { comoData } from '../time/clock.js';
import {
  CAPACIDADES_NO_PRAZO_DO_TELEFONE,
  EXIGENCIA_DECLARADA,
  EXIGENCIA_DE_CANAL,
  EXIGENCIA_DOS_DOIS_CANAIS_EM_VIGOR,
  NO_PRAZO_DO_TELEFONE,
  PRAZO_DO_TELEFONE_EM_DIAS,
  PRAZO_DO_TELEFONE_LIGADO,
  TELEFONE_SEM_VALIDACAO_POSSIVEL,
  recusaDaCapacidade,
  recusaPorExigenciaDeCanal,
  recusaPorPrazoDoTelefone,
  telefoneForaDoPrazo,
  type AsDuasEvidencias,
  type Capacidade,
  type EvidenciasDeCanal,
  type ExigenciaDeVerificacao,
} from './matriz-de-capacidades.js';

/** Todas as capacidades, a partir da PROPRIA matriz. */
const TODAS = Object.keys(EXIGENCIA_DE_CANAL) as Capacidade[];
const EXIGENCIAS = Object.keys(EXIGENCIA_DECLARADA) as ExigenciaDeVerificacao[];

const AGORA = Date.UTC(2026, 10, 2, 12, 0, 0) as Instant;
const DATA = comoData(Date.UTC(2026, 9, 1) as Instant);

/** As quatro combinacoes possiveis de evidencia, com nome. */
const SEM_NADA: AsDuasEvidencias = { emailVerifiedAt: null, phoneVerifiedAt: null };
const SO_EMAIL: AsDuasEvidencias = { emailVerifiedAt: DATA, phoneVerifiedAt: null };
const SO_TELEFONE: AsDuasEvidencias = { emailVerifiedAt: null, phoneVerifiedAt: DATA };
const OS_DOIS: AsDuasEvidencias = { emailVerifiedAt: DATA, phoneVerifiedAt: DATA };

/** **TODAS** as entradas que uma exigencia pode receber, as duas formas incluidas. */
const TODAS_AS_ENTRADAS: readonly { nome: string; canais: EvidenciasDeCanal }[] = [
  { nome: 'sem nada', canais: SEM_NADA },
  { nome: 'so e-mail', canais: SO_EMAIL },
  { nome: 'so telefone', canais: SO_TELEFONE },
  { nome: 'os dois', canais: OS_DOIS },
  { nome: 'so a disjuncao: false', canais: { canalConfirmado: false } },
  { nome: 'so a disjuncao: true', canais: { canalConfirmado: true } },
];

function conta(canais: EvidenciasDeCanal) {
  return { canais, telefone: TELEFONE_SEM_VALIDACAO_POSSIVEL } as const;
}

void describe('a matriz de capacidades (cliente, 02/11/2026)', () => {
  void it('ISCA: a varredura enxerga capacidades e exigencias -- listas vazias nao medem nada', () => {
    assert.ok(TODAS.length > 0, 'a matriz esta vazia: todos os casos abaixo passariam vacuos');
    assert.equal(TODAS.length, Object.keys(NO_PRAZO_DO_TELEFONE).length);
    assert.ok(EXIGENCIAS.length > 0);
  });

  void it('a tabela do cliente esta no codigo, capacidade por capacidade', () => {
    assert.deepEqual(EXIGENCIA_DE_CANAL, {
      cadastrar_achado: 'nenhuma',
      conversa_do_achado: 'nenhuma',
      conversa_entre_pessoas: 'qualquer_canal',
      bloquear_ou_denunciar_conversa: 'nenhuma',
      ver_a_loja: 'nenhuma',
      pedir_conexao: 'nenhuma',
      cadastrar_evento: 'qualquer_canal',
      recomendar_profissional: 'qualquer_canal',
      solicitar_plaquinha: 'os_dois_canais',
    });
  });

  void it('a regra dos 15 dias alcanca as DUAS que o cliente nomeou, e so elas', () => {
    assert.deepEqual([...CAPACIDADES_NO_PRAZO_DO_TELEFONE].sort(), [
      'cadastrar_evento',
      'pedir_conexao',
    ]);
  });

  /**
   * **A ASSIMETRIA ENTRE AS DUAS DIMENSOES, MEDIDA.**
   *
   * `solicitar_plaquinha` IMPEDE ENTRAR sem as duas evidencias; o prazo BLOQUEIA
   * quem ja esta dentro. Se alguem puser a plaquinha no prazo, a exigencia passaria
   * a valer so no dia 16 -- e nao e o que o cliente decidiu.
   */
  void it('`solicitar_plaquinha` NAO esta no prazo: ela impede entrar, nao bloqueia depois', () => {
    assert.equal(
      NO_PRAZO_DO_TELEFONE.solicitar_plaquinha,
      false,
      'a exigencia dos dois canais IMPEDE ENTRAR. Posta no prazo, ela passaria a valer so ' +
        'depois de 15 dias de conta -- as duas regras falam da mesma coluna e fazem coisas ' +
        'diferentes, e e por isso que os interruptores sao dois.',
    );
  });
});

void describe('a CONVERSA DO ACHADO e livre do inicio ao fim', () => {
  /**
   * A superficie do achador tem QUATRO operacoes, e nao uma. Se a verificacao
   * encostar em qualquer uma que nao seja a primeira mensagem, o achador manda a
   * primeira e nao consegue RESPONDER -- a conversa morre no primeiro turno, e e
   * ela que devolve o pet.
   */
  void it('conta sem evidencia NENHUMA nao e recusada, em entrada nenhuma', () => {
    for (const { nome, canais } of TODAS_AS_ENTRADAS) {
      assert.equal(
        recusaDaCapacidade('conversa_do_achado', conta(canais), AGORA),
        null,
        `a conversa do achado foi recusada com "${nome}". Ela e LIVRE DO INICIO AO FIM ` +
          '(cliente, 02/11/2026), e nao so o ato de iniciar: ler, responder, bloquear e ' +
          'denunciar sao quatro operacoes, e travar qualquer uma mata a conversa que ' +
          'devolve o pet. A superficie e por `finder_token` e alcanca quem NAO TEM CONTA.',
      );
    }
  });

  void it('`bloquear_ou_denunciar_conversa` e livre, e e capacidade declarada e nao ausencia', () => {
    assert.equal(
      EXIGENCIA_DE_CANAL.bloquear_ou_denunciar_conversa,
      'nenhuma',
      'defender-se passou a exigir verificacao. Bloquear e denunciar sao defesa de QUEM ' +
        'RECEBE: exigir verificacao para se defender deixa sem recurso exatamente a pessoa ' +
        'que esta sendo importunada, e quem importuna nao precisa de autorizacao nenhuma.',
    );
    for (const { canais } of TODAS_AS_ENTRADAS) {
      assert.equal(recusaDaCapacidade('bloquear_ou_denunciar_conversa', conta(canais), AGORA), null);
    }
  });

  void it('a conversa GERAL exige canal verificado -- e a unica das tres que exige', () => {
    assert.equal(
      recusaDaCapacidade('conversa_entre_pessoas', conta(SEM_NADA), AGORA),
      'canal_de_contato_nao_verificado',
    );
    assert.equal(recusaDaCapacidade('conversa_entre_pessoas', conta(SO_EMAIL), AGORA), null);
  });
});

void describe('o caso de recusa, uma capacidade por vez, EXAUSTIVO sobre a matriz', () => {
  /**
   * A lista vem de `EXIGENCIA_DE_CANAL`, entao capacidade nova entra aqui sozinha.
   *
   * Para a capacidade que exige evidencia, recusa e recusa: a conta que nao a tem
   * e barrada. Para a que exige `nenhuma`, **a decisao do cliente E que nao ha
   * recusa**, e o que precisa ser provado e o oposto: a conta sem evidencia
   * nenhuma passa. Provar recusa onde ele decidiu que nao ha seria inventar uma
   * trava que ele nao pediu.
   */
  for (const capacidade of TODAS) {
    const exigencia = EXIGENCIA_DE_CANAL[capacidade];

    if (exigencia === 'nenhuma') {
      void it(`${capacidade}: conta SEM evidencia nenhuma passa -- e a decisao do cliente`, () => {
        assert.equal(recusaDaCapacidade(capacidade, conta(SEM_NADA), AGORA), null);
      });
      continue;
    }

    if (exigencia === 'qualquer_canal') {
      void it(`${capacidade}: sem canal nenhum e RECUSADA; com e-mail OU telefone passa`, () => {
        assert.equal(
          recusaDaCapacidade(capacidade, conta(SEM_NADA), AGORA),
          'canal_de_contato_nao_verificado',
        );
        assert.equal(recusaDaCapacidade(capacidade, conta(SO_EMAIL), AGORA), null);
        assert.equal(
          recusaDaCapacidade(capacidade, conta(SO_TELEFONE), AGORA),
          null,
          'a regua e e-mail OU telefone (emenda do ADR-0010, 21/10/2026), e nao so e-mail',
        );
      });
      continue;
    }

    void it(`${capacidade}: com a exigencia EM VIGOR, so os DOIS canais passam`, () => {
      const ligada = { exigenciaDosDoisCanais: true };
      assert.equal(
        recusaDaCapacidade(capacidade, conta(SEM_NADA), AGORA, ligada),
        'os_dois_canais_nao_verificados',
      );
      assert.equal(
        recusaDaCapacidade(capacidade, conta(SO_EMAIL), AGORA, ligada),
        'os_dois_canais_nao_verificados',
        'e-mail sozinho cumpre `qualquer_canal` e NAO cumpre `os_dois_canais`: e outra ' +
          'pergunta, e nao um degrau acima',
      );
      assert.equal(
        recusaDaCapacidade(capacidade, conta(SO_TELEFONE), AGORA, ligada),
        'os_dois_canais_nao_verificados',
      );
      assert.equal(recusaDaCapacidade(capacidade, conta(OS_DOIS), AGORA, ligada), null);
    });
  }
});

void describe('A EXIGENCIA DOS DOIS CANAIS: em vigor = false, e o porque', () => {
  void it('o interruptor esta DESLIGADO em 02/11/2026, e e medido e nao suposto', () => {
    assert.equal(
      EXIGENCIA_DOS_DOIS_CANAIS_EM_VIGOR,
      false,
      'A EXIGENCIA DOS DOIS CANAIS FOI POSTA EM VIGOR. Leia antes de trocar este caso: ' +
        'nada neste repositorio escreve `users.phone_verified_at`, nao ha provedor de SMS ' +
        'em `src/` e nao ha operacao de validacao de telefone no contrato. Logo ' +
        '`phoneVerifiedAt` e `null` para TODA conta, e NINGUEM consegue pedir plaquinha -- ' +
        'nem quem validou o e-mail. A plaquinha e o produto FISICO que o cliente vende, e ' +
        '`requestCollarTag` e a porta da venda: isto NAO e inconveniencia, e parar a venda. ' +
        'Ao contrario do prazo dos 15 dias, aqui NAO ha segunda fechadura -- e justamente a ' +
        'ausencia do dado que faz a exigencia morder, e este booleano e a unica trava.',
    );
  });

  void it('DESLIGADA, a conta sem evidencia nenhuma pede plaquinha', () => {
    assert.equal(
      recusaDaCapacidade('solicitar_plaquinha', conta(SEM_NADA), AGORA),
      null,
      'com o interruptor desligado a exigencia nao morde, e e esse o estado de 02/11/2026',
    );
  });

  void it('a exigencia LANCA se receber so a disjuncao, em vez de decidir sobre o que nao mediu', () => {
    assert.throws(
      () =>
        recusaDaCapacidade(
          'solicitar_plaquinha',
          conta({ canalConfirmado: true }),
          AGORA,
          { exigenciaDosDoisCanais: true },
        ),
      /precisa das DUAS evidencias/,
      '`os_dois_canais` aceitou a disjuncao. `true` liberaria quem talvez nao cumprisse e ' +
        '`false` recusaria quem talvez cumprisse: as duas seriam decisao sobre dado que o ' +
        'ponto de chamada nao mediu.',
    );
  });

  void it('`qualquer_canal` aceita as DUAS formas de evidencia, e concorda consigo mesma', () => {
    assert.equal(
      recusaPorExigenciaDeCanal('conversa_entre_pessoas', { canalConfirmado: true }),
      recusaPorExigenciaDeCanal('conversa_entre_pessoas', SO_EMAIL),
      'a disjuncao derivada em SQL e a derivada das duas datas discordaram: sao duas reguas',
    );
    assert.equal(
      recusaPorExigenciaDeCanal('conversa_entre_pessoas', { canalConfirmado: false }),
      recusaPorExigenciaDeCanal('conversa_entre_pessoas', SEM_NADA),
    );
  });
});

void describe('o modelo NAO e uma escada, e isto e medido', () => {
  /**
   * A escada antiga decidia por `indexOf` numa lista. O caso abaixo mede a
   * propriedade que ela precisava e nao tinha escrita: `so_email` e `so_telefone`
   * sao **incomparaveis** -- nenhuma e maior --, e nenhuma ordem total as separa.
   */
  void it('`so e-mail` e `so telefone` sao incomparaveis: cumprem uma exigencia e nao a outra', () => {
    assert.equal(recusaPorExigenciaDeCanal('conversa_entre_pessoas', SO_EMAIL), null);
    assert.equal(recusaPorExigenciaDeCanal('conversa_entre_pessoas', SO_TELEFONE), null);
    const ligada = { exigenciaDosDoisCanais: true };
    assert.notEqual(
      recusaDaCapacidade('solicitar_plaquinha', conta(SO_EMAIL), AGORA, ligada),
      null,
    );
    assert.notEqual(
      recusaDaCapacidade('solicitar_plaquinha', conta(SO_TELEFONE), AGORA, ligada),
      null,
    );
  });

  void it('nenhuma exigencia depende de posicao em lista: cada uma tem predicado proprio', () => {
    for (const exigencia of EXIGENCIAS) {
      const declarada = EXIGENCIA_DECLARADA[exigencia];
      assert.equal(
        typeof declarada.recusa,
        'function',
        `a exigencia \`${exigencia}\` nao tem predicado: exigencia sem regra propria e o ` +
          'retorno da escada, em que acrescentar uma reinterpretava as outras',
      );
      assert.equal(typeof declarada.emVigor, 'function');
      assert.equal(typeof declarada.precisaDasDuasEvidencias, 'boolean');
    }
  });

  void it('`precisaDasDuasEvidencias` concorda com o que o predicado FAZ', () => {
    for (const exigencia of EXIGENCIAS) {
      const declarada = EXIGENCIA_DECLARADA[exigencia];
      const chamar = (): unknown => declarada.recusa({ canalConfirmado: true });
      if (declarada.precisaDasDuasEvidencias) {
        assert.throws(
          chamar,
          /precisa das DUAS evidencias/,
          `\`${exigencia}\` declara precisar das duas e ACEITOU a disjuncao`,
        );
      } else {
        assert.doesNotThrow(
          chamar,
          `\`${exigencia}\` declara NAO precisar das duas e recusou a disjuncao`,
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
        'validar telefone, entao ligar isto bloqueia a BASE INTEIRA em `cadastrar_evento` e ' +
        '`pedir_conexao`. Se a validacao de telefone entrou, troque este caso junto com o ' +
        'interruptor -- e conscientemente.',
    );
  });

  void it('os dois interruptores sao SEPARADOS: ligar um nao liga o outro', () => {
    const vencido = { validadoEm: null, prazoComecouEm: Date.UTC(2026, 9, 1) as Instant } as const;
    assert.equal(
      recusaDaCapacidade(
        'cadastrar_evento',
        { canais: SO_EMAIL, telefone: vencido },
        AGORA,
        { exigenciaDosDoisCanais: true },
      ),
      null,
      'ligar a exigencia dos dois canais ligou o PRAZO: os interruptores vazaram um no ' +
        'outro, e as duas regras falam da mesma coluna por motivos diferentes',
    );
    assert.equal(
      recusaDaCapacidade(
        'solicitar_plaquinha',
        { canais: SEM_NADA, telefone: vencido },
        AGORA,
        { prazoDoTelefone: true },
      ),
      null,
      'ligar o prazo ligou a EXIGENCIA dos dois canais: mesma fuga, no sentido contrario',
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
    assert.equal(
      telefoneForaDoPrazo(
        {
          validadoEm: Date.UTC(2026, 10, 3) as Instant,
          prazoComecouEm: Date.UTC(2026, 10, 2) as Instant,
        },
        Date.UTC(2030, 0, 1) as Instant,
      ),
      false,
    );
  });

  for (const capacidade of CAPACIDADES_NO_PRAZO_DO_TELEFONE) {
    void it(`${capacidade}: com o interruptor LIGADO e o prazo vencido, RECUSA`, () => {
      const vencido = {
        validadoEm: null,
        prazoComecouEm: Date.UTC(2026, 9, 1) as Instant,
      } as const;
      assert.equal(
        recusaDaCapacidade(capacidade, { canais: SO_EMAIL, telefone: vencido }, AGORA, {
          prazoDoTelefone: true,
        }),
        'telefone_nao_validado_no_prazo',
      );
    });

    void it(`${capacidade}: com o interruptor DESLIGADO, o mesmo estado PASSA`, () => {
      const vencido = {
        validadoEm: null,
        prazoComecouEm: Date.UTC(2026, 9, 1) as Instant,
      } as const;
      assert.equal(
        recusaDaCapacidade(capacidade, { canais: SO_EMAIL, telefone: vencido }, AGORA, {
          prazoDoTelefone: false,
        }),
        null,
      );
    });
  }

  void it('capacidade FORA do prazo nao e recusada por prazo, nem com o interruptor ligado', () => {
    const vencido = { validadoEm: null, prazoComecouEm: Date.UTC(2026, 9, 1) as Instant } as const;
    for (const capacidade of TODAS) {
      if (NO_PRAZO_DO_TELEFONE[capacidade]) continue;
      assert.equal(
        recusaPorPrazoDoTelefone(capacidade, vencido, AGORA, { prazoDoTelefone: true }),
        null,
        `${capacidade} nao esta na regra dos 15 dias e foi recusada por ela`,
      );
    }
  });
});

void describe('`recusaPorExigenciaDeCanal` recusa em voz alta em vez de aprovar em silencio', () => {
  void it('LANCA para capacidade que esta na regra dos 15 dias', () => {
    for (const capacidade of CAPACIDADES_NO_PRAZO_DO_TELEFONE) {
      assert.throws(
        () => recusaPorExigenciaDeCanal(capacidade, SO_EMAIL),
        /regra dos 15 dias/,
        `${capacidade} passou pela porta sem relogio sem o prazo ser aplicado nem acusado`,
      );
    }
  });

  void it('decide igual a `recusaDaCapacidade` para quem esta fora do prazo', () => {
    for (const capacidade of TODAS) {
      if (NO_PRAZO_DO_TELEFONE[capacidade]) continue;
      for (const { nome, canais } of TODAS_AS_ENTRADAS) {
        if (
          EXIGENCIA_DECLARADA[EXIGENCIA_DE_CANAL[capacidade]].precisaDasDuasEvidencias &&
          'canalConfirmado' in canais
        ) {
          continue;
        }
        assert.equal(
          recusaPorExigenciaDeCanal(capacidade, canais),
          recusaDaCapacidade(capacidade, conta(canais), AGORA),
          `${capacidade} com "${nome}": as duas portas da matriz discordaram`,
        );
      }
    }
  });
});
