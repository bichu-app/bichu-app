import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// A CASCA DAS PAGINAS INTERNAS: capa, `Voltar` flutuante e a barra que volta
/// com a rolagem.
class CascaDaPaginaInterna extends StatefulWidget {
  const CascaDaPaginaInterna({
    required this.nome,
    required this.prefixoAnunciado,
    required this.aoVoltar,
    required this.filhos,
    super.key,
    this.temCapa = true,
    this.proporcaoDaCapa = 16 / 9,
    this.recuo = const EdgeInsets.only(bottom: BichuEspaco.e8),
  });

  /// O nome da coisa que a pagina mostra: o titulo do evento, o nome do local.
  final String nome;

  /// A palavra que diz QUE TIPO de pagina e esta, no anuncio da rota:
  /// `'Evento'`, `'Local'`.
  final String prefixoAnunciado;

  final VoidCallback aoVoltar;

  /// O conteudo da pagina, do jeito que ela monta.
  final List<Widget> filhos;

  /// Ha uma capa de borda a borda no topo?
  final bool temCapa;

  /// A proporcao da capa, que e o que decide ONDE a barra entra.
  final double proporcaoDaCapa;

  /// O recuo do `ListView`. O evento usa so o rodape; o local usa vertical.
  final EdgeInsetsGeometry recuo;

  @override
  State<CascaDaPaginaInterna> createState() => _CascaDaPaginaInternaState();
}

class _CascaDaPaginaInternaState extends State<CascaDaPaginaInterna> {
  final ScrollController _rolagem = ScrollController();
  bool _rolou = false;

  @override
  void initState() {
    super.initState();
    _rolagem.addListener(_aoRolar);
  }

  @override
  void dispose() {
    _rolagem.dispose();
    super.dispose();
  }

  bool get _barraVisivel => !widget.temCapa || _rolou;

  void _aoRolar() {
    final largura = MediaQuery.sizeOf(context).width;
    final limite =
        largura / widget.proporcaoDaCapa - BichuAlvoDeToque.min;
    final rolou = _rolagem.hasClients && _rolagem.offset > limite;
    if (rolou != _rolou) setState(() => _rolou = rolou);
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Scaffold(
      body: SafeArea(
        child: Semantics(
          scopesRoute: true,
          namesRoute: true,
          explicitChildNodes: true,
          label: '${widget.prefixoAnunciado}: ${widget.nome}',
          child: Stack(
            children: <Widget>[
              ListView(
                controller: _rolagem,
                padding: widget.recuo,
                children: widget.filhos,
              ),
              if (_barraVisivel)
                Positioned(
                  left: 0,
                  right: 0,
                  top: 0,
                  child: Material(
                    color: cores.surface,
                    elevation: 0,
                    child: Container(
                      height: BichuAlvoDeToque.critico,
                      decoration: BoxDecoration(
                        border: Border(
                          bottom: BorderSide(
                            color: cores.outline,
                            width: BichuBorda.hairline,
                          ),
                        ),
                        boxShadow:
                            Theme.of(context).brightness == Brightness.dark
                                ? null
                                : BichuSombra.sm,
                      ),
                      child: Row(
                        children: <Widget>[
                          BotaoVoltarNaBarra(aoTocar: widget.aoVoltar),
                          Expanded(
                            child: Text(
                              widget.nome,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: textos.titleMedium,
                            ),
                          ),
                          const SizedBox(width: BichuEspaco.e4),
                        ],
                      ),
                    ),
                  ),
                )
              else
                Positioned(
                  left: BichuEspaco.e2,
                  top: BichuEspaco.e2,
                  child: BotaoVoltarSobreMidia(aoTocar: widget.aoVoltar),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// `Voltar` sobre superficie de tema: a barra de topo normal e a casca de carga
/// e de falha das paginas internas.
class BotaoVoltarNaBarra extends StatelessWidget {
  const BotaoVoltarNaBarra({required this.aoTocar, super.key});

  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: aoTocar,
      tooltip: 'Voltar',
      icon: const Icon(Icons.arrow_back),
      constraints: const BoxConstraints(
        minWidth: BichuAlvoDeToque.critico,
        minHeight: BichuAlvoDeToque.critico,
      ),
      color: BichuColors.of(context).cores.textPrimary,
    );
  }
}

/// `Botao sobre midia`: 48 dp, fundo `surface`, sombra propria, para o
/// contraste nao depender da foto (24.12.1 e 24.12.6).
class BotaoVoltarSobreMidia extends StatelessWidget {
  const BotaoVoltarSobreMidia({required this.aoTocar, super.key});

  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final escuro = Theme.of(context).brightness == Brightness.dark;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: cores.surface,
        shape: BoxShape.circle,
        boxShadow: escuro ? null : BichuSombra.md,
        border: escuro
            ? Border.all(color: cores.outline, width: BichuBorda.hairline)
            : null,
      ),
      child: IconButton(
        onPressed: aoTocar,
        tooltip: 'Voltar',
        icon: const Icon(Icons.arrow_back),
        constraints: const BoxConstraints(
          minWidth: BichuAlvoDeToque.min,
          minHeight: BichuAlvoDeToque.min,
        ),
        color: cores.textPrimary,
      ),
    );
  }
}
