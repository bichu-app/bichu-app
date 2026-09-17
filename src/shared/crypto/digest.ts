/**
 * Resumos criptográficos usados em mais de um módulo.
 *
 * Duas regras que este arquivo existe para concentrar:
 *
 * - **Token ao portador é guardado como SHA-256, sem sal.** São 256 bits de
 *   CSPRNG: entropia alta dispensa sal, e sal aqui só adicionaria uma leitura
 *   por verificação (ADR-0002, SEC-005).
 * - **Endereço IP é HMAC com chave secreta, nunca hash puro** (SEC-010). O
 *   espaço IPv4 inteiro tem 2^32 endereços e a tabela de correspondência de um
 *   SHA-256 sem chave se monta em minutos. Hash sem chave de um IP é o IP em
 *   claro com um passo a mais.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** SHA-256 de um token opaco, que é a única forma em que ele é persistido. */
export function hashDeToken(valor: string): Buffer {
  return createHash('sha256').update(valor, 'utf8').digest();
}

/** SHA-256 de um corpo de requisição, para a conferência de idempotência. */
export function hashDeCorpo(corpoCanonico: string): Buffer {
  return createHash('sha256').update(corpoCanonico, 'utf8').digest();
}

/**
 * Comparação em tempo constante. `===` sobre segredo vaza o tamanho do prefixo
 * comum pelo tempo de resposta, e a diferença é medível em rede local.
 */
export function iguaisEmTempoConstante(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Trunca IPv4 para /24 antes do HMAC. O bloco basta para detecção de abuso e
 * reduz o dano de um vazamento da chave: o que sobra é a vizinhança, não a
 * casa. Para IPv6 o corte é no /64, que é o prefixo que uma operadora delega.
 */
export function reduzirEnderecoIp(endereco: string): string {
  const semZonaOuPorta = endereco.replace(/%.*$/, '');
  const ipv4EmIpv6 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(semZonaOuPorta);
  const alvo = ipv4EmIpv6?.[1] ?? semZonaOuPorta;

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(alvo)) {
    const octetos = alvo.split('.');
    return `${octetos[0]}.${octetos[1]}.${octetos[2]}.0/24`;
  }
  if (alvo.includes(':')) {
    const grupos = alvo.split(':').slice(0, 4);
    return `${grupos.join(':')}::/64`;
  }
  // Endereço que não reconhecemos não é descartado nem gravado em claro: vira
  // um rótulo próprio, para que a trilha diga "veio de algo que não soubemos
  // ler" em vez de mentir que veio de lugar nenhum.
  return 'desconhecido';
}

export function hmacDeEnderecoIp(endereco: string | undefined, chave: Buffer): Buffer | null {
  if (endereco === undefined || endereco === '') return null;
  return createHmac('sha256', chave).update(reduzirEnderecoIp(endereco), 'utf8').digest();
}
