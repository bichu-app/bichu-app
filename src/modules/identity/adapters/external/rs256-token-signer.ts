/** JWT RS256, assinado e verificado com `node:crypto`. */
import { constants, createSign, createVerify, type KeyObject } from 'node:crypto';
import type { SigningKey, TokenConfig } from '../../../../shared/config/app-config.js';
import type { Instant, UserId } from '../../../../shared/types/brands.js';
import type {
  ChavePublicaJwk,
  ClaimsDoAcesso,
  ResultadoDaVerificacao,
  TokenEmitido,
  TokenSigner,
} from '../../ports/token-signer.js';

const ALGORITMO = 'RS256';

function base64url(valor: Buffer | string): string {
  return Buffer.from(valor).toString('base64url');
}

function decodificarJson(parte: string): Record<string, unknown> | undefined {
  try {
    const texto = Buffer.from(parte, 'base64url').toString('utf8');
    const valor: unknown = JSON.parse(texto);
    return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function assinar(dados: string, chave: KeyObject): string {
  const assinatura = createSign('RSA-SHA256')
    .update(dados)
    .sign({ key: chave, padding: constants.RSA_PKCS1_PADDING });
  return base64url(assinatura);
}

function conferirAssinatura(dados: string, assinatura: string, chave: KeyObject): boolean {
  try {
    return createVerify('RSA-SHA256')
      .update(dados)
      .verify(
        { key: chave, padding: constants.RSA_PKCS1_PADDING },
        Buffer.from(assinatura, 'base64url'),
      );
  } catch {
    return false;
  }
}

/** Material público no formato JWK, montado do próprio `KeyObject`. */
function paraJwk(chave: SigningKey): ChavePublicaJwk {
  const jwk = chave.publicKey.export({ format: 'jwk' }) as { n?: string; e?: string };
  if (jwk.n === undefined || jwk.e === undefined) {
    throw new Error(`Chave ${chave.kid} não exporta material RSA público.`);
  }
  return { kty: 'RSA', kid: chave.kid, use: 'sig', alg: ALGORITMO, n: jwk.n, e: jwk.e };
}

export function criarTokenSigner(config: TokenConfig): TokenSigner {
  const porKid = new Map(config.allKeys.map((chave) => [chave.kid, chave]));
  const jwksPublicado = config.allKeys.map(paraJwk);

  return {
    emitir(sub: UserId, agora: Instant, jti: string, sid: string): TokenEmitido {
      const iat = Math.floor(agora / 1000);
      const exp = iat + config.accessTokenTtlSeconds;
      const cabecalho = base64url(
        JSON.stringify({ alg: ALGORITMO, typ: 'JWT', kid: config.activeKey.kid }),
      );
      const corpo = base64url(
        JSON.stringify({ iss: config.issuer, sub, aud: config.audience, iat, exp, jti, sid }),
      );
      const dados = `${cabecalho}.${corpo}`;
      return {
        token: `${dados}.${assinar(dados, config.activeKey.privateKey)}`,
        expiresInSeconds: config.accessTokenTtlSeconds,
        issuedAt: iat,
        jti,
      };
    },

    verificar(token: string, agora: Instant): ResultadoDaVerificacao {
      const partes = token.split('.');
      if (partes.length !== 3) return { ok: false, motivo: 'malformado' };
      const [cabecalhoBruto, corpoBruto, assinatura] = partes as [string, string, string];

      const cabecalho = decodificarJson(cabecalhoBruto);
      const corpo = decodificarJson(corpoBruto);
      if (cabecalho === undefined || corpo === undefined) {
        return { ok: false, motivo: 'malformado' };
      }

      if (cabecalho['alg'] !== ALGORITMO) {
        return { ok: false, motivo: 'algoritmo_nao_permitido' };
      }

      const kid = cabecalho['kid'];
      if (typeof kid !== 'string') return { ok: false, motivo: 'kid_desconhecido' };
      const chave = porKid.get(kid);
      if (chave === undefined) return { ok: false, motivo: 'kid_desconhecido' };

      if (!conferirAssinatura(`${cabecalhoBruto}.${corpoBruto}`, assinatura, chave.publicKey)) {
        return { ok: false, motivo: 'assinatura_invalida' };
      }

      const { iss, sub, aud, iat, exp, jti, sid } = corpo;
      if (
        typeof iss !== 'string' ||
        typeof sub !== 'string' ||
        typeof aud !== 'string' ||
        typeof iat !== 'number' ||
        typeof exp !== 'number' ||
        typeof jti !== 'string'
      ) {
        return { ok: false, motivo: 'malformado' };
      }

      if (!config.trustedIssuers.includes(iss)) {
        return { ok: false, motivo: 'emissor_nao_confiavel' };
      }
      if (aud !== config.audience) return { ok: false, motivo: 'audiencia_incorreta' };

      const agoraEmSegundos = Math.floor(agora / 1000);
      const tolerancia = config.clockToleranceSeconds;
      if (exp + tolerancia <= agoraEmSegundos) return { ok: false, motivo: 'expirado' };
      if (iat - tolerancia > agoraEmSegundos) return { ok: false, motivo: 'emitido_no_futuro' };

      const claims: ClaimsDoAcesso = {
        sub: sub as UserId,
        iss,
        aud,
        iat,
        exp,
        jti,
        ...(typeof sid === 'string' ? { sid } : {}),
      };
      return { ok: true, claims };
    },

    jwks: () => jwksPublicado,
  };
}
