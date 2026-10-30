/** A forma do que se publica, e o cursor da linha do tempo. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Instant } from '../../../shared/types/brands.js';
import {
  PAGINA_MAXIMA_DA_LINHA_DO_TEMPO,
  PAGINA_PADRAO_DA_LINHA_DO_TEMPO,
  TETO_DO_CORPO_DA_PUBLICACAO,
  conferirLimite,
  conferirPublicacaoPedida,
  escreverCursor,
  lerCursor,
} from './publicacao.js';

const REF = 'AaBbCcDdEeFfGgHhIiJjKk';
const ENVIO = '018f7c1e-7a2b-7c3d-9e4f-000000000001';

/** Os campos recusados, em `campo:codigo`, para comparar sem ordem de prosa. */
function recusasDe(pedida: Parameters<typeof conferirPublicacaoPedida>[0]): string[] {
  const saida = conferirPublicacaoPedida(pedida);
  return 'recusas' in saida ? saida.recusas.map((r) => `${r.field}:${r.code}`).sort() : [];
}

void describe('a forma da publicacao pedida', () => {
  void it('texto puro passa, e e o caso comum', () => {
    const saida = conferirPublicacaoPedida({ body: 'o Bidu no parque hoje' });
    assert.ok('ok' in saida);
    assert.equal(saida.ok.corpo, 'o Bidu no parque hoje');
    assert.equal(saida.ok.uploadId, null);
    assert.equal(saida.ok.textoAlternativo, null);
  });

  void it('texto mais foto passa, com o texto alternativo', () => {
    const saida = conferirPublicacaoPedida({
      body: 'olha ele',
      upload_id: ENVIO,
      alt_text: 'o Bidu correndo na grama',
    });
    assert.ok('ok' in saida);
    assert.equal(saida.ok.uploadId, ENVIO);
    assert.equal(saida.ok.textoAlternativo, 'o Bidu correndo na grama');
  });

  void it('corpo ausente, vazio ou so de espacos e recusado com `body:required`', () => {
    assert.deepEqual(recusasDe({}), ['body:required']);
    assert.deepEqual(recusasDe({ body: '' }), ['body:required']);
    assert.deepEqual(recusasDe({ body: '    ' }), ['body:required']);
    assert.deepEqual(recusasDe({ body: 42 }), ['body:required']);
  });

  void it('280 passa e 281 reprova -- o teto e o da denuncia, nao uma escolha daqui', () => {
    assert.equal(TETO_DO_CORPO_DA_PUBLICACAO, 280);
    assert.deepEqual(recusasDe({ body: 'a'.repeat(280) }), []);
    assert.deepEqual(recusasDe({ body: 'a'.repeat(281) }), ['body:maximum']);
  });

  void it('ISCA -- o teto conta PONTOS DE CODIGO, como o `char_length` do Postgres', () => {
    const duzentosOitentaEmojis = '\u{1F436}'.repeat(280);
    assert.equal(duzentosOitentaEmojis.length, 560, 'o pressuposto da isca mudou');
    assert.deepEqual(
      recusasDe({ body: duzentosOitentaEmojis }),
      [],
      'a contagem voltou a ser `String.length`: ela divergiu do `char_length` do Postgres',
    );
    assert.deepEqual(recusasDe({ body: '\u{1F436}'.repeat(281) }), ['body:maximum']);
  });

  void it('texto alternativo SEM foto e recusado: ele nao descreve nada', () => {
    assert.deepEqual(recusasDe({ body: 'texto', alt_text: 'uma descricao' }), ['alt_text:conflict']);
  });

  void it('texto alternativo tem a faixa 2-150, a MESMA da capa do encontro', () => {
    assert.deepEqual(recusasDe({ body: 'x', upload_id: ENVIO, alt_text: 'a' }), ['alt_text:minimum']);
    assert.deepEqual(recusasDe({ body: 'x', upload_id: ENVIO, alt_text: 'ab' }), []);
    assert.deepEqual(recusasDe({ body: 'x', upload_id: ENVIO, alt_text: 'a'.repeat(150) }), []);
    assert.deepEqual(recusasDe({ body: 'x', upload_id: ENVIO, alt_text: 'a'.repeat(151) }), [
      'alt_text:maximum',
    ]);
  });

  void it('texto alternativo e OPCIONAL com foto: vazio vira nulo e nao recusa', () => {
    const saida = conferirPublicacaoPedida({ body: 'x', upload_id: ENVIO, alt_text: '   ' });
    assert.ok('ok' in saida);
    assert.equal(saida.ok.textoAlternativo, null);
  });

  void it('AS RECUSAS SOMAM: corpo vazio e rotulo sem foto vem juntos', () => {
    assert.deepEqual(recusasDe({ body: '', alt_text: 'uma descricao' }), [
      'alt_text:conflict',
      'body:required',
    ]);
  });

  void it('ISCA -- NAO HA FILTRO DE PALAVRA, e este caso reprova quem acrescentar um', () => {
    for (const texto of [
      'seu idiota, isso e um absurdo',
      '<script>alert(1)</script>',
      'me liga no 11 91234-5678',
      'vende filhote em http://exemplo.invalid',
      '3 < 5 e 7 > 2',
    ]) {
      assert.deepEqual(
        recusasDe({ body: texto }),
        [],
        `o texto \`${texto}\` foi recusado: alguem acrescentou filtro de conteudo, e o cliente ` +
          'decidiu o contrario em 18/10/2026',
      );
    }
  });
});

void describe('o cursor da linha do tempo', () => {
  const INSTANTE = Date.parse('2026-10-20T12:34:56.789Z') as Instant;

  void it('escrever e ler devolve o mesmo par', () => {
    const lido = lerCursor(escreverCursor({ antesDe: INSTANTE, ref: REF }));
    assert.deepEqual(lido, { antesDe: INSTANTE, ref: REF });
  });

  void it('ISCA -- o cursor NAO carrega UUID: so instante e o `ref` publico', () => {
    const cursor = escreverCursor({ antesDe: INSTANTE, ref: REF });
    const decodificado = Buffer.from(cursor, 'base64url').toString('utf8');
    assert.doesNotMatch(
      decodificado,
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      'o cursor passou a carregar um UUID: o item 6 do ADR-0010 o proibe em saida, ' +
        'e base64 nao e segredo',
    );
    assert.equal(decodificado, `2026-10-20T12:34:56.789Z|${REF}`);
  });

  void it('cursor ilegivel devolve `undefined`, e nao lanca', () => {
    for (const ruim of [
      '',
      'nao-e-base64-com-barra/',
      Buffer.from('sem separador').toString('base64url'),
      Buffer.from('|so-o-separador').toString('base64url'),
      Buffer.from('2026-10-20T12:00:00Z|curto').toString('base64url'),
      Buffer.from(`nao-e-data|${REF}`).toString('base64url'),
    ]) {
      assert.equal(lerCursor(ruim), undefined, `\`${ruim}\` passou`);
    }
  });

  void it('ISCA -- o `ref` do cursor tem de ter a FORMA do endereco publico', () => {
    assert.equal(
      lerCursor(Buffer.from(`2026-10-20T12:00:00Z|${'x'.repeat(500)}`).toString('base64url')),
      undefined,
    );
    assert.equal(
      lerCursor(Buffer.from('2026-10-20T12:00:00Z|tem/barra/e/nao/vale').toString('base64url')),
      undefined,
    );
  });

  void it('o `ref` com `|` dentro nao quebra a leitura -- o corte e no PRIMEIRO separador', () => {
    const lido = lerCursor(Buffer.from(`2026-10-20T12:00:00.000Z|${REF}`).toString('base64url'));
    assert.equal(lido?.ref, REF);
  });
});

void describe('o limite da pagina', () => {
  void it('ausente vira o padrao de 20', () => {
    assert.deepEqual(conferirLimite(undefined), { limite: PAGINA_PADRAO_DA_LINHA_DO_TEMPO });
    assert.deepEqual(conferirLimite(null), { limite: 20 });
    assert.deepEqual(conferirLimite(''), { limite: 20 });
  });

  void it('dentro da faixa passa, e o teto e 50 -- o mesmo do parametro `Limit` do contrato', () => {
    assert.deepEqual(conferirLimite(1), { limite: 1 });
    assert.deepEqual(conferirLimite('30'), { limite: 30 });
    assert.deepEqual(conferirLimite(PAGINA_MAXIMA_DA_LINHA_DO_TEMPO), { limite: 50 });
  });

  void it('ISCA -- fora da faixa e RECUSA e nao aparo em silencio', () => {
    for (const ruim of [0, -1, 51, 500, 1.5, 'muitos', Number.NaN]) {
      const saida = conferirLimite(ruim);
      assert.ok('recusa' in saida, `\`${String(ruim)}\` passou em vez de ser recusado`);
      assert.equal(saida.recusa.field, 'limit');
    }
  });
});
