/**
 * A regra do formulario de produto, fora do componente (conveniencia de UX: a
 * autoridade e o servidor). Valida, monta o corpo do contrato e traduz o
 * `validation-failed` do servidor para os campos da tela.
 */
import type { Esquemas } from '../api/cliente.ts';
import { descricaoValida, precisaDeDescricao, type ImagemDaGaleria } from '../componentes/Galeria.tsx';
import { centavosParaCampo, hojeCivil, MAXIMO_DE_TAGS, precoEmCentavos, type Categoria, type Especie } from './dominio.ts';

export interface ValoresDoProduto {
  titulo: string;
  resumo: string;
  categoria: Categoria | '';
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

export function hostDoLink(link: string): string | undefined {
  try {
    return new URL(link).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/** O link termina no host do parceiro (`host_mismatch` no servidor). */
export function linkEDoParceiro(link: string, hostDoParceiro: string): boolean {
  const host = hostDoLink(link);
  if (!host) return false;
  const alvo = hostDoParceiro.toLowerCase();
  return host === alvo || host.endsWith(`.${alvo}`);
}

export function validarProduto(
  v: ValoresDoProduto,
  contexto: { hostDoParceiro?: string | undefined; hoje?: string },
): ErrosDoProduto {
  const e: ErrosDoProduto = {};
  if (v.titulo.trim().length < 2) e['f-nome'] = 'Informe o nome do produto.';
  if (v.resumo.trim().length < 2) e['f-desc'] = 'Escreva uma descrição.';
  if (v.categoria === '') e['f-categoria'] = 'Escolha a categoria.';
  if (v.especies.length === 0) e['f-especies'] = 'Marque pelo menos um animal.';
  if (v.tags.length > MAXIMO_DE_TAGS) e['f-tags'] = `Escolha até ${MAXIMO_DE_TAGS} tags.`;
  if (v.parceiro === '') e['f-parceiro'] = 'Informe o parceiro ou a loja.';

  const link = v.link.trim();
  if (!/^https:\/\/[^\s/]+/i.test(link) || !hostDoLink(link)) e['f-link'] = 'O link precisa começar com https://.';
  else if (contexto.hostDoParceiro && !linkEDoParceiro(link, contexto.hostDoParceiro))
    e['f-link'] = mensagemDoHost(contexto.hostDoParceiro);

  const temPreco = v.preco.trim() !== '';
  const temData = v.consultadoEm.trim() !== '';
  if (temPreco && precoEmCentavos(v.preco) === undefined) e['f-preco'] = MENSAGEM_DO_PRECO;
  if (!temPreco && temData) e['f-preco'] = MENSAGEM_DO_PRECO;
  if (temPreco && !temData) e['f-data'] = 'Com preço, informe também a data da consulta.';
  if (temData && v.consultadoEm > (contexto.hoje ?? hojeCivil())) e['f-data'] = 'A data da consulta não pode ser depois de hoje.';

  if (v.imagens.some((im) => im.estado === 'erro')) e.imagens = 'A imagem não foi enviada.';
  else if (v.imagens.some((im) => im.estado === 'enviando')) e.imagens = 'Espere o envio das imagens terminar.';
  else if (v.imagens.some((im) => precisaDeDescricao(im) && !descricaoValida(im.alt))) e.imagens = 'Descreva a imagem.';
  return e;
}

function preco(v: ValoresDoProduto): Esquemas['AdminPriceInput'] | undefined {
  const amount = precoEmCentavos(v.preco);
  if (amount === undefined || v.consultadoEm === '') return undefined;
  return { amount, currency: 'BRL', checked_at: v.consultadoEm };
}

function imagensDoCorpo(v: ValoresDoProduto): Esquemas['CatalogImageInput'][] {
  return v.imagens
    .filter((im): im is ImagemDaGaleria & { uploadId: string } => typeof im.uploadId === 'string')
    .map((im) => ({ upload_id: im.uploadId, alt_text: im.alt.trim() }));
}

/** `createAdminStoreItem`. Sem `slug`: o servidor deriva do titulo (BO-5). */
export function corpoDeCriacao(v: ValoresDoProduto): Esquemas['AdminStoreItemInput'] {
  const p = preco(v);
  return {
    partner_slug: v.parceiro,
    title: v.titulo.trim(),
    summary: v.resumo.trim(),
    category: v.categoria as Categoria,
    species: v.especies,
    tag_slugs: v.tags,
    target_url: v.link.trim(),
    images: imagensDoCorpo(v),
    // A ordem de curadoria nao e editavel em tela (matriz, `contrato_sem_tela`): o padrao do contrato.
    sort_order: 0,
    ...(p ? { price: p } : {}),
  };
}

/**
 * `updateAdminStoreItem`. Manda o formulario inteiro: `species`, `tag_slugs` e
 * `images` substituem o conjunto, e `price: null` tira o preco.
 */
export function corpoDeAlteracao(v: ValoresDoProduto): Esquemas['AdminStoreItemPatch'] {
  return {
    partner_slug: v.parceiro,
    title: v.titulo.trim(),
    summary: v.resumo.trim(),
    category: v.categoria as Categoria,
    species: v.especies,
    tag_slugs: v.tags,
    target_url: v.link.trim(),
    images: imagensDoCorpo(v),
    price: preco(v) ?? null,
  };
}

/** O item do servidor como valores do formulario. */
export function valoresDoItem(item: Esquemas['AdminStoreItem']): ValoresDoProduto {
  return {
    titulo: item.title,
    resumo: item.summary,
    categoria: item.category,
    especies: [...item.species],
    tags: item.tags.map((t) => t.slug),
    imagens: [...item.images]
      .sort((a, b) => a.position - b.position)
      // `upload_id` e anulavel no contrato desde a Rede (a intencao de envio
      // pode ter sido apagada, e a imagem fica): a chave cai para a posicao,
      // como em `rede/dominio/formulario.ts`. Sem `uploadId`, a imagem nao
      // volta no corpo da escrita. O tratamento visivel desse caso na Loja
      // (a marca "sem envio" que a Rede tem) fica para a tela.
      .map((im) => ({
        chave: im.upload_id ?? `sem-envio-${String(im.position)}`,
        ...(im.upload_id === null ? {} : { uploadId: im.upload_id }),
        alt: im.alt_text,
        estado: im.status,
        motivo: im.rejection_reason ?? null,
        previa: im.url ?? null,
      })),
    parceiro: item.partner.slug,
    link: item.target_url,
    preco: item.price ? centavosParaCampo(item.price.amount) : '',
    consultadoEm: item.price ? item.price.checked_at : '',
  };
}

const CAMPO_DO_SERVIDOR: [RegExp, CampoDoProduto][] = [
  [/^title$/, 'f-nome'],
  [/^summary$/, 'f-desc'],
  [/^category$/, 'f-categoria'],
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
  return host ? `O link precisa ser do site do parceiro escolhido (${host}).` : 'O link precisa ser do site do parceiro escolhido.';
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
  'f-especies': 'Marque pelo menos um animal.',
  'f-tags': 'Confira as tags escolhidas.',
  imagens: 'A imagem não foi enviada.',
  'f-parceiro': 'Informe o parceiro ou a loja.',
  'f-link': 'O link precisa começar com https://.',
  'f-preco': MENSAGEM_DO_PRECO,
  'f-data': 'A data da consulta não pode ser depois de hoje.',
};

/** `errors[]` de `validation-failed` -> erros dos campos da tela. O texto e da tela, nunca do servidor. */
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

function mensagemDoCodigo(erro: { field: string; code: string }, campo: CampoDoProduto, contexto: ContextoDoServidor): string {
  if (erro.code === 'host_mismatch') return mensagemDoHost(contexto.hostDoParceiro);
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
