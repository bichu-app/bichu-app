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
  | { readonly tipo: 'envio_nao_serve' };

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
   * Grava a indicacao -- e, quando ha logotipo, confirma o envio dele na MESMA
   * transacao.
   */
  registrar(sugestao: SugestaoAGravar): Promise<RegistroDaSugestao>;
  /** As indicacoes DA CONTA, da mais recente para a mais antiga. */
  listarDoAutor(recorte: RecorteDasMinhasIndicacoes): Promise<PaginaDasMinhasIndicacoes>;
}
