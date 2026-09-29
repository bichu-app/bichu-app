/**
 * A isca de tempo do canal mediado.
 *
 * ## O que ela guarda, e o que ela NÃO guarda
 *
 * Ela guarda **o tempo**, e o arquivo ao lado (`teto-do-canal-mediado.test.ts`)
 * guarda **o teto do contrato**. São defesas diferentes e nenhuma substitui a
 * outra, mas esta é a que passou a importar, e o motivo é o próprio conserto:
 *
 * Antes, `redigirCanalMediado` levava dezenas de segundos sobre entrada grande,
 * e a única coisa que impedia uma parada do laço de eventos era o `maxLength`
 * declarado em `api/openapi.yaml` para `body` e `care_notes` — um número em
 * outro arquivo, que quem o afrouxasse não teria como saber que era a defesa.
 * Depois do conserto o custo é linear, e a expressão regular defende a si
 * mesma. **A defesa saiu do contrato e entrou no código**, e é por isso que a
 * isca que reprova é esta.
 *
 * ## Por que medir a FUNÇÃO, e não cada expressão
 *
 * Porque a armadilha volta pela expressão que ainda não existe. Medindo
 * `redigirCanalMediado` inteira, um padrão novo com quantificador sobre classe
 * que contém o separador seguinte reprova aqui no dia em que for escrito, sem
 * ninguém precisar lembrar de acrescentar um caso.
 *
 * Foi assim que o `LINK` apareceu. A triagem de segurança mediu os dois regex
 * de e-mail e concluiu por eles; `LINK`, na mesma função e alimentado pelos
 * mesmos três campos, era pior que os dois, e com pior caso muito mais fácil de
 * escrever: bastava `rua ` seguida de letras.
 *
 * ## Os dois tetos, medidos nos DOIS sentidos
 *
 * Node 22, 50.000 caracteres por caso, melhor de três. As colunas "desligado"
 * vêm de desligar UMA correção por vez, recompilar, medir e religar conferindo
 * o SHA-256 de volta ao original:
 *
 *   caso       são    EMAIL desl.   LINK desl.   são(push)   push desl.
 *   email    22,8 ms    4.045,5 ms   2.360,5 ms     1,5 ms   1.665,8 ms
 *   rua      10,0 ms    2.277,7 ms   2.359,7 ms     1,9 ms   3.015,7 ms
 *   1-1-1     9,0 ms    4.329,1 ms   2.282,8 ms     1,1 ms   5.341,8 ms
 *   dígitos   7,4 ms    2.739,8 ms   1.933,3 ms     1,7 ms   2.652,0 ms
 *   a.a.a    27,5 ms    3.585,9 ms      17,5 ms     0,9 ms   4.041,9 ms
 *
 * - **redação, 200 ms**: sete vezes acima do pior caso são (27,5 ms) e nove
 *   vezes abaixo do menor caso quebrado que algum caso detecta (1.933,3 ms).
 * - **porteira do push, 50 ms**: ela não canoniza nada, então o são fica entre
 *   0,9 e 2,1 ms. Vinte e quatro vezes de folga para cima, trinta e três para
 *   baixo.
 *
 * A linha `a.a.a` com LINK desligado (17,5 ms) diz uma coisa útil: aquele caso
 * NÃO exercita o LINK, porque não há domínio para casar — ele isola o EMAIL. Os
 * outros quatro pegam as duas correções, e é essa redundância que se quer.
 *
 * ## Por que 50.000 e não 200.000
 *
 * A primeira versão media 200 KB, e ela **funcionava e era inutilizável**: com
 * a regressão presente, cada caso levava 84 segundos, e os dez casos passavam
 * de quarenta minutos antes de reprovar. Isca que só acusa depois do tempo
 * limite do job vira job morto por tempo limite, sem a mensagem que importa.
 * Em 50 KB a separação continua sendo de duas ordens de grandeza e o caminho
 * da reprovação custa segundos.
 *
 * Pela mesma razão a medição abaixo **desiste na primeira execução** que passa
 * do orçamento de 1 s (metade do menor caso quebrado): repetir algo que já é
 * regressão só atrasa a mensagem. Abaixo disso, ela amostra de três a quinze
 * vezes e fica com a menor (ver `ORCAMENTO_DAS_REPETICOES_EM_MS`).
 *
 * ## Sobre medir tempo em teste
 *
 * A objeção usual é instabilidade, e ela não se aplica nesta ordem de grandeza:
 * o que se separa aqui são dezenas de milissegundos e milhares. A menor
 * amostra, e não a média, porque uma execução atrapalhada pelo escalonador do
 * sistema operacional é ruído para cima, nunca para baixo, e a menor é a que
 * menos mente. Isto não é micro-benchmark; é a diferença entre linear e
 * quadrático.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assegurarSuperficiePublica } from '../../modules/notifications/domain/conteudo-do-push.js';
import { redigirCanalMediado } from './redigir.js';

/**
 * 50.000 caracteres. O contrato corta em 1.000 (`body`) e 280 (`care_notes`),
 * então esta entrada nunca chega ao manipulador hoje. Ela existe para medir a
 * expressão regular, que é o que continua valendo quando o teto mudar.
 */
const TAMANHO = 50_000;

/** Teto da redação. Ver o cabeçalho para as duas folgas medidas. */
const TETO_DA_REDACAO_EM_MS = 200;

/** Teto da porteira do push, que não canoniza nada e por isso é muito menor. */
const TETO_DO_PUSH_EM_MS = 50;

/**
 * Cada caso é um pior caso CONSTRUÍDO: casa quase tudo e falha no fim, que é a
 * forma que faz o motor refazer a tentativa a partir de cada posição.
 *
 * O texto ao lado é o custo medido com a correção DESLIGADA. Ele está aqui para
 * que a reprovação diga o que se perdeu, e não só "passou do teto".
 */
const PIORES_CASOS: ReadonlyArray<{ nome: string; texto: string; desligado: string }> = [
  {
    nome: 'e-mail sem fim: local longo, domínio de rótulos e falha no último caractere',
    texto: `${'a'.repeat(TAMANHO / 2)}@${'a.'.repeat(TAMANHO / 4)}!`,
    desligado: '4.045,5 ms sem o olhar-para-trás do EMAIL',
  },
  {
    nome: 'logradouro sem fim: a palavra de rua seguida de um bloco só de letras',
    texto: `rua ${'a'.repeat(TAMANHO)}`,
    desligado: '2.359,7 ms sem o olhar-para-trás do LINK',
  },
  {
    nome: 'dígitos alternados com traço, que é telefone e link ao mesmo tempo',
    texto: `${'1-'.repeat(TAMANHO / 2)}x`,
    desligado: '4.329,1 ms sem o olhar-para-trás do EMAIL',
  },
  {
    nome: 'só dígitos, sem separador nenhum',
    texto: '1'.repeat(TAMANHO),
    desligado: '2.739,8 ms sem o olhar-para-trás do EMAIL',
  },
  {
    nome: 'letra e ponto alternados, sem arroba',
    texto: `${'a.'.repeat(TAMANHO / 2)}!`,
    desligado: '3.585,9 ms sem o olhar-para-trás do EMAIL',
  },
];

/**
 * Orçamento de tempo das REPETIÇÕES de um caso, em milissegundos.
 *
 * QA, 28/09: sob carga (a suíte inteira em paralelo com a pilha de integração
 * e o build do painel), o melhor de três da porteira do push chegava a 60 ms
 * sem nada ter regredido: as três execuções caíam no mesmo pico do
 * escalonador. Carga é ruído para CIMA, nunca para baixo, então a resposta é
 * amostrar mais enquanto houver tempo, e ficar com a menor. O teto não mudou.
 *
 * O orçamento é o que mantém a reprovação rápida: 1 s é metade do MENOR caso
 * quebrado medido (1.665,8 ms), então uma regressão estoura o orçamento já na
 * primeira execução e reprova sem repetir, como antes.
 */
const ORCAMENTO_DAS_REPETICOES_EM_MS = 1_000;
/** No mínimo três amostras (o critério antigo), no máximo quinze. */
const AMOSTRAS_MINIMAS = 3;
const AMOSTRAS_MAXIMAS = 15;

/**
 * A menor amostra. Para cedo em dois casos: já há ao menos três amostras e a
 * menor está dentro do teto (passou), ou o orçamento acabou (o que houver
 * decide). Uma execução acima do orçamento é regressão, e não ruído: nenhuma
 * carga transforma 2 ms em 1 s.
 */
function menorTempoEmMs(executar: () => void, teto: number): number {
  executar(); // aquecimento: a primeira execução paga a compilação do regex.
  let menor = Number.POSITIVE_INFINITY;
  const inicioDoCaso = process.hrtime.bigint();
  for (let i = 0; i < AMOSTRAS_MAXIMAS; i++) {
    const inicio = process.hrtime.bigint();
    executar();
    const gasto = Number(process.hrtime.bigint() - inicio) / 1e6;
    if (gasto < menor) menor = gasto;
    if (gasto > ORCAMENTO_DAS_REPETICOES_EM_MS) return menor;
    if (i + 1 >= AMOSTRAS_MINIMAS && menor <= teto) return menor;
    if (Number(process.hrtime.bigint() - inicioDoCaso) / 1e6 > ORCAMENTO_DAS_REPETICOES_EM_MS) return menor;
  }
  return menor;
}

/** Ocupa a CPU por `ms` milissegundos: simula trabalho, e nao espera. */
function ocupar(ms: number): void {
  const fim = process.hrtime.bigint() + BigInt(Math.round(ms * 1e6));
  while (process.hrtime.bigint() < fim) {
    // laço vazio de proposito
  }
}

void describe('a medição aguenta carga sem deixar de acusar (QA bug 7)', () => {
  void it('ISCA: picos de carga em várias amostras não reprovam um caso rápido', () => {
    let chamadas = 0;
    // Aquecimento + quatro amostras sob "carga" de 80 ms, depois o custo real de 1 ms.
    const gasto = menorTempoEmMs(() => {
      chamadas += 1;
      ocupar(chamadas <= 5 ? 80 : 1);
    }, TETO_DO_PUSH_EM_MS);
    assert.ok(gasto <= TETO_DO_PUSH_EM_MS, `a medição reprovou um caso rápido sob carga: ${gasto.toFixed(1)} ms`);
  });

  void it('ISCA: um custo que está SEMPRE acima do teto continua reprovando', () => {
    const gasto = menorTempoEmMs(() => {
      ocupar(TETO_DO_PUSH_EM_MS + 15);
    }, TETO_DO_PUSH_EM_MS);
    assert.ok(gasto > TETO_DO_PUSH_EM_MS, 'a medição aprovou um custo que nunca ficou dentro do teto');
  });
});

void describe('SEC-025 — a redação do canal mediado é linear no tamanho da entrada', () => {
  for (const caso of PIORES_CASOS) {
    void it(`redigirCanalMediado não passa de ${TETO_DA_REDACAO_EM_MS} ms — ${caso.nome}`, () => {
      const gasto = menorTempoEmMs(() => {
        redigirCanalMediado(caso.texto);
      }, TETO_DA_REDACAO_EM_MS);
      assert.ok(
        gasto <= TETO_DA_REDACAO_EM_MS,
        `SEC-025: a redação levou ${gasto.toFixed(1)} ms sobre ${caso.texto.length} ` +
          `caracteres, contra o teto de ${TETO_DA_REDACAO_EM_MS} ms. Alguma expressão ` +
          `regular de redigir.ts voltou a ter quantificador sobre classe que contém o ` +
          `separador seguinte, e o custo voltou a crescer com o quadrado do tamanho ` +
          `(referência: ${caso.desligado}). Isto não é lentidão — é o laço de eventos ` +
          `parado, e o processo é um só. O conserto está no olhar-para-trás de EMAIL e ` +
          `de LINK`,
      );
    });

    void it(`assegurarSuperficiePublica não passa de ${TETO_DO_PUSH_EM_MS} ms — ${caso.nome}`, () => {
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
      }, TETO_DO_PUSH_EM_MS);
      assert.ok(
        gasto <= TETO_DO_PUSH_EM_MS,
        `SEC-025: a porteira do push levou ${gasto.toFixed(1)} ms sobre ` +
          `${caso.texto.length} caracteres, contra o teto de ${TETO_DO_PUSH_EM_MS} ms. ` +
          `Algum padrão de PADROES_PROIBIDOS voltou a ter retrocesso quadrático ` +
          `(referência: com o do e-mail desligado, de 1.665,8 a 5.341,8 ms)`,
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
      'a redação parou de achar e-mail em entrada longa: as iscas de tempo acima passaram ' +
        'a medir um caminho que não faz trabalho nenhum',
    );
    for (const caso of PIORES_CASOS) {
      assert.ok(
        redigirCanalMediado(caso.texto).texto.length > 0,
        `o pior caso "${caso.nome}" deixou de produzir texto: ele não está mais medindo nada`,
      );
    }
  });
});
