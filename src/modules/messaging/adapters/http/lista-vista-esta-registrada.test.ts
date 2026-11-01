import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { criarServidor } from '../../../../shared/http/server.js';
import { zerarInventario } from '../../../../shared/http/registrar-rota.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import { criarContadorEmMemoria } from '../../../../shared/http/rate-limit.js';
import {
  registrarRotasDeConversas,
  type DependenciasDasRotasDeConversa,
} from './conversation-routes.js';
import type { AbsoluteUrl, UserId } from '../../../../shared/types/brands.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const CONTA = '018f3a2b-0000-7000-8000-0000000000aa';

let chamadorQueChegou: string | undefined;

function dependenciasDeTeste(): DependenciasDasRotasDeConversa {
  chamadorQueChegou = undefined;
  return {
    autenticador: { autenticar: () => Promise.resolve({ userId: CONTA as UserId }) },
    conversas: {
      marcarListaVista: (chamador: { userId: string }) => {
        chamadorQueChegou = chamador.userId;
        return Promise.resolve();
      },
    } as unknown as DependenciasDasRotasDeConversa['conversas'],
    contrato: {
      requestBodySchema: () => ({ type: 'object' }),
    } as unknown as DependenciasDasRotasDeConversa['contrato'],
    idempotencia: undefined as unknown as DependenciasDasRotasDeConversa['idempotencia'],
    clock: { now: () => new Date('2026-10-20T12:00:00.000Z') } as unknown as DependenciasDasRotasDeConversa['clock'],
    assinarFoto: (chave: string) =>
      Promise.resolve(`https://privado.invalid/${chave}` as AbsoluteUrl),
    baseDeMidia: 'https://img.bichu.test' as AbsoluteUrl,
  };
}

function servidor(deps: DependenciasDasRotasDeConversa) {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(criarContadorEmMemoria(() => Date.now())),
    bodyLimitBytes: 1_048_576,
  });
  registrarRotasDeConversas(app, deps);
  return app;
}

function marcarVista(app: ReturnType<typeof servidor>) {
  return app.inject({
    method: 'POST',
    url: '/me/conversations-seen',
    headers: { authorization: 'Bearer token-de-teste' },
  });
}

void describe('ISCA: a rota que ZERA o contador de mensagens responde', () => {
  void it('ISCA: `POST /me/conversations-seen` nao e 404 -- ela esta registrada', async () => {
    zerarInventario();
    const app = servidor(dependenciasDeTeste());
    try {
      const resposta = await marcarVista(app);
      assert.notEqual(
        resposta.statusCode,
        404,
        'REPROVA: a rota respondeu 404. Ela esta DECLARADA (`rotaDeListaVista`) e ' +
          'NAO REGISTRADA: falta a chamada de `registrarRota` em ' +
          '`registrarRotasDeConversas`. Foi exatamente este 404 que homologacao ' +
          'devolveu em 20/10/2026, e com ele o contador de mensagens nao zera por ' +
          'nenhum caminho -- calado, porque o app engole a falha desta chamada.',
      );
      assert.equal(
        resposta.statusCode,
        204,
        `REPROVA: o contrato declara 204 e a rota respondeu ${String(resposta.statusCode)}. ` +
          `Corpo: ${resposta.body}`,
      );
      assert.equal(
        resposta.body,
        '',
        'REPROVA: 204 com corpo. O contrato declara resposta sem conteudo, e ' +
          'nenhum portao deste repositorio confere o CORPO da resposta.',
      );
    } finally {
      await app.close();
    }
  });

  void it('ISCA: o 204 chega depois de o servico ser chamado com a conta do token', async () => {
    zerarInventario();
    const deps = dependenciasDeTeste();
    const app = servidor(deps);
    try {
      const resposta = await marcarVista(app);
      assert.equal(resposta.statusCode, 204);
      assert.equal(
        chamadorQueChegou,
        CONTA,
        'REPROVA: a rota respondeu 204 e o servico nao recebeu a conta do token. ' +
          'Um handler que devolve 204 sem escrever `conversation_list_views` deixa ' +
          'o contador aceso e a tela achando que zerou -- que e pior que o 404, ' +
          'porque o 404 pelo menos e visivel para quem mede.',
      );
    } finally {
      await app.close();
    }
  });
});
