/**
 * ISCA — as DUAS rotas dos contadores estao REGISTRADAS, e nao so declaradas.
 *
 * ## O defeito que este arquivo existe para impedir que volte
 *
 * `POST /v1/me/conversations-seen` respondeu **404** em homologacao em
 * 20/10/2026 (`fb3a0fba`) porque faltava **uma** chamada de `registrarRota`.
 * Tudo o mais existia: a operacao no contrato, o `defineRoute` exportado, o
 * servico, o repositorio e o app chamando. O efeito foi inteiro -- o contador
 * de mensagens nao zerava por nenhum caminho -- e foi CALADO, porque o cliente
 * Dart engole a falha dessa chamada de proposito.
 *
 * **Nenhum portao pegou**, e o motivo e estrutural:
 * `rotas-registradas-contra-o-contrato.test.ts` compara os `defineRoute`
 * EXPORTADOS com a spec, e nunca pergunta se `registrarRota` foi chamada; e a
 * operacao nao estava em `OPERACOES_AINDA_SEM_ROTA`, a lista onde uma ausencia
 * DELIBERADA tem de estar escrita com motivo. Ela estava no vao entre as duas.
 *
 * Estas duas rotas sao do MESMO TIPO -- um par "conta" + "vi" que o app chama e
 * cuja falha ele tambem engole --, entao elas precisam da mesma isca.
 *
 * ## COMO DESLIGAR O MECANISMO E VER ESTE ARQUIVO REPROVAR
 *
 * Comente o bloco `registrarRota(app, rotaDeContadoresDeSecao, ...)` em
 * `section-counter-routes.ts`: reprova
 * `ISCA: GET /me/section-counters nao e 404`. Comente o bloco de
 * `rotaDeSecaoVista`: reprova
 * `ISCA: POST /me/sections-seen nao e 404`. Religue e os dois voltam.
 *
 * ## POR QUE A FUNCAO DE PRODUCAO, e nao `registrarRota` direto
 *
 * Registrar a rota aqui provaria que o MECANISMO de registro funciona, que e o
 * que ja se sabe. O que estava quebrado era a FIACAO. Entao estes casos chamam
 * `registrarRotasDosContadoresDeSecao` -- a mesma funcao que `src/bin/api.ts`
 * chama -- e mandam a requisicao no servidor que saiu dela.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { criarServidor } from '../../../../shared/http/server.js';
import { zerarInventario } from '../../../../shared/http/registrar-rota.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import { criarContadorEmMemoria } from '../../../../shared/http/rate-limit.js';
import {
  registrarRotasDosContadoresDeSecao,
  type DependenciasDasRotasDosContadores,
} from './section-counter-routes.js';
import type { AbsoluteUrl, UserId } from '../../../../shared/types/brands.js';
import type { ContadoresDeSecao } from '../../ports/contadores-de-secao.js';
import type { SecaoComContador } from '../../ports/marcadores-de-secao.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const CONTA = '018f3a2b-0000-7000-8000-0000000000aa';

/**
 * Numeros DIFERENTES entre si e diferentes de zero, de proposito.
 *
 * Com os tres iguais, um `comoResposta` que trocasse dois campos de lugar
 * passaria. Com zero, um handler que devolvesse `{}` passaria pela leitura de
 * campo ausente como `undefined`.
 */
const CONTAGEM: ContadoresDeSecao = {
  perdidosNovos: 3,
  eventosNovos: 7,
  profissionaisNovos: 11,
};

interface OQueChegou {
  contou?: { conta: string; cidade: string | undefined };
  marcou?: { conta: string; secao: SecaoComContador; cidade: string | undefined };
}

function dependenciasDeTeste(registro: OQueChegou): DependenciasDasRotasDosContadores {
  return {
    autenticador: { autenticar: () => Promise.resolve({ userId: CONTA as UserId }) },
    contadores: {
      contar: (chamador: { userId: string }, cidade?: string) => {
        registro.contou = { conta: chamador.userId, cidade };
        return Promise.resolve(CONTAGEM);
      },
      marcarVista: (chamador: { userId: string }, secao: SecaoComContador, cidade?: string) => {
        registro.marcou = { conta: chamador.userId, secao, cidade };
        return Promise.resolve(CONTAGEM);
      },
    },
    // A rota de escrita pede o esquema de corpo do contrato no momento do
    // REGISTRO, e nao no do pedido: sem este duble,
    // `registrarRotasDosContadoresDeSecao` estoura antes de chegar na rota.
    contrato: {
      requestBodySchema: () => ({
        type: 'object',
        // `additionalProperties: false` AQUI TAMBEM, e nao e detalhe do duble:
        // `recusarCampoDesconhecido` **derruba a subida** quando montado sobre
        // schema de corpo aberto (verificacao que nao consegue verificar
        // reprova). Um duble sem esta linha faria o registro das rotas estourar
        // -- que e o portao do guarda funcionando.
        additionalProperties: false,
        required: ['section'],
        properties: {
          section: { type: 'string', enum: ['pets', 'network_events', 'network_directory'] },
          city: { type: 'string', minLength: 2, maxLength: 80 },
        },
      }),
    } as unknown as DependenciasDasRotasDosContadores['contrato'],
  };
}

function servidor(deps: DependenciasDasRotasDosContadores) {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(criarContadorEmMemoria(() => Date.now())),
    bodyLimitBytes: 1_048_576,
  });
  registrarRotasDosContadoresDeSecao(app, deps);
  return app;
}

void describe('ISCA: as duas rotas dos contadores das abas respondem', () => {
  void it('ISCA: GET /me/section-counters nao e 404 -- ela esta registrada', async () => {
    zerarInventario();
    const registro: OQueChegou = {};
    const app = servidor(dependenciasDeTeste(registro));
    try {
      const resposta = await app.inject({
        method: 'GET',
        url: '/me/section-counters',
        headers: { authorization: 'Bearer token-de-teste' },
      });
      assert.notEqual(
        resposta.statusCode,
        404,
        'REPROVA: a rota respondeu 404. Ela esta DECLARADA (`rotaDeContadoresDeSecao`) ' +
          'e NAO REGISTRADA: falta a chamada de `registrarRota` em ' +
          '`registrarRotasDosContadoresDeSecao`. Foi este mesmo 404 que deixou o ' +
          'contador de MENSAGENS sem zerar em 20/10/2026, e calado.',
      );
      assert.equal(resposta.statusCode, 200, `Corpo: ${resposta.body}`);
      // O CORPO, campo a campo. **Nenhum portao deste repositorio confere corpo
      // de resposta**, e foi assim que `open_case_id` fixo em nulo passou por
      // tudo. Tres numeros distintos: campo trocado de lugar reprova.
      assert.deepEqual(JSON.parse(resposta.body), {
        lost_pets_new: 3,
        network_events_new: 7,
        network_directory_new: 11,
      });
      assert.deepEqual(
        registro.contou,
        { conta: CONTA, cidade: undefined },
        'REPROVA: a rota respondeu 200 e o servico nao foi chamado com a conta do ' +
          'token. Handler que devolve numero sem perguntar ao servidor e numero ' +
          'inventado.',
      );
    } finally {
      await app.close();
    }
  });

  void it('ISCA: GET /me/section-counters repassa `city` -- o selo e a lista usam o mesmo recorte', async () => {
    zerarInventario();
    const registro: OQueChegou = {};
    const app = servidor(dependenciasDeTeste(registro));
    try {
      const resposta = await app.inject({
        method: 'GET',
        url: '/me/section-counters?city=Campinas',
        headers: { authorization: 'Bearer token-de-teste' },
      });
      assert.equal(resposta.statusCode, 200);
      assert.equal(
        registro.contou?.cidade,
        'Campinas',
        'REPROVA: a rota ignorou `city`. O recorte da aba `Pets` vem do aparelho, e ' +
          'um contador que conta outra cidade mostra um numero que a lista nao ' +
          'confirma -- a pessoa toca na aba e nao acha o que o selo prometeu.',
      );
    } finally {
      await app.close();
    }
  });

  void it('ISCA: POST /me/sections-seen nao e 404 -- ela esta registrada', async () => {
    zerarInventario();
    const registro: OQueChegou = {};
    const app = servidor(dependenciasDeTeste(registro));
    try {
      const resposta = await app.inject({
        method: 'POST',
        url: '/me/sections-seen',
        headers: { authorization: 'Bearer token-de-teste' },
        payload: { section: 'network_directory' },
      });
      assert.notEqual(
        resposta.statusCode,
        404,
        'REPROVA: a rota respondeu 404. Sem ela NENHUMA das tres contagens zera, e ' +
          'contador que nao zera e pior que contador nenhum.',
      );
      assert.equal(resposta.statusCode, 200, `Corpo: ${resposta.body}`);
      assert.deepEqual(
        JSON.parse(resposta.body),
        { lost_pets_new: 3, network_events_new: 7, network_directory_new: 11 },
        'REPROVA: o contrato declara 200 com `SectionCounters`. Um 204 aqui obrigaria ' +
          'o app a chamar `getSectionCounters` em seguida -- uma viagem a mais por ' +
          'visita -- ou a escrever zero local, que e adivinhacao.',
      );
      assert.deepEqual(
        registro.marcou,
        { conta: CONTA, secao: 'network_directory', cidade: undefined },
        'REPROVA: a rota respondeu 200 e o servico nao recebeu a area. Um handler que ' +
          'responde 200 sem escrever `section_list_views` deixa o selo aceso e a tela ' +
          'achando que zerou -- pior que o 404, porque o 404 pelo menos e visivel ' +
          'para quem mede.',
      );
    } finally {
      await app.close();
    }
  });

  void it('ISCA: `section` fora do enum e 400 -- o contrato recusa antes do handler', async () => {
    zerarInventario();
    const registro: OQueChegou = {};
    const app = servidor(dependenciasDeTeste(registro));
    try {
      const resposta = await app.inject({
        method: 'POST',
        url: '/me/sections-seen',
        headers: { authorization: 'Bearer token-de-teste' },
        payload: { section: 'mural' },
      });
      assert.equal(
        resposta.statusCode,
        400,
        `REPROVA: area desconhecida passou com ${String(resposta.statusCode)}. ` +
          '`mural` nao esta no enum de proposito -- a contagem dele e de outra ' +
          'frente, e aceitar o valor gravaria marcador para uma area sem contador.',
      );
      assert.equal(
        registro.marcou,
        undefined,
        'REPROVA: o 400 veio DEPOIS de o servico ser chamado. A recusa tem de ser do ' +
          'esquema do contrato, antes do handler, senao o `CHECK` do banco passa a ' +
          'ser a primeira linha de defesa em vez da terceira.',
      );
    } finally {
      await app.close();
    }
  });

  void it('ISCA: campo desconhecido no corpo e 400 -- `city` errado nao passa calado', async () => {
    zerarInventario();
    const registro: OQueChegou = {};
    const app = servidor(dependenciasDeTeste(registro));
    try {
      const resposta = await app.inject({
        method: 'POST',
        url: '/me/sections-seen',
        headers: { authorization: 'Bearer token-de-teste' },
        payload: { section: 'pets', cidade: 'Campinas' },
      });
      assert.equal(
        resposta.statusCode,
        400,
        `REPROVA: campo desconhecido passou com ${String(resposta.statusCode)}. ` +
          '`additionalProperties: false` no contrato NAO fecha o corpo em ' +
          'execucao -- o Ajv do Fastify roda com `removeAdditional: true` e ' +
          'APAGA o campo em silencio. **Medido na rota de pe em 20/10/2026, ' +
          'antes do guarda**: `{"section":"pets","inventado":1}` respondia 200. ' +
          'Falta `recusarCampoDesconhecido` no `preValidation`. O campo que ' +
          'importa e `city`: quem escrever `cidade` receberia 200 com os ' +
          'contadores do PAIS INTEIRO e acreditaria ter recortado por cidade.',
      );
      assert.equal(
        registro.marcou,
        undefined,
        'REPROVA: o 400 veio depois de o servico escrever o marcador.',
      );
    } finally {
      await app.close();
    }
  });

  void it('ISCA: sem credencial as duas respondem 401 -- nenhuma aba pinta selo sem conta', async () => {
    zerarInventario();
    const app = servidor(dependenciasDeTeste({}));
    try {
      const leitura = await app.inject({ method: 'GET', url: '/me/section-counters' });
      const escrita = await app.inject({
        method: 'POST',
        url: '/me/sections-seen',
        payload: { section: 'pets' },
      });
      assert.equal(
        leitura.statusCode,
        401,
        'REPROVA: a leitura dos contadores respondeu sem credencial. O marcador e da ' +
          'CONTA, e contador sem conta nao tem de quem zerar.',
      );
      assert.equal(escrita.statusCode, 401, 'REPROVA: a escrita respondeu sem credencial.');
    } finally {
      await app.close();
    }
  });
});
