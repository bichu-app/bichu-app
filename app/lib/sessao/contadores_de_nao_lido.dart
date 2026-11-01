import 'package:flutter/foundation.dart';

import '../api/contadores_api.dart';
import '../api/conversas_api.dart';
import '../dispositivo/distintivo_do_aplicativo.dart';
import 'cidade_escolhida.dart';

/// O OBJETO DE CONTAGEM que a barra de baixo lia e nao existia.
class ContadoresDeNaoLido extends ChangeNotifier {
  /// A porta de conversas entra POSICIONAL, como `PetsApi(api)` e as outras
  /// camadas de API deste app; o caminho do icone do aplicativo entra nomeado
  /// porque e opcional e tem padrao.
  ContadoresDeNaoLido(
    this._conversas, {
    required ContadoresApi secoes,
    required CidadeEscolhida cidade,
    DistintivoDoAplicativo? distintivo,
  })
      // ignore: prefer_initializing_formals
      : _secoes = secoes,
        // ignore: prefer_initializing_formals
        _cidade = cidade,
        _distintivo = distintivo ?? const DistintivoInerte();

  final ConversasApi _conversas;

  final ContadoresApi _secoes;

  final CidadeEscolhida _cidade;

  final DistintivoDoAplicativo _distintivo;

  int? _mensagens;
  ContadoresDeSecao? _secoesContadas;

  String? _cidadeConhecida;
  bool _pediuACidade = false;

  bool _descartado = false;

  /// Quantas mensagens nao lidas a CONTA tem, ou **nulo**.
  int? get mensagens => _mensagens;

  /// Quantos casos de perdido NOVOS ha no recorte da aba `Pets`, ou **nulo**.
  int? get perdidos => _secoesContadas?.perdidosNovos;

  /// O numero do selo da aba `Rede`: a SOMA das duas sub-abas, ou **nulo**.
  int? get rede => _secoesContadas?.redeNova;

  /// A parcela de eventos da `Rede`.
  int? get eventos => _secoesContadas?.eventosNovos;

  /// A parcela do diretorio da `Rede`.
  int? get profissionais => _secoesContadas?.profissionaisNovos;

  /// O ultimo numero que o caminho do icone do aplicativo recebeu, e o que
  /// aconteceu com ele.
  ResultadoDoDistintivo? get ultimoDistintivoDoApp => _ultimoDistintivo;
  ResultadoDoDistintivo? _ultimoDistintivo;

  /// Pergunta ao servidor. Falha **nao** zera: ela deixa como estava.
  Future<void> atualizar() async {
    await Future.wait<void>(<Future<void>>[
      _contarMensagens(),
      atualizarSecoes(),
    ]);
  }

  Future<void> _contarMensagens() async {
    try {
      final pagina = await _conversas.listar(limite: 1);
      definir(pagina.unreadCount);
    } on Object {
      // Ver o doc acima. Nao relanca, e NAO mexe em `_mensagens`.
    }
  }

  /// Pergunta as TRES contagens de secao.
  Future<void> atualizarSecoes() async {
    try {
      _lerACidadeSemEsperar();
      final contagem = await _secoes.contar(cidade: _cidadeConhecida);
      if (contagem == null) return;
      _definirSecoes(contagem);
    } on Object {
      // Nao relanca. `ContadoresApi` ja engole `FalhaDeChamada` e `FormatException`; este `catch` cobre o que vier do deposito.
    }
  }

  /// A area foi VISTA: **o servidor devolve os numeros novos no mesmo pedido.**
  Future<void> marcarSecaoVista(SecaoComContador secao) async {
    try {
      _lerACidadeSemEsperar();
      final contagem = await _secoes.marcarVista(secao, cidade: _cidadeConhecida);
      if (contagem == null) return;
      _definirSecoes(contagem);
    } on Object {
      // Ver o doc acima. O selo fica aceso e a proxima entrada tenta de novo, que e o pior desfecho possivel -- e e aceitavel.
    }
  }

  void _lerACidadeSemEsperar() {
    if (_pediuACidade) return;
    _pediuACidade = true;
    _cidade.ler().then((cidade) {
      if (cidade == null || cidade.trim().isEmpty) return;
      _cidadeConhecida = cidade.trim();
    }).catchError((Object _) => null);
  }

  /// O DESCARTE, e as tres guardas que ele liga.
  @override
  void dispose() {
    _descartado = true;
    super.dispose();
  }

  void _definirSecoes(ContadoresDeSecao contagem) {
    if (_descartado) return;
    final anterior = _secoesContadas;
    if (anterior != null &&
        anterior.perdidosNovos == contagem.perdidosNovos &&
        anterior.eventosNovos == contagem.eventosNovos &&
        anterior.profissionaisNovos == contagem.profissionaisNovos) {
      return;
    }
    _secoesContadas = contagem;
    notifyListeners();
  }

  /// Recebe o numero que o servidor mandou.
  void definir(int naoLidas) {
    if (_descartado) return;
    final valor = naoLidas < 0 ? 0 : naoLidas;
    _anunciarAoAplicativo(valor);
    if (_mensagens == valor) return;
    _mensagens = valor;
    notifyListeners();
  }

  /// A area de mensagens foi vista: **pergunta o numero de novo ao servidor.**
  Future<void> marcarMensagensVistas() => atualizar();

  /// Volta ao estado "ninguem contou ainda".
  void esquecer() {
    if (_descartado) return;
    _ultimoDistintivo = null;
    final tinhaSecoes = _secoesContadas != null;
    _secoesContadas = null;
    if (_mensagens == null) {
      if (tinhaSecoes) notifyListeners();
      return;
    }
    _mensagens = null;
    notifyListeners();
  }

  void _anunciarAoAplicativo(int valor) {
    _ultimoDistintivo = _distintivo.definir(valor);
  }
}
