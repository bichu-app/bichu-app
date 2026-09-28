import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../api/modelos_rede.dart';
import '../../dispositivo/saida_do_app.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';

/// Em que ponto esta o ponto do encontro.
///
/// O ponto so existe com conta (`getNetworkEventLocation`). A tela decide a
/// variante; este bloco so a desenha.
sealed class PontoNoBloco {
  const PontoNoBloco();
}

/// Sem conta, cancelado, ou o encontro nao tem ponto: **so o endereco**. Sem
/// area de mapa, sem distancia fora das regras, sem botao.
class SoEndereco extends PontoNoBloco {
  const SoEndereco();
}

/// A pergunta a `/location` ainda nao voltou.
class PontoCarregando extends PontoNoBloco {
  const PontoCarregando();
}

/// A pergunta a `/location` falhou.
class PontoComFalha extends PontoNoBloco {
  const PontoComFalha();
}

class PontoConhecido extends PontoNoBloco {
  const PontoConhecido(this.ponto);
  final PontoDoEncontro ponto;
}

/// De onde vem cada tile do mapa estatico. Troca so em teste.
///
/// **O provedor e o OpenStreetMap**, o mesmo que o backoffice usa para marcar
/// o ponto (ADR-0027 item 6, `tile.openstreetmap.org`). A politica de uso dele
/// pede identificacao do app no `User-Agent` e atribuicao visivel, e as duas
/// estao aqui. Nao ha chave nem segredo no binario. O estilo do mapa nao e
/// token (pedido P-M2, design system 24.8).
abstract final class FonteDeTiles {
  static const String agente = 'Bichu/1.0 (app Android; +https://bichu.app)';

  static ImageProvider Function(int zoom, int x, int y) construir = _osm;

  static ImageProvider _osm(int zoom, int x, int y) => NetworkImage(
        'https://tile.openstreetmap.org/$zoom/$x/$y.png',
        headers: const <String, String>{'User-Agent': agente},
      );

  static void restaurar() => construir = _osm;
}

/// O bloco `Local do encontro` (design system 24.4, textos da UX 28.1).
///
/// ```
/// [ mapa estatico 180 dp, com o pino ]          (so com ponto)
/// (lugar) Praça Benedito Calixto
///         Pinheiros · São Paulo, SP
///         A cerca de 1 km da sua região          (so publico, a vir)
/// [ Abrir no app de mapas  ↗ ]                    (so com ponto)
/// ```
///
/// ## O que o tipo impede (UX 28.4)
///
/// O bloco recebe [LugarDoEncontro] e [PontoNoBloco], que so nasce de
/// `getNetworkEventLocation`. **Nao ha construtor que aceite latitude e
/// longitude soltas**, e nenhum arquivo de `telas/perdido` ou `telas/achado`
/// importa este: o mapa do encontro nao tem como virar mapa de pet perdido.
///
/// ## A area do mapa esta fora da arvore de acessibilidade
///
/// O endereco em texto e o nome acessivel do lugar em todas as variantes, e o
/// botao rotulado e o caminho acessivel. O mapa carregado e tocavel e faz o
/// mesmo que o botao (UX 28.3, decisao 4), sem entrar no foco. A excecao e o
/// `Tentar de novo` do erro, que e controle.
class LocalDoEncontro extends StatefulWidget {
  const LocalDoEncontro({
    required this.lugar,
    required this.ponto,
    required this.aoTentarDeNovo,
    super.key,
    this.distanciaEmMetros,
    this.prazoDaImagem = const Duration(seconds: 15),
  });

  final LugarDoEncontro lugar;
  final PontoNoBloco ponto;

  /// Refaz a pergunta a `/location` quando ELA falhou.
  final VoidCallback aoTentarDeNovo;

  /// Ja filtrada pela tela: nula em privado, encerrado e cancelado.
  final int? distanciaEmMetros;

  /// Se a imagem nao chegar neste prazo, a variante passa a erro (UX 28.1).
  final Duration prazoDaImagem;

  static const String textoDoErro = 'Não conseguimos carregar o mapa agora.';
  static const String rotuloDeTentar = 'Tentar de novo';
  static const String nomeDeTentar = 'Tentar carregar o mapa de novo';
  static const String rotuloDoBotao = 'Abrir no app de mapas';
  static const String falhaAoAbrir = 'Não conseguimos abrir o app de mapas.';

  /// A chave da area do mapa, para as iscas acharem a area sem depender de
  /// texto (a area nao tem texto de proposito).
  static const Key chaveDoMapa = Key('mapa-do-encontro');

  @override
  State<LocalDoEncontro> createState() => _LocalDoEncontroState();
}

enum _Imagem { carregando, pronta, falhou }

class _LocalDoEncontroState extends State<LocalDoEncontro> {
  static const int _zoom = 16;
  static const double _tamanhoDoTile = 256;

  /// A altura da area do mapa: 180 dp (pedido de token P-M1, 24.8).
  static const double alturaDoMapa = 180;

  _Imagem _imagem = _Imagem.carregando;
  Timer? _prazo;
  final List<(ImageStream, ImageStreamListener)> _escutas =
      <(ImageStream, ImageStreamListener)>[];
  final FocusNode _focoDoBotao = FocusNode();
  bool _focarBotaoQuandoPronto = false;

  /// A geometria dos tiles depende da largura; ela e medida no primeiro
  /// `LayoutBuilder` e a carga comeca dali.
  double? _larguraCarregada;

  @override
  void didUpdateWidget(covariant LocalDoEncontro antigo) {
    super.didUpdateWidget(antigo);
    final antes = antigo.ponto;
    final agora = widget.ponto;
    if (agora is PontoConhecido &&
        (antes is! PontoConhecido ||
            antes.ponto.lat != agora.ponto.lat ||
            antes.ponto.lon != agora.ponto.lon)) {
      _larguraCarregada = null;
    }
  }

  @override
  void dispose() {
    _pararCarga();
    _focoDoBotao.dispose();
    super.dispose();
  }

  void _pararCarga() {
    _prazo?.cancel();
    _prazo = null;
    for (final (fluxo, escuta) in _escutas) {
      fluxo.removeListener(escuta);
    }
    _escutas.clear();
  }

  List<_Tile> _tiles(PontoDoEncontro p, double largura) {
    final n = math.pow(2, _zoom).toDouble();
    final xGlobal = (p.lon + 180) / 360 * n * _tamanhoDoTile;
    final latRad = p.lat * math.pi / 180;
    final yGlobal = (1 - math.log(math.tan(latRad) + 1 / math.cos(latRad)) / math.pi) /
        2 *
        n *
        _tamanhoDoTile;
    final esquerda = xGlobal - largura / 2;
    final topo = yGlobal - alturaDoMapa / 2;
    final tiles = <_Tile>[];
    for (var tx = (esquerda / _tamanhoDoTile).floor();
        tx <= ((esquerda + largura) / _tamanhoDoTile).floor();
        tx++) {
      for (var ty = (topo / _tamanhoDoTile).floor();
          ty <= ((topo + alturaDoMapa) / _tamanhoDoTile).floor();
          ty++) {
        tiles.add(
          _Tile(
            imagem: FonteDeTiles.construir(_zoom, tx, ty),
            esquerda: tx * _tamanhoDoTile - esquerda,
            topo: ty * _tamanhoDoTile - topo,
          ),
        );
      }
    }
    return tiles;
  }

  void _carregar(List<_Tile> tiles) {
    _pararCarga();
    setState(() => _imagem = _Imagem.carregando);
    var faltam = tiles.length;
    _prazo = Timer(widget.prazoDaImagem, () {
      if (!mounted || _imagem != _Imagem.carregando) return;
      setState(() => _imagem = _Imagem.falhou);
    });
    for (final tile in tiles) {
      final fluxo = tile.imagem.resolve(ImageConfiguration.empty);
      late final ImageStreamListener escuta;
      escuta = ImageStreamListener(
        (_, _) {
          faltam -= 1;
          if (faltam == 0 && mounted && _imagem == _Imagem.carregando) {
            _prazo?.cancel();
            setState(() => _imagem = _Imagem.pronta);
            if (_focarBotaoQuandoPronto) {
              _focarBotaoQuandoPronto = false;
              // `Tentar de novo` deixou de existir: o foco vai para o botao
              // de mapas (UX 28.1).
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (mounted) _focoDoBotao.requestFocus();
              });
            }
          }
        },
        // As escutas FICAM depois do primeiro erro: os outros tiles ainda vao
        // responder, e erro de imagem sem escuta vira excecao nao tratada.
        // Elas saem na proxima carga ou no `dispose`.
        onError: (_, _) {
          if (!mounted || _imagem != _Imagem.carregando) return;
          _prazo?.cancel();
          setState(() => _imagem = _Imagem.falhou);
        },
      );
      fluxo.addListener(escuta);
      _escutas.add((fluxo, escuta));
    }
  }

  Future<void> _abrirMapas() async {
    final ponto = widget.ponto;
    if (ponto is! PontoConhecido) return;
    final abriu = await SaidaDoApp.atual.abrirNoAppDeMapas(
      lat: ponto.ponto.lat,
      lon: ponto.ponto.lon,
      nomeDoLugar: widget.lugar.nomeDoLugar,
    );
    if (!abriu && mounted) {
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(
        const SnackBar(content: Text(LocalDoEncontro.falhaAoAbrir)),
      );
    }
  }

  void _tentarDeNovo() {
    _focarBotaoQuandoPronto = true;
    if (widget.ponto is PontoComFalha) {
      widget.aoTentarDeNovo();
      return;
    }
    // Repete so a imagem: nao recarrega o encontro nem move o foco.
    _larguraCarregada = null;
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final ponto = widget.ponto;
    final temArea = ponto is! SoEndereco;
    final temBotao = ponto is PontoConhecido;

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          if (temArea) _area(context),
          _Endereco(lugar: widget.lugar, distanciaEmMetros: widget.distanciaEmMetros),
          if (temBotao)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                BichuEspaco.e4,
                0,
                BichuEspaco.e4,
                BichuEspaco.e4,
              ),
              child: Semantics(
                button: true,
                label: '${LocalDoEncontro.rotuloDoBotao}: ${widget.lugar.nomeDoLugar}',
                onTap: _abrirMapas,
                excludeSemantics: true,
                child: OutlinedButton(
                  focusNode: _focoDoBotao,
                  onPressed: _abrirMapas,
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(BichuAlvoDeToque.critico),
                  ),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: <Widget>[
                      Flexible(child: Text(LocalDoEncontro.rotuloDoBotao)),
                      SizedBox(width: BichuEspaco.e2),
                      Icon(Icons.open_in_new, size: BichuEspaco.e5),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _area(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final ponto = widget.ponto;

    return SizedBox(
      key: LocalDoEncontro.chaveDoMapa,
      height: alturaDoMapa,
      child: LayoutBuilder(
        builder: (context, limites) {
          final largura = limites.maxWidth;
          List<_Tile> tiles = const <_Tile>[];
          if (ponto is PontoConhecido) {
            tiles = _tiles(ponto.ponto, largura);
            if (_larguraCarregada != largura) {
              _larguraCarregada = largura;
              final paraCarregar = tiles;
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (mounted) _carregar(paraCarregar);
              });
            }
          }

          final falhou = ponto is PontoComFalha ||
              (ponto is PontoConhecido && _imagem == _Imagem.falhou);
          final pronto = ponto is PontoConhecido && _imagem == _Imagem.pronta;

          if (falhou) {
            return ColoredBox(
              color: cores.surfaceSunken,
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(BichuEspaco.e4),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      ExcludeSemantics(
                        child: Icon(
                          Icons.error_outline,
                          size: BichuEspaco.e8,
                          color: cores.textSecondary,
                        ),
                      ),
                      const SizedBox(height: BichuEspaco.e2),
                      Text(
                        LocalDoEncontro.textoDoErro,
                        textAlign: TextAlign.center,
                        style: textos.bodySmall?.copyWith(color: cores.textPrimary),
                      ),
                      Semantics(
                        button: true,
                        label: LocalDoEncontro.nomeDeTentar,
                        onTap: _tentarDeNovo,
                        excludeSemantics: true,
                        child: TextButton(
                          onPressed: _tentarDeNovo,
                          style: TextButton.styleFrom(
                            minimumSize: const Size(
                              BichuAlvoDeToque.min,
                              BichuAlvoDeToque.min,
                            ),
                          ),
                          child: const Text(LocalDoEncontro.rotuloDeTentar),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }

          if (!pronto) {
            // Carregando: so o indicador, sem texto (UX 28.1), fora da arvore.
            return ExcludeSemantics(
              child: ColoredBox(
                color: cores.surfaceSunken,
                child: Center(
                  child: SizedBox(
                    width: BichuEspaco.e6,
                    height: BichuEspaco.e6,
                    child: CircularProgressIndicator(color: cores.primary),
                  ),
                ),
              ),
            );
          }

          return ExcludeSemantics(
            child: GestureDetector(
              onTap: _abrirMapas,
              child: ClipRect(
                child: Stack(
                  children: <Widget>[
                    for (final t in tiles)
                      Positioned(
                        left: t.esquerda,
                        top: t.topo,
                        width: _tamanhoDoTile,
                        height: _tamanhoDoTile,
                        child: Image(image: t.imagem, fit: BoxFit.fill),
                      ),
                    // O pino: ponta na coordenada, com halo de `surface` para
                    // nao sumir sobre a praca no tema escuro (24 e P-M2).
                    Positioned(
                      left: largura / 2 - BichuEspaco.e6 - BichuBorda.medium,
                      top: alturaDoMapa / 2 - BichuEspaco.e12,
                      child: Stack(
                        alignment: Alignment.center,
                        children: <Widget>[
                          Icon(
                            Icons.location_on,
                            size: BichuEspaco.e12 + BichuBorda.medium * 2,
                            color: cores.surface,
                          ),
                          Icon(
                            Icons.location_on,
                            size: BichuEspaco.e12,
                            color: cores.primary,
                          ),
                        ],
                      ),
                    ),
                    Positioned(
                      right: BichuEspaco.e1,
                      bottom: BichuEspaco.e1,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: BichuEspaco.e1,
                        ),
                        color: cores.surface.withValues(alpha: 0.85),
                        child: Text(
                          '© OpenStreetMap',
                          style: textos.labelSmall?.copyWith(
                            color: cores.textPrimary,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _Tile {
  const _Tile({required this.imagem, required this.esquerda, required this.topo});
  final ImageProvider imagem;
  final double esquerda;
  final double topo;
}

/// O endereco: um no semantico so, selecionavel em todas as variantes.
class _Endereco extends StatelessWidget {
  const _Endereco({required this.lugar, required this.distanciaEmMetros});

  final LugarDoEncontro lugar;
  final int? distanciaEmMetros;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final d = distanciaEmMetros;
    final falado = <String>[
      lugar.nomeDoLugar,
      lugar.bairro,
      lugar.cidade,
      lugar.uf,
      if (d != null) DistanciaDaRegiao.falado(d),
    ].join(', ');

    return Padding(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      child: Semantics(
        container: true,
        label: falado,
        excludeSemantics: true,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Icon(Icons.place, color: cores.primary),
            const SizedBox(width: BichuEspaco.e3),
            Expanded(
              child: SelectionArea(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      lugar.nomeDoLugar,
                      style: textos.labelLarge?.copyWith(color: cores.textPrimary),
                    ),
                    const SizedBox(height: BichuEspaco.e1),
                    Text(
                      lugar.bairroECidade,
                      style: textos.bodySmall?.copyWith(color: cores.textSecondary),
                    ),
                    if (d != null) ...<Widget>[
                      const SizedBox(height: BichuEspaco.e1),
                      Text(
                        DistanciaDaRegiao.texto(d),
                        style: textos.bodySmall?.copyWith(
                          color: cores.textSecondary,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
