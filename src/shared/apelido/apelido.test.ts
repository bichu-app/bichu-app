import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AppError } from '../http/errors.js';
import {
  apelidoEhReservado,
  esqueletoDoApelido,
  FORMA_DO_APELIDO,
  MAXIMO_DO_APELIDO,
  MINIMO_DO_APELIDO,
  normalizarApelido,
  recusaDeApelidoTomado,
  RESERVADAS,
  sugestoesDeApelido,
  verificarApelido,
} from './apelido.js';

function codigoDaRecusa(executar: () => unknown): string {
  try {
    executar();
  } catch (erro) {
    assert.ok(erro instanceof AppError, 'o módulo fala por AppError, e não por Error cru');
    const detalhes = erro as unknown as {
      errors?: readonly { field?: string; code?: string }[];
    };
    const achado = detalhes.errors?.find((e) => e.field === 'handle');
    assert.ok(achado?.code !== undefined, 'a recusa não nomeou `handle` com um código');
    return achado.code;
  }
  throw new assert.AssertionError({ message: 'a chamada deveria ter sido recusada' });
}

void describe('o apelido: a faixa é 5 a 20, e é a MESMA dos três lugares', () => {
  void it('a borda de BAIXO: 4 caracteres recusa, 5 passa', () => {
    assert.equal(codigoDaRecusa(() => verificarApelido('abcd')), 'too_short');
    assert.equal(verificarApelido('abcde'), 'abcde');
  });

  void it('a borda de CIMA: 20 caracteres passa, 21 recusa', () => {
    const vinte = 'abcdefghij0123456789';
    assert.equal(vinte.length, MAXIMO_DO_APELIDO);
    assert.equal(verificarApelido(vinte), vinte);

    const vinteEUm = `${vinte}0`;
    assert.equal(vinteEUm.length, MAXIMO_DO_APELIDO + 1);
    assert.equal(codigoDaRecusa(() => verificarApelido(vinteEUm)), 'too_long');
  });

  void it('normalizado e digitado têm o MESMO comprimento, sempre', () => {
    for (const bruto of ['MARIA-SILVA', 'Maria-Silva', 'abcdefghij0123456789', 'MaRiA-01']) {
      assert.equal(
        normalizarApelido(bruto).length,
        bruto.trim().length,
        `"${bruto}" mudou de comprimento ao normalizar: o teto de ${String(MAXIMO_DO_APELIDO)} ` +
          'deixaria de valer igual no contrato e na coluna',
      );
    }
  });

  void it('a forma recusa maiúscula crua, acento, ponto, sublinhado e hífen na ponta', () => {
    assert.equal(verificarApelido('MARIA-SILVA'), 'maria-silva');

    for (const ruim of ['maria.silva', 'maria_silva', 'mariá-silva', '-maria', 'maria-']) {
      assert.equal(
        codigoDaRecusa(() => verificarApelido(ruim)),
        'format',
        `"${ruim}" deveria ser recusado pela forma`,
      );
    }
  });

  void it('ausente e vazio cobram o campo em vez de falar de faixa', () => {
    for (const vazio of [undefined, null, '', '   ', 42]) {
      assert.equal(codigoDaRecusa(() => verificarApelido(vazio)), 'required');
    }
  });

  void it('FORMA_DO_APELIDO é o regex que os três lugares carregam', () => {
    assert.equal(
      FORMA_DO_APELIDO.source,
      '^[a-z0-9][a-z0-9-]{3,18}[a-z0-9]$',
      'se este regex mudar, o `CHECK` de handles.handle, o `pattern` de Handle ' +
        'no contrato e `FormaDoApelido` em app/lib/formato/apelido.dart mudam junto',
    );
    assert.equal(MINIMO_DO_APELIDO, 5);
    assert.equal(MAXIMO_DO_APELIDO, 20);
  });
});

void describe('o esqueleto: parecidos não coexistem', () => {
  void it('@maria-silva, @mariasilva e @mar1a-silva são o MESMO apelido', () => {
    const esperado = 'marlasllva';
    assert.equal(esqueletoDoApelido('maria-silva'), esperado);
    assert.equal(esqueletoDoApelido('mariasilva'), esperado);
    assert.equal(esqueletoDoApelido('mar1a-silva'), esperado);
  });

  void it('o esqueleto colapsa por GRUPO, e é insensível a caixa e a hífen', () => {
    assert.equal(esqueletoDoApelido('l1a-01'), 'llaol');
    assert.equal(esqueletoDoApelido('LIA-OL'), 'llaol');
    assert.equal(esqueletoDoApelido('5e3'), 'see');
  });

  void it('bate caractere a caractere com handle_esqueleto do Postgres', () => {
    const medidoNoBanco: ReadonlyArray<readonly [string, string]> = [
      ['bichu', 'blchu'],
      ['b1chu-suporte', 'blchusuporte'],
      ['maria-silva', 'marlasllva'],
      ['mariasilva', 'marlasllva'],
      ['mar1a-silva', 'marlasllva'],
    ];
    for (const [entrada, esperado] of medidoNoBanco) {
      assert.equal(
        esqueletoDoApelido(entrada),
        esperado,
        `"${entrada}": a função da aplicação divergiu do que o banco devolveu. ` +
          'Divergência aqui aparece como "o servidor aceitou e o banco recusou"',
      );
    }
  });
});

void describe('as reservadas: `bichu` é CONTÉM, e a conferência é sobre o esqueleto', () => {
  void it('@B1CHU-suporte é recusado', () => {
    assert.equal(codigoDaRecusa(() => verificarApelido('B1CHU-suporte')), 'reserved');
  });

  void it('CONTÉM e não começa-com: @suporte-bichu e @oi-bichu caem', () => {
    for (const golpe of ['suporte-bichu', 'oi-bichu', 'bichu-oficial', 'xxbichuxx']) {
      assert.equal(
        codigoDaRecusa(() => verificarApelido(golpe)),
        'reserved',
        `"${golpe}" é a forma real do golpe e precisa ser recusado`,
      );
    }
  });

  void it('a reservada exata é recusada, e também a versão com parecidos', () => {
    assert.equal(codigoDaRecusa(() => verificarApelido('suporte')), 'reserved');
    assert.equal(codigoDaRecusa(() => verificarApelido('5uporte')), 'reserved');
    assert.equal(codigoDaRecusa(() => verificarApelido('m0derador')), 'reserved');
  });

  void it('apelido comum NÃO é reservado', () => {
    for (const bom of ['maria-silva', 'leandro-p', 'bidu-2026', 'joana-vet']) {
      assert.equal(apelidoEhReservado(bom), false, `"${bom}" não é reservado`);
      assert.equal(verificarApelido(bom), bom);
    }
  });

  void it('a lista tem 52 palavras e 51 esqueletos, e a migração carrega 51 linhas', () => {
    assert.equal(
      RESERVADAS.length,
      52,
      'a lista da aplicação e a de `handles` divergiram: a tabela impede que a ' +
        'palavra seja TOMADA e a lista daqui dá o motivo certo (`reserved` em vez ' +
        'de `taken`). As duas metades são necessárias',
    );

    const esqueletos = new Set(RESERVADAS.map((p) => esqueletoDoApelido(p)));
    assert.equal(
      esqueletos.size,
      51,
      'o número de esqueletos distintos mudou: é ele, e não o tamanho da lista, ' +
        'que diz quantas linhas a migração grava',
    );
    assert.equal(
      esqueletoDoApelido('noreply'),
      esqueletoDoApelido('no-reply'),
      'o par que explica a diferença entre 52 e 51 deixou de colidir',
    );
    assert.ok(apelidoEhReservado('noreply'));
    assert.ok(apelidoEhReservado('no-reply'));
    for (const palavra of RESERVADAS) {
      assert.ok(
        FORMA_DO_APELIDO.test(palavra),
        `"${palavra}" não passa na forma: reservar o que o piso de ${String(MINIMO_DO_APELIDO)} ` +
          'já proíbe é regra morta, e regra morta parece estar protegendo algo',
      );
    }
  });
});

void describe('a disponibilidade é do banco, e a tradução é daqui', () => {
  void it('o 23505 de handles vira recusa de campo com `taken`', () => {
    const doPostgres = {
      code: '23505',
      constraint: 'handles_pkey',
      message: 'duplicate key value violates unique constraint "handles_pkey"',
    };
    const recusa = recusaDeApelidoTomado(doPostgres);
    assert.ok(recusa instanceof AppError);
    const detalhes = recusa as unknown as {
      errors?: readonly { field?: string; code?: string; message?: string }[];
    };
    const erro = detalhes.errors?.[0];
    assert.equal(erro?.field, 'handle');
    assert.equal(erro?.code, 'taken');
    assert.ok(
      !(erro?.message ?? '').includes('@'),
      'a mensagem não pode dizer DE QUEM é o apelido: o que pode vazar é que ele ' +
        'está tomado, nunca quem o tem',
    );
  });

  void it('o índice do ESQUELETO também vira `taken`', () => {
    const recusa = recusaDeApelidoTomado({
      code: '23505',
      constraint: 'handles_esqueleto_unico',
      message: 'duplicate key value violates unique constraint "handles_esqueleto_unico"',
    });
    assert.ok(recusa instanceof AppError);
  });

  void it('erro que NÃO é de apelido passa adiante', () => {
    assert.equal(
      recusaDeApelidoTomado({
        code: '23505',
        constraint: 'users_email_unico',
        message: 'duplicate key value violates unique constraint "users_email_unico"',
      }),
      undefined,
    );
    assert.equal(recusaDeApelidoTomado({ code: '23503' }), undefined);
    assert.equal(recusaDeApelidoTomado(new Error('conexão caiu')), undefined);
  });
});

void describe('as três sugestões, que substituem o parágrafo de apoio', () => {
  void it('são três, e todas passam na própria forma', () => {
    for (const curto of ['ana', 'leo', 'ze', 'maria-silva']) {
      const sugestoes = sugestoesDeApelido(curto);
      assert.equal(sugestoes.length, 3, `"${curto}" não gerou três sugestões`);
      for (const sugestao of sugestoes) {
        assert.ok(
          FORMA_DO_APELIDO.test(sugestao),
          `a sugestão "${sugestao}" para "${curto}" não passa na forma`,
        );
        assert.ok(
          !apelidoEhReservado(sugestao),
          `a sugestão "${sugestao}" é reservada: sugerir o que será recusado é pior que não sugerir`,
        );
      }
      assert.equal(new Set(sugestoes).size, 3, 'as três precisam ser distintas');
    }
  });

  void it('entrada impossível ainda gera três sugestões', () => {
    for (const impossivel of ['', '...', '---', 'Á']) {
      const sugestoes = sugestoesDeApelido(impossivel);
      assert.equal(sugestoes.length, 3, `"${impossivel}" não gerou três`);
      for (const sugestao of sugestoes) {
        assert.ok(FORMA_DO_APELIDO.test(sugestao), `"${sugestao}" não passa na forma`);
      }
    }
  });

  void it('nenhuma sugestão passa do teto', () => {
    const longo = 'abcdefghij0123456789';
    for (const sugestao of sugestoesDeApelido(longo)) {
      assert.ok(sugestao.length <= MAXIMO_DO_APELIDO, `"${sugestao}" passou de 20`);
    }
  });
});
