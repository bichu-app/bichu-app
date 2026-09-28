/// A guarda de ação: a intenção sobrevive ao login e é **executada** (UX 8.3).
///
/// Esta classe é a diferença entre o produto que a pesquisa descreve e a
/// meia-entrega que ela nomeia. As duas se parecem no diff:
///
/// - A meia-entrega leva a pessoa de volta ao formulário preenchido e pede que
///   ela toque no botão de novo. Parece que funcionou, e o teste de navegação
///   passa.
/// - O que 8.3 exige (regra 3) é que a ação **aconteça** e que a pessoa chegue
///   na tela de **resultado**. Camila tocou em `Registrar achado` antes do
///   login; ela não toca de novo depois dele.
///
/// E o destino nunca é a home (regra 4). Home é o destino de um caso só: o da
/// intenção que expirou, e nesse caso não existe mais intenção nenhuma.
library;

import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../api/falhas.dart';
import '../api/mensagens_de_erro.dart';
import 'deposito_de_intencao.dart';
import 'intencao_pendente.dart';

/// Traduz um ID de tela da pesquisa (`F1.5`) no endereço do app (`/pets/...`).
///
/// Injetado em vez de importado para que o teste da guarda não precise do
/// roteador inteiro — e, com ele, das telas e do tema.
typedef RotaDeTelaDeUx = String? Function(String telaDeUx);

/// Para onde a execução bem-sucedida levou.
class ResultadoDaExecucao {
  const ResultadoDaExecucao({required this.rota, this.extra});

  /// A tela de **resultado**: o achado registrado, o caso aberto, o pet
  /// cadastrado. Nunca o formulário de onde a pessoa veio.
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
  /// (regra 4). Sem isto, "voltar para a tela de retorno" devolveria um
  /// formulário em branco, que é perder o rascunho pelo outro caminho.
  final Object? Function(IntencaoPendente intencao, MensagemDeErro? erro)
      retomar;

  /// A rota da tela de retorno quando ela depende do ALVO, e nao so do ID de
  /// tela. Nulo usa `rotaDaTela(telaDeRetorno)`, como ate aqui. O encontro da
  /// `Rede` precisa disto: a volta de um pedido que falhou e o proprio
  /// encontro (`/rede/encontros/<slug>`), e o `slug` esta no `alvo`.
  final String? Function(IntencaoPendente intencao)? rotaDeRetorno;
}

/// Para onde a pessoa vai depois de entrar na conta.
sealed class DestinoPosLogin {
  const DestinoPosLogin();
}

/// O Início. **Só dois casos chegam aqui**: não havia intenção nenhuma, ou a
/// intenção expirou (regra 2). Qualquer outro caminho que termine aqui é o
/// defeito que 8.3 chama de "nunca a home".
class DestinoDeInicio extends DestinoPosLogin {
  const DestinoDeInicio({required this.porqueExpirou});

  /// Verdadeiro quando havia uma intenção e ela passou das 24 horas. Guardado
  /// porque quem chama pode querer distinguir, e porque o teste distingue.
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
  /// (regra 6). A tela de resultado é quem pergunta se ainda vale — a guarda
  /// só sabe dizer que a pergunta precisa acontecer.
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
    // O relogio entra pela porta: as duas regras de tempo de 8.3 (24 horas de
    // validade e 30 minutos de localizacao) so sao verificaveis se o teste
    // puder dizer que horas sao. Com `DateTime.now` cravado, o caso "intencao
    // de ontem nao executa" exigiria esperar um dia.
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

  /// Manda o defeito para o canal que a observabilidade escuta (Sentry,
  /// ADR-0008), que é o mesmo caminho do `registrarSaidaNoCanalPadrao` da
  /// sessão.
  ///
  /// **Sem rascunho e sem conteúdo de envelope.** O que a pessoa digitou está
  /// dentro da intenção, e isto sai do aparelho: o relato leva a ação e a tela
  /// de retorno, que dizem qual executor quebrou, e nada que identifique
  /// alguém.
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
  ///
  /// Não há pilha de intenções de propósito: duas intenções guardadas produzem
  /// um encadeamento que ninguém entende ao voltar — a pessoa entra na conta
  /// para marcar o pet como perdido e o app executa, antes disso, um "gerar
  /// tag" que ela começou de manhã e desistiu.
  Future<void> guardar(IntencaoPendente intencao) async {
    await _deposito.gravar(jsonEncode(intencao.paraJson()));
  }

  /// O envelope guardado, ou nulo.
  ///
  /// **Descarta em silêncio** (regra 2 e regra 7) o que não serve: o expirado,
  /// o ilegível e o que aponta para uma tela que este build não conhece — que
  /// é o envelope gravado antes de uma atualização do app. Em nenhum desses
  /// casos a pessoa vê mensagem: ela pediu para entrar na conta, e é isso que
  /// tem de acontecer.
  Future<IntencaoPendente?> pendente() async => (await _ler()).intencao;

  /// A leitura, com o motivo de ter dado em nada.
  ///
  /// O motivo importa porque "não havia intenção" e "a intenção expirou" levam
  /// ao mesmo lugar (o Início) por razões diferentes, e quem chama -- e o
  /// teste -- precisa poder distinguir.
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
      // Arquivo corrompido, ação de outra versão do app, data ilegível.
      // Apagar e seguir: um envelope ruim não pode impedir alguém de entrar.
      //
      // **O comportamento está certo; o que faltava era o registro**
      // (BICHUS-201, defeito 3). Descartar calado transforma corrupção
      // recorrente em "às vezes a intenção some", que é a forma de defeito que
      // ninguém consegue investigar porque ninguém consegue contar.
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
      // Envelope gravado por uma versão do app que tinha uma tela que esta não
      // tem. Não há para onde voltar, e inventar um destino seria pior.
      await descartar();
      return (intencao: null, expirou: false);
    }
    return (intencao: intencao, expirou: false);
  }

  /// Apaga o envelope. Chamado ao executar, ao expirar e ao sair da conta
  /// (regra 7).
  Future<void> descartar() => _deposito.apagar();

  /// O que acontece depois do login bem-sucedido.
  ///
  /// Executa a ação guardada e devolve o destino. A navegação é de quem
  /// chama: esta classe não conhece `BuildContext`, e por isso o caso inteiro
  /// é testável sem montar tela nenhuma.
  Future<DestinoPosLogin> executarDepoisDoLogin() async {
    final lida = await _ler();
    final intencao = lida.intencao;
    if (intencao == null) {
      // Ou não havia intenção, ou ela expirou e a leitura já a descartou em
      // silêncio. Este é o **único** caminho para o Início.
      return DestinoDeInicio(porqueExpirou: lida.expirou);
    }

    // Já validado por `pendente`.
    final executavel = _acoes[intencao.acao];
    final rotaDeRetorno = executavel?.rotaDeRetorno?.call(intencao) ??
        _rotaDaTela(intencao.telaDeRetorno)!;

    if (executavel == null) {
      // Defeito de programação: alguma tela guardou uma intenção cuja ação
      // ninguém registrou. Não é a home (regra 4) e não é um texto inventado:
      // a pessoa volta para onde estava, com o rascunho.
      // Sem `assert` de propósito: um `assert(false)` aqui derrubaria o app em
      // depuração e, pior, tornaria este caminho intestável — e ele é
      // justamente o que segura a regra 4 enquanto as outras cinco ações de
      // 8.3 não têm executor. O caso tem teste.
      return DestinoDeRetorno(
        rota: rotaDeRetorno,
        telaDeRetorno: intencao.telaDeRetorno,
        extra: null,
      );
    }

    try {
      final resultado = await executavel.executar(intencao);
      // Executou: o envelope morre aqui (regra 7). Mantê-lo faria a ação
      // acontecer de novo no próximo login dentro das 24 horas — dois casos
      // do mesmo pet perdido, e o segundo ninguém pediu.
      await descartar();
      final localizacao = intencao.rascunho.localizacao;
      return DestinoDeResultado(
        rota: resultado.rota,
        extra: resultado.extra,
        localizacaoDesatualizada:
            localizacao != null && localizacao.desatualizadaEm(_agora()),
      );
    } on FalhaDeChamada catch (falha) {
      // **O envelope FICA.** A regra 7 apaga "ao executar", e aqui não houve
      // execução: o servidor recusou ou não respondeu. Se ele fosse apagado, o
      // rascunho passaria a existir só na memória da tela de retorno — e o
      // sistema encerrando o app nessa tela levaria embora tudo o que a pessoa
      // digitou, que é o defeito que este arquivo inteiro existe para evitar.
      return DestinoDeRetorno(
        rota: rotaDeRetorno,
        telaDeRetorno: intencao.telaDeRetorno,
        extra: executavel.retomar(intencao, MensagensDeErro.de(falha)),
        erro: MensagensDeErro.de(falha),
      );
    } on Object catch (erro, pilha) {
      // Defeito nosso: o executor estourou por algo que não é falha de
      // chamada — um envelope incompleto, um campo que mudou de tipo entre
      // versões do app. **Não pode terminar aqui**: sem este ramo, a exceção
      // sobe pela tela de entrar e a pessoa fica parada numa tela de login
      // depois de ter entrado, sem mensagem e sem caminho.
      //
      // Vai sem texto de tela porque não existe texto especificado para "o
      // app errou ao executar sua ação", e inventar microcopy é pior que
      // ficar calado: a tela de retorno abre com o rascunho carregado e a
      // pessoa toca no botão de novo.
      //
      // **Calado para a pessoa, não para nós** (BICHUS-201, defeito 2). O
      // comentário acima diz "defeito nosso" desde que foi escrito, e mesmo
      // assim o ramo não deixava rastro nenhum em produção: um defeito que o
      // autor sabia existir e que ninguém conseguia ver acontecer. O `acao`
      // vai junto porque sem ele o relato diz que algo quebrou e não diz o
      // quê — e é a intenção que identifica o executor culpado.
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
