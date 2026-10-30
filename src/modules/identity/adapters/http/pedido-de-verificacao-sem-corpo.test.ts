/** `POST /v1/auth/email-verification` **sem corpo nenhum**. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';

import type { AuditEvent, AuditLog } from '../../../audit/ports/audit-log.js';
import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import type { AbsoluteUrl } from '../../../../shared/types/brands.js';
import { INSTANTE_FIXO, relogioParado } from '../../../../shared/time/relogio-de-teste.js';
import type { FotoDoPerfil, IdentityRepository } from '../../ports/identity-repository.js';
import { RepositorioQueRecusaTudo } from '../persistence/repositorio-que-recusa-tudo-de-teste.js';
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

/** Repositório que **recusa tudo**. */
function repositorioQueNaoDeveriaSerTocado(): IdentityRepository {
  return new (class extends RepositorioQueRecusaTudo {
    override fotoDoPerfil(): Promise<FotoDoPerfil | null> {
      return Promise.resolve(null);
    }

    protected recusar(nome: string): never {
      return naoUsado(nome);
    }
  })();
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
    urlDeMidia: (chave: string) => `https://midia.invalido/${chave}`,
    removerPushDaConta: () => Promise.resolve(0),
    apagarLocalizacaoDaSessao: () => Promise.resolve(0),
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
    teto: tetoDeTeste(),
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
    urlDeMidia: (chave: string) => `https://midia.invalido/${chave}`,
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
