import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { FamiliaDeSessao } from '../ports/localizacao-de-referencia-repository.js';
import type { Mailer } from '../ports/mailer.js';
import type { AbsoluteUrl } from '../../../shared/types/brands.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';
import type { JanelasDeSessao } from '../domain/session.js';
import type { Clock } from '../../../shared/time/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import type { IdentityRepository } from '../ports/identity-repository.js';
import type { TokenSigner } from '../ports/token-signer.js';

/** O que os casos de uso precisam de um registrador de log. */
export type RegistrarOcorrencia = (dados: Record<string, unknown>, mensagem: string) => void;

export interface ContextoDaRequisicao {
  readonly correlationId: string;
  readonly ip: string | undefined;
  readonly userAgent: string | undefined;
}

export interface DependenciasDeIdentidade {
  readonly repositorio: IdentityRepository;
  readonly assinador: TokenSigner;
  readonly trilha: AuditLog;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly janelas: JanelasDeSessao;
  /** Transforma o IP em HMAC. */
  readonly hmacDeIp: (ip: string | undefined) => Buffer | null;
  /**
   * Avisa o titular. A detecção de reuso sem comunicação produz um log que ninguém
   * lê, e a vítima interpreta a revogação como "o app me deslogou"
   * (docs/04-seguranca.md 7.9).
   */
  readonly avisarTitular: (aviso: AvisoAoTitular) => Promise<void>;
  readonly mailer: Mailer;
  /** Apaga TODOS os aparelhos da conta do cadastro de push, e devolve quantos saíram. */
  readonly removerPushDaConta: (dono: UserId) => Promise<number>;
  /** Registra o que aconteceu fora do processo. */
  readonly apagarLocalizacaoDaSessao: (
    dono: UserId,
    familia: FamiliaDeSessao,
  ) => Promise<number>;
  readonly registrarOcorrencia: RegistrarOcorrencia;
  /** Base das páginas públicas do time web. */
  readonly baseDaWeb: AbsoluteUrl;
  /** Monta a URL pública de uma chave de mídia. */
  readonly urlDeMidia: (chave: string) => string;
}

export interface AvisoAoTitular {
  readonly tipo: 'refresh_reuse_detected';
  readonly userId: string;
  readonly ocorridoEm: Instant;
  readonly correlationId: string;
  /**
   * O HMAC do endereço de quem APRESENTOU o refresh reusado — quer dizer, de quem
   * provavelmente copiou a credencial, e não da vítima.
   */
  readonly ipHmac: Buffer | null;
}
