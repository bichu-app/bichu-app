import 'dart:async';

import 'package:flutter/material.dart';

import '../../api/cache_de_imagens.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_conexao.dart';
import '../../api/modelos_pessoa.dart';
import '../../api/problem.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/imagem_da_rede.dart';

/// Um resultado da busca de pessoas, com a ação de pedir conexão e **os quatro
/// estados da relação**.
class CartaoDePessoaEncontrada extends StatefulWidget {
  const CartaoDePessoaEncontrada({
    required this.pessoa,
    required this.aoPedir,
    required this.aoAceitar,
    required this.aoEncerrar,
    required this.aoAbrirOPerfil,
    super.key,
    this.pedidosQueAindaCabem,
  });

  final PessoaEncontrada pessoa;

  /// Quantos pedidos ainda cabem hoje, ou **nulo para "não sei"**.
  final int? pedidosQueAindaCabem;

  /// Pede a conexão e devolve a aresta que o servidor criou **ou devolveu**.
  final Future<Conexao?> Function() aoPedir;

  final Future<Conexao> Function(String ref) aoAceitar;

  /// Recusar, cancelar e desfazer são a **mesma** operação, e o app não diz
  /// qual: a semântica é derivada do estado e do papel, no servidor.
  final Future<void> Function(String ref) aoEncerrar;

  final VoidCallback aoAbrirOPerfil;

  static const String pedirConexao = 'Pedir conexão';
  static const String cancelarPedido = 'Cancelar';
  static const String aceitar = 'Aceitar';
  static const String recusar = 'Recusar';

  static const String pedidoEnviado = 'Pedido enviado, aguardando aceite';
  static const String pedidoRecebido = 'Pediu conexão com você';
  static const String jaEhConexao = 'Já é sua conexão';

  /// O lado de dentro do círculo quando não há letra aproveitável.
  static const String inicialDeQuemNaoTem = '·';

  /// O lado do círculo — **e ele não mudou quando a foto entrou**.
  static const double ladoDoCirculo = 56;

  static String rotuloDePets(int quantos) =>
      quantos == 1 ? '1 pet' : '$quantos pets';

  static String rotuloDeConexoes(int quantas) =>
      quantas == 1 ? '1 conexão' : '$quantas conexões';

  /// A frase do teto, **com o número do servidor dentro**.
  static String tetoEmPalavras(int restam) {
    if (restam <= 0) {
      return 'Você já enviou os pedidos de hoje. Amanhã cabem mais.';
    }
    if (restam == 1) return 'Ainda cabe 1 pedido hoje.';
    return 'Ainda cabem $restam pedidos hoje.';
  }

  /// A frase de cada recusa de teto, pelo código que o servidor mandou.
  static String frasePara(RecusaDoPedidoDeConexao recusa) {
    switch (recusa) {
      case RecusaDoPedidoDeConexao.tetoDeConexoes:
        return 'Você chegou ao limite de conexões.';
      case RecusaDoPedidoDeConexao.tetoDeConexoesDeQuemRecebe:
        return 'Esse usuário não pode receber novas conexões agora.';
      case RecusaDoPedidoDeConexao.tetoDePendentes:
        return 'Você tem muitos pedidos esperando resposta. Espere um deles '
            'ser respondido.';
      case RecusaDoPedidoDeConexao.tetoDoDia:
        return 'Você já enviou os pedidos de hoje. Amanhã cabem mais.';
      case RecusaDoPedidoDeConexao.emDescanso:
        return 'Esse pedido foi feito há pouco tempo. Espere um pouco antes de '
            'pedir de novo.';
      case RecusaDoPedidoDeConexao.jaExiste:
        return 'Vocês já têm uma conexão ou um pedido em andamento.';
    }
  }

  @override
  State<CartaoDePessoaEncontrada> createState() =>
      _EstadoDoCartaoDePessoaEncontrada();
}

class _EstadoDoCartaoDePessoaEncontrada
    extends State<CartaoDePessoaEncontrada> {
  /// A relação como o cartão a conhece.
  late EstadoDaConexao? _estado = widget.pessoa.estadoDaConexao;

  /// O `ref` da **aresta**, nunca da pessoa.
  String? _ref;

  bool _agindo = false;
  String? _recusa;

  /// Roda [acao] com o cartão em `carregando`, e **relê o estado do que ela
  /// devolveu** em vez de supô-lo.
  Future<void> _agir(Future<void> Function() acao) async {
    if (_agindo) return;
    setState(() {
      _agindo = true;
      _recusa = null;
    });
    try {
      await acao();
      if (!mounted) return;
      setState(() => _agindo = false);
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      setState(() {
        _agindo = false;
        _recusa = _motivoDaRecusa(falha);
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _agindo = false;
        _recusa = MensagensDeErro.de(falha).texto;
      });
    }
  }

  /// Traduz a falha na frase certa, **decidindo por `errors[].code` e nunca
  /// pelo status sozinho**.
  String _motivoDaRecusa(FalhaDaApi falha) {
    if (falha.tipo == ProblemTipo.naoEncontrado) {
      return 'Não encontramos este usuário.';
    }
    final campo =
        falha.problem.campo(RecusaDoPedidoDeConexao.campoDoApelido)?.codigo;
    final recusa = RecusaDoPedidoDeConexao.porCodigo(campo);
    if (recusa != null) return CartaoDePessoaEncontrada.frasePara(recusa);
    return MensagensDeErro.de(falha).texto;
  }

  Future<void> _pedir() async {
    await _agir(() async {
      final conexao = await widget.aoPedir();
      if (conexao == null || !mounted) return;
      setState(() {
        _estado = conexao.state;
        _ref = conexao.ref;
      });
    });
  }

  Future<void> _aceitar(String ref) async {
    await _agir(() async {
      final conexao = await widget.aoAceitar(ref);
      if (!mounted) return;
      setState(() {
        _estado = conexao.state;
        _ref = conexao.ref;
      });
    });
  }

  Future<void> _encerrar(String ref) async {
    await _agir(() async {
      await widget.aoEncerrar(ref);
      if (!mounted) return;
      setState(() {
        _estado = null;
        _ref = null;
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      button: true,
      label: widget.pessoa.nomeParaLer,
      child: InkWell(
        onTap: widget.aoAbrirOPerfil,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        child: Container(
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
                  _avatar(cores, textos),
                  const SizedBox(width: BichuEspaco.e3),
                  Expanded(child: _identificacao(cores, textos)),
                ],
              ),
              const SizedBox(height: BichuEspaco.e4),
              ..._areaDeAcao(cores, textos),
            ],
          ),
        ),
      ),
    );
  }

  /// O avatar: **a foto quando há uma, a inicial quando não há.**
  Widget _avatar(BichuCores cores, TextTheme textos) {
    final url = widget.pessoa.photoIconUrl;
    if (url == null || url.isEmpty) return _circuloDaInicial(cores, textos);
    return ExcludeSemantics(
      child: ClipOval(
        child: ImagemDaRede(
          url: url,
          descricao: null,
          largura: CartaoDePessoaEncontrada.ladoDoCirculo,
          simboloDeFalha: Icons.person_outline,
          cache: ChaveDeImagem.dePessoa(url, apelido: widget.pessoa.handle),
        ),
      ),
    );
  }

  /// O círculo com a inicial — **a queda de quem não tem foto pronta**.
  Widget _circuloDaInicial(BichuCores cores, TextTheme textos) {
    final inicial = widget.pessoa.inicial.isEmpty
        ? CartaoDePessoaEncontrada.inicialDeQuemNaoTem
        : widget.pessoa.inicial;
    return ExcludeSemantics(
      child: Container(
        width: CartaoDePessoaEncontrada.ladoDoCirculo,
        height: CartaoDePessoaEncontrada.ladoDoCirculo,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: cores.primaryContainer,
          shape: BoxShape.circle,
        ),
        child: Text(
          inicial,
          style: textos.titleLarge?.copyWith(color: cores.onPrimaryContainer),
        ),
      ),
    );
  }

  Widget _identificacao(BichuCores cores, TextTheme textos) {
    final pessoa = widget.pessoa;
    final contagens =
        '${CartaoDePessoaEncontrada.rotuloDePets(pessoa.petsCount)} · '
        '${CartaoDePessoaEncontrada.rotuloDeConexoes(pessoa.connectionsCount)}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          pessoa.nomeParaLer,
          style: textos.titleMedium?.copyWith(color: cores.textPrimary),
        ),
        if (pessoa.nomeParaLer != '@${pessoa.handle}')
          Text(
            '@${pessoa.handle}',
            style: textos.bodySmall?.copyWith(color: cores.textSecondary),
          ),
        const SizedBox(height: BichuEspaco.e2),
        Text(
          contagens,
          style: textos.bodySmall?.copyWith(color: cores.textSecondary),
        ),
      ],
    );
  }

  /// A área de ação: **uma por estado**, e nunca duas ao mesmo tempo.
  List<Widget> _areaDeAcao(BichuCores cores, TextTheme textos) {
    final recusa = _recusa;
    final ref = _ref;

    final corpo = <Widget>[];

    switch (_estado) {
      case null:
        final restam = widget.pedidosQueAindaCabem;
        if (restam != null && restam <= 0) {
          corpo.add(
            _linhaDeEstado(
              CartaoDePessoaEncontrada.tetoEmPalavras(restam),
              cores,
              textos,
            ),
          );
          break;
        }
        corpo.add(
          BotaoPrimario(
            rotulo: CartaoDePessoaEncontrada.pedirConexao,
            icone: Icons.person_add_alt_1_outlined,
            nomeAcessivel:
                '${CartaoDePessoaEncontrada.pedirConexao} com '
                '${widget.pessoa.nomeParaLer}',
            carregando: _agindo,
            aoTocar: () => unawaited(_pedir()),
          ),
        );

      case EstadoDaConexao.pedidoEnviado:
        corpo
          ..add(
            _linhaDeEstado(
              CartaoDePessoaEncontrada.pedidoEnviado,
              cores,
              textos,
            ),
          )
          ..add(const SizedBox(height: BichuEspaco.e3))
          ..add(
            BotaoSecundario(
              rotulo: CartaoDePessoaEncontrada.cancelarPedido,
              nomeAcessivel:
                  'Cancelar o pedido para ${widget.pessoa.nomeParaLer}',
              carregando: _agindo,
              aoTocar: ref == null ? null : () => unawaited(_encerrar(ref)),
            ),
          );

      case EstadoDaConexao.pedidoRecebido:
        corpo
          ..add(
            _linhaDeEstado(
              CartaoDePessoaEncontrada.pedidoRecebido,
              cores,
              textos,
            ),
          )
          ..add(const SizedBox(height: BichuEspaco.e3))
          ..add(
            BotaoPrimario(
              rotulo: CartaoDePessoaEncontrada.aceitar,
              nomeAcessivel:
                  'Aceitar a conexão com ${widget.pessoa.nomeParaLer}',
              carregando: _agindo,
              aoTocar: ref == null ? null : () => unawaited(_aceitar(ref)),
            ),
          )
          ..add(const SizedBox(height: BichuEspaco.e2))
          ..add(
            BotaoSecundario(
              rotulo: CartaoDePessoaEncontrada.recusar,
              nomeAcessivel: 'Recusar o pedido de ${widget.pessoa.nomeParaLer}',
              carregando: _agindo,
              aoTocar: ref == null ? null : () => unawaited(_encerrar(ref)),
            ),
          );

      case EstadoDaConexao.conectado:
        corpo.add(
          _linhaDeEstado(CartaoDePessoaEncontrada.jaEhConexao, cores, textos),
        );
    }

    if (recusa != null) {
      corpo
        ..add(const SizedBox(height: BichuEspaco.e3))
        ..add(FaixaDeAviso(texto: recusa));
    }

    return corpo;
  }

  Widget _linhaDeEstado(String frase, BichuCores cores, TextTheme textos) {
    return Text(
      frase,
      style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
    );
  }
}
