/**
 * Porta por onde um aviso sai para o aparelho de alguém.
 *
 * Hoje há uma implementação: FCM HTTP v1, em `adapters/external/`. A porta
 * existe para que o nome do provedor não apareça em lugar nenhum além dali
 * (ADR-0008, ADR-0012) e para que o caso de uso seja testável sem rede.
 *
 * ## Por que ela mora AQUI, e não em `shared/ports/`
 *
 * `shared/ports/` é para porta transversal — a que mais de um módulo precisa.
 * Push parece ser isso, e não é: quem **exige** esta porta é o módulo que
 * notifica. `lostfound` não envia push; ele abre um caso, e notificar é
 * consequência. A regra de §6 é que a porta é declarada por quem a exige, e o
 * precedente ao lado é `registro-de-entregas.ts`, que também é declarado e
 * implementado por este módulo sem deixar de ser porta.
 *
 * O efeito prático de estar aqui: outro módulo alcança `PushSender` importando
 * `modules/notifications/ports/`, que é a única camada pública de um módulo, e
 * a fronteira de lint continua valendo sem exceção nova.
 *
 * ## O que esta porta EXIGE de quem a implementa
 *
 * **1. Nada de dado pessoal na mensagem, e a checagem é do implementador
 * também.** Notificação é superfície pública: ela aparece na tela bloqueada, ao
 * lado de quem estiver junto da pessoa, e sobrevive num servidor de terceiro no
 * caminho. Vale para ela a lista do ADR-0010 §"O que a rota pública jamais
 * exibe", inclusive o item 6 — `pet_id`, `user_id`, `case_id` ou qualquer UUID
 * de banco, **sem exceção**. A guarda está em `domain/conteudo-do-push.ts`, e
 * o adaptador a chama de novo antes de serializar: ela é a última porteira
 * antes do fio, e uma mensagem montada à mão por um chamador futuro não pode
 * escapar dela.
 *
 * **2. Token morto é resposta, não exceção.** `UNREGISTERED` e `NOT_FOUND` do
 * transporte significam que aquele aparelho desinstalou o app ou trocou de
 * token, e a higiene do ADR-0008 manda apagá-lo na hora. Isso é um desfecho
 * previsto e frequente — se virasse exceção, ele entraria na mesma vala das
 * falhas de rede e a fila o repetiria para sempre contra um aparelho que não
 * existe mais.
 *
 * **3. Falha precisa dizer se vale tentar de novo.** `PushNaoEnviadoError`
 * carrega `retentavel` como campo, e não como adjetivo na mensagem, porque
 * quem decide é a fila e ela lê código, não texto. Cota estourada e transporte
 * fora do ar voltam; mensagem malformada e projeto errado **não** voltam, e
 * repeti-las é gastar a fila até alguém olhar.
 *
 * **4. O token do aparelho não entra em mensagem de erro nem em log.** Ele
 * identifica uma instalação e, para quem tiver a credencial do projeto, é o
 * endereço para onde mandar qualquer coisa. Vale a mesma regra do item 5 da
 * porta de segredos.
 *
 * ## O que esta porta deliberadamente não faz
 *
 * Não assina tópico, não lê nem escreve registro de aparelho, não decide QUEM
 * recebe e não agrupa. O raio de 5 km, o teto de fadiga e o registro do token
 * são de outras camadas; aqui é só a saída. Uma porta larga viraria o caminho
 * mais curto para o resto do Firebase entrar, que é exatamente a fronteira que
 * o ADR-0008 escreveu para não perder.
 */

/**
 * O token de registro do aparelho, como o SDK do app o entregou.
 *
 * Não é tipo marcado: ele viaja do app ao banco e daqui ao transporte sem
 * ninguém o interpretar, e embrulhá-lo só acrescentaria conversão nas três
 * pontas.
 */
export type TokenDeAparelho = string;

/** Prioridade de entrega. Alta acorda o aparelho; normal espera a próxima janela. */
export type PrioridadeDePush = 'alta' | 'normal';

/**
 * A mensagem, já reduzida ao que pode aparecer numa tela bloqueada.
 *
 * Quem monta é `domain/conteudo-do-push.ts`. Montar isto à mão é possível e não
 * é proibido — a guarda do adaptador continua valendo — mas o texto do produto
 * mora lá, e duas fontes de texto de push é como se descobre, meses depois, que
 * o alerta diz uma coisa no Android e outra no e-mail.
 */
export interface MensagemDePush {
  readonly token: TokenDeAparelho;

  /** Título e corpo: o que a pessoa lê sem desbloquear o aparelho. */
  readonly titulo: string;
  readonly corpo: string;

  /**
   * O que o app recebe junto, para saber onde abrir.
   *
   * **Só chave opaca.** O identificador estável de um caso aqui é o
   * `share_token`, o mesmo que o link de compartilhamento já carrega — nunca o
   * `case_id`. Ver a guarda, e o item 6 do ADR-0010.
   */
  readonly dados: Readonly<Record<string, string>>;

  /**
   * Agrupa no aparelho: uma chave, uma notificação visível.
   *
   * O ADR-0008 manda agrupar por caso, e o motivo é de produto: três avisos
   * empilhados do mesmo caso não informam três vezes mais, empurram os outros
   * para fora da bandeja e ensinam a pessoa a limpar sem ler.
   */
  readonly chaveDeAgrupamento: string;

  /**
   * Quanto tempo o transporte pode segurar a mensagem para um aparelho
   * desligado, em segundos.
   *
   * Existe porque alerta velho não é só inútil: ele **atrapalha**. Um aviso de
   * "pet perdido perto de você" entregue oito horas depois chega quando o caso
   * já encerrou, e a próxima vez que o aviso de verdade chegar a pessoa já
   * aprendeu que ele não vale a interrupção.
   */
  readonly validadeEmSegundos: number;

  readonly prioridade: PrioridadeDePush;

  /**
   * A foto do pet, quando houver. URL pública e opaca, servida pelo hostname de
   * mídia — nunca caminho de arquivo, nunca metadado.
   *
   * A foto **é** o alerta: UX 11.1 pede foto grande no corpo, porque quem vai
   * reconhecer o animal na rua reconhece a imagem, não o texto.
   */
  readonly imagemUrl?: string | undefined;
}

/**
 * Os dois desfechos de um envio aceito pelo transporte.
 *
 * `aceito` não é "chegou": o transporte assumiu a entrega. Entrega de verdade
 * depende do aparelho estar alcançável e, no parque Android brasileiro, da
 * gestão de bateria do fabricante — que o ADR-0008 já registra como caso
 * conhecido e não como defeito intermitente. Nenhuma camada acima desta pode
 * prometer entrega, e é por isso que o nome do estado não diz "entregue".
 */
export type ResultadoDoEnvio =
  /** O transporte aceitou. É tudo o que se pode afirmar daqui. */
  | 'aceito'
  /**
   * O token não existe mais: app desinstalado, dados limpos, token rotacionado.
   * Quem chamou **apaga o aparelho agora** (higiene de token, ADR-0008).
   */
  | 'aparelho-sumiu';

/**
 * A falha que todo adaptador precisa produzir, em vez do erro do transporte.
 *
 * `retentavel` é campo porque quem lê é a fila, e `motivo` é rótulo curto e
 * estável para métrica — o texto da mensagem é para humano e pode mudar.
 */
export class PushNaoEnviadoError extends Error {
  /** `true` = falha do caminho (rede, cota, transporte fora do ar). */
  readonly retentavel: boolean;

  /** Rótulo curto e estável, para contar sem depender do texto. */
  readonly motivo: string;

  constructor(motivo: string, retentavel: boolean, explicacao: string) {
    super(`Push não enviado (${motivo}). ${explicacao}`);
    this.name = 'PushNaoEnviadoError';
    this.motivo = motivo;
    this.retentavel = retentavel;
  }
}

export interface PushSender {
  /**
   * Manda uma mensagem para um aparelho.
   *
   * Um aparelho por chamada, de propósito. O envio em lote do transporte
   * devolve um resultado por token e obriga quem chama a casar índice com
   * token para saber qual aparelho apagar — e é esse casamento, feito errado,
   * que apaga o aparelho de outra pessoa. O ganho de lote é de rede; o custo é
   * um defeito silencioso em dado de usuário.
   */
  enviar(mensagem: MensagemDePush): Promise<ResultadoDoEnvio>;

  /**
   * De onde as mensagens saem, para o log de subida.
   *
   * Mesma razão do `fonte` da porta de segredos: "por onde este processo manda
   * push?" é a primeira pergunta de todo incidente de notificação, e respondê-la
   * olhando para `ENVIRONMENT` é deduzir em vez de ler. **Não contém
   * credencial nem token de aparelho.**
   */
  readonly transporte: string;
}
