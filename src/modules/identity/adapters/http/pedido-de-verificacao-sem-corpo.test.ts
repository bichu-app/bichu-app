/**
 * `POST /v1/auth/email-verification` **sem corpo nenhum**.
 *
 * ## O defeito
 *
 * O contrato declara esta operação com `requestBody: { required: false }`, e a
 * descrição promete "responde sempre 202, exista ou nao a conta". O manipulador
 * diz a mesma coisa ao ler `request.body ?? {}`: com token no cabeçalho o
 * e-mail sai da sessão, e não há corpo a enviar.
 *
 * A rota, porém, declarava `schema: { body }` e nada mais. O Fastify valida
 * `request.body` **mesmo quando não veio corpo**, e `undefined` contra
 * `{ type: 'object' }` reprova com `body must be object`. Quem chamasse a
 * operação do jeito que o documento permite recebia **400**, não 202.
 *
 * É a mesma classe do `logout` e do `client_note`, virada do avesso: lá o
 * contrato não descrevia o corpo que a rota lia; aqui o contrato descreve um
 * corpo opcional e o runtime passou a exigi-lo.
 *
 * ## Isca
 *
 * Tirar `corpoAusenteEhCorpoVazio` de `routes.ts` reprova o primeiro caso com
 * `400` no lugar de `202`. Tirar o `schema` inteiro deixaria os dois casos
 * verdes cobrindo menos, e é por isso que o segundo caso existe: ele prova que
 * a validação continua de pé para o corpo que **veio** torto.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';

import type { AuditEvent, AuditLog } from '../../../audit/ports/audit-log.js';
import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import type { AbsoluteUrl } from '../../../../shared/types/brands.js';
import { INSTANTE_FIXO, relogioParado } from '../../../../shared/time/relogio-de-teste.js';
import type { IdentityRepository } from '../../ports/identity-repository.js';
import type { Mailer } from '../../ports/mailer.js';
import type { TokenSigner } from '../../ports/token-signer.js';
import { criarAuthService } from '../../application/auth-service.js';
import { registrarRotasDeIdentidade, type DependenciasDasRotas } from './routes.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';

const PROBLEM_BASE_URL = 'https://api.exemplo.invalid/problems' as AbsoluteUrl;

function naoUsado(nome: string): never {
  throw new Error(
    `o dublê não implementa ${nome}: uma chamada sem e-mail e sem sessão não ` +
      `deveria alcançar nenhuma porta. Se chegou aqui, a rota passou a fazer ` +
      `trabalho que ela promete não fazer.`,
  );
}

/**
 * Repositório que **recusa tudo**. É o dublê certo aqui: o caso principal envia
 * uma requisição que não identifica ninguém, e a rota promete 202 sem consultar
 * nada. Qualquer chamada de porta é, por si só, a reprovação.
 */
function repositorioQueNaoDeveriaSerTocado(): IdentityRepository {
  const recusar = (nome: string) => () => naoUsado(nome);
  return {
    criarContaLocal: recusar('criarContaLocal'),
    buscarContaPorId: recusar('buscarContaPorId'),
    atualizarPerfil: recusar('atualizarPerfil'),
    buscarContaPorEmail: recusar('buscarContaPorEmail'),
    buscarCredencialLocalPorEmail: recusar('buscarCredencialLocalPorEmail'),
    regravarCredencial: recusar('regravarCredencial'),
    registrarLogin: recusar('registrarLogin'),
    gravarRefresh: recusar('gravarRefresh'),
    buscarRefreshPorHash: recusar('buscarRefreshPorHash'),
    rotacionar: recusar('rotacionar'),
    revogarFamilia: recusar('revogarFamilia'),
    invalidarSessoes: recusar('invalidarSessoes'),
    revogarTodasAsFamilias: recusar('revogarTodasAsFamilias'),
    criarTokenDeVerificacao: recusar('criarTokenDeVerificacao'),
    consumirTokenDeVerificacao: recusar('consumirTokenDeVerificacao'),
    conferirTokenDeVerificacao: recusar('conferirTokenDeVerificacao'),
    invalidarTokensPendentes: recusar('invalidarTokensPendentes'),
    marcarEmailVerificado: recusar('marcarEmailVerificado'),
    criarJanelaDeReautenticacao: recusar('criarJanelaDeReautenticacao'),
    consumirJanelaDeReautenticacao: recusar('consumirJanelaDeReautenticacao'),
    registrarPedidoDeExclusao: recusar('registrarPedidoDeExclusao'),
    contasAExpurgar: recusar('contasAExpurgar'),
    expurgarConta: recusar('expurgarConta'),
    registrarPedidoDeTrocaDeEmail: recusar('registrarPedidoDeTrocaDeEmail'),
    concluirTrocaDeEmail: recusar('concluirTrocaDeEmail'),
    cancelarTrocaDeEmailPendente: recusar('cancelarTrocaDeEmailPendente'),
  };
}

function montar(): RegistradorDeRotas {
  const eventos: AuditEvent[] = [];
  const trilha: AuditLog = {
    record: (evento) => {
      eventos.push(evento);
      return Promise.resolve();
    },
  };
  const mailer: Mailer = { enviar: () => naoUsado('mailer.enviar') };
  const assinador: TokenSigner = {
    emitir: () => naoUsado('assinador.emitir'),
    verificar: () => ({ ok: false, motivo: 'malformado' }),
    jwks: () => [],
  };

  const auth = criarAuthService({
    // SEC-019: `derrubarTodasAsSessoes` remove o cadastro de push. Esta bancada
    // não é sobre isso, então a função é contada e não observada. O caso que
    // PROVA a remoção, lendo a linha de `user_devices` depois, é
    // `sair-de-todos-os-aparelhos.test.ts` e
    // `tests/integration/sair-de-todos-pelo-http.test.ts`.
    removerPushDaConta: () => Promise.resolve(0),
    repositorio: repositorioQueNaoDeveriaSerTocado(),
    assinador,
    trilha,
    ids: {
      uuidv7: () => naoUsado('ids.uuidv7'),
      opaqueToken: () => naoUsado('ids.opaqueToken'),
      random128: () => naoUsado('ids.random128'),
      random80: () => naoUsado('ids.random80'),
    },
    clock: relogioParado(INSTANTE_FIXO),
    janelas: {
      idleTtlSeconds: 30 * 86_400,
      staySignedInIdleTtlSeconds: 180 * 86_400,
      absoluteTtlSeconds: 180 * 86_400,
    },
    hmacDeIp: () => null,
    avisarTitular: () => Promise.resolve(),
    mailer,
    registrarOcorrencia: () => {
      // Nenhum caso deste arquivo afirma log.
    },
    baseDaWeb: 'https://exemplo.invalid' as AbsoluteUrl,
  });

  const app = criarServidor({
    problemBaseUrl: PROBLEM_BASE_URL,
    isProduction: false,
    // Exigido desde a BICHUS-178: `registrarRota` recusa um servidor sem
    // contador, na subida. Contador EM MEMORIA e nao desligado, para que estes
    // casos exercitem a mesma fiacao que roda.
    teto: tetoDeTeste(),
    // BICHUS-48: `registrarRota` recusa, na subida, um servidor sem verificador
    // quando alguma rota declara `reauthScope` -- e `logout-all` declara. Este
    // arquivo nao exercita a janela de reautenticacao, entao o verificador
    // LANCA em vez de aprovar: um verificador que dissesse "ok" faria estes
    // casos rodarem contra uma porta destrutiva aberta e ninguem veria.
    reautenticacao: () => {
      throw new Error(
        'Verificador de reautenticacao chamado: nenhum caso deste arquivo exercita ' +
          'X-Reauth-Token. Quem precisa dele e sair-de-todos-pelo-http (integracao).',
      );
    },
  });
  const deps: DependenciasDasRotas = {
    auth,
    assinador,
    contrato: carregarContrato('api/openapi.yaml'),
    issuer: 'https://api.bichu.test',
    apiBaseUrl: 'https://api.bichu.test',
  };
  void app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDeIdentidade(escopo, deps);
      pronto();
    },
    { prefix: '/v1' },
  );
  return app;
}

void describe('POST /v1/auth/email-verification com o corpo que o contrato chama de opcional', () => {
  void it('sem corpo nenhum responde 202, como a operação promete', async () => {
    const app = montar();

    const resposta = await app.inject({ method: 'POST', url: '/v1/auth/email-verification' });

    // ISCA: com `schema` declarado e sem o gancho de corpo ausente, isto era
    // 400 `body must be object` numa operação que o contrato declara
    // `required: false` e que promete responder sempre 202.
    assert.equal(resposta.statusCode, 202, 'corpo opcional é corpo que pode não vir');
  });

  void it('o corpo que VEIO continua sendo validado: e-mail fora de formato recusa', async () => {
    const app = montar();

    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/auth/email-verification',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'isto-nao-e-um-endereco' },
    });

    assert.equal(resposta.statusCode, 400, 'tolerar a ausência não é tolerar o conteúdo torto');
  });
});
