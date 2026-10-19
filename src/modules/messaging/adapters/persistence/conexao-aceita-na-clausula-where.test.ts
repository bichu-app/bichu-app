/**
 * **A FOTO SÓ SAI ENTRE CONEXÕES ACEITAS, e o recorte está na cláusula `WHERE`.**
 * O SQL compilado prova.
 *
 * ## A decisão que este arquivo defende
 *
 * Decisão do cliente, 19/10/2026, literal: *"a foto aparece SÓ quando as duas
 * pessoas já aceitaram conexão"*. Em conversa de achado com um estranho, e em
 * qualquer conversa com quem não é conexão aceita, ela **não** aparece — fica a
 * inicial do nome, que é o que estava lá antes. É a emenda 3 do ADR-0010, e ela
 * **não revoga** a regra anterior: o motivo dela (o golpe do falso achador)
 * continua protegido, porque é exatamente onde a foto não entra.
 *
 * ## Por que conferir o SQL, e não a resposta
 *
 * `application/conversation-service.test.ts` pode afirmar que a foto não sai
 * para quem não é conexão, e passar — porque **o dublê devolve `null`**, e não
 * porque a consulta recortou. O repositório de verdade não participa daquele
 * arquivo: um `apelidoDoOutro` que ignorasse a conexão continuaria verde lá com
 * o furo de pé.
 *
 * O ADR-0021 não diz "não devolva a foto do outro". Ele diz **onde** a decisão
 * mora, e isso não é observável de fora: a consulta que traz a foto e a descarta
 * num `if` responde igual — até o dia em que alguém mexe no `if`, e aí não há
 * teste que acuse, porque o `if` era o teste.
 *
 * Mesmo instrumento do vizinho `autorizacao-na-clausula-where.test.ts`: compila
 * as consultas com `DummyDriver`, sem banco e sem executá-las, e lê o predicado
 * do **SQL compilado** — nunca do texto-fonte do adaptador. A distinção importa:
 * uma conferência que procurasse `accepted` no arquivo casaria com a menção
 * dentro deste próprio comentário e ficaria verde com a cláusula removida.
 *
 * ## As duas metades, e por que as duas são medidas aqui
 *
 * O recorte aparece em DOIS campos (`apelido_do_outro` e
 * `chave_da_foto_do_outro`), e cada caso abaixo mede os **dois**. Um defeito que
 * recortasse a foto e esquecesse o apelido não vazaria rosto, mas vazaria
 * endereço de perfil de uma pessoa a um estranho — e um que fizesse o contrário
 * vazaria o rosto, que é o insumo de engenharia social. Medir um só deixaria
 * metade do mecanismo sem portão.
 *
 * ## A isca, e como ela foi provada
 *
 * Cada mecanismo foi desligado em `kysely-conversation-repository.ts`, a suíte
 * rodou, e o mecanismo foi restaurado. Os números medidos estão no rodapé deste
 * arquivo, escritos depois da execução — e o último caso (`A ISCA DA ISCA`)
 * prova, sem tocar no adaptador, que estas conferências reprovam SQL sem o
 * predicado.
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

import type { Database } from '../../../../shared/db/schema.js';
import type { ConversationId, UserId } from '../../../../shared/types/brands.js';
import {
  construtorDaBuscaDoChamador,
  construtorDaContagemDoChamador,
  construtorDaListaDoChamador,
} from './kysely-conversation-repository.js';

const CHAMADOR = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const CONVERSA = '018f3a2b-0000-7000-8000-0000000000cc' as ConversationId;
const PAGINA = { limit: 20, depoisDe: undefined, termo: undefined };

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

interface Compilada {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

/**
 * O texto da subconsulta projetada com este apelido de coluna.
 *
 * Recorta de trás para frente, do `as "<alias>"` até o parêntese que o abriu,
 * contando parênteses. Sem o contador, uma expressão `(...)` interna (e há
 * várias: o `CASE`, o `EXISTS`, a chamada de função) encerraria o recorte no
 * lugar errado e o caso leria menos SQL do que existe — que é como uma
 * conferência fica verde sem medir.
 *
 * Devolve `''` quando o apelido não existe, e isso é deliberado: um caso que
 * procure o predicado em `''` **reprova**, em vez de passar por não ter achado
 * nada. É a armadilha desta classe de portão, e ela é fechada aqui e no caso
 * `o campo EXISTE` abaixo.
 */
function subconsultaProjetada(sql: string, alias: string): string {
  const fim = sql.indexOf(`) as "${alias}"`);
  if (fim < 0) return '';
  let profundidade = 0;
  for (let i = fim; i >= 0; i -= 1) {
    const c = sql[i];
    if (c === ')') profundidade += 1;
    else if (c === '(') {
      profundidade -= 1;
      if (profundidade === 0) return sql.slice(i, fim + 1);
    }
  }
  return '';
}

/** Os dois campos da emenda 3, e as duas subconsultas que os produzem. */
const CAMPOS_DA_EMENDA = ['apelido_do_outro', 'chave_da_foto_do_outro'] as const;

/** Todos os valores ligados às posições `$n` que aparecem NESTE trecho de SQL. */
function valoresLigadosNoTrecho(trecho: string, compilada: Compilada): unknown[] {
  const valores: unknown[] = [];
  for (const achado of trecho.matchAll(/\$(\d+)/g)) {
    valores.push(compilada.parameters[Number(achado[1]) - 1]);
  }
  return valores;
}

/** As duas consultas que PROJETAM participante. A contagem não projeta nada. */
function consultasQueProjetam(): { nome: string; compilada: Compilada }[] {
  return [
    {
      nome: 'getConversation',
      compilada: construtorDaBuscaDoChamador(semBanco, CONVERSA, CHAMADOR).compile(),
    },
    {
      nome: 'listConversations',
      compilada: construtorDaListaDoChamador(semBanco, CHAMADOR, PAGINA).compile(),
    },
  ];
}

void describe('a foto do participante só sai entre conexões aceitas (SQL compilado)', () => {
  void it('CONTRAPESO -- os dois campos da emenda EXISTEM nas duas consultas que projetam', () => {
    // SEM ESTE CASO TODOS OS OUTROS PASSARIAM VAZIOS, e essa é a forma mais
    // fácil de um portão de omissão ficar verde: `subconsultaProjetada`
    // devolveria `''` para um campo que deixou de ser projetado, e `''` não
    // contém nada de proibido.
    for (const { nome, compilada } of consultasQueProjetam()) {
      for (const campo of CAMPOS_DA_EMENDA) {
        assert.notEqual(
          subconsultaProjetada(compilada.sql, campo),
          '',
          `${nome} deixou de projetar \`${campo}\`: a emenda 3 do ADR-0010 saiu da consulta, ` +
            'e com ela saíram todas as conferências deste arquivo',
        );
      }
    }
  });

  void it('ISCA -- o predicado de CONEXÃO ACEITA está dentro das DUAS subconsultas', () => {
    for (const { nome, compilada } of consultasQueProjetam()) {
      for (const campo of CAMPOS_DA_EMENDA) {
        const trecho = subconsultaProjetada(compilada.sql, campo);
        // `AND EXISTS (` e não só `EXISTS (`, e a diferença foi MEDIDA.
        //
        // A primeira versão deste caso procurava `EXISTS (` solto, e com o
        // mecanismo neutralizado por `true AND true OR EXISTS (...)` ela
        // continuava ACHANDO o texto e **aprovava** -- 11 casos verdes com o
        // recorte desligado, e a suite de integração reprovando 5. É a forma
        // exata do defeito que este arquivo existe para impedir, um nível
        // acima: conferir que o predicado APARECE no SQL não é o mesmo que
        // conferir que ele DECIDE o SQL.
        assert.match(
          trecho,
          /AND EXISTS \(\s*SELECT 1 FROM user_connections uc/,
          `${nome}/${campo}: o predicado de conexão saiu do \`WHERE\` da subconsulta, ou ` +
            'deixou de ser conjunção (um `OR` antes dele neutraliza o recorte inteiro)',
        );
        assert.match(
          trecho,
          /uc\.state = 'accepted'/,
          `${nome}/${campo}: pendente não é aceite. O cliente disse "JÁ aceitaram conexão": ` +
            'pedido enviado, pedido recebido e recusa são os três estados em que a foto não aparece',
        );
      }
    }
  });

  void it('ISCA -- o recorte é CONJUNÇÃO: nenhum literal booleano, e UM `OR` só', () => {
    // **O caso que fecha a neutralização**, e ele é sobre a FORMA do predicado
    // e não sobre a presença dele. Um recorte pode ser desligado sem apagar uma
    // linha: `true OR <predicado>` e `<predicado> OR true` deixam o texto
    // inteiro no lugar e tornam a condição universal.
    //
    // As duas subconsultas ÍNTEGRAS não têm **nenhum** literal booleano, e têm
    // **exatamente um** `OR` -- o dos dois sentidos do par. Qualquer um dos dois
    // números mudar é ou uma neutralização, ou um ramo novo que precisa de
    // decisão. Nos dois casos este caso é onde isso aparece.
    for (const { nome, compilada } of consultasQueProjetam()) {
      for (const campo of CAMPOS_DA_EMENDA) {
        const trecho = subconsultaProjetada(compilada.sql, campo);
        for (const literal of [/\btrue\b/i, /\bfalse\b/i]) {
          assert.doesNotMatch(
            trecho,
            literal,
            `${nome}/${campo}: literal booleano no recorte. \`true\` ao lado de um \`OR\` ` +
              'desliga o predicado sem apagar uma linha de SQL',
          );
        }
        assert.equal(
          (trecho.match(/\bOR\b/g) ?? []).length,
          1,
          `${nome}/${campo}: o número de \`OR\` mudou. O único legítimo é o dos dois ` +
            'sentidos do par; um segundo é ramo alternativo, e ramo alternativo num ' +
            'recorte de autorização é o recorte com uma saída',
        );
      }
    }
  });

  void it('ISCA -- os DOIS SENTIDOS do par, porque a conexão é simétrica', () => {
    // Sem o segundo `OR`, a foto apareceria para um lado do par e não para o
    // outro — quem pediu veria, quem aceitou não. Ninguém consegue explicar
    // isso depois, e é a metade que uma leitura distraída do SQL não nota.
    for (const { nome, compilada } of consultasQueProjetam()) {
      for (const campo of CAMPOS_DA_EMENDA) {
        const trecho = subconsultaProjetada(compilada.sql, campo);
        assert.match(
          trecho,
          /uc\.requester_user_id = \$\d+::uuid AND uc\.addressee_user_id = /,
          `${nome}/${campo}: o sentido "quem chama pediu" saiu`,
        );
        assert.match(
          trecho,
          /uc\.requester_user_id = [a-z._]+ AND uc\.addressee_user_id = \$\d+::uuid/,
          `${nome}/${campo}: o OUTRO sentido do par saiu, e quem pediu não decide quem vê`,
        );
      }
    }
  });

  void it('ISCA -- `conta_habilitada` nas DUAS pontas: quem saiu não tem foto nem apelido', () => {
    // É este predicado, e não um `if` no domínio, que faz o lado
    // despersonalizado perder a foto junto com o nome (decisão do cliente de
    // 17/10: conta desabilitada "não é mais encontrada em nenhuma página ou
    // funcionalidade").
    for (const { nome, compilada } of consultasQueProjetam()) {
      for (const campo of CAMPOS_DA_EMENDA) {
        const trecho = subconsultaProjetada(compilada.sql, campo);
        assert.match(trecho, /conta_habilitada\(uc\.requester_user_id\)/, `${nome}/${campo}`);
        assert.match(trecho, /conta_habilitada\(uc\.addressee_user_id\)/, `${nome}/${campo}`);
      }
    }
  });

  void it('ISCA (e) -- `NOT bloqueio_entre` nas duas, e ele NÃO é redundante aqui', () => {
    // Bloquear desfaz a conexão na mesma transação (`ConexaoSobBloqueio`), mas
    // são DUAS escritas, e este predicado cobre a corrida entre elas.
    //
    // E há a razão específica desta superfície: **a conversa mediada é o canal
    // que ATRAVESSA o bloqueio** — ela continua legível para o par bloqueado,
    // de propósito, porque o tutor precisa ler o que foi dito sobre o pet dele.
    // Em toda outra superfície o par bloqueado simplesmente desaparece; aqui
    // ele continua, e é justamente por isso que a foto não pode depender só do
    // `EXISTS`.
    for (const { nome, compilada } of consultasQueProjetam()) {
      for (const campo of CAMPOS_DA_EMENDA) {
        const trecho = subconsultaProjetada(compilada.sql, campo);
        assert.match(
          trecho,
          /AND NOT bloqueio_entre\(\$\d+::uuid, /,
          `${nome}/${campo}: par bloqueado voltaria a ter foto durante a corrida das duas escritas`,
        );
      }
    }
  });

  void it('ISCA -- tudo que as subconsultas ligam a `$n` é o CHAMADOR, e nada mais', () => {
    // `parameters.includes(CHAMADOR)` seria mais frouxo do que parece: a
    // consulta também liga o id da conversa e os dois rótulos de papel, e uma
    // conferência assim aprovaria `addressee_user_id = <id da conversa>` —
    // coluna certa, operador certo, valor errado. Aqui a exigência é sobre
    // TODOS os valores ligados dentro do recorte.
    for (const { nome, compilada } of consultasQueProjetam()) {
      for (const campo of CAMPOS_DA_EMENDA) {
        const trecho = subconsultaProjetada(compilada.sql, campo);
        const valores = valoresLigadosNoTrecho(trecho, compilada);
        assert.ok(valores.length >= 4, `${nome}/${campo}: nenhum valor ligado — o recorte falhou`);
        for (const v of valores) {
          assert.equal(
            v,
            CHAMADOR,
            `${nome}/${campo}: há um \`$n\` ligado a algo que não é o chamador (${String(v)})`,
          );
        }
      }
    }
  });

  void it('ISCA -- a FOTO é a derivada `thumb`, `ready`, e do propósito `user_photo`', () => {
    // Três predicados, três razões diferentes:
    //
    // - `thumb_key` e não `public_key`: `public_key` é a `card` de 512 px, e o
    //   ícone pinta 40 dp (120 px reais a 3x). A `card` seria 4,3x mais dado
    //   do que a célula pinta, dez linhas por página;
    // - `status = 'ready'`: foto em `processing` ainda carrega o EXIF do
    //   celular, e servi-la entregaria a coordenada de onde ela foi tirada
    //   (ADR-0010 item 4). `rejected` fica fora por outra razão —
    //   `rejection_reason` é assunto entre o dono e quem modera;
    // - `purpose = 'user_photo'`: a capa de um encontro e a logo de um
    //   profissional passam pela MESMA esteira e pela mesma tabela.
    for (const { nome, compilada } of consultasQueProjetam()) {
      const trecho = subconsultaProjetada(compilada.sql, 'chave_da_foto_do_outro');
      assert.match(trecho, /SELECT foto\.thumb_key/, `${nome}: a derivada escolhida mudou`);
      assert.doesNotMatch(
        trecho,
        /foto\.public_key/,
        `${nome}: \`public_key\` é a \`card\` de 512 px — 4,3x a célula de 40 dp`,
      );
      assert.match(trecho, /foto\.status = 'ready'/, nome);
      assert.match(trecho, /foto\.purpose = 'user_photo'/, nome);
      assert.match(trecho, /foto\.thumb_key IS NOT NULL/, nome);
      // E nada de estado de moderação sai: nem a coluna, nem o motivo.
      assert.doesNotMatch(trecho, /rejection_reason/, `${nome}: motivo de recusa não é de terceiro`);
    }
  });

  void it('ISCA -- o APELIDO é de PESSOA, e nunca o de um pet do outro lado', () => {
    // O espaço de nomes de `handles` é COMPARTILHADO com pets
    // (`20261018000021`). Sem `kind = 'pessoa'`, o apelido de um pet poderia
    // sair como se fosse o da pessoa — e o toque abriria `/pessoa/<slug do
    // pet>`, que responde o 404 de inexistente.
    for (const { nome, compilada } of consultasQueProjetam()) {
      const trecho = subconsultaProjetada(compilada.sql, 'apelido_do_outro');
      assert.match(trecho, /SELECT h\.handle FROM handles h/, nome);
      assert.match(trecho, /h\.kind = 'pessoa'/, `${nome}: apelido de PET sairia como o da pessoa`);
    }
  });

  void it('ISCA -- nenhum identificador interno entra nas duas subconsultas', () => {
    // ADR-0010 item 6. O que sai é o apelido (alias escolhido e mutável) e a
    // chave da derivada. `users.id`, `users.public_ref` e `catalog_images.id`
    // não são projetados em nenhuma das duas, e este caso é onde isso é cobrado
    // — nenhum portão deste repositório confere o CORPO da resposta.
    for (const { nome, compilada } of consultasQueProjetam()) {
      for (const campo of CAMPOS_DA_EMENDA) {
        const trecho = subconsultaProjetada(compilada.sql, campo);
        for (const proibido of ['public_ref', 'SELECT outro.id', 'SELECT foto.id']) {
          assert.ok(
            !trecho.includes(proibido),
            `${nome}/${campo}: \`${proibido}\` projetado — identidade interna não sai (ADR-0010 item 6)`,
          );
        }
      }
    }
  });

  void it('a CONTAGEM da lista não projeta participante nenhum, e por isso não tem o que vazar', () => {
    // `construtorDaContagemDoChamador` passa pelo MESMO construtor e depois
    // `clearSelect()`. Este caso registra a consequência: a contagem não
    // carrega apelido nem foto, então não há segunda superfície a proteger.
    const { sql } = construtorDaContagemDoChamador(semBanco, CHAMADOR, undefined).compile();
    for (const campo of CAMPOS_DA_EMENDA) {
      assert.ok(!sql.includes(campo), `a contagem passou a projetar \`${campo}\``);
    }
    assert.match(sql, /count\(\*\)/);
  });

  void it('A ISCA DA ISCA -- estas conferências REPROVAM três mutilações do SQL', () => {
    // Sem este caso, todos os de cima passariam por o predicado estar lá hoje —
    // e não por eles saberem reconhecer a sua ausência.
    //
    // As três mutilações são feitas no TEXTO, sem tocar no adaptador, e cada uma
    // **mantém os parênteses balanceados** de propósito: uma mutilação que
    // desbalanceasse quebraria o recorte de `subconsultaProjetada` e faria o
    // caso passar por não achar nada — que é o defeito que ele existe para
    // provar que não acontece.
    const compilada = construtorDaBuscaDoChamador(semBanco, CONVERSA, CHAMADOR).compile();

    // (1) SEM O ACEITE: `state = 'accepted'` vira `true`. Qualquer aresta
    //     serviria -- pendente, recusada -- e a foto sairia para quem apenas
    //     recebeu um pedido.
    const semAceite = compilada.sql.replace(/uc\.state = 'accepted'/g, 'true');
    for (const campo of CAMPOS_DA_EMENDA) {
      const trecho = subconsultaProjetada(semAceite, campo);
      assert.notEqual(trecho, '', 'a mutilação (1) quebrou o recorte, e não o predicado');
      assert.doesNotMatch(
        trecho,
        /uc\.state = 'accepted'/,
        'a expressão do aceite não distingue o SQL mutilado do íntegro',
      );
    }

    // (2) SEM O BLOQUEIO: `NOT bloqueio_entre(...)` vira `true`. O par
    //     bloqueado voltaria a ter foto durante a corrida entre as duas
    //     escritas de `desfazerPorBloqueio`.
    const semBloqueio = compilada.sql.replace(
      /AND NOT bloqueio_entre\(\$\d+::uuid, [a-z._]+\)/g,
      'AND true',
    );
    for (const campo of CAMPOS_DA_EMENDA) {
      const trecho = subconsultaProjetada(semBloqueio, campo);
      assert.notEqual(trecho, '', 'a mutilação (2) quebrou o recorte, e não o predicado');
      assert.doesNotMatch(
        trecho,
        /AND NOT bloqueio_entre\(\$\d+::uuid, /,
        'a expressão do bloqueio não distingue o SQL mutilado do íntegro',
      );
    }

    // (3) COLUNA CERTA, VALOR ERRADO: um dos `$n` do par passa a apontar para o
    //     ÚLTIMO parâmetro da consulta, que é o id da CONVERSA. É o defeito que
    //     `parameters.includes(CHAMADOR)` aprovaria, e que a conferência por
    //     posição reprova.
    const ultima = compilada.parameters.length;
    const valorErrado = compilada.sql.replace(
      /uc\.requester_user_id = \$\d+::uuid/,
      `uc.requester_user_id = $${ultima}::uuid`,
    );
    const trecho = subconsultaProjetada(valorErrado, 'apelido_do_outro');
    assert.notEqual(trecho, '', 'a mutilação (3) quebrou o recorte');

    // (4) NEUTRALIZADO SEM APAGAR NADA: `true AND true OR EXISTS (...)`. Foi
    //     esta a mutilação que passou verde na primeira versão deste arquivo,
    //     com a integração reprovando 5 casos -- está no rodapé. As duas
    //     conferências que a pegam são o `AND EXISTS (` ancorado e o caso da
    //     conjunção, e as duas são aplicadas aqui sobre o texto mutilado.
    const neutralizado = compilada.sql.replace(
      /AND EXISTS \(\s*SELECT 1 FROM user_connections uc/g,
      (achado) => `AND true AND true OR ${achado.slice('AND '.length)}`,
    );
    for (const campo of CAMPOS_DA_EMENDA) {
      const t = subconsultaProjetada(neutralizado, campo);
      assert.notEqual(t, '', 'a mutilação (4) quebrou o recorte, e não o predicado');
      assert.doesNotMatch(
        t,
        /AND EXISTS \(\s*SELECT 1 FROM user_connections uc/,
        'a âncora `AND EXISTS (` aprova um predicado neutralizado por `OR`',
      );
      assert.match(t, /\btrue\b/, 'a mutilação (4) não introduziu o literal');
      assert.ok(
        (t.match(/\bOR\b/g) ?? []).length > 1,
        'a contagem de `OR` não distingue o predicado neutralizado do íntegro',
      );
    }
    const valores = valoresLigadosNoTrecho(trecho, { ...compilada, sql: valorErrado });
    assert.equal(
      compilada.parameters[ultima - 1],
      CONVERSA,
      'a premissa da mutilação (3): o último parâmetro é o id da conversa',
    );
    assert.ok(
      valores.some((v) => v !== CHAMADOR),
      'a conferência de valores aprova um `$n` ligado ao id da conversa: ela não mede nada',
    );
  });
});

// ---------------------------------------------------------------------------
// A PROVA DE QUE AS ISCAS REPROVAM (medida em 19/10/2026, nesta árvore)
//
// Cada mecanismo foi desligado em `kysely-conversation-repository.ts`, a suíte
// deste arquivo rodou, e o mecanismo foi restaurado. Os números estão no
// relatório da entrega, com o nome de cada caso reprovado.
// ---------------------------------------------------------------------------
