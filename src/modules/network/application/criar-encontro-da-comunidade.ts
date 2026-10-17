/**
 * O caso de uso da proposta de encontro pela comunidade (ADR-0025 emenda 3,
 * `createNetworkEvent`).
 *
 * ## A ordem das recusas nao e arbitraria
 *
 * 1. **O teto da conta primeiro.** E o unico que a pessoa nao resolve mexendo
 *    neste formulario: mandar alguem confirmar o e-mail para depois descobrir
 *    que a fila de revisao dela esta cheia e uma ida a caixa de entrada a toa.
 *    E a mesma ordem de `LostCaseService.abrir`, pela mesma razao.
 * 2. **O canal verificado depois**, que e a regua de quem pode criar.
 * 3. **A conferencia do corpo por ultimo**, com todos os erros de campo de uma
 *    vez: a tela marca os campos juntos em vez de um por rodada.
 *
 * ## Nada aqui decide visibilidade, preco nem estado
 *
 * A proposta e sempre publica, gratuita e `pending_review`. Isso nao e
 * parametro: esta escrito no contrato, no repositorio e no `CHECK` do banco, e
 * um campo aqui para escolher seria tres lugares para divergir.
 *
 * ## A trilha
 *
 * `network_event.submitted`, por `AuditLog.record`, que abre a propria
 * transacao e nao derruba a requisicao quando falha -- o caminho do app, e nao
 * o do backoffice (D49 e para a escrita administrativa). **A autoria em coluna
 * NAO depende disso**: ela e carimbada dentro da transacao do `INSERT`, pela
 * funcao da migracao `20261001000004`.
 */
import { problemas } from '../../../shared/http/errors.js';
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import type { Clock, IdGenerator } from '../../../shared/ports/index.js';
import { comoData } from '../../../shared/time/clock.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';
import {
  atingiuTetoDeRevisao,
  bloqueiosParaCriarEncontro,
  errosDoNomeDoLugar,
  type CorpoDoEncontroDaComunidade,
  type EnvioProjetado,
} from '../domain/encontro-da-comunidade.js';
import {
  errosDasObservacoes,
  errosDeTexto,
  errosDoHorario,
  FUSO_PADRAO,
  PORTES,
} from '../domain/escrita-do-encontro.js';
import { TETO_DA_DESCRICAO } from './rede-administrativa.js';
import type { NetworkRepository } from '../ports/network-repository.js';

/** Quem propos, e o contexto da requisicao que a trilha guarda. */
export interface AutorDaProposta {
  readonly userId: UserId;
  readonly correlationId: string;
  /** Em claro. A porta da trilha o transforma em HMAC (SEC-010); este arquivo nao. */
  readonly ip: string | undefined;
}

export interface DependenciasDaCriacaoPelaComunidade {
  readonly rede: NetworkRepository;
  readonly trilha: AuditLog;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/** Os portes aceitos, validados contra a lista fechada do contrato. */
function errosDosPortes(portes: readonly string[] | undefined): ProblemFieldError[] {
  if (portes === undefined) return [];
  const validos = portes.every((p) => (PORTES as readonly string[]).includes(p));
  if (portes.length === 0 || !validos || new Set(portes).size !== portes.length) {
    return [{ field: 'accepted_sizes', code: 'sizes_invalid', message: 'De um a quatro portes, sem repetir.' }];
  }
  return [];
}

/** A data vinda como ISO. A conversao e aqui, e nao no dominio. */
function comoDataDoCorpo(texto: string, campo: string, ): Date {
  const instante = Date.parse(texto);
  if (Number.isNaN(instante)) {
    throw problemas.validacao([{ field: campo, code: 'invalid_date', message: 'Data e hora inválidas.' }]);
  }
  return comoData(instante as Instant);
}

export class CriacaoDeEncontroPelaComunidade {
  constructor(private readonly deps: DependenciasDaCriacaoPelaComunidade) {}

  async propor(autor: AutorDaProposta, corpo: CorpoDoEncontroDaComunidade): Promise<EnvioProjetado> {
    const estado = await this.deps.rede.estadoParaCriarEncontro(autor.userId);
    if (atingiuTetoDeRevisao(estado)) throw problemas.tetoDeEncontrosEmRevisao();
    if (bloqueiosParaCriarEncontro(estado).length > 0) {
      throw problemas.canalDeContatoNaoVerificadoParaEncontro();
    }

    const agora = this.deps.clock.now();
    const startsAt = comoDataDoCorpo(corpo.starts_at, 'starts_at');
    const endsAt = corpo.ends_at === undefined ? null : comoDataDoCorpo(corpo.ends_at, 'ends_at');
    const timeZone = corpo.time_zone ?? FUSO_PADRAO;
    const erros: ProblemFieldError[] = [
      ...errosDeTexto('title', corpo.title, 2, 120),
      ...errosDeTexto('summary', corpo.summary, 2, TETO_DA_DESCRICAO),
      // O `place_name` passa pela conferencia de endereco embutido; os outros
      // dois rotulos sao so tamanho, como no painel.
      ...errosDoNomeDoLugar('place.place_name', corpo.place.place_name),
      ...errosDeTexto('place.neighborhood', corpo.place.neighborhood, 2, 60),
      ...errosDeTexto('place.city', corpo.place.city, 2, 60),
      ...errosDoHorario(startsAt, endsAt, timeZone, agora),
      ...errosDosPortes(corpo.accepted_sizes),
      ...(corpo.notes === undefined ? [] : errosDasObservacoes('notes', corpo.notes)),
    ];
    if (erros.length > 0) throw problemas.validacao(erros);

    const id = this.deps.ids.uuidv7();
    const proposto = await this.deps.rede.criarEncontroDaComunidade({
      id,
      autor: autor.userId,
      title: corpo.title.trim(),
      summary: corpo.summary.trim(),
      lugar: {
        placeName: corpo.place.place_name.trim(),
        neighborhood: corpo.place.neighborhood.trim(),
        city: corpo.place.city.trim(),
        state: corpo.place.state,
        ponto: null,
      },
      startsAt,
      endsAt,
      timeZone,
      entrada: { tipo: 'free' },
      idadeDosCaes: corpo.dog_age ?? 'any',
      vacinacaoExigida: corpo.vaccination_required ?? true,
      areaCercada: corpo.fenced_off_leash_area ?? false,
      observacoes: corpo.notes === undefined ? null : corpo.notes.trim(),
      portes: corpo.accepted_sizes ?? PORTES,
      estrutura: corpo.amenities ?? [],
      paraLevar: corpo.bring_items ?? [],
      agora,
    });

    // Depois do `COMMIT`: a trilha do app abre transacao propria, e um
    // incidente nela nao e motivo para a pessoa nao conseguir propor. O
    // `resourceId` e o `id` interno, que nunca sai em resposta.
    await this.deps.trilha.record({
      actorKind: 'user',
      actorUserId: autor.userId,
      actorIp: autor.ip,
      correlationId: autor.correlationId,
      action: 'network_event.submitted',
      resourceKind: 'network_event',
      resourceId: id,
      after: {
        slug: proposto.slug,
        title: corpo.title.trim(),
        city: corpo.place.city.trim(),
        neighborhood: corpo.place.neighborhood.trim(),
        starts_at: startsAt.toISOString(),
        time_zone: timeZone,
        publication_status: 'pending_review',
        origin: 'community',
      },
    });

    return {
      slug: proposto.slug,
      title: corpo.title.trim(),
      starts_at: startsAt.toISOString(),
      time_zone: timeZone,
      review_state: 'pending_review',
      submitted_at: comoData(proposto.submittedAt).toISOString(),
    };
  }
}
