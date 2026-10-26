// `Usar minha localizacao` — o botao que o cliente reprovou em 17/10/2026.
//
// **ESTES CASOS NAO FORAM RODADOS.** A tarefa que os escreveu proibia rodar
// suite. Escrito e nao executado precisa ser dito, e nao descoberto.
//
// Os tres defeitos que eles travam, todos medidos no emulador contra hml:
//
//   1. **o binario de producao nao tinha localizacao nenhuma.** `main.dart`
//      nunca passou `localizacao:` para `BichuApp`, e o padrao era
//      `LocalizacaoNaoEmbarcada` -- a implementacao que responde `indisponivel`
//      para tudo, sem dialogo e sem leitura. O pacote estava no `pubspec`, a
//      permissao estava no manifesto, e o que faltava era a linha que escolhe;
//   2. **a permissao nunca era PEDIDA no Android.** `checkPermission()`
//      devolve `denied` tanto para "nunca perguntei" quanto para "negou uma
//      vez", e a tela so abria a antessala em `naoPedida` -- um estado que a
//      implementacao de aparelho **nunca produz**. O dialogo do sistema nunca
//      aparecia;
//   3. **negar uma vez era sem volta nesta tela.** A faixa de `permissaoNegada`
//      era o unico motivo recuperavel sem botao de acao.
//
// Os tres sao da mesma familia do defeito da cidade "(opcional)": a tela
// responde alguma coisa, e a coisa que ela responde nao e a verdade.

import 'dart:io';

import 'package:bichu/dispositivo/localizacao.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/localizacao/textos_da_localizacao.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'registrar_achado_test.dart' show avancarParaOPasso2;

Future<http.Response> _soAReferencia(http.Request req) async {
  if (req.url.path.endsWith('/reference-data')) {
    return json200(referenciaDeTeste());
  }
  if (req.url.path == '/v1/pets' && req.method == 'GET') {
    return json200(<String, dynamic>{'items': <dynamic>[]});
  }
  return problema('not-found', 404);
}

/// Uma porta que CONTA os pedidos, e nao so responde.
///
/// O contador e o que enxerga o defeito 2: uma verificacao de texto ficaria
/// verde numa tela que nunca chama `pedir()`, porque a faixa que aparece
/// depois e a mesma.
class _LocalizacaoQueConta implements Localizacao {
  _LocalizacaoQueConta(this.inicial, {this.depoisDePedir, this.ponto});

  PermissaoDeLocalizacao inicial;
  final PermissaoDeLocalizacao? depoisDePedir;
  final PontoCapturado? ponto;

  int vezesQuePediu = 0;
  int vezesQueMediu = 0;

  @override
  Future<PermissaoDeLocalizacao> estado() async => inicial;

  @override
  Future<PermissaoDeLocalizacao> pedir() async {
    vezesQuePediu += 1;
    inicial = depoisDePedir ?? inicial;
    return inicial;
  }

  @override
  Future<void> abrirAjustesDoSistema() async {}

  @override
  Future<bool> servicoLigado() async => true;

  @override
  Future<ResultadoDaCaptura> pontoAproximado({required Duration prazo}) async {
    vezesQueMediu += 1;
    // **O motivo segue o ESTADO, como na porta de verdade.** Este duble
    // devolvia `permissaoNegada` para QUALQUER estado nao concedido, inclusive
    // para `negadaPermanentemente` -- e com isso o caso do contrapeso montava
    // a recusa definitiva e recebia da porta a recusa de uma vez, lia a faixa
    // de `Tentar de novo` e reprovava procurando `Abrir os ajustes`. O defeito
    // era do andaime: a tela estava certa. `MotivoDeNaoTerPonto` tem um valor
    // proprio para a recusa definitiva justamente porque os dois estados levam
    // a saidas diferentes, e o duble da casa
    // (`ajuda_de_tela.dart`, linhas 336-355) ja mapeia os cinco assim.
    if (inicial == PermissaoDeLocalizacao.negadaPermanentemente) {
      return const CapturaSemPonto(
        MotivoDeNaoTerPonto.permissaoNegadaPermanentemente,
      );
    }
    if (inicial == PermissaoDeLocalizacao.indisponivel) {
      return const CapturaSemPonto(MotivoDeNaoTerPonto.indisponivel);
    }
    if (inicial != PermissaoDeLocalizacao.concedida) {
      return const CapturaSemPonto(MotivoDeNaoTerPonto.permissaoNegada);
    }
    final p = ponto;
    if (p == null) {
      return const CapturaSemPonto(MotivoDeNaoTerPonto.semFixNoPrazo);
    }
    return CapturaComPonto(p);
  }

  /// A RESOLUCAO DE CIDADE NAO E ASSUNTO DESTE ARQUIVO, e por isso ela
  /// responde ausencia em vez de um nome.
  ///
  /// `cidadeAproximada` entrou na porta em 19/10/2026 (emenda 1 do ADR-0006) e
  /// obrigou todo dublê a implementa-la. Este arquivo mede o BOTAO de
  /// localizacao de outra tela -- quantas vezes `pedir()` e chamado e qual
  /// faixa aparece --, e nada aqui depende de cidade.
  ///
  /// **Devolver ausencia e deliberado, e nao atalho**: um nome de cidade aqui
  /// seria um valor que nenhum caso deste arquivo le, e que o proximo leitor
  /// tomaria por significativo.
  @override
  Future<ResultadoDaCidade> cidadeAproximada({required Duration prazo}) async =>
      const CidadeNaoResolvida(MotivoDeNaoTerCidade.indisponivel);
}

/// `app/lib/app.dart`, achado subindo a partir do diretorio do teste.
File _fonteDoApp() {
  var dir = Directory.current.absolute;
  while (true) {
    final alvo = File('${dir.path}/app/lib/app.dart');
    if (alvo.existsSync()) return alvo;
    final interno = File('${dir.path}/lib/app.dart');
    if (interno.existsSync()) return interno;
    final pai = dir.parent;
    if (pai.path == dir.path) break;
    dir = pai;
  }
  throw StateError(
    'REPROVA: nao achei `app/lib/app.dart` a partir de '
    '"${Directory.current.path}". Sem ele este portao nao confere nada.',
  );
}

/// Confirma na antessala.
///
/// `.last` e nao `find.text` solto: a antessala reusa o rotulo do botao que a
/// abriu, e os dois ficam na arvore ao mesmo tempo. O da folha modal e o
/// ultimo, e tocar no de baixo nao confirmaria nada.
Future<void> _confirmarNaAntessala(WidgetTester tester) async {
  await tocar(
    tester,
    find.text(TextosDaLocalizacao.usarMinhaLocalizacao).last,
  );
}

Future<void> _chegarAoOnde(WidgetTester tester) async {
  await irPara(tester, Rotas.registrarAchado);
  await rolarAte(tester, find.text('Cachorro'));
  await tocar(tester, find.text('Cachorro'));
  await rolarAte(tester, find.text('Médio'));
  await tocar(tester, find.text('Médio'));
  await avancarParaOPasso2(tester);
}

Future<void> _tocarEmUsarALocalizacao(WidgetTester tester) async {
  final botao = find.text(TextosDaLocalizacao.usarMinhaLocalizacao);
  await rolarAte(tester, botao);
  await tocar(tester, botao);
}

void main() {
  // -------------------------------------------------------------------------
  // ISCA 1 -- o binario de producao tem localizacao de verdade
  //
  // DESLIGAR PARA VER REPROVAR: em `app.dart`, volte o padrao para
  // `const LocalizacaoNaoEmbarcada()`.
  //
  // Esta isca NAO monta tela: ela le a escolha. Montar o app sem passar a
  // porta chamaria `Geolocator.checkPermission()` sem canal de plataforma, que
  // lanca `MissingPluginException` dentro de um `Future` em `setState` -- a
  // falha que nao aponta para a causa.
  // -------------------------------------------------------------------------
  group('ISCA -- a implementacao de producao e a do aparelho', () {
    test('o padrao de `BichuApp.localizacao` nao e a implementacao ausente',
        () {
      // A escolha mora numa linha so (`app.dart`), e e a linha que faltava.
      //
      // **O `const` SAIU DO LITERAL em 19/10/2026, e a medida nao afrouxou.**
      // `LocalizacaoPorGeolocator` deixou de ser constante quando ganhou a
      // memoria da ultima resolucao de cidade -- a grade de ~100 m que a
      // emenda 1 do ADR-0006 exige para nao mandar a coordenada ao servico de
      // plataforma a cada abertura. Objeto com estado nao e `const`, e o
      // compilador recusou antes deste caso: a suite inteira parou de carregar
      // com "Cannot invoke a non-'const' constructor".
      //
      // O que este caso mede continua sendo o MESMO: que o padrao de producao
      // e a implementacao do APARELHO, e nao `LocalizacaoNaoEmbarcada`. O
      // `const` nunca foi o ponto.
      final fonte = _fonteDoApp().readAsStringSync();
      expect(
        fonte.contains('widget.localizacao ?? LocalizacaoPorGeolocator()'),
        isTrue,
        reason: 'REPROVA: `BichuApp` nao escolhe `LocalizacaoPorGeolocator` '
            'quando ninguem passa a porta. `main.dart` nunca passa, entao o '
            'binario inteiro roda com a implementacao ausente: `Usar minha '
            'localizacao` responde `indisponivel` na hora, sem dialogo de '
            'permissao e sem ler o aparelho.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // ISCA 2 -- `negada` ainda PEDE, porque no Android ela e "nunca perguntei"
  //
  // DESLIGAR PARA VER REPROVAR: em `captura_de_localizacao.dart`, tire
  // `|| permissao == PermissaoDeLocalizacao.negada` da condicao da antessala.
  // -------------------------------------------------------------------------
  group('ISCA -- negada uma vez ainda abre o dialogo do sistema', () {
    testWidgets('tocar no botao com `negada` chama `pedir()`', (tester) async {
      final porta = _LocalizacaoQueConta(
        PermissaoDeLocalizacao.negada,
        depoisDePedir: PermissaoDeLocalizacao.concedida,
        ponto: const PontoCapturado(
          lat: -23.5555,
          lon: -46.6888,
          precisaoEmMetros: 300,
          origem: OrigemDoPonto.deviceGps,
        ),
      );
      await abrirOApp(
        tester,
        rede: _soAReferencia,
        deposito: depositoLogado(),
        localizacao: porta,
      );
      await _chegarAoOnde(tester);
      await _tocarEmUsarALocalizacao(tester);
      // A antessala aparece, e e dela que sai o pedido.
      await _confirmarNaAntessala(tester);

      expect(
        porta.vezesQuePediu,
        1,
        reason: 'REPROVA: a tela nao pediu a permissao com o estado `negada`. '
            'No Android `checkPermission()` devolve `denied` para quem NUNCA '
            'viu o dialogo, entao tratar `negada` como "ja respondeu" deixa a '
            'pessoa sem caminho nenhum para conceder.',
      );
    });

    testWidgets('o contrapeso: `negadaPermanentemente` NAO pede de novo',
        (tester) async {
      // Sem este caso, a isca acima ficaria verde numa tela que pede sempre --
      // e pedir onde o dialogo nao reabre gasta o toque da pessoa em nada.
      final porta =
          _LocalizacaoQueConta(PermissaoDeLocalizacao.negadaPermanentemente);
      await abrirOApp(
        tester,
        rede: _soAReferencia,
        deposito: depositoLogado(),
        localizacao: porta,
      );
      await _chegarAoOnde(tester);
      await _tocarEmUsarALocalizacao(tester);

      expect(
        porta.vezesQuePediu,
        0,
        reason: 'REPROVA: a tela pediu a permissao a quem ja negou em '
            'definitivo. O dialogo nao reabre nas duas plataformas, e o '
            'caminho dali sao os ajustes do sistema.',
      );
      // Rola ate a faixa antes de ler, como o caso irmao deste arquivo ja faz
      // com `Tentar de novo`: a faixa do motivo e desenhada abaixo do bloco de
      // localizacao, fora da dobra.
      await rolarAte(tester, find.text(TextosDaLocalizacao.abrirAjustes));
      expect(
        find.text(TextosDaLocalizacao.abrirAjustes),
        findsOneWidget,
        reason: 'REPROVA: a tela nao ofereceu os ajustes, que e o unico '
            'caminho que sobra neste estado.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // ISCA 3 -- negar uma vez tem volta
  //
  // DESLIGAR PARA VER REPROVAR: em `_rotuloDaAcaoDoMotivo`, devolva `null`
  // para `permissaoNegada`.
  // -------------------------------------------------------------------------
  group('ISCA -- `negada desta vez` oferece `Tentar de novo`', () {
    testWidgets('a faixa da permissao negada tem acao', (tester) async {
      final porta = _LocalizacaoQueConta(
        PermissaoDeLocalizacao.negada,
        depoisDePedir: PermissaoDeLocalizacao.negada,
      );
      await abrirOApp(
        tester,
        rede: _soAReferencia,
        deposito: depositoLogado(),
        localizacao: porta,
      );
      await _chegarAoOnde(tester);
      await _tocarEmUsarALocalizacao(tester);
      await _confirmarNaAntessala(tester);

      final tentar = find.text(TextosDaLocalizacao.tentarDeNovo);
      await rolarAte(tester, tentar);
      expect(
        tentar,
        findsOneWidget,
        reason: 'REPROVA: quem tocou em "Não permitir" por engano ficou sem '
            'caminho de volta nesta tela. `permissaoNegada` e o mais '
            'recuperavel dos cinco motivos: o dialogo do sistema ainda abre.',
      );

      final pedidosAntes = porta.vezesQuePediu;
      await tocar(tester, tentar);
      // **A ANTESSALA VOLTA, e e assim de proposito.** `_usarALocalizacao`
      // mostra a antessala quando a permissao e `naoPedida` ou `negada`
      // (`captura_de_localizacao.dart`, linhas 300-313), e `negada` e
      // justamente o estado deste caso: `pedir()` so e chamado DEPOIS de a
      // pessoa confirmar ali. Sem esta linha a isca pedia que o app abrisse o
      // dialogo do sistema sem explicar antes -- o oposto do que a antessala
      // existe para fazer -- e a contagem ficava em um.
      await _confirmarNaAntessala(tester);
      expect(
        porta.vezesQuePediu,
        greaterThan(pedidosAntes),
        reason: 'REPROVA: `Tentar de novo` apareceu e nao tentou nada. Botao '
            'que nao muda nada e pior que nenhum botao.',
      );
    });
  });
}
