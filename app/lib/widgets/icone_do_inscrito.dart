import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../api/modelos_diretorio.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// O glifo que ocupa o lugar da imagem de um inscrito do diretorio **quando
/// nao ha imagem cadastrada**.
///
/// Pedido do cliente em 18/10/2026: *"tem que colocar o icone de clinica,
/// estabelecimento, profissional, caso a foto/logo da empresa nao tenha sido
/// cadastrada"*.
///
/// ## Dois eixos, e o de entidade manda
///
/// O contrato tem DOIS campos de tipo, e nao um: `ProfessionalKind` (o que a
/// entrada FAZ: `vet`, `groomer`, `walker`, `sitter`, `trainer`, `clinic`,
/// `hospital` e `store` desde 28/10/2026, e `boarding` e `daycare` desde
/// 29/10/2026 -- DEZ, e nao seis) e
/// `EntityKind` (o que ela E: `professional`, `organization`). A prosa de
/// `EntityKind` no `openapi.yaml` explica por que: uma ONG tem atividade
/// (`clinic`, `vet`) **e** tipo de entidade (`organization`) ao mesmo tempo.
///
/// Desde 29/10/2026 `ProfessionalKind` tem **DEZ** valores: `boarding`
/// (Hospedagem) e `daycare` (Creche) entraram, e o glifo do `sitter` mudou
/// junto -- ver a entrada dele abaixo, que explica o conserto.
///
/// Aqui `organization` VENCE a atividade, e a razao e de informacao e nao de
/// hierarquia: a atividade ja esta escrita em palavras no cartao e na pagina
/// (`AtividadeDoDiretorio.rotulo` -- "Clinica", "Veterinario"), e o glifo e o
/// **unico** lugar da interface onde o tipo de entidade aparece. Desenhar a
/// cruz da clinica numa ONG que atende como clinica diria duas vezes o que o
/// texto ja diz e zero vezes o que so o icone pode dizer.
///
/// ## Como cada glifo foi escolhido, e qual colisao ele evita
///
/// Os glifos vem da familia embutida do Flutter (Material Symbols, Flutter
/// 3.47.4). Nenhum vetor foi baixado, nenhuma dependencia foi acrescentada: a
/// escolha e por ELIMINACAO dentro da familia, e a eliminacao esta escrita
/// porque o precedente da secao `Rede` mostrou que ela se perde (`more_time`
/// ficou escolhido porque `calendar_add_on` nao existe nesta versao e
/// `edit_calendar` ja significava outra coisa na mesma secao).
///
/// O inventario de colisao foi medido no proprio `lib/`, e nao imaginado --
/// `Icons.pets_outlined` aparece 4 vezes, `Icons.groups_outlined` 1,
/// `Icons.storefront_outlined` 2, `Icons.place_outlined` 6.
///
/// **Remedido em 28/10/2026**, para a entrada de `hospital` e `store`:
/// `pets_outlined` 7, `storefront_outlined` 3, `shopping_bag_outlined` 2 (a
/// aba `Loja` da barra), `sell_outlined` 1 (a secao `Atividades` da pagina do
/// local), `place_outlined` 7. E a escolha dos dois glifos novos **nao foi so
/// lida**: os candidatos foram DESENHADOS a partir do proprio
/// `MaterialIcons-Regular.otf` desta versao e comparados lado a lado em 20, 28
/// e 40 dp -- 20 dp e o piso real desta peca (`BichuEspaco.e5`), e e nele que
/// a colisao aparece ou nao. Foi assim que `store_outlined` caiu: no papel ele
/// e "a loja", e na tela ele e a mesma vitrine com toldo do `simboloDeFalha`.
///
/// - `clinic` -> **`local_hospital_outlined`**, a cruz: o ESTABELECIMENTO que
///   trata. Eliminados: `medical_services` (a maleta e o kit de quem atende, e
///   fica reservada ao `vet`); `storefront_outlined`, que ja e o
///   `simboloDeFalha` da logo neste mesmo cartao -- quem olha nao conseguiria
///   separar "sem foto" de "a foto quebrou" -- e que a BICHUS-233 ja recusou
///   por ler como loja.
/// - `hospital` -> **`emergency_outlined`**, a estrela da vida: o que separa
///   hospital de clinica e o PLANTAO -- "clinica atende hora marcada e fecha,
///   hospital interna e tem plantao", nas palavras do proprio contrato. A
///   estrela e o simbolo de pronto-socorro, e e a unica coisa do inventario
///   que diz plantao sem dizer "cruz" de novo. Eliminados: `local_hospital`,
///   que E o glifo de `clinic` -- o par mais obvio e justamente o que colide;
///   `medical_information` e `local_pharmacy`, que sao os dois uma CRUZ dentro
///   de outra forma e, no tamanho desta peca, leem como a cruz de `clinic`;
///   `local_hotel`, que e o MESMO desenho de `hotel_outlined` (o `sitter`);
///   `vaccines` (a agulha), pela mesma razao do `vet`; `monitor_heart`, o
///   monitor com o traco de ECG -- ele e o mais distinguivel de todos, mas a
///   20 dp, que e o piso desta peca, vira um borrao, e um monitor le como
///   APARELHO e nao como lugar.
/// - `store` -> **`shopping_basket_outlined`**, a cesta: a loja de produtos
///   para pet que aparece em `Perto` -- o petshop --, e **nao** a secao `Loja`
///   do produto, que e catalogo. Eliminados, e aqui a eliminacao fez quase
///   todo o trabalho: `storefront_outlined`, `store_outlined` e
///   `store_mall_directory_outlined` sao a MESMA vitrine com toldo, e a
///   primeira delas e o `simboloDeFalha` da logo NESTE MESMO CARTAO -- o par
///   obvio de `store` e, literalmente, o desenho de "a foto quebrou";
///   `shopping_bag_outlined` e `local_mall_outlined`, a sacola, que e a ABA
///   `Loja` da barra de baixo e esta na tela ao mesmo tempo que este cartao --
///   usa-la aqui fundiria o petshop com o catalogo, que e a confusao que a
///   prosa de `ProfessionalKind` existe para desfazer; `sell_outlined`, a
///   etiqueta, que ja e o cabecalho da secao `Atividades` da pagina do local;
///   `local_convenience_store`, cujo "24" vira sujeira a 20 dp;
///   `shopping_cart` e `shopping_basket` cheio de carrinho leem como a ACAO
///   "por no carrinho" -- a cesta, vazia e parada, le como lugar onde se
///   compra, e a mesma objecao de ACAO ja derrubou `category` na reserva;
///   `inventory`, `storage` e `widgets`, que leem como estoque, lista e
///   categorias; `redeem` e `card_giftcard`, o presente.
/// - `vet` -> **`medical_services_outlined`**, a maleta: a PESSOA que atende, e
///   nao o predio. Eliminados: `stethoscope`, que nao existe nesta versao;
///   `vaccines` (a agulha), porque seringa numa tela de pet le como dor e nao
///   como cuidado; `health_and_safety_outlined`, que ja significa "saude" na
///   secao `Rede`.
/// - `groomer` -> **`shower_outlined`**, o chuveiro: de "banho e tosa", o banho
///   e a metade que desenha. Eliminados: `content_cut`, porque a tesoura do
///   Material e o verbo CORTAR de editor de texto; `bathtub`, que le como
///   louca de banheiro humano; `water_drop_outlined`, que ja e agua na lista de
///   itens de encontro da `Rede`.
/// - `walker` -> **`directions_walk_outlined`**, a figura andando: o passeio.
///   Eliminado: `pets_outlined`, a patinha -- ela e a marca do produto,
///   aparece 4 vezes no app e significa "pet", nunca "passeio".
/// - `sitter` -> **`supervisor_account_outlined`**, duas pessoas com a maior na
///   frente: alguem que CUIDA. **ELE MUDOU EM 29/10/2026, e a troca e um
///   conserto.** O glifo era `hotel_outlined`, uma cama, e foi escolhido para
///   casar com o rotulo **errado** que `sitter` carregava desde o primeiro
///   commit da listagem ("Hospedagem"). Pet sitter nao e hotel: e uma PESSOA
///   que cuida, muitas vezes na casa do tutor. A cama passou para `boarding`,
///   onde ela finalmente diz a coisa certa.
///
///   Um glifo de PESSOA e exatamente o que separa os dois na tela: `boarding` e
///   um LUGAR (a cama) e `sitter` e QUEM vai cuidar. E o mesmo eixo que ja
///   separa `vet` (a maleta de quem atende) de `clinic` (a cruz do predio).
///
///   Eliminados: `escalator_warning_outlined`, cujo DESENHO -- adulto de maos
///   dadas com alguem menor -- e o mais proximo de "acompanhar", mas cujo NOME
///   fala de escada rolante, e glifo com nome que contradiz o uso e o que a
///   proxima pessoa "corrige" errado; `house`, `cottage` e `home_work`, que
///   leem como ENDERECO ao lado do `place_outlined` da mesma pagina (7
///   ocorrencias em `lib/`) -- e e a MESMA objecao que ja os derrubou em 18/10;
///   `night_shelter`, porque ABRIGO e exatamente o que uma ONG e, e os dois
///   valores convivem no mesmo conjunto; `diversity_1` e `groups_outlined` (2
///   ocorrencias), que sao o campo semantico de comunidade da secao `Rede` -- a
///   BICHUS-233 proibe essa repeticao entre secoes; `child_care_outlined`, uma
///   cara de bebe, que le como creche HUMANA.
/// - `boarding` -> **`hotel_outlined`**, a cama: "Hospedagem", o pet FICA no
///   estabelecimento. **E o glifo que o `sitter` tinha**, e herda-lo nao e
///   economia: a cama sempre descreveu hospedagem, e o que estava errado era a
///   atividade a que ela estava presa. A eliminacao de 18/10 continua valendo
///   aqui: `night_shelter` le como ABRIGO (ONG), `house`/`home_work` leem como
///   endereco. Nota medida por outra frente em 28/10: `local_hotel` e o MESMO
///   desenho de `hotel_outlined`, entao nao ha segunda cama a escolher.
/// - `daycare` -> **`toys_outlined`**, o molinete: "Creche", onde o pet passa o
///   DIA e volta para casa -- e o que separa creche de hospedagem e justamente
///   nao dormir ali. O brinquedo e o que esse dia tem de proprio.
///   Eliminados: `wb_sunny_outlined` e `light_mode_outlined`, o sol, que diriam
///   "dia" com mais exatidao e leem como TEMPO/clima -- nao ha nada de
///   meteorologia nesta tela para ancorar a leitura; `child_care_outlined`, a
///   cara de bebe, que le como creche de crianca num app de pet;
///   `meeting_room_outlined`, a porta aberta, que le como "sala";
///   `groups_outlined` e `diversity_1`, do campo da `Rede` (ver `sitter`);
///   `shopping_basket_outlined`, que E o `store`.
///
///   O risco que sobra, dito: a cesta do `store` e o brinquedo podem ler os dois
///   como "coisa que se compra". Ele e contido porque o nome da atividade e
///   escrito ao lado do glifo em todas as superficies que usam esta peca
///   (`AtividadeDoDiretorio.rotulo`), e porque a cesta e a unica com alca.
/// - `trainer` -> **`school_outlined`**, o capelo: adestrar e ENSINAR.
///   Eliminados: `fitness_center` (o haltere le como academia de gente) e
///   `sports_score` (a bandeira de chegada le como competicao).
/// - `organization` (ONG) -> **`volunteer_activism_outlined`**, a mao com o
///   coracao: a causa. Eliminados: `groups_outlined` e `groups`, que ja sao o
///   campo semantico de comunidade da secao `Rede` -- a BICHUS-233 proibe
///   exatamente este tipo de repeticao entre secoes; `diversity_1`, do mesmo
///   campo; `handshake`, que le como parceria comercial.
/// - **reserva**, para qualquer valor que esta versao nao conheca ->
///   **`domain_outlined`**, um predio neutro: "um estabelecimento inscrito que
///   ainda nao sei nomear". Eliminados: `storefront_outlined` (o simbolo de
///   falha, ver `clinic`); `category`, que le como filtro -- e a barra do
///   `Perto` ja usa `tune` para isso; `help_outline` e `question_mark`, porque
///   interrogacao sobre o nome de um negocio real parece defeito DAQUELE
///   negocio, e nao do nosso `enum`.
///
/// ## A reserva nao e enfeite
///
/// `ProfessionalKind` e `EntityKind` sao aditivos por construcao: o dia em que
/// o servidor emitir um valor novo, o APK ja publicado le este caminho. Por
/// isso esta funcao e **total** -- ela nao devolve nulo em caso nenhum, e os
/// dois eixos chegam anulaveis de proposito (ver
/// `TipoDeEntidade.porCodigo`). Uma versao que devolvesse nulo deixaria o
/// lugar da imagem vazio justamente na entrada que o app nao entendeu, que e o
/// caso em que a tela precisa dizer mais, e nao menos.
IconData glifoDoInscrito({
  AtividadeDoDiretorio? atividade,
  TipoDeEntidade? tipoDeEntidade,
}) {
  // O eixo de ENTIDADE primeiro: ver "Dois eixos" acima.
  if (tipoDeEntidade == TipoDeEntidade.organizacao) {
    return Icons.volunteer_activism_outlined;
  }
  return switch (atividade) {
    AtividadeDoDiretorio.clinic => Icons.local_hospital_outlined,
    AtividadeDoDiretorio.hospital => Icons.emergency_outlined,
    AtividadeDoDiretorio.store => Icons.shopping_basket_outlined,
    AtividadeDoDiretorio.vet => Icons.medical_services_outlined,
    AtividadeDoDiretorio.groomer => Icons.shower_outlined,
    AtividadeDoDiretorio.walker => Icons.directions_walk_outlined,
    AtividadeDoDiretorio.sitter => Icons.supervisor_account_outlined,
    AtividadeDoDiretorio.boarding => Icons.hotel_outlined,
    AtividadeDoDiretorio.daycare => Icons.toys_outlined,
    AtividadeDoDiretorio.trainer => Icons.school_outlined,
    // Atividade desconhecida ou ausente, com tipo de entidade que nao e
    // `organization`: a reserva.
    null => glifoDeReservaDoInscrito,
  };
}

/// O glifo de quando o app **nao sabe** o tipo. Ver a prosa de
/// [glifoDoInscrito].
const IconData glifoDeReservaDoInscrito = Icons.domain_outlined;

/// O lugar da imagem de um inscrito **sem imagem cadastrada**: o mesmo
/// retangulo que `ImagemDaRede` ocuparia, com o glifo do tipo no meio.
///
/// Irmao de `ImagemDaRede`, e a geometria e copiada dela de proposito -- fundo
/// `surfaceSunken`, mesmo raio, mesmo `LayoutBuilder` -- para que a troca de um
/// pelo outro nao mova um pixel do resto da tela.
///
/// **Nao desenha nada no leitor de tela.** `ExcludeSemantics` aqui nao e
/// descuido: nos dois lugares que usam esta peca o TIPO ja esta escrito em
/// texto ao lado (`AtividadeDoDiretorio.rotulo`), e nos dois ela vive dentro do
/// `MergeSemantics` do cartao ou da pagina -- um rotulo aqui nao criaria parada
/// de foco nova, ele entraria no rotulo do cartao e faria o leitor dizer
/// "Clinica" duas vezes na mesma parada. E a mesma razao de `descricao: null`
/// na logo, e esta tambem e decisao de QUEM CHAMA, por onde a peca esta.
class IconeDoInscrito extends StatelessWidget {
  const IconeDoInscrito({
    required this.atividade,
    required this.tipoDeEntidade,
    super.key,
    this.largura,
    this.proporcao = 1,
    this.raio = BichuRaio.md,
  });

  final AtividadeDoDiretorio? atividade;
  final TipoDeEntidade? tipoDeEntidade;

  /// A largura pintada, em dp. Nula ocupa a largura que o pai oferecer.
  final double? largura;

  /// Largura dividida pela altura. `1` e quadrado; `16 / 9` e a faixa.
  final double proporcao;

  final double raio;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;

    return LayoutBuilder(
      builder: (context, limites) {
        final double? larguraPintada =
            largura ?? (limites.maxWidth.isFinite ? limites.maxWidth : null);
        if (larguraPintada == null || larguraPintada <= 0) {
          return const SizedBox.shrink();
        }
        final alturaPintada = larguraPintada / proporcao;

        // 40% do MENOR lado, que e a regra do paragrafo 11.4 para o simbolo da
        // moldura vazia. Pelo menor, e nao pela largura: na faixa 16:9 de borda
        // a borda 40% da largura daria um glifo mais alto que a propria faixa.
        // O teto de `e16` existe porque acima dele o icone deixa de ler como
        // simbolo e passa a ler como ilustracao.
        final tamanho = (math.min(larguraPintada, alturaPintada) * 0.4)
            .clamp(BichuEspaco.e5, BichuEspaco.e16)
            .toDouble();

        return ExcludeSemantics(
          child: Container(
            width: larguraPintada,
            height: alturaPintada,
            decoration: BoxDecoration(
              color: cores.surfaceSunken,
              borderRadius: BorderRadius.circular(raio),
            ),
            child: Center(
              child: Icon(
                glifoDoInscrito(
                  atividade: atividade,
                  tipoDeEntidade: tipoDeEntidade,
                ),
                size: tamanho,
                color: cores.textMuted,
              ),
            ),
          ),
        );
      },
    );
  }
}
