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

/// O endereco que o corpo de uma resposta trouxe **nao e desta API**, e por
/// isso a requisicao nao saiu.
///
/// Nao e erro de rede: nada foi enviado. Existe porque `qr_png_url` e montado
/// pelo servidor e chega dentro de um corpo JSON. Levar o `Authorization: Bearer`
/// para qualquer host que um campo de resposta nomear entrega a credencial da
/// sessao no primeiro dia em que esse campo apontar para outro lugar -- por
/// configuracao errada, por proxy no meio ou por resposta adulterada. A conferencia
/// de origem acontece **antes** de a requisicao sair, e nao depois de o token
/// ja ter viajado.
class FalhaDeEnderecoRecusado extends FalhaDeChamada {
  const FalhaDeEnderecoRecusado(this.endereco);

  /// O endereco recusado. **Nao** vai para log: ele pode carregar
  /// identificador de pet e de tag.
  final String endereco;

  @override
  String toString() => 'FalhaDeEnderecoRecusado(origem diferente de API_BASE_URL)';
}

/// O que fazer com um erro que **nao** e [FalhaDeChamada] no meio de uma acao
/// de tela.
///
/// Existe porque o `catch (FalhaDeChamada)` de cada tela parecia exaustivo e
/// nao era. Ele cobre as quatro formas declaradas acima, e nao cobre o que
/// vem de fora delas: corpo 200 fora do contrato (`Sessao.doJson` e
/// `Pet.doJson` estouram `TypeError`), `PlatformException` de chaveiro ou de
/// disco, `MissingPluginException`. Medido: um `POST /auth/register` que
/// responde 201 com outro formato devolve um mapa que nao e `FalhaDeChamada`
/// e estoura acima da camada de API.
///
/// A consequencia era sempre a mesma e sempre a pior: o `setState` que
/// desliga o carregando morava **dentro** do `catch`, entao a excecao nao
/// prevista deixava a tela girando para sempre com o erro engolido. Quem
/// toca no botao nao recebe nem resultado nem saida.
///
/// Quem chama isto captura `Object`, sai do estado de carregando com
/// [MensagensDeErro.servidorFora] e passa o erro por aqui. **Capturar nao e
/// engolir**: o erro vai para o canal que a observabilidade escuta
/// (Sentry, ADR-0008), porque erro que so vira texto de tela e um defeito que
/// ninguem nunca ve.
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
