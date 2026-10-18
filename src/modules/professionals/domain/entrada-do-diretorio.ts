/**
 * A projecao de uma entrada do diretorio: o que a secao `Perto` mostra.
 *
 * ## O que NAO sai daqui, e por que cada ausencia e decisao
 *
 * - **`id`.** `professionals.id` e UUID interno, e o ADR-0010 item 6 o proibe
 *   em saida. O endereco de uma entrada e o `slug`, como o do pet.
 * - **Quem convidou, e quem e o titular.** As duas colunas ligam a entrada a
 *   uma conta de pessoa, e a BICHUS-174 proibe expor vinculo entre duas pessoas
 *   inclusive como contagem e como existencia. Nenhuma das duas aparece no tipo
 *   de entrada desta funcao: o que nao chega aqui nao tem como sair daqui.
 * - **A coordenada.** `professionals.geo` nunca atravessa esta funcao. O que
 *   sai e distancia em metros, arredondada, que e um numero e nao uma posicao.
 * - **CRMV e CNPJ.** `verification` ja diz o que foi verificado, e pelo tipo de
 *   prova. Publicar o numero de registro de um terceiro numa lista acrescenta
 *   exposicao sem acrescentar decisao para quem le.
 *
 * ## `status` tambem nao sai, e por um motivo diferente
 *
 * Nao e privacidade: e que so `published` chega ate aqui. O filtro vive na
 * clausula `WHERE` da consulta (ADR-0021, o mesmo desenho da autorizacao), e
 * nao num `if` desta funcao. Projecao que filtra e projecao que um dia esquece.
 */
import {
  evidenciasAprovadas,
  nivelDerivado,
  type NivelDeVerificacao,
  type TipoDeEvidencia,
  type VerificacaoDaEntidade,
} from './nivel-de-verificacao.js';

/**
 * A lista fechada de `professionals.kind`: a ATIVIDADE, o que se contrata.
 * **Espelhada** em `src/shared/db/schema.ts`.
 *
 * **Continua sem valor para ONG, e a ausencia agora e desenho concluido.** O
 * texto anterior aqui dizia "decisao pendente do modelo" e nomeava a coluna que
 * faltava; desde `20261018000012` ela existe, e o tipo de entidade e eixo
 * proprio (`TipoDeEntidade`). ONG nao entra nesta lista porque **uma ONG nao e
 * uma atividade**: ela tem atividade (`clinic`, `vet`) E tipo de entidade
 * (`organization`), os dois ao mesmo tempo. Acrescentar valor aqui tambem
 * quebraria o contrato -- `oasdiff`, `response-property-enum-value-added`, 12
 * erros medidos em 18/10.
 */
export type TipoDeProfissional = 'vet' | 'groomer' | 'walker' | 'sitter' | 'trainer' | 'clinic';

/**
 * A lista fechada de `professionals.entity_kind`: o QUE a entrada e.
 *
 * Mesmo nome e mesmos valores de `entity_verifications.entity_kind`
 * (`20260921000002`), que carrega `organization` desde antes de existir linha
 * -- a revisao de 17/09 do ADR-0011 generalizou a verificacao para ENTIDADE
 * exatamente para isso. Segunda convencao para o mesmo conceito e a convencao
 * que diverge.
 */
export type TipoDeEntidade = 'professional' | 'organization';

/**
 * A grade em que o produto quantiza a localizacao do usuario (ADR-0006).
 *
 * Arredondar a distancia nela nao e zelo defensivo: **precisao maior nao existe
 * na origem**. Devolver "1 237 m" a partir de um ponto que ja foi arredondado
 * para uma celula de 100 m seria anunciar uma exatidao que o dado nao tem.
 */
export const GRADE_EM_METROS = 100;

/** A entrada como o repositorio a entrega. Sem `id`, sem ponto, sem vinculo. */
export interface EntradaDoDiretorio {
  readonly slug: string;
  readonly kind: TipoDeProfissional;
  readonly entityKind: TipoDeEntidade;
  readonly displayName: string;
  readonly about: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly neighborhood: string | null;
  readonly phoneE164: string | null;
  readonly verificacoes: readonly VerificacaoDaEntidade[];
  /**
   * Metros cruas, como o banco as calculou. **Nulo** quando a entrada nao tem
   * coordenada ou quando quem chama nao tem localizacao valida. Nulo e um
   * resultado; zero seria uma mentira a 100 m de distancia.
   */
  readonly distanciaEmMetros: number | null;
}

export interface VerificacaoPublica {
  readonly level: NivelDeVerificacao;
  readonly evidence_kinds: readonly TipoDeEvidencia[];
}

/** `DirectoryEntrySummary` do contrato. */
export interface EntradaPublica {
  readonly slug: string;
  readonly kind: TipoDeProfissional;
  readonly entity_kind: TipoDeEntidade;
  readonly display_name: string;
  readonly city: string | null;
  readonly state: string | null;
  readonly neighborhood: string | null;
  readonly about: string | null;
  readonly phone_e164: string | null;
  readonly verification: VerificacaoPublica;
  readonly distance_m: number | null;
}

/**
 * Metros para a grade de 100 m, **sem nunca virar zero para quem esta longe**.
 *
 * `Math.round` levaria 40 m a 0, e "0 m" numa lista e "esta aqui dentro". O
 * piso e uma celula: a menor distancia que este produto sabe afirmar e
 * "ate 100 m".
 */
export function distanciaNaGrade(metros: number | null): number | null {
  if (metros === null || !Number.isFinite(metros)) return null;
  return Math.max(GRADE_EM_METROS, Math.round(metros / GRADE_EM_METROS) * GRADE_EM_METROS);
}

export function projetarEntrada(entrada: EntradaDoDiretorio): EntradaPublica {
  return {
    slug: entrada.slug,
    kind: entrada.kind,
    entity_kind: entrada.entityKind,
    display_name: entrada.displayName,
    city: entrada.city,
    state: entrada.state,
    neighborhood: entrada.neighborhood,
    about: entrada.about,
    phone_e164: entrada.phoneE164,
    verification: {
      level: nivelDerivado(entrada.verificacoes),
      evidence_kinds: evidenciasAprovadas(entrada.verificacoes),
    },
    distance_m: distanciaNaGrade(entrada.distanciaEmMetros),
  };
}
