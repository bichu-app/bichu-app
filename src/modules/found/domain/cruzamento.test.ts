/**
 * O cruzamento contra os números da seção 4.10 de `docs/03-arquitetura.md`.
 *
 * Aquela seção diz "quem implementa segue estes números, e **quem testa reprova
 * contra eles**". Este arquivo é essa reprovação: cada peso, cada faixa e cada
 * tolerância aparece aqui como número literal, copiado do documento e **não**
 * lido da constante que o código exporta. Ler a constante faria o teste
 * concordar com o código mesmo quando os dois divergissem do documento, que é a
 * forma clássica de uma suíte verde não provar nada.
 *
 * ## A isca que importa mais que todas
 *
 * `ISCA: sugerir não é afirmar`. Ela reprova se alguém acrescentar a `Sugestao`
 * qualquer forma de decisão — `status`, `confirmado`, `decidido_por` — porque é
 * por aí que um falso positivo vira uma tutora indo atrás do cão errado.
 *
 * ## Como as iscas foram provadas
 *
 * Desligadas no código de produção, rodadas, vistas reprovar em 22/09/2026, e
 * restauradas:
 *
 * | o que foi desligado em `cruzamento.ts` | reprovaram |
 * |---|---|
 * | `PENALIDADE_DE_SEXO_DIVERGENTE` de `0.7` para `1` | 2 casos |
 * | a redistribuição do peso (divisor fixo em `1`) | 3 casos |
 * | `CORTE_DE_SCORE` de `0.45` para `0` | 2 casos |
 * | `PONTO_DE_RACA_INDEFINIDA` de `0.4` para `0` | 3 casos |
 * | o filtro de espécie removido de `excluir` | 2 casos |
 * | `TETO_DE_CANDIDATOS_POR_CASO` de `10` para `100` | 1 caso |
 * | um campo `status: 'confirmed'` acrescentado a `Sugestao` | 1 caso |
 */
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
    // O relato de "última vez que vi" é estimado, e erra para menos: 6 h de
    // tolerância. 5 h antes passa; 7 h antes, não.
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
    // Quem digita numa tela de celular com o animal no colo escreve dos três
    // jeitos, e o filtro 5 descartaria o par certo se comparasse o texto cru.
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
    // Silêncio aqui esconderia um `SELECT` que parou de medir; aceitar deixaria
    // um par de 900 km entrar com o peso da proximidade redistribuído, como se
    // fosse falta de permissão de localização.
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
    // A decisão menos óbvia da tabela: a maioria dos cães de rua é registrada
    // como SRD por quem acha. Tratar isso como incompatibilidade descartaria o
    // caso mais comum do Brasil.
    // Os códigos são os REAIS de `ref_colors`/`ref_breeds`: `srd_dog` e
    // `srd_cat`, um por espécie. Um teste escrito com `'srd'` passaria enquanto
    // o código também dissesse `'srd'`, e os dois estariam errados juntos.
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
    // E não elimina: quem acha um animal na rua erra o sexo com frequência.
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
    // Zerar o item sem redistribuir puniria quem não deu permissão de
    // localização, que é exatamente quem o desenho decidiu não punir (critério
    // 6 da BICHUS-35). Se o peso fosse só descartado, o teto viraria 0,85.
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
    // Espécie igual (passa o filtro), tudo o mais divergente.
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
    // Trinta "possíveis correspondências" não é ajuda: é trabalho transferido
    // para alguém que está em pânico.
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
    // Reprodutibilidade em teste (seção 4.10): a função é pura e a ordem é
    // determinística, senão nenhum caso acima é reexecutável.
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
    // Um `score === 1` por atributos é possível — mesmo porte, mesma cor, mesma
    // raça, a 300 m, no mesmo dia. Deduzir a origem do score faria as duas se
    // confundirem exatamente no caso mais forte, que é o que vai para a tela.
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
    // **Esta é a isca do critério 7.** Ela reprova no dia em que alguém
    // acrescentar a `Sugestao` um campo que consiga dizer "é este mesmo" — e a
    // lista é de NOMES porque o tipo desaparece em tempo de execução, então a
    // conferência precisa olhar o objeto, não a declaração.
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
    // Sem esta metade, o caso acima estaria medindo o próprio silêncio: um
    // `Object.keys` que parasse de funcionar aprovaria tudo.
    const comDecisao = { ...vinculoDireto(ACHADO, CASO), status: 'confirmed' };
    assert.ok(
      Object.keys(comDecisao).includes('status'),
      'a conferência parou de enxergar a decisão, e os casos acima passaram a não provar nada',
    );
  });
});
