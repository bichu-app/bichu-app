/// A politica de senha do servidor, espelhada no aparelho **para mostrar**, e
/// nunca para decidir.
///
/// A autoridade e o servidor (`src/modules/identity/domain/password-policy.ts`,
/// NIST SP 800-63B / ADR-0003). O que este arquivo faz e deixar a pessoa ver,
/// enquanto digita, o que aquela politica vai cobrar dela. Validacao no
/// aparelho e conveniencia; o binario e inspecionavel e a versao antiga do app
/// nunca some.
///
/// ## A regra que governa este arquivo
///
/// **A tela nao inventa regra que o servidor nao aplica, e nao esconde regra
/// que ele aplica.** As duas direcoes custam:
///
/// - exigir mais que o servidor frustra sem motivo. O cliente pediu
///   "caractere especial"; a politica **nao** exige composicao, de proposito,
///   e o comentario do arquivo do servidor diz por que: regra de composicao
///   empurra para `Senha@123`, que e pior que uma frase longa;
/// - exigir menos deixa a pessoa levar erro depois de enviar.
///
/// Por isso [RegraDeSenha] carrega o `code` do servidor em
/// [RegraDeSenha.codigoDoServidor], e
/// `app/test/validacao/politica_de_senha_test.dart` le o arquivo TypeScript do
/// disco e compara os dois conjuntos. Um `code` novo no servidor reprova a
/// suite ate alguem decidir o que a tela mostra.
///
/// ## O que o aparelho NAO consegue conferir
///
/// A politica declara uma quinta recusa que nao esta aqui: **a lista de
/// vazamento** (`PasswordBreachList`, ainda uma porta sem implementacao no
/// servidor). Ela depende de dado que o aparelho nao tem e nao deve ter.
///
/// A tela nao pode prometer o que nao confere: ela mostra as quatro regras que
/// consegue medir e **diz, em texto**, que o servidor pode recusar por um
/// motivo a mais. Uma lista de "tudo certo" que se transforma em erro depois do
/// envio e pior que nenhuma lista, porque a pessoa acredita ter terminado.
library;

/// Minimo de caracteres. Espelha `TAMANHO_MINIMO` do servidor.
const int tamanhoMinimoDaSenha = 10;

/// Teto de caracteres. Espelha `TAMANHO_MAXIMO` do servidor.
///
/// O teto existe contra derivacao cara com entrada gigante, e nao contra a
/// pessoa. Ele aparece na lista porque o servidor o aplica: regra aplicada e
/// regra mostrada.
const int tamanhoMaximoDaSenha = 256;

/// O que a politica do servidor recusa, uma entrada por `code` que ela emite.
///
/// A ordem e a de leitura na tela, e nao a do arquivo do servidor.
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
  ///
  /// Esta e a unica regra que depende de outro campo da tela, e e por isso que
  /// ela reage tambem quando a pessoa corrige o e-mail ou o nome depois de
  /// escolher a senha.
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
  /// reprova. A ponte entre a lista da tela e a resposta da API.
  final String codigoDoServidor;

  /// A frase mostrada na lista, escrita como requisito e nunca como erro.
  final String texto;

  /// A frase mostrada **no campo**, quando esta regra reprovou de fato.
  ///
  /// Separada de [texto] porque requisito e erro nao sao a mesma frase: o
  /// requisito e dito antes da tentativa, o erro depois dela (UX secao 13).
  final String mensagemDeErro;
}

/// Como uma regra esta **agora**, com o que a pessoa ja digitou.
enum EstadoDaRegra {
  /// Campo de senha vazio. Nada foi exigido ainda.
  ///
  /// Existe para a lista nao nascer com quatro recusas em vermelho: quem ainda
  /// nao digitou nao errou nada, e abrir a tela acusando quatro faltas e
  /// hostil sem informar.
  aguardando,

  /// A regra esta satisfeita pelo que foi digitado.
  atendida,

  /// A regra reprovaria agora, se o formulario fosse enviado.
  naoAtendida,
}

/// O aviso que acompanha a lista, e que existe para ela nao mentir.
///
/// Texto de tela: quem le e a pessoa. Ele nao pede acao nenhuma dela, so evita
/// que "quatro de quatro" seja lido como garantia de que o cadastro passa.
const String avisoDoQueOServidorAindaConfere =
    'O servidor também recusa senha que já apareceu em vazamento conhecido. '
    'Isso não dá para conferir aqui: se acontecer, avisamos depois de enviar.';

/// O que dizer quando o servidor recusou a senha por um `code` que este build
/// nao conhece.
///
/// Existe por causa da lista de vazamento, que ainda nao emite codigo, e por
/// causa de toda regra que o servidor ganhar depois deste APK ser instalado.
/// **A alternativa e pior que generica: e falsa.** Ate 22/09/2026 esta tela
/// respondia `MensagensDeErro.senhaCurta` a QUALQUER recusa de senha, entao
/// quem tivesse a senha recusada por vazamento lia "precisa de pelo menos 10
/// caracteres", acrescentava caracteres e era recusado de novo, sem fim.
const String senhaRecusadaPeloServidor =
    'Não conseguimos aceitar esta senha. Escolha outra, de preferência uma '
    'frase que só você lembra.';

/// A politica, como o aparelho consegue medi-la.
abstract final class PoliticaDeSenha {
  /// O estado de **todas** as regras, na ordem de [RegraDeSenha.values].
  ///
  /// Devolve o mapa inteiro, e nao so o que falta: a lista precisa mostrar o
  /// que ja esta satisfeito, que e metade do pedido do cliente.
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
  ///
  /// Senha vazia devolve [RegraDeSenha.tamanhoMinimo] e mais nada: e o que a
  /// pessoa precisa ouvir primeiro, e nao as quatro de uma vez.
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
  ///
  /// Nulo **nao** e caso de erro: versao antiga do app continua instalada por
  /// semanas e vai receber `code` novo. Quem chama cai no texto generico, que
  /// e sempre melhor que uma frase errada dita com confianca.
  static RegraDeSenha? porCodigoDoServidor(String codigo) {
    for (final regra in RegraDeSenha.values) {
      if (regra.codigoDoServidor == codigo) return regra;
    }
    return null;
  }
}

/// Semelhanca com e-mail e nome, na forma normalizada.
///
/// Porte de `pareceComIdentidade` do servidor, incluindo o piso de 4
/// caracteres nos candidatos: sem ele, um e-mail curto casaria com quase tudo.
bool _pareceComIdentidade(
  String senha, {
  required String email,
  required String nome,
}) {
  final alvo = _normalizarParaComparacao(senha);
  if (alvo.isEmpty) return false;

  // A ordem e os tres candidatos sao os do servidor. `split('@').first`
  // devolve a string inteira quando nao ha arroba, igual ao `[0]` do
  // TypeScript, e e por isso que nao ha condicional aqui.
  final candidatos = <String>[email.split('@').first, email, nome]
      .map(_normalizarParaComparacao)
      .where((item) => item.length >= 4);

  return candidatos.any((item) => alvo.contains(item) || item.contains(alvo));
}

/// A forma sobre a qual a comparacao acontece.
///
/// O servidor faz `NFKD` -> tira marca combinante -> minuscula -> tira tudo que
/// nao e `[a-z0-9]`. `Marina.2024` e `marina2024` sao a mesma senha do ponto de
/// vista de quem ataca a partir do endereco da conta.
///
/// **Divergencia que eu declaro.** O Dart nao normaliza Unicode na biblioteca
/// padrao, e trazer um pacote para isso e peso de binario por um caso que nao
/// aparece em pt-BR. [_dobras] cobre o Latin-1 Suplementar e o Latin Estendido-A
/// **e so as letras que o `NFKD` de fato decompoe** -- `ø`, `œ`, `æ`, `ł`, `đ`,
/// `ß` ficam de fora porque o `NFKD` tambem as deixa inteiras, e dobra-las aqui
/// tornaria a tela **mais** exigente que o servidor, que e a direcao proibida.
///
/// O residuo: caractere acentuado fora dessas faixas (vietnamita, grego
/// politonico) some aqui e vira letra base no servidor. Nesses casos a tela fica
/// **menos** exigente, e a recusa chega depois do envio -- que e o mesmo
/// caminho da lista de vazamento, ja dito por
/// [avisoDoQueOServidorAindaConfere].
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
