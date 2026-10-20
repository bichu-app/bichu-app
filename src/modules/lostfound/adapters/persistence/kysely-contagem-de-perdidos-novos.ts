/**
 * A contagem de perdidos novos (BICHUS-278), **sobre o construtor da propria
 * listagem**.
 *
 * `construtorDaListagemPublicaDePerdidos` e exportado com um motivo escrito no
 * cabecalho dele: *"a contagem do `total` tem de usar EXATAMENTE os mesmos
 * predicados da pagina. Dois construtores separados divergiriam no dia em que
 * alguem mexesse em um so"*. Aqui o risco e o mesmo com consequencia pior --
 * um selo que conta recorte diferente do que a aba abre manda a pessoa para uma
 * lista onde nada mudou, e o numero zera. Reusando o construtor, a divergencia
 * e inexprimivel: os quatro predicados de publicacao, o `conta_habilitada` e a
 * cidade normalizada sao os MESMOS objetos de codigo.
 *
 * **O `JOIN` que a contagem nao precisaria e pago de proposito.** O de `pets`
 * nao e cosmetico (dois dos quatro predicados sao sobre `pets`), e os tres
 * `leftJoin` restantes nao mudam a cardinalidade -- `pet_photos` tem indice
 * unico de principal e os dois `ref_*` sao por chave. Contar certo e mais
 * importante que contar barato.
 *
 * **O campo do recorte de tempo e `last_seen_at`**, que e o campo da ORDEM da
 * listagem (`last_seen_at DESC`) e o que a tela mostra. `opened_at` faria
 * "novo" significar coisa diferente do primeiro item da lista.
 *
 * ## INDICE: nenhum novo, e a ausencia e medida
 *
 * Os dois indices parciais que a listagem ja tem servem esta contagem, e no
 * mesmo predicado de publicacao do construtor:
 *
 *   `lost_cases_publicos_por_cidade_e_visto` (`20261019000003`)
 *     (texto_para_busca(last_seen_city), last_seen_at DESC, share_token)
 *   `lost_cases_publicos_por_visto` (`20261019000008`)
 *     (last_seen_at DESC, share_token)
 *
 * COM cidade e igualdade na primeira coluna + faixa na segunda, que e a forma
 * do primeiro. SEM cidade e faixa na primeira coluna do segundo. **E a faixa e
 * ESTREITA**, diferente da contagem da propria listagem: `last_seen_at >
 * marcador` recorta no instante da ultima visita, e nao na tabela inteira --
 * por isso esta contagem e mais barata que o `total` que a lista ja paga
 * (medido na `20261019000008`: `Seq Scan`, 60 751 buffers, 54,4 ms em 20 000
 * linhas, por nao ter predicado de tempo nenhum).
 */
import type { Db } from '../../../../shared/db/pool.js';
import { comoData } from '../../../../shared/time/clock.js';
import type {
  ContagemDePerdidosNovos,
  RecorteDePerdidosNovos,
} from '../../ports/contagem-de-perdidos-novos.js';
import { construtorDaListagemPublicaDePerdidos } from './kysely-listagem-publica-de-perdidos.js';

export function criarContagemDePerdidosNovos(db: Db): ContagemDePerdidosNovos {
  return {
    async contar(recorte: RecorteDePerdidosNovos): Promise<number> {
      // `janela: undefined` e JANELA ABERTA, que e como a aba abre desde
      // 18/10/2026. O recorte de tempo desta contagem e o MARCADOR; somar a
      // janela de 30 dias aqui esconderia do selo o caso que a lista mostra.
      // `conjunto: 'aberto'` e PRESERVACAO de comportamento, e nao escolha
      // nova. Este contador nasceu quando
      // `construtorDaListagemPublicaDePerdidos` carregava
      // `lost_cases.status = 'open'` fixo; a frente do selo de reencontro
      // tornou o conjunto um campo OBRIGATORIO da porta, e `tsc` acusou este
      // chamador -- nenhum portao acusaria. `'aberto'` reproduz, letra por
      // letra, o que esta contagem media antes da uniao.
      //
      // **E `padrao` seria defeito visivel, nao so mudanca.** O padrao e a
      // UNIAO (aberto + reencontrado na janela de 30 dias), e o selo desta aba
      // diz *"entraram casos novos de pet perdido"*. Um caso reencontrado tem
      // `last_seen_at` ANTERIOR ao fecho, entao ele passa o marcador de quem
      // nao olha a aba ha alguns dias e entraria na contagem: o distintivo
      // diria "3 novos" com um animal que ja esta na sala do dono dentro do
      // numero. E o desfecho que a Emenda 4 do ADR-0010 nomeia -- *"alguem
      // sairia de casa atras de um animal que esta na sala do dono"* -- e ele
      // nao pode entrar por um `??` de mescla.
      let consulta = construtorDaListagemPublicaDePerdidos(db, {
        conjunto: 'aberto',
        agora: comoData(recorte.agora),
        pagina: 1,
        limite: 1,
        ...(recorte.cidade === undefined ? {} : { cidade: recorte.cidade }),
      });
      if (recorte.desde !== undefined) {
        consulta = consulta.where(
          'lost_cases.last_seen_at',
          '>',
          comoData(recorte.desde),
        );
      }
      const linha = await consulta
        .select((eb) => eb.fn.countAll<string>().as('total'))
        .executeTakeFirst();
      return Number(linha?.total ?? 0);
    },
  };
}
