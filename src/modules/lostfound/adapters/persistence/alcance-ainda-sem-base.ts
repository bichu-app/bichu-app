/**
 * A implementação de `AlcanceDoAlerta` que **não consegue contar**, e diz isso.
 *
 * ## Por que ela existe, em vez de uma consulta
 *
 * O ADR-0006 define quem entra na conta, e são **sete** critérios.
 *
 * Dois deles passaram a existir no esquema e **não são mais o motivo** deste
 * arquivo: a localização do usuário chegou com a BICHUS-92
 * (`user_reference_locations`, `geography(Point,4326)` com índice GiST) e o
 * aparelho com `push_permission = granted` e token chegou com a BICHUS-91
 * (`user_devices`, e o predicado em
 * `modules/notifications/domain/aparelho.ts`). A consulta passou a ser
 * **possível**, e é isso que muda em relação ao que este cabeçalho dizia antes.
 *
 * O que continua sem consulta escrita são os outros cinco: raio de 5 km,
 * validade de 30 dias da localização, não ser o próprio tutor do caso, teto de
 * fadiga de 3 alertas em 24 h e um disparo por caso por dia. Uma implementação
 * que ligasse só os dois primeiros devolveria um número que ignora os cinco
 * restantes — errado com cara de certo, que é a mesma classe de mentira que o
 * zero. **Quem fecha a conta é a BICHUS-20**, com os sete.
 *
 * Enquanto isso, `null` continua sendo a resposta honesta, e a prévia responde
 * `reach_status: unavailable`.
 *
 * ## Por que não é um `TODO` no serviço
 *
 * Um comentário no serviço seria apagado pela primeira pessoa que quisesse ver a
 * tela funcionando com um número. Aqui o "não sei" é uma implementação nomeada,
 * ligada em `api.ts` numa linha que a revisão lê, e o dia em que os SETE
 * critérios tiverem consulta é o dia em que esta linha é trocada por
 * `criarAlcancePorPostGIS` — sem tocar no serviço, na rota nem na resposta.
 *
 * Trocar esta implementação por uma que devolva `0` faz reprovar
 * `previa-do-alcance.test.ts` e `lost-case-preview-routes.test.ts`, que é o
 * ponto.
 */
import type { AlcanceDoAlerta } from '../../ports/alcance-do-alerta.js';

export function criarAlcanceAindaSemBase(): AlcanceDoAlerta {
  return {
    // Não é assíncrona de verdade, e a assinatura é assíncrona porque a porta é:
    // a implementação por PostGIS vai ao banco, e mudar a forma da porta no dia
    // da troca faria a substituição tocar em quem consome.
    contarAlcancaveis: () => Promise.resolve(null),
  };
}
