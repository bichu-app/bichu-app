/**
 * A implementação de `AlcanceDoAlerta` que **não consegue contar**, e diz isso.
 *
 * ## Por que ela existe, em vez de uma consulta
 *
 * O ADR-0006 define quem entra na conta, e os sete critérios dependem de duas
 * coisas que **não existem no esquema hoje**:
 *
 * - a localização do usuário (quantizada em grade de ~100 m, uma linha por
 *   usuário, validade de 30 dias). Não há coluna `geography` em `users` e não há
 *   tabela de localização: `grep -rn "geography" migrations/` acha apenas
 *   `lost_cases.last_seen_point`;
 * - o aparelho com `push_permission = granted` e token válido. Não há tabela de
 *   aparelho nem de token de push em migração nenhuma.
 *
 * Sem as duas, uma consulta escrita hoje devolveria **zero** — e zero é a
 * resposta que o ADR-0006 proíbe de propósito, porque ela é indistinguível de
 * "não há ninguém por perto" e faz desistir quem tinha cem vizinhos ao redor.
 *
 * ## Por que não é um `TODO` no serviço
 *
 * Um comentário no serviço seria apagado pela primeira pessoa que quisesse ver a
 * tela funcionando com um número. Aqui o "não sei" é uma implementação nomeada,
 * ligada em `api.ts` numa linha que a revisão lê, e o dia em que as tabelas
 * existirem é o dia em que esta linha é trocada por `criarAlcancePorPostGIS` —
 * sem tocar no serviço, na rota nem na resposta.
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
