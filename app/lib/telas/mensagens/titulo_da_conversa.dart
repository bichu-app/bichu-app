/// O TITULO DA TELA DE CONVERSA: o nome da pessoa, e o do pet como contexto.
///
/// ===========================================================================
/// ## O DEFEITO MEDIDO, e ele cortava HOJE, sem nenhum selo
/// ===========================================================================
///
/// O titulo era uma string so -- `'$nome · $pet'` -- no slot de titulo da
/// `AppBar`, que pinta `headlineSmall`: **Plus Jakarta Sans 700, 26 / 32**.
///
/// Medido com a fonte real, em 375 dp a 100% de escala:
///
///   vao real do slot de titulo em 375 dp          287,00 dp
///   `Maria Fernanda · Serafina do Bonfim`         442,16 dp
///
/// Cortava por **155,16 dp** em 375 dp, com uma pessoa e um pet de nomes
/// comuns e **sem selo nenhum na barra** -- e cortava tambem em 320 e em 412.
/// Os numeros de cada largura e de cada escala estao no cabecalho de
/// `app/test/mensagens/titulo_da_conversa_test.dart`, que e quem os mede com as
/// fontes reais carregadas -- a forma e a de `telas/rede/secao_da_rede.dart`,
/// que registra as larguras em dp no proprio codigo.
///
/// ===========================================================================
/// ## O QUE CEDE, E POR QUE E O PET
/// ===========================================================================
///
/// **O nome da pessoa nao cede nada.** Quem esta na conversa precisa saber com
/// QUEM fala: e o nome que decide se a mensagem e respondida, e num produto em
/// que o golpe do falso achador e risco nomeado (ADR-0010), um nome cortado ao
/// meio e exatamente o campo que nao pode ficar ambiguo. `Maria Fer…` e
/// `Maria Fernanda` sao duas pessoas diferentes para quem le com pressa.
///
/// **O nome do pet e contexto, e contexto cede duas vezes:**
///
///   1. **cede a LINHA**: ele sai do titulo e vira a segunda linha, em
///      `bodyMedium` secundario. Continua presente -- a conversa e sobre aquele
///      animal, e tirar o pet da tela seria resolver o corte apagando a
///      informacao --, mas para de disputar o vao com o nome;
///   2. **cede o FIM**: se nem a segunda linha couber, e o pet que recebe a
///      elipse (`maxLines: 1`, `TextOverflow.ellipsis`). `Serafina do Bon…`
///      ainda diz de qual pet se trata; `Maria Fer…` nao diz de qual pessoa.
///
/// **O nome nao tem teto de linhas.** Ele envolve em vez de cortar, e a barra
/// cresce com ele -- ver `alturaDaBarra`. Nome longo a 200% de escala em 320 dp
/// e justamente o estado em que uma `AppBar` de altura fixa teria de escolher
/// entre cortar o nome e transbordar a pintura, e as duas sao o defeito.
///
/// ===========================================================================
/// ## A ALTURA DA BARRA E CALCULADA, e nao chutada
/// ===========================================================================
///
/// `AppBar` tem altura FIXA (`toolbarHeight`, 56 dp de padrao). Um titulo de
/// duas linhas dentro dela transborda a 200% de escala -- e transbordo de
/// pintura e o defeito disfarçado de conserto. Entao a tela pede a altura a
/// `alturaDaBarra`, que **mede o texto real, no estilo real, na escala real**
/// com um `TextPainter` e devolve de quanto a barra precisa.
///
/// O piso e `BichuAlvoDeToque.critico` (64 dp): a barra nunca encolhe abaixo do
/// alvo de toque critico, porque o `leading` dela e a saida da tela.
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';

/// O titulo de duas linhas: a pessoa em cima, o pet embaixo.
class TituloDaConversa extends StatelessWidget {
  const TituloDaConversa({required this.nome, this.pet, super.key});

  /// O nome de quem esta do outro lado. **Nunca cortado.**
  final String nome;

  /// O nome do pet. Nulo ou vazio: a segunda linha **nao e construida**, em vez
  /// de nascer vazia e roubar altura da barra.
  final String? pet;

  /// O QUE A BARRA TIRA DO TITULO, em dp, antes de sobrar vao para o texto.
  ///
  /// **88,00 dp, e o numero foi MEDIDO e nao deduzido:** 56 dp do `leading` (a
  /// saida da tela) + 16 dp de `titleSpacing` de cada lado, que e o padrao do
  /// `NavigationToolbar` do Material. A primeira versao deste arquivo dizia 64
  /// -- 56 + 8 de respiro --, e **errava para o lado perigoso**: supor vao maior
  /// do que existe faz `alturaDaBarra` prever menos linhas do que o nome vai
  /// ocupar, e a barra sai curta.
  ///
  /// Em 375 dp sobram **287,00 dp** para o titulo, e nao os 311 que uma conta
  /// de 56 + 8 sugeriria. O caso
  /// `o VAO do slot de titulo e o que esta constante diz` em
  /// `app/test/mensagens/titulo_da_conversa_test.dart` mede o retangulo pintado
  /// nas tres larguras e reprova se esta constante divergir do leiaute real.
  static const double vaoTiradoPelaBarra = 88.0;

  /// O respiro vertical acima e abaixo do titulo, somado uma vez.
  static const double _respiroVertical = BichuEspaco.e2;

  /// O TETO DE ESCALA QUE A `AppBar` APLICA AO TITULO DELA, e nao um teto nosso.
  ///
  /// O Material embrulha o titulo em
  /// `MediaQuery.withClampedTextScaling(maxScaleFactor: _kMaxTitleTextScaleFactor)`
  /// -- 1,34 -- *"para manter a hierarquia visual mesmo com fontes maiores"*. A
  /// constante do framework e PRIVADA, entao o valor e copiado aqui; o que
  /// impede a copia de envelhecer calada e o caso
  /// `a barra nao SOBRA altura: a previsao casa com o que a barra pinta` em
  /// `app/test/mensagens/titulo_da_conversa_test.dart`, que compara a previsao
  /// com o retangulo pintado e reprova a divergencia.
  ///
  /// **Sem este teto a previsao erra para cima**, e isso tambem e defeito: a 200%
  /// de escala `alturaDaBarra` pedia 176 dp para um titulo que a barra pinta em
  /// 78 -- 98 dp de barra vazia roubados do corpo da conversa. Medido.
  ///
  /// O teto de 200% do app (`app.dart`) continua valendo para o RESTO da tela:
  /// este e o do slot de titulo, e so dele.
  static const double tetoDaEscalaDoTitulo = 1.34;

  /// A altura de que a barra precisa para NAO cortar o nome.
  ///
  /// Mede com `TextPainter` -- mesmo estilo, mesma escala, mesma largura que o
  /// `build` vai usar -- e soma as duas linhas. Nunca abaixo do alvo critico.
  ///
  /// **Por que nao `kToolbarHeight` com `FittedBox`:** encolher a fonte para
  /// caber desfaz a escala de texto que a pessoa escolheu no sistema, e quem
  /// aumenta a letra a 200% nao esta pedindo um titulo que volte a 26.
  static double alturaDaBarra(
    BuildContext context, {
    required String nome,
    String? pet,
  }) {
    final tema = Theme.of(context);
    // A MESMA escala que a `AppBar` vai usar no titulo, e nao a do sistema: ver
    // `tetoDaEscalaDoTitulo`.
    final escala = MediaQuery.textScalerOf(
      context,
    ).clamp(maxScaleFactor: tetoDaEscalaDoTitulo);
    final largura = math.max(
      1.0,
      MediaQuery.sizeOf(context).width - vaoTiradoPelaBarra,
    );
    final alturaDoNome = _alturaDe(
      nome,
      _estiloDoNome(tema),
      escala,
      largura,
      null,
    );
    final alturaDoPet = _temPet(pet)
        ? _alturaDe(pet!, _estiloDoPet(tema, context), escala, largura, 1)
        : 0.0;
    return math.max(
      BichuAlvoDeToque.critico,
      alturaDoNome + alturaDoPet + _respiroVertical,
    );
  }

  static bool _temPet(String? pet) => pet != null && pet.trim().isNotEmpty;

  /// O estilo do titulo da barra, tal como o tema o define -- e nao uma copia.
  ///
  /// Copiar `headlineSmall` aqui seria a segunda definicao do estilo da barra, e
  /// a segunda e onde uma troca de token nao chega.
  static TextStyle _estiloDoNome(ThemeData tema) {
    return tema.appBarTheme.titleTextStyle ??
        tema.textTheme.headlineSmall ??
        const TextStyle(fontSize: 26);
  }

  static TextStyle _estiloDoPet(ThemeData tema, BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return (tema.textTheme.bodyMedium ?? const TextStyle(fontSize: 14))
        .copyWith(color: cores.textSecondary);
  }

  static double _alturaDe(
    String texto,
    TextStyle estilo,
    TextScaler escala,
    double largura,
    int? maxLinhas,
  ) {
    final pintor = TextPainter(
      text: TextSpan(text: texto, style: estilo),
      textDirection: TextDirection.ltr,
      textScaler: escala,
      maxLines: maxLinhas,
    )..layout(maxWidth: largura);
    final altura = pintor.height;
    pintor.dispose();
    return altura;
  }

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final petDaConversa = pet;
    return Column(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        // O NOME ENVOLVE, e a barra ja foi dimensionada por `alturaDaBarra`
        // para o que ele pede.
        //
        // **`softWrap` e `overflow` SAO EXPLICITOS, e tirar qualquer um dos
        // dois devolve o defeito.** A `AppBar` envolve o titulo num
        // `DefaultTextStyle` com `softWrap: false` e
        // `overflow: TextOverflow.ellipsis` -- e e dela que vinha a elipse no
        // nome. Herdar o padrao do slot de titulo era, literalmente, o corte.
        Text(
          nome,
          style: _estiloDoNome(tema),
          softWrap: true,
          overflow: TextOverflow.visible,
        ),
        if (_temPet(petDaConversa))
          Text(
            petDaConversa!,
            style: _estiloDoPet(tema, context),
            // E AQUI QUE A ELIPSE MORA, e so aqui: o pet e o que cede o fim.
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
      ],
    );
  }
}
