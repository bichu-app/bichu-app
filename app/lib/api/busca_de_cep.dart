import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

/// O que a busca de CEP devolve: **texto, nunca coordenada**.
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
/// aparelho.
enum ResultadoDaBusca {
  /// Veio endereco. Os campos vazios do formulario sao preenchidos.
  encontrado,

  /// O CEP nao existe nas bases.
  naoEncontrado,

  /// Os dois servicos falharam, ou demoraram demais.
  indisponivel,
}

class RespostaDaBuscaDeCep {
  const RespostaDaBuscaDeCep(this.resultado, [this.endereco]);

  final ResultadoDaBusca resultado;
  final EnderecoDoCep? endereco;
}

/// Busca o endereco de um CEP em servico publico, para **poupar digitacao**.
class BuscaDeCep {
  /// `const` de proposito: e isso que deixa `Escopo` ter um valor padrao e
  /// **nenhum call site existente precisar mudar** -- inclusive os testes de
  /// outras telas, que nao sabem desta porta e nao deveriam ter de saber.
  const BuscaDeCep({
    http.Client? cliente,
    this.tempoLimite = const Duration(seconds: 4),
  }) : _clienteInjetado = cliente;

  final http.Client? _clienteInjetado;

  /// Quatro segundos.
  final Duration tempoLimite;

  static final RegExp _soDigitos = RegExp(r'[^0-9]');

  /// **Principal, por pedido do cliente de 17/10** ("pode implementar o via
  /// cep").
  static const String _viaCep = 'https://viacep.com.br/ws';

  /// Reserva, usada **so quando a principal falha ou nao responde**.
  static const String _brasilApi = 'https://brasilapi.com.br/api/cep/v2';

  /// O endereco do CEP, ou o motivo de nao ter vindo.
  Future<RespostaDaBuscaDeCep> buscar(String cepBruto) async {
    final cep = cepBruto.replaceAll(_soDigitos, '');
    if (cep.length != 8) {
      return const RespostaDaBuscaDeCep(ResultadoDaBusca.naoEncontrado);
    }

    final injetado = _clienteInjetado;
    final cliente = injetado ?? http.Client();
    try {
      final principal = await _tentar(() => _doViaCep(cliente, cep));
      if (principal != null && principal.resultado == ResultadoDaBusca.encontrado) {
        return principal;
      }

      final reserva = await _tentar(() => _daBrasilApi(cliente, cep));
      if (reserva != null) return reserva;

      if (principal != null) return principal;

      return const RespostaDaBuscaDeCep(ResultadoDaBusca.indisponivel);
    } finally {
      if (injetado == null) cliente.close();
    }
  }

  /// Roda uma tentativa e engole tudo o que der errado.
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
    if (resposta.statusCode == 404) return null;
    if (resposta.statusCode != 200) return null;

    final json = jsonDecode(resposta.body);
    if (json is! Map<String, dynamic>) return null;

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
    if (resposta.statusCode != 200) return null;

    final json = jsonDecode(resposta.body);
    if (json is! Map<String, dynamic>) return null;

    final erro = json['erro'];
    if (erro == true || erro == 'true') {
      return const RespostaDaBuscaDeCep(ResultadoDaBusca.naoEncontrado);
    }

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
