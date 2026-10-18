/**
 * O caso de uso da FILA DE REVISAO das indicacoes do `Perto` (18/10/2026).
 *
 * ## A queixa que ele responde, literal
 *
 * "No backoffice nao tem um menu para aprovar os profissionais que as pessoas
 * estao indicando." A operacao `suggestDirectoryEntry` existe desde 17/10 e
 * grava em `directory_suggestions` com `review_status = 'pending'`, sem tocar
 * `professionals` -- e **ninguem fez o lado que le essa fila**. A indicacao pelo
 * aplicativo e os quatro menus do diretorio no painel vieram de duas frentes
 * construidas em paralelo, e as duas subiram em hml assim.
 *
 * ## O que NAO esta aqui, porque ja aconteceu antes
 *
 * Nenhuma conferencia de autenticacao, de CSRF, de origem nem de papel: as
 * quatro acontecem na guarda do escopo (`escoparRotasAdministrativas`), antes de
 * qualquer gancho da rota. **Nenhuma escrita daqui pede reautenticacao por
 * senha** -- ela foi removida de toda escrita administrativa em 07/10/2026 por
 * decisao do cliente (ADR-0027 item 23), e reintroduzi-la aqui desfaria aquela
 * decisao em vez de corrigir um esquecimento.
 *
 * ## APROVAR E O PONTO DA FILA: aprovado aparece no `Perto`
 *
 * A aprovacao faz tres coisas em UMA transacao, e a trilha e a quarta:
 *
 *   1. le a indicacao com `FOR UPDATE` (dois cliques juntos nao decidem duas
 *      vezes) e recusa `400` se ela ja foi decidida;
 *   2. grava a entrada do diretorio **pelo caminho que ja existe** --
 *      `tx.inserirEntrada`, a mesma funcao de `createAdminDirectoryEntry`, com
 *      o mesmo `source: import` e `claim_status: unclaimed`. Nao ha segunda
 *      escrita de entrada neste produto: duas seriam duas definicoes de como
 *      uma entrada nasce, e e isso que o ADR-0023 secao 2 proibe;
 *   3. marca a indicacao `approved` e liga as duas.
 *
 * `source` continua `import` e **nunca `community`**: a emenda 1 do ADR-0011
 * tirou esse valor do `CHECK` de `professionals.source`, e quem grava aqui e o
 * painel decidindo -- a mesma situacao de um operador que digita a clinica na
 * mao, que e o que `import` descreve. A indicacao trouxe o nome ate a mesa; ela
 * nao e o aceite, e nenhum aceite e gravado por aqui.
 *
 * ## A DUPLICATA, que e o caso chato
 *
 * Duas pessoas indicam a mesma clinica, ou indicam uma que o painel ja
 * cadastrou. **Quem resolve e o `slug` do corpo**: se ja existe entrada com
 * aquele endereco, **nada e criado e nada na entrada existente e alterado** --
 * a indicacao e marcada `approved`, ligada aquela entrada, e a resposta volta
 * com `entry_created: false`.
 *
 * Nao e `409`, e a escolha foi tomada e nao herdada: um conflito deixaria a
 * indicacao presa em `pending` para sempre, sem caminho nenhum de sair, e a
 * fila nao andaria. Tambem nao e "atualizar a entrada com os dados da
 * indicacao": isso deixaria um estranho reescrever o telefone de uma clinica
 * que esta no ar, sem `If-Match` e sem ninguem conferir. Corrigir entrada e
 * `updateAdminDirectoryEntry`, que tem `If-Match`.
 *
 * ## Publicar na aprovacao, ou nao
 *
 * A entrada vai ao ar (`published`) quando estiver COMPLETA pela regua unica de
 * `faltasParaPublicar` -- endereco, cidade, UF e um canal de contato -- e fica
 * `draft` quando nao estiver. A regua e a mesma funcao que
 * `updateAdminDirectoryEntry` usa e que `missing_to_publish` projeta: uma
 * segunda definicao de "completo" e o que o ADR-0023 secao 2 proibe, e a
 * `escrita-do-diretorio.ts` ja diz que ela mora em um lugar so.
 *
 * Fica `draft`, na pratica, a indicacao cujo contato publico e `website` ou
 * `instagram`: `professionals` so tem `phone_e164` como canal, e inventar
 * coluna nao e trabalho desta fila. Para esses casos o corpo aceita
 * `phone_e164` -- o telefone COMERCIAL da entidade (ADR-0011 secao 4) --, e com
 * ele a entrada nasce no ar.
 *
 * ## RECUSAR NAO APAGA, e o motivo e obrigatorio
 *
 * A indicacao fica `declined`, com `decided_at` e `decline_reason`, e continua
 * legivel na fila com `review_status=declined`. O motivo e para o PROXIMO
 * revisor -- a mesma entidade vai ser indicada outra vez --, nao e publicado e
 * nao chega a quem indicou. **Nao ha `DELETE` em nenhum caminho deste arquivo.**
 *
 * ## 404 e nunca 403 (ADR-0021)
 *
 * Indicacao inexistente, e indicacao de **conta desabilitada**, respondem o
 * mesmo `404`: o predicado esta no `WHERE` das tres consultas do adaptador, e
 * nao num `if` depois da leitura. Para este caso de uso ela nao existe.
 *
 * ## `SlugOcupado` nao e traduzido aqui, e a ausencia e deliberada
 *
 * A aprovacao LE a entrada por `slug` antes de inserir, com trava de linha, e o
 * caminho da duplicata nao chega ao `INSERT`. Se a violacao de unicidade
 * aparecesse mesmo assim, ela e defeito de concorrencia que a trava deveria ter
 * impedido -- e sobe como erro, em vez de virar um `409` que a tela nao sabe o
 * que fazer com.
 */
import { problemas } from '../../../shared/http/errors.js';
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import type { Clock, IdGenerator } from '../../../shared/ports/index.js';
import type { Instant } from '../../../shared/types/brands.js';
import type { AuditAction, AuditEvent } from '../../audit/ports/audit-log.js';
import {
  comoEtag,
  faltasParaPublicar,
  ORIGEM_DO_PAINEL,
  projetarEntradaAdministrativa,
  STATUS_INICIAL,
  TITULARIDADE_DO_PAINEL,
  type EntradaProjetada,
  type StatusDaEntrada,
} from '../domain/escrita-do-diretorio.js';
import {
  erroSeJaDecidida,
  MAXIMO_DO_MOTIVO,
  MINIMO_DO_MOTIVO,
  projetarIndicacao,
  telefoneDaIndicacao,
  type IndicacaoNaFila,
  type IndicacaoProjetada,
  type RevisaoDaIndicacao,
} from '../domain/fila-de-indicacoes.js';
import type { ConferenciasDeTexto } from '../ports/conferencias-de-texto.js';
import type { TransacaoDoDiretorio } from '../ports/diretorio-administrativo.js';
import type { FilaDeIndicacoesRepository, TransacaoDaFila } from '../ports/fila-de-indicacoes.js';
import type { Autor, PaginaProjetada } from './diretorio-administrativo.js';

/** O corpo de `approveAdminDirectorySuggestion`. */
export interface AprovacaoDaIndicacao {
  readonly slug: string;
  readonly phone_e164?: string | undefined;
}

/** O corpo de `declineAdminDirectorySuggestion`. */
export interface RecusaDaIndicacao {
  readonly reason: string;
}

/** `AdminDirectorySuggestionApproved` do contrato. */
export interface IndicacaoAprovada {
  readonly suggestion: IndicacaoProjetada;
  readonly entry: EntradaProjetada;
  readonly entry_created: boolean;
  /** O `ETag` da entrada, para o painel poder editar sem uma segunda leitura. */
  readonly etagDaEntrada: string;
}

/** `AdminDirectorySuggestionPage` do contrato, menos os campos que a rota acrescenta. */
export interface PaginaDaFilaProjetada extends PaginaProjetada<IndicacaoProjetada> {
  readonly pending_total: number;
}

export interface DependenciasDaFilaDeIndicacoes {
  readonly repositorio: FilaDeIndicacoesRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  /** Ver `ports/conferencias-de-texto.ts`: o detector de D59 nao mora neste modulo. */
  readonly conferencias: ConferenciasDeTexto;
}

export class FilaDeIndicacoes {
  constructor(private readonly deps: DependenciasDaFilaDeIndicacoes) {}

  private agora(): Instant {
    return this.deps.clock.now();
  }

  /**
   * O evento da trilha.
   *
   * `resourceKind: 'directory_suggestion'` e `resourceId: ref` -- o `ref`, e nao
   * o UUID: e por ele que um suporte liga uma reclamacao a uma linha, e e o que
   * a pessoa tem na mao. A mesma escolha de `directory_suggestion.submitted`.
   *
   * **O metadado nao carrega quem indicou**, porque este processo nunca soube:
   * a coluna da autoria nao chega a `IndicacaoNaFila`.
   */
  private evento(
    autor: Autor,
    action: AuditAction,
    ref: string,
    corpo: { before?: Record<string, unknown>; after?: Record<string, unknown> },
  ): AuditEvent {
    return {
      actorKind: 'admin',
      actorAdminId: autor.adminAccountId,
      actorIp: autor.ip,
      correlationId: autor.correlationId,
      action,
      resourceKind: 'directory_suggestion',
      resourceId: ref,
      before: corpo.before,
      after: corpo.after,
      metadata: { surface: 'admin', session: autor.sessao },
    };
  }

  /** O retrato da indicacao para a trilha: o estado e a decisao, nunca o texto de terceiro. */
  private static retrato(i: IndicacaoNaFila): Record<string, unknown> {
    return {
      review_status: i.reviewStatus,
      decided_at: i.decidedAt === null ? null : i.decidedAt.toISOString(),
      decline_reason: i.declineReason,
      entry_slug: i.entradaSlug,
    };
  }

  async listar(recorte: {
    reviewStatus?: RevisaoDaIndicacao | undefined;
    page: number;
    limit: number;
  }): Promise<PaginaDaFilaProjetada> {
    const pagina = await this.deps.repositorio.listar(recorte);
    return {
      items: pagina.itens.map(projetarIndicacao),
      page: recorte.page,
      limit: recorte.limit,
      total: pagina.total,
      pending_total: pagina.pendentes,
    };
  }

  async ler(ref: string): Promise<IndicacaoProjetada> {
    const indicacao = await this.deps.repositorio.indicacaoPorRef(ref);
    if (indicacao === null) throw problemas.naoEncontrado();
    return projetarIndicacao(indicacao);
  }

  async aprovar(autor: Autor, ref: string, corpo: AprovacaoDaIndicacao): Promise<IndicacaoAprovada> {
    const telefoneDoCorpo = corpo.phone_e164?.trim();

    return this.deps.repositorio.emTransacao(async (tx) => {
      const indicacao = await tx.indicacaoPorRef(ref);
      if (indicacao === null) throw problemas.naoEncontrado();
      const jaDecidida = erroSeJaDecidida(indicacao);
      if (jaDecidida !== null) throw problemas.validacao([jaDecidida]);

      // A entrada que JA EXISTE naquele endereco, com trava de linha. Travar
      // aqui e o que impede dois operadores aprovando duas indicacoes do mesmo
      // lugar de criarem duas entradas: o segundo espera, le a do primeiro e
      // cai no caminho da duplicata.
      const existente = await tx.entradaPorSlug(corpo.slug);

      const entrada =
        existente === null
          ? await FilaDeIndicacoes.criarEntradaDaIndicacao(
              tx,
              indicacao,
              corpo.slug,
              telefoneDoCorpo,
              this.deps.ids.uuidv7(),
              this.agora(),
            )
          : existente;

      const aprovada = await tx.marcarAprovada(ref, corpo.slug, this.agora());

      await tx.registrarNaTrilha(
        this.evento(autor, 'admin.directory_suggestion.approved', ref, {
          before: FilaDeIndicacoes.retrato(indicacao),
          after: {
            ...FilaDeIndicacoes.retrato(aprovada),
            // A unica informacao que o retrato nao tem e que o relatorio precisa:
            // esta aprovacao criou a entrada, ou achou a duplicata?
            entry_created: existente === null,
            entry_status: entrada.status,
          },
        }),
      );

      return {
        suggestion: projetarIndicacao(aprovada),
        entry: projetarEntradaAdministrativa(entrada),
        entry_created: existente === null,
        etagDaEntrada: comoEtag(entrada.version),
      };
    });
  }

  /**
   * A entrada, pelo caminho do diretorio.
   *
   * `static` e com a transacao por parametro de proposito: deixa a vista que
   * nenhum estado desta classe entra na entrada, e que a escrita e a de
   * `TransacaoDoDiretorio` -- a mesma de `createAdminDirectoryEntry`.
   */
  private static async criarEntradaDaIndicacao(
    tx: TransacaoDoDiretorio,
    indicacao: IndicacaoNaFila,
    slug: string,
    telefoneDoCorpo: string | undefined,
    id: string,
    agora: Instant,
  ) {
    // O telefone do corpo tem precedencia sobre o da indicacao: o operador
    // acabou de conferir, e a indicacao e de terceiro.
    const telefone =
      telefoneDoCorpo !== undefined && telefoneDoCorpo !== ''
        ? telefoneDoCorpo
        : telefoneDaIndicacao(indicacao);

    // A REGUA UNICA de completude (`faltasParaPublicar`), sobre a entrada como
    // ela vai ficar. Sem `about` e sem `neighborhood` na conta: nenhum dos dois
    // impede publicar, e e esta funcao que decide isso -- em um lugar so.
    const faltas = faltasParaPublicar({
      slug,
      city: indicacao.city,
      state: indicacao.state.toUpperCase(),
      phoneE164: telefone,
    });
    const status: StatusDaEntrada = faltas.length === 0 ? 'published' : STATUS_INICIAL;

    const criada = await tx.inserirEntrada({
      id,
      slug,
      kind: indicacao.kind,
      displayName: indicacao.displayName,
      // `about` nulo: o recado de quem indicou e para quem revisa, e nao para o
      // diretorio (ADR-0011 secao 5.4). Copia-lo aqui publicaria avaliacao da
      // comunidade, que e outro modelo e nao existe.
      about: null,
      city: indicacao.city,
      // A UF em MAIUSCULA, como em `criarEntrada`: `sp` e `SP` na mesma coluna
      // fariam o filtro por UF da listagem perder metade das linhas.
      state: indicacao.state.toUpperCase(),
      neighborhood: indicacao.neighborhood,
      phoneE164: telefone,
      status,
      source: ORIGEM_DO_PAINEL,
      claimStatus: TITULARIDADE_DO_PAINEL,
      agora,
    });

    if (status !== 'published') return criada;

    // `published_at` e carimbado pela transicao, e nao pelo `INSERT`: e
    // `atualizarEntrada` com `gravaMarcoDePublicacao` que o grava, e ele
    // responde "desde quando esta no ar". Um `INSERT` que o pusesse direto
    // seria o segundo lugar que escreve aquele marco.
    const publicada = await tx.atualizarEntrada(
      id,
      criada.version,
      { status: 'published', gravaMarcoDePublicacao: true },
      agora,
    );
    // `null` quer dizer que a versao mudou entre o `INSERT` e este `UPDATE`,
    // dentro da MESMA transacao: nao ha outro escritor possivel ali.
    return publicada ?? criada;
  }

  async recusar(autor: Autor, ref: string, corpo: RecusaDaIndicacao): Promise<IndicacaoProjetada> {
    // O motivo passa pelo MESMO detector de todo texto que uma pessoa escreve
    // (D59 e controle bidirecional), pela porta de conferencias: um segundo
    // detector aqui divergiria calado do primeiro.
    const erros: ProblemFieldError[] = this.deps.conferencias.errosDeTextoDeUsuario(
      'reason',
      corpo.reason,
      MINIMO_DO_MOTIVO,
      MAXIMO_DO_MOTIVO,
    );
    if (erros.length > 0) throw problemas.validacao(erros);

    return this.deps.repositorio.emTransacao(async (tx: TransacaoDaFila) => {
      const indicacao = await tx.indicacaoPorRef(ref);
      if (indicacao === null) throw problemas.naoEncontrado();
      const jaDecidida = erroSeJaDecidida(indicacao);
      if (jaDecidida !== null) throw problemas.validacao([jaDecidida]);

      const recusada = await tx.marcarRecusada(ref, corpo.reason.trim(), this.agora());

      await tx.registrarNaTrilha(
        this.evento(autor, 'admin.directory_suggestion.declined', ref, {
          before: FilaDeIndicacoes.retrato(indicacao),
          // O motivo VAI para a trilha: ele e a decisao do administrador sobre o
          // proprio trabalho, e nao texto de terceiro.
          after: FilaDeIndicacoes.retrato(recusada),
        }),
      );
      return projetarIndicacao(recusada);
    });
  }
}
