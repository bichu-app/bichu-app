import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_achado.dart';
import '../../api/problem.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/bloco_de_informacao.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';
import '../perfil/meus_achados.dart';
import 'textos_do_achado.dart';

/// O achado, pelo endereco dele: `/achados/:achadoId`.
class TelaDoAchado extends StatefulWidget {
  const TelaDoAchado({required this.achadoId, super.key});

  final String achadoId;

  @override
  State<TelaDoAchado> createState() => _TelaDoAchadoState();
}

class _TelaDoAchadoState extends State<TelaDoAchado> {
  AchadoRegistrado? _achado;
  MensagemDeErro? _erro;
  String? _ausente;

  /// A falha foi **falta de conta**, e nao defeito.
  bool _faltaConta = false;
  bool _carregando = true;
  bool _iniciou = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciou) return;
    _iniciou = true;
    _carregar();
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _erro = null;
      _ausente = null;
      _faltaConta = false;
    });
    try {
      final achado = await Escopo.of(context).achados.buscar(widget.achadoId);
      if (!mounted) return;
      setState(() {
        _achado = achado;
        _carregando = false;
      });
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      setState(() {
        _achado = null;
        _carregando = false;
        if (falha.tipo == ProblemTipo.naoEncontrado) {
          _ausente = TextosDoAchado.naoEncontrado;
        } else if (faltaConta(falha)) {
          _faltaConta = true;
        } else {
          _erro = MensagensDeErro.de(falha);
        }
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _achado = null;
        _carregando = false;
        _faltaConta = faltaConta(falha);
        if (!_faltaConta) _erro = MensagensDeErro.de(falha);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final achado = _achado;

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: TextosDoAchado.tituloDoRegistrado,
        saida: TipoDeSaida.voltar,
      ),
      body: SafeArea(
        top: false,
        child: ArrastarParaAtualizar(
          aoAtualizar: _carregar,
          child: ListView(
            padding: const EdgeInsets.all(BichuEspaco.e4),
            addSemanticIndexes: false,
            children: <Widget>[
              if (_carregando)
                const Center(child: CircularProgressIndicator())
              else if (_ausente != null)
                Semantics(
                  liveRegion: true,
                  child: Text(_ausente!, style: textos.bodyLarge),
                )
              else if (_faltaConta)
                const ConviteParaEntrar(secao: SecaoComConta.paginaDoAchado)
              else if (_erro != null)
                FaixaDeAviso(
                  texto: _erro!.texto,
                  rotuloDaAcao: MensagensDeErro.tentarDeNovo,
                  aoTocarNaAcao: _carregar,
                )
              else if (achado != null) ...<Widget>[
                Text(
                  TextosDoAchado.registradoCorpo,
                  style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
                ),
                const SizedBox(height: BichuEspaco.e4),
                const FaixaDeAviso(
                  peso: PesoDaFaixa.informativo,
                  texto: TextosDoAchado.fotoNaoApareceAqui,
                ),
                const SizedBox(height: BichuEspaco.e6),
                BlocoDeInformacao(
                  titulo: TextosDoAchado.tituloDoQueGuardamos,
                  linhas: <String>[
                    MeusAchados.rotuloDoEstado(achado.status),
                    achado.rotuloDaArea == null
                        ? TextosDoAchado.regiaoNaoInformada
                        : 'Região: ${achado.rotuloDaArea}',
                    if (achado.achadoEm != null)
                      TextosDoAchado.achadoEmTexto(achado.achadoEm!),
                  ],
                ),
                if (achado.observacao != null &&
                    achado.observacao!.isNotEmpty) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e3),
                  Text(
                    TextosDoAchado.rotuloDosSinais,
                    style: textos.labelLarge?.copyWith(
                      color: cores.textSecondary,
                    ),
                  ),
                  const SizedBox(height: BichuEspaco.e1),
                  Text(achado.observacao!, style: textos.bodyLarge),
                ],
                const SizedBox(height: BichuEspaco.e6),
                const BlocoDeInformacao(
                  titulo: TextosDoAchado.tituloDeQuemFoiAvisado,
                  linhas: <String>[
                    TextosDoAchado.ninguemFoiAvisado,
                    TextosDoAchado.oQueOTutorRecebe,
                    TextosDoAchado.avisoNoCelularNaoFunciona,
                  ],
                ),
                const SizedBox(height: BichuEspaco.e6),
                const BlocoDeInformacao(
                  titulo: TextosDoAchado.tituloDoQueFazerAgora,
                  linhas: <String>[
                    TextosDoAchado.passoDaPlaquinha,
                    TextosDoAchado.passoDaListaDePerdidos,
                    TextosDoAchado.passoDeCuidar,
                  ],
                ),
                const SizedBox(height: BichuEspaco.e3),
                BotaoSecundario(
                  rotulo: TextosDoAchado.escanearAPlaquinha,
                  aoTocar: () => context.push(Rotas.escanear),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
