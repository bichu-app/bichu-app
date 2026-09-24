/**
 * O acesso de quem achou o pet e não tem conta (BICHUS-41), como regra.
 *
 * Sem servidor, sem banco e sem rede. Três decisões moram aqui, e as três são
 * de produto antes de serem de código.
 *
 * ## Por quanto tempo o token vale
 *
 * O contrato (`securitySchemes.finderToken`) diz: "valido enquanto o caso
 * estiver aberto mais 30 dias". A coluna `found_reports.finder_token_expires_at`
 * guarda só a segunda metade dessa frase: 30 dias a partir do aviso, fixos.
 * Ler a coluna sozinha faria o token de um caso que continua aberto no 31º dia
 * parar de funcionar justamente enquanto o animal ainda está na rua, que é
 * quando a conversa mais importa. A regra inteira é a união das três:
 *
 * - dentro dos 30 dias do aviso;
 * - OU com o caso ligado ainda aberto;
 * - OU até 30 dias depois de o caso ter sido encerrado, para quem ajudou ler o
 *   desfecho.
 *
 * ## O cursor do achador não carrega id
 *
 * O cursor do lado com conta (`paginacao.ts`) codifica o `id` da última
 * mensagem, e o cabeçalho daquele arquivo avisa que ele não serve aqui:
 * `FinderMessage` nasceu sem `id` (SEC-001), e um cursor decodificável com o
 * UUIDv7 dentro publicaria o identificador pela porta do lado. O cursor do
 * achador é a POSIÇÃO na conversa. A conversa só cresce no fim (mensagem não se
 * edita nem se apaga, só cai inteira junto com a conversa), então a posição é
 * estável entre duas páginas.
 *
 * ## O token tem forma
 *
 * 32 bytes em base64url, 43 caracteres (`IdGenerator.opaqueToken`). O que não
 * tem essa forma é recusado antes de virar consulta, e com a MESMA resposta do
 * token que não existe: distinguir diria a quem está tentando que chegou perto.
 */
import type { Instant } from '../../../shared/types/brands.js';

const DIA_EM_MS = 24 * 60 * 60 * 1000;

/** "mais 30 dias" do contrato, depois do encerramento do caso. */
export const DIAS_DE_LEITURA_DEPOIS_DO_ENCERRAMENTO = 30;

const FORMATO_DO_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** O token tem a forma de um `opaqueToken`. Não diz se ele existe. */
export function tokenBemFormado(token: string): boolean {
  return FORMATO_DO_TOKEN.test(token);
}

/** Os três desfechos de `lost_cases.closure_outcome`. */
export type DesfechoDoCaso = 'reunited' | 'not_found' | 'false_alarm';

export interface CasoDaConversa {
  readonly aberto: boolean;
  readonly encerradoEm: Date | null;
  readonly desfecho: DesfechoDoCaso | null;
}

export interface ValidadeDoToken {
  /** `found_reports.finder_token_expires_at`: 30 dias a partir do aviso. */
  readonly expiraEm: Date;
  /** O caso ligado à conversa. Nulo quando a plaquinha foi lida sem caso aberto. */
  readonly caso: CasoDaConversa | null;
}

/** A regra da validade, inteira. Ver o cabeçalho. */
export function tokenDoAchadorVale(validade: ValidadeDoToken, agora: Instant): boolean {
  if (agora < validade.expiraEm.getTime()) return true;
  const caso = validade.caso;
  if (caso === null) return false;
  if (caso.aberto) return true;
  if (caso.encerradoEm === null) return false;
  return agora < caso.encerradoEm.getTime() + DIAS_DE_LEITURA_DEPOIS_DO_ENCERRAMENTO * DIA_EM_MS;
}

/**
 * O desfecho para quem ajudou, quando o token já não abre a conversa.
 *
 * Só o reencontro é contado com o nome do pet. "Não encontrado" e "alarme
 * falso" são estado do caso de outra pessoa, e quem achou não precisa saber
 * qual dos dois foi para entender que a conversa acabou.
 */
export function desfechoParaQuemAchou(desfecho: DesfechoDoCaso | null, nomeDoPet: string | null): string {
  if (desfecho === 'reunited') {
    const nome = (nomeDoPet ?? '').trim();
    return nome === ''
      ? 'O tutor marcou que o pet voltou para casa. Obrigado por ajudar.'
      : `O tutor marcou que ${nome} voltou para casa. Obrigado por ajudar.`;
  }
  return 'Este caso foi encerrado e a conversa não está mais aberta.';
}

const PREFIXO_DO_CURSOR = 'p:';

/** A posição da próxima página, opaca para o cliente e sem id dentro. */
export function codificarCursorDoAchador(posicao: number): string {
  return Buffer.from(`${PREFIXO_DO_CURSOR}${String(posicao)}`, 'utf8').toString('base64url');
}

/** `undefined` para cursor ausente ou que não saiu daqui: a leitura começa do início. */
export function decodificarCursorDoAchador(cursor: string | undefined): number | undefined {
  if (cursor === undefined || cursor === '') return undefined;
  const cru = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!cru.startsWith(PREFIXO_DO_CURSOR)) return undefined;
  const numero = cru.slice(PREFIXO_DO_CURSOR.length);
  if (!/^\d{1,9}$/.test(numero)) return undefined;
  return Number(numero);
}
