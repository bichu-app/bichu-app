import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

/// O que a busca de CEP devolve: **texto, nunca coordenada**.
///
/// Os quatro campos sao os que o formulario preenche. Qualquer outra coisa que
/// o servico mande e descartada em [BuscaDeCep], e o motivo esta la.
class EnderecoDoCep {
  const EnderecoDoCep({
    required this.logradouro,
    required this.bairro,
    required this.cidade,
    required this.uf,
  });

  /// Vazio quando o CEP e de cidade inteira (CEP "geral") e nao de uma rua.
  final String logradouro;
  final String bairro;
  final String cidade;
  final String uf;
}

/// Local: desfecho de uma busca de CEP em servico de terceiro, decidido no
/// aparelho. Nao espelha lista fechada nenhuma de `api/openapi.yaml` -- o
/// contrato nao conhece esta busca, e o servidor nao participa dela: ele
/// recebe os campos ja digitados ou ja corrigidos e nao sabe se ela
/// aconteceu.
///
/// **Nenhum destes desfechos impede o pedido de seguir.**
enum ResultadoDaBusca {
  /// Veio endereco. Os campos vazios do formulario sao preenchidos.
  encontrado,

  /// O CEP nao existe nas bases. A pessoa preenche a mao.
  naoEncontrado,

  /// Os dois servicos falharam, ou demoraram demais. A pessoa preenche a mao.
  indisponivel,
}

class RespostaDaBuscaDeCep {
  const RespostaDaBuscaDeCep(this.resultado, [this.endereco]);

  final ResultadoDaBusca resultado;
  final EnderecoDoCep? endereco;
}

/// Busca o endereco de um CEP em servico publico, para **poupar digitacao**.
///
/// ===========================================================================
/// O UNICO LUGAR DO APP QUE FALA COM SERVICO DE CEP
/// ===========================================================================
/// Qualquer formulario com campo de CEP chama esta classe. Ela e a unica que
/// sabe quais servicos existem, em que ordem, com que prazo, e como ler a
/// resposta de cada um -- um segundo formulario que montasse a propria
/// chamada seria a segunda verdade, e as duas divergiriam na primeira base que
/// mudar de formato.
///
/// **Inventario de 17/10/2026** (varri `app/lib/` e `admin/src/`): o pedido da
/// plaquinha e **o unico campo de CEP digitavel do produto**. O contrato
/// declara `postal_code` em `Me.reference_area` e `MeUpdate.reference_area`,
/// mas nenhuma tela o coleta -- `telas/localizacao/captura_de_localizacao.dart`
/// pede bairro e cidade e nao CEP. No painel nao ha campo de CEP: a unica
/// mencao e `admin/src/rede/dominio/observacoes.ts`, que detecta CEP para
/// **remove-lo** da observacao do encontro, o oposto de um cadastro. Quando o
/// segundo formulario existir, ele chama [buscar] e nao escreve nada novo.
///
/// ===========================================================================
/// ISTO NAO E GEOCODIFICACAO, E A DISTINCAO E O QUE AUTORIZA ESTE ARQUIVO
/// ===========================================================================
/// A ADR-0006 proibe transformar endereco em COORDENADA. O que esta classe faz
/// e o contrario de um geocodificador: ela troca um CEP por **rua, bairro,
/// cidade e estado -- texto**, e e exatamente o que a pessoa digitaria.
/// Nenhuma latitude, nenhuma longitude, nenhum ponto, nenhum indice espacial.
///
/// **A BrasilAPI DEVOLVE `location.coordinates` com latitude e longitude**, e
/// medi isso em 17/10/2026 antes de escrever este arquivo. [_daBrasilApi]
/// **le quatro campos e ignora o resto, de proposito**: o par de coordenadas
/// nunca e lido, nunca e guardado, nunca viaja para o nosso servidor e nao
/// existe coluna para ele. Se alguem "consertar" isto passando a ler
/// `location`, aí sim a ADR-0006 estaria violada -- e e por isso que este
/// paragrafo esta aqui, do lado da chamada, e nao num documento.
///
/// ===========================================================================
/// A CHAMADA SAI DO APARELHO, E O QUE ELA CARREGA E SO O CEP
/// ===========================================================================
/// Nem nome, nem id de conta, nem pet, nem token: o `http.Client` daqui **nao
/// e o [ApiClient]**, nao tem `Authorization` e nao conhece a nossa API. O
/// unico dado que sai e o CEP, oito digitos, que e um codigo postal publico e
/// nao o endereco de ninguem -- sem numero e sem nome, ele aponta para um
/// trecho de rua, nao para uma casa.
///
/// Do aparelho, e nao do nosso servidor, por tres razoes medidas:
///
/// 1. **o nosso servidor nao vira dependente de terceiro.** Um proxy nosso
///    faria a busca de CEP de TODOS os usuarios sair de um punhado de IPs, que
///    e a forma mais rapida de ser bloqueado por um servico gratuito -- e aí
///    ela quebra para todo mundo de uma vez. Do aparelho, a carga se espalha;
/// 2. **sem rota nova.** Uma rota de proxy precisaria de autenticacao, de
///    teto declarado, de superficie de contrato e de registro, para um recurso
///    que e conveniencia de digitacao;
/// 3. **nada que o terceiro aprende e novo sobre a pessoa.** Ele ve um IP e um
///    CEP. O que resta de residual esta dito e nao escondido: ele aprende o par
///    (IP, CEP), e nos nao temos contrato com ele.
///
/// Se a decisao mudar, o lugar de mexer e **so este arquivo**: a tela chama
/// [buscar] e nao sabe de onde vem a resposta.
///
/// ===========================================================================
/// O PEDIDO NUNCA DEPENDE DISTO
/// ===========================================================================
/// Todo caminho de falha termina em [ResultadoDaBusca.indisponivel] ou
/// [ResultadoDaBusca.naoEncontrado], e **nenhum deles lanca**. A tela continua
/// com os campos editaveis e o botao vivo: servico de terceiro fora do ar nao
/// pode impedir alguem de pedir a plaquinha.
class BuscaDeCep {
  /// `const` de proposito: e isso que deixa `Escopo` ter um valor padrao e
  /// **nenhum call site existente precisar mudar** -- inclusive os testes de
  /// outras telas, que nao sabem desta porta e nao deveriam ter de saber.
  /// Sem cliente injetado, um e criado por chamada e fechado no fim, e
  /// chamada so acontece quando alguem digita um CEP.
  const BuscaDeCep({
    http.Client? cliente,
    this.tempoLimite = const Duration(seconds: 4),
  }) : _clienteInjetado = cliente;

  final http.Client? _clienteInjetado;

  /// Quatro segundos.
  ///
  /// Medido em 17/10/2026: BrasilAPI respondeu em ~60 ms e ViaCEP em ~430 ms.
  /// Quatro segundos e cerca de dez vezes o mais lento dos dois, o que deixa
  /// folga para rede ruim sem transformar um campo de CEP em espera. O prazo
  /// vale **por servico**, entao o pior caso da cadeia inteira e oito
  /// segundos -- e mesmo nele o formulario continua inteiro e digitavel.
  final Duration tempoLimite;

  static final RegExp _soDigitos = RegExp(r'[^0-9]');

  /// **Principal, por pedido do cliente de 17/10** ("pode implementar o via
  /// cep"). Medido no mesmo dia: sem chave, sem cadastro, `Access-Control-
  /// Allow-Origin: *`, e nenhum cabecalho de limite na resposta.
  static const String _viaCep = 'https://viacep.com.br/ws';

  /// Reserva, usada **so quando a principal falha ou nao responde**. Mesma
  /// medicao: sem chave e sem cadastro. Manter a segunda so aumenta a chance
  /// de o campo se preencher, e nao contraria a escolha do cliente -- em
  /// nenhum caminho ela e consultada antes do ViaCEP.
  static const String _brasilApi = 'https://brasilapi.com.br/api/cep/v2';

  /// O endereco do CEP, ou o motivo de nao ter vindo. **Nunca lanca.**
  Future<RespostaDaBuscaDeCep> buscar(String cepBruto) async {
    final cep = cepBruto.replaceAll(_soDigitos, '');
    if (cep.length != 8) {
      return const RespostaDaBuscaDeCep(ResultadoDaBusca.naoEncontrado);
    }

    final injetado = _clienteInjetado;
    final cliente = injetado ?? http.Client();
    try {
      // ViaCEP primeiro: e o servico que o cliente nomeou.
      final principal = await _tentar(() => _doViaCep(cliente, cep));
      if (principal != null && principal.resultado == ResultadoDaBusca.encontrado) {
        return principal;
      }

      // A reserva entra quando a principal falhou, nao respondeu **ou disse
      // que o CEP nao existe**: as duas bases divergem, e perguntar a segunda
      // custa menos que mandar a pessoa digitar o que ela teria de graca.
      final reserva = await _tentar(() => _daBrasilApi(cliente, cep));
      if (reserva != null) return reserva;

      // A principal respondeu "nao existe" e a reserva nao desmentiu.
      if (principal != null) return principal;

      return const RespostaDaBuscaDeCep(ResultadoDaBusca.indisponivel);
    } finally {
      // So fecha o que foi criado aqui: fechar o cliente injetado derrubaria
      // o do app inteiro.
      if (injetado == null) cliente.close();
    }
  }

  /// Roda uma tentativa e engole tudo o que der errado.
  ///
  /// Engolir e o comportamento correto aqui, e nao descuido: qualquer excecao
  /// -- rede, DNS, TLS, JSON torto, prazo estourado -- significa a mesma coisa
  /// para quem esta preenchendo o formulario, que e "digite voce mesmo".
  Future<RespostaDaBuscaDeCep?> _tentar(
    Future<RespostaDaBuscaDeCep?> Function() tentativa,
  ) async {
    try {
      return await tentativa().timeout(tempoLimite);
    } on Object {
      return null;
    }
  }

  /// `null` quando o servico falhou (e a reserva deve ser tentada).
  Future<RespostaDaBuscaDeCep?> _daBrasilApi(http.Client cliente, String cep) async {
    final resposta = await cliente.get(Uri.parse('$_brasilApi/$cep'));
    // 404 e "nao existe nas bases dela", e ainda vale perguntar a reserva.
    if (resposta.statusCode == 404) return null;
    if (resposta.statusCode != 200) return null;

    final json = jsonDecode(resposta.body);
    if (json is! Map<String, dynamic>) return null;

    // **QUATRO CAMPOS, e o resto e ignorado de proposito.** A resposta traz
    // `location.coordinates` com latitude e longitude; ler isso transformaria
    // uma busca de texto num geocodificador, que e o que a ADR-0006 proibe.
    // Tambem ficam de fora `ibge`, `timezoneName` e `service`: nenhum deles
    // tem campo no formulario, e guardar dado sem finalidade e o oposto da
    // minimizacao.
    final endereco = EnderecoDoCep(
      logradouro: _texto(json['street']),
      bairro: _texto(json['neighborhood']),
      cidade: _texto(json['city']),
      uf: _texto(json['state']).toUpperCase(),
    );
    if (endereco.cidade.isEmpty || endereco.uf.length != 2) return null;
    return RespostaDaBuscaDeCep(ResultadoDaBusca.encontrado, endereco);
  }

  Future<RespostaDaBuscaDeCep?> _doViaCep(http.Client cliente, String cep) async {
    final resposta = await cliente.get(Uri.parse('$_viaCep/$cep/json/'));
    // CEP malformado devolve **HTML** com 400, e nao JSON. Medido em 17/10:
    // tentar `jsonDecode` nele lanca, e por isso o status vem antes.
    if (resposta.statusCode != 200) return null;

    final json = jsonDecode(resposta.body);
    if (json is! Map<String, dynamic>) return null;

    // `erro` vem como a STRING `"true"`, e nao como booleano -- medido em
    // 17/10/2026. Conferir so `== true` deixaria passar o CEP inexistente
    // como se fosse endereco vazio, e o formulario apagaria o que a pessoa
    // tivesse digitado.
    final erro = json['erro'];
    if (erro == true || erro == 'true') {
      return const RespostaDaBuscaDeCep(ResultadoDaBusca.naoEncontrado);
    }

    // **`complemento` do ViaCEP NAO e o complemento da pessoa.** Ele vem como
    // "ate 609 - lado impar", que descreve a FAIXA da rua; jogar isso no campo
    // de complemento poria o apartamento de ninguem no endereco de entrega.
    final endereco = EnderecoDoCep(
      logradouro: _texto(json['logradouro']),
      bairro: _texto(json['bairro']),
      cidade: _texto(json['localidade']),
      uf: _texto(json['uf']).toUpperCase(),
    );
    if (endereco.cidade.isEmpty || endereco.uf.length != 2) return null;
    return RespostaDaBuscaDeCep(ResultadoDaBusca.encontrado, endereco);
  }

  static String _texto(Object? valor) =>
      valor is String ? valor.trim() : '';
}
