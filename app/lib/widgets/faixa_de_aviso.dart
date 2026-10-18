import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// Os dois pesos de mensagem que a tela pode mostrar.
enum PesoDaFaixa {
  /// Exige acao de quem esta lendo. Equivale a `role="alert"` e e anunciado
  /// assim que aparece.
  erro,

  /// Informa sem exigir acao. Equivale a `role="status"` com
  /// `aria-live="polite"`.
  informativo,
}

/// A faixa de mensagem acima da acao.
///
/// Nao ha cor de aviso neste sistema: a manteiga da marca ocupa aquele matiz,
/// entao aviso e banner **neutro** com icone e texto (secao 6.3). Erro usa a
/// tinta Brasa em texto e borda de 2px, e nunca uma barra preenchida, que e a
/// forma reservada a urgencia (secao 6.4).
class FaixaDeAviso extends StatelessWidget {
  const FaixaDeAviso({
    required this.texto,
    super.key,
    this.peso = PesoDaFaixa.erro,
    this.rotuloDaAcao,
    this.aoTocarNaAcao,
  });

  /// A frase que a pessoa le. **Pode ser vazia**, e ai a faixa nao desenha
  /// linha de texto nenhuma.
  ///
  /// Vazio e um estado legitimo desde 18/10/2026: o cliente mandou remover o
  /// texto do 401 `unauthenticated` (*"entre na sua conta para continuar..."*)
  /// e a saida dele -- o botao `Entrar` -- ficou. Sem a guarda de [build]
  /// sobrava um `Text` vazio dentro de um `Expanded`, que o leitor de tela
  /// anuncia SEM DIZER NADA, mais os 8 dp de respiro antes da acao.
  ///
  /// **Vazio nao e o estado normal**, e nenhuma faixa nova deve nascer assim:
  /// faixa de erro sem frase e sem acao e falha calada.
  final String texto;
  final PesoDaFaixa peso;
  final String? rotuloDaAcao;
  final VoidCallback? aoTocarNaAcao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final erro = peso == PesoDaFaixa.erro;

    final corDoTexto = erro ? cores.error : cores.textPrimary;
    final fundo = erro ? cores.errorContainer : cores.warningContainer;
    final borda = erro ? cores.error : cores.outline;

    return Semantics(
      liveRegion: true,
      container: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(BichuEspaco.e4),
        decoration: BoxDecoration(
          color: fundo,
          borderRadius: BorderRadius.circular(BichuRaio.lg),
          border: Border.all(
            color: borda,
            width: erro ? BichuBorda.medium : BichuBorda.hairline,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Icon(
                  erro ? Icons.error_outline : Icons.info_outline,
                  color: corDoTexto,
                  size: 24,
                  semanticLabel: '',
                ),
                // O respiro acompanha o texto: sem frase, o icone nao fica com
                // 12 dp de nada a direita dele.
                if (texto.isNotEmpty) ...<Widget>[
                  const SizedBox(width: BichuEspaco.e3),
                  Expanded(
                    child: Text(
                      texto,
                      style: textos.bodyLarge?.copyWith(color: corDoTexto),
                    ),
                  ),
                ],
              ],
            ),
            if (rotuloDaAcao != null && aoTocarNaAcao != null) ...<Widget>[
              if (texto.isNotEmpty) const SizedBox(height: BichuEspaco.e2),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: aoTocarNaAcao,
                  child: Text(rotuloDaAcao!),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
