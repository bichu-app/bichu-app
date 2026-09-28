/**
 * Os casos de uso da escrita administrativa da `Rede` (BICHUS-273 e
 * BICHUS-292; ADR-0027 itens 8, 12, 13 e 17).
 *
 * ## Regras que atravessam o arquivo
 *
 * - **Toda escrita grava a trilha, na mesma transacao, como ultimo passo**
 *   (D49). A falha dela desfaz a escrita.
 * - **A versao que a pessoa leu decide** (`If-Match`): ausente, 428 antes de
 *   qualquer leitura; diferente, 412, e nada e gravado.
 * - **Papel e reautenticacao nao sao daqui.** A guarda do prefixo decidiu o
 *   papel antes de o recurso ser lido, e a janela de reautenticacao de mover,
 *   mudar acesso, cancelar e remover e consumida pelo registro da rota antes
 *   de qualquer gancho dela (ADR-0027 item 7, D40).
 * - **O aviso aos administradores sai depois do `COMMIT`** (D52, D60), e a
 *   falha dele nao desfaz a escrita.
 * - **A coordenada nunca vai para a trilha**: ali vai `point_changed`.
 *
 * ## A fila de pedidos
 *
 * E a unica leitura de pessoa do backoffice (RA-01, D53 a D57). Toda leitura
 * grava `admin.network_join_request.listed` com os filtros e a quantidade,
 * nunca os nomes (D55), e o teto de 300 linhas por hora por conta e lido da
 * propria trilha, na mesma transacao (D56). Aprovar gera o push ao tutor, so
 * com o titulo, enfileirado na transacao da decisao; recusar nao avisa ninguem.
 */
import { AppError, problemas } from '../../../shared/http/errors.js';
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import type { Clock, IdGenerator } from '../../../shared/ports/index.js';
import { comoData as comoDataDoRelogio } from '../../../shared/time/clock.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { AuditAction, AuditEvent } from '../../audit/ports/audit-log.js';
import {
  comoEtag,
  diferenca,
  encontroAbertoParaDecisao,
  entradaDoCorpo,
  errosDasObservacoes,
  errosDeTexto,
  errosDoHorario,
  FUSO_PADRAO,
  JANELA_DO_TETO_DA_FILA_EM_MS,
  lerIfMatch,
  mesmaEntrada,
  PORTES,
  podeDecidir,
  pontoMudou,
  projetarAdmissao,
  projetarEncontroAdministrativo,
  projetarPedido,
  retratoDoEncontro,
  slugDoPrivado,
  slugDoTitulo,
  sufixoCurto,
  TAMANHO_MAXIMO_DA_PAGINA_DA_FILA,
  TETO_DE_IMAGENS,
  TETO_DE_LINHAS_DA_FILA_POR_HORA,
  type DecisaoDoPedido,
  type EncontroAdministrativo,
  type EncontroAdministrativoProjetado,
  type EntradaDoCorpo,
  type Lugar,
  type PedidoProjetado,
  type Ponto,
  type PublicacaoAdministrativa,
  type TempoDoEncontro,
  type UnidadeDoValor,
  type Visibilidade,
} from '../domain/escrita-do-encontro.js';
import {
  SlugDoEncontroOcupado,
  type AvisoAosAdministradores,
  type ImagemNaPosicao,
  type MudancaDeEncontro,
  type RedeAdministrativaRepository,
  type TransacaoDaRede,
} from '../ports/rede-administrativa.js';

/** Quem escreve, para a trilha. Nunca o e-mail. */
export interface Autor {
  readonly userId: UserId;
  /** Os 8 primeiros bytes, em hex, do hash da sessao (ADR-0027 item 8). */
  readonly sessao: string;
  readonly ip?: string | undefined;
  readonly correlationId?: string | undefined;
}

// ---------------------------------------------------------------------------
// Corpos, como o contrato os declara
// ---------------------------------------------------------------------------

export interface LugarDoCorpo {
  readonly place_name: string;
  readonly neighborhood: string;
  readonly city: string;
  readonly state: string;
  readonly point?: Ponto | null;
}

export interface ImagemDoCorpo {
  readonly upload_id: string;
  readonly alt_text: string;
}

export interface CorpoDeEncontro {
  readonly slug?: string;
  readonly title: string;
  readonly summary: string;
  readonly place: LugarDoCorpo;
  readonly starts_at: string;
  readonly ends_at?: string;
  readonly time_zone?: string;
  readonly images?: readonly ImagemDoCorpo[];
  readonly accepted_sizes?: readonly string[];
  readonly dog_age?: string;
  readonly vaccination_required?: boolean;
  readonly fenced_off_leash_area?: boolean;
  readonly amenities?: readonly string[];
  readonly visibility?: Visibilidade;
  readonly admission?: EntradaDoCorpo;
  readonly bring_items?: readonly string[];
  readonly notes?: string;
}

export interface PatchDeEncontro {
  readonly slug?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly images?: readonly ImagemDoCorpo[];
  readonly accepted_sizes?: readonly string[];
  readonly dog_age?: string;
  readonly vaccination_required?: boolean;
  readonly fenced_off_leash_area?: boolean;
  readonly amenities?: readonly string[];
  readonly bring_items?: readonly string[];
  readonly notes?: string | null;
}

export interface CorpoDeMudancaDeLugar {
  readonly place?: LugarDoCorpo;
  readonly starts_at?: string;
  readonly ends_at?: string | null;
  readonly time_zone?: string;
  readonly reason: string;
}

export interface CorpoDeCancelamento {
  readonly note: string;
}

export interface CorpoDeMudancaDeAcesso {
  readonly visibility?: Visibilidade;
  readonly admission?: EntradaDoCorpo;
  readonly reason: string;
}

export interface Escrito<T> {
  readonly recurso: T;
  readonly etag: string;
}

export interface PaginaProjetada<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
}

export interface DependenciasDaRedeAdministrativa {
  readonly repositorio: RedeAdministrativaRepository;
  readonly avisos: AvisoAosAdministradores;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly urlDeMidia: (chave: string) => string;
  /** Log estruturado de ocorrencia: aviso que nao saiu, teto da fila estourado. */
  readonly registrarOcorrencia: (dados: Record<string, unknown>, mensagem: string) => void;
}

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

function slugOcupado(): AppError {
  return new AppError('slug-taken', 'Este endereço já está em uso');
}

function versaoMudou(): AppError {
  return new AppError('precondition-failed', 'Alguém alterou isto antes de você', {
    detail: 'Recarregue para ver a versão atual antes de salvar.',
  });
}

function versaoExigida(ifMatch: string | string[] | undefined): number {
  const lida = lerIfMatch(ifMatch);
  if (lida.tipo === 'ausente') throw new AppError('precondition-required', 'Falta a versão que você leu');
  if (lida.tipo === 'invalida') throw versaoMudou();
  return lida.versao;
}

function recusa(field: string, code: string, message: string): AppError {
  return problemas.validacao([{ field, code, message }]);
}

async function comSlugLivre<T>(escrever: () => Promise<T>): Promise<T> {
  try {
    return await escrever();
  } catch (erro) {
    if (erro instanceof SlugDoEncontroOcupado) throw slugOcupado();
    throw erro;
  }
}

// ---------------------------------------------------------------------------
// Conferencias de corpo
// ---------------------------------------------------------------------------

function errosDoLugar(lugar: LugarDoCorpo, prefixo = 'place'): ProblemFieldError[] {
  return [
    ...errosDeTexto(`${prefixo}.place_name`, lugar.place_name, 2, 80),
    ...errosDeTexto(`${prefixo}.neighborhood`, lugar.neighborhood, 2, 60),
    ...errosDeTexto(`${prefixo}.city`, lugar.city, 2, 60),
  ];
}

function lugarDoCorpo(lugar: LugarDoCorpo): Lugar {
  return {
    placeName: lugar.place_name.trim(),
    neighborhood: lugar.neighborhood.trim(),
    city: lugar.city.trim(),
    state: lugar.state,
    ponto: lugar.point ?? null,
  };
}

function errosDaGaleria(imagens: readonly ImagemDoCorpo[] | undefined): ProblemFieldError[] {
  if (imagens === undefined) return [];
  const erros: ProblemFieldError[] = [];
  if (imagens.length > TETO_DE_IMAGENS) {
    erros.push({ field: 'images', code: 'too_many_images', message: `Até ${String(TETO_DE_IMAGENS)} imagens.` });
  }
  if (new Set(imagens.map((i) => i.upload_id.toLowerCase())).size !== imagens.length) {
    erros.push({ field: 'images', code: 'duplicate_upload', message: 'A mesma imagem apareceu duas vezes.' });
  }
  imagens.forEach((imagem, n) => erros.push(...errosDeTexto(`images[${String(n)}].alt_text`, imagem.alt_text, 2, 150)));
  return erros;
}

function errosDosPortes(portes: readonly string[] | undefined): ProblemFieldError[] {
  if (portes === undefined) return [];
  const validos = portes.every((p) => (PORTES as readonly string[]).includes(p));
  if (portes.length === 0 || !validos || new Set(portes).size !== portes.length) {
    return [{ field: 'accepted_sizes', code: 'sizes_invalid', message: 'De um a quatro portes, sem repetir.' }];
  }
  return [];
}

function comoData(texto: string, campo: string): Date {
  const instante = Date.parse(texto);
  if (Number.isNaN(instante)) throw recusa(campo, 'invalid_date', 'Data e hora inválidas.');
  return comoDataDoRelogio(instante as Instant);
}

// ---------------------------------------------------------------------------
// Avisos (D52, D60)
// ---------------------------------------------------------------------------

function descreverLugar(lugar: Lugar): string {
  return `${lugar.placeName}, ${lugar.neighborhood}, ${lugar.city}/${lugar.state}`;
}

function descreverEntrada(e: EncontroAdministrativo['entrada']): string {
  if (e.tipo === 'free') return 'gratuito';
  const unidade: Record<UnidadeDoValor, string> = { per_dog: 'por cão', per_person: 'por pessoa', per_pair: 'por dupla' };
  return `R$ ${(e.centavos / 100).toFixed(2).replace('.', ',')} ${unidade[e.unidade]}`;
}

// ---------------------------------------------------------------------------
// Casos de uso
// ---------------------------------------------------------------------------

export class RedeAdministrativa {
  constructor(private readonly deps: DependenciasDaRedeAdministrativa) {}

  private agora(): Instant {
    return this.deps.clock.now();
  }

  private evento(
    autor: Autor,
    action: AuditAction,
    resourceKind: string,
    resourceId: string | undefined,
    corpo: { before?: Record<string, unknown>; after?: Record<string, unknown>; extra?: Record<string, unknown> },
  ): AuditEvent {
    return {
      actorKind: 'user',
      actorUserId: autor.userId,
      actorIp: autor.ip,
      correlationId: autor.correlationId,
      action,
      resourceKind,
      resourceId,
      before: corpo.before,
      after: corpo.after,
      metadata: { ...(corpo.extra ?? {}), surface: 'admin', session: autor.sessao },
    };
  }

  private escrito(e: EncontroAdministrativo): Escrito<EncontroAdministrativoProjetado> {
    return { recurso: projetarEncontroAdministrativo(e, this.agora(), this.deps.urlDeMidia), etag: comoEtag(e.version) };
  }

  /** Depois do `COMMIT`. A falha fica no log, com a correlacao, e nao desfaz nada. */
  private async avisarAdministradores(autor: Autor, assunto: string, linhas: readonly string[]): Promise<void> {
    try {
      await this.deps.avisos.avisar({ assunto, linhas });
    } catch (erro) {
      this.deps.registrarOcorrencia(
        { evento: 'admin.network_event.notice_failed', correlationId: autor.correlationId, err: String(erro) },
        'aviso aos administradores nao saiu',
      );
    }
  }

  // ------------------------------------------------------------- leituras

  async listarEncontros(recorte: {
    q?: string | undefined;
    publicacao?: PublicacaoAdministrativa | undefined;
    tempo?: TempoDoEncontro | undefined;
    visibilidade?: Visibilidade | undefined;
    city?: string | undefined;
    sort: 'agenda' | 'atualizado';
    page: number;
    limit: number;
  }): Promise<PaginaProjetada<EncontroAdministrativoProjetado> & { effective_sort: 'agenda' | 'atualizado' }> {
    const agora = this.agora();
    const pagina = await this.deps.repositorio.listarEncontros({ ...recorte, agora });
    return {
      items: pagina.itens.map((e) => projetarEncontroAdministrativo(e, agora, this.deps.urlDeMidia)),
      page: recorte.page,
      limit: recorte.limit,
      total: pagina.total,
      effective_sort: recorte.sort,
    };
  }

  async lerEncontro(slug: string): Promise<Escrito<EncontroAdministrativoProjetado>> {
    const encontro = await this.deps.repositorio.encontroPorSlug(slug);
    if (encontro === null) throw problemas.naoEncontrado();
    return this.escrito(encontro);
  }

  // --------------------------------------------------------------- criar

  /**
   * Criar e publicar (12.9): nasce `published`, `origin = admin`, e avisa todos
   * os administradores (D52). O privado ganha `slug` aleatorio, e mandar um e
   * recusado (12.10).
   */
  async criarEncontro(autor: Autor, corpo: CorpoDeEncontro): Promise<Escrito<EncontroAdministrativoProjetado>> {
    const agora = this.agora();
    const visibilidade = corpo.visibility ?? 'public';
    const startsAt = comoData(corpo.starts_at, 'starts_at');
    const endsAt = corpo.ends_at === undefined ? null : comoData(corpo.ends_at, 'ends_at');
    const timeZone = corpo.time_zone ?? FUSO_PADRAO;
    const entrada = entradaDoCorpo(corpo.admission);
    const erros: ProblemFieldError[] = [
      ...errosDeTexto('title', corpo.title, 2, 120),
      ...errosDeTexto('summary', corpo.summary, 2, 180),
      ...errosDoLugar(corpo.place),
      ...errosDoHorario(startsAt, endsAt, timeZone, agora),
      ...errosDaGaleria(corpo.images),
      ...errosDosPortes(corpo.accepted_sizes),
      ...(corpo.notes === undefined ? [] : errosDasObservacoes('notes', corpo.notes)),
      ...('erros' in entrada ? entrada.erros : []),
    ];
    if (visibilidade === 'private' && corpo.slug !== undefined) {
      erros.push({
        field: 'slug',
        code: 'private_slug_is_generated',
        message: 'O endereço do encontro privado é gerado pelo servidor.',
      });
    }
    if (erros.length > 0 || 'erros' in entrada) throw problemas.validacao(erros);

    const criado = await this.deps.repositorio.emTransacao(async (tx) => {
      const id = this.deps.ids.uuidv7();
      const inserir = (slug: string) =>
        tx.inserirEncontro({
          id,
          slug,
          title: corpo.title.trim(),
          summary: corpo.summary.trim(),
          lugar: lugarDoCorpo(corpo.place),
          startsAt,
          endsAt,
          timeZone,
          visibilidade,
          entrada: entrada.entrada,
          idadeDosCaes: corpo.dog_age ?? 'any',
          vacinacaoExigida: corpo.vaccination_required ?? true,
          areaCercada: corpo.fenced_off_leash_area ?? false,
          observacoes: corpo.notes === undefined ? null : corpo.notes.trim(),
          agora,
        });
      if (visibilidade === 'private') {
        await comSlugLivre(() => inserir(slugDoPrivado(this.deps.ids.random128())));
      } else if (corpo.slug !== undefined) {
        await comSlugLivre(() => inserir(corpo.slug as string));
      } else {
        await this.inserirComSlugDerivado(tx, corpo.title, inserir);
      }

      await tx.substituirPortes(id, corpo.accepted_sizes ?? PORTES);
      if (corpo.amenities !== undefined) await tx.substituirEstrutura(id, corpo.amenities);
      if (corpo.bring_items !== undefined) await tx.substituirParaLevar(id, corpo.bring_items);
      if (corpo.images !== undefined) await this.aplicarGaleria(tx, id, corpo.images, agora);
      const completo = await tx.recarregarEncontro(id);

      await tx.registrarNaTrilha(
        this.evento(autor, 'admin.network_event.created', 'network_event', id, { after: retratoDoEncontro(completo) }),
      );
      return completo;
    });

    await this.avisarAdministradores(autor, `Encontro criado: ${criado.title}`, [
      `Um encontro foi criado e publicado no painel da Rede.`,
      `Título: ${criado.title}`,
      `Visibilidade: ${criado.visibilidade === 'private' ? 'privado' : 'público'}`,
      `Lugar: ${descreverLugar(criado.lugar)}${criado.lugar.ponto === null ? '' : ' (com ponto no mapa)'}`,
      `Início: ${criado.startsAt.toISOString()} (${criado.timeZone})`,
      `Condição de acesso: ${descreverEntrada(criado.entrada)}`,
      'Se você não reconhece esta criação, avise o responsável pelo painel.',
    ]);
    return this.escrito(criado);
  }

  private async inserirComSlugDerivado(
    tx: TransacaoDaRede,
    titulo: string,
    inserir: (slug: string) => Promise<void>,
  ): Promise<void> {
    for (let tentativa = 0; tentativa < 5; tentativa += 1) {
      const semSufixo = tentativa === 0 ? slugDoTitulo(titulo) : undefined;
      const candidato =
        semSufixo !== undefined && !(await tx.existeSlug(semSufixo))
          ? semSufixo
          : (slugDoTitulo(titulo, sufixoCurto(this.deps.ids.random128())) ??
            `encontro-${sufixoCurto(this.deps.ids.random128())}`);
      try {
        await inserir(candidato);
        return;
      } catch (erro) {
        if (!(erro instanceof SlugDoEncontroOcupado)) throw erro;
      }
    }
    throw slugOcupado();
  }

  // --------------------------------------------------------------- editar

  /**
   * Sem data, horario, fuso, lugar, visibilidade nem condicao de acesso (o
   * corpo nem os tem). Mudar as observacoes avisa todos os administradores com
   * o antes e o depois (D60), sem reautenticacao.
   */
  async alterarEncontro(
    autor: Autor,
    slug: string,
    ifMatch: string | string[] | undefined,
    patch: PatchDeEncontro,
  ): Promise<Escrito<EncontroAdministrativoProjetado>> {
    const versao = versaoExigida(ifMatch);
    const agora = this.agora();
    const erros: ProblemFieldError[] = [
      ...(patch.title === undefined ? [] : errosDeTexto('title', patch.title, 2, 120)),
      ...(patch.summary === undefined ? [] : errosDeTexto('summary', patch.summary, 2, 180)),
      ...errosDaGaleria(patch.images),
      ...errosDosPortes(patch.accepted_sizes),
      ...(patch.notes === undefined || patch.notes === null ? [] : errosDasObservacoes('notes', patch.notes)),
    ];
    if (erros.length > 0) throw problemas.validacao(erros);

    const { antes, depois } = await this.deps.repositorio.emTransacao(async (tx) => {
      const atual = await tx.encontroPorSlug(slug);
      if (atual === null) throw problemas.naoEncontrado();
      if (atual.publicacao === 'removed') throw recusa('publication_status', 'event_removed', 'Encontro removido não se edita.');
      if (patch.slug !== undefined && patch.slug !== atual.slug && atual.visibilidade === 'private') {
        throw recusa('slug', 'private_slug_is_generated', 'O endereço do encontro privado é gerado pelo servidor.');
      }
      const mudanca: MudancaDeEncontro = {
        ...(patch.slug === undefined ? {} : { slug: patch.slug }),
        ...(patch.title === undefined ? {} : { title: patch.title.trim() }),
        ...(patch.summary === undefined ? {} : { summary: patch.summary.trim() }),
        ...(patch.dog_age === undefined ? {} : { idadeDosCaes: patch.dog_age }),
        ...(patch.vaccination_required === undefined ? {} : { vacinacaoExigida: patch.vaccination_required }),
        ...(patch.fenced_off_leash_area === undefined ? {} : { areaCercada: patch.fenced_off_leash_area }),
        ...(patch.notes === undefined ? {} : { observacoes: patch.notes === null ? null : patch.notes.trim() }),
      };
      // O UPDATE vem primeiro, mesmo quando so as listas mudam: e ele que
      // confere a versao lida e a incrementa.
      const ok = await comSlugLivre(() => tx.atualizarEncontro(atual.id, versao, mudanca, agora));
      if (!ok) throw versaoMudou();
      if (patch.accepted_sizes !== undefined) await tx.substituirPortes(atual.id, patch.accepted_sizes);
      if (patch.amenities !== undefined) await tx.substituirEstrutura(atual.id, patch.amenities);
      if (patch.bring_items !== undefined) await tx.substituirParaLevar(atual.id, patch.bring_items);
      if (patch.images !== undefined) await this.aplicarGaleria(tx, atual.id, patch.images, agora);
      const completo = await tx.recarregarEncontro(atual.id);
      await tx.registrarNaTrilha(
        this.evento(
          autor,
          'admin.network_event.updated',
          'network_event',
          atual.id,
          diferenca(retratoDoEncontro(atual), retratoDoEncontro(completo)),
        ),
      );
      return { antes: atual, depois: completo };
    });

    if (antes.observacoes !== depois.observacoes) {
      await this.avisarAdministradores(autor, `Observações alteradas: ${depois.title}`, [
        'As observações de um encontro da Rede foram alteradas (D60).',
        `Encontro: ${depois.title}`,
        `Antes: ${antes.observacoes ?? '(sem observações)'}`,
        `Depois: ${depois.observacoes ?? '(sem observações)'}`,
        'Se você não reconhece esta mudança, avise o responsável pelo painel.',
      ]);
    }
    return this.escrito(depois);
  }

  // --------------------------------------------------------------- mover

  /** T11: o encontro que reuniria caes onde e quando um invasor quiser. */
  async moverEncontro(
    autor: Autor,
    slug: string,
    ifMatch: string | string[] | undefined,
    corpo: CorpoDeMudancaDeLugar,
  ): Promise<Escrito<EncontroAdministrativoProjetado>> {
    const versao = versaoExigida(ifMatch);
    const agora = this.agora();
    const erros: ProblemFieldError[] = [
      ...errosDeTexto('reason', corpo.reason, 2, 280),
      ...(corpo.place === undefined ? [] : errosDoLugar(corpo.place)),
    ];
    if (
      corpo.place === undefined &&
      corpo.starts_at === undefined &&
      corpo.ends_at === undefined &&
      corpo.time_zone === undefined
    ) {
      erros.push({ field: 'place', code: 'nothing_to_relocate', message: 'Diga o que muda: lugar, horário ou fuso.' });
    }
    if (erros.length > 0) throw problemas.validacao(erros);

    const { antes, depois } = await this.deps.repositorio.emTransacao(async (tx) => {
      const atual = await tx.encontroPorSlug(slug);
      if (atual === null) throw problemas.naoEncontrado();
      if (atual.publicacao !== 'published') {
        throw recusa('publication_status', 'event_not_published', 'Só encontro publicado muda de lugar ou horário.');
      }
      const startsAt = corpo.starts_at === undefined ? atual.startsAt : comoData(corpo.starts_at, 'starts_at');
      const endsAt =
        corpo.ends_at === undefined ? atual.endsAt : corpo.ends_at === null ? null : comoData(corpo.ends_at, 'ends_at');
      const timeZone = corpo.time_zone ?? atual.timeZone;
      const errosDoTempo = errosDoHorario(startsAt, endsAt, timeZone, agora);
      if (errosDoTempo.length > 0) throw problemas.validacao(errosDoTempo);

      const mudanca: MudancaDeEncontro = {
        ...(corpo.place === undefined ? {} : { lugar: lugarDoCorpo(corpo.place) }),
        startsAt,
        endsAt,
        timeZone,
      };
      const ok = await tx.atualizarEncontro(atual.id, versao, mudanca, agora);
      if (!ok) throw versaoMudou();
      const completo = await tx.recarregarEncontro(atual.id);
      const { before, after } = diferenca(retratoDoEncontro(atual), retratoDoEncontro(completo));
      await tx.registrarNaTrilha(
        this.evento(autor, 'admin.network_event.relocated', 'network_event', atual.id, {
          before,
          after: { ...after, point_changed: pontoMudou(atual.lugar.ponto, completo.lugar.ponto) },
          extra: { reason: corpo.reason.trim() },
        }),
      );
      return { antes: atual, depois: completo };
    });

    await this.avisarAdministradores(autor, `Encontro movido: ${depois.title}`, [
      'Um encontro publicado mudou de lugar ou de horário (T11).',
      `Encontro: ${depois.title}`,
      `Motivo informado: ${corpo.reason.trim()}`,
      `Lugar antes: ${descreverLugar(antes.lugar)}`,
      `Lugar depois: ${descreverLugar(depois.lugar)}`,
      `Ponto no mapa: ${pontoMudou(antes.lugar.ponto, depois.lugar.ponto) ? 'alterado' : 'sem mudança'}`,
      `Início antes: ${antes.startsAt.toISOString()} (${antes.timeZone})`,
      `Início depois: ${depois.startsAt.toISOString()} (${depois.timeZone})`,
      'Se você não reconhece esta mudança, avise o responsável pelo painel agora.',
    ]);
    return this.escrito(depois);
  }

  // ------------------------------------------------------- condicao de acesso

  /**
   * Publico que vira privado ganha `slug` novo, gerado, e o antigo passa a 404
   * sem redirecionamento; privado que vira publico mantem o `slug` e deixa os
   * pedidos como estao.
   */
  async mudarAcesso(
    autor: Autor,
    slug: string,
    ifMatch: string | string[] | undefined,
    corpo: CorpoDeMudancaDeAcesso,
  ): Promise<Escrito<EncontroAdministrativoProjetado>> {
    const versao = versaoExigida(ifMatch);
    const agora = this.agora();
    const entrada = corpo.admission === undefined ? undefined : entradaDoCorpo(corpo.admission);
    const erros: ProblemFieldError[] = [
      ...errosDeTexto('reason', corpo.reason, 2, 280),
      ...(entrada !== undefined && 'erros' in entrada ? entrada.erros : []),
    ];
    if (corpo.visibility === undefined && corpo.admission === undefined) {
      erros.push({ field: 'visibility', code: 'nothing_to_change', message: 'Diga o que muda: visibilidade ou acesso.' });
    }
    if (erros.length > 0) throw problemas.validacao(erros);

    const resultado = await this.deps.repositorio.emTransacao(async (tx) => {
      const atual = await tx.encontroPorSlug(slug);
      if (atual === null) throw problemas.naoEncontrado();
      if (atual.publicacao !== 'published') {
        throw recusa('publication_status', 'event_not_published', 'Só encontro publicado muda a condição de acesso.');
      }
      const novaEntrada = entrada !== undefined && 'entrada' in entrada ? entrada.entrada : atual.entrada;
      const novaVisibilidade = corpo.visibility ?? atual.visibilidade;
      const mudou = novaVisibilidade !== atual.visibilidade || !mesmaEntrada(novaEntrada, atual.entrada);
      if (!mudou) return { antes: atual, depois: atual, mudou };

      const viraPrivado = atual.visibilidade === 'public' && novaVisibilidade === 'private';
      const mudanca: MudancaDeEncontro = {
        visibilidade: novaVisibilidade,
        entrada: novaEntrada,
        ...(viraPrivado ? { slug: slugDoPrivado(this.deps.ids.random128()) } : {}),
      };
      const ok = await comSlugLivre(() => tx.atualizarEncontro(atual.id, versao, mudanca, agora));
      if (!ok) throw versaoMudou();
      const completo = await tx.recarregarEncontro(atual.id);
      await tx.registrarNaTrilha(
        this.evento(autor, 'admin.network_event.access_changed', 'network_event', atual.id, {
          before: { visibility: atual.visibilidade, admission: projetarAdmissao(atual.entrada), slug: atual.slug },
          after: { visibility: completo.visibilidade, admission: projetarAdmissao(completo.entrada), slug: completo.slug },
          extra: { reason: corpo.reason.trim() },
        }),
      );
      return { antes: atual, depois: completo, mudou };
    });

    if (resultado.mudou) {
      const { antes, depois } = resultado;
      await this.avisarAdministradores(autor, `Condição de acesso alterada: ${depois.title}`, [
        'A visibilidade ou a condição de acesso de um encontro publicado mudou.',
        `Encontro: ${depois.title}`,
        `Motivo informado: ${corpo.reason.trim()}`,
        `Visibilidade: ${antes.visibilidade} -> ${depois.visibilidade}`,
        `Acesso: ${descreverEntrada(antes.entrada)} -> ${descreverEntrada(depois.entrada)}`,
        'Se você não reconhece esta mudança, avise o responsável pelo painel agora.',
      ]);
    }
    return this.escrito(resultado.depois);
  }

  // ------------------------------------------------------------ cancelar

  /** So a partir de `published`, sem volta. O cancelado segue visivel ate o fim previsto. */
  async cancelarEncontro(
    autor: Autor,
    slug: string,
    ifMatch: string | string[] | undefined,
    corpo: CorpoDeCancelamento,
  ): Promise<Escrito<EncontroAdministrativoProjetado>> {
    const versao = versaoExigida(ifMatch);
    const agora = this.agora();
    const erros = errosDeTexto('note', corpo.note, 2, 280);
    if (erros.length > 0) throw problemas.validacao(erros);

    const cancelado = await this.deps.repositorio.emTransacao(async (tx) => {
      const atual = await tx.encontroPorSlug(slug);
      if (atual === null) throw problemas.naoEncontrado();
      if (atual.publicacao !== 'published') {
        throw recusa('publication_status', 'event_not_published', 'Só encontro publicado pode ser cancelado.');
      }
      const ok = await tx.atualizarEncontro(
        atual.id,
        versao,
        { publicacao: 'cancelled', cancelledAt: comoDataDoRelogio(agora), cancellationNote: corpo.note.trim() },
        agora,
      );
      if (!ok) throw versaoMudou();
      const completo = await tx.recarregarEncontro(atual.id);
      await tx.registrarNaTrilha(
        this.evento(autor, 'admin.network_event.cancelled', 'network_event', atual.id, {
          before: { publication_status: 'published' },
          after: { publication_status: 'cancelled', cancellation_note: completo.cancellationNote },
        }),
      );
      return completo;
    });

    await this.avisarAdministradores(autor, `Encontro cancelado: ${cancelado.title}`, [
      'Um encontro publicado foi cancelado. Ele continua no app como cancelado até o fim previsto.',
      `Encontro: ${cancelado.title}`,
      `Motivo registrado: ${cancelado.cancellationNote ?? ''}`,
      'Se você não reconhece este cancelamento, avise o responsável pelo painel.',
    ]);
    return this.escrito(cancelado);
  }

  // -------------------------------------------------------------- remover

  /** Terminal. Ja removido responde 204 sem nova linha de trilha. */
  async removerEncontro(autor: Autor, slug: string, ifMatch: string | string[] | undefined): Promise<void> {
    const versao = versaoExigida(ifMatch);
    await this.deps.repositorio.emTransacao(async (tx) => {
      const atual = await tx.encontroPorSlug(slug);
      if (atual === null) throw problemas.naoEncontrado();
      if (atual.publicacao === 'removed') return;
      const ok = await tx.atualizarEncontro(atual.id, versao, { publicacao: 'removed' }, this.agora());
      if (!ok) throw versaoMudou();
      await tx.registrarNaTrilha(
        this.evento(autor, 'admin.network_event.removed', 'network_event', atual.id, {
          before: { publication_status: atual.publicacao },
          after: { publication_status: 'removed' },
        }),
      );
    });
  }

  // -------------------------------------------------------------- galeria

  private async aplicarGaleria(
    tx: TransacaoDaRede,
    eventoId: string,
    imagens: readonly ImagemDoCorpo[],
    agora: Instant,
  ): Promise<void> {
    const galeria: ImagemNaPosicao[] = [];
    for (const [position, imagem] of imagens.entries()) {
      const imageId = await this.imagemDoEnvio(tx, eventoId, imagem.upload_id, agora);
      galeria.push({ imageId, position, altText: imagem.alt_text.trim() });
    }
    await tx.substituirImagens(eventoId, galeria);
  }

  /**
   * A confirmacao do envio e a propria escrita do encontro (ADR-0027 item 10).
   * So aceita `kind = catalog_image` com `purpose = network_event`: foto de pet,
   * imagem de produto, envio vencido ou imagem de OUTRO encontro sao recusados
   * com a mesma resposta (T9).
   */
  private async imagemDoEnvio(tx: TransacaoDaRede, eventoId: string, uploadId: string, agora: Instant): Promise<string> {
    const recusaDaImagem = (): AppError =>
      recusa('images', 'upload_not_usable', 'Uma das imagens não serve para este encontro. Envie-a de novo.');
    const envio = await tx.envioDeCatalogo(uploadId);
    if (envio === null || envio.kind !== 'catalog_image' || envio.purpose !== 'network_event') throw recusaDaImagem();
    if (envio.confirmedAt !== null) {
      if (envio.catalogImageId === null) throw recusaDaImagem();
      const dono = await tx.encontroDaImagem(envio.catalogImageId);
      if (dono !== null && dono !== eventoId) throw recusaDaImagem();
      return envio.catalogImageId;
    }
    if (envio.expiresAt.getTime() <= agora) throw recusaDaImagem();
    const imagemId = this.deps.ids.uuidv7();
    await tx.confirmarEnvioDeCatalogo({ imagemId, trabalhoId: this.deps.ids.uuidv7(), envioId: envio.id, agora });
    return imagemId;
  }

  // ---------------------------------------------------------------- fila

  /**
   * A fila (D53 a D57). A leitura grava na trilha a quantidade e os filtros,
   * nunca os nomes; se a trilha falhar, a resposta nao sai. O teto de 300
   * linhas por hora por conta e somado da propria trilha: o que se mede e
   * quanto dado de pessoa saiu, e a pagina e cortada no que falta para o teto.
   */
  async listarFila(
    autor: Autor,
    recorte: { decisao?: DecisaoDoPedido | undefined; eventoSlug?: string | undefined; page: number; limit: number },
  ): Promise<PaginaProjetada<PedidoProjetado>> {
    const agora = this.agora();
    const limite = Math.min(recorte.limit, TAMANHO_MAXIMO_DA_PAGINA_DA_FILA);
    return this.deps.repositorio.emTransacao(async (tx) => {
      await tx.travarLeituraDaFila(autor.userId);
      const desde = comoDataDoRelogio((agora - JANELA_DO_TETO_DA_FILA_EM_MS) as Instant);
      const usadas = await tx.linhasDevolvidasDesde(autor.userId, desde);
      const restantes = TETO_DE_LINHAS_DA_FILA_POR_HORA - usadas.total;
      if (restantes <= 0) {
        this.deps.registrarOcorrencia(
          { evento: 'admin.network_join_request.ceiling', correlationId: autor.correlationId },
          'ALERTA: teto de linhas da fila de pedidos estourado (D56)',
        );
        const liberaEm = (usadas.maisAntiga?.getTime() ?? agora) + JANELA_DO_TETO_DA_FILA_EM_MS;
        throw problemas.limiteDeChamadas(Math.max(1, Math.ceil((liberaEm - agora) / 1000)));
      }
      const pagina = await tx.listarFila({
        decisao: recorte.decisao,
        eventoSlug: recorte.eventoSlug,
        page: recorte.page,
        limit: limite,
      });
      const devolvidos = pagina.itens.slice(0, restantes);
      await tx.registrarNaTrilha(
        this.evento(autor, 'admin.network_join_request.listed', 'network_join_request', undefined, {
          extra: {
            rows_returned: devolvidos.length,
            filters: {
              status: recorte.decisao ?? 'pending',
              event: recorte.eventoSlug ?? null,
              page: recorte.page,
              limit: limite,
            },
          },
        }),
      );
      return { items: devolvidos.map(projetarPedido), page: recorte.page, limit: limite, total: pagina.total };
    });
  }

  /** Aprovar vem de pendente ou recusado; aprovado nao volta. Gera o push, so com o titulo. */
  async aprovarPedido(autor: Autor, ref: string): Promise<PedidoProjetado> {
    return this.decidir(autor, ref, 'approved');
  }

  /** So de pendente. O tutor nao e avisado: para ele, o pedido segue "aguardando". */
  async recusarPedido(autor: Autor, ref: string): Promise<PedidoProjetado> {
    return this.decidir(autor, ref, 'declined');
  }

  private async decidir(autor: Autor, ref: string, decisao: 'approved' | 'declined'): Promise<PedidoProjetado> {
    const agora = this.agora();
    return this.deps.repositorio.emTransacao(async (tx) => {
      const atual = await tx.pedidoPorRef(ref);
      if (atual === null) throw problemas.naoEncontrado();
      if (!encontroAbertoParaDecisao(atual.encontro, agora)) {
        throw new AppError('event-not-open', 'Este encontro não recebe mais decisões', {
          detail: 'O encontro foi cancelado, removido ou já terminou.',
        });
      }
      if (!podeDecidir(atual, decisao)) {
        throw recusa('status', 'request_not_pending', 'Este pedido não pode mais receber esta decisão.');
      }
      const decidido = await tx.decidirPedido(atual.id, decisao, autor.userId, agora);
      if (decisao === 'approved') {
        await tx.enfileirarAvisoDeAprovacao({ trabalhoId: this.deps.ids.uuidv7(), pedidoId: atual.id });
      }
      // Pelo `id` interno e pelo `ref`, nunca pelo nome de quem pediu (12.11).
      await tx.registrarNaTrilha(
        this.evento(
          autor,
          decisao === 'approved' ? 'admin.network_join_request.approved' : 'admin.network_join_request.declined',
          'network_join_request',
          atual.id,
          { before: { status: atual.decisao }, after: { status: decisao }, extra: { ref: atual.ref } },
        ),
      );
      return projetarPedido(decidido);
    });
  }
}
