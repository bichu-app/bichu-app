// UMA AUTORIZACAO VALE PARA TODAS AS SECOES -- cliente, 22/10/2026.
//
// Palavra por palavra: *"quando o usuario autorizar a localizacao, em qualquer
// uma das paginas, voce deve utilizar ela para todas as secoes, e nao ficar
// perguntando na secao pets, depois rede, isso tem que ser default depois que
// ele liberou"*. E, sobre onde guardar: *"parece que a localizacao esta se
// perdendo, o usuario libera, mas em cada pagina solicita novamente, ele deve
// manter a localizacao na sessao"*.
//
// ---------------------------------------------------------------------------
// QUAL DAS DUAS CAUSAS ERA -- MEDIDO EM 22/10/2026, ANTES DE UMA LINHA
// ---------------------------------------------------------------------------
//
// Havia duas hipoteses com consertos diferentes:
//
//   (a) a permissao do SISTEMA esta concedida e cada secao pergunta de novo --
//       o app nao lembra nem compartilha o estado;
//   (b) cada secao pede a permissao do SISTEMA outra vez -- o sistema devolve
//       "concedida" sem dialogo e o que a pessoa ve e a caixa do proprio app.
//
// A medicao, com UMA porta e a permissao `concedida`, andando `Rede` ->
// `Pets`: **duas** chamadas a `cidadeAproximada` (uma por secao) e `pedir()`
// em **zero**. Mais: a resolucao da `Rede` devolvia `Sao Paulo`, os `Pets`
// tentavam de novo do zero, e quando a segunda tentativa falhava -- geocoder
// sem cota, GPS sem fix dentro de predio -- os `Pets` mostravam
// `Usar minha localizacao` **com a cidade do aparelho ja conhecida uma aba
// antes**.
//
// Era a **(a)**, entao, e com uma precisao a mais: o dialogo do sistema nunca
// reabriu em secao nenhuma (nenhuma delas chama `pedir()` ao abrir -- so o
// toque chama). O que "se perdia" era o RESULTADO, guardado dentro de cada
// secao. O caso `MEDICAO` abaixo e essa medicao, virada em cobranca.
//
// O conserto, portanto, e "um lugar so que guarda e responde":
// `app/lib/sessao/localizacao_da_sessao.dart`.
//
// ---------------------------------------------------------------------------
// `TEM CIDADE` NAO E `AUTORIZOU LOCALIZACAO`
// ---------------------------------------------------------------------------
//
// `CidadeEscolhida` persiste **qualquer** cidade pesquisada, em arquivo,
// inclusive a de quem nunca viu um dialogo de permissao. Se as duas coisas
// fossem guardadas no mesmo campo, o app pararia de oferecer a localizacao a
// quem **nunca** liberou -- e o caso verde nao acusaria, porque ele mede quem
// JA liberou.
//
// **Por isso o CONTROLE POSITIVO deste arquivo nao e opcional**: ele mede que
// quem nao autorizou CONTINUA sendo perguntado. Sem ele, desligar a pergunta
// para todo mundo deixaria o primeiro grupo inteiro verde.
//
// ---------------------------------------------------------------------------
// DESLIGAR PARA VER REPROVAR -- medido, com o nome do caso
// ---------------------------------------------------------------------------
//
//  1. Em `lib/sessao/localizacao_da_sessao.dart`, em `cidade`, apague o ramo
//     `if (guardada != null) { ... }` (a secao seguinte volta a resolver do
//     zero).
//     -> reprova `autorizada numa secao, a outra NAO pergunta de novo` e
//        `MEDICAO -- andar entre secoes resolve UMA vez`.
//     -> **NAO reprova** o controle positivo, e essa assimetria e o ponto.
//  2. No mesmo arquivo, apague o ramo `if (emVoo != null) return emVoo;`.
//     -> reprova `MEDICAO -- andar entre secoes resolve UMA vez` quando duas
//        secoes montam no mesmo quadro; o caso da troca de aba continua verde,
//        porque ali a primeira resolucao ja terminou.
//  3. Em `lib/telas/perdido/lista_de_perdidos.dart`, troque
//     `await sessao.cidade(forcar: porToque)` por
//     `await sessao.cidade(forcar: true)`.
//     -> reprova `autorizada numa secao, a outra NAO pergunta de novo`: a
//        abertura dos `Pets` volta a medir do zero e volta a oferecer a caixa.
//  4. **O CONTROLE POSITIVO E CONTROLE, e o que ele derruba e o conserto
//     preguicoso**: em `lib/widgets/cidade_por_localizacao.dart`, troque a
//     primeira linha de `CaixaDeLocalizacao.build` por
//     `return const SizedBox.shrink();`, e em
//     `lib/telas/perdido/lista_de_perdidos.dart` troque
//     `_podeOferecerLocalizacao` por `=> false`.
//     -> reprova SO `CONTROLE POSITIVO -- quem NAO autorizou continua sendo
//        perguntado`.
//     -> os dois casos de cima **continuam verdes**, porque eles afirmam
//        `findsNothing`. E essa assimetria que mostra que eles nao passaram
//        por alguem ter desligado a pergunta para todo mundo.

import 'package:bichu/dispositivo/localizacao.dart';
import 'package:bichu/widgets/cidade_por_localizacao.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../telas/ajuda_de_tela.dart';
import 'fixtures_da_rede.dart';
import 'localizacao_nas_abas_da_rede_test.dart' show redeComDuasCidades;

/// A porta que resolve a cidade na PRIMEIRA vez e falha nas seguintes.
///
/// **E o aparelho de verdade, e nao um dublê pessimista.** Cada secao refazia
/// um fix de GPS proprio; o segundo falha dentro de predio, em garagem, e
/// falha tambem quando o teto de uso do geocoder da plataforma estoura (o
/// `IO_ERROR` que vira [MotivoDeNaoTerCidade.falhaDoServico]).
///
/// Com o conserto, a segunda secao **nao chega a pedir** -- e e isso que os
/// casos medem.
class PortaQueSoResolveUmaVez implements Localizacao {
  PortaQueSoResolveUmaVez({this.permissao = PermissaoDeLocalizacao.concedida});

  final PermissaoDeLocalizacao permissao;

  /// Quantas vezes o APARELHO foi consultado para resolver a cidade.
  int resolveu = 0;

  /// Quantas vezes o dialogo do SISTEMA foi aberto. **Zero e o esperado em
  /// toda abertura de secao**: so o toque pede.
  int pediu = 0;

  @override
  Future<PermissaoDeLocalizacao> estado() async => permissao;

  @override
  Future<PermissaoDeLocalizacao> pedir() async {
    pediu += 1;
    return permissao;
  }

  @override
  Future<void> abrirAjustesDoSistema() async {}

  @override
  Future<bool> servicoLigado() async => true;

  @override
  Future<ResultadoDaCaptura> pontoAproximado({required Duration prazo}) async {
    if (permissao != PermissaoDeLocalizacao.concedida) {
      return const CapturaSemPonto(MotivoDeNaoTerPonto.permissaoNegada);
    }
    return const CapturaComPonto(
      PontoCapturado(
        lat: -23.5505,
        lon: -46.6333,
        precisaoEmMetros: 240,
        origem: OrigemDoPonto.deviceGps,
      ),
    );
  }

  @override
  Future<ResultadoDaCidade> cidadeAproximada({required Duration prazo}) async {
    resolveu += 1;
    if (permissao != PermissaoDeLocalizacao.concedida) {
      return const CidadeNaoResolvida(MotivoDeNaoTerCidade.permissaoNegada);
    }
    if (resolveu == 1) return CidadeResolvida('Sao Paulo');
    return const CidadeNaoResolvida(MotivoDeNaoTerCidade.falhaDoServico);
  }
}

/// O botao `Usar minha localizacao`, em QUALQUER secao.
///
/// **O rotulo e o mesmo nas tres** (`CaixaDeLocalizacao.rotuloDeUsarLocalizacao`
/// e `ListaDePerdidos.rotuloDeUsarLocalizacao` carregam o mesmo texto), e e
/// justamente por isso que a pessoa le as duas aparicoes como "ele perguntou
/// de novo". Um finder por tipo de widget mediria menos: o que importa e a
/// PERGUNTA estar na tela, venha da caixa compartilhada ou da linha dos pets.
Finder aPergunta() => find.widgetWithText(
      TextButton,
      CaixaDeLocalizacao.rotuloDeUsarLocalizacao,
    );

void main() {
  group('uma autorizacao vale para todas as secoes', () {
    testWidgets(
      'MEDICAO -- andar entre secoes resolve UMA vez, e o dialogo do sistema '
      'nao reabre',
      (tester) async {
        final porta = PortaQueSoResolveUmaVez();
        await abrirOApp(
          tester,
          rede: redeComDuasCidades().call,
          localizacao: porta,
          deposito: depositoLogado(regiaoDeReferencia: regiaoDeTeste),
        );

        await tester.tap(find.widgetWithText(NavigationDestination, 'Pets'));
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(NavigationDestination, 'Pets'));
        await tester.pumpAndSettle();

        expect(
          porta.resolveu,
          1,
          reason:
              'REPROVA: o aparelho foi consultado ${porta.resolveu} vezes para '
              'descobrir a MESMA cidade. Cada secao esta refazendo a descoberta '
              'e guardando o resultado em si mesma -- e a que falhar volta a '
              'perguntar a quem ja autorizou. Era a medicao de 22/10/2026 '
              '(duas secoes, duas resolucoes).',
        );
        expect(
          porta.pediu,
          0,
          reason:
              'REPROVA: abrir uma secao abriu o dialogo do SISTEMA '
              '(${porta.pediu}x). Pedir permissao e ato da pessoa, nunca efeito '
              'colateral de trocar de aba -- e no iOS esse dialogo nao volta.',
        );
      },
    );

    testWidgets(
      'autorizada numa secao, a outra NAO pergunta de novo',
      (tester) async {
        // A `Rede` abre primeiro e resolve `Sao Paulo`. A SEGUNDA tentativa
        // desta porta falha -- e e por isso que este caso acusa: sem o estado
        // compartilhado, os `Pets` tentam do zero, falham, e perguntam de novo
        // a quem acabou de autorizar.
        final porta = PortaQueSoResolveUmaVez();
        await abrirOApp(
          tester,
          rede: redeComDuasCidades().call,
          localizacao: porta,
          deposito: depositoLogado(regiaoDeReferencia: regiaoDeTeste),
        );

        await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
        await tester.pumpAndSettle();
        expect(
          aPergunta(),
          findsNothing,
          reason:
              'REPROVA: a secao que RESOLVEU a cidade continua perguntando. O '
              'caso seguinte perde o sentido se este nao vale.',
        );

        await tester.tap(find.widgetWithText(NavigationDestination, 'Pets'));
        await tester.pumpAndSettle();
        expect(
          aPergunta(),
          findsNothing,
          reason:
              'REPROVA: a pessoa autorizou a localizacao e a cidade foi '
              'descoberta na `Rede`, e os `Pets` mostram '
              '"${CaixaDeLocalizacao.rotuloDeUsarLocalizacao}" de novo. E o '
              'relato do cliente de 22/10/2026 inteiro: *"em cada pagina '
              'solicita novamente"*. Depois de liberado, a localizacao e '
              'default em TODAS as secoes.',
        );
      },
    );

    testWidgets(
      'CONTROLE POSITIVO -- quem NAO autorizou continua sendo perguntado em '
      'todas as secoes',
      (tester) async {
        // **SEM ESTE CASO O GRUPO ACIMA FICA VERDE COM A PERGUNTA DESLIGADA
        // PARA TODO MUNDO.** Ele e o contrapeso exato: a mesma tela, a mesma
        // navegacao, e a unica coisa que muda e a resposta do sistema.
        //
        // Ele tambem e o que pega a armadilha de ler "tem cidade" como
        // "autorizou": `CidadeEscolhida` persiste qualquer cidade pesquisada, e
        // quem nunca liberou nada pode ter uma guardada.
        final porta = PortaQueSoResolveUmaVez(
          permissao: PermissaoDeLocalizacao.negada,
        );
        await abrirOApp(
          tester,
          rede: redeComDuasCidades().call,
          localizacao: porta,
          deposito: depositoLogado(regiaoDeReferencia: regiaoDeTeste),
        );

        await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
        await tester.pumpAndSettle();
        expect(
          aPergunta(),
          findsWidgets,
          reason:
              'REPROVA: quem NAO autorizou a localizacao deixou de ser '
              'perguntado na `Rede`. O conserto de 22/10 e "nao perguntar a '
              'quem JA liberou", e nao "parar de oferecer a localizacao" -- sem '
              'a pergunta, quem nunca liberou perde o unico caminho que tinha.',
        );

        await tester.tap(find.widgetWithText(NavigationDestination, 'Pets'));
        await tester.pumpAndSettle();
        expect(
          aPergunta(),
          findsWidgets,
          reason:
              'REPROVA: quem NAO autorizou deixou de ser perguntado nos '
              '`Pets`. Ver o motivo no caso da `Rede`, acima.',
        );

        expect(
          porta.pediu,
          0,
          reason:
              'REPROVA: a abertura das secoes abriu o dialogo do sistema para '
              'quem ja havia negado. Pedir de novo sem toque e o caminho que '
              'queima a permissao.',
        );
      },
    );
  });
}
