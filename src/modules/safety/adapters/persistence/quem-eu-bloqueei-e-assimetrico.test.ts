/**
 * **ISCA (a): A LISTA TRAZ QUEM EU BLOQUEEI, E NÃO TRAZ QUEM ME BLOQUEOU.**
 *
 * Decisão do cliente, 19/10/2026: *uma lista de quem você bloqueou, na gaveta
 * do Perfil, e o desbloqueio acontece ali*. A operação existe porque o bloqueio
 * é **simétrico** e isso tinha uma consequência que ninguém havia medido — quem
 * bloqueou também recebe `404` no perfil da pessoa bloqueada, e o
 * "Desbloquear" morava dentro daquele perfil. Bloquear era irreversível pelo
 * aplicativo.
 *
 * ## Por que a prova é o SQL compilado, e não um `expect` sobre duas listas
 *
 * Porque a metade que importa é de **OMISSÃO**: "a lista não traz quem me
 * bloqueou". Omissão não se mede inserindo dois bloqueios e contando um — um
 * caso assim passaria igual num mundo em que a consulta usa `bloqueio_entre` e
 * a segunda linha simplesmente não existia na massa. O que se mede é **qual
 * predicado está no `WHERE`**:
 *
 * - **a igualdade `blocker_user_id = quem chama` está lá**, e é ela que torna a
 *   leitura assimétrica;
 * - **`bloqueio_entre` NÃO está lá**, e é essa ausência que impede a segunda
 *   metade do par de aparecer. Aquela função é simétrica de propósito, e usá-la
 *   aqui devolveria também quem bloqueou quem chama — que é o oráculo *"ela te
 *   bloqueou"*, e descobrir que foi bloqueado é o que gera retaliação.
 *
 * O comportamento foi exercitado em `BEGIN/ROLLBACK` sobre um Postgres
 * descartável, com as duas metades do par plantadas, e está no relatório da
 * entrega. O que este arquivo guarda é o que a suíte unitária guarda sem banco:
 * que o mecanismo **está escrito**, e que a versão simétrica dele reprova.
 *
 * É a mesma forma de `bloqueio-e-ocultacao-na-clausula-where.test.ts`, ao lado.
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
import {
  construtorDaContagemDeQuemEuBloqueei,
  construtorDeQuemEuBloqueei,
} from './kysely-safety-repository.js';

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

const CHAMADOR = '11111111-1111-7111-8111-111111111111';

function sqlDaPagina(): string {
  return construtorDeQuemEuBloqueei(semBanco, CHAMADOR, 1, 20).sql;
}

void describe('ISCA (a): a lista e de quem EU bloqueei, e so dela', () => {
  void it('CONTRAPESO -- a consulta EXISTE e le `user_blocks` juntando a pessoa', () => {
    // Sem ele, todos os casos de omissão abaixo passariam num mundo em que a
    // consulta não existe — que é a forma mais fácil de um teste de omissão
    // ficar verde sem ter medido nada.
    const sql = sqlDaPagina();
    assert.match(sql, /from "user_blocks" as "b"/, sql);
    assert.match(sql, /inner join "users" as "u" on "u"\."id" = "b"\."blocked_user_id"/, sql);
    assert.match(sql, /"u"\."public_ref"/, sql);
    assert.match(sql, /"b"\."created_at"/, sql);
  });

  void it('A IGUALDADE ESTA NO `WHERE`, e ela carrega quem chama como parametro', () => {
    // Parâmetro, e não literal: com o valor interpolado no texto, a autorização
    // passaria a depender de alguém ter montado a cadeia certa, e o caminho novo
    // que a montasse errado abriria o furo sem nada acusar.
    const { sql, parameters } = construtorDeQuemEuBloqueei(semBanco, CHAMADOR, 1, 20);
    assert.match(sql, /where "b"\."blocker_user_id" = \$\d/, sql);
    // A LISTA INTEIRA de parâmetros, e não só a posição que interessa: ancorar
    // no conjunto é o que faz um parâmetro novo (uma pessoa, um termo de busca)
    // reprovar aqui em vez de entrar sem ninguém ver.
    assert.deepEqual(parameters, ['pessoa', CHAMADOR, CHAMADOR, 20, 0]);
    // E a página 3 de 20 pede o salto certo. Sem isto, um `offset` errado
    // esconderia linhas e o caso acima continuaria verde.
    assert.deepEqual(
      construtorDeQuemEuBloqueei(semBanco, CHAMADOR, 3, 20).parameters,
      ['pessoa', CHAMADOR, CHAMADOR, 20, 40],
    );
  });

  void it('A OMISSAO QUE IMPORTA -- `bloqueio_entre` NAO aparece na consulta', () => {
    const sql = sqlDaPagina();
    assert.ok(
      !sql.includes('bloqueio_entre'),
      'a consulta passou a usar `bloqueio_entre`, que é SIMÉTRICA: a lista passaria a ' +
        'devolver também quem bloqueou quem chama, que é o oráculo "ela te bloqueou" — ' +
        `e descobrir que foi bloqueado é o que gera retaliação.\n${sql}`,
    );
    // E a coluna do outro sentido não entra no `WHERE` por nenhum outro nome:
    // um `OR "b"."blocked_user_id" = $1` escrito à mão faria o mesmo dano sem
    // chamar a função.
    assert.ok(
      !/where[\s\S]*"b"\."blocked_user_id"\s*=\s*\$/.test(sql),
      `o \`WHERE\` passou a comparar \`blocked_user_id\` com quem chama: é a metade ` +
        `simétrica escrita à mão, e o dano é o mesmo.\n${sql}`,
    );
  });

  void it('ISCA POR DESLIGAMENTO -- a versao simetrica NAO passaria nos dois casos acima', () => {
    // A consulta enfraquecida: a que alguém escreveria "reusando o predicado
    // que já existe". Se as conferências de cima passassem a aceitá-la, a
    // assimetria deixaria de ser cobrada sem que nada ficasse vermelho.
    const simetrica = semBanco
      .selectFrom('user_blocks as b')
      .innerJoin('users as u', 'u.id', 'b.blocked_user_id')
      .select('u.public_ref as public_ref')
      .where((eb) =>
        eb.or([
          eb('b.blocker_user_id', '=', CHAMADOR),
          eb('b.blocked_user_id', '=', CHAMADOR),
        ]),
      )
      .compile().sql;
    assert.ok(
      /"b"\."blocked_user_id"\s*=\s*\$/.test(simetrica),
      'a isca precisa ser uma consulta simétrica de verdade, senão ela não mede nada',
    );
  });

  void it('a conta DESABILITADA nao vem, e e a decisao do cliente de 17/10', () => {
    // "Não é mais encontrada em nenhuma página ou funcionalidade". Aqui ela não
    // deixa nada preso: conta desabilitada não aparece em superfície nenhuma,
    // então o bloqueio dela não tem efeito a desfazer — e a linha VOLTA com a
    // conta, porque ela nunca foi apagada.
    const sql = sqlDaPagina();
    assert.match(sql, /conta_habilitada\(u\.id\)/, sql);
    assert.match(sql, /conta_habilitada\(\$\d::uuid\)/, sql);
  });

  void it('a ocultacao por denuncia NAO entra, e a divergencia e deliberada', () => {
    // `perfil_ocultado_para_quem_denunciou` existe para quem denunciou parar de
    // ver as superfícies DO ALVO. Esta lista não é superfície do alvo: é o
    // registro dos atos de quem chama, e a linha só existe porque quem chama a
    // criou. Esconder o próprio ato de quem o praticou devolveria o beco sem
    // saída que esta leitura existe para fechar.
    assert.ok(
      !sqlDaPagina().includes('perfil_ocultado_para_quem_denunciou'),
      'a linha de quem eu bloqueei E denunciei sumiu da lista: o bloqueio dela fica sem volta',
    );
  });

  void it('a ORDEM e fixa e tem desempate: pagina nao perde linha entre duas chamadas', () => {
    // Sem o desempate, dois bloqueios do mesmo instante podem trocar de lugar
    // entre duas páginas e uma pessoa desaparece da lista sem nunca ter sido
    // mostrada — e ela fica bloqueada para sempre.
    const sql = sqlDaPagina();
    assert.match(sql, /order by "b"\."created_at" desc, "u"\."public_ref" asc/, sql);
    assert.match(sql, /limit \$\d offset \$\d/, sql);
  });

  void it('NENHUMA COLUNA DE PET, DE ENDERECO NEM DE FOTO e selecionada', () => {
    // O que não está no `SELECT` não tem como sair. A emenda 3 do ADR-0010
    // abriu a foto de perfil em UMA superfície — a conversa mediada, e só entre
    // conexões aceitas —, e bloqueado é o oposto de conexão aceita.
    const sql = sqlDaPagina();
    for (const proibida of [
      'photo_image_id',
      'photo_url',
      'pets',
      'city',
      'neighbourhood',
      'birth_date',
      'email',
      'phone',
      'user_showcase_images',
      'user_connections',
    ]) {
      assert.ok(!sql.includes(proibida), `\`${proibida}\` entrou na consulta da lista\n${sql}`);
    }
    // E `users.id` não é projetado: o UUID interno não atravessa borda nenhuma
    // (ADR-0010 item 6). O que endereça a pessoa aqui é `public_ref`.
    assert.ok(!/select[\s\S]*"u"\."id" as/.test(sql), `\`users.id\` passou a ser projetado\n${sql}`);
  });

  void it('a CONTAGEM usa a MESMA clausula `WHERE` da pagina', () => {
    // Duas cláusulas diferentes dariam um `total` que não corresponde às
    // linhas, e a tela diria "3 pessoas" sobre uma lista de duas.
    const contagem = construtorDaContagemDeQuemEuBloqueei(semBanco, CHAMADOR).sql;
    assert.match(contagem, /where "b"\."blocker_user_id" = \$1/, contagem);
    assert.match(contagem, /conta_habilitada\(u\.id\)/, contagem);
    assert.ok(!contagem.includes('bloqueio_entre'), contagem);
  });
});
