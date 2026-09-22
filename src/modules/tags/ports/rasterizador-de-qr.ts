/**
 * Porta do rasterizador do QR.
 *
 * O domínio decide **tudo que vira plástico** — nível de correção, margem de
 * silêncio, escala, o que cabe na plaquinha — e entrega um `DesenhoDoQr`, que é
 * o mapa de pixels pronto. O que falta é embrulhar esse mapa num contêiner de
 * arquivo, e isso é trabalho de biblioteca de imagem: hoje `sharp`, amanhã o
 * que for, sem que quem chama mude.
 *
 * A porta existe pelo mesmo motivo de `SecretCipher`: `sharp` traz binário
 * nativo e o §11.1 mantém esse tipo de dependência fora de `domain/` e de
 * `application/` (a regra `domainPurity` a nomeia). Sem a porta, provar que o
 * QR cabe em 50 mm exigiria carregar um decodificador de imagem.
 *
 * **A densidade não é enfeite.** Ela vai para o chunk `pHYs` do PNG e é o que
 * diz à impressão em que escala o arquivo deve sair. Sem ela a ferramenta
 * adivinha 72 ou 96 dpi e põe o mesmo QR a mais de 100 mm — muito além da
 * plaquinha. Uma implementação desta porta que descarte `densidadeEmDpi` gera um
 * arquivo com os pixels certos e o tamanho errado.
 */
import type { DesenhoDoQr } from '../domain/qr-da-tag.js';

export interface RasterizadorDeQr {
  /** O desenho como arquivo PNG, com a densidade gravada nele. */
  paraPng(desenho: DesenhoDoQr): Promise<Buffer>;
}
