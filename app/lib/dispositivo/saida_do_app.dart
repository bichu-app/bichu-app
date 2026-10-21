import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

/// Um encontro para o calendario do aparelho.
class EventoDeCalendario {
  const EventoDeCalendario({
    required this.titulo,
    required this.inicio,
    required this.fim,
    required this.local,
    required this.descricao,
  });

  final String titulo;

  /// Instante absoluto (UTC). O calendario do aparelho desenha no fuso dele,
  /// e o instante e o que nao muda entre fusos.
  final DateTime inicio;

  /// Nulo quando o encontro nao declara fim: o calendario do sistema poe o
  /// padrao dele, e o app nao inventa uma duracao.
  final DateTime? fim;

  final String local;
  final String descricao;
}

/// A porta de saida da `Rede`: o que leva a pessoa para outro app.
///
/// **Cinco saidas, e nenhuma pede permissao.**
///
/// - [abrirNoAppDeMapas]: o ponto e o nome do lugar como rotulo, sem rota
///   (UX 28.3, decisao 1) -- a intencao `geo:` no Android, `maps.apple.com` no
///   iOS; sem app que responda, o mesmo ponto no navegador. So recebe o ponto
///   de um ENCONTRO: a porta nao tem metodo que aceite coordenada solta de
///   outra coisa (UX 28.4).
/// - [abrirEnderecoNoAppDeMapas]: o mesmo caminho, com o TEXTO do endereco em
///   `q=` e sem coordenada. **Quem resolve o texto em lugar e o aplicativo de
///   mapas do aparelho; o Bichu nao geocodifica** (ADR-0006, que fica como
///   esta por decisao do cliente de 01/10, e que o ADR-0027 item 21 consagrou
///   ao por `network_events.street_address` no produto como TEXTO).
///
///   **UMA funcao, DOIS chamadores**, e isso e requisito e nao arrumacao: o
///   encontro da `Rede` (`local_do_encontro.dart`, com logradouro de verdade)
///   e a pagina do local de `Perto` (`pagina_do_local.dart`, que hoje so tem
///   bairro e cidade) entram pela MESMA porta. No dia em que o diretorio
///   ganhar coluna de logradouro, o profissional herda o mecanismo sem uma
///   linha nova -- e se houvesse duas copias, uma delas nao herdaria.
/// - [abrirLink]: um link publico do encontro (convite, Instagram) no
///   navegador do aparelho. Nao recebe `String`: quem chama ja tem a `Uri` do
///   modelo, que so existe quando o servidor mandou URL absoluta.
/// - [adicionarAoCalendario]: a tela de "novo evento" do calendario do
///   sistema, ja preenchida (`Intent.ACTION_INSERT` em
///   `CalendarContract.Events`). Nao le nem escreve o calendario, e por isso
///   nao exige `READ_CALENDAR`/`WRITE_CALENDAR`: quem salva e a pessoa, no app
///   dela (design system 24.12.1, item 4).
/// - [compartilharTexto]: a FOLHA DE COMPARTILHAMENTO do sistema, com um texto
///   e um assunto. O cliente pediu em 20/10/2026 *"aquela barra no celular para
///   o usuario selecionar onde ele quer compartilhar"*, e e o sistema que
///   decide o que ela lista -- WhatsApp se estiver instalado, e tambem
///   Telegram, mensagem, e-mail e copiar. **O app nao escolhe destino e nao
///   pergunta o que esta instalado**: perguntar exigiria `QUERY_ALL_PACKAGES`
///   no Android 11+, que e permissao sensivel na revisao da loja, para decidir
///   algo que a folha ja decide melhor.
///
/// Mora em `lib/dispositivo/` porque abre canal de plataforma, que o portao de
/// `porta_nao_contornada_test.dart` proibe em tela.
///
/// ## iOS: as tres saidas que nao existiam, e o que cada uma passou a usar
///
/// Esta prosa SUBSTITUI a anterior, que dizia que "o canal do calendario nao
/// existe no Runner (o iOS esta dormente por decisao de 23/09)". Era verdade e
/// era a CAUSA de dois defeitos que o cliente mediu no aparelho em 20/10/2026:
/// *"o botao de adicionar o evento ao calendario no ios nao esta funcionando"*
/// e o endereco que nao abria no aplicativo de mapas.
///
/// **O modo de falha era o mesmo nos dois, e e o pior que existe: silencio.**
/// `adicionarAoCalendario` pegava `MissingPluginException` e devolvia `false`;
/// `abrirNoAppDeMapas` e `abrirEnderecoNoAppDeMapas` montavam `geo:`, que
/// NENHUM aplicativo do iOS responde, e caiam no navegador com o
/// OpenStreetMap. Nenhum erro, nenhum log, suite inteira verde -- o Android
/// ia para o app de mapas e o iOS ia para uma pagina da web, e so quem tinha
/// os dois aparelhos na mao enxergava a diferenca.
///
/// **Nenhuma das tres precisou de chave nova no `Info.plist`, e essa e a parte
/// contra-intuitiva.** A hipotese natural -- `NSCalendarsUsageDescription`
/// ausente -- descreve o caminho do EventKit, que LE e GRAVA o calendario. O
/// Android nunca fez isso (`ACTION_INSERT` so abre a tela de novo evento) e o
/// iOS passa a nao fazer tambem: o `.ics` e um arquivo, e abri-lo pede ao
/// Calendario que mostre `Adicionar evento` -- quem salva continua sendo a
/// pessoa, no app dela. Pela mesma razao nao ha `LSApplicationQueriesSchemes`:
/// `maps.apple.com` e `https`, e `https` nao e esquema consultavel. Declarar
/// `comgooglemaps:` e `waze:` exigiria uma FOLHA DE ESCOLHA -- tela nova, que
/// o cliente aprova antes do codigo --, e sem ela as duas declaracoes seriam
/// permissao de consulta que o produto nao usa.
///
/// **A invariante de cima continua inteira: cinco saidas, e nenhuma pede
/// permissao.** Ela foi o critério de escolha de cada mecanismo, e nao uma
/// coincidência.
abstract class SaidaDoApp {
  const SaidaDoApp();

  /// A implementacao em uso. Troca so em teste.
  static SaidaDoApp atual = const SaidaDoAparelho();

  @visibleForTesting
  static void restaurar() => atual = const SaidaDoAparelho();

  Future<bool> abrirNoAppDeMapas({
    required double lat,
    required double lon,
    required String nomeDoLugar,
  });

  /// Abre o TEXTO do endereco no aplicativo de mapas. Sem coordenada: a
  /// busca e do app de mapas, nao nossa.
  Future<bool> abrirEnderecoNoAppDeMapas({required String endereco});

  /// Abre um link no navegador do aparelho.
  Future<bool> abrirLink(Uri link);

  Future<bool> adicionarAoCalendario(EventoDeCalendario evento);

  /// Abre a folha de compartilhamento do sistema com [texto].
  ///
  /// [assunto] vira `EXTRA_SUBJECT` no Android e o assunto da mensagem quando o
  /// destino escolhido e um aplicativo de e-mail. Nos destinos que nao tem
  /// assunto -- WhatsApp, Telegram, copiar -- ele e ignorado pelo sistema, e nao
  /// aparece duplicado no corpo.
  ///
  /// **Devolve se a folha ABRIU, e nao o que a pessoa fez nela.** As duas coisas
  /// sao diferentes e so a primeira e nossa: cancelar a folha e um desfecho
  /// legitimo, e uma tela que reclamasse de cancelamento estaria reclamando de
  /// a pessoa ter mudado de ideia. `ShareResult.status` distingue os dois, e
  /// **nao e lido de proposito** -- quem chama nao tem o que fazer com a
  /// diferenca.
  Future<bool> compartilharTexto({required String texto, required String assunto});
}

/// A implementacao que fala com o aparelho.
class SaidaDoAparelho extends SaidaDoApp {
  const SaidaDoAparelho();

  static const MethodChannel _calendario = MethodChannel('app.bichu/calendario');

  /// O sistema em uso, por [defaultTargetPlatform] e **nao** por
  /// `Platform.isIOS`.
  ///
  /// A diferenca e de MEDIBILIDADE, e ela decidiu: `flutter_test` troca
  /// `defaultTargetPlatform` (`debugDefaultTargetPlatformOverride`) e nao
  /// troca `Platform.isIOS`. Com `dart:io` a perna do iOS desta porta seria
  /// codigo que nenhum teste desta maquina alcanca -- exatamente o estado em
  /// que os dois defeitos de 20/10 viveram, verdes, por semanas.
  static bool get _ehIOS => defaultTargetPlatform == TargetPlatform.iOS;

  /// Tenta os destinos **em ordem**, e para no primeiro que abrir.
  ///
  /// Existe para as duas saidas de mapas nao repetirem o `try`/`on
  /// PlatformException`/proximo: eram dois blocos iguais, e passaram a ser
  /// quatro quando o iOS entrou. Quatro copias da mesma escada e onde a
  /// quinta sai diferente sem ninguem notar.
  static Future<bool> _abrirOPrimeiroQueResponder(List<Uri> destinos) async {
    for (final destino in destinos) {
      try {
        if (await launchUrl(destino, mode: LaunchMode.externalApplication)) {
          return true;
        }
      } on PlatformException {
        // Este nao respondeu. O proximo da lista e a resposta, e a lista
        // termina sempre num `https`, que todo aparelho sabe abrir.
      } on MissingPluginException {
        // `url_launcher` nao registrado neste binario. Nenhum destino vai
        // responder, e insistir nos outros so repete a excecao.
        return false;
      }
    }
    return false;
  }

  @override
  Future<bool> abrirNoAppDeMapas({
    required double lat,
    required double lon,
    required String nomeDoLugar,
  }) async {
    final coordenada = '${lat.toStringAsFixed(6)},${lon.toStringAsFixed(6)}';
    return _abrirOPrimeiroQueResponder(<Uri>[
      // **iOS primeiro, e so no iOS.** `maps.apple.com` e `https`, e o
      // Mapas o reivindica como LINK UNIVERSAL: no iPhone ele abre no app, e
      // em qualquer outro sistema abriria uma pagina da web -- que e por isso
      // que ele nao entra na lista do Android.
      //
      // Ser `https` e o que dispensa `LSApplicationQueriesSchemes`: a lista
      // declara esquemas CONSULTAVEIS, e `https` nao e um deles.
      if (_ehIOS)
        Uri.https('maps.apple.com', '/', <String, String>{
          'll': coordenada,
          'q': nomeDoLugar,
        })
      else
        Uri.parse(
          'geo:$coordenada?q=$coordenada(${Uri.encodeComponent(nomeDoLugar)})',
        ),
      // O ultimo recurso dos dois sistemas: o ponto numa pagina da web. Sem
      // app de mapas instalado -- caso real em aparelho recem-formatado --
      // ela e o que sobra, e e melhor que um botao que nao faz nada.
      Uri.https('www.openstreetmap.org', '/', <String, String>{
        'mlat': lat.toStringAsFixed(6),
        'mlon': lon.toStringAsFixed(6),
      }).replace(
        fragment:
            'map=17/${lat.toStringAsFixed(6)}/${lon.toStringAsFixed(6)}',
      ),
    ]);
  }

  @override
  Future<bool> abrirEnderecoNoAppDeMapas({required String endereco}) async {
    // **Endereco em branco nao sai, e devolve `false` sem chamar o sistema.**
    //
    // Ele e conteudo de TERCEIRO: `network_events.street_address` e anulavel
    // (ADR-0027 item 21) e quem o digita e o painel. `geo:0,0?q=` com `q`
    // vazio abre o app de mapas no NADA -- no `0,0`, que fica no Atlantico ao
    // sul de Gana --, e `maps.apple.com/?q=` sem valor abre o mapa na ultima
    // posicao. Os dois desfechos sao piores que nao abrir: a pessoa viu o app
    // de mapas responder e vai acreditar no que ele mostrou.
    final limpo = endereco.trim();
    if (limpo.isEmpty) return false;

    return _abrirOPrimeiroQueResponder(<Uri>[
      if (_ehIOS)
        // O MESMO texto, para o MESMO lugar, por um esquema diferente. Sem
        // `ll`: nao ha coordenada para mandar, e o ADR-0006 proibe que o
        // Bichu a produza -- quem resolve o texto em lugar e o aplicativo de
        // mapas do aparelho, e isso continua valendo no iOS.
        Uri.https('maps.apple.com', '/', <String, String>{'q': limpo})
      else
        // `geo:0,0?q=<texto>` e a forma documentada de pedir ao app de mapas
        // que ele resolva um texto. O `0,0` nao e um lugar: e o exigido pelo
        // esquema antes do `q`, e o proprio Android o ignora quando `q` e
        // texto. **E e ele que dispara o seletor do sistema**, com Google
        // Maps, Waze e o que mais estiver instalado -- o "app padrao do
        // usuario" que o cliente pediu, resolvido pelo Android e nao por nos.
        Uri.parse('geo:0,0?q=${Uri.encodeComponent(limpo)}'),
      Uri.https(
        'www.openstreetmap.org',
        '/search',
        <String, String>{'query': limpo},
      ),
    ]);
  }

  @override
  Future<bool> abrirLink(Uri link) async {
    try {
      return await launchUrl(link, mode: LaunchMode.externalApplication);
    } on PlatformException {
      return false;
    }
  }

  @override
  Future<bool> adicionarAoCalendario(EventoDeCalendario evento) async {
    try {
      final abriu = await _calendario.invokeMethod<bool>(
        'adicionar',
        <String, Object?>{
          'titulo': evento.titulo,
          'inicioEmMs': evento.inicio.millisecondsSinceEpoch,
          'fimEmMs': evento.fim?.millisecondsSinceEpoch,
          'local': evento.local,
          'descricao': evento.descricao,
        },
      );
      return abriu ?? false;
    } on PlatformException {
      return false;
    } on MissingPluginException {
      return false;
    }
  }

  @override
  Future<bool> compartilharTexto({
    required String texto,
    required String assunto,
  }) async {
    try {
      // `SharePlus.instance.share(ShareParams(...))` e a interface de 12.x; os
      // estaticos `Share.share` estao la por compatibilidade.
      //
      // `text` e nao `uri`: os dois sao mutuamente exclusivos no pacote, e `uri`
      // manda **so** o endereco -- o nome do pet, o bairro e a frase ficariam
      // de fora, e e justamente o texto que faz alguem olhar. O link vai dentro
      // do texto, que e como ele chega num grupo de bairro.
      await SharePlus.instance.share(
        ShareParams(text: texto, subject: assunto, title: assunto),
      );
      return true;
    } on PlatformException {
      // Sem atividade que responda a `ACTION_SEND`, ou a folha recusando abrir.
      // A tela diz que nao conseguiu, em vez de ficar calada.
      return false;
    } on MissingPluginException {
      // O plugin nao registrado neste binario (o caso do iOS dormente, e o de
      // um `flutter test` que suba o aparelho de mentira). Mesmo desfecho.
      return false;
    }
  }
}
