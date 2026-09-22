/**
 * Avisar **um** vizinho, num aparelho.
 *
 * ## Por que esta porta é declarada aqui, e não importada de `notifications`
 *
 * §6: a porta é declarada por quem a **exige**. Quem exige avisar a vizinhança
 * é o disparo do caso de perdido, e ele mora aqui, junto da consulta de raio —
 * que é o que o cabeçalho de `notifications/ports/registro-de-aparelhos.ts`
 * pede explicitamente que não se mude de lugar ("uma porta que respondesse
 * 'quem recebe' traria a consulta de raio para dentro de `notifications`").
 *
 * A divisão que sai disso é limpa: **este módulo decide QUEM e QUANTOS;
 * `notifications` sabe COMO.** O texto do aviso, o transporte, a porteira de
 * superfície pública e a higiene de token ficam todos do outro lado, e nenhuma
 * linha deste módulo monta payload de push.
 *
 * ## O que atravessa esta porta são FATOS, e não uma mensagem pronta
 *
 * `AvisoDeVizinhanca` carrega o nome do pet, a espécie e o bairro — não um
 * título e um corpo já escritos. Montar o texto aqui seria a segunda fonte de
 * texto de push do sistema, e é assim que se descobre, meses depois, que o
 * alerta diz uma coisa no Android e outra no e-mail. Quem escreve é
 * `notifications/domain/conteudo-do-push.ts`, que também é a porteira que
 * recusa qualquer coisa parecida com dado pessoal antes de serializar.
 *
 * ## O endereço é o APARELHO, e não o token
 *
 * `aparelhoId`, nunca `pushToken`. O token é resolvido do outro lado, no
 * instante do envio, por `enderecoDeEnvio` — e o argumento inteiro está lá: um
 * disparo leva minutos para percorrer 500 pessoas, e entre a leitura da lista e
 * o envio alguém pode ter saído da conta ou removido o aparelho. Uma lista que
 * carregasse tokens mandaria para aparelho já revogado, e marcar a linha não
 * conserta isso.
 */

/**
 * Os quatro desfechos de avisar um aparelho, e nenhum deles é exceção.
 *
 * `semEndereco` e `aparelhoSumiu` são **resultados previstos e frequentes**, e
 * não falhas: entre a leitura da lista e o envio a pessoa pode ter removido o
 * aparelho, e o FCM recusa tokens mortos o tempo todo. Se virassem exceção,
 * cairiam na mesma vala das falhas de rede e a fila os repetiria para sempre
 * contra um aparelho que não existe mais. É a mesma decisão que
 * `ResultadoDoEnvio` já tomou um nível abaixo.
 */
export type ResultadoDaEntrega =
  /** O transporte aceitou. É tudo o que se pode afirmar daqui. */
  | 'aceito'
  /** A linha sumiu, perdeu o token ou perdeu a permissão entre a lista e o envio. */
  | 'semEndereco'
  /** O token estava morto; o aparelho foi revogado agora. */
  | 'aparelhoSumiu'
  /** Falha do caminho. Não derruba o disparo: o próximo aparelho é tentado. */
  | 'falhou';

export interface AvisoDeVizinhanca {
  readonly aparelhoId: string;
  readonly nomeDoPet: string;
  /**
   * O **código** da espécie (`dog`, `cat`, `other`), e não a palavra.
   *
   * Quem traduz código em texto é `notifications`, do outro lado desta porta,
   * pela mesma razão de o título e o corpo não atravessarem: texto de produto
   * tem uma fonte só. Mandar "cão" daqui abriria a segunda.
   */
  readonly especieCodigo: string | null;
  /**
   * O bairro, e o **teto** de precisão geográfica do aviso (critério 3 da
   * BICHUS-18). Ausente vira a variante sem lugar, que o texto do produto
   * escreve — e não um lugar vago inventado por quem chama.
   */
  readonly bairro: string | null;
  /** O `share_token`: a única chave do caso que sai daqui (ADR-0010, item 6). */
  readonly tokenPublico: string;
  readonly imagemUrl: string | undefined;
}

export interface EntregaDoAlerta {
  /**
   * Avisa um aparelho. **Não estoura**: o desfecho é o retorno.
   *
   * Um aparelho por chamada, pelo mesmo motivo de `PushSender.enviar`: o envio
   * em lote obriga quem chama a casar índice com token para saber qual aparelho
   * apagar, e é esse casamento, feito errado, que apaga o aparelho de outra
   * pessoa.
   */
  avisar(aviso: AvisoDeVizinhanca): Promise<ResultadoDaEntrega>;
}
