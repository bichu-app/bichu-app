/**
 * Os critérios 14 e 15 da BICHUS-43, que são sobre a VERIFICAÇÃO e não sobre a
 * redação.
 *
 * ## Por que as fixtures saíram de dentro do `it(...)`
 *
 * `redigir.test.ts` já exercia as três evasões, e continua exercendo. O que ele
 * não conseguia dar é o que o critério 15 pede: **uma lista que o job possa não
 * encontrar**. Um caso de evasão escrito dentro de um `it(...)` desaparece na
 * primeira reescrita do arquivo, e ninguém percebe, porque a suíte continua
 * verde — a ausência de um caso nunca reprova nada.
 *
 * Então a lista virou dado versionado
 * (`evasoes-da-redacao.fixtures.json`), e este arquivo é o job:
 *
 * 1. **Não achar a lista é REPROVAÇÃO, com o motivo na mensagem.** Verificação
 *    que não consegue verificar precisa reprovar, nunca aprovar. Uma lista
 *    ausente lida como "nenhuma evasão passou" seria confiança falsa, que é pior
 *    que nenhuma verificação — ninguém procura o que acredita já ter.
 * 2. **Menos de três classes é reprovação.** O critério 14 nomeia as três
 *    (largura zero, homoglifo, por extenso) e exige que a esteira reprove se
 *    qualquer uma passar. Uma lista que perdesse uma classe deixaria a esteira
 *    verde sobre um buraco, e o número de casos até subiria.
 * 3. **Metade dos casos é NEGATIVA.** Uma redação que engole "toma 2
 *    comprimidos às 8h" cumpre a promessa de privacidade destruindo a
 *    informação pela qual a mensagem existe.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { redigirCanalMediado, type TrechoRedigido } from './redigir.js';

const CAMINHO = resolve(process.cwd(), 'src/shared/redaction/evasoes-da-redacao.fixtures.json');

/** As três que o critério 14 nomeia. Perder qualquer uma é reprovação. */
const CLASSES_EXIGIDAS = ['largura_zero', 'homoglifo', 'por_extenso'] as const;

interface Evasao {
  readonly classe: string;
  readonly descricao: string;
  readonly texto: string;
  readonly espera: TrechoRedigido['kind'][];
}

interface Negativa {
  readonly descricao: string;
  readonly texto: string;
}

interface Lista {
  readonly versao: number;
  readonly evasoes: Evasao[];
  readonly negativas: Negativa[];
}

/**
 * Carrega, ou **reprova com o motivo**.
 *
 * Nenhum caminho daqui devolve lista vazia. Lista vazia comparada com um
 * resultado vazio dá "nenhuma divergência", e é assim que um portão passa a
 * aprovar por não ter tido o que olhar.
 */
function carregar(): Lista {
  let cru: string;
  try {
    cru = readFileSync(CAMINHO, 'utf8');
  } catch (erro) {
    throw new Error(
      `A lista de fixtures de evasão não foi encontrada em ${CAMINHO}. Este job ` +
        'NÃO passa sem ela: ele existe para provar que as três evasões do critério ' +
        '14 não atravessam a redação, e sem a lista ele não teria o que provar. ' +
        `Causa: ${String(erro)}`,
    );
  }

  let lista: Lista;
  try {
    lista = JSON.parse(cru) as Lista;
  } catch (erro) {
    throw new Error(`${CAMINHO} não é JSON válido, então não há fixture nenhuma: ${String(erro)}`);
  }

  if (!Array.isArray(lista.evasoes) || lista.evasoes.length === 0) {
    throw new Error(`${CAMINHO} não traz nenhuma evasão. Ver o cabeçalho deste arquivo.`);
  }
  if (!Array.isArray(lista.negativas) || lista.negativas.length === 0) {
    throw new Error(
      `${CAMINHO} não traz nenhum caso NEGATIVO. Sem eles, a forma mais fácil de ` +
        'deixar este job verde é redigir tudo — e uma redação que redige tudo não ' +
        'serve para nada.',
    );
  }
  return lista;
}

void describe('critério 15 — a lista de fixtures é encontrada, ou o job reprova', () => {
  void it('a lista existe, é legível e traz os dois lados', () => {
    const lista = carregar();
    assert.ok(lista.evasoes.length >= 6, `poucas evasões: ${String(lista.evasoes.length)}`);
    assert.ok(lista.negativas.length >= 3, `poucas negativas: ${String(lista.negativas.length)}`);
  });

  void it('ISCA — um caminho inexistente REPROVA, e diz por quê', () => {
    // Sem este caso, `carregar` poderia deixar de lançar e ninguém notaria: os
    // casos acima passariam a medir o silêncio dele.
    assert.throws(
      () => {
        readFileSync(resolve(process.cwd(), 'src/shared/redaction/nao-existe.json'), 'utf8');
      },
      /ENOENT/,
      'o sistema de arquivos parou de acusar ausência, e a guarda de `carregar` virou enfeite',
    );
  });

  void it('critério 14 — as três classes nomeadas estão todas presentes', () => {
    const presentes = new Set(carregar().evasoes.map((e) => e.classe));
    const faltando = CLASSES_EXIGIDAS.filter((c) => !presentes.has(c));
    assert.deepEqual(
      faltando,
      [],
      `a lista perdeu classe(s) de evasão: ${faltando.join(', ')}. A esteira ficaria ` +
        'verde sobre o buraco, e o número de casos ainda subiria.',
    );
  });
});

void describe('critério 14 — nenhuma evasão atravessa a redação', () => {
  for (const evasao of carregar().evasoes) {
    void it(`${evasao.classe}: ${evasao.descricao}`, () => {
      const { texto, retirados } = redigirCanalMediado(evasao.texto);
      assert.deepEqual(
        retirados.map((r) => r.kind),
        evasao.espera,
        `a evasão passou inteira: ${evasao.texto}`,
      );
      // E o dado precisa mesmo ter saído do texto, não só ter sido contado.
      assert.doesNotMatch(texto, /\d{4}/u, `sobrou sequência de dígitos: ${texto}`);
      assert.doesNotMatch(texto, /[０-９]/u, `sobrou dígito de largura plena: ${texto}`);
    });
  }
});

void describe('a outra metade — o que precisa SOBREVIVER inteiro', () => {
  for (const negativa of carregar().negativas) {
    void it(negativa.descricao, () => {
      const { texto, retirados } = redigirCanalMediado(negativa.texto);
      assert.deepEqual(retirados, [], `redigiu indevidamente: ${negativa.texto}`);
      assert.equal(texto, negativa.texto);
    });
  }
});
