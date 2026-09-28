/**
 * O que um push PODE dizer, e a porteira que garante que ele não diz mais.
 *
 * Camada pura: nada aqui abre rede, lê relógio ou conhece transporte. É a
 * decisão — "este texto pode aparecer numa tela bloqueada" — separada do
 * encanamento, pelo mesmo motivo de `evento-de-entrega.ts`: é a única parte que
 * um teste consegue exercitar exaustivamente, e é onde o erro não tem volta.
 *
 * ## Por que a notificação é superfície pública
 *
 * O ADR-0010 lista o que "a rota pública jamais exibe" e nomeia `/t/{codigo}`,
 * `/@{slug}`, o cartaz e **qualquer JSON que as sirva**. Um push não está
 * naquela lista por nome, e precisa estar por natureza, por três razões que se
 * somam:
 *
 * 1. **Ele aparece sem desbloqueio.** O aviso acende na tela de bloqueio, no
 *    ônibus, na mesa do almoço, ao lado de quem estiver junto. Não há sessão,
 *    não há autenticação e não há "só o dono vê" — a prévia é desenhada pelo
 *    sistema operacional e a pessoa não escolheu mostrá-la.
 * 2. **Ele passa por um terceiro.** O transporte recebe título, corpo e dados
 *    em claro e os guarda até o aparelho aparecer. O que entra no payload sai
 *    do nosso domínio de responsabilidade no instante do envio.
 * 3. **Ele fica.** Bandeja de notificação, histórico do sistema, espelhamento
 *    no relógio e no computador. Um endereço vazado num push não se apaga com
 *    um `UPDATE`.
 *
 * Por isso a regra deste arquivo: **o payload carrega o mínimo para a pessoa
 * decidir abrir o app, e nada que identifique pessoa, lugar ou linha de banco.**
 *
 * ## A assimetria que governa a porteira
 *
 * A guarda falha FECHADO: se alguma coisa parecida com dado pessoal aparecer
 * numa string que ia sair, a montagem estoura e o push não vai. Isso pode
 * derrubar um aviso legítimo por falso positivo — um pet chamado "Rua", um
 * bairro com número — e é uma troca feita de olhos abertos:
 *
 * - **Vazar** telefone, endereço ou UUID põe dado pessoal numa tela que
 *   qualquer um ao lado lê, num histórico que não se apaga, e num terceiro.
 *   É irreversível e não aparece em métrica nenhuma.
 * - **Não enviar** o push é visível: o erro é ruidoso, a fila registra, e o
 *   tutor **não fica sem o aviso** — o push nunca é o único canal para o caso
 *   próprio. UX 10.1 e ADR-0008 obrigam o e-mail como rede de segurança
 *   justamente porque um canal que depende de permissão do sistema não pode
 *   ser o único, e essa mesma rede cobre a falha daqui.
 *
 * Ou seja: o erro caro é silencioso e o erro barato é barulhento. A porteira é
 * calibrada para o barulhento.
 *
 * ## O que este arquivo NÃO faz
 *
 * Não escolhe quem recebe (raio de 5 km, teto de fadiga), não sabe se a pessoa
 * concedeu permissão e não conhece aparelho. Aqui é só o conteúdo.
 */

/** O aviso de que se trata. A lista é fechada: push novo entra por aqui. */
export type TipoDeAvisoPush =
  /** Alguém escaneou a tag da coleira. O aviso mais urgente do produto. */
  | 'tagEscaneada'
  /** Um achado avulso pode ser o pet desta pessoa. */
  | 'possivelCorrespondencia'
  /** Um pet sumiu no raio de 5 km de quem recebe. */
  | 'alertaDeVizinhanca'
  /** "O pet voltou para casa?", 24 h depois e a cada 48 h. */
  | 'lembreteDeDesfecho';

/**
 * A falha da porteira.
 *
 * `campo` e `padrao` são campos, e não só texto: quem trata precisa dizer
 * **onde** e **o quê**, e um log que diga só "vazamento" manda alguém procurar
 * em quatro strings. O VALOR que casou não entra em lugar nenhum — ele é
 * exatamente o dado que não pode ser copiado para o log.
 */
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

/**
 * As formas que não podem sair, com o nome que o operador entende.
 *
 * Cada uma é um item do ADR-0010 §"O que a rota pública jamais exibe". A lista
 * cresce por evidência; ela não tenta ser um detector universal de dado
 * pessoal, e não precisa ser: o payload é montado por este arquivo, então o que
 * ela vigia é um conjunto pequeno e conhecido de strings.
 */
const PADROES_PROIBIDOS: ReadonlyArray<{ nome: string; regex: RegExp }> = [
  // Item 6, sem exceção. UUIDv7 é ordenável e carrega o instante de criação:
  // um por caso, publicado, entrega a base inteira como telemetria (SEC-002).
  { nome: 'UUID de banco', regex: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i },
  // O mesmo UUID sem hífens continua sendo o mesmo UUID. Sem esta linha, tirar
  // quatro caracteres é todo o trabalho necessário para furar a de cima.
  { nome: 'UUID sem hífens', regex: /(?:^|[^0-9a-z])[0-9a-f]{32}(?:[^0-9a-z]|$)/i },
  // Item 1: e-mail de quem quer que seja.
  { nome: 'endereço de e-mail', regex: /[\w.+-]+@[\w-]+\.[a-z]{2,}/i },
  // Item 1: telefone. Cobre o formato brasileiro com e sem DDI, com e sem
  // parênteses, com espaço, ponto ou hífen entre os blocos.
  { nome: 'telefone', regex: /(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}/ },
  // Item 2: CEP.
  { nome: 'CEP', regex: /\b\d{5}-?\d{3}\b/ },
  // Item 2: logradouro. Bairro e cidade SÃO permitidos — o ADR-0010 fixa o
  // teto de precisão em bairro, e os textos de UX 12.2 usam bairro de
  // propósito. O que não passa é a linha do endereço.
  {
    nome: 'logradouro',
    regex: /\b(?:rua|avenida|av\.|alameda|travessa|rodovia|estrada|pra[cç]a|viela|beco|largo)\b/i,
  },
  // Item 4: coordenada de qualquer precisão, "mesmo arredondada, mesmo em campo
  // aproximado". Um par de decimais é o que um mapa precisa e é o que a regra
  // proíbe.
  { nome: 'coordenada geográfica', regex: /-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/ },
];

/**
 * Chaves que não existem no payload, nem com valor inofensivo.
 *
 * Uma chave `case_id` com um token opaco dentro é uma mentira que o próximo
 * leitor corrige — preenchendo-a com o `case_id` de verdade. O nome do campo é
 * o convite; bloquear o nome tira o convite.
 */
const CHAVES_PROIBIDAS: ReadonlySet<string> = new Set([
  'pet_id', 'petid', 'user_id', 'userid', 'case_id', 'caseid',
  'device_id', 'deviceid', 'conversation_id', 'conversationid',
  'owner_id', 'ownerid', 'finder_id', 'finderid', 'report_id', 'reportid',
  'email', 'e_mail', 'phone', 'telefone', 'celular', 'whatsapp',
  'endereco', 'address', 'cep', 'lat', 'lng', 'latitude', 'longitude',
  'sobrenome', 'last_name', 'lastname', 'cpf',
]);

/** Um campo de texto que vai sair, com o nome pelo qual o erro vai chamá-lo. */
interface CampoQueSai {
  readonly nome: string;
  readonly valor: string;
}

/**
 * A porteira. Roda sobre TUDO que vai no fio, e não sobre o que a montagem
 * achou que era arriscado.
 *
 * É chamada duas vezes de propósito: aqui, ao montar, e de novo no adaptador
 * antes de serializar. A segunda não é redundância — ela cobre a mensagem que
 * um chamador futuro montar à mão, sem passar por `montarMensagemDePush`. A
 * única defesa que vale é a que fica no caminho por onde tudo passa.
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
    // A chave de agrupamento viaja no payload como qualquer outro campo. Ela é
    // o lugar mais fácil de esquecer: ninguém pensa nela como conteúdo, e
    // `caso-<uuid>` é o valor que aparece sozinho na cabeça de quem a escreve.
    { nome: 'chaveDeAgrupamento', valor: mensagem.chaveDeAgrupamento },
  ];

  for (const [chave, valor] of Object.entries(mensagem.dados)) {
    if (CHAVES_PROIBIDAS.has(chave.toLowerCase())) {
      throw new VazamentoNoPushError(`dados.${chave}`, 'campo cujo nome o ADR-0010 proíbe');
    }
    // A CHAVE também é conferida contra os padrões, e não só o valor: um mapa
    // com a chave sendo o UUID e o valor sendo `"1"` vaza o UUID igual.
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

/**
 * O que o chamador tem em mãos quando vai notificar.
 *
 * **O grupo `sigiloso` existe de propósito, e é deliberadamente nunca lido.**
 * Quem chama acabou de ler uma linha do banco e tem tudo ali; a alternativa
 * seria cada chamador filtrar antes, e "filtrar antes" é o lembrete de quem
 * escreve a interface que o ADR-0010 diz textualmente que não serve
 * ("precisa ser propriedade do esquema e do contrato"). Aqui a filtragem é uma
 * função só, com um teste que passa o mundo inteiro e confere o que saiu.
 */
export interface ContextoDoAviso {
  readonly tipo: TipoDeAvisoPush;
  readonly token: string;

  /**
   * O nome do pet. Vai no texto, e pode: o ADR-0010 proíbe o **sobrenome do
   * tutor**, não o nome do animal, e todo texto de UX 12.2 usa o nome.
   */
  readonly nomeDoPet: string;

  /**
   * A chave estável e opaca do que o aviso trata — o `share_token`, o mesmo
   * que o link de compartilhamento já carrega. **É o único identificador que
   * sai**, e é a substituição que o item 6 do ADR-0010 nomeia.
   */
  readonly tokenPublico: string;

  /**
   * Bairro, quando houver. É o teto de precisão geográfica em superfície
   * pública, e os textos de UX 12.2 o usam ("na Vila Madalena"). Ausente vira
   * a variante sem lugar, que o UX também escreve — e não um lugar vago
   * inventado aqui.
   */
  readonly bairro?: string | undefined;

  /** Muda o texto de `tagEscaneada`: o tutor que não sabe é o caso mais urgente. */
  readonly casoAberto?: boolean | undefined;

  /** Espécie por extenso, para o alerta de vizinhança ("Um cão sumiu perto de você"). */
  readonly especie?: string | undefined;

  /** A foto, já como URL pública do hostname de mídia. */
  readonly imagemUrl?: string | undefined;

  /**
   * Tudo o que o chamador tem e que **não sai daqui**. Nenhuma linha deste
   * arquivo lê este objeto; o teste que prova isso passa valores reais de
   * telefone, endereço e UUID e confere o payload inteiro.
   */
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

/** Seis horas: o TTL que o ADR-0008 fixa para o alerta de vizinhança. */
const SEIS_HORAS = 6 * 60 * 60;
/** Vinte e quatro horas. Ver a justificativa de cada tipo em `PERFIL`. */
const VINTE_E_QUATRO_HORAS = 24 * 60 * 60;

/**
 * Prioridade e validade por tipo.
 *
 * Só o `alertaDeVizinhanca` tem número escrito em ADR: seis horas, porque
 * "alerta velho é ruído e atrapalha o caso seguinte". Os outros três estão
 * calibrados pelo mesmo critério — **quanto tempo esta informação continua
 * valendo a interrupção** — e a resposta é diferente para cada um:
 *
 * - `tagEscaneada` não caduca em seis horas. Alguém está com o animal na mão;
 *   saber disso às sete da manhã porque o celular passou a noite desligado
 *   ainda é a informação mais importante do produto.
 * - `possivelCorrespondencia` também não: o achado continua registrado, e a
 *   pessoa decide se é o pet dela quando abrir.
 * - `lembreteDeDesfecho` é o único em prioridade normal. Ele não é notícia; é
 *   uma pergunta nossa. Acordar o aparelho para perguntar seria gastar a
 *   atenção que o alerta de verdade vai precisar.
 */
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

/**
 * Os textos, derivados de UX 12.2 e 12.3.
 *
 * **Uma diferença deliberada em relação ao documento: sem artigo antes do nome
 * e sem particípio flexionado.** O UX escreve "a Nina" e "vista" porque escreve
 * sobre a Nina. O código não sabe o gênero do animal — não há campo para isso,
 * e inventar um só para conjugar frase seria dado guardado por causa de
 * gramática. "Alguém está com Rex" está correto; "Alguém está com a Rex" está
 * errado na tela de um tutor de verdade, e é o tipo de erro que faz o produto
 * parecer que não foi feito para ele. O resto do texto é o do documento.
 */
function texto(contexto: ContextoDoAviso): { titulo: string; corpo: string } {
  const nome = contexto.nomeDoPet;
  const lugar = onde(contexto.bairro);

  switch (contexto.tipo) {
    case 'tagEscaneada':
      // O pet NÃO marcado como perdido é o caso mais urgente do produto,
      // porque o tutor ainda não sabe de nada. O título muda para dizer o fato
      // cru em vez da consequência.
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

/**
 * Monta o conteúdo do push e passa pela porteira antes de devolver.
 *
 * Estoura `VazamentoNoPushError` em vez de devolver conteúdo capado: capar em
 * silêncio entregaria um aviso com um buraco no meio da frase, que a pessoa lê
 * sem entender e nós nunca descobrimos.
 */
export function montarMensagemDePush(contexto: ContextoDoAviso): ConteudoDoPush {
  const { titulo, corpo } = texto(contexto);
  const perfil = PERFIL[contexto.tipo];

  const conteudo: ConteudoDoPush = {
    titulo,
    corpo,
    dados: {
      // Dois campos, e é tudo. `tipo` diz ao app qual tela abrir; `ref` é a
      // chave opaca do que o aviso trata. Nada aqui identifica pessoa nem
      // linha de banco.
      tipo: contexto.tipo,
      ref: contexto.tokenPublico,
    },
    // Agrupa por tipo E por referência. O ADR-0008 manda "um caso nunca empilha
    // várias notificações"; incluir o tipo é o ajuste que impede o contrário
    // — um alerta de vizinhança engolindo o aviso de que alguém está com o
    // animal, que são informações diferentes e nenhuma substitui a outra.
    chaveDeAgrupamento: `${contexto.tipo}:${contexto.tokenPublico}`,
    validadeEmSegundos: perfil.validadeEmSegundos,
    prioridade: perfil.prioridade,
  };

  assegurarSuperficiePublica(conteudo);
  return conteudo;
}

/**
 * O aviso de pedido aprovado para encontro privado da `Rede` (ADR-0027 item
 * 17, 22.10.1). **Leva so o titulo do encontro**, nunca lugar nem horario: o
 * conteudo passa pelo provedor de push e aparece na tela bloqueada, e o lugar
 * do privado e exatamente o que so a conta aprovada ve, dentro do app.
 *
 * Nao ha `ref` nos dados: o `slug` do privado e aleatorio, mas "so o titulo" e
 * a regra, e o app abre em "meus pedidos". A agrupamento e por tipo.
 *
 * A porteira roda igual: um titulo com cara de endereco ("Encontro na Rua X,
 * 100") estoura e o push nao sai, e o tutor ve a aprovacao ao abrir o app.
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
