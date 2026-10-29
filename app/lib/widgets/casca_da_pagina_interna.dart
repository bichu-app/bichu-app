import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// A CASCA DAS PAGINAS INTERNAS: capa, `Voltar` flutuante e a barra que volta
/// com a rolagem.
///
/// ## Por que ela existe, e por que ela nasceu agora
///
/// Pedido do cliente em 28/10/2026: *"na pagina interna da comunidade, vamos
/// tirar o titulo e manter o padrao do botao voltar igual da pagina de
/// eventos."* As duas paginas internas do app -- a ficha de um evento
/// (`telas/rede/encontro_da_rede.dart`) e a ficha de um local
/// (`telas/perto/pagina_do_local.dart`) -- desenhavam a mesma casca de
/// maneiras diferentes: a do evento tinha a capa com `Voltar` flutuante e a
/// barra que aparece na rolagem, e a do local tinha um `AppBar` comum com o
/// nome no titulo.
///
/// **Copiar a casca do evento para o local faria DUAS copias da mesma regra**,
/// e duas copias divergem na primeira edicao -- que e exatamente o defeito que
/// este pedido conserta. Entao a casca saiu das duas telas e virou isto, e as
/// duas a consomem. O que o cliente chamou de "o mesmo padrao" passou a ser
/// literalmente o mesmo codigo.
///
/// ## O NOME CONTINUA ANUNCIAVEL, e isso nao e efeito colateral
///
/// Tirar o titulo da barra tiraria o nome do leitor de tela se o nome
/// estivesse SO ali. Nao esta: quem anuncia a pagina e o `Semantics` de ROTA
/// desta casca (`namesRoute`), com `'<prefixo>: <nome>'` -- `Evento: Encontro
/// no parque`, `Local: Clinica Santa Barbara`. E o mesmo mecanismo que a
/// pagina do evento ja usava desde a UX 28.7.2, e a pagina do local tambem ja
/// tinha o seu (com o `AppBar` por cima, o nome era anunciado DUAS vezes).
///
/// Entao, para quem usa leitor de tela, tirar o titulo visivel **tira uma
/// repeticao** e nao a informacao. O nome tambem continua visivel na barra
/// assim que a capa sai da tela.
///
/// ## A barra aparece quando a capa sai, e com capa de mentira ela nao espera
///
/// Com capa ([temCapa] verdadeiro), o `Voltar` comeca FLUTUANTE sobre a imagem
/// e a barra normal entra quando a capa sai da tela -- a partir da altura da
/// capa menos 48 dp (regra 24.17.1, item 7, da ficha do evento).
///
/// **Sem capa ([temCapa] falso) a barra nasce visivel**, e a diferenca e
/// medida e nao estetica: a pagina do local sem foto abre NO NOME, de
/// proposito -- ela nao desenha faixa 16:9 vazia, porque um retangulo cinza de
/// borda a borda empurraria `Informacoes` e a media para baixo da dobra em
/// toda entrada sem foto, que e a maioria delas. Sem capa, um botao redondo
/// flutuante pousaria em cima do nome. Com a barra desde o inicio, o `Voltar`
/// tem fundo proprio e o nome tem onde ficar.
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
  ///
  /// Vai para a barra (quando ela aparece) e para o anuncio da rota. **Nao vai
  /// para um titulo fixo**: o pedido de 28/10/2026 e justamente nao ter um.
  final String nome;

  /// A palavra que diz QUE TIPO de pagina e esta, no anuncio da rota:
  /// `'Evento'`, `'Local'`.
  ///
  /// Ela nunca e desenhada. Existe porque `namesRoute` sem ela anunciaria so o
  /// nome, e quem chega de outra tela precisa saber em que tipo de pagina
  /// entrou antes de ouvir qual.
  final String prefixoAnunciado;

  final VoidCallback aoVoltar;

  /// O conteudo da pagina, do jeito que ela monta. O primeiro filho e a capa
  /// quando [temCapa] e verdadeiro.
  final List<Widget> filhos;

  /// Ha uma capa de borda a borda no topo? Ver a prosa da classe.
  final bool temCapa;

  /// A proporcao da capa, que e o que decide ONDE a barra entra.
  ///
  /// **Parametro e nao constante importada**: a proporcao e do conteudo (a
  /// derivada que o servidor cortou), e um widget de `widgets/` que importasse
  /// a constante de `telas/rede/` inverteria a dependencia.
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

  /// Sem capa a barra esta sempre la; com capa, ela entra quando a capa sai.
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
          // A ROTA ANUNCIA `<prefixo>: <nome>`, e e ela que mantem o nome
          // anunciavel sem titulo na barra. Ver a prosa da classe.
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

/// `Voltar` sobre superficie de tema: a barra de topo normal e a casca de
/// carga e de falha das paginas internas.
///
/// **`tooltip` nao e enfeite**: `IconButton` sem ele e anunciado como "botao" e
/// nada mais (WCAG 2.1 SC 4.1.2), e o portao de saida de
/// `barra_fixa_em_toda_tela_test.dart` cobra a palavra `Voltar` em toda tela
/// empilhada.
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
