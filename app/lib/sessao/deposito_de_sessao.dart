import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/modelos.dart';

/// Onde a sessao e guardada entre aberturas do app.
abstract interface class DepositoDeSessao {
  Future<Sessao?> ler();
  Future<void> gravar(Sessao sessao);
  Future<void> apagar();
}

/// Implementacao sobre o chaveiro do sistema.
class DepositoNoChaveiro implements DepositoDeSessao {
  DepositoNoChaveiro({FlutterSecureStorage? chaveiro})
      : _chaveiro = chaveiro ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions: IOSOptions(
                accessibility: KeychainAccessibility.first_unlock,
              ),
            );

  final FlutterSecureStorage _chaveiro;

  static const String _chave = 'bichu.sessao.v1';

  @override
  Future<Sessao?> ler() async {
    final String? bruto;
    try {
      bruto = await _chaveiro.read(key: _chave);
    } on Object catch (erro) {
      debugPrint(
        'Sessao nao lida neste arranque: o chaveiro do sistema recusou '
        '($erro). O app sobe DESLOGADO e a credencial guardada fica onde '
        'esta; nada foi apagado.',
      );
      return null;
    }
    if (bruto == null || bruto.isEmpty) return null;
    try {
      final json = jsonDecode(bruto) as Map<String, dynamic>;
      return Sessao(
        accessToken: json['access_token'] as String,
        refreshToken: json['refresh_token'] as String,
        expiraEm: DateTime.parse(json['expira_em'] as String),
        usuario: Usuario.doJson(json['usuario'] as Map<String, dynamic>),
      );
    } on Object {
      await apagar();
      return null;
    }
  }

  @override
  Future<void> gravar(Sessao sessao) {
    final json = <String, dynamic>{
      'access_token': sessao.accessToken,
      'refresh_token': sessao.refreshToken,
      'expira_em': sessao.expiraEm.toIso8601String(),
      'usuario': <String, dynamic>{
        'id': sessao.usuario.id,
        'email': sessao.usuario.email,
        'email_verified': sessao.usuario.emailVerificado,
        'pending_email': sessao.usuario.emailPendente,
        'email_deliverable': sessao.usuario.emailEntregavel,
        'display_name': sessao.usuario.nome,
        'pending_profile_fields':
            sessao.usuario.pendencias.map((p) => p.valor).toList(),
        'can_open_lost_case': sessao.usuario.podeAbrirCaso,
        'photo': sessao.usuario.fotoUrl == null
            ? null
            : <String, dynamic>{'url': sessao.usuario.fotoUrl},
      },
    };
    return _chaveiro.write(key: _chave, value: jsonEncode(json));
  }

  @override
  Future<void> apagar() => _chaveiro.delete(key: _chave);
}

/// Deposito em memoria, para teste de widget.
class DepositoEmMemoria implements DepositoDeSessao {
  Sessao? _sessao;

  @override
  Future<Sessao?> ler() async => _sessao;

  @override
  Future<void> gravar(Sessao sessao) async => _sessao = sessao;

  @override
  Future<void> apagar() async => _sessao = null;
}
