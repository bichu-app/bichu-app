/**
 * O TETO DE NOVE FOTOS, COBRADO NO SERVIDOR — e os dois casos que importam.
 *
 * ## ISCA (b): o teto não é da tela
 *
 * A tela também o cobra, e isso não basta por um motivo que não é hipótese: o
 * cliente é o que o chamador controla. Uma décima foto aceita aqui só falharia
 * no `CHECK (position BETWEEN 0 AND 8)` do banco — e chegaria ao app como
 * violação de restrição, sem campo e sem motivo, com a tela dizendo "erro
 * inesperado" para uma pessoa que só precisava saber que já tem nove.
 *
 * O caso de dez REPROVA se alguém tirar a conferência do servidor. O
 * CONTRAPESO de nove PASSA — sem ele, uma conferência que recusasse tudo (ou
 * que recusasse a partir da segunda foto) também deixaria o primeiro caso
 * verde, e o teto deixaria de ser nove sem ninguém medir.
 *
 * O número é lido de `TETO_DE_FOTOS_DA_VITRINE`, e **nunca escrito como `9`
 * aqui**: um teste que repete o literal continua verde no dia em que o teto
 * mudar num lugar só, que é o defeito que ele deveria pegar.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TETO_DE_FOTOS_DA_VITRINE,
  conferirVitrinePedida,
  type FotoPedidaNaVitrine,
} from './vitrine-de-fotos.js';

/** `n` fotos com `upload_id` distintos e bem formados. */
function fotos(n: number): FotoPedidaNaVitrine[] {
  return Array.from({ length: n }, (_, i) => ({
    upload_id: `018f7c1e-7a2b-7c3d-9e4f-${String(i).padStart(12, '0')}`,
  }));
}

function erroDe(acao: () => unknown): { status: number; errors: readonly { field: string; code: string }[] } {
  try {
    acao();
  } catch (erro) {
    const e = erro as { status?: number; errors?: readonly { field: string; code: string }[] };
    return { status: e.status ?? 0, errors: e.errors ?? [] };
  }
  throw new Error('A ação deveria ter lançado, e não lançou.');
}

void describe('o teto de fotos da vitrine é cobrado no SERVIDOR', () => {
  void it(`ISCA -- ${String(TETO_DE_FOTOS_DA_VITRINE + 1)} fotos são RECUSADAS, com campo e motivo`, () => {
    const { status, errors } = erroDe(() => conferirVitrinePedida(fotos(TETO_DE_FOTOS_DA_VITRINE + 1)));
    assert.equal(status, 400, 'o teto precisa recusar com 400, e não deixar o banco recusar depois');
    assert.deepEqual(
      errors.map((e) => [e.field, e.code]),
      [['photos', 'maximum']],
      'a recusa precisa apontar `photos` e `maximum`: sem campo, a tela não sabe o que dizer',
    );
  });

  void it(`CONTRAPESO -- exatamente ${String(TETO_DE_FOTOS_DA_VITRINE)} são ACEITAS`, () => {
    const gravar = conferirVitrinePedida(fotos(TETO_DE_FOTOS_DA_VITRINE));
    assert.equal(gravar.length, TETO_DE_FOTOS_DA_VITRINE);
    // E a última posição é `teto - 1`, que é o topo do `CHECK` do banco.
    assert.equal(gravar.at(-1)?.position, TETO_DE_FOTOS_DA_VITRINE - 1);
  });

  void it('PEDIR UMA, NUNCA COBRAR AS NOVE -- uma foto é estado válido', () => {
    assert.equal(conferirVitrinePedida(fotos(1)).length, 1);
  });

  void it('`photos: []` é estado válido: é assim que se tira todas', () => {
    assert.deepEqual(conferirVitrinePedida([]), []);
  });

  void it('a CAPA é a posição 0, e é a primeira do vetor que chegou', () => {
    const pedidas = fotos(3);
    const gravar = conferirVitrinePedida(pedidas);
    assert.equal(gravar[0]?.position, 0);
    assert.equal(gravar[0]?.uploadId, pedidas[0]?.upload_id, 'reordenar troca a capa');
    assert.deepEqual(gravar.map((f) => f.position), [0, 1, 2], 'a posição é o ÍNDICE, sem buraco');
  });

  void it('`upload_id` REPETIDO é recusado, e não resolvido escolhendo um', () => {
    const uma = fotos(1)[0] as FotoPedidaNaVitrine;
    const { status, errors } = erroDe(() => conferirVitrinePedida([uma, uma]));
    assert.equal(status, 400);
    assert.deepEqual(errors.map((e) => e.code), ['duplicate']);
  });

  void it('LEGENDA não existe: `alt_text` é rótulo, opcional, e com tamanho conferido', () => {
    assert.equal(conferirVitrinePedida(fotos(1)).at(0)?.altText, null, 'ausente vira nulo');
    const comRotulo = conferirVitrinePedida([{ ...(fotos(1)[0] as FotoPedidaNaVitrine), alt_text: '  meu cachorro  ' }]);
    assert.equal(comRotulo.at(0)?.altText, 'meu cachorro', 'pontas aparadas, como o CHECK mede');
    const { errors } = erroDe(() =>
      conferirVitrinePedida([{ ...(fotos(1)[0] as FotoPedidaNaVitrine), alt_text: 'x'.repeat(151) }]),
    );
    assert.deepEqual(errors.map((e) => e.code), ['length']);
  });
});
