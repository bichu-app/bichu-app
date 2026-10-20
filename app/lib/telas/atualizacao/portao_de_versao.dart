import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../api/versao_api.dart';
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
  });

  final VersaoApi versaoApi;

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
    if (versao == null || versao.isEmpty || plataforma == null) return;
    final resposta = await widget.versaoApi.consultar(
      plataforma: plataforma,
      versao: versao,
    );
    // `mounted` porque a resposta pode chegar depois de o widget sair da
    // arvore -- em teste de widget isso e o caso comum, e um `setState` ali
    // reprova o caso com erro do framework em vez do que ele mede.
    if (!mounted) return;
    setState(() => _resposta = resposta);
  }

  @override
  Widget build(BuildContext context) {
    switch (_resposta.veredito) {
      case VereditoDeVersao.bloqueado:
        // O [child] NAO e montado. Ele nao esta escondido atras de nada: ele
        // nao esta na arvore, e nao ha gesto, link nem rota que o alcance.
        return TelaDeBloqueioPorVersao(loja: _resposta.loja);
      case VereditoDeVersao.recomendado:
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
        return widget.child;
    }
  }
}
