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

import 'package:flutter_test/flutter_test.dart';


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
  // AS ISCAS 2 E 3 SAIRAM DAQUI EM 29/10/2026
  //
  // Elas dirigiam `Usar minha localizacao` com o APP MONTADO, pela tela do
  // achado (`_chegarAoOnde` ia a `Rotas.registrarAchado`). Por decisao do
  // cliente -- *"remove os botoes e deixa os campos de cep, endereco para o
  // usuario preencher, no mesmo padrao das outras paginas"* -- o achado nao
  // oferece mais captura, entao **nao ha botao nenhum para tocar por aqui**.
  //
  // **E nao ha para onde apontar**: medido em 29/10/2026, nenhuma tela de
  // producao oferece a captura. F3.1 -- o segundo ponto de uso que o criterio
  // 1 da BICHUS-23 nomeia -- nunca adotou `CapturaDeLocalizacao`:
  // `telas/perdido/tela_onde_e_quando.dart` nao cita a peca nem a porta.
  // Reescrever estes casos contra outra tela seria inventar uma tela.
  //
  // ONDE CADA AFIRMACAO VIVE AGORA, e nenhuma foi perdida:
  //
  // - *`negada` ainda abre o dialogo* -> `captura_de_localizacao_test.dart`,
  //   caso ```negada` (e nao `naoPedida`) ainda abre o dialogo do
  //   sistema``. Era a UNICA das tres que nao estava coberta la, e foi movida
  //   junto com o motivo;
  // - *`negadaPermanentemente` NAO pede de novo* -> ja estava coberta, em
  //   `a recusa DEFINITIVA manda para os ajustes, e nao repete o dialogo`;
  // - *`Tentar de novo` tem acao e tenta* -> ja estava coberta, em
  //   ```Tentar de novo` mede de novo``.
  //
  // A ISCA 1 acima FICA: ela le a escolha de `app.dart` e nao monta tela
  // nenhuma, entao a decisao do cliente nao a toca.
}
