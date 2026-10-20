/**
 * ISCAS (a), (c) e (e), lidas no SQL e no texto das migrações.
 *
 * ## (a) O BLOQUEADO NÃO APARECE NAS LEITURAS DO BLOQUEADOR, E VICE-VERSA
 *
 * As duas metades dependem de coisas diferentes, e por isso são dois casos:
 *
 * - a PRIMEIRA metade depende de o predicado estar no `WHERE` da resolução do
 *   alvo, carregando quem chama — o que se lê no SQL compilado;
 * - a SEGUNDA metade depende de a função SQL ser **simétrica** — o que se lê no
 *   corpo dela, na migração. Uma função que olhasse só um sentido deixaria quem
 *   foi bloqueado continuar vendo quem o bloqueou, que é exatamente a situação
 *   de quem bloqueia por estar sendo perseguido.
 *
 * **O contrapeso está no primeiro caso de todos**: sem bloqueio, a consulta
 * encontra a pessoa. Sem ele, um repositório que devolvesse `undefined` sempre
 * passaria em tudo.
 *
 * ## (c) A OCULTAÇÃO IMEDIATA VALE SÓ PARA QUEM DENUNCIOU
 *
 * As três funções de ocultação recebem **o leitor** e filtram por ele. Uma que
 * esquecesse o leitor ocultaria o alvo para todo mundo — e aí uma denúncia
 * passaria a ser o custo inteiro de apagar o conteúdo de alguém, que é o
 * argumento que a `20261017000017` já escreveu para a avaliação.
 *
 * ## (e) DENÚNCIA DE CONTA SEM E-MAIL CONFIRMADO NÃO ORDENA A FILA
 *
 * E o caso que pega o defeito real é o último: o peso **não pode ser a mesma
 * função** que o filtro. Se fossem a mesma, a denúncia da conta sem e-mail
 * confirmado DESAPARECERIA da fila em vez de só não ordená-la — e desaparecer é
 * julgar sem olhar.
 *
 * ## Por que lendo texto, e não rodando
 *
 * O comportamento foi exercitado em `BEGIN/ROLLBACK` sobre a base montada com
 * as 63 migrações, e está relatado. O que este arquivo guarda é o que a suíte
 * unitária consegue guardar sem banco: que o mecanismo **está escrito** e que
 * uma versão enfraquecida dele reprova.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';

import type { Database } from '../../../../shared/db/schema.js';

const MIGRACOES = 'migrations';

function migracao(trecho: string): string {
  const arquivo = readdirSync(MIGRACOES).find((nome) => nome.includes(trecho));
  // Não achar alvo é REPROVAÇÃO, nunca aprovação: sem a migração, os casos
  // abaixo ficariam verdes por não ter o que comparar.
  assert.ok(arquivo !== undefined, `a migração \`${trecho}\` sumiu de \`${MIGRACOES}\`.`);
  return readFileSync(join(MIGRACOES, arquivo), 'utf8');
}

/** O corpo de uma função SQL, do `CREATE FUNCTION` ao `$$` de fechamento. */
function corpoDaFuncao(texto: string, nome: string): string {
  const inicio = texto.indexOf(`CREATE FUNCTION ${nome}`);
  assert.ok(inicio >= 0, `\`${nome}\` não está na migração`);
  const resto = texto.slice(inicio);
  const fim = resto.indexOf('$$', resto.indexOf('AS $$') + 5);
  assert.ok(fim > 0, `\`${nome}\` não fecha o corpo`);
  return resto.slice(0, fim);
}

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

void describe('(a) o bloqueio está na cláusula WHERE, e é SIMÉTRICO', () => {
  const bloqueio = migracao('bloquear-alguem');

  void it('CONTRAPESO: a consulta de alvo encontra a pessoa pelo endereço público', () => {
    // A forma da consulta sem o predicado do bloqueio — que é o que o
    // repositório faria se alguém o removesse. Ela acha pelo `public_ref`, e é
    // isso que faz a conferência seguinte significar algo: o predicado do
    // bloqueio é o que TIRA uma pessoa que seria encontrada.
    const { sql } = semBanco
      .selectFrom('users')
      .select('id')
      .where('public_ref', '=', 'AAAAAAAAAAAAAAAAAAAAAA')
      .compile();
    assert.match(sql, /"public_ref"\s*=\s*\$1/, sql);
    assert.ok(!/bloqueio_entre/.test(sql), 'o contrapeso precisa ser a consulta SEM o predicado');
  });

  void it('a resolução do alvo nega `bloqueio_entre` com quem chama', () => {
    // A MESMA expressão que `contaVisivelPara` monta, compilada: o predicado
    // entra NEGADO e carrega quem chama como parâmetro. Sem o parâmetro, a
    // autorização passaria a depender de alguém ter lido o bloqueio antes — e o
    // caminho novo que esquecesse a leitura abriria o furo sem nada acusar.
    const fonte = readFileSync(
      join('src', 'modules', 'safety', 'adapters', 'persistence', 'kysely-safety-repository.ts'),
      'utf8',
    );
    assert.match(
      fonte,
      /NOT bloqueio_entre\(users\.id, \$\{chamador\}::uuid\)/,
      'a resolução do alvo deixou de negar `bloqueio_entre` com quem chama no WHERE',
    );
    // **E ELA ENTRA EM TODA RESOLUÇÃO DE ALVO.**
    //
    // Até 20/10/2026 esta conferência exigia **uma** resolução, e a razão
    // escrita era "duas são dois lugares onde o predicado pode faltar". Em
    // 20/10 nasceu a segunda, e ela é legítima: `construtorDoAlvoDaPublicacao`
    // resolve uma PUBLICAÇÃO, que não é uma pessoa e não pode ser achada por
    // `contaVisivelPara` — a denúncia de publicação passou a conferir o alvo
    // quando `user_publications` pousou.
    //
    // **O invariante correto nunca foi "existe uma": é "toda uma carrega o
    // predicado".** Exigir uma só era a forma barata de garantir isso enquanto
    // havia uma só, e ela reprovou a segunda resolução certa — o que é o
    // comportamento desejado de um portão: avisar. A troca é esta, e ela é mais
    // forte, não mais fraca: as duas são enumeradas POR NOME e as duas têm de
    // negar o bloqueio, e uma terceira reprova aqui.
    const resolucoes = [...fonte.matchAll(/NOT bloqueio_entre\(([^,]+), \$\{chamador\}::uuid\)/g)]
      .map((achado) => achado[1])
      .sort();
    assert.deepEqual(
      resolucoes,
      ['p.author_user_id', 'users.id'],
      'as resoluções de alvo deste arquivo mudaram. Cada uma é um lugar onde o ' +
        'predicado do bloqueio pode faltar: `users.id` é a da PESSOA ' +
        '(`contaVisivelPara`, perfil e foto) e `p.author_user_id` é a da ' +
        'PUBLICAÇÃO (`construtorDoAlvoDaPublicacao`). Uma resolução nova entra ' +
        'nesta lista com o predicado, ou não entra.',
    );
    assert.match(fonte, /conta_habilitada\(users\.id\)/, 'conta desabilitada deixou de ser filtrada');
  });

  void it('A SEGUNDA METADE: `bloqueio_entre` olha os DOIS sentidos', () => {
    const corpo = corpoDaFuncao(bloqueio, 'bloqueio_entre');
    // Os dois pares, e o `OR` entre eles. É isto que faz "e vice-versa" ser
    // verdade: o bloqueado também não vê quem o bloqueou.
    assert.match(corpo, /b\.blocker_user_id = p_um\s+AND b\.blocked_user_id = p_outro/, corpo);
    assert.match(corpo, /b\.blocker_user_id = p_outro\s+AND b\.blocked_user_id = p_um/, corpo);
    assert.match(corpo, /\bOR\b/, corpo);
  });

  void it('ISCA POR DESLIGAMENTO: a versão de um sentido só não casa a conferência', () => {
    // A função enfraquecida — a que alguém escreveria por economia — não tem o
    // segundo par. Se a conferência acima passasse a aceitá-la, "e vice-versa"
    // deixaria de ser cobrado sem que nada ficasse vermelho.
    const umSentidoSo = `CREATE FUNCTION bloqueio_entre(p_um uuid, p_outro uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM user_blocks b
     WHERE b.blocker_user_id = p_um    AND b.blocked_user_id = p_outro)
$$;`;
    assert.ok(
      !/b\.blocker_user_id = p_outro\s+AND b\.blocked_user_id = p_um/.test(umSentidoSo),
      'a isca precisa ser uma função assimétrica de verdade',
    );
  });

  void it('o bloqueio NÃO entra na fila do painel, e a migração diz isso por extenso', () => {
    // `user_blocks` não é moderação: sem administrador, sem revisão, efeito
    // imediato. A ausência é de propósito e está escrita onde quem mexer vai
    // ler.
    assert.match(bloqueio, /NAO ENTRA NA FILA/i, 'a decisão saiu da migração');
    assert.ok(
      !/fila_de_moderacao\s+AS|UNION ALL/i.test(bloqueio),
      '`user_blocks` ganhou uma perna na fila: bloquear virou moderação',
    );
  });

  void it('ninguém bloqueia a si mesmo, e o par é ORDENADO', () => {
    assert.match(bloqueio, /CHECK \(blocker_user_id <> blocked_user_id\)/, bloqueio);
    // Par ORDENADO: A bloquear B e B bloquear A são dois atos, e desbloquear é
    // de quem bloqueou. Com índice sobre par não-ordenado, o desbloqueio de um
    // apagaria o bloqueio do outro.
    assert.match(
      bloqueio,
      /CREATE UNIQUE INDEX user_blocks_um_por_par\s+ON user_blocks \(blocker_user_id, blocked_user_id\)/,
      bloqueio,
    );
  });
});

void describe('(c) a ocultação imediata vale SÓ para quem denunciou', () => {
  const denuncia = migracao('denunciar-perfil-foto-e-publicacao');

  void it('as três funções recebem o leitor e filtram por ele', () => {
    for (const nome of [
      'perfil_ocultado_para_quem_denunciou',
      'foto_ocultada_para_quem_denunciou',
      'publicacao_ocultada_para_quem_denunciou',
    ]) {
      const corpo = corpoDaFuncao(denuncia, nome);
      assert.match(corpo, /p_leitor/, `${nome} não recebe o leitor`);
      assert.match(
        corpo,
        /d\.reporter_user_id = p_leitor/,
        `${nome} não filtra por quem denunciou: ela oculta para TODO MUNDO, e aí uma ` +
          'denúncia passa a ser o custo inteiro de apagar o conteúdo de alguém',
      );
    }
  });

  void it('elas NÃO olham `resolved_at`: quem denunciou continua não vendo', () => {
    // Quem denunciou e não quer mais ver não precisa concordar com a decisão do
    // administrador para continuar não vendo.
    for (const nome of [
      'perfil_ocultado_para_quem_denunciou',
      'foto_ocultada_para_quem_denunciou',
      'publicacao_ocultada_para_quem_denunciou',
    ]) {
      assert.ok(
        !corpoDaFuncao(denuncia, nome).includes('resolved_at'),
        `${nome} passou a depender da decisão do administrador: a ocultação deixou de ser imediata`,
      );
    }
  });

  void it('ISCA POR DESLIGAMENTO: a versão sem o leitor não passa a conferência', () => {
    const semLeitor = `CREATE FUNCTION perfil_ocultado_para_quem_denunciou(p_subject_ref text, p_leitor uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM profile_reports d WHERE d.subject_ref = p_subject_ref)
$$;`;
    assert.ok(
      !/d\.reporter_user_id = p_leitor/.test(semLeitor),
      'a isca precisa ser a função que oculta para todo mundo',
    );
  });
});

void describe('(e) denúncia de conta sem e-mail confirmado não ORDENA a fila', () => {
  const denuncia = migracao('denunciar-perfil-foto-e-publicacao');

  void it('o peso exige e-mail confirmado', () => {
    const corpo = corpoDaFuncao(denuncia, 'denunciante_ordena_a_fila');
    assert.match(corpo, /email_verified_at IS NOT NULL/, corpo);
    // E delega a definição de conta habilitada, em vez de copiá-la.
    assert.match(corpo, /conta_habilitada\(/, corpo);
  });

  void it('O CASO QUE IMPORTA: o PESO não é a mesma função que o FILTRO', () => {
    // Se fossem a mesma, a denúncia da conta sem e-mail confirmado
    // DESAPARECERIA da fila em vez de só não ordená-la. Desaparecer é julgar sem
    // olhar, e não é o desenho: ela ENTRA e não PESA.
    const filtro = corpoDaFuncao(denuncia, 'denuncia_de_perfil_com_denunciante_ativo');
    assert.ok(
      !filtro.includes('email_verified_at'),
      'o filtro passou a exigir e-mail confirmado: a denúncia da conta sem e-mail ' +
        'confirmado deixou de aparecer na fila, em vez de só não ordená-la',
    );
    assert.match(filtro, /conta_habilitada\(d\.reporter_user_id\)/, filtro);
  });

  void it('há filtro para cada uma das três origens novas, e não um só', () => {
    // Três lugares em `src/` leem a fila — listagem, leitura e a contagem do
    // aviso do menu — e a `20261017000016` registra o episódio em que filtrar
    // num lugar só fez o painel dizer "1 pendente" sobre fila vazia.
    for (const nome of [
      'denuncia_de_perfil_com_denunciante_ativo',
      'denuncia_de_foto_com_denunciante_ativo',
      'denuncia_de_publicacao_com_denunciante_ativo',
    ]) {
      assert.match(denuncia, new RegExp(`CREATE FUNCTION ${nome}`), `${nome} não existe`);
    }
  });

  void it('NÃO há teto por alvo, e a migração diz por quê', () => {
    // Contra brigada a defesa é PESO e não teto: quantas pessoas distintas
    // denunciam o mesmo alvo é o SINAL, e um teto por alvo protegeria justamente
    // quem merece fila.
    assert.match(denuncia, /defesa e peso e nao teto|A DEFESA CONTRA DENUNCIA COORDENADA NAO E TETO/i, 'a decisão saiu da migração');
  });
});
