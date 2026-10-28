import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../api/sonda_de_conexao.dart';
import '../../api/versao_api.dart';
import '../abertura/tela_sem_conexao.dart';
import 'aviso_de_versao_nova.dart';
import 'tela_de_bloqueio_por_versao.dart';

/// O PORTAO DE VERSAO: o que decide se o aplicativo abre.
///
/// ====================================================================
/// ELE NASCE LIBERADO, E ISSO E A TRAVA MAIS IMPORTANTE DAQUI
/// ====================================================================
///
/// O estado inicial e [VereditoDeVersao.liberado] e o [child] e pintado desde
/// o primeiro quadro. **Nao ha tela de carregando, e nao ha espera.** A
/// consequencia e a que se quer: enquanto a resposta nao chegou -- e se ela
/// nunca chegar --, o aplicativo esta inteiro e usavel.
///
/// A alternativa (bloquear ou mostrar carregando ate saber) faria toda abertura
/// sem rede parar no portao, e seria o mecanismo trancando o produto justamente
/// nos casos em que ele nao deveria opinar. Metro, elevador, aviao e sinal ruim
/// sao operacao normal deste produto.
///
/// Quem garante que a falha libera e [VersaoApi.consultar], que nao lanca e
/// devolve liberado nas cinco formas de falha (sem rede, tempo esgotado, erro
/// do servidor, corpo fora do contrato, campo ausente). Este widget nao tem
/// `catch` nenhum, e isso nao e descuido: dois lugares tratando a mesma falha
/// seriam dois comportamentos para divergirem.
///
/// ====================================================================
/// E DESDE 26/10/2026 ELE TAMBEM E O RECADO DE ABERTURA SEM INTERNET
/// ====================================================================
///
/// O cliente pediu *"uma mensagem de erro, quando o usuario tentar abrir o
/// aplicativo e nao estiver conectado na internet, ao inves de deixar parado
/// na pagina de splashscreen"*.
///
/// **O recado mora aqui e nao numa tela nova de arranque** por tres razoes
/// medidas:
///
/// 1. Este widget ja e o unico que faz uma pergunta ao servidor na abertura, e
///    ja embrulha toda rota. Um segundo portao de abertura seria um segundo
///    lugar decidindo o que a pessoa ve ao abrir o app.
/// 2. Ele nao segura o primeiro quadro, e o recado herda isso: nada aqui
///    espera resposta para pintar. A diferenca em relacao ao antes e que
///    "nao deu para perguntar" deixou de ser **indistinguivel** de "esta
///    versao serve".
/// 3. **O recado TEM SAIDA** (`Usar sem internet`), e isso nao e meia medida:
///    bloquear o app por falta de rede contradiz o paragrafo acima -- metro,
///    elevador e aviao sao operacao normal deste produto, e a fila offline
///    existe para guardar o caso do pet sumido ate o sinal voltar.
///
/// **Os dois sintomas sao a mesma peca**, de proposito: "sem internet" e
/// "servidor fora" tem a mesma cara para quem abriu o app, e `SondaDeConexao`
/// os junta num veredito so.
///
/// ====================================================================
/// POR QUE ELE MORA ACIMA DO ROTEADOR
/// ====================================================================
///
/// Ele entra no `builder` de `MaterialApp.router`, entao ele embrulha TODA rota
/// -- inclusive as que um link externo abre com o app fechado (App Links). Um
/// bloqueio instalado como ROTA seria contornavel: bastaria um deep link
/// apontar para outra rota. Acima do roteador nao ha rota a que escapar.
///
/// ====================================================================
/// A PLATAFORMA SAI DE `defaultTargetPlatform`, E NAO DE `dart:io`
/// ====================================================================
///
/// `Platform.isAndroid` exigiria `dart:io`, que o portao estrutural de
/// `porta_nao_contornada_test.dart` proibe em tela -- e, pior, nao e trocavel
/// em teste de widget. `defaultTargetPlatform` e do framework, e o teste o
/// troca com `debugDefaultTargetPlatformOverride`.
///
/// Plataforma que nao e Android nem iOS nao pergunta nada: nao ha politica para
/// ela, e inventar uma cadeia como `"linux"` receberia 400 do `enum` do
/// contrato -- o que liberaria igual, mas gastando uma requisicao para
/// descobrir o que ja se sabe aqui.
class PortaoDeVersao extends StatefulWidget {
  const PortaoDeVersao({
    required this.versaoApi,
    required this.versaoDoApp,
    required this.child,
    super.key,
    this.sonda,
  });

  final VersaoApi versaoApi;

  /// A SONDA DE CONECTIVIDADE (cliente, 26/10/2026).
  ///
  /// **Ela existe porque a pergunta de versao nao cobre todo build.** Sem
  /// `APP_VERSION` a pergunta de versao nem sai (medido, e e o estado do build
  /// de iOS), e com ela fora do ar nao havia de onde tirar o veredito de
  /// conexao. Esta porta e a pergunta propria: `GET /health`, que nao depende
  /// de `--dart-define` nenhum.
  ///
  /// **Ela so e usada quando a pergunta de versao NAO SAIU.** Com
  /// `APP_VERSION` no build, a abertura continua custando UMA requisicao: o
  /// veredito de conexao vem de `RespostaDeVersao.servidorRespondeu`.
  ///
  /// Nula, o recado de abertura sem internet so aparece quando a pergunta de
  /// versao saiu e falhou. **Em producao ela nunca e nula** -- `app.dart`
  /// passa `SondaDeConexao(_api)` --, e o nulo existe para os casos de widget
  /// deste diretorio, que montam o portao para medir versao e nao
  /// conectividade.
  final SondaDeConexao? sonda;

  /// A versao deste binario (`AppConfig.versaoDoApp`). **Nula quando o build
  /// nao declarou `APP_VERSION`**, e ai o portao nao pergunta e nao bloqueia.
  final String? versaoDoApp;

  final Widget child;

  /// O nome da plataforma como o contrato o enumera, ou nulo.
  ///
  /// Estatico e visivel para o teste cobrar a tabela sem montar widget.
  @visibleForTesting
  static String? plataformaDo(TargetPlatform plataforma) => switch (plataforma) {
        TargetPlatform.android => 'android',
        TargetPlatform.iOS => 'ios',
        _ => null,
      };

  @override
  State<PortaoDeVersao> createState() => _PortaoDeVersaoState();
}

class _PortaoDeVersaoState extends State<PortaoDeVersao> {
  /// Liberado desde o primeiro quadro. Ver o cabecalho.
  RespostaDeVersao _resposta = const RespostaDeVersao.liberado();

  /// O aviso brando foi dispensado nesta sessao. Nao vai para disco (ver
  /// `aviso_de_versao_nova.dart`).
  bool _avisoDispensado = false;

  /// A ABERTURA NAO ALCANCOU O SERVIDOR (cliente, 26/10/2026).
  ///
  /// **Nasce `false` e nao `null`, e isso e a mesma trava do veredito.** O
  /// estado inicial e "nada a dizer": o [child] e pintado desde o primeiro
  /// quadro, sem tela de carregando e sem espera. Nenhum recado aparece
  /// enquanto a resposta nao chegou, e se ela nunca chegar o que aparece e o
  /// recado -- nunca uma tela parada.
  bool _semConexao = false;

  /// A pessoa escolheu seguir sem internet. Nao vai para disco: a proxima
  /// abertura e uma pergunta nova.
  bool _semConexaoDispensado = false;

  @override
  void initState() {
    super.initState();
    // `initState` e nao `build`: perguntar no `build` repetiria a chamada a
    // cada repintura, e a repintura acontece por motivo nenhum relacionado a
    // versao (teclado, rotacao, tema do sistema).
    _perguntar();
  }

  Future<void> _perguntar() async {
    final versao = widget.versaoDoApp;
    final plataforma = PortaoDeVersao.plataformaDo(defaultTargetPlatform);
    if (versao == null || versao.isEmpty || plataforma == null) {
      // A PERGUNTA DE VERSAO NAO SAI -- e a de CONEXAO tem de sair.
      //
      // Este ramo era um `return` seco, e era por ele que o pedido do cliente
      // morreria calado: sem `APP_VERSION` (o build de iOS) nenhuma requisicao
      // saia da abertura, entao nenhuma falha de rede era observavel e nenhum
      // recado podia aparecer. A sonda nao depende de `--dart-define` nenhum.
      await _sondar();
      return;
    }
    final resposta = await widget.versaoApi.consultar(
      plataforma: plataforma,
      versao: versao,
    );
    // `mounted` porque a resposta pode chegar depois de o widget sair da
    // arvore -- em teste de widget isso e o caso comum, e um `setState` ali
    // reprova o caso com erro do framework em vez do que ele mede.
    if (!mounted) return;
    setState(() {
      _resposta = resposta;
      // **UMA requisicao, nao duas.** A pergunta de versao ja foi ao servidor;
      // o que ela descobriu sobre a rede vale, e sondar de novo gastaria uma
      // chamada para saber o que acabou de ser medido.
      _semConexao = !resposta.servidorRespondeu;
    });
  }

  /// Pergunta ao servidor se ele esta ai. Ver [PortaoDeVersao.sonda].
  Future<void> _sondar() async {
    final sonda = widget.sonda;
    if (sonda == null) return;
    final respondeu = await sonda.servidorRespondeu();
    if (!mounted) return;
    setState(() => _semConexao = !respondeu);
  }

  /// `Tentar de novo`: refaz a pergunta inteira, do jeito que o arranque fez.
  ///
  /// **Limpa `_semConexao` ANTES de perguntar**, e nao depois: sem isto o
  /// recado ficaria em pe durante os ate 20 s do prazo do `ApiClient`, com o
  /// botao parecendo nao ter funcionado. O [child] volta na hora, e o recado
  /// so retorna se a pergunta falhar de novo.
  void _tentarDeNovo() {
    setState(() => _semConexao = false);
    unawaited(_perguntar());
  }

  @override
  Widget build(BuildContext context) {
    switch (_resposta.veredito) {
      case VereditoDeVersao.bloqueado:
        // O [child] NAO e montado. Ele nao esta escondido atras de nada: ele
        // nao esta na arvore, e nao ha gesto, link nem rota que o alcance.
        //
        // **O bloqueio vence o recado de conexao**, e a ordem nao e arbitraria:
        // chegar aqui exige um 200 com `update_required`, ou seja houve
        // servidor -- os dois estados nao coexistem de verdade, e se
        // coexistissem o que fecha o app manda.
        return TelaDeBloqueioPorVersao(loja: _resposta.loja);
      case VereditoDeVersao.recomendado:
        if (_semRede()) return _recadoSemConexao();
        if (_avisoDispensado) return widget.child;
        return Column(
          children: <Widget>[
            AvisoDeVersaoNova(
              loja: _resposta.loja,
              aoDispensar: () => setState(() => _avisoDispensado = true),
            ),
            // O aplicativo continua inteiro embaixo da faixa, e e isso que
            // distingue o aviso do bloqueio.
            Expanded(child: widget.child),
          ],
        );
      case VereditoDeVersao.liberado:
        if (_semRede()) return _recadoSemConexao();
        return widget.child;
    }
  }

  /// Ha recado de conexao a dar agora?
  bool _semRede() => _semConexao && !_semConexaoDispensado;

  /// O recado do pedido de 26/10/2026, com as duas saidas.
  Widget _recadoSemConexao() {
    return TelaDeAberturaSemConexao(
      aoTentarDeNovo: _tentarDeNovo,
      aoSeguirSemInternet: () =>
          setState(() => _semConexaoDispensado = true),
    );
  }
}
