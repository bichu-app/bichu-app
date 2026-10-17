/**
 * A regra do formulario de produto, fora do componente (conveniencia de UX: a
 * autoridade e o servidor). Valida, monta o corpo do contrato e traduz o
 * `validation-failed` do servidor para os campos da tela.
 */
import type { Esquemas } from '../api/cliente.ts';
import { descricaoAceitavel, precisaDeDescricao, type ImagemDaGaleria } from '../componentes/Galeria.tsx';
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

/**
 * O teto da "Descricao" do produto. **3000 desde 17/10/2026** (decisao do
 * cliente), e o MESMO numero do `maxLength` do contrato e do `CHECK` do banco.
 * O `maxLength` do campo da tela ja impede passar disso; isto aqui existe para
 * a tela nao carregar o numero solto em dois lugares.
 */
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
 *
 * **A comparacao e por sufixo COM FRONTEIRA DE ROTULO, e o ponto na
 * concatenacao e a regra inteira.** `'malcobasi.com.br'` termina em
 * `'cobasi.com.br'` e **nao** termina em `'.cobasi.com.br'`: sem o ponto, esta
 * funcao aprovaria qualquer dominio registrado terminando com o nome do
 * parceiro. E a mesma regra de `ehDoParceiro` no servidor, escrita do mesmo
 * jeito de proposito -- as duas divergirem faria o painel aceitar o que o
 * servidor recusa, que e o defeito que acabou de custar o tempo do cliente.
 */
export function linkEDoParceiro(link: string, hostDoParceiro: string): boolean {
  const host = hostDoLink(link);
  if (!host) return false;
  const alvo = hostDoParceiro.toLowerCase();
  return host === alvo || host.endsWith(`.${alvo}`);
}

/**
 * As DUAS REGUAS do formulario (pedido do cliente de 17/10/2026).
 *
 * - `rascunho`: so o nome. Rascunho existe para guardar trabalho incompleto
 *   enquanto a pessoa busca o que falta, e cobrar o conjunto nele era o defeito
 *   que o cliente bateu ("se é rascunho, não deveria ser obrigatório né").
 * - `publicacao`: o conjunto inteiro, que e a mesma regua do servidor em
 *   `publishAdminStoreItem`.
 *
 * O que vale nas DUAS: a forma do que a pessoa JA escreveu. Preco sem data,
 * data no futuro, link que nao e do parceiro e imagem que falhou sao erro de
 * digitacao, nao rascunho -- e gravar um deles perderia o trabalho em vez de
 * guarda-lo.
 */
export type ReguaDoProduto = 'rascunho' | 'publicacao';

export function validarProduto(
  v: ValoresDoProduto,
  contexto: { hostDoParceiro?: string | undefined; hoje?: string },
  regua: ReguaDoProduto = 'publicacao',
): ErrosDoProduto {
  const e: ErrosDoProduto = {};
  // O MINIMO DO RASCUNHO, e e so ele: sem nome nao ha o que reencontrar na
  // lista depois.
  if (v.titulo.trim().length < 2) e['f-nome'] = 'Informe o nome do produto.';

  if (regua === 'publicacao') {
    if (v.resumo.trim().length < 2) e['f-desc'] = 'Escreva uma descrição.';
    if (v.categoria === '') e['f-categoria'] = 'Escolha a categoria.';
    if (v.especies.length === 0) e['f-especies'] = 'Marque pelo menos um animal.';
    if (v.parceiro === '') e['f-parceiro'] = 'Informe o parceiro ou a loja.';
  } else {
    // No rascunho a descricao pode estar vazia, mas uma letra so continua
    // sendo recusada pelo contrato (`minLength: 2`): a tela diz isso em vez de
    // deixar o 400 chegar sem endereco.
    if (v.resumo.trim() !== '' && v.resumo.trim().length < 2) e['f-desc'] = 'Escreva ao menos duas letras, ou deixe vazio.';
  }
  if (v.tags.length > MAXIMO_DE_TAGS) e['f-tags'] = `Escolha até ${MAXIMO_DE_TAGS} tags.`;

  const link = v.link.trim();
  // Link vazio: cobrado so na publicacao. Link ESCRITO: conferido sempre, nas
  // duas reguas.
  if (link === '') {
    if (regua === 'publicacao') e['f-link'] = 'O link precisa começar com https://.';
  } else if (!/^https:\/\/[^\s/]+/i.test(link) || !hostDoLink(link)) {
    e['f-link'] = 'O link precisa começar com https://.';
  } else if (v.parceiro === '') {
    // O servidor recusa destino sem parceiro (`code: partner_required`): o banco
    // guarda so o caminho e compoe o endereco com o host do parceiro.
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
  // `false`: a descricao da imagem e OPCIONAL na Loja desde 17/10/2026. O que
  // sobra e a descricao escrita errada (uma letra), que o contrato recusa.
  else if (v.imagens.some((im) => precisaDeDescricao(im) && !descricaoAceitavel(im.alt, false)))
    e.imagens = 'Escreva ao menos duas letras na descrição da imagem, ou deixe o campo vazio.';
  return e;
}

/**
 * O que falta para publicar, na ordem dos campos da tela. E a MESMA pergunta
 * que `missing_to_publish` do servidor responde; aqui ela vale sobre o que esta
 * na tela AGORA, para o botao de publicar poder dizer o que falta em vez de so
 * ficar morto.
 */
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

/**
 * A galeria como o corpo a manda: **a ordem da lista E a ordem das imagens**, e
 * a primeira e a capa. O servidor grava `position` pelo indice
 * (`aplicarEspecieTagsEImagens`), entao nao ha campo de posicao nem sinalizador
 * de capa a mandar -- escolher a capa e por a imagem em primeiro lugar.
 *
 * `alt_text` e OMITIDO quando esta vazio, e nao mandado como `""`: o contrato
 * pede 2 a 150 caracteres quando o campo vem (`minLength`), e ausente e o unico
 * jeito de dizer "nao escrevi".
 */
function imagensDoCorpo(v: ValoresDoProduto): Esquemas['StoreCatalogImageInput'][] {
  return v.imagens
    .filter((im): im is ImagemDaGaleria & { uploadId: string } => typeof im.uploadId === 'string')
    .map((im) => {
      const alt = im.alt.trim();
      return { upload_id: im.uploadId, ...(alt === '' ? {} : { alt_text: alt }) };
    });
}

/**
 * `createAdminStoreItem`. Sem `slug`: o servidor deriva do titulo (BO-5).
 *
 * **O item nasce rascunho, e desde 17/10/2026 o rascunho aceita campo em
 * branco**: o que esta vazio e OMITIDO do corpo, porque o contrato agora pede
 * so `title`. Mandar `""` seria recusado por `minLength`, e mandar `null` nao
 * cabe na criacao (`null` e o idioma de LIMPAR, que e do `PATCH`).
 */
export function corpoDeCriacao(v: ValoresDoProduto): Esquemas['AdminStoreItemInput'] {
  const p = preco(v);
  const link = v.link.trim();
  const resumo = v.resumo.trim();
  return {
    title: v.titulo.trim(),
    ...(v.parceiro === '' ? {} : { partner_slug: v.parceiro }),
    ...(resumo === '' ? {} : { summary: resumo }),
    ...(v.categoria === '' ? {} : { category: v.categoria }),
    ...(v.especies.length === 0 ? {} : { species: v.especies }),
    tag_slugs: v.tags,
    // Destino sem parceiro o servidor recusa (`partner_required`): sem host nao
    // ha contra o que conferir o link. A tela ja barra isso em `validarProduto`.
    ...(link === '' || v.parceiro === '' ? {} : { target_url: link }),
    images: imagensDoCorpo(v),
    // A ordem de curadoria nao e editavel em tela (matriz, `contrato_sem_tela`): o padrao do contrato.
    sort_order: 0,
    ...(p ? { price: p } : {}),
  };
}

/** A imagem que a galeria nao consegue reenviar (`upload_id` nulo): sai do item se a galeria mudar. */
export function semEnvio(im: ImagemDaGaleria): boolean {
  return im.uploadId === undefined && (im.estado === 'ready' || im.estado === 'processing' || im.estado === 'enviada');
}

export const MARCA_SEM_ENVIO = 'Sai se a galeria mudar';

/** O alerta abaixo da galeria (a mesma regra da Rede, UX 30.7 R1), com a posicao quando for uma imagem so. */
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
 * substituem o conjunto, e `price: null` tira o preco. `images` so vai quando a
 * galeria mudou em relacao a `base`: a imagem com `upload_id` nulo nao pode ir
 * no corpo, e mandar a galeria sem ela a tiraria do item numa edicao de titulo.
 */
export function corpoDeAlteracao(v: ValoresDoProduto, base?: Pick<ValoresDoProduto, 'imagens'>): Esquemas['AdminStoreItemPatch'] {
  const galeriaMudou = !base || assinaturaDaGaleria(v) !== assinaturaDaGaleria(base);
  const link = v.link.trim();
  const resumo = v.resumo.trim();
  // `null` LIMPA, no mesmo idioma de `price`: campo que a pessoa esvaziou no
  // rascunho tem de ficar vazio no servidor, e nao voltar ao valor antigo na
  // proxima leitura. Tirar o parceiro tira o destino junto (o servidor faz o
  // mesmo: o caminho sem host nao tem endereco).
  const semParceiro = v.parceiro === '';
  return {
    partner_slug: semParceiro ? null : v.parceiro,
    title: v.titulo.trim(),
    summary: resumo === '' ? null : resumo,
    category: v.categoria === '' ? null : v.categoria,
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
    // Os quatro nulos do rascunho viram campo vazio na tela: o formulario fala
    // em `''`, o contrato em `null`, e a traducao mora aqui e so aqui.
    resumo: item.summary ?? '',
    categoria: item.category ?? '',
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
        // `alt_text` e anulavel desde que a descricao virou opcional
        // (17/10/2026): na tela o campo vazio e a mesma coisa.
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

/**
 * O texto de cada recusa do servidor no campo do link.
 *
 * **Existe porque a ausencia dele bloqueou o cliente.** Todas as recusas do
 * destino chegavam como `invalid_url`, caiam em `MENSAGEM_PADRAO['f-link']` e a
 * tela dizia "O link precisa comecar com https://" -- inclusive para um link
 * que comecava com `https://` e so tinha `?idsku=` no fim. Ele leu a frase,
 * acreditou nela, e passou a procurar o defeito no proprio link.
 *
 * Uma linha curta por motivo, e o motivo REAL. Os `code` sao os de
 * `escrita-da-vitrine.ts`; um `code` novo que apareca aqui sem entrada cai no
 * texto padrao, que e a frase generica -- entao acrescentar `code` no servidor
 * e acrescentar linha aqui, no mesmo commit.
 */
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
