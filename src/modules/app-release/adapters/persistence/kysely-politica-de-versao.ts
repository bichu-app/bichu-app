/**
 * Leitura da politica de versao, por chave primaria.
 *
 * ## NAO HA CACHE EM PROCESSO, E A AUSENCIA E A DECISAO
 *
 * A tentacao e obvia: a rota e chamada na abertura do aplicativo, sem conta, e
 * um cache de 30 segundos derrubaria a leitura a duas por minuto por
 * instancia. Ela foi recusada, por duas medidas:
 *
 * 1. **O cache atrasaria exatamente a operacao que nao pode atrasar.** O gesto
 *    mais importante deste mecanismo e DESLIGAR o bloqueio depois de alguem
 *    publicar um numero errado -- e com cache de 30 s a base continuaria
 *    trancada por mais 30 s depois do `UPDATE`, com a pessoa que digitou o
 *    comando vendo o app bloqueado e sem saber se consertou. Nenhuma economia
 *    de leitura paga isso.
 * 2. **A leitura e de duas linhas por chave primaria.** `app_version_policy`
 *    tem exatamente uma linha por plataforma (ver a migracao
 *    `20261019000007`), a tabela nunca cresce, e a pagina dela vive no
 *    `shared_buffers` do Postgres. Esta consulta e mais barata que o aperto de
 *    mao TLS que trouxe a requisicao.
 *
 * Quem for acrescentar cache aqui depois: o preco esta no item 1, e ele e o
 * desenho inteiro, nao um detalhe.
 *
 * `select` explicito, e nao `selectAll()`: `updated_by` e texto livre escrito
 * por quem opera o deploy, e esta rota responde SEM CONTA. Uma coluna nova na
 * tabela nao pode passar a sair em resposta publica por `selectAll()` ter sido
 * mais curto de escrever.
 */
import type { Db } from '../../../../shared/db/pool.js';
import type {
  LeituraDaPoliticaDeVersao,
  PlataformaDoApp,
  PoliticaDeVersao,
} from '../../ports/politica-de-versao.js';

export function criarLeituraDaPoliticaDeVersao(db: Db): LeituraDaPoliticaDeVersao {
  return {
    async politicaDe(plataforma: PlataformaDoApp): Promise<PoliticaDeVersao | undefined> {
      const linha = await db
        .selectFrom('app_version_policy')
        .select(['minimum_version', 'recommended_version', 'store_url'])
        .where('platform', '=', plataforma)
        .executeTakeFirst();
      if (linha === undefined) return undefined;
      return {
        minimumVersion: linha.minimum_version,
        recommendedVersion: linha.recommended_version,
        storeUrl: linha.store_url,
      };
    },
  };
}
