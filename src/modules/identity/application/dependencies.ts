/**
 * O que os casos de uso de identidade exigem do mundo.
 *
 * Composição manual, sem contêiner de injeção: o grafo deste módulo cabe num
 * objeto, e um contêiner esconderia justamente a fiação que precisa ser óbvia na
 * revisão de segurança.
 */
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

/**
 * O que os casos de uso precisam de um registrador de log.
 *
 * Tipo estrutural de uma linha, e não o logger do Fastify: `application/` não
 * conhece framework (regra `domainPurity` do ESLint), e um teste não deve
 * precisar subir servidor HTTP para conferir que um envio foi registrado.
 */
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
   * Apaga TODOS os aparelhos da conta do cadastro de push, e devolve quantos
   * saíram. Chamada por `derrubarTodasAsSessoes`, no terceiro passo.
   *
   * **Função estreita e não a porta inteira, e isso é a fronteira do ADR-0008
   * em forma de assinatura.** O cadastro de aparelho vive em `notifications`, e
   * `identity` não importa nada de lá. O que atravessa é este tipo, declarado
   * aqui, e a ligação acontece na composição (`src/bin/api.ts`) delegando a
   * `RegistroDeAparelhosService`. É o mesmo arranjo que `worker.ts` já usa para
   * `revogarPorTokenRecusado`.
   *
   * **Obrigatória, e não opcional.** Um campo opcional deixaria a composição
   * que esquecer dele revogar sessão sem remover push, em silêncio, que é
   * literalmente o defeito SEC-019 voltando pela porta da fiação.
   *
   * A falha PROPAGA: quem chamar responde erro. É o certo, porque os dois
   * passos anteriores já estão duráveis, repetir é idempotente, e o estado
   * residual ("sessão morta, push vivo") é o de hoje, agora visível em vez de
   * silencioso. O que não pode acontecer é ela falhar dentro de um `catch` mudo
   * e a resposta continuar sendo sucesso.
   */
  readonly removerPushDaConta: (dono: UserId) => Promise<number>;
  /**
   * Registra o que aconteceu fora do processo.
   *
   * Existe por BICHUS-147: o que identificou o defeito em homologação não foi a
   * ausência do e-mail na caixa de alguém, foi a **ausência do evento**
   * `email.send` no log do servidor diante de um 201. O evento nasce aqui, na
   * aplicação, e não no transporte: o transporte de log registrava, o de SMTP
   * não, e a prova de que o caminho foi percorrido não pode depender de qual
   * deles está ligado.
   */
  /**
   * SEC-021: apaga a localização de referência **desta sessão de aparelho**, e
   * devolve quantas linhas saíram (0 ou 1).
   *
   * Entra aqui e não no serviço de localização porque quem sabe que uma sessão
   * de aparelho terminou é o logout, e ele mora neste módulo. A direção
   * contrária — o serviço de localização observando a revogação — exigiria que
   * ele soubesse o que é uma família de refresh, que é conhecimento de
   * identidade e não de geografia.
   *
   * Ela **pode falhar**, e a falha deve propagar: o estado residual é "sessão
   * morta, localização viva", que é o defeito que ela existe para consertar. Um
   * `catch` mudo com resposta de sucesso seria a falha silenciosa que este
   * repositório já registrou cinco vezes.
   */
  readonly apagarLocalizacaoDaSessao: (
    dono: UserId,
    familia: FamiliaDeSessao,
  ) => Promise<number>;
  readonly registrarOcorrencia: RegistrarOcorrencia;
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
  /**
   * O HMAC do endereço de quem APRESENTOU o refresh reusado — quer dizer, de
   * quem provavelmente copiou a credencial, e não da vítima. É o único rastro
   * forense que existe daquele instante, e ele vai para
   * `verification_tokens.created_ip_hmac` junto com o token do "Não fui eu".
   * Sempre resumido (SEC-010); endereço em claro não atravessa esta porta.
   */
  readonly ipHmac: Buffer | null;
}
