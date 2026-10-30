/** A porta de ESCRITA da fila de sugestoes do diretorio. */
import type { TipoDeEntidade, TipoDeProfissional } from '../domain/entrada-do-diretorio.js';
import type { TipoDeContatoPublico } from '../domain/sugestao-do-diretorio.js';
import type { RevisaoDaIndicacao } from '../domain/fila-de-indicacoes.js';
import type { UserId } from '../../../shared/types/brands.js';

/** O que se grava. */
export interface SugestaoAGravar {
  /**
   * **A autoria.** Chega por aqui e para na borda do banco: a coluna que a guarda
   * leva a marca `NUNCA sai do servidor`, e quem a escreve e a funcao
   * `directory_suggestions_registrar` da migracao `20261017000004`.
   */
  readonly autor: UserId;
  readonly displayName: string;
  readonly kind: TipoDeProfissional;
  /** O QUE a entidade indicada E (cliente, 29/10/2026). */
  readonly entityKind: TipoDeEntidade;
  readonly city: string;
  readonly state: string;
  readonly neighborhood: string | null;
  /** O CEP, oito digitos sem hifen, ou nulo. */
  readonly postalCode: string | null;
  readonly contatoKind: TipoDeContatoPublico;
  readonly contatoValue: string;
  readonly note: string | null;
  /**
   * O `upload_id` do LOGOTIPO que quem indicou enviou, ou nulo (cliente, 29/10/2026:
   * *"nao tem o campo do logotipo para o usuario subir e indicar o
   * estabelecimento"*).
   */
  readonly logoUploadId: string | null;
  /**
   * Os `upload_id` das FOTOS DO ESTABELECIMENTO, **na ordem em que a pessoa as
   * colocou** (cliente, 29 e 30/10/2026). Vazio e o estado normal -- o APK
   * publicado nao tem o campo.
   *
   * **O indice do array E a `position` da linha**, e a `0` e a capa: nao existe
   * campo de capa, porque duas formas de dizer qual e a capa e o defeito. As
   * linhas vao para `directory_suggestion_images`, e NAO para uma coluna de
   * `directory_suggestions` -- e por isso que
   * `directory_suggestions_registrar` nao mudou de assinatura nesta migracao.
   */
  readonly photoUploadIds: readonly string[];
}

/** O que a gravacao devolve, e e tudo que o recibo precisa. */
export interface SugestaoGravada {
  readonly ref: string;
  /** O carimbo que o BANCO pos na linha, e nao o do relogio da aplicacao. */
  readonly createdAt: Date;
}

/**
 * O desfecho de `registrar`, e **por que ele deixou de ser so `SugestaoGravada` em
 * 29/10/2026**.
 */
export type RegistroDaSugestao =
  | { readonly tipo: 'gravada'; readonly sugestao: SugestaoGravada }
  /**
   * **`campo` entrou em 30/10/2026, com as fotos**: sao DUAS entradas de imagem
   * no mesmo corpo agora, e o `400` tem de nomear a que nao serviu -- marcar
   * `logo_upload_id` quando o problema esta numa foto manda a tela pedir de novo
   * o arquivo errado. O `code` continua sendo `upload_not_usable` nos dois, **sem
   * dizer qual dos casos ocorreu** (inexistente, de outra conta, de outro
   * proposito, vencido, ja usado).
   */
  | {
      readonly tipo: 'envio_nao_serve';
      readonly campo: 'logo_upload_id' | 'photo_upload_ids';
    };

/** O recorte da lista de quem indicou: paginacao e o estado da revisao. */
export interface RecorteDasMinhasIndicacoes {
  readonly autor: UserId;
  /** Ausente devolve TODOS os estados, que e a pergunta de quem abre a tela. */
  readonly reviewStatus?: RevisaoDaIndicacao | undefined;
  readonly page: number;
  readonly limit: number;
}

/** Uma indicacao como QUEM INDICOU a ve. */
export interface MinhaIndicacao {
  readonly ref: string;
  readonly displayName: string;
  readonly kind: TipoDeProfissional;
  /** O QUE a entidade E. `NOT NULL DEFAULT 'professional'` na coluna. */
  readonly entityKind: TipoDeEntidade;
  readonly city: string;
  readonly state: string;
  readonly neighborhood: string | null;
  readonly contatoKind: TipoDeContatoPublico;
  readonly contatoValue: string;
  readonly reviewStatus: RevisaoDaIndicacao;
  readonly createdAt: Date;
  readonly decidedAt: Date | null;
  /** O motivo da recusa, e **ele chega a quem indicou** desde 18/10/2026. */
  readonly declineReason: string | null;
  /** O endereco da entrada no `Perto`, **so quando ela esta publicada**. */
  readonly entradaSlug: string | null;
}

/** A pagina das minhas indicacoes. */
export interface PaginaDasMinhasIndicacoes {
  readonly itens: readonly MinhaIndicacao[];
  readonly total: number;
}

export interface DirectorySuggestionRepository {
  /**
   * Grava a indicacao -- e, quando ha logotipo ou foto, confirma os envios deles
   * na MESMA transacao.
   */
  registrar(sugestao: SugestaoAGravar): Promise<RegistroDaSugestao>;
  /** As indicacoes DA CONTA, da mais recente para a mais antiga. */
  listarDoAutor(recorte: RecorteDasMinhasIndicacoes): Promise<PaginaDasMinhasIndicacoes>;
}
