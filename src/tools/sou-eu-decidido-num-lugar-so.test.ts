import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/**
 * **"ESTE PERFIL É SEU" É DECIDIDO NUM LUGAR SÓ.**
 *
 * ====================================================================
 * O BURACO QUE ESTE PORTÃO EXISTE PARA TAPAR
 * ====================================================================
 *
 * `is_self` entrou no contrato em 03/11/2026 e **duas coisas diferentes passaram
 * a depender dele**: o booleano que a tela lê para esconder as portas de
 * conexão e o `⋮`, e a escolha da porta da vitrine (própria contra a de
 * conexão). São dois consumidores, e é aí que a tentação aparece: escrever o
 * `dono === quemOlha` de novo dentro do `WHERE` da vitrine, ou na borda, ou na
 * tela, porque "é só uma comparação".
 *
 * **UM INTERRUPTOR EM DUAS CÓPIAS NÃO É UM INTERRUPTOR**, e esta casa já pagou
 * por isso com o predicado da audiência do Mural, que esteve escrito à mão em
 * QUATRO lugares. Manter quatro cópias de acordo não é trabalho que alguém faça
 * para sempre: uma delas diverge, e a divergência é silenciosa porque cada cópia
 * sozinha parece certa.
 *
 * ====================================================================
 * O QUE ELE COBRA, E O QUE ELE NÃO COBRA
 * ====================================================================
 *
 * Ele cobra que a COMPARAÇÃO DE IDENTIDADE apareça em um arquivo de produção só
 * -- `perfil-de-pessoa.ts`, no caso de uso --, e que a porta da vitrine própria
 * tenha UM ponto de chamada. Ele **não** cobra quantas vezes `souEu` é LIDO:
 * ler o booleano em três lugares é o desenho certo, e é o oposto do defeito.
 *
 * **E ELE NÃO FALA DAS OUTRAS RECUSAS DO SERVIDOR**, de propósito. A busca de
 * pessoas exclui quem chama no `WHERE`, `requestConnection` recusa o alvo que é
 * o próprio chamador e `blockUser`/`reportUserProfile` devolvem `eu_mesmo`: são
 * TRÊS guardas de operações diferentes, cada uma no ponto onde a sua própria
 * escrita acontece, e isso é o desenho que o ADR-0021 pede (a autorização mora
 * na cláusula `WHERE` da operação). Elas não são cópias de um predicado comum,
 * e juntá-las num só lugar tiraria a guarda de onde ela protege. O que este
 * portão guarda é mais estreito e é o que nasceu em 03/11/2026: **a noção de
 * "sou eu" que a PROJEÇÃO DO PERFIL publica e que dois consumidores leem.**
 *
 * ====================================================================
 * A ARMADILHA DESTA CLASSE DE PORTÃO
 * ====================================================================
 *
 * Portão que varre código-fonte passa por não achar NADA: expressão regular que
 * para de casar, arquivo renomeado, pasta movida -- e ele imprime verde porque
 * não encontrou divergência, não porque não há. As três travas daqui:
 *
 * 1. **Piso de inventário**, e o nome dos arquivos conhecidos na varredura.
 * 2. **Controle positivo**: a comparação TEM de ser achada na fonte que deve
 *    tê-la. Se ela não for achada lá, a varredura quebrou e o portão reprova.
 * 3. **Prosa não conta.** Comentário é retirado antes da contagem -- e os
 *    comentários DESTE repositório citam a comparação de propósito, para
 *    explicar por que ela não se repete. Contar prosa faria o portão reprovar a
 *    documentação que ele mesmo pede.
 */

/** A ÚNICA fonte de produção que pode comparar as duas identidades. */
const FONTE_DA_DECISAO = 'src/modules/people/application/perfil-de-pessoa.ts';

/** A ÚNICA fonte de produção que pode CHAMAR a porta da vitrine própria. */
const FONTE_DA_CHAMADA = 'src/modules/people/application/perfil-de-pessoa.ts';

/** Onde a porta é declarada e implementada -- declarar não é decidir. */
const PORTA_DECLARADA = 'src/modules/people/ports/perfil-de-pessoa-repository.ts';
const PORTA_IMPLEMENTADA = 'src/modules/people/adapters/persistence/kysely-perfil-de-pessoa.ts';

const ESTE_ARQUIVO = 'src/tools/sou-eu-decidido-num-lugar-so.test.ts';

/**
 * Comparar a identidade de quem olha com a da pessoa olhada, em qualquer ordem
 * e com qualquer um dos nomes que as camadas usam para as duas pontas.
 */
const COMPARACAO =
  /\b(pessoa\.userId|dono|alvo|idDoAlvo)\s*===\s*quemOlha\b|\bquemOlha\s*===\s*(pessoa\.userId|dono|alvo|idDoAlvo)\b/;

const CHAMADA_DA_VITRINE_PROPRIA = /\.vitrinePropria\s*\(/;

/** O texto sem comentário de linha e sem bloco `/* *\/`. */
function semProsa(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function todosOsFontes(raiz: string): readonly string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(raiz, { withFileTypes: true })) {
    const caminho = join(raiz, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === 'generated' || entrada.name === 'node_modules') continue;
      achados.push(...todosOsFontes(caminho));
    } else if (entrada.name.endsWith('.ts')) {
      achados.push(caminho);
    }
  }
  return achados;
}

/** Produção: fora de `.test.ts` e fora deste portão. */
function producao(fontes: readonly string[]): readonly string[] {
  return fontes.filter((f) => !f.endsWith('.test.ts') && f !== ESTE_ARQUIVO);
}

void describe('"este perfil é seu" é decidido num lugar só', () => {
  const fontes = todosOsFontes('src');

  void it('a varredura alcança a árvore de verdade, e não uma lista vazia', () => {
    assert.ok(fontes.length > 300, `a varredura achou só ${String(fontes.length)} arquivos .ts`);
    for (const conhecido of [
      FONTE_DA_DECISAO,
      PORTA_DECLARADA,
      PORTA_IMPLEMENTADA,
      ESTE_ARQUIVO,
    ]) {
      assert.ok(fontes.includes(conhecido), `${conhecido} não está na varredura`);
    }
  });

  void it('CONTROLE POSITIVO: a comparação É achada na fonte que deve tê-la', () => {
    // Sem este caso, uma expressão regular que parasse de casar deixaria os
    // dois casos abaixo verdes por vazio -- e um portão verde por vazio é pior
    // que portão nenhum, porque ele é citado como prova.
    assert.match(
      semProsa(readFileSync(FONTE_DA_DECISAO, 'utf8')),
      COMPARACAO,
      `a comparação de identidade não foi achada em ${FONTE_DA_DECISAO}. A varredura ` +
        'quebrou, ou a decisão mudou de lugar sem este portão mudar com ela.',
    );
    assert.match(
      semProsa(readFileSync(FONTE_DA_CHAMADA, 'utf8')),
      CHAMADA_DA_VITRINE_PROPRIA,
      `a chamada de \`vitrinePropria\` não foi achada em ${FONTE_DA_CHAMADA}`,
    );
  });

  void it('CONTROLE POSITIVO: a retirada de prosa não come o código', () => {
    // A retirada de comentário é uma expressão regular, e expressão regular
    // sobre código erra. Este caso mede que ela preserva o que importa.
    const texto = semProsa('const a = 1; // dono === quemOlha\nconst b = pessoa.userId === quemOlha;');
    assert.match(texto, COMPARACAO, 'a retirada de prosa comeu o código');
    assert.equal(
      (texto.match(/===/g) ?? []).length,
      1,
      'a retirada de prosa deixou passar a comparação que estava em comentário',
    );
  });

  void it('só `perfil-de-pessoa.ts` compara as duas identidades', () => {
    const outros = producao(fontes)
      .filter((f) => f !== FONTE_DA_DECISAO)
      .filter((f) => COMPARACAO.test(semProsa(readFileSync(f, 'utf8'))));
    assert.deepEqual(
      outros,
      [],
      'a comparação de "sou eu" voltou a ser escrita fora do caso de uso. Leia o ' +
        '`souEu` que `PerfilDePessoa.porApelido` já decidiu, em vez de comparar de ' +
        'novo: o predicado da audiência do Mural chegou a QUATRO cópias, e duas ' +
        'cópias já são duas definições.',
    );
  });

  void it('a porta da vitrine PRÓPRIA tem um ponto de chamada só', () => {
    const chamadores = producao(fontes).filter((f) =>
      CHAMADA_DA_VITRINE_PROPRIA.test(semProsa(readFileSync(f, 'utf8'))),
    );
    assert.deepEqual(
      chamadores,
      [FONTE_DA_CHAMADA],
      'alguém mais passou a pedir a vitrine própria. Ela é a metade da decisão de ' +
        '`souEu`, e um segundo chamador é um segundo lugar onde "sou eu" é decidido.',
    );
  });

  void it('o `WHERE` da vitrine própria NÃO compara identidade: ele recebe um id só', () => {
    // A defesa da assinatura, medida e não suposta. `construtorDaVitrinePropria`
    // aceita UM id -- o de quem olha --, então não existe forma de pedir por ela
    // a vitrine de terceiro, e não há o que comparar lá dentro.
    const sql = semProsa(readFileSync(PORTA_IMPLEMENTADA, 'utf8'));
    assert.doesNotMatch(
      sql,
      COMPARACAO,
      'a consulta passou a comparar identidade. A decisão é do caso de uso, e o ' +
        '`WHERE` só executa o que ele já decidiu.',
    );
    assert.match(
      sql,
      /export function construtorDaVitrinePropria\(\s*db: Kysely<Database>,\s*quemOlha: UserId,\s*\)/,
      'a assinatura de `construtorDaVitrinePropria` mudou. Ela recebe UM id de ' +
        'propósito: um segundo parâmetro de dono é o que permite pedir a vitrine ' +
        'de outra pessoa por ela.',
    );
  });
});
