/// A alça no topo de uma folha, **decorativa**.
///
/// ## Por que ela mora aqui, e não dentro de uma folha
///
/// Ela nasceu privada em `folha_destrutiva.dart` e foi promovida em 29/10/2026,
/// quando a folha de recorte passou a precisar da MESMA alça (cliente, sobre
/// `Criar um encontro`: *"coloque aquela barra em cima, parecido nas outras
/// paginas quando o conteudo pode ser minimzado"*). O pedido é, literalmente,
/// pela linguagem que as outras folhas já usam -- então a resposta é a peça que
/// elas já usam, e não uma segunda com 36 x 4 escritos de novo. A segunda cópia
/// é a que diverge na primeira mudança de token.
///
/// ## Decorativa, e isso é decisão e não descuido
///
/// Fora da árvore de semântica (`ExcludeSemantics`): fechar **sempre tem também
/// um botão** -- o `X` na folha de recorte, o `Cancelar` na destrutiva -- e o
/// 11.9 do design system diz que a alça não é o caminho. Anunciá-la a um leitor
/// de tela criaria uma parada sem função.
///
/// **E ela não arrasta nada.** Na folha de recorte isso é mais que convenção:
/// `enableDrag: false` está lá porque o arraste vertical É a função principal
/// daquela folha, e dividi-lo com o fechamento fazia a pessoa perder a foto que
/// acabou de escolher. A alça ali diz "esta folha é uma folha"; quem fecha é o
/// botão.
library;

import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// A alça: 36 x 4, no `outline`, centrada.
///
/// Os dois números são os do Material e os mesmos que a folha destrutiva usava
/// antes da promoção -- mudá-los aqui muda as duas folhas de uma vez, que é o
/// ponto de ela ser uma peça só.
class AlcaDeArraste extends StatelessWidget {
  const AlcaDeArraste({super.key});

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return ExcludeSemantics(
      child: Center(
        child: Container(
          width: 36,
          height: 4,
          margin: const EdgeInsets.symmetric(vertical: BichuEspaco.e3),
          decoration: BoxDecoration(
            color: cores.outline,
            borderRadius: BorderRadius.circular(BichuRaio.full),
          ),
        ),
      ),
    );
  }
}
