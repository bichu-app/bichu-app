/// O "quando" de uma linha de listagem, curto.
///
/// Mora em `formato/` como `dinheiro.dart` e `cep.dart`: e formatacao, nao
/// regra de produto, e a lista de conversas nao e a ultima tela que vai pedir
/// isto.
///
/// ## Por que nao `intl`
///
/// Porque o app nao depende de `intl` e esta linha nao justifica a dependencia:
/// sao quatro formas, todas em portugues do Brasil, sem plural irregular e sem
/// genero variavel. `DateFormat` traria o pacote inteiro e a inicializacao de
/// locale para produzir `14:02`.
///
/// ## O RELOGIO ENTRA POR ARGUMENTO
///
/// [agora] e parametro e nao `DateTime.now()` lido dentro: sem isso, "hoje" e
/// "ontem" so seriam observaveis deixando a suite rodando ate a meia-noite, e o
/// caso de virada de dia -- o unico que erra na pratica -- nao teria como ser
/// escrito. E a mesma decisao de `perdido/quando_foi_visto.dart`.
///
/// ## O fuso e o DO APARELHO, de proposito
///
/// `last_message_at` chega em UTC do servidor, e a conversao para a hora local
/// acontece aqui. "Hoje" e o hoje de quem segura o telefone, e nao o do
/// servidor: uma mensagem das 22h de Sao Paulo nao pode aparecer como "amanha"
/// porque em UTC ja virou o dia.
library;

/// As quatro formas, da mais recente para a mais antiga.
abstract final class QuandoNaLista {
  /// O "quando" de [instante], visto de [agora].
  ///
  /// - hoje: `14:02`
  /// - ontem: `ontem`
  /// - nos ultimos 7 dias: `seg`, `ter`, ...
  /// - antes disso: `12 out`
  ///
  /// **Instante no futuro cai em "hoje"** e sai como hora. Nao e caso teorico:
  /// o relogio do aparelho pode estar atrasado em relacao ao servidor, e a
  /// alternativa -- uma frase sobre o futuro numa lista de mensagens que ja
  /// chegaram -- seria o app chamando de errado um dado que esta certo.
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
  ///
  /// **Para PRAZO, e nao para linha de listagem.** [de] trata instante no
  /// futuro como "hoje" e devolve a hora, o que esta certo para uma mensagem
  /// que ja chegou e errado para uma data-limite: o prazo de reabertura de um
  /// caso encerrado hoje cai daqui a sete dias, e "14:02" nao e um prazo.
  ///
  /// Reusa `_mes` em vez de repetir os doze nomes: duas tabelas de meses
  /// divergem na primeira manutencao. **Converte para a hora local** pelo mesmo
  /// motivo de [de] -- o prazo que o servidor manda em UTC vira o dia de quem
  /// segura o telefone.
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
