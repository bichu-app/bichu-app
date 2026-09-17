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
///
/// Nao e caso de erro raro: metro, elevador, aviao e sinal ruim sao operacao
/// normal deste produto. Quem chama decide se a acao entra na fila local ou se
/// e daquelas que exigem servidor.
class FalhaDeConexao extends FalhaDeChamada {
  const FalhaDeConexao([this.causa]);

  final Object? causa;

  @override
  String toString() => 'FalhaDeConexao($causa)';
}

/// A requisicao saiu e a resposta nao voltou dentro do prazo.
///
/// Separada de [FalhaDeConexao] de proposito: aqui a acao **pode** ter
/// acontecido no servidor, e e por isso que toda operacao com efeito colateral
/// vai com `Idempotency-Key`. Tratar as duas como a mesma coisa e o caminho
/// mais curto para o tutor receber o mesmo aviso tres vezes.
class FalhaDeTempo extends FalhaDeChamada {
  const FalhaDeTempo(this.limite);

  final Duration limite;

  @override
  String toString() => 'FalhaDeTempo(${limite.inSeconds}s)';
}
