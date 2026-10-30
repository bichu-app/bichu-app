/**
 * Monta o aviso que a vítima do reuso de refresh recebe por e-mail, e emite a
 * credencial do "Não fui eu" que vai dentro dele.
 */
import type { AvisoAoTitular } from './dependencies.js';
import type { IdentityRepository } from '../ports/identity-repository.js';
import type { Mailer, Mensagem } from '../ports/mailer.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { hashDeToken } from '../../../shared/crypto/digest.js';
import type { AbsoluteUrl, Instant, TokenHash, UserId } from '../../../shared/types/brands.js';

/** O que esta função precisa de um registrador de log. */
export type { RegistrarOcorrencia } from './dependencies.js';
import type { RegistrarOcorrencia } from './dependencies.js';

/** Sete dias, e o número é maior que o dos outros dois links de propósito. */
const VALIDADE_DO_DISAVOW_EM_MS = 7 * 24 * 60 * 60 * 1000;

export interface DependenciasDoAvisoDeReuso {
  readonly repositorio: Pick<IdentityRepository, 'buscarContaPorId' | 'criarTokenDeVerificacao'>;
  readonly mailer: Mailer;
  readonly registrarOcorrencia: RegistrarOcorrencia;
  readonly ids: IdGenerator;
  /** Base das páginas públicas. */
  readonly baseDaWeb: AbsoluteUrl;
}

/** O texto do aviso. */
export function montarAvisoDeReuso(paraOEnderecoDaConta: string, linkDoNaoFuiEu: string): Mensagem {
  return {
    para: paraOEnderecoDaConta,
    assunto: 'Encerramos as sessões da sua conta no Bichu',
    corpo:
      'Detectamos um sinal de que alguém pode ter copiado o acesso da sua conta, ' +
      'e encerramos por precaução a sessão que apresentou esse acesso.\n\n' +
      'Entre de novo no aplicativo. Se você não reconhece nenhuma atividade estranha, ' +
      'não precisa fazer mais nada.\n\n' +
      'Se não foi você, abra este link. Ele encerra TODAS as sessões da sua conta, ' +
      'em todos os aparelhos, e não pede senha nem login:\n\n' +
      `${linkDoNaoFuiEu}\n\n` +
      'O link vale por 7 dias e só pode ser usado uma vez. Depois de usá-lo, peça uma ' +
      'senha nova em "Esqueci minha senha".',
  };
}

/**
 * A implementação de `avisarTitular` que a raiz de composição entrega ao serviço
 * de identidade.
 */
export function criarAvisoDeReusoAoTitular(
  deps: DependenciasDoAvisoDeReuso,
): (aviso: AvisoAoTitular) => Promise<void> {
  return async (aviso) => {
    deps.registrarOcorrencia(
      { tipo: aviso.tipo, correlationId: aviso.correlationId },
      'reuso de refresh detectado',
    );

    const conta = await deps.repositorio.buscarContaPorId(aviso.userId as UserId);
    if (conta === undefined) return;

    const tokenBruto = deps.ids.opaqueToken();
    await deps.repositorio.criarTokenDeVerificacao({
      id: deps.ids.uuidv7(),
      userId: conta.id,
      proposito: 'session_disavow',
      tokenHash: hashDeToken(tokenBruto) as TokenHash,
      enviadoPara: conta.email,
      expiraEm: (aviso.ocorridoEm + VALIDADE_DO_DISAVOW_EM_MS) as Instant,
      ipHmac: aviso.ipHmac,
    });

    const base = deps.baseDaWeb.replace(/\/$/, '');
    await deps.mailer.enviar(
      montarAvisoDeReuso(conta.email, `${base}/nao-fui-eu?token=${tokenBruto}`),
    );
  };
}
