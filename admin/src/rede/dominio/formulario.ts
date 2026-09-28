/**
 * O formulario do encontro como dado: estado, validacao de conveniencia e a
 * montagem dos corpos do contrato. Fica fora do componente para ser testado
 * em milissegundos; a autoridade de toda regra e do servidor.
 *
 * Numa edicao, o contrato separa tres operacoes (ADR-0027, 12.9 e D40):
 *   - updateAdminNetworkEvent: titulo, descricao, fotos, o que levar,
 *     observacoes e detalhes, sem senha;
 *   - relocateAdminNetworkEvent: data, horario e lugar, com senha e motivo;
 *   - changeAdminNetworkEventAccess: visibilidade e custo, com senha e motivo.
 * `planoDeEdicao` diz quais das tres o que mudou exige.
 */
import { campoDoInstante, dataCurta, faixaDeHorario, FUSO_PADRAO, instanteDoCampo } from './horario.ts';
import { achadosNasObservacoes, ERRO_DAS_OBSERVACOES } from './observacoes.ts';
import type {
  Encontro,
  EncontroInput,
  EncontroPatch,
  Estrutura,
  IdadeDosCaes,
  ImagemInput,
  ItemParaLevar,
  LugarInput,
  Mudanca,
  MudancaDeAcesso,
  Ponto,
  Porte,
  UnidadeDoValor,
  Visibilidade,
} from './tipos.ts';
import { centavosDoTexto, textoDosCentavos, valorComoOAppMostra } from './valor.ts';

export const LIMITE_DE_FOTOS = 8;
export const LIMITE_DAS_OBSERVACOES = 500;
export const LIMITE_DO_RESUMO = 180;
export const LIMITE_DO_MOTIVO = 280;

/**
 * Mesma forma da imagem da galeria compartilhada do painel: `enviando` e
 * `erro` so existem no navegador; `enviada` e o envio que a escrita do
 * encontro ainda vai confirmar; `processing`, `ready` e `rejected` sao o
 * `AdminCatalogGalleryImage.status` que o servidor devolve.
 */
export type EstadoDaFoto = 'enviando' | 'erro' | 'enviada' | 'processing' | 'ready' | 'rejected';

export interface FotoDoFormulario {
  /** Chave local e estavel da miniatura, para o React e para o foco. */
  chave: string;
  estado: EstadoDaFoto;
  uploadId?: string;
  previa?: string | null;
  motivo?: string | null;
  alt: string;
}

const FOTO_QUE_VAI = new Set<EstadoDaFoto>(['enviada', 'processing', 'ready']);

/**
 * Chave estavel de uma foto que veio do servidor. `upload_id` pode ser nulo
 * (AdminCatalogGalleryImage): a foto continua no encontro e precisa de uma chave
 * que nao dependa dele. A posicao e unica na galeria lida.
 */
export function chaveDaImagem(img: { upload_id: string | null; position: number }): string {
  return img.upload_id ?? `sem-envio-${img.position}`;
}

/** Fotos que a galeria nao consegue reenviar: saem do encontro se as fotos mudarem. */
export function fotosSemEnvio(f: Pick<EstadoDoFormulario, 'fotos'>): number {
  return f.fotos.filter((x) => !x.uploadId && FOTO_QUE_VAI.has(x.estado)).length;
}

export interface EstadoDoFormulario {
  titulo: string;
  resumo: string;
  inicio: string;
  fim: string;
  ponto: Ponto | null;
  local: string;
  bairro: string;
  cidade: string;
  uf: string;
  fotos: FotoDoFormulario[];
  visibilidade: Visibilidade;
  pago: boolean;
  valor: string;
  unidade: UnidadeDoValor;
  levar: ItemParaLevar[];
  observacoes: string;
  portes: Porte[];
  idade: IdadeDosCaes;
  vacina: boolean;
  cercada: boolean;
  estrutura: Estrutura[];
}

/** Padroes do contrato: todos os portes, qualquer idade, vacina exigida, sem area cercada, publico e gratuito. */
export function formularioVazio(): EstadoDoFormulario {
  return {
    titulo: '',
    resumo: '',
    inicio: '',
    fim: '',
    ponto: null,
    local: '',
    bairro: '',
    cidade: '',
    uf: 'SP',
    fotos: [],
    visibilidade: 'public',
    pago: false,
    valor: '',
    unidade: 'per_dog',
    levar: [],
    observacoes: '',
    portes: ['P', 'M', 'G', 'GG'],
    idade: 'any',
    vacina: true,
    cercada: false,
    estrutura: [],
  };
}

export function formularioDoEncontro(e: Encontro): EstadoDoFormulario {
  const fuso = e.time_zone || FUSO_PADRAO;
  const preco = e.admission.price ?? null;
  return {
    titulo: e.title,
    resumo: e.summary,
    inicio: campoDoInstante(e.starts_at, fuso),
    fim: e.ends_at ? campoDoInstante(e.ends_at, fuso) : '',
    ponto: e.place.point ?? null,
    local: e.place.place_name,
    bairro: e.place.neighborhood,
    cidade: e.place.city,
    uf: e.place.state,
    fotos: [...e.images]
      .sort((a, b) => a.position - b.position)
      .map((img) => ({
        chave: chaveDaImagem(img),
        estado: img.status,
        ...(img.upload_id ? { uploadId: img.upload_id } : {}),
        previa: img.url ?? null,
        motivo: img.rejection_reason ?? null,
        alt: img.alt_text,
      })),
    visibilidade: e.visibility,
    pago: e.admission.kind === 'paid',
    valor: preco ? textoDosCentavos(preco.amount) : '',
    unidade: preco?.unit ?? 'per_dog',
    levar: [...e.bring_items],
    observacoes: e.notes ?? '',
    portes: [...e.accepted_sizes],
    idade: e.dog_age,
    vacina: e.vaccination_required,
    cercada: e.fenced_off_leash_area,
    estrutura: [...e.amenities],
  };
}

// ------------------------------------------------------------------ validacao

export type Campo =
  | 'titulo'
  | 'resumo'
  | 'fotos'
  | 'inicio'
  | 'fim'
  | 'local'
  | 'bairro'
  | 'cidade'
  | 'valor'
  | 'observacoes'
  | 'portes'
  | `alt-${number}`;

export interface ErroDeCampo {
  campo: Campo;
  /** O nome do campo no resumo de erros do topo. */
  rotulo: string;
  mensagem: string;
}

export type Modo = 'novo' | 'editar';

const entre = (t: string, min: number, max: number) => {
  const n = t.trim().length;
  return n >= min && n <= max;
};

export function validar(f: EstadoDoFormulario, modo: Modo, agora: Date = new Date()): ErroDeCampo[] {
  const erros: ErroDeCampo[] = [];
  const e = (campo: Campo, rotulo: string, mensagem: string) => erros.push({ campo, rotulo, mensagem });

  if (!entre(f.titulo, 2, 120)) e('titulo', 'Título', 'Informe o título do encontro.');
  if (!entre(f.resumo, 2, LIMITE_DO_RESUMO)) e('resumo', 'Descrição', 'Escreva uma descrição.');

  if (f.fotos.some((x) => x.estado === 'enviando')) {
    e('fotos', 'Fotos', 'Espere o envio das fotos terminar.');
  } else if (f.fotos.some((x) => x.estado === 'erro' || x.estado === 'rejected')) {
    e('fotos', 'Fotos', 'Remova ou envie de novo a foto que não foi aceita.');
  }
  f.fotos.forEach((foto, i) => {
    if (FOTO_QUE_VAI.has(foto.estado) && !entre(foto.alt, 2, 150)) {
      e(`alt-${i}`, 'Descrição da imagem', 'Descreva a imagem.');
    }
  });

  const inicio = instanteDoCampo(f.inicio);
  if (!inicio) e('inicio', 'Início', 'Informe quando começa.');
  else if (modo === 'novo' && Date.parse(inicio) <= agora.getTime()) e('inicio', 'Início', 'O início precisa ser depois de agora.');
  if (f.fim) {
    const fim = instanteDoCampo(f.fim);
    if (!fim) e('fim', 'Fim', 'Informe quando termina.');
    else if (inicio && Date.parse(fim) <= Date.parse(inicio)) e('fim', 'Fim', 'O fim precisa ser depois do início.');
  }

  if (!entre(f.local, 2, 80)) e('local', 'Nome do local', 'Informe o nome do local.');
  if (!entre(f.bairro, 2, 60)) e('bairro', 'Bairro', 'Informe o bairro.');
  if (!entre(f.cidade, 2, 60)) e('cidade', 'Cidade', 'Informe a cidade.');

  if (f.pago && centavosDoTexto(f.valor) === null) {
    e('valor', 'Valor em reais', 'Informe o valor em reais, por exemplo 15 ou 15,50.');
  }

  const obs = f.observacoes.trim();
  if (obs && (achadosNasObservacoes(obs).length > 0 || obs.length < 2)) {
    e('observacoes', 'Observações', ERRO_DAS_OBSERVACOES);
  }

  if (f.portes.length === 0) e('portes', 'Portes aceitos', 'Marque pelo menos um porte.');
  return erros;
}

// ----------------------------------------------------------------- montagem

function imagens(f: EstadoDoFormulario): ImagemInput[] {
  return f.fotos
    .filter((x): x is FotoDoFormulario & { uploadId: string } => !!x.uploadId && FOTO_QUE_VAI.has(x.estado))
    .map((x) => ({ upload_id: x.uploadId, alt_text: x.alt.trim() }));
}

function lugar(f: EstadoDoFormulario): LugarInput {
  return {
    place_name: f.local.trim(),
    neighborhood: f.bairro.trim(),
    city: f.cidade.trim(),
    state: f.uf,
    ...(f.ponto ? { point: f.ponto } : {}),
  };
}

function acesso(f: EstadoDoFormulario): NonNullable<EncontroInput['admission']> {
  if (!f.pago) return { kind: 'free' };
  const amount = centavosDoTexto(f.valor);
  if (amount === null) throw new Error('valor invalido chegou a montagem; valide antes');
  return { kind: 'paid', price: { amount, currency: 'BRL', unit: f.unidade } };
}

/**
 * Corpo de `createAdminNetworkEvent`. Sem `slug` (o servidor deriva). O
 * `time_zone` vai explicito com o padrao do contrato: o gerador de tipos torna
 * obrigatorio no corpo todo campo que declara `default`.
 */
export function montarCriacao(f: EstadoDoFormulario): EncontroInput {
  const starts = instanteDoCampo(f.inicio);
  if (!starts) throw new Error('inicio invalido chegou a montagem; valide antes');
  const ends = f.fim ? instanteDoCampo(f.fim) : null;
  const notas = f.observacoes.trim();
  return {
    title: f.titulo.trim(),
    summary: f.resumo.trim(),
    place: lugar(f),
    starts_at: starts,
    ...(ends ? { ends_at: ends } : {}),
    time_zone: FUSO_PADRAO,
    images: imagens(f),
    accepted_sizes: [...f.portes],
    dog_age: f.idade,
    vaccination_required: f.vacina,
    fenced_off_leash_area: f.cercada,
    amenities: [...f.estrutura],
    visibility: f.visibilidade,
    admission: acesso(f),
    bring_items: [...f.levar],
    ...(notas ? { notes: notas } : {}),
  };
}

const mesmoConjunto = <T>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every((x) => b.includes(x));

export type ParteDoLugar = 'data' | 'horário' | 'local';

export interface PlanoDeEdicao {
  patch: EncontroPatch | null;
  mudanca: Omit<Mudanca, 'reason'> | null;
  oQueMudou: ParteDoLugar[];
  acesso: Omit<MudancaDeAcesso, 'reason'> | null;
}

export function planoDeEdicao(original: Encontro, f: EstadoDoFormulario): PlanoDeEdicao {
  const fuso = original.time_zone || FUSO_PADRAO;
  const patch: EncontroPatch = {};
  if (f.titulo.trim() !== original.title) patch.title = f.titulo.trim();
  if (f.resumo.trim() !== original.summary) patch.summary = f.resumo.trim();
  // A galeria compara pela chave estavel de cada foto, e nao pelo `upload_id`: a foto com
  // `upload_id` nulo (conta que a enviou foi apagada) nao pode ir em `images`, e mandar a
  // galeria sem ela a remove. So vai `images` quando as fotos mudaram de verdade.
  const antigas = [...original.images].sort((a, b) => a.position - b.position);
  const fotosIguais =
    f.fotos.length === antigas.length &&
    f.fotos.every((x, i) => {
      const a = antigas[i];
      return !!a && x.chave === chaveDaImagem(a) && x.alt.trim() === a.alt_text;
    });
  if (!fotosIguais) patch.images = imagens(f);
  if (!mesmoConjunto(f.levar, original.bring_items)) patch.bring_items = [...f.levar];
  const notas = f.observacoes.trim() || null;
  if (notas !== (original.notes ?? null)) patch.notes = notas;
  if (!mesmoConjunto(f.portes, original.accepted_sizes)) patch.accepted_sizes = [...f.portes];
  if (f.idade !== original.dog_age) patch.dog_age = f.idade;
  if (f.vacina !== original.vaccination_required) patch.vaccination_required = f.vacina;
  if (f.cercada !== original.fenced_off_leash_area) patch.fenced_off_leash_area = f.cercada;
  if (!mesmoConjunto(f.estrutura, original.amenities)) patch.amenities = [...f.estrutura];

  const mudanca: Omit<Mudanca, 'reason'> = {};
  const oQueMudou = new Set<ParteDoLugar>();
  const inicioAntigo = campoDoInstante(original.starts_at, fuso);
  if (f.inicio !== inicioAntigo) {
    const novo = instanteDoCampo(f.inicio, fuso);
    if (novo) mudanca.starts_at = novo;
    if (f.inicio.slice(0, 10) !== inicioAntigo.slice(0, 10)) oQueMudou.add('data');
    if (f.inicio.slice(11) !== inicioAntigo.slice(11)) oQueMudou.add('horário');
  }
  const fimAntigo = original.ends_at ? campoDoInstante(original.ends_at, fuso) : '';
  if (f.fim !== fimAntigo) {
    mudanca.ends_at = f.fim ? instanteDoCampo(f.fim, fuso) : null;
    if (f.fim.slice(0, 10) !== fimAntigo.slice(0, 10)) oQueMudou.add('data');
    if (f.fim.slice(11) !== fimAntigo.slice(11)) oQueMudou.add('horário');
  }
  const p = original.place;
  const pontoIgual =
    (f.ponto?.lat ?? null) === (p.point?.lat ?? null) && (f.ponto?.lon ?? null) === (p.point?.lon ?? null);
  const lugarMudou =
    f.local.trim() !== p.place_name ||
    f.bairro.trim() !== p.neighborhood ||
    f.cidade.trim() !== p.city ||
    f.uf !== p.state ||
    !pontoIgual;
  if (lugarMudou) {
    // O lugar vai inteiro. Tirar o ponto e mandar `point: null`, que o contrato aceita.
    mudanca.place = { ...lugar(f), ...(f.ponto ? {} : { point: null }) };
    oQueMudou.add('local');
  }

  const acessoNovo: Omit<MudancaDeAcesso, 'reason'> = {};
  if (f.visibilidade !== original.visibility) acessoNovo.visibility = f.visibilidade;
  const precoAntigo = original.admission.price ?? null;
  const amountNovo = f.pago ? centavosDoTexto(f.valor) : null;
  const custoMudou =
    f.pago !== (original.admission.kind === 'paid') ||
    (f.pago && (amountNovo !== precoAntigo?.amount || f.unidade !== precoAntigo?.unit));
  if (custoMudou) acessoNovo.admission = acesso(f);

  const ordem: ParteDoLugar[] = ['data', 'horário', 'local'];
  return {
    patch: Object.keys(patch).length ? patch : null,
    mudanca: Object.keys(mudanca).length ? mudanca : null,
    oQueMudou: ordem.filter((x) => oQueMudou.has(x)),
    acesso: Object.keys(acessoNovo).length ? acessoNovo : null,
  };
}

// ------------------------------------------------ textos do dialogo com senha

/** "data", "data e local", "data, horário e local". */
export function listaEmPortugues(itens: readonly string[]): string {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`;
}

export function tituloDaMudanca(plano: PlanoDeEdicao): string {
  const partes: string[] = [];
  if (plano.mudanca) partes.push(listaEmPortugues(plano.oQueMudou));
  if (plano.acesso) partes.push(plano.mudanca ? 'de acesso' : 'acesso');
  return `Salvar a mudança de ${partes.join(' e ')}?`;
}

export function corpoDaMudanca(original: Encontro, f: EstadoDoFormulario, plano: PlanoDeEdicao): string[] {
  const frases: string[] = [];
  if (plano.mudanca) {
    const dados: string[] = [];
    if (plano.oQueMudou.includes('data') || plano.oQueMudou.includes('horário')) {
      const ini = instanteDoCampo(f.inicio);
      const fim = f.fim ? instanteDoCampo(f.fim) : null;
      if (ini) dados.push(`${dataCurta(ini)}, ${faixaDeHorario(ini, fim)}`);
    }
    if (plano.oQueMudou.includes('local')) {
      const mesmoNome = f.local.trim() === original.place.place_name && f.bairro.trim() === original.place.neighborhood;
      if (!mesmoNome) dados.push(`${f.local.trim()}, ${f.bairro.trim()}`);
      else dados.push(f.ponto ? 'o ponto novo no mapa' : 'o encontro sem mapa');
    }
    frases.push(
      `O app passa a mostrar ${dados.join(', em ')}. Quem usa o app não é avisado da mudança.`,
    );
  }
  if (plano.acesso) {
    const partes: string[] = [];
    if (plano.acesso.visibility) partes.push(plano.acesso.visibility === 'private' ? 'agora é privado' : 'agora é público');
    const adm = plano.acesso.admission;
    if (adm) {
      const eraPago = original.admission.kind === 'paid';
      if (adm.kind === 'paid' && adm.price && eraPago) partes.push(`o valor muda para ${valorComoOAppMostra(adm.price.amount, adm.price.unit)}`);
      else partes.push(adm.kind === 'paid' ? 'agora é pago' : 'agora é gratuito');
    }
    frases.push(`O encontro ${listaEmPortugues(partes)}, e o app mostra isso na hora.`);
    if (plano.acesso.visibility === 'private') frases.push('O link antigo do encontro para de funcionar.');
  }
  // UX 30, B3 e B11: o aviso aos administradores e uma frase so, no fim, e nao uma por mudanca.
  if (plano.mudanca || plano.acesso) frases.push('Todos os administradores recebem um e-mail com o antes e o depois.');
  return frases;
}
