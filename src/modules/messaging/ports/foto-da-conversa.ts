import type { ConversationId } from '../../../shared/types/brands.js';

/** O desfecho da resolução. */
export type FotoParaAMensagem =
  /** A derivada higienizada existe. */
  | { readonly situacao: 'pronta'; readonly chaveHigienizada: string }
  /** A higiene ainda não terminou (`sanitize_status = 'pendente'`). */
  | { readonly situacao: 'pendente' }
  /** A higiene RECUSOU os bytes. */
  | { readonly situacao: 'recusada'; readonly motivo: string }
  /** A intenção foi assinada e os bytes nunca chegaram. */
  | { readonly situacao: 'ausente' }
  /** A referência não existe, **ou não é do aviso desta conversa**. */
  | { readonly situacao: 'nao-encontrada' };

export interface FotoDaConversa {
  /** O lado COM CONTA, pelo `upload_id` de `createFoundReportPhotoUploadIntent`. */
  porUploadId(
    conversa: ConversationId,
    chamador: string,
    uploadId: string,
  ): Promise<FotoParaAMensagem>;

  /** O lado SEM CONTA, pela referência opaca de `createFinderPhotoUploadIntent`. */
  pelaReferenciaDoAchador(resumo: Uint8Array, uploadRef: string): Promise<FotoParaAMensagem>;
}
