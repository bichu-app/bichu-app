/**
 * A foto do achado, como o WORKER a enxerga.
 *
 * ## Por que esta porta existe, e o que ela conserta
 *
 * A foto de pet passa pelo worker: tipo conferido nos bytes, derivada
 * reescrita do zero, **nenhum metadado copiado**. A foto do ACHADO não passava
 * por nada. O tipo era aceito pela declaração do cliente
 * (`found-report-service.ts`), não havia derivada, e **o EXIF ficava no
 * arquivo**.
 *
 * Foto de celular carrega **coordenada de GPS** no EXIF. Num produto de pet
 * perdido isso entrega onde a pessoa que achou o animal estava — e ela
 * costuma ter achado o animal perto de onde mora. Hoje não vaza por acidente
 * (nada envia a foto e `photo_url` sai nulo em `found-report-routes.ts`), mas
 * **vaza no dia em que a conversa mediada servir a foto**, que é o que o
 * critério 9 da BICHUS-35 promete que vai acontecer. A hora de limpar é antes
 * de existir o consumidor, não depois.
 *
 * ## A derivada é PRIVADA, e o original fica
 *
 * O critério 9 é literal: a foto do achador "é vista pelo tutor dentro da
 * conversa mediada, e só". Então a derivada higienizada vai para o bucket
 * **privado**, com a chave `found-reports/{id|sem-conta}/sanitized/{128
 * bits}.{ext}` — mesmo prefixo do original, para que política de bucket, ciclo
 * de vida e expurgo dos 30 dias tratem as duas juntas.
 *
 * E **o original não é apagado**. O contrato ainda diz, em
 * `createFinderPhotoUploadIntent`, que "o arquivo original e apagado assim que
 * a derivada e gerada"; essa frase descreve um worker que nunca existiu, e
 * apagar o original é precisamente o que não se faz — é dele que sai qualquer
 * derivada futura, e um corte errado não tem volta. A descrição do contrato foi
 * corrigida para dizer o que o código faz.
 *
 * ## Sem tabela nova
 *
 * O estado da higiene mora em `upload_intents`, nas colunas que a migração
 * `20261001000006` acrescenta. Uma tabela `found_report_photos` espelhando
 * `pet_photos` seria o desenho "certo" e seria também uma migração grande para
 * guardar quatro campos de uma foto que o produto trata como atributo do aviso
 * (`found_reports.photo_upload_id`): o vínculo já existe e é 1:1.
 */
import type { ObjectKey } from '../../../shared/types/brands.js';

/** O trabalho da fila. Mesmo prefixo de `media.process_upload`. */
export const TRABALHO_DE_HIGIENE_DA_FOTO_DO_ACHADO = 'media.sanitize_found_photo' as const;

/**
 * `pendente` → `pronta` | `recusada` | `ausente`. Nunca volta.
 *
 * `ausente` é o objeto que nunca chegou: a intenção foi assinada, a pessoa
 * desistiu no meio do envio, e não há bytes. É desfecho FINAL e não falha —
 * sem isso a varredura reenfileiraria para sempre a mesma intenção vazia.
 */
export type StatusDaHigiene = 'pendente' | 'pronta' | 'recusada' | 'ausente';

/** A intenção de foto do achado, como o worker precisa dela. */
export interface FotoDoAchadoParaHigienizar {
  readonly uploadIntentId: string;
  /**
   * O segmento de dono da chave: o `found_report_id`, ou `sem-conta` quando
   * quem enviou não tem conta. Sai da chave do ORIGINAL e não de uma coluna:
   * é ela que decide onde a derivada mora, e as duas precisam combinar.
   */
  readonly dono: string;
  readonly originalKey: ObjectKey;
  readonly status: StatusDaHigiene;
}

export interface FotosDoAchadoDoWorker {
  /** `null` quando a intenção não existe mais, ou o id não é UUID. */
  paraHigienizar(uploadIntentId: string): Promise<FotoDoAchadoParaHigienizar | null>;
  /**
   * As intenções que ainda não passaram pela higiene.
   *
   * É isto que liga o worker aos DOIS caminhos do achado sem precisar de rota
   * nova: a foto do achador com conta não tem operação de confirmação no
   * contrato (a intenção é assinada e ninguém a confirma), e a do achador sem
   * conta é confirmada pela referência opaca em `PATCH /finder/found-report`.
   * Uma varredura cobre os dois, e cobre também o que já está no balde.
   */
  pendentes(limite: number): Promise<readonly FotoDoAchadoParaHigienizar[]>;
  /** Só a partir de `pendente`: estado final não volta. */
  marcarHigienizada(uploadIntentId: string, chave: ObjectKey, agora: Date): Promise<void>;
  marcarRecusada(uploadIntentId: string, motivo: string, agora: Date): Promise<void>;
  marcarAusente(uploadIntentId: string, agora: Date): Promise<void>;
}

/**
 * AS DUAS ESPÉCIES DO ACHADO, e esta é a ÚNICA definição delas.
 *
 * Ela morava como `const` privada em `kysely-fotos-do-achado.ts`, e a varredura
 * de envios vencidos (`varrer-envios-vencidos.ts`) não tinha como enxergá-la —
 * foi assim que a varredura passou a apagar a foto do achado sem que nada
 * acusasse. Duas listas dos mesmos dois valores em dois arquivos é o defeito
 * esperando para acontecer de novo: quem acrescentar uma terceira espécie de
 * foto de achado amanhã só vai lembrar de uma delas.
 */
export const ESPECIES_DO_ACHADO = ['found_report_photo', 'finder_photo'] as const;

/** `true` quando a espécie é uma das duas do achado. */
export function eDoAchado(especie: string): boolean {
  return (ESPECIES_DO_ACHADO as readonly string[]).includes(especie);
}
