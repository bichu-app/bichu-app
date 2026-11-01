import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../escopo.dart';
import '../roteamento/rotas.dart';
import '../sessao/contadores_de_nao_lido.dart';
import '../sessao/controlador_de_sessao.dart';
import '../widgets/arrastar_para_atualizar.dart';
import '../widgets/aviso_que_chegou.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import '../theme/icones_da_barra.g.dart';
import '../widgets/barra_de_listagem.dart';
import '../widgets/listagem_preservada.dart';
import '../widgets/imagem_da_rede.dart';
import '../widgets/marca.dart';

/// O estado de uma secao no registro (UX 27.5).
enum EstadoDaSecao { existe, casca, planejada }

/// O campo semantico do glifo de cada secao (BICHUS-230, criterio 2).
enum CampoSemantico { animal, comunidade, publicacao, compra, conta, conversa }

/// De onde a barra de baixo tira a ARTE dos cinco slots.
enum FonteDaArteDaBarra {
  /// Os dez SVG de `design/icones-da-barra/`, pelo gerador e pelo pintor.
  desenhoDoCliente,

  /// Os glifos do Material Symbols, a familia fechada do design system 10.1.
  glifoDoMaterial,
}

/// A fonte de arte que a barra usa HOJE.
const FonteDaArteDaBarra fonteAtivaDaBarra = FonteDaArteDaBarra.glifoDoMaterial;

/// Qual build esta sendo montado (UX 25.7.3).
enum ConfiguracaoDeBuild {
  /// O build que o cliente abre para decidir escopo.
  referencia,

  /// O build que vai para a loja.
  entrega,
}

/// Um destino da barra inferior.
class SubstantivoDaContagem {
  const SubstantivoDaContagem({
    required this.singular,
    required this.plural,
    this.oQueJunta,
  });

  /// Com 1. Ex.: `mensagem nova`.
  final String singular;

  /// Com 0, 2 ou mais. Ex.: `mensagens novas`.
  final String plural;

  /// O que a soma reune, quando o numero da aba soma mais de uma coisa.
  final String? oQueJunta;

  String comQuantidade(int n) {
    final nucleo = '$n ${n == 1 ? singular : plural}';
    final junta = oQueJunta;
    return junta == null ? nucleo : '$nucleo, $junta';
  }
}

class DestinoDeNavegacao {
  const DestinoDeNavegacao({
    required this.rotulo,
    required this.reforcoAcessivel,
    required this.reforcoDaPagina,
    required this.rota,
    required this.estado,
    required this.campoSemantico,
    this.desenho,
    this.desenhoSelecionado,
    this.icone,
    this.iconeSelecionado,
    this.naBarra = true,
    this.ehRamo = true,
    this.destinoProvisorio,
    this.contagem,
  }) : assert(
         (desenho == null) == (desenhoSelecionado == null),
         'MEIO PAR DE DESENHO. Contorno em repouso e preenchido no '
         'selecionado e o M3, e e o que as cinco abas fazem: declarar so um '
         'dos dois e uma aba que nao muda de desenho ao ser tocada, defeito '
         'que so aparece no aparelho.',
       ),
       assert(
         (icone == null) == (iconeSelecionado == null),
         'MEIO PAR DE GLIFO. Mesmo motivo do par de desenho.',
       ),
       assert(
         (desenho == null) != (icone == null),
         'UM DESTINO TEM UMA FONTE DE ARTE, E SO UMA. Ou o desenho do Bichu '
         '(`desenho`), ou um glifo do Material (`icone`) -- nunca os dois, e '
         'nunca nenhum. Declarar os dois seria a segunda fonte da verdade do '
         'que a aba mostra, e e exatamente o estado que deixou os dez SVG do '
         'cliente parados numa pasta enquanto a barra pintava o Material.',
       )
       ;

  /// Se este destino e um ramo do `IndexedStack` de `rotas.dart`.
  final bool ehRamo;

  /// Onde o slot vai **enquanto** [rota] nao existir no roteador.
  final String? destinoProvisorio;

  /// Para onde o toque leva hoje.
  String get destinoDeHoje => destinoProvisorio ?? rota;

  /// Se este destino ocupa um slot da barra de baixo.
  final bool naBarra;

  /// O texto que aparece na barra.
  final String rotulo;

  /// A metade de tras do nome acessivel, que **nunca e vazia**.
  final String reforcoAcessivel;

  /// A primeira linha do corpo da pagina.
  final String reforcoDaPagina;

  /// O DESENHO DO CLIENTE, nos dois estados.
  final DesenhoDoIcone? desenho;
  final DesenhoDoIcone? desenhoSelecionado;

  /// O glifo do Material, nos dois estados.
  final IconData? icone;
  final IconData? iconeSelecionado;

  /// O endereco do ramo. Estado que merece link tem endereco (F5).
  final String rota;

  final EstadoDaSecao estado;

  /// O campo de significado de que o glifo desta secao tira a leitura.
  final CampoSemantico campoSemantico;

  /// O substantivo que o leitor de tela anuncia quando esta aba tem numero.
  final SubstantivoDaContagem? contagem;

  /// O nome que o VoiceOver e o TalkBack anunciam.
  String get semanticsLabel => '$rotulo, $reforcoAcessivel';

  /// O nome acessivel QUANDO HA CONTAGEM, com o numero por extenso e INTEIRO.
  String nomeAcessivelCom(int? naoLidas) {
    final selo = DistintivoDaAba.textoDe(naoLidas);
    if (selo == null) return semanticsLabel;
    final substantivo = contagem;
    assert(
      substantivo != null,
      'A aba $rotulo recebeu contagem e nao declara `contagem` no registro. '
      'Sem o substantivo o leitor de tela anunciaria "$rotulo, ${naoLidas!}" -- '
      'um numero sem assunto. O substantivo mora no registro do destino.',
    );
    if (substantivo == null) return semanticsLabel;
    return '$rotulo, ${substantivo.comQuantidade(naoLidas!)}';
  }
}

/// A casca de navegacao: **cinco** destinos, barra sempre visivel, **inclusive
/// deslogado**.
class CascaComAbas extends StatefulWidget {
  const CascaComAbas({required this.navegacao, super.key});

  final StatefulNavigationShell navegacao;

  /// O registro de secoes, na ordem da barra (UX 27.2).
  static const List<DestinoDeNavegacao> destinos = <DestinoDeNavegacao>[
    DestinoDeNavegacao(
      rotulo: 'Pets',
      reforcoAcessivel: 'pets perdidos e para adoção perto de você',
      reforcoDaPagina: '',
      icone: Icons.pets_outlined,
      iconeSelecionado: Icons.pets,
      rota: Rotas.pets,
      estado: EstadoDaSecao.existe,
      campoSemantico: CampoSemantico.animal,
      contagem: SubstantivoDaContagem(
        singular: 'pet perdido novo',
        plural: 'pets perdidos novos',
      ),
    ),
    DestinoDeNavegacao(
      rotulo: 'Rede',
      reforcoAcessivel: 'eventos e quem atende bem',
      reforcoDaPagina: '',
      icone: Icons.groups_outlined,
      iconeSelecionado: Icons.groups,
      rota: Rotas.rede,
      estado: EstadoDaSecao.existe,
      campoSemantico: CampoSemantico.comunidade,
      contagem: SubstantivoDaContagem(
        singular: 'novidade',
        plural: 'novidades',
        oQueJunta: 'eventos e profissionais novos',
      ),
    ),
    DestinoDeNavegacao(
      rotulo: 'Mural',
      reforcoAcessivel: 'publicações das suas conexões',
      reforcoDaPagina: '',
      icone: Icons.dynamic_feed_outlined,
      iconeSelecionado: Icons.dynamic_feed,
      rota: Rotas.mural,
      estado: EstadoDaSecao.casca,
      campoSemantico: CampoSemantico.publicacao,
    ),
    DestinoDeNavegacao(
      rotulo: 'Loja',
      reforcoAcessivel: 'produtos escolhidos pelo Bichu',
      reforcoDaPagina: '',
      icone: Icons.shopping_bag_outlined,
      iconeSelecionado: Icons.shopping_bag,
      rota: Rotas.loja,
      estado: EstadoDaSecao.existe,
      campoSemantico: CampoSemantico.compra,
    ),
    DestinoDeNavegacao(
      rotulo: 'AuAu',
      reforcoAcessivel: 'mensagens',
      reforcoDaPagina: '',
      icone: Icons.chat_outlined,
      iconeSelecionado: Icons.chat,
      rota: Rotas.mensagens,
      estado: EstadoDaSecao.existe,
      campoSemantico: CampoSemantico.conversa,
      contagem: SubstantivoDaContagem(
        singular: 'mensagem nova',
        plural: 'mensagens novas',
      ),
      ehRamo: false,
    ),
    DestinoDeNavegacao(
      rotulo: 'Perfil',
      reforcoAcessivel: 'seus pets e sua conta',
      reforcoDaPagina: '',
      icone: Icons.account_circle_outlined,
      iconeSelecionado: Icons.account_circle,
      rota: Rotas.perfil,
      estado: EstadoDaSecao.existe,
      campoSemantico: CampoSemantico.conta,
      naBarra: false,
      ehRamo: true,
    ),
  ];

  /// O destino da conta: o que a foto da barra de topo abre.
  static DestinoDeNavegacao get daConta =>
      destinos.firstWhere((d) => !d.naBarra);

  /// A configuracao deste build, vinda de `--dart-define`.
  static ConfiguracaoDeBuild get configuracao {
    const String escolhido = String.fromEnvironment(
      'BICHU_BUILD',
      defaultValue: 'referencia',
    );
    return escolhido == 'entrega'
        ? ConfiguracaoDeBuild.entrega
        : ConfiguracaoDeBuild.referencia;
  }

  /// O destino de uma rota de aba.
  static DestinoDeNavegacao porRota(String rota) {
    return destinos.firstWhere(
      (d) => d.rota == rota,
      orElse: () => throw ArgumentError.value(
        rota,
        'rota',
        'nao esta no registro de secoes de CascaComAbas.destinos',
      ),
    );
  }

  /// Os destinos que a barra mostra em [qual].
  static List<DestinoDeNavegacao> visiveisEm(
    ConfiguracaoDeBuild qual, {
    List<DestinoDeNavegacao>? entre,
  }) {
    final lista = (entre ?? destinos).where((d) => d.naBarra);
    if (qual == ConfiguracaoDeBuild.referencia) {
      return lista.toList(growable: false);
    }
    return lista
        .where((d) => d.estado != EstadoDaSecao.planejada)
        .toList(growable: false);
  }

  /// Os destinos que sao ramo do `IndexedStack`, na ordem dos ramos.
  static List<DestinoDeNavegacao> get ramosDoRegistro =>
      destinos.where((d) => d.ehRamo).toList(growable: false);

  @override
  State<CascaComAbas> createState() => _CascaComAbasState();
}

class _CascaComAbasState extends State<CascaComAbas> {
  final GlobalKey<ScaffoldState> _casca = GlobalKey<ScaffoldState>(
    debugLabel: 'casca-com-abas',
  );

  @override
  Widget build(BuildContext context) {
    final navegacao = widget.navegacao;
    final ramosDoRegistro = CascaComAbas.ramosDoRegistro;
    final visiveis = CascaComAbas.visiveisEm(CascaComAbas.configuracao);
    final selecionado = visiveis.indexWhere(
      (d) => d.ehRamo && ramosDoRegistro.indexOf(d) == navegacao.currentIndex,
    );
    return Scaffold(
      key: _casca,
      body: Column(
        children: <Widget>[
          const AvisoQueChegou(),
          Expanded(child: navegacao),
        ],
      ),
      bottomNavigationBar: BarraDeBaixo(
        slotAceso: selecionado,
        aoTocar: (destino) {
          final ramo = ramosDoRegistro.indexOf(destino);
          if (!destino.ehRamo || ramo < 0) {
            GoRouter.of(context).push(destino.destinoDeHoje);
            return;
          }
          navegacao.goBranch(
            ramo,
            initialLocation: ramo == navegacao.currentIndex,
          );
        },
      ),
    );
  }
}

/// A BARRA DE BAIXO, DESENHADA NUM PONTO SO.
class BarraDeBaixo extends StatelessWidget {
  const BarraDeBaixo({
    required this.slotAceso,
    required this.aoTocar,
    super.key,
  });

  /// O slot que fica ACESO, ou **-1 para nenhum**.
  final int slotAceso;

  /// O que o toque num slot FAZ.
  final void Function(DestinoDeNavegacao destino) aoTocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final visiveis = CascaComAbas.visiveisEm(CascaComAbas.configuracao);
    final contadores = Escopo.of(context).contadores;

    return ListenableBuilder(
      listenable: contadores,
      builder: (context, _) {
        int? naoLidasDe(DestinoDeNavegacao destino) =>
            _naoLidasDaAba(destino, contadores);

        return DecoratedBox(
          decoration: BoxDecoration(
            border: Border(
              top: BorderSide(color: cores.outline, width: BichuBorda.hairline),
            ),
          ),
          child: _BarraSemSelecao(
            apagar: slotAceso < 0,
            corDoFundo: cores.surface,
            child: NavigationBar(
              selectedIndex: slotAceso < 0 ? 0 : slotAceso,
              onDestinationSelected: (indice) => aoTocar(visiveis[indice]),
              destinations: <Widget>[
                for (final destino in visiveis)
                  Semantics(
                    label: destino.nomeAcessivelCom(naoLidasDe(destino)),
                    child: NavigationDestination(
                      icon: DistintivoDaAba(
                        glifo: Icon(destino.icone),
                        naoLidas: naoLidasDe(destino),
                      ),
                      selectedIcon: DistintivoDaAba(
                        glifo: Icon(destino.iconeSelecionado),
                        naoLidas: naoLidasDe(destino),
                      ),
                      label: destino.rotulo,
                      tooltip: destino.rotulo,
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  static int? _naoLidasDaAba(
    DestinoDeNavegacao destino,
    ContadoresDeNaoLido contadores,
  ) {
    switch (destino.campoSemantico) {
      case CampoSemantico.conversa:
        return contadores.mensagens;
      case CampoSemantico.animal:
        return contadores.perdidos;
      case CampoSemantico.comunidade:
        return contadores.rede;
      case CampoSemantico.publicacao:
      case CampoSemantico.compra:
      case CampoSemantico.conta:
        return null;
    }
  }
}

/// O DISTINTIVO DA ABA: numero por cima do glifo, e cor como REFORCO.
class DistintivoDaAba extends StatelessWidget {
  const DistintivoDaAba({required this.glifo, required this.naoLidas, super.key});

  /// O icone da aba, do registro do destino.
  final Widget glifo;

  /// Quantas, ou **nulo**. Nulo e "ninguem contou ainda" e nao pinta nada.
  final int? naoLidas;

  /// O que o distintivo PINTA, ou nulo quando nao ha o que pintar.
  static String? textoDe(int? naoLidas) {
    if (naoLidas == null || naoLidas <= 0) return null;
    return naoLidas > 9 ? '9+' : '$naoLidas';
  }

  @override
  Widget build(BuildContext context) {
    final texto = textoDe(naoLidas);
    if (texto == null) return glifo;

    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Stack(
      clipBehavior: Clip.none,
      children: <Widget>[
        IconTheme.merge(data: IconThemeData(color: cores.primary), child: glifo),
        Positioned(
          right: -BichuEspaco.e1,
          top: -BichuEspaco.e1,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: BichuEspaco.e1),
            constraints: const BoxConstraints(minWidth: BichuEspaco.e4),
            decoration: BoxDecoration(
              color: cores.primary,
              borderRadius: BorderRadius.circular(BichuRaio.full),
            ),
            child: Text(
              texto,
              textAlign: TextAlign.center,
              semanticsLabel: '',
              style: textos.labelSmall?.copyWith(color: cores.onActionFill),
            ),
          ),
        ),
      ],
    );
  }
}

/// A CASCA DAS TELAS DE PRIMEIRO PLANO: a mesma barra, sem trocar de ramo.
class CascaFixa extends StatelessWidget {
  const CascaFixa({required this.child, super.key});

  final Widget child;

  /// O slot da barra a que o endereco [rota] pertence, ou -1 para nenhum.
  static int slotDaRota(String rota) {
    final visiveis = CascaComAbas.visiveisEm(CascaComAbas.configuracao);
    String primeiro(String endereco) {
      final partes = Uri.parse(endereco).pathSegments;
      return partes.isEmpty ? '' : partes.first;
    }

    final segmento = primeiro(rota);
    if (segmento.isEmpty) return -1;
    return visiveis.indexWhere((d) => primeiro(d.rota) == segmento);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: child,
      bottomNavigationBar: BarraDeBaixo(
        slotAceso: slotDaRota(GoRouterState.of(context).uri.path),
        aoTocar: (destino) => GoRouter.of(context).go(destino.destinoDeHoje),
      ),
    );
  }
}

/// Apaga a SELECAO da barra quando nenhum slot corresponde a tela aberta.
class _BarraSemSelecao extends StatelessWidget {
  const _BarraSemSelecao({
    required this.apagar,
    required this.corDoFundo,
    required this.child,
  });

  final bool apagar;

  /// A tinta do fundo da barra.
  final Color corDoFundo;

  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!apagar) return child;

    final tema = Theme.of(context);
    final barra = tema.navigationBarTheme;
    final iconeNaoSelecionado = barra.iconTheme?.resolve(
      const <WidgetState>{},
    );
    final rotuloNaoSelecionado = barra.labelTextStyle?.resolve(
      const <WidgetState>{},
    );

    return NavigationBarTheme(
      data: barra.copyWith(
        indicatorColor: corDoFundo,
        iconTheme: iconeNaoSelecionado == null
            ? null
            : WidgetStateProperty.all(iconeNaoSelecionado),
        labelTextStyle: rotuloNaoSelecionado == null
            ? null
            : WidgetStateProperty.all(rotuloNaoSelecionado),
      ),
      child: child,
    );
  }
}

/// Casca visual comum das telas de aba: titulo, linha de reforco, margem
/// lateral de 16 e area segura.
class TelaDeAba extends StatefulWidget {
  const TelaDeAba({
    required this.titulo,
    required this.filhos,
    super.key,
    this.reforco,
    this.tituloEmMarca = false,
    this.raizDeSecao = false,
    this.acaoDeCriar,
    this.cabecalhoFixo,
  });

  /// O **nome curto** da secao, igual ao rotulo da aba (UX 25.7.2 e 27.4.2).
  final String titulo;

  /// A frase que explica a secao.
  final String? reforco;

  final List<Widget> filhos;

  /// Quando a barra de topo carrega o LOGOTIPO em vez do titulo escrito.
  final bool tituloEmMarca;

  /// Se esta tela e uma das CINCO raizes de secao.
  final bool raizDeSecao;

  /// A PORTA DE CRIAR DA SECAO, **flutuante no corpo** da tela.
  final Widget? acaoDeCriar;

  /// O TOPO QUE NAO ROLA: desenhado acima do rolavel, dentro do CORPO.
  final Widget? cabecalhoFixo;

  @override
  State<TelaDeAba> createState() => _EstadoDaTelaDeAba();
}

class _EstadoDaTelaDeAba extends State<TelaDeAba> {
  final ValueNotifier<AcaoDeListagem?> _acaoDaListagem =
      ValueNotifier<AcaoDeListagem?>(null);

  final RecargaDaSecao _recargaDaSecao = RecargaDaSecao();

  final RolagemDaListagem _rolagemDaListagem = RolagemDaListagem();

  static const double _folgaDaAcaoFlutuante = BichuEspaco.e12 + BichuEspaco.e2;

  Widget _comCabecalho(Widget rolavel) {
    final cabecalho = widget.cabecalhoFixo;
    if (cabecalho == null) return rolavel;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[cabecalho, Expanded(child: rolavel)],
    );
  }

  @override
  void dispose() {
    _acaoDaListagem.dispose();
    _recargaDaSecao.dispose();
    _rolagemDaListagem.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final titulo = widget.titulo;
    final reforco = widget.reforco;
    final filhos = widget.filhos;
    final tituloEmMarca = widget.tituloEmMarca;
    final raizDeSecao = widget.raizDeSecao;

    final contadorDeAvisos = Escopo.of(context).contadorDeAvisos;

    final corpo = SafeArea(
      child: _comCabecalho(
        ArrastarParaAtualizar.doSlot(
        recarga: _recargaDaSecao,
        child: PreservaARolagem(
          rolagem: _rolagemDaListagem,
          filho: (context, controlador) => ListView(
        controller: controlador,
        addSemanticIndexes: false,
        padding: EdgeInsets.fromLTRB(
          BichuEspaco.e4,
          BichuEspaco.e4,
          BichuEspaco.e4,
          widget.acaoDeCriar == null
              ? BichuEspaco.e4
              : BichuEspaco.e4 + _folgaDaAcaoFlutuante,
        ),
        children: <Widget>[
          if (reforco != null && reforco.isNotEmpty) ...<Widget>[
            Text(
              reforco,
              style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
            ),
            const SizedBox(height: BichuEspaco.e6),
          ],
          ...filhos,
        ],
        ),
        ),
        ),
      ),
    );

    return SlotDeAtualizacao(
      recarga: _recargaDaSecao,
      child: SlotDaRolagem(
      rolagem: _rolagemDaListagem,
      child: SlotDaBarraDeListagem(
      acao: _acaoDaListagem,
      child: ListenableBuilder(
        listenable: contadorDeAvisos,
        builder: (context, _) => ValueListenableBuilder<AcaoDeListagem?>(
          valueListenable: _acaoDaListagem,
          child: corpo,
          builder: (context, acao, corpo) => Scaffold(
            appBar: AppBar(
              title: tituloEmMarca
                  ? MarcaLockup(
                      largura: MarcaLockup.pisoDeLargura,
                      rotulo: titulo,
                    )
                  : Text(
                      titulo,
                      maxLines: 1,
                      softWrap: false,
                      overflow: TextOverflow.ellipsis,
                      semanticsLabel: titulo,
                    ),
              toolbarHeight: BichuAlvoDeToque.critico,
              titleSpacing: 0,
              leading: raizDeSecao
                  ? AvatarDaConta(
                      inicial: _inicialDaSessao(context),
                      fotoUrl: _fotoDaSessao(context),
                      aoTocar: () => GoRouter.of(context).go(Rotas.perfil),
                    )
                  : null,
              leadingWidth: raizDeSecao ? AvatarDaConta.larguraNoLeading : null,
              actions: <Widget>[
                SinoDeNotificacoes(naoLidas: contadorDeAvisos.naoLidas),
              ],
            ),
            body: corpo,
            floatingActionButton: widget.acaoDeCriar,
          ),
        ),
      ),
      ),
      ),
    );
  }
}

/// O SINO DA BARRA DE TOPO: os avisos de evento, ao lado da foto.
class SinoDeNotificacoes extends StatelessWidget {
  const SinoDeNotificacoes({super.key, this.naoLidas});

  /// Quantas nao lidas, ou nulo enquanto ninguem contou.
  final int? naoLidas;

  static const String rotuloBase = 'Notificações';
  static const double alvo = 48;

  /// O nome acessivel, com a contagem CRUA quando ela existe.
  static String rotuloCom(int? naoLidas) {
    if (naoLidas == null || naoLidas <= 0) return rotuloBase;
    final plural = naoLidas == 1 ? 'nova' : 'novas';
    return '$rotuloBase, $naoLidas $plural';
  }

  /// O que o distintivo PINTA.
  static String? distintivoDe(int? naoLidas) {
    if (naoLidas == null || naoLidas <= 0) return null;
    return naoLidas > 9 ? '9+' : '$naoLidas';
  }

  @override
  Widget build(BuildContext context) {
    final sessao = Escopo.of(context).sessao;
    if (sessao.estado != EstadoDaSessao.logado) {
      return const SizedBox.shrink();
    }

    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final distintivo = distintivoDe(naoLidas);

    return IconButton(
      tooltip: rotuloCom(naoLidas),
      constraints: const BoxConstraints(minWidth: alvo, minHeight: alvo),
      onPressed: () => GoRouter.of(context).push(Rotas.notificacoes),
      icon: Stack(
        clipBehavior: Clip.none,
        children: <Widget>[
          Icon(Icons.notifications_outlined, color: cores.textPrimary),
          if (distintivo != null)
            Positioned(
              right: -BichuEspaco.e1,
              top: -BichuEspaco.e1,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: BichuEspaco.e1,
                ),
                constraints: const BoxConstraints(minWidth: BichuEspaco.e4),
                decoration: BoxDecoration(
                  color: cores.primary,
                  borderRadius: BorderRadius.circular(BichuRaio.full),
                ),
                child: Text(
                  distintivo,
                  textAlign: TextAlign.center,
                  semanticsLabel: '',
                  style: textos.labelSmall?.copyWith(
                    color: cores.onActionFill,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

String? _inicialDaSessao(BuildContext context) {
  final sessao = Escopo.of(context).sessao;
  if (sessao.estado != EstadoDaSessao.logado) return null;
  final nome = sessao.usuario?.nome?.trim();
  if (nome == null || nome.isEmpty) return null;
  return nome.characters.first.toUpperCase();
}

String? _fotoDaSessao(BuildContext context) {
  final sessao = Escopo.of(context).sessao;
  if (sessao.estado != EstadoDaSessao.logado) return null;
  return sessao.usuario?.fotoUrl;
}

/// A FOTO DA PESSOA NA BARRA DE TOPO, e a porta da tela da conta.
class AvatarDaConta extends StatelessWidget {
  const AvatarDaConta({
    required this.aoTocar,
    super.key,
    this.inicial,
    this.fotoUrl,
  });

  /// O que o toque faz. Quem decide e a casca; este widget so desenha.
  final VoidCallback aoTocar;

  /// A primeira letra do nome de exibicao, quando ha nome.
  final String? inicial;

  /// A URL da foto da propria pessoa (`Me.photo.url`), ou nulo.
  final String? fotoUrl;

  /// O LADO DO CIRCULO DESENHADO, em dp.
  static const double ladoDoCirculo = 32;

  /// O nome acessivel.
  static const String rotuloAcessivel = 'Sua conta';

  /// O alvo de toque, em dp.
  static const double alvo = 48;

  /// O RESPIRO ENTRE O CIRCULO E O TITULO.
  static const double respiroDoTitulo = BichuEspaco.e2;

  /// A LARGURA QUE A FOTO OCUPA NO `leading` da barra de topo: o alvo mais o
  /// respiro.
  static const double larguraNoLeading = alvo + respiroDoTitulo;

  /// A chave do CIRCULO desenhado, dentro do alvo.
  static const Key chaveDoCirculo = ValueKey<String>('conta/avatar/circulo');

  /// A chave do ALVO DE TOQUE, dentro do slot.
  static const Key chaveDoAlvo = ValueKey<String>('conta/avatar/alvo');

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: IconButton(
      key: chaveDoAlvo,
      tooltip: rotuloAcessivel,
      constraints: const BoxConstraints(minWidth: alvo, minHeight: alvo),
      padding: const EdgeInsets.only(
        left: BichuLayout.margemCelular,
        top: BichuEspaco.e2,
        bottom: BichuEspaco.e2,
      ),
      onPressed: aoTocar,
      icon: _MarcaNeutra(inicial: inicial, fotoUrl: fotoUrl),
      ),
    );
  }
}

/// O desenho do avatar: a FOTO, a inicial, ou o glifo de pessoa.
class _MarcaNeutra extends StatelessWidget {
  const _MarcaNeutra({this.inicial, this.fotoUrl});

  final String? inicial;

  /// A URL da foto da propria pessoa, ou nulo.
  final String? fotoUrl;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final letra = inicial;
    const lado = AvatarDaConta.ladoDoCirculo;

    final Widget marca = letra == null
        ? Icon(Icons.person_outline, size: 20, color: cores.textSecondary)
        : Text(
            letra,
            style: textos.labelLarge?.copyWith(color: cores.textSecondary),
          );

    final foto = fotoUrl;

    return ExcludeSemantics(
      child: Container(
        key: AvatarDaConta.chaveDoCirculo,
        width: lado,
        height: lado,
        decoration: BoxDecoration(
          color: cores.surfaceSunken,
          shape: BoxShape.circle,
          border: Border.all(color: cores.outline, width: BichuBorda.hairline),
        ),
        alignment: Alignment.center,
        clipBehavior: foto == null ? Clip.none : Clip.antiAlias,
        child: foto == null
            ? marca
            : ImagemDaRede(
                url: foto,
                descricao: null,
                largura: lado,
                proporcao: 1,
                raio: lado / 2,
                reservaDeFalha: Center(child: marca),
              ),
      ),
    );
  }
}

/// O TITULO DA TELA DA CONTA, num ponto so.
String tituloDaTelaDaConta(String? nomeDeExibicao) {
  final nome = nomeDeExibicao?.trim();
  if (nome == null || nome.isEmpty) {
    return 'Minha conta';
  }
  return nome;
}

/// O estado vazio do sistema: o M3 nao define um, e este e composicao.
class EstadoVazio extends StatelessWidget {
  const EstadoVazio({
    required this.titulo,
    required this.explicacao,
    super.key,
    this.acao,
  });

  final String titulo;
  final String explicacao;
  final Widget? acao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e6),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(titulo, style: textos.titleLarge),
          const SizedBox(height: BichuEspaco.e2),
          Text(
            explicacao,
            style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
          ),
          if (acao != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e6),
            acao!,
          ],
        ],
      ),
    );
  }
}
