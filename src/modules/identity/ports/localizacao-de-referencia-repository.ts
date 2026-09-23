/**
 * Persistência da localização de referência do tutor.
 *
 * **Todo método que toca a localização de alguém exige o dono como argumento**,
 * e isso não é ergonomia: é o ADR-0021 escrito no tipo. A autorização mora na
 * cláusula `WHERE`, então a consulta que devolveria a localização de outra
 * conta não existe do outro lado desta porta — não porque alguém se lembrou de
 * conferir, mas porque ela não tem como ser escrita a partir desta assinatura.
 *
 * `buscarValida` recebe o instante em vez de perguntá-lo ao relógio pelo mesmo
 * motivo: a validade de 30 dias é regra de negócio, e regra de negócio que lê
 * relógio de parede dentro do adaptador não tem como ser testada sem esperar
 * trinta dias.
 *
 * ## SEC-021: todo método recebe também a SESSÃO DE APARELHO
 *
 * A localização deixou de ser da pessoa e passou a ser do aparelho (decisão do
 * cliente em 23/09/2026). O aparelho é identificado pela família de refresh —
 * o `sid` do ADR-0002, emenda 1 —, e ela entra em todos os `WHERE` ao lado do
 * dono pela mesma razão que o dono entra: a consulta que alcançaria a
 * localização de outro aparelho não existe do outro lado desta porta.
 */
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { LocalizacaoDeReferencia } from '../domain/localizacao-de-referencia.js';

/**
 * A família de refresh que identifica a sessão de um aparelho.
 *
 * Tipo próprio e não `string` solta para que trocar a ordem dos dois argumentos
 * de `gravar` não compile — dono e família são ambos UUID em texto, e o
 * compilador é a única coisa que distingue um do outro na chamada.
 */
export type FamiliaDeSessao = string & { readonly __familiaDeSessao: unique symbol };

/** Converte o `sid` do token, ou o `family_id` do refresh, no tipo da porta. */
export function comoFamiliaDeSessao(valor: string): FamiliaDeSessao {
  return valor as FamiliaDeSessao;
}

export interface LocalizacaoDeReferenciaRepository {
  /**
   * Grava a localização, substituindo a anterior.
   *
   * Uma linha por conta, sempre a última, sem histórico (critério 5). Quem
   * garante isso é a chave primária da tabela, e não este método.
   */
  gravar(
    dono: UserId,
    familia: FamiliaDeSessao,
    localizacao: LocalizacaoDeReferencia,
  ): Promise<void>;

  /**
   * A localização **ainda válida deste aparelho**, ou `null`.
   *
   * `null` cobre os dois casos, e o contrato os junta de propósito: nunca
   * informou, ou informou e venceu. A tela distingue os dois pelo texto que ela
   * já tem (critérios 7 e 8), e não por um terceiro valor de retorno aqui.
   */
  buscarValida(
    dono: UserId,
    familia: FamiliaDeSessao,
    agora: Instant,
  ): Promise<LocalizacaoDeReferencia | null>;

  /**
   * Apaga a linha **deste aparelho**. Devolve quantas linhas saíram.
   *
   * Idempotente: apagar o que não existe é sucesso, e responde `0`.
   *
   * A contagem existe para o logout: ela é o que a trilha registra em
   * `locations_removed`, e é o que distingue "o aparelho não tinha localização"
   * de "o apagamento não rodou". Sem ela, os dois casos são o mesmo silêncio.
   *
   * **Os outros aparelhos da mesma conta não são tocados**, e é isso que
   * separa `sair` de `sair de todos os aparelhos` (ADR-0002, emenda 1).
   */
  apagar(dono: UserId, familia: FamiliaDeSessao): Promise<number>;

  /**
   * Apaga as linhas já vencidas, em qualquer conta. Devolve quantas.
   *
   * Não é o que faz a conta sair do raio — isso `buscarValida` já fez no
   * instante do vencimento. É a retenção do ADR-0010: dado vencido não fica
   * guardado esperando alguém precisar dele.
   */
  expurgarVencidas(agora: Instant): Promise<number>;
}
