import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// A barra de acao fixa do rodape (design system 11.8).
///
/// Todas as telas desta entrega a trazem no Figma, e o motivo e sempre o
/// mesmo: **a acao primaria nao pode depender de rolagem**. A tela de
/// cadastro tem sete campos e a de sinais tem um bloco de ajuda de quatro
/// paragrafos; sem a barra ancorada, o `Continuar` de F1.3 fica abaixo da
/// dobra em aparelho pequeno com a fonte do sistema aumentada, e a pessoa
/// conclui que a tela nao tem saida.
///
/// O M3 nao tem "barra de acao fixa": e layout, e nao componente (tabela do
/// paragrafo 11 do design system). Ela vive em `Scaffold.bottomNavigationBar`
/// para que o `Scaffold` a levante junto com o teclado e respeite a area
/// segura inferior, que muda em tempo de execucao com a barra de gestos.
class BarraDeAcaoFixa extends StatelessWidget {
  const BarraDeAcaoFixa({required this.acoes, super.key});

  /// Da principal para a ultima. A principal tem 64 dp de alvo; as demais, 48.
  final List<Widget> acoes;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;

    return Container(
      decoration: BoxDecoration(
        color: cores.surface,
        border: Border(
          top: BorderSide(color: cores.outline, width: BichuBorda.hairline),
        ),
      ),
      child: SafeArea(
        // So a borda de baixo: as laterais e o topo desta caixa sao a borda da
        // barra, e aplicar a area segura neles deixaria a linha superior solta
        // do canto da tela.
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              for (var i = 0; i < acoes.length; i++) ...<Widget>[
                if (i > 0) const SizedBox(height: BichuEspaco.e3),
                acoes[i],
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// O passo do assistente de cadastro, dito em texto e nao so em barra.
///
/// "Passo 2 de 3" e anunciado pelo leitor de tela como cabecalho da tela
/// (UX F1.3/F1.4/F1.5, acessibilidade das tres). Uma barra de progresso sem
/// texto e invisivel para quem nao ve a barra.
class IndicadorDePasso extends StatelessWidget {
  const IndicadorDePasso({
    required this.passo,
    required this.total,
    required this.titulo,
    super.key,
  });

  final int passo;
  final int total;
  final String titulo;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Semantics(
          // Nao e cabecalho: o cabecalho da tela e o titulo abaixo. Isto e o
          // estado do assistente, e ele precisa ser lido junto, e nao como uma
          // segunda secao.
          child: Text(
            'Passo $passo de $total',
            style: textos.labelMedium?.copyWith(color: cores.primary),
          ),
        ),
        const SizedBox(height: BichuEspaco.e2),
        Semantics(
          header: true,
          child: Text(titulo, style: textos.headlineSmall),
        ),
      ],
    );
  }
}
