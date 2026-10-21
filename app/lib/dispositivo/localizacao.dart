/// A fronteira entre o app e o servico de localizacao do aparelho.
///
/// **Por que uma porta, e nao uma chamada direta ao plugin.** Pelo mesmo
/// motivo de `camera_e_galeria.dart` e de `avisos.dart`: permissao e dialogo,
/// e nao configuracao. A diferenca desta porta para as outras duas esta no que
/// ela precisa separar, e sao DUAS coisas que costumam ser confundidas numa so:
///
/// - **permissao** e o que a pessoa respondeu ao dialogo do sistema;
/// - **servico ligado** e se o aparelho tem a localizacao ligada nos ajustes.
///
/// As duas sao independentes e as duas falham sozinhas. Permissao concedida
/// com o servico desligado devolve posicao nenhuma, e a tela que trata isso
/// como "negou" manda a pessoa para a tela de permissao que ela ja concedeu.
/// Por isso [Localizacao.servicoLigado] existe separado de
/// [Localizacao.estado].
///
/// **A terceira falha nao e nenhuma das duas: o GPS nao fixa.** Permissao
/// concedida, servico ligado, e mesmo assim a posicao nao chega -- dentro de
/// predio, em garagem, no primeiro uso depois de o aparelho ligar. Isso nao e
/// erro e nao e recusa: e demora sem prazo. Uma captura sem prazo maximo
/// deixaria a tela girando para sempre, e o "ponto de uso" da BICHUS-23 vira
/// um fluxo que nao termina. Por isso [Localizacao.pontoAproximado] recebe um
/// [Duration] e desiste, com motivo.
///
/// ## Esta porta converte num sentido so, e o outro segue proibido
///
/// ADR-0006, emenda 1 de 19/10/2026 (decisao do cliente: *"autorizar o gps, e
/// trazer algum valor padrao em caso de fallback"*):
///
/// - **coordenada -> nome de cidade: AUTORIZADO.** E o que
///   [Localizacao.cidadeAproximada] faz, pelo servico de plataforma, e e o
///   unico metodo de conversao desta porta.
/// - **endereco -> coordenada: PROIBIDO, e continua.** CEP e bairro seguem
///   sendo rotulo de exibicao e filtro de listagem, nunca fonte de coordenada.
///   Esta porta **nao tem** metodo que faca isso, e nao pode passar a ter sem
///   nova decisao.
///
/// A garantia mudou de FORMA, e isso precisa estar dito: ela era a ausencia do
/// pacote no binario e passou a ser **assercao sobre o uso**. O pacote
/// `geocoding` traz os dois sentidos no mesmo arquivo
/// (`placemarkFromCoordinates` e `locationFromAddress`), e nao da para
/// importar meio pacote. Quem cobra a diferenca e
/// `app/test/dispositivo/sem_geocodificacao_test.dart`, que foi ESTREITADO e
/// nao removido: ele permite `placemarkFromCoordinates` por nome, e reprova
/// `locationFromAddress` em qualquer importe, chamada ou porta.
///
/// **E A COORDENADA SAI DO APARELHO PARA RESOLVER A CIDADE.** Apple no iOS,
/// Google no Android, com teto de uso e indisponibilidade por pais. O
/// `pubspec.yaml` tem o paragrafo inteiro, com o que o cliente aceitou em
/// troca. Nao existe resolucao local: quem achar que existe vai desenhar uma
/// tela que promete offline o que nao e.
library;

import 'dart:async';

import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform;
import 'package:flutter/services.dart' show PlatformException;
import 'package:geocoding/geocoding.dart';
import 'package:geolocator/geolocator.dart';

/// Os tres estados de permissao, mais o quarto que nao e permissao.
///
/// Mesma forma do `EstadoDaPermissao` da camera, e de proposito: quem ja leu
/// aquela porta le esta sem reaprender nada. Nao e o MESMO enum porque juntar
/// os dois obrigaria cada tela a tratar um valor que nao existe no caso dela,
/// que e o argumento que `avisos.dart` ja registrou.
enum PermissaoDeLocalizacao {
  /// O dialogo do sistema ainda nao foi mostrado. Pedir abre o dialogo.
  naoPedida,

  /// A pessoa autorizou. O caminho principal roda.
  concedida,

  /// A pessoa recusou **desta vez**. Pedir de novo ainda abre o dialogo.
  negada,

  /// A pessoa recusou de forma permanente, ou o sistema bloqueou. Pedir de
  /// novo **nao abre dialogo nenhum**: o unico caminho e os ajustes do
  /// sistema, e a tela precisa dizer isso em vez de repetir o pedido.
  negadaPermanentemente,

  /// Este build ou esta plataforma nao tem localizacao.
  ///
  /// Nao e recusa: e ausencia. Tratar isto como recusa mandaria a pessoa para
  /// os ajustes procurar uma permissao que nao existe. O caminho alternativo
  /// (digitar o bairro) passa a ser o unico -- e ele e o mesmo caminho de quem
  /// nega, entao a tela nao ganha um quarto desenho por causa deste estado.
  indisponivel,
}

/// De onde a coordenada veio. E o `source` da BICHUS-92.
///
/// **Sao exatamente dois, e nao ha um terceiro**, porque os dois sao os unicos
/// jeitos de uma coordenada nascer sem geocodificacao (ADR-0006): o aparelho
/// mediu, ou a pessoa apontou. CEP e bairro digitados **nunca** produzem um
/// valor deste enum, e e por isso que [AreaDigitada] nao carrega nenhum.
enum OrigemDoPonto {
  /// O aparelho mediu. E a unica origem que esta historia produz.
  deviceGps,

  /// A pessoa marcou o ponto num mapa.
  ///
  /// **Modelado e nao produzido, e isso e deliberado.** A BICHUS-23 lista
  /// "Mapa" em *Fora desta historia*, e o produto nao mostra mapa (BICHUS-14 e
  /// 37). O valor existe aqui porque o contrato e a BICHUS-92 o preveem, e
  /// porque quem construir a correcao de ponto precisa encontrar o lugar dele
  /// ja pronto em vez de inventar um terceiro nome.
  ///
  /// Enquanto nao ha mapa, a correcao que a pessoa tem e outra e ela existe:
  /// trocar a captura pelo bairro digitado, que e reversivel e nao exige mapa.
  mapPin;

  /// O valor como o contrato o escreve.
  String get noContrato => switch (this) {
        OrigemDoPonto.deviceGps => 'device_gps',
        OrigemDoPonto.mapPin => 'map_pin',
      };
}

/// Por que a captura nao devolveu um ponto.
///
/// Cada valor leva a uma frase diferente na tela, e e por isso que eles sao
/// cinco e nao um. Um `null` no lugar disto faria as cinco situacoes virarem a
/// mesma mensagem generica, e a pessoa que esta com o servico desligado seria
/// mandada para a tela de permissao que ela ja concedeu.
///
/// **O motivo nao basta, e isso foi MEDIDO em 20/10/2026 contra um relato de
/// iPhone.** Cliente, com o build de release de `1ff67840` no aparelho dele:
/// *"quando tento usar minha localizacao, ele ate pede a permissao para
/// liberar, mas da o erro: Nao deu para descobrir sua cidade agora"*. Permissao
/// CONCEDIDA, rede boa, capital de SP, localizacao exata ligada, e a falha
/// **instantanea**. Quatro caminhos diferentes produzem exatamente essa frase
/// nessas condicoes, e nenhum deles deixa rastro -- a frase nao distingue
/// "a Apple errou" de "o ponto nao veio" de "veio lugar sem nome de cidade".
/// Por isso [CapturaSemPonto.detalhe] e [CidadeNaoResolvida.detalhe] existem:
/// o motivo diz a CLASSE da falha e o detalhe diz QUAL foi, e sem o segundo o
/// aparelho da pessoa nao e instrumento de medicao nenhum.
enum MotivoDeNaoTerPonto {
  /// Recusou desta vez. A tela oferece o bairro e o pedido continua possivel.
  permissaoNegada,

  /// Recusou em definitivo. A tela oferece o bairro e o caminho de volta sao
  /// os AJUSTES, nunca um segundo dialogo que nao abre.
  permissaoNegadaPermanentemente,

  /// A localizacao esta desligada nos ajustes do aparelho. Nao e recusa.
  servicoDesligado,

  /// Permissao concedida, servico ligado, e o aparelho nao fixou no prazo.
  semFixNoPrazo,

  /// Nao ha localizacao neste build ou nesta plataforma.
  indisponivel,
}

/// Uma coordenada medida pelo aparelho, ainda **no app**.
///
/// [precisaoEmMetros] e o raio que o proprio aparelho declara, e ele existe
/// aqui por uma razao de tela: a BICHUS-23 pede que o app diga o que capturou
/// **sem prometer exatidao que nao tem**. Sem este numero a tela so pode
/// dizer "peguei sua localizacao", que e mais forte do que a medicao sustenta.
class PontoCapturado {
  const PontoCapturado({
    required this.lat,
    required this.lon,
    required this.precisaoEmMetros,
    required this.origem,
  });

  final double lat;
  final double lon;

  /// O raio declarado pelo aparelho, em metros. Nulo quando ele nao declara.
  final double? precisaoEmMetros;

  final OrigemDoPonto origem;

  /// O `GeoPoint` do contrato.
  ///
  /// **A coordenada vai CRUA, e a quantizacao e do servidor.** A grade de
  /// ~100 m do criterio 10 acontece "antes de ir para o banco", e quem a
  /// aplica e `localizacaoAGravar` no servidor (BICHUS-92), onde ela e
  /// autoridade. Quantizar aqui tambem pareceria zelo e seria o contrario:
  /// regra de negocio no aparelho e inspecionavel, e a versao antiga do app
  /// nunca some -- um app que quantiza com grade diferente da do servidor
  /// produz dois tamanhos de celula no mesmo banco, e o defeito so aparece na
  /// consulta de alcance, meses depois.
  Map<String, Object?> get noContrato => <String, Object?>{
        'lat': lat,
        'lon': lon,
        if (precisaoEmMetros != null) 'accuracy_m': precisaoEmMetros!.round(),
      };
}

/// O resultado de uma tentativa de captura: um ponto, ou o motivo de nao ter.
sealed class ResultadoDaCaptura {
  const ResultadoDaCaptura();
}

/// Deu certo.
class CapturaComPonto extends ResultadoDaCaptura {
  const CapturaComPonto(this.ponto);
  final PontoCapturado ponto;
}

/// Nao deu, e o motivo decide o que a tela diz.
///
/// **Isto nao e um erro a ser lancado.** Nenhum dos cinco motivos e excecao: a
/// BICHUS-23 exige que o fluxo continue funcionando em todos eles, pelo campo
/// de bairro. Uma excecao obrigaria cada chamador a lembrar do `try`, e quem
/// esquecer derruba a tela -- que e exatamente o "fluxo travado" que o
/// criterio 5 proibe.
class CapturaSemPonto extends ResultadoDaCaptura {
  const CapturaSemPonto(this.motivo, {this.detalhe});
  final MotivoDeNaoTerPonto motivo;

  /// O QUE DE FATO VEIO DO APARELHO, quando veio algo.
  ///
  /// **Nulo nos motivos que o proprio Dart decidiu** (permissao, servico
  /// desligado, indisponivel): neles nao ha erro de plataforma nenhum para
  /// registrar, e inventar um texto ali seria ruido com cara de medicao.
  ///
  /// Preenchido so em [MotivoDeNaoTerPonto.semFixNoPrazo], que e o motivo
  /// generico: ele nasce de um `catch` que apanha TRES coisas diferentes do
  /// `geolocator`, e o detalhe e o unico lugar onde elas continuam distintas.
  /// Medido no pacote em 20/10/2026 (`geolocator_apple-2.3.14`,
  /// `lib/src/geolocator_apple.dart`): `getCurrentPosition` apanha a
  /// `PlatformException` do canal e **relanca um tipo proprio**
  /// (`_handlePlatformException`), entao o que chega aqui e
  /// `PermissionDeniedException`, `LocationServiceDisabledException` ou
  /// `PositionUpdateException` -- e o `timeLimit`, que e um
  /// `.timeout()` de Dart puro, chega como `TimeoutException`. O NOME DO TIPO e
  /// a informacao, e e por isso que o detalhe o carrega.
  final String? detalhe;
}

/// Por que a resolucao da cidade nao devolveu nome.
///
/// **Sao NOVE, e cada um e um caminho que acontece de verdade.** Os cinco
/// primeiros sao os de [MotivoDeNaoTerPonto], repetidos aqui porque sem ponto
/// nao ha o que resolver; os quatro ultimos sao da resolucao em si.
///
/// ## Dois nomes mudaram em 20/10/2026, e os dois estavam ERRADOS NO IOS
///
/// - [geocoderAusente] e medido pelo proprio pacote (`isPresent()`), e ele
///   existe porque o geocoder do Android **pode nao estar no aparelho** --
///   AOSP sem Play Services, e paises onde o servico nao e oferecido. **Ele e
///   ANDROID-ONLY, e isso foi medido no pacote**: o darwin implementa
///   `isPresent()` como `Future<bool>.value(true)` cravado
///   (`geocoding_darwin-1.0.3/lib/src/geocoding_darwin.dart`). Num relato de
///   iPhone este motivo e impossivel, e quem o considerar esta perdendo tempo.
///
/// - [falhaDoServico] **era `tetoDeUsoEstourado`, e o nome antigo mentia.** No
///   Android o `IO_ERROR` do README do pacote e quase sempre teto de uso
///   mesmo: *"most of the times it means that the rate limit has been
///   reached"*. No iOS nao: o `CLGeocoderProxyApiDelegate.swift` do
///   `geocoding_darwin` converte **qualquer** `NSError` do `CLGeocoder` num
///   unico `PigeonError(code: "GeocodeAddressError")`. Rede
///   (`kCLErrorNetwork`), cancelamento (`kCLErrorGeocodeCanceled`) e
///   **"nao achei" (`kCLErrorGeocodeFoundNoResult`)** chegam todos aqui, com o
///   mesmo codigo. Chamar isso de "teto estourado" mandava quem estava sem
///   rede esperar uma cota que nunca foi o problema.
///
/// - [semResultado] e a lista vindo COM lugares e sem nome de cidade em nenhum
///   deles -- ver [cidadeDoLugar]. **No iOS isto nao e a lista vazia**: a
///   Apple devolve ausencia como ERRO (acima), e lista vazia e forma do
///   Android. Aqui ele significa uma coisa so, nas duas plataformas: o servico
///   respondeu, descreveu o lugar, e nenhum campo de cidade veio preenchido.
///
/// - [resolucaoSemResposta] e a desistencia por TEMPO **da resolucao**, e ela e
///   separada de [semFixNoPrazo] porque as duas eram o mesmo valor e nao sao a
///   mesma coisa. [semFixNoPrazo] e o aparelho nao fixando a posicao; este e o
///   servico de plataforma nao respondendo depois de a posicao ter chegado.
///   Com um valor so, "o GPS nao pegou" e "a Apple nao respondeu" eram
///   indistinguiveis no relato, e as duas tem conserto diferente.
///
/// **Nenhum dos nove e erro, e nenhum deles vira excecao.** Os nove caem para
/// a reserva da tela, que e a lista nacional dos 20 mais recentes. Um `null`
/// no lugar deste enum faria os nove virarem a mesma ausencia, e a tela nao
/// teria como registrar o que aconteceu.
enum MotivoDeNaoTerCidade {
  permissaoNegada,
  permissaoNegadaPermanentemente,
  servicoDesligado,
  semFixNoPrazo,
  indisponivel,
  geocoderAusente,
  falhaDoServico,
  semResultado,
  resolucaoSemResposta;

  /// O codigo CURTO que a tela mostra para a pessoa ler de volta para nos.
  ///
  /// **Nao e o `name` do enum, e a diferenca e deliberada.** O `name` muda
  /// quando alguem renomeia um valor -- e dois valores acabaram de ser
  /// renomeados aqui. Um codigo escrito a mao sobrevive ao renome, e e ele que
  /// vai no relato do cliente: o que ele le na tela tem de continuar
  /// significando a mesma coisa daqui a tres meses.
  String get codigo => switch (this) {
        MotivoDeNaoTerCidade.permissaoNegada => 'perm-negada',
        MotivoDeNaoTerCidade.permissaoNegadaPermanentemente => 'perm-bloqueada',
        MotivoDeNaoTerCidade.servicoDesligado => 'servico-off',
        MotivoDeNaoTerCidade.semFixNoPrazo => 'sem-fix',
        MotivoDeNaoTerCidade.indisponivel => 'indisponivel',
        MotivoDeNaoTerCidade.geocoderAusente => 'geocoder-ausente',
        MotivoDeNaoTerCidade.falhaDoServico => 'falha-servico',
        MotivoDeNaoTerCidade.semResultado => 'sem-nome',
        MotivoDeNaoTerCidade.resolucaoSemResposta => 'sem-resposta',
      };
}

/// O resultado de uma tentativa de resolver a cidade.
sealed class ResultadoDaCidade {
  const ResultadoDaCidade();
}

/// Deu certo: o nome da cidade, **ja aparado e com espaco colapsado**.
///
/// A normalizacao de espaco nao e enfeite e foi MEDIDA em 19/10/2026 contra
/// `texto_para_busca` do banco: ela absorve acento (`São`/`Sao`) e caixa
/// (`SAO PAULO`/`sao paulo`), e **nao absorve espaco** -- `'São  Paulo'`
/// normaliza para `'sao  paulo'` e nao casa com `'sao paulo'`, e
/// `' São Paulo '` tambem nao. Como o nome vem de fora (a plataforma decide a
/// forma), deixar o espaco passar produziria lista vazia com cara de defeito.
class CidadeResolvida extends ResultadoDaCidade {
  CidadeResolvida(String cidade) : cidade = cidade.trim().replaceAll(RegExp(r'\s+'), ' ');
  final String cidade;
}

/// Nao deu, e o motivo decide a frase: a tela trata os nove em DOIS grupos.
class CidadeNaoResolvida extends ResultadoDaCidade {
  const CidadeNaoResolvida(this.motivo, {this.detalhe});
  final MotivoDeNaoTerCidade motivo;

  /// O QUE A PLATAFORMA DISSE, quando disse algo. Nulo quando nao disse.
  ///
  /// Existe pela mesma razao de [CapturaSemPonto.detalhe], e carrega o que
  /// sobrou dele mais o que a chamada ao geocoder deixou: o `code` da
  /// `PlatformException` e, quando ela traz, a `message` e os `details`.
  ///
  /// **MEDIDO, e o resultado da medicao e uma limitacao que precisa estar
  /// escrita:** no iOS o `code` e SEMPRE `GeocodeAddressError` e a `message` e
  /// sempre `Failed to geocode address.`, porque o
  /// `CLGeocoderProxyApiDelegate.swift` poe o `NSError` de verdade em `details`
  /// -- e `NSError` nao atravessa o codec do pigeon. Ou seja: **o detalhe
  /// distingue a ETAPA (ponto / geocoder / lugar sem nome), e nao distingue
  /// QUAL erro da Apple foi.** Isso e limite do pacote e nao desleixo daqui;
  /// quem quiser o `kCLError` tem de mandar um PR para o `geocoding_darwin`.
  /// Ainda assim e a informacao que faltava: as quatro frases iguais viravam
  /// zero bits, e tres grupos distinguiveis valem a viagem de um build.
  final String? detalhe;
}

/// O NOME DA CIDADE dentro de um [Placemark], ou nulo quando nao ha nenhum.
///
/// **Funcao pura, de proposito.** A escolha de CAMPO nao precisava estar do
/// lado de la da fronteira do canal de plataforma, e enquanto estava ela nunca
/// foi medida -- o codigo lia `locality` e mais nada, e no iOS isso falha em
/// lugar que o Android acerta.
///
/// Quando isto foi escrito (19/10/2026) ela era a UNICA parte da resolucao que
/// dava para medir sem aparelho. Deixou de ser em 20/10/2026: o prazo proprio
/// da porta exigiu [ServicoDeGeocodificacao], e com o seam `_resolver` inteiro
/// ficou alcancavel em teste. `cidade_da_localizacao_test.dart` registra no
/// cabecalho o que o seam abriu e o que, dele, continua nao escrito.
///
/// ## Dois degraus, e cada um dos que ficaram de fora ficou por uma razao
///
/// 1. **`locality`** -- "The name of the city", e o campo certo. No Android o
///    `android.location.Geocoder` o preenche; no iOS o `CLGeocoder` tambem, na
///    maior parte dos lugares.
///
/// 2. **`subAdministrativeArea`** -- a reserva, e ela existe porque a Apple
///    **nao preenche `locality` em todo lugar**. Distrito, zona rural e cidade
///    pequena voltam com `locality` nulo e o municipio em
///    `subAdministrativeArea`. Antes de 20/10/2026 o codigo lia um campo so e
///    esses lugares caiam em [MotivoDeNaoTerCidade.semResultado] -- defeito
///    real, medido no codigo, que o iOS expoe e o Android esconde.
///
/// ## O QUE NAO ENTRA, E ISSO E MAIS IMPORTANTE QUE O QUE ENTRA
///
/// - **`administrativeArea` NAO entra, e a tentacao e grande.** O proprio
///   pacote o documenta como *"The name of the state or province"*
///   (`geocoding_platform_interface/lib/src/types/placemark.dart`). No Brasil
///   ele vale `SP`, que e o ESTADO. Um terceiro degrau nele poria `SP` no
///   filtro de CIDADE: recorte errado com cara de acerto, e a pessoa veria
///   "voce esta em SP" sem ninguem reprovar nada. Ha contrapeso de teste
///   exigindo nulo nesse caso, e ele existe para reprovar quem acrescentar o
///   degrau.
///
/// - **`subLocality` NAO entra, e e proibido.** Ele e o BAIRRO. A emenda 1 do
///   ADR-0006 autorizou coordenada -> **cidade**, e nao coordenada -> bairro:
///   o nivel maximo publico e bairro+cidade (ADR-0010), e DERIVAR o bairro da
///   coordenada e mais fino que o que a pessoa escolheu entregar. O portao
///   `app/test/dispositivo/sem_geocodificacao_test.dart` reprova
///   `bairroDaCoordenada` pelo nome, com essa razao escrita.
///
/// - **`name` NAO entra.** No iOS ele e o nome do PONTO -- um ponto de
///   interesse, um estabelecimento, as vezes o numero da rua. Nada disso e
///   cidade, e nada disso deveria aparecer num filtro de cidade.
///
/// Devolve o nome **aparado**, e nulo quando o campo existe mas e so espaco:
/// `''` e `'   '` sao a mesma ausencia, e so um deles seria pego por
/// `isNotEmpty`. O colapso do espaco DO MEIO e de [CidadeResolvida], que e
/// quem fala com `texto_para_busca` do banco.
String? cidadeDoLugar(Placemark lugar) {
  // Os dois campos sao ANULAVEIS no pacote. Um `!` em qualquer um derrubaria a
  // tela no aparelho que responde sem cidade -- que e justamente o caso que
  // [MotivoDeNaoTerCidade.semResultado] existe para nomear.
  for (final campo in <String?>[lugar.locality, lugar.subAdministrativeArea]) {
    final nome = (campo ?? '').trim();
    if (nome.isNotEmpty) return nome;
  }
  return null;
}

/// O POUCO que a resolucao de cidade precisa do servico da plataforma.
///
/// ## Existe por UMA razao, e ela e de medicao
///
/// `Geocoding` do pacote monta o canal de plataforma dentro do proprio
/// construtor (`GeocodingPlatformFactory.instance!`, medido em
/// `geocoding-5.0.0/lib/geocoding.dart`), e num teste de unidade nenhum plugin
/// se registrou. Sem este seam nao ha como pendurar a chamada **de proposito**,
/// e sem poder pendura-la o `.timeout` de [LocalizacaoPorGeolocator] seria
/// prosa -- que e exatamente como `forcarGerenciadorDoSistema` nasceu e viveu
/// quatro semanas: declarado, documentado e sem nenhum caso o observando.
///
/// ## Dois metodos, e nenhum deles recebe texto
///
/// A camada 3 do portao `sem_geocodificacao_test.dart` reprova a porta que
/// passe a falar de `String endereco` ou `String cep`. Esta interface e parte
/// da porta e vale a mesma regra: coordenada entra, lugar sai, e o sentido
/// inverso nao tem como ser escrito aqui sem mudar a forma dos metodos.
abstract class ServicoDeGeocodificacao {
  /// Ha geocoder neste aparelho. Android-only de fato; no iOS e sempre `true`.
  Future<bool> geocoderPresente();

  /// **O SENTIDO AUTORIZADO, e o unico**: coordenada -> lugares.
  Future<List<Placemark>> lugaresDoPonto(double lat, double lon);
}

/// O servico de verdade, pelo pacote `geocoding`.
///
/// `Geocoding` e construido na PRIMEIRA chamada e nao no construtor: montar o
/// canal custa, e esta classe e instanciada por padrao em toda
/// [LocalizacaoPorGeolocator] -- inclusive nas que nunca resolvem cidade.
class GeocodificacaoDaPlataforma implements ServicoDeGeocodificacao {
  Geocoding? _geocoding;

  Geocoding get _plataforma => _geocoding ??= Geocoding();

  @override
  Future<bool> geocoderPresente() => _plataforma.isPresent();

  @override
  Future<List<Placemark>> lugaresDoPonto(double lat, double lon) =>
      // **`placemarkFromCoordinates` mora AQUI e em lugar nenhum mais.** O
      // portao `sem_geocodificacao_test.dart` cobra o nome por arquivo, e
      // `locationFromAddress` -- que vem no MESMO pacote -- nao pode ser
      // escrito nem aqui.
      _plataforma.placemarkFromCoordinates(lat, lon);
}

/// O que a reserva do ultimo ponto conhecido tinha a dizer.
///
/// Carrega o ponto **e a frase**, porque a frase importa justamente quando o
/// ponto e nulo: ver [LocalizacaoPorGeolocator.idadeMaximaDoPontoGuardado].
class _Reserva {
  const _Reserva(this.ponto, this.detalhe);
  final PontoCapturado? ponto;
  final String detalhe;
}

/// O acesso a localizacao do aparelho.
abstract class Localizacao {
  /// O estado atual, **sem** abrir dialogo.
  Future<PermissaoDeLocalizacao> estado();

  /// Pede a permissao, abrindo o dialogo do sistema quando ele ainda abre.
  Future<PermissaoDeLocalizacao> pedir();

  /// Abre os ajustes do sistema, no unico caso em que pedir de novo nao
  /// resolve ([PermissaoDeLocalizacao.negadaPermanentemente]).
  Future<void> abrirAjustesDoSistema();

  /// A localizacao esta ligada nos ajustes do aparelho.
  ///
  /// Independente da permissao, e por isso separado dela. Ver o topo.
  Future<bool> servicoLigado();

  /// Mede a posicao **aproximada**, desistindo depois de [prazo].
  ///
  /// Nao pede permissao: quem pede e a tela, depois da antessala, porque o
  /// pedido e um ato da pessoa e nao um efeito colateral de medir.
  Future<ResultadoDaCaptura> pontoAproximado({required Duration prazo});

  /// O nome da cidade em que o aparelho esta, ou o motivo de nao ter.
  ///
  /// **O UNICO metodo de conversao desta porta, e num sentido so**
  /// (coordenada -> cidade). Ver o topo do arquivo: o sentido inverso segue
  /// proibido pelo ADR-0006 e e cobrado por portao.
  ///
  /// Nao pede permissao, pela mesma razao de [pontoAproximado]: sem permissao
  /// concedida ela devolve [MotivoDeNaoTerCidade.permissaoNegada] em vez de
  /// abrir dialogo. Quem pede e a tela, por um toque da pessoa.
  Future<ResultadoDaCidade> cidadeAproximada({required Duration prazo});
}

/// A implementacao de verdade: `geolocator`.
///
/// ## Precisao APROXIMADA, e o que isso significa em cada plataforma
///
/// Criterio 2 da BICHUS-23: a precisao pedida e `coarse`. Aqui isso e
/// [LocationAccuracy.low], que o pacote traduz para ~1000 m no iOS e ~500 m no
/// Android (`PRIORITY_LOW_POWER`). Nao e detalhe de bateria: pedir
/// `high` traria a rua e o numero de quem abriu o app em casa, e o produto
/// nunca mostra mais que bairro (ADR-0010). O dado mais fino nao teria onde
/// ser usado e teria onde vazar.
///
/// **O que de fato limita a precisao e o MANIFESTO, nao esta linha.** No
/// Android, `ACCESS_COARSE_LOCATION` sem `ACCESS_FINE_LOCATION` e o que impede
/// o sistema de entregar o ponto fino, e e la que a regra e inspecionavel. No
/// iOS, o escopo `Ao usar o app` sai de o `Info.plist` ter
/// `NSLocationWhenInUseUsageDescription` e **nao ter** nenhuma chave de
/// `Always`: o proprio `geolocator_apple` escolhe
/// `requestAlwaysAuthorization` quando so acha a chave de `Always`
/// (`PermissionHandler.m`). As duas coisas sao cobradas em
/// `app/test/dispositivo/permissoes_de_loja_test.dart`, e nao aqui, porque um
/// portao sobre codigo Dart nao enxergaria nenhuma delas.
///
/// ## Nada sai deste aparelho por causa deste pacote
///
/// `geolocator` nao faz rede: nao ha cliente HTTP nem socket no codigo Dart
/// dele, e a coordenada so sai do aparelho quando ESTE app a manda para a
/// nossa API. [forcarGerenciadorDoSistema] existe para o unico ponto em que
/// isso poderia deixar de ser verdade -- ver o campo.
class LocalizacaoPorGeolocator implements Localizacao {
  LocalizacaoPorGeolocator({
    this.forcarGerenciadorDoSistema = true,
    ServicoDeGeocodificacao? geocodificacao,
  }) : _servico = geocodificacao ?? GeocodificacaoDaPlataforma();

  /// O servico de plataforma, **trocavel so para medir**.
  ///
  /// O padrao e o de verdade. O parametro existe porque o prazo da porta (ver
  /// [prazoDoGeocoder]) nao da para medir sem um dublê que NUNCA responda, e
  /// um que demore mediria outra coisa: `try/catch` nao pega travamento, e
  /// `Future` que nunca completa nao lanca.
  final ServicoDeGeocodificacao _servico;

  /// No Android, usar o `LocationManager` do sistema em vez do provedor
  /// fundido do Google Play Services.
  ///
  /// **Ligado por padrao, e isto e uma decisao de privacidade, nao de
  /// desempenho.** O provedor fundido (`FusedLocationProvider`) costuma fixar
  /// mais rapido porque combina GPS com a base de Wi-Fi e de celula do Google
  /// -- e essa combinacao e feita por um componente do Google, no aparelho,
  /// que consulta servico do Google. O `LocationManager` do proprio Android
  /// nao envolve terceiro nenhum.
  ///
  /// O produto precisa de bairro, nao de calcada: a precisao que o provedor
  /// fundido acrescenta nao tem uso aqui, e o custo dela e uma dependencia de
  /// terceiro no caminho de um dado pessoal. Quando o ganho passar a importar,
  /// isto vira `false` num lugar so, com a decisao registrada.
  ///
  /// **Quem le este campo e [_ajustesDaMedicao], e so ele.** A observacao nao
  /// e organizacao de codigo: entre a BICHUS-23 e 20/10/2026 este campo
  /// existiu DECLARADO E NAO LIDO -- a captura montava um [LocationSettings]
  /// puro, que no Android e justamente o provedor fundido do Google. A prosa
  /// acima estava inteira, a decisao estava tomada, e no aparelho ela nao
  /// valia. Um campo de privacidade que ninguem le nao reprova nada, e foi
  /// por isso que `gerenciador_do_sistema_test.dart` passou a medir o valor
  /// que chega ao canal.
  final bool forcarGerenciadorDoSistema;

  @override
  Future<PermissaoDeLocalizacao> estado() async =>
      _traduzir(await Geolocator.checkPermission());

  @override
  Future<PermissaoDeLocalizacao> pedir() async =>
      _traduzir(await Geolocator.requestPermission());

  @override
  Future<void> abrirAjustesDoSistema() async {
    await Geolocator.openAppSettings();
  }

  @override
  Future<bool> servicoLigado() => Geolocator.isLocationServiceEnabled();

  @override
  Future<ResultadoDaCaptura> pontoAproximado({
    required Duration prazo,
  }) async {
    final permissao = await estado();
    switch (permissao) {
      case PermissaoDeLocalizacao.negada:
      case PermissaoDeLocalizacao.naoPedida:
        // `naoPedida` cai aqui de proposito: medir NAO pede. Quem pede e a
        // tela, depois da antessala. Chegar em `pontoAproximado` sem ter
        // pedido e erro de fluxo, e o lado seguro dele e nao abrir dialogo
        // nenhum -- abrir seria o pedido sem contexto que a antessala existe
        // para impedir.
        return const CapturaSemPonto(MotivoDeNaoTerPonto.permissaoNegada);
      case PermissaoDeLocalizacao.negadaPermanentemente:
        return const CapturaSemPonto(
          MotivoDeNaoTerPonto.permissaoNegadaPermanentemente,
        );
      case PermissaoDeLocalizacao.indisponivel:
        return const CapturaSemPonto(MotivoDeNaoTerPonto.indisponivel);
      case PermissaoDeLocalizacao.concedida:
        break;
    }

    if (!await servicoLigado()) {
      return const CapturaSemPonto(MotivoDeNaoTerPonto.servicoDesligado);
    }

    try {
      final posicao = await Geolocator.getCurrentPosition(
        locationSettings: _ajustesDaMedicao(prazo),
      );
      return CapturaComPonto(_pontoDe(posicao));
    } on Object catch (erro) {
      // O pacote lanca tipos diferentes para "estourou o prazo", "o servico
      // caiu no meio" e "o aparelho recusou", e os tres terminam na mesma
      // tela: sem ponto, com o bairro oferecido. Distinguir aqui produziria
      // tres frases para uma acao unica.
      //
      // **A FRASE continua uma, e o REGISTRO passou a ser tres.** Era o mesmo
      // `on Object` sem `catch`, e com ele o relato do cliente de 20/10/2026
      // ("da o erro ... instantaneo") nao tinha como ser lido: um
      // `PermissionDeniedException` do lado nativo e um `TimeoutException` de
      // 12 s produziam byte por byte a mesma tela. O tipo e barato de guardar
      // e e a unica coisa que separa os dois.
      //
      // **E ANTES DE DESISTIR, A RESERVA.** Ver [_ultimoPontoConhecido]: o
      // aparelho dentro de casa frequentemente nao fixa, e o sistema ja tem um
      // ponto guardado que serve para nomear cidade.
      final reserva = await _ultimoPontoConhecido();
      if (reserva.ponto != null) return CapturaComPonto(reserva.ponto!);
      return CapturaSemPonto(
        MotivoDeNaoTerPonto.semFixNoPrazo,
        // **DUAS ETAPAS NUM DETALHE SO**, e as duas sao necessarias para ler o
        // relato: o que a medicao disse, e o que a reserva disse. Sem a segunda
        // metade, "nao fixou" e "nao fixou e nao havia ponto guardado" e
        // "nao fixou e o ponto guardado era velho demais" chegam iguais -- e
        // as tres tem conserto diferente.
        detalhe: '${_detalheDoErro(erro)}; ${reserva.detalhe}',
      );
    }
  }

  /// O ponto que a medicao devolveu, traduzido.
  ///
  /// **A origem continua [OrigemDoPonto.deviceGps] tambem na reserva**, e isso
  /// e decisao e nao descuido: o ponto guardado foi medido por ESTE aparelho,
  /// pelo sistema dele. Um terceiro valor aqui reprovaria o portao
  /// `sem_geocodificacao_test.dart` ("a coordenada so nasce de `device_gps` ou
  /// de `map_pin`"), e reprovaria com razao -- "o sistema tinha guardado" nao e
  /// uma terceira forma de uma coordenada nascer.
  static PontoCapturado _pontoDe(Position posicao) => PontoCapturado(
        lat: posicao.latitude,
        lon: posicao.longitude,
        precisaoEmMetros: posicao.accuracy,
        origem: OrigemDoPonto.deviceGps,
      );

  /// ## A IDADE MAXIMA DO PONTO GUARDADO, e por que ela e 30 minutos
  ///
  /// **O criterio esta aqui, no codigo, e nao numa decisao de cabeca.** Ponto
  /// velho e PONTO, e nao verdade nova: aceitar qualquer idade poria a pessoa
  /// que acabou de descer do aviao em "voce esta em" da cidade de onde ela
  /// saiu, com o rotulo *da sua localizacao* colado -- que e exatamente a
  /// "cidade errada derivada em silencio" que esta frente existe para nao
  /// fazer.
  ///
  /// O numero sai de qual erro custa mais, e os dois custos sao assimetricos:
  ///
  /// - **Apertar demais** devolve o defeito que a reserva veio consertar: o
  ///   aparelho dentro de casa nao fixa, o ponto guardado e recusado, e a
  ///   pessoa volta a ler "nao deu para descobrir sua cidade".
  /// - **Afrouxar demais** nomeia a cidade ERRADA, com confianca. Esse e o
  ///   caro: a lista fica recortada por uma cidade em que a pessoa nao esta, e
  ///   nada na tela diz que o ponto era de antes.
  ///
  /// Trinta minutos e onde os dois se cruzam para o que esta sendo decidido
  /// aqui, que e NOME DE CIDADE e nao posicao: um aparelho parado dentro de
  /// casa -- o caso que a reserva atende -- esta na mesma cidade com certeza em
  /// meia hora; um aparelho que se moveu meia hora de carro PODE ter trocado de
  /// municipio numa regiao metropolitana, e esse e o risco aceito. Ele e
  /// limitado de proposito: a pessoa tem o filtro de cidade a um toque, e a
  /// alternativa de recusar e a lista nacional, que esta errada para todo mundo.
  ///
  /// **Nao e `gradeEmMetros` com outro nome.** Aquela e "vale reperguntar"; esta
  /// e "este ponto ainda descreve onde a pessoa esta". A grade compara dois
  /// pontos, esta compara um ponto com o relogio.
  static const Duration idadeMaximaDoPontoGuardado = Duration(minutes: 30);

  /// Quantas vezes a reserva de fato salvou uma captura nesta sessao.
  ///
  /// Existe para ser MEDIDO, pela mesma razao de [resolucoesPedidas]: "a reserva
  /// serviu para algo no aparelho do cliente" e uma pergunta com resposta, e sem
  /// este contador ela seria respondida por leitura de codigo.
  int reservasUsadas = 0;

  /// O ULTIMO PONTO QUE O SISTEMA GUARDOU, quando ele ainda serve.
  ///
  /// ## Por que isto nao fere a decisao de privacidade -- MEDIDO no pacote
  ///
  /// [forcarGerenciadorDoSistema] existe para manter o `FusedLocationProvider`
  /// do Google fora do caminho de um dado pessoal, e a reserva precisava passar
  /// pelo mesmo crivo. O caminho foi lido inteiro em 20/10/2026, no
  /// `geolocator_android-5.0.3`:
  ///
  /// 1. `Geolocator.getLastKnownPosition(forceAndroidLocationManager:)` repassa
  ///    o valor como `forceLocationManager` para a plataforma
  ///    (`geolocator/lib/geolocator.dart`);
  /// 2. `GeolocatorAndroid.getLastKnownPosition` o poe no mapa do canal de
  ///    metodo (`lib/src/geolocator_android.dart`);
  /// 3. `MethodCallHandlerImpl.onGetLastKnownPosition` o le e o entrega a
  ///    `GeolocationManager.getLastKnownPosition`;
  /// 4. `GeolocationManager.createLocationClient` devolve `LocationManagerClient`
  ///    quando ele e verdadeiro, **sem consultar `isGooglePlayServicesAvailable`**;
  /// 5. `LocationManagerClient` importa `android.location.*` e
  ///    `androidx.core.location.*` e **nada do Google** (varrido: zero
  ///    ocorrencia de "google" no arquivo). Ele percorre
  ///    `locationManager.getProviders(true)` e pega
  ///    `getLastKnownLocation(provider)` de cada um.
  ///
  /// **O PADRAO DO PACOTE E `false`, E ISSO E A ARMADILHA.** Chamar
  /// `getLastKnownPosition()` pelado cai no passo 4 com `false`, e ali
  /// `isGooglePlayServicesAvailable(context) ? new FusedLocationClient(...)`
  /// manda a consulta para o provedor do Google -- em silencio, sem nenhuma
  /// linha mudar nesta porta. Por isso o campo e repassado EXPLICITAMENTE
  /// abaixo, e por isso `gerenciador_do_sistema_test.dart` cobra o valor como
  /// ele sai no canal **tambem nesta chamada**.
  ///
  /// No iOS a chave nao tem significado (ha um `CLLocationManager` e nada
  /// mais) e o `geolocator_apple` a ignora -- o que ele devolve e o fix em
  /// cache do proprio `CLLocationManager`, que e justamente por que o iOS nunca
  /// teve este defeito.
  ///
  /// Devolve o ponto **e o que dizer sobre ele**: o detalhe vai para a faixa
  /// quando nao ha ponto, e e a unica coisa que separa "nao havia nada
  /// guardado" de "havia e era velho demais".
  Future<_Reserva> _ultimoPontoConhecido() async {
    final Position? guardado;
    try {
      guardado = await Geolocator.getLastKnownPosition(
        // **EXPLICITO, e nao pelo padrao.** Ver a prosa acima: o padrao do
        // pacote e `false`, e `false` e o provedor do Google.
        forceAndroidLocationManager: forcarGerenciadorDoSistema,
      );
    } on Object catch (erro) {
      // A reserva falhando nao e um segundo erro a relatar: ela e a reserva. O
      // tipo entra no detalhe e a captura segue para a desistencia.
      return _Reserva(null, 'reserva falhou (${_detalheDoErro(erro)})');
    }
    if (guardado == null) {
      return const _Reserva(null, 'reserva sem ponto guardado');
    }
    final idade = DateTime.now().toUtc().difference(guardado.timestamp.toUtc());
    // **Idade NEGATIVA tambem e recusa.** Relogio do aparelho adiantado, ou
    // trocado entre a medicao e agora: um `timestamp` no futuro nao prova
    // frescor nenhum, e `idade <= teto` o aceitaria calado.
    if (idade.isNegative || idade > idadeMaximaDoPontoGuardado) {
      return _Reserva(
        null,
        'reserva velha (${idade.inMinutes}min, teto '
        '${idadeMaximaDoPontoGuardado.inMinutes}min)',
      );
    }
    reservasUsadas += 1;
    return _Reserva(_pontoDe(guardado), 'reserva usada (${idade.inMinutes}min)');
  }

  /// O que der para dizer sobre o erro, em pouco texto e sem dado pessoal.
  ///
  /// Nao e `erro.toString()`: a mensagem de algumas excecoes do `geolocator`
  /// traz a coordenada, e isto vai para a TELA. O tipo mais o `code` do canal
  /// sao o que diagnostica, e nenhum dos dois e dado de ninguem.
  static String _detalheDoErro(Object erro) {
    if (erro is PlatformException) {
      final partes = <String>[erro.code];
      final detalhes = erro.details;
      if (detalhes != null) partes.add(detalhes.toString());
      return partes.join(' ');
    }
    return erro.runtimeType.toString();
  }

  /// Os ajustes que vao para o lado nativo -- e **o unico lugar que le
  /// [forcarGerenciadorDoSistema]**.
  ///
  /// Sao duas classes e nao uma porque a escolha de provedor **nao existe no
  /// iOS**: nele ha um `CLLocationManager` e nada mais, e
  /// `forceLocationManager` e campo de [AndroidSettings]. Mandar a chave onde
  /// ela nao tem significado nao e inofensivo: ela viaja no `toJson()` para o
  /// lado nativo e passa a parecer uma garantia que a plataforma nao da.
  ///
  /// **O [LocationSettings] puro nao e um padrao conservador, e o contrario.**
  /// Com ele o `geolocator` cai no `FusedLocationProviderClient` do Google
  /// Play Services -- exatamente o terceiro que o campo existe para tirar do
  /// caminho. Foi assim que a decisao de privacidade ficou escrita no campo e
  /// ausente do aparelho, e e por isso que
  /// `app/test/dispositivo/gerenciador_do_sistema_test.dart` cobra o valor
  /// COMO ELE SAI NO CANAL, e nao a existencia do campo.
  ///
  /// [defaultTargetPlatform] e nao `Platform.isAndroid` porque este arquivo
  /// nao abre `dart:io` -- e porque o portao precisa poder dizer "agora eu sou
  /// Android" sem aparelho.
  LocationSettings _ajustesDaMedicao(Duration prazo) {
    // `low` e a decisao do criterio 2 da BICHUS-23, e ela vale nas duas
    // plataformas: fica num lugar so para as duas nao divergirem.
    const precisao = LocationAccuracy.low;

    if (defaultTargetPlatform == TargetPlatform.android) {
      return AndroidSettings(
        forceLocationManager: forcarGerenciadorDoSistema,
        accuracy: precisao,
        timeLimit: prazo,
      );
    }

    return LocationSettings(accuracy: precisao, timeLimit: prazo);
  }

  /// ## A MEMORIA DA ULTIMA RESOLUCAO, e por que ela e obrigatoria
  ///
  /// `_ultimoPonto` e `_ultimaCidade` existem para a resolucao NAO acontecer a
  /// cada abertura da tela. Duas razoes, e as duas sao medidas e nao
  /// preferencia:
  ///
  /// 1. **Teto de uso.** O servico de plataforma e limitado, e o README do
  ///    pacote diz que estourar vira `IO_ERROR`. Resolver a cada abertura
  ///    gastaria o teto de quem usa o app muito, e quem usa muito e justamente
  ///    quem esta procurando um pet.
  /// 2. **O ADR-0006 exige a grade de ~100 m.** Ele diz que a localizacao do
  ///    usuario e quantizada numa grade de cerca de 100 m antes de ser
  ///    gravada, porque *"precisao maior nao melhora em nada um raio de 5 km e
  ///    so aumenta o dano de um vazamento"*. O mesmo raciocinio vale para
  ///    nome de CIDADE, com folga: andar 100 m nao troca a cidade. Reresolver
  ///    por menos que isso manda a coordenada para o terceiro de novo sem
  ///    nenhuma chance de a resposta mudar.
  ///
  /// [gradeEmMetros] e a mesma ordem de grandeza da grade do ADR. Ela nao
  /// pretende ser a quantizacao do servidor -- essa continua sendo do servidor
  /// (ver [PontoCapturado.noContrato]); aqui ela e so o limiar de "vale
  /// reperguntar".
  static const double gradeEmMetros = 100;

  /// ## O PRAZO DA PORTA PARA O GEOCODER, e por que ele nao e o do chamador
  ///
  /// `placemarkFromCoordinates` era um `await` cru dentro de um `try`, e o unico
  /// teto que existia vivia no CHAMADOR (`tetoDaEsperaDaResolucao`, em
  /// `lib/telas/perdido/lista_de_perdidos.dart`). Isso ja bastava para a tela
  /// dos Pets e nao bastava para a porta: **qualquer outro chamador futuro
  /// pendurava sem limite**, e quem escreve a segunda tela nao tem como saber
  /// que precisa lembrar de um `.timeout` -- a porta e que concentra o que as
  /// telas nao devem lembrar, pela mesma razao de a grade de 100 m morar aqui.
  ///
  /// **Nao ha prazo nenhum dentro do pacote**: varrido em 20/10/2026, zero
  /// ocorrencia de `timeout` no `geocoding`, no `geocoding_android` e no
  /// `geocoding_darwin`. Um canal de plataforma que aceita a chamada e nao
  /// responde pendura o `Future` para sempre, e `try/catch` nao pega isso --
  /// `Future` que nunca completa nao lanca.
  ///
  /// **O teto do chamador FICA, e os dois nao sao redundantes.** Este cobre a
  /// etapa do geocoder e nomeia o motivo
  /// ([MotivoDeNaoTerCidade.resolucaoSemResposta]); o de la cobre a chamada
  /// inteira, inclusive um travamento em qualquer linha desta porta que nao
  /// seja o geocoder. Dez segundos deixam este estourar ANTES do de la, e isso
  /// e deliberado: quem desiste primeiro e quem sabe dizer em que etapa foi.
  static const Duration prazoDoGeocoder = Duration(seconds: 10);

  PontoCapturado? _ultimoPonto;
  String? _ultimaCidade;

  /// Quantas vezes o servico de plataforma foi de fato chamado nesta sessao.
  ///
  /// Existe para ser MEDIDO, e e lido por teste: "quantas resolucoes por
  /// abertura da tela" e uma pergunta com resposta, e sem este contador ela
  /// seria respondida por leitura de codigo.
  int resolucoesPedidas = 0;

  @override
  Future<ResultadoDaCidade> cidadeAproximada({
    required Duration prazo,
  }) async {
    final captura = await pontoAproximado(prazo: prazo);
    switch (captura) {
      case CapturaSemPonto(motivo: final motivo, detalhe: final detalhe):
        // Os cinco motivos do PONTO atravessam sem traducao perdida, e **o
        // detalhe atravessa com eles**: quem le a tela precisa poder dizer que
        // a falha foi na etapa do PONTO e nao na do nome, e sem repassar o
        // detalhe a etapa se perdia na fronteira dos dois enums.
        return CidadeNaoResolvida(
          switch (motivo) {
            MotivoDeNaoTerPonto.permissaoNegada =>
              MotivoDeNaoTerCidade.permissaoNegada,
            MotivoDeNaoTerPonto.permissaoNegadaPermanentemente =>
              MotivoDeNaoTerCidade.permissaoNegadaPermanentemente,
            MotivoDeNaoTerPonto.servicoDesligado =>
              MotivoDeNaoTerCidade.servicoDesligado,
            MotivoDeNaoTerPonto.semFixNoPrazo =>
              MotivoDeNaoTerCidade.semFixNoPrazo,
            MotivoDeNaoTerPonto.indisponivel =>
              MotivoDeNaoTerCidade.indisponivel,
          },
          detalhe: detalhe,
        );
      case CapturaComPonto(ponto: final ponto):
        final guardada = _cidadeGuardadaPara(ponto);
        if (guardada != null) return CidadeResolvida(guardada);
        return _resolver(ponto);
    }
  }

  /// A cidade da ultima resolucao, quando o aparelho nao saiu da celula.
  String? _cidadeGuardadaPara(PontoCapturado ponto) {
    final anterior = _ultimoPonto;
    final cidade = _ultimaCidade;
    if (anterior == null || cidade == null) return null;
    final metros = Geolocator.distanceBetween(
      anterior.lat,
      anterior.lon,
      ponto.lat,
      ponto.lon,
    );
    return metros <= gradeEmMetros ? cidade : null;
  }

  Future<ResultadoDaCidade> _resolver(PontoCapturado ponto) async {
    // `isPresent` PRIMEIRO, e nao dentro do `try`: ausencia de geocoder nao e
    // falha de chamada, e misturar os dois daria a mesma frase para "este
    // aparelho nao tem" e "o teto estourou". Medido no pacote: `isPresent()`
    // existe exatamente porque o Android pode nao ter.
    // Instancia guardada: `Geocoding()` monta o canal de plataforma, e montar
    // um por resolucao seria desperdicio num caminho que ja tem teto de uso.
    //
    // **E ELE TEM PRAZO, como toda chamada de canal desta porta.** Ver
    // [prazoDoGeocoder]: `isPresent` atravessa o mesmo canal que a resolucao, e
    // um canal que aceita e nao responde pendura o `Future` para sempre.
    try {
      if (!await _servico.geocoderPresente().timeout(prazoDoGeocoder)) {
        return const CidadeNaoResolvida(MotivoDeNaoTerCidade.geocoderAusente);
      }
    } on TimeoutException {
      // **PENDURAR NAO E "NAO TER", e a distincao e o motivo de este `catch`
      // vir antes do de baixo.** O aparelho que responde "nao tenho geocoder"
      // e `geocoderAusente`; o que nao responde nada e o servico de plataforma
      // sem resposta, que tem valor proprio desde 20/10/2026.
      return CidadeNaoResolvida(
        MotivoDeNaoTerCidade.resolucaoSemResposta,
        detalhe: 'isPresent sem resposta em ${prazoDoGeocoder.inSeconds}s',
      );
    } on Object {
      // `isPresent` falhando e tratado como ausencia, e nao como teto: o
      // aparelho que nao consegue nem responder "tenho geocoder" nao tem.
      return const CidadeNaoResolvida(MotivoDeNaoTerCidade.geocoderAusente);
    }

    resolucoesPedidas += 1;
    final List<Placemark> lugares;
    try {
      // **O SENTIDO AUTORIZADO, e o unico.** `placemarkFromCoordinates` e
      // coordenada -> lugar. `locationFromAddress` existe no mesmo pacote e
      // NAO pode ser chamado aqui nem em lugar nenhum deste app: ADR-0006, e
      // o portao `sem_geocodificacao_test.dart` reprova por nome.
      //
      // **O PRAZO E DA PORTA, e nao do chamador.** Ver [prazoDoGeocoder]: o
      // teto de 24 s da tela dos Pets continua valendo por cima, e este vale
      // para QUALQUER chamador -- inclusive o que ainda nao foi escrito.
      lugares = await _servico
          .lugaresDoPonto(ponto.lat, ponto.lon)
          .timeout(prazoDoGeocoder);
    } on TimeoutException {
      // **ANTES do `on Object`, de proposito**: um `TimeoutException` caindo em
      // `falhaDoServico` diria "o servico errou" sobre um servico que nao
      // respondeu, e as duas tem conserto diferente -- uma e cota ou rede, a
      // outra e canal pendurado.
      return CidadeNaoResolvida(
        MotivoDeNaoTerCidade.resolucaoSemResposta,
        detalhe: 'geocoder sem resposta em ${prazoDoGeocoder.inSeconds}s',
      );
    } on Object catch (erro) {
      // O `IO_ERROR` do teto de uso chega aqui, e e o caminho NORMAL sob
      // volume -- nao o excepcional. Qualquer outra falha de plataforma cai no
      // mesmo lugar porque o desfecho da tela e o mesmo: a reserva.
      //
      // **No iOS "qualquer outra" e literalmente tudo**, inclusive "nao
      // achei": ver [MotivoDeNaoTerCidade.falhaDoServico]. O detalhe e o que
      // separa ESTE caminho do caminho do ponto no relato de quem usa o app.
      return CidadeNaoResolvida(
        MotivoDeNaoTerCidade.falhaDoServico,
        detalhe: _detalheDoErro(erro),
      );
    }

    // Lista vindo vazia, ou vindo sem nenhum campo de cidade em lugar nenhum,
    // e `semResultado` -- ver [cidadeDoLugar] para QUAIS campos contam.
    for (final lugar in lugares) {
      final nome = cidadeDoLugar(lugar);
      if (nome != null) {
        _ultimoPonto = ponto;
        _ultimaCidade = nome;
        return CidadeResolvida(nome);
      }
    }
    return CidadeNaoResolvida(
      MotivoDeNaoTerCidade.semResultado,
      // O numero de lugares separa "a plataforma nao devolveu nada" de "a
      // plataforma descreveu o lugar e nenhum campo de cidade veio". No iOS o
      // primeiro nao acontece (ausencia vira erro), no Android acontece.
      detalhe: '${lugares.length} lugar(es) sem nome de cidade',
    );
  }

  static PermissaoDeLocalizacao _traduzir(LocationPermission permissao) {
    switch (permissao) {
      case LocationPermission.always:
      case LocationPermission.whileInUse:
        return PermissaoDeLocalizacao.concedida;
      case LocationPermission.denied:
        return PermissaoDeLocalizacao.negada;
      case LocationPermission.deniedForever:
        return PermissaoDeLocalizacao.negadaPermanentemente;
      case LocationPermission.unableToDetermine:
        return PermissaoDeLocalizacao.indisponivel;
    }
  }
}

/// A implementacao para quando a localizacao **nao existe neste processo**.
///
/// Ela nao finge. Todo metodo responde ausencia, e a tela cai no caminho do
/// bairro digitado -- que e o mesmo caminho de quem nega a permissao, e que a
/// BICHUS-23 exige que funcione inteiro de qualquer forma.
///
/// E por ela existir que as telas seguem montaveis sem aparelho, e que os
/// cinco motivos de [MotivoDeNaoTerPonto] tem onde ser exercitados.
class LocalizacaoNaoEmbarcada implements Localizacao {
  const LocalizacaoNaoEmbarcada();

  @override
  Future<PermissaoDeLocalizacao> estado() async =>
      PermissaoDeLocalizacao.indisponivel;

  @override
  Future<PermissaoDeLocalizacao> pedir() async =>
      PermissaoDeLocalizacao.indisponivel;

  @override
  Future<void> abrirAjustesDoSistema() async {}

  @override
  Future<bool> servicoLigado() async => false;

  @override
  Future<ResultadoDaCaptura> pontoAproximado({
    required Duration prazo,
  }) async =>
      const CapturaSemPonto(MotivoDeNaoTerPonto.indisponivel);

  @override
  Future<ResultadoDaCidade> cidadeAproximada({
    required Duration prazo,
  }) async =>
      const CidadeNaoResolvida(MotivoDeNaoTerCidade.indisponivel);
}
