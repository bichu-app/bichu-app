/**
 * A implementação de [LeitorDeConexao] — **a porta que os outros módulos usam**.
 *
 * ## Por que ela existe, e por que aqui
 *
 * `ports/conexao.ts` declarava três métodos e **não tinha implementação
 * nenhuma** até 19/10/2026: a fatia F entregou a tabela, o domínio, o
 * repositório e as cinco rotas, e deixou a porta pública declarada para quem
 * precisasse dela. Quem precisou foi a fatia G (o perfil de outra pessoa).
 *
 * Ela mora em `application/` e não em `adapters/persistence/` porque o que ela
 * acrescenta ao repositório é **projeção de domínio**, não SQL: `estadoNoApp`
 * decide, a partir de `expires_at` e de quem pediu, qual dos três estados do
 * app uma linha guardada vale — e essa regra é do domínio desta fatia e não
 * atravessa porta nenhuma. Um módulo de fora que lesse `arestaDoPar` teria de
 * importar `domain/conexao.ts` para interpretar o que recebeu, que é exatamente
 * o que a fronteira da arquitetura proíbe.
 *
 * ## O que ela NÃO deixa escapar
 *
 * `ConnectionsRepository` tem `pedir`, `aceitar`, `encerrar` e
 * `desfazerPorBloqueio`. **Nada disso atravessa esta porta**: quem recebe um
 * `LeitorDeConexao` recebe três leituras e nenhuma escrita, e não há como
 * alcançar o repositório a partir do que é devolvido. É o mesmo motivo pelo
 * qual a tela da vitrine recebe a leitura e não a `VitrineApi` inteira.
 */
import { estadoNoApp } from '../domain/conexao.js';
import type { EstadoNoApp } from '../domain/conexao.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { ArestaVivaDoPar, LeitorDeConexao } from '../ports/conexao.js';
import type { ConnectionsRepository } from '../ports/connections-repository.js';

export function criarLeitorDeConexao(repositorio: ConnectionsRepository): LeitorDeConexao {
  return {
    estaConectado: (um: UserId, outro: UserId): Promise<boolean> =>
      repositorio.estaConectado(um, outro),

    contarConexoes: (pessoa: UserId): Promise<number> => repositorio.contarConexoes(pessoa),

    async arestaVivaEntre(
      quemOlha: UserId,
      outro: UserId,
      agora: Instant,
    ): Promise<ArestaVivaDoPar | undefined> {
      // A MESMA conta não tem aresta consigo, e perguntar criaria um estado que
      // o contrato não tem: `connection_state` de si mesmo é `none`. Sem este
      // atalho a consulta rodaria procurando uma linha que o `CHECK`
      // `user_connections_nao_e_consigo` já torna impossível de existir — ou
      // seja, trabalho garantidamente vazio.
      if (quemOlha === outro) return undefined;

      const aresta = await repositorio.arestaDoPar(quemOlha, outro, agora);
      if (aresta === undefined) return undefined;

      // `undefined` aqui é aresta que NÃO se projeta: pendente expirado e
      // recusa dentro do descanso. Os dois viram `none` para quem chama, e a
      // fusão é a mesma do 204 de `endConnection`.
      const estado = estadoNoApp(aresta, agora);
      if (estado === undefined) return undefined;

      return { estado, ref: aresta.ref };
    },

    /**
     * **O estado por apelido, para a página inteira da busca** (22/10/2026).
     *
     * Ele projeta com a MESMA `estadoNoApp` de [arestaVivaEntre], e isto é o
     * mecanismo e não arrumação: é por haver **uma** definição da projeção que a
     * recusa continua silenciosa nos dois lugares. Uma versão escrita em SQL
     * para a lista deixaria `declined` sair cru no dia em que alguém a tocasse,
     * e o *"ela recusou você"* voltaria pela borda mais fácil de chegar.
     *
     * **Apelido sem aresta que se projete não entra no mapa**, e os três motivos
     * vêm fundidos de `estadoNoApp`: nunca houve nada, o pendente expirou, e a
     * recusa está em descanso. Quem lê o mapa vê ausência, que é o `none` do
     * contrato — e a ausência não distingue os três.
     */
    async estadosPorApelido(
      quemOlha: UserId,
      apelidos: readonly string[],
      agora: Instant,
    ): Promise<ReadonlyMap<string, EstadoNoApp>> {
      // **Lista vazia nao consulta.** A pagina de busca que nao casou ninguem e
      // o caso comum, e uma consulta `IN ()` para zero apelidos e trabalho
      // garantidamente vazio -- o mesmo atalho de `arestaVivaEntre` com a
      // propria conta.
      if (apelidos.length === 0) return new Map<string, EstadoNoApp>();

      const arestas = await repositorio.arestasPorApelido(quemOlha, apelidos, agora);
      const mapa = new Map<string, EstadoNoApp>();
      for (const { apelido, aresta } of arestas) {
        const estado = estadoNoApp(aresta, agora);
        if (estado === undefined) continue;
        mapa.set(apelido, estado);
      }
      return mapa;
    },
  };
}
