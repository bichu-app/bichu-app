import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ocultarCodigoDaTagNaUrl } from './redacao-de-url.js';

const CODIGO = 'GQSM0XHBT4D9G31S';
const IMPRESSO = 'GQSM-0XHB-T4D9-G31S';
const CODIGO_DO_FORMATO_ANTIGO = '7K2F9QJB3XR05TWD8MNCVH1234';

void describe('o código da tag não entra no log em claro', () => {
  void it('some da rota de resolução', () => {
    const saida = ocultarCodigoDaTagNaUrl(`/v1/tags/${CODIGO}`);
    assert.doesNotMatch(saida, new RegExp(CODIGO));
    assert.match(saida, /^\/v1\/tags\/sha256:[0-9a-f]{12}$/);
  });

  void it('some também na forma impressa, com hífen', () => {
    const saida = ocultarCodigoDaTagNaUrl(`/v1/tags/${IMPRESSO}`);
    assert.doesNotMatch(saida, /GQSM/);
  });

  void it('some nos caminhos que pendem dele, preservando o resto', () => {
    assert.equal(
      ocultarCodigoDaTagNaUrl(`/v1/tags/${CODIGO}/owner-context`).includes(CODIGO),
      false,
    );
    assert.match(
      ocultarCodigoDaTagNaUrl(`/v1/tags/${CODIGO}/found-reports`),
      /\/found-reports$/,
    );
  });

  void it('some antes da query, e a query continua lá', () => {
    const saida = ocultarCodigoDaTagNaUrl(`/v1/tags/${CODIGO}?origem=qr`);
    assert.doesNotMatch(saida, new RegExp(CODIGO));
    assert.match(saida, /\?origem=qr$/);
  });

  void it('o mesmo código produz sempre o mesmo resumo: o log continua correlacionável', () => {
    assert.equal(
      ocultarCodigoDaTagNaUrl(`/v1/tags/${CODIGO}`),
      ocultarCodigoDaTagNaUrl(`/v1/tags/${CODIGO}`),
    );
  });

  void it('códigos diferentes produzem resumos diferentes', () => {
    assert.notEqual(
      ocultarCodigoDaTagNaUrl(`/v1/tags/${CODIGO}`),
      ocultarCodigoDaTagNaUrl('/v1/tags/ZZZZZZZZZZZZZZZN'),
    );
  });

  void it('o intervalo do padrão acompanhou o contrato, e o de 26 não casa mais', () => {
    assert.match(ocultarCodigoDaTagNaUrl(`/v1/tags/${CODIGO}`), /sha256:/);
    assert.equal(
      ocultarCodigoDaTagNaUrl(`/v1/tags/${CODIGO_DO_FORMATO_ANTIGO}`),
      `/v1/tags/${CODIGO_DO_FORMATO_ANTIGO}`,
    );
  });

  void it('não mexe no que não é código: o log precisa continuar dizendo o que houve', () => {
    for (const caminho of [
      '/v1/health',
      '/v1/auth/login',
      '/v1/public/reference-data',
      '/v1/pets/018f3a2b-0000-7000-8000-0000000000cc/tags',
    ]) {
      assert.equal(ocultarCodigoDaTagNaUrl(caminho), caminho);
    }
  });
});
