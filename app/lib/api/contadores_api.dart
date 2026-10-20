/// Os contadores das abas `Pets` e `Rede` (BICHUS-278, cliente 20/10/2026).
///
/// ---------------------------------------------------------------------------
/// ## O QUE CADA NUMERO CONTA, e por que nao e o que a primeira leitura sugere
///
/// O cliente pediu contador em cinco abas. A frente anterior entregou o de
/// `AuAu` e **mediu que as outras quatro nao tinham fonte**. Esta camada e o
/// cliente das tres que ele mandou construir, e a decisao que governa as tres
/// e uma so: **o selo conta o conteudo que aparece quando a pessoa toca na
/// aba.** Selo que aponta para lista que a aba nao abre e selo que, ao ser
/// tocado, zera sem mostrar nada -- e e exatamente assim que um contador perde
/// a confianca de quem olha.
///
/// ### `Pets` -- o pedido era "pet novo na regiao", e a fonte NAO e `pets`
///
/// Medido nesta arvore em 20/10/2026, e cada item e verificavel:
///
///   * a tabela `pets` **nao tem coluna de cidade nenhuma** -- conferido o
///     `CREATE TABLE` inteiro da migracao `20260917000006` e `ALTER TABLE pets`
///     nas 80 migracoes: **zero** ocorrencias;
///   * **nao existe operacao que liste pet cadastrado de terceiro por
///     regiao** -- das dezoito operacoes de pet do contrato, as unicas duas que
///     um terceiro alcanca sao `listPublicLostPets` e `getPublicPetBySlug`, e a
///     segunda e **um** pet por endereco;
///   * o corpo da aba `Pets` e [ListaDePerdidos], que chama
///     `listPublicLostPets`.
///
/// Quer dizer que um contador sobre `pets` seria um numero sem lista: a pessoa
/// veria `3`, tocaria em `Pets` e encontraria a lista de **perdidos**, onde
/// nada mudou -- e o numero zeraria. Entao a contagem desta aba e
/// **caso de perdido novo no recorte da propria lista**, que e o conteudo que
/// a aba abre.
///
/// ### `Rede` -- duas contagens, UM selo, DOIS marcadores
///
/// A barra de baixo tem um selo por aba, e a `Rede` tem duas sub-abas
/// (`Eventos` e `Comunidade`). O selo mostra a **soma**; o marcador de "ja vi"
/// e **separado por sub-aba**. A assimetria e a decisao: com marcador unico,
/// entrar em `Eventos` apagaria a contagem de `Comunidade` -- o app teria
/// afirmado que a pessoa viu um profissional que nunca apareceu na tela dela.
///
/// ### `Comunidade` -- "recomendado" e a ENTRADA no diretorio
///
/// Decisao do cliente de 20/10/2026, nas palavras dele: *"Todo profissional que
/// passa pela moderacao e entra no Perto conta como recomendado pela
/// comunidade -- porque ele so chega la se alguem o indicou"*. Entao o sinal e
/// `published_at`, e **nao** ha coluna de destaque, ranking nem selo: o dado ja
/// existia.
///
/// ---------------------------------------------------------------------------
/// ## A CIDADE VEM DO APARELHO, pelo mesmo depoisito que a lista usa
///
/// [contar] manda a cidade guardada em `CidadeEscolhida` -- *"a ultima cidade
/// escolhida na listagem publica de perdidos"*, gravada por `_carregar` em
/// `lista_de_perdidos.dart` a cada carga. **E de proposito que nao e
/// `Me.reference_area.city`:** medido pela frente de 19/10 e registrado naquele
/// arquivo, **3 de 47 contas** a tem preenchida, e a propria lista a usa so
/// como segunda reserva, abaixo da cidade resolvida pelo aparelho.
///
/// Lendo o mesmo deposito, o selo e a lista ficam no mesmo recorte sem o app
/// resolver localizacao duas vezes e sem coordenada nenhuma sair do aparelho
/// (ADR-0006, emenda 1: coordenada -> nome de cidade, e so esse sentido).
///
/// **O preco honesto:** na PRIMEIRA abertura depois de instalar, o deposito
/// esta vazio e a contagem sai sem recorte de geografia -- os casos abertos do
/// pais inteiro. E o mesmo recorte com que a lista abre nessa mesma situacao,
/// entao o selo continua concordando com a tela; o que muda e que o numero e
/// maior nesse primeiro momento.
///
/// ---------------------------------------------------------------------------
/// ## A FALHA E ENGOLIDA, e e a mesma regra de `ConversasApi.marcarListaVista`
///
/// Nenhuma das duas chamadas e dado que a pessoa pediu. Uma faixa de erro em
/// cima da tela por causa de um contador seria um erro sobre uma operacao que
/// ninguem executou. [contar] devolve **nulo** na falha, e nulo e
/// "ninguem contou ainda" -- e o `ContadoresDeNaoLido` nao mexe no numero que
/// ja tinha, porque um numero velho e mais verdadeiro que um zero inventado.
library;

import 'api_client.dart';
import 'falhas.dart';

/// `#/components/schemas/SectionSeenInput/properties/section` do contrato.
///
/// **`mural` nao esta aqui, e a ausencia e do contrato e nao do app:** a
/// contagem do `Mural` e de outra frente (o compositor), e o `enum` do servidor
/// tambem nao a declara. Quando ela existir, o valor entra nos dois lados.
enum SecaoComContador {
  /// A aba `Pets` -- a listagem publica de perdidos, que e o corpo dela.
  pets('pets'),

  /// A sub-aba `Eventos` da `Rede`.
  eventosDaRede('network_events'),

  /// A sub-aba `Comunidade` da `Rede` -- o diretorio.
  comunidadeDaRede('network_directory');

  const SecaoComContador(this.codigo);

  final String codigo;
}

/// Os tres numeros, como `SectionCounters` os declara.
///
/// **Inteiros e nao anulaveis**, e a diferenca com `ContadoresDeNaoLido` e
/// deliberada: aqui e o que o servidor AFIRMOU, e la ha nulo porque la existe o
/// estado "ninguem contou ainda". Zero vindo do servidor e a afirmacao de que
/// nao ha nada novo; nulo e a ausencia de afirmacao, e so a camada de cima tem
/// como estar nesse estado.
class ContadoresDeSecao {
  const ContadoresDeSecao({
    required this.perdidosNovos,
    required this.eventosNovos,
    required this.profissionaisNovos,
  });

  final int perdidosNovos;
  final int eventosNovos;
  final int profissionaisNovos;

  /// A soma das duas sub-abas da `Rede`, que e o que o selo da aba pinta.
  ///
  /// Mora aqui e nao na tela porque as duas parcelas moram aqui: somar na tela
  /// faria a regra depender de quem desenha.
  int get redeNova => eventosNovos + profissionaisNovos;

  static ContadoresDeSecao deJson(Map<String, Object?> json) {
    return ContadoresDeSecao(
      perdidosNovos: _inteiro(json['lost_pets_new']),
      eventosNovos: _inteiro(json['network_events_new']),
      profissionaisNovos: _inteiro(json['network_directory_new']),
    );
  }

  /// **Campo ausente ou de outro tipo e `FormatException`, e nao zero.**
  ///
  /// Um `?? 0` aqui transformaria resposta fora do contrato em "nao ha nada
  /// novo", calado -- e a tela apagaria o selo afirmando o que ninguem disse.
  /// E a mesma razao pela qual `modelos_conversa.dart` recusa codigo
  /// desconhecido em vez de cair num valor "seguro".
  static int _inteiro(Object? valor) {
    if (valor is int) return valor < 0 ? 0 : valor;
    throw FormatException('contador fora do contrato: $valor');
  }
}

/// As duas operacoes dos contadores de secao (`tags: [me]`).
class ContadoresApi {
  ContadoresApi(this._api);

  final ApiClient _api;

  /// `GET /v1/me/section-counters`. **Nulo na falha**, e nulo nao e zero.
  Future<ContadoresDeSecao?> contar({String? cidade}) async {
    try {
      final json = await _api.get(
        '/me/section-counters',
        query: <String, String>{
          // Cidade ausente e geografia ABERTA, e a ausencia e a FALTA do
          // parametro -- nao `city=`, que o contrato recusa com 400 pelo
          // `minLength: 2`. Mesma mecanica da listagem publica.
          if (cidade != null && cidade.trim().length >= 2) 'city': cidade.trim(),
        },
      );
      return ContadoresDeSecao.deJson(json.cast<String, Object?>());
    } on FalhaDeChamada {
      return null;
    } on FormatException {
      return null;
    }
  }

  /// `POST /v1/me/sections-seen`. **A resposta traz os contadores JA
  /// recalculados**, e e por isso que o app nao zera nada por conta propria.
  ///
  /// Quem decide o numero depois da visita e o servidor -- a primeira versao de
  /// `marcarMensagensVistas` zerava local e estava errada, porque ver a lista
  /// de mensagens **nao** tira tudo do contador. Nenhuma destas tres areas tem
  /// excecao parecida (medido), mas a decisao continua sendo do servidor: assim
  /// ela continua certa no dia em que uma excecao nascer, sem o app mudar.
  ///
  /// **Nulo na falha**, e a falha e engolida: ver o cabecalho.
  Future<ContadoresDeSecao?> marcarVista(
    SecaoComContador secao, {
    String? cidade,
  }) async {
    try {
      final json = await _api.post(
        '/me/sections-seen',
        corpo: <String, Object?>{
          'section': secao.codigo,
          if (cidade != null && cidade.trim().length >= 2) 'city': cidade.trim(),
        },
      );
      return ContadoresDeSecao.deJson(json.cast<String, Object?>());
    } on FalhaDeChamada {
      return null;
    } on FormatException {
      return null;
    }
  }
}
