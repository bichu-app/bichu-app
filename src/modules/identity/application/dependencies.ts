/**
 * O que os casos de uso de identidade exigem do mundo.
 *
 * Composição manual, sem contêiner de injeção: o grafo deste módulo cabe num
 * objeto, e um contêiner esconderia justamente a fiação que precisa ser óbvia na
 * revisão de segurança.
 */
import type { Instant } from '../../../shared/types/brands.js';
import type { Mailer } from '../ports/mailer.js';
import type { AbsoluteUrl } from '../../../shared/types/brands.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';
import type { JanelasDeSessao } from '../domain/session.js';
import type { Clock } from '../../../shared/time/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import type { IdentityRepository } from '../ports/identity-repository.js';
import type { TokenSigner } from '../ports/token-signer.js';

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
  /** Transforma o IP em HMAC. O domínio nunca vê endereço em claro persistido. */
  readonly hmacDeIp: (ip: string | undefined) => Buffer | null;
  /**
   * Avisa o titular. A detecção de reuso sem comunicação produz um log que
   * ninguém lê, e a vítima interpreta a revogação como "o app me deslogou"
   * (docs/04-seguranca.md 7.9).
   */
  readonly avisarTitular: (aviso: AvisoAoTitular) => Promise<void>;
  readonly mailer: Mailer;
  /**
   * Base das páginas públicas do time web. É daqui que saem os links de
   * verificação e de redefinição — montados na HORA DO ENVIO, nunca guardados
   * (§11.1 proibição 9): um link gravado carrega o domínio do dia em que foi
   * escrito, e o e-mail é lido horas depois.
   */
  readonly baseDaWeb: AbsoluteUrl;
}

export interface AvisoAoTitular {
  readonly tipo: 'refresh_reuse_detected';
  readonly userId: string;
  readonly ocorridoEm: Instant;
  readonly correlationId: string;
}
