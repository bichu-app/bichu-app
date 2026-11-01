import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../api/sonda_de_conexao.dart';
import '../../api/versao_api.dart';
import '../abertura/tela_sem_conexao.dart';
import 'aviso_de_versao_nova.dart';
import 'tela_de_bloqueio_por_versao.dart';

/// O PORTAO DE VERSAO: o que decide se o aplicativo abre.
class PortaoDeVersao extends StatefulWidget {
  const PortaoDeVersao({
    required this.versaoApi,
    required this.versaoDoApp,
    required this.child,
    super.key,
    this.sonda,
  });

  final VersaoApi versaoApi;

  /// A SONDA DE CONECTIVIDADE (cliente, 26/10/2026).
  final SondaDeConexao? sonda;

  /// A versao deste binario (`AppConfig.versaoDoApp`).
  final String? versaoDoApp;

  final Widget child;

  /// O nome da plataforma como o contrato o enumera, ou nulo.
  @visibleForTesting
  static String? plataformaDo(TargetPlatform plataforma) => switch (plataforma) {
        TargetPlatform.android => 'android',
        TargetPlatform.iOS => 'ios',
        _ => null,
      };

  @override
  State<PortaoDeVersao> createState() => _PortaoDeVersaoState();
}

class _PortaoDeVersaoState extends State<PortaoDeVersao> {
  RespostaDeVersao _resposta = const RespostaDeVersao.liberado();

  bool _avisoDispensado = false;

  bool _semConexao = false;

  bool _semConexaoDispensado = false;

  @override
  void initState() {
    super.initState();
    _perguntar();
  }

  Future<void> _perguntar() async {
    final versao = widget.versaoDoApp;
    final plataforma = PortaoDeVersao.plataformaDo(defaultTargetPlatform);
    if (versao == null || versao.isEmpty || plataforma == null) {
      await _sondar();
      return;
    }
    final resposta = await widget.versaoApi.consultar(
      plataforma: plataforma,
      versao: versao,
    );
    if (!mounted) return;
    setState(() {
      _resposta = resposta;
      _semConexao = !resposta.servidorRespondeu;
    });
  }

  Future<void> _sondar() async {
    final sonda = widget.sonda;
    if (sonda == null) return;
    final respondeu = await sonda.servidorRespondeu();
    if (!mounted) return;
    setState(() => _semConexao = !respondeu);
  }

  void _tentarDeNovo() {
    setState(() => _semConexao = false);
    unawaited(_perguntar());
  }

  @override
  Widget build(BuildContext context) {
    switch (_resposta.veredito) {
      case VereditoDeVersao.bloqueado:
        return TelaDeBloqueioPorVersao(loja: _resposta.loja);
      case VereditoDeVersao.recomendado:
        if (_semRede()) return _recadoSemConexao();
        if (_avisoDispensado) return widget.child;
        return Column(
          children: <Widget>[
            AvisoDeVersaoNova(
              loja: _resposta.loja,
              aoDispensar: () => setState(() => _avisoDispensado = true),
            ),
            Expanded(child: widget.child),
          ],
        );
      case VereditoDeVersao.liberado:
        if (_semRede()) return _recadoSemConexao();
        return widget.child;
    }
  }

  bool _semRede() => _semConexao && !_semConexaoDispensado;

  Widget _recadoSemConexao() {
    return TelaDeAberturaSemConexao(
      aoTentarDeNovo: _tentarDeNovo,
      aoSeguirSemInternet: () =>
          setState(() => _semConexaoDispensado = true),
    );
  }
}
