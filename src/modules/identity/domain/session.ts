/**
 * Regras de sessão. Puras: nada aqui conhece banco, HTTP nem relógio do sistema.
 *
 * Os quatro números estão em `docs/04-seguranca.md` 7.5 e chegam pela
 * configuração. O que este arquivo carrega é a **regra**, e ela tem um ponto
 * contraintuitivo: como a rotação renova o prazo, 30 e 180 dias são janela de
 * **inatividade**, não teto. Um refresh roubado e usado a cada 6 dias viveria
 * para sempre. O teto absoluto desde a autenticação com senha é o número que
 * fecha essa porta, e ele é constante ao longo da família inteira — renová-lo na
 * rotação seria não ter teto nenhum.
 *
 * Tudo aqui fala em `Instant`, que é milissegundo desde a época, e nunca em
 * `Date`: construir data é trabalho do adaptador de persistência. O domínio não
 * pode nem chamar `new Date()`, e a proibição é imposta por lint
 * (src/architecture.rules.mjs) porque sem ela não há como testar, sem esperar, o
 * que o produto depende de tempo.
 */
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

/**
 * Prazos do token que substitui outro na rotação. O teto absoluto é **herdado**,
 * e a inatividade nunca ultrapassa o teto: sem esse mínimo, o token novo diria
 * valer mais do que a família inteira.
 */
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
 *
 * A comparação arredonda a revogação para cima, ao segundo inteiro, porque `iat`
 * tem granularidade de segundo: um token emitido no mesmo segundo da revogação
 * precisa cair do lado revogado. Se o empate passasse, sobraria uma janela de um
 * segundo — que é exatamente a que quem tomou a conta usa, porque ele está
 * renovando em laço no momento em que a vítima troca a senha.
 */
export function tokenFoiRevogado(iatEmSegundos: number, sessionsInvalidBefore: Instant): boolean {
  return iatEmSegundos * 1000 < Math.ceil(sessionsInvalidBefore / 1000) * 1000;
}

/**
 * A barreira do SEC-006 para uma conta **recém-criada**, truncada ao segundo.
 *
 * Criar conta não é revogar sessão, e tratar as duas do mesmo jeito produzia um
 * defeito de 100% de reprodução na PRIMEIRA TELA DO PRODUTO: `POST
 * /v1/auth/register` devolvia um `access_token` que **nunca funcionava**.
 *
 * A aritmética, com números reais medidos em 18/09:
 *
 * ```
 * conta criada em          1789734320,734 s
 * sessions_invalid_before  1789734320734 ms  -> arredonda para 1789734321000
 * iat do token emitido     1789734320   s    -> vira        1789734320000
 * 1789734320000 < 1789734321000  ->  REVOGADO
 * ```
 *
 * O arredondamento para cima em `tokenFoiRevogado` está **certo** e continua:
 * ele fecha a janela de um segundo que quem tomou a conta usaria, renovando em
 * laço no momento em que a vítima troca a senha. O erro era a conta nascer com
 * uma marca de revogação de precisão de milissegundo, quando o `iat` que ela vai
 * comparar tem precisão de segundo. Truncar para baixo iguala as duas escalas.
 *
 * A garantia original não se perde: continua impossível existir token anterior
 * à criação da conta, porque antes daquele segundo a conta não existia — e
 * revogação de verdade (`invalidarTodasAsSessoes`) mantém a precisão cheia, com
 * o empate caindo do lado revogado, como o SEC-006 exige.
 */
export function barreiraDeContaNova(agora: Instant): Instant {
  return (Math.floor(agora / 1000) * 1000) as Instant;
}
