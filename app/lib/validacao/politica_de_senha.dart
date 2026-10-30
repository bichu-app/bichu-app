/// A politica de senha do servidor, espelhada no aparelho **para mostrar**, e
/// nunca para decidir.
library;

/// Minimo de caracteres. Espelha `TAMANHO_MINIMO` do servidor.
const int tamanhoMinimoDaSenha = 10;

/// Teto de caracteres. Espelha `TAMANHO_MAXIMO` do servidor.
const int tamanhoMaximoDaSenha = 256;

/// O que a politica do servidor recusa, uma entrada por `code` que ela emite.
enum RegraDeSenha {
  /// `too_short`.
  tamanhoMinimo(
    codigoDoServidor: 'too_short',
    texto: 'Pelo menos $tamanhoMinimoDaSenha caracteres',
    mensagemDeErro: 'A senha precisa de pelo menos $tamanhoMinimoDaSenha '
        'caracteres.',
  ),

  /// `too_long`.
  tamanhoMaximo(
    codigoDoServidor: 'too_long',
    texto: 'No máximo $tamanhoMaximoDaSenha caracteres',
    mensagemDeErro: 'A senha passa de $tamanhoMaximoDaSenha caracteres. '
        'Encurte um pouco.',
  ),

  /// `blank`. Dez espacos tem dez caracteres e nao e senha nenhuma, entao esta
  /// regra **nao** e consequencia da de tamanho: as duas se aplicam sozinhas.
  soEspacos(
    codigoDoServidor: 'blank',
    texto: 'Não pode ser só espaços',
    mensagemDeErro: 'A senha não pode ser só espaços.',
  ),

  /// `similar_to_identity`.
  diferenteDaIdentidade(
    codigoDoServidor: 'similar_to_identity',
    texto: 'Diferente do seu e-mail e do seu nome',
    mensagemDeErro:
        'Esta senha se parece com o seu e-mail ou o seu nome. Escolha outra.',
  );

  const RegraDeSenha({
    required this.codigoDoServidor,
    required this.texto,
    required this.mensagemDeErro,
  });

  /// O `code` do `ProblemFieldError` que o servidor emite quando esta regra
  /// reprova.
  final String codigoDoServidor;

  /// A frase mostrada na lista, escrita como requisito e nunca como erro.
  final String texto;

  /// A frase mostrada **no campo**, quando esta regra reprovou de fato.
  final String mensagemDeErro;
}

/// Como uma regra esta **agora**, com o que a pessoa ja digitou.
enum EstadoDaRegra {
  /// Campo de senha vazio. Nada foi exigido ainda.
  aguardando,

  /// A regra esta satisfeita pelo que foi digitado.
  atendida,

  /// A regra reprovaria agora, se o formulario fosse enviado.
  naoAtendida,
}

/// O que dizer quando o servidor recusou a senha por um `code` que este build
/// nao conhece.
const String senhaRecusadaPeloServidor =
    'Não conseguimos aceitar esta senha. Escolha outra, de preferência uma '
    'frase que só você lembra.';

/// A politica, como o aparelho consegue medi-la.
abstract final class PoliticaDeSenha {
  /// O estado de **todas** as regras, na ordem de [RegraDeSenha.values].
  static Map<RegraDeSenha, EstadoDaRegra> avaliar({
    required String senha,
    required String email,
    required String nome,
  }) {
    if (senha.isEmpty) {
      return <RegraDeSenha, EstadoDaRegra>{
        for (final regra in RegraDeSenha.values) regra: EstadoDaRegra.aguardando,
      };
    }

    final reprovadas = <RegraDeSenha>{
      if (senha.length < tamanhoMinimoDaSenha) RegraDeSenha.tamanhoMinimo,
      if (senha.length > tamanhoMaximoDaSenha) RegraDeSenha.tamanhoMaximo,
      if (senha.trim().isEmpty) RegraDeSenha.soEspacos,
      if (_pareceComIdentidade(senha, email: email, nome: nome))
        RegraDeSenha.diferenteDaIdentidade,
    };

    return <RegraDeSenha, EstadoDaRegra>{
      for (final regra in RegraDeSenha.values)
        regra: reprovadas.contains(regra)
            ? EstadoDaRegra.naoAtendida
            : EstadoDaRegra.atendida,
    };
  }

  /// O que reprovaria agora, na ordem da lista.
  static List<RegraDeSenha> violacoes({
    required String senha,
    required String email,
    required String nome,
  }) {
    if (senha.isEmpty) return const <RegraDeSenha>[RegraDeSenha.tamanhoMinimo];
    final estados = avaliar(senha: senha, email: email, nome: nome);
    return <RegraDeSenha>[
      for (final entrada in estados.entries)
        if (entrada.value == EstadoDaRegra.naoAtendida) entrada.key,
    ];
  }

  /// A regra que o servidor nomeou pelo `code`, ou nulo quando este build nao
  /// conhece o codigo.
  static RegraDeSenha? porCodigoDoServidor(String codigo) {
    for (final regra in RegraDeSenha.values) {
      if (regra.codigoDoServidor == codigo) return regra;
    }
    return null;
  }
}

/// Semelhanca com e-mail e nome, na forma normalizada.
bool _pareceComIdentidade(
  String senha, {
  required String email,
  required String nome,
}) {
  final alvo = _normalizarParaComparacao(senha);
  if (alvo.isEmpty) return false;

  final candidatos = <String>[email.split('@').first, email, nome]
      .map(_normalizarParaComparacao)
      .where((item) => item.length >= 4);

  return candidatos.any((item) => alvo.contains(item) || item.contains(alvo));
}

/// A forma sobre a qual a comparacao acontece.
String _normalizarParaComparacao(String valor) {
  final minusculo = valor.toLowerCase();
  final buffer = StringBuffer();
  for (final unidade in minusculo.split('')) {
    buffer.write(_semDiacritico[unidade] ?? unidade);
  }
  return buffer.toString().replaceAll(RegExp('[^a-z0-9]'), '');
}

/// Letra base para cada forma acentuada que o `NFKD` decompoe.
const Map<String, String> _dobras = <String, String>{
  'a': 'àáâãäåāăą',
  'c': 'çćĉċč',
  'd': 'ď',
  'e': 'èéêëēĕėęě',
  'g': 'ĝğġģ',
  'h': 'ĥ',
  'i': 'ìíîïĩīĭį',
  'j': 'ĵ',
  'k': 'ķ',
  'l': 'ĺļľŀ',
  'n': 'ñńņňŉ',
  'o': 'òóôõöōŏő',
  'r': 'ŕŗř',
  's': 'śŝşš',
  't': 'ţť',
  'u': 'ùúûüũūŭůűų',
  'w': 'ŵ',
  'y': 'ýÿŷ',
  'z': 'źżž',
};

/// [_dobras] invertido, montado uma vez.
final Map<String, String> _semDiacritico = <String, String>{
  for (final entrada in _dobras.entries)
    for (final acentuada in entrada.value.split('')) acentuada: entrada.key,
};
