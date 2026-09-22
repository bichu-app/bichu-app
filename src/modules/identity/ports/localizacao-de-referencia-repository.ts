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
 */
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { LocalizacaoDeReferencia } from '../domain/localizacao-de-referencia.js';

export interface LocalizacaoDeReferenciaRepository {
  /**
   * Grava a localização, substituindo a anterior.
   *
   * Uma linha por conta, sempre a última, sem histórico (critério 5). Quem
   * garante isso é a chave primária da tabela, e não este método.
   */
  gravar(dono: UserId, localizacao: LocalizacaoDeReferencia): Promise<void>;

  /**
   * A localização **ainda válida** do dono, ou `null`.
   *
   * `null` cobre os dois casos, e o contrato os junta de propósito: nunca
   * informou, ou informou e venceu. A tela distingue os dois pelo texto que ela
   * já tem (critérios 7 e 8), e não por um terceiro valor de retorno aqui.
   */
  buscarValida(dono: UserId, agora: Instant): Promise<LocalizacaoDeReferencia | null>;

  /** Apaga a linha do dono. Idempotente: apagar o que não existe é sucesso. */
  apagar(dono: UserId): Promise<void>;

  /**
   * Apaga as linhas já vencidas, em qualquer conta. Devolve quantas.
   *
   * Não é o que faz a conta sair do raio — isso `buscarValida` já fez no
   * instante do vencimento. É a retenção do ADR-0010: dado vencido não fica
   * guardado esperando alguém precisar dele.
   */
  expurgarVencidas(agora: Instant): Promise<number>;
}
