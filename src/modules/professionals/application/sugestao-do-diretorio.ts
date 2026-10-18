/**
 * O caso de uso de `suggestDirectoryEntry`: a comunidade sugere uma entrada do
 * diretorio, e a sugestao entra na FILA DE REVISAO.
 *
 * ## O que ele NAO faz, e e a decisao inteira
 *
 * **Nao escreve em `professionals`.** A emenda 1 do ADR-0011 tirou
 * `'community'` do `CHECK` de `professionals.source`: nenhum perfil nasce sem o
 * aceite de quem ele descreve. Quem cria a entrada e o painel, a partir da
 * sugestao, pelo caminho de convite e aceite. Uma escrita em `professionals`
 * daqui desfaria aquela decisao em vez de implementar esta.
 *
 * E **nao publica nada**, nem agora nem depois: a sugestao nasce `pending` pelo
 * `DEFAULT` da tabela. Criar encontro da `Rede` publica direto porque o autor e
 * o assunto sao a mesma pessoa; aqui eles nao sao.
 *
 * ## A trava de CONTA VALIDADA e aqui, e nao na tela
 *
 * So quem tem canal de contato verificado sugere (regra do cliente). A tela
 * esconde o icone de quem nao validou, e isso e cortesia, nao recusa: o icone
 * escondido nao impede ninguem de chamar `POST /v1/directory/suggestions`
 * direto. A recusa e deste arquivo, com o MESMO `type` de criar encontro --
 * `contact-channel-unverified` --, porque a pergunta e a mesma.
 *
 * ## A trilha, e o IP que NAO e tratado aqui
 *
 * `directory_suggestion.submitted`, por `AuditLog.record` -- a trilha do app,
 * que abre a propria transacao e nao derruba a requisicao quando falha. E o
 * caminho do app, e nao o do backoffice (D49 e para a escrita administrativa).
 *
 * **O IP vai EM CLARO para a porta**, que o transforma em HMAC (SEC-010). Este
 * arquivo nao o transforma e nao o registra: duas implementacoes do mesmo
 * hash divergem, e um IP em claro num log sobrevive a exclusao da conta.
 *
 * O metadado da trilha carrega `kind`, `city`, `state` e o TIPO do contato --
 * nunca o valor do contato, nunca o nome sugerido e nunca o recado. A trilha
 * sobrevive a exclusao da conta de proposito, e o que ela precisa responder e
 * "quem mandou quantas sugestoes, de que tipo e para onde", nao o conteudo.
 */
import { problemas } from '../../../shared/http/errors.js';
import type { UserId } from '../../../shared/types/brands.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';
import {
  errosDaSugestao,
  projetarRecibo,
  type CorpoDaSugestaoDoDiretorio,
  type ReciboDaSugestao,
} from '../domain/sugestao-do-diretorio.js';
import type { ConferenciasDeTexto } from '../ports/conferencias-de-texto.js';
import type { DirectorySuggestionRepository } from '../ports/directory-suggestion-repository.js';

/**
 * A leitura de apoio: a conta que chama TEM canal de contato verificado?
 *
 * Mora aqui, e nao no `DirectorySuggestionRepository`, porque aquela porta e a
 * ESCRITA da fila e o cabecalho dela diz isso em voz alta ("um metodo so, e ele
 * nao le"). Mesmo arranjo de `EmailVerificadoDoChamador` em
 * `modules/transfers/application/pet-transfer-service.ts`: consulta de um
 * modulo, declarada no modulo, e nao um metodo novo na porta de identidade que
 * so esta operacao usaria.
 *
 * **E-mail OU telefone verificado**, a MESMA regua de
 * `estadoParaCriarEncontro`. Uma segunda definicao de "validado" e a que
 * diverge: se criar encontro aceitar telefone e sugerir nao, a mesma conta e
 * validada numa tela e nao na outra.
 */
export interface CanalDeContatoDoChamador {
  temCanalVerificado(conta: UserId): Promise<boolean>;
}

/** Quem sugeriu, e o contexto da requisicao que a trilha guarda. */
export interface AutorDaSugestao {
  readonly userId: UserId;
  readonly correlationId: string;
  /** Em claro. A porta da trilha o transforma em HMAC (SEC-010); este arquivo nao. */
  readonly ip: string | undefined;
}

/**
 * **Sem `ids` e sem `clock`**, e a ausencia dos dois e decisao.
 *
 * `id` e `ref` nascem no adaptador, junto do `INSERT`. E `created_at` e o
 * carimbo que o BANCO pos na linha, devolvido pelo `RETURNING`: ler o relogio
 * aqui e devolver esse valor no recibo faria a resposta afirmar um instante que
 * a linha nao tem.
 */
export interface DependenciasDaSugestaoDoDiretorio {
  readonly sugestoes: DirectorySuggestionRepository;
  readonly trilha: AuditLog;
  /** Ver `ports/conferencias-de-texto.ts`: o detector de D59 nao mora neste modulo. */
  readonly conferencias: ConferenciasDeTexto;
  /** Ver `CanalDeContatoDoChamador`: a trava de "conta validada", no SERVIDOR. */
  readonly canal: CanalDeContatoDoChamador;
}

/** O texto como ele vai para o banco: aparado, e nunca vazio por causa disso. */
function aparado(valor: string | undefined): string | null {
  const texto = valor?.trim();
  return texto === undefined || texto === '' ? null : texto;
}

export class SugestaoDoDiretorio {
  constructor(private readonly deps: DependenciasDaSugestaoDoDiretorio) {}

  async sugerir(
    autor: AutorDaSugestao,
    corpo: CorpoDaSugestaoDoDiretorio,
  ): Promise<ReciboDaSugestao> {
    // A TRAVA DE CONTA VALIDADA, NO SERVIDOR, e ANTES de qualquer conferencia
    // de texto: a recusa nao depende do que foi escrito, e gastar o detector
    // sobre um corpo que nao vai ser gravado nao muda a resposta. Esconder o
    // icone na tela nao recusa o pedido -- quem chama a rota direto passa por
    // cima da tela, e e por isso que este `if` nao pode viver no app.
    //
    // O tipo e o MESMO de criar encontro e de abrir caso de perdido
    // (`contact-channel-unverified`, 409 pelo `x-problem-types` do contrato);
    // o que muda e o texto.
    if (!(await this.deps.canal.temCanalVerificado(autor.userId))) {
      throw problemas.canalDeContatoNaoVerificadoParaSugestao();
    }

    const erros = errosDaSugestao(corpo, this.deps.conferencias);
    if (erros.length > 0) throw problemas.validacao(erros);

    const gravada = await this.deps.sugestoes.registrar({
      autor: autor.userId,
      displayName: corpo.display_name.trim(),
      kind: corpo.kind,
      city: corpo.city.trim(),
      state: corpo.state,
      neighborhood: aparado(corpo.neighborhood),
      contatoKind: corpo.public_contact.kind,
      contatoValue: corpo.public_contact.value.trim(),
      note: aparado(corpo.note),
    });

    // Depois da gravacao: a trilha do app abre transacao propria, e um
    // incidente nela nao e motivo para a pessoa nao conseguir sugerir. O
    // `resourceId` e o `ref`, que e o identificador que a pessoa tem na mao --
    // o `id` interno nao sai em resposta, e e por `ref` que um suporte liga uma
    // reclamacao a uma linha.
    await this.deps.trilha.record({
      actorKind: 'user',
      actorUserId: autor.userId,
      actorIp: autor.ip,
      correlationId: autor.correlationId,
      action: 'directory_suggestion.submitted',
      resourceKind: 'directory_suggestion',
      resourceId: gravada.ref,
      after: {
        kind: corpo.kind,
        city: corpo.city.trim(),
        state: corpo.state,
        // O TIPO do contato, nunca o valor: a trilha nao guarda o telefone nem
        // o perfil de um terceiro, e ela sobrevive a exclusao da conta.
        contact_kind: corpo.public_contact.kind,
        has_note: corpo.note !== undefined,
        review_status: 'pending',
      },
    });

    return projetarRecibo(gravada);
  }
}
