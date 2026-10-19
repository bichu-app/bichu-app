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
/// entrada FAZ: `vet`, `groomer`, `walker`, `sitter`, `trainer`, `clinic`) e
/// `EntityKind` (o que ela E: `professional`, `organization`). A prosa de
/// `EntityKind` no `openapi.yaml` explica por que: uma ONG tem atividade
/// (`clinic`, `vet`) **e** tipo de entidade (`organization`) ao mesmo tempo.
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
/// - `clinic` -> **`local_hospital_outlined`**, a cruz: o ESTABELECIMENTO que
///   trata. Eliminados: `medical_services` (a maleta e o kit de quem atende, e
///   fica reservada ao `vet`); `storefront_outlined`, que ja e o
///   `simboloDeFalha` da logo neste mesmo cartao -- quem olha nao conseguiria
///   separar "sem foto" de "a foto quebrou" -- e que a BICHUS-233 ja recusou
///   por ler como loja.
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
/// - `sitter` -> **`hotel_outlined`**, a cama: "Hospedagem". Eliminados:
///   `night_shelter`, porque ABRIGO e exatamente o que uma ONG e, e os dois
///   valores convivem no mesmo conjunto; `house` e `home_work`, que leem como
///   ENDERECO ao lado do `place_outlined` da mesma pagina.
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
    AtividadeDoDiretorio.vet => Icons.medical_services_outlined,
    AtividadeDoDiretorio.groomer => Icons.shower_outlined,
    AtividadeDoDiretorio.walker => Icons.directions_walk_outlined,
    AtividadeDoDiretorio.sitter => Icons.hotel_outlined,
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
