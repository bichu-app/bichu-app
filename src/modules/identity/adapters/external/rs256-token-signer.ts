/**
 * JWT RS256, assinado e verificado com `node:crypto`.
 *
 * RS256 e nunca HS256 (ADR-0002): chave simétrica não se substitui por um
 * emissor externo, e quem valida também poderia emitir. É o que fecharia a porta
 * do Keycloak.
 *
 * A verificação lê a chave da **memória do processo** e nunca busca o próprio
 * JWKS por HTTP: somos o emissor no MVP, e um serviço que valida chamando o
 * próprio endpoint cria dependência circular e um vetor de negação de serviço
 * trivial (docs/04-seguranca.md 7.6, requisito 5).
 */
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
      // `sub` é o UUID interno. É este detalhe que compra a liberdade: quando o
      // Keycloak entrar, os usuários são criados nele com o `id` forçado igual
      // ao nosso, e o `sub` continua sendo o mesmo valor de sempre.
      // `sid` e a familia de refresh que emitiu este token (ADR-0002, emenda
      // 1). Ele entra no corpo agora e a barreira nao o le nesta rodada: o
      // ganho e que, no dia em que a revogacao por sessao for necessaria, os
      // tokens em campo ja a carregam. Campo novo em token publicado e mudanca
      // de contrato com versao antiga em aparelho por meses.
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

      // Lista de algoritmos permitidos igual a exatamente ["RS256"], conferida
      // ANTES de qualquer outra coisa. `alg: none` e HS256 assinado com a chave
      // pública morrem aqui.
      if (cabecalho['alg'] !== ALGORITMO) {
        return { ok: false, motivo: 'algoritmo_nao_permitido' };
      }

      const kid = cabecalho['kid'];
      if (typeof kid !== 'string') return { ok: false, motivo: 'kid_desconhecido' };
      const chave = porKid.get(kid);
      // Falha fechado. Nunca "tentar todas as chaves do JWKS".
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

      // Lista de emissores confiáveis, não um emissor fixo. Uma lista com um
      // item hoje é uma linha de configuração amanhã (ADR-0002).
      if (!config.trustedIssuers.includes(iss)) {
        return { ok: false, motivo: 'emissor_nao_confiavel' };
      }
      if (aud !== config.audience) return { ok: false, motivo: 'audiencia_incorreta' };

      const agoraEmSegundos = Math.floor(agora / 1000);
      const tolerancia = config.clockToleranceSeconds;
      if (exp + tolerancia <= agoraEmSegundos) return { ok: false, motivo: 'expirado' };
      if (iat - tolerancia > agoraEmSegundos) return { ok: false, motivo: 'emitido_no_futuro' };

      // `sid` NAO entra na conferencia de forma acima, e a ausencia dele nao
      // recusa o token. Todo token emitido a partir desta mudanca o carrega; os
      // que ja circulam, nao. Exigi-lo aqui deslogaria a base inteira na
      // subida — o estrago exato que declarar o campo cedo existe para evitar.
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
