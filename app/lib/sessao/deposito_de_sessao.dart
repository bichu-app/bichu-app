import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/modelos.dart';

/// Onde a sessao e guardada entre aberturas do app.
///
/// Segredo nao vive em armazenamento comum: token vai para o chaveiro do
/// sistema (Keychain no iOS, Keystore no Android). Qualquer pessoa abre um app
/// publicado e le o que esta dentro dele.
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
    // **A LEITURA ESTAVA FORA DO `try`, e o `try` abaixo so cobria o
    // `jsonDecode`.** Uma `PlatformException` do chaveiro subia inteira por
    // `iniciar()` e caia em `_arrancar()`, que e chamado pelado: virava erro
    // assincrono nao tratado, `_mudar` nunca acontecia, e o estado da sessao
    // ficava `carregando` para sempre -- com a pessoa presa na
    // `TelaDeAbertura` achando que era splash.
    //
    // **E o caso esperado, nao o excentrico**: com provisionamento gratuito e
    // app reassinado pelo Xcode, o direito de acesso ao Keychain vem do perfil
    // e a leitura pode recusar.
    //
    // **Falha aqui NAO apaga nada.** O desfecho e "nao sei se ha sessao", e a
    // resposta honesta para isso e `null` -- a pessoa entra de novo. Chamar
    // `apagar()` seria destruir uma credencial provavelmente intacta porque o
    // chaveiro nao respondeu desta vez, e isso nao se desfaz.
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
      // Formato guardado por uma versao anterior do app que este build nao
      // entende. Versao antiga nao desaparece, e a saida certa e pedir login
      // de novo, nao travar o arranque.
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
        // A FOTO, pela MESMA chave do contrato (`Me.photo.url`), para que
        // `Usuario.doJson` a leia na volta sem um segundo formato.
        //
        // **Sem esta linha o avatar da barra voltava para a inicial no arranque
        // seguinte**, mesmo com o servidor mandando a foto: `gravar` guardava
        // oito campos e `photo` nao era um deles, entao `ler` reconstruia um
        // `Usuario` com `fotoUrl` nulo. E o MESMO defeito que o cliente relatou
        // em 20/10/2026, pela segunda porta -- e tao calado quanto a primeira,
        // porque cair na inicial e desfecho legitimo da cadeia
        // foto -> inicial -> glifo.
        //
        // `null` em vez de objeto quando nao ha foto: `Usuario.doJson` recorta
        // `photo` por `is Map`, entao nulo, ausente e tipo errado valem o mesmo
        // -- sem foto. Guardar `{'url': null}` daria o mesmo desfecho e diria
        // menos.
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

/// Deposito em memoria, para teste de widget. Nao usar em producao: o chaveiro
/// do sistema e o unico lugar aceitavel para o token no aparelho.
class DepositoEmMemoria implements DepositoDeSessao {
  Sessao? _sessao;

  @override
  Future<Sessao?> ler() async => _sessao;

  @override
  Future<void> gravar(Sessao sessao) async => _sessao = sessao;

  @override
  Future<void> apagar() async => _sessao = null;
}
