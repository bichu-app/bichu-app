/** A resposta das duas operações de `options` na grafia do CONTRATO. */
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';
import type { components } from '../../../../shared/types/generated/api.js';

export type OpcoesDeCadastroDoContrato = components['schemas']['PasskeyRegistrationOptions'];
export type OpcoesDeEntradaDoContrato = components['schemas']['PasskeyAuthenticationOptions'];
type DescritorDoContrato = components['schemas']['PasskeyDescriptor'];

/**
 * A falha é de MANUTENÇÃO, nunca de quem chama: toda ela nasce de a biblioteca ter
 * devolvido coisa diferente do que este arquivo mapeia.
 */
function divergencia(campo: string, esperado: string, recebido: unknown): Error {
  return new Error(
    `A opção de passkey '${campo}' veio ${JSON.stringify(recebido)} do ` +
      `@simplewebauthn/server, e o contrato declara ${esperado}. O corpo da resposta ` +
      'não pode ser emitido fora da grafia e dos valores que `api/openapi.yaml` ' +
      'declara — foi exatamente assim que o passkey falhou em silêncio antes. ' +
      'Confira a chamada de `generate*Options` em `passkey-service.ts`.',
  );
}

function exigido<T>(campo: string, valor: T | undefined, esperado: string): T {
  if (valor === undefined) throw divergencia(campo, esperado, valor);
  return valor;
}

/** O descritor na grafia do contrato. */
function descritor(indice: number, bruto: { readonly id: string; readonly type?: string }): DescritorDoContrato {
  if (bruto.type !== undefined && bruto.type !== 'public-key') {
    throw divergencia(`exclude_credentials[${String(indice)}].type`, "'public-key'", bruto.type);
  }
  return { type: 'public-key', id: bruto.id };
}

export function grafiaDasOpcoesDeCadastro(
  opcoes: PublicKeyCredentialCreationOptionsJSON,
): OpcoesDeCadastroDoContrato {
  const attestation = exigido('attestation', opcoes.attestation, "'none'");
  if (attestation !== 'none') throw divergencia('attestation', "'none'", attestation);

  const selecao = exigido(
    'authenticator_selection',
    opcoes.authenticatorSelection,
    'um objeto com attachment, resident key e user verification',
  );
  const { authenticatorAttachment, residentKey, userVerification } = selecao;
  if (authenticatorAttachment !== 'platform') {
    throw divergencia('authenticator_selection.authenticator_attachment', "'platform'", authenticatorAttachment);
  }
  if (residentKey !== 'required') {
    throw divergencia('authenticator_selection.resident_key', "'required'", residentKey);
  }
  if (userVerification !== 'required') {
    throw divergencia('authenticator_selection.user_verification', "'required'", userVerification);
  }

  const rpId = opcoes.rp.id;
  if (typeof rpId !== 'string' || rpId === '') {
    throw divergencia('rp.id', 'o hostname do Relying Party', rpId);
  }

  return {
    challenge: opcoes.challenge,
    rp: { id: rpId, name: opcoes.rp.name },
    user: {
      id: opcoes.user.id,
      name: opcoes.user.name,
      display_name: opcoes.user.displayName,
    },
    pub_key_cred_params: opcoes.pubKeyCredParams.map((parametro, indice) => {
      if (parametro.type !== 'public-key') {
        throw divergencia(`pub_key_cred_params[${String(indice)}].type`, "'public-key'", parametro.type);
      }
      if (parametro.alg !== -7 && parametro.alg !== -257) {
        throw divergencia(`pub_key_cred_params[${String(indice)}].alg`, '-7 (ES256) ou -257 (RS256)', parametro.alg);
      }
      return { type: 'public-key', alg: parametro.alg };
    }),
    timeout: exigido('timeout', opcoes.timeout, 'o prazo do desafio em milissegundos'),
    attestation,
    authenticator_selection: {
      authenticator_attachment: 'platform',
      resident_key: 'required',
      user_verification: 'required',
    },
    exclude_credentials: exigido(
      'exclude_credentials',
      opcoes.excludeCredentials,
      'a lista das credenciais ativas da conta, vazia quando não há nenhuma',
    ).map((bruto, indice) => descritor(indice, bruto)),
  };
}

export function grafiaDasOpcoesDeEntrada(
  opcoes: PublicKeyCredentialRequestOptionsJSON,
): OpcoesDeEntradaDoContrato {
  const userVerification = exigido('user_verification', opcoes.userVerification, "'required'");
  if (userVerification !== 'required') {
    throw divergencia('user_verification', "'required'", userVerification);
  }

  const rpId = exigido('rp_id', opcoes.rpId, 'o hostname do Relying Party');
  if (rpId === '') throw divergencia('rp_id', 'o hostname do Relying Party', rpId);

  const permitidas = exigido('allow_credentials', opcoes.allowCredentials, 'a lista VAZIA');
  if (permitidas.length > 0) {
    throw divergencia(
      'allow_credentials',
      'a lista VAZIA (o contrato declara `maxItems: 0`; preenchê-la faria a ' +
        'entrada enumerar conta)',
      permitidas,
    );
  }

  return {
    challenge: opcoes.challenge,
    timeout: exigido('timeout', opcoes.timeout, 'o prazo do desafio em milissegundos'),
    rp_id: rpId,
    user_verification: userVerification,
    allow_credentials: [],
  };
}
