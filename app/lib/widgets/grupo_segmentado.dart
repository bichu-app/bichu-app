import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// Uma opcao do grupo segmentado: o valor que vai ao servidor e o rotulo que
/// a pessoa le.
class OpcaoSegmentada<T> {
  const OpcaoSegmentada({required this.valor, required this.rotulo});

  final T valor;
  final String rotulo;
}

/// O grupo segmentado do sistema (design system 11.17): `SegmentedButton` do
/// M3 com altura 48 e raio `md` em vez de capsula.
///
/// **E um `radiogroup` com rotulo de grupo**, e nao uma fileira de botoes
/// (UX, acessibilidade de F1.3/F1.4/F1.5). A diferenca importa para quem usa
/// leitor de tela: sem o rotulo do grupo, "Cachorro" e anunciado sozinho e nao ha
/// como saber que a pergunta era a especie.
///
/// Maximo de tres segmentos com rotulo de uma palavra. Acima disso o rotulo
/// mais longo quebra em duas linhas quando a fonte do sistema esta em 200%, e
/// o caminho certo passa a ser a lista.
class GrupoSegmentado<T> extends StatelessWidget {
  const GrupoSegmentado({
    required this.rotulo,
    required this.opcoes,
    required this.selecionado,
    required this.aoSelecionar,
    super.key,
    this.erro,
    this.rotuloVisivel = true,
  });

  final String rotulo;

  /// Desenha o [rotulo] como `Text` acima dos segmentos. **O padrao e `true`,
  /// e com ele nada muda**: os 7 outros grupos deste app nao passam este
  /// campo e continuam exatamente como estavam.
  ///
  /// `false` esconde a LINHA e **nao o nome**: o [rotulo] continua indo para
  /// `Semantics.label`, porque e dele que depende o anuncio
  /// "Espécie, Cachorro, selecionado" em vez de "Cachorro" -- e e por isso que este
  /// campo existe em vez de a tela passar `rotulo: ''`. Um grupo de radio sem
  /// nome e um grupo que, para quem nao ve a tela, nao tem pergunta.
  ///
  /// O primeiro e unico uso e a especie em F3.5, por pedido do cliente de
  /// 22/10/2026: o titulo do passo ja fazia a pergunta, e o rotulo a repetia
  /// logo abaixo. **So use quando houver, na tela, um cabecalho que diga a
  /// mesma coisa** -- esconder o rotulo de um grupo solto deixa a pessoa que
  /// VE a tela sem a pergunta.
  final bool rotuloVisivel;
  final List<OpcaoSegmentada<T>> opcoes;
  final T? selecionado;
  final ValueChanged<T> aoSelecionar;
  final String? erro;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final temErro = erro != null && erro!.isNotEmpty;

    return Semantics(
      // O rotulo do grupo viaja junto de cada opcao: o leitor de tela anuncia
      // "Espécie, Cachorro, selecionado" em vez de "Cachorro".
      container: true,
      label: rotulo,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          if (rotuloVisivel) ...<Widget>[
            Text(
              rotulo,
              style: textos.labelLarge?.copyWith(color: cores.textPrimary),
            ),
            const SizedBox(height: BichuEspaco.e2),
          ],
          Wrap(
            spacing: BichuAlvoDeToque.gapMin,
            runSpacing: BichuAlvoDeToque.gapMin,
            children: <Widget>[
              for (final opcao in opcoes)
                _Segmento<T>(
                  opcao: opcao,
                  selecionado: opcao.valor == selecionado,
                  aoTocar: () => aoSelecionar(opcao.valor),
                ),
            ],
          ),
          if (temErro) ...<Widget>[
            const SizedBox(height: BichuEspaco.e2),
            Semantics(
              liveRegion: true,
              child: Text(
                erro!,
                style: textos.bodyMedium?.copyWith(color: cores.error),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Segmento<T> extends StatelessWidget {
  const _Segmento({
    required this.opcao,
    required this.selecionado,
    required this.aoTocar,
  });

  final OpcaoSegmentada<T> opcao;
  final bool selecionado;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      inMutuallyExclusiveGroup: true,
      selected: selecionado,
      button: true,
      label: opcao.rotulo,
      excludeSemantics: true,
      // Sem esta linha o segmento sai da arvore com `button: true` e ZERO
      // acoes -- medido: `Cao`, `Gato`, `Outro`, `Pequeno` e `Medio` saiam
      // todos com `tap=false`. `excludeSemantics: true` leva junto a acao que
      // o `InkWell` abaixo publica, e quem usa leitor de tela ouvia o nome da
      // opcao sem receber como escolhe-la (WCAG 2.1 SC 4.1.2).
      onTap: aoTocar,
      child: InkWell(
        onTap: aoTocar,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        focusColor: cores.focusRing,
        child: Container(
          constraints: const BoxConstraints(
            minWidth: 80,
            // O piso generico do produto. O segmento nao e acao critica: a
            // acao critica desta tela e o botao da barra de baixo.
            minHeight: BichuAlvoDeToque.min,
          ),
          padding: const EdgeInsets.symmetric(horizontal: BichuEspaco.e4),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            // Selecionado usa o container de marca, e nao o preenchimento de
            // acao: `action-fill` e um dos quatro papeis nunca-texto, e o
            // rotulo do segmento e texto por cima do preenchimento.
            color: selecionado ? cores.primaryContainer : cores.surface,
            borderRadius: BorderRadius.circular(BichuRaio.md),
            border: Border.all(
              color: selecionado ? cores.primary : cores.outlineControl,
              width: selecionado ? BichuBorda.medium : BichuBorda.hairline,
            ),
          ),
          child: Text(
            opcao.rotulo,
            textAlign: TextAlign.center,
            style: textos.labelLarge?.copyWith(
              color: selecionado ? cores.onPrimaryContainer : cores.textPrimary,
            ),
          ),
        ),
      ),
    );
  }
}
