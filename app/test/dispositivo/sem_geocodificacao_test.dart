// ADR-0006 — geocodificacao, **depois da emenda 1 de 19/10/2026**.
//
// ====================================================================
// ESTE PORTAO FOI ESTREITADO EM 19/10/2026, E NAO REMOVIDO. LEIA ISTO.
// ====================================================================
// O cliente autorizou UM sentido, nas palavras dele: *"autorizar o gps, e
// trazer algum valor padrao em caso de fallback"*. A emenda 1 do ADR-0006
// registra a decisao, o que entrou e o que o cliente aceitou em troca.
//
//   coordenada -> nome de CIDADE   AUTORIZADO, e so por
//                                  `placemarkFromCoordinates`, so pela porta
//                                  `lib/dispositivo/localizacao.dart`
//   endereco   -> coordenada       PROIBIDO, e continua -- e o CEP que "acha"
//                                  o ponto de quem negou o GPS
//
// **A PROTECAO MUDOU DE FORMA, e e isso que exige cuidado de quem edita este
// arquivo.** Ela era a AUSENCIA da dependencia: o codigo para converter nao
// estava no binario, e nenhuma disciplina era necessaria. Agora o pacote
// `geocoding` esta declarado, e ele traz os DOIS sentidos no mesmo arquivo
// (`geocoding-5.0.0/lib/geocoding.dart` expoe `placemarkFromCoordinates` e
// `locationFromAddress`) -- nao da para importar meio pacote. Entao a
// protecao passou a ser ASSERCAO SOBRE O USO, que e mais fraca por natureza:
// ela depende de este arquivo continuar correto.
//
// Por isso o sentido proibido ganhou caso PROPRIO, e nao ficou dependendo da
// lista geral: `camada 2: o sentido PROIBIDO nao aparece em lugar nenhum`.
//
// A ISCA ORIGINAL continua valendo para o que sobrou, e vale reler por que
// ela foi escrita: a conversao e *"a tentacao mais natural do produto
// inteiro"* -- o `area_label` sai nulo quando so ha coordenada, e a correcao
// obvia resolve o sintoma em tres linhas e quebra a decisao.
//
// As tres camadas, de fora para dentro:
//
//   1. o PACOTE: nenhum pacote de geocodificacao entra, **com uma excecao
//      nomeada e datada** (`geocoding`), e a excecao e uma lista de um;
//   2. os FONTES: ninguem nomeia um conversor, **exceto
//      `placemarkFromCoordinates` dentro da porta do aparelho**; e o sentido
//      proibido nao aparece em lugar nenhum;
//   3. os TIPOS nao se convertem -- `AreaDigitada` nao tem coordenada e
//      `PontoCapturado` nao tem bairro. **A camada 3 nao foi tocada pela
//      emenda, e e a que mais importa agora**: ela sobrevive ao dia em que
//      alguem escrever a conversao a mao, e ela nao depende de nome nenhum.
//
// A camada 3 existe porque as duas primeiras sao portoes de nome: elas pegam
// quem usa a biblioteca conhecida, e nao pegam quem escreve uma tabela de CEP
// no proprio repositorio. Nenhuma das tres sozinha fecha a classe.

import 'dart:io';

import 'package:bichu/api/modelos_localizacao.dart';
import 'package:bichu/dispositivo/localizacao.dart';
import 'package:flutter_test/flutter_test.dart';

import 'diretivas_dart.dart';

/// Sobe de `Directory.current` ate achar a raiz do repositorio.
///
/// **Reprova quando nao acha.** Portao que nao encontra o que conferir fica
/// verde por vazio, e e assim que esta classe de defeito passa despercebida.
Directory _raizDoRepositorio() {
  var dir = Directory.current.absolute;
  while (true) {
    if (File('${dir.path}/app/pubspec.yaml').existsSync()) return dir;
    final pai = dir.parent;
    if (pai.path == dir.path) break;
    dir = pai;
  }
  throw StateError(
    'REPROVA: nao achei a raiz do repositorio subindo a partir de '
    '"${Directory.current.path}". Sem ela este portao nao confere nada, e '
    'ficar verde sem conferir e exatamente o que ele existe para impedir.',
  );
}

/// Pacotes que convertem endereco em coordenada, ou o contrario.
///
/// A lista e de nomes conhecidos do ecossistema Flutter. Ela **nao** e a
/// defesa principal: a defesa que sobrevive a um nome fora da lista e o grupo
/// dos tipos, no fim deste arquivo.
const Map<String, String> _pacotesQueGeocodificam = <String, String>{
  // `geocoding` SAIU DESTA LISTA em 19/10/2026 e ganhou a excecao nomeada
  // abaixo (`_pacoteAutorizado`). Ele nao foi apagado da prosa de proposito:
  // quem procurar por ele aqui tem de ser levado a decisao, e nao encontrar
  // silencio.
  'geocoder': 'converte coordenada em endereco',
  'flutter_geocoder': 'converte coordenada em endereco',
  'google_maps_webservice': 'traz a API de geocodificacao do Google',
  'google_geocoding_api': 'a API de geocodificacao do Google',
  'open_street_map_search_and_pick': 'busca endereco e devolve coordenada',
  'flutter_google_places': 'devolve coordenada a partir de texto de endereco',
  'search_cep': 'devolve dados de CEP',
  'via_cep': 'devolve dados de CEP',
  'cep_aberto': 'devolve coordenada a partir de CEP',
  'brasil_api': 'expoe CEP com coordenada',
};

/// O UNICO pacote de geocodificacao autorizado, e a decisao que o autoriza.
///
/// **Lista de um, e nomeada**, para que acrescentar um segundo seja uma edicao
/// visivel neste arquivo e nao uma linha no `pubspec.yaml`. O que ele pode
/// fazer esta em [_funcaoAutorizada]; o que ele NAO pode esta em
/// [_sentidoProibido], com caso proprio.
const Map<String, String> _pacoteAutorizado = <String, String>{
  'geocoding': 'ADR-0006 emenda 1, 19/10/2026: coordenada -> nome de cidade, '
      'pelo servico de plataforma, autorizado pelo cliente. O sentido inverso '
      'continua proibido e tem caso proprio neste arquivo.',
};

/// A unica funcao de conversao que pode ser chamada, e o unico arquivo que
/// pode chama-la.
///
/// O arquivo importa: autorizar a funcao em qualquer lugar do app espalharia a
/// chamada por telas, e cada tela teria de lembrar do teto de uso e da grade
/// de 100 m. A porta concentra isso num lugar, e e por isso que ela existe.
const String _funcaoAutorizada = 'placemarkFromCoordinates';
const String _arquivoDaPorta = 'lib/dispositivo/localizacao.dart';

/// O sentido que a emenda **nao** autorizou, por nome.
///
/// Caso proprio e nao linha numa lista geral: ele e o que sobrou da decisao
/// original, e ele mora no MESMO pacote que o sentido autorizado -- entao o
/// unico jeito de ele nao acontecer e alguem nunca escrever estes nomes.
const Map<String, String> _sentidoProibido = <String, String>{
  'locationFromAddress': 'endereco -> coordenada: o CEP que "acha" o ponto de '
      'quem negou o GPS',
  'placemarkFromAddress': 'endereco -> lugar',
  'coordenadaDoBairro': 'bairro -> coordenada, escrita a mao',
  'coordenadaDoCep': 'CEP -> coordenada, escrita a mao',
  'pontoDoEndereco': 'endereco -> coordenada, escrita a mao',
};

/// Tira comentario de YAML antes de medir.
///
/// Este arquivo e o `pubspec.yaml` EXPLICAM em prosa o que o app faz e nao
/// faz, e medir o texto cru confundiria a explicacao com a declaracao -- era
/// assim no caso original e continua sendo.
String _semComentariosDeYaml(String texto) => texto
    .split('\n')
    .map((l) {
      final i = l.indexOf('#');
      return i < 0 ? l : l.substring(0, i);
    })
    .join('\n');

void main() {
  final raiz = _raizDoRepositorio().path;

  group('camada 1: so o pacote autorizado entra no app', () {
    final pubspec = File('$raiz/app/pubspec.yaml');
    final lock = File('$raiz/app/pubspec.lock');

    test('o pubspec e o lock existem', () {
      // Sem isto, renomear o arquivo deixaria os dois casos abaixo verdes por
      // vazio -- que e pior que nao ter portao.
      expect(pubspec.existsSync(), isTrue, reason: 'REPROVA: ${pubspec.path}');
      expect(lock.existsSync(), isTrue, reason: 'REPROVA: ${lock.path}');
    });

    test('o `pubspec.yaml` nao declara nenhum pacote NAO autorizado', () {
      // Os comentarios saem antes da medicao: este arquivo EXPLICA em prosa
      // por que `geocoding` nao entrou, e medir o texto cru confundiria a
      // explicacao com a declaracao.
      final texto = _semComentariosDeYaml(pubspec.readAsStringSync());

      for (final pacote in _pacotesQueGeocodificam.entries) {
        expect(
          RegExp('^\\s+${RegExp.escape(pacote.key)}\\s*:', multiLine: true)
              .hasMatch(texto),
          isFalse,
          reason: 'REPROVA: `${pacote.key}` entrou no `pubspec.yaml` -- '
              '${pacote.value}. O ADR-0006 decide que NAO ha geocodificacao no '
              'MVP: CEP e bairro sao rotulo de exibicao e filtro de listagem, '
              'nunca fonte de coordenada, e coordenada nunca vira endereco. '
              'Se a decisao mudou, ela muda no ADR primeiro, e este portao '
              'muda junto, no mesmo commit.',
        );
      }
    });

    /// E O AUTORIZADO TEM DE ESTAR LA. Sem este caso, o portao voltaria a
    /// aprovar o app que perdeu o pacote -- e a tela cairia para a reserva
    /// para sempre, em silencio, que e o defeito mais caro desta frente.
    ///
    /// **MEDIDO EM 19/10/2026, e a medicao enfraquece este caso: tirar
    /// `geocoding` do `pubspec.yaml` reprova ANTES de ele rodar.** O arquivo
    /// inteiro falha ao CARREGAR, porque a porta do aparelho importa o pacote
    /// e o importe nao resolve. Na pratica isso e uma garantia mais forte --
    /// nao da para publicar sem o pacote --, e por isso este caso NAO e o que
    /// de fato pega essa regressao.
    ///
    /// Ele fica por dois motivos: se um dia a porta passar a importar o pacote
    /// de forma condicional (ou a resolucao migrar para um pacote federado que
    /// compile ausente), a compilacao para de acusar e este caso passa a ser o
    /// unico que acusa; e ele mede tambem que a excecao continua sendo de UM,
    /// que nenhuma compilacao mede.
    test('o pacote AUTORIZADO esta declarado, e e exatamente um', () {
      final texto = _semComentariosDeYaml(pubspec.readAsStringSync());
      for (final pacote in _pacoteAutorizado.entries) {
        expect(
          RegExp('^\\s+${RegExp.escape(pacote.key)}\\s*:', multiLine: true)
              .hasMatch(texto),
          isTrue,
          reason: 'REPROVA: `${pacote.key}` saiu do `pubspec.yaml`. '
              '${pacote.value} Sem ele a cidade nunca resolve e a lista cai '
              'para a reserva nacional em silencio.',
        );
      }
      expect(
        _pacoteAutorizado, hasLength(1),
        reason: 'REPROVA: a excecao virou lista. Ela e de UM, e um segundo '
            'pacote de geocodificacao e decisao nova, com ADR novo.',
      );
    });

    test('o `pubspec.lock` nao traz nenhum NAO autorizado por transitividade', () {
      // O `pubspec.yaml` pega quem declara. O lock pega quem CHEGA -- um
      // pacote novo que puxe `geocoding` como dependencia propria entraria no
      // binario sem nenhuma linha do `pubspec.yaml` mudar, e o `geolocator` e
      // do mesmo publicador do `geocoding`, entao essa vizinhanca e real.
      final texto = lock.readAsStringSync();
      for (final pacote in _pacotesQueGeocodificam.entries) {
        expect(
          RegExp('^  ${RegExp.escape(pacote.key)}:', multiLine: true)
              .hasMatch(texto),
          isFalse,
          reason: 'REPROVA: `${pacote.key}` chegou ao `pubspec.lock` '
              '(${pacote.value}), mesmo sem estar no `pubspec.yaml`. Alguem '
              'acrescentou um pacote que o traz junto. Rode `flutter pub deps` '
              'para achar quem o puxou.',
        );
      }
    });
  });

  group('camada 2: nenhum fonte do app nomeia um conversor', () {
    late final List<File> fontes;

    setUpAll(() {
      fontes = Directory('$raiz/app/lib')
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart'))
          .toList();
    });

    test('ha fontes para conferir', () {
      expect(
        fontes.length,
        greaterThan(20),
        reason: 'REPROVA: achei ${fontes.length} arquivo(s) em app/lib. O '
            'projeto tem mais que isso; um portao que varre a pasta errada '
            'passa por vazio.',
      );
    });

    test('nenhum importa pacote de geocodificacao NAO autorizado', () {
      for (final fonte in fontes) {
        for (final diretiva in lerDiretivas(fonte.readAsStringSync())) {
          for (final pacote in _pacotesQueGeocodificam.keys) {
            expect(
              diretiva.uri.startsWith('package:$pacote/'),
              isFalse,
              reason: 'REPROVA: ${fonte.path}:${diretiva.linha} importa '
                  '`${diretiva.uri}`. Ver o caso do `pubspec.yaml` acima.',
            );
          }
        }
      }
    });

    /// E O AUTORIZADO SO ENTRA PELA PORTA.
    ///
    /// Importar `package:geocoding/` numa TELA seria espalhar a chamada: cada
    /// tela teria de lembrar do teto de uso e da grade de 100 m que a porta
    /// concentra. O pacote esta no binario; o que este caso impede e ele ser
    /// usado de qualquer lugar.
    ///
    /// DESLIGANDO: importe `package:geocoding/geocoding.dart` em
    /// `lib/telas/perdido/lista_de_perdidos.dart`. Este caso reprova pelo
    /// nome.
    test('o pacote autorizado e importado SO pela porta do aparelho', () {
      for (final fonte in fontes) {
        for (final diretiva in lerDiretivas(fonte.readAsStringSync())) {
          for (final pacote in _pacoteAutorizado.keys) {
            if (!diretiva.uri.startsWith('package:$pacote/')) continue;
            expect(
              fonte.path.endsWith(_arquivoDaPorta),
              isTrue,
              reason: 'REPROVA: ${fonte.path}:${diretiva.linha} importa '
                  '`${diretiva.uri}` fora da porta. O unico arquivo que pode '
                  'e `$_arquivoDaPorta` -- e ele que guarda a memoria de 100 m '
                  'e traduz os oito motivos de falha. Chame a porta.',
            );
          }
        }
      }
    });

    test('nenhum chama um conversor NAO autorizado, escrito a mao', () {
      // A rede para quem escreve a conversao sem pacote. Os nomes sao os que
      // a API do ecossistema usa, e a busca roda sobre o fonte SEM
      // COMENTARIOS, para que este projeto possa explicar em prosa o que nao
      // faz -- que e exatamente o que varios arquivos daqui fazem.
      //
      // `placemarkFromCoordinates` SAIU desta lista (emenda 1 do ADR-0006) e
      // ganhou caso proprio abaixo, que limita ONDE ele pode ser chamado.
      // `bairroDaCoordenada` e `getAddressFromLatLng` FICAM: a emenda
      // autorizou coordenada -> CIDADE, e nao coordenada -> bairro nem
      // coordenada -> endereco. O nivel maximo publico continua bairro+cidade
      // (ADR-0010), e derivar BAIRRO de coordenada e mais fino que o que a
      // pessoa escolheu entregar.
      const nomesDeConversao = <String, String>{
        'getAddressFromLatLng': 'coordenada -> endereco',
        'bairroDaCoordenada': 'coordenada -> bairro, que a emenda NAO autorizou',
      };
      for (final fonte in fontes) {
        final codigo = semComentarios(fonte.readAsStringSync());
        for (final nome in nomesDeConversao.entries) {
          expect(
            codigo.contains(nome.key),
            isFalse,
            reason: 'REPROVA: ${fonte.path} chama `${nome.key}` '
                '(${nome.value}). A emenda 1 do ADR-0006 autorizou UM sentido '
                'e um nivel: coordenada -> nome de CIDADE. Qualquer outra '
                'conversao segue proibida, escrita a mao inclusive.',
          );
        }
      }
    });

    /// O CASO QUE A EMENDA OBRIGOU A EXISTIR.
    ///
    /// O sentido proibido mora no MESMO pacote que o autorizado, e por isso
    /// ele deixou de ser impedido pela ausencia da dependencia. Este caso e o
    /// que sobrou no lugar daquela garantia, e e por isso que ele e separado:
    /// uma linha numa lista geral some numa edicao distraida.
    ///
    /// DESLIGANDO: chame `locationFromAddress` em qualquer arquivo de
    /// `app/lib` -- inclusive na porta. Este caso reprova pelo nome, e ele
    /// NAO tem excecao de arquivo: nem a porta pode.
    test('camada 2: o sentido PROIBIDO nao aparece em lugar nenhum', () {
      for (final fonte in fontes) {
        final codigo = semComentarios(fonte.readAsStringSync());
        for (final nome in _sentidoProibido.entries) {
          expect(
            codigo.contains(nome.key),
            isFalse,
            reason: 'REPROVA: ${fonte.path} nomeia `${nome.key}` '
                '(${nome.value}). A emenda 1 do ADR-0006 autorizou SO '
                'coordenada -> cidade; endereco -> coordenada continua '
                'proibido, e nao ha arquivo que possa faze-lo -- a porta do '
                'aparelho inclusive. Se a decisao mudou, ela muda no ADR '
                'primeiro, e este caso muda junto, no mesmo commit.',
          );
        }
      }
    });

    /// E O AUTORIZADO SO E CHAMADO PELA PORTA.
    test('o sentido autorizado e chamado SO pela porta do aparelho', () {
      var achou = false;
      for (final fonte in fontes) {
        final codigo = semComentarios(fonte.readAsStringSync());
        if (!codigo.contains(_funcaoAutorizada)) continue;
        achou = true;
        expect(
          fonte.path.endsWith(_arquivoDaPorta),
          isTrue,
          reason: 'REPROVA: ${fonte.path} chama `$_funcaoAutorizada` fora da '
              'porta. O unico arquivo que pode e `$_arquivoDaPorta`.',
        );
      }
      // Nao achar o alvo e REPROVACAO, e nao aprovacao por vazio: se ninguem
      // chama a funcao autorizada, a resolucao de cidade deixou de existir e a
      // tela caiu para a reserva em silencio.
      expect(
        achou,
        isTrue,
        reason: 'REPROVA: ninguem chama `$_funcaoAutorizada`. A resolucao de '
            'cidade saiu do app, e a lista caiu para a reserva nacional sem '
            'ninguem perceber.',
      );
    });
  });

  group('camada 3: os tipos nao se convertem', () {
    // A camada que sobrevive as duas de cima. Elas sao portoes de NOME:
    // pegam a biblioteca conhecida e a funcao com nome previsivel, e nao
    // pegam quem escrever uma tabela de CEP dentro deste repositorio com
    // nomes proprios. Esta pega pela forma dos dados.

    test('`AreaDigitada` nao carrega coordenada', () {
      const area = AreaDigitada(
        cidade: 'São Paulo',
        bairro: 'Vila Madalena',
        uf: 'SP',
      );
      final noContrato = area.noContrato;
      expect(
        noContrato.keys.toSet(),
        <String>{'city', 'neighborhood', 'state'},
        reason: 'REPROVA: o que a area manda para a API mudou de forma. Se '
            'apareceu `lat`, `lon` ou `location`, o bairro digitado virou '
            'coordenada em algum lugar -- e como nao ha geocodificacao, essa '
            'coordenada foi inventada. Um ponto inventado no meio de um bairro '
            'residencial aponta para o quarteirao de alguem.',
      );
    });

    test('o "onde" por area NAO tem centro, e o produto conta com isso', () {
      const onde = OndePorArea(AreaDigitada(cidade: 'São Paulo'));
      expect(
        onde.temCoordenada,
        isFalse,
        reason: 'REPROVA: um "onde" montado so com texto passou a dizer que '
            'tem coordenada. O criterio 11 da BICHUS-23 depende disso: sem '
            'centro nao ha raio, o alerta de 5 km nao dispara, e a TELA '
            'precisa dizer isso. Um `temCoordenada` verdadeiro aqui faz o app '
            'prometer um alerta que nao vai sair.',
      );
      expect(onde.noAchado.containsKey('location'), isFalse);
      expect(onde.noCaso.containsKey('last_seen_location'), isFalse);
    });

    test('`PontoCapturado` nao carrega bairro nem cidade', () {
      const ponto = PontoCapturado(
        lat: -23.5505,
        lon: -46.6333,
        precisaoEmMetros: 240,
        origem: OrigemDoPonto.deviceGps,
      );
      expect(
        ponto.noContrato.keys.toSet(),
        <String>{'lat', 'lon', 'accuracy_m'},
        reason: 'REPROVA: o que a coordenada manda para a API mudou de forma. '
            'Se apareceu `neighborhood`, `city` ou `area_label`, alguem '
            'derivou um rotulo da coordenada -- que e geocodificacao reversa, '
            'e e o sentido mais provavel de acontecer, porque o `area_label` '
            'nulo parece defeito para quem nao leu o ADR-0006.',
      );
    });

    test('a coordenada so nasce de `device_gps` ou de `map_pin`', () {
      // Criterio 8, na letra. Um terceiro valor aqui so poderia significar uma
      // terceira forma de uma coordenada nascer, e as unicas duas legitimas
      // sao "o aparelho mediu" e "a pessoa apontou".
      expect(
        OrigemDoPonto.values.map((o) => o.noContrato).toSet(),
        <String>{'device_gps', 'map_pin'},
        reason: 'REPROVA: a lista de origens da coordenada mudou. O criterio 8 '
            'e fechado: `device_gps` e `map_pin`, e de mais nada. Um valor '
            'como `cep` ou `bairro` seria geocodificacao com outro nome.',
      );
    });

    test('a porta do aparelho nao expoe conversao nenhuma', () {
      // `Localizacao` e a unica fronteira com o mundo por onde uma coordenada
      // entra. Se um dia ela ganhar um metodo que receba texto e devolva
      // ponto, a proibicao cai por dentro, sem pacote e sem nome conhecido.
      final porta = File('$raiz/app/lib/dispositivo/localizacao.dart');
      expect(porta.existsSync(), isTrue, reason: 'REPROVA: ${porta.path}');
      final codigo = semComentarios(porta.readAsStringSync());
      for (final proibido in <String>['String endereco', 'String cep', 'Cep ']) {
        expect(
          codigo.contains(proibido),
          isFalse,
          reason: 'REPROVA: a porta `Localizacao` passou a falar de '
              '"$proibido". Ela mede posicao e so: texto entra e sai pelo '
              'formulario, nunca por ela.',
        );
      }
    });
  });
}
