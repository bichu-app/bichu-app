import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// Uma opcao da lista fechada.
class ItemDeLista {
  const ItemDeLista({required this.codigo, required this.rotulo});

  final String codigo;
  final String rotulo;
}

/// O campo que abre uma **lista fechada**.
class SeletorDeLista extends StatelessWidget {
  const SeletorDeLista({
    required this.rotulo,
    required this.itens,
    required this.selecionado,
    required this.aoSelecionar,
    super.key,
    this.ajuda,
    this.erro,
    this.estadoInicial = 'Escolher na lista',
    this.habilitado = true,
  });

  final String rotulo;
  final List<ItemDeLista> itens;

  /// O codigo escolhido, ou nulo quando ainda nao ha escolha.
  final String? selecionado;

  final ValueChanged<String?> aoSelecionar;

  /// O requisito, dito antes da tentativa (UX secao 13).
  final String? ajuda;

  final String? erro;

  /// O que o campo mostra enquanto nada foi escolhido.
  final String estadoInicial;

  /// Falso enquanto a lista nao carregou.
  final bool habilitado;

  ItemDeLista? get _escolhido {
    for (final item in itens) {
      if (item.codigo == selecionado) return item;
    }
    return null;
  }

  Future<void> _abrir(BuildContext context) async {
    final escolha = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => _FolhaDeEscolha(
        titulo: rotulo,
        itens: itens,
        selecionado: selecionado,
      ),
    );
    if (escolha == null) return;
    aoSelecionar(escolha);
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final temErro = erro != null && erro!.isNotEmpty;
    final escolhido = _escolhido;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          rotulo,
          style: textos.labelLarge?.copyWith(color: cores.textPrimary),
        ),
        const SizedBox(height: BichuEspaco.e1),
        if (ajuda != null) ...<Widget>[
          Text(
            ajuda!,
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          ),
          const SizedBox(height: BichuEspaco.e2),
        ],
        Semantics(
          button: true,
          enabled: habilitado,
          label: '$rotulo, ${escolhido?.rotulo ?? estadoInicial}',
          excludeSemantics: true,
          onTap: habilitado ? () => _abrir(context) : null,
          child: InkWell(
            onTap: habilitado ? () => _abrir(context) : null,
            borderRadius: BorderRadius.circular(BichuRaio.md),
            focusColor: cores.focusRing,
            child: Container(
              constraints: const BoxConstraints(
                minHeight: BichuAlvoDeToque.min,
              ),
              padding: const EdgeInsets.symmetric(
                horizontal: BichuEspaco.e4,
                vertical: BichuEspaco.e3,
              ),
              decoration: BoxDecoration(
                color: habilitado ? cores.surface : cores.disabledSurface,
                borderRadius: BorderRadius.circular(BichuRaio.md),
                border: Border.all(
                  color: temErro ? cores.error : cores.outlineControl,
                  width: temErro ? BichuBorda.medium : BichuBorda.hairline,
                ),
              ),
              child: Row(
                children: <Widget>[
                  Expanded(
                    child: Text(
                      escolhido?.rotulo ?? estadoInicial,
                      style: textos.bodyLarge?.copyWith(
                        color: escolhido == null
                            ? cores.textMuted
                            : cores.textPrimary,
                      ),
                    ),
                  ),
                  Icon(
                    Icons.expand_more,
                    color: cores.textSecondary,
                    semanticLabel: '',
                  ),
                ],
              ),
            ),
          ),
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
    );
  }
}

class _FolhaDeEscolha extends StatelessWidget {
  const _FolhaDeEscolha({
    required this.titulo,
    required this.itens,
    required this.selecionado,
  });

  final String titulo;
  final List<ItemDeLista> itens;
  final String? selecionado;

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;

    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.7,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: BichuEspaco.e6,
                vertical: BichuEspaco.e2,
              ),
              child: Semantics(
                header: true,
                child: Text(titulo, style: textos.titleLarge),
              ),
            ),
            Flexible(
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: itens.length,
                itemBuilder: (context, i) {
                  final item = itens[i];
                  return ListTile(
                    minTileHeight: BichuAlvoDeToque.min,
                    title: Text(item.rotulo),
                    selected: item.codigo == selecionado,
                    trailing: item.codigo == selecionado
                        ? const Icon(Icons.check, semanticLabel: '')
                        : null,
                    onTap: () => Navigator.of(context).pop(item.codigo),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
