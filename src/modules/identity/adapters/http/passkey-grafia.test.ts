import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import {
  desviosDaResposta,
  desviosEmTexto,
} from '../../../../shared/http/conformidade-de-resposta.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { AbsoluteUrl, Instant, UserId } from '../../../../shared/types/brands.js';
import type { AuthService } from '../../application/auth-service.js';
import { PasskeyService } from '../../application/passkey-service.js';
import type {
  CredencialDePasskey,
  DesafioGuardado,
  NovaCredencial,
  PasskeyDaTela,
  PasskeyRepository,
} from '../../ports/passkey-repository.js';
import {
  registrarRotasDePasskey,
  rotaDeInicioDaEntradaPorPasskey,
  rotaDeInicioDoCadastroDePasskey,
} from './passkey-routes.js';

const AGORA = 1_800_000_000_000 as Instant;
const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const EMAIL = 'tutor@exemplo.com';
const RP_ID = 'bichu.app';

const contrato = carregarContrato('api/openapi.yaml');

class RepositorioQueSoGuardaDesafio implements PasskeyRepository {
  public guardados = 0;

  guardarDesafio(): Promise<void> {
    this.guardados += 1;
    return Promise.resolve();
  }
  acharDesafioPorHash(): Promise<DesafioGuardado | undefined> {
    return Promise.resolve(undefined);
  }
  consumirDesafio(): Promise<boolean> {
    return Promise.resolve(false);
  }
  ativasDaConta(): Promise<readonly PasskeyDaTela[]> {
    return Promise.resolve([]);
  }
  credenciaisAtivasParaExcluir(): Promise<readonly Buffer[]> {
    return Promise.resolve([]);
  }
  contarAtivas(): Promise<number> {
    return Promise.resolve(0);
  }
  acharPorCredentialId(): Promise<CredencialDePasskey | undefined> {
    return Promise.resolve(undefined);
  }
  gravar(c: NovaCredencial): Promise<PasskeyDaTela> {
    return Promise.resolve({ id: c.id, label: c.label, criadaEm: AGORA, usadaEm: null });
  }
  avancarContador(): Promise<boolean> {
    return Promise.resolve(true);
  }
  revogar(): Promise<'revogada' | 'nao-encontrada'> {
    return Promise.resolve('revogada');
  }
  revogarPorCredentialId(): Promise<void> {
    return Promise.resolve();
  }
}

function servicoDePasskey(repositorio: PasskeyRepository): PasskeyService {
  return new PasskeyService({
    repositorio,
    clock: { now: () => AGORA },
    ids: {
      uuidv7: () => '018f3a2b-0000-7000-8000-0000000000ff',
      opaqueToken: () => 'nao-usado' as never,
      random128: () => new Uint8Array(16),
    } as never,
    trilha: { record: () => Promise.resolve() },
    rp: { rpId: RP_ID, rpName: 'Bichu', origensAceitas: ['android:apk-key-hash:XXXX'] },
  });
}

const authQueAutentica = {
  autenticar: () =>
    Promise.resolve({
      conta: { id: DONO, email: EMAIL, displayName: 'Tutor' },
      jti: 'jti-de-teste',
    }),
} as unknown as AuthService;

function bancada(): { app: RegistradorDeRotas; repositorio: RepositorioQueSoGuardaDesafio } {
  const repositorio = new RepositorioQueSoGuardaDesafio();
  const app = criarServidor({
    problemBaseUrl: 'https://api.exemplo.invalid/problems' as AbsoluteUrl,
    isProduction: false,
    teto: tetoDeTeste(),
  });
  void app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDePasskey(escopo, {
        auth: authQueAutentica,
        passkeys: servicoDePasskey(repositorio),
        contrato,
      });
      pronto();
    },
    { prefix: '/v1' },
  );
  return { app, repositorio };
}

async function pedir(
  app: RegistradorDeRotas,
  url: string,
): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const resposta = await app.inject({
    method: 'POST',
    url,
    headers: { authorization: 'Bearer token-de-teste' },
    payload: {},
  });
  return {
    status: resposta.statusCode,
    corpo: JSON.parse(resposta.body) as Record<string, unknown>,
  };
}

function schemaDo200(operationId: string): Record<string, unknown> {
  const schema = contrato.responseSchema(operationId, '200');
  assert.ok(
    schema !== undefined,
    `o contrato não declara corpo para o 200 de ${operationId}: não há contra o que ` +
      'comparar, e um caso que não compara nada é pior que nenhum caso',
  );
  return schema;
}

void describe('isca: o corpo das opções de passkey está na grafia que o contrato declara', () => {
  void it('beginPasskeyAuthentication: zero desvios contra o schema do 200', async () => {
    const { app } = bancada();
    const resposta = await pedir(app, '/v1/auth/passkey/authentication/options');
    assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));

    const desvios = desviosDaResposta(resposta.corpo, schemaDo200(rotaDeInicioDaEntradaPorPasskey.operationId));
    assert.deepEqual(
      desvios,
      [],
      `o corpo EMITIDO diverge do contrato:\n${desviosEmTexto(desvios)}\n` +
        `corpo: ${JSON.stringify(resposta.corpo)}`,
    );
  });

  void it('beginPasskeyRegistration: zero desvios contra o schema do 200', async () => {
    const { app } = bancada();
    const resposta = await pedir(app, '/v1/auth/passkey/registration/options');
    assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));

    const desvios = desviosDaResposta(resposta.corpo, schemaDo200(rotaDeInicioDoCadastroDePasskey.operationId));
    assert.deepEqual(
      desvios,
      [],
      `o corpo EMITIDO diverge do contrato:\n${desviosEmTexto(desvios)}\n` +
        `corpo: ${JSON.stringify(resposta.corpo)}`,
    );
  });

  void it('a grafia do contrato aparece no corpo, campo por campo', async () => {
    const { app } = bancada();
    const entrada = await pedir(app, '/v1/auth/passkey/authentication/options');
    assert.equal(entrada.corpo['rp_id'], RP_ID);
    assert.equal(entrada.corpo['user_verification'], 'required');
    assert.deepEqual(entrada.corpo['allow_credentials'], []);
    assert.equal(entrada.corpo['rpId'], undefined);
    assert.equal(entrada.corpo['userVerification'], undefined);
    assert.equal(entrada.corpo['allowCredentials'], undefined);

    const cadastro = await pedir(app, '/v1/auth/passkey/registration/options');
    assert.ok(Array.isArray(cadastro.corpo['pub_key_cred_params']));
    assert.deepEqual(cadastro.corpo['authenticator_selection'], {
      authenticator_attachment: 'platform',
      resident_key: 'required',
      user_verification: 'required',
    });
    assert.deepEqual(cadastro.corpo['exclude_credentials'], []);
    assert.equal((cadastro.corpo['user'] as Record<string, unknown>)['display_name'], 'Tutor');
    assert.equal(cadastro.corpo['pubKeyCredParams'], undefined);
    assert.equal(cadastro.corpo['authenticatorSelection'], undefined);
    assert.equal(cadastro.corpo['excludeCredentials'], undefined);
    assert.equal(cadastro.corpo['extensions'], undefined);
    assert.equal(cadastro.corpo['hints'], undefined);
  });
});

void describe('isca provada: o comparador reprova o corpo que as rotas enviavam antes', () => {
  void it('o retorno CRU da biblioteca reprova, e reprova PELO NOME', async () => {
    const cru = await servicoDePasskey(new RepositorioQueSoGuardaDesafio()).comecarEntrada();

    const desvios = desviosDaResposta(cru, schemaDo200(rotaDeInicioDaEntradaPorPasskey.operationId));
    const texto = desviosEmTexto(desvios);

    assert.ok(desvios.length > 0, 'o comparador aprovou o corpo camelCase: ele não está medindo nada');
    for (const obrigatorio of ['rp_id', 'user_verification', 'allow_credentials']) {
      assert.ok(
        desvios.some((d) => d.onde === obrigatorio && d.motivo.includes('OBRIGATÓRIO')),
        `o comparador não acusou a ausência de '${obrigatorio}'. Desvios:\n${texto}`,
      );
    }
    for (const [camel, snake] of [
      ['rpId', 'rp_id'],
      ['userVerification', 'user_verification'],
      ['allowCredentials', 'allow_credentials'],
    ]) {
      assert.ok(
        desvios.some(
          (d) => d.onde === camel && d.motivo.includes(`'${snake}'`) && d.motivo.includes('MESMA palavra'),
        ),
        `o comparador não ligou '${camel}' a '${snake}'. Desvios:\n${texto}`,
      );
    }
  });

  void it('o retorno CRU do cadastro também reprova, nos cinco nomes dele', async () => {
    const cru = await servicoDePasskey(new RepositorioQueSoGuardaDesafio()).comecarCadastro({
      id: DONO,
      email: EMAIL,
      displayName: 'Tutor',
    });

    const desvios = desviosDaResposta(cru, schemaDo200(rotaDeInicioDoCadastroDePasskey.operationId));
    const texto = desviosEmTexto(desvios);

    for (const [camel, snake] of [
      ['pubKeyCredParams', 'pub_key_cred_params'],
      ['authenticatorSelection', 'authenticator_selection'],
      ['excludeCredentials', 'exclude_credentials'],
    ]) {
      assert.ok(
        desvios.some((d) => d.onde === camel && d.motivo.includes(`'${snake}'`)),
        `o comparador não ligou '${camel}' a '${snake}'. Desvios:\n${texto}`,
      );
    }
    assert.ok(
      desvios.some((d) => d.onde === 'user.displayName' && d.motivo.includes("'display_name'")),
      `o comparador não acusou 'user.displayName'. Desvios:\n${texto}`,
    );
    assert.ok(
      desvios.some((d) => d.onde === 'user.display_name' && d.motivo.includes('OBRIGATÓRIO')),
      `o comparador não acusou a ausência de 'user.display_name'. Desvios:\n${texto}`,
    );
    for (const aMais of ['extensions', 'hints']) {
      assert.ok(
        desvios.some((d) => d.onde === aMais),
        `o comparador não acusou '${aMais}', que o contrato não declara. Desvios:\n${texto}`,
      );
    }
  });

  void it('schema sem nada a comparar LEVANTA em vez de aprovar', () => {
    assert.throws(() => desviosDaResposta({ seja: 'o que for' }, {}), /não declara `properties` nem `required`/u);
    assert.throws(() => desviosDaResposta({}, undefined), /Não há schema de resposta para comparar/u);
  });

  void it('o schema do contrato tem matéria para medir, nas duas operações', () => {
    for (const operationId of [
      rotaDeInicioDaEntradaPorPasskey.operationId,
      rotaDeInicioDoCadastroDePasskey.operationId,
    ]) {
      const exigidos = schemaDo200(operationId)['required'];
      assert.ok(
        Array.isArray(exigidos) && exigidos.length > 0,
        `o 200 de ${operationId} não declara campo obrigatório nenhum; confira o contrato`,
      );
    }
  });
});
