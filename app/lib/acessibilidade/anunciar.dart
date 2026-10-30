import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';

/// Anuncia uma mudanca de estado para o leitor de tela.
void anunciar(BuildContext context, String mensagem, {bool urgente = false}) {
  if (!MediaQuery.supportsAnnounceOf(context)) return;
  SemanticsService.sendAnnouncement(
    View.of(context),
    mensagem,
    Directionality.of(context),
    assertiveness: urgente ? Assertiveness.assertive : Assertiveness.polite,
  );
}
