/**
 * Os critérios 14 e 15 da BICHUS-43, que são sobre a VERIFICAÇÃO e não sobre a
 * redação.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { redigirCanalMediado, type TrechoRedigido } from './redigir.js';

const CAMINHO = resolve(process.cwd(), 'src/shared/redaction/evasoes-da-redacao.fixtures.json');

/** As três que o critério 14 nomeia. */
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

/** Carrega, ou **reprova com o motivo**. */
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
