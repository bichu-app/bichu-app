import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../dispositivo/camera_e_galeria.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/previa_da_foto.dart';
import '../../widgets/recorte_de_imagem.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';
import 'rascunho_de_pet.dart';
import 'textos_do_cadastro.dart';

/// F1.4 — Cadastrar pet: foto.
class TelaCadastrarFoto extends StatefulWidget {
  const TelaCadastrarFoto({required this.rascunho, super.key});

  final RascunhoDePet rascunho;

  @override
  State<TelaCadastrarFoto> createState() => _TelaCadastrarFotoState();
}

class _TelaCadastrarFotoState extends State<TelaCadastrarFoto> {
  EstadoDaPermissao _permissao = EstadoDaPermissao.negada;
  bool _consultando = true;

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

  bool get _cameraEPrincipal =>
      _permissao == EstadoDaPermissao.concedida ||
      _permissao == EstadoDaPermissao.negada;

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
      return;
    }

    final foto = await camera.tirarFoto();
    if (!mounted || foto == null) return;
    final ajustada = await _ajustar(foto);
    if (!mounted || ajustada == null) return;
    widget.rascunho.atualizar(() => widget.rascunho.foto = ajustada);
    setState(() {});
  }

  Future<void> _escolherDaGaleria() async {
    final foto = await Escopo.of(context).camera.escolherDaGaleria();
    if (!mounted || foto == null) return;
    final ajustada = await _ajustar(foto);
    if (!mounted || ajustada == null) return;
    widget.rascunho.atualizar(() => widget.rascunho.foto = ajustada);
    setState(() {});
  }

  Future<FotoLocal?> _ajustar(FotoLocal foto) => ajustarAFoto(
        context,
        camera: Escopo.of(context).camera,
        foto: foto,
        formato: FormatoDoRecorte.fotoDePet,
        titulo: 'Ajuste a foto do pet',
      );

  void _trocar() {
    widget.rascunho.atualizar(() => widget.rascunho.foto = null);
    setState(() {});
  }

  void _usarEstaFoto() {
    context.push(Rotas.cadastrarPetSinais, extra: widget.rascunho);
  }

  void _seguirSemFoto() {
    if (widget.rascunho.foto != null) {
      widget.rascunho.atualizar(() => widget.rascunho.foto = null);
    }
    context.push(Rotas.cadastrarPetSinais, extra: widget.rascunho);
  }

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

  Widget? _faixaDoEstado() {
    if (_permissao == EstadoDaPermissao.negadaPermanentemente) {
      return FaixaDeAviso(
        peso: PesoDaFaixa.informativo,
        texto: TextosDoCadastro.cameraNegada,
        rotuloDaAcao: TextosDoCadastro.abrirOsAjustes,
        aoTocarNaAcao: () => Escopo.of(context).camera.abrirAjustesDoSistema(),
      );
    }

    if (_semCameraNoBuild) {
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
              TextosDoCadastro.orientacaoDaFoto,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: BichuColors.of(context).cores.textSecondary,
                  ),
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
    final escolhida = foto;

    return PreviaDaFoto(
      foto: escolhida,
      descricao: TextosDoCadastro.fotoEscolhidaDoPet,
      vazio: TextosDoCadastro.nenhumaFotoAinda,
    );
  }
}
