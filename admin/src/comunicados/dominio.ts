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

/** A identidade de um rascunho. */
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
 * A previa: o rascunho EXATO que ela mostrou, junto com os numeros que o servidor
 * deu naquele momento.
 */
export interface JanelaGuardada {
  rascunho: RascunhoDoComunicado;
  janela: JanelaDeDisparo;
}

export type TravaDoDisparo = 'texto-invalido' | 'sem-previa' | 'previa-vencida' | 'teto-atingido';

/** O que impede o disparo AGORA, ou `undefined` quando nada impede. */
export function travaDoDisparo(v: ValoresDoComunicado, guardada: JanelaGuardada | undefined): TravaDoDisparo | undefined {
  if (Object.keys(validarComunicado(v)).length > 0) return 'texto-invalido';
  if (!guardada) return 'sem-previa';
  if (textoDoRascunho(guardada.rascunho) !== textoDoComunicado(v)) return 'previa-vencida';
  if (guardada.janela.remaining_today <= 0) return 'teto-atingido';
  return undefined;
}

/** O motivo ESCRITO de cada trava: botao desligado sem explicacao e o defeito. */
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
 * previa e este clique.
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

/** A falha da janela nunca fala de envio: ela e um `GET` que nao escreve nada. */
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
