import type { Esquemas } from '../api/cliente.ts';
import { descricaoAceitavel, precisaDeDescricao, type ImagemDaGaleria } from '../componentes/Galeria.tsx';
import {
  centavosParaCampo,
  hojeCivil,
  MAXIMO_DE_TAGS,
  precoEmCentavos,
  type Especie,
} from './dominio.ts';

export interface ValoresDoProduto {
  titulo: string;
  resumo: string;
  /** O CODIGO da categoria, ou `''` enquanto nada foi escolhido. */
  categoria: string;
  /** `''` e "sem subcategoria", que e estado valido: o campo e opcional. */
  subcategoria: string;
  especies: Especie[];
  tags: string[];
  imagens: ImagemDaGaleria[];
  parceiro: string;
  link: string;
  preco: string;
  consultadoEm: string;
}

export const VALORES_VAZIOS: ValoresDoProduto = {
  titulo: '',
  resumo: '',
  categoria: '',
  subcategoria: '',
  especies: [],
  tags: [],
  imagens: [],
  parceiro: '',
  link: '',
  preco: '',
  consultadoEm: '',
};

export type CampoDoProduto =
  | 'f-nome'
  | 'f-desc'
  | 'f-categoria'
  | 'f-subcategoria'
  | 'f-especies'
  | 'f-tags'
  | 'imagens'
  | 'f-parceiro'
  | 'f-link'
  | 'f-preco'
  | 'f-data';

export const ROTULO_DO_CAMPO: Record<CampoDoProduto, string> = {
  'f-nome': 'Nome',
  'f-desc': 'Descrição',
  'f-categoria': 'Categoria',
  'f-subcategoria': 'Subcategoria',
  'f-especies': 'Para quais animais',
  'f-tags': 'Tags',
  imagens: 'Imagens do produto',
  'f-parceiro': 'Parceiro',
  'f-link': 'Link do produto no parceiro',
  'f-preco': 'Preço (R$)',
  'f-data': 'Consultado em',
};

/** A ordem dos campos na tela, que e a ordem do resumo de erros. */
export const ORDEM_DOS_CAMPOS: CampoDoProduto[] = [
  'f-nome',
  'f-desc',
  'f-categoria',
  'f-subcategoria',
  'f-especies',
  'f-tags',
  'imagens',
  'f-parceiro',
  'f-link',
  'f-preco',
  'f-data',
];

export type ErrosDoProduto = Partial<Record<CampoDoProduto, string>>;

const MENSAGEM_DO_PRECO = 'Informe o preço em reais, por exemplo 89,90.';

/** O teto da "Descricao" do produto. */
export const TETO_DA_DESCRICAO = 3000;

export function hostDoLink(link: string): string | undefined {
  try {
    return new URL(link).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * O link e do parceiro: o host dele, ou um SUBDOMINIO dele (`host_mismatch` no
 * servidor).
 */
export function linkEDoParceiro(link: string, hostDoParceiro: string): boolean {
  const host = hostDoLink(link);
  if (!host) return false;
  const alvo = hostDoParceiro.toLowerCase();
  return host === alvo || host.endsWith(`.${alvo}`);
}

/** As DUAS REGUAS do formulario (pedido do cliente de 17/10/2026). */
export type ReguaDoProduto = 'rascunho' | 'publicacao';

export function validarProduto(
  v: ValoresDoProduto,
  contexto: { hostDoParceiro?: string | undefined; hoje?: string },
  regua: ReguaDoProduto = 'publicacao',
): ErrosDoProduto {
  const e: ErrosDoProduto = {};
  if (v.titulo.trim().length < 2) e['f-nome'] = 'Informe o nome do produto.';

  if (regua === 'publicacao') {
    if (v.resumo.trim().length < 2) e['f-desc'] = 'Escreva uma descrição.';
    if (v.categoria === '') e['f-categoria'] = 'Escolha a categoria.';
    if (v.especies.length === 0) e['f-especies'] = 'Marque pelo menos um animal.';
    if (v.parceiro === '') e['f-parceiro'] = 'Informe o parceiro ou a loja.';
  } else {
    if (v.resumo.trim() !== '' && v.resumo.trim().length < 2) e['f-desc'] = 'Escreva ao menos duas letras, ou deixe vazio.';
  }
  if (v.categoria === '' && v.subcategoria !== '') {
    e['f-subcategoria'] = 'Escolha a categoria antes da subcategoria.';
  }
  if (v.tags.length > MAXIMO_DE_TAGS) e['f-tags'] = `Escolha até ${MAXIMO_DE_TAGS} tags.`;

  const link = v.link.trim();
  if (link === '') {
    if (regua === 'publicacao') e['f-link'] = 'O link precisa começar com https://.';
  } else if (!/^https:\/\/[^\s/]+/i.test(link) || !hostDoLink(link)) {
    e['f-link'] = 'O link precisa começar com https://.';
  } else if (v.parceiro === '') {
    e['f-link'] = 'Escolha o parceiro antes de informar o link.';
  } else if (contexto.hostDoParceiro && !linkEDoParceiro(link, contexto.hostDoParceiro)) {
    e['f-link'] = mensagemDoHost(contexto.hostDoParceiro);
  }

  const temPreco = v.preco.trim() !== '';
  const temData = v.consultadoEm.trim() !== '';
  if (temPreco && precoEmCentavos(v.preco) === undefined) e['f-preco'] = MENSAGEM_DO_PRECO;
  if (!temPreco && temData) e['f-preco'] = MENSAGEM_DO_PRECO;
  if (temPreco && !temData) e['f-data'] = 'Com preço, informe também a data da consulta.';
  if (temData && v.consultadoEm > (contexto.hoje ?? hojeCivil())) e['f-data'] = 'A data da consulta não pode ser depois de hoje.';

  if (v.imagens.some((im) => im.estado === 'erro')) e.imagens = 'A imagem não foi enviada.';
  else if (v.imagens.some((im) => im.estado === 'enviando')) e.imagens = 'Espere o envio das imagens terminar.';
  else if (v.imagens.some((im) => precisaDeDescricao(im) && !descricaoAceitavel(im.alt, false)))
    e.imagens = 'Escreva ao menos duas letras na descrição da imagem, ou deixe o campo vazio.';
  return e;
}

/** O que falta para publicar, na ordem dos campos da tela. */
export function faltaParaPublicar(v: ValoresDoProduto): string[] {
  const faltas: string[] = [];
  if (v.titulo.trim().length < 2) faltas.push(ROTULO_DO_CAMPO['f-nome']);
  if (v.resumo.trim().length < 2) faltas.push(ROTULO_DO_CAMPO['f-desc']);
  if (v.categoria === '') faltas.push(ROTULO_DO_CAMPO['f-categoria']);
  if (v.especies.length === 0) faltas.push(ROTULO_DO_CAMPO['f-especies']);
  if (v.parceiro === '') faltas.push(ROTULO_DO_CAMPO['f-parceiro']);
  if (v.link.trim() === '') faltas.push(ROTULO_DO_CAMPO['f-link']);
  return faltas;
}

/** A frase do que falta, em portugues: "Falta a Descrição." / "Faltam X e Y." */
export function fraseDaFalta(faltas: readonly string[]): string | null {
  if (faltas.length === 0) return null;
  const nomes = faltas.map((f) => f.toLowerCase());
  if (nomes.length === 1) return `Para publicar, falta preencher: ${nomes[0]}.`;
  const ultimo = nomes[nomes.length - 1];
  return `Para publicar, falta preencher: ${nomes.slice(0, -1).join(', ')} e ${ultimo}.`;
}

function preco(v: ValoresDoProduto): Esquemas['AdminPriceInput'] | undefined {
  const amount = precoEmCentavos(v.preco);
  if (amount === undefined || v.consultadoEm === '') return undefined;
  return { amount, currency: 'BRL', checked_at: v.consultadoEm };
}

function imagensDoCorpo(v: ValoresDoProduto): Esquemas['StoreCatalogImageInput'][] {
  return v.imagens
    .filter((im): im is ImagemDaGaleria & { uploadId: string } => typeof im.uploadId === 'string')
    .map((im) => {
      const alt = im.alt.trim();
      return { upload_id: im.uploadId, ...(alt === '' ? {} : { alt_text: alt }) };
    });
}

/** `createAdminStoreItem`. Sem `slug`: o servidor deriva do titulo (BO-5). */
export function corpoDeCriacao(v: ValoresDoProduto): Esquemas['AdminStoreItemInput'] {
  const p = preco(v);
  const link = v.link.trim();
  const resumo = v.resumo.trim();
  return {
    title: v.titulo.trim(),
    ...(v.parceiro === '' ? {} : { partner_slug: v.parceiro }),
    ...(resumo === '' ? {} : { summary: resumo }),
    ...(v.categoria === '' ? {} : { category: v.categoria }),
    ...(v.categoria === '' || v.subcategoria === '' ? {} : { subcategory: v.subcategoria }),
    ...(v.especies.length === 0 ? {} : { species: v.especies }),
    tag_slugs: v.tags,
    ...(link === '' || v.parceiro === '' ? {} : { target_url: link }),
    images: imagensDoCorpo(v),
    sort_order: 0,
    ...(p ? { price: p } : {}),
  };
}

/**
 * A imagem que a galeria nao consegue reenviar (`upload_id` nulo): sai do item se
 * a galeria mudar.
 */
export function semEnvio(im: ImagemDaGaleria): boolean {
  return im.uploadId === undefined && (im.estado === 'ready' || im.estado === 'processing' || im.estado === 'enviada');
}

export const MARCA_SEM_ENVIO = 'Sai se a galeria mudar';

/**
 * O alerta abaixo da galeria (a mesma regra da Rede, UX 30.7 R1), com a posicao
 * quando for uma imagem so.
 */
export function avisoDeImagensSemEnvio(v: Pick<ValoresDoProduto, 'imagens'>): string | null {
  const posicoes = v.imagens.flatMap((im, i) => (semEnvio(im) ? [i + 1] : []));
  if (posicoes.length === 0) return null;
  if (posicoes.length === 1) {
    return `A imagem ${String(posicoes[0])} veio de uma conta que não existe mais. Ela fica no produto enquanto você não mexer na galeria; qualquer mudança nas imagens, até numa descrição, a tira do produto. Para mudar a galeria sem perdê-la, envie o mesmo arquivo de novo.`;
  }
  return `${String(posicoes.length)} imagens vieram de uma conta que não existe mais. Elas ficam no produto enquanto você não mexer na galeria; qualquer mudança nas imagens, até numa descrição, as tira do produto. Para mudar a galeria sem perdê-las, envie os mesmos arquivos de novo.`;
}

const assinaturaDaGaleria = (v: Pick<ValoresDoProduto, 'imagens'>) => JSON.stringify(v.imagens.map((im) => [im.chave, im.alt.trim()]));

/**
 * `updateAdminStoreItem`. Manda o formulario inteiro: `species` e `tag_slugs`
 * substituem o conjunto, e `price: null` tira o preco.
 */
export function corpoDeAlteracao(v: ValoresDoProduto, base?: Pick<ValoresDoProduto, 'imagens'>): Esquemas['AdminStoreItemPatch'] {
  const galeriaMudou = !base || assinaturaDaGaleria(v) !== assinaturaDaGaleria(base);
  const link = v.link.trim();
  const resumo = v.resumo.trim();
  const semParceiro = v.parceiro === '';
  return {
    partner_slug: semParceiro ? null : v.parceiro,
    title: v.titulo.trim(),
    summary: resumo === '' ? null : resumo,
    category: v.categoria === '' ? null : v.categoria,
    subcategory: v.categoria === '' || v.subcategoria === '' ? null : v.subcategoria,
    species: v.especies,
    tag_slugs: v.tags,
    target_url: link === '' || semParceiro ? null : link,
    ...(galeriaMudou ? { images: imagensDoCorpo(v) } : {}),
    price: preco(v) ?? null,
  };
}

/** O item do servidor como valores do formulario. */
export function valoresDoItem(item: Esquemas['AdminStoreItem']): ValoresDoProduto {
  return {
    titulo: item.title,
    resumo: item.summary ?? '',
    categoria: item.category ?? '',
    subcategoria: item.subcategory ?? '',
    especies: [...item.species],
    tags: item.tags.map((t) => t.slug),
    imagens: [...item.images]
      .sort((a, b) => a.position - b.position)
      .map((im) => ({
        chave: im.upload_id ?? `sem-envio-${String(im.position)}`,
        ...(im.upload_id === null ? {} : { uploadId: im.upload_id }),
        alt: im.alt_text ?? '',
        estado: im.status,
        motivo: im.rejection_reason ?? null,
        previa: im.url ?? null,
      })),
    parceiro: item.partner?.slug ?? '',
    link: item.target_url ?? '',
    preco: item.price ? centavosParaCampo(item.price.amount) : '',
    consultadoEm: item.price ? item.price.checked_at : '',
  };
}

const CAMPO_DO_SERVIDOR: [RegExp, CampoDoProduto][] = [
  [/^title$/, 'f-nome'],
  [/^summary$/, 'f-desc'],
  [/^category$/, 'f-categoria'],
  [/^subcategory$/, 'f-subcategoria'],
  [/^species/, 'f-especies'],
  [/^tag_slugs/, 'f-tags'],
  [/^images/, 'imagens'],
  [/^partner_slug$/, 'f-parceiro'],
  [/^target_url$/, 'f-link'],
  [/^price\.checked_at$/, 'f-data'],
  [/^price/, 'f-preco'],
];

/** UX 30.4 L1: com o site do parceiro carregado, a frase o mostra entre parenteses. */
export function mensagemDoHost(host: string | undefined): string {
  return host
    ? `O link precisa ser do site do parceiro escolhido (${host}) ou de um subdomínio dele, como www.${host}.`
    : 'O link precisa ser do site do parceiro escolhido, ou de um subdomínio dele.';
}

export interface ContextoDoServidor {
  hostDoParceiro?: string | undefined;
  /** O `tag_slugs` enviado, na ordem: o erro do servidor aponta o indice. */
  tagsEnviadas?: string[];
  rotuloDaTag?: (slug: string) => string | undefined;
}

export interface RecusaDoServidor {
  erros: ErrosDoProduto;
  /** UX 30.4 L3 e L4: as tags recusadas, para o chip aparecer marcado com o erro. */
  tagsRecusadas: string[];
}

const MENSAGEM_PADRAO: Record<CampoDoProduto, string> = {
  'f-nome': 'Informe o nome do produto.',
  'f-desc': 'Escreva uma descrição.',
  'f-categoria': 'Escolha a categoria.',
  'f-subcategoria': 'Escolha uma subcategoria da categoria selecionada.',
  'f-especies': 'Marque pelo menos um animal.',
  'f-tags': 'Confira as tags escolhidas.',
  imagens: 'A imagem não foi enviada.',
  'f-parceiro': 'Informe o parceiro ou a loja.',
  'f-link': 'O link precisa começar com https://.',
  'f-preco': MENSAGEM_DO_PRECO,
  'f-data': 'A data da consulta não pode ser depois de hoje.',
};

/** `errors[]` de `validation-failed` -> erros dos campos da tela. */
export function errosDoServidor(erros: { field: string; code: string }[], contexto: ContextoDoServidor = {}): RecusaDoServidor {
  const e: ErrosDoProduto = {};
  const tagsRecusadas: string[] = [];
  for (const erro of erros) {
    const campo = CAMPO_DO_SERVIDOR.find(([padrao]) => padrao.test(erro.field))?.[1];
    if (!campo) continue;
    if (erro.code === 'unknown_tag' || erro.code === 'inactive_tag') {
      const indice = /\[(\d+)\]/.exec(erro.field)?.[1];
      const slug = indice !== undefined ? contexto.tagsEnviadas?.[Number(indice)] : undefined;
      if (slug) tagsRecusadas.push(slug);
    }
    if (e[campo]) continue;
    e[campo] = mensagemDoCodigo(erro, campo, contexto);
  }
  return { erros: e, tagsRecusadas };
}

const MENSAGEM_DO_LINK: Record<string, string> = {
  url_not_https: 'O link precisa começar com https://.',
  url_has_credentials: 'Tire o usuário e a senha do endereço antes de salvar.',
  url_ip_literal: 'O link aponta para um número de IP. Use o endereço com o nome do site.',
  url_too_long: 'O link é longo demais. Use o endereço direto do produto.',
  invalid_url: 'Esse texto não é um endereço de site.',
};

function mensagemDoCodigo(erro: { field: string; code: string }, campo: CampoDoProduto, contexto: ContextoDoServidor): string {
  if (erro.code === 'host_mismatch') return mensagemDoHost(contexto.hostDoParceiro);
  if (campo === 'f-link') {
    const doLink = MENSAGEM_DO_LINK[erro.code];
    if (doLink !== undefined) return doLink;
  }
  if (erro.code === 'unknown_tag')
    return 'Uma das tags mudou de nome desde que você abriu este formulário. Desmarque a tag indicada, escolha de novo e salve.';
  if (erro.code === 'inactive_tag') {
    const indice = /\[(\d+)\]/.exec(erro.field)?.[1];
    const slug = indice !== undefined ? contexto.tagsEnviadas?.[Number(indice)] : undefined;
    const nome = slug ? (contexto.rotuloDaTag?.(slug) ?? slug) : undefined;
    return nome ? `A tag “${nome}” foi desativada. Desmarque-a para salvar, ou reative-a em Tags.` : 'Uma das tags escolhidas foi desativada. Veja em Tags qual é, e desmarque-a ou reative-a para salvar.';
  }
  return MENSAGEM_PADRAO[campo];
}
