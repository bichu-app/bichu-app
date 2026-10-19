import 'api_client.dart';
import 'modelos_pessoa.dart';

/// A operação do **perfil de outra pessoa** (`tags: [people]` do contrato).
///
/// ## UMA operação, e a ausência das outras é o desenho
///
/// Não existe `listarPessoas`, não existe `buscarPessoas`, não existe
/// `apelidoDisponivel` e não existe nenhuma leitura que devolva um conjunto de
/// pessoas. **O argumento é um apelido que a tela já tem na mão**, e a resposta
/// é no máximo uma pessoa.
///
/// A razão está escrita no próprio desenho da conexão: *"o dano mora na
/// enumeração"*, não no perfil. O plano recusou até a rota de **disponibilidade**
/// de apelido (4-C.5) por ser superfície de enumeração, e a descoberta por link
/// está morta (4-B.1).
///
/// ## O 404 é ambíguo de propósito, e esta camada não desfaz a ambiguidade
///
/// Apelido inexistente, apelido reservado, apelido de **pet**, conta
/// desabilitada, par bloqueado em qualquer direção e perfil que quem olha
/// denunciou: **o mesmo 404**, mesmo corpo, mesmo código (ADR-0021). A tela diz
/// "não encontramos esta pessoa" e volta — é a mesma frase que
/// `MenuDoPerfil.aoPerderOAlvo` já usa, pela mesma razão: descobrir que foi
/// bloqueado é o que gera retaliação.
///
/// ## Esta porta exige conta
///
/// `bearerAuth` sem alternativa vazia. Não há perfil de pessoa alcançável sem
/// conta, em estado nenhum — a coluna "sem conta" da tabela 4-B é vazia
/// inteira, e isso é arquitetura e não escolha de tela.
///
/// ## Falha não vira perfil vazio
///
/// Sobe como `FalhaDeChamada`. Quem chama distingue "não encontramos esta
/// pessoa" de "não consegui perguntar", e as duas telas são diferentes.
class PessoasApi {
  const PessoasApi(this._api);

  final ApiClient _api;

  /// `getPersonProfile`.
  ///
  /// O apelido entra **sem o `@`**: o `@` é símbolo de leitura e não faz parte
  /// do identificador. O servidor normaliza a caixa (a coluna é `citext`), e
  /// esta camada não normaliza nada — normalizar aqui seria a segunda definição
  /// da regra, e a segunda divergiria do `CHECK` da migração.
  Future<PerfilDePessoa> perfil(String apelido) async {
    return PerfilDePessoa.doJson(await _api.get('/people/$apelido'));
  }
}
