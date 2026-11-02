import { canalDeContatoConfirmado } from '../db/canal-de-contato-confirmado.js';
import type { Instant } from '../types/brands.js';

/**
 * O que foi verificado, e nao um selo generico -- o MESMO espirito de
 * `professionals/domain/nivel-de-verificacao.ts`, e o nivel e DERIVADO das
 * evidencias, nunca gravado. Nao existe coluna `nivel` neste banco e nao deve
 * passar a existir: nivel gravado e um valor que envelhece sozinho no dia em que
 * a conta ganha ou perde uma evidencia.
 */
export type NivelDeVerificacao = 'nao_verificado' | 'canal_verificado';

/**
 * Os niveis em ordem crescente de exigencia, escrita por EXTENSO -- e nao um
 * numero, para que acrescentar um nivel no meio seja uma edicao desta lista e nao
 * uma renumeracao silenciosa de tudo.
 */
export const NIVEIS_POR_EXIGENCIA: readonly NivelDeVerificacao[] = [
  'nao_verificado',
  'canal_verificado',
];

/**
 * **O vocabulario das capacidades, decidido pelo cliente em 02/11/2026.**
 *
 * Cada nome e uma coisa que a pessoa FAZ, e nao uma rota nem uma tela: a mesma
 * capacidade pode ser alcancada por dois caminhos (pedir conexao, por exemplo, tem
 * o do convite e o do apelido), e e a capacidade que o cliente decidiu, nao o
 * caminho.
 */
export type Capacidade =
  | 'cadastrar_achado'
  | 'mensagem_ao_tutor_do_achado'
  | 'ver_a_loja'
  | 'pedir_conexao'
  | 'cadastrar_evento'
  | 'recomendar_profissional';

/**
 * **A MATRIZ, E ELA E O PORTAO DE COMPILACAO.**
 *
 * `Record<Capacidade, NivelDeVerificacao>` e total: capacidade nova no vocabulario
 * **sem nivel declarado aqui nao compila**, e por isso nao consegue nascer
 * liberada por omissao. E o mesmo arranjo de `SEMANTICA_DO_EXCESSO` em
 * `shared/http/aplicacao-de-teto.ts`, pela mesma razao -- la o defeito era
 * `on_exceed` declarado e nao implementado virando "pode passar".
 *
 * **A tabela do cliente, verbatim na substancia (02/11/2026):**
 *
 * | nivel | pode |
 * |---|---|
 * | nao verificado | cadastrar pet que encontrou, enviar mensagem ao tutor do pet que encontrou, ver a Loja |
 * | e-mail verificado | tudo acima, mais cadastrar eventos e recomendar profissionais |
 *
 * **SOBRE O NOME `canal_verificado` EM VEZ DE `email_verificado`:** o cliente
 * escreveu *"e-mail verificado"*, e a regua que este repositorio mede e
 * `email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL` -- a emenda do
 * ADR-0010 de 21/10/2026, decisao dele, literal: *"Unificar agora, nas duas -- a
 * mesma regua (e-mail OU telefone) nos dois lugares, antes de telefone existir."*
 * As duas coincidem HOJE porque nada grava `phone_verified_at`, e portanto e-mail
 * e a unica porta para este nivel. **Nao estreitei a regua para so e-mail**: isso
 * seria redecidir, e no dia em que telefone confirmar tiraria do nivel uma conta
 * que o selo de 21/10 ja promete validada -- a mesma conta apareceria validada
 * para os outros e sem a capacidade para si, que foi exatamente o defeito que a
 * emenda de 21/10 corrigiu. O nome diz o que a regua mede.
 *
 * **`pedir_conexao` nao esta na tabela de niveis do cliente**, e fica em
 * `nao_verificado` porque e isso que o produto faz hoje (medido: nada em
 * `modules/connections` consulta canal verificado). Ela esta na matriz porque o
 * cliente a nomeou na REGRA DOS 15 DIAS -- *"adicionar novos usuarios"* -- e uma
 * capacidade que o prazo alcanca precisa existir aqui para o prazo ter o que
 * alcancar.
 */
export const NIVEL_EXIGIDO: Readonly<Record<Capacidade, NivelDeVerificacao>> = {
  /** *"cadastrar pet que encontrou"*. Sem trava, e e assim que o cliente quer. */
  cadastrar_achado: 'nao_verificado',
  /** *"enviar mensagem ao tutor do pet que encontrou"*. Sem trava, por decisao. */
  mensagem_ao_tutor_do_achado: 'nao_verificado',
  /** *"ver a Loja"*. Sem trava, por decisao. */
  ver_a_loja: 'nao_verificado',
  /** O produto de hoje. O cliente nao a pos em nivel nenhum; so no prazo. */
  pedir_conexao: 'nao_verificado',
  /** *"cadastrar eventos"*. Ja estava gateado em `network/application`. */
  cadastrar_evento: 'canal_verificado',
  /** *"recomendar profissionais"*. Ja estava gateado em `sugestao-do-diretorio`. */
  recomendar_profissional: 'canal_verificado',
};

/**
 * **A SEGUNDA DECLARACAO OBRIGATORIA, e ela e o segundo portao de compilacao.**
 *
 * A regra dos 15 dias do cliente nao alcanca todas as capacidades: ele nomeou
 * DUAS -- *"bloqueado para publicar novos eventos e adicionar novos usuarios"*.
 * Um `Record<Capacidade, boolean>` total obriga toda capacidade nova a responder
 * "o prazo do telefone te alcanca?", em vez de a resposta ser `undefined` --
 * que em JavaScript e falso e portanto seria uma dispensa por omissao.
 */
export const NO_PRAZO_DO_TELEFONE: Readonly<Record<Capacidade, boolean>> = {
  cadastrar_achado: false,
  mensagem_ao_tutor_do_achado: false,
  ver_a_loja: false,
  /** *"adicionar novos usuarios"* (cliente, 02/11/2026). */
  pedir_conexao: true,
  /** *"publicar novos eventos"* (cliente, 02/11/2026). */
  cadastrar_evento: true,
  recomendar_profissional: false,
};

/** As capacidades que o prazo do telefone alcanca, derivadas da declaracao acima. */
export const CAPACIDADES_NO_PRAZO_DO_TELEFONE: readonly Capacidade[] = (
  Object.keys(NO_PRAZO_DO_TELEFONE) as Capacidade[]
).filter((capacidade) => NO_PRAZO_DO_TELEFONE[capacidade]);

/** Quantos dias a conta tem para validar o telefone (cliente, 02/11/2026). */
export const PRAZO_DO_TELEFONE_EM_DIAS = 15;

const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * **O INTERRUPTOR, E ELE ESTA DESLIGADO EM 02/11/2026.**
 *
 * **HOJE NENHUM USUARIO DESTE PRODUTO TEM COMO VALIDAR TELEFONE.** Medido, e nao
 * suposto: nao existe provedor de SMS nem de WhatsApp em `src/`, nao existe
 * operacao de validacao de telefone em `api/openapi.yaml`, e **nada neste
 * repositorio escreve `users.phone_verified_at`** -- a coluna existe desde a
 * migracao `20260917000001` e nunca recebeu valor. O cliente decidiu que SMS e
 * WhatsApp entram **na subida de producao**.
 *
 * Portanto: ligar esta constante HOJE bloquearia **a base inteira** em
 * `cadastrar_evento` e `pedir_conexao` no dia 16 de vida de cada conta, por uma
 * exigencia que ninguem tem como cumprir. Nao e um risco teorico -- e a
 * consequencia aritmetica de `telefoneForaDoPrazo` sobre contas cujo
 * `validadoEm` e `null` para sempre.
 *
 * **A regra NAO esta ausente, esta inerte**: `telefoneForaDoPrazo` abaixo esta
 * escrita por inteiro e tem caso de teste que a prova recusando. O unico passo
 * que falta e este booleano, e ele e um passo so de proposito -- quando a
 * validacao de telefone existir, liga-lo aqui faz a regra valer em todos os
 * pontos que consultam a matriz, sem reescrever condicao nenhuma.
 *
 * **A SEGUNDA TRAVA, e ela e deliberada:** mesmo ligado este interruptor, um
 * ponto que passa `TELEFONE_SEM_VALIDACAO_POSSIVEL` continua sem bloquear
 * ninguem. Sao duas fechaduras independentes, e e isso que se quer: a pergunta
 * *"alguem pode ligar isso por engano e bloquear a base?"* tem de ter resposta
 * "nao" por mais de um motivo.
 *
 * **Como o teste prova a recusa sem editar este valor:** o interruptor entra em
 * `recusaDaCapacidade` e `recusaPorPrazoDoTelefone` como PARAMETRO com padrao --
 * o mesmo arranjo de `implementadas` em `conferirAcoesDeExcesso`. O caso de teste
 * passa `true` e mede a recusa de verdade; producao nunca passa nada e fica com
 * este `false`.
 */
export const PRAZO_DO_TELEFONE_LIGADO: boolean = false;

/**
 * O estado do telefone de uma conta, para a regra de prazo.
 *
 * **Os instantes sao `Instant` e nao `Date`**: `Date` so e construido em
 * `shared/time/clock.ts` nesta casa (o ESLint o impoe), e a regra de prazo e
 * aritmetica -- nao precisa de objeto de data para somar 15 dias.
 *
 * `prazoComecouEm` e o instante a partir do qual os 15 dias correm. Ele e um
 * campo e nao `users.created_at` lido aqui dentro porque quem decide de onde o
 * prazo conta e o chamador: para a conta que ja existia quando a validacao de
 * telefone entrar, contar do cadastro daria 15 dias ja vencidos no primeiro
 * minuto, e essa decisao e do cliente e nao deste arquivo.
 */
export interface EstadoDoTelefoneDaConta {
  /** Quando o telefone foi validado. `null` e "nunca". */
  readonly validadoEm: Instant | null;
  readonly prazoComecouEm: Instant;
}

/**
 * **O valor que todo ponto do produto passa HOJE.**
 *
 * Nao e um `null` nem um objeto com campos vazios: e um literal com nome, para que
 * procurar por ele ache TODOS os pontos que precisam de dado de verdade no dia em
 * que a validacao de telefone existir. Um `null` nao se procura; este nome se
 * procura.
 */
export const TELEFONE_SEM_VALIDACAO_POSSIVEL = 'validacao-de-telefone-nao-existe' as const;

export type TelefoneDaConta =
  | EstadoDoTelefoneDaConta
  | typeof TELEFONE_SEM_VALIDACAO_POSSIVEL;

/**
 * As evidencias de UMA conta, como a matriz as le.
 *
 * **O nivel chega DERIVADO, e as duas portas de derivacao estao logo abaixo** --
 * `nivelDaConta`, para quem tem os dois instantes em memoria, e
 * `nivelDoCanalConfirmado`, para quem tem o booleano que a consulta ja derivou em
 * SQL. **Nenhuma das duas reescreve a condicao de "validado"**: as duas chamam
 * `shared/db/canal-de-contato-confirmado.ts`, a fonte unica que
 * `portao-regua-do-canal-de-contato` protege.
 *
 * O campo e `nivel` e nao um par de instantes porque a maior parte do produto NAO
 * tem os instantes: a autorizacao mora na clausula `WHERE` (ADR-0021), e o que
 * volta de la e o booleano da regua, nao as datas. Pedir instantes a quem tem o
 * booleano obrigaria o chamador a INVENTAR uma data para dizer "verificado" -- e
 * data fabricada e um valor que um dia alguem le como se fosse verdade.
 */
export interface EvidenciasDaConta {
  readonly nivel: NivelDeVerificacao;
  readonly telefone: TelefoneDaConta;
}

/**
 * O nivel DERIVADO dos instantes. Nunca lido de coluna nenhuma.
 *
 * Para quem tem a conta em memoria -- hoje, as projecoes de `Me`.
 */
export function nivelDaConta(conta: {
  readonly emailVerifiedAt: Date | null;
  readonly phoneVerifiedAt: Date | null;
}): NivelDeVerificacao {
  return canalDeContatoConfirmado(conta) ? 'canal_verificado' : 'nao_verificado';
}

/**
 * O nivel a partir do booleano que a CONSULTA ja derivou.
 *
 * Existe para que nenhum chamador escreva o ternario a mao: a traducao de
 * "canal confirmado" para "nivel" e uma decisao, e decisao repetida em seis
 * lugares e seis lugares para ela divergir. O booleano que entra aqui e sempre o
 * de `canalDeContatoConfirmadoNoSql`, a MESMA regua.
 */
export function nivelDoCanalConfirmado(confirmado: boolean): NivelDeVerificacao {
  return confirmado ? 'canal_verificado' : 'nao_verificado';
}

/** Verdadeiro quando `nivel` cumpre `exigido`. */
export function nivelCumpre(nivel: NivelDeVerificacao, exigido: NivelDeVerificacao): boolean {
  return NIVEIS_POR_EXIGENCIA.indexOf(nivel) >= NIVEIS_POR_EXIGENCIA.indexOf(exigido);
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

/** Por que a capacidade foi recusada. `null` e "nao foi". */
export type MotivoDaRecusa = 'nivel_insuficiente' | 'telefone_nao_validado_no_prazo';

/**
 * **A DECISAO, e ela sai da matriz e de mais lugar nenhum.**
 *
 * Devolve o motivo da recusa, ou `null` quando a capacidade esta liberada. Quem
 * chama traduz o motivo no erro da sua superficie -- a matriz nao conhece HTTP.
 */
export function recusaDaCapacidade(
  capacidade: Capacidade,
  conta: EvidenciasDaConta,
  agora: Instant,
  ligado: boolean = PRAZO_DO_TELEFONE_LIGADO,
): MotivoDaRecusa | null {
  if (!nivelCumpre(conta.nivel, NIVEL_EXIGIDO[capacidade])) return 'nivel_insuficiente';
  return recusaPorPrazoDoTelefone(capacidade, conta.telefone, agora, ligado);
}

/**
 * **So a regua de NIVEL**, para o ponto que legitimamente nao tem relogio.
 *
 * `SugestaoDoDiretorio` e esse ponto, e a ausencia de `clock` nas dependencias
 * dele esta escrita como decisao no proprio arquivo. Receber um `new Date()` so
 * para satisfazer uma assinatura seria desfazer aquela decisao em silencio.
 *
 * **ESTA FUNCAO RECUSA EM VOZ ALTA em vez de aprovar em silencio.** Se a
 * capacidade estiver na regra dos 15 dias, ela LANCA: sem isso, ligar
 * `NO_PRAZO_DO_TELEFONE` de uma capacidade que passa por aqui faria o prazo
 * deixar de ser aplicado neste ponto **sem nada acusar** -- a quinta versao do
 * atributo declarado que ninguem le, e a pior, porque o atributo estaria certo e
 * o leitor e que estaria incompleto. E o mesmo arranjo de
 * `conferirAcoesDeExcesso`, e pela mesma razao: "nao consegui aplicar" nunca e
 * "aprovei".
 */
export function recusaPorNivel(
  capacidade: Capacidade,
  nivel: NivelDeVerificacao,
): MotivoDaRecusa | null {
  if (NO_PRAZO_DO_TELEFONE[capacidade]) {
    throw new Error(
      `Capacidade ${capacidade}: ela esta na regra dos 15 dias do telefone ` +
        '(`NO_PRAZO_DO_TELEFONE`), e `recusaPorNivel` NAO aplica prazo -- ela nao tem relogio. ' +
        'Aplicar meia matriz seria liberar o prazo em silencio neste ponto: use ' +
        '`recusaDaCapacidade`, passando `agora`, ou tire a capacidade do prazo.',
    );
  }
  return nivelCumpre(nivel, NIVEL_EXIGIDO[capacidade]) ? null : 'nivel_insuficiente';
}

/**
 * **So a regra de prazo**, para o ponto do produto que legitimamente nao conhece o
 * canal de contato de quem chama.
 *
 * Existe para que esse ponto nao precise INVENTAR um `canalDeContatoConfirmado`
 * que nao mediu. Passar `false` ali seria conservador hoje e uma armadilha
 * amanha: no dia em que a capacidade subisse de nivel, o ponto comecaria a
 * recusar TODO MUNDO, e a causa estaria num valor fabricado e nao na matriz.
 */
export function recusaPorPrazoDoTelefone(
  capacidade: Capacidade,
  telefone: TelefoneDaConta,
  agora: Instant,
  ligado: boolean = PRAZO_DO_TELEFONE_LIGADO,
): MotivoDaRecusa | null {
  if (!ligado) return null;
  if (!NO_PRAZO_DO_TELEFONE[capacidade]) return null;
  return telefoneForaDoPrazo(telefone, agora) ? 'telefone_nao_validado_no_prazo' : null;
}
