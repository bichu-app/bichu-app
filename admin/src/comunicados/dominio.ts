/**
 * O dominio do COMUNICADO (broadcast): a mensagem que o painel manda para a
 * caixa de notificacoes de todo mundo.
 *
 * Tres regras decidem esta tela, e todas as tres moram aqui como funcao pura,
 * para que o teste as alcance sem montar a tela:
 *
 * 1. **Previa antes do disparo, sempre.** O operador escreve, pede a previa, ve
 *    o texto exatamente como a caixa vai mostrar e so entao pode disparar.
 *    Mudar o texto depois da previa VENCE a previa, e o disparo volta a ficar
 *    travado -- senao o painel mandaria um texto que ninguem conferiu.
 * 2. **Teto diario.** `remaining_today === 0` trava o disparo na tela, com o
 *    motivo escrito. Descobrir o teto pelo `409` seria descobrir depois de
 *    apertar o botao, e o `409` continua tratado porque outro operador pode
 *    disparar no meio.
 * 3. **Irreversivel.** Nao ha editar nem apagar: a lista e o registro
 *    permanente.
 *
 * **O rascunho nao atravessa a rede antes do disparo.** A previa pede ao
 * servidor so os NUMEROS (`getAdminBroadcastDispatchWindow`, um `GET` sem
 * corpo); quem renderiza titulo e corpo e o painel, que ja os tem na mao. A
 * previa continua obrigatoria -- ela so deixou de precisar de uma ida ao
 * servidor carregando o texto.
 *
 * **O teto vem do servidor** (`daily_cap`), e nao de uma constante daqui: duas
 * copias do mesmo numero divergem, e a que diverge e a que diz "resta 1" sobre
 * um teto que o banco ja fechou.
 *
 * Os tipos vem do contrato (`api/openapi.yaml`), nunca escritos a mao aqui.
 */
import type { Esquemas } from '../api/cliente.ts';
import { tipoDoProblema } from '../api/problema.ts';

export type Comunicado = Esquemas['AdminBroadcast'];
export type RascunhoDoComunicado = Esquemas['AdminBroadcastDraft'];
export type JanelaDeDisparo = Esquemas['AdminBroadcastDispatchWindow'];

/** `AdminBroadcastDraft.title`: 2..80. */
export const LIMITE_DO_TITULO = 80;
/** `AdminBroadcastDraft.body`: 2..1000. */
export const LIMITE_DO_CORPO = 1000;
/** O padrao de `listAdminBroadcasts.limit` (1..50). */
export const POR_PAGINA = 20;

export type CampoDoComunicado = 'c-titulo' | 'c-corpo';

export const ROTULOS: Record<CampoDoComunicado, string> = { 'c-titulo': 'Título', 'c-corpo': 'Mensagem' };
export const ORDEM_DOS_CAMPOS: CampoDoComunicado[] = ['c-titulo', 'c-corpo'];

export const MENSAGEM_DO_TITULO = `Escreva o título, de 2 a ${LIMITE_DO_TITULO} caracteres.`;
export const MENSAGEM_DO_CORPO = `Escreva a mensagem, de 2 a ${LIMITE_DO_CORPO} caracteres.`;

export interface ValoresDoComunicado {
  titulo: string;
  corpo: string;
}

export const VAZIO: ValoresDoComunicado = { titulo: '', corpo: '' };

/** O corpo da requisicao do disparo, ja aparado. */
export function rascunhoDe(v: ValoresDoComunicado): RascunhoDoComunicado {
  return { title: v.titulo.trim(), body: v.corpo.trim() };
}

/**
 * A identidade de um rascunho. E por ela que se sabe se a previa guardada ainda
 * descreve o que esta escrito: comparar o texto cru deixaria um espaco no fim
 * vencer a previa sem mudar nada do que seria enviado.
 */
export function textoDoRascunho(r: RascunhoDoComunicado): string {
  return JSON.stringify([r.title, r.body]);
}

export function textoDoComunicado(v: ValoresDoComunicado): string {
  return textoDoRascunho(rascunhoDe(v));
}

export function validarComunicado(v: ValoresDoComunicado): Partial<Record<CampoDoComunicado, string>> {
  const e: Partial<Record<CampoDoComunicado, string>> = {};
  const { title, body } = rascunhoDe(v);
  if (title.length < 2 || title.length > LIMITE_DO_TITULO) e['c-titulo'] = MENSAGEM_DO_TITULO;
  if (body.length < 2 || body.length > LIMITE_DO_CORPO) e['c-corpo'] = MENSAGEM_DO_CORPO;
  return e;
}

/**
 * A previa: o rascunho EXATO que ela mostrou, junto com os numeros que o
 * servidor deu naquele momento.
 *
 * O rascunho e guardado, e nao relido da tela, por duas razoes: e dele que sai
 * a identidade que decide se a previa venceu, e e ele que a caixa de previa
 * renderiza -- previa vencida continua mostrando o que foi conferido, e nao o
 * que esta sendo digitado agora.
 */
export interface JanelaGuardada {
  rascunho: RascunhoDoComunicado;
  janela: JanelaDeDisparo;
}

export type TravaDoDisparo = 'texto-invalido' | 'sem-previa' | 'previa-vencida' | 'teto-atingido';

/**
 * O que impede o disparo AGORA, ou `undefined` quando nada impede. A ordem
 * importa: sem texto valido nao ha previa a pedir, e e isso que a tela diz
 * primeiro.
 */
export function travaDoDisparo(v: ValoresDoComunicado, guardada: JanelaGuardada | undefined): TravaDoDisparo | undefined {
  if (Object.keys(validarComunicado(v)).length > 0) return 'texto-invalido';
  if (!guardada) return 'sem-previa';
  if (textoDoRascunho(guardada.rascunho) !== textoDoComunicado(v)) return 'previa-vencida';
  if (guardada.janela.remaining_today <= 0) return 'teto-atingido';
  return undefined;
}

/**
 * O motivo ESCRITO de cada trava: botao desligado sem explicacao e o defeito.
 *
 * O texto do teto so sai com numero quando ha janela na mao -- antes da primeira
 * previa o painel nao sabe qual e o teto, e chutar 3 aqui seria a segunda copia
 * do numero que o contrato passou a entregar.
 */
export function motivoDaTrava(trava: TravaDoDisparo, janela: JanelaDeDisparo | undefined): string {
  switch (trava) {
    case 'texto-invalido':
      return 'Escreva o título e a mensagem para ver a prévia.';
    case 'sem-previa':
      return 'Veja a prévia antes de disparar. O comunicado não pode ser desfeito nem apagado.';
    case 'previa-vencida':
      return 'O texto mudou depois da prévia. Veja a prévia de novo antes de disparar.';
    case 'teto-atingido':
      return janela
        ? `O teto de ${janela.daily_cap} comunicados por dia já foi atingido. O próximo pode sair amanhã.`
        : 'O teto de comunicados por dia já foi atingido. O próximo pode sair amanhã.';
  }
}

/**
 * O teto batido pelo `409`, e nao pela janela: outro operador disparou entre a
 * previa e este clique. O texto diz as duas coisas que a pessoa precisa saber
 * -- que nada foi enviado, e que a saida nao e tentar de novo.
 */
export function mensagemDoTetoNoDisparo(teto: number): string {
  return (
    `O teto de ${teto} comunicados por dia já foi atingido, provavelmente por outra pessoa. ` +
    'Nada foi enviado, e o próximo comunicado pode sair amanhã.'
  );
}

/** A tela decide pelo SLUG do problema e pelo status, nunca pelo texto do servidor. */
export function mensagemDoErroDoDisparo(status: number, erro: unknown, teto: number): string {
  if (tipoDoProblema(erro) === 'broadcast-daily-cap-reached' || status === 409) return mensagemDoTetoNoDisparo(teto);
  if (status === 400) return 'O servidor recusou o texto. Confira o título e a mensagem.';
  if (status === 429) return 'Muitos pedidos em pouco tempo. Espere alguns minutos e tente de novo.';
  return 'Não conseguimos falar com o servidor. Confira a internet e tente de novo. Nada foi enviado.';
}

/**
 * A falha da janela nunca fala de envio: ela e um `GET` que nao escreve nada.
 *
 * **Sem ramo de `400`.** `getAdminBroadcastDispatchWindow` nao tem corpo de
 * requisicao e nao declara `400` no contrato: nao ha o que o servidor recuse.
 * O titulo e a mensagem continuam conferidos aqui, por `validarComunicado`,
 * antes de qualquer ida ao servidor.
 */
export function mensagemDoErroDaJanela(status: number): string {
  if (status === 429) return 'Muitos pedidos em pouco tempo. Espere alguns minutos e tente de novo.';
  return 'Não conseguimos saber quantas caixas o comunicado alcança. Confira a internet e tente de novo.';
}

export function plural(n: number, singular: string, plural_: string): string {
  return n === 1 ? singular : plural_;
}

/** "Alcança agora 1.240 caixas de notificação." */
export function alcanceEmPalavras(quantas: number): string {
  return `Alcança agora ${quantas.toLocaleString('pt-BR')} ${plural(quantas, 'caixa', 'caixas')} de notificação.`;
}

/** "Ainda cabem 2 comunicados hoje, do teto de 3 por dia." */
export function tetoEmPalavras(restam: number, teto: number): string {
  if (restam <= 0) return `Nenhum comunicado cabe mais hoje: o teto é de ${teto} por dia.`;
  return `Ainda ${plural(restam, 'cabe', 'cabem')} ${restam} ${plural(restam, 'comunicado', 'comunicados')} hoje, do teto de ${teto} por dia.`;
}

/** Data e hora do disparo no fuso de quem opera o painel. */
export function quandoFoi(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
