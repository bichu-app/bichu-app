/** Cadastro e entrada por credencial digital (passkey). */
import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { createHash } from 'node:crypto';
import type { Clock } from '../../../shared/time/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';
import { problemas } from '../../../shared/http/errors.js';
import type { PasskeyRepository, PasskeyDaTela } from '../ports/passkey-repository.js';
import {
  ALGORITMOS_ACEITOS,
  PRAZO_DO_DESAFIO_MS,
  TETO_DE_PASSKEYS_POR_CONTA,
  contadorAceito,
  desafioValido,
  rotuloNormalizado,
} from '../domain/passkey.js';

/** A identidade do Relying Party. */
export interface IdentidadeDoRelyingParty {
  readonly rpId: string;
  readonly rpName: string;
  readonly origensAceitas: readonly string[];
}

export interface DependenciasDePasskey {
  readonly repositorio: PasskeyRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly trilha: AuditLog;
  readonly rp: IdentidadeDoRelyingParty;
}

/** O `userHandle` é o UUID interno, nunca o e-mail — ver o contrato. */
export interface DonoDaCredencial {
  readonly id: UserId;
  readonly email: string;
  readonly displayName: string | null;
}

function base64url(b: Buffer | Uint8Array): string {
  return Buffer.from(b).toString('base64url');
}

/** SHA-256 do desafio em base64url. */
function hashDoDesafio(desafioBase64url: string): Buffer {
  return createHash('sha256').update(desafioBase64url, 'utf8').digest();
}

export class PasskeyService {
  constructor(private readonly deps: DependenciasDePasskey) {}

  /** Passo 1 do cadastro: emite o desafio. */
  async comecarCadastro(dono: DonoDaCredencial): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const { repositorio, clock, ids, rp } = this.deps;

    const ativas = await repositorio.contarAtivas(dono.id);
    if (ativas >= TETO_DE_PASSKEYS_POR_CONTA) {
      throw problemas.tetoDePasskeysDaConta(TETO_DE_PASSKEYS_POR_CONTA);
    }

    const aExcluir = await repositorio.credenciaisAtivasParaExcluir(dono.id);

    const opcoes = await generateRegistrationOptions({
      rpName: rp.rpName,
      rpID: rp.rpId,
      userID: Buffer.from(dono.id, 'utf8'),
      userName: dono.email,
      userDisplayName: dono.displayName ?? dono.email,
      attestationType: 'none',
      timeout: PRAZO_DO_DESAFIO_MS,
      supportedAlgorithmIDs: [...ALGORITMOS_ACEITOS],
      excludeCredentials: aExcluir.map((id) => ({ id: base64url(id) })),
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'required',
        userVerification: 'required',
      },
    });

    const agora = clock.now();
    await repositorio.guardarDesafio({
      id: ids.uuidv7(),
      userId: dono.id,
      purpose: 'registration',
      challengeHash: hashDoDesafio(opcoes.challenge),
      expiraEm: (agora + PRAZO_DO_DESAFIO_MS) as Instant,
    });

    return opcoes;
  }

  /** Passo 2 do cadastro: verifica a atestação e guarda a chave pública. */
  async concluirCadastro(
    dono: DonoDaCredencial,
    resposta: { readonly credential: unknown; readonly label?: string },
  ): Promise<PasskeyDaTela> {
    const { repositorio, clock, ids, trilha, rp } = this.deps;

    const credencialBruta = resposta.credential as {
      id?: unknown;
      response?: { client_data_json?: unknown };
    };
    const desafioRecebido = this.desafioDoClientData(credencialBruta.response?.client_data_json);
    const desafio = await repositorio.acharDesafioPorHash(hashDoDesafio(desafioRecebido));

    const agora = clock.now();
    if (desafio === undefined || !desafioValido(desafio, agora)) {
      throw problemas.desafioDePasskeyVencido();
    }
    if (desafio.purpose !== 'registration' || desafio.userId !== dono.id) {
      throw problemas.desafioDePasskeyVencido();
    }
    if (!(await repositorio.consumirDesafio(desafio.id, agora))) {
      throw problemas.desafioDePasskeyVencido();
    }

    let verificacao;
    try {
      verificacao = await verifyRegistrationResponse({
        response: this.comoRespostaDeCadastro(resposta.credential),
        expectedChallenge: (recebido) =>
          hashDoDesafio(recebido).equals(hashDoDesafio(desafioRecebido)),
        expectedOrigin: [...rp.origensAceitas],
        expectedRPID: rp.rpId,
        requireUserVerification: true,
        supportedAlgorithmIDs: [...ALGORITMOS_ACEITOS],
      });
    } catch {
      throw problemas.atestacaoDePasskeyRecusada();
    }

    if (!verificacao.verified || verificacao.registrationInfo === undefined) {
      throw problemas.atestacaoDePasskeyRecusada();
    }

    const info = verificacao.registrationInfo;
    const credentialId = Buffer.from(info.credential.id, 'base64url');

    const jaExiste = await repositorio.acharPorCredentialId(credentialId);
    if (jaExiste !== undefined) throw problemas.passkeyJaCadastrada();

    if ((await repositorio.contarAtivas(dono.id)) >= TETO_DE_PASSKEYS_POR_CONTA) {
      throw problemas.tetoDePasskeysDaConta(TETO_DE_PASSKEYS_POR_CONTA);
    }

    const gravada = await repositorio.gravar(
      {
        id: ids.uuidv7(),
        userId: dono.id,
        credentialId,
        publicKey: Buffer.from(info.credential.publicKey),
        signCount: BigInt(info.credential.counter),
        label: rotuloNormalizado(resposta.label),
        transports: info.credential.transports ?? null,
      },
      agora,
    );

    await trilha.record({
      actorKind: 'user',
      actorUserId: dono.id,
      action: 'auth.passkey_registered',
      resourceKind: 'passkey',
      resourceId: gravada.id,
      metadata: { credential_backed_up: info.credentialBackedUp },
    });

    return gravada;
  }

  /** Passo 1 da entrada: emite o desafio. */
  async comecarEntrada(): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const { repositorio, clock, ids, rp } = this.deps;

    const opcoes = await generateAuthenticationOptions({
      rpID: rp.rpId,
      timeout: PRAZO_DO_DESAFIO_MS,
      userVerification: 'required',
      allowCredentials: [],
    });

    const agora = clock.now();
    await repositorio.guardarDesafio({
      id: ids.uuidv7(),
      userId: null,
      purpose: 'authentication',
      challengeHash: hashDoDesafio(opcoes.challenge),
      expiraEm: (agora + PRAZO_DO_DESAFIO_MS) as Instant,
    });

    return opcoes;
  }

  /** Passo 2 da entrada: verifica a asserção e devolve de QUEM ela é. */
  async concluirEntrada(resposta: { readonly credential: unknown }): Promise<UserId> {
    const { repositorio, clock, trilha, rp } = this.deps;

    const credencialBruta = resposta.credential as {
      id?: unknown;
      response?: { client_data_json?: unknown; user_handle?: unknown };
    };
    const desafioRecebido = this.desafioDoClientData(credencialBruta.response?.client_data_json);
    const desafio = await repositorio.acharDesafioPorHash(hashDoDesafio(desafioRecebido));

    const agora = clock.now();
    if (desafio === undefined || !desafioValido(desafio, agora)) {
      throw problemas.desafioDePasskeyVencido();
    }
    if (desafio.purpose !== 'authentication') throw problemas.desafioDePasskeyVencido();
    if (!(await repositorio.consumirDesafio(desafio.id, agora))) {
      throw problemas.desafioDePasskeyVencido();
    }

    if (typeof credencialBruta.id !== 'string' || credencialBruta.id === '') {
      throw problemas.credencialRecusada();
    }
    const credentialId = Buffer.from(credencialBruta.id, 'base64url');
    const credencial = await repositorio.acharPorCredentialId(credentialId);

    if (credencial === undefined || credencial.revogadaEm !== null) {
      throw problemas.credencialRecusada();
    }

    const handle = credencialBruta.response?.user_handle;
    if (typeof handle === 'string' && handle !== '') {
      if (Buffer.from(handle, 'base64url').toString('utf8') !== credencial.userId) {
        throw problemas.credencialRecusada();
      }
    }

    let verificacao;
    try {
      verificacao = await verifyAuthenticationResponse({
        response: this.comoRespostaDeEntrada(resposta.credential),
        expectedChallenge: (recebido) =>
          hashDoDesafio(recebido).equals(hashDoDesafio(desafioRecebido)),
        expectedOrigin: [...rp.origensAceitas],
        expectedRPID: rp.rpId,
        requireUserVerification: true,
        credential: {
          id: base64url(credencial.credentialId),
          publicKey: new Uint8Array(credencial.publicKey),
          counter: Number(credencial.signCount),
        },
      });
    } catch {
      throw problemas.credencialRecusada();
    }

    if (!verificacao.verified) throw problemas.credencialRecusada();

    const recebido = BigInt(verificacao.authenticationInfo.newCounter);
    if (!contadorAceito(credencial.signCount, recebido)) {
      await repositorio.revogarPorCredentialId(credentialId, 'counter_regression', agora);
      await trilha.record({
        actorKind: 'user',
        actorUserId: credencial.userId,
        action: 'auth.passkey_counter_regression',
        resourceKind: 'passkey',
        resourceId: credencial.id,
        metadata: { guardado: credencial.signCount.toString(), recebido: recebido.toString() },
      });
      throw problemas.credencialRecusada();
    }

    if (!(await repositorio.avancarContador(credencial.id, credencial.signCount, recebido, agora))) {
      throw problemas.credencialRecusada();
    }

    return credencial.userId;
  }

  /** As credenciais ativas da conta. */
  listar(userId: UserId): Promise<readonly PasskeyDaTela[]> {
    return this.deps.repositorio.ativasDaConta(userId);
  }

  /** Revoga. MARCA revogada, nunca apaga. */
  async revogar(userId: UserId, passkeyId: string): Promise<void> {
    const { repositorio, clock, trilha } = this.deps;
    const agora = clock.now();
    const resultado = await repositorio.revogar(passkeyId, userId, 'user', agora);
    if (resultado === 'nao-encontrada') throw problemas.naoEncontrado();
    await trilha.record({
      actorKind: 'user',
      actorUserId: userId,
      action: 'auth.passkey_revoked',
      resourceKind: 'passkey',
      resourceId: passkeyId,
    });
  }

  /** O `challenge` que o aparelho diz ter assinado, lido do `clientDataJSON`. */
  private desafioDoClientData(clientDataJson: unknown): string {
    if (typeof clientDataJson !== 'string' || clientDataJson === '') {
      throw problemas.desafioDePasskeyVencido();
    }
    let lido: unknown;
    try {
      lido = JSON.parse(Buffer.from(clientDataJson, 'base64url').toString('utf8'));
    } catch {
      throw problemas.desafioDePasskeyVencido();
    }
    const desafio = (lido as { challenge?: unknown } | null)?.challenge;
    if (typeof desafio !== 'string' || desafio === '') {
      throw problemas.desafioDePasskeyVencido();
    }
    return desafio;
  }

  /**
   * Converte o corpo do contrato (`snake_case`) para o que a biblioteca espera
   * (`camelCase`).
   */
  private comoRespostaDeCadastro(credencial: unknown): RegistrationResponseJSON {
    const c = credencial as {
      id: string;
      raw_id: string;
      type: 'public-key';
      response: {
        client_data_json: string;
        attestation_object: string;
        transports?: string[];
      };
    };
    return {
      id: c.id,
      rawId: c.raw_id,
      type: c.type,
      clientExtensionResults: {},
      response: {
        clientDataJSON: c.response.client_data_json,
        attestationObject: c.response.attestation_object,
        ...(c.response.transports === undefined ? {} : { transports: c.response.transports }),
      },
    };
  }

  private comoRespostaDeEntrada(credencial: unknown): AuthenticationResponseJSON {
    const c = credencial as {
      id: string;
      raw_id: string;
      type: 'public-key';
      response: {
        client_data_json: string;
        authenticator_data: string;
        signature: string;
        user_handle?: string | null;
      };
    };
    return {
      id: c.id,
      rawId: c.raw_id,
      type: c.type,
      clientExtensionResults: {},
      response: {
        clientDataJSON: c.response.client_data_json,
        authenticatorData: c.response.authenticator_data,
        signature: c.response.signature,
        ...(c.response.user_handle === undefined || c.response.user_handle === null
          ? {}
          : { userHandle: c.response.user_handle }),
      },
    };
  }
}
