import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';

import type { Esquemas } from '../api/cliente.ts';
import { errosDoProblema, tipoDoProblema, versaoComoEtag } from '../api/problema.ts';
import { Banner, CampoDeTexto, ErroDoCampo, ResumoDeErros } from '../componentes/basicos.tsx';
import { CampoDeImagem } from '../componentes/CampoDeImagem.tsx';
import { CampoDeCep, CampoDeTelefone } from '../componentes/campos.tsx';
import {
  descricaoAceitavel,
  Galeria,
  precisaDeDescricao,
  type ImagemDaGaleria,
} from '../componentes/Galeria.tsx';
import { enviarImagem, LIMITE_EM_MB, DIMENSAO_MINIMA } from '../componentes/envio-de-imagem.ts';
import { Icone } from '../componentes/Icone.tsx';
import { SairSemSalvar } from '../componentes/SairSemSalvar.tsx';
import { cepDosOitoDigitos, cepEmOitoDigitos } from '../formato/cep.ts';
import {
  LIMITE_DO_SITE,
  MENSAGEM_DO_SITE,
  mensagemDoSite,
  type CodigoDoSite,
} from '../endereco/enderecos.ts';
import { telefoneDoE164, telefoneEmE164 } from '../formato/telefone.ts';
import { useSessao } from '../sessao/ProvedorDeSessao.tsx';
import { guardarRascunho, retomarRascunho } from '../sessao/rascunho.ts';
import {
  ATIVIDADES,
  frasePendente,
  MENSAGEM_DO_SLUG,
  ORDEM_DAS_ATIVIDADES,
  ORDEM_DOS_TIPOS_DE_ENTIDADE,
  TIPOS_DE_ENTIDADE,
  PADRAO_DA_UF,
  PADRAO_DO_SLUG,
  SITUACOES,
  SITUACOES_DA_EDICAO,
  SITUACOES_DO_CADASTRO,
  slugSugerido,
  type Entrada,
  type StatusDaEntrada,
  type TipoDaEntrada,
  type TipoDeEntidadeDaEntrada,
} from './dominio.ts';

export interface Valores {
  nome: string;
  slug: string;
  slugEditado: boolean;
  /**
   * AS ATIVIDADES, de 1 a 6 (cliente, 21/10/2026): uma clinica que tambem faz
   * banho e tosa deixou de ter de escolher.
   *
   * Lista VAZIA e o estado "nao escolheu" -- o que `''` representava quando era
   * um valor so. Nao ha `| ''` aqui porque a lista vazia ja diz isso, e um
   * terceiro estado inventaria algo que o contrato nao tem.
   */
  atividades: TipoDaEntrada[];
  /**
   * O QUE a entrada e -- eixo SEPARADO de [atividade], que e o que ela faz.
   *
   * Sem `''`: o contrato tem `DEFAULT 'professional'` e toda entrada antiga
   * vale como profissional, entao nao existe estado "nao escolhido" a
   * representar. Um `''` aqui inventaria um terceiro valor que o contrato nao
   * tem e exigiria uma validacao para algo que nunca esta vazio.
   */
  tipoDeEntidade: TipoDeEntidadeDaEntrada;
  sobre: string;
  cidade: string;
  uf: string;
  bairro: string;
  /** Com mascara (`05435-000`). Os oito digitos saem de `cepEmOitoDigitos`, no `salvar`. */
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  /** Com mascara brasileira. O E.164 sai de `telefoneEmE164`, no `salvar`. */
  telefone: string;
  /**
   * O SITE do estabelecimento (cliente, 21/10/2026), **cru e nao normalizado**:
   * o endereco completo com `https://`, como a pessoa conferiu na tela.
   *
   * Sem mascara e sem reparo, ao contrario de [telefone] e [cep]: o padrao de
   * URL do produto RECUSA esquema ausente em vez de completa-lo, e acrescentar
   * `https://` aqui seria gravar uma coisa diferente da que foi digitada. Quem
   * decide a recusa e `mensagemDoSite`, que espelha o servidor.
   */
  site: string;
  /**
   * A logo e a foto guardam **o que a pessoa fez**, e nao a imagem gravada:
   *
   * - `undefined`: ela nao tocou no campo, e a imagem gravada (`entrada.logo` /
   *   `entrada.photo`) continua valendo. A chave NAO entra no `PATCH`.
   * - `null`: ela removeu a imagem gravada. O `PATCH` manda `null`, que apaga.
   * - `string`: ela escolheu outra, os bytes ja subiram, e este e o `upload_id`
   *   que a escrita confirma.
   *
   * A imagem gravada nao e copiada para ca de proposito: `Valores` e comparado
   * com a base para saber se o formulario esta sujo, e carregar nele um objeto
   * que ninguem edita faria todo rascunho parecer alterado.
   */
  logoUploadId: string | null | undefined;
  fotoUploadId: string | null | undefined;
  /**
   * A GALERIA (cliente, 29/10/2026: *"implemente a tabela de galeria entao"*).
   *
   * **Ao contrario da logo e da foto, ela GUARDA a imagem gravada**, e a
   * diferenca nao e descuido: a logo e um campo so, e "nao tocou" e
   * representavel com `undefined`; a galeria e uma LISTA que a pessoa reordena,
   * e para reordenar a tela tem de conhecer o que esta gravado. E tambem o que
   * o componente `Galeria` espera -- o mesmo que a `Loja` e a `Rede` fazem.
   *
   * Consequencia, dita em voz alta: `sujo` compara `Valores` inteiro, entao a
   * galeria gravada entra na comparacao. Ela nao faz todo formulario parecer
   * alterado porque `base` carrega exatamente a mesma lista -- e por isso que
   * `valoresDa` a monta a partir de `entrada.images` e nao de uma lista vazia.
   */
  imagens: ImagemDaGaleria[];
  situacao: StatusDaEntrada;
}

type Campo =
  | 'e-nome'
  | 'e-slug'
  | 'e-atividade'
  | 'e-tipo-entidade'
  | 'e-sobre'
  | 'e-cidade'
  | 'e-uf'
  | 'e-bairro'
  | 'e-cep'
  | 'e-logradouro'
  | 'e-numero'
  | 'e-complemento'
  | 'e-telefone'
  | 'e-site'
  | 'e-logo'
  | 'e-foto'
  | 'e-galeria';

const ROTULOS: Record<Campo, string> = {
  'e-nome': 'Nome',
  'e-slug': 'Identificador',
  'e-atividade': 'Atividade',
  'e-tipo-entidade': 'Tipo',
  'e-sobre': 'Apresentação',
  'e-cidade': 'Cidade',
  'e-uf': 'UF',
  'e-bairro': 'Bairro',
  'e-cep': 'CEP',
  'e-logradouro': 'Rua',
  'e-numero': 'Número',
  'e-complemento': 'Complemento',
  'e-telefone': 'Telefone comercial',
  'e-site': 'Site',
  'e-logo': 'Logo',
  'e-foto': 'Foto do local',
  'e-galeria': 'Galeria de fotos',
};

const ORDEM: Campo[] = [
  'e-nome',
  'e-slug',
  'e-tipo-entidade',
  'e-atividade',
  'e-sobre',
  'e-cidade',
  'e-uf',
  'e-cep',
  'e-logradouro',
  'e-numero',
  'e-complemento',
  'e-bairro',
  'e-telefone',
  'e-site',
  'e-logo',
  'e-foto',
  'e-galeria',
];

/**
 * O FORMULARIO DE CADASTRO NOVO, em branco.
 *
 * **Exportado desde 29/10/2026**, e nao por conveniencia de teste: a situacao
 * padrao daqui e uma DECISAO DO CLIENTE (*"ele ja deve salvar com o padrao
 * publicado e nao como rascunho"*), e uma decisao de produto precisa de um caso
 * que a leia DESTE objeto. Uma fixa de teste com `situacao: 'published'`
 * escrita a mao mede a si mesma: trocar o valor aqui a deixaria verde.
 */
export const VAZIO: Valores = {
  nome: '',
  slug: '',
  slugEditado: false,
  atividades: [],
  tipoDeEntidade: 'professional',
  sobre: '',
  cidade: '',
  uf: '',
  bairro: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  telefone: '',
  site: '',
  logoUploadId: undefined,
  fotoUploadId: undefined,
  imagens: [],
  // **`published` desde 29/10/2026** (cliente: *"cobrar os dados no cadastro"*,
  // sobre *"ele ja deve salvar com o padrao publicado e nao como rascunho"*).
  // Era `'draft'`, e a troca aqui e o que faz o PADRAO do formulario de
  // cadastro ser "no ar" -- o campo Situacao abre marcado em "No ar", e quem
  // quiser guardar incompleto escolhe "Rascunho" de proposito.
  situacao: 'published',
};

/**
 * A conferencia local, com as MESMAS reguas do servidor.
 *
 * Ela nao substitui a do servidor -- a do servidor e a que vale --, e existe
 * para a recusa chegar sem uma viagem a rede. Por isso cada regua aqui aponta
 * para a sua origem: tamanho de `CHECK`, formato de `slug`, E.164 de telefone.
 *
 * **CIDADE, UF E TELEFONE SAO OBRIGATORIOS QUANDO A SITUACAO E "No ar"**, e
 * isso mudou em 29/10/2026 por decisao do cliente -- verbatim: *"cobrar os
 * dados no cadastro"*, sobre *"quando cadastrar um estabelecimento no
 * backoffice, ele ja deve salvar com o padrao publicado e nao como rascunho"*.
 *
 * O texto aqui dizia o contrario, e dizia por um motivo que deixou de valer:
 * *"a entrada nasce RASCUNHO, e o rascunho guarda trabalho incompleto"*. Ela
 * nao nasce mais rascunho. Quem quer guardar incompleto escolhe "Rascunho" no
 * campo Situacao, e ai os tres voltam a nao ser cobrados -- e a regra aqui le
 * `v.situacao`, e nao "estou criando ou editando", justamente para ser a MESMA
 * frase do servidor: *quem publica precisa dos tres*.
 *
 * **Esta conferencia NAO substitui a do servidor**, e a diferenca importa
 * porque o cliente pediu portao e nao aviso: `planejarCriacao` recusa o `POST`
 * incompleto com `400` nomeando os campos, venha ele deste formulario ou de
 * qualquer outro chamador. O que esta regua faz e poupar a viagem a rede.
 *
 * **CEP, rua, numero e complemento nao sao obrigatorios NUNCA**, nem no
 * rascunho nem na publicacao, e isso nao e simetria com os de cima -- e
 * produto. Um profissional autonomo (adestrador, passeador, veterinario que
 * atende em casa) nao tem endereco comercial, e exigir o dele significaria
 * exigir a casa dele. Nenhum dos quatro entra em `missing_to_publish`, e a
 * regua do servidor concorda: no contrato eles sao opcionais nos dois corpos.
 */
/**
 * As atividades mudaram?
 *
 * Compara CONJUNTO, por lista ordenada: a escolha do operador nao tem ordem, e
 * `['vet','clinic']` e `['clinic','vet']` sao a mesma coisa. Sem isto, abrir a
 * tela e salvar sem tocar em nada mandaria `kinds` no `PATCH` -- e, com
 * `minProperties: 1`, "nada mudou" deixaria de ser detectavel.
 */
export function atividadesMudaram(
  daTela: readonly TipoDaEntrada[],
  doServidor: readonly TipoDaEntrada[],
): boolean {
  if (daTela.length !== doServidor.length) return true;
  const a = [...daTela].sort();
  const b = [...doServidor].sort();
  return a.some((x, i) => x !== b[i]);
}

export function validarEntrada(v: Valores): Partial<Record<Campo, string>> {
  const e: Partial<Record<Campo, string>> = {};
  const nome = v.nome.trim();
  if (nome.length < 2 || nome.length > 120) {
    e['e-nome'] = 'Informe o nome, de 2 a 120 caracteres.';
  }
  if (!PADRAO_DO_SLUG.test(v.slug)) e['e-slug'] = MENSAGEM_DO_SLUG;
  // DE 1 A DEZ. O teto E o tamanho da lista fechada, e a tela nem tem como
  // passar dele -- sao dez caixas. A conferencia existe porque o rascunho
  // retomado (`retomarRascunho`) vem de fora da tela.
  //
  // **O numero sai de `ORDEM_DAS_ATIVIDADES` e nao e escrito a mao**, e a troca
  // e consequencia de um defeito medido: o teto ficou em 6 quando a lista
  // fechada foi a 8 em 28/10/2026, e ninguem viu porque eram dois numeros
  // escritos em lugares diferentes.
  if (v.atividades.length === 0) e['e-atividade'] = 'Escolha ao menos uma atividade.';
  else if (v.atividades.length > ORDEM_DAS_ATIVIDADES.length) {
    e['e-atividade'] = `Até ${String(ORDEM_DAS_ATIVIDADES.length)} atividades.`;
  }
  else if (new Set(v.atividades).size !== v.atividades.length) {
    e['e-atividade'] = 'A mesma atividade apareceu duas vezes.';
  }
  const sobre = v.sobre.trim();
  if (sobre !== '' && (sobre.length < 2 || sobre.length > 2000)) {
    e['e-sobre'] = 'Entre 2 e 2000 caracteres.';
  }
  // OS TRES DA PUBLICACAO (cliente, 29/10/2026). A regua le a SITUACAO
  // escolhida, e nao "criando ou editando": e a mesma frase do servidor.
  const cobraPublicacao = v.situacao === 'published';
  const cidade = v.cidade.trim();
  if (cobraPublicacao && cidade === '') {
    e['e-cidade'] = 'Informe a cidade: ela é cobrada para a entrada ficar no ar.';
  } else if (cidade !== '' && (cidade.length < 2 || cidade.length > 80)) {
    e['e-cidade'] = 'Entre 2 e 80 caracteres.';
  }
  const uf = v.uf.trim();
  if (cobraPublicacao && uf === '') {
    e['e-uf'] = 'Informe a UF: ela é cobrada para a entrada ficar no ar.';
  } else if (uf !== '' && !PADRAO_DA_UF.test(uf)) {
    e['e-uf'] = 'Use a sigla do estado, com duas letras.';
  }
  const bairro = v.bairro.trim();
  if (bairro !== '' && (bairro.length < 2 || bairro.length > 80)) {
    e['e-bairro'] = 'Entre 2 e 80 caracteres.';
  }
  // Os quatro do endereco: **so forma, e so no que foi digitado**. Vazio nao
  // erra em nenhum deles.
  if (v.cep.trim() !== '' && cepEmOitoDigitos(v.cep) === null) {
    e['e-cep'] = 'O CEP tem oito dígitos. Por exemplo: 05435-000.';
  }
  const logradouro = v.logradouro.trim();
  if (logradouro !== '' && (logradouro.length < 2 || logradouro.length > 120)) {
    e['e-logradouro'] = 'Entre 2 e 120 caracteres.';
  }
  if (v.numero.trim().length > 20) e['e-numero'] = 'Até 20 caracteres.';
  if (v.complemento.trim().length > 80) e['e-complemento'] = 'Até 80 caracteres.';
  if (cobraPublicacao && v.telefone.trim() === '') {
    e['e-telefone'] =
      'Informe o telefone comercial: ele é o canal cobrado para a entrada ficar no ar.';
  } else if (v.telefone.trim() !== '' && telefoneEmE164(v.telefone) === null) {
    e['e-telefone'] = 'Informe o telefone com DDD. Por exemplo: (11) 3061-2200.';
  }
  // O SITE (cliente, 21/10/2026). Vazio nao erra; o que foi digitado passa pelo
  // espelho do servidor, que devolve a frase JA PRONTA -- inclusive a que
  // distingue "falta o https://" de "troque http:// por https://". Nao ha mapa
  // de `code` aqui de proposito: `mensagemDoSite` e quem sabe desambiguar, e
  // reescrever as frases neste arquivo seria a segunda definicao que o pedido
  // do cliente proibiu. Mesmo idioma de `FormularioDeParceiro`.
  if (v.site.trim() !== '') {
    const recusa = mensagemDoSite(v.site);
    if (recusa !== null) e['e-site'] = recusa;
  }
  // A GALERIA (cliente, 29/10/2026). **A descricao e OPCIONAL**, como nas duas
  // galerias irmas: o que se recusa aqui e a descricao de UMA letra, que o
  // contrato rejeita por `minLength: 2`. Vazio quer dizer "nao escrevi" e o
  // campo e OMITIDO do corpo; `"a"` quer dizer "escrevi errado", e deixar
  // passar trocaria um erro de campo por um `400` sem endereco na tela.
  //
  // O teto de 8 NAO e conferido aqui: a propria `Galeria` desabilita o botao de
  // adicionar ao chegar em `MAXIMO_DE_IMAGENS`, e o servidor tem a rede embaixo
  // (`too_many_images`). Conferir na tela algo que a tela nao consegue produzir
  // seria uma mensagem que ninguem ve.
  if (v.imagens.some((im) => precisaDeDescricao(im) && !descricaoAceitavel(im.alt, false))) {
    e['e-galeria'] = 'Escreva pelo menos duas letras na descrição, ou deixe o campo vazio.';
  }
  return e;
}

/**
 * A GALERIA como o corpo do contrato a quer (`DirectoryGalleryImagesInput`).
 *
 * Duas regras, e as duas sao de contrato e nao de gosto:
 *
 * 1. **So entra a imagem com `upload_id`.** A que falhou, a que ainda esta
 *    subindo e a que veio de uma conta apagada (`upload_id` nulo na leitura)
 *    nao tem o que mandar -- e `images` SUBSTITUI a lista inteira, entao mandar
 *    a galeria sem ela a TIRA da entrada. E o que `semEnvioNaGaleria` avisa.
 * 2. **Descricao vazia e OMITIDA**, nunca `""`: o contrato recusa `""` por
 *    `minLength: 2`, e ausente e o jeito de dizer "nao escrevi".
 */
function imagensDoCorpo(v: Pick<Valores, 'imagens'>): Esquemas['CatalogImageInput'][] {
  return v.imagens
    .filter((im): im is ImagemDaGaleria & { uploadId: string } => typeof im.uploadId === 'string')
    .map((im) => {
      const alt = im.alt.trim();
      return { upload_id: im.uploadId, ...(alt === '' ? {} : { alt_text: alt }) };
    });
}

/**
 * A imagem que a galeria nao consegue reenviar (`upload_id` nulo na leitura).
 *
 * A MESMA regra da `Loja` e da `Rede` (UX 30.7 R1): `catalog_images
 * .upload_intent_id` e `ON DELETE SET NULL`, entao apagar a conta do painel que
 * enviou deixa a imagem na entrada e tira o identificador com que o painel a
 * reenviaria.
 */
export function semEnvioNaGaleria(im: ImagemDaGaleria): boolean {
  return (
    im.uploadId === undefined &&
    (im.estado === 'ready' || im.estado === 'processing' || im.estado === 'enviada')
  );
}

export const MARCA_SEM_ENVIO = 'Sai se a galeria mudar';

/** O alerta abaixo da galeria, com a posicao quando for uma imagem so. */
export function avisoDeImagensSemEnvio(v: Pick<Valores, 'imagens'>): string | null {
  const posicoes = v.imagens.flatMap((im, i) => (semEnvioNaGaleria(im) ? [i + 1] : []));
  if (posicoes.length === 0) return null;
  if (posicoes.length === 1) {
    return `A imagem ${String(posicoes[0])} veio de uma conta que não existe mais. Ela fica na entrada enquanto você não mexer na galeria; qualquer mudança nas imagens, até numa descrição, a tira da entrada. Para mudar a galeria sem perdê-la, envie o mesmo arquivo de novo.`;
  }
  return `${String(posicoes.length)} imagens vieram de uma conta que não existe mais. Elas ficam na entrada enquanto você não mexer na galeria; qualquer mudança nas imagens, até numa descrição, as tira da entrada. Para mudar a galeria sem perdê-las, envie os mesmos arquivos de novo.`;
}

/**
 * A assinatura da galeria, para o `PATCH` so mandar `images` quando ela mudou.
 *
 * `[chave, alt]` e nao a lista inteira: `previa` e `progresso` mudam sozinhos
 * durante o envio, e compara-los faria uma edicao de telefone reenviar a
 * galeria. A CHAVE carrega a identidade e a ORDEM, que e o que importa.
 */
const assinaturaDaGaleria = (v: Pick<Valores, 'imagens'>): string =>
  JSON.stringify(v.imagens.map((im) => [im.chave, im.alt.trim()]));

/**
 * O que vai para o rascunho da sessao: **sem arquivo e sem previa local**, que
 * nao sobrevivem a recarga, e sem a imagem que ainda nao tem `upload_id`.
 *
 * Copiado de `paraRascunho` da `Loja`, e pelo mesmo motivo medido: `File` e
 * `blob:` passam por `JSON.stringify` como `{}` e como uma URL morta, e o
 * rascunho retomado abriria com uma moldura presa em "Enviando…".
 */
export function paraRascunho(v: Valores): Valores {
  return {
    ...v,
    imagens: v.imagens
      .filter((im) => im.uploadId)
      .map(
        (im) =>
          ({
            chave: im.chave,
            uploadId: im.uploadId,
            alt: im.alt,
            estado: im.estado === 'enviada' ? 'enviada' : im.estado,
            previa: im.previa?.startsWith('blob:') ? null : (im.previa ?? null),
          }) as ImagemDaGaleria,
      ),
  };
}

/**
 * O que a chave de imagem vale no `PATCH`, ou `undefined` quando ela nao deve
 * entrar no corpo.
 *
 * Tres casos, e eles nao sao dois: envio NOVO manda o `upload_id`; REMOVER
 * manda `null`, que apaga; e campo INTOCADO nao manda nada. O quarto caso --
 * remover o que nunca existiu -- tambem nao manda nada: `null` ali seria uma
 * mudanca inventada, e com `minProperties: 1` no contrato ela faria um clique
 * que nao mudou nada virar uma escrita.
 */
function imagemParaOPatch(
  escolhido: string | null | undefined,
  gravada: Esquemas['AdminCatalogImage'] | null | undefined,
): string | null | undefined {
  if (typeof escolhido === 'string') return escolhido;
  return escolhido === null && gravada ? null : undefined;
}

function valoresDa(entrada: Entrada): Valores {
  return {
    nome: entrada.display_name,
    slug: entrada.slug,
    slugEditado: true,
    // `kinds` e a verdade; `kind` e a PRIMEIRA dela e existe no contrato so
    // para o APK em campo. O painel le a lista.
    atividades: [...entrada.kinds],
    tipoDeEntidade: entrada.entity_kind,
    sobre: entrada.about ?? '',
    cidade: entrada.city ?? '',
    uf: entrada.state ?? '',
    bairro: entrada.neighborhood ?? '',
    // O CEP gravado tem oito digitos; o campo mostra a gramatica com hifen.
    // Mesma regra do telefone, logo abaixo: exibir o que a escrita ja validou
    // nao e completar em silencio o que a pessoa digitou.
    cep: cepDosOitoDigitos(entrada.postal_code),
    logradouro: entrada.street ?? '',
    numero: entrada.street_number ?? '',
    complemento: entrada.complement ?? '',
    // O que esta gravado e E.164; o campo mostra a gramatica brasileira. Isto
    // NAO e completar em silencio o que a pessoa digitou -- e exibir o que a
    // escrita ja validou, como o formulario do parceiro faz com `https://`.
    telefone: telefoneDoE164(entrada.phone_e164),
    // O SITE sai e volta CRU: nao ha gramatica de exibicao a montar, porque o
    // que esta gravado ja e o endereco completo que a pessoa aprovou.
    site: entrada.site_url ?? '',
    // A logo e a foto GRAVADAS sao lidas de `entrada.logo` / `entrada.photo` e
    // vao direto para a previa do campo (`salva`); aqui elas nascem
    // `undefined`, que quer dizer "a pessoa nao tocou nestes campos". Guardar o
    // objeto da imagem em `Valores` tornaria toda edicao suja antes do primeiro
    // clique, e nao ha o que editar nele.
    logoUploadId: undefined,
    fotoUploadId: undefined,
    // A GALERIA e lida, ao contrario da logo e da foto: ver `Valores.imagens`.
    // Ordenada por `position` aqui tambem, e nao so no servidor -- a tela
    // reordena a lista local e nao deve depender de o `json_agg` ter mantido a
    // ordem numa resposta em cache.
    imagens: [...entrada.images]
      .sort((a, b) => a.position - b.position)
      .map((im) => ({
        // `upload_id` e anulavel no contrato (a intencao de envio pode ter sido
        // apagada e a imagem fica): a chave cai para a posicao, como na `Loja`
        // e na `Rede`. Sem `uploadId`, a imagem nao volta no corpo da escrita.
        chave: im.upload_id ?? `sem-envio-${String(im.position)}`,
        ...(im.upload_id === null ? {} : { uploadId: im.upload_id }),
        // `alt_text` e anulavel: na tela o campo vazio e a mesma coisa.
        alt: im.alt_text ?? '',
        estado: im.status,
        motivo: im.rejection_reason ?? null,
        previa: im.url ?? null,
      })),
    situacao: entrada.status,
  };
}

/**
 * A ENTRADA DUPLICADA (cliente, 28/10/2026): *"Implemente um recurso de
 * duplicar estabelecimento no backoffice"*.
 *
 * ## O QUE A COPIA LEVA: os dados de PREENCHIMENTO, e so eles
 *
 * Nome, atividades, tipo de entidade, sobre, cidade, UF, bairro, CEP,
 * logradouro, numero, complemento, telefone e site. E o trabalho de digitacao,
 * que e exatamente o que duplicar existe para poupar: a segunda unidade da
 * mesma rede repete quase tudo disso.
 *
 * ## O QUE ELA NAO LEVA, e o motivo de cada um
 *
 * - **`slug` (vazio, e `slugEditado: false`).** E a CHAVE PUBLICA, unica global
 *   sobre nao-nulo desde a `20260922000021`. Copia-lo daria `409 slug-taken` na
 *   hora de salvar, e **sugeri-lo a partir do nome copiado daria o slug do
 *   ORIGINAL** -- um formulario com cara de pronto que falha no envio. Vazio, a
 *   validacao do proprio formulario cobra o identificador, e quem duplica
 *   ESCOLHE o endereco publico novo de proposito. Retomar a digitacao do nome
 *   volta a sugerir, porque `slugEditado` fica `false`.
 * - **Nenhum carimbo de data, `version`, `claim_status`, `origin`,
 *   `missing_to_publish` nem `rating`.** Sao historia da entrada original --
 *   avaliacao de quem foi atendido por ELA, titularidade reivindicada sobre
 *   ELA. Herdar avaliacao seria publicar reputacao que ninguem deu a entrada
 *   nova, e e o mais caro dos erros possiveis aqui.
 * - **Nenhum nivel de verificacao.** Ele e derivado da verificacao aprovada da
 *   entidade, e a entidade nova nao tem nenhuma. O formulario nunca o editou.
 * - **Nao ha `id` para deixar de fora:** o painel endereca por `slug` e
 *   `AdminDirectoryEntry` nao tem `id` (ADR-0010 item 6).
 * - **A LOGO E A FOTO NAO VAO, e isso e o contrato e nao preferencia.** A
 *   leitura da entrada traz `logo`/`photo` como URL ja processada, **sem
 *   `upload_id` e sem `id` de imagem**, e a escrita so aceita `upload_id` de um
 *   envio desta sessao que **ainda nao foi usado em outra entrada** (`400
 *   upload_not_usable`). Nao existe, no contrato de hoje, nada que a copia
 *   pudesse mandar para apontar para a imagem do original. Quem duplica sobe a
 *   imagem de novo, e o formulario abre com os campos de imagem vazios em vez
 *   de prometer o que nao tem como cumprir.
 * - **A situacao nasce a do CADASTRO NOVO, e nao a do original.** Desde
 *   29/10/2026 o cadastro novo nasce "No ar" (decisao do cliente), entao
 *   duplicar uma entrada publicada tambem abre a copia como publicada -- e a
 *   copia carrega cidade, UF e telefone do original, que e exatamente o que a
 *   publicacao cobra. O que NAO se herda e `hidden` e `removed`: duplicar uma
 *   entrada retirada nao abre a copia retirada, porque retirada e ESTADO e nao
 *   preenchimento, e "nasce retirada" nao e um estado que signifique algo.
 *   Quem quiser revisar antes de o estabelecimento aparecer escolhe "Rascunho"
 *   no campo Situacao, que o cadastro passou a mostrar.
 *
 * ## E ELA NAO SALVA SOZINHA
 *
 * Esta funcao devolve VALORES DE FORMULARIO, e nao uma escrita. O destino e a
 * tela de cadastro aberta para revisao: duplicar sem revisar criaria duas
 * entradas identicas no diretorio publico, que e pior do que nao duplicar.
 */
export function valoresDuplicados(entrada: Entrada): Valores {
  return {
    ...valoresDa(entrada),
    slug: '',
    slugEditado: false,
    // Explicitos, e nao herdados de `valoresDa`: aqui eles nao significam "a
    // pessoa nao tocou no campo, a imagem gravada continua valendo" -- nao ha
    // imagem gravada nenhuma a continuar, porque nao ha entrada ainda.
    logoUploadId: undefined,
    fotoUploadId: undefined,
    // **A GALERIA NAO VAI**, e pela MESMA razao do contrato que tira a
    // logo e a foto: a leitura traz `upload_id` de um envio JA USADO nesta
    // entrada, e `professional_images.image_id` e UNIQUE GLOBAL -- a copia
    // seria recusada com `400 upload_not_usable`. Quem duplica sobe as fotos de
    // novo, e o formulario abre com a galeria vazia em vez de prometer o que
    // nao tem como cumprir.
    imagens: [],
    situacao: VAZIO.situacao,
  };
}

/**
 * Cadastro e edicao de uma entrada do diretorio de `Perto`.
 *
 * ## O QUE ESTE FORMULARIO NAO PEDE, E CADA AUSENCIA TEM MOTIVO
 *
 * - **Nenhum documento.** Nao ha campo de CNPJ nem de CRMV. Estabelecimento e
 *   clinica sao pessoa juridica, mas **profissional pode ser pessoa fisica**, e
 *   o painel nao precisa de documento de ninguem para publicar uma entrada de
 *   diretorio. As colunas existem no banco e pertencem ao fluxo de verificacao,
 *   que nao passa por aqui.
 * - **Nenhum nivel de verificacao.** Ele e derivado da verificacao aprovada
 *   mais forte da entidade; um perfil que declarasse o proprio nivel tornaria a
 *   verificacao decorativa. A tela MOSTRA o nivel, e nao o edita.
 * - **Nenhuma coordenada, e nenhum mapa.** Nao ha geocodificacao neste produto,
 *   e a decisao de como o painel marcaria o ponto esta pendente (9.4). Sem
 *   coordenada a entrada e publicavel e nao participa da ordenacao por
 *   distancia.
 * ## O ENDERECO DE RUA PASSOU A EXISTIR EM 18/10/2026, E O QUE ISSO MUDOU
 *
 * A decisao 9.2 foi RESPONDIDA pelo cliente: *"pode colocar o campo cep sim,
 * ele e um usuario administrador, responsavel por cadastrar varias informacoes
 * publicas"*. Antes dela este cabecalho listava "nenhum endereco de rua" entre
 * as ausencias deliberadas, e o campo de bairro dizia na ajuda que "a regra de
 * privacidade do produto nao permite rua nem CEP em superficie publica".
 *
 * **O que ele revogou foi QUEM PREENCHE, e nao O QUE APARECE EM PUBLICO.** As
 * duas coisas sao diferentes, e esta tela cobre so a primeira:
 *
 * - o painel coleta CEP, rua, numero e complemento, e grava os quatro;
 * - **a saida do aplicativo nao mudou.** `DirectoryEntrySummary` -- o cartao
 *   que `Perto` le -- continua com `city`, `state` e `neighborhood` e nada
 *   mais de endereco. Medido em 18/10 contra `api/openapi.yaml` e contra a
 *   consulta de leitura do diretorio: nenhuma das duas nomeia as colunas
 *   novas. Exibir endereco completo e decisao do cliente, e ela nao foi
 *   tomada.
 * - a regra do ADR-0010 (item 2 de "o que a rota publica jamais exibe":
 *   "endereco, CEP e numero de residencia") continua intacta e **nao foi
 *   editada**: ela fala de rota PUBLICA, e nem o diretorio nem o painel sao
 *   rota publica.
 *
 * **Os quatro campos sao opcionais, e isso e o ponto.** Um profissional
 * autonomo tem como "endereco" a propria casa; um campo obrigatorio o tornaria
 * incadastravel ou o obrigaria a publicar onde mora.
 * - **O SITE PASSOU A SER PEDIDO**, em 21/10/2026 (decisao do cliente), e esta
 *   frase substitui a anterior, que o listava entre os que "nao tem coluna". A
 *   `20261020000014` criou `professionals.site_url` e o padrao de site do
 *   produto (endereco completo com `https://`, esquema ausente RECUSADO) passou
 *   a ter onde ser aplicado -- pelo espelho de `endereco/enderecos.ts`, sem
 *   segunda definicao.
 *
 *   **Ele NAO substitui o telefone para publicar.** `missing_to_publish`
 *   continua cobrando `phone_e164`, e entrada com site e sem telefone segue nao
 *   publicavel: virar a regua em "site OU telefone" e decisao de produto que
 *   ninguem tomou.
 * - **Nenhum e-mail, WhatsApp, rede social, horario de funcionamento nem
 *   foto de perfil de rede.** Nenhuma dessas colunas existe em `professionals`.
 * - **ONG ja cabe, e esta frase estava desatualizada em DOIS pontos.** Ela
 *   dizia que "nao ha valor para organizacao em `professionals.kind`" e que a
 *   decisao 9.1 estava pendente. A decisao saiu: ONG e EIXO PROPRIO
 *   (`entity_kind`, migracao `20261018000012`), o campo Tipo esta na tela, e a
 *   coluna citada nem existe mais com esse nome -- virou `professionals.kinds`
 *   na `20261020000015`. O que continua de fora e ADOCAO: pet em adocao nao e
 *   campo de cadastro de estabelecimento.
 */
export default function FormularioDaEntrada() {
  const { entrySlug } = useParams();
  const editando = entrySlug !== undefined;
  const { api, registrarRascunho } = useSessao();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [parametros] = useSearchParams();
  /**
   * DUPLICANDO: o `slug` da entrada FONTE, que vem de `?duplicarDe=`.
   *
   * Em consulta, e nao em `state` de navegacao, por dois motivos: a URL
   * sobrevive a recarga da aba (quem recarrega continua duplicando o mesmo
   * estabelecimento em vez de cair num formulario vazio sem explicacao), e ela
   * e comparavel, o que da uma CHAVE DE RASCUNHO propria logo abaixo.
   *
   * So vale no cadastro. Na edicao o parametro e ignorado: `perto/:entrySlug`
   * ja tem uma entrada, e duplicar para cima dela nao e operacao que exista.
   */
  const duplicarDe = editando ? undefined : (parametros.get('duplicarDe') ?? undefined);
  /**
   * A chave do rascunho guardado, que **nao e so o `pathname`**.
   *
   * `/perto/novo` e `/perto/novo?duplicarDe=x` tem o MESMO `pathname`, e com a
   * chave antiga um rascunho de "nova entrada" abandonado voltaria por cima da
   * copia -- a pessoa pediu para duplicar e receberia outro formulario, sem
   * aviso. Cada duplicacao tem a sua, e a de cadastro limpo continua sendo o
   * `pathname` puro, que e a chave que ja estava em uso.
   */
  const chaveDoRascunho = duplicarDe ? `${pathname}?duplicarDe=${duplicarDe}` : pathname;
  const [carga, setCarga] = useState<{ chave: string; fase: 'pronto' | 'erro' | 'nao-encontrado' }>();
  const [entrada, setEntrada] = useState<Entrada>();
  const [etag, setEtag] = useState<string>();
  const [valores, setValores] = useState<Valores>(() =>
    // Duplicando tambem nasce `VAZIO`: a copia so existe depois de a fonte ser
    // lida, e a tela fica em `Carregando…` ate la em vez de mostrar um
    // formulario em branco que vai ser trocado debaixo de quem comecou a digitar.
    editando || duplicarDe ? VAZIO : (retomarRascunho<Valores>(chaveDoRascunho) ?? VAZIO),
  );
  const [base, setBase] = useState<Valores>(VAZIO);
  const [errosDoServidor, setErrosDoServidor] = useState<Partial<Record<Campo, string>>>({});
  const [erroDoTelefone, setErroDoTelefone] = useState(false);
  const [erroDoCep, setErroDoCep] = useState(false);
  const [buscaDoCep, setBuscaDoCep] = useState<
    'ocioso' | 'buscando' | 'preenchido' | 'nao-encontrado' | 'indisponivel'
  >('ocioso');
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState<{ texto: string; recarregar?: boolean; informativo?: boolean }>();
  const [versao, setVersao] = useState(0);
  const resumo = useRef<HTMLDivElement>(null);
  const liberado = useRef(false);

  /**
   * O `slug` que esta carga vai LER, que nao e sempre o que ela vai EDITAR.
   *
   * Editando, e a propria entrada. Duplicando, e a FONTE da copia -- lida pela
   * mesma rota e pelo mesmo tratamento de 404, e o que muda e so o que se faz
   * com a resposta.
   */
  const slugParaCarregar = entrySlug ?? duplicarDe;
  const chaveDaCarga = `${entrySlug ?? (duplicarDe ? `dup:${duplicarDe}` : 'novo')}#${versao}`;
  const fase = !slugParaCarregar
    ? 'pronto'
    : carga?.chave === chaveDaCarga
      ? carga.fase
      : 'carregando';

  useEffect(() => {
    if (!slugParaCarregar) return;
    const controle = new AbortController();
    const chave = chaveDaCarga;
    api
      .GET('/admin/directory/entries/{entrySlug}', {
        params: { path: { entrySlug: slugParaCarregar } },
        signal: controle.signal,
      })
      .then(({ data, response }) => {
        if (controle.signal.aborted) return;
        if (!data) {
          setCarga({ chave, fase: response.status === 404 ? 'nao-encontrado' : 'erro' });
          return;
        }
        if (editando) {
          setEntrada(data);
          // Do `version`, e nao do ETag do cabecalho: a borda o sufixa
          // ("3-zstd") e o If-Match daria 412 em toda escrita.
          setEtag(versaoComoEtag(data.version));
          setBase(valoresDa(data));
          setValores(retomarRascunho<Valores>(chaveDoRascunho) ?? valoresDa(data));
        } else {
          // DUPLICANDO. `entrada` e `etag` ficam VAZIOS de proposito: eles sao
          // o que faz `salvar` escolher o `PATCH`, e a copia e um `POST`.
          // Deixar a fonte em `entrada` aqui transformaria "duplicar" em
          // "editar o original", que e justamente o acidente a evitar.
          //
          // `base` tambem fica `VAZIO`, e por isso o formulario abre SUJO: ha
          // trabalho nao salvo na tela (a copia inteira), e sair dela sem
          // salvar deve avisar.
          setValores(retomarRascunho<Valores>(chaveDoRascunho) ?? valoresDuplicados(data));
        }
        setCarga({ chave, fase: 'pronto' });
      })
      .catch(() => {
        if (!controle.signal.aborted) setCarga({ chave, fase: 'erro' });
      });
    return () => controle.abort();
  }, [api, slugParaCarregar, editando, chaveDoRascunho, chaveDaCarga]);

  const valoresRef = useRef(valores);
  useLayoutEffect(() => {
    valoresRef.current = valores;
  });
  useEffect(
    () => registrarRascunho(() => guardarRascunho(chaveDoRascunho, paraRascunho(valoresRef.current))),
    [registrarRascunho, chaveDoRascunho],
  );

  const erros = tentou ? { ...errosDoServidor, ...validarEntrada(valores) } : errosDoServidor;

  function mudar(mudanca: Partial<Valores>) {
    setErrosDoServidor({});
    setValores((v) => {
      const novo = { ...v, ...mudanca };
      if (mudanca.nome !== undefined && !novo.slugEditado) novo.slug = slugSugerido(mudanca.nome);
      return novo;
    });
  }

  /**
   * A busca de CEP, **pelo NOSSO endpoint**.
   *
   * ## Nenhuma chamada a servico de fora sai deste navegador
   *
   * Decisao do cliente de 18/10/2026: *"voce deve usar sempre a mesma camada de
   * servico que ja fez a integracao com as plataformas, reaproveitamento dos
   * nossos endpoints"*. ViaCEP e BrasilAPI, a ordem entre eles e o prazo de 4 s
   * vivem no servidor, atras de `GET /v1/admin/postal-codes/{postalCode}`. O
   * painel chama pelo cliente gerado do contrato, como chama o resto.
   *
   * ## PREENCHE SO CAMPO VAZIO, e esta e a regra que importa
   *
   * O que o operador digitou **nunca** e sobrescrito. Um campo que "corrige" o
   * que a pessoa escreveu e a forma mais curta de perder trabalho em silencio:
   * quem cadastrou "Av. Paulista" e depois digitou o CEP veria o proprio texto
   * virar o da base, sem aviso e sem desfazer.
   *
   * ## E NUNCA BLOQUEIA O ENVIO
   *
   * Esta funcao nao e esperada por `salvar`, nao desabilita botao nenhum e nao
   * produz erro de campo. CEP e **conveniencia de digitacao**: servico de
   * terceiro fora do ar nao pode impedir alguem de cadastrar uma clinica. Os
   * tres desfechos que nao sao achado dizem a frase e param aí.
   */
  async function buscarEndereco(cep: string) {
    setBuscaDoCep('buscando');
    try {
      const { data, response } = await api.GET('/admin/postal-codes/{postalCode}', {
        params: { path: { postalCode: cep } },
      });
      if (!data) {
        // 404 e "este CEP nao existe nas bases"; qualquer outra coisa e "nao
        // conseguimos consultar agora". As duas terminam no mesmo lugar para
        // quem preenche -- digitar -- e a frase nao e a mesma.
        setBuscaDoCep(response.status === 404 ? 'nao-encontrado' : 'indisponivel');
        return;
      }
      setValores((v) => ({
        ...v,
        logradouro: v.logradouro.trim() === '' ? data.street : v.logradouro,
        bairro: v.bairro.trim() === '' ? data.neighborhood : v.bairro,
        cidade: v.cidade.trim() === '' ? data.city : v.cidade,
        uf: v.uf.trim() === '' ? data.state : v.uf,
      }));
      setBuscaDoCep('preenchido');
    } catch {
      setBuscaDoCep('indisponivel');
    }
  }

  function mostrar(doServidor: Partial<Record<Campo, string>>) {
    setErrosDoServidor(doServidor);
    requestAnimationFrame(() => resumo.current?.focus());
  }

  function voltar(aviso?: string) {
    liberado.current = true;
    void navigate('/perto', aviso ? { state: { aviso } } : {});
  }

  /** O texto aparado, ou `null` quando vazio. `null` apaga o campo no `PATCH`. */
  function ou(valor: string): string | null {
    const texto = valor.trim();
    return texto === '' ? null : texto;
  }

  async function salvar() {
    setTentou(true);
    setFalha(undefined);
    const locais = validarEntrada(valores);
    if (Object.keys(locais).length) return mostrar(locais);
    setSalvando(true);
    try {
      const nome = valores.nome.trim();
      const telefone = valores.telefone.trim() === '' ? null : telefoneEmE164(valores.telefone);
      const uf = ou(valores.uf)?.toUpperCase() ?? null;
      // Oito digitos, sem hifen: o contrato e o `CHECK` da coluna pedem assim,
      // e a mascara e so da tela. Campo vazio vira `null`, que no `PATCH`
      // APAGA o CEP e no `POST` simplesmente nao vai.
      const cep = valores.cep.trim() === '' ? null : cepEmOitoDigitos(valores.cep);

      if (!editando) {
        const { data, error } = await api.POST('/admin/directory/entries', {
          body: {
            slug: valores.slug,
            // `kinds` e nao `kind`: o contrato aceita os dois (um deles), e
            // mandar os dois juntos e `400` (`kind_conflict`). O painel novo
            // manda a lista.
            kinds: valores.atividades,
            entity_kind: valores.tipoDeEntidade,
            display_name: nome,
            ...(ou(valores.sobre) === null ? {} : { about: ou(valores.sobre) as string }),
            ...(ou(valores.cidade) === null ? {} : { city: ou(valores.cidade) as string }),
            ...(uf === null ? {} : { state: uf }),
            ...(ou(valores.bairro) === null ? {} : { neighborhood: ou(valores.bairro) as string }),
            ...(cep === null ? {} : { postal_code: cep }),
            ...(ou(valores.logradouro) === null ? {} : { street: ou(valores.logradouro) as string }),
            ...(ou(valores.numero) === null ? {} : { street_number: ou(valores.numero) as string }),
            ...(ou(valores.complemento) === null
              ? {}
              : { complement: ou(valores.complemento) as string }),
            ...(telefone === null ? {} : { phone_e164: telefone }),
            ...(ou(valores.site) === null ? {} : { site_url: ou(valores.site) as string }),
            // No cadastro so existe envio NOVO: nao ha imagem gravada para
            // remover, e `null` nao e valor aceito no corpo de criacao.
            ...(typeof valores.logoUploadId === 'string'
              ? { logo_upload_id: valores.logoUploadId }
              : {}),
            ...(typeof valores.fotoUploadId === 'string'
              ? { photo_upload_id: valores.fotoUploadId }
              : {}),
            // A GALERIA (29/10/2026). Vai SEMPRE, inclusive vazia: no cadastro
            // nao existe "nao tocou no campo" -- o que a tela tem e o que a
            // entrada vai ter, e `[]` e exatamente o estado da entrada que
            // nasce sem foto.
            images: imagensDoCorpo(valores),
            // A SITUACAO (cliente, 29/10/2026). Vai EXPLICITA mesmo quando e o
            // padrao do contrato: o formulario mostra o campo, a pessoa escolhe,
            // e mandar o que ela escolheu e mais honesto que confiar no padrao
            // -- se o padrao do contrato mudar, a tela continua valendo.
            //
            // Os DOIS valores que a criacao aceita, e nunca `hidden`/`removed`:
            // o seletor do cadastro so oferece estes dois (ver `SITUACOES_DO_CADASTRO`).
            status: valores.situacao === 'draft' ? 'draft' : 'published',
          },
        });
        if (data) {
          // A frase segue o que o SERVIDOR devolveu, e nao o que a tela pediu:
          // quem responde se a entrada esta no ar e `data.status`.
          return voltar(
            data.status === 'published'
              ? 'Entrada cadastrada e no ar em Perto.'
              : 'Entrada cadastrada, em rascunho. Para ela aparecer em Perto, publique na edição.',
          );
        }
        return recusa(error);
      }

      if (!entrada || !etag) return;
      const logoNoPatch = imagemParaOPatch(valores.logoUploadId, entrada.logo);
      const fotoNoPatch = imagemParaOPatch(valores.fotoUploadId, entrada.photo);
      const patch: Esquemas['AdminDirectoryEntryPatch'] = {
        ...(valores.slug !== entrada.slug ? { slug: valores.slug } : {}),
        // COMPARA CONJUNTO, e nao referencia: duas listas com os mesmos itens
        // em ordens diferentes sao a mesma escolha, e mandar `kinds` por causa
        // de ordem faria toda edicao parecer suja. A ordem do painel e sempre a
        // de `ORDEM_DAS_ATIVIDADES`, entao a comparacao ordenada basta e nao
        // depende de a tela ter preservado a ordem do servidor.
        ...(atividadesMudaram(valores.atividades, entrada.kinds)
          ? { kinds: valores.atividades }
          : {}),
        ...(valores.tipoDeEntidade !== entrada.entity_kind
          ? { entity_kind: valores.tipoDeEntidade }
          : {}),
        ...(nome !== entrada.display_name ? { display_name: nome } : {}),
        ...(ou(valores.sobre) !== (entrada.about ?? null) ? { about: ou(valores.sobre) } : {}),
        ...(ou(valores.cidade) !== (entrada.city ?? null) ? { city: ou(valores.cidade) } : {}),
        ...(uf !== (entrada.state ?? null) ? { state: uf } : {}),
        ...(ou(valores.bairro) !== (entrada.neighborhood ?? null)
          ? { neighborhood: ou(valores.bairro) }
          : {}),
        // Compara os OITO DIGITOS, que e o que o servidor guarda: trocar
        // `05435-000` por `05435000` no campo nao e mudanca de CEP.
        ...(cep !== (entrada.postal_code ?? null) ? { postal_code: cep } : {}),
        ...(ou(valores.logradouro) !== (entrada.street ?? null)
          ? { street: ou(valores.logradouro) }
          : {}),
        ...(ou(valores.numero) !== (entrada.street_number ?? null)
          ? { street_number: ou(valores.numero) }
          : {}),
        ...(ou(valores.complemento) !== (entrada.complement ?? null)
          ? { complement: ou(valores.complemento) }
          : {}),
        // Compara o E.164, que e o que o servidor guarda: trocar `(11) 3061-2200`
        // por `11 3061 2200` nao e mudanca de telefone.
        ...(telefone !== (entrada.phone_e164 ?? null) ? { phone_e164: telefone } : {}),
        // O SITE compara TEXTO contra TEXTO, e nao host contra host como faz o
        // formulario do parceiro: aqui a coluna guarda a URL inteira, entao
        // trocar o caminho E mudanca de site. `null` apaga.
        ...(ou(valores.site) !== (entrada.site_url ?? null) ? { site_url: ou(valores.site) } : {}),
        // Imagem: a chave so entra quando a pessoa MEXEU no campo. Envio novo
        // vai como `upload_id`; remover manda `null`, e apagar o que nunca
        // existiu nao e mudanca -- por isso `null` so vai quando havia imagem
        // gravada. Campo intocado nao aparece no corpo, que e o mesmo idioma
        // dos outros campos deste `PATCH`.
        ...(logoNoPatch !== undefined ? { logo_upload_id: logoNoPatch } : {}),
        ...(fotoNoPatch !== undefined ? { photo_upload_id: fotoNoPatch } : {}),
        // A GALERIA (29/10/2026) **so vai quando mudou em relacao a base**, e
        // isso nao e economia de bytes: `images` SUBSTITUI a lista inteira, e a
        // imagem com `upload_id` nulo nao pode ir no corpo -- mandar a galeria
        // numa edicao de telefone a tiraria da entrada. E o mesmo cuidado que a
        // `Loja` tem em `corpoDeAlteracao`.
        ...(assinaturaDaGaleria(valores) === assinaturaDaGaleria(base)
          ? {}
          : { images: imagensDoCorpo(valores) }),
        ...(valores.situacao !== entrada.status ? { status: valores.situacao } : {}),
      };
      // Sem mudanca nada vai ao servidor, e a tela diz isso em vez de voltar
      // calada: `minProperties: 1` no contrato recusaria o corpo vazio com 400,
      // e "não conseguimos salvar" sobre um clique que não mudou nada e a pior
      // mensagem possivel.
      if (Object.keys(patch).length === 0) {
        return setFalha({ texto: 'Nada mudou. Altere algum campo antes de salvar.', informativo: true });
      }
      const { data, error } = await api.PATCH('/admin/directory/entries/{entrySlug}', {
        params: { path: { entrySlug: entrada.slug }, header: { 'If-Match': etag } },
        body: patch,
      });
      if (data) {
        return voltar(
          data.status === 'published' ? 'Alterações salvas. A entrada está no ar.' : 'Alterações salvas.',
        );
      }
      return recusa(error);
    } catch {
      setFalha({ texto: 'Não conseguimos falar com o servidor. Confira a internet e tente de novo.' });
    } finally {
      setSalvando(false);
    }
  }

  function recusa(error: unknown) {
    const tipo = tipoDoProblema(error);
    if (tipo === 'slug-taken') {
      return mostrar({ 'e-slug': 'Já existe uma entrada com este identificador. Escolha outro.' });
    }
    if (tipo === 'precondition-failed') {
      return setFalha({
        texto:
          'Alguém alterou esta entrada enquanto você editava, e nada foi gravado. Recarregar traz a versão atual e descarta o que você mudou aqui.',
        recarregar: true,
      });
    }
    if (tipo === 'validation-failed') {
      const e: Partial<Record<Campo, string>> = {};
      // `required` nos campos da publicacao e a recusa de QUEBRAR a publicacao,
      // e ela chega campo por campo de proposito: a tela marca todos de uma
      // vez em vez de o operador descobrir um por tentativa.
      for (const erro of errosDoProblema(error)) {
        if (erro.field === 'display_name') e['e-nome'] = 'Informe o nome, de 2 a 120 caracteres.';
        else if (erro.field === 'slug') e['e-slug'] = MENSAGEM_DO_SLUG;
        else if (erro.field === 'about') e['e-sobre'] = 'Entre 2 e 2000 caracteres.';
        else if (erro.field === 'city') {
          e['e-cidade'] =
            erro.code === 'required'
              ? 'Sem cidade a entrada não aparece em nenhuma busca de Perto.'
              : 'Entre 2 e 80 caracteres.';
        } else if (erro.field === 'state') {
          e['e-uf'] =
            erro.code === 'required'
              ? 'Informe a UF para publicar.'
              : 'Use a sigla do estado, com duas letras.';
        } else if (erro.field === 'neighborhood') e['e-bairro'] = 'Entre 2 e 80 caracteres.';
        else if (erro.field === 'postal_code') {
          e['e-cep'] = 'O CEP tem oito dígitos. Por exemplo: 05435-000.';
        } else if (erro.field === 'images' || erro.field.startsWith('images[')) {
          // UM campo na tela para os tres `code` que o servidor devolve em
          // `images`: `upload_not_usable`, `duplicate_upload` e o tamanho de
          // `images[n].alt_text`. A galeria desenha o erro no topo dela, e nao
          // na moldura n -- e `images[n]` nao casa com nenhum `id` de campo,
          // entao `startsWith` e o que impede o erro de cair no silencio do
          // `else`.
          e['e-galeria'] =
            erro.code === 'duplicate_upload'
              ? 'A mesma imagem aparece duas vezes na galeria. Remova uma delas.'
              : erro.code === 'too_many_images'
                ? 'Até 8 imagens na galeria.'
                : erro.code === 'length'
                  ? 'Escreva pelo menos duas letras na descrição, ou deixe o campo vazio.'
                  : 'Uma das imagens da galeria não serve para esta entrada. Envie-a de novo.';
        } else if (erro.field === 'logo_upload_id') {
          e['e-logo'] = 'Não conseguimos usar esta imagem como logo. Envie a imagem de novo.';
        } else if (erro.field === 'photo_upload_id') {
          e['e-foto'] = 'Não conseguimos usar esta imagem como foto do local. Envie a imagem de novo.';
        } else if (erro.field === 'street') e['e-logradouro'] = 'Entre 2 e 120 caracteres.';
        else if (erro.field === 'street_number') e['e-numero'] = 'Até 20 caracteres.';
        else if (erro.field === 'complement') e['e-complemento'] = 'Até 80 caracteres.';
        else if (erro.field === 'phone_e164') {
          e['e-telefone'] =
            erro.code === 'required'
              ? 'Uma entrada no ar precisa de um telefone: hoje ele é o único canal de contato que a publicação cobra.'
              : 'Informe o telefone com DDD. Por exemplo: (11) 3061-2200.';
        } else if (erro.field === 'site_url') {
          // AQUI o mapa de `code` e o certo, e nao `mensagemDoSite`: a recusa
          // veio do SERVIDOR, com o motivo ja decidido, e reconferir o texto
          // localmente poderia discordar dele. `MENSAGEM_DO_SITE` e o mesmo mapa
          // que o formulario do parceiro usa.
          e['e-site'] =
            MENSAGEM_DO_SITE[erro.code as CodigoDoSite] ?? MENSAGEM_DO_SITE.site_url_invalid;
        }
      }
      if (Object.keys(e).length) return mostrar(e);
    }
    setFalha({ texto: 'Não conseguimos salvar a entrada. Confira os campos e tente de novo.' });
  }

  const voltarLink = (
    <Link className="btn ghost voltar" to="/perto">
      <Icone nome="back" tamanho="s20" />
      Voltar para Perto
    </Link>
  );

  if (fase === 'carregando') return <p role="status">Carregando…</p>;
  if (fase !== 'pronto') {
    return (
      <div className="form">
        {voltarLink}
        <Banner tipo="erro">
          {/* Duplicando, o que faltou foi a FONTE da copia, e nao "esta
              entrada" -- a copia nem existe ainda. Dizer a frase da edicao
              aqui mandaria procurar o que nao e o problema. */}
          {fase === 'nao-encontrado'
            ? duplicarDe
              ? 'A entrada que você quer duplicar não existe mais.'
              : 'Esta entrada não existe mais.'
            : duplicarDe
              ? 'Não conseguimos carregar a entrada que você quer duplicar.'
              : 'Não conseguimos carregar a entrada.'}
        </Banner>
      </div>
    );
  }

  const lista = ORDEM.filter((c) => erros[c]).map((c) => ({ campo: c, rotulo: ROTULOS[c] }));
  /**
   * A situacao escolhida publica a entrada? (cliente, 29/10/2026)
   *
   * E ela que decide o `*` em Cidade, UF e Telefone, e vem do MESMO lugar que
   * `validarEntrada` le -- `valores.situacao`. Duas leituras diferentes
   * deixariam o rotulo prometer uma obrigacao que a validacao nao cobra, ou o
   * contrario.
   */
  const cobraPublicacao = valores.situacao === 'published';
  const sujo =
    JSON.stringify({ ...valores, slugEditado: 0 }) !==
    JSON.stringify({ ...(editando ? base : VAZIO), slugEditado: 0 });
  const pendente = entrada ? frasePendente(entrada.missing_to_publish) : undefined;

  return (
    <>
      <form
        className="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        {voltarLink}
        <h1 className="t-headline">
          {entrada ? entrada.display_name : duplicarDe ? 'Cópia de entrada' : 'Nova entrada'}
        </h1>
        {/* DUPLICANDO: a tela diz de ONDE a copia veio e o que ela NAO trouxe.
            Sem isto, um formulario cheio sob o titulo de cadastro parece uma
            entrada que ja existe -- e o identificador vazio pareceria defeito
            em vez de escolha. */}
        {duplicarDe && (
          <Banner tipo="info">
            Copiado de <strong>{duplicarDe}</strong>. O identificador ficou em branco porque ele é o
            endereço público e não pode repetir. Avaliações, verificação e as imagens não vêm na
            cópia — confira os dados e cadastre.
          </Banner>
        )}
        {lista.length > 0 && (
          <ResumoDeErros
            referencia={resumo}
            titulo={`Corrija ${lista.length} ${lista.length === 1 ? 'campo' : 'campos'} para salvar:`}
            erros={lista}
          />
        )}
        {falha && (
          <Banner
            tipo={falha.informativo ? 'info' : 'erro'}
            acao={
              falha.recarregar ? (
                <button type="button" className="btn ghost sm" onClick={() => setVersao((n) => n + 1)}>
                  Recarregar
                </button>
              ) : undefined
            }
          >
            {falha.texto}
          </Banner>
        )}
        {/* O que falta para publicar, DITO ANTES de alguem tentar. A mesma
            régua recusa a publicação com 400; mostrá-la aqui é o que evita a
            recusa em vez de ter mensagem bonita para ela. */}
        {pendente && entrada?.status !== 'published' && <Banner tipo="info">{pendente}</Banner>}
        <p className="t-body-sm c-sec">Campos com * são obrigatórios.</p>

        <CampoDeTexto
          id="e-nome"
          dataCy="entrada-nome"
          rotulo="Nome *"
          valor={valores.nome}
          aoMudar={(v) => mudar({ nome: v })}
          maximo={120}
          erro={erros['e-nome']}
          ajuda="Como aparece na seção Perto do aplicativo."
        />

        <CampoDeTexto
          id="e-slug"
          dataCy="entrada-identificador"
          rotulo="Identificador *"
          valor={valores.slug}
          aoMudar={(v) => mudar({ slug: v.toLowerCase(), slugEditado: true })}
          maximo={30}
          erro={erros['e-slug']}
          semCorrecao
          ajuda={
            editando
              ? 'O endereço público desta entrada. Letras minúsculas, números e hífen. Vem do nome, e você pode mudar. Se mudar, os links já compartilhados para o antigo deixam de resolver.'
              : 'O endereço público desta entrada. Letras minúsculas, números e hífen. Vem do nome, e você pode mudar.'
          }
        />

        {/* O TIPO DE ENTIDADE, ligado na uniao de 18/10/2026.
            O eixo e o campo existiam no contrato e na coluna desde
            `20261018000012`, e o painel nao os oferecia: o autor do eixo nao
            pos o campo aqui porque este arquivo estava com o ramo da midia.
            Sem ele nao havia como cadastrar uma ONG pelo painel -- a entrada
            nascia `professional` e nada na tela dizia o contrario.

            ANTES da atividade de proposito: "o que e?" vem antes de "o que
            faz?", e uma ONG responde as duas. */}
        <div className="field">
          <label htmlFor="e-tipo-entidade">Tipo *</label>
          <div className="ordem sel campo-sel">
            <select
              id="e-tipo-entidade"
              data-cy="entrada-tipo-entidade"
              value={valores.tipoDeEntidade}
              onChange={(e) =>
                mudar({ tipoDeEntidade: e.target.value as TipoDeEntidadeDaEntrada })
              }
              aria-describedby="e-tipo-entidade-ajuda"
            >
              {ORDEM_DOS_TIPOS_DE_ENTIDADE.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {TIPOS_DE_ENTIDADE[tipo]}
                </option>
              ))}
            </select>
            <Icone nome="expand" tamanho="s20" />
          </div>
          <span className="help" id="e-tipo-entidade-ajuda">
            Uma ONG continua escolhendo a atividade abaixo: o tipo diz o que a entrada é, e a
            atividade diz o que ela faz.
          </span>
        </div>

        {/* AS ATIVIDADES, de uma para VARIAS em 21/10/2026 (decisao do
            cliente): uma clinica que tambem faz banho e tosa deixou de ter de
            escolher.

            CAIXAS e nao `<select multiple>`: a selecao multipla nativa esconde
            que da para marcar mais de uma (precisa de ctrl/cmd), perde a
            escolha com um clique errado e e ruim no teclado. Sao seis opcoes
            fixas -- cabem todas na tela, e o mesmo molde de caixas que o campo
            Situacao ja usa logo abaixo.

            `fieldset`/`legend` e nao `label`: um rotulo nao pode apontar para
            seis campos, e sem o grupo o leitor de tela anunciaria seis caixas
            soltas sem dizer do que sao. */}
        <fieldset
          className={erros['e-atividade'] ? 'field err' : 'field'}
          aria-describedby="e-atividade-ajuda"
          aria-invalid={erros['e-atividade'] ? true : undefined}
        >
          <legend className="lab">Atividades *</legend>
          <div className="checks">
            {ORDEM_DAS_ATIVIDADES.map((tipo) => (
              <label className="check" key={tipo}>
                <input
                  type="checkbox"
                  data-cy={`entrada-atividade-${tipo}`}
                  checked={valores.atividades.includes(tipo)}
                  onChange={(e) =>
                    mudar({
                      // A ordem guardada e sempre a de `ORDEM_DAS_ATIVIDADES`, e
                      // nao a de clique: `filter` sobre a ordem canonica em vez
                      // de `push`. Assim a primeira atividade -- que e a que o
                      // contrato publica em `kind` -- nao depende de em que
                      // caixa o operador clicou primeiro.
                      atividades: e.target.checked
                        ? ORDEM_DAS_ATIVIDADES.filter(
                            (x) => x === tipo || valores.atividades.includes(x),
                          )
                        : valores.atividades.filter((x) => x !== tipo),
                    })
                  }
                />
                <span>{ATIVIDADES[tipo]}</span>
              </label>
            ))}
          </div>
          <span className="help" id="e-atividade-ajuda">
            O que a entrada faz. Marque todas as que valem — uma clínica que também faz banho e tosa
            aparece nos dois filtros da seção Perto. Uma ONG também escolhe aqui: o que ela é fica no
            campo Tipo, acima.
          </span>
          {erros['e-atividade'] && <ErroDoCampo id="e-atividade-erro">{erros['e-atividade']}</ErroDoCampo>}
        </fieldset>

        <CampoDeTexto
          id="e-sobre"
          dataCy="entrada-sobre"
          rotulo="Apresentação"
          valor={valores.sobre}
          aoMudar={(v) => mudar({ sobre: v })}
          maximo={2000}
          contador
          linhas={5}
          erro={erros['e-sobre']}
          ajuda="Texto puro, do jeito que aparece no app. Sem marcação."
        />

        <CampoDeTexto
          id="e-cidade"
          dataCy="entrada-cidade"
          rotulo={cobraPublicacao ? 'Cidade *' : 'Cidade'}
          valor={valores.cidade}
          aoMudar={(v) => mudar({ cidade: v })}
          maximo={80}
          erro={erros['e-cidade']}
          ajuda={
            cobraPublicacao
              ? 'Cobrada para a entrada ficar no ar. Escolha “Rascunho” abaixo se quiser salvar sem ela.'
              : 'Precisa estar preenchida para a entrada aparecer em Perto.'
          }
        />

        <CampoDeTexto
          id="e-uf"
          dataCy="entrada-uf"
          rotulo={cobraPublicacao ? 'UF *' : 'UF'}
          valor={valores.uf}
          aoMudar={(v) => mudar({ uf: v.toUpperCase().slice(0, 2) })}
          maximo={2}
          semCorrecao
          erro={erros['e-uf']}
          ajuda="Duas letras. Por exemplo: SP."
        />

        <CampoDeCep
          id="e-cep"
          dataCy="entrada-cep"
          rotulo="CEP"
          valor={valores.cep}
          aoMudar={(v) => mudar({ cep: v })}
          aoCompletar={(cep) => {
            // `void`: a busca NAO e esperada por nada. Ela preenche o que
            // estiver vazio quando responder, e o formulário segue inteiro e
            // salvável enquanto ela acontece.
            void buscarEndereco(cep);
          }}
          erro={erros['e-cep']}
          erroDeForma={erroDoCep}
          aoMudarErroDeForma={setErroDoCep}
          ajuda="Opcional. Ao completar os oito dígitos, buscamos rua, bairro, cidade e UF e preenchemos o que estiver em branco. Nada do que você digitou é alterado, e você pode editar tudo depois."
        />
        {/* O desfecho da busca, DITO em voz alta e em `role="status"`: campo
            que se preenche sozinho sem avisar parece defeito, e campo que não
            se preenche sem explicar parece defeito também. Nenhuma destas
            frases impede salvar. */}
        {buscaDoCep !== 'ocioso' && (
          <p className="t-body-sm c-sec" role="status" data-cy="entrada-cep-situacao">
            {buscaDoCep === 'buscando'
              ? 'Buscando o endereço do CEP…'
              : buscaDoCep === 'preenchido'
                ? 'Preenchemos os campos que estavam em branco. Confira e edite se precisar.'
                : buscaDoCep === 'nao-encontrado'
                  ? 'Não encontramos este CEP. Preencha o endereço abaixo; isso não impede salvar.'
                  : 'Não conseguimos consultar o CEP agora. Preencha o endereço abaixo; isso não impede salvar.'}
          </p>
        )}

        <CampoDeTexto
          id="e-logradouro"
          dataCy="entrada-logradouro"
          rotulo="Rua"
          valor={valores.logradouro}
          aoMudar={(v) => mudar({ logradouro: v })}
          maximo={120}
          erro={erros['e-logradouro']}
          ajuda="Opcional. Quem atende em casa ou não tem endereço fixo pode deixar em branco."
        />

        <CampoDeTexto
          id="e-numero"
          dataCy="entrada-numero"
          rotulo="Número"
          valor={valores.numero}
          aoMudar={(v) => mudar({ numero: v })}
          maximo={20}
          semCorrecao
          erro={erros['e-numero']}
          ajuda="Opcional. Texto, e não só dígitos: s/n, 120A e KM 32 são números de porta."
        />

        <CampoDeTexto
          id="e-complemento"
          dataCy="entrada-complemento"
          rotulo="Complemento"
          valor={valores.complemento}
          aoMudar={(v) => mudar({ complemento: v })}
          maximo={80}
          erro={erros['e-complemento']}
          ajuda="Opcional. Sala, andar, conjunto."
        />

        <CampoDeTexto
          id="e-bairro"
          dataCy="entrada-bairro"
          rotulo="Bairro"
          valor={valores.bairro}
          aoMudar={(v) => mudar({ bairro: v })}
          maximo={80}
          erro={erros['e-bairro']}
          ajuda="Aparece no app, junto de cidade e UF. Rua, número e CEP ficam no cadastro e não vão para o cartão que o aplicativo mostra."
        />

        <CampoDeTelefone
          id="e-telefone"
          dataCy="entrada-telefone"
          rotulo={cobraPublicacao ? 'Telefone comercial *' : 'Telefone comercial'}
          valor={valores.telefone}
          aoMudar={(v) => mudar({ telefone: v })}
          erro={erros['e-telefone']}
          erroDeForma={erroDoTelefone}
          aoMudarErroDeForma={setErroDoTelefone}
          ajuda="Com DDD. É o canal que a publicação cobra: precisa estar preenchido para a entrada aparecer em Perto."
        />

        <CampoDeTexto
          id="e-site"
          dataCy="entrada-site"
          rotulo="Site"
          valor={valores.site}
          aoMudar={(v) => mudar({ site: v })}
          maximo={LIMITE_DO_SITE}
          erro={erros['e-site']}
          ajuda="Opcional. O endereço completo, começando com https:// — por exemplo https://clinica.exemplo.test/contato. Aparece no app ao lado do telefone. Não substitui o telefone para publicar."
        />

        {/* Duas imagens, e DOIS campos: a logo e quadrada e pequena, a foto e
            do lugar. Confirmar o envio de uma no campo da outra e recusado com
            `400 upload_not_usable`, e por isso nenhum dos dois aceita o envio
            do outro. A orientacao de tamanho fica sempre em tela, dentro de
            cada campo. */}
        <CampoDeImagem
          id="e-logo"
          dataCy="entrada-logo"
          rotulo="Logo"
          proposito="directory_logo"
          api={api}
          uploadId={valores.logoUploadId}
          salva={entrada?.logo ?? null}
          aoMudar={(v) => mudar({ logoUploadId: v })}
          erro={erros['e-logo']}
          ajuda="Quadrada. Aparece ao lado do nome na lista e no cartão desta entrada."
        />

        <CampoDeImagem
          id="e-foto"
          dataCy="entrada-foto"
          rotulo="Foto do local"
          proposito="directory_photo"
          api={api}
          uploadId={valores.fotoUploadId}
          salva={entrada?.photo ?? null}
          aoMudar={(v) => mudar({ fotoUploadId: v })}
          erro={erros['e-foto']}
          ajuda="A fachada ou o ambiente, em faixa deitada. É a imagem grande da entrada."
        />

        {/* A GALERIA (cliente, 29/10/2026: *"implemente a tabela de galeria
            entao"*), que responde ao pedido de 28/10 -- *"so esta permitindo
            subir uma foto, deve ser padrao igual na pagina de eventos"*.

            E o MESMO componente `Galeria` da `Loja` e da `Rede`, com o
            proposito `directory_gallery`: um componente para as tres secoes, e
            nao um terceiro desenho de galeria.

            `principal="Capa"` e nao "Principal": a primeira e a capa da
            galeria, o mesmo vocabulario da `Rede`. Ela NAO substitui a "Foto do
            local" acima -- aquela e uma so, e e a imagem grande da entrada. */}
        <Galeria
          id="e-galeria"
          titulo="Galeria de fotos"
          principal="Capa"
          proposito="directory_gallery"
          imagens={valores.imagens}
          aoMudar={(atualizar) =>
            mudar({ imagens: atualizar(valores.imagens) })
          }
          enviar={(arquivo, aoProgredir) =>
            enviarImagem(api, arquivo, 'directory_gallery', aoProgredir)
          }
          mostrarErrosDeDescricao={tentou}
          // A descricao e OPCIONAL, como nas duas galerias irmas (`Loja` desde
          // 17/10/2026 e `Rede` desde 21/10, as duas por pedido do cliente).
          // O padrao do componente e `true`; desligar aqui e o que mantem as
          // tres telas com a mesma exigencia.
          descricaoObrigatoria={false}
          reservaDaDescricao="o nome da entrada"
          ajuda={`JPG, PNG ou WebP, até ${LIMITE_EM_MB} MB cada, com pelo menos ${String(DIMENSAO_MINIMA.directory_gallery.largura)} × ${String(DIMENSAO_MINIMA.directory_gallery.altura)} pixels. A primeira é a capa da galeria. Arraste para reordenar, ou use os botões de mover.`}
          erro={erros['e-galeria']}
          marca={(im) => (semEnvioNaGaleria(im) ? MARCA_SEM_ENVIO : undefined)}
        />
        {avisoDeImagensSemEnvio(valores) && (
          <Banner tipo="alerta">{avisoDeImagensSemEnvio(valores)}</Banner>
        )}

        {/* O CAMPO SITUACAO PASSA A APARECER NO CADASTRO TAMBEM (cliente,
            29/10/2026). Antes de 29/10 ele era `editando &&`, e com razao: o
            `POST` nao aceitava `status` e a entrada nascia sempre rascunho --
            mostrar o campo seria oferecer uma escolha que nao existia.

            Agora a escolha existe, e e ela que o cliente pediu: o padrao e "No
            ar" e o rascunho continua disponivel para quem quiser salvar
            incompleto. Esconder o campo no cadastro deixaria o rascunho sem
            porta, e era a porta que ele mandou manter.

            **DOIS valores no cadastro e QUATRO na edicao**, e a diferenca nao e
            cosmetica: `hidden` e `removed` sao RETIRADA -- tirar do ar o que
            esta no ar --, e o contrato nem os aceita em
            `AdminDirectoryEntryCreateStatus`. Oferece-los aqui ofereceria um
            `400`. */}
        <fieldset className="field" aria-describedby="e-situacao-ajuda">
          <legend className="lab">Situação</legend>
          <div className="checks">
            {(editando ? SITUACOES_DA_EDICAO : SITUACOES_DO_CADASTRO).map((situacao) => (
              <label className="check" key={situacao}>
                <input
                  type="radio"
                  name="e-situacao"
                  data-cy={`entrada-situacao-${situacao}`}
                  checked={valores.situacao === situacao}
                  onChange={() => mudar({ situacao })}
                />
                <span>{SITUACOES[situacao]}</span>
              </label>
            ))}
          </div>
          <span className="help" id="e-situacao-ajuda">
            {editando
              ? 'Só “No ar” aparece na seção Perto. Editar outros campos não muda a situação: tirar do ar é uma escolha feita aqui. “Removida” tira a entrada do diretório sem apagar o registro.'
              : '“No ar” é o padrão e publica a entrada em Perto na hora — por isso cidade, UF e telefone são cobrados. “Rascunho” guarda o cadastro incompleto, e ele só aparece em Perto depois de você publicar na edição.'}
          </span>
        </fieldset>

        {/* O nivel de verificacao é SOMENTE LEITURA: ele deriva da verificação
            aprovada mais forte da entidade, e um perfil que declarasse o
            próprio nível tornaria a verificação decorativa. */}
        {entrada && (
          <p className="t-body-sm c-sec">
            Verificação:{' '}
            {entrada.verification.level === 'document_verified'
              ? 'documento conferido'
              : entrada.verification.level === 'contact_verified'
                ? 'contato conferido'
                : 'nenhuma'}
            . Isso não é editável aqui: vem do que foi provado para esta entidade.
          </p>
        )}

        <div className="rodape-form">
          <Link className="btn sec" to="/perto">
            Cancelar
          </Link>
          <button
            type="submit"
            className="btn pri"
            data-cy="entrada-salvar"
            aria-busy={salvando || undefined}
            disabled={salvando}
          >
            {salvando && <span className="spin" aria-hidden="true" />}
            {editando ? 'Salvar alterações' : 'Cadastrar entrada'}
          </button>
        </div>
      </form>
      <SairSemSalvar sujo={sujo && !salvando} liberado={liberado} />
    </>
  );
}
