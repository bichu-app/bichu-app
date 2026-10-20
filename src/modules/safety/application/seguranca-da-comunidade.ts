/**
 * Bloquear e denunciar, como caso de uso.
 *
 * ## O QUE ESTA CLASSE NÃO TEM, E A AUSÊNCIA É O MECANISMO
 *
 * **Nenhuma porta de aviso.** `DependenciasDaSeguranca` não tem campo de
 * notificação, de push, de e-mail nem de caixa de avisos — então **avisar o
 * denunciado não é exprimível aqui**. Não é uma coisa que alguém esqueceu de
 * não fazer: é uma coisa que exige acrescentar uma dependência nova, e quem a
 * acrescentar vai ter de apagar `domain/o-denunciado-nao-e-avisado.ts`.
 *
 * Avisar o denunciado é retaliação. Ver aquele arquivo.
 *
 * **Nenhum prazo.** Não há campo de prazo, de SLA nem de previsão em lugar
 * nenhum desta fatia, e não existe leitura de denúncia por onde ele chegaria.
 * O que faz a denúncia valer sem prazo é a ocultação imediata, que é filtro de
 * leitura e acontece no banco.
 *
 * ## A trilha grava o ATO, e não a vítima
 *
 * `resourceId` é o endereço público do alvo — opaco, 128 bits, não derivado de
 * ninguém — e nunca o UUID interno. O IP vai **em claro** para a porta da
 * trilha, que é quem o transforma em HMAC (SEC-010, ADR-0022): transformá-lo
 * aqui criaria a segunda definição de "endereço pseudonimizado", e é a que
 * diverge.
 *
 * `metadata` leva o motivo escolhido e **não leva o relato**: o relato é texto
 * que a pessoa escreveu sobre outra, e `docs/04-seguranca.md` §9 proíbe
 * conteúdo de mensagem na trilha pelo mesmo juízo. Quem precisa do relato é
 * quem modera, e ele está na fila.
 */
import type { Clock } from '../../../shared/ports/index.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';
import type { UserId } from '../../../shared/types/brands.js';
import {
  validarDenuncia,
  type AlvoDaDenuncia,
} from '../domain/motivos-da-denuncia.js';
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import type {
  DesfechoDaEscrita,
  PaginaDeBloqueios,
  SafetyRepository,
} from '../ports/safety-repository.js';

export interface DependenciasDaSeguranca {
  readonly repositorio: SafetyRepository;
  readonly trilha: AuditLog;
  readonly clock: Clock;
}

/** Quem escreve, e de onde. O IP vai em claro; a porta da trilha o digere. */
export interface AutorDoAto {
  readonly userId: UserId;
  readonly correlationId: string;
  readonly ip: string | undefined;
}

export type DesfechoDaDenuncia =
  | { readonly tipo: 'enfileirada' }
  | { readonly tipo: 'ausente' }
  | { readonly tipo: 'eu_mesmo' }
  | { readonly tipo: 'invalida'; readonly erros: readonly ProblemFieldError[] };

export class SegurancaDaComunidade {
  constructor(private readonly deps: DependenciasDaSeguranca) {}

  /**
   * **QUEM EU BLOQUEEI** (19/10/2026). Leitura, e por isso ela é a única
   * operação desta classe que **não grava na trilha**.
   *
   * A trilha do app registra ATOS (`user_block.created`, `user_block.removed`,
   * `content_report.created`), e ler a própria lista não é ato: gravar uma linha
   * por abertura de tela encheria a trilha de navegação e esconderia os três
   * eventos que importam. É a mesma razão por que bloqueio que não encontrou
   * alvo também não é gravado.
   *
   * **Nenhuma regra de autorização mora aqui.** Ela é a igualdade
   * `blocker_user_id = chamador` no `WHERE` da consulta (ADR-0021): este método
   * não tem `if` nenhum, e não existe caminho por ele que leia a lista de outra
   * pessoa — o `userId` que ele passa adiante é o de quem chama, e é o único que
   * ele tem.
   */
  quemEuBloqueei(
    autor: AutorDoAto,
    pagina: { readonly page: number; readonly limit: number },
  ): Promise<PaginaDeBloqueios> {
    return this.deps.repositorio.quemEuBloqueei(autor.userId, pagina);
  }

  async bloquear(autor: AutorDoAto, alvo: string): Promise<DesfechoDaEscrita> {
    const desfecho = await this.deps.repositorio.bloquear(
      autor.userId,
      alvo,
      this.deps.clock.now(),
    );
    // A trilha só grava o que aconteceu. Bloqueio que não encontrou alvo não é
    // evento: gravá-lo encheria a trilha de tentativas de endereço e
    // transformaria a trilha num log de varredura.
    if (desfecho === 'feito') {
      await this.deps.trilha.record({
        actorKind: 'user',
        actorUserId: autor.userId,
        actorIp: autor.ip,
        correlationId: autor.correlationId,
        action: 'user_block.created',
        resourceKind: 'user_block',
        resourceId: alvo,
      });
    }
    return desfecho;
  }

  async desbloquear(autor: AutorDoAto, alvo: string): Promise<DesfechoDaEscrita> {
    const desfecho = await this.deps.repositorio.desbloquear(autor.userId, alvo);
    if (desfecho === 'feito') {
      await this.deps.trilha.record({
        actorKind: 'user',
        actorUserId: autor.userId,
        actorIp: autor.ip,
        correlationId: autor.correlationId,
        action: 'user_block.removed',
        resourceKind: 'user_block',
        resourceId: alvo,
      });
    }
    return desfecho;
  }

  /**
   * Denuncia, nos três alvos, por um caminho só.
   *
   * Um caminho e não três: as três denúncias têm a MESMA mecânica — lista
   * fechada, `202`, repetição que soma, denunciado não avisado, ocultação
   * imediata, nenhum prazo — e o que muda é a lista de motivos e a tabela. Três
   * métodos quase iguais seriam três lugares onde uma correção pode faltar, que
   * é o defeito que esta casa já pagou.
   */
  async denunciar(
    autor: AutorDoAto,
    alvo: AlvoDaDenuncia,
    enderecoDoAlvo: string,
    corpo: unknown,
  ): Promise<DesfechoDaDenuncia> {
    const { denuncia, erros } = validarDenuncia(alvo, corpo);
    if (denuncia === undefined) return { tipo: 'invalida', erros };

    const agora = this.deps.clock.now();
    const escrever = {
      profile: () =>
        this.deps.repositorio.denunciarPerfil(autor.userId, enderecoDoAlvo, denuncia, agora),
      photo: () =>
        this.deps.repositorio.denunciarFoto(autor.userId, enderecoDoAlvo, denuncia, agora),
      publication: () =>
        this.deps.repositorio.denunciarPublicacao(autor.userId, enderecoDoAlvo, denuncia, agora),
    }[alvo];

    const desfecho = await escrever();
    if (desfecho === 'ausente') return { tipo: 'ausente' };
    if (desfecho === 'eu_mesmo') return { tipo: 'eu_mesmo' };

    await this.deps.trilha.record({
      actorKind: 'user',
      actorUserId: autor.userId,
      actorIp: autor.ip,
      correlationId: autor.correlationId,
      action: 'content_report.created',
      resourceKind: `${alvo}_report`,
      resourceId: enderecoDoAlvo,
      // O MOTIVO entra; o RELATO não. Relato é texto que uma pessoa escreveu
      // sobre outra, e a trilha não guarda conteúdo (docs/04-seguranca.md §9).
      metadata: { target: alvo, reason: denuncia.motivo },
    });

    return { tipo: 'enfileirada' };
  }
}
