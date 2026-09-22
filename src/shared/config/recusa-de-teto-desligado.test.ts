/**
 * Critérios 6 e 7 da BICHUS-178: `RATE_LIMIT_DRIVER=disabled` só é legítimo em
 * `dev`.
 *
 * A trava existe porque o contador desligado **sempre permite**. Não há degradação
 * parcial, não há alerta, não há linha de log diferente: o serviço responde 200 a
 * tudo exatamente como responderia com o teto valendo. Um ambiente que suba assim
 * fica descoberto e ninguém descobre, que é a mesma classe de silêncio que fez
 * esta história existir.
 *
 * `assertSafeBoot` roda antes de o processo ouvir qualquer porta (`bin/api.ts`).
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { assertSafeBoot } from './env.js';
import { rateLimitDriver } from './app-config.js';

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
});

void describe('recusa de subida com o limitador desligado', () => {
  void it('critério 6: fora de dev, a aplicação NÃO sobe e a mensagem diz o motivo', () => {
    for (const ambiente of ['preprod', 'prod', 'homologacao']) {
      process.env = { ...ORIGINAL, ENVIRONMENT: ambiente, RATE_LIMIT_DRIVER: 'disabled' };

      assert.throws(
        () => {
          assertSafeBoot();
        },
        (erro: unknown) => {
          assert.ok(erro instanceof Error);
          // A mensagem nomeia a variável E o ambiente: quem lê o log de um boot
          // que morreu precisa saber o que mudar, não só que algo deu errado.
          assert.match(erro.message, /RATE_LIMIT_DRIVER=disabled/);
          assert.match(erro.message, new RegExp(ambiente));
          return true;
        },
        `subiu com ENVIRONMENT=${ambiente} e o limitador desligado`,
      );
    }
  });

  void it('critério 6: a trava vale mesmo sem NODE_ENV=production', () => {
    // A versão anterior de `assertSafeBoot` desviava para fora na primeira linha
    // quando `NODE_ENV` não era `production`. Homologação não roda com
    // `NODE_ENV=production`, então uma trava colocada depois daquele desvio
    // deixaria passar justamente o ambiente que este critério protege.
    process.env = { ...ORIGINAL, ENVIRONMENT: 'preprod', RATE_LIMIT_DRIVER: 'disabled' };
    delete process.env['NODE_ENV'];

    assert.throws(() => {
      assertSafeBoot();
    }, /RATE_LIMIT_DRIVER=disabled/);
  });

  void it('critério 7: em dev a aplicação sobe normalmente', () => {
    process.env = { ...ORIGINAL, ENVIRONMENT: 'dev', RATE_LIMIT_DRIVER: 'disabled' };
    delete process.env['NODE_ENV'];

    assert.doesNotThrow(() => {
      assertSafeBoot();
    });
  });

  void it('critério 7: sem ENVIRONMENT o padrão é dev, e dev sobe', () => {
    process.env = { ...ORIGINAL, RATE_LIMIT_DRIVER: 'disabled' };
    delete process.env['ENVIRONMENT'];
    delete process.env['NODE_ENV'];

    assert.doesNotThrow(() => {
      assertSafeBoot();
    });
  });

  void it('`memory` e `postgres` sobem em qualquer ambiente', () => {
    for (const driver of ['memory', 'postgres']) {
      process.env = {
        ...ORIGINAL,
        ENVIRONMENT: 'preprod',
        RATE_LIMIT_DRIVER: driver,
        APP_INSTANCES: '1',
      };
      assert.doesNotThrow(() => {
        assertSafeBoot();
      });
    }
  });
});

void describe('leitura do driver', () => {
  void it('falha ruidosa: sem a variável, o boot morre nomeando ela', () => {
    process.env = { ...ORIGINAL };
    delete process.env['RATE_LIMIT_DRIVER'];

    assert.throws(() => rateLimitDriver(), /RATE_LIMIT_DRIVER/);
  });

  void it('valor desconhecido não vira padrão silencioso', () => {
    process.env = { ...ORIGINAL, RATE_LIMIT_DRIVER: 'redis' };

    assert.throws(() => rateLimitDriver(), /não é um contador conhecido/);
  });

  void it('os três valores conhecidos passam', () => {
    for (const driver of ['memory', 'postgres', 'disabled'] as const) {
      process.env = { ...ORIGINAL, RATE_LIMIT_DRIVER: driver };
      assert.equal(rateLimitDriver(), driver);
    }
  });
});
