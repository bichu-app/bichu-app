/**
 * AS TRES LISTAS FECHADAS DE MOTIVO -- e por que sao tres, e nao uma.
 *
 * Decisão do desenho da frente de comunidade, fatia E: **lista curta e fechada,
 * sem texto livre de motivo**. Campo de motivo livre vira desabafo e não se
 * tria, e uma fila que não se tria é uma fila que ninguém trabalha. O padrão de
 * valor novo em lista fechada é o do ADR-0023 §3.
 *
 * ## Por que TRÊS listas e não uma
 *
 * Porque as três superfícies falam de coisas diferentes, e misturar as listas
 * ofereceria motivos impossíveis:
 *
 * - *nudez* e *maus-tratos a animal* são de **imagem** — não há o que responder
 *   a "este perfil tem nudez" quando o que incomoda é uma foto, e o
 *   administrador precisaria adivinhar qual;
 * - *não é quem diz ser* é de **perfil** — uma publicação não finge ser alguém;
 * - *informação falsa sobre um pet perdido* é de **publicação**, e só existe
 *   neste produto: **um avistamento inventado manda a pessoa para o bairro
 *   errado e custa horas de busca**. É por isso que ela não cabia em `other` —
 *   em `other` ela chegaria à fila sem dizer que é urgente.
 *
 * ## O que este arquivo NÃO faz
 *
 * Não traduz. Os rótulos em português são da tela (`app/lib/telas/seguranca/`)
 * e do painel; aqui ficam os valores do contrato, que são os mesmos nos quatro
 * clientes por regra da casa.
 *
 * Não decide ordem de fila. `minor_suspected` e `child_at_risk` vão ao topo, e
 * isso é da consulta da fila, que é de outro módulo.
 */
import type { ProblemFieldError } from '../../../shared/http/problem.js';

/** Denúncia de PERFIL: sobre quem a pessoa é. Cinco. */
export const MOTIVOS_DE_PERFIL = [
  'impersonation',
  'harassment',
  'pet_ransom_scam',
  'minor_suspected',
  'other',
] as const;

/** Denúncia de FOTO: seis, e as duas exclusivas são de imagem. */
export const MOTIVOS_DE_FOTO = [
  'nudity_or_sexual',
  'child_at_risk',
  'animal_violence',
  'i_am_in_it',
  'impersonation',
  'other',
] as const;

/** Denúncia de PUBLICAÇÃO: cinco, e a terceira é só deste produto. */
export const MOTIVOS_DE_PUBLICACAO = [
  'offensive_or_discriminatory',
  'scam_or_animal_sale',
  'false_lost_pet_info',
  'spam_or_repetition',
  'other',
] as const;

export type MotivoDePerfil = (typeof MOTIVOS_DE_PERFIL)[number];
export type MotivoDeFoto = (typeof MOTIVOS_DE_FOTO)[number];
export type MotivoDePublicacao = (typeof MOTIVOS_DE_PUBLICACAO)[number];

/** Os três alvos que esta fatia acrescenta à fila do administrador. */
export const ALVOS_DA_DENUNCIA = ['profile', 'photo', 'publication'] as const;
export type AlvoDaDenuncia = (typeof ALVOS_DA_DENUNCIA)[number];

const LISTA_POR_ALVO: Record<AlvoDaDenuncia, readonly string[]> = {
  profile: MOTIVOS_DE_PERFIL,
  photo: MOTIVOS_DE_FOTO,
  publication: MOTIVOS_DE_PUBLICACAO,
};

/** O teto de `detail`, igual ao de `conversation_reports` e da avaliação. */
export const TAMANHO_MAXIMO_DO_RELATO = 1000;

export interface DenunciaValidada {
  readonly motivo: string;
  readonly relato: string | null;
}

/**
 * Valida o corpo de uma denúncia, para qualquer dos três alvos.
 *
 * **Motivo fora da lista do alvo é RECUSADO**, e isso inclui o motivo que
 * existe em OUTRA lista: `nudity_or_sexual` numa denúncia de perfil é recusado
 * do mesmo jeito que uma palavra inventada seria. É deliberado — aceitar o
 * motivo da lista vizinha porque "ele existe em algum lugar" é como as três
 * listas voltariam a ser uma.
 *
 * O `CHECK` do banco recusa igual, e a redundância é a mesma do resto da casa:
 * a validação aqui dá `400` com o nome do campo, e o banco é o que garante que
 * nenhum caminho de escrita futuro contorne a lista.
 */
export function validarDenuncia(
  alvo: AlvoDaDenuncia,
  corpo: unknown,
): { denuncia?: DenunciaValidada; erros: readonly ProblemFieldError[] } {
  const erros: ProblemFieldError[] = [];
  const c = (corpo ?? {}) as Record<string, unknown>;
  const lista = LISTA_POR_ALVO[alvo];

  const motivoCru = c['reason'];
  let motivo: string | undefined;
  if (typeof motivoCru !== 'string' || !lista.includes(motivoCru)) {
    erros.push({ field: 'reason', code: 'required', message: 'Diga o motivo da denúncia.' });
  } else {
    motivo = motivoCru;
  }

  const relatoCru = c['detail'];
  let relato: string | null = null;
  if (relatoCru !== undefined && relatoCru !== null) {
    if (typeof relatoCru !== 'string') {
      erros.push({ field: 'detail', code: 'invalid', message: 'O relato precisa ser texto.' });
    } else {
      // APARADO ANTES DE MEDIR, como na avaliação: mil espaços não são um
      // relato de mil caracteres, e recusá-los pelo tamanho explicaria a coisa
      // errada.
      const aparado = relatoCru.trim();
      if (aparado === '') relato = null;
      else if (aparado.length > TAMANHO_MAXIMO_DO_RELATO) {
        erros.push({
          field: 'detail',
          code: 'too_long',
          message: `O relato vai até ${String(TAMANHO_MAXIMO_DO_RELATO)} caracteres.`,
        });
      } else if (/[<>]/.test(aparado)) {
        erros.push({ field: 'detail', code: 'html_not_allowed', message: 'Escreva sem os sinais < e >.' });
      } else relato = aparado;
    }
  }

  if (erros.length > 0 || motivo === undefined) return { erros };
  return { denuncia: { motivo, relato }, erros: [] };
}
