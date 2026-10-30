/// O que o app faz quando a permissao de aviso muda **enquanto ele esta
/// aberto** (BICHUS-24).
library;

import 'dart:async';

import 'package:flutter/widgets.dart';

import '../api/devices_api.dart';
import '../api/falhas.dart';
import 'avisos.dart';

/// Observa o ciclo de vida e reconcilia a permissao de aviso na retomada.
class VigiaDeAviso extends ChangeNotifier with WidgetsBindingObserver {
  VigiaDeAviso({required this.avisos, required this.devices});

  final Avisos avisos;
  final DevicesApi devices;

  PermissaoDeAviso? _ultimoConhecido;

  /// O ultimo estado que o app viu, ou nulo enquanto ele nao viu nenhum.
  PermissaoDeAviso? get ultimoConhecido => _ultimoConhecido;

  /// `true` quando o app sabe que a pessoa recusou no dialogo do sistema.
  bool get negouOAviso => _ultimoConhecido == PermissaoDeAviso.negada;

  /// Registra o que o fluxo da antessala acabou de descobrir.
  void anotar(PermissaoDeAviso permissao) {
    if (_ultimoConhecido == permissao) return;
    _ultimoConhecido = permissao;
    notifyListeners();
  }

  /// Esquece o que o app sabia e registra o aparelho de novo.
  Future<void> esquecerEReconciliar() async {
    _ultimoConhecido = null;
    await reconciliar();
  }

  void ligar() => WidgetsBinding.instance.addObserver(this);

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) return;
    unawaited(reconciliar());
  }

  /// Le o estado agora e, se ele mudou, refaz o registro do aparelho.
  Future<void> reconciliar() async {
    final plataforma = avisos.plataforma;
    if (plataforma == null) return;

    final PermissaoDeAviso agora;
    try {
      agora = await avisos.estado();
    } on Object {
      return;
    }
    if (agora == PermissaoDeAviso.indisponivel) return;

    final antes = _ultimoConhecido;
    if (antes == agora) return;

    final novidadeQueValeRegistro = antes != null ||
        agora == PermissaoDeAviso.concedida ||
        agora == PermissaoDeAviso.negada;

    _ultimoConhecido = agora;
    notifyListeners();
    if (!novidadeQueValeRegistro) return;

    final token =
        agora == PermissaoDeAviso.concedida ? await avisos.token() : null;
    try {
      await devices.registrar(
        plataforma: plataforma,
        permissao: agora,
        pushToken: token,
      );
    } on FalhaDeChamada {
      debugPrint(
        'BICHU avisos: a permissao mudou para $agora e o registro do aparelho '
        'nao saiu. A proxima retomada com estado diferente tenta de novo.',
      );
    }
  }
}
