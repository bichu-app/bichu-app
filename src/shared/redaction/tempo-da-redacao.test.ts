import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assegurarSuperficiePublica } from '../../modules/notifications/domain/conteudo-do-push.js';
import { redigirCanalMediado } from './redigir.js';

const TAMANHO = 50_000;

const TETO_DA_REDACAO_EM_MS = 200;

const TETO_DO_PUSH_EM_MS = 50;

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

const ORCAMENTO_DAS_REPETICOES_EM_MS = 1_000;
const AMOSTRAS_MINIMAS = 3;
const AMOSTRAS_MAXIMAS = 15;

function menorTempoEmMs(executar: () => void, teto: number): number {
  executar();
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

function ocupar(ms: number): void {
  const fim = process.hrtime.bigint() + BigInt(Math.round(ms * 1e6));
  while (process.hrtime.bigint() < fim) {
    // laço vazio de proposito
  }
}

void describe('a medição aguenta carga sem deixar de acusar (QA bug 7)', () => {
  void it('ISCA: picos de carga em várias amostras não reprovam um caso rápido', () => {
    let chamadas = 0;
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
          // Vazamento reconhecido é desfecho legítimo deste caso: o que se mede aqui é o tempo até a decisão, não qual decisão foi tomada.
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
