/// O "quando" de uma linha de listagem, curto.
library;

/// As quatro formas, da mais recente para a mais antiga.
abstract final class QuandoNaLista {
  /// O "quando" de [instante], visto de [agora].
  static String de(DateTime instante, {required DateTime agora}) {
    final local = instante.toLocal();
    final hoje = DateTime(agora.year, agora.month, agora.day);
    final dia = DateTime(local.year, local.month, local.day);
    final diferenca = hoje.difference(dia).inDays;

    if (diferenca <= 0) return _hora(local);
    if (diferenca == 1) return 'ontem';
    if (diferenca < 7) return _diaDaSemana(local);
    return '${local.day} ${_mes(local)}';
  }

  /// `12 out`: dia e mes, sem hora e sem ano.
  static String diaEMes(DateTime instante) {
    final local = instante.toLocal();
    return '${local.day} ${_mes(local)}';
  }

  static String _hora(DateTime d) =>
      '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

  /// `DateTime.weekday` e 1 para segunda e 7 para domingo.
  static String _diaDaSemana(DateTime d) => switch (d.weekday) {
    DateTime.monday => 'seg',
    DateTime.tuesday => 'ter',
    DateTime.wednesday => 'qua',
    DateTime.thursday => 'qui',
    DateTime.friday => 'sex',
    DateTime.saturday => 'sáb',
    _ => 'dom',
  };

  static String _mes(DateTime d) => switch (d.month) {
    1 => 'jan',
    2 => 'fev',
    3 => 'mar',
    4 => 'abr',
    5 => 'mai',
    6 => 'jun',
    7 => 'jul',
    8 => 'ago',
    9 => 'set',
    10 => 'out',
    11 => 'nov',
    _ => 'dez',
  };
}
