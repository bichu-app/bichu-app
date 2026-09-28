import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../api/modelos_rede.dart';
import '../../api/rede_api.dart';
import '../../dispositivo/saida_do_app.dart';
import '../../escopo.dart';
import '../../intencao/pedido_de_participacao_como_intencao.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/marca.dart';
import 'local_do_encontro.dart';
import 'pecas_da_rede.dart';

/// A pagina de um encontro da `Rede` (design system 24.12 a 24.17, textos da
/// UX 28.1, 28.6 e 28.7).
///
/// ## Ordem, de cima para baixo (24.15, com as trocas de 24.17)
///
/// Capa 16:9 com `Voltar` flutuante; cabecalho (titulo, `Organizado pela
/// equipe do Bichu`, selos); aviso de cancelado ou caixa do privado;
/// `Quando`; `Local`; `Sobre o encontro`; `Fotos`; `Para quais cães`; `O que
/// levar`; `Cuidados no encontro`; `Acessibilidade e estrutura`;
/// `Observações`. **Sem `Quem organiza` e sem `Compartilhar`** (24.17.1 e
/// 24.15 item 4). Sem check-in, sem galeria da comunidade e sem lista de
/// presenca (ADR-0025).
///
/// ## Quatro operacoes, e cada uma so quando pode
///
/// - `getNetworkEvent`, sem token, sempre.
/// - `getNetworkEventLocation`, **so com conta** e so quando o encontro nao
///   esta cancelado. Sem conta nao ha pergunta, nao ha ponto e nao ha mapa: o
///   bloco `Local` fica so com o endereco (a isca do teste confere que a
///   chamada nao sai).
/// - `getMyNetworkEventJoinRequest`, so com conta e so em privado.
/// - `getNetworkEventPrivateDetails`, so com o pedido `approved`.
///
/// ## O privado nao aprovado e so titulo e data, e a recusa nao existe aqui
///
/// O teaser tem cinco campos e a pagina desenha o que eles dao: banner,
/// titulo, data sem hora, selo `Privado` e a caixa do pedido. Nao ha estado de
/// recusa: o servidor manda `requested` para o recusado (ADR-0027 12.11), e a
/// caixa diz `Pedido enviado` com um texto que vale para os dois casos (UX
/// 28.7.3).
///
/// ## A distancia
///
/// Vem do cartao, que a leu de `listNearbyNetworkEvents` (a regiao
/// cadastrada; o GPS nao participa). **Nunca em privado**, nem aprovado;
/// nunca em encerrado nem em cancelado.
class TelaDoEncontro extends StatefulWidget {
  const TelaDoEncontro({
    required this.slug,
    super.key,
    this.distanciaEmMetros,
    this.erroDoPedido,
  });

  final String slug;
  final int? distanciaEmMetros;

  /// O pedido feito pela guarda de acao, depois do login, nao saiu: a caixa
  /// do privado abre dizendo por que.
  final String? erroDoPedido;

  static const String falhaDoPedido =
      'Não conseguimos ver agora se você já pediu para participar.';
  static const String rotuloDeTentar = 'Tentar de novo';

  static const String tituloDaTela = 'Encontro';
  static const String rotuloDeAtualizar = 'Atualizar';
  static const String organizadoPor = 'Organizado pela equipe do Bichu';
  static const String avisoDeCancelado =
      'A equipe do Bichu cancelou este encontro. Ele não vai acontecer.';
  static const String rotuloDoCalendario = 'Adicionar ao calendário';
  static const String falhaDoCalendario =
      'Não conseguimos abrir o calendário.';
  static const String falhaDosDetalhes =
      'Não conseguimos carregar os detalhes agora.';

  static const String tituloDoPrivado = 'Encontro privado';
  static const String textoDoPrivado =
      'O local e os detalhes aparecem se a equipe do Bichu aprovar o seu '
      'pedido.';
  static const String avisoDeTransparencia =
      'Ao pedir, a equipe do Bichu vê o seu nome de exibição, o mês em que você '
      'criou a conta e se o seu e-mail está confirmado.';
  static const String rotuloDePedir = 'Pedir para participar';
  static const String tituloDoEnviado = 'Pedido enviado';
  static const String textoDoEnviado =
      'Se o pedido for aprovado até o dia do encontro, o local e os detalhes '
      'aparecem aqui.';
  static const String tituloDoAprovado = 'Pedido aprovado';
  static const String textoDoAprovado =
      'Você pode participar. O local e os detalhes estão abaixo.';
  static const String rotuloDeDesistir = 'Desistir do pedido';
  static const String tituloDaDesistencia = 'Desistir do pedido?';
  static const String textoDaDesistencia =
      'O pedido sai de Meus pedidos. Se mudar de ideia, você pode pedir de novo '
      'enquanto o encontro não acontecer.';
  static const String rotuloDeManter = 'Manter o pedido';

  static const String tituloDaGuarda = 'Entre para pedir';
  static const String textoDaGuarda =
      'Entre na sua conta para pedir. Depois de entrar, a gente envia o pedido.';
  static const String rotuloDeEntrar = 'Entrar';
  static const String rotuloDeAgoraNao = 'Agora não';

  /// As quatro frases de `Cuidados no encontro` (UX 28.7.1). A segunda varia
  /// por `fenced_off_leash_area`.
  static List<String> cuidados({required bool areaCercada}) => <String>[
        'Recolha o cocô e leve o saquinho embora.',
        areaCercada
            ? 'Na área cercada, o cão pode ficar solto. Fora dela, na guia.'
            : 'Mantenha o cão na guia o tempo todo.',
        'Se o seu cão parecer desconfortável, afaste-se do grupo com ele por '
            'um tempo.',
        'Fêmea no cio fica em casa.',
      ];

  /// Empilha o encontro no ramo da `Rede`, com a barra de abas.
  static Future<void> abrir(
    BuildContext context,
    String slug, {
    int? distanciaEmMetros,
  }) {
    return context.push<void>(
      Rotas.encontroDaRedeDe(slug),
      extra: distanciaEmMetros,
    );
  }

  @override
  State<TelaDoEncontro> createState() => _TelaDoEncontroState();
}

enum _Fase { carregando, pronto, falha }

class _TelaDoEncontroState extends State<TelaDoEncontro> {
  _Fase _fase = _Fase.carregando;
  String? _textoDaFalha;
  EncontroDaRede? _encontro;

  /// Privado: o pedido da conta. `null` com [_temPedido] falso e "sem pedido".
  bool _temPedido = false;

  /// `getMyNetworkEventJoinRequest` falhou: o teaser fica, e so a caixa diz.
  bool _pedidoIndisponivel = false;

  /// A ultima falha de pedir ou desistir, dita dentro da caixa.
  String? _erroDoPedido;
  EstadoDoPedido? _estadoDoPedido;
  DetalhesDoPrivado? _detalhes;
  bool _detalhesFalharam = false;

  PontoNoBloco _ponto = const SoEndereco();
  bool _enviandoPedido = false;

  final ScrollController _rolagem = ScrollController();
  bool _barraVisivel = false;
  final FocusNode _focoDaCaixa = FocusNode(debugLabel: 'caixa-do-privado');

  bool _cargaAgendada = false;

  @override
  void initState() {
    super.initState();
    _erroDoPedido = widget.erroDoPedido;
    _rolagem.addListener(_aoRolar);
    _agendarCarga();
  }

  @override
  void dispose() {
    _rolagem.dispose();
    _focoDaCaixa.dispose();
    super.dispose();
  }

  void _agendarCarga() {
    if (_cargaAgendada) return;
    _cargaAgendada = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _cargaAgendada = false;
      if (mounted) _carregar();
    });
  }

  /// A barra de topo normal volta quando a capa sai da tela (24.17.1, item
  /// 7): a partir da altura da capa menos 48 dp.
  void _aoRolar() {
    final largura = MediaQuery.sizeOf(context).width;
    final limite = largura / proporcaoDaCapa - BichuAlvoDeToque.min;
    final visivel = _rolagem.hasClients && _rolagem.offset > limite;
    if (visivel != _barraVisivel) setState(() => _barraVisivel = visivel);
  }

  bool get _logado => Escopo.of(context).sessao.logado;

  RedeApi get _rede => RedeApi(Escopo.of(context).api);

  Future<void> _carregar() async {
    if (!mounted) return;
    setState(() {
      _fase = _Fase.carregando;
      _textoDaFalha = null;
    });
    try {
      final rede = _rede;
      final logado = _logado;
      final encontro = await rede.detalhar(widget.slug);

      final lido = encontro is TeaserDoPrivado && logado
          ? await _lerPedido(rede)
          : null;
      if (!mounted) return;
      setState(() {
        _encontro = encontro;
        _aplicarPedido(lido);
        _fase = _Fase.pronto;
      });
      _carregarPonto();
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.de(falha).texto;
        _encontro = null;
        _fase = _Fase.falha;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.servidorFora;
        _encontro = null;
        _fase = _Fase.falha;
      });
    }
  }

  /// O pedido da conta e, se aprovado, o conteudo oculto.
  ///
  /// **Falha aqui nao derruba a pagina**: o teaser ja chegou, e so a caixa do
  /// pedido diz que nao conseguiu consultar (com `Tentar de novo`, que refaz
  /// so esta consulta, UX 28.2).
  Future<_PedidoLido> _lerPedido(RedeApi rede) async {
    try {
      final pedido = await rede.meuPedido(widget.slug);
      final estado = pedido?.estado;
      DetalhesDoPrivado? detalhes;
      var detalhesFalharam = false;
      if (estado == EstadoDoPedido.aprovado) {
        try {
          detalhes = await rede.detalhesDoPrivado(widget.slug);
        } on FalhaDeChamada {
          detalhesFalharam = true;
        } on FormatException {
          detalhesFalharam = true;
        }
        detalhesFalharam = detalhesFalharam || detalhes == null;
      }
      return _PedidoLido(
        temPedido: pedido != null,
        estado: estado,
        detalhes: detalhes,
        detalhesFalharam: detalhesFalharam,
      );
    } on FalhaDeChamada {
      return const _PedidoLido.indisponivel();
    } on FormatException {
      return const _PedidoLido.indisponivel();
    }
  }

  void _aplicarPedido(_PedidoLido? lido) {
    _temPedido = lido?.temPedido ?? false;
    _estadoDoPedido = lido?.estado;
    _detalhes = lido?.detalhes;
    _detalhesFalharam = lido?.detalhesFalharam ?? false;
    _pedidoIndisponivel = lido?.indisponivel ?? false;
  }

  Future<void> _consultarPedidoDeNovo() async {
    final lido = await _lerPedido(_rede);
    if (!mounted) return;
    setState(() {
      _aplicarPedido(lido);
      _erroDoPedido = null;
    });
    _focarCaixa();
    _carregarPonto();
  }

  /// O ponto so e perguntado com conta, com lugar na tela e sem cancelamento.
  bool get _deveBuscarPonto {
    final e = _encontro;
    if (!_logado || e == null) return false;
    if (e.situacao == SituacaoDoEncontro.cancelado) return false;
    if (e is EncontroPublico) return true;
    return _detalhes != null;
  }

  Future<void> _carregarPonto() async {
    if (!_deveBuscarPonto) {
      setState(() => _ponto = const SoEndereco());
      return;
    }
    setState(() => _ponto = const PontoCarregando());
    try {
      final local = await _rede.localizacao(widget.slug);
      if (!mounted) return;
      final ponto = local.ponto;
      setState(
        () => _ponto = ponto == null ? const SoEndereco() : PontoConhecido(ponto),
      );
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      // 404 aqui e "sem ponto para esta conta", com o mesmo corpo de "nao
      // existe": o bloco fica so com o endereco, sem acusar nada.
      setState(
        () => _ponto = falha.problem.status == 404
            ? const SoEndereco()
            : const PontoComFalha(),
      );
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() => _ponto = const PontoComFalha());
    } on FormatException {
      if (!mounted) return;
      setState(() => _ponto = const PontoComFalha());
    }
  }

  // -------------------------------------------------------------------------
  // O pedido
  // -------------------------------------------------------------------------

  Future<void> _pedir() async {
    if (!_logado) {
      await _abrirGuarda();
      return;
    }
    setState(() => _enviandoPedido = true);
    try {
      final pedido = await _rede.pedir(widget.slug);
      if (!mounted) return;
      setState(() {
        _enviandoPedido = false;
        _temPedido = true;
        _estadoDoPedido = pedido.estado;
        _erroDoPedido = null;
      });
      _focarCaixa();
      if (pedido.estado == EstadoDoPedido.aprovado) _carregar();
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _enviandoPedido = false;
        _erroDoPedido = MensagensDeErro.de(falha).texto;
      });
      _focarCaixa();
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _enviandoPedido = false;
        _erroDoPedido = MensagensDeErro.servidorFora;
      });
      _focarCaixa();
    }
  }

  Future<void> _abrirGuarda() async {
    final entrar = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      useSafeArea: true,
      builder: (contexto) => _FolhaDeDuasAcoes(
        titulo: TelaDoEncontro.tituloDaGuarda,
        texto: TelaDoEncontro.textoDaGuarda,
        principal: BotaoPrimario(
          rotulo: TelaDoEncontro.rotuloDeEntrar,
          aoTocar: () => Navigator.of(contexto).pop(true),
        ),
        rotuloSecundario: TelaDoEncontro.rotuloDeAgoraNao,
        aoTocarSecundario: () => Navigator.of(contexto).pop(false),
      ),
    );
    if (entrar != true || !mounted) return;
    final escopo = Escopo.of(context);
    await escopo.guarda.guardar(
      intencaoDePedirParaParticipar(widget.slug, criadaEm: DateTime.now()),
    );
    if (!mounted) return;
    context.push(Rotas.entrar);
  }

  Future<void> _desistir() async {
    final confirmou = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      useSafeArea: true,
      builder: (contexto) => _FolhaDeDuasAcoes(
        titulo: TelaDoEncontro.tituloDaDesistencia,
        texto: TelaDoEncontro.textoDaDesistencia,
        // Secundaria e nao Perigo: desistir nao apaga nada da pessoa e pode
        // ser refeito (24.17.6).
        principal: OutlinedButton(
          onPressed: () => Navigator.of(contexto).pop(true),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(BichuAlvoDeToque.critico),
          ),
          child: const Text(TelaDoEncontro.rotuloDeDesistir),
        ),
        rotuloSecundario: TelaDoEncontro.rotuloDeManter,
        aoTocarSecundario: () => Navigator.of(contexto).pop(false),
      ),
    );
    if (confirmou != true || !mounted) return;
    try {
      await _rede.desistir(widget.slug);
      if (!mounted) return;
      setState(() {
        _temPedido = false;
        _estadoDoPedido = null;
        _erroDoPedido = null;
      });
      _focarCaixa();
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() => _erroDoPedido = MensagensDeErro.de(falha).texto);
      _focarCaixa();
    } on FormatException {
      if (!mounted) return;
      setState(() => _erroDoPedido = MensagensDeErro.servidorFora);
      _focarCaixa();
    }
  }

  /// A caixa e regiao de status: quando o estado muda, o foco vai para ela
  /// (24.13.5).
  void _focarCaixa() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focoDaCaixa.requestFocus();
    });
  }

  void _avisar(String texto) {
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(
      SnackBar(content: Text(texto)),
    );
  }

  Future<void> _adicionarAoCalendario(ConteudoDoEncontro c) async {
    final abriu = await SaidaDoApp.atual.adicionarAoCalendario(
      EventoDeCalendario(
        titulo: c.titulo,
        inicio: c.horario.inicio,
        fim: c.horario.fim,
        local: c.lugar.linhaCompleta,
        descricao: c.resumo,
      ),
    );
    if (!abriu && mounted) _avisar(TelaDoEncontro.falhaDoCalendario);
  }

  void _voltar() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(Rotas.rede);
    }
  }

  // -------------------------------------------------------------------------
  // A pagina
  // -------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final encontro = _encontro;
    if (_fase != _Fase.pronto || encontro == null) {
      return Scaffold(
        appBar: AppBar(
          toolbarHeight: BichuAlvoDeToque.critico,
          leadingWidth: BichuAlvoDeToque.critico,
          leading: _BotaoVoltar(aoTocar: _voltar),
          title: const Text(TelaDoEncontro.tituloDaTela),
        ),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(BichuEspaco.e4),
            children: <Widget>[
              if (_fase == _Fase.carregando)
                const _EsqueletoDoEncontro()
              else
                FaixaDeAviso(
                  texto: _textoDaFalha ?? MensagensDeErro.servidorFora,
                  rotuloDaAcao: TelaDoEncontro.rotuloDeAtualizar,
                  aoTocarNaAcao: _carregar,
                ),
            ],
          ),
        ),
      );
    }

    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Scaffold(
      body: SafeArea(
        child: Semantics(
          // A rota anuncia `Encontro: {título}`: nao ha titulo visivel na
          // barra do topo enquanto a capa esta na tela (UX 28.7.2).
          scopesRoute: true,
          namesRoute: true,
          explicitChildNodes: true,
          label: '${TelaDoEncontro.tituloDaTela}: ${encontro.titulo}',
          child: Stack(
            children: <Widget>[
              ListView(
                controller: _rolagem,
                padding: const EdgeInsets.only(bottom: BichuEspaco.e8),
                children: _pagina(encontro),
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
                        boxShadow: Theme.of(context).brightness ==
                                Brightness.dark
                            ? null
                            : BichuSombra.sm,
                      ),
                      child: Row(
                        children: <Widget>[
                          _BotaoVoltar(aoTocar: _voltar),
                          Expanded(
                            child: Text(
                              encontro.titulo,
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
                  child: _BotaoVoltarSobreMidia(aoTocar: _voltar),
                ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _pagina(EncontroDaRede encontro) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final situacao = encontro.situacao;
    final cancelado = situacao == SituacaoDoEncontro.cancelado;
    final encerrado = situacao == SituacaoDoEncontro.encerrado;
    final vivo = !cancelado && !encerrado;
    final ano = DateTime.now().year;

    // O conteudo desenhavel: o publico, ou o do privado aprovado.
    final ConteudoDoEncontro? conteudo = switch (encontro) {
      EncontroPublico() => encontro,
      TeaserDoPrivado() => _detalhes,
    };
    final privado = encontro is TeaserDoPrivado;
    final aprovado = privado && _estadoDoPedido == EstadoDoPedido.aprovado;

    // A distancia: nunca em privado, nunca fora de "a vir" / "acontecendo".
    final distancia = !privado && vivo ? widget.distanciaEmMetros : null;

    final capa = Stack(
      children: <Widget>[
        ImagemDoEncontroOuBanner(
          // Privado nao aprovado: banner, porque a foto costuma mostrar o
          // lugar (24.16). Aprovado, a capa volta.
          url: conteudo?.urlDaCapa,
          textoAlternativo: conteudo?.urlDaCapa == null
              ? null
              : conteudo?.textoAlternativoDaCapa,
          cancelado: cancelado,
        ),
        if (cancelado)
          const Positioned.fill(
            child: Center(
              child: DistintivoDeSituacao(
                situacao: SituacaoDoEncontro.cancelado,
                grande: true,
              ),
            ),
          )
        else if (situacao != null && rotuloDaSituacao(situacao) != null)
          Positioned(
            right: BichuEspaco.e3,
            bottom: BichuEspaco.e3,
            child: DistintivoDeSituacao(situacao: situacao),
          ),
      ],
    );

    final cabecalho = Padding(
      padding: const EdgeInsets.fromLTRB(
        BichuEspaco.e4,
        BichuEspaco.e4,
        BichuEspaco.e4,
        0,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Semantics(
            header: true,
            child: Text(encontro.titulo, style: textos.headlineSmall),
          ),
          const SizedBox(height: BichuEspaco.e2),
          Row(
            children: <Widget>[
              const ExcludeSemantics(child: MarcaSimbolo(altura: BichuEspaco.e6)),
              const SizedBox(width: BichuEspaco.e2),
              Expanded(
                child: Text(
                  TelaDoEncontro.organizadoPor,
                  style: textos.bodySmall?.copyWith(color: cores.textSecondary),
                ),
              ),
            ],
          ),
          const SizedBox(height: BichuEspaco.e3),
          Wrap(
            spacing: BichuEspaco.e2,
            runSpacing: BichuEspaco.e2,
            children: <Widget>[
              // Privado nao aprovado: sem selo de valor (24.16, item 1).
              if (conteudo != null) seloDeValor(conteudo.entrada),
              if (privado) seloPrivado,
            ],
          ),
        ],
      ),
    );

    final secoes = <Widget>[];
    void secao(IconData icone, String titulo, Widget filho) {
      secoes
        ..add(const SizedBox(height: BichuEspaco.e6))
        ..add(_Secao(icone: icone, titulo: titulo, child: filho));
    }

    if (cancelado) {
      secoes
        ..add(const SizedBox(height: BichuEspaco.e4))
        ..add(const _Margem(child: _AvisoDeCancelado()));
    }

    if (privado && !cancelado) {
      final caixa = _caixaDoPrivado(encerrado: encerrado);
      if (caixa != null) {
        secoes
          ..add(const SizedBox(height: BichuEspaco.e4))
          ..add(_Margem(child: caixa));
      }
    }

    if (aprovado && _detalhesFalharam) {
      secoes
        ..add(const SizedBox(height: BichuEspaco.e4))
        ..add(
          _Margem(
            child: FaixaDeAviso(
              texto: TelaDoEncontro.falhaDosDetalhes,
              rotuloDaAcao: TelaDoEncontro.rotuloDeAtualizar,
              aoTocarNaAcao: _carregar,
            ),
          ),
        );
    }

    // QUANDO: o dia sempre; horario e calendario so com conteudo.
    secao(
      Icons.event_outlined,
      'Quando',
      _CaixaQuando(
        dia: encontro.dia,
        ano: ano,
        horario: conteudo?.horario,
        acao: conteudo != null && vivo
            ? OutlinedButton.icon(
                onPressed: () => _adicionarAoCalendario(conteudo),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(BichuAlvoDeToque.critico),
                ),
                icon: const Icon(Icons.edit_calendar_outlined),
                label: const Text(TelaDoEncontro.rotuloDoCalendario),
              )
            : null,
      ),
    );

    if (conteudo != null) {
      secao(
        Icons.place_outlined,
        'Local',
        LocalDoEncontro(
          lugar: conteudo.lugar,
          ponto: cancelado ? const SoEndereco() : _ponto,
          distanciaEmMetros: distancia,
          aoTentarDeNovo: _carregarPonto,
        ),
      );
      secao(
        Icons.notes_outlined,
        'Sobre o encontro',
        Text(conteudo.resumo, style: textos.bodyLarge),
      );
      if (!cancelado && conteudo.imagens.length > 1) {
        secao(
          Icons.photo_library_outlined,
          'Fotos',
          _Fotos(imagens: conteudo.imagens),
        );
      }
      if (vivo) {
        secao(Icons.pets_outlined, 'Para quais cães', _ParaQuaisCaes(c: conteudo));
        if (conteudo.oQueLevar.isNotEmpty) {
          secao(
            Icons.backpack_outlined,
            'O que levar',
            _OQueLevar(itens: conteudo.oQueLevar),
          );
        }
        secao(
          Icons.health_and_safety_outlined,
          'Cuidados no encontro',
          _Cuidados(
            frases: TelaDoEncontro.cuidados(
              areaCercada: conteudo.areaCercadaParaSoltar,
            ),
          ),
        );
        final estrutura = <String>[
          if (conteudo.areaCercadaParaSoltar) 'Área cercada para cães soltos',
          for (final e in conteudo.estrutura) e.rotulo,
        ];
        if (estrutura.isNotEmpty) {
          secao(
            Icons.accessible_outlined,
            'Acessibilidade e estrutura',
            _ListaComVisto(itens: estrutura),
          );
        }
        final notas = conteudo.observacoes;
        if (notas != null) {
          secao(
            Icons.info_outline,
            'Observações',
            // Texto puro: nada vira link (contrato, `NetworkEventNotes`).
            Text(notas, style: textos.bodySmall),
          );
        }
      }
    }

    return <Widget>[capa, cabecalho, ...secoes];
  }

  /// A caixa do privado, ou nula quando nao ha o que dizer.
  ///
  /// Estados (24.13.5 com UX 28.7.3 e 24.17.6): sem pedido, pedido enviado,
  /// aprovado. **Nao ha recusado.** Encontro que ja passou sem aprovacao nao
  /// tem caixa: pedir responderia `event_ended`.
  Widget? _caixaDoPrivado({required bool encerrado}) {
    final estado = _estadoDoPedido;
    if (_pedidoIndisponivel && !encerrado) {
      return _CaixaDoPrivado(
        foco: _focoDaCaixa,
        icone: Icons.lock_outline,
        titulo: TelaDoEncontro.tituloDoPrivado,
        texto: TelaDoEncontro.falhaDoPedido,
        acao: Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            onPressed: _consultarPedidoDeNovo,
            style: TextButton.styleFrom(
              minimumSize: const Size(BichuAlvoDeToque.min, BichuAlvoDeToque.min),
            ),
            child: const Text(TelaDoEncontro.rotuloDeTentar),
          ),
        ),
      );
    }
    if (estado == EstadoDoPedido.aprovado) {
      return _CaixaDoPrivado(
        foco: _focoDaCaixa,
        icone: Icons.check_circle_outline,
        titulo: TelaDoEncontro.tituloDoAprovado,
        texto: TelaDoEncontro.textoDoAprovado,
      );
    }
    if (encerrado || estado == EstadoDoPedido.expirado) return null;
    if (_temPedido && estado != EstadoDoPedido.desistido) {
      return _CaixaDoPrivado(
        foco: _focoDaCaixa,
        icone: Icons.schedule_send_outlined,
        titulo: TelaDoEncontro.tituloDoEnviado,
        texto: TelaDoEncontro.textoDoEnviado,
        erro: _erroDoPedido,
        // So a partir de `requested`. Um estado que este build nao conhece
        // fica sem acao, e nunca vira recusa.
        acao: estado == EstadoDoPedido.enviado
            ? Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: _desistir,
                  style: TextButton.styleFrom(
                    minimumSize: const Size(
                      BichuAlvoDeToque.min,
                      BichuAlvoDeToque.min,
                    ),
                  ),
                  child: const Text(TelaDoEncontro.rotuloDeDesistir),
                ),
              )
            : null,
      );
    }
    return _CaixaDoPrivado(
      foco: _focoDaCaixa,
      icone: Icons.lock_outline,
      titulo: TelaDoEncontro.tituloDoPrivado,
      texto: TelaDoEncontro.textoDoPrivado,
      aviso: TelaDoEncontro.avisoDeTransparencia,
      erro: _erroDoPedido,
      acao: Semantics(
        // O aviso D57 e a descricao acessivel do botao: quem usa leitor de
        // tela ouve o que sera compartilhado antes de tocar (24.16, item 3).
        hint: TelaDoEncontro.avisoDeTransparencia,
        child: BotaoPrimario(
          rotulo: TelaDoEncontro.rotuloDePedir,
          carregando: _enviandoPedido,
          aoTocar: _enviandoPedido ? null : _pedir,
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// As pecas da pagina
// ---------------------------------------------------------------------------

class _Margem extends StatelessWidget {
  const _Margem({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: BichuEspaco.e4),
        child: child,
      );
}

class _Secao extends StatelessWidget {
  const _Secao({required this.icone, required this.titulo, required this.child});

  final IconData icone;
  final String titulo;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return _Margem(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              ExcludeSemantics(child: Icon(icone, color: cores.primary)),
              const SizedBox(width: BichuEspaco.e2),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(titulo, style: textos.titleMedium),
                ),
              ),
            ],
          ),
          const SizedBox(height: BichuEspaco.e3),
          child,
        ],
      ),
    );
  }
}

class _AvisoDeCancelado extends StatelessWidget {
  const _AvisoDeCancelado();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: BichuEspaco.e4,
        vertical: BichuEspaco.e3,
      ),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Text(
        TelaDoEncontro.avisoDeCancelado,
        style: textos.bodyLarge?.copyWith(color: cores.textPrimary),
      ),
    );
  }
}

class _CaixaDoPrivado extends StatelessWidget {
  const _CaixaDoPrivado({
    required this.foco,
    required this.icone,
    required this.titulo,
    required this.texto,
    this.aviso,
    this.acao,
    this.erro,
  });

  final FocusNode foco;

  /// A falha da ultima acao do pedido, dita aqui dentro e nao num aviso
  /// passageiro: a caixa e a regiao de status (24.13.5).
  final String? erro;
  final IconData icone;
  final String titulo;
  final String texto;
  final String? aviso;
  final Widget? acao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Focus(
      focusNode: foco,
      child: Semantics(
        container: true,
        liveRegion: true,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(BichuEspaco.e4),
          decoration: BoxDecoration(
            color: cores.surfaceAlt,
            borderRadius: BorderRadius.circular(BichuRaio.lg),
            border: Border.all(color: cores.outline, width: BichuBorda.hairline),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  ExcludeSemantics(child: Icon(icone, color: cores.primary)),
                  const SizedBox(width: BichuEspaco.e2),
                  Expanded(
                    child: Text(
                      titulo,
                      style: textos.labelLarge?.copyWith(
                        color: cores.textPrimary,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: BichuEspaco.e2),
              Text(
                texto,
                style: textos.bodySmall?.copyWith(color: cores.textPrimary),
              ),
              if (aviso != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e3),
                // O aviso visivel fica fora da arvore: ele ja e a descricao
                // (hint) do botao, e ler duas vezes e ruido.
                ExcludeSemantics(
                  child: Text(
                    aviso!,
                    style: textos.bodySmall?.copyWith(
                      color: cores.textSecondary,
                    ),
                  ),
                ),
              ],
              if (erro != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e3),
                Text(
                  erro!,
                  style: textos.bodySmall?.copyWith(color: cores.error),
                ),
              ],
              if (acao != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e3),
                acao!,
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// O que a consulta do pedido devolveu.
class _PedidoLido {
  const _PedidoLido({
    required this.temPedido,
    required this.estado,
    required this.detalhes,
    required this.detalhesFalharam,
  }) : indisponivel = false;

  const _PedidoLido.indisponivel()
      : temPedido = false,
        estado = null,
        detalhes = null,
        detalhesFalharam = false,
        indisponivel = true;

  final bool temPedido;
  final EstadoDoPedido? estado;
  final DetalhesDoPrivado? detalhes;
  final bool detalhesFalharam;
  final bool indisponivel;
}

class _CaixaQuando extends StatelessWidget {
  const _CaixaQuando({
    required this.dia,
    required this.ano,
    required this.horario,
    required this.acao,
  });

  final DiaDoEncontro dia;
  final int ano;

  /// Nulo no privado nao aprovado: so a data, sem hora (24.16).
  final HorarioDoEncontro? horario;
  final Widget? acao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final h = horario;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surfaceAlt,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              BlocoDoDia(dia: dia, comFundo: false),
              const SizedBox(width: BichuEspaco.e4),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      dia.dataLonga(anoCorrente: ano),
                      style: textos.labelLarge?.copyWith(
                        color: cores.textPrimary,
                      ),
                    ),
                    if (h != null) ...<Widget>[
                      const SizedBox(height: BichuEspaco.e1),
                      Text(h.faixaComDuracao, style: textos.bodySmall),
                      const SizedBox(height: BichuEspaco.e1),
                      Text(
                        h.fuso.rotulo,
                        style: textos.labelSmall?.copyWith(
                          color: cores.textSecondary,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          if (acao != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e4),
            acao!,
          ],
        ],
      ),
    );
  }
}

class _Fotos extends StatelessWidget {
  const _Fotos({required this.imagens});

  final List<ImagemDoEncontro> imagens;

  /// A miniatura: 144 dp de largura (pedido P-M6), 4:3.
  static const double _largura = 144;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return SizedBox(
      height: _largura / proporcaoDaFoto,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: imagens.length,
        separatorBuilder: (_, _) => const SizedBox(width: BichuEspaco.e3),
        itemBuilder: (context, i) => ClipRRect(
          borderRadius: BorderRadius.circular(BichuRaio.md),
          child: SizedBox(
            width: _largura,
            child: Image.network(
              imagens[i].url,
              fit: BoxFit.cover,
              semanticLabel: imagens[i].textoAlternativo,
              errorBuilder: (_, _, _) => ColoredBox(color: cores.surfaceSunken),
            ),
          ),
        ),
      ),
    );
  }
}

class _Pilula extends StatelessWidget {
  const _Pilula({required this.texto, this.icone});

  final String texto;
  final IconData? icone;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: BichuEspaco.e3,
        vertical: BichuEspaco.e1,
      ),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.full),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          if (icone != null) ...<Widget>[
            ExcludeSemantics(
              child: Icon(icone, size: BichuEspaco.e5, color: cores.primary),
            ),
            const SizedBox(width: BichuEspaco.e1),
          ],
          Flexible(
            child: Text(
              texto,
              style: textos.labelMedium?.copyWith(color: cores.textPrimary),
            ),
          ),
        ],
      ),
    );
  }
}

/// `Para quais cães`: portes, idade e `Vacinação em dia` (so quando exigida).
/// **Sem pilula de guia** (UX 28.7.2): a frase inteira esta em `Cuidados`.
class _ParaQuaisCaes extends StatelessWidget {
  const _ParaQuaisCaes({required this.c});

  final ConteudoDoEncontro c;

  @override
  Widget build(BuildContext context) {
    final todos = c.portesAceitos.length == Porte.values.length;
    final idade = c.idadeDosCaes;
    return Wrap(
      spacing: BichuEspaco.e2,
      runSpacing: BichuEspaco.e2,
      children: <Widget>[
        if (todos)
          const _Pilula(texto: 'Todos os portes')
        else
          for (final p in Porte.values)
            if (c.portesAceitos.contains(p)) _Pilula(texto: p.rotulo),
        if (idade != null) _Pilula(texto: idade.rotulo),
        if (c.vacinacaoExigida)
          const _Pilula(
            texto: 'Vacinação em dia',
            icone: Icons.check_circle_outline,
          ),
      ],
    );
  }
}

/// `O que levar`, em duas colunas, com o icone fixo de cada item (24.13.3).
class _OQueLevar extends StatelessWidget {
  const _OQueLevar({required this.itens});

  final List<ItemParaLevar> itens;

  static IconData icone(ItemParaLevar item) => switch (item) {
        ItemParaLevar.agua => Icons.water_drop_outlined,
        ItemParaLevar.poteDeAgua => Icons.water_drop_outlined,
        ItemParaLevar.saquinho => Icons.shopping_bag_outlined,
        ItemParaLevar.guia => Icons.link,
        ItemParaLevar.petisco => Icons.star_outline,
        ItemParaLevar.brinquedo => Icons.sports_baseball_outlined,
        ItemParaLevar.toalha => Icons.check_circle_outline,
        ItemParaLevar.carteiraDeVacinacao => Icons.check_circle_outline,
      };

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return LayoutBuilder(
      builder: (context, limites) {
        final coluna = (limites.maxWidth - BichuEspaco.e3) / 2;
        return Wrap(
          spacing: BichuEspaco.e3,
          runSpacing: BichuEspaco.e2,
          children: <Widget>[
            for (final item in itens)
              SizedBox(
                width: coluna,
                child: Row(
                  children: <Widget>[
                    ExcludeSemantics(
                      child: Icon(
                        icone(item),
                        size: BichuEspaco.e5,
                        color: cores.primary,
                      ),
                    ),
                    const SizedBox(width: BichuEspaco.e2),
                    Expanded(child: Text(item.rotulo, style: textos.bodySmall)),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

/// `Cuidados no encontro`, com marcador NEUTRO: um ponto de 8 dp em
/// `textSecondary`, sem o visto, que se lia como "feito" (24.17.1, item 1).
class _Cuidados extends StatelessWidget {
  const _Cuidados({required this.frases});

  final List<String> frases;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        for (final f in frases)
          Padding(
            padding: const EdgeInsets.only(bottom: BichuEspaco.e2),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Padding(
                  padding: const EdgeInsets.only(top: BichuEspaco.e2),
                  child: Container(
                    width: BichuEspaco.e2,
                    height: BichuEspaco.e2,
                    decoration: BoxDecoration(
                      color: cores.textSecondary,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
                const SizedBox(width: BichuEspaco.e3),
                Expanded(child: Text(f, style: textos.bodyMedium)),
              ],
            ),
          ),
      ],
    );
  }
}

class _ListaComVisto extends StatelessWidget {
  const _ListaComVisto({required this.itens});

  final List<String> itens;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        for (final i in itens)
          Padding(
            padding: const EdgeInsets.only(bottom: BichuEspaco.e2),
            child: Row(
              children: <Widget>[
                ExcludeSemantics(
                  child: Icon(
                    Icons.check_circle_outline,
                    size: BichuEspaco.e5,
                    color: cores.primary,
                  ),
                ),
                const SizedBox(width: BichuEspaco.e2),
                Expanded(child: Text(i, style: textos.bodyMedium)),
              ],
            ),
          ),
      ],
    );
  }
}

class _FolhaDeDuasAcoes extends StatelessWidget {
  const _FolhaDeDuasAcoes({
    required this.titulo,
    required this.texto,
    required this.principal,
    required this.rotuloSecundario,
    required this.aoTocarSecundario,
  });

  final String titulo;
  final String texto;
  final Widget principal;
  final String rotuloSecundario;
  final VoidCallback aoTocarSecundario;

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        BichuEspaco.e6,
        0,
        BichuEspaco.e6,
        BichuEspaco.e6,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Semantics(header: true, child: Text(titulo, style: textos.titleLarge)),
          const SizedBox(height: BichuEspaco.e3),
          Text(texto, style: textos.bodyLarge),
          const SizedBox(height: BichuEspaco.e6),
          principal,
          const SizedBox(height: BichuEspaco.e2),
          TextButton(
            onPressed: aoTocarSecundario,
            style: TextButton.styleFrom(
              minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
            ),
            child: Text(rotuloSecundario),
          ),
        ],
      ),
    );
  }
}

/// A volta com a barra de topo normal.
class _BotaoVoltar extends StatelessWidget {
  const _BotaoVoltar({required this.aoTocar});
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

/// `Botão sobre mídia`: 48 dp, fundo `surface`, sombra propria, para o
/// contraste nao depender da foto (24.12.1 e 24.12.6).
class _BotaoVoltarSobreMidia extends StatelessWidget {
  const _BotaoVoltarSobreMidia({required this.aoTocar});
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

class _EsqueletoDoEncontro extends StatelessWidget {
  const _EsqueletoDoEncontro();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Semantics(
      label: 'Carregando o encontro',
      child: AspectRatio(
        aspectRatio: proporcaoDaCapa,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: cores.surfaceSunken,
            borderRadius: BorderRadius.circular(BichuRaio.lg),
          ),
        ),
      ),
    );
  }
}
