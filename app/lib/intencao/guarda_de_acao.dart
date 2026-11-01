/// A guarda de ação: a intenção sobrevive ao login e é **executada** (UX 8.3).
library;

import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../api/falhas.dart';
import '../api/mensagens_de_erro.dart';
import 'deposito_de_intencao.dart';
import 'intencao_pendente.dart';

/// Traduz um ID de tela da pesquisa (`F1.5`) no endereço do app (`/pets/...`).
typedef RotaDeTelaDeUx = String? Function(String telaDeUx);

/// Para onde a execução bem-sucedida levou.
class ResultadoDaExecucao {
  const ResultadoDaExecucao({required this.rota, this.extra});

  /// A tela de **resultado**: o achado registrado, o caso aberto, o pet
  /// cadastrado.
  final String rota;

  final Object? extra;
}

/// O que a guarda sabe fazer com uma ação: executá-la e, quando ela falha,
/// montar o que a tela de retorno precisa receber.
class AcaoExecutavel {
  const AcaoExecutavel({
    required this.executar,
    required this.retomar,
    this.rotaDeRetorno,
  });

  /// Executa de verdade. Lança `FalhaDeChamada` como qualquer camada de API.
  final Future<ResultadoDaExecucao> Function(IntencaoPendente) executar;

  /// O `extra` da tela de retorno: o rascunho recarregado e o erro explicado
  /// (regra 4).
  final Object? Function(IntencaoPendente intencao, MensagemDeErro? erro)
      retomar;

  /// A rota da tela de retorno quando ela depende do ALVO, e nao so do ID de
  /// tela.
  final String? Function(IntencaoPendente intencao)? rotaDeRetorno;
}

/// Para onde a pessoa vai depois de entrar na conta.
sealed class DestinoPosLogin {
  const DestinoPosLogin();
}

/// O Início. **Só dois casos chegam aqui**: não havia intenção nenhuma, ou a
/// intenção expirou (regra 2).
class DestinoDeInicio extends DestinoPosLogin {
  const DestinoDeInicio({required this.porqueExpirou});

  /// Verdadeiro quando havia uma intenção e ela passou das 24 horas.
  final bool porqueExpirou;
}

/// A tela de resultado, com a ação já executada.
class DestinoDeResultado extends DestinoPosLogin {
  const DestinoDeResultado({
    required this.rota,
    required this.localizacaoDesatualizada,
    this.extra,
  });

  final String rota;
  final Object? extra;

  /// A coordenada do envelope tinha mais de 30 minutos na hora de executar
  /// (regra 6).
  final bool localizacaoDesatualizada;
}

/// A tela de retorno, com o rascunho carregado e o erro explicado (regra 4).
class DestinoDeRetorno extends DestinoPosLogin {
  const DestinoDeRetorno({
    required this.rota,
    required this.telaDeRetorno,
    this.extra,
    this.erro,
  });

  final String rota;

  /// O ID de tela de 8.3, guardado para quem for depurar em campo.
  final String telaDeRetorno;

  final Object? extra;

  /// Nulo só quando este build não soube executar a ação — aí não há falha de
  /// chamada para traduzir, e inventar um texto de tela seria pior que ficar
  /// calado.
  final MensagemDeErro? erro;
}

/// A guarda.
class GuardaDeAcao {
  GuardaDeAcao({
    required DepositoDaIntencao deposito,
    required RotaDeTelaDeUx rotaDaTela,
    Map<AcaoDeIntencao, AcaoExecutavel> acoes =
        const <AcaoDeIntencao, AcaoExecutavel>{},
    DateTime Function() agora = DateTime.now,
    // ignore: prefer_initializing_formals
  })  : _deposito = deposito,
        // ignore: prefer_initializing_formals
        _rotaDaTela = rotaDaTela,
        // ignore: prefer_initializing_formals
        _acoes = acoes,
        // ignore: prefer_initializing_formals
        _agora = agora;

  final DepositoDaIntencao _deposito;
  final RotaDeTelaDeUx _rotaDaTela;
  final Map<AcaoDeIntencao, AcaoExecutavel> _acoes;
  final DateTime Function() _agora;

  void _relatar(
    Object erro,
    StackTrace pilha,
    String quando,
    String detalhe,
  ) {
    FlutterError.reportError(
      FlutterErrorDetails(
        exception: erro,
        stack: pilha,
        library: 'bichu/intencao',
        context: ErrorDescription(quando),
        informationCollector: () => <DiagnosticsNode>[ErrorDescription(detalhe)],
      ),
    );
  }

  /// Guarda a intenção. **A nova substitui a anterior** (regra 1).
  Future<void> guardar(IntencaoPendente intencao) async {
    await _deposito.gravar(jsonEncode(intencao.paraJson()));
  }

  /// O envelope guardado, ou nulo.
  Future<IntencaoPendente?> pendente() async => (await _ler()).intencao;

  /// A leitura, com o motivo de ter dado em nada.
  Future<({IntencaoPendente? intencao, bool expirou})> _ler() async {
    final bruto = await _deposito.ler();
    if (bruto == null || bruto.isEmpty) {
      return (intencao: null, expirou: false);
    }

    final IntencaoPendente intencao;
    try {
      intencao = IntencaoPendente.deJson(
        Map<String, dynamic>.from(jsonDecode(bruto) as Map),
      );
    } on Object catch (erro, pilha) {
      _relatar(
        erro,
        pilha,
        'ao ler a intenção guardada',
        'envelope ilegível descartado: a pessoa entra na conta e vai para o Início',
      );
      await descartar();
      return (intencao: null, expirou: false);
    }

    if (intencao.expiradaEm(_agora())) {
      await descartar();
      return (intencao: null, expirou: true);
    }
    if (_rotaDaTela(intencao.telaDeRetorno) == null) {
      await descartar();
      return (intencao: null, expirou: false);
    }
    return (intencao: intencao, expirou: false);
  }

  /// Apaga o envelope. Chamado ao executar, ao expirar e ao sair da conta
  /// (regra 7).
  Future<void> descartar() => _deposito.apagar();

  /// O que acontece depois do login bem-sucedido.
  Future<DestinoPosLogin> executarDepoisDoLogin() async {
    final lida = await _ler();
    final intencao = lida.intencao;
    if (intencao == null) {
      return DestinoDeInicio(porqueExpirou: lida.expirou);
    }

    final executavel = _acoes[intencao.acao];
    final rotaDeRetorno = executavel?.rotaDeRetorno?.call(intencao) ??
        _rotaDaTela(intencao.telaDeRetorno)!;

    if (executavel == null) {
      return DestinoDeRetorno(
        rota: rotaDeRetorno,
        telaDeRetorno: intencao.telaDeRetorno,
        extra: null,
      );
    }

    try {
      final resultado = await executavel.executar(intencao);
      await descartar();
      final localizacao = intencao.rascunho.localizacao;
      return DestinoDeResultado(
        rota: resultado.rota,
        extra: resultado.extra,
        localizacaoDesatualizada:
            localizacao != null && localizacao.desatualizadaEm(_agora()),
      );
    } on FalhaDeChamada catch (falha) {
      return DestinoDeRetorno(
        rota: rotaDeRetorno,
        telaDeRetorno: intencao.telaDeRetorno,
        extra: executavel.retomar(intencao, MensagensDeErro.de(falha)),
        erro: MensagensDeErro.de(falha),
      );
    } on Object catch (erro, pilha) {
      _relatar(
        erro,
        pilha,
        'ao executar a intenção guardada depois do login',
        'o executor de `${intencao.acao.name}` estourou fora de FalhaDeChamada; '
            'a pessoa voltou para `${intencao.telaDeRetorno}` com o rascunho e sem mensagem',
      );
      return DestinoDeRetorno(
        rota: rotaDeRetorno,
        telaDeRetorno: intencao.telaDeRetorno,
        extra: executavel.retomar(intencao, null),
      );
    }
  }
}
