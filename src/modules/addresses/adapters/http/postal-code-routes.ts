/**
 * `GET /v1/admin/postal-codes/:postalCode` -- **a borda da nossa unica busca
 * de CEP**.
 *
 * ## Por que esta rota existe
 *
 * Decisao do cliente de 18/10/2026: *"voce deve usar sempre a mesma camada de
 * servico que ja fez a integracao com as plataformas, reaproveitamento dos
 * nossos endpoints"*. A integracao com ViaCEP e BrasilAPI passa a viver no
 * servidor, atras da porta `BuscaDeCep`, e esta rota e so a borda dela. O
 * painel passa a chamar o nosso endpoint pelo cliente gerado, como chama o
 * resto; **nenhum navegador nosso fala com servico de fora**.
 *
 * ## POR QUE ELA NASCE NA SUPERFICIE ADMINISTRATIVA
 *
 * Os tres caminhos foram medidos em 18/10 antes de escolher, e dois sao
 * inexprimiveis:
 *
 * 1. **Publica (`security: []`) nao e exprimivel.**
 *    `src/tools/portao-contrato-publico.ts` reprova `street`, `postal_code`,
 *    `street_number`, `address`, `cep` e `zip` em QUALQUER resposta alcancavel
 *    sem conta (ADR-0010, "o que a rota publica jamais exibe", item 2). A
 *    resposta aqui e exatamente um logradouro. Renomear os campos para escapar
 *    do portao seria trapaca, nao desenho.
 * 2. **`bearerAuth` nao serve ao painel.** A guarda de `/v1/admin` recusa com
 *    401 toda requisicao que traga `Authorization` (ADR-0027 item 2, D36), e a
 *    conta do painel nao e conta do app: ela nao tem, e nao pode ter, um
 *    Bearer.
 * 3. **O chamador que existe hoje e o painel**, no formulario de entrada do
 *    diretorio de `Perto`.
 *
 * **O aplicativo nao migrou nesta entrega, e a migracao dele e fiacao e nao
 * integracao**: a MESMA porta registrada numa `GET /v1/postal-codes/:postalCode`
 * com `security: [bearerAuth]`, sem tocar no adaptador. Ela nao entra agora
 * porque operacao declarada sem chamador e divida de contrato, e porque
 * `app/lib/api/busca_de_cep.dart` esta sendo editado por outra frente.
 *
 * ## Autorizacao, e o que NAO ha para autorizar
 *
 * A guarda do escopo ja conferiu superficie, cookie, `Origin` e papel antes de
 * qualquer gancho daqui. **Nao ha recurso de ninguem nesta rota**: um CEP nao
 * pertence a uma linha, nao tem dono e nao tem `WHERE` por titular, entao a
 * regra "autorizacao no WHERE, 404 nunca 403" (ADR-0021) nao tem onde se
 * aplicar -- e dizer isso em voz alta e melhor que deixar parecer esquecimento.
 * O 404 desta rota significa uma coisa so: **este CEP nao existe nas bases**.
 *
 * ## Nada e guardado, e nada e escrito
 *
 * A rota nao toca no banco, nao grava trilha (nao ha `x-audit`: nenhum estado
 * muda) e nao devolve nada sobre quem chamou. Quem grava o endereco e
 * `createAdminDirectoryEntry` / `updateAdminDirectoryEntry`, com o que o
 * operador confirmou na tela.
 *
 * ## `Cache-Control`
 *
 * `private, no-store`. Um CEP e dado publico e estavel, e a tentacao e deixar
 * cachear -- mas a resposta sai de uma rota do PAINEL, atras de cookie de
 * sessao, e intermediario que guardasse resposta de superficie administrativa
 * e exatamente o que `admin.bichu.app` nao quer. O custo e uma chamada a mais
 * quando alguem redigita o mesmo CEP; o ganho e nenhuma resposta de painel em
 * cache de ninguem.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { problemas } from '../../../../shared/http/errors.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import type { BuscaDeCep } from '../../ports/busca-de-cep.js';

/**
 * O teto e o do contrato, COPIADO dele.
 *
 * `effects: []` porque nenhum dos seis efeitos do ADR-0016 cabe: nao notifica,
 * nao gera trabalho humano, nao e consulta cara nossa, nao confere segredo,
 * nao revela credencial e nao escreve. **O teto existe assim mesmo, e por
 * isso ele esta declarado** -- mesma forma de `getReferenceData`, que tambem e
 * leitura com efeito vazio e teto proprio.
 *
 * **60 por hora por conta do painel.** O que este teto protege nao e o nosso
 * banco: e a cota de um servico gratuito de terceiro, consumida pelo NOSSO IP.
 * Sem teto a rota e uma porta aberta para gastar a cota alheia em nome da
 * casa, e o bloqueio que vem depois quebra a busca de CEP para todos de uma
 * vez. Sessenta e numero de tela: um cadastro usa um CEP.
 *
 * Por `account` e nao por `ip`: a operacao exige sessao administrativa, entao
 * a conta existe e e exata, e o painel inteiro sai de poucos enderecos -- um
 * teto por IP puniria a mesa toda pelo uso de uma pessoa. A chave e
 * `admin:<conta>`, que nunca divide balde com o app (ADR-0027 item 20.2).
 */
export const rotaDeBuscaDeCep = defineRoute({
  operationId: 'lookupAdminPostalCode',
  method: 'get',
  path: '/admin/postal-codes/:postalCode',
  effects: [],
  adminRoles: ['admin'],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

const SEM_CACHE = 'private, no-store';

export interface DependenciasDaRotaDeCep {
  readonly cep: BuscaDeCep;
}

/** `admin:`, e nao `account:`: um balde do painel e um do app nunca dividem chave. */
const contaDoTeto = (request: FastifyRequest): string | undefined => {
  const conta = request.sessaoAdministrativa?.adminAccountId;
  return conta === undefined ? undefined : `admin:${conta}`;
};

export function registrarRotaDeBuscaDeCep(
  app: RegistradorDeRotas,
  deps: DependenciasDaRotaDeCep,
): void {
  registrarRota(
    app,
    rotaDeBuscaDeCep,
    { resolvedores: { account: contaDoTeto } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // A forma do CEP ja foi conferida: `vigiarParametrosDasRotas` instala
      // `schema.params` a partir do `pattern: '^[0-9]{8}$'` do contrato, e CEP
      // torto e 400 antes de chegar aqui. Declarar um schema neste registro
      // criaria a segunda definicao, que e a que diverge.
      const { postalCode } = request.params as { postalCode: string };
      const resposta = await deps.cep.buscar(postalCode);

      void reply.header('Cache-Control', SEM_CACHE);

      // Os dois desfechos que nao sao achado viram status, e **nenhum deles
      // impede o formulario de salvar**: a tela trata os dois como "preencha
      // a mao" e continua inteira.
      if (resposta.desfecho === 'naoEncontrado') throw problemas.naoEncontrado();
      if (resposta.desfecho === 'indisponivel') throw problemas.buscaDeCepIndisponivel();

      // Os quatro campos, e so eles. O adaptador ja descartou tudo o mais que
      // os servicos mandam -- inclusive o par de coordenadas da reserva, que a
      // ADR-0006 proibe.
      return reply.send({
        street: resposta.endereco.street,
        neighborhood: resposta.endereco.neighborhood,
        city: resposta.endereco.city,
        state: resposta.endereco.state,
      });
    },
  );
}
