/**
 * A regra do **apelido (`@`)**, exercitada nas bordas.
 *
 * Decisão do cliente de 18/10/2026: *"o apelido esta livre, vai estar no
 * cadastro do usuário e na pagina de edição do perfil"*. O desenho vem fechado
 * do plano `9d99ac0f` (seção 4-C) e não é reaberto aqui.
 *
 * ## O QUE ESTE ARQUIVO NÃO MEDE, E ONDE ISSO É MEDIDO
 *
 * **Disponibilidade.** Não há função de disponibilidade para testar: ela é
 * decidida pelo índice único de `handles`, na escrita (plano 4-C.5). O caso que
 * prova a recusa por duplicidade **chamando o banco** é a validação em
 * `BEGIN/ROLLBACK` descrita no relatório desta tarefa, mais
 * `recusaDeApelidoTomado` abaixo, que traduz a violação.
 *
 * ## A PARIDADE COM O BANCO É MEDIDA AQUI
 *
 * `esqueletoDoApelido` precisa dar exatamente o mesmo que
 * `handle_esqueleto(text)` da migração `20261018000021`. Se as duas
 * divergirem, o índice do banco e a recusa da aplicação passam a discordar
 * sobre o que é parecido, e o furo aparece como "o servidor aceitou e o banco
 * recusou". Os casos de `esqueleto` abaixo foram rodados contra o Postgres e
 * carregam a saída que ele deu.
 */
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

/** O erro do campo `handle` dentro de um `AppError` de validação. */
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
  /**
   * AS DUAS BORDAS DA FAIXA, que é onde o erro mora.
   *
   * 4 recusa e 5 passa; 20 passa e 21 recusa. Uma borda só não prova nada: a
   * regra `< 5` e a regra `<= 5` concordam em todo o resto e discordam
   * exatamente aqui.
   *
   * **Os mesmos quatro casos foram rodados contra o `CHECK` de
   * `handles.handle` em `BEGIN/ROLLBACK`**, e deram o mesmo resultado. É essa
   * coincidência que o relatório desta tarefa chama de "a mesma faixa nos três
   * lugares" -- a divergência que esta casa já pagou foi o recado do achado,
   * que aceitava 1000 no contrato e 500 na coluna.
   */
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

  /**
   * O teto de 20 é do NORMALIZADO, e o plano afirma que ele é idêntico ao
   * digitado. **Isto confere a afirmação** em vez de confiar nela: o conjunto é
   * ASCII restrito, então `toLowerCase` é um para um e o comprimento não muda.
   *
   * O caso que isto mataria é `maxLength` contado no digitado e `CHECK` contado
   * no normalizado -- e é o tipo de divergência que só aparece em produção.
   */
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
    // Maiúscula é NORMALIZADA e não recusada: `@Leandro` é `@leandro`.
    assert.equal(verificarApelido('MARIA-SILVA'), 'maria-silva');

    // Ponto e sublinhado foram recusados DE PROPÓSITO: com os três
    // separadores, `@maria.silva`, `@maria_silva` e `@maria-silva`
    // conviveriam.
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

  /** A forma exportada é a que o contrato e a tela repetem. */
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
  /**
   * O INVARIANTE DO PLANO, e o que ele custou.
   *
   * O plano escreve o mapa como `0→o`, `1→l`, `5→s`, `3→e`, e **esse mapa
   * sozinho não produz esta colisão**: com ele, `mar1a` vira `marla` e `maria`
   * fica `maria`. `i→l` foi acrescentado para o invariante escrito valer, e a
   * divergência está declarada no módulo e na migração.
   *
   * As três saídas abaixo foram rodadas contra `handle_esqueleto` no Postgres:
   * as três deram `marlasllva`.
   */
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

  /**
   * PARIDADE COM O BANCO. As saídas da direita vieram de
   * `SELECT handle_esqueleto(...)` rodado contra o Postgres 16 em
   * `BEGIN/ROLLBACK`, e não de ler a função daqui.
   */
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
  /**
   * A ISCA QUE O PLANO PEDE, e ela precisa das DUAS regras ao mesmo tempo.
   *
   * `@B1CHU-suporte` escapa de tudo que não seja "contém, sobre o esqueleto":
   * não é igual a `bichu`, não começa com `bichu`, e com o `1` no lugar do `i`
   * não contém `bichu` como texto. O que o pega é
   * `esqueleto("b1chu-suporte") = "blchusuporte"` conter
   * `esqueleto("bichu") = "blchu"`.
   */
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

  /**
   * CONTRAPESO. Sem ele, `apelidoEhReservado` passando a devolver `true` para
   * tudo deixaria todos os casos acima verdes.
   */
  void it('apelido comum NÃO é reservado', () => {
    for (const bom of ['maria-silva', 'leandro-p', 'bidu-2026', 'joana-vet']) {
      assert.equal(apelidoEhReservado(bom), false, `"${bom}" não é reservado`);
      assert.equal(verificarApelido(bom), bom);
    }
  });

  /**
   * A lista daqui e a carregada em `handles` pela migração precisam continuar
   * iguais. A migração carregou 51 linhas `kind = 'reservado'`, contadas no
   * Postgres em `BEGIN/ROLLBACK`.
   */
  void it('a lista tem 52 palavras e 51 esqueletos, e a migração carrega 51 linhas', () => {
    assert.equal(
      RESERVADAS.length,
      52,
      'a lista da aplicação e a de `handles` divergiram: a tabela impede que a ' +
        'palavra seja TOMADA e a lista daqui dá o motivo certo (`reserved` em vez ' +
        'de `taken`). As duas metades são necessárias',
    );

    // 52 PALAVRAS, 51 LINHAS NO BANCO, E ISSO NÃO É DEFEITO.
    //
    // `noreply` e `no-reply` têm o MESMO esqueleto — o esqueleto tira o hífen —
    // então o `INSERT` da migração grava uma e o `ON CONFLICT DO NOTHING`
    // descarta a outra. **As duas continuam recusadas**, porque o índice de
    // esqueleto recusa a segunda forma de qualquer jeito.
    //
    // Este caso existe para a contagem de 51 no banco não parecer uma palavra
    // perdida na carga. Medido: 51 linhas `kind = 'reservado'` em
    // `BEGIN/ROLLBACK` contra o Postgres.
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
    // E as duas formas continuam recusadas, que é o que importa de verdade.
    assert.ok(apelidoEhReservado('noreply'));
    assert.ok(apelidoEhReservado('no-reply'));
    // Nenhuma reservada pode ser impossível pela própria forma: reservar o que
    // o piso de 5 já proíbe é regra morta.
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
  /**
   * ISCA: a violação de unicidade vira `code: 'taken'`.
   *
   * **É aqui que a disponibilidade é decidida** -- e não numa consulta anterior,
   * que é a rota que o plano 4-C.5 matou. As duas escritas concorrentes chegam
   * ao banco, uma viola o índice, e esta tradução é o que a tela trata.
   */
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

  /**
   * CONTRAPESO, e ele é o que importa mais neste grupo: engolir erro de banco
   * desconhecido faria um defeito de escrita virar "apelido indisponível" para
   * sempre, e ninguém procuraria a causa real.
   */
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
  /**
   * Elas existem porque **não há rota de disponibilidade**: sem conferência a
   * cada tecla, a pessoa só descobre no envio, e a mitigação que não custa nada
   * é oferecer saídas. É isso que resolve o nome curto legítimo -- Ana, Léo,
   * Zé -- por exemplo e não por explicação.
   */
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

  /** Entrada que não sobra nada ainda precisa gerar três saídas válidas. */
  void it('entrada impossível ainda gera três sugestões', () => {
    for (const impossivel of ['', '...', '---', 'Á']) {
      const sugestoes = sugestoesDeApelido(impossivel);
      assert.equal(sugestoes.length, 3, `"${impossivel}" não gerou três`);
      for (const sugestao of sugestoes) {
        assert.ok(FORMA_DO_APELIDO.test(sugestao), `"${sugestao}" não passa na forma`);
      }
    }
  });

  /**
   * O teto é respeitado pelas sugestões: sugerir 21 caracteres seria oferecer
   * o que a própria recusa acabou de negar.
   */
  void it('nenhuma sugestão passa do teto', () => {
    const longo = 'abcdefghij0123456789';
    for (const sugestao of sugestoesDeApelido(longo)) {
      assert.ok(sugestao.length <= MAXIMO_DO_APELIDO, `"${sugestao}" passou de 20`);
    }
  });
});
