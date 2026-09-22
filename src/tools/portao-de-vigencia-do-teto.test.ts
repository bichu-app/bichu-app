/**
 * O portão de vigência, e **a isca que prova que ele sabe reprovar**.
 *
 * Critério 10 da BICHUS-178, palavra por palavra: *"o portão rodado contra uma
 * aplicação com o limitador desligado precisa reprovar"*. Sem este segundo caso
 * no repositório, o portão vale pela confiança de quem o escreveu no dia em que
 * o escreveu — e é justamente assim que o portão anterior passou meses verde
 * sobre um mecanismo inexistente.
 *
 * `criarContadorDesligado` não é um dublê montado aqui: é a implementação real
 * da porta que a aplicação usa com `RATE_LIMIT_DRIVER=disabled`. A isca exercita
 * o caminho que a subida agora recusa fora de `dev`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { criarContadorDesligado, criarContadorEmMemoria } from '../shared/http/rate-limit.js';
import { exercerTetoDoWebhook, TETO_DE_INVALIDAS_DO_WEBHOOK } from './portao-de-vigencia-do-teto.js';

void describe('portão de vigência do teto de chamada', () => {
  void it('aprova com o contador ligado: a 21ª inválida sai 429 antes da conferência', async () => {
    const veredicto = await exercerTetoDoWebhook(criarContadorEmMemoria(() => Date.now()));

    assert.equal(veredicto.aprovado, true, veredicto.motivo);
    assert.equal(veredicto.status.length, TETO_DE_INVALIDAS_DO_WEBHOOK + 1);
    assert.equal(veredicto.tipoDaUltima, 'rate-limited');
  });

  void it('ISCA: com o limitador desligado o portão REPROVA', async () => {
    const veredicto = await exercerTetoDoWebhook(criarContadorDesligado());

    assert.equal(
      veredicto.aprovado,
      false,
      'o portão aprovou com o limitador DESLIGADO. Um portão que passa sem teto não ' +
        'prova teto nenhum, e é exatamente o estado que a BICHUS-178 existe para fechar.',
    );
    // Reprova pelo motivo certo, e não por qualquer motivo: sem isto, uma falha
    // acidental (contrato ilegível, rota ausente) faria a isca "passar" sem ter
    // exercido nada.
    assert.match(veredicto.motivo, /deveria sair 429/);
    assert.equal(veredicto.status[TETO_DE_INVALIDAS_DO_WEBHOOK], 401);
  });

  void it('ISCA: contrato ilegível REPROVA, nunca aprova por falta do que checar', async () => {
    await assert.rejects(
      () => exercerTetoDoWebhook(criarContadorEmMemoria(() => Date.now()), 'api/nao-existe.yaml'),
      'contrato ausente precisa derrubar o portão, e não deixá-lo verde',
    );
  });
});
