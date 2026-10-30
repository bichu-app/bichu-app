import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import 'botao_primario.dart';
import 'faixa_de_aviso.dart';

/// O pe de **toda listagem paginada** do app: pedir a pagina seguinte, dizer
/// que a lista acabou, e dizer que o pedido falhou.
class RodapeDaPaginacao extends StatelessWidget {
  const RodapeDaPaginacao({
    required this.carregados,
    required this.total,
    required this.aoPedirMais,
    required this.fimDaLista,
    super.key,
    this.carregando = false,
    this.textoDaFalha,
  });

  /// Quantos itens **estao na tela agora**, somando todas as paginas pedidas.
  final int carregados;

  /// Quantos itens o recorte atual tem **no servidor**.
  final int total;

  /// Pede a pagina seguinte. Serve tambem ao `Tentar de novo` do erro: e o
  /// mesmo pedido, e um segundo callback so daria a duas coisas iguais a chance
  /// de divergir.
  final VoidCallback aoPedirMais;

  /// A frase do fim da lista, montada com o [total].
  final String Function(int total) fimDaLista;

  final bool carregando;

  /// Por que o pedido da pagina seguinte falhou.
  final String? textoDaFalha;

  static const String rotuloDeCarregarMais = 'Carregar mais';

  static const String rotuloDeTentarDeNovo = 'Tentar de novo';

  /// Ha pagina seguinte para pedir.
  bool get temMais => carregados < total;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    if (textoDaFalha != null) {
      return FaixaDeAviso(
        texto: textoDaFalha!,
        rotuloDaAcao: rotuloDeTentarDeNovo,
        aoTocarNaAcao: aoPedirMais,
      );
    }

    if (!temMais) {
      return Text(
        fimDaLista(total),
        style: textos.bodySmall?.copyWith(color: cores.textSecondary),
      );
    }

    return BotaoSecundario(
      rotulo: rotuloDeCarregarMais,
      aoTocar: aoPedirMais,
      carregando: carregando,
    );
  }
}

/// Espaco entre o ultimo cartao e o rodape.
const double espacoAcimaDoRodape = BichuEspaco.e4;
