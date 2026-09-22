import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../roteamento/rotas.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// O que a saida promete a quem toca nela.
///
/// A distincao nao e de icone, e de verdade: cada uma afirma uma coisa
/// diferente sobre o que existe atras da tela, e afirmar a errada e mentir
/// para quem esta com pressa.
enum TipoDeSaida {
  /// A tela e um **desvio**: o passo anterior existe e continua na pilha.
  /// Voltar devolve a pessoa a ele, com o que ela tinha digitado no lugar.
  voltar,

  /// A tela e um **destino**: o passo anterior foi substituido de proposito e
  /// nao existe mais. Nao ha para onde voltar; ha de onde sair.
  fechar,
}

/// O controle de saida das telas que cobrem a casca de abas.
///
/// **Por que ele e explicito, e nao a seta automatica do Flutter.** O
/// `AppBar` desenha a seta sozinho quando ha algo para desempilhar, e so
/// nesse caso. Uma tela alcancada por link direto (F5: App Links e Universal
/// Links entregam uma URL com o app fechado) nasce com a pilha de uma pagina
/// so, e ali a seta automatica simplesmente nao aparece. Saida que depende do
/// estado da pilha e saida que some justamente no caminho que ninguem testa a
/// mao. Este botao existe sempre, e quando nao ha o que desempilhar ele cai no
/// [escape] que a tela declarou.
///
/// **Por que 64 dp e nao 48.** O piso critico do sistema (design system 6.5,
/// pesquisa de UX 15.1) vale para quem esta em pe, com um animal em um dos
/// bracos, usando o polegar da outra mao. Sair de uma tela em que se caiu por
/// engano e exatamente essa situacao. Voltar e fechar nao sao excecao ao piso.
///
/// **Por que tooltip.** `IconButton` sem `tooltip` nem rotulo semantico e
/// anunciado por VoiceOver e TalkBack como "botao", e nada mais (WCAG 2.1 SC
/// 4.1.2). O tooltip vira o nome acessivel do controle.
class SaidaDaTela extends StatelessWidget {
  const SaidaDaTela({
    required this.tipo,
    super.key,
    this.escape = Rotas.pets,
  });

  final TipoDeSaida tipo;

  /// Para onde ir quando nao ha nada para desempilhar. `Pets` e o default
  /// porque ele e a secao de aterrissagem -- a unica tela do app que nunca
  /// exige conta e nunca depende de
  /// um passo anterior.
  final String escape;

  @override
  Widget build(BuildContext context) {
    final voltar = tipo == TipoDeSaida.voltar;
    // "Voltar" e "Fechar" sao as palavras que o proprio sistema usa para estes
    // dois controles, e o design system ja as emprega: a ordem de foco do
    // paragrafo 11.0 comeca por "voltar", e o paragrafo 11.12 fala do `close`
    // "anunciado como fechar". Nao ha microcopy nova aqui.
    final rotulo = voltar ? 'Voltar' : 'Fechar';

    return IconButton(
      onPressed: () {
        if (context.canPop()) {
          context.pop();
          return;
        }
        context.go(escape);
      },
      tooltip: rotulo,
      icon: Icon(voltar ? Icons.arrow_back : Icons.close),
      iconSize: 24,
      // O alvo e o que decide, nao o desenho do icone (11.12).
      constraints: const BoxConstraints(
        minWidth: BichuAlvoDeToque.critico,
        minHeight: BichuAlvoDeToque.critico,
      ),
      padding: EdgeInsets.zero,
      color: BichuColors.of(context).cores.textPrimary,
      focusColor: BichuColors.of(context).cores.focusRing,
      style: IconButton.styleFrom(
        minimumSize: const Size.square(BichuAlvoDeToque.critico),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(BichuRaio.sm),
        ),
      ),
    );
  }
}

/// A barra de topo das telas de conta: titulo e saida, sempre as duas.
///
/// Ela existe para que "tela de conta com saida" seja uma decisao tomada num
/// lugar so. Uma tela nova de conta que use `AppBar` cru volta a nascer sem
/// saida, e o defeito reaparece calado.
///
/// A altura sobe de 56 para 64 porque o alvo de saida e de 64: barra de 56 com
/// alvo de 64 estoura o leiaute, e reduzir o alvo para caber na barra e
/// escolher a medida errada das duas.
class BarraDeConta extends StatelessWidget implements PreferredSizeWidget {
  const BarraDeConta({
    required this.titulo,
    required this.saida,
    super.key,
    this.escape = Rotas.pets,
  });

  final String titulo;
  final TipoDeSaida saida;
  final String escape;

  @override
  Size get preferredSize =>
      const Size.fromHeight(BichuAlvoDeToque.critico);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      toolbarHeight: BichuAlvoDeToque.critico,
      leadingWidth: BichuAlvoDeToque.critico,
      leading: SaidaDaTela(tipo: saida, escape: escape),
      title: Text(titulo),
    );
  }
}
