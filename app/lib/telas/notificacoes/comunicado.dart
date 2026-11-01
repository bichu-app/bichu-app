/// A PAGINA DO COMUNICADO: o unico destino "pagina interna" da caixa.
library;

import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/problem.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_notificacao.dart';
import '../../api/notificacoes_api.dart';
import '../../escopo.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';

/// O endereco da pagina do comunicado, num lugar so.
abstract final class RotasDoComunicado {
  /// O padrao da rota. Widget: [PaginaDoComunicado].
  static const String comunicado = '/avisos/comunicados/:comunicadoRef';

  /// O nome do parametro de caminho, num lugar so.
  static const String parametroDoRef = 'comunicadoRef';

  /// O endereco do comunicado de [ref].
  static String de(String ref) =>
      '/avisos/comunicados/${Uri.encodeComponent(ref)}';
}

/// Os textos da pagina, num lugar so.
abstract final class TextosDoComunicado {
  static const String titulo = 'Recado do Bichu';

  /// O `404`: o comunicado nao chegou a esta conta, ou nao existe.
  static const String naoEncontrado = 'Este recado não está disponível.';
}

/// A pagina de UM comunicado.
class PaginaDoComunicado extends StatefulWidget {
  const PaginaDoComunicado({required this.ref, super.key, this.notificacoes});

  /// O `ref` do COMUNICADO -- o que veio em `AvisoDaCaixa.destinoRef`.
  final String ref;

  /// A camada de API, injetavel.
  final NotificacoesApi? notificacoes;

  @override
  State<PaginaDoComunicado> createState() => _PaginaDoComunicadoState();
}

enum _Fase { carregando, texto, falha }

class _PaginaDoComunicadoState extends State<PaginaDoComunicado> {
  _Fase _fase = _Fase.carregando;
  ComunicadoDoBichu? _comunicado;
  String? _falha;

  bool _iniciou = false;

  NotificacoesApi get _api =>
      widget.notificacoes ?? NotificacoesApi(Escopo.of(context).api);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciou) return;
    _iniciou = true;
    _carregar();
  }

  Future<void> _carregar() async {
    setState(() {
      _fase = _Fase.carregando;
      _falha = null;
    });
    try {
      final comunicado = await _api.buscarComunicado(widget.ref);
      if (!mounted) return;
      setState(() {
        _comunicado = comunicado;
        _fase = _Fase.texto;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _fase = _Fase.falha;
        _falha =
            falha is FalhaDaApi && falha.tipo == ProblemTipo.naoEncontrado
                ? TextosDoComunicado.naoEncontrado
                : MensagensDeErro.de(falha).texto;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _fase = _Fase.falha;
        _falha = MensagensDeErro.servidorFora;
      });
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao ler o comunicado');
      if (!mounted) return;
      setState(() {
        _fase = _Fase.falha;
        _falha = MensagensDeErro.servidorFora;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const BarraDeConta(
        titulo: TextosDoComunicado.titulo,
        saida: TipoDeSaida.voltar,
      ),
      body: SafeArea(
        child: ArrastarParaAtualizar(
          aoAtualizar: _carregar,
          child: _corpo(),
        ),
      ),
    );
  }

  Widget _corpo() {
    switch (_fase) {
      case _Fase.carregando:
        return const Center(child: CircularProgressIndicator());
      case _Fase.falha:
        return Padding(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          child: FaixaDeAviso(
            texto: _falha ?? MensagensDeErro.servidorFora,
            rotuloDaAcao: MensagensDeErro.tentarDeNovo,
            aoTocarNaAcao: _carregar,
          ),
        );
      case _Fase.texto:
        final comunicado = _comunicado;
        if (comunicado == null) {
          return const SizedBox.shrink();
        }
        return _Texto(comunicado: comunicado);
    }
  }
}

/// O recado: titulo, quando foi e o corpo.
class _Texto extends StatelessWidget {
  const _Texto({required this.comunicado});

  final ComunicadoDoBichu comunicado;

  String get _quando {
    final q = comunicado.disparadoEm.toLocal();
    final dia = q.day.toString().padLeft(2, '0');
    final mes = q.month.toString().padLeft(2, '0');
    final minuto = q.minute.toString().padLeft(2, '0');
    return '$dia/$mes/${q.year} às ${q.hour}h$minuto';
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return ListView(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      children: <Widget>[
        Text(comunicado.titulo, style: textos.headlineSmall),
        const SizedBox(height: BichuEspaco.e1),
        Text(
          _quando,
          style: textos.bodySmall?.copyWith(color: cores.textSecondary),
        ),
        const SizedBox(height: BichuEspaco.e4),
        SelectableText(comunicado.corpo, style: textos.bodyLarge),
      ],
    );
  }
}
