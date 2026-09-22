#!/usr/bin/env node
/* global console, process */
// A diretiva acima nao e decoracao: o ESLint deste repositorio nao declara os
// globais de Node para `**/*.mjs` fora de `src/`, entao `console` e `process`
// reprovam em `no-undef`. `/* eslint-env node */` nao serve -- a configuracao
// plana do ESLint 9 deixou de honrar `eslint-env`.
/**
 * BICHUS-125 -- a DESCIDA nao pode rodar junto com a subida.
 *
 * ====================================================================
 * O DEFEITO QUE ESTE PORTAO EXISTE PARA PEGAR
 * ====================================================================
 *
 * `migrations/20260922000001_motivo-de-revogacao-por-sair-de-todos.sql` foi a
 * unica migracao do repositorio sem o marcador `-- Up Migration`. O
 * `node-pg-migrate` faz, em `dist/legacy/sqlMigration.js`:
 *
 *     const upSql = upMigrationStart >= 0 ? content.slice(...) : content;
 *
 * Sem o marcador, `upSql` e o ARQUIVO INTEIRO. A metade de cima acrescentava
 * `logout_all` a `refresh_tokens_revoked_reason_check` e a metade de baixo --
 * que e a descida -- o removia na sequencia. A migracao terminou registrada em
 * `pgmigrations` como APLICADA, o `COMMENT ON COLUMN` sobreviveu prometendo
 * `logout_all`, e a restricao voltou a ser a antiga.
 *
 * Nada acusou. A migracao **aplica-se com sucesso**: nao ha erro, nao ha saida
 * diferente de zero, nao ha linha vermelha em lugar nenhum. O banco fica errado
 * em silencio, e o defeito so aparece quando uma pessoa aperta "sair de todos
 * os aparelhos" e leva 500 -- que foi como este caso foi descoberto, com o
 * remedio de quem perdeu o aparelho quebrado em `development` por um dia.
 *
 * ====================================================================
 * POR QUE ESTE PORTAO NAO PROCURA O TEXTO `-- Up Migration`
 * ====================================================================
 *
 * Porque o que decide nao e o texto que eu acho que o node-pg-migrate procura:
 * e a expressao regular que ele de fato usa, e ela e bem mais larga do que a
 * string parece --
 *
 *     ^\s*--[\s-]*up\s+migration    (com `i` e `m`)
 *
 * `-- UP MIGRATION`, `---- up   migration` e `  --up migration` sao todos
 * marcadores validos para ele. Um portao que casasse a string exata
 * `-- Up Migration` reprovaria os tres, e um portao que reprova quem esta certo
 * e desligado na primeira semana.
 *
 * Entao este arquivo **importa o proprio parser** (`node-pg-migrate/sqlMigration`,
 * caminho publico declarado no `exports` do pacote), entrega a ele o conteudo do
 * arquivo e le o SQL que ele produziu para a subida. O que se confere e o
 * RESULTADO da ferramenta, nao um palpite sobre ela. Se o node-pg-migrate mudar
 * de regra, este portao muda junto, sozinho.
 *
 * ====================================================================
 * AS TRES FAMILIAS, E POR QUE SAO TRES
 * ====================================================================
 *
 * 1. **A subida contem a descida.** E o defeito da BICHUS-125, e e o unico que
 *    se mede diretamente: se o SQL que o node-pg-migrate vai executar como
 *    subida ainda carrega o marcador de descida dentro dele, a descida roda
 *    junto. Esta e a familia que importa; as outras duas fecham as portas
 *    laterais.
 *
 * 2. **Nao ha descida.** Migracao sem `down` nao e reversivel, e o documento de
 *    arquitetura cobra os dois sentidos. Ela tambem e o jeito mais facil de
 *    fazer a familia 1 ficar verde: apague o marcador de descida e a subida
 *    para de conte-lo. Sem esta conferencia, o conserto mais barato do portao e
 *    exatamente o que piora o repositorio.
 *
 * 3. **Marcador repetido.** `content.search()` devolve a PRIMEIRA ocorrencia.
 *    Um segundo `-- Up Migration` mais abaixo nao faz nada, e -- pior -- um
 *    `-- Down Migration` escrito por engano num comentario ACIMA do de verdade
 *    corta a subida ali, em silencio, e metade do arquivo nunca roda. E a mesma
 *    classe de defeito da familia 1, pelo outro lado: SQL que o autor escreveu
 *    e que o banco nunca ve.
 *
 * As 16 migracoes do repositorio passam nas tres hoje. Isto nao e observacao de
 * passagem: um portao cuja primeira execucao reprova o acervo inteiro e um
 * portao que nasce com `continue-on-error`.
 *
 * ====================================================================
 * O QUE ESTE PORTAO NAO FAZ
 * ====================================================================
 *
 * Ele nao afirma que a subida teve o efeito que o autor quis. Isso e pergunta
 * para banco, nao para texto, e quem a responde e `tests/integration/` sobre a
 * pilha efemera, que migra do zero a cada execucao -- `esquema.test.ts` para o
 * esquema em geral e `sair-de-todos-pelo-http.test.ts` para a restricao desta
 * historia.
 *
 * Vale dizer por que a versao generica disso NAO foi escrita aqui, porque ela e
 * tentadora e nao teria pego este caso: "aplicar a migracao N e exigir que o
 * esquema tenha mudado" parece medir a classe inteira, e a migracao 000001
 * PASSARIA -- o `COMMENT ON COLUMN` dela sobreviveu, entao o esquema mudou.
 * Teria sido mais um portao de varredura nascendo furado.
 *
 * ====================================================================
 * ISCAS, E POR QUE ELAS SAO DE DISCO E NAO DE FRASE
 * ====================================================================
 *
 * "Testei nos dois sentidos e acusou certo" e afirmacao, nao evidencia:
 * ninguem consegue reexecuta-la, e ela nao acusa no dia em que a regra deixa de
 * funcionar. Por isso os casos moram em
 * `infra/verificacao/iscas/marcador-de-migracao/` e a esteira EXIGE o veredito
 * de cada um: `deve-reprovar-*.sql` precisa reprovar, `deve-passar-*.sql`
 * precisa passar.
 *
 * O autoteste roda ANTES da varredura real, sempre, e se qualquer isca der o
 * veredito errado o processo termina em 1 sem nem olhar para `migrations/`.
 *
 * As iscas passam pela MESMA funcao `julgar` que as migracoes de verdade. Duas
 * rotas de julgamento significam que a isca prova a rota errada.
 *
 * Uso:
 *   node infra/verificacao/verificar-marcador-de-migracao.mjs [diretorio]
 *   node infra/verificacao/verificar-marcador-de-migracao.mjs --autoteste
 *
 * Saida: 0 aprovado, 1 reprovado.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { getActions } from 'node-pg-migrate/sqlMigration';

const DIRETORIO_PADRAO = 'migrations';
const DIRETORIO_DAS_ISCAS = 'infra/verificacao/iscas/marcador-de-migracao';

/**
 * A MESMA expressao do `node-pg-migrate`, copiada de `dist/legacy/sqlMigration.js`.
 *
 * Ela serve so para CONTAR ocorrencias (familia 3) e para procurar o marcador de
 * descida DENTRO do SQL de subida (familia 1). O veredito sobre onde a subida
 * comeca e termina nao sai daqui: sai do `getActions` do proprio pacote.
 *
 * `g` para contar; `i` e `m` porque sao as bandeiras que ele usa.
 */
function marcadorDe(direcao) {
  return new RegExp(`^\\s*--[\\s-]*${direcao}\\s+migration`, 'gim');
}

/**
 * O SQL que o `node-pg-migrate` executaria, extraido pelo proprio pacote.
 *
 * `getActions` devolve funcoes que chamam `pgm.sql(...)`. O dedo falso abaixo
 * captura o argumento -- e a unica forma de ler o texto que ele produziu sem
 * reimplementar a separacao, que e justamente o que nao se pode fazer aqui.
 */
function sqlQueVaiRodar(conteudo) {
  const acoes = getActions(conteudo);

  let subida = '';
  acoes.up({
    sql: (texto) => {
      subida = texto;
    },
  });

  let descida;
  if (acoes.down !== false) {
    descida = '';
    acoes.down({
      sql: (texto) => {
        descida = texto;
      },
    });
  }

  return { subida, descida };
}

/**
 * Julga UM arquivo pelo conteudo. Devolve os motivos de reprovacao; lista vazia
 * e aprovado.
 */
export function julgar(conteudo) {
  const motivos = [];
  const { subida, descida } = sqlQueVaiRodar(conteudo);

  // Familia 1: a subida carrega a descida dentro dela.
  if (marcadorDe('down').test(subida)) {
    motivos.push(
      'a SUBIDA contem o marcador de descida: o `node-pg-migrate` vai executar a ' +
        'descida logo depois da subida, na mesma migracao, e desfazer o que ela acabou ' +
        'de fazer. A migracao nao da erro nenhum -- fica registrada em `pgmigrations` ' +
        'como aplicada e o banco fica errado em silencio. A causa quase sempre e a ' +
        'ausencia do marcador `-- Up Migration`: sem ele o arquivo INTEIRO vira a subida.',
    );
  }

  // Familia 2: nao ha descida.
  if (descida === undefined) {
    motivos.push(
      'nao ha marcador de descida (`-- Down Migration`): esta migracao nao e ' +
        'reversivel, e toda mudanca de esquema deste repositorio tem os dois sentidos. ' +
        'Apagar o marcador de descida tambem e o jeito mais barato de calar a ' +
        'conferencia acima, e por isso as duas andam juntas.',
    );
  }

  // Familia 3: marcador repetido.
  for (const direcao of ['up', 'down']) {
    const quantos = (conteudo.match(marcadorDe(direcao)) ?? []).length;
    if (quantos <= 1) continue;
    motivos.push(
      `o marcador de ${direcao === 'up' ? 'subida' : 'descida'} aparece ${String(quantos)} ` +
        `vezes. O \`node-pg-migrate\` usa \`String.search\`, que devolve a PRIMEIRA ` +
        `ocorrencia: as demais nao fazem nada, e um marcador de descida escrito por engano ` +
        `acima do de verdade corta a subida ali -- metade do arquivo nunca chega ao banco, ` +
        `sem erro nenhum.`,
    );
  }

  return motivos;
}

function varrer(diretorio) {
  if (!existsSync(diretorio)) {
    // Verificacao que nao consegue verificar REPROVA. Um portao apontado para
    // diretorio inexistente termina verde por nao ter achado nada, e ninguem
    // procura o que acredita ja ter.
    console.error(
      `REPROVA: o diretorio \`${diretorio}\` nao existe. O portao nao tem o que conferir, ` +
        `e "nao achei nada" nao e o mesmo que "conferi e esta limpo".`,
    );
    return 1;
  }

  const arquivos = readdirSync(diretorio)
    .filter((nome) => nome.endsWith('.sql'))
    .sort();

  if (arquivos.length === 0) {
    console.error(
      `REPROVA: nenhum arquivo \`.sql\` em \`${diretorio}\`. Mesmo motivo do caso acima.`,
    );
    return 1;
  }

  let reprovados = 0;
  for (const nome of arquivos) {
    const motivos = julgar(readFileSync(join(diretorio, nome), 'utf8'));
    if (motivos.length === 0) continue;
    reprovados += 1;
    console.error(`\nREPROVA: ${join(diretorio, nome)}`);
    for (const motivo of motivos) console.error(`  - ${motivo}`);
  }

  if (reprovados > 0) {
    console.error(`\n${String(reprovados)} de ${String(arquivos.length)} migracoes reprovaram.\n`);
    return 1;
  }

  console.log(
    `APROVADO: as ${String(arquivos.length)} migracoes de \`${diretorio}\` separam subida e ` +
      `descida pelo parser do proprio node-pg-migrate.`,
  );
  return 0;
}

function autoteste() {
  if (!existsSync(DIRETORIO_DAS_ISCAS)) {
    console.error(
      `REPROVA: \`${DIRETORIO_DAS_ISCAS}\` nao existe. Sem isca este portao passa a valer ` +
        `por confianca no dia em que foi escrito, que e exatamente o que ele existe para ` +
        `nao aceitar.`,
    );
    return 1;
  }

  const iscas = readdirSync(DIRETORIO_DAS_ISCAS)
    .filter((nome) => nome.endsWith('.sql'))
    .sort();

  const deveReprovar = iscas.filter((n) => n.startsWith('deve-reprovar-'));
  const devePassar = iscas.filter((n) => n.startsWith('deve-passar-'));

  // Os DOIS lados precisam existir. So iscas que reprovam nao distinguem um
  // portao que enxerga de um portao que reprova tudo.
  if (deveReprovar.length === 0 || devePassar.length === 0) {
    console.error(
      `REPROVA: o conjunto de iscas precisa dos DOIS lados e tem ` +
        `${String(deveReprovar.length)} que devem reprovar e ${String(devePassar.length)} ` +
        `que devem passar. Um portao que reprova todo mundo e desligado na primeira semana, ` +
        `e sem isca de aprovacao ninguem percebe que ele virou isso.`,
    );
    return 1;
  }

  let errou = 0;
  for (const nome of iscas) {
    const esperaReprovar = nome.startsWith('deve-reprovar-');
    const motivos = julgar(readFileSync(join(DIRETORIO_DAS_ISCAS, nome), 'utf8'));
    const reprovou = motivos.length > 0;

    if (reprovou === esperaReprovar) {
      console.log(`  isca ok: ${nome} ${reprovou ? 'reprovou' : 'passou'}`);
      continue;
    }

    errou += 1;
    console.error(
      `  ISCA ERRADA: ${nome} ` +
        `${reprovou ? 'REPROVOU e deveria passar' : 'PASSOU e deveria reprovar'}` +
        (reprovou ? `\n    motivos: ${motivos.join(' | ')}` : ''),
    );
  }

  if (errou > 0) {
    console.error(
      `\nREPROVA: ${String(errou)} isca(s) com veredito errado. O portao parou de enxergar, ` +
        `e a varredura real NAO rodou -- a partir daqui o verde dele nao significaria nada.\n`,
    );
    return 1;
  }

  console.log(`autoteste: ${String(iscas.length)} iscas, todas com o veredito esperado.`);
  return 0;
}

const argumentos = process.argv.slice(2);
if (argumentos.includes('--autoteste')) {
  process.exit(autoteste());
}

// As iscas rodam ANTES da varredura real, sempre. Nao ha modo de pular.
const vereditoDasIscas = autoteste();
if (vereditoDasIscas !== 0) process.exit(vereditoDasIscas);

process.exit(varrer(argumentos[0] ?? DIRETORIO_PADRAO));
