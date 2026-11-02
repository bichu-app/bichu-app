/**
 * **AS DUAS FORMAS DA REGRA `foto + perfil publico` DIZEM A MESMA COISA?**
 *
 * A regra de quem APARECE numa listagem de pessoas e foto + perfil publico
 * (cliente, 02/11/2026), e ela existe em DUAS formas no mesmo arquivo:
 *
 * | Forma | Quem usa | Por que ela precisa existir |
 * |---|---|---|
 * | `motivoDeNaoAparecerNaListagem` (TypeScript) | `updateMe` e a TELA | elas tem a conta em memoria e precisam do MOTIVO, para dizer a pessoa o que fazer |
 * | `apareceNaListagemNoSql` (SQL) | `listPeopleInMyRegion` | a listagem filtra no banco, e a autorizacao mora na clausula `WHERE` (ADR-0021) |
 *
 * **Duas formas sao duas chances de divergir, e este arquivo e o que as tira.**
 * O precedente e `shared/db/canal-de-contato-confirmado.ts`, que tem as duas
 * formas da regua de "validado" e tem portao proprio guardando a unicidade
 * dela -- e e por isso que as duas moram no MESMO arquivo em vez de uma em cada
 * modulo.
 *
 * ## A ARMADILHA DESTA CLASSE DE PORTAO
 *
 * Um portao que leia o TEXTO de uma consulta passa por nao achar nada: a
 * expressao para de casar, a leitura devolve vazio, e "nenhuma divergencia"
 * fica indistinguivel de "nao li". Por isso o primeiro grupo e um CONTROLE
 * POSITIVO: ele prova que a forma de SQL produziu texto com as tres condicoes
 * DENTRO, antes de qualquer caso afirmar que algo falta.
 *
 * ## O QUE ELE NAO FAZ
 *
 * Ele nao executa SQL -- isso e de
 * `tests/integration/lista-da-regiao-por-adesao.test.ts`, que mede as tres
 * condicoes contra Postgres de verdade. E ele nao confere a ORDEM dos motivos:
 * aquilo e `perfil-publico-de-pessoa.test.ts`, do #149, e repetir a conferencia
 * aqui daria duas definicoes da ordem.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';

import type { Database } from '../db/schema.js';
import {
  apareceNaListagem,
  apareceNaListagemNoSql,
  motivoDeNaoAparecerNaListagem,
  type EstadoDoPerfilDePessoa,
} from './perfil-publico-de-pessoa.js';

/**
 * O Kysely SEM BANCO, so para COMPILAR a expressao e ler o texto dela.
 *
 * **Ler o texto compilado, e nao o fonte do arquivo**, e a diferenca que
 * importa: o portao da regua do canal de contato varre o CODIGO procurando
 * copias, e aqui a pergunta e outra -- o que a expressao de fato PRODUZ. Uma
 * condicao que exista no fonte e nao chegue ao SQL (por um `if` que a pule, por
 * exemplo) passaria numa varredura de fonte e reprova aqui.
 */
const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

/** O texto da forma de SQL, para o apelido que a listagem usa. */
const sqlDaRegra = (apelido: 'eu' | 'u'): string =>
  semBanco
    .selectFrom('users as u')
    .select('u.id')
    .where(apareceNaListagemNoSql(apelido))
    .compile().sql;

const COMPLETO: EstadoDoPerfilDePessoa = {
  perfilPublicoLigado: true,
  temFotoPronta: true,
  apelido: 'maria-silva',
};

/**
 * As TRES condicoes, cada uma com o jeito de reconhece-la nas duas formas.
 *
 * **A tabela e a fonte dos casos, e nao uma lista paralela a eles**: um `for`
 * sobre ela e o que faz uma condicao NOVA na forma de TypeScript precisar
 * aparecer aqui -- e, aparecendo aqui, precisar existir na de SQL.
 */
const AS_TRES: readonly {
  readonly nome: string;
  readonly motivo: string;
  /** O estado completo, MENOS esta condicao. */
  readonly semEla: EstadoDoPerfilDePessoa;
  /** Como a condicao aparece no SQL. */
  readonly noSql: RegExp;
}[] = [
  {
    nome: 'o interruptor do perfil publico',
    motivo: 'perfil_publico_desligado',
    semEla: { ...COMPLETO, perfilPublicoLigado: false },
    noSql: /\bpublic_profile_enabled\b/,
  },
  {
    nome: 'a foto da propria pessoa, em `ready`',
    motivo: 'sem_foto_pronta',
    semEla: { ...COMPLETO, temFotoPronta: false },
    noSql: /purpose = 'user_photo'[\s\S]*status = 'ready'/,
  },
  {
    nome: 'o apelido, que e o endereco do perfil',
    motivo: 'sem_apelido',
    semEla: { ...COMPLETO, apelido: null },
    noSql: /\bhandle IS NOT NULL\b/,
  },
];

void describe('CONTROLE POSITIVO: as duas formas produziram algo que se possa ler', () => {
  void it('a forma de SQL produz texto, e com as tres condicoes DENTRO', () => {
    const texto = sqlDaRegra('u');
    assert.ok(
      texto.length > 80,
      `a forma de SQL devolveu ${texto.length} caracteres. Um texto curto significa que ` +
        'ela parou de montar a expressao, e todos os casos abaixo passariam por nao ' +
        'ter lido nada.',
    );
    for (const condicao of AS_TRES) {
      assert.match(
        texto,
        condicao.noSql,
        `a condicao "${condicao.nome}" nao foi encontrada no SQL. Ou ela saiu da regra, ` +
          'ou a expressao deste portao parou de reconhece-la -- e nos dois casos a ' +
          'conferencia abaixo deixaria de medir.',
      );
    }
  });

  void it('a forma de TypeScript APROVA o estado completo', () => {
    assert.equal(
      motivoDeNaoAparecerNaListagem(COMPLETO),
      null,
      'o estado completo nao aparece: sem esta metade, os casos negativos abaixo ' +
        'passariam numa funcao que recusa todo mundo',
    );
    assert.equal(apareceNaListagem(COMPLETO), true);
  });
});

void describe('as duas formas cobram AS MESMAS tres condicoes', () => {
  for (const condicao of AS_TRES) {
    void it(`\`${condicao.nome}\` e cobrada nas DUAS formas`, () => {
      // Em TypeScript: tirar a condicao recusa, e com o motivo certo.
      assert.equal(
        motivoDeNaoAparecerNaListagem(condicao.semEla),
        condicao.motivo,
        `tirar "${condicao.nome}" deixou de recusar na forma de TypeScript`,
      );
      // Em SQL: a condicao esta no texto do predicado, nos DOIS apelidos que a
      // listagem usa -- `u` e a pessoa listada e `eu` e quem chama, e a
      // reciprocidade cobra a regra dos dois lados.
      for (const apelido of ['u', 'eu'] as const) {
        assert.match(
          sqlDaRegra(apelido),
          condicao.noSql,
          `"${condicao.nome}" nao esta no SQL do apelido \`${apelido}\`: a regra deixou ` +
            'de valer para um dos lados da listagem',
        );
      }
    });
  }

  void it('o apelido entra no SQL por `sql.raw`, e as tres condicoes falam do MESMO', () => {
    const meu = sqlDaRegra('eu');
    assert.ok(
      meu.includes('eu.public_profile_enabled') && meu.includes('eu.handle'),
      'o apelido nao foi aplicado a todas as colunas: uma condicao ficou olhando outra ' +
        `tabela. SQL: ${meu}`,
    );
    assert.ok(
      meu.includes('foto.id = eu.photo_image_id'),
      'a foto nao esta amarrada a conta do apelido pedido -- o `EXISTS` ficaria ' +
        'verdadeiro para qualquer foto `ready` do catalogo, e TODA conta com perfil ' +
        `publico apareceria. SQL: ${meu}`,
    );
  });

  void it('ISCA: o portao REPROVA uma condicao que exista num lado e nao no outro', () => {
    // A isca mede a conferencia, e nao o codigo: se a expressao de uma condicao
    // for apagada do SQL, a conferencia acima tem de deixar de casar.
    const mutilado = sqlDaRegra('u').replace('public_profile_enabled', 'coluna_que_nao_existe');
    assert.doesNotMatch(
      mutilado,
      AS_TRES[0]!.noSql,
      'a isca passou: a expressao do interruptor casa um SQL de onde ele foi tirado, ' +
        'entao o caso de cima nao mede nada.',
    );
    // E a outra direcao: um estado novo em TypeScript sem condicao em SQL.
    assert.equal(
      motivoDeNaoAparecerNaListagem({ ...COMPLETO, perfilPublicoLigado: false }),
      'perfil_publico_desligado',
      'a isca passou: a forma de TypeScript nao recusa nem o estado desligado.',
    );
  });

  void it('o SQL NAO carrega capacidade nenhuma: visibilidade nao e permissao', () => {
    // O #149 separou as duas coisas em DOIS arquivos sem aresta entre eles
    // (decisao do cliente: *"nao tem relacao com permissoes dentro do sistema,
    // apenas de visibilidade"*). A forma de SQL nasceu depois, e este caso e o
    // que impede que ela seja o lugar por onde a confusao volta.
    const texto = sqlDaRegra('u');
    for (const agulha of ['capacidade', 'nivel', 'NIVEL_EXIGIDO', 'verification_level', 'permissao']) {
      assert.ok(
        !texto.includes(agulha),
        `\`${agulha}\` entrou no predicado de VISIBILIDADE. A matriz de capacidades e ` +
          'outro arquivo, de propósito, e o perfil publico nao esta nela.',
      );
    }
  });
});
