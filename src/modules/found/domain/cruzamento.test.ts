/** O cruzamento contra os números da seção 4.10 de `docs/03-arquitetura.md`. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cruzar,
  excluir,
  normalizarCidade,
  pontuar,
  pontuarCor,
  pontuarPorte,
  pontuarProximidade,
  pontuarRaca,
  pontuarTempo,
  vinculoDireto,
  type LadoDoAchado,
  type LadoDoCaso,
  type Par,
} from './cruzamento.js';
import type { CaseId, FoundReportId } from '../../../shared/types/brands.js';

const ACHADO = '018f3a2b-0000-7000-8000-00000000f001' as FoundReportId;
const CASO = '018f3a2b-0000-7000-8000-00000000c001' as CaseId;

const HORA = 3_600_000;
const DIA = 24 * HORA;

/** 15/01/2027, 12:00 UTC. Qualquer instante fixo serve; o relógio não entra aqui. */
const SUMIU_EM = 1_800_000_000_000;

function caso(ajustes: Partial<LadoDoCaso> = {}): LadoDoCaso {
  return {
    caseId: CASO,
    especie: 'dog',
    porte: 'M',
    corPrimaria: 'caramelo',
    racaCodigo: 'srd_dog',
    sexo: 'male',
    desaparecidoEm: SUMIU_EM,
    cidade: 'São Paulo',
    temCoordenada: true,
    ...ajustes,
  };
}

function achado(ajustes: Partial<LadoDoAchado> = {}): LadoDoAchado {
  return {
    foundReportId: ACHADO,
    especie: 'dog',
    porte: 'M',
    corPrimaria: 'caramelo',
    racaCodigo: 'srd_dog',
    sexo: 'male',
    achadoEm: SUMIU_EM + DIA,
    cidade: 'São Paulo',
    temCoordenada: true,
    distanciaEmMetros: 500,
    jaRejeitadoPorHumano: false,
    ...ajustes,
  };
}

void describe('os filtros eliminatórios não pontuam: excluem', () => {
  void it('cão não é candidato de gato, e não há "talvez"', () => {
    assert.equal(excluir(caso({ especie: 'dog' }), achado({ especie: 'cat' })), 'especie-diferente');
  });

  void it('achado mais de 6 h antes do desaparecimento sai', () => {
    assert.equal(excluir(caso(), achado({ achadoEm: SUMIU_EM - 5 * HORA })), null);
    assert.equal(
      excluir(caso(), achado({ achadoEm: SUMIU_EM - 7 * HORA })),
      'achado-antes-do-desaparecimento',
    );
  });

  void it('achado mais de 30 dias depois do desaparecimento sai', () => {
    assert.equal(excluir(caso(), achado({ achadoEm: SUMIU_EM + 29 * DIA })), null);
    assert.equal(
      excluir(caso(), achado({ achadoEm: SUMIU_EM + 31 * DIA })),
      'achado-tarde-demais',
    );
  });

  void it('acima de 20 km sai, e o limite é quatro vezes o raio do alerta', () => {
    assert.equal(excluir(caso(), achado({ distanciaEmMetros: 19_999 })), null);
    assert.equal(excluir(caso(), achado({ distanciaEmMetros: 20_001 })), 'longe-demais');
  });

  void it('sem coordenada de um dos lados, quem decide é a cidade', () => {
    const semPonto = { temCoordenada: false, distanciaEmMetros: null } as const;
    assert.equal(excluir(caso(), achado({ ...semPonto, cidade: 'São Paulo' })), null);
    assert.equal(
      excluir(caso(), achado({ ...semPonto, cidade: 'Campinas' })),
      'cidade-diferente',
    );
  });

  void it('a cidade compara sem acento, sem caixa e sem espaço repetido', () => {
    assert.equal(normalizarCidade('  São   PAULO '), 'sao paulo');
    assert.equal(
      excluir(
        caso({ temCoordenada: false, cidade: 'São Paulo' }),
        achado({ temCoordenada: false, distanciaEmMetros: null, cidade: 'sao  paulo' }),
      ),
      null,
    );
  });

  void it('rejeitado por decisão humana não volta, nem com score alto', () => {
    assert.equal(
      excluir(caso(), achado({ jaRejeitadoPorHumano: true, distanciaEmMetros: 10 })),
      'rejeitado-por-humano',
    );
  });

  void it('os dois lados com coordenada e distância nula é consulta quebrada, e LANÇA', () => {
    assert.throws(
      () => excluir(caso({ temCoordenada: true }), achado({ temCoordenada: true, distanciaEmMetros: null })),
      /distância chegou nula/,
    );
  });
});

void describe('a tabela de pesos, valor por valor', () => {
  void it('porte: igual 1,0 · adjacente 0,5 · distante 0', () => {
    assert.equal(pontuarPorte('M', 'M'), 1);
    assert.equal(pontuarPorte('P', 'M'), 0.5);
    assert.equal(pontuarPorte('M', 'G'), 0.5);
    assert.equal(pontuarPorte('G', 'GG'), 0.5);
    assert.equal(pontuarPorte('P', 'G'), 0);
    assert.equal(pontuarPorte('P', 'GG'), 0);
  });

  void it('cor: igual 1,0 · mesmo grupo cromático 0,5 · diferente 0', () => {
    assert.equal(pontuarCor('caramelo', 'caramelo'), 1);
    assert.equal(pontuarCor('caramelo', 'marrom'), 0.5);
    assert.equal(pontuarCor('preto', 'branco'), 0);
  });

  void it('raça: um dos dois SRD ou ausente vale 0,4, e não 0', () => {
    assert.equal(pontuarRaca('labrador', 'labrador'), 1);
    assert.equal(pontuarRaca('labrador', 'srd_dog'), 0.4);
    assert.equal(pontuarRaca('srd_cat', 'persa'), 0.4);
    assert.equal(pontuarRaca('srd_dog', 'srd_dog'), 1);
    assert.equal(pontuarRaca('labrador', null), 0.4);
    assert.equal(pontuarRaca(null, null), 0.4);
    assert.equal(pontuarRaca('labrador', 'poodle'), 0);
  });

  void it('proximidade: 1 km 1,0 · 3 km 0,7 · 5 km 0,5 · 10 km 0,25 · acima 0', () => {
    assert.equal(pontuarProximidade(1_000), 1);
    assert.equal(pontuarProximidade(3_000), 0.7);
    assert.equal(pontuarProximidade(5_000), 0.5);
    assert.equal(pontuarProximidade(10_000), 0.25);
    assert.equal(pontuarProximidade(10_001), 0);
  });

  void it('tempo: 48 h 1,0 · 7 dias 0,6 · 30 dias 0,3', () => {
    assert.equal(pontuarTempo(48 * HORA), 1);
    assert.equal(pontuarTempo(7 * DIA), 0.6);
    assert.equal(pontuarTempo(20 * DIA), 0.3);
  });

  void it('o par idêntico e perto soma 1,00, que é a soma dos cinco pesos', () => {
    const { score } = pontuar(
      caso({ racaCodigo: 'labrador' }),
      achado({ racaCodigo: 'labrador', distanciaEmMetros: 300, achadoEm: SUMIU_EM + HORA }),
    );
    assert.equal(score, 1);
  });

  void it('o score é arredondado a três casas, que é a precisão da coluna', () => {
    const { score } = pontuar(caso(), achado());
    assert.equal(score, Math.round(score * 1000) / 1000);
    assert.ok(String(score).replace(/^[^.]*\.?/, '').length <= 3, `score com mais de 3 casas: ${String(score)}`);
  });
});

void describe('sexo não pontua: ele penaliza', () => {
  void it('divergente multiplica o total por 0,7', () => {
    const iguais = pontuar(caso({ sexo: 'male' }), achado({ sexo: 'male' })).score;
    const divergentes = pontuar(caso({ sexo: 'male' }), achado({ sexo: 'female' })).score;
    assert.equal(divergentes, Math.round(iguais * 0.7 * 1000) / 1000);
    assert.ok(divergentes > 0);
  });

  void it('`unknown` de um lado não penaliza nada', () => {
    assert.equal(
      pontuar(caso({ sexo: 'male' }), achado({ sexo: 'unknown' })).score,
      pontuar(caso({ sexo: 'male' }), achado({ sexo: 'male' })).score,
    );
  });
});

void describe('sem coordenada, o peso de 0,15 é REDISTRIBUÍDO e não zerado', () => {
  const semPonto = { temCoordenada: false, distanciaEmMetros: null } as const;

  void it('o par perfeito sem coordenada continua somando 1,00', () => {
    const { score } = pontuar(
      caso({ temCoordenada: false, racaCodigo: 'labrador' }),
      achado({ ...semPonto, racaCodigo: 'labrador', achadoEm: SUMIU_EM + HORA }),
    );
    assert.equal(score, 1);
  });

  void it('a distância sai nula na sugestão, e o par ainda vira candidato', () => {
    const sugestoes = cruzar([
      { caso: caso({ temCoordenada: false }), achado: achado({ ...semPonto }) },
    ]);
    assert.equal(sugestoes.length, 1);
    assert.equal(sugestoes[0]?.distanciaEmMetros, null);
  });
});

void describe('o corte, o teto e a ordem', () => {
  void it('score abaixo de 0,45 não vira candidato', () => {
    const fraco: Par = {
      caso: caso({ porte: 'P', corPrimaria: 'preto', racaCodigo: 'poodle', sexo: 'male' }),
      achado: achado({
        porte: 'GG',
        corPrimaria: 'branco',
        racaCodigo: 'labrador',
        sexo: 'female',
        distanciaEmMetros: 15_000,
        achadoEm: SUMIU_EM + 20 * DIA,
      }),
    };
    assert.ok(pontuar(fraco.caso, fraco.achado).score < 0.45);
    assert.deepEqual(cruzar([fraco]), []);
  });

  void it('no máximo 10 candidatos, por score decrescente', () => {
    const pares: Par[] = Array.from({ length: 25 }, (_, i) => ({
      caso: caso({ caseId: `018f3a2b-0000-7000-8000-0000000${String(100 + i)}` as CaseId }),
      achado: achado({ distanciaEmMetros: 100 + i * 10 }),
    }));
    const sugestoes = cruzar(pares);
    assert.equal(sugestoes.length, 10);
    for (let i = 1; i < sugestoes.length; i += 1) {
      assert.ok((sugestoes[i - 1]?.score ?? 0) >= (sugestoes[i]?.score ?? 0));
    }
  });

  void it('empate de score é desempatado pela menor distância, com nulo por último', () => {
    const perto = { caso: caso({ caseId: 'c-perto' as CaseId }), achado: achado({ distanciaEmMetros: 100 }) };
    const longe = { caso: caso({ caseId: 'c-longe' as CaseId }), achado: achado({ distanciaEmMetros: 900 }) };
    const ordenadas = cruzar([longe, perto]);
    assert.equal(ordenadas[0]?.caseId, 'c-perto');
  });

  void it('a mesma entrada em ordem trocada produz a mesma saída', () => {
    const a: Par = { caso: caso({ caseId: 'c-a' as CaseId }), achado: achado({ distanciaEmMetros: 400 }) };
    const b: Par = { caso: caso({ caseId: 'c-b' as CaseId }), achado: achado({ distanciaEmMetros: 400 }) };
    assert.deepEqual(cruzar([a, b]), cruzar([b, a]));
  });
});

void describe('critério 10: o vínculo direto não passa pelo cruzamento', () => {
  void it('score 1,0, origem `share_token`, e nenhum filtro aplicado', () => {
    const sugestao = vinculoDireto(ACHADO, CASO);
    assert.equal(sugestao.score, 1);
    assert.equal(sugestao.linkOrigin, 'share_token');
    assert.equal(sugestao.caseId, CASO);
    assert.equal(sugestao.foundReportId, ACHADO);
  });

  void it('a origem é campo próprio, e não deduzida do score', () => {
    const porAtributos = cruzar([
      {
        caso: caso({ racaCodigo: 'labrador' }),
        achado: achado({ racaCodigo: 'labrador', distanciaEmMetros: 300, achadoEm: SUMIU_EM + HORA }),
      },
    ])[0];
    assert.equal(porAtributos?.score, 1);
    assert.equal(porAtributos?.linkOrigin, 'attribute_match');
    assert.notEqual(porAtributos?.linkOrigin, vinculoDireto(ACHADO, CASO).linkOrigin);
  });
});

void describe('ISCA: sugerir não é afirmar, e o tipo é quem garante', () => {
  void it('nenhuma saída do cruzamento carrega decisão de nenhuma forma', () => {
    const proibidos = [
      'status',
      'confirmado',
      'confirmed',
      'decidido',
      'decidedBy',
      'decided_by_user_id',
      'decidedAt',
      'aprovado',
      'match',
    ];

    const saidas = [
      ...cruzar([{ caso: caso(), achado: achado() }]),
      vinculoDireto(ACHADO, CASO),
    ];
    assert.ok(saidas.length >= 2, 'a isca precisa mesmo ter saídas para inspecionar');

    for (const saida of saidas) {
      const chaves = Object.keys(saida);
      for (const proibido of proibidos) {
        assert.ok(
          !chaves.includes(proibido),
          `O cruzamento passou a devolver \`${proibido}\`. Ele SUGERE: a confirmação é ` +
            'humana e não tem exceção nem para score 1,0 (critério 7, e a última frase da ' +
            `seção 4.10). Chaves encontradas: ${chaves.join(', ')}`,
        );
      }
    }
  });

  void it('a mesma conferência ACUSA um objeto que carrega decisão', () => {
    const comDecisao = { ...vinculoDireto(ACHADO, CASO), status: 'confirmed' };
    assert.ok(
      Object.keys(comDecisao).includes('status'),
      'a conferência parou de enxergar a decisão, e os casos acima passaram a não provar nada',
    );
  });
});
