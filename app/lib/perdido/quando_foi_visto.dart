/// O `Quando?` de F3.1, e a regra que recusa data no futuro.
///
/// Vive **fora de `telas/`** de proposito: e regra, e nao desenho. Um teste de
/// "amanha nao e aceito" que precisasse montar widget so rodaria com o tema, o
/// roteador e o escopo em pe, e o caso mais importante desta historia ficaria
/// caro de exercitar -- que e como uma regra fica sem isca.
///
/// ## Por que botoes de opcao, e nao um seletor de calendario
///
/// A pesquisa de UX e explicita em F3.1: *"Um seletor de data para 96% dos
/// casos ser 'agora' e atrito puro."* O calendario existe, e so aparece em
/// `Outra data`.
///
/// ## Por que cada opcao vira o INICIO da janela que ela nomeia
///
/// `Hoje mais cedo` e `Ontem` nomeiam um intervalo, e o contrato pede um
/// instante (`last_seen_at`, `date-time`). Qualquer instante escolhido e uma
/// afirmacao que a pessoa nao fez, entao a escolha e por qual erro e o menos
/// perigoso:
///
/// - escolher o **fim** da janela (ou "agora menos tres horas") faz o caso
///   parecer **mais fresco** do que e, e quem sai procurar acredita que o
///   rastro e mais quente do que e de fato;
/// - escolher o **inicio** faz o caso parecer mais antigo, o que leva a busca
///   a abrir o raio em vez de fecha-lo.
///
/// Exagerar o frescor e o erro caro numa busca. Fica o inicio da janela, e
/// nenhum numero inventado entra na conta.
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
///
/// `DateTime(ano, mes, dia)` e local por construcao, e e o que a pessoa quer
/// dizer: "hoje" e o hoje dela, e nao o do servidor.
DateTime inicioDoDiaDe(DateTime momento) =>
    DateTime(momento.year, momento.month, momento.day);

/// O instante que vai em `last_seen_at`, ou nulo quando ainda falta escolher.
///
/// Devolve nulo para [QuandoFoiVisto.outraData] sem data escolhida: e o estado
/// legitimo entre tocar no botao e fechar o calendario, e inventar `agora` ali
/// gravaria o caso com uma data que ninguem escolheu.
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
///
/// **O mesmo minuto que a borda do servidor usa** (`lost-case-routes.ts`,
/// `instanteDeVistoPorUltimo`). Numeros diferentes nos dois lados produziriam
/// a pior variante deste defeito: a tela aceita, a pessoa toca em `Avisar
/// agora`, e o servidor recusa com uma mensagem sobre um campo que ela ja
/// tinha preenchido -- depois de ela acreditar que o alerta saiu.
const Duration folgaDeRelogio = Duration(minutes: 1);

/// O texto que a tela mostra quando a data escolhida ainda nao chegou.
///
/// Copiado da borda do servidor, e nao reescrito: se os dois textos divergirem,
/// a mesma recusa passa a ter duas redacoes e quem le a tela nao sabe se foram
/// duas coisas diferentes.
const String dataNoFuturo = 'Essa data ainda não chegou.';

/// "Visto pela ultima vez amanha" e erro de digitacao ou de fuso.
///
/// Gravado assim, ele ordena a lista publica errado e o cartaz sai com uma data
/// que nao aconteceu. A recusa existe **nos dois lados**: aqui, para a pessoa
/// descobrir antes de gastar a viagem de rede e a bateria; e na borda do
/// servidor, que e a autoridade -- um cliente que "arruma" a data antes de
/// enviar esconderia o defeito da tela que o produziu.
bool estaNoFuturo(DateTime instante, {required DateTime agora}) {
  return instante.isAfter(agora.add(folgaDeRelogio));
}
