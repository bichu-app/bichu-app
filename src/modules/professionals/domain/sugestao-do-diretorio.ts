/**
 * A sugestao de entrada do diretorio, como a comunidade a manda
 * (`suggestDirectoryEntry`): a conferencia pura, e nada alem dela.
 *
 * ## O que esta funcao protege, e por que ela e a unica
 *
 * A sugestao vai para uma FILA, e a fila e trabalho humano. Mas entre o
 * formulario e a fila **nao ha ninguem**: nenhuma revisao olha este texto antes
 * de ele ser gravado, e por isso as conferencias daqui nao sao uma segunda rede
 * atras de outra -- sao a unica. E a mesma situacao que o encontro da
 * comunidade registrou em 17/10/2026, e e por isso que o detector e o mesmo.
 *
 * ## Os dois textos livres, e o unico lugar em que contato pode entrar
 *
 * `display_name` e `note` passam pela conferencia de texto de usuario:
 * tamanho, controle bidirecional (`code: bidi_control`) e D59
 * (`code: contact_or_payment_detected`). **O contato publico e a UNICA posicao
 * do corpo em que telefone, site ou perfil pode entrar**, e ele e conferido
 * pelo formato do proprio `kind` -- declarado, nunca adivinhado.
 *
 * `city`, `state`, `neighborhood` e `postal_code` nao passam pelo detector, e
 * a ausencia e deliberada: eles sao rotulo fechado pelo schema do contrato
 * (tamanho, `^[A-Z]{2}$` e `^[0-9]{8}$`), nao sao publicados por esta
 * operacao, e um detector de link sobre o nome de uma cidade recusaria
 * "Santana do Livramento" por nada.
 *
 * ## O detector chega INJETADO, e a razao esta na porta
 *
 * Ver `ports/conferencias-de-texto.ts`: `arquitetura/fronteira-de-modulo`
 * reprova importar `modules/network/domain` daqui, e escrever um segundo
 * detector seria manter dois. Quem passa as funcoes de verdade e
 * `src/bin/api.ts`.
 */
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import { errosDoEnderecoCompleto } from '../../../shared/url/endereco-completo.js';
import type { ConferenciasDeTexto } from '../ports/conferencias-de-texto.js';
import type { TipoDeProfissional } from './entrada-do-diretorio.js';

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
 * caractere. A entrada do diretorio que nascer desta sugestao vai guardar o
 * telefone naquela coluna, e aceitar aqui o que o banco recusa la seria
 * encaminhar para a fila um dado que o painel nao consegue gravar.
 */
export const TELEFONE_E164 = /^\+[1-9][0-9]{7,14}$/;

/** `DirectorySuggestionContactKind` do contrato. */
export type TipoDeContatoPublico = 'phone' | 'website' | 'instagram';

/** `DirectorySuggestionContact` do contrato. */
export interface ContatoPublicoSugerido {
  readonly kind: TipoDeContatoPublico;
  readonly value: string;
}

/**
 * `DirectorySuggestionInput` do contrato.
 *
 * **O que ele NAO tem**, e nenhuma ausencia e esquecimento: `crmv_number`,
 * `cnpj`, `verification_level`, `status`, `slug`, `about`, `geo`,
 * `street_address`, `source` e `claim_status`. Verificacao e prova de quem a
 * apresenta (`entity_verifications`); publicacao, nivel e ponto do mapa sao do
 * painel. Nenhum desses campos e de quem sugere.
 *
 * **`postal_code` entrou em 18/10/2026 e `street_address` NAO**, e a assimetria
 * e decisao: o CEP e opcional, aponta para um trecho de rua e tem destinatario
 * -- o revisor do painel, que precisa achar o estabelecimento para convida-lo
 * (ADR-0011). Logradouro e numero apontam para a porta de um terceiro que nao
 * pediu nada, e nao tem destinatario nenhum.
 */
export interface CorpoDaSugestaoDoDiretorio {
  readonly display_name: string;
  readonly kind: TipoDeProfissional;
  readonly city: string;
  readonly state: string;
  readonly neighborhood?: string;
  /**
   * O CEP, **oito digitos sem hifen** (`^[0-9]{8}$` no contrato).
   *
   * **Nao ha conferencia dele em [errosDaSugestao], e a ausencia e
   * deliberada.** O `pattern` do contrato ja recusa qualquer outra forma antes
   * de o corpo chegar ao caso de uso, pelo Ajv montado do proprio
   * `api/openapi.yaml`, e a `20261017000015` repete a regra no `CHECK` do
   * banco. Uma terceira redacao aqui seria a que diverge.
   *
   * Tambem **nao passa pelo detector de D59**, pelo mesmo motivo de `city`,
   * `state` e `neighborhood`: oito digitos nao carregam contato nem link, e um
   * detector sobre eles so produziria achado falso.
   */
  readonly postal_code?: string;
  readonly public_contact: ContatoPublicoSugerido;
  readonly note?: string;
}

/** O campo do contato, nomeado como o contrato manda nomea-lo no `400`. */
const CAMPO_DO_CONTATO = 'public_contact.value';

/**
 * O contato publico, conferido CONTRA O `kind` DECLARADO.
 *
 * - `phone`: E.164, pela regua do banco ([TELEFONE_E164]).
 * - `website`: endereco completo com `https://`, por
 *   `errosDoEnderecoCompleto` -- o padrao da aplicacao inteira desde
 *   17/10/2026 ("todo campo de site pede o endereco completo, com https://").
 *   Os `code` saem com o prefixo `public_contact`, e cada recusa tem o seu:
 *   `public_contact_not_https`, `public_contact_ip_literal`,
 *   `public_contact_local_host` e os demais. Mensagem generica manda a pessoa
 *   consertar a coisa errada, e aquele arquivo nasceu dessa medicao.
 * - `instagram`: o perfil com `@`, como o contrato o descreve.
 *
 *   **AQUI HA UMA DIVERGENCIA DECLARADA, e ela nao foi contornada em
 *   silencio.** O validador existente de Instagram e `errosDoInstagram`, e
 *   desde 17/10/2026 ele exige a URL COMPLETA do perfil e **recusa**
 *   `@usuario` -- foi decisao do cliente para os campos de URL do painel.
 *   O contrato desta operacao pede o oposto: "`instagram` e o perfil com
 *   `@`". Reusar `errosDoInstagram` recusaria justamente a forma que o
 *   contrato manda aceitar.
 *
 *   Entao o que se reusa e o validador existente mais proximo que cabe na
 *   forma pedida: `handleDoInstagram`, a leitura de handle do mesmo arquivo,
 *   que conhece o padrao do Instagram (1 a 30 de letra, digito, ponto e
 *   sublinhado) e e a mesma funcao que o painel usa para extrair o handle. O
 *   `@` e exigido aqui, pelo contrato; o resto da gramatica e dela. Se o
 *   cliente quiser o padrao do painel tambem nesta operacao, o que muda e o
 *   CONTRATO, e nao esta funcao.
 */
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
  // `instagram`. O `@` e exigido pelo contrato; a gramatica do handle e a de
  // `handleDoInstagram`, e nao uma segunda copia dela.
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
 * Todos os erros de campo do corpo, **de uma vez**: a tela marca os campos
 * juntos em vez de um por rodada. Devolve a lista e nao lanca -- quem chama
 * monta um `400` so.
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
    ...(corpo.note === undefined
      ? []
      : conferencias.errosDeTextoDeUsuario(
          'note',
          corpo.note,
          MINIMO_DO_RECADO,
          TETO_DO_RECADO,
        )),
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

/**
 * O recibo, e so ele.
 *
 * **Nao devolve o recurso sugerido**, e a ausencia e o desenho: devolver o
 * texto de volta faria a tela parecer que algo foi publicado. Tambem nao
 * devolve o `id`, o nome de quem sugeriu nem contagem de sugestoes da mesma
 * entidade -- a ultima e vinculo entre duas pessoas inclusive na forma de
 * contagem (BICHUS-174).
 */
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
