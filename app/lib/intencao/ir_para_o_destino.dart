/// A navegação que fecha o caminho da ação guardada (UX 8.3).
library;

import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../roteamento/rotas.dart';
import 'guarda_de_acao.dart';

/// Leva a pessoa para onde a intenção guardada mandar.
void irParaODestinoDoLogin(BuildContext context, DestinoPosLogin destino) {
  switch (destino) {
    case DestinoDeInicio():
      context.go(Rotas.pets);
    case DestinoDeResultado(:final rota, :final extra):
      context.go(rota, extra: extra);
    case DestinoDeRetorno(:final rota, :final extra):
      context.go(rota, extra: extra);
  }
}
