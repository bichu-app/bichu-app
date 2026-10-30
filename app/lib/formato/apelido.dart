/// O **apelido (`@`)**: a faixa, a normalizacao e as tres sugestoes.
library;

import 'package:flutter/services.dart';

/// O piso da faixa.
const int minimoDoApelido = 5;

/// O teto da faixa. Do normalizado -- que e identico ao digitado, ver o topo.
const int maximoDoApelido = 20;

/// A forma do apelido, **igual nos quatro lugares**.
class FormaDoApelido {
  const FormaDoApelido._();

  /// O MESMO regex do `CHECK`, do `pattern` do contrato e do TypeScript.
  static final RegExp regex = RegExp(r'^[a-z0-9][a-z0-9-]{3,18}[a-z0-9]$');
}

/// O que o filtro de digitacao deixa passar: minuscula, digito e hifen.
final RegExp _aceitoNoApelido = RegExp(r'[^a-z0-9-]');

/// O apelido normalizado: minusculo e aparado, e nada mais.
String normalizarApelido(String bruto) => bruto.trim().toLowerCase();

/// O valor que vai para a API, ou `null` quando o que foi digitado nao serve.
String? apelidoParaOContrato(String bruto) {
  final normalizado = normalizarApelido(bruto);
  return FormaDoApelido.regex.hasMatch(normalizado) ? normalizado : null;
}

/// O filtro aplicado enquanto se digita.
class FiltroDeApelido extends TextInputFormatter {
  const FiltroDeApelido();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue antes,
    TextEditingValue depois,
  ) {
    final filtrado = depois.text
        .toLowerCase()
        .replaceAll(_aceitoNoApelido, '')
        ;
    final cortado = filtrado.length > maximoDoApelido
        ? filtrado.substring(0, maximoDoApelido)
        : filtrado;
    return TextEditingValue(
      text: cortado,
      selection: TextSelection.collapsed(offset: cortado.length),
    );
  }
}

/// A regra do apelido do lado da tela, num lugar so.
class IdentificadorDoApelido {
  const IdentificadorDoApelido._();

  /// A cobranca da faixa. **Diz so a faixa**, sem paragrafo de apoio: o cliente
  /// mandou remover textos de apoio das telas em 18/10, e a orientacao de
  /// verdade vem das tres [sugestoes].
  static const String foraDaFaixa =
      'De $minimoDoApelido a $maximoDoApelido caracteres: letras minúsculas, números e hífen.';

  /// A cobranca do apelido curto.
  static const String curtoDemais = 'Use no mínimo $minimoDoApelido caracteres.';

  /// A cobranca da palavra reservada e do apelido ja tomado -- **a mesma
  /// frase**, de proposito.
  static const String indisponivel = 'Esse apelido não está disponível.';

  /// O mapa dos parecidos, **por GRUPO**, igual ao `translate` de
  /// `handle_esqueleto` na migracao e ao `PARECIDOS` do TypeScript.
  static const Map<String, String> _parecidos = <String, String>{
    '0': 'o',
    '1': 'l',
    'i': 'l',
    '5': 's',
    '3': 'e',
  };

  /// As palavras reservadas do plano 4-C.6, **lidas do plano e nao
  /// reinventadas**.
  static const List<String> reservadas = <String>[
    'public', 'media', 'static', 'assets', 'health', 'cartaz', 'login',
    'entrar', 'conta', 'perfil', 'perto', 'achado', 'perdido', 'plaquinha',
    'evento', 'eventos', 'diretorio', 'busca', 'termos', 'privacidade',
    'sobre',
    'bichu', 'oficial', 'equipe', 'suporte', 'atendimento', 'ajuda',
    'moderacao', 'moderador', 'seguranca', 'admin', 'administrador',
    'sistema', 'contato', 'noreply', 'no-reply',
    'verificado', 'validado', 'premium', 'premio', 'recompensa', 'sorteio',
    'ganhador', 'pagamento', 'cobranca',
    'false', 'teste', 'usuario', 'anonimo', 'deleted', 'excluido',
    'undefined',
  ];

  /// A palavra cuja regra e **CONTEM**, e nao igualdade.
  static const String _contidaProibida = 'bichu';

  /// O esqueleto de um apelido: sem hifen e com os parecidos colapsados.
  static String esqueleto(String bruto) {
    final semHifen = normalizarApelido(bruto).replaceAll('-', '');
    final saida = StringBuffer();
    for (final caractere in semHifen.split('')) {
      saida.write(_parecidos[caractere] ?? caractere);
    }
    return saida.toString();
  }

  /// `true` quando o apelido cai numa palavra reservada.
  static bool ehReservado(String bruto) {
    final osso = esqueleto(bruto);
    if (osso.contains(esqueleto(_contidaProibida))) return true;
    return reservadas.any((palavra) => esqueleto(palavra) == osso);
  }

  /// Tres sugestoes derivadas do que a pessoa digitou.
  static List<String> sugestoes(String bruto) {
    final base = normalizarApelido(bruto)
        .replaceAll(_aceitoNoApelido, '')
        .replaceAll(RegExp(r'^-+|-+$'), '');
    final semente = base.isEmpty
        ? 'pessoa'
        : base.substring(0, base.length > maximoDoApelido - 3 ? maximoDoApelido - 3 : base.length);

    final encontradas = <String>[];
    for (final sufixo in <String>['-01', '-oi', '-10', '-20', '-30', '-40']) {
      if (encontradas.length >= 3) break;
      var candidata = '$semente$sufixo';
      if (candidata.length > maximoDoApelido) {
        candidata = candidata.substring(0, maximoDoApelido);
      }
      candidata = candidata.replaceAll(RegExp(r'-+$'), '');
      while (candidata.length < minimoDoApelido) {
        candidata = '${candidata}0';
      }
      if (FormaDoApelido.regex.hasMatch(candidata) &&
          !ehReservado(candidata) &&
          !encontradas.contains(candidata)) {
        encontradas.add(candidata);
      }
    }
    return encontradas;
  }

  /// A mensagem de recusa, ou `null` quando o apelido passa.
  static String? recusa(String? bruto) {
    final normalizado = normalizarApelido(bruto ?? '');
    if (normalizado.length < minimoDoApelido) return curtoDemais;
    if (normalizado.length > maximoDoApelido) return foraDaFaixa;
    if (!FormaDoApelido.regex.hasMatch(normalizado)) return foraDaFaixa;
    if (ehReservado(normalizado)) return indisponivel;
    return null;
  }

  /// `true` quando ha apelido suficiente para o campo nao estar pendente.
  static bool completo(String? bruto) => apelidoParaOContrato(bruto ?? '') != null;

  /// `true` quando o campo esta vazio -- um estado **valido** no cadastro.
  static bool vazio(String? bruto) => normalizarApelido(bruto ?? '').isEmpty;
}
