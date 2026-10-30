/** O desafio de passkey: prazo, uso único e dono — sem banco e sem servidor. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Instant, UserId } from '../../../shared/types/brands.js';
import { AppError } from '../../../shared/http/errors.js';
import { PasskeyService } from './passkey-service.js';
import type {
  CredencialDePasskey,
  DesafioGuardado,
  NovaCredencial,
  PasskeyDaTela,
  PasskeyRepository,
} from '../ports/passkey-repository.js';

const AGORA = 1_800_000_000_000 as Instant;
const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const OUTRA_CONTA = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;

/**
 * Um `clientDataJSON` como o aparelho o manda: base64url de um JSON com
 * `challenge`.
 */
function clientDataCom(desafio: string): string {
  return Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: desafio }), 'utf8')
    .toString('base64url');
}

const DESAFIO = 'ZGVzYWZpby1kZS10ZXN0ZQ';

/** Recusa tudo: cada caso liga só a porta de que precisa. */
class RepositorioDePasskeyDeTeste implements PasskeyRepository {
  public consumidos: string[] = [];
  public revogados: { id: string; razao: string }[] = [];

  constructor(private readonly desafio: DesafioGuardado | undefined) {}

  guardarDesafio(): Promise<void> {
    return Promise.resolve();
  }
  acharDesafioPorHash(): Promise<DesafioGuardado | undefined> {
    return Promise.resolve(this.desafio);
  }
  consumirDesafio(id: string): Promise<boolean> {
    this.consumidos.push(id);
    return Promise.resolve(true);
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
  revogar(id: string, _userId: UserId, razao: string): Promise<'revogada' | 'nao-encontrada'> {
    this.revogados.push({ id, razao });
    return Promise.resolve('revogada');
  }
  revogarPorCredentialId(_id: Buffer, razao: string): Promise<void> {
    this.revogados.push({ id: '(por credential_id)', razao });
    return Promise.resolve();
  }
}

function servicoCom(repositorio: PasskeyRepository): PasskeyService {
  return new PasskeyService({
    repositorio,
    clock: { now: () => AGORA },
    ids: {
      uuidv7: () => '018f3a2b-0000-7000-8000-0000000000ff',
      opaqueToken: () => 'nao-usado' as never,
      random128: () => new Uint8Array(16),
    } as never,
    trilha: { record: () => Promise.resolve() },
    rp: {
      rpId: 'bichu.app',
      rpName: 'Bichu',
      origensAceitas: ['android:apk-key-hash:XXXX'],
    },
  });
}

const DONO_DA_CREDENCIAL = { id: DONO, email: 'tutor@exemplo.com', displayName: 'Tutor' };

const corpoDeCadastro = {
  credential: {
    id: 'Y3JlZA',
    raw_id: 'Y3JlZA',
    type: 'public-key',
    response: { client_data_json: clientDataCom(DESAFIO), attestation_object: 'bm9wZQ' },
  },
};

async function tipoDoErro(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    assert.ok(e instanceof AppError, `esperava AppError, veio ${String(e)}`);
    return e.problemType;
  }
  assert.fail('a chamada devia ter lancado');
  return '';
}

const desafioBom: DesafioGuardado = {
  id: 'd1',
  userId: DONO,
  purpose: 'registration',
  expiraEm: (AGORA + 100_000) as Instant,
  consumidoEm: null,
};

void describe('cadastro: as recusas antes da verificacao', () => {
  void it('desafio INEXISTENTE recusa como vencido', async () => {
    const repo = new RepositorioDePasskeyDeTeste(undefined);
    assert.equal(
      await tipoDoErro(() => servicoCom(repo).concluirCadastro(DONO_DA_CREDENCIAL, corpoDeCadastro)),
      'token-expired',
    );
    assert.deepEqual(repo.consumidos, []);
  });

  void it('desafio VENCIDO recusa', async () => {
    const repo = new RepositorioDePasskeyDeTeste({
      ...desafioBom,
      expiraEm: (AGORA - 1) as Instant,
    });
    assert.equal(
      await tipoDoErro(() => servicoCom(repo).concluirCadastro(DONO_DA_CREDENCIAL, corpoDeCadastro)),
      'token-expired',
    );
  });

  void it('desafio JA CONSUMIDO recusa, mesmo dentro do prazo', async () => {
    const repo = new RepositorioDePasskeyDeTeste({
      ...desafioBom,
      consumidoEm: (AGORA - 1) as Instant,
    });
    assert.equal(
      await tipoDoErro(() => servicoCom(repo).concluirCadastro(DONO_DA_CREDENCIAL, corpoDeCadastro)),
      'token-expired',
    );
  });

  void it('desafio de ENTRADA nao serve para cadastrar', async () => {
    const repo = new RepositorioDePasskeyDeTeste({
      ...desafioBom,
      purpose: 'authentication',
      userId: null,
    });
    assert.equal(
      await tipoDoErro(() => servicoCom(repo).concluirCadastro(DONO_DA_CREDENCIAL, corpoDeCadastro)),
      'token-expired',
    );
  });

  void it('desafio de OUTRA CONTA recusa -- e a recusa e a mesma do inexistente', async () => {
    const repo = new RepositorioDePasskeyDeTeste({ ...desafioBom, userId: OUTRA_CONTA });
    assert.equal(
      await tipoDoErro(() => servicoCom(repo).concluirCadastro(DONO_DA_CREDENCIAL, corpoDeCadastro)),
      'token-expired',
    );
    assert.deepEqual(repo.consumidos, []);
  });

  void it('quem PERDE a corrida do uso unico e recusado', async () => {
    class PerdeACorrida extends RepositorioDePasskeyDeTeste {
      override consumirDesafio(): Promise<boolean> {
        return Promise.resolve(false);
      }
    }
    const repo = new PerdeACorrida(desafioBom);
    assert.equal(
      await tipoDoErro(() => servicoCom(repo).concluirCadastro(DONO_DA_CREDENCIAL, corpoDeCadastro)),
      'token-expired',
    );
  });

  void it('`clientDataJSON` sem `challenge` recusa em vez de seguir com undefined', async () => {
    const repo = new RepositorioDePasskeyDeTeste(desafioBom);
    const semDesafio = {
      credential: {
        ...corpoDeCadastro.credential,
        response: {
          client_data_json: Buffer.from(JSON.stringify({ type: 'webauthn.create' }), 'utf8').toString(
            'base64url',
          ),
          attestation_object: 'bm9wZQ',
        },
      },
    };
    assert.equal(
      await tipoDoErro(() => servicoCom(repo).concluirCadastro(DONO_DA_CREDENCIAL, semDesafio)),
      'token-expired',
    );
  });

  void it('`clientDataJSON` que nao e JSON recusa em vez de estourar', async () => {
    const repo = new RepositorioDePasskeyDeTeste(desafioBom);
    const lixo = {
      credential: {
        ...corpoDeCadastro.credential,
        response: { client_data_json: 'bm90LWpzb24', attestation_object: 'bm9wZQ' },
      },
    };
    assert.equal(
      await tipoDoErro(() => servicoCom(repo).concluirCadastro(DONO_DA_CREDENCIAL, lixo)),
      'token-expired',
    );
  });
});

void describe('entrada: as recusas antes da verificacao', () => {
  const desafioDeEntrada: DesafioGuardado = {
    id: 'd2',
    userId: null,
    purpose: 'authentication',
    expiraEm: (AGORA + 100_000) as Instant,
    consumidoEm: null,
  };
  const corpoDeEntrada = {
    credential: {
      id: 'Y3JlZA',
      raw_id: 'Y3JlZA',
      type: 'public-key',
      response: {
        client_data_json: clientDataCom(DESAFIO),
        authenticator_data: 'YXV0aA',
        signature: 'c2ln',
      },
    },
  };

  void it('desafio de CADASTRO nao serve para entrar', async () => {
    const repo = new RepositorioDePasskeyDeTeste(desafioBom);
    assert.equal(
      await tipoDoErro(() => servicoCom(repo).concluirEntrada(corpoDeEntrada)),
      'token-expired',
    );
  });

  void it('credencial DESCONHECIDA recusa como credencial invalida', async () => {
    const repo = new RepositorioDePasskeyDeTeste(desafioDeEntrada);
    assert.equal(
      await tipoDoErro(() => servicoCom(repo).concluirEntrada(corpoDeEntrada)),
      'invalid-credentials',
    );
    assert.deepEqual(repo.consumidos, ['d2']);
  });

  void it('credencial REVOGADA recusa com o MESMO tipo da desconhecida', async () => {
    class ComRevogada extends RepositorioDePasskeyDeTeste {
      override acharPorCredentialId(): Promise<CredencialDePasskey | undefined> {
        return Promise.resolve({
          id: 'c1',
          userId: DONO,
          credentialId: Buffer.from('cred'),
          publicKey: Buffer.from('pk'),
          signCount: 3n,
          revogadaEm: (AGORA - 1000) as Instant,
        });
      }
    }
    const repo = new ComRevogada(desafioDeEntrada);
    assert.equal(
      await tipoDoErro(() => servicoCom(repo).concluirEntrada(corpoDeEntrada)),
      'invalid-credentials',
    );
  });

  void it('`user_handle` DIVERGENTE recusa: ele e conferido, nao aceito', async () => {
    class ComCredencialDoDono extends RepositorioDePasskeyDeTeste {
      override acharPorCredentialId(): Promise<CredencialDePasskey | undefined> {
        return Promise.resolve({
          id: 'c1',
          userId: DONO,
          credentialId: Buffer.from('cred'),
          publicKey: Buffer.from('pk'),
          signCount: 3n,
          revogadaEm: null,
        });
      }
    }
    const repo = new ComCredencialDoDono(desafioDeEntrada);
    const comHandleDeOutro = {
      credential: {
        ...corpoDeEntrada.credential,
        response: {
          ...corpoDeEntrada.credential.response,
          user_handle: Buffer.from(OUTRA_CONTA, 'utf8').toString('base64url'),
        },
      },
    };
    assert.equal(
      await tipoDoErro(() => servicoCom(repo).concluirEntrada(comHandleDeOutro)),
      'invalid-credentials',
    );
  });
});

void describe('revogar', () => {
  void it('marca revogada com razao `user`, e NUNCA apaga', async () => {
    const repo = new RepositorioDePasskeyDeTeste(undefined);
    await servicoCom(repo).revogar(DONO, 'c1');
    assert.deepEqual(repo.revogados, [{ id: 'c1', razao: 'user' }]);
  });

  void it('credencial de outra conta responde 404, e nao 403', async () => {
    class NaoAcha extends RepositorioDePasskeyDeTeste {
      override revogar(): Promise<'revogada' | 'nao-encontrada'> {
        return Promise.resolve('nao-encontrada');
      }
    }
    const repo = new NaoAcha(undefined);
    assert.equal(await tipoDoErro(() => servicoCom(repo).revogar(DONO, 'c1')), 'not-found');
  });
});
