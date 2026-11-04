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
    required this.canalConfirmado,
    super.key,
    this.aoDenunciar,
    this.aoApagar,
  });

  /// O CANAL DE CONTATO CONFIRMADO **de quem olha** (`Me.contact_channel_
  /// verified`), e ele serve a UMA coisa: escolher o estado vazio.
  ///
  /// Desde a decisao do cliente de 02/11/2026 o Mural mostra a publicacao de
  /// toda a base, **desde que as duas pontas estejam verificadas**. Quem nao
  /// confirmou canal de contato recebe lista vazia do servidor, e sem este
  /// sinal a tela diria "ninguem publicou" a quem o servidor esta filtrando --
  /// um vazio mudo, que e o problema que a decisao quis resolver.
  ///
  /// **A autorizacao NAO mora aqui.** Ela mora na clausula `WHERE` da consulta
  /// (ADR-0021); isto e so o texto da tela. E e **obrigatorio** de proposito:
  /// um padrao `true` faria todo ponto de montagem novo esquecer o estado vazio
  /// sem reprovar nada.
  final bool canalConfirmado;

  /// A leitura, por interface ESTREITA: esta tela nao alcanca `publicar` nem
  /// `apagar` por aqui.
  final LeituraDoMural leitura;

  /// Curtir, descurtir e comentar.
  final InteracaoDoMural interacao;

  /// Abre a denuncia de uma publicacao de OUTRA pessoa.
  final void Function(PublicacaoDaLinha)? aoDenunciar;

  /// Apaga a PROPRIA publicacao.
  final Future<void> Function(PublicacaoDaLinha)? aoApagar;

  /// O VAZIO DE QUEM NAO CONFIRMOU O CONTATO -- **o unico dos tres que a
  /// pessoa resolve sozinha, e por isso o unico que oferece caminho.**
  ///
  /// Ele existe por causa da decisao do cliente de 02/11/2026: o Mural passou a
  /// mostrar a publicacao de toda a base, e a cobrar canal de contato
  /// confirmado das DUAS pontas. Quem nao confirmou nao ve nada de ninguem, e
  /// dizer "ninguem publicou" a essa pessoa seria mentir sobre a causa.
  static const String tituloSemVerificacao = 'Confirme o seu e-mail para ver o Mural';
  static const String explicacaoSemVerificacao =
      'O Mural mostra o que a comunidade publica, e para entrar nele é '
      'preciso ter o contato confirmado — de quem publica e de quem lê. '
      'Você continua podendo publicar: o que é seu aparece aqui sempre.';

  /// A SAIDA do vazio sem verificacao, e **a unica acao que este estado tem**.
  static const String confirmarEmail = 'Confirmar o meu e-mail';

  static const String tituloSemPublicacao = 'As publicações ficam aqui';
  static const String explicacaoSemPublicacao =
      'Quando a comunidade publicar, as publicações aparecem aqui.';

  /// A SAIDA do vazio sem publicacao.
  ///
  /// Ela ficou, e a razao mudou. Antes de 02/11/2026 este botao era a saida de
  /// "nao tenho conexao", porque conexao era o que trazia publicacao. Hoje
  /// conexao nao decide mais a audiencia -- mas o pedido do cliente e um Mural
  /// *"onde as pessoas possam se conectar"*, e com a lista vazia nao existe
  /// post de onde chegar ao perfil de alguem. Sem este botao, o unico estado em
  /// que descobrir gente e mais necessario seria o unico sem caminho para isso.
  static const String buscarPessoas = 'Buscar usuários';

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

  bool _carregando = true;
  MensagemDeErro? _faixa;

  bool _faltaConta = false;

  static const Duration _intervaloDaReleitura = Duration(seconds: 2);
  static const int _releiturasMaximas = 5;

  Timer? _releitura;
  int _releiturasRestantes = _releiturasMaximas;

  /// --------------------------------------------------------------------- O
  /// TOQUE NO ICONE DA BARRA RECARREGA (cliente, 20/10/2026)
  /// ---------------------------------------------------------------------
  static const Duration intervaloMinimoEntreRecargas =
      CorpoDoMural.intervaloMinimoEntreRecargas;

  Timer? _janelaDeSilencio;

  bool get _emSilencio => _janelaDeSilencio?.isActive ?? false;

  bool _visivel = false;

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

  void _aoNavegar() {
    if (!mounted || !_visivel) return;
    if (_enderecos?.value.uri.path != Rotas.mural) return;
    _recargaPedidaPelaCasca(aoTopo: true);
  }

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
      // DOIS VAZIOS AQUI, e o terceiro ja saiu acima (`_faltaConta`, o convite
      // de quem nao tem conta).
      //
      // A ORDEM E A REGRA: desde 02/11/2026 quem nao confirmou o contato nao ve
      // nada de ninguem, entao a falta de verificacao explica o vazio INTEIRO.
      // Quem publicou e nao verificou nem chega aqui -- a propria publicacao
      // sempre entra na linha pela perna do proprio autor. Perguntar "ja
      // publicou?" antes de "esta verificado?" diria "ninguem publicou" a quem
      // o servidor esta filtrando, que e o vazio mudo que a decisao resolveu.
      if (!widget.canalConfirmado) {
        return EstadoVazio(
          titulo: CorpoDoMural.tituloSemVerificacao,
          explicacao: CorpoDoMural.explicacaoSemVerificacao,
          acao: BotaoPrimario(
            rotulo: CorpoDoMural.confirmarEmail,
            icone: Icons.mark_email_read_outlined,
            aoTocar: () => context.push(Rotas.verifiqueSeuEmail),
          ),
        );
      }
      return EstadoVazio(
        titulo: CorpoDoMural.tituloSemPublicacao,
        explicacao: CorpoDoMural.explicacaoSemPublicacao,
        acao: BotaoPrimario(
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
          // O CORACAO E UM ICONE DE ESTADO SOBRE A SUPERFICIE DO CARTAO, e os
          // dois ramos sao o par que `design/contrast-pairs.json` ja publica
          // para exatamente esse objeto -- `icone-pet-selecionado-sobre-
          // surface` (`primary`, 7.84 claro / 8.59 escuro) e
          // `icone-pet-sobre-surface` (`text-secondary`, 8.60 / 9.31), piso
          // 3.0 do SC 1.4.11 nos dois.
          //
          // O ramo marcado pintava `cores.urgency`, que e tinta de
          // PREENCHIMENTO do banner de pet perdido: no tema escuro `urgency` e
          // `ember.800` (#6B220A) sobre `surface` `bark.900` (#17150F), **1.62:1**
          // -- ilegivel. No claro o mesmo par dava 6.99:1 e passava, e foi o
          // acidente de um tema so que fez o defeito parecer intencional.
          // `urgency` tem a tinta dela (`on-urgency`) e ela vale SOBRE
          // `urgency`, nunca sobre a superficie do cartao.
          //
          // `urgency` tambem e o vocabulario de PET PERDIDO no produto, e o
          // cartao do perdido divide a timeline com a publicacao do Mural: um
          // coracao de curtida vestido daquela cor disputa aquele significado
          // na mesma lista.
          icon: Icon(
            _curti ? Icons.favorite : Icons.favorite_border,
            color: _curti ? cores.primary : cores.textSecondary,
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
