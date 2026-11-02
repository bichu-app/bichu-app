import {
  canalDeContatoConfirmado,
  osDoisCanaisConfirmados,
} from '../db/canal-de-contato-confirmado.js';
import type { Instant } from '../types/brands.js';

/**
 * # A MATRIZ DE CAPACIDADES POR VERIFICACAO
 *
 * ## POR QUE ISTO NAO E UMA ESCADA DE NIVEIS, E JA FOI
 *
 * A primeira versao (02/11/2026, de manha) tinha `NivelDeVerificacao` com dois
 * degraus e decidia por `NIVEIS_POR_EXIGENCIA.indexOf(...)`: "o nivel da conta
 * esta a esta altura ou acima?". A tabela do cliente cabia nisso.
 *
 * **No mesmo dia ele decidiu `solicitar_plaquinha`, que exige e-mail E
 * telefone**, e a escada passou a mentir de duas formas:
 *
 *  1. **A ordem morava num INDICE DE LISTA.** Inserir um degrau no meio de
 *     `NIVEIS_POR_EXIGENCIA` reinterpretava TODA capacidade ja declarada, sem
 *     erro de compilacao, sem caso reprovando e sem nada acusar -- so
 *     comportamento diferente. A propriedade que a escada precisava para ser
 *     correta (cada degrau implica o anterior) nao estava escrita em lugar
 *     nenhum: era uma crenca sobre a ordem da lista.
 *  2. **A primeira exigencia incomparavel nao caberia.** "Os dois canais"
 *     implica "qualquer canal", e so por isso ela ainda PARECE um degrau acima.
 *     Mas "so telefone" e "so e-mail" nao se implicam -- nenhuma das duas e
 *     maior --, e nenhuma escada ordinal expressa isso. A unica forma de
 *     descobrir seria tentar.
 *
 * **O modelo agora e: vocabulario fechado de EXIGENCIAS NOMEADAS, cada uma com o
 * seu proprio predicado.** `EXIGENCIA_DECLARADA` e total sobre
 * `ExigenciaDeVerificacao`, entao exigencia nova sem predicado, sem motivo de
 * recusa, sem dizer que evidencias precisa ler e sem dizer se esta em vigor **nao
 * compila**. Combinacao nova e uma entrada com a sua regra; nada se reordena.
 *
 * **O que o modelo novo NAO expressa:** exigencia que dependa de algo que nao
 * seja evidencia de canal -- idade da conta, por exemplo, ou pagamento. O prazo
 * do telefone e justamente desse tipo, e por isso ele e uma SEGUNDA dimensao
 * (`NO_PRAZO_DO_TELEFONE`) e nao uma exigencia. Se aparecer uma terceira
 * dimensao, o lugar de olhar e este comentario.
 *
 * ## AS DUAS DIMENSOES, E A ASSIMETRIA ENTRE ELAS
 *
 * | | o que ela faz | quando morde |
 * |---|---|---|
 * | `EXIGENCIA_DE_CANAL` | **IMPEDE ENTRAR** sem as evidencias | na primeira tentativa |
 * | `NO_PRAZO_DO_TELEFONE` | **BLOQUEIA quem ja esta dentro** e nao validou | depois de 15 dias |
 *
 * Sao regras diferentes sobre o MESMO dado (`users.phone_verified_at`), e
 * confundi-las seria fazer uma herdar o interruptor da outra sem querer. Por isso
 * os interruptores sao **dois**, com nomes diferentes, e `Interruptores` os traz
 * separados. Nenhum le o outro.
 */

/** O que o ponto de chamada tem em maos: as DUAS evidencias, como as colunas as guardam. */
export interface AsDuasEvidencias {
  readonly emailVerifiedAt: Date | null;
  readonly phoneVerifiedAt: Date | null;
}

/**
 * O que o ponto de chamada tem em maos quando a consulta ja derivou a disjuncao
 * em SQL e nao trouxe as datas.
 *
 * **Existe para que ninguem FABRIQUE a evidencia que nao mediu.** A alternativa
 * era o chamador inventar um `emailVerifiedAt` para dizer "verificado" -- e data
 * fabricada e um valor que um dia alguem le como se fosse verdade. Quem passa
 * esta forma a uma exigencia que precisa das duas evidencias e recusado EM VOZ
 * ALTA, nunca aprovado em silencio.
 */
export interface SoADisjuncao {
  /** O booleano de `canalDeContatoConfirmadoNoSql`, a MESMA regua. */
  readonly canalConfirmado: boolean;
}

export type EvidenciasDeCanal = AsDuasEvidencias | SoADisjuncao;

function ehSoADisjuncao(canais: EvidenciasDeCanal): canais is SoADisjuncao {
  return 'canalConfirmado' in canais;
}

/**
 * **O vocabulario das capacidades, decidido pelo cliente em 02/11/2026.**
 *
 * Cada nome e uma coisa que a pessoa FAZ, e nao uma rota nem uma tela: a mesma
 * capacidade pode ser alcancada por dois caminhos (pedir conexao tem o do convite
 * e o do apelido), e e a capacidade que ele decidiu, nao o caminho.
 */
export type Capacidade =
  | 'cadastrar_achado'
  | 'conversa_do_achado'
  | 'conversa_entre_pessoas'
  | 'bloquear_ou_denunciar_conversa'
  | 'ver_a_loja'
  | 'pedir_conexao'
  | 'cadastrar_evento'
  | 'recomendar_profissional'
  | 'solicitar_plaquinha';

/** As exigencias de evidencia de canal que o produto conhece. */
export type ExigenciaDeVerificacao = 'nenhuma' | 'qualquer_canal' | 'os_dois_canais';

/** Por que a capacidade foi recusada. `null` e "nao foi". */
export type MotivoDaRecusa =
  | 'canal_de_contato_nao_verificado'
  | 'os_dois_canais_nao_verificados'
  | 'telefone_nao_validado_no_prazo';

/**
 * **A MATRIZ, E ELA E O PRIMEIRO PORTAO DE COMPILACAO.**
 *
 * `Record<Capacidade, ExigenciaDeVerificacao>` e total: capacidade nova no
 * vocabulario **sem exigencia declarada aqui nao compila**, e por isso nao
 * consegue nascer liberada por omissao. E o mesmo arranjo de
 * `SEMANTICA_DO_EXCESSO` em `shared/http/aplicacao-de-teto.ts`, pela mesma razao
 * -- la o defeito era `on_exceed` declarado e nao implementado virando "pode
 * passar".
 *
 * **As decisoes do cliente, verbatim na substancia (02/11/2026):**
 *
 *  - *"nao verificado: cadastrar pet que encontrou, enviar mensagem ao tutor do
 *    pet que encontrou, ver a Loja"*;
 *  - *"e-mail verificado: tudo acima + cadastrar eventos + recomendar
 *    profissionais"*;
 *  - *"enviar mensagens a usuarios, se o perfil nao estiver verificado, ele nao
 *    pode. Ele so pode entrar em um pet perdido, e clicar em enviar mensagem ao
 *    tutor, mas nao para ficar conversando entre amigos"*;
 *  - *"outra coisa que o usuario tambem nao consegue fazer se ele nao tiver o
 *    e-mail e o telefone validado e solicitar a criacao da tag que enviamos para
 *    o endereco dele"*.
 *
 * **SOBRE `qualquer_canal` ONDE ELE ESCREVEU "e-mail verificado":** a regua desta
 * casa e `email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL` -- a
 * emenda do ADR-0010 de 21/10/2026, decisao dele: *"Unificar agora, nas duas -- a
 * mesma regua (e-mail OU telefone) nos dois lugares, antes de telefone existir."*
 * As duas coincidem hoje porque nada grava `phone_verified_at`, e portanto e-mail
 * e a unica porta. **Nao estreitei para so e-mail**: seria redecidir, e no dia em
 * que telefone confirmar tiraria a capacidade de uma conta que o selo ja promete
 * validada -- o defeito exato que a emenda de 21/10 corrigiu.
 */
export const EXIGENCIA_DE_CANAL: Readonly<Record<Capacidade, ExigenciaDeVerificacao>> = {
  /** *"cadastrar pet que encontrou"*. Sem trava, e e assim que o cliente quer. */
  cadastrar_achado: 'nenhuma',

  /**
   * *"clicar em enviar mensagem ao tutor"* do pet perdido.
   *
   * **LIVRE E A CONVERSA INTEIRA, DO INICIO AO FIM, e nao so o ato de iniciar.**
   * Esta frase e a parte que importa, e ela protege o fluxo central do produto.
   *
   * A superficie do achador tem QUATRO operacoes --
   * `getFinderConversation`, `postFinderMessage`, `blockFinderConversation` e
   * `reportFinderConversation` (`messaging/adapters/http/finder-conversation-routes.ts`).
   * Se a verificacao encostar em qualquer uma delas que nao seja a primeira
   * mensagem, **o achador manda a primeira e nao consegue RESPONDER ao tutor**: a
   * conversa morre no primeiro turno, e e ela que devolve o pet.
   *
   * **E ela alcanca quem NAO TEM CONTA**, por desenho: a dimensao de teto das
   * quatro rotas e `finder_token`, nunca `account`, e a identidade e o token --
   * nao ha `UserId` para ler evidencia nenhuma. Exigir verificacao aqui nao seria
   * so endurecer: seria pedir evidencia de quem nao tem onde te-la.
   *
   * Quem for "endurecer" isto em marco com a melhor das intencoes: leia este
   * paragrafo primeiro, e depois a decisao do cliente de 02/11/2026.
   *
   * ## DUAS DAS QUATRO OPERACOES ESTAO DECIDIDAS PARA SAIR, E NAO SAIRAM
   *
   * **Decisao do cliente, 02/11/2026, mais tarde no mesmo dia:** *"o achador nao
   * deve bloquear e nem denunciar, ele nao tem conta, nao tem que interagir, ele
   * e praticamente um usuario anonimo."* Foi-lhe oferecido manter so a denuncia,
   * e ele escolheu tirar as duas. A razao e de desenho e nao de risco:
   * `blockFinderConversation` e `reportFinderConversation` sao autenticadas pelo
   * TOKEN DO ACHADOR -- e o achador bloqueando e abrindo fila de moderacao, nao
   * o tutor se defendendo dele --, e gerenciar relacao ou abrir fila e ato de
   * quem tem conta.
   *
   * **A RETIRADA NAO FOI FEITA, e o motivo e medido.** Remover as duas do
   * contrato reprova o portao de compatibilidade:
   *
   *     api-path-removed-without-deprecation blockFinderConversation   (level 3 = ERR)
   *     api-path-removed-without-deprecation reportFinderConversation  (level 3 = ERR)
   *     REPROVADO: 2 quebra(s) sem dispensa
   *
   * Medido com `oasdiff v1.32.1` contra `origin/development` e com
   * `verificar_quebras_de_contrato.py` -- e `NIVEL_DE_ERRO` daquele portao e 3.
   * Afrouxar, dispensar ou pedir `continue-on-error` esta fora de questao: a
   * saida honesta talvez seja a rota **responder recusa** em vez de deixar de
   * existir, e essa e decisao do cliente. Entao as duas **continuam aqui, no
   * ar**, e esta prosa existe para que a ausencia de acao nao pareca descuido.
   *
   * **A lacuna que a retirada abriria JA ESTA FECHADA pelo outro lado**, e isto
   * tambem foi medido: `ConversationService.alvoDaDenuncia` devolve
   * `${conversa}:finder` quando `papelDoChamador === 'tutor'`, entao o TUTOR ja
   * denuncia a mesma conversa pelo lado dele, por `reportConversation` -- e essa
   * operacao e livre de verificacao (ver `bloquear_ou_denunciar_conversa`). Quem
   * fizer a retirada nao precisa inventar caminho novo para a denuncia.
   */
  conversa_do_achado: 'nenhuma',

  /**
   * *"nao para ficar conversando entre amigos"*: a conversa GERAL entre pessoas.
   *
   * ## ELA ESTA DECLARADA E **NAO ESTA LIGADA**, E O MOTIVO E MEDIDO
   *
   * **Nao existe conversa entre pessoas neste produto.** Nao e opiniao:
   *
   *  - `conversations.found_report_id` e **`NOT NULL UNIQUE`** (migracao
   *    `20260922000012`), e o comentario da coluna diz a decisao: *"A origem, e a
   *    unica... um aviso, uma conversa"*;
   *  - o UNICO caminho que cria conversa e `ConversationService.abrirPorAviso`,
   *    chamado pelo aviso do achador. Nao ha `insertInto('conversations')` em
   *    lugar nenhum de `src/` fora dele.
   *
   * Logo **toda conversa deste produto E uma conversa de achado**, e a superficie
   * "geral" (`conversation-routes.ts`) nao e outra conversa: e a MESMA conversa
   * vista por quem tem conta -- o tutor, e o achador que tenha conta.
   *
   * ## POR QUE LIGAR A TRAVA HOJE SERIA DANO, E NAO SO INUTILIDADE
   *
   * Isto foi medido ligando-a: a trava entrou em `listar`, `buscar`, `enviar` e
   * `marcarListaVista`, e a suite de integracao reprovou **7 casos** de
   * `foto-na-conversa-entre-conexoes.test.ts` com `409 !== 200` -- entre eles
   * *"conversa de ACHADO com NAO-CONEXAO: sem foto, mesmo tendo conta"*. Ou seja:
   * a trava nao travou amizade nenhuma, travou **o tutor e o achador com conta
   * lendo e respondendo a conversa do pet achado**. O achador com conta nao
   * verificada mandaria a primeira mensagem pela superficie do token e nao
   * conseguiria RESPONDER pela superficie da conta -- a conversa morrendo no
   * primeiro turno, que e exatamente o dano que a decisao do cliente sobre
   * `conversa_do_achado` existe para impedir.
   *
   * ## ONDE LIGAR, NO DIA EM QUE A CONVERSA ENTRE PESSOAS EXISTIR
   *
   * Em `ConversationService`, nas quatro que leem e escrevem -- `listar`,
   * `marcarListaVista`, `buscar` e `enviar` --, e **nunca** em `bloquear`,
   * `denunciar` nem `abrirPorAviso`. O que falta nao e a trava: e a conversa que
   * ela deveria cobrir, e provavelmente uma forma de distinguir as duas (hoje
   * `found_report_id` nao e anulavel, entao nem o banco sabe representar a
   * outra). **Isto e pergunta para o cliente, e nao escolha de implementacao.**
   *
   * **Bloquear e denunciar nao entram** nem quando entrar -- ver
   * `bloquear_ou_denunciar_conversa`, que e capacidade propria exatamente para
   * esse recorte nao se perder.
   */
  conversa_entre_pessoas: 'qualquer_canal',

  /**
   * **Defender-se na SUPERFICIE GERAL e livre de verificacao**, e isto e
   * capacidade declarada em vez de uma ausencia silenciosa.
   *
   * `blockConversation` e `reportConversation` moram no MESMO arquivo de rotas
   * que as quatro operacoes gateadas de `conversa_entre_pessoas`. Sem esta
   * entrada, quem fosse ligar a trava "no arquivo da conversa geral" levaria
   * bloquear e denunciar junto, por tabela -- e e so lendo esta matriz que se
   * descobre que isso e errado.
   *
   * **Por que livre:** aqui bloquear e denunciar sao defesa de QUEM RECEBE --
   * uma pessoa COM CONTA, contra outra pessoa com conta. Exigir verificacao para
   * se defender e o avesso do proposito: deixaria sem recurso exatamente quem
   * esta sendo importunado, enquanto quem importuna nao precisa de autorizacao
   * nenhuma para continuar.
   *
   * **ESTA CAPACIDADE NAO FALA DA SUPERFICIE DO ACHADOR**, e a fronteira foi
   * medida e nao suposta: `blockFinderConversation` e
   * `reportFinderConversation` sao autenticadas pelo token do achador, entao ali
   * nao e alguem se defendendo do achador -- e o ACHADOR bloqueando e
   * denunciando. O cliente decidiu em 02/11/2026 que ele nao deve fazer nem uma
   * nem outra; ver `conversa_do_achado` para a decisao, o veredito do portao de
   * compatibilidade e por que a retirada ainda nao foi feita.
   */
  bloquear_ou_denunciar_conversa: 'nenhuma',

  /** *"ver a Loja"*. Sem trava, por decisao. */
  ver_a_loja: 'nenhuma',

  /** O produto de hoje. O cliente nao a pos em exigencia nenhuma; so no prazo. */
  pedir_conexao: 'nenhuma',

  /** *"cadastrar eventos"*. Ja estava gateado em `network/application`. */
  cadastrar_evento: 'qualquer_canal',

  /** *"recomendar profissionais"*. Ja estava gateado em `sugestao-do-diretorio`. */
  recomendar_profissional: 'qualquer_canal',

  /**
   * *"solicitar a criacao da tag que enviamos para o endereco dele"*
   * (`requestCollarTag`).
   *
   * **A PRIMEIRA CAPACIDADE QUE EXIGE OS DOIS CANAIS**, e e ela que fez o modelo
   * de nivel sair. A exigencia nasce **EM VIGOR = false**: ver
   * `EXIGENCIA_DOS_DOIS_CANAIS_EM_VIGOR`, e leia aquele comentario antes de
   * mexer -- a plaquinha e o produto FISICO que o cliente vende.
   *
   * **Ela nao esta no prazo dos 15 dias, e a diferenca e a razao de as duas
   * dimensoes existirem:** esta IMPEDE ENTRAR sem as duas evidencias; o prazo
   * BLOQUEIA quem ja esta dentro. Por-la no prazo faria a exigencia valer
   * so depois de 15 dias, que nao e o que o cliente decidiu.
   */
  solicitar_plaquinha: 'os_dois_canais',
};

/**
 * **O INTERRUPTOR DA EXIGENCIA DOS DOIS CANAIS. DESLIGADO EM 02/11/2026.**
 *
 * **SE ISTO FOR LIGADO HOJE, NINGUEM CONSEGUE PEDIR PLAQUINHA. NEM QUEM VALIDOU
 * O E-MAIL.** Nao e inconveniencia: a plaquinha e o produto FISICO que o cliente
 * vende, e `requestCollarTag` e a porta da venda. Ligar isto antes de a validacao
 * de telefone existir **para a venda**.
 *
 * Medido, e nao suposto: **nada neste repositorio escreve
 * `users.phone_verified_at`** -- a coluna existe desde a migracao
 * `20260917000001` e nunca recebeu valor --, nao existe provedor de SMS nem de
 * WhatsApp em `src/`, e nao existe operacao de validacao de telefone em
 * `api/openapi.yaml`. O cliente decidiu que SMS e WhatsApp entram **na subida de
 * producao**. Logo, `phoneVerifiedAt` e `null` para TODA conta, e
 * `osDoisCanaisConfirmados` devolve `false` para TODA conta.
 *
 * **A diferenca em relacao ao prazo dos 15 dias, e ela e o motivo de este
 * interruptor ser SEPARADO:** no prazo ha uma segunda fechadura natural --
 * `TELEFONE_SEM_VALIDACAO_POSSIVEL` nao vence nunca --, entao mesmo ligando o
 * interruptor ninguem e bloqueado. **Aqui nao ha segunda fechadura possivel:** e
 * justamente a ausencia do dado que faz a exigencia morder. Este booleano e a
 * UNICA fechadura, e e por isso que o caso
 * `matriz-de-capacidades.test.ts` reprova enquanto ele for ligado -- quem o
 * ligar tem de editar o caso tambem, e ler ali o que vai acontecer.
 *
 * **Quando ligar:** depois de a validacao de telefone existir E de haver caminho
 * para a base ja cadastrada validar o dela. Nao e uma linha; e uma decisao do
 * cliente com uma migracao de gente atras.
 */
export const EXIGENCIA_DOS_DOIS_CANAIS_EM_VIGOR: boolean = false;

/** Quantos dias a conta tem para validar o telefone (cliente, 02/11/2026). */
export const PRAZO_DO_TELEFONE_EM_DIAS = 15;

const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * **O INTERRUPTOR DO PRAZO DOS 15 DIAS. DESLIGADO EM 02/11/2026.**
 *
 * Mesma medicao do interruptor acima: **hoje nenhum usuario deste produto tem
 * como validar telefone.** Ligar isto bloquearia a base inteira em
 * `cadastrar_evento` e `pedir_conexao` no dia 16 de vida de cada conta, por uma
 * exigencia que ninguem tem como cumprir.
 *
 * **A regra NAO esta ausente, esta inerte:** `telefoneForaDoPrazo` esta escrita
 * por inteiro e tem caso de teste que a prova recusando. O unico passo que falta
 * e este booleano.
 *
 * **A SEGUNDA TRAVA, e ela e deliberada:** mesmo ligado, um ponto que passa
 * `TELEFONE_SEM_VALIDACAO_POSSIVEL` continua sem bloquear ninguem. Sao duas
 * fechaduras independentes, e e isso que se quer -- a pergunta *"alguem pode
 * ligar isso por engano e bloquear a base?"* tem de ter resposta "nao" por mais
 * de um motivo.
 *
 * **ELE NAO E O MESMO INTERRUPTOR DA EXIGENCIA DOS DOIS CANAIS**, e a separacao
 * e o ponto: as duas regras falam da mesma coluna e fazem coisas diferentes
 * (uma impede entrar, a outra bloqueia quem esta dentro). Interruptor
 * compartilhado faria uma ligar junto com a outra sem ninguem pedir.
 */
export const PRAZO_DO_TELEFONE_LIGADO: boolean = false;

/**
 * **A SEGUNDA DECLARACAO OBRIGATORIA, e ela e o segundo portao de compilacao.**
 *
 * A regra dos 15 dias nao alcanca todas as capacidades: o cliente nomeou DUAS --
 * *"bloqueado para publicar novos eventos e adicionar novos usuarios"*. Um
 * `Record<Capacidade, boolean>` total obriga toda capacidade nova a responder "o
 * prazo do telefone te alcanca?", em vez de a resposta ser `undefined` -- que em
 * JavaScript e falso e portanto seria uma dispensa por omissao.
 */
export const NO_PRAZO_DO_TELEFONE: Readonly<Record<Capacidade, boolean>> = {
  cadastrar_achado: false,
  /** A conversa do achado e livre do inicio ao fim, e prazo tambem a mataria. */
  conversa_do_achado: false,
  conversa_entre_pessoas: false,
  bloquear_ou_denunciar_conversa: false,
  ver_a_loja: false,
  /** *"adicionar novos usuarios"* (cliente, 02/11/2026). */
  pedir_conexao: true,
  /** *"publicar novos eventos"* (cliente, 02/11/2026). */
  cadastrar_evento: true,
  recomendar_profissional: false,
  /** Ela IMPEDE ENTRAR pela exigencia dos dois canais; prazo e a outra regra. */
  solicitar_plaquinha: false,
};

/** As capacidades que o prazo do telefone alcanca, derivadas da declaracao acima. */
export const CAPACIDADES_NO_PRAZO_DO_TELEFONE: readonly Capacidade[] = (
  Object.keys(NO_PRAZO_DO_TELEFONE) as Capacidade[]
).filter((capacidade) => NO_PRAZO_DO_TELEFONE[capacidade]);

/**
 * Quem passou `SoADisjuncao` a uma exigencia que precisa das duas evidencias.
 *
 * **Lanca em vez de devolver `false` ou `true`.** `false` recusaria quem talvez
 * cumprisse, e `true` liberaria quem talvez nao -- as duas seriam uma decisao
 * tomada sobre dado que ninguem mediu. E o mesmo principio de
 * `conferirAcoesDeExcesso`: "nao consegui aplicar" nunca e "aprovei", e tambem
 * nunca e "reprovei".
 */
function exigeAsDuasEvidencias(exigencia: ExigenciaDeVerificacao): never {
  throw new Error(
    `Exigencia '${exigencia}': ela precisa das DUAS evidencias de canal e recebeu apenas a ` +
      'disjuncao (`SoADisjuncao`). Decidir com a disjuncao seria decidir sobre dado que este ' +
      'ponto nao mediu: traga `emailVerifiedAt` e `phoneVerifiedAt` (ver ' +
      '`LeitorDeEvidenciasDeCanal`) ou declare outra exigencia para esta capacidade.',
  );
}

/** Tudo o que uma exigencia precisa declarar para existir. */
export interface ExigenciaDeclarada {
  /** O motivo da recusa, ou `null` quando a exigencia esta cumprida. */
  readonly recusa: (canais: EvidenciasDeCanal) => MotivoDaRecusa | null;
  /** Precisa LER as duas evidencias separadamente, ou a disjuncao basta? */
  readonly precisaDasDuasEvidencias: boolean;
  /**
   * Esta exigencia esta EM VIGOR?
   *
   * E funcao e nao booleano para que o interruptor seja lido na HORA da decisao,
   * e nao congelado no carregamento do modulo -- e e aqui que mora a inercia de
   * `os_dois_canais`.
   */
  readonly emVigor: (interruptores: Interruptores) => boolean;
}

/** Os interruptores, **separados de proposito**. Ver a prosa de cada um. */
export interface Interruptores {
  readonly exigenciaDosDoisCanais?: boolean | undefined;
  readonly prazoDoTelefone?: boolean | undefined;
}

/**
 * **O TERCEIRO PORTAO DE COMPILACAO, e o que substituiu a escada.**
 *
 * `Record<ExigenciaDeVerificacao, ExigenciaDeclarada>` e total: exigencia nova
 * sem predicado, sem motivo, sem dizer que evidencias le e sem dizer se esta em
 * vigor **nao compila**. Nenhuma exigencia tem posicao numa lista, entao
 * acrescentar uma nao reinterpreta nenhuma das outras -- que era o defeito
 * estrutural da escada.
 *
 * **A regua de "validado" nao e reescrita aqui:** os dois predicados chamam
 * `shared/db/canal-de-contato-confirmado.ts`, a fonte unica que
 * `portao-regua-do-canal-de-contato` protege.
 */
export const EXIGENCIA_DECLARADA: Readonly<
  Record<ExigenciaDeVerificacao, ExigenciaDeclarada>
> = {
  /** Nada a conferir. **Nao ha motivo de recusa porque nao ha recusa possivel.** */
  nenhuma: {
    recusa: () => null,
    precisaDasDuasEvidencias: false,
    emVigor: () => true,
  },

  /** E-mail **OU** telefone: a regua do ADR-0010 emendado em 21/10/2026. */
  qualquer_canal: {
    recusa: (canais) =>
      (ehSoADisjuncao(canais) ? canais.canalConfirmado : canalDeContatoConfirmado(canais))
        ? null
        : 'canal_de_contato_nao_verificado',
    precisaDasDuasEvidencias: false,
    emVigor: () => true,
  },

  /**
   * E-mail **E** telefone (cliente, 02/11/2026).
   *
   * `emVigor` le `EXIGENCIA_DOS_DOIS_CANAIS_EM_VIGOR`, que esta DESLIGADO --
   * leia o comentario daquela constante antes de ligar.
   */
  os_dois_canais: {
    recusa: (canais) => {
      if (ehSoADisjuncao(canais)) exigeAsDuasEvidencias('os_dois_canais');
      return osDoisCanaisConfirmados(canais) ? null : 'os_dois_canais_nao_verificados';
    },
    precisaDasDuasEvidencias: true,
    emVigor: (interruptores) =>
      interruptores.exigenciaDosDoisCanais ?? EXIGENCIA_DOS_DOIS_CANAIS_EM_VIGOR,
  },
};

/**
 * O valor que todo ponto do produto passa HOJE como estado do telefone.
 *
 * Nao e um `null` nem um objeto com campos vazios: e um literal com nome, para que
 * procurar por ele ache TODOS os pontos que precisam de dado de verdade no dia em
 * que a validacao de telefone existir. Um `null` nao se procura; este nome se
 * procura.
 */
export const TELEFONE_SEM_VALIDACAO_POSSIVEL = 'validacao-de-telefone-nao-existe' as const;

/**
 * O estado do telefone de uma conta, para a regra de PRAZO.
 *
 * **Os instantes sao `Instant` e nao `Date`**: `Date` so e construido em
 * `shared/time/clock.ts` nesta casa (o ESLint o impoe), e a regra de prazo e
 * aritmetica -- nao precisa de objeto de data para somar 15 dias.
 *
 * `prazoComecouEm` e um campo e nao `users.created_at` lido aqui dentro porque
 * quem decide de onde o prazo conta e o chamador: para a conta que ja existia
 * quando a validacao de telefone entrar, contar do cadastro daria 15 dias ja
 * vencidos no primeiro minuto, e essa decisao e do cliente e nao deste arquivo.
 */
export interface EstadoDoTelefoneDaConta {
  /** Quando o telefone foi validado. `null` e "nunca". */
  readonly validadoEm: Instant | null;
  readonly prazoComecouEm: Instant;
}

export type TelefoneDaConta =
  | EstadoDoTelefoneDaConta
  | typeof TELEFONE_SEM_VALIDACAO_POSSIVEL;

/** As evidencias de UMA conta, como a matriz as le. */
export interface EvidenciasDaConta {
  readonly canais: EvidenciasDeCanal;
  readonly telefone: TelefoneDaConta;
}

/**
 * **O prazo venceu sem o telefone validado?**
 *
 * Escrita por inteiro e provada por teste, mesmo com o interruptor desligado: a
 * regra que so existe no dia em que e ligada e a regra que nunca foi medida.
 *
 * `TELEFONE_SEM_VALIDACAO_POSSIVEL` e sempre `false` -- nao ha como estar fora de
 * um prazo que nao se pode cumprir.
 */
export function telefoneForaDoPrazo(telefone: TelefoneDaConta, agora: Instant): boolean {
  if (telefone === TELEFONE_SEM_VALIDACAO_POSSIVEL) return false;
  if (telefone.validadoEm !== null) return false;
  const vence =
    Number(telefone.prazoComecouEm) + PRAZO_DO_TELEFONE_EM_DIAS * MILISSEGUNDOS_POR_DIA;
  return Number(agora) >= vence;
}

/**
 * **A DECISAO, e ela sai da matriz e de mais lugar nenhum.**
 *
 * Devolve o motivo da recusa, ou `null` quando a capacidade esta liberada. Quem
 * chama traduz o motivo no erro da sua superficie -- a matriz nao conhece HTTP.
 *
 * As duas dimensoes sao conferidas na ordem em que a pessoa as encontra: primeiro
 * a exigencia que IMPEDE ENTRAR, depois o prazo que BLOQUEIA quem esta dentro.
 */
export function recusaDaCapacidade(
  capacidade: Capacidade,
  conta: EvidenciasDaConta,
  agora: Instant,
  interruptores: Interruptores = {},
): MotivoDaRecusa | null {
  /**
   * **NAO passa por `recusaPorExigenciaDeCanal`**, e a diferenca nao e estilo:
   * aquela porta LANCA para capacidade que esta na regra dos 15 dias, porque ela
   * nao tem relogio para aplicar o prazo. Esta funcao TEM `agora` e aplica as
   * duas dimensoes, entao para ela a capacidade no prazo e normal.
   *
   * Chamar a porta que lanca a partir daqui foi exatamente o defeito da primeira
   * versao: `cadastrar_evento` e `pedir_conexao` estao no prazo, e toda decisao
   * sobre as duas virava excecao -- 25 casos reprovados de uma vez, em quatro
   * arquivos.
   */
  const recusa = aplicarExigenciaDeCanal(capacidade, conta.canais, interruptores);
  if (recusa !== null) return recusa;
  return recusaPorPrazoDoTelefone(capacidade, conta.telefone, agora, interruptores);
}

/**
 * A exigencia de canal, aplicada sem juizo sobre prazo.
 *
 * Privada de proposito: quem nao tem relogio usa `recusaPorExigenciaDeCanal`, que
 * recusa em voz alta se o prazo ficar de fora. Esta nao protege ninguem, e por
 * isso nao sai do arquivo.
 */
function aplicarExigenciaDeCanal(
  capacidade: Capacidade,
  canais: EvidenciasDeCanal,
  interruptores: Interruptores,
): MotivoDaRecusa | null {
  const declarada = EXIGENCIA_DECLARADA[EXIGENCIA_DE_CANAL[capacidade]];
  if (!declarada.emVigor(interruptores)) return null;
  return declarada.recusa(canais);
}

/**
 * **So a exigencia de canal**, para o ponto que legitimamente nao tem relogio.
 *
 * `SugestaoDoDiretorio` e esse ponto, e a ausencia de `clock` nas dependencias
 * dele esta escrita como decisao no proprio arquivo. Receber um relogio so para
 * satisfazer uma assinatura desfaria aquela decisao em silencio.
 *
 * **ESTA FUNCAO RECUSA EM VOZ ALTA em vez de aprovar em silencio.** Se a
 * capacidade estiver na regra dos 15 dias, ela LANCA: sem isso, ligar
 * `NO_PRAZO_DO_TELEFONE` de uma capacidade que passa por aqui faria o prazo
 * deixar de ser aplicado neste ponto **sem nada acusar** -- a quinta versao do
 * atributo declarado que ninguem le, e a pior, porque o atributo estaria certo e
 * o leitor e que estaria incompleto.
 */
export function recusaPorExigenciaDeCanal(
  capacidade: Capacidade,
  canais: EvidenciasDeCanal,
  interruptores: Interruptores = {},
): MotivoDaRecusa | null {
  if (NO_PRAZO_DO_TELEFONE[capacidade]) {
    throw new Error(
      `Capacidade ${capacidade}: ela esta na regra dos 15 dias do telefone ` +
        '(`NO_PRAZO_DO_TELEFONE`), e `recusaPorExigenciaDeCanal` NAO aplica prazo -- ela nao ' +
        'tem relogio. Aplicar meia matriz seria liberar o prazo em silencio neste ponto: use ' +
        '`recusaDaCapacidade`, passando `agora`, ou tire a capacidade do prazo.',
    );
  }
  return aplicarExigenciaDeCanal(capacidade, canais, interruptores);
}

/**
 * **So a regra de prazo**, para o ponto do produto que legitimamente nao conhece
 * as evidencias de canal de quem chama.
 *
 * Existe para que esse ponto nao precise INVENTAR evidencia que nao mediu. E o
 * caso do tronco de `pedir_conexao`: a exigencia dela e `nenhuma`, entao nao ha
 * o que conferir ali, e passar uma evidencia fabricada seria plantar o defeito de
 * amanha -- no dia em que a capacidade ganhasse exigencia, o ponto decidiria pelo
 * valor fabricado e nao pela matriz.
 */
export function recusaPorPrazoDoTelefone(
  capacidade: Capacidade,
  telefone: TelefoneDaConta,
  agora: Instant,
  interruptores: Interruptores = {},
): MotivoDaRecusa | null {
  if (!(interruptores.prazoDoTelefone ?? PRAZO_DO_TELEFONE_LIGADO)) return null;
  if (!NO_PRAZO_DO_TELEFONE[capacidade]) return null;
  return telefoneForaDoPrazo(telefone, agora) ? 'telefone_nao_validado_no_prazo' : null;
}
