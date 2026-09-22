/**
 * A primeira mensagem da conversa, que é do sistema (critério 2).
 *
 * O texto é fixo pelo critério: `Alguem escaneou a tag da <nome> hoje as
 * <hora>.`, seguido, quando houver, da localização **em nível de bairro** e do
 * recado de quem achou.
 *
 * ## Três decisões que não são estilo
 *
 * **A localização entra em nível de bairro e nunca mais fina.** O ADR-0010 fixa
 * bairro e cidade como precisão máxima em superfície que sai do servidor, e
 * chama isso de critério de reprovação em revisão. Esta função recebe um rótulo
 * pronto (`area_label`) e não uma coordenada, porque receber coordenada aqui
 * seria deixar a decisão de arredondar para quem chama — e essa decisão já foi
 * tomada.
 *
 * **O recado é redigido, como qualquer mensagem.** `found_reports.notes` guarda
 * o que o achador digitou, sem redação: é o formulário público do aviso, e a
 * coluna nasceu antes desta história. Quando esse texto atravessa para o tutor,
 * ele vira mensagem do canal mediado e passa pela mesma redação do critério 13.
 * Redigir só o que é enviado pela tela da conversa deixaria o caminho mais
 * provável de todos — o primeiro recado, escrito por quem está com o animal na
 * mão — passando telefone em claro.
 *
 * **O horário é renderizado no servidor, num fuso só.** É o preço de o texto do
 * critério dizer "hoje às", que é relativo a um relógio, e de a mesma frase
 * precisar aparecer igual no app (Flutter) e na página do achador (BICHUS-41).
 * O fuso escolhido está abaixo e é uma pergunta em aberto para o cliente: um
 * tutor em Manaus lê uma hora a mais do que o relógio dele.
 */
import { redigirCanalMediado, type TrechoRedigido } from '../../../shared/redaction/redigir.js';

/**
 * O fuso em que "hoje às <hora>" é escrito.
 *
 * Decisão conservadora enquanto o cliente não responde: São Paulo cobre a maior
 * parte da base e é o fuso em que o produto foi desenhado. A alternativa —
 * mandar o instante cru e deixar cada cliente formatar — espalha a mesma regra
 * de apresentação por dois aplicativos e uma página web.
 */
export const FUSO_DE_EXIBICAO = 'America/Sao_Paulo';

export interface DadosDoAviso {
  /** Nome do pet como ele aparece na tela. */
  readonly nomeDoPet: string;
  /** Quando a plaquinha foi escaneada. */
  readonly escaneadoEm: Date;
  /** O relógio de quem lê, para decidir entre "hoje" e a data. */
  readonly agora: Date;
  /** Bairro e cidade, já resolvidos. Nunca coordenada. */
  readonly rotuloDaArea: string | null;
  /** O recado de quem achou, **como ele digitou**. Sai daqui redigido. */
  readonly recado: string | null;
}

export interface MensagemDoSistema {
  readonly texto: string;
  /** O que a redação retirou do recado. Vazio quando não havia recado. */
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
    // `hour12: false` ainda devolve "24" à meia-noite em alguns ambientes.
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

/**
 * Monta a mensagem de abertura.
 *
 * "hoje às" só quando é hoje de verdade. Um aviso lido no dia seguinte dizendo
 * "hoje" faz o tutor procurar o animal no lugar errado, na hora errada — é o
 * tipo de imprecisão que parece detalhe de texto e custa uma tarde de busca.
 */
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
 *
 * Ele existe porque proteger só um lado deixa a casa do tutor exposta por
 * iniciativa dele mesmo: a pessoa que digita a própria rua não está sendo
 * atacada, está tentando resolver — e é exatamente assim que o falso achador
 * descobre onde bater. A frase explica, em vez de o texto sumir sozinho.
 */
export const AVISO_DE_DADO_RETIRADO =
  'O Bichu não entrega telefone, e-mail nem endereço por aqui, nos dois sentidos. ' +
  'Combine um ponto de encontro público e movimentado.';
