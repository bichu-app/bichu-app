import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import type { Esquemas } from '../api/cliente.ts';
import { errosDoProblema, tipoDoProblema, versaoComoEtag } from '../api/problema.ts';
import { Banner, CampoDeTexto, ErroDoCampo, ResumoDeErros } from '../componentes/basicos.tsx';
import { CampoDeCep, CampoDeTelefone } from '../componentes/campos.tsx';
import { Icone } from '../componentes/Icone.tsx';
import { SairSemSalvar } from '../componentes/SairSemSalvar.tsx';
import { cepDosOitoDigitos, cepEmOitoDigitos } from '../formato/cep.ts';
import { telefoneDoE164, telefoneEmE164 } from '../formato/telefone.ts';
import { useSessao } from '../sessao/ProvedorDeSessao.tsx';
import { guardarRascunho, retomarRascunho } from '../sessao/rascunho.ts';
import {
  ATIVIDADES,
  frasePendente,
  MENSAGEM_DO_SLUG,
  ORDEM_DAS_ATIVIDADES,
  PADRAO_DA_UF,
  PADRAO_DO_SLUG,
  SITUACOES,
  slugSugerido,
  type Entrada,
  type StatusDaEntrada,
  type TipoDaEntrada,
} from './dominio.ts';

interface Valores {
  nome: string;
  slug: string;
  slugEditado: boolean;
  atividade: TipoDaEntrada | '';
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
  situacao: StatusDaEntrada;
}

type Campo =
  | 'e-nome'
  | 'e-slug'
  | 'e-atividade'
  | 'e-sobre'
  | 'e-cidade'
  | 'e-uf'
  | 'e-bairro'
  | 'e-cep'
  | 'e-logradouro'
  | 'e-numero'
  | 'e-complemento'
  | 'e-telefone';

const ROTULOS: Record<Campo, string> = {
  'e-nome': 'Nome',
  'e-slug': 'Identificador',
  'e-atividade': 'Atividade',
  'e-sobre': 'Apresentação',
  'e-cidade': 'Cidade',
  'e-uf': 'UF',
  'e-bairro': 'Bairro',
  'e-cep': 'CEP',
  'e-logradouro': 'Rua',
  'e-numero': 'Número',
  'e-complemento': 'Complemento',
  'e-telefone': 'Telefone comercial',
};

const ORDEM: Campo[] = [
  'e-nome',
  'e-slug',
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
];

const VAZIO: Valores = {
  nome: '',
  slug: '',
  slugEditado: false,
  atividade: '',
  sobre: '',
  cidade: '',
  uf: '',
  bairro: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  telefone: '',
  situacao: 'draft',
};

/**
 * A conferencia local, com as MESMAS reguas do servidor.
 *
 * Ela nao substitui a do servidor -- a do servidor e a que vale --, e existe
 * para a recusa chegar sem uma viagem a rede. Por isso cada regua aqui aponta
 * para a sua origem: tamanho de `CHECK`, formato de `slug`, E.164 de telefone.
 *
 * **Cidade, UF e telefone nao sao obrigatorios aqui**, e isso e deliberado: a
 * entrada nasce RASCUNHO, e o rascunho guarda trabalho incompleto. Quem cobra
 * os tres e a publicacao, e `missing_to_publish` diz o que falta antes de
 * alguem tentar.
 *
 * **CEP, rua, numero e complemento nao sao obrigatorios NUNCA**, nem no
 * rascunho nem na publicacao, e isso nao e simetria com os de cima -- e
 * produto. Um profissional autonomo (adestrador, passeador, veterinario que
 * atende em casa) nao tem endereco comercial, e exigir o dele significaria
 * exigir a casa dele. Nenhum dos quatro entra em `missing_to_publish`, e a
 * regua do servidor concorda: no contrato eles sao opcionais nos dois corpos.
 */
export function validarEntrada(v: Valores): Partial<Record<Campo, string>> {
  const e: Partial<Record<Campo, string>> = {};
  const nome = v.nome.trim();
  if (nome.length < 2 || nome.length > 120) {
    e['e-nome'] = 'Informe o nome, de 2 a 120 caracteres.';
  }
  if (!PADRAO_DO_SLUG.test(v.slug)) e['e-slug'] = MENSAGEM_DO_SLUG;
  if (v.atividade === '') e['e-atividade'] = 'Escolha a atividade.';
  const sobre = v.sobre.trim();
  if (sobre !== '' && (sobre.length < 2 || sobre.length > 2000)) {
    e['e-sobre'] = 'Entre 2 e 2000 caracteres.';
  }
  const cidade = v.cidade.trim();
  if (cidade !== '' && (cidade.length < 2 || cidade.length > 80)) {
    e['e-cidade'] = 'Entre 2 e 80 caracteres.';
  }
  const uf = v.uf.trim();
  if (uf !== '' && !PADRAO_DA_UF.test(uf)) e['e-uf'] = 'Use a sigla do estado, com duas letras.';
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
  if (v.telefone.trim() !== '' && telefoneEmE164(v.telefone) === null) {
    e['e-telefone'] = 'Informe o telefone com DDD. Por exemplo: (11) 3061-2200.';
  }
  return e;
}

function valoresDa(entrada: Entrada): Valores {
  return {
    nome: entrada.display_name,
    slug: entrada.slug,
    slugEditado: true,
    atividade: entrada.kind,
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
    situacao: entrada.status,
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
 * - **Nenhum site, e-mail, WhatsApp, rede social, horario de funcionamento nem
 *   foto.** Nenhuma dessas colunas existe em `professionals`. O padrao de site
 *   do produto (endereco completo com `https://`) nao tem onde ser aplicado
 *   aqui enquanto nao houver coluna.
 * - **ONG.** Nao ha valor para organizacao em `professionals.kind`. Decisao 9.1
 *   pendente, e o seletor de atividade diz isso em voz alta.
 */
export default function FormularioDaEntrada() {
  const { entrySlug } = useParams();
  const editando = entrySlug !== undefined;
  const { api, registrarRascunho } = useSessao();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [carga, setCarga] = useState<{ chave: string; fase: 'pronto' | 'erro' | 'nao-encontrado' }>();
  const [entrada, setEntrada] = useState<Entrada>();
  const [etag, setEtag] = useState<string>();
  const [valores, setValores] = useState<Valores>(() =>
    editando ? VAZIO : (retomarRascunho<Valores>(pathname) ?? VAZIO),
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

  const chaveDaCarga = `${entrySlug ?? 'novo'}#${versao}`;
  const fase = !editando ? 'pronto' : carga?.chave === chaveDaCarga ? carga.fase : 'carregando';

  useEffect(() => {
    if (!entrySlug) return;
    const controle = new AbortController();
    const chave = chaveDaCarga;
    api
      .GET('/admin/directory/entries/{entrySlug}', {
        params: { path: { entrySlug } },
        signal: controle.signal,
      })
      .then(({ data, response }) => {
        if (controle.signal.aborted) return;
        if (!data) {
          setCarga({ chave, fase: response.status === 404 ? 'nao-encontrado' : 'erro' });
          return;
        }
        setEntrada(data);
        // Do `version`, e nao do ETag do cabecalho: a borda o sufixa
        // ("3-zstd") e o If-Match daria 412 em toda escrita.
        setEtag(versaoComoEtag(data.version));
        setBase(valoresDa(data));
        setValores(retomarRascunho<Valores>(pathname) ?? valoresDa(data));
        setCarga({ chave, fase: 'pronto' });
      })
      .catch(() => {
        if (!controle.signal.aborted) setCarga({ chave, fase: 'erro' });
      });
    return () => controle.abort();
  }, [api, entrySlug, pathname, chaveDaCarga]);

  const valoresRef = useRef(valores);
  useLayoutEffect(() => {
    valoresRef.current = valores;
  });
  useEffect(
    () => registrarRascunho(() => guardarRascunho(pathname, valoresRef.current)),
    [registrarRascunho, pathname],
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
            kind: valores.atividade as TipoDaEntrada,
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
          },
        });
        if (data) {
          return voltar(
            'Entrada cadastrada, em rascunho. Para ela aparecer em Perto, publique na edição.',
          );
        }
        return recusa(error);
      }

      if (!entrada || !etag) return;
      const patch: Esquemas['AdminDirectoryEntryPatch'] = {
        ...(valores.slug !== entrada.slug ? { slug: valores.slug } : {}),
        ...(valores.atividade !== entrada.kind ? { kind: valores.atividade as TipoDaEntrada } : {}),
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
        } else if (erro.field === 'street') e['e-logradouro'] = 'Entre 2 e 120 caracteres.';
        else if (erro.field === 'street_number') e['e-numero'] = 'Até 20 caracteres.';
        else if (erro.field === 'complement') e['e-complemento'] = 'Até 80 caracteres.';
        else if (erro.field === 'phone_e164') {
          e['e-telefone'] =
            erro.code === 'required'
              ? 'Uma entrada no ar precisa de um telefone: hoje ele é o único canal de contato do cadastro.'
              : 'Informe o telefone com DDD. Por exemplo: (11) 3061-2200.';
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
          {fase === 'nao-encontrado'
            ? 'Esta entrada não existe mais.'
            : 'Não conseguimos carregar a entrada.'}
        </Banner>
      </div>
    );
  }

  const lista = ORDEM.filter((c) => erros[c]).map((c) => ({ campo: c, rotulo: ROTULOS[c] }));
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
        <h1 className="t-headline">{entrada ? entrada.display_name : 'Nova entrada'}</h1>
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

        <div className={erros['e-atividade'] ? 'field err' : 'field'}>
          <label htmlFor="e-atividade">Atividade *</label>
          <div className="ordem sel campo-sel">
            <select
              id="e-atividade"
              data-cy="entrada-atividade"
              value={valores.atividade}
              onChange={(e) => mudar({ atividade: e.target.value as TipoDaEntrada | '' })}
              aria-invalid={erros['e-atividade'] ? true : undefined}
              aria-describedby="e-atividade-ajuda"
            >
              <option value="">Escolha a atividade</option>
              {ORDEM_DAS_ATIVIDADES.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {ATIVIDADES[tipo]}
                </option>
              ))}
            </select>
            <Icone nome="expand" tamanho="s20" />
          </div>
          {/* O limite do modelo, dito ao operador em vez de descoberto por ele.
              Não há valor para ONG em `professionals.kind` (decisão 9.1). */}
          <span className="help" id="e-atividade-ajuda">
            Ainda não há opção para ONG: o cadastro de ONG depende de uma decisão de modelo que está
            em aberto. Clínica e estabelecimento usam a primeira opção.
          </span>
          {erros['e-atividade'] && <ErroDoCampo id="e-atividade-erro">{erros['e-atividade']}</ErroDoCampo>}
        </div>

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
          rotulo="Cidade"
          valor={valores.cidade}
          aoMudar={(v) => mudar({ cidade: v })}
          maximo={80}
          erro={erros['e-cidade']}
          ajuda="Precisa estar preenchida para a entrada aparecer em Perto."
        />

        <CampoDeTexto
          id="e-uf"
          dataCy="entrada-uf"
          rotulo="UF"
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
          rotulo="Telefone comercial"
          valor={valores.telefone}
          aoMudar={(v) => mudar({ telefone: v })}
          erro={erros['e-telefone']}
          erroDeForma={erroDoTelefone}
          aoMudarErroDeForma={setErroDoTelefone}
          ajuda="Com DDD. É o único canal de contato do cadastro hoje, e precisa estar preenchido para a entrada aparecer em Perto."
        />

        {editando && (
          <fieldset className="field" aria-describedby="e-situacao-ajuda">
            <legend className="lab">Situação</legend>
            <div className="checks">
              {(['published', 'draft', 'hidden', 'removed'] as StatusDaEntrada[]).map((situacao) => (
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
              Só “No ar” aparece na seção Perto. Editar outros campos não muda a situação: tirar do ar é
              uma escolha feita aqui. “Removida” tira a entrada do diretório sem apagar o registro.
            </span>
          </fieldset>
        )}

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
