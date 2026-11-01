import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';

import type { Esquemas } from '../api/cliente.ts';
import { errosDoProblema, tipoDoProblema, versaoComoEtag } from '../api/problema.ts';
import { Banner, CampoDeTexto, ErroDoCampo } from '../componentes/basicos.tsx';
import { CampoDeImagem } from '../componentes/CampoDeImagem.tsx';
import {
  BannerDaFalha,
  carregarPorChave,
  CargaQueFalhou,
  ResumoDosCampos,
  RodapeDoFormulario,
  useCargaDoFormulario,
  useRascunhoDoFormulario,
  useResumoDeErros,
  VoltarPara,
  type FalhaDoFormulario,
} from '../componentes/casca-de-formulario.tsx';
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
import { retomarRascunho } from '../sessao/rascunho.ts';
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
   * AS ATIVIDADES, de 1 a 6 (cliente, 21/10/2026): uma clinica que tambem faz banho
   * e tosa deixou de ter de escolher.
   */
  atividades: TipoDaEntrada[];
  /** O QUE a entrada e -- eixo SEPARADO de [atividade], que e o que ela faz. */
  tipoDeEntidade: TipoDeEntidadeDaEntrada;
  sobre: string;
  cidade: string;
  uf: string;
  bairro: string;
  /** Com mascara (`05435-000`). */
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  /** Com mascara brasileira. O E.164 sai de `telefoneEmE164`, no `salvar`. */
  telefone: string;
  /**
   * O SITE do estabelecimento (cliente, 21/10/2026), **cru e nao normalizado**: o
   * endereco completo com `https://`, como a pessoa conferiu na tela.
   */
  site: string;
  /** A logo e a foto guardam **o que a pessoa fez**, e nao a imagem gravada: */
  logoUploadId: string | null | undefined;
  fotoUploadId: string | null | undefined;
  /** A GALERIA (cliente, 29/10/2026: *"implemente a tabela de galeria entao"*). */
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

/** O FORMULARIO DE CADASTRO NOVO, em branco. */
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
  situacao: 'published',
};

/** A conferencia local, com as MESMAS reguas do servidor. */
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
  if (v.site.trim() !== '') {
    const recusa = mensagemDoSite(v.site);
    if (recusa !== null) e['e-site'] = recusa;
  }
  if (v.imagens.some((im) => precisaDeDescricao(im) && !descricaoAceitavel(im.alt, false))) {
    e['e-galeria'] = 'Escreva pelo menos duas letras na descrição, ou deixe o campo vazio.';
  }
  return e;
}

function imagensDoCorpo(v: Pick<Valores, 'imagens'>): Esquemas['CatalogImageInput'][] {
  return v.imagens
    .filter((im): im is ImagemDaGaleria & { uploadId: string } => typeof im.uploadId === 'string')
    .map((im) => {
      const alt = im.alt.trim();
      return { upload_id: im.uploadId, ...(alt === '' ? {} : { alt_text: alt }) };
    });
}

/** A imagem que a galeria nao consegue reenviar (`upload_id` nulo na leitura). */
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

const assinaturaDaGaleria = (v: Pick<Valores, 'imagens'>): string =>
  JSON.stringify(v.imagens.map((im) => [im.chave, im.alt.trim()]));

/**
 * O que vai para o rascunho da sessao: **sem arquivo e sem previa local**, que nao
 * sobrevivem a recarga, e sem a imagem que ainda nao tem `upload_id`.
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
    atividades: [...entrada.kinds],
    tipoDeEntidade: entrada.entity_kind,
    sobre: entrada.about ?? '',
    cidade: entrada.city ?? '',
    uf: entrada.state ?? '',
    bairro: entrada.neighborhood ?? '',
    cep: cepDosOitoDigitos(entrada.postal_code),
    logradouro: entrada.street ?? '',
    numero: entrada.street_number ?? '',
    complemento: entrada.complement ?? '',
    telefone: telefoneDoE164(entrada.phone_e164),
    site: entrada.site_url ?? '',
    logoUploadId: undefined,
    fotoUploadId: undefined,
    imagens: [...entrada.images]
      .sort((a, b) => a.position - b.position)
      .map((im) => ({
        chave: im.upload_id ?? `sem-envio-${String(im.position)}`,
        ...(im.upload_id === null ? {} : { uploadId: im.upload_id }),
        alt: im.alt_text ?? '',
        estado: im.status,
        motivo: im.rejection_reason ?? null,
        previa: im.url ?? null,
      })),
    situacao: entrada.status,
  };
}

/**
 * A ENTRADA DUPLICADA (cliente, 28/10/2026): *"Implemente um recurso de duplicar
 * estabelecimento no backoffice"*.
 */
export function valoresDuplicados(entrada: Entrada): Valores {
  return {
    ...valoresDa(entrada),
    slug: '',
    slugEditado: false,
    logoUploadId: undefined,
    fotoUploadId: undefined,
    imagens: [],
    situacao: VAZIO.situacao,
  };
}

/** Cadastro e edicao de uma entrada do diretorio de `Perto`. */
export default function FormularioDaEntrada() {
  const { entrySlug } = useParams();
  const editando = entrySlug !== undefined;
  const { api } = useSessao();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [parametros] = useSearchParams();
  const duplicarDe = editando ? undefined : (parametros.get('duplicarDe') ?? undefined);
  const chaveDoRascunho = duplicarDe ? `${pathname}?duplicarDe=${duplicarDe}` : pathname;
  const slugParaCarregar = entrySlug ?? duplicarDe;
  const {
    chave: chaveDaCarga,
    fase,
    definir: setCarga,
    recarregar,
  } = useCargaDoFormulario(entrySlug ?? (duplicarDe ? `dup:${duplicarDe}` : undefined));
  const [entrada, setEntrada] = useState<Entrada>();
  const [etag, setEtag] = useState<string>();
  const [valores, setValores] = useState<Valores>(() =>
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
  const [falha, setFalha] = useState<FalhaDoFormulario>();
  const { referencia: resumo, focar } = useResumoDeErros();
  const liberado = useRef(false);

  useEffect(() => {
    if (!slugParaCarregar) return;
    return carregarPorChave(chaveDaCarga, setCarga, async (sinal) => {
      const { data, response } = await api.GET('/admin/directory/entries/{entrySlug}', {
        params: { path: { entrySlug: slugParaCarregar } },
        signal: sinal,
      });
      if (sinal.aborted) return undefined;
      if (!data) return response.status === 404 ? 'nao-encontrado' : 'erro';
      if (editando) {
        setEntrada(data);
        setEtag(versaoComoEtag(data.version));
        setBase(valoresDa(data));
        setValores(retomarRascunho<Valores>(chaveDoRascunho) ?? valoresDa(data));
      } else {
        setValores(retomarRascunho<Valores>(chaveDoRascunho) ?? valoresDuplicados(data));
      }
      return 'pronto';
    });
  }, [api, slugParaCarregar, editando, chaveDoRascunho, chaveDaCarga, setCarga]);

  useRascunhoDoFormulario(chaveDoRascunho, valores, paraRascunho);

  const erros = tentou ? { ...errosDoServidor, ...validarEntrada(valores) } : errosDoServidor;

  function mudar(mudanca: Partial<Valores>) {
    setErrosDoServidor({});
    setValores((v) => {
      const novo = { ...v, ...mudanca };
      if (mudanca.nome !== undefined && !novo.slugEditado) novo.slug = slugSugerido(mudanca.nome);
      return novo;
    });
  }

  async function buscarEndereco(cep: string) {
    setBuscaDoCep('buscando');
    try {
      const { data, response } = await api.GET('/admin/postal-codes/{postalCode}', {
        params: { path: { postalCode: cep } },
      });
      if (!data) {
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
    focar();
  }

  function voltar(aviso?: string) {
    liberado.current = true;
    void navigate('/perto', aviso ? { state: { aviso } } : {});
  }

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
      const cep = valores.cep.trim() === '' ? null : cepEmOitoDigitos(valores.cep);

      if (!editando) {
        const { data, error } = await api.POST('/admin/directory/entries', {
          body: {
            slug: valores.slug,
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
            ...(typeof valores.logoUploadId === 'string'
              ? { logo_upload_id: valores.logoUploadId }
              : {}),
            ...(typeof valores.fotoUploadId === 'string'
              ? { photo_upload_id: valores.fotoUploadId }
              : {}),
            images: imagensDoCorpo(valores),
            status: valores.situacao === 'draft' ? 'draft' : 'published',
          },
        });
        if (data) {
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
        ...(telefone !== (entrada.phone_e164 ?? null) ? { phone_e164: telefone } : {}),
        ...(ou(valores.site) !== (entrada.site_url ?? null) ? { site_url: ou(valores.site) } : {}),
        ...(logoNoPatch !== undefined ? { logo_upload_id: logoNoPatch } : {}),
        ...(fotoNoPatch !== undefined ? { photo_upload_id: fotoNoPatch } : {}),
        ...(assinaturaDaGaleria(valores) === assinaturaDaGaleria(base)
          ? {}
          : { images: imagensDoCorpo(valores) }),
        ...(valores.situacao !== entrada.status ? { status: valores.situacao } : {}),
      };
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
          e['e-site'] =
            MENSAGEM_DO_SITE[erro.code as CodigoDoSite] ?? MENSAGEM_DO_SITE.site_url_invalid;
        }
      }
      if (Object.keys(e).length) return mostrar(e);
    }
    setFalha({ texto: 'Não conseguimos salvar a entrada. Confira os campos e tente de novo.' });
  }

  const voltarLink = <VoltarPara para="/perto">Voltar para Perto</VoltarPara>;

  if (fase === 'carregando') return <p role="status">Carregando…</p>;
  if (fase !== 'pronto') {
    return (
      <CargaQueFalhou voltar={voltarLink}>
        {fase === 'nao-encontrado'
          ? duplicarDe
            ? 'A entrada que você quer duplicar não existe mais.'
            : 'Esta entrada não existe mais.'
          : duplicarDe
            ? 'Não conseguimos carregar a entrada que você quer duplicar.'
            : 'Não conseguimos carregar a entrada.'}
      </CargaQueFalhou>
    );
  }

  const lista = ORDEM.filter((c) => erros[c]).map((c) => ({ campo: c, rotulo: ROTULOS[c] }));
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
        {
}
        {duplicarDe && (
          <Banner tipo="info">
            Copiado de <strong>{duplicarDe}</strong>. O identificador ficou em branco porque ele é o
            endereço público e não pode repetir. Avaliações, verificação e as imagens não vêm na
            cópia — confira os dados e cadastre.
          </Banner>
        )}
        <ResumoDosCampos referencia={resumo} erros={lista} acao="salvar" />
        <BannerDaFalha falha={falha} aoRecarregar={recarregar} />
        {
}
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

        {

}
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

        {

}
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
            void buscarEndereco(cep);
          }}
          erro={erros['e-cep']}
          erroDeForma={erroDoCep}
          aoMudarErroDeForma={setErroDoCep}
          ajuda="Opcional. Ao completar os oito dígitos, buscamos rua, bairro, cidade e UF e preenchemos o que estiver em branco. Nada do que você digitou é alterado, e você pode editar tudo depois."
        />
        {
}
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

        {
}
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

        {

}
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
          descricaoObrigatoria={false}
          reservaDaDescricao="o nome da entrada"
          ajuda={`JPG, PNG ou WebP, até ${LIMITE_EM_MB} MB cada, com pelo menos ${String(DIMENSAO_MINIMA.directory_gallery.largura)} × ${String(DIMENSAO_MINIMA.directory_gallery.altura)} pixels. A primeira é a capa da galeria. Arraste para reordenar, ou use os botões de mover.`}
          erro={erros['e-galeria']}
          marca={(im) => (semEnvioNaGaleria(im) ? MARCA_SEM_ENVIO : undefined)}
        />
        {avisoDeImagensSemEnvio(valores) && (
          <Banner tipo="alerta">{avisoDeImagensSemEnvio(valores)}</Banner>
        )}

        {

}
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

        {
}
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

        <RodapeDoFormulario
          cancelarPara="/perto"
          rotulo={editando ? 'Salvar alterações' : 'Cadastrar entrada'}
          salvando={salvando}
          dataCy="entrada-salvar"
        />
      </form>
      <SairSemSalvar sujo={sujo && !salvando} liberado={liberado} />
    </>
  );
}
