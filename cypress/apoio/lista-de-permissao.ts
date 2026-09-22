/**
 * Lista de permissão sobre o corpo de resposta pública (§3.4 do plano).
 *
 * A verificação campo a campo passa hoje e fica cega amanhã, quando alguém
 * acrescenta uma propriedade ao tipo público: um comparador que só procura o
 * que sumiu não enxerga o campo novo que vazou. Então a regra é invertida —
 * **qualquer chave fora da lista reprova, com o nome da chave e o caminho dela
 * na mensagem**.
 *
 * As listas abaixo são transcritas de `api/openapi.yaml`, esquema por esquema.
 * Acrescentar chave aqui é decisão consciente de expor mais; é para isso que
 * este arquivo existe separado do cenário.
 */

/** Chaves permitidas por caminho de objeto. `*` casa índice de array. */
export type ArvoreDePermissao = { readonly [chave: string]: ArvoreDePermissao | true };

/** `TagResolution` — `GET /v1/tags/{code}`. Visão pública mínima. */
export const TAG_RESOLUTION: ArvoreDePermissao = {
  viewer: true,
  pet: {
    display_name: true,
    species: true,
    breed_label: true,
    size: true,
    primary_color: true,
    distinctive_marks: true,
    care_notes: true,
    photo_url: true,
  },
  lost: { is_lost: true, since: true },
  already_notified: true,
};

/** `FoundReportCreated` — `POST /v1/tags/{code}/found-reports`. Sem id interno (SEC-001). */
export const FOUND_REPORT_CREATED: ArvoreDePermissao = {
  finder_token: true,
  conversation_url: true,
  owner_notified: true,
  pet_display_name: true,
};

/** `PublicLostPetPage` — `GET /v1/public/lost-pets`. */
export const PUBLIC_LOST_PET_PAGE: ArvoreDePermissao = {
  items: {
    '*': {
      share_token: true,
      pet_display_name: true,
      species: true,
      breed_label: true,
      size: true,
      primary_color: true,
      lost_since: true,
      area_label: true,
      photo_url: true,
      share_url: true,
    },
  },
  page: true,
  limit: true,
  total: true,
  applied_filters: { '*': true },
};

/** `PublicLostCase` — `GET /v1/public/lost-cases/{shareToken}`. É `PublicLostPet` mais quatro. */
export const PUBLIC_LOST_CASE: ArvoreDePermissao = {
  share_token: true,
  pet_display_name: true,
  species: true,
  breed_label: true,
  size: true,
  primary_color: true,
  lost_since: true,
  area_label: true,
  photo_url: true,
  share_url: true,
  description: true,
  care_notes: true,
  can_report_sighting: true,
  poster_url: true,
};

function permitidoPara(arvore: ArvoreDePermissao, chave: string): ArvoreDePermissao | true | undefined {
  return arvore[chave] ?? arvore['*'];
}

/**
 * Percorre o corpo inteiro e devolve o caminho de toda chave fora da lista.
 * `applied_filters` usa `additionalProperties`, e o coringa `*` cobre isso.
 */
export function chavesForaDaLista(corpo: unknown, arvore: ArvoreDePermissao, prefixo = ''): readonly string[] {
  if (Array.isArray(corpo)) {
    const sub = permitidoPara(arvore, '*');
    if (sub === undefined || sub === true) return [];
    return corpo.flatMap((item, i) => chavesForaDaLista(item, sub, `${prefixo}[${i}]`));
  }
  if (typeof corpo !== 'object' || corpo === null) return [];

  const achados: string[] = [];
  for (const [chave, valor] of Object.entries(corpo as Record<string, unknown>)) {
    const caminho = prefixo === '' ? chave : `${prefixo}.${chave}`;
    const permissao = permitidoPara(arvore, chave);
    if (permissao === undefined) {
      achados.push(caminho);
      continue;
    }
    if (permissao !== true) {
      achados.push(...chavesForaDaLista(valor, permissao, caminho));
    }
  }
  return achados;
}

/**
 * Varredura de **valor**, complementar à de chave. A chave pode estar na lista
 * e o valor carregar o que nunca pode sair: telefone, CEP, logradouro,
 * coordenada. Contato mediado é regra de produto, e a resposta que a quebra
 * reprova aqui.
 */
const PADROES_PROIBIDOS: ReadonlyArray<{ readonly nome: string; readonly regex: RegExp }> = [
  { nome: 'telefone em E.164', regex: /\+55\s?\d{2}\s?9?\d{4}-?\d{4}/ },
  { nome: 'telefone brasileiro com DDD', regex: /\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}(?!\d)/ },
  { nome: 'CEP', regex: /\b\d{5}-?\d{3}\b/ },
  { nome: 'logradouro', regex: /\b(rua|avenida|av\.|travessa|alameda|rodovia)\s+[a-zà-ú]/i },
  { nome: 'endereço de e-mail', regex: /[\w.+-]+@[\w-]+\.[\w.]{2,}/ },
];

const CHAVES_DE_COORDENADA = ['lat', 'lon', 'lng', 'latitude', 'longitude', 'coordinates', 'geo', 'point', 'location'];

export interface Vazamento {
  readonly caminho: string;
  readonly motivo: string;
}

export function vazamentosDeContato(corpo: unknown, prefixo = ''): readonly Vazamento[] {
  if (Array.isArray(corpo)) {
    return corpo.flatMap((item, i) => vazamentosDeContato(item, `${prefixo}[${i}]`));
  }
  if (typeof corpo === 'string') {
    // Um mesmo valor casa mais de um padrão (um telefone casa E.164 e DDD).
    // Reportar o mesmo caminho duas vezes faria a mensagem contar dois
    // vazamentos onde há um, então o primeiro padrão que casar responde.
    const padrao = PADROES_PROIBIDOS.find((p) => p.regex.test(corpo));
    return padrao === undefined ? [] : [{ caminho: prefixo, motivo: `valor contém ${padrao.nome}` }];
  }
  if (typeof corpo !== 'object' || corpo === null) return [];

  const achados: Vazamento[] = [];
  for (const [chave, valor] of Object.entries(corpo as Record<string, unknown>)) {
    const caminho = prefixo === '' ? chave : `${prefixo}.${chave}`;
    if (CHAVES_DE_COORDENADA.includes(chave.toLowerCase())) {
      achados.push({ caminho, motivo: 'chave de coordenada em resposta pública' });
      continue;
    }
    achados.push(...vazamentosDeContato(valor, caminho));
  }
  return achados;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** UUID em resposta alcançável sem conta é o item 6 do ADR-0010 e o SEC-001. */
export function uuidsEmRespostaPublica(corpo: unknown, prefixo = ''): readonly string[] {
  if (Array.isArray(corpo)) return corpo.flatMap((item, i) => uuidsEmRespostaPublica(item, `${prefixo}[${i}]`));
  if (typeof corpo === 'string') return UUID.test(corpo) ? [prefixo] : [];
  if (typeof corpo !== 'object' || corpo === null) return [];
  return Object.entries(corpo as Record<string, unknown>).flatMap(([chave, valor]) =>
    uuidsEmRespostaPublica(valor, prefixo === '' ? chave : `${prefixo}.${chave}`),
  );
}
