/**
 * ISCA — a rota da duvida de ajuda esta REGISTRADA, e nao so declarada.
 *
 * ## O defeito que este arquivo existe para impedir que volte
 *
 * `POST /v1/me/conversations-seen` respondeu **404** em homologacao em
 * 20/10/2026 por faltar **uma** chamada de `registrarRota`. Tudo o mais
 * existia: a operacao no contrato, o `defineRoute` exportado, o servico, o
 * repositorio e o app chamando. Nenhum portao pegou, porque
 * `rotas-registradas-contra-o-contrato.test.ts` compara os `defineRoute`
 * EXPORTADOS com a spec e **nunca pergunta se `registrarRota` foi chamada**.
 *
 * Aqui a conta de repetir aquele defeito seria alta de um jeito proprio: o
 * tutor escreve a duvida, toca em `Enviar`, ve o recado de recebido, e **nada
 * foi gravado**. Ele fica esperando uma resposta que nunca vem, e ninguem do
 * lado de ca descobre, porque a fila vazia e indistinguivel de "ninguem
 * perguntou nada hoje".
 *
 * ## COMO DESLIGAR O MECANISMO E VER ESTE ARQUIVO REPROVAR
 *
 * Comente o bloco `registrarRota(app, rotaDeDuvidaDeAjuda, ...)` em
 * `help-request-routes.ts`: reprova
 * `ISCA: POST /me/help-requests nao e 404`. Religue e volta.
 *
 * ## POR QUE A FUNCAO DE PRODUCAO, e nao `registrarRota` direto
 *
 * Registrar a rota aqui provaria que o MECANISMO funciona, que e o que ja se
 * sabe. O que quebra e a FIACAO. Entao os casos chamam `registrarRotasDeAjuda`
 * -- a mesma funcao que `src/bin/api.ts` chama.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { criarContadorEmMemoria } from '../../../../shared/http/rate-limit.js';
import { zerarInventario } from '../../../../shared/http/registrar-rota.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import type { AbsoluteUrl, UserId } from '../../../../shared/types/brands.js';
import {
  registrarRotasDeAjuda,
  type DependenciasDasRotasDeAjuda,
} from './help-request-routes.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const CONTA = '018f3a2b-0000-7000-8000-0000000000bb';

interface OQueChegou {
  registrou?: { conta: string; assunto: string; texto: string };
}

function dependenciasDeTeste(registro: OQueChegou): DependenciasDasRotasDeAjuda {
  return {
    autenticador: { autenticar: () => Promise.resolve({ userId: CONTA as UserId }) },
    duvidas: {
      registrar: (chamador: { userId: string }, assunto: string, texto: string) => {
        registro.registrou = { conta: chamador.userId, assunto, texto };
        return Promise.resolve();
      },
    },
    // O esquema do corpo e pedido no momento do REGISTRO e nao no do pedido.
    // `additionalProperties: false` AQUI TAMBEM nao e detalhe do duble:
    // `recusarCampoDesconhecido` **derruba a subida** quando montado sobre
    // corpo aberto, e um duble sem esta linha faria o registro estourar.
    contrato: {
      requestBodySchema: () => ({
        type: 'object',
        additionalProperties: false,
        required: ['subject', 'body'],
        properties: {
          subject: { type: 'string', minLength: 2, maxLength: 120 },
          body: { type: 'string', minLength: 2, maxLength: 4000 },
        },
      }),
    } as unknown as DependenciasDasRotasDeAjuda['contrato'],
  };
}

function servidor(deps: DependenciasDasRotasDeAjuda) {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(criarContadorEmMemoria(() => Date.now())),
    bodyLimitBytes: 1_048_576,
  });
  registrarRotasDeAjuda(app, deps);
  return app;
}

void describe('ISCA: a rota da duvida de ajuda responde', () => {
  void it('ISCA: POST /me/help-requests nao e 404 -- ela esta registrada', async () => {
    zerarInventario();
    const registro: OQueChegou = {};
    const app = servidor(dependenciasDeTeste(registro));
    try {
      const resposta = await app.inject({
        method: 'POST',
        url: '/me/help-requests',
        headers: { authorization: 'Bearer token-de-teste' },
        payload: { subject: 'Nao salva o segundo pet', body: 'A tela volta para o comeco.' },
      });
      assert.notEqual(
        resposta.statusCode,
        404,
        'REPROVA: a rota respondeu 404. Ela esta DECLARADA (`rotaDeDuvidaDeAjuda`) e ' +
          'NAO REGISTRADA: falta a chamada de `registrarRota` em ' +
          '`registrarRotasDeAjuda`. O tutor veria o recado de recebido e nada teria ' +
          'sido gravado -- e fila vazia e indistinguivel de dia sem pergunta.',
      );
      assert.equal(resposta.statusCode, 202, `Corpo: ${resposta.body}`);
      // O CORPO, campo a campo. **Nenhum portao deste repositorio confere corpo
      // de resposta**: so o corpo da REQUISICAO e validado.
      assert.deepEqual(
        JSON.parse(resposta.body),
        { status: 'accepted' },
        'REPROVA: o contrato declara `202` com `#/components/responses/Accepted`, cujo ' +
          'unico campo obrigatorio e `status: accepted`.',
      );
      assert.deepEqual(
        registro.registrou,
        {
          conta: CONTA,
          assunto: 'Nao salva o segundo pet',
          texto: 'A tela volta para o comeco.',
        },
        'REPROVA: a rota respondeu 202 e o servico nao foi chamado com a conta do token ' +
          'e com os dois campos. Handler que aceita sem gravar e exatamente a falha ' +
          'que esta tela nao pode ter: ela promete resposta.',
      );
    } finally {
      await app.close();
    }
  });

  void it('ISCA: o autor sai da SESSAO e nunca do corpo', async () => {
    zerarInventario();
    const registro: OQueChegou = {};
    const app = servidor(dependenciasDeTeste(registro));
    try {
      const resposta = await app.inject({
        method: 'POST',
        url: '/me/help-requests',
        headers: { authorization: 'Bearer token-de-teste' },
        payload: {
          subject: 'Assunto qualquer',
          body: 'Texto qualquer.',
          author_user_id: '018f3a2b-0000-7000-8000-00000000dead',
        },
      });
      assert.equal(
        resposta.statusCode,
        400,
        `REPROVA: um corpo com \`author_user_id\` passou com ${String(resposta.statusCode)}. ` +
          'O autor sai do `Bearer`, e aceitar um campo de autor no corpo -- ainda que ' +
          'o handler o ignore -- faria o chamador acreditar que escolheu de quem e a ' +
          'duvida. `additionalProperties: false` no CONTRATO nao fecha o corpo em ' +
          'execucao: o Ajv do Fastify roda com `removeAdditional: true` e APAGA o ' +
          'campo em silencio. Quem recusa e `recusarCampoDesconhecido`.',
      );
      assert.equal(
        registro.registrou,
        undefined,
        'REPROVA: o 400 veio DEPOIS de o servico ser chamado.',
      );
    } finally {
      await app.close();
    }
  });

  void it('ISCA: campo de contato a mais e 400 -- e nao 202 com o contato apagado', async () => {
    zerarInventario();
    const registro: OQueChegou = {};
    const app = servidor(dependenciasDeTeste(registro));
    try {
      const resposta = await app.inject({
        method: 'POST',
        url: '/me/help-requests',
        headers: { authorization: 'Bearer token-de-teste' },
        payload: {
          subject: 'Assunto qualquer',
          body: 'Texto qualquer.',
          email: 'tutor@exemplo.com.br',
        },
      });
      assert.equal(
        resposta.statusCode,
        400,
        `REPROVA: um \`email\` a mais passou com ${String(resposta.statusCode)}. ` +
          'Este e O campo que alguem tentara acrescentar num formulario de suporte, e ' +
          'o desfecho ruim e silencioso: 202 com o contato APAGADO pelo ' +
          '`removeAdditional`, e o tutor saindo da tela acreditando ter deixado um ' +
          'jeito de ser respondido.',
      );
    } finally {
      await app.close();
    }
  });

  void it('ISCA: assunto acima do teto e 400 -- o teto RECUSA e nunca trunca', async () => {
    zerarInventario();
    const registro: OQueChegou = {};
    const app = servidor(dependenciasDeTeste(registro));
    try {
      const resposta = await app.inject({
        method: 'POST',
        url: '/me/help-requests',
        headers: { authorization: 'Bearer token-de-teste' },
        payload: { subject: 'a'.repeat(121), body: 'Texto qualquer.' },
      });
      assert.equal(
        resposta.statusCode,
        400,
        `REPROVA: assunto de 121 caracteres passou com ${String(resposta.statusCode)}. ` +
          'O `maxLength: 120` do contrato tem de recusar ANTES do handler, senao o ' +
          '`CHECK help_requests_assunto_tamanho` do banco vira a primeira linha de ' +
          'defesa em vez da terceira -- e o desfecho seria 500 em vez de 400.',
      );
      assert.equal(
        registro.registrou,
        undefined,
        'REPROVA: o 400 veio depois de o servico gravar. Truncar em silencio foi ' +
          'recusado de proposito: o fim do texto e onde o tutor diz o que ja tentou.',
      );
    } finally {
      await app.close();
    }
  });

  void it('ISCA: assunto exatamente no teto PASSA -- o controle positivo do caso acima', async () => {
    zerarInventario();
    const registro: OQueChegou = {};
    const app = servidor(dependenciasDeTeste(registro));
    try {
      const resposta = await app.inject({
        method: 'POST',
        url: '/me/help-requests',
        headers: { authorization: 'Bearer token-de-teste' },
        payload: { subject: 'a'.repeat(120), body: 'b'.repeat(4000) },
      });
      assert.equal(
        resposta.statusCode,
        202,
        `REPROVA: o teto exato foi recusado com ${String(resposta.statusCode)}. Sem este ` +
          'caso, um `maxLength` apertado demais -- ou um portao que recusasse tudo -- ' +
          'passaria pelo caso de cima sem ninguem notar.',
      );
      assert.equal(registro.registrou?.assunto.length, 120);
      assert.equal(registro.registrou?.texto.length, 4000);
    } finally {
      await app.close();
    }
  });

  void it('ISCA: sem credencial e 401 -- nao existe duvida anonima', async () => {
    zerarInventario();
    const app = servidor(dependenciasDeTeste({}));
    try {
      const resposta = await app.inject({
        method: 'POST',
        url: '/me/help-requests',
        payload: { subject: 'Assunto qualquer', body: 'Texto qualquer.' },
      });
      assert.equal(
        resposta.statusCode,
        401,
        'REPROVA: a rota aceitou sem credencial. O botao mora no menu do usuario, entao ' +
          'ha sessao -- e duvida sem autor nao e respondivel, que e o contrario do que ' +
          'a fila existe para ser.',
      );
    } finally {
      await app.close();
    }
  });
});
