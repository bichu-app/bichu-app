/** Regras de sessão. Puras: nada aqui conhece banco, HTTP nem relógio do sistema. */
import type { Instant } from '../../../shared/types/brands.js';

export interface JanelasDeSessao {
  readonly idleTtlSeconds: number;
  readonly staySignedInIdleTtlSeconds: number;
  readonly absoluteTtlSeconds: number;
}

export interface PrazosDoRefresh {
  /** Vence por inatividade; a rotação empurra este. */
  readonly expiresAt: Instant;
  /** Teto desde a autenticação com senha; a rotação **não** empurra este. */
  readonly absoluteExpiresAt: Instant;
}

function janelaDeInatividade(janelas: JanelasDeSessao, continuarConectado: boolean): number {
  return continuarConectado ? janelas.staySignedInIdleTtlSeconds : janelas.idleTtlSeconds;
}

export function prazosDeNovaFamilia(
  agora: Instant,
  janelas: JanelasDeSessao,
  continuarConectado: boolean,
): PrazosDoRefresh {
  const inatividade = janelaDeInatividade(janelas, continuarConectado);
  return {
    expiresAt: (agora + inatividade * 1000) as Instant,
    absoluteExpiresAt: (agora + janelas.absoluteTtlSeconds * 1000) as Instant,
  };
}

/** Prazos do token que substitui outro na rotação. */
export function prazosDeRotacao(
  agora: Instant,
  janelas: JanelasDeSessao,
  absolutoHerdado: Instant,
  continuarConectado: boolean,
): PrazosDoRefresh {
  const porInatividade = agora + janelaDeInatividade(janelas, continuarConectado) * 1000;
  return {
    expiresAt: Math.min(porInatividade, absolutoHerdado) as Instant,
    absoluteExpiresAt: absolutoHerdado,
  };
}

export function segundosRestantes(agora: Instant, ate: Instant): number {
  return Math.max(0, Math.floor((ate - agora) / 1000));
}

/**
 * SEC-006. O token de acesso é verificado offline pela assinatura e continuaria
 * valendo até o `exp`; comparar o `iat` com `sessions_invalid_before` é o que faz
 * logout total, troca de senha, redefinição, "Não fui eu" e exclusão de conta
 * terem efeito em **menos de um segundo** em vez de em até 15 minutos.
 */
export function tokenFoiRevogado(iatEmSegundos: number, sessionsInvalidBefore: Instant): boolean {
  return iatEmSegundos * 1000 < Math.ceil(sessionsInvalidBefore / 1000) * 1000;
}

/** SEC-006 do lado do **refresh**, que é a metade que faltava. */
export function refreshFoiRevogado(issuedAt: Instant, sessionsInvalidBefore: Instant): boolean {
  return issuedAt < sessionsInvalidBefore;
}

/** A barreira do SEC-006 para uma conta **recém-criada**, truncada ao segundo. */
export function barreiraDeContaNova(agora: Instant): Instant {
  return (Math.floor(agora / 1000) * 1000) as Instant;
}

/**
 * O instante com que o token de acesso deve ser EMITIDO para que ele não nasça
 * recusado pela própria barreira do SEC-006 (BICHUS-132).
 */
export function instanteDeEmissaoDoAcesso(
  agora: Instant,
  sessionsInvalidBefore: Instant,
): Instant {
  return Math.max(agora, Math.ceil(sessionsInvalidBefore / 1000) * 1000) as Instant;
}

/**
 * O instante que a revogação deve GRAVAR em `sessions_invalid_before` para que ela
 * alcance **todo** token de acesso já emitido — inclusive o que {@link
 * instanteDeEmissaoDoAcesso} datou à frente do relógio.
 */
export function instanteDeRevogacao(agora: Instant, barreiraAtual: Instant): Instant {
  return Math.max(agora, Math.ceil(barreiraAtual / 1000) * 1000 + 1) as Instant;
}
