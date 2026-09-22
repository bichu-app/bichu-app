/**
 * A varredura dos envios que ninguém confirmou (critério 13 de `BICHUS-87`).
 *
 * O envio direto ao armazenamento tem um custo que o desenho paga de propósito:
 * **nós não sabemos se ele aconteceu.** O cliente pede a autorização, envia (ou
 * não, ou pela metade) e confirma (ou não). Quem nunca confirma deixa para trás
 * uma linha em `upload_intents` e, possivelmente, um objeto no bucket privado
 * que nenhuma linha de `pet_photos` referencia.
 *
 * Esse objeto é o pior tipo de lixo que existe num armazenamento cobrado por
 * volume: **invisível**. Ele não aparece em nenhuma tela, não quebra nada, e
 * cresce com cada tutor que trocou de ideia ou ficou sem sinal no meio do envio
 * — que é justamente o caso comum, porque o produto é usado na rua.
 *
 * ## A ordem é objeto primeiro, linha depois
 *
 * Apagar a linha antes do objeto perde o **único ponteiro** que existe para ele:
 * a chave só vive ali. Um objeto sem linha é lixo que ninguém consegue nomear,
 * e o custo de encontrá-lo depois é listar o bucket inteiro e cruzar com o
 * banco.
 *
 * Na ordem certa, a falha é benigna: se o armazenamento recusar a exclusão, a
 * linha fica, e a próxima rodada tenta de novo. O pior caso é tentar de novo; o
 * pior caso da ordem inversa é lixo permanente.
 */
import type { Clock } from '../../../shared/ports/index.js';
import type { MediaRepository } from '../ports/media-repository.js';
import type { ObjectStorage } from '../ports/object-storage.js';

/**
 * Quantas por rodada.
 *
 * Cinquenta, e não "todas": cada uma é uma chamada de rede ao armazenamento, e
 * uma varredura que encontrasse dez mil vencidas de uma vez seguraria a conexão
 * de banco e a rede do worker por minutos, competindo com o processamento de
 * foto — que é o trabalho que alguém está esperando. O resto sai na rodada
 * seguinte; não há pressa, porque ninguém está olhando.
 */
const POR_RODADA = 50;

export interface DependenciasDaVarredura {
  readonly repositorio: MediaRepository;
  readonly armazenamento: ObjectStorage;
  readonly clock: Clock;
}

export interface ResultadoDaVarredura {
  readonly examinadas: number;
  readonly removidas: number;
  readonly falhas: number;
}

export async function varrerEnviosVencidos(
  deps: DependenciasDaVarredura,
): Promise<ResultadoDaVarredura> {
  const agora = deps.clock.now();
  const vencidas = await deps.repositorio.listarIntencoesVencidas(agora, POR_RODADA);

  let removidas = 0;
  let falhas = 0;

  for (const intencao of vencidas) {
    try {
      // O `delete` da porta trata 404 como sucesso: o estado desejado é "não
      // existe", e o caso mais comum aqui é justamente o objeto nunca ter
      // chegado. Tratar ausência como erro deixaria a linha presa para sempre.
      await deps.armazenamento.delete('privado', intencao.objectKey);
      await deps.repositorio.descartarIntencao(intencao.id);
      removidas += 1;
    } catch {
      // Uma falha não derruba a rodada: as outras 49 continuam. Esta volta na
      // próxima, porque a linha não foi tocada.
      falhas += 1;
    }
  }

  return { examinadas: vencidas.length, removidas, falhas };
}
