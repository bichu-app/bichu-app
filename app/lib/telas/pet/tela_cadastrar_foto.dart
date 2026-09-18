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
/// **A permissao de camera tem tres estados, e nao dois.** Concedida, negada e
/// negada permanentemente; no terceiro, pedir de novo **nao abre dialogo
/// nenhum**, e o unico caminho e os ajustes do sistema. Uma tela que so trata
/// "deu certo" e "deu errado" deixa a pessoa tocando num botao que nunca mais
/// vai responder.
///
/// **O botao `Tirar foto` continua visivel com a permissao negada**, e toca-lo
/// abre a explicacao com o caminho para os ajustes; `Escolher da galeria` sobe
/// para acao principal (UX F1.4). Esconder o botao faria a pessoa achar que o
/// app perdeu a funcao, em vez de entender que ela pode liberar.
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

  Future<void> _tirarFoto() async {
    final camera = Escopo.of(context).camera;

    if (_permissao == EstadoDaPermissao.negada) {
      final novo = await camera.pedirCamera();
      if (!mounted) return;
      setState(() => _permissao = novo);
      if (novo != EstadoDaPermissao.concedida) return;
    }

    if (_permissao != EstadoDaPermissao.concedida) {
      // Negada permanentemente, ou sem camera no aparelho. Nos dois casos
      // pedir de novo nao produz dialogo; a tela ja mostra a faixa com o
      // caminho, e insistir aqui seria um toque que nao faz nada.
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

  @override
  Widget build(BuildContext context) {
    final temFoto = widget.rascunho.foto != null;

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: 'Cadastrar pet',
        saida: TipoDeSaida.voltar,
      ),
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: temFoto
            ? <Widget>[
                BotaoPrimario(
                  rotulo: TextosDoCadastro.usarEstaFoto,
                  critico: true,
                  aoTocar: _usarEstaFoto,
                ),
                BotaoSecundario(
                  rotulo: TextosDoCadastro.trocarAFoto,
                  aoTocar: _trocar,
                ),
              ]
            // A ordem inverte quando a camera nao pode funcionar: a acao
            // principal e a que resolve, e nao a que a tela preferia.
            : _cameraEPrincipal
                ? <Widget>[
                    BotaoPrimario(
                      rotulo: TextosDoCadastro.tirarFoto,
                      critico: true,
                      aoTocar: _consultando ? null : _tirarFoto,
                    ),
                    BotaoSecundario(
                      rotulo: TextosDoCadastro.escolherDaGaleria,
                      aoTocar: _escolherDaGaleria,
                    ),
                  ]
                : <Widget>[
                    BotaoPrimario(
                      rotulo: TextosDoCadastro.escolherDaGaleria,
                      critico: true,
                      aoTocar: _escolherDaGaleria,
                    ),
                    BotaoSecundario(
                      rotulo: TextosDoCadastro.tirarFoto,
                      aoTocar: _tirarFoto,
                    ),
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
            if (_permissao == EstadoDaPermissao.negadaPermanentemente) ...<
                Widget>[
              const SizedBox(height: BichuEspaco.e6),
              FaixaDeAviso(
                peso: PesoDaFaixa.informativo,
                texto: TextosDoCadastro.cameraNegada,
                rotuloDaAcao: TextosDoCadastro.abrirOsAjustes,
                // O unico caminho que resolve: pedir de novo nao abre dialogo.
                aoTocarNaAcao: () =>
                    Escopo.of(context).camera.abrirAjustesDoSistema(),
              ),
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
