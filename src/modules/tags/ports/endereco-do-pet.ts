/**
 * O ENDERECO DE ENTREGA GUARDADO NO PET.
 *
 * ## As duas decisoes dele, com as datas e as palavras -- e a de 21/10 cai
 *
 * **21/10/2026**, escolhendo entre tres opcoes apresentadas:
 *
 *     "Endereco guardado de verdade -- um endereco de entrega salvo na CONTA,
 *      reusado em todo pedido e editavel num lugar so."
 *
 * **27/10/2026**, pedido dele:
 *
 *     "o endereco de entrega da plaquinha tem que estar dentro do cadastro do
 *      pet"
 *
 * A contradicao com 21/10 foi posta na mesa para ele, nomeada e datada, citando
 * aquela frase. Ele respondeu:
 *
 *     "endereco um por pet"
 *
 * **Entao a de 21/10 CAI e a de 27/10 vale**, e nao foi descuido dele: a
 * decisao anterior estava em maos quando a nova foi tomada. Quem ler
 * `endereco-guardado.ts` (que continua neste diretorio) sem este registro vai
 * concluir que ha duas fontes concorrentes para o mesmo endereco -- **a fonte do
 * pedido e o PET.**
 *
 * `endereco-guardado.ts` e as rotas `/v1/me/delivery-address` **nao foram
 * apagados**: a decisao do cliente de **26/10/2026** e *"nao apague nada"*, e
 * foi daquela tabela que a migracao `20261027000001` copiou o endereco para os
 * pets de cada tutor. O que elas perderam foi o papel.
 *
 * A tabela e `pet_delivery_addresses` (`20261027000001`), e o registro inteiro
 * da autorizacao mora no cabecalho daquela migracao.
 *
 * ## Por que esta porta mora em `tags/` e nao em `pets/`
 *
 * Porque [EnderecoDeEntrega] mora aqui, e e o MESMO tipo: o endereco do pet nao
 * e um segundo endereco, e ele existe para preencher o pedido da plaquinha. Em
 * `pets/` esta porta teria de importar `tags/ports/` -- e a fronteira de modulo
 * do ADR-0001 existe exatamente para impedir isso --, ou declarar a segunda
 * redacao do endereco, que divergiria da primeira no dia em que um limite
 * mudasse. E o mesmo argumento, palavra por palavra, que poe
 * `endereco-guardado.ts` em `tags/` em vez de `identity/`.
 *
 * A rota ser `/v1/pets/{petId}/delivery-address` nao muda isso:
 * `/v1/pets/{petId}/tag-requests` e `/v1/pets/{petId}/tags` tambem sao servidas
 * de `tags/`, e pelo mesmo motivo.
 *
 * ## ISTO E A RESIDENCIA DA PESSOA. Mudou de dono, nao de classe.
 *
 * Este produto tem tres enderecos e tres posturas, e confundi-los e o erro
 * grave desta frente:
 *
 *   1. **profissional** -- comercial e **publico** (ADR-0011 secao 4);
 *   2. **encontro** -- lugar publico, mas o LOGRADOURO fica atras de conta
 *      (ADR-0027 item 21.2: sai so em `getNetworkEventLocation`, com
 *      `bearerAuth`, e "nunca na agenda, no detalhe publico, no teaser nem nos
 *      detalhes do privado");
 *   3. **usuario** -- este -- **RESIDENCIA. So o tutor le.** Nunca projecao
 *      publica, nunca calculo de distancia, nunca lista.
 *
 * As consequencias, nesta porta:
 *
 * - **Nao existe metodo que leia o endereco de pet de terceiro.** Nao ha
 *   `porPet(id)` sem chamador, nao ha listagem e nao ha busca: os dois metodos
 *   recebem o pet **e** o chamador, e o chamador entra na clausula `WHERE`. O
 *   que nao existe na porta nao vaza por descuido numa rota futura;
 * - **Nao existe metodo que leia os enderecos de VARIOS pets.** `listMyPets`
 *   projeta `Pet`, e o endereco nao esta em `Pet` justamente por isso -- uma
 *   assinatura `doTutor(chamador): Promise<Endereco[]>` seria o atalho pelo qual
 *   a residencia do tutor passaria a sair na abertura do aplicativo,
 *   multiplicada pelo numero de pets. O cabecalho da `20261020000016` fixou a
 *   regra: *"quem quer o endereco faz JOIN, e quem nao faz nao o tem em maos"*;
 * - **A autorizacao mora na clausula `WHERE`**, e e um `JOIN` com `pets`
 *   comparando `owner_user_id` com o chamador -- nao uma comparacao em
 *   JavaScript, que pode ser escrita ao contrario e continuar compilando. Pet de
 *   outra pessoa nao e recusado: ele nao encontra linha, e ausencia vira 404 e
 *   nunca 403 (ADR-0021);
 * - **Nada entra na trilha de auditoria.** Nenhum campo de [EnderecoDeEntrega]
 *   e copiado para `audit.events`, nem em `before`, nem em `after`, nem em
 *   `metadata` -- a MESMA regra que a `20261017000012` fixou para o endereco do
 *   pedido e a `20261020000016` para o da conta, e ela nao afrouxa por o
 *   endereco mudar de dono. O que a `20261027000001` mandou para a trilha foram
 *   CONTAGENS, nunca campo de endereco;
 * - **Nada e geocodificado** (ADR-0006). O CEP e resolvido no APP, por servico
 *   publico (ViaCEP com BrasilAPI de reserva, decisao do cliente de
 *   17/10/2026); o que chega aqui e texto ja digitado, e o servidor nao sabe se
 *   a busca aconteceu.
 *
 * ## NAO HA APAGAMENTO POR PRAZO, e agora a frase dele vale literalmente
 *
 * Nao existe metodo de expurgo nesta porta, nao existe varredura que a chame e
 * **nao existe constante de prazo em arquivo nenhum desta frente**. A decisao do
 * cliente de 17/10/2026, citada em `media/application/varrer-envios-vencidos.ts`,
 * e literal:
 *
 *     "voce so deve apagar as informacoes, caso o usuario remova o pet ou
 *      delete a conta"
 *
 * Com o endereco no PET os dois casos dessa frase sao a MESMA clausula:
 * `ON DELETE CASCADE` em `pet_id` tira o endereco quando o pet sai, e
 * `pets.owner_user_id` ja cascateia de `users`. **No modelo da conta, "remova o
 * pet" nao apagava endereco nenhum** -- esta e a primeira vez em que a frase
 * dele e cumprida inteira.
 *
 * Por isso tambem nao ha `esquecer()`: ninguem pediu um botao de apagar o
 * endereco, e inventar um seria oferecer uma porta que a decisao nao abriu.
 */
import type { PetId, UserId } from '../../../shared/types/brands.js';
import type { EnderecoDeEntrega } from './pedido-de-plaquinha.js';

export interface EnderecoDoPetRepository {
  /**
   * O endereco guardado DESTE pet, quando o pet e do chamador.
   *
   * **Os dois "vazios" sao diferentes, e a rota os traduz diferente:**
   *
   * - `undefined` -- **o pet nao e seu, ou nao existe, ou esta excluido.** Vira
   *   **404**, e nunca 403 (ADR-0021): para quem pergunta, o pet de outra pessoa
   *   nao existe. Os tres casos sao um so de proposito -- distinguir "existe mas
   *   nao e seu" de "nao existe" ja seria contar que existe;
   * - `null` -- **o pet e seu e ainda nao tem endereco.** Vira **200 com corpo
   *   `null`**, pela mesma forma de `getMyDeliveryAddress` e de `getMyLocation`:
   *   nao e erro e nao e recurso ausente, e o estado de TODO pet cadastrado
   *   depois da `20261027000001`. Nele o formulario da plaquinha abre vazio,
   *   como se endereco guardado nao existisse.
   *
   * Juntar os dois num `null` so faria o aplicativo mostrar "sem endereco" para
   * um pet que nao e do chamador, e o 404 que a tela precisa desenhar sumiria.
   */
  doPetDoChamador(pet: PetId, chamador: UserId): Promise<EnderecoDeEntrega | null | undefined>;

  /**
   * Guarda ou troca o endereco DESTE pet, e devolve como ele ficou.
   *
   * `undefined` quando o pet nao e do chamador, nao existe ou esta excluido --
   * **404, e nunca 403**, pela mesma leitura de [doPetDoChamador]. E a
   * autorizacao e a MESMA clausula `WHERE` da leitura: a escrita nao tem um
   * caminho proprio de permissao, que e como uma das duas acaba mais frouxa que
   * a outra.
   *
   * **Uma linha por pet** (`pet_id` e a chave primaria), entao guardar de novo
   * SOBRESCREVE -- nao ha historico de enderecos, porque o cliente pediu
   * *"endereco um por pet"*, no singular.
   *
   * **O endereco inteiro vem junto, e nao campo a campo.** Endereco e uma coisa
   * so: trocar de casa troca os nove campos de uma vez, e uma escrita parcial
   * deixaria o pet numa mistura de duas casas -- rua nova com bairro antigo
   * chega no lugar errado sem nada ter dado erro.
   *
   * **Guardar no pet A nao toca o pet B, e nao toca o endereco da CONTA.** E o
   * "um por pet" que ele pediu: editar um e editar um.
   */
  guardarNoPet(
    pet: PetId,
    chamador: UserId,
    endereco: EnderecoDeEntrega,
  ): Promise<EnderecoDeEntrega | undefined>;
}
