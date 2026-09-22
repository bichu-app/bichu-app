import 'package:flutter/widgets.dart';

import 'api/api_client.dart';
import 'api/auth_api.dart';
import 'api/devices_api.dart';
import 'api/pets_api.dart';
import 'dispositivo/avisos.dart';
import 'dispositivo/camera_e_galeria.dart';
import 'intencao/guarda_de_acao.dart';
import 'telas/perfil/meus_pets.dart';
import 'sessao/controlador_de_sessao.dart';

/// As dependencias do app, entregues pela arvore de widgets.
///
/// Sem pacote de injecao: o esqueleto tem tres dependencias, e um
/// `InheritedWidget` resolve isso sem trazer um framework de estado que
/// ninguem precisou escolher ainda. Quando o app crescer, isto e um ponto de
/// troca e nao uma reescrita.
class Escopo extends InheritedWidget {
  const Escopo({
    required this.api,
    required this.auth,
    required this.pets,
    required this.tags,
    required this.devices,
    required this.camera,
    required this.avisos,
    required this.sessao,
    required this.guarda,
    required this.cacheDeMeusPets,
    required super.child,
    super.key,
  });

  final ApiClient api;
  final AuthApi auth;
  final PetsApi pets;
  final TagsApi tags;
  final DevicesApi devices;

  /// A fronteira com o aparelho. Injetavel para que o teste de widget
  /// exercite os tres estados de permissao sem aparelho.
  final CameraEGaleria camera;

  /// A fronteira com o servico de notificacao. Injetavel pelo mesmo motivo da
  /// camera: notificacao nao se verifica em simulador, e o que o teste precisa
  /// exercitar e a reacao da tela aos quatro estados.
  final Avisos avisos;

  final ControladorDeSessao sessao;

  /// A guarda de acao (UX 8.3): o envelope de intencao pendente e a execucao
  /// dele depois do login. Fica no escopo porque quem precisa dela e a tela de
  /// entrar, que nao pode monta-la: o envelope e um so no app inteiro, e duas
  /// instancias sobre o mesmo arquivo perderiam uma da outra.
  final GuardaDeAcao guarda;

  /// O cache de leitura de `Perfil` › `Meus pets` (criterio 7 da BICHUS-62).
  ///
  /// Fica no escopo, e nao dentro da tela, porque ele precisa sobreviver a
  /// tela ser descartada -- que e o caso comum: trocar de aba e voltar. Em
  /// memoria e por dono; ver [CacheDeMeusPets].
  final CacheDeMeusPets cacheDeMeusPets;

  static Escopo of(BuildContext context) {
    final escopo = context.dependOnInheritedWidgetOfExactType<Escopo>();
    if (escopo == null) {
      throw FlutterError(
        'Escopo nao encontrado. Toda tela do Bichu precisa estar sob o '
        'Escopo montado em main().',
      );
    }
    return escopo;
  }

  @override
  bool updateShouldNotify(Escopo anterior) =>
      api != anterior.api ||
      auth != anterior.auth ||
      pets != anterior.pets ||
      tags != anterior.tags ||
      devices != anterior.devices ||
      camera != anterior.camera ||
      avisos != anterior.avisos ||
      sessao != anterior.sessao ||
      guarda != anterior.guarda ||
      cacheDeMeusPets != anterior.cacheDeMeusPets;
}
