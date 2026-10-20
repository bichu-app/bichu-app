/**
 * ISCA — `markMyConversationsSeen` está REGISTRADA, e não só declarada.
 *
 * ## O defeito que este arquivo existe para impedir que volte
 *
 * Medido em 20/10/2026 contra `https://hml.bichu.app` em `fb3a0fba`:
 *
 * ```
 * POST /v1/me/conversations-seen  ->  404
 * {"type":"https://hml.bichu.app/problems/not-found","title":"Não encontramos isso",
 *  "status":404,"instance":"/v1/me/conversations-seen"}
 * ```
 *
 * E tudo o que a operação precisa existia: ela está em `api/openapi.yaml` com
 * `x-effects: []` e teto de 240/h por conta, `rotaDeListaVista` está declarada
 * e EXPORTADA neste módulo, `ConversationService.marcarListaVista` existe, o
 * repositório grava em `conversation_list_views`, e o aplicativo Flutter CHAMA
 * a rota a cada abertura da área de mensagens. Faltava **uma** chamada de
 * `registrarRota`.
 *
 * O efeito não era cosmético: **o contador de mensagens não zerava por nenhum
 * caminho.** Pior, ele falhava calado — o cliente Dart engole a falha desta
 * chamada de propósito (está escrito em `ConversasApi.marcarListaVista`,
 * porque um erro em cima da lista que acabou de carregar seria um erro sobre
 * uma operação que ninguém pediu). Então o 404 não aparecia em tela nenhuma, e
 * o número ficava aceso para quem acabou de ler.
 *
 * ## POR QUE NENHUM PORTÃO PEGOU — e é o motivo de este arquivo não ser
 * ## redundante com `rotas-registradas-contra-o-contrato.test.ts`
 *
 * Aquele portão compara os `defineRoute` **exportados** com as operações do
 * contrato. A rota exportada já bastava para ele ficar verde: ele nunca
 * pergunta se `registrarRota` foi chamada. E `markMyConversationsSeen` também
 * não estava em `OPERACOES_AINDA_SEM_ROTA`, que é a lista onde uma ausência
 * DELIBERADA tem de estar escrita com motivo. A operação estava no vão entre
 * as duas listas: nem registrada, nem declarada ausente.
 *
 * É a vacuidade conhecida deste repositório numa forma nova — o portão lê a
 * ESPECIFICAÇÃO e a DECLARAÇÃO, e nunca a fiação. Então este caso faz o que o
 * outro não faz: chama `registrarRotasDeConversas` — a função de produção, a
 * mesma que `src/bin/api.ts` chama — e manda a requisição no servidor que
 * saiu dela.
 *
 * ## COMO DESLIGAR O MECANISMO E VER ESTE ARQUIVO REPROVAR
 *
 * Comente o bloco `registrarRota(app, rotaDeListaVista, ...)` em
 * `conversation-routes.ts`. Os dois casos passam a reprovar por nome, com o
 * 404 na mensagem. Religue e eles voltam.
 */
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

/**
 * Quem o serviço recebeu. É `undefined` até a rota chamar, e é por isso que o
 * segundo caso consegue distinguir "respondeu 204" de "respondeu 204 e fez a
 * coisa": um handler que devolvesse 204 sem chamar o serviço passaria no
 * primeiro caso e reprovaria no segundo.
 */
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
    // As outras rotas do módulo pedem o esquema de corpo do contrato no
    // momento do REGISTRO, não no do pedido: sem este dublê,
    // `registrarRotasDeConversas` estoura antes de chegar na rota medida.
    contrato: {
      requestBodySchema: () => ({ type: 'object' }),
    } as unknown as DependenciasDasRotasDeConversa['contrato'],
    idempotencia: undefined as unknown as DependenciasDasRotasDeConversa['idempotencia'],
    clock: { now: () => new Date('2026-10-20T12:00:00.000Z') } as unknown as DependenciasDasRotasDeConversa['clock'],
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
  // A FUNÇÃO DE PRODUÇÃO, e não `registrarRota` direto: registrar a rota aqui
  // provaria que o mecanismo de registro funciona, que é o que já se sabe. O
  // que estava quebrado era a FIAÇÃO -- esta função não chamava aquela --, e
  // só chamando esta função o caso enxerga isso.
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
