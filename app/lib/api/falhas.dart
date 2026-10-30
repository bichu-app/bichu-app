import 'package:flutter/foundation.dart';

import 'problem.dart';

/// Tudo que pode dar errado numa chamada de API, em tres formas e nao mais.
sealed class FalhaDeChamada implements Exception {
  const FalhaDeChamada();
}

/// O servidor respondeu, e a resposta foi um erro no formato do contrato.
class FalhaDaApi extends FalhaDeChamada {
  const FalhaDaApi(this.problem);

  final Problem problem;

  ProblemTipo get tipo => problem.tipo;

  @override
  String toString() => 'FalhaDaApi(${problem.toString()})';
}

/// Nao foi possivel falar com o servidor: sem sinal, DNS que nao resolve,
/// recusa de conexao.
class FalhaDeConexao extends FalhaDeChamada {
  const FalhaDeConexao([this.causa]);

  final Object? causa;

  @override
  String toString() => 'FalhaDeConexao($causa)';
}

/// A requisicao saiu e a resposta nao voltou dentro do prazo.
class FalhaDeTempo extends FalhaDeChamada {
  const FalhaDeTempo(this.limite);

  final Duration limite;

  @override
  String toString() => 'FalhaDeTempo(${limite.inSeconds}s)';
}

/// O endereco que o corpo de uma resposta trouxe **nao e desta API**, e por
/// isso a requisicao nao saiu.
class FalhaDeEnderecoRecusado extends FalhaDeChamada {
  const FalhaDeEnderecoRecusado(this.endereco);

  /// O endereco recusado. **Nao** vai para log: ele pode carregar identificador
  /// de pet e de tag.
  final String endereco;

  @override
  String toString() => 'FalhaDeEnderecoRecusado(origem diferente de API_BASE_URL)';
}

/// O que fazer com um erro que **nao** e [FalhaDeChamada] no meio de uma acao
/// de tela.
void registrarFalhaInesperada(
  Object erro,
  StackTrace pilha, {
  required String onde,
}) {
  FlutterError.reportError(
    FlutterErrorDetails(
      exception: erro,
      stack: pilha,
      library: 'bichu/api',
      context: ErrorDescription(onde),
      informationCollector: () => <DiagnosticsNode>[
        ErrorDescription(
          'Erro que nao e FalhaDeChamada no meio de uma acao de tela. A tela '
          'saiu do carregando e mostrou o texto de servidor fora; a causa '
          'esta aqui.',
        ),
      ],
    ),
  );
}
