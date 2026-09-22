/**
 * As três recusas de `corpoAusenteEhCorpoVazio`, contra o contrato de verdade.
 *
 * A terceira é a que importa. Um gancho que repõe `{}` numa rota de corpo
 * **obrigatório** apaga a exigência sem deixar rastro: o `required` do schema
 * deixaria de acusar, e `logout` voltaria a aceitar a requisição vazia que a
 * correção da BICHUS-81 existe para recusar. O mecanismo que protege o `logout`
 * morreria por um gancho colado na rota errada, e nenhum teste de `logout`
 * acusaria — ele passaria a testar uma rota que não existe mais como era.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { carregarContrato } from './contract.js';
import { corpoAusenteEhCorpoVazio } from './corpo-opcional.js';

const contrato = carregarContrato('api/openapi.yaml');

void describe('corpoAusenteEhCorpoVazio recusa a fiação errada na subida', () => {
  void it('operationId que não existe no contrato', () => {
    assert.throws(
      () => corpoAusenteEhCorpoVazio(contrato, 'operacaoQueNaoExiste'),
      /não existe no contrato/,
    );
  });

  void it('operação sem `requestBody` declarado', () => {
    assert.throws(
      () => corpoAusenteEhCorpoVazio(contrato, 'listPetTags'),
      /não declara requestBody/,
    );
  });

  void it('operação de corpo OBRIGATÓRIO: o gancho apagaria a exigência', () => {
    assert.throws(() => corpoAusenteEhCorpoVazio(contrato, 'logout'), /OBRIGATÓRIO/);
  });

  void it('operação de corpo opcional é a única que ele aceita', () => {
    assert.doesNotThrow(() =>
      corpoAusenteEhCorpoVazio(contrato, 'createFoundReportFromTag'),
    );
  });
});
