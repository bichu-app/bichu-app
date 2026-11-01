/// A AREA DE MENSAGENS: a lista de conversas, e a porta da conversa aberta.
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/conversas_api.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_conversa.dart';
import '../../escopo.dart';
import '../../formato/quando.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/barra_de_listagem.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/marca_da_pessoa.dart';

/// Os enderecos da area de mensagens, num lugar so.
abstract final class RotasDeMensagens {
  /// A raiz da secao: a lista de conversas.
  static const String area = '/mensagens';

  /// Uma conversa, pelo id. Widget: `TelaDaConversa`.
  static const String conversa = '/mensagens/:conversaId';

  /// O nome do parametro de caminho, num lugar so: quem monta o endereco e quem
  /// o le usam a mesma palavra.
  static const String parametroDaConversa = 'conversaId';

  /// O endereco da conversa [conversaId].
  static String conversaDe(String conversaId) =>
      '/mensagens/${Uri.encodeComponent(conversaId)}';
}

/// **O PONTO UNICO DO TOQUE NO ICONE DA CONVERSA.** Ligar aqui, e so aqui.
abstract final class PortaDoPerfilDoParticipante {
  /// O endereco do perfil de [outro], ou `null` quando ele nao existe.
  static String? Function(ParticipanteDaConversa outro) destino = _semDestino;

  static String? _semDestino(ParticipanteDaConversa outro) => null;

  /// Volta ao estado de fabrica.
  static void soltar() => destino = _semDestino;
}

/// Os textos da area, num lugar so.
abstract final class TextosDasMensagens {
  static const String titulo = 'Mensagens';

  /// A lista vazia: **uma linha**, sem texto de apoio (decisao do cliente).
  static const String listaVazia = 'Você ainda não tem mensagens.';

  static const String naoConseguimosCarregar =
      'Não conseguimos carregar suas mensagens. Toque em Tentar de novo.';

  /// O 410 nos dois casos -- encerrada, e conta desabilitada do outro lado.
  static const String conversaEncerrada = 'Esta conversa está encerrada.';

  static const String aindaDaParaLer =
      'Você continua lendo o que foi escrito, e não é possível enviar mensagem '
      'nova.';

  static const String conversaIndisponivel =
      'Esta conversa não está disponível. Volte para a lista de mensagens.';

  static const String carregarAnteriores = 'Carregar mensagens anteriores';

  /// O nome do campo de busca.
  static const String buscarConversa = 'Buscar conversa';

  /// Como chamar o que esta listado, para a linha de resumo da barra.
  static const SubstantivoDaListagem substantivo = SubstantivoDaListagem(
    singular: 'conversa',
    plural: 'conversas',
  );

  /// A busca nao achou nada. **Nao e a lista vazia** [listaVazia]: a pessoa TEM
  /// mensagens, e o que nao casou foi o termo.
  static const String nadaParaEsteTermo =
      'Nenhuma conversa com esse termo.';

  static const String campoDeMensagem = 'Escreva uma mensagem';

  static const String enviar = 'Enviar a mensagem';

  static const String naoFoiEnviada =
      'A mensagem não foi enviada. Confira a conexão e toque em Tentar de novo '
      '— o que você escreveu continua aí.';

  static const String dadoRetirado =
      'Retiramos um dado de contato da mensagem. O combinado acontece por aqui.';

  /// O rotulo acessivel da linha da lista.
  static String rotuloDaLinha({
    required String quem,
    required String pet,
    required bool naoLida,
    String? quando,
  }) {
    final marca = naoLida ? ', mensagem nova' : '';
    final momento = quando == null ? '' : ', $quando';
    return 'Conversa com $quem sobre $pet$marca$momento';
  }

  static String rotuloDaMarcaNeutra(String quem) => 'Marca de $quem';

  /// O nome acessivel do icone QUANDO ELE E UM CONTROLE.
  static String rotuloDaPortaDoPerfil(String quem) => 'Abrir o perfil de $quem';
}

/// A raiz da area de mensagens: a lista de conversas.
class AreaDeMensagens extends StatefulWidget {
  const AreaDeMensagens({
    super.key,
    this.conversas,
    this.aoContarNaoLidas,
    this.aoVerAArea,
  });

  /// O cliente de conversa. Nulo usa o do [Escopo], que e o caminho do app.
  final ConversasApi? conversas;

  /// **A COSTURA DO SINO**, para quem monta a barra de topo.
  final ValueChanged<int>? aoContarNaoLidas;

  /// **A SEGUNDA COSTURA: a area foi VISTA** (20/10/2026).
  final VoidCallback? aoVerAArea;

  @override
  State<AreaDeMensagens> createState() => _EstadoDaAreaDeMensagens();
}

class _EstadoDaAreaDeMensagens extends State<AreaDeMensagens> {
  final List<Conversa> _conversas = <Conversa>[];

  final TextEditingController _buscaControlador = TextEditingController();

  final ScrollController _rolagem = ScrollController();

  ConversasApi get _api =>
      widget.conversas ?? ConversasApi(Escopo.of(context).api);
  String? _cursor;
  bool _carregando = true;
  bool _carregandoMais = false;
  String? _falha;

  bool _faltaConta = false;

  String? _termoAplicado;

  int _total = 0;

  static const double _folgaDoGatilho = 400;

  int _naoLidas = 0;

  @override
  void initState() {
    super.initState();
    _rolagem.addListener(_aoRolar);
    WidgetsBinding.instance.addPostFrameCallback((_) => _carregar());
  }

  @override
  void dispose() {
    _rolagem
      ..removeListener(_aoRolar)
      ..dispose();
    _buscaControlador.dispose();
    super.dispose();
  }

  void _aoRolar() {
    if (!_rolagem.hasClients) return;
    final posicao = _rolagem.position;
    if (posicao.pixels < posicao.maxScrollExtent - _folgaDoGatilho) return;
    _carregarMais();
  }

  void _completarATela() {
    if (!mounted || _cursor == null) return;
    if (!_rolagem.hasClients) return;
    if (_rolagem.position.maxScrollExtent > 0) return;
    _carregarMais();
  }

  void _aposOQuadro() {
    WidgetsBinding.instance.addPostFrameCallback((_) => _completarATela());
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _falha = null;
      _faltaConta = false;
    });
    try {
      final pagina = await _api.listar(termo: _termoAplicado);
      if (!mounted) return;
      setState(() {
        _conversas
          ..clear()
          ..addAll(pagina.items);
        _cursor = pagina.nextCursor;
        _naoLidas = pagina.unreadCount;
        _total = pagina.total;
        _carregando = false;
      });
      _aposOQuadro();
      widget.aoContarNaoLidas?.call(_naoLidas);
      await _api.marcarListaVista();
      if (!mounted) return;
      widget.aoVerAArea?.call();
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _conversas.clear();
        _total = 0;
        _carregando = false;
        _faltaConta = faltaConta(falha);
        _falha = _faltaConta ? null : TextosDasMensagens.naoConseguimosCarregar;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _conversas.clear();
        _total = 0;
        _carregando = false;
        _falha = TextosDasMensagens.naoConseguimosCarregar;
      });
    }
  }

  void _aplicarBusca(String? termo) {
    if (termo == _termoAplicado) return;
    setState(() {
      _termoAplicado = termo;
      _cursor = null;
    });
    _carregar();
  }

  Future<void> _carregarMais() async {
    final cursor = _cursor;
    if (cursor == null || _carregandoMais || _carregando) return;
    setState(() {
      _carregandoMais = true;
      _falha = null;
    });
    try {
      final pagina = await _api.listar(cursor: cursor, termo: _termoAplicado);
      if (!mounted) return;
      setState(() {
        _conversas.addAll(pagina.items);
        _cursor = pagina.nextCursor;
        _naoLidas = pagina.unreadCount;
        _total = pagina.total;
        _carregandoMais = false;
      });
      _aposOQuadro();
      widget.aoContarNaoLidas?.call(_naoLidas);
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falha = TextosDasMensagens.naoConseguimosCarregar;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falha = TextosDasMensagens.naoConseguimosCarregar;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text(TextosDasMensagens.titulo)),
      body: SafeArea(
        child: ArrastarParaAtualizar(
          aoAtualizar: _carregar,
          child: _corpo(),
        ),
      ),
    );
  }

  ControleDeBusca _controleDeBusca() {
    return ControleDeBusca(
      controlador: _buscaControlador,
      alcance: AlcanceDaBusca.servidor,
      rotulo: TextosDasMensagens.buscarConversa,
      termoAplicado: _termoAplicado,
      minimoDeCaracteres: 2,
      aoAplicar: _aplicarBusca,
    );
  }

  Widget _corpo() {
    if (_carregando) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_faltaConta) {
      return ListView(
        padding: const EdgeInsets.all(BichuEspaco.e4),
        children: const <Widget>[
          ConviteParaEntrar(secao: SecaoComConta.mensagens),
        ],
      );
    }

    final falha = _falha;
    if (_conversas.isEmpty && falha != null) {
      return ListView(
        padding: const EdgeInsets.all(BichuEspaco.e4),
        children: <Widget>[
          FaixaDeAviso(
            texto: falha,
            rotuloDaAcao: MensagensDeErro.tentarDeNovo,
            aoTocarNaAcao: _carregar,
          ),
        ],
      );
    }

    final busca = _controleDeBusca();
    final comBarra = BarraDeListagem.desenha(total: _total, busca: busca);

    final barra = comBarra
        ? Padding(
            padding: const EdgeInsets.fromLTRB(
              BichuEspaco.e4,
              BichuEspaco.e2,
              BichuEspaco.e4,
              0,
            ),
            child: BarraDeListagem(
              total: _total,
              busca: busca,
              substantivo: TextosDasMensagens.substantivo,
            ),
          )
        : const SizedBox.shrink();

    if (_conversas.isEmpty) {
      final vazio = _termoAplicado == null
          ? TextosDasMensagens.listaVazia
          : TextosDasMensagens.nadaParaEsteTermo;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          barra,
          Padding(
            padding: const EdgeInsets.all(BichuEspaco.e4),
            child: Text(vazio, style: Theme.of(context).textTheme.bodyLarge),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        barra,
        Expanded(
          child: ListView.separated(
            controller: _rolagem,
            padding: const EdgeInsets.symmetric(vertical: BichuEspaco.e2),
            itemCount: _conversas.length + 1,
            separatorBuilder: (context, i) => const Divider(height: 1),
            itemBuilder: (context, i) {
              if (i == _conversas.length) return _rodape();
              return LinhaDaConversa(conversa: _conversas[i]);
            },
          ),
        ),
      ],
    );
  }

  Widget _rodape() {
    final falha = _falha;
    if (falha != null) {
      return Padding(
        padding: const EdgeInsets.all(BichuEspaco.e4),
        child: FaixaDeAviso(
          texto: falha,
          rotuloDaAcao: MensagensDeErro.tentarDeNovo,
          aoTocarNaAcao: _carregarMais,
        ),
      );
    }
    if (_cursor == null) return const SizedBox(height: BichuEspaco.e4);
    return const Padding(
      padding: EdgeInsets.all(BichuEspaco.e4),
      child: Center(child: CircularProgressIndicator()),
    );
  }
}

/// Uma linha da lista: quem escreveu, o trecho, quando, e a marca de nao lida.
class LinhaDaConversa extends StatelessWidget {
  const LinhaDaConversa({required this.conversa, super.key});

  final Conversa conversa;

  /// O PONTO UNICO da marca. Vem do servidor (`Conversation.unread`).
  bool get naoLida => conversa.unread;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    final outro = conversa.outroLadoVistoPor(conversa.papelDoChamador);
    final quem = outro?.displayName ?? '';
    final marca = outro?.marcaNeutra ?? '';
    final emLeitura = !conversa.status.aceitaMensagem;
    final trecho = conversa.lastMessagePreview ?? TrechoDaUltimaMensagem.de(conversa);
    final quando = conversa.lastMessageAt;
    final porta = outro == null
        ? null
        : PortaDoPerfilDoParticipante.destino(outro);

    return Semantics(
      button: true,
      label: TextosDasMensagens.rotuloDaLinha(
        quem: quem,
        pet: conversa.petDisplayName,
        naoLida: naoLida,
        quando: quando == null
            ? null
            : QuandoNaLista.de(quando, agora: DateTime.now()),
      ),
      excludeSemantics: porta == null,
      child: InkWell(
        onTap: () =>
            context.push(RotasDeMensagens.conversaDe(conversa.id)),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: BichuEspaco.e4,
            vertical: BichuEspaco.e3,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              MarcaNeutraDoParticipante(
                inicial: marca,
                quem: quem,
                desligada: emLeitura,
                participante: outro,
              ),
              const SizedBox(width: BichuEspaco.e3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text.rich(
                      TextSpan(
                        children: <InlineSpan>[
                          TextSpan(
                            text: quem,
                            style: textos.titleSmall?.copyWith(
                              color: cores.textPrimary,
                            ),
                          ),
                          TextSpan(
                            text: '  ·  ${conversa.petDisplayName}',
                            style: textos.bodySmall?.copyWith(
                              color: cores.textSecondary,
                            ),
                          ),
                        ],
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (trecho != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          trecho,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: textos.bodySmall?.copyWith(
                            color: naoLida
                                ? cores.textPrimary
                                : cores.textSecondary,
                            fontWeight: naoLida ? FontWeight.w600 : null,
                          ),
                        ),
                      )
                    else if (emLeitura)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          TextosDasMensagens.conversaEncerrada,
                          style: textos.bodySmall?.copyWith(
                            color: cores.textSecondary,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              if (quando != null || naoLida)
                Padding(
                  padding: const EdgeInsets.only(left: BichuEspaco.e2),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: <Widget>[
                      if (quando != null)
                        Text(
                          QuandoNaLista.de(quando, agora: DateTime.now()),
                          style: textos.bodySmall?.copyWith(
                            color: cores.textMuted,
                          ),
                        ),
                      if (naoLida)
                        Container(
                          margin: const EdgeInsets.only(top: BichuEspaco.e2),
                          width: 10,
                          height: 10,
                          decoration: BoxDecoration(
                            color: cores.primary,
                            shape: BoxShape.circle,
                          ),
                        ),
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

/// O ICONE DA CONVERSA: a FOTO quando ela vem, e a marca neutra quando nao.
class MarcaNeutraDoParticipante extends StatelessWidget {
  const MarcaNeutraDoParticipante({
    required this.inicial,
    required this.quem,
    super.key,
    this.desligada = false,
    this.tamanho = 40,
    this.participante,
  });

  final String inicial;

  /// Para o rotulo acessivel.
  final String quem;

  final bool desligada;

  final double tamanho;

  /// O outro lado, quando a linha o conhece.
  final ParticipanteDaConversa? participante;

  /// O alvo de toque do icone, em dp.
  static const double alvoDeToque = 48;

  @override
  Widget build(BuildContext context) {
    final quemEle = participante;
    final marca = MarcaDaPessoa(
      urlDoIcone: quemEle?.photoIconUrl,
      inicial: inicial,
      lado: tamanho,
      desligada: desligada,
      apelido: quemEle?.handle,
    );

    final destino = quemEle == null
        ? null
        : PortaDoPerfilDoParticipante.destino(quemEle);
    if (destino == null) {
      return Semantics(
        label: TextosDasMensagens.rotuloDaMarcaNeutra(quem),
        child: ExcludeSemantics(child: marca),
      );
    }

    return Semantics(
      button: true,
      label: TextosDasMensagens.rotuloDaPortaDoPerfil(quem),
      excludeSemantics: true,
      child: InkWell(
        onTap: () => context.push(destino),
        customBorder: const CircleBorder(),
        child: SizedBox(
          width: alvoDeToque,
          height: alvoDeToque,
          child: Center(child: marca),
        ),
      ),
    );
  }
}
