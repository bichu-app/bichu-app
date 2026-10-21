/**
 * As rotas do **perfil de outra pessoa**: `GET /people/{handle}` (fatia G,
 * 19/10/2026) e `POST /connection-invites/resolution` (20/10/2026).
 *
 * ## O perfil tem DOIS endereços desde 20/10/2026, e um destino só
 *
 * O cliente pediu três caminhos de conexão com **um destino**: *"a página do
 * perfil do usuário com o botão de adicionar"*. Duas rotas chegam a ela, e as
 * duas devolvem a **mesma** `PersonProfile`, pela **mesma** projeção
 * (`comoResposta`):
 *
 * | Rota | Endereço | Vem de |
 * |---|---|---|
 * | `GET /people/{handle}` | o apelido | a busca, ou um apelido que alguém tinha na mão |
 * | `POST /connection-invites/resolution` | o token do convite | o link do WhatsApp, ou o QR |
 *
 * **Uma projeção só é o ponto, e não uma economia.** Duas versões do perfil
 * divergiriam no primeiro campo que alguém acrescentasse a uma delas, e o
 * recorte da emenda 2 do ADR-0010 passaria a ter duas implementações — uma das
 * quais ninguém estaria olhando.
 *
 * ## O que esta etiqueta NÃO tem, e o que ela PASSOU a ter
 *
 * **Passou a ter busca**: `GET /people` existe desde 20/10/2026, por decisão do
 * cliente, e mora em `people-search-routes.ts` com os freios dele (piso de três
 * caracteres, teto por conta, campo vazio não lista ninguém). Até essa data este
 * cabeçalho afirmava que ela não existia, e a frase foi corrigida em vez de
 * deixada contradizendo o código ao lado.
 *
 * **Continua sem**: `/people/{handle}/pets`, `/people/{handle}/showcase` e rota
 * de "este apelido está livre?" (plano 4-C.5) — esta última porque
 * disponibilidade de apelido é superfície de enumeração **sem** nenhum dos
 * freios da busca, e o cliente não a pediu.
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
import { recusarCampoDesconhecido } from '../../../../shared/http/corpo-fechado.js';
import type { Contrato } from '../../../../shared/http/contract.js';
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

/**
 * **A tela de destino do link de convite e do QR**: o perfil de quem emitiu,
 * endereçado pelo **token** em vez do apelido.
 *
 * > *"ao clicar vai para a página do perfil do usuário com o botão de
 * > adicionar"*
 *
 * ## `POST` com o token no corpo, e NÃO `GET /connection-invites/{token}`
 *
 * O reflexo é um `GET` com o token no caminho, e ele está errado por uma razão
 * medida e não estética: **token em caminho de URL vai para o log de acesso**,
 * para o histórico do aparelho, para o cabeçalho `Referer` da próxima navegação
 * e para qualquer intermediário que registre a linha de requisição. O convite é
 * um segredo ao portador — quem o tem alcança o perfil de quem o emitiu —, e um
 * segredo em URL é um segredo publicado em cinco lugares que ninguém lembra de
 * limpar.
 *
 * É a mesma razão pela qual `listDirectoryEntries` **não** recebe coordenada na
 * requisição (*"coordenada em URL vai para log de acesso, para o histórico do
 * aparelho e para o cabeçalho `Referer`"*).
 *
 * **`POST` que não escreve, e isso é correto:** resolver é leitura, responde
 * **200** e `effects` é vazio. O método é `POST` pelo corpo, não pela semântica.
 *
 * ## Por que ela mora em `people` e não em `connections`
 *
 * A resposta é `PersonProfile`, e perfil é deste módulo. `people` já importa
 * `connections/ports/` pela porta — o caminho que a regra de fronteira oferece —,
 * enquanto o contrário faria `connections` importar `people/adapters/`, que a
 * regra proíbe. O efeito prático é o que importa: a tela do link recebe a
 * **mesma** `PersonProfile` de `getPersonProfile`, pela mesma projeção, em vez
 * de uma segunda versão dela que divergiria no primeiro campo novo.
 *
 * ## Os tetos, e por que o segundo conta só o inválido
 *
 * **`appliesTo: 'invalid_attempts'`** no segundo: o token tem 256 bits e não é
 * adivinhável, mas um teto que contasse toda resolução puniria quem abre o mesmo
 * link duas vezes. Contar só a tentativa **inválida** encarece tentar tokens ao
 * acaso sem atrapalhar quem tem um válido — e o critério 8 da BICHUS-178 existe
 * para impedir que a tentativa válida consuma esse contador.
 */
export const rotaDaResolucaoDeConvite = defineRoute({
  operationId: 'resolveConnectionInvite',
  method: 'post',
  path: '/connection-invites/resolution',
  effects: [],
  rateLimit: [
    { dimension: ['account'], limit: 120, window: '1h', onExceed: 'deny_429' },
    {
      dimension: ['account'],
      appliesTo: 'invalid_attempts',
      limit: 20,
      window: '1h',
      onExceed: 'deny_429',
    },
  ],
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
  /** O contrato, para o esquema do corpo de `resolveConnectionInvite`. */
  readonly contrato: Contrato;
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
    // O SELO DE VALIDADO (emenda do ADR-0010, 21/10/2026). Fora do bloco
    // condicional da vitrine de propósito: ele sai nos QUATRO estados de
    // conexão, porque é atributo da conta e não conteúdo que ela publicou para
    // quem aceitou.
    contact_channel_verified: perfil.canalVerificado,
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

  /**
   * **A tela de destino do link e do QR.** Resolve o token no perfil de quem
   * emitiu, e a resposta é a **mesma** `PersonProfile` da rota acima.
   *
   * O guarda de corpo fechado não é opcional: o Fastify monta o Ajv com
   * `removeAdditional: true`, então `additionalProperties: false` no contrato
   * **apaga** o campo desconhecido em silêncio em vez de recusar. Aqui isso
   * seria caro: quem mandasse `{ handle: "maria" }` receberia uma recusa
   * genérica e concluiria que resolver convite aceita apelido — que é outra
   * operação, com outro teto e outra procedência (`origin`).
   *
   * **Um 404 só**, e ele funde o convite que não resolve (inexistente, vencido,
   * revogado, de dono sem apelido, de quem bloqueou quem chama) com o perfil que
   * não resolve (os seis predicados de `perfilPorApelido`). Distinguir "o
   * convite morreu" de "a pessoa não está disponível para você" diria a quem foi
   * bloqueado que o link que ele guardou um dia foi válido — que é o aviso de
   * bloqueio que o desenho não dá.
   */
  const corpoDaResolucao = corpoDe(deps.contrato, rotaDaResolucaoDeConvite.operationId);
  registrarRota(
    app,
    rotaDaResolucaoDeConvite,
    {
      schema: { body: corpoDaResolucao },
      resolvedores: {
        account: async (request: FastifyRequest) => chamador(request, deps),
      },
      preValidation: [
        recusarCampoDesconhecido(corpoDaResolucao, rotaDaResolucaoDeConvite.operationId),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { invite_token: token } = request.body as { readonly invite_token: string };
      const perfil = await deps.perfis.porConvite(await chamador(request, deps), token);
      return reply
        .status(200)
        .header('Cache-Control', SEM_CACHE)
        .send(comoResposta(perfil, deps.baseDeMidia));
    },
  );
}

function corpoDe(contrato: Contrato, operationId: string): Record<string, unknown> {
  const schema = contrato.requestBodySchema(operationId);
  if (schema === undefined) {
    throw new Error(
      `Operação ${operationId} não declara corpo de requisição em application/json ` +
        'no contrato, mas a rota espera um. Corrija a especificação, não o código.',
    );
  }
  return schema;
}
