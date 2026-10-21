import 'api_client.dart';
import 'modelos_pessoa.dart';

/// As operações das pessoas que não são a própria conta (`tags: [people]` do
/// contrato): o **perfil** e a **busca**.
///
/// ## DUAS operações desde 20/10/2026, e o cabeçalho anterior afirmava UMA
///
/// Até aquela data este arquivo dizia *"não existe `buscarPessoas`"* e
/// explicava por que não poderia existir. **A frase deixou de valer**, e foi
/// corrigida em vez de deixada aqui contradizendo o método ao lado: o cliente
/// reverteu a recusa, literal — *"vamos implementar a busca pelo usuario"*.
///
/// O que **continua** não existindo, e não por esquecimento: `apelidoDisponivel`
/// (o plano recusou a rota de disponibilidade de apelido, 4-C.5, por ser
/// superfície de enumeração) e qualquer leitura que devolva o conjunto de todas
/// as pessoas — `q` ausente ou vazio responde **lista vazia**, e não existe
/// "listar todos".
///
/// ## O que a busca entrega é LIMITE, e não escolha de tela
///
/// Nome, apelido e as duas contagens. **Não há foto**, e a ausência é da
/// emenda 5 item 2 do ADR-0010: a foto não sai para quem não é conexão aceita,
/// e resultado de busca é por construção lista de não-conexões. Não há
/// `public_ref`, não há `connection_state` e não há identificador interno.
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

  /// O piso de caracteres da busca, **e ele não é gosto**.
  ///
  /// O índice é GIN trigrama: um padrão com menos de três caracteres **não
  /// produz trigrama nenhum**, e a consulta volta a varrer a tabela de contas
  /// inteira. E um termo de uma ou duas letras casa quase todo mundo, o que
  /// torna a busca uma listagem de pessoas com outro nome.
  ///
  /// O mesmo número está em três lugares, e os três concordam: `minLength: 3`
  /// no parâmetro `q` do contrato, `MINIMO_DE_CARACTERES_DA_BUSCA` no domínio
  /// do servidor, e aqui.
  static const int minimoDaBusca = 3;

  /// `searchPeople` — **e ela NÃO é chamada abaixo de [minimoDaBusca]**.
  ///
  /// ## Por que o piso é cobrado AQUI, e não deixado para o servidor
  ///
  /// A prosa do contrato promete que um termo curto devolve lista vazia em vez
  /// de 400. **MEDIDO: o servidor instalado devolve 400.** O vigia de
  /// parâmetros copia o schema do parâmetro inteiro, com o `minLength: 3`, para
  /// o `querystring` da rota, e o validador recusa `?q=ma` antes de o caso de
  /// uso rodar — com `validation-failed` e `errors[0].field = 'q'`.
  ///
  /// Então este método **não pergunta**: termo ausente, vazio, só de
  /// separadores ou abaixo do piso devolve [PaginaDeBuscaDePessoas.semBusca]
  /// **sem nenhuma requisição**. Isso faz três coisas de uma vez: cumpre o
  /// "campo vazio nunca lista ninguém" que veio junto com a reversão, não gasta
  /// o teto de 60 consultas por hora com termos que não podiam casar nada, e
  /// não deixa a pessoa ver uma faixa vermelha no meio de escrever um nome.
  ///
  /// **E `q` vazio não é mandado tampouco**: `?q=` também bate no `minLength`.
  /// Para "não buscar", o parâmetro é **omitido** — e aqui ele nem chega a ser
  /// montado, porque a chamada não sai.
  ///
  /// ## O termo vai como a pessoa digitou, só sem as pontas
  ///
  /// `trim` e nada mais. A normalização de acento e de caixa é `texto_para_busca`
  /// no banco, a mesma função que o diretório usa; repeti-la aqui criaria a
  /// segunda definição da mesma regra, e a do aplicativo envelheceria no bolso
  /// de quem não atualiza.
  Future<PaginaDeBuscaDePessoas> buscar(
    String termo, {
    int pagina = 1,
    int limite = 20,
  }) async {
    final limpo = termo.trim();
    if (limpo.length < minimoDaBusca) return PaginaDeBuscaDePessoas.semBusca;
    final json = await _api.get(
      '/people',
      query: <String, String>{
        'q': limpo,
        'page': '$pagina',
        'limit': '$limite',
      },
    );
    return PaginaDeBuscaDePessoas.doJson(json);
  }
}
