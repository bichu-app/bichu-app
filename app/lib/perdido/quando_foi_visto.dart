/// O `Quando?` de F3.1, e a regra que recusa data no futuro.
library;

/// As quatro opcoes do criterio 3, na ordem em que a tela as mostra.
enum QuandoFoiVisto {
  agora('Agora'),
  hojeMaisCedo('Hoje mais cedo'),
  ontem('Ontem'),
  outraData('Outra data');

  const QuandoFoiVisto(this.rotulo);

  /// O rotulo do botao, palavra por palavra como F3.1 o escreve.
  final String rotulo;

  /// **So esta opcao abre o seletor de calendario** (criterio 3).
  bool get pedeCalendario => this == QuandoFoiVisto.outraData;
}

/// Meia-noite do dia de [momento], no fuso do aparelho.
DateTime inicioDoDiaDe(DateTime momento) =>
    DateTime(momento.year, momento.month, momento.day);

/// O instante que vai em `last_seen_at`, ou nulo quando ainda falta escolher.
DateTime? instanteDoAvistamento(
  QuandoFoiVisto? quando, {
  required DateTime agora,
  DateTime? dataEscolhida,
}) {
  return switch (quando) {
    null => null,
    QuandoFoiVisto.agora => agora,
    QuandoFoiVisto.hojeMaisCedo => inicioDoDiaDe(agora),
    QuandoFoiVisto.ontem =>
      inicioDoDiaDe(agora).subtract(const Duration(days: 1)),
    QuandoFoiVisto.outraData =>
      dataEscolhida == null ? null : inicioDoDiaDe(dataEscolhida),
  };
}

/// A folga para relogio de aparelho adiantado.
const Duration folgaDeRelogio = Duration(minutes: 1);

/// O texto que a tela mostra quando a data escolhida ainda nao chegou.
const String dataNoFuturo = 'Essa data ainda não chegou.';

/// "Visto pela ultima vez amanha" e erro de digitacao ou de fuso.
bool estaNoFuturo(DateTime instante, {required DateTime agora}) {
  return instante.isAfter(agora.add(folgaDeRelogio));
}
