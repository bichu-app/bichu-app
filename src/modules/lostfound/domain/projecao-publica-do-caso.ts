/**
 * A projeção pública do caso (`PublicLostCase`) e o cartaz (`LostCasePoster`).
 *
 * As duas saem de `CasoPublico`, que já nasce sem id interno e sem dado do
 * tutor (ver a porta). O que esta camada acrescenta são três regras:
 *
 * 1. **Texto livre passa pela redação do canal mediado NA SAÍDA.** O contrato
 *    diz que `description` "passa pela mesma redação de contato das mensagens".
 *    A redação deveria acontecer antes de gravar
 *    (`shared/redaction/redigir.ts`), e para `care_notes` acontece; para
 *    `lost_cases.description` e `pets.distinctive_marks`, hoje, não acontece.
 *    Enquanto a gravação não redigir, a superfície pública redige, e redige
 *    tudo que é texto do tutor, inclusive nome e raça digitada: um telefone
 *    cabe em 40 caracteres, e a regra "resposta pública nunca expõe telefone"
 *    não tem exceção por campo (ADR-0021, "resposta pública não tem ramo
 *    privilegiado").
 * 2. **Os links são as páginas do site** (ADR-0017, quadro das oito rotas):
 *    `/p/{shareToken}` é a página do caso e `/cartaz/{shareToken}` o cartaz.
 * 3. **`area_label` é nulo quando o caso só tem coordenada** (BICHUS-21
 *    critério 5). A coordenada não vira rótulo (não há geocodificação no MVP)
 *    e nunca sai. O texto que a tela mostra nesse caso é do cliente: um rótulo
 *    fixo dentro de um campo de dado seria indistinguível de um bairro com esse
 *    nome (contrato, `PublicLostPet.area_label`).
 */
import { redigirCanalMediado } from '../../../shared/redaction/redigir.js';
import { rotuloDaArea } from './abertura-do-caso.js';
import type { components } from '../../../shared/types/generated/api.js';
import type { AbsoluteUrl } from '../../../shared/types/brands.js';
import type { CasoPublico } from '../ports/leitura-publica-do-caso.js';

type PublicLostCase = components['schemas']['PublicLostCase'];
type LostCasePoster = components['schemas']['LostCasePoster'];

export interface BasesPublicas {
  /** Onde o site mora: de onde saem o link do caso e o do cartaz. */
  readonly baseDaWeb: AbsoluteUrl;
  /** Onde as derivadas públicas da foto moram. O banco guarda só a chave. */
  readonly baseDeMidia: AbsoluteUrl;
}

export interface LinksDoCaso {
  readonly shareUrl: string;
  readonly posterUrl: string;
}

function semBarraNoFim(base: string): string {
  return base.replace(/\/$/, '');
}

export function linksDoCaso(baseDaWeb: AbsoluteUrl, shareToken: string): LinksDoCaso {
  const base = semBarraNoFim(baseDaWeb);
  return {
    shareUrl: `${base}/p/${shareToken}`,
    posterUrl: `${base}/cartaz/${shareToken}`,
  };
}

/** Texto do tutor, redigido. `null` continua `null`: ausência não é texto vazio. */
function redigido(texto: string | null): string | null {
  if (texto === null) return null;
  return redigirCanalMediado(texto).texto;
}

/** O nome é obrigatório no contrato, então a redação nunca o transforma em nulo. */
function nomeRedigido(nome: string): string {
  return redigirCanalMediado(nome).texto;
}

function urlDaFoto(caso: CasoPublico, baseDeMidia: AbsoluteUrl): string | null {
  return caso.chaveDaFoto === null ? null : `${semBarraNoFim(baseDeMidia)}/${caso.chaveDaFoto}`;
}

function rotuloPublicoDaArea(caso: CasoPublico): string | null {
  return rotuloDaArea({
    city: caso.cidade ?? undefined,
    neighborhood: caso.bairro ?? undefined,
  });
}

/**
 * `PublicLostCase`, campo a campo como o contrato declara, e nenhum a mais.
 *
 * `can_report_sighting` é falso só para o tutor. O contrato diz "verdadeiro
 * para qualquer outra conta" e não fala de quem não tem conta; aqui o anônimo
 * também recebe verdadeiro, porque o botão existe para quem viu o animal, e a
 * conta é pedida no toque, não na leitura.
 */
export function projecaoPublicaDoCaso(caso: CasoPublico, bases: BasesPublicas): PublicLostCase {
  const links = linksDoCaso(bases.baseDaWeb, caso.shareToken);
  return {
    share_token: caso.shareToken,
    pet_display_name: nomeRedigido(caso.petNome),
    species: caso.especie,
    breed_label: redigido(caso.racaRotulo),
    size: caso.porte,
    primary_color: caso.corRotulo,
    lost_since: caso.vistoPorUltimoEm.toISOString(),
    area_label: rotuloPublicoDaArea(caso),
    photo_url: urlDaFoto(caso, bases.baseDeMidia),
    share_url: links.shareUrl,
    description: redigido(caso.descricao),
    care_notes: redigido(caso.cuidados),
    can_report_sighting: !caso.doChamador,
    poster_url: links.posterUrl,
  };
}

/**
 * `LostCasePoster`, campo a campo como o contrato declara.
 *
 * - Não há campo de recompensa. O ADR-0010 proíbe recompensa em qualquer forma,
 *   e `reward_note` saiu do contrato em 23/09/2026.
 * - `short_url` é o endereço da página do caso. Não há encurtador no produto, e
 *   o `/p/{shareToken}` é o endereço mais curto que leva ao canal mediado.
 * - `photo_url` é a derivada `card`, a única que a superfície pública mostra
 *   (migração de `pet_photos`). O contrato fixa essa derivada, de 1024 px, para
 *   o cartaz desde 23/09/2026.
 */
export function cartazDoCaso(caso: CasoPublico, bases: BasesPublicas): LostCasePoster {
  return {
    pet_display_name: nomeRedigido(caso.petNome),
    species: caso.especie,
    breed_label: redigido(caso.racaRotulo),
    size: caso.porte,
    primary_color: caso.corRotulo,
    distinctive_marks: redigido(caso.marcas),
    lost_since: caso.vistoPorUltimoEm.toISOString(),
    area_label: rotuloPublicoDaArea(caso),
    photo_url: urlDaFoto(caso, bases.baseDeMidia),
    short_url: linksDoCaso(bases.baseDaWeb, caso.shareToken).shareUrl,
  };
}
