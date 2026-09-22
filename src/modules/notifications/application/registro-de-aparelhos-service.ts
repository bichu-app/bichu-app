/**
 * O serviço do registro de aparelho: registrar, listar e revogar.
 *
 * Fino, como o da localização, e pela mesma razão: a regra vive em dois lugares
 * melhores — o predicado de elegibilidade no domínio, a autorização na cláusula
 * `WHERE` do repositório. O que sobra aqui é o que só existe quando os dois se
 * juntam.
 *
 * ## Quem revoga, quando, e por qual caminho
 *
 * Revogação é metade do título da história, e ela tem **quatro** disparadores.
 * Três passam por este arquivo; o quarto é do banco e não precisa de código:
 *
 * | quem dispara | por onde | motivo na trilha |
 * |---|---|---|
 * | o tutor, pelo Perfil (critério 5) | `DELETE /v1/me/devices/{deviceId}` | `user_removed` |
 * | o app, ao sair da conta (critério 3) | a mesma rota, antes do `logout` | `user_removed` |
 * | o FCM, ao recusar o token (critério 4) | `revogarPorTokenRecusado` | `token_rejected` |
 * | outra conta registrando o mesmo token | `registrar`, no mesmo comando | `reclaimed_by_other_account` |
 *
 * O quarto é o que faz o critério 3 valer **mesmo quando o app não conseguiu
 * chamar a rota**, e esse caso não é raro: a ADR-0002 §5 registra por escrito
 * que o apagamento local no logout é incondicional e a revogação no servidor
 * "pode não acontecer" (sair sem rede). Sem ele, o token ficaria preso à conta
 * anterior e o aviso do pet dela chegaria em quem está com o aparelho agora.
 *
 * A quinta porta é `ON DELETE CASCADE`: a exclusão de conta leva os aparelhos
 * junto, sem ninguém lembrar de nada.
 *
 * ## O que o envio em curso enxerga
 *
 * Nada aqui avisa um disparo em andamento, e isso é deliberado. Quem manda
 * resolve o token pelo `enderecoDeEnvio` no instante do envio, e a revogação
 * aparece como `null` na chamada seguinte. Avisar seria construir um segundo
 * canal de invalidação para uma garantia que a releitura já dá.
 *
 * ## A trilha é a única memória da revogação
 *
 * A linha é apagada (o argumento inteiro está no cabeçalho da migração), então
 * `device.revoked` com o `reason` no metadado é o que resta. Ela não carrega o
 * token: a porta da auditoria proíbe "token de qualquer espécie" e a trilha
 * sobrevive à exclusão da conta de propósito — gravar o token nela desfaria o
 * direito de apagamento por uma porta lateral, do mesmo jeito que gravar a
 * coordenada desfaria.
 */
import type { Clock } from '../../../shared/ports/index.js';
import type { UserId } from '../../../shared/types/brands.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';
import type { Aparelho, MotivoDaRevogacao, RegistroDeAparelho } from '../domain/aparelho.js';
import type { RegistroDeAparelhos } from '../ports/registro-de-aparelhos.js';
import type { TokenDeAparelho } from '../ports/push-sender.js';

export interface ChamadorDoAparelho {
  readonly userId: UserId;
  readonly correlationId: string;
  readonly ip?: string | undefined;
}

export interface DependenciasDoRegistroDeAparelhos {
  readonly repositorio: RegistroDeAparelhos;
  readonly clock: Clock;
  readonly trilha: AuditLog;
}

export class RegistroDeAparelhosService {
  constructor(private readonly deps: DependenciasDoRegistroDeAparelhos) {}

  /**
   * Registra ou atualiza o aparelho do chamador.
   *
   * A permissão é gravada como veio, inclusive `denied`: o ADR-0008 manda
   * registrar quem negou justamente para a métrica de alcance ser honesta e
   * para a pessoa cair no caminho do e-mail em vez de sumir da base.
   */
  async registrar(
    chamador: ChamadorDoAparelho,
    entrada: RegistroDeAparelho,
  ): Promise<Aparelho> {
    const agora = this.deps.clock.now();
    const { aparelho, reivindicadoDe } = await this.deps.repositorio.registrar(
      chamador.userId,
      entrada,
      agora,
    );

    if (reivindicadoDe !== null) {
      // O ator é quem registrou, e o alvo é a conta que perdeu o aparelho. Sem
      // esta linha, "por que a conta anterior parou de receber?" não tem
      // resposta em lugar nenhum: a linha dela foi apagada no mesmo comando.
      await this.registrarRevogacao(
        { ...aparelho, dono: reivindicadoDe },
        'reclaimed_by_other_account',
        { actorKind: 'user', actorUserId: chamador.userId, ...this.contexto(chamador) },
      );
    }

    await this.deps.trilha.record({
      actorKind: 'user',
      action: 'device.registered',
      actorUserId: chamador.userId,
      resourceKind: 'device',
      resourceId: aparelho.id,
      ...this.contexto(chamador),
      metadata: {
        platform: aparelho.plataforma,
        push_permission: aparelho.permissao,
        // Se o aparelho conta ou não para `reachable_tutors`, dito no momento
        // em que ele foi registrado. É a leitura que o relatório de homologação
        // precisa e que não se reconstrói depois, porque a linha muda.
        has_push_token: aparelho.pushToken !== null,
      },
    });
    return aparelho;
  }

  /** Os aparelhos do chamador, para o Perfil (critério 5). */
  listar(chamador: ChamadorDoAparelho): Promise<readonly Aparelho[]> {
    return this.deps.repositorio.listarDoDono(chamador.userId);
  }

  /**
   * Remove um aparelho do chamador.
   *
   * `false` significa 404 para quem chamou, e ele cobre os dois casos de
   * propósito: não existe, e existe e é de outra conta. A ADR-0021 diz que a
   * segunda não pode ser distinguível da primeira, e aqui ela não é — o dono
   * entra no `WHERE` e a linha alheia nunca chega a ser lida.
   */
  async remover(chamador: ChamadorDoAparelho, aparelhoId: string): Promise<boolean> {
    const revogado = await this.deps.repositorio.revogarDoDono(chamador.userId, aparelhoId);
    if (revogado === null) return false;
    await this.registrarRevogacao(revogado, 'user_removed', {
      actorKind: 'user',
      actorUserId: chamador.userId,
      ...this.contexto(chamador),
    });
    return true;
  }

  /**
   * O FCM recusou este token: o aparelho sai agora (critério 4).
   *
   * **Quem chama é o caminho de envio**, e ele ainda não existe — é a
   * BICHUS-18. Esta função é a metade do critério 4 que é de servidor, e ela
   * está escrita agora porque a alternativa seria a BICHUS-18 inventar a
   * revogação junto com o disparo, sem revisão de segurança própria.
   *
   * `actorKind: 'system'` porque não há pessoa: quem decidiu foi o transporte.
   * Nenhum `actorUserId` — a porta da trilha proíbe o campo fora de `user`.
   */
  async revogarPorTokenRecusado(token: TokenDeAparelho, correlationId?: string): Promise<boolean> {
    const revogado = await this.deps.repositorio.revogarPorToken(token);
    if (revogado === null) return false;
    await this.registrarRevogacao(revogado, 'token_rejected', {
      actorKind: 'system',
      ...(correlationId === undefined ? {} : { correlationId }),
    });
    return true;
  }

  /**
   * Dois dos sete critérios do ADR-0006, sobre candidatos que alguém já
   * filtrou. **Não é a contagem do alcance** — ver a porta.
   */
  contasAlcancaveisPorPush(candidatos: readonly UserId[]): Promise<ReadonlySet<UserId>> {
    return this.deps.repositorio.contasAlcancaveisPorPush(candidatos);
  }

  /** O token, relido no instante do envio. `null` = não mande. Ver a porta. */
  enderecoDeEnvio(aparelhoId: string): Promise<TokenDeAparelho | null> {
    return this.deps.repositorio.enderecoDeEnvio(aparelhoId);
  }

  private contexto(chamador: ChamadorDoAparelho): {
    correlationId: string;
    actorIp?: string | undefined;
  } {
    return { correlationId: chamador.correlationId, actorIp: chamador.ip };
  }

  /**
   * A gravação da revogação, num lugar só.
   *
   * Quatro chamadores e quatro motivos; o formato do evento é um. Repetir o
   * objeto em cada um é como dois deles passam a gravar campos diferentes sem
   * que ninguém note — e o que se lê depois é uma trilha que responde a
   * pergunta em três casos e não no quarto.
   */
  private registrarRevogacao(
    aparelho: Aparelho,
    motivo: MotivoDaRevogacao,
    ator:
      | { actorKind: 'user'; actorUserId: UserId; correlationId: string; actorIp?: string | undefined }
      | { actorKind: 'system'; correlationId?: string | undefined },
  ): Promise<void> {
    return this.deps.trilha.record({
      ...ator,
      action: 'device.revoked',
      resourceKind: 'device',
      resourceId: aparelho.id,
      metadata: {
        reason: motivo,
        platform: aparelho.plataforma,
        // Quem perdeu o aparelho. Precisa estar aqui porque em
        // `reclaimed_by_other_account` o ator **não** é o dono, e sem este
        // campo o evento não diria de quem foi o aparelho revogado.
        owner_user_id: aparelho.dono,
      },
    });
  }
}
