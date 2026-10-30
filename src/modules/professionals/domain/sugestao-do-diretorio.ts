/**
 * A sugestao de entrada do diretorio, como a comunidade a manda
 * (`suggestDirectoryEntry`): a conferencia pura, e nada alem dela.
 */
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import { errosDeModeracao } from '../../../shared/texto/moderacao.js';
import { errosDoEnderecoCompleto } from '../../../shared/url/endereco-completo.js';
import type { ConferenciasDeTexto } from '../ports/conferencias-de-texto.js';
import type { TipoDeEntidade, TipoDeProfissional } from './entrada-do-diretorio.js';
import type { RevisaoDaIndicacao } from './fila-de-indicacoes.js';

/** Os tetos do contrato, COPIADOS dele e nao escolhidos aqui. */
export const MINIMO_DO_NOME = 2;
export const TETO_DO_NOME = 120;
export const MINIMO_DO_RECADO = 2;
export const TETO_DO_RECADO = 280;
/** O teto do contato: o mesmo `maxLength` de `DirectorySuggestionContact.value`. */
export const TETO_DO_CONTATO = 120;

/**
 * O telefone, no formato de `professionals.phone_e164` -- o `CHECK`
 * `professionals_telefone_formato` da migracao `20260921000002`, caractere a
 * caractere.
 */
export const TELEFONE_E164 = /^\+[1-9][0-9]{7,14}$/;

/** `DirectorySuggestionContactKind` do contrato. */
export type TipoDeContatoPublico = 'phone' | 'website' | 'instagram';

/** `DirectorySuggestionContact` do contrato. */
export interface ContatoPublicoSugerido {
  readonly kind: TipoDeContatoPublico;
  readonly value: string;
}

/** `DirectorySuggestionInput` do contrato. */
export interface CorpoDaSugestaoDoDiretorio {
  readonly display_name: string;
  readonly kind: TipoDeProfissional;
  /**
   * O QUE a entidade indicada E -- eixo SEPARADO de `kind`, que e o que ela FAZ
   * (cliente, 29/10/2026: *"esta faltando o campo se e um profissional, ong ou
   * estabelecimento"*).
   */
  readonly entity_kind?: TipoDeEntidade;
  readonly city: string;
  readonly state: string;
  readonly neighborhood?: string;
  /** O CEP, **oito digitos sem hifen** (`^[0-9]{8}$` no contrato). */
  readonly postal_code?: string;
  readonly public_contact: ContatoPublicoSugerido;
  readonly note?: string;
  /**
   * O `upload_id` do LOGOTIPO (cliente, 29/10/2026: *"nao tem o campo do logotipo
   * para o usuario subir e indicar o estabelecimento"*).
   */
  readonly logo_upload_id?: string;
  /**
   * Ate QUATRO fotos do ESTABELECIMENTO, **na ordem em que a pessoa as colocou**
   * (cliente, 29 e 30/10/2026: *"devemos deixar enviar ate 4 imagens"* e *"so tem
   * o campo para subir a foto do logotipo da empresa, mas nao as fotos do
   * estabelecimento que fica no topo da pagina"*).
   *
   * **A primeira e a capa**, e o LOGOTIPO nao conta entre as quatro: aquele e a
   * marca (um quadrado ao lado do nome) e estas sao a faixa 16:9 do topo.
   *
   * `maxItems`, `minItems` e `uniqueItems` sao do CONTRATO e o esquema do corpo os
   * cobra antes de o caso de uso ver o corpo -- por isso nao ha conferencia de
   * forma em `errosDaSugestao`.
   */
  readonly photo_upload_ids?: readonly string[];
}

/** O campo do contato, nomeado como o contrato manda nomea-lo no `400`. */
const CAMPO_DO_CONTATO = 'public_contact.value';

/** O contato publico, conferido CONTRA O `kind` DECLARADO. */
function errosDoContato(
  contato: ContatoPublicoSugerido,
  conferencias: ConferenciasDeTexto,
): ProblemFieldError[] {
  const valor = contato.value.trim();
  if (contato.kind === 'phone') {
    return TELEFONE_E164.test(valor)
      ? []
      : [
          {
            field: CAMPO_DO_CONTATO,
            code: 'public_contact_phone_invalid',
            message: 'Escreva o telefone com o código do país, assim: +5511999999999.',
          },
        ];
  }
  if (contato.kind === 'website') {
    return errosDoEnderecoCompleto(CAMPO_DO_CONTATO, valor, {
      prefixo: 'public_contact',
      teto: TETO_DO_CONTATO,
    });
  }
  if (!valor.startsWith('@') || conferencias.handleDoInstagram(valor) === null) {
    return [
      {
        field: CAMPO_DO_CONTATO,
        code: 'public_contact_instagram_invalid',
        message: 'Escreva o perfil do Instagram com @, assim: @bichu.app.',
      },
    ];
  }
  return [];
}

/**
 * Todos os erros de campo do corpo, **de uma vez**: a tela marca os campos juntos
 * em vez de um por rodada.
 */
export function errosDaSugestao(
  corpo: CorpoDaSugestaoDoDiretorio,
  conferencias: ConferenciasDeTexto,
): ProblemFieldError[] {
  return [
    ...conferencias.errosDeTextoDeUsuario(
      'display_name',
      corpo.display_name,
      MINIMO_DO_NOME,
      TETO_DO_NOME,
    ),
    ...errosDeModeracao('display_name', corpo.display_name),
    ...(corpo.note === undefined
      ? []
      : [
          ...conferencias.errosDeTextoDeUsuario(
            'note',
            corpo.note,
            MINIMO_DO_RECADO,
            TETO_DO_RECADO,
          ),
          ...errosDeModeracao('note', corpo.note),
        ]),
    ...errosDoContato(corpo.public_contact, conferencias),
  ];
}

/** O recibo, como `DirectorySuggestionReceipt` o declara. */
export interface ReciboDaSugestao {
  /**
   * O identificador opaco. **Nao e o `id`** (ADR-0010 item 6): 128 bits em
   * base64url, que nao carregam o instante de criacao dentro.
   */
  readonly reference: string;
  /** Sempre `pending` nesta operacao: nada aqui aprova nada. */
  readonly state: 'pending';
  readonly created_at: string;
}

/** O recibo, e so ele. */
export function projetarRecibo(gravada: {
  readonly ref: string;
  readonly createdAt: Date;
}): ReciboDaSugestao {
  return {
    reference: gravada.ref,
    state: 'pending',
    created_at: gravada.createdAt.toISOString(),
  };
}

/**
 * Uma indicacao na tela `Minhas indicacoes`, como `MyDirectorySuggestion` a
 * declara.
 */
export interface MinhaIndicacaoProjetada {
  readonly reference: string;
  readonly display_name: string;
  readonly kind: TipoDeProfissional;
  /**
   * O QUE a entidade E. Sai aqui, na projecao de quem INDICOU, porque foi ela que
   * declarou o tipo -- esconde-lo faria a lista dela mostrar menos do que ela
   * mandou.
   */
  readonly entity_kind: TipoDeEntidade;
  readonly city: string;
  readonly state: string;
  readonly neighborhood: string | null;
  readonly public_contact: { readonly kind: TipoDeContatoPublico; readonly value: string };
  readonly review_status: RevisaoDaIndicacao;
  readonly created_at: string;
  readonly decided_at: string | null;
  readonly decline_reason: string | null;
  readonly entry_slug: string | null;
}

/** A pagina projetada, como `MyDirectorySuggestionPage` a declara. */
export interface PaginaDasMinhasIndicacoesProjetada {
  readonly items: readonly MinhaIndicacaoProjetada[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
}

/** Projeta uma indicacao para quem a fez. */
export function projetarMinhaIndicacao(i: {
  readonly ref: string;
  readonly displayName: string;
  readonly kind: TipoDeProfissional;
  readonly entityKind: TipoDeEntidade;
  readonly city: string;
  readonly state: string;
  readonly neighborhood: string | null;
  readonly contatoKind: TipoDeContatoPublico;
  readonly contatoValue: string;
  readonly reviewStatus: RevisaoDaIndicacao;
  readonly createdAt: Date;
  readonly decidedAt: Date | null;
  readonly declineReason: string | null;
  readonly entradaSlug: string | null;
}): MinhaIndicacaoProjetada {
  return {
    reference: i.ref,
    display_name: i.displayName,
    kind: i.kind,
    entity_kind: i.entityKind,
    city: i.city,
    state: i.state,
    neighborhood: i.neighborhood,
    public_contact: { kind: i.contatoKind, value: i.contatoValue },
    review_status: i.reviewStatus,
    created_at: i.createdAt.toISOString(),
    decided_at: i.decidedAt === null ? null : i.decidedAt.toISOString(),
    decline_reason: i.declineReason,
    entry_slug: i.entradaSlug,
  };
}
