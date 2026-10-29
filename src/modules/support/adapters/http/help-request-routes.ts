/**
 * A rota do botao `Ajuda` do menu do usuario (29/10/2026).
 *
 * `effects`, `rateLimit` e `operationId` **espelham** `api/openapi.yaml`, e
 * `rotas-registradas-contra-o-contrato` compara os dois.
 *
 * ## `human_work`, E E A PALAVRA CERTA
 *
 * Dos seis efeitos, este e o unico que cabe: a chamada nao notifica ninguem
 * (`notifies` seria mentira -- **nada e disparado**, por decisao do cliente),
 * nao verifica segredo, nao revela credencial, nao e consulta cara e nao e
 * escrita irreversivel. O que ela faz e **por uma linha numa fila que uma
 * pessoa vai ler**. Declarar `effects: []` aqui seria afirmar que a chamada nao
 * sai do processo, e ela sai: sai pelo tempo de alguem.
 *
 * E `human_work` nao vazio **obriga `rateLimit` por tipo** -- `defineRoute` nao
 * compila sem ele. Essa e a cerca que importa: a fila de um humano e exatamente
 * o recurso que um laco de aplicativo entope de graca.
 *
 * ## `deny_429` E NAO `accept_and_deduplicate`
 *
 * Os contadores de secao aceitam e deduplicam porque trocar de aba e voltar e
 * uso normal, e um 429 ali deixaria um selo aceso mentindo. Aqui e o contrario:
 * mandar a mesma duvida dez vezes **nao e uso normal**, e aceitar em silencio a
 * decima faria o tutor acreditar que mandou dez perguntas e espera dez
 * respostas. Recusar com mensagem e o unico desfecho honesto.
 *
 * ## A ROTA ESTA REGISTRADA, e ha isca cobrando isso
 *
 * `POST /v1/me/conversations-seen` ficou **404 em homologacao** por faltar UMA
 * chamada de `registrarRota`: a rota estava declarada e exportada, o servico
 * existia e o app CHAMAVA -- e nenhum portao pegou, porque
 * `rotas-registradas-contra-o-contrato` compara os `defineRoute` EXPORTADOS com
 * a spec e nunca pergunta se `registrarRota` foi chamada. Por isso
 * `rota-de-ajuda-esta-registrada.test.ts` chama
 * `registrarRotasDeAjuda` -- a funcao de PRODUCAO, a mesma que `src/bin/api.ts`
 * chama -- e manda a requisicao no servidor que saiu dela.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import { recusarCampoDesconhecido } from '../../../../shared/http/corpo-fechado.js';
import { problemas } from '../../../../shared/http/errors.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type {
  ChamadorDaAjuda,
  DuvidaDeAjudaService,
} from '../../application/duvida-de-ajuda-service.js';

export const rotaDeDuvidaDeAjuda = defineRoute({
  operationId: 'createMyHelpRequest',
  method: 'post',
  path: '/me/help-requests',
  effects: ['human_work'],
  rateLimit: [{ dimension: ['account'], limit: 10, window: '24h', onExceed: 'deny_429' }],
});

export interface AutenticadorDaAjuda {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDeAjuda {
  readonly duvidas: DuvidaDeAjudaService;
  readonly autenticador: AutenticadorDaAjuda;
  readonly contrato: Contrato;
}

/**
 * MEMOIZADA por requisicao, como nas rotas dos contadores: o teto por `account`
 * precisa do dono ANTES do handler, e o handler precisa do mesmo dono. Sem o
 * memo, cada requisicao resolveria o token duas vezes.
 */
function chamadorAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeAjuda,
): Promise<ChamadorDaAjuda> {
  return memoDaRequisicao(request, 'ajuda:chamador', async () => {
    const cabecalho = request.headers.authorization;
    if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
      throw problemas.naoAutenticado();
    }
    const token = cabecalho.slice('Bearer '.length).trim();
    if (token === '') throw problemas.naoAutenticado();
    const { userId } = await deps.autenticador.autenticar(token);
    return { userId };
  });
}

async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeAjuda,
): Promise<string | undefined> {
  try {
    return (await chamadorAutenticado(request, deps)).userId;
  } catch {
    return undefined;
  }
}

interface CorpoDaDuvida {
  subject: string;
  body: string;
}

export function registrarRotasDeAjuda(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDeAjuda,
): void {
  registrarRota(
    app,
    rotaDeDuvidaDeAjuda,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeDuvidaDeAjuda.operationId) },
      // `additionalProperties: false` NO CONTRATO NAO FECHA O CORPO EM
      // EXECUCAO: o Ajv do Fastify roda com `removeAdditional: true` e **apaga**
      // o campo desconhecido em silencio em vez de recusar.
      //
      // Aqui a conta disso e especifica e vale escrita. Quem mandar `assunto`
      // em vez de `subject` recebe 400 por campo obrigatorio ausente, que e o
      // desfecho certo. Mas quem mandar um `email` ou um `telefone` A MAIS --
      // e esse e o campo que alguem tentara acrescentar num formulario de
      // suporte -- receberia **202 com o contato apagado**, e sairia da tela
      // acreditando ter deixado um jeito de ser respondido.
      preValidation: [
        recusarCampoDesconhecido(
          corpoDe(deps.contrato, rotaDeDuvidaDeAjuda.operationId),
          rotaDeDuvidaDeAjuda.operationId,
        ),
      ],
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const corpo = request.body as CorpoDaDuvida;
      // `subject` e `body` chegam validados pelo contrato (`minLength`,
      // `maxLength`); o servico apara e confere de novo SOBRE O APARADO, que e
      // o que o banco vai ver. Ver o cabecalho dele.
      await deps.duvidas.registrar(chamador, corpo.subject, corpo.body);
      // 202 e nao 201: o que foi aceito e um pedido de atencao humana, e nao um
      // recurso que o chamador va buscar depois -- nao existe `GET` desta
      // duvida para o tutor. O corpo e o mesmo `Accepted` das denuncias.
      return reply.status(202).send({ status: 'accepted' });
    },
  );
}
