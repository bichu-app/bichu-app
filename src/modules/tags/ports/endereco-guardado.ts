/**
 * O ENDERECO DE ENTREGA GUARDADO NA CONTA.
 *
 * ## A autorizacao, com a data e as palavras dele
 *
 * **O cliente decidiu em 21/10/2026**, escolhendo esta opcao entre tres:
 *
 *     "Endereco guardado de verdade -- um endereco de entrega salvo na conta,
 *      reusado em todo pedido e editavel num lugar so."
 *
 * E essa decisao que destrava a proibicao de acrescentar tabela do ADR-0011
 * secao 5.5. A tabela e `user_delivery_addresses` (`20261020000016`), e o
 * registro inteiro da autorizacao mora no cabecalho daquela migracao.
 *
 * ## Por que esta porta mora em `tags/` e nao em `identity/`
 *
 * Porque [EnderecoDeEntrega] mora aqui, e e o MESMO tipo: o endereco guardado
 * nao e um segundo endereco, e ele existe para preencher o pedido da plaquinha.
 * Em `identity/` esta porta teria de importar `tags/ports/` -- e a fronteira de
 * modulo do ADR-0001 existe exatamente para impedir isso --, ou declarar a
 * segunda redacao do endereco, que divergiria da primeira no dia em que um
 * limite mudasse.
 *
 * A tabela referenciar `users` nao e acoplamento de modulo: e uma chave
 * estrangeira em SQL, e `collar_tag_requests.requested_by` ja faz o mesmo.
 *
 * ## ISTO E A RESIDENCIA DA PESSOA, e e a postura mais estreita das tres
 *
 * Este produto tem tres enderecos e tres posturas, e confundi-los e o erro
 * grave desta frente:
 *
 *   1. **profissional** -- comercial e **publico** (ADR-0011 secao 4);
 *   2. **encontro** -- lugar publico, mas o LOGRADOURO fica atras de conta
 *      (ADR-0027 item 21.2: sai so em `getNetworkEventLocation`, com
 *      `bearerAuth`, e "nunca na agenda, no detalhe publico, no teaser nem nos
 *      detalhes do privado");
 *   3. **usuario** -- este -- **RESIDENCIA. So o dono le.** Nunca projecao
 *      publica, nunca calculo de distancia, nunca lista.
 *
 * As consequencias, nesta porta:
 *
 * - **Nao existe metodo que leia o endereco de outra conta.** Nao ha
 *   `porUsuario(id)` com id de terceiro, nao ha listagem e nao ha busca: os
 *   dois metodos recebem o chamador e mais ninguem. O que nao existe na porta
 *   nao vaza por descuido numa rota futura;
 * - **A autorizacao mora na clausula `WHERE`**, e nao numa comparacao em
 *   JavaScript: `user_id` e a chave primaria e o `WHERE` o compara com o
 *   chamador. Endereco de outra conta nao e recusado -- ele nao encontra linha,
 *   e ausencia vira 404 e nunca 403 (ADR-0021);
 * - **Nada entra na trilha de auditoria.** Nenhum campo de [EnderecoDeEntrega]
 *   e copiado para `audit.events`, nem em `before`, nem em `after`, nem em
 *   `metadata` -- a MESMA regra que a `20261017000012` fixou para o endereco do
 *   pedido, e ela nao afrouxa por o endereco passar a ser reutilizavel;
 * - **Nada e geocodificado** (ADR-0006). O CEP e resolvido no APP, por servico
 *   publico; o que chega aqui e texto ja digitado, e o servidor nao sabe se a
 *   busca aconteceu.
 *
 * ## NAO HA APAGAMENTO POR PRAZO
 *
 * Nao existe metodo de expurgo nesta porta, nao existe varredura que a chame e
 * **nao existe constante de prazo em arquivo nenhum desta frente**. A decisao
 * do cliente de 17/10/2026, citada em
 * `media/application/varrer-envios-vencidos.ts`, e literal: *"voce so deve
 * apagar as informacoes, caso o usuario remova o pet ou delete a conta"*.
 *
 * Quem apaga e o `ON DELETE CASCADE` de `user_id`, e nao codigo daqui. Por isso
 * tambem nao ha `esquecer()`: ninguem pediu um botao de apagar o endereco, e
 * inventar um seria oferecer uma porta que a decisao nao abriu.
 */
import type { UserId } from '../../../shared/types/brands.js';
import type { EnderecoDeEntrega } from './pedido-de-plaquinha.js';

export interface EnderecoGuardadoRepository {
  /**
   * O endereco guardado do CHAMADOR, ou `null` quando ele nao tem nenhum.
   *
   * **`null` nao e erro e nao e recurso ausente**: e o estado normal de quem
   * ainda nao guardou endereco, e e o estado de toda conta no dia em que esta
   * leitura entrar no ar. A rota devolve 200 com `null`, pela mesma forma de
   * `getMyLocation`, e o formulario da plaquinha se comporta como antes.
   *
   * **O parametro e o chamador, e nao um id qualquer.** Nao existe assinatura
   * nesta porta que aceite a conta de outra pessoa.
   */
  doChamador(chamador: UserId): Promise<EnderecoDeEntrega | null>;

  /**
   * Guarda ou troca o endereco do CHAMADOR, e devolve como ele ficou.
   *
   * **Uma linha por conta** (`user_id` e a chave primaria), entao guardar de
   * novo SOBRESCREVE -- nao ha historico de enderecos, porque o cliente pediu
   * *"um endereco de entrega salvo na conta"*, no singular.
   *
   * **O endereco inteiro vem junto, e nao campo a campo.** Endereco e uma coisa
   * so: trocar de casa troca os nove campos de uma vez, e uma escrita parcial
   * deixaria a conta numa mistura de duas casas -- rua nova com bairro antigo
   * chega no lugar errado sem nada ter dado erro.
   */
  guardar(chamador: UserId, endereco: EnderecoDeEntrega): Promise<EnderecoDeEntrega>;
}
