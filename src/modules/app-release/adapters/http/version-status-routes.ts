/**
 * `GET /v1/app/version-status` (`getAppVersionStatus`): o veredito de versao.
 *
 * ====================================================================
 * POR QUE OPERACAO NOVA, E NAO UM CAMPO EM `GET /v1/health`
 * ====================================================================
 *
 * `/health` era o candidato natural: ela e publica, nao pede conta, o
 * aplicativo poderia chama-la na abertura, e ela ja devolve `version` e
 * `build.commit`. Foi recusada por tres medidas, e nao por gosto:
 *
 * 1. **`/health` e a sonda da infraestrutura, e e a UNICA operacao publica
 *    dispensada de teto de chamada.** A dispensa esta escrita no proprio lint
 *    (`PUBLICAS_SEM_LIMITE` em `infra/verificacao/verificar-limite-de-chamada.mjs`)
 *    e o motivo e que limitar a sonda tira o servico de rotacao exatamente sob
 *    carga. Juntar o veredito ali daria ao aplicativo inteiro uma rota sem
 *    teto -- ou, para por teto, obrigaria a tirar a dispensa da sonda. As duas
 *    saidas sao piores que uma rota nova.
 * 2. **A sonda nao tem parametro, e esta operacao precisa de dois
 *    OBRIGATORIOS.** Um parametro obrigatorio novo em `/health` e uma sonda
 *    que passa a responder 400 ao orquestrador. Opcional nao resolve: o
 *    veredito dependeria de a sonda ter sido chamada "do jeito certo", e o
 *    jeito errado seria silencioso.
 * 3. **As duas tem cache e evolucao opostos.** A sonda e `no-store` por
 *    natureza e toca o banco para provar que ele responde; esta aqui le uma
 *    tabela de configuracao e vai mudar de forma junto com o produto. Uma
 *    operacao que serve a infraestrutura e o aplicativo ao mesmo tempo nao
 *    pode ser versionada por nenhum dos dois.
 *
 * ====================================================================
 * O QUE SAI DAQUI, E NADA MAIS (ADR-0010)
 * ====================================================================
 *
 * Dois campos: `verdict` e `store_url`. Nenhum identificador interno, nenhuma
 * contagem, nenhum nome de host, nenhum numero de versao minima. O numero
 * minimo nao sai de proposito -- ele seria o convite para o aplicativo
 * comparar por conta propria, que e o erro que este desenho existe para
 * eliminar (ver `domain/versao.ts`).
 *
 * `select` explicito na persistencia garante que coluna nova na tabela nao
 * comece a sair aqui sozinha.
 *
 * ====================================================================
 * FALHA DE BANCO: 500, E O APLICATIVO LIBERA
 * ====================================================================
 *
 * A leitura nao e embrulhada em `try` que devolva `supported`. Um 200
 * `supported` fabricado sobre um banco fora seria o servidor AFIRMANDO ter
 * consultado a politica quando nao consultou, e e esse tipo de silencio que
 * este repositorio paga caro. Banco fora responde 500, como em toda rota, e o
 * aplicativo trata 500 como "nao consegui perguntar" e deixa usar -- a mesma
 * direcao, dita pela ponta certa. A prova esta em
 * `app/test/atualizacao/portao_de_versao_test.dart`.
 *
 * ====================================================================
 * 400 NAO E BLOQUEIO
 * ====================================================================
 *
 * `platform` e `version` sao validados pelo esquema que vem do CONTRATO,
 * instalado por `validacao-de-parametros.ts` -- nao ha validacao escrita a
 * mao aqui, que seria a segunda definicao do formato. Fora do formato, 400
 * antes do manipulador. O aplicativo trata 400 como "nao consegui perguntar".
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { vereditoPara } from '../../application/veredito-de-versao.js';
import type { LeituraDaPoliticaDeVersao, PlataformaDoApp } from '../../ports/politica-de-versao.js';

export const rotaDoVereditoDeVersao = defineRoute({
  operationId: 'getAppVersionStatus',
  method: 'get',
  path: '/app/version-status',
  // Nenhum efeito fora do processo: e leitura de uma linha de configuracao.
  effects: [],
  // O teto e ALTO de proposito, e o numero tem argumento. Esta rota e chamada
  // uma vez por abertura do aplicativo, e um teto apertado por `ip` recusaria
  // em massa quem esta atras de NAT de operadora -- e o 429 faz o aplicativo
  // LIBERAR o uso, ou seja, um teto baixo desligaria o mecanismo exatamente
  // para a maioria. 600/h por `ip` protege do abuso barato sem chegar perto do
  // trafego legitimo de um bloco de NAT.
  rateLimit: [{ dimension: ['ip'], limit: 600, window: '1h', onExceed: 'deny_429' }],
});

export interface DependenciasDoVereditoDeVersao {
  readonly politica: LeituraDaPoliticaDeVersao;
}

/** A query string, com os tipos do contrato. Validada pelo esquema do contrato. */
interface QueryDaVersao {
  readonly platform?: PlataformaDoApp | undefined;
  readonly version?: string | undefined;
}

export function registrarRotaDoVereditoDeVersao(
  app: RegistradorDeRotas,
  deps: DependenciasDoVereditoDeVersao,
): void {
  registrarRota(
    app,
    rotaDoVereditoDeVersao,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      // `no-store`: a resposta depende de uma tabela que alguem troca a mao,
      // as pressas, para DESTRAVAR a base. Um cache intermediario de 60 s
      // continuaria servindo o bloqueio depois de ele ter sido desligado.
      void reply.header('Cache-Control', 'no-store');

      const query = (request.query ?? {}) as QueryDaVersao;
      // `platform` e `version` sao `required` no contrato, e o esquema recusa a
      // ausencia com 400 antes daqui. Os `??` existem para o tipo, e caem no
      // lado LIBERADO: `politicaDe` nunca recebe plataforma inventada, e
      // `vereditoPara(undefined, ...)` devolve `supported`.
      const plataforma = query.platform;
      if (plataforma === undefined) {
        return reply.status(200).send({ verdict: 'supported', store_url: null });
      }

      const politica = await deps.politica.politicaDe(plataforma);
      const veredito = vereditoPara(query.version, politica);
      return reply
        .status(200)
        .send({ verdict: veredito.verdict, store_url: veredito.storeUrl });
    },
  );
}
