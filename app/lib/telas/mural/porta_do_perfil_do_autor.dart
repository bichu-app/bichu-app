/// **O TOQUE QUE LEVA AO PERFIL DE QUEM PUBLICOU, no Mural.**
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/mural_api.dart';
import '../../roteamento/rotas.dart';

class PortaDoPerfilDoAutor extends StatelessWidget {
  const PortaDoPerfilDoAutor({
    required this.autor,
    required this.child,
    super.key,
    this.rotulo,
  });

  /// Quem publicou ou comentou.
  final AutorDaPublicacao autor;

  final Widget child;

  /// O nome acessivel da porta, e e ele que escolhe UMA DAS DUAS FORMAS.
  final String? rotulo;

  /// O nome acessivel da porta da FOTO.
  static String rotuloDaPorta(String nome) => 'Abrir o perfil de $nome';

  @override
  Widget build(BuildContext context) {
    final String? apelido = autor.apelido?.trim();

    if (apelido == null || apelido.isEmpty) return child;

    void abrir() => context.push(Rotas.perfilDe(apelido));

    final String? r = rotulo;
    if (r == null) {
      return GestureDetector(
        excludeFromSemantics: true,
        onTap: abrir,
        child: child,
      );
    }
    return Semantics(
      button: true,
      label: r,
      excludeSemantics: true,
      child: InkWell(onTap: abrir, child: child),
    );
  }
}
