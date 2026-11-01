/** O aviso de que se trata. */
export type TipoDeAvisoPush =
  /** Alguém escaneou a tag da coleira. */
  | 'tagEscaneada'
  /** Um achado avulso pode ser o pet desta pessoa. */
  | 'possivelCorrespondencia'
  /** Um pet sumiu no raio de 5 km de quem recebe. */
  | 'alertaDeVizinhanca'
  /** "O pet voltou para casa?", 24 h depois e a cada 48 h. */
  | 'lembreteDeDesfecho';

/** A falha da porteira. */
export class VazamentoNoPushError extends Error {
  readonly campo: string;
  readonly padrao: string;

  constructor(campo: string, padrao: string) {
    super(
      `Conteúdo bloqueado antes de sair: o campo "${campo}" contém algo com ` +
        `forma de ${padrao}, e notificação é superfície pública (ADR-0010). O ` +
        `valor NÃO é impresso aqui — ele é justamente o que não pode ser ` +
        `copiado para o log. Ver o cabeçalho de domain/conteudo-do-push.ts.`,
    );
    this.name = 'VazamentoNoPushError';
    this.campo = campo;
    this.padrao = padrao;
  }
}

const PADROES_PROIBIDOS: ReadonlyArray<{ nome: string; regex: RegExp }> = [
  { nome: 'UUID de banco', regex: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i },
  { nome: 'UUID sem hífens', regex: /(?:^|[^0-9a-z])[0-9a-f]{32}(?:[^0-9a-z]|$)/i },
  {
    nome: 'endereço de e-mail',
    regex: /(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/i,
  },
  { nome: 'telefone', regex: /(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}/ },
  { nome: 'CEP', regex: /\b\d{5}-?\d{3}\b/ },
  {
    nome: 'logradouro',
    regex: /\b(?:rua|avenida|av\.|alameda|travessa|rodovia|estrada|pra[cç]a|viela|beco|largo)\b/i,
  },
  { nome: 'coordenada geográfica', regex: /-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/ },
];

const CHAVES_PROIBIDAS: ReadonlySet<string> = new Set([
  'pet_id', 'petid', 'user_id', 'userid', 'case_id', 'caseid',
  'device_id', 'deviceid', 'conversation_id', 'conversationid',
  'owner_id', 'ownerid', 'finder_id', 'finderid', 'report_id', 'reportid',
  'email', 'e_mail', 'phone', 'telefone', 'celular', 'whatsapp',
  'endereco', 'address', 'cep', 'lat', 'lng', 'latitude', 'longitude',
  'sobrenome', 'last_name', 'lastname', 'cpf',
]);

interface CampoQueSai {
  readonly nome: string;
  readonly valor: string;
}

/**
 * A porteira. Roda sobre TUDO que vai no fio, e não sobre o que a montagem achou
 * que era arriscado.
 */
export function assegurarSuperficiePublica(mensagem: {
  readonly titulo: string;
  readonly corpo: string;
  readonly dados: Readonly<Record<string, string>>;
  readonly chaveDeAgrupamento: string;
}): void {
  const campos: CampoQueSai[] = [
    { nome: 'titulo', valor: mensagem.titulo },
    { nome: 'corpo', valor: mensagem.corpo },
    { nome: 'chaveDeAgrupamento', valor: mensagem.chaveDeAgrupamento },
  ];

  for (const [chave, valor] of Object.entries(mensagem.dados)) {
    if (CHAVES_PROIBIDAS.has(chave.toLowerCase())) {
      throw new VazamentoNoPushError(`dados.${chave}`, 'campo cujo nome o ADR-0010 proíbe');
    }
    campos.push({ nome: `dados.${chave} (nome do campo)`, valor: chave });
    campos.push({ nome: `dados.${chave}`, valor });
  }

  for (const campo of campos) {
    for (const padrao of PADROES_PROIBIDOS) {
      if (padrao.regex.test(campo.valor)) {
        throw new VazamentoNoPushError(campo.nome, padrao.nome);
      }
    }
  }
}

/** O que o chamador tem em mãos quando vai notificar. */
export interface ContextoDoAviso {
  readonly tipo: TipoDeAvisoPush;
  readonly token: string;

  /**
   * O nome do pet. Vai no texto, e pode: o ADR-0010 proíbe o **sobrenome do tutor**,
   * não o nome do animal, e todo texto de UX 12.2 usa o nome.
   */
  readonly nomeDoPet: string;

  /**
   * A chave estável e opaca do que o aviso trata — o `share_token`, o mesmo que o
   * link de compartilhamento já carrega.
   */
  readonly tokenPublico: string;

  /**
   * Bairro, quando houver. É o teto de precisão geográfica em superfície pública, e
   * os textos de UX 12.2 o usam ("na Vila Madalena").
   */
  readonly bairro?: string | undefined;

  /** Muda o texto de `tagEscaneada`: o tutor que não sabe é o caso mais urgente. */
  readonly casoAberto?: boolean | undefined;

  /** Espécie por extenso, para o alerta de vizinhança ("Um cão sumiu perto de você"). */
  readonly especie?: string | undefined;

  /** A foto, já como URL pública do hostname de mídia. */
  readonly imagemUrl?: string | undefined;

  /** Tudo o que o chamador tem e que **não sai daqui**. */
  readonly sigiloso?: Readonly<Record<string, string | undefined>> | undefined;
}

/** O resultado: exatamente os campos que a porta transporta. */
export interface ConteudoDoPush {
  readonly titulo: string;
  readonly corpo: string;
  readonly dados: Readonly<Record<string, string>>;
  readonly chaveDeAgrupamento: string;
  readonly validadeEmSegundos: number;
  readonly prioridade: 'alta' | 'normal';
}

const SEIS_HORAS = 6 * 60 * 60;
const VINTE_E_QUATRO_HORAS = 24 * 60 * 60;

const PERFIL: Readonly<
  Record<TipoDeAvisoPush, { validadeEmSegundos: number; prioridade: 'alta' | 'normal' }>
> = {
  tagEscaneada: { validadeEmSegundos: VINTE_E_QUATRO_HORAS, prioridade: 'alta' },
  possivelCorrespondencia: { validadeEmSegundos: VINTE_E_QUATRO_HORAS, prioridade: 'alta' },
  alertaDeVizinhanca: { validadeEmSegundos: SEIS_HORAS, prioridade: 'alta' },
  lembreteDeDesfecho: { validadeEmSegundos: VINTE_E_QUATRO_HORAS, prioridade: 'normal' },
};

function onde(bairro: string | undefined): string {
  return bairro === undefined || bairro === '' ? '' : `, na ${bairro}`;
}

function texto(contexto: ContextoDoAviso): { titulo: string; corpo: string } {
  const nome = contexto.nomeDoPet;
  const lugar = onde(contexto.bairro);

  switch (contexto.tipo) {
    case 'tagEscaneada':
      return contexto.casoAberto === true
        ? {
            titulo: `Alguém está com ${nome}`,
            corpo: `Uma pessoa escaneou a tag agora${lugar}. Toque para falar.`,
          }
        : {
            titulo: `Alguém escaneou a tag de ${nome}`,
            corpo: `Isso aconteceu agora${lugar}. Se ${nome} deveria estar com você, confira.`,
          };

    case 'possivelCorrespondencia':
      return {
        titulo: `Um pet parecido com ${nome} foi achado`,
        corpo: `Um achado foi registrado${lugar}. Toque para ver se é ${nome}.`,
      };

    case 'alertaDeVizinhanca':
      return {
        titulo: `Um ${contexto.especie ?? 'pet'} sumiu perto de você`,
        corpo: `${nome} sumiu${lugar}. Toque para ver a foto e os sinais.`,
      };

    case 'lembreteDeDesfecho':
      return {
        titulo: `${nome} voltou para casa?`,
        corpo: 'Um toque encerra o caso, e quem falou com você é avisado.',
      };
  }
}

/** Monta o conteúdo do push e passa pela porteira antes de devolver. */
export function montarMensagemDePush(contexto: ContextoDoAviso): ConteudoDoPush {
  const { titulo, corpo } = texto(contexto);
  const perfil = PERFIL[contexto.tipo];

  const conteudo: ConteudoDoPush = {
    titulo,
    corpo,
    dados: {
      tipo: contexto.tipo,
      ref: contexto.tokenPublico,
    },
    chaveDeAgrupamento: `${contexto.tipo}:${contexto.tokenPublico}`,
    validadeEmSegundos: perfil.validadeEmSegundos,
    prioridade: perfil.prioridade,
  };

  assegurarSuperficiePublica(conteudo);
  return conteudo;
}

/**
 * O aviso de pedido aprovado para encontro privado da `Rede` (ADR-0027 item 17,
 * 22.10.1).
 */
export function montarAvisoDePedidoAprovado(tituloDoEncontro: string): ConteudoDoPush {
  const conteudo: ConteudoDoPush = {
    titulo: 'Seu pedido foi aprovado',
    corpo: tituloDoEncontro,
    dados: { tipo: 'pedidoAprovado' },
    chaveDeAgrupamento: 'pedidoAprovado',
    validadeEmSegundos: VINTE_E_QUATRO_HORAS,
    prioridade: 'normal',
  };
  assegurarSuperficiePublica(conteudo);
  return conteudo;
}
