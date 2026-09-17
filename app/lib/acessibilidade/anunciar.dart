import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';

/// Anuncia uma mudanca de estado para o leitor de tela.
///
/// Dois cuidados que o nome do metodo nao entrega:
///
/// - **Nem toda plataforma suporta anuncio.** `MediaQuery.supportsAnnounceOf`
///   diz se suporta, e chamar sem conferir gasta a mensagem no vazio.
/// - **No Android, anuncio e disruptivo**: o TalkBack limpa a fila de fala
///   para dizer o que voce mandou. Por isso o produto usa `Semantics` com
///   regiao viva na maior parte dos casos, e reserva o anuncio explicito para
///   o que nao aparece na arvore, como o fim de uma contagem regressiva.
///
/// [urgente] equivale a `role="alert"`; o padrao equivale a `role="status"`
/// com `aria-live="polite"`.
void anunciar(BuildContext context, String mensagem, {bool urgente = false}) {
  if (!MediaQuery.supportsAnnounceOf(context)) return;
  SemanticsService.sendAnnouncement(
    View.of(context),
    mensagem,
    Directionality.of(context),
    assertiveness: urgente ? Assertiveness.assertive : Assertiveness.polite,
  );
}
