import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../dispositivo/camera_e_galeria.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';
import 'rascunho_de_pet.dart';
import 'textos_do_cadastro.dart';

/// F1.4 — Cadastrar pet: foto. Figma `91:34`.
///
/// **A permissao de camera tem quatro estados, e nao dois.** Concedida,
/// negada, negada permanentemente e indisponivel. No terceiro, pedir de novo
/// **nao abre dialogo nenhum**, e o unico caminho e os ajustes do sistema. No
/// quarto **nao ha permissao a conceder**: a funcao nao existe neste build, e
/// mandar a pessoa aos ajustes a faria procurar o que nao esta la.
///
/// **O botao `Tirar foto` continua visivel com a permissao negada**, e toca-lo
/// abre a explicacao com o caminho para os ajustes; `Escolher da galeria` sobe
/// para acao principal (UX F1.4). Esconder o botao faria a pessoa achar que o
/// app perdeu a funcao, em vez de entender que ela pode liberar.
///
/// **Com `indisponivel` os dois somem, e isso e o oposto do paragrafo acima de
/// proposito** (BICHUS-158). Ali ha o que liberar e o botao ensina isso; aqui
/// nao ha, e um botao que nao leva a nada e pior que a ausencia dele
/// (design system 11.10). O que fica no lugar e a faixa que diz o motivo.
///
/// **Sempre ha caminho para frente, com ou sem foto** (BICHUS-157). A foto e
/// opcional no contrato (`POST /v1/pets` exige `name`, `species` e `size`) e
/// por decisao do cliente de 21/09. Ate esta tela ganhar a acao de pular, o
/// unico avanco era o botao que so existia com a foto escolhida -- um beco sem
/// saida no meio do fluxo principal do produto.
class TelaCadastrarFoto extends StatefulWidget {
  const TelaCadastrarFoto({required this.rascunho, super.key});

  final RascunhoDePet rascunho;

  @override
  State<TelaCadastrarFoto> createState() => _TelaCadastrarFotoState();
}

class _TelaCadastrarFotoState extends State<TelaCadastrarFoto> {
  EstadoDaPermissao _permissao = EstadoDaPermissao.negada;
  bool _consultando = true;

  /// O arranque roda em `didChangeDependencies`, e nao em `initState`.
  ///
  /// `Escopo` e um `InheritedWidget`, e ler um inherited widget dentro de
  /// `initState` e erro de framework: naquele momento a dependencia ainda nao
  /// pode ser registrada, e o widget nao seria reconstruido se ela mudasse. O
  /// sinalizador impede que o arranque rode de novo a cada mudanca de tema, de
  /// tamanho de fonte ou de rotacao, que e o outro lado dessa troca.
  bool _iniciou = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciou) return;
    _iniciou = true;
    _consultarPermissao();
  }

  Future<void> _consultarPermissao() async {
    final estado = await Escopo.of(context).camera.estadoDaCamera();
    if (!mounted) return;
    setState(() {
      _permissao = estado;
      _consultando = false;
    });
  }

  /// A camera so e a acao principal quando ela pode funcionar.
  bool get _cameraEPrincipal =>
      _permissao == EstadoDaPermissao.concedida ||
      _permissao == EstadoDaPermissao.negada;

  /// Nao ha camera nem galeria neste build. Nao e recusa: e ausencia.
  bool get _semCameraNoBuild => _permissao == EstadoDaPermissao.indisponivel;

  Future<void> _tirarFoto() async {
    final camera = Escopo.of(context).camera;

    if (_permissao == EstadoDaPermissao.negada) {
      final novo = await camera.pedirCamera();
      if (!mounted) return;
      setState(() => _permissao = novo);
      if (novo != EstadoDaPermissao.concedida) return;
    }

    if (_permissao != EstadoDaPermissao.concedida) {
      // Negada permanentemente. Pedir de novo nao produz dialogo; a tela ja
      // mostra a faixa com o caminho dos ajustes, e insistir aqui seria um
      // toque que nao faz nada.
      //
      // Esta justificativa **so vale porque a faixa existe naquele estado**.
      // Ela nao valia para `indisponivel`, que nao renderizava faixa nenhuma,
      // e foi assim que os dois botoes ficaram mudos (BICHUS-158). Hoje
      // `indisponivel` nao constroi botao, entao este caminho nao e
      // alcancavel por ele.
      return;
    }

    final foto = await camera.tirarFoto();
    if (!mounted || foto == null) return;
    widget.rascunho.atualizar(() => widget.rascunho.foto = foto);
    setState(() {});
  }

  Future<void> _escolherDaGaleria() async {
    final foto = await Escopo.of(context).camera.escolherDaGaleria();
    if (!mounted || foto == null) return;
    widget.rascunho.atualizar(() => widget.rascunho.foto = foto);
    setState(() {});
  }

  void _trocar() {
    widget.rascunho.atualizar(() => widget.rascunho.foto = null);
    setState(() {});
  }

  void _usarEstaFoto() {
    context.push(Rotas.cadastrarPetSinais, extra: widget.rascunho);
  }

  /// BICHUS-157: o avanco que nao depende da foto.
  ///
  /// Mesmo destino de [_usarEstaFoto], com o rascunho intacto e `foto` nula.
  ///
  /// **Limpa a foto quando ha uma.** A acao se chama *avancar sem foto*, e o
  /// criterio 3 da BICHUS-157 exige que ela continue disponivel com uma foto
  /// escolhida, sem se confundir com `Usar esta foto` -- e o que separa as
  /// duas e justamente esta linha. A issue nao diz o que fazer com a foto ja
  /// escolhida; a divergencia esta registrada nela. Nao ha perda real: a foto
  /// e um caminho local do aparelho, nada foi enviado, e `Trocar` ja zera o
  /// mesmo campo sem cerimonia.
  void _seguirSemFoto() {
    if (widget.rascunho.foto != null) {
      widget.rascunho.atualizar(() => widget.rascunho.foto = null);
    }
    context.push(Rotas.cadastrarPetSinais, extra: widget.rascunho);
  }

  /// As acoes de **obter** a foto, que dependem do estado do aparelho.
  ///
  /// Vazia em `indisponivel`: nao ha o que oferecer, e oferecer assim mesmo e
  /// o defeito da BICHUS-158.
  List<Widget> _acoesDaFoto({required bool temFoto}) {
    if (temFoto) {
      return <Widget>[
        BotaoPrimario(
          rotulo: TextosDoCadastro.usarEstaFoto,
          critico: true,
          aoTocar: _usarEstaFoto,
        ),
        BotaoSecundario(
          rotulo: TextosDoCadastro.trocarAFoto,
          aoTocar: _trocar,
        ),
      ];
    }

    if (_semCameraNoBuild) return const <Widget>[];

    // A ordem inverte quando a camera nao pode funcionar: a acao principal e
    // a que resolve, e nao a que a tela preferia.
    if (_cameraEPrincipal) {
      return <Widget>[
        BotaoPrimario(
          rotulo: TextosDoCadastro.tirarFoto,
          critico: true,
          aoTocar: _consultando ? null : _tirarFoto,
        ),
        BotaoSecundario(
          rotulo: TextosDoCadastro.escolherDaGaleria,
          aoTocar: _escolherDaGaleria,
        ),
      ];
    }

    return <Widget>[
      BotaoPrimario(
        rotulo: TextosDoCadastro.escolherDaGaleria,
        critico: true,
        aoTocar: _escolherDaGaleria,
      ),
      BotaoSecundario(
        rotulo: TextosDoCadastro.tirarFoto,
        aoTocar: _tirarFoto,
      ),
    ];
  }

  /// A acao de avancar sem foto: **botao, e nos quatro estados**.
  ///
  /// Botao e nao link de texto porque o criterio 5 da BICHUS-157 cobra alvo de
  /// toque e anuncio como acao; `BotaoSecundario` traz os 48 dp do tema
  /// (`BichuAlvoDeToque.min`). O `Semantics` por fora da o nome que `Pular`
  /// sozinho nao da, mantendo o rotulo visivel dentro dele (SC 2.5.3).
  ///
  /// Ela e a ultima da barra em todos os casos: com foto, a acao que a pessoa
  /// provavelmente quer e `Usar esta foto`, e promover o pular ali seria
  /// convidar a descartar a foto que ela acabou de escolher.
  Widget _acaoDeSeguirSemFoto() {
    return Semantics(
      button: true,
      label: TextosDoCadastro.seguirSemFotoAnunciado,
      excludeSemantics: true,
      child: BotaoSecundario(
        rotulo: TextosDoCadastro.seguirSemFoto,
        aoTocar: _seguirSemFoto,
      ),
    );
  }

  /// A faixa do estado do aparelho, quando ha uma a mostrar.
  ///
  /// Os dois casos sao diferentes **na saida**, e e por isso que sao dois:
  /// `negadaPermanentemente` tem o que fazer (os ajustes) e leva acao;
  /// `indisponivel` nao tem, e uma acao ali mandaria a pessoa procurar uma
  /// permissao que nao existe.
  Widget? _faixaDoEstado() {
    if (_permissao == EstadoDaPermissao.negadaPermanentemente) {
      return FaixaDeAviso(
        peso: PesoDaFaixa.informativo,
        texto: TextosDoCadastro.cameraNegada,
        rotuloDaAcao: TextosDoCadastro.abrirOsAjustes,
        // O unico caminho que resolve: pedir de novo nao abre dialogo.
        aoTocarNaAcao: () => Escopo.of(context).camera.abrirAjustesDoSistema(),
      );
    }

    if (_semCameraNoBuild) {
      // Informativo, e nao erro: nada deu errado e ninguem errou. O mesmo
      // peso da faixa de cima, pelo mesmo motivo.
      return const FaixaDeAviso(
        peso: PesoDaFaixa.informativo,
        texto: TextosDoCadastro.cameraNaoEmbarcada,
      );
    }

    return null;
  }

  @override
  Widget build(BuildContext context) {
    final temFoto = widget.rascunho.foto != null;
    final faixa = _faixaDoEstado();

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: 'Cadastrar pet',
        saida: TipoDeSaida.voltar,
      ),
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          ..._acoesDaFoto(temFoto: temFoto),
          _acaoDeSeguirSemFoto(),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          children: <Widget>[
            IndicadorDePasso(
              passo: 2,
              total: 3,
              titulo: TextosDoCadastro.tituloDaFoto(widget.rascunho.nome),
            ),
            const SizedBox(height: BichuEspaco.e6),
            Text(
              TextosDoCadastro.corpoDaFoto,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: BichuEspaco.e6),
            _AreaDaFoto(foto: widget.rascunho.foto),
            if (faixa != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              faixa,
            ],
          ],
        ),
      ),
    );
  }
}

/// A area grande da foto: pre-visualizacao quando ha uma, estado vazio quando
/// nao ha.
class _AreaDaFoto extends StatelessWidget {
  const _AreaDaFoto({required this.foto});

  final FotoLocal? foto;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final escolhida = foto;

    return Semantics(
      image: escolhida != null,
      label: escolhida == null
          ? TextosDoCadastro.nenhumaFotoAinda
          : 'Foto escolhida',
      child: Container(
        height: 300,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: cores.surfaceSunken,
          borderRadius: BorderRadius.circular(BichuRaio.lg),
          border: Border.all(color: cores.outline, width: BichuBorda.hairline),
        ),
        child: Text(
          escolhida == null
              ? TextosDoCadastro.nenhumaFotoAinda
              : escolhida.caminho,
          textAlign: TextAlign.center,
          style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
        ),
      ),
    );
  }
}
