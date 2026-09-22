import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// Uma opcao do grupo: o valor que a tela guarda e o rotulo que a pessoa le.
class OpcaoDeLinha<T> {
  const OpcaoDeLinha({required this.valor, required this.rotulo, this.detalhe});

  final T valor;
  final String rotulo;

  /// Uma segunda linha, quando a opcao precisa dizer o que ela significa.
  final String? detalhe;
}

/// Um **radiogroup vertical, com as opcoes a vista**.
///
/// ## Por que ele existe ao lado do `GrupoSegmentado` (11.17)
///
/// O segmentado do sistema declara o proprio limite: *"Maximo de tres
/// segmentos com rotulo de uma palavra. Acima disso o rotulo mais longo quebra
/// em duas linhas quando a fonte do sistema esta em 200%, e o caminho certo
/// passa a ser a lista."*
///
/// O `Quando?` de F3.1 tem **quatro** opcoes e tres delas sao de duas palavras
/// (`Hoje mais cedo`, `Outra data`). Empurra-las para dentro do segmentado
/// seria usar o componente contra o que ele mesmo diz.
///
/// ## Por que nao e o `SeletorDeLista`
///
/// Aquele abre uma folha inferior, e esconder as opcoes atras de um toque e
/// exatamente o que F3.1 recusa: *"Data em botoes de opcao, nao em seletor de
/// calendario. Um seletor de data para 96% dos casos ser 'agora' e atrito
/// puro."* A lista fechada tem o mesmo custo do calendario -- um toque a mais
/// antes de ver a resposta obvia.
///
/// ## Acessibilidade
///
/// Cada linha sai da arvore como uma opcao de grupo exclusivo, com o estado de
/// selecao anunciado **e com a acao de toque redeclarada**. `excludeSemantics`
/// apaga a arvore do filho inteira, e com ela o `onTap` que o `InkWell`
/// publica: sem a redeclaracao a linha se anuncia como controle e nao entrega
/// como aciona-lo, que e o defeito `btn=true tap=false` ja encontrado quatro
/// vezes neste app (WCAG 2.1 SC 4.1.2).
class GrupoDeOpcoes<T> extends StatelessWidget {
  const GrupoDeOpcoes({
    required this.rotulo,
    required this.opcoes,
    required this.selecionado,
    required this.aoSelecionar,
    super.key,
    this.erro,
  });

  /// O rotulo do grupo. Ele viaja junto de cada opcao: sem ele, o leitor de
  /// tela anuncia "Ontem" sozinho e nao ha como saber qual era a pergunta.
  final String rotulo;

  final List<OpcaoDeLinha<T>> opcoes;
  final T? selecionado;
  final ValueChanged<T> aoSelecionar;
  final String? erro;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final temErro = erro != null && erro!.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          rotulo,
          style: textos.labelLarge?.copyWith(color: cores.textPrimary),
        ),
        const SizedBox(height: BichuEspaco.e2),
        for (var i = 0; i < opcoes.length; i++) ...<Widget>[
          if (i > 0) const SizedBox(height: BichuAlvoDeToque.gapMin),
          _Linha<T>(
            rotuloDoGrupo: rotulo,
            opcao: opcoes[i],
            selecionada: opcoes[i].valor == selecionado,
            aoTocar: () => aoSelecionar(opcoes[i].valor),
          ),
        ],
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
    );
  }
}

class _Linha<T> extends StatelessWidget {
  const _Linha({
    required this.rotuloDoGrupo,
    required this.opcao,
    required this.selecionada,
    required this.aoTocar,
  });

  final String rotuloDoGrupo;
  final OpcaoDeLinha<T> opcao;
  final bool selecionada;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final detalhe = opcao.detalhe;

    return Semantics(
      inMutuallyExclusiveGroup: true,
      selected: selecionada,
      button: true,
      label: detalhe == null
          ? '$rotuloDoGrupo, ${opcao.rotulo}'
          : '$rotuloDoGrupo, ${opcao.rotulo}, $detalhe',
      excludeSemantics: true,
      // A LINHA QUE `excludeSemantics` COBRA. Ver o cabecalho da classe.
      onTap: aoTocar,
      child: InkWell(
        onTap: aoTocar,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        focusColor: cores.focusRing,
        child: Container(
          width: double.infinity,
          constraints: const BoxConstraints(minHeight: BichuAlvoDeToque.min),
          padding: const EdgeInsets.symmetric(
            horizontal: BichuEspaco.e4,
            vertical: BichuEspaco.e3,
          ),
          decoration: BoxDecoration(
            // Selecionado usa o container de marca, e nao o preenchimento de
            // acao: `action-fill` e papel nunca-texto, e o rotulo da opcao e
            // texto por cima do preenchimento.
            color: selecionada ? cores.primaryContainer : cores.surface,
            borderRadius: BorderRadius.circular(BichuRaio.md),
            border: Border.all(
              color: selecionada ? cores.primary : cores.outlineControl,
              width: selecionada ? BichuBorda.medium : BichuBorda.hairline,
            ),
          ),
          child: Row(
            children: <Widget>[
              // O estado tambem em FORMA, e nao so em cor (WCAG 2.1 SC 1.4.1):
              // a borda mais grossa some para quem nao distingue as duas cores.
              Icon(
                selecionada
                    ? Icons.radio_button_checked
                    : Icons.radio_button_unchecked,
                size: 24,
                color: selecionada ? cores.primary : cores.textSecondary,
              ),
              const SizedBox(width: BichuEspaco.e3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      opcao.rotulo,
                      style: textos.labelLarge?.copyWith(
                        color: selecionada
                            ? cores.onPrimaryContainer
                            : cores.textPrimary,
                      ),
                    ),
                    if (detalhe != null) ...<Widget>[
                      const SizedBox(height: BichuEspaco.e1),
                      Text(
                        detalhe,
                        style: textos.bodySmall?.copyWith(
                          color: cores.textSecondary,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
