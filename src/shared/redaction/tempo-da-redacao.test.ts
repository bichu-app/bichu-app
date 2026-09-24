/**
 * A isca de tempo do canal mediado.
 *
 * ## O que ela guarda, e o que ela NÃO guarda
 *
 * Ela guarda **o tempo**, e o arquivo ao lado (`teto-do-canal-mediado.test.ts`)
 * guarda **o teto do contrato**. São defesas diferentes e nenhuma substitui a
 * outra, mas esta é a que passou a importar, e o motivo é o conserto:
 *
 * Antes, `redigirCanalMediado` levava 118.870 ms sobre 256 KB de pior caso
 * construído, e a única coisa que impedia uma parada do laço de eventos era o
 * `maxLength` declarado em `api/openapi.yaml` para `body` e `care_notes` --
 * um número em outro arquivo, que quem o afrouxasse não teria como saber que
 * era a defesa. Depois do conserto o custo é linear, e a expressão regular
 * defende a si mesma. **A defesa saiu do contrato e entrou no código**, e é
 * por isso que a isca que reprova é esta.
 *
 * ## Por que medir a FUNÇÃO, e não cada expressão
 *
 * Porque a armadilha volta pela expressão que ainda não existe. Medindo
 * `redigirCanalMediado` inteira, um padrão novo com quantificador sobre classe
 * que contém o separador seguinte reprova aqui no dia em que for escrito, sem
 * ninguém precisar lembrar de acrescentar um caso.
 *
 * Foi assim que o `LINK` apareceu: a triagem mediu os dois regex de e-mail e
 * `LINK`, na mesma função e alimentado pelos mesmos três campos, era pior que
 * os dois (73.332 ms contra 118.870 ms de UM deles, mas com pior caso muito
 * mais fácil de escrever -- `rua ` seguida de letras).
 *
 * ## Sobre medir tempo em teste
 *
 * A objeção usual é instabilidade, e ela não se aplica nesta ordem de
 * grandeza: o que se separa aqui são **1,9 ms e 118.870 ms**, quatro ordens de
 * magnitude. O teto de 50 ms tem 25 vezes de folga sobre o pior número medido
 * depois do conserto, e nenhuma máquina carregada multiplica por 25 o custo de
 * uma varredura linear de 200 KB.
 *
 * O melhor de três execuções, e não a média, porque o que se mede é o custo do
 * motor de expressão regular: uma execução atrapalhada pelo escalonador do
 * sistema operacional é ruído para cima, nunca para baixo, e a menor das três
 * é a que menos mente. Isto não é micro-benchmark; é a diferença entre linear
 * e quadrático.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assegurarSuperficiePublica } from '../../modules/notifications/domain/conteudo-do-push.js';
import { redigirCanalMediado } from './redigir.js';

/**
 * 200 KB. O contrato corta em 1.000 (`body`) e 280 (`care_notes`), então esta
 * entrada nunca chega ao manipulador hoje. Ela existe para medir a expressão
 * regular, que é o que continua valendo quando o teto mudar.
 */
const TAMANHO = 200_000;

/** Teto por execução. Ver o cabeçalho para a folga que ele tem. */
const TETO_EM_MS = 50;

/**
 * Cada caso é um pior caso CONSTRUÍDO: casa quase tudo e falha no fim, que é
 * a forma que faz o motor refazer a tentativa a partir de cada posição.
 *
 * O número ao lado é o custo medido ANTES do conserto, em Node 22. Ele está
 * aqui para que a reprovação diga o que se perdeu, e não só "passou de 50 ms".
 */
const PIORES_CASOS: ReadonlyArray<{ nome: string; texto: string; antes: string }> = [
  {
    nome: 'e-mail sem fim: local longo, domínio de rótulos e falha no último caractere',
    texto: `${'a'.repeat(TAMANHO / 2)}@${'a.'.repeat(TAMANHO / 4)}!`,
    antes: '118.870 ms em 256 KB',
  },
  {
    nome: 'logradouro sem fim: a palavra de rua seguida de um bloco só de letras',
    texto: `rua ${'a'.repeat(TAMANHO)}`,
    antes: '73.332 ms no LINK',
  },
  {
    nome: 'dígitos alternados com traço, que é telefone e link ao mesmo tempo',
    texto: `${'1-'.repeat(TAMANHO / 2)}x`,
    antes: '66.855 ms no LINK',
  },
  {
    nome: 'só dígitos, sem separador nenhum',
    texto: '1'.repeat(TAMANHO),
    antes: '48.589 ms no LINK',
  },
  {
    nome: 'letra e ponto alternados, sem arroba',
    texto: `${'a.'.repeat(TAMANHO / 2)}!`,
    antes: 'o padrão que a regra S5852 acusa',
  },
];

/** O menor de três: ver o cabeçalho. */
function menorTempoEmMs(executar: () => void): number {
  executar(); // aquecimento: a primeira execução paga a compilação do regex.
  let menor = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 3; i++) {
    const inicio = process.hrtime.bigint();
    executar();
    const gasto = Number(process.hrtime.bigint() - inicio) / 1e6;
    if (gasto < menor) menor = gasto;
  }
  return menor;
}

void describe('SEC-025 — a redação do canal mediado é linear no tamanho da entrada', () => {
  for (const caso of PIORES_CASOS) {
    void it(`redigirCanalMediado não passa de ${TETO_EM_MS} ms — ${caso.nome}`, () => {
      const gasto = menorTempoEmMs(() => {
        redigirCanalMediado(caso.texto);
      });
      assert.ok(
        gasto <= TETO_EM_MS,
        `SEC-025: a redação levou ${gasto.toFixed(1)} ms sobre ${caso.texto.length} ` +
          `caracteres, contra o teto de ${TETO_EM_MS} ms. Alguma expressão regular de ` +
          `redigir.ts voltou a ter quantificador sobre classe que contém o separador ` +
          `seguinte, e o custo voltou a crescer com o quadrado do tamanho (antes do ` +
          `conserto: ${caso.antes}). Isto não é lentidão: é o laço de eventos parado, e ` +
          `o processo é um só. O conserto está no olhar-para-trás de EMAIL e de LINK`,
      );
    });

    void it(`assegurarSuperficiePublica não passa de ${TETO_EM_MS} ms — ${caso.nome}`, () => {
      const gasto = menorTempoEmMs(() => {
        try {
          assegurarSuperficiePublica({
            titulo: 'aviso',
            corpo: caso.texto,
            dados: {},
            chaveDeAgrupamento: 'caso',
          });
        } catch {
          // Vazamento reconhecido é desfecho legítimo deste caso: o que se mede
          // aqui é o tempo até a decisão, não qual decisão foi tomada.
        }
      });
      assert.ok(
        gasto <= TETO_EM_MS,
        `SEC-025: a porteira do push levou ${gasto.toFixed(1)} ms sobre ` +
          `${caso.texto.length} caracteres, contra o teto de ${TETO_EM_MS} ms. Algum ` +
          `padrão de PADROES_PROIBIDOS voltou a ter retrocesso quadrático`,
      );
    });
  }

  void it('os piores casos continuam exercitando a redação, e não um caminho vazio', () => {
    // Verificação que não consegue verificar reprova, nunca aprova: uma entrada
    // que a função devolvesse intacta na primeira linha mediria o tempo de um
    // `return` e ficaria verde para sempre.
    const comEmail = `${'a'.repeat(1000)}@exemplo.com.br`;
    assert.deepEqual(
      redigirCanalMediado(comEmail).retirados.map((r) => r.kind),
      ['email'],
      'a redação parou de achar e-mail em entrada longa: a isca de tempo acima passou a ' +
        'medir um caminho que não faz trabalho nenhum',
    );
    for (const caso of PIORES_CASOS) {
      assert.equal(
        redigirCanalMediado(caso.texto).texto.length > 0,
        true,
        `o pior caso "${caso.nome}" deixou de produzir texto: ele não está mais medindo nada`,
      );
    }
  });
});
