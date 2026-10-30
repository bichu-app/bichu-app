/** A primeira mensagem da conversa, que é do sistema (critério 2). */
import { redigirCanalMediado, type TrechoRedigido } from '../../../shared/redaction/redigir.js';

/** O fuso em que "hoje às <hora>" é escrito. */
export const FUSO_DE_EXIBICAO = 'America/Sao_Paulo';

export interface DadosDoAviso {
  /** Nome do pet como ele aparece na tela. */
  readonly nomeDoPet: string;
  /** Quando a plaquinha foi escaneada. */
  readonly escaneadoEm: Date;
  /** O relógio de quem lê, para decidir entre "hoje" e a data. */
  readonly agora: Date;
  /** Bairro e cidade, já resolvidos. */
  readonly rotuloDaArea: string | null;
  /** O recado de quem achou, **como ele digitou**. */
  readonly recado: string | null;
}

export interface MensagemDoSistema {
  readonly texto: string;
  /** O que a redação retirou do recado. */
  readonly retirados: readonly TrechoRedigido[];
}

const DOIS_DIGITOS = (n: number): string => String(n).padStart(2, '0');

/** As partes de data e hora de um instante, no fuso de exibição. */
function partesNoFuso(instante: Date): { dia: string; mes: string; hora: string; minuto: string } {
  const formatador = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO_DE_EXIBICAO,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const partes = new Map(formatador.formatToParts(instante).map((p) => [p.type, p.value]));
  return {
    dia: partes.get('day') ?? '01',
    mes: partes.get('month') ?? '01',
    hora: DOIS_DIGITOS(Number(partes.get('hour') ?? '0') % 24),
    minuto: partes.get('minute') ?? '00',
  };
}

function mesmoDia(a: Date, b: Date): boolean {
  const chave = (d: Date): string => {
    const { dia, mes } = partesNoFuso(d);
    const ano = new Intl.DateTimeFormat('pt-BR', {
      timeZone: FUSO_DE_EXIBICAO,
      year: 'numeric',
    }).format(d);
    return `${ano}-${mes}-${dia}`;
  };
  return chave(a) === chave(b);
}

/** Monta a mensagem de abertura. */
export function primeiraMensagemDoSistema(dados: DadosDoAviso): MensagemDoSistema {
  const { dia, mes, hora, minuto } = partesNoFuso(dados.escaneadoEm);
  const quando = mesmoDia(dados.escaneadoEm, dados.agora)
    ? `hoje às ${hora}:${minuto}`
    : `em ${dia}/${mes} às ${hora}:${minuto}`;

  const linhas = [`Alguém escaneou a tag da ${dados.nomeDoPet} ${quando}.`];

  const area = (dados.rotuloDaArea ?? '').trim();
  if (area !== '') linhas.push(`Região: ${area}.`);

  const redigido = redigirCanalMediado(dados.recado);
  const recado = redigido.texto.trim();
  if (recado !== '') linhas.push(`Recado de quem achou: ${recado}`);

  return { texto: linhas.join('\n'), retirados: redigido.retirados };
}

/**
 * O aviso que o servidor manda quando alguém tenta passar o próprio endereço
 * (critério 16).
 */
export const AVISO_DE_DADO_RETIRADO =
  'O Bichu não entrega telefone, e-mail nem endereço por aqui, nos dois sentidos. ' +
  'Combine um ponto de encontro público e movimentado.';
