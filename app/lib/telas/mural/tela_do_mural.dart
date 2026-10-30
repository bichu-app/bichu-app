import 'dart:async';

import 'package:flutter/foundation.dart' show ValueListenable;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/mural_api.dart';
import '../../roteamento/rotas.dart';
import '../../roteamento/saida_da_mensagem.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/imagem_da_rede.dart';
import '../../widgets/marca_da_pessoa.dart';
import '../../widgets/selo_de_validado.dart';
import '../../widgets/veu_do_autor_sobre_midia.dart';
import 'comentarios_da_publicacao.dart';
import 'porta_do_perfil_do_autor.dart';
import '../casca_com_abas.dart';

/// O corpo da secao `Mural`: **a linha do tempo.**
class CorpoDoMural extends StatefulWidget {
  const CorpoDoMural({
    required this.leitura,
    required this.interacao,
    super.key,
    this.aoDenunciar,
    this.aoApagar,
  });

  /// A leitura, por interface ESTREITA: esta tela nao alcanca `publicar` nem
  /// `apagar` por aqui.
  final LeituraDoMural leitura;

  /// Curtir, descurtir e comentar.
  final InteracaoDoMural interacao;

  /// Abre a denuncia de uma publicacao de OUTRA pessoa.
  final void Function(PublicacaoDaLinha)? aoDenunciar;

  /// Apaga a PROPRIA publicacao.
  final Future<void> Function(PublicacaoDaLinha)? aoApagar;

  static const String tituloSemConexao = 'Comece pelas suas conexões';
  static const String explicacaoSemConexao =
      'O Mural mostra o que as suas conexões publicam. Você ainda não tem '
      'nenhuma — e também pode publicar, que aparece aqui para elas.';

  /// A SAIDA do vazio sem conexao, e **a unica acao que este estado tem**.
  static const String buscarPessoas = 'Buscar usuários';

  static const String tituloSemPublicacao = 'As publicações ficam aqui';
  static const String explicacaoSemPublicacao =
      'Quando as suas conexões publicarem, as publicações aparecem aqui.';

  /// O rotulo da foto para quem usa leitor de tela **quando quem publicou nao
  /// escreveu uma descricao**.
  static const String fotoSemDescricao = 'Foto da publicação';

  /// O INTERVALO MINIMO entre duas recargas pedidas pelo TOQUE NA BARRA.
  static const Duration intervaloMinimoEntreRecargas = Duration(seconds: 30);

  @override
  State<CorpoDoMural> createState() => _CorpoDoMuralState();
}

class _CorpoDoMuralState extends State<CorpoDoMural>
    with PublicaAAtualizacao {
  /// A BUSCA QUE O ARRASTO REFAZ (cliente, 20/10/2026: *"a pagina do mural nao
  /// esta funcionando a funcionalidade de atualizar a pagina puxando pra
  /// baixo"*).
  @override
  Future<void> aoArrastarParaAtualizar() => _carregar();

  List<PublicacaoDaLinha>? _linha;

  /// Se a propria pessoa tem alguma publicacao.
  bool _tenhoPublicacao = false;

  bool _carregando = true;
  MensagemDeErro? _faixa;

  /// A falha da carga e **falta de conta**, e nao defeito.
  bool _faltaConta = false;

  /// --------------------------------------------------------------------- A
  /// FOTO QUE AINDA ESTA SENDO PROCESSADA, E A RELEITURA QUE A ALCANCA
  static const Duration _intervaloDaReleitura = Duration(seconds: 2);
  static const int _releiturasMaximas = 5;

  Timer? _releitura;
  int _releiturasRestantes = _releiturasMaximas;

  /// --------------------------------------------------------------------- O
  /// TOQUE NO ICONE DA BARRA RECARREGA (cliente, 20/10/2026)
  /// ---------------------------------------------------------------------
  static const Duration intervaloMinimoEntreRecargas =
      CorpoDoMural.intervaloMinimoEntreRecargas;

  /// A JANELA DE SILENCIO, e por que ela e um `Timer` e nao um carimbo de
  /// `DateTime.now()`.
  Timer? _janelaDeSilencio;

  bool get _emSilencio => _janelaDeSilencio?.isActive ?? false;

  /// Se a secao esta visivel.
  bool _visivel = false;

  /// A carga EM VOO, e a razao de ela existir.
  Future<void>? _emVoo;

  ValueListenable<RouteInformation>? _enderecos;

  @override
  void initState() {
    super.initState();
    unawaitedCarregar();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();

    final enderecos = GoRouter.maybeOf(context)?.routeInformationProvider;
    if (!identical(enderecos, _enderecos)) {
      _enderecos?.removeListener(_aoNavegar);
      _enderecos = enderecos?..addListener(_aoNavegar);
    }

    final visivel = TickerMode.valuesOf(context).enabled;
    final entrou = visivel && !_visivel;
    _visivel = visivel;
    if (entrou) _recargaPedidaPelaCasca(aoTopo: false);
  }

  @override
  void dispose() {
    _releitura?.cancel();
    _releitura = null;
    _janelaDeSilencio?.cancel();
    _janelaDeSilencio = null;
    _enderecos?.removeListener(_aoNavegar);
    _enderecos = null;
    super.dispose();
  }

  /// O roteador navegou. Ver a prosa de [intervaloMinimoEntreRecargas].
  void _aoNavegar() {
    if (!mounted || !_visivel) return;
    if (_enderecos?.value.uri.path != Rotas.mural) return;
    _recargaPedidaPelaCasca(aoTopo: true);
  }

  /// A recarga que a BARRA pede, com o intervalo minimo e a rolagem ao topo.
  void _recargaPedidaPelaCasca({required bool aoTopo}) {
    if (aoTopo) {
      final rolagem = Scrollable.maybeOf(context);
      final posicao = rolagem?.position;
      if (posicao != null && posicao.hasPixels && posicao.pixels > 0) {
        unawaited(
          posicao.animateTo(
            0,
            duration: const Duration(milliseconds: 250),
            curve: Curves.easeOut,
          ),
        );
      }
    }

    if (_emSilencio) return;
    unawaited(_carregar(silenciosa: true));
  }

  /// Sem `unawaited` de `dart:async` para nao acrescentar import por uma linha;
  /// o nome diz o que esta acontecendo.
  void unawaitedCarregar() {
    _carregar();
  }

  /// O FUNIL UNICO de toda leitura desta tela, e o que ele garante.
  Future<void> _carregar({bool silenciosa = false}) {
    final emVoo = _emVoo;
    if (emVoo != null) return emVoo;
    _janelaDeSilencio?.cancel();
    _janelaDeSilencio = Timer(intervaloMinimoEntreRecargas, () {});
    final nova = _carregarAgora(silenciosa: silenciosa);
    _emVoo = nova.whenComplete(() {
      _emVoo = null;
    });
    return _emVoo!;
  }

  /// [silenciosa] nao troca a lista pela roda.
  Future<void> _carregarAgora({bool silenciosa = false}) async {
    if (!silenciosa) {
      setState(() {
        _carregando = true;
        _faixa = null;
        _faltaConta = false;
      });
    }
    try {
      final linha = await widget.leitura.linhaDoTempo();
      final minhas = await widget.leitura.minhasPublicacoes();
      if (!mounted) return;
      setState(() {
        _linha = linha.itens;
        _tenhoPublicacao = minhas.itens.isNotEmpty;
        _carregando = false;
        _faltaConta = false;
      });
      _agendarReleituraSeAFotoAindaProcessa(minhas.itens);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _faltaConta = faltaConta(falha);
        _faixa = _faltaConta ? null : MensagensDeErro.de(falha);
      });
    }
  }

  /// Arma UMA releitura quando alguma foto minha ainda esta em `processing`.
  void _agendarReleituraSeAFotoAindaProcessa(List<MinhaPublicacao> minhas) {
    _releitura?.cancel();
    _releitura = null;

    final aindaProcessa = minhas.any(
      (p) => p.imagem?.estado == EstadoDaFotoDaPublicacao.processando,
    );
    if (!aindaProcessa) {
      _releiturasRestantes = _releiturasMaximas;
      return;
    }
    if (_releiturasRestantes <= 0) return;
    _releiturasRestantes -= 1;
    _releitura = Timer(_intervaloDaReleitura, () {
      if (mounted) unawaited(_carregar(silenciosa: true));
    });
  }

  /// Recarrega, para quem publicou agora.
  Future<void> recarregar() => _carregar();

  @override
  Widget build(BuildContext context) {
    final faixa = _faixa;
    final linha = _linha;

    if (_faltaConta) {
      return const Padding(
        padding: EdgeInsets.only(bottom: BichuEspaco.e4),
        child: ConviteParaEntrar(secao: SecaoComConta.mural),
      );
    }

    if (faixa != null) {
      return Padding(
        padding: const EdgeInsets.only(bottom: BichuEspaco.e4),
        child: FaixaDeAviso(
          texto: faixa.texto,
          rotuloDaAcao: faixa.acao,
          aoTocarNaAcao: saidaDaMensagem(context, faixa),
        ),
      );
    }

    if (_carregando || linha == null) {
      return const Padding(
        padding: EdgeInsets.all(BichuEspaco.e6),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (linha.isEmpty) {
      return EstadoVazio(
        titulo: _tenhoPublicacao
            ? CorpoDoMural.tituloSemPublicacao
            : CorpoDoMural.tituloSemConexao,
        explicacao: _tenhoPublicacao
            ? CorpoDoMural.explicacaoSemPublicacao
            : CorpoDoMural.explicacaoSemConexao,
        acao: _tenhoPublicacao
            ? null
            : BotaoPrimario(
                rotulo: CorpoDoMural.buscarPessoas,
                icone: Icons.person_search_outlined,
                aoTocar: () => context.go(Rotas.redeNaBuscaDePessoas),
              ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        for (final publicacao in linha) ...<Widget>[
          _CartaoDaPublicacao(
            publicacao: publicacao,
            interacao: widget.interacao,
            aoDenunciar: widget.aoDenunciar,
            aoApagar: widget.aoApagar == null
                ? null
                : () async {
                    await widget.aoApagar!(publicacao);
                    await _carregar();
                  },
          ),
          const SizedBox(height: BichuEspaco.e4),
        ],
      ],
    );
  }
}

/// Um cartao da linha do tempo.
class _CartaoDaPublicacao extends StatelessWidget {
  const _CartaoDaPublicacao({
    required this.publicacao,
    required this.interacao,
    required this.aoDenunciar,
    required this.aoApagar,
  });

  final PublicacaoDaLinha publicacao;
  final InteracaoDoMural interacao;
  final void Function(PublicacaoDaLinha)? aoDenunciar;
  final Future<void> Function()? aoApagar;

  /// A ORDEM DO CARTAO, e ela e DUAS e nao uma.
  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final imagem = publicacao.imagem;
    final urlDaImagem = imagem?.url;
    final comImagem = urlDaImagem != null && urlDaImagem.isNotEmpty;

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: comImagem
          ? _comImagem(context, urlDaImagem)
          : _semImagem(context),
    );
  }

  /// A ordem NOVA: imagem com o autor sobreposto, acoes, legenda.
  Widget _comImagem(BuildContext context, String urlDaImagem) {
    final textos = Theme.of(context).textTheme;
    final imagem = publicacao.imagem;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Stack(
          children: <Widget>[
            ImagemDaRede(
              url: urlDaImagem,
              descricao: (imagem?.textoAlternativo?.trim().isNotEmpty ?? false)
                  ? imagem!.textoAlternativo!.trim()
                  : CorpoDoMural.fotoSemDescricao,
              proporcao: 1,
            ),
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: VeuDoAutorSobreMidia(
                child: _linhaDoAutor(context, sobreOVeu: true),
              ),
            ),
            if (_temMenu)
              Positioned(top: 0, right: 0, child: _menu(context)),
          ],
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            BichuEspaco.e4,
            BichuEspaco.e2,
            BichuEspaco.e4,
            BichuEspaco.e4,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              _AcoesDaPublicacao(
                publicacao: publicacao,
                interacao: interacao,
              ),
              const SizedBox(height: BichuEspaco.e2),
              Text(publicacao.texto, style: textos.bodyLarge),
            ],
          ),
        ),
      ],
    );
  }

  /// A publicacao SO DE TEXTO.
  Widget _semImagem(BuildContext context) {
    final textos = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _linhaDoAutor(context, sobreOVeu: false),
          const SizedBox(height: BichuEspaco.e2),
          Text(publicacao.texto, style: textos.bodyLarge),
          const SizedBox(height: BichuEspaco.e2),
          _AcoesDaPublicacao(publicacao: publicacao, interacao: interacao),
        ],
      ),
    );
  }

  /// A LINHA DO AUTOR — foto, nome e, fora do veu, o selo de validado.
  Widget _linhaDoAutor(BuildContext context, {required bool sobreOVeu}) {
    final tema = BichuColors.of(context);
    final textos = Theme.of(context).textTheme;
    final estiloDoNome = sobreOVeu
        ? textos.labelMedium?.copyWith(color: VeuDoAutorSobreMidia.tinta(tema))
        : textos.titleMedium;

    return Row(
      children: <Widget>[
        PortaDoPerfilDoAutor(
          autor: publicacao.autor,
          rotulo: PortaDoPerfilDoAutor.rotuloDaPorta(
            publicacao.autor.nomeExibido,
          ),
          child: _FotoDoAutor(
            autor: publicacao.autor,
            lado: sobreOVeu ? _FotoDoAutor.ladoNoVeu : _FotoDoAutor.lado40,
          ),
        ),
        SizedBox(width: sobreOVeu ? BichuEspaco.e2 : BichuEspaco.e3),
        Expanded(
          child: PortaDoPerfilDoAutor(
            autor: publicacao.autor,
            child: NomeComSelo(
              nome: publicacao.autor.nomeExibido,
              comSelo: publicacao.autor.canalConfirmado,
              estilo: estiloDoNome,
              corDoSelo: sobreOVeu ? VeuDoAutorSobreMidia.tinta(tema) : null,
            ),
          ),
        ),
        if (!sobreOVeu) _menu(context),
        if (sobreOVeu && _temMenu)
          const SizedBox(width: BichuAlvoDeToque.min),
      ],
    );
  }

  /// O `⋮` do cartao: **`Apagar` na propria, `Denunciar` na de outra pessoa, e
  /// nunca as duas.**
  bool get _temMenu =>
      (publicacao.minha && aoApagar != null) ||
      (!publicacao.minha && aoDenunciar != null);

  Widget _menu(BuildContext context) {
    final opcoes = <PopupMenuEntry<String>>[
      if (publicacao.minha && aoApagar != null)
        const PopupMenuItem<String>(value: 'apagar', child: Text('Apagar')),
      if (!publicacao.minha && aoDenunciar != null)
        const PopupMenuItem<String>(value: 'denunciar', child: Text('Denunciar')),
    ];
    if (opcoes.isEmpty) return const SizedBox.shrink();

    return PopupMenuButton<String>(
      padding: const EdgeInsets.all(BichuEspaco.e3),
      tooltip: 'Opções da publicação',
      itemBuilder: (_) => opcoes,
      onSelected: (escolha) {
        if (escolha == 'apagar') {
          aoApagar?.call();
          return;
        }
        aoDenunciar?.call(publicacao);
      },
    );
  }
}

/// A FOTO DO AUTOR no cartao do Mural — **Emenda 5 do ADR-0010 (20/10/2026)**.
class _FotoDoAutor extends StatelessWidget {
  const _FotoDoAutor({required this.autor, this.lado = lado40});

  final AutorDaPublicacao autor;

  /// O lado pintado. Os dois valores que o cartao usa sao [lado40] e
  /// [ladoNoVeu], e quem escolhe e `_linhaDoAutor`.
  final double lado;

  /// 40 dp, o tamanho para o qual a `thumb` de 176 foi medida: 120 px reais a
  /// 3x, 1,47x de cobertura.
  static const double lado40 = 40;

  /// 28 dp, SOBRE O VEU — o *"diminua bastante"* do cliente de 29/10/2026.
  static const double ladoNoVeu = 28;

  @override
  Widget build(BuildContext context) {
    return MarcaDaPessoa(
      urlDoIcone: autor.urlDoIcone,
      inicial: MarcaDaPessoa.letraDe(autor.nomeExibido),
      lado: lado,
      apelido: autor.apelido,
    );
  }
}

/// A LINHA DE ACOES do cartao: **curtir e comentar**, decisao do cliente de
/// 19/10/2026.
class _AcoesDaPublicacao extends StatefulWidget {
  const _AcoesDaPublicacao({required this.publicacao, required this.interacao});

  final PublicacaoDaLinha publicacao;
  final InteracaoDoMural interacao;

  static const String curtir = 'Curtir';
  static const String descurtir = 'Descurtir';
  static const String comentar = 'Comentar';

  @override
  State<_AcoesDaPublicacao> createState() => _AcoesDaPublicacaoState();
}

class _AcoesDaPublicacaoState extends State<_AcoesDaPublicacao> {
  late bool _curti = widget.publicacao.curtiEu;
  late int _curtidas = widget.publicacao.curtidas;
  late int _comentarios = widget.publicacao.comentarios;
  bool _emVoo = false;

  Future<void> _alternarCurtida() async {
    if (_emVoo) return;
    final eraCurti = _curti;
    final eramCurtidas = _curtidas;
    setState(() {
      _emVoo = true;
      _curti = !eraCurti;
      _curtidas = eraCurti ? eramCurtidas - 1 : eramCurtidas + 1;
    });
    try {
      final reacao = eraCurti
          ? await widget.interacao.descurtir(widget.publicacao.ref)
          : await widget.interacao.curtir(widget.publicacao.ref);
      if (!mounted) return;
      setState(() {
        _emVoo = false;
        _curti = reacao.curtiEu;
        _curtidas = reacao.curtidas;
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _emVoo = false;
        _curti = eraCurti;
        _curtidas = eramCurtidas;
      });
    }
  }

  Future<void> _abrirComentarios() async {
    final total = await Navigator.of(context).push<int>(
      MaterialPageRoute<int>(
        builder: (_) => ComentariosDaPublicacao(
          ref: widget.publicacao.ref,
          interacao: widget.interacao,
          minhaPublicacao: widget.publicacao.minha,
        ),
      ),
    );
    if (!mounted) return;
    if (total != null) setState(() => _comentarios = total);
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Row(
      children: <Widget>[
        IconButton(
          onPressed: _emVoo ? null : _alternarCurtida,
          tooltip: _curti
              ? _AcoesDaPublicacao.descurtir
              : _AcoesDaPublicacao.curtir,
          icon: Icon(
            _curti ? Icons.favorite : Icons.favorite_border,
            color: _curti ? cores.urgency : cores.textSecondary,
          ),
        ),
        Text(
          '$_curtidas',
          style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
        ),
        const SizedBox(width: BichuEspaco.e4),
        IconButton(
          onPressed: _abrirComentarios,
          tooltip: _AcoesDaPublicacao.comentar,
          icon: Icon(Icons.mode_comment_outlined, color: cores.textSecondary),
        ),
        Text(
          '$_comentarios',
          style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
        ),
      ],
    );
  }
}
