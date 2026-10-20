/**
 * A rota do **perfil de outra pessoa** (fatia G): `GET /people/{handle}`.
 *
 * ## Uma operação, e a ausência das outras é o desenho
 *
 * Não existe `GET /people`, não existe `/people/search`, não existe
 * `/people/{handle}/pets`, não existe `/people/{handle}/showcase` e não existe
 * rota de "este apelido está livre?" (plano 4-C.5). **A única coisa que esta
 * etiqueta sabe fazer é ler UM perfil, por um apelido que quem chama já tem na
 * mão.** Coleção de pessoas é enumeração, e é o dano que o desenho desta frente
 * recusa por escrito.
 *
 * ## Por que a etiqueta é `people` e não `connections`
 *
 * Porque `conexao-nao-expoe-lista-nem-identificador.test.ts` cobra que
 * `connections` tenha **exatamente cinco** operações, e cobra com razão: é esse
 * número que impede uma sexta operação de conexão entrar sem alguém ver. Pôr
 * esta aqui faria um portão certo reprovar o desenho certo, e a saída é
 * etiqueta própria — não afrouxar o número.
 *
 * ## O que este arquivo NÃO decide
 *
 * **Quem pode ver o quê é decidido na cláusula `WHERE`** (ADR-0021), em
 * `kysely-perfil-de-pessoa.ts`: não há um `if` nesta borda que escolha entre 404
 * e 403, e não há caminho que produza 403. Apelido inexistente, apelido
 * reservado, apelido de pet, conta desabilitada de qualquer lado, par bloqueado
 * e perfil denunciado por quem chama são o **mesmo 404**.
 *
 * O recorte por estado da conexão também não é desta borda: ela projeta o que o
 * caso de uso devolveu. `showcase` é omitido quando o caso de uso devolve
 * `undefined`, e **isso não é um `if` de autorização** — é a diferença entre
 * "não posso te mostrar" e "ela não tem foto", que a borda precisa saber para
 * não escrever `[]` no lugar de nada.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { problemas } from '../../../../shared/http/errors.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import type { AbsoluteUrl, UserId } from '../../../../shared/types/brands.js';
import type { PerfilDePessoa, PerfilDePessoaProjetado } from '../../application/perfil-de-pessoa.js';
import type { FotoDoPerfilDeOutraPessoa } from '../../ports/perfil-de-pessoa-repository.js';

/**
 * O teto é o do contrato, COPIADO de lá.
 *
 * **600 por hora por conta, e o número é o freio de varredura.** Não há busca de
 * pessoas e não há rota de disponibilidade de apelido, mas um apelido é curto e
 * alguém pode tentar adivinhá-los em série; com este teto, varrer custa. É o
 * mesmo teto das outras leituras de conexão, e não um número inventado aqui.
 */
export const rotaDoPerfilDePessoa = defineRoute({
  operationId: 'getPersonProfile',
  method: 'get',
  path: '/people/:handle',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 600, window: '1h', onExceed: 'deny_429' }],
});

/** Perfil é dado de duas pessoas (a relação entra nele): nada em cache compartilhado. */
const SEM_CACHE = 'private, no-store';

export interface Autenticador {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDePessoa {
  readonly perfis: PerfilDePessoa;
  readonly autenticador: Autenticador;
  /** O domínio das derivadas públicas. A URL é montada aqui, nunca gravada. */
  readonly baseDeMidia: AbsoluteUrl;
}

interface CaminhoDoPerfil {
  readonly handle: string;
}

function tokenDoCabecalho(request: FastifyRequest): string {
  const cabecalho = request.headers.authorization;
  const prefixo = 'Bearer ';
  if (cabecalho === undefined || !cabecalho.startsWith(prefixo)) throw problemas.naoAutenticado();
  return cabecalho.slice(prefixo.length);
}

/**
 * Quem chama, **resolvido UMA vez por requisição**.
 *
 * `memoDaRequisicao` não é economia de estilo: esta rota pede a conta **duas**
 * vezes — o resolvedor do teto por `account` precisa dela antes do manipulador,
 * e o manipulador precisa dela para a leitura. Sem a memória, cada leitura de
 * perfil validaria o token duas vezes, e o teto é de 600 por hora por conta.
 * É a mesma forma que `showcase-routes.ts` usa, pelo mesmo motivo.
 */
async function chamador(
  request: FastifyRequest,
  deps: DependenciasDasRotasDePessoa,
): Promise<UserId> {
  return memoDaRequisicao(request, 'people:chamador', async () => {
    const { userId } = await deps.autenticador.autenticar(tokenDoCabecalho(request));
    return userId;
  });
}

/**
 * Uma foto da vitrine como `PersonShowcasePhoto` a declara: **três campos**.
 *
 * A URL é montada aqui, na leitura, a partir do domínio de mídia. O banco guarda
 * só a chave (§11.1 proibição 9): gravar URL absoluta amarraria cada linha ao
 * provedor do dia em que ela foi escrita.
 *
 * Nenhum `status`, nenhum `rejection_reason`, nenhum `position` e nenhum
 * `upload_id` — e não é omissão a preencher depois: os dois primeiros são estado
 * de moderação da vitrine do dono, e os dois últimos são de edição, que só o
 * dono faz. O tipo que chega aqui também não os tem.
 */
function comoRespostaDaFoto(
  foto: FotoDoPerfilDeOutraPessoa,
  baseDeMidia: AbsoluteUrl,
): Record<string, unknown> {
  const base = baseDeMidia.replace(/\/$/, '');
  return {
    grid_url: `${base}/${foto.gradeKey}`,
    open_url: `${base}/${foto.abertaKey}`,
    alt_text: foto.altText,
  };
}

/**
 * O perfil como `PersonProfile` o declara.
 *
 * **`showcase` é a única chave condicional, e ela é OMITIDA e não `[]`.** Lista
 * vazia afirmaria "ela não tem foto", que é uma afirmação sobre a vitrine de
 * alguém que quem chama não pode ver; conexão **com** vitrine vazia manda `[]`,
 * e a tela distingue as duas pelo `connection_state` e não pelo tamanho.
 *
 * Nenhum campo de pet, nenhum campo de endereço, nenhum UUID e nenhuma
 * contagem de seguidor: o que não está escrito aqui não tem como sair, porque
 * `PerfilDePessoaProjetado` não carrega nada além disto.
 *
 * **Exportada para a isca**, como os `construtorDe...` da persistência: nenhum
 * portão deste repositório confere o CORPO da resposta, então a única forma de
 * medir a forma do corpo em suíte é chamar a projeção. A isca (b) e a isca (c)
 * leem o conjunto de chaves que esta função produz.
 */
export function comoResposta(
  perfil: PerfilDePessoaProjetado,
  baseDeMidia: AbsoluteUrl,
): Record<string, unknown> {
  return {
    handle: perfil.handle,
    public_ref: perfil.publicRef,
    display_name: perfil.displayName,
    pets_count: perfil.petsCount,
    connections_count: perfil.connectionsCount,
    connection_state: perfil.connectionState,
    connection_ref: perfil.connectionRef,
    ...(perfil.vitrine === undefined
      ? {}
      : { showcase: perfil.vitrine.map((foto) => comoRespostaDaFoto(foto, baseDeMidia)) }),
  };
}

export function registrarRotasDePessoa(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDePessoa,
): void {
  registrarRota(
    app,
    rotaDoPerfilDePessoa,
    {
      resolvedores: {
        account: async (request: FastifyRequest) => chamador(request, deps),
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { handle } = (request.params ?? {}) as CaminhoDoPerfil;
      const perfil = await deps.perfis.porApelido(await chamador(request, deps), handle);
      return reply
        .status(200)
        .header('Cache-Control', SEM_CACHE)
        .send(comoResposta(perfil, deps.baseDeMidia));
    },
  );
}
