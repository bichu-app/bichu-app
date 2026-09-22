// ADR-0006 — **nao ha geocodificacao no MVP**, e o criterio 8 da BICHUS-23:
// "CEP e bairro nunca produzem coordenada: ela vem de `device_gps` ou de
// `map_pin`, e de mais nada".
//
// A ISCA DESTE ARQUIVO: **a proibicao de geocodificar e hoje uma frase num
// ADR, e uma frase num ADR nao reprova nada.** Ela e tambem a tentacao mais
// natural do produto inteiro: o `area_label` sai nulo quando so ha coordenada,
// e a correcao obvia -- converter o ponto em bairro -- resolve o sintoma em
// tres linhas e quebra a decisao. `flutter pub add geocoding` e um comando; o
// pacote e do MESMO publicador do `geolocator`, aparece ao lado dele na
// primeira busca, e a linha que ele acrescenta ao `pubspec.yaml` passa
// despercebida numa revisao de diff que esta olhando para a tela.
//
// Este portao pega os dois sentidos, porque os dois estao proibidos:
//
//   coordenada -> endereco  (geocodificacao reversa: o `area_label` nulo)
//   endereco   -> coordenada  (o CEP que "acha" o ponto de quem negou o GPS)
//
// e pega em tres camadas, de fora para dentro:
//
//   1. o PACOTE nao esta no `pubspec.yaml` nem no `pubspec.lock`;
//   2. nenhum FONTE do app nomeia um conversor;
//   3. os TIPOS nao se convertem -- `AreaDigitada` nao tem coordenada e
//      `PontoCapturado` nao tem bairro, e a camada 3 e a que sobrevive ao dia
//      em que alguem escrever a conversao a mao, sem pacote nenhum.
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
  'geocoding': 'converte coordenada em endereco e endereco em coordenada',
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

void main() {
  final raiz = _raizDoRepositorio().path;

  group('camada 1: nenhum pacote de geocodificacao entra no app', () {
    final pubspec = File('$raiz/app/pubspec.yaml');
    final lock = File('$raiz/app/pubspec.lock');

    test('o pubspec e o lock existem', () {
      // Sem isto, renomear o arquivo deixaria os dois casos abaixo verdes por
      // vazio -- que e pior que nao ter portao.
      expect(pubspec.existsSync(), isTrue, reason: 'REPROVA: ${pubspec.path}');
      expect(lock.existsSync(), isTrue, reason: 'REPROVA: ${lock.path}');
    });

    test('o `pubspec.yaml` nao declara nenhum deles', () {
      // Os comentarios saem antes da medicao: este arquivo EXPLICA em prosa
      // por que `geocoding` nao entrou, e medir o texto cru confundiria a
      // explicacao com a declaracao.
      final texto = pubspec
          .readAsStringSync()
          .split('\n')
          .map((l) {
            final i = l.indexOf('#');
            return i < 0 ? l : l.substring(0, i);
          })
          .join('\n');

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

    test('o `pubspec.lock` nao traz nenhum deles por transitividade', () {
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

    test('nenhum importa pacote de geocodificacao', () {
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

    test('nenhum chama um conversor escrito a mao', () {
      // A rede para quem escreve a conversao sem pacote. Os nomes sao os que
      // a API do ecossistema usa, e a busca roda sobre o fonte SEM
      // COMENTARIOS, para que este projeto possa explicar em prosa o que nao
      // faz -- que e exatamente o que varios arquivos daqui fazem.
      const nomesDeConversao = <String, String>{
        'placemarkFromCoordinates': 'coordenada -> endereco',
        'locationFromAddress': 'endereco -> coordenada',
        'placemarkFromAddress': 'endereco -> lugar',
        'getAddressFromLatLng': 'coordenada -> endereco',
        'coordenadaDoBairro': 'bairro -> coordenada',
        'coordenadaDoCep': 'CEP -> coordenada',
        'bairroDaCoordenada': 'coordenada -> bairro',
      };
      for (final fonte in fontes) {
        final codigo = semComentarios(fonte.readAsStringSync());
        for (final nome in nomesDeConversao.entries) {
          expect(
            codigo.contains(nome.key),
            isFalse,
            reason: 'REPROVA: ${fonte.path} chama `${nome.key}` '
                '(${nome.value}). O ADR-0006 proibe os DOIS sentidos, e nao '
                'so o do pacote de terceiro: uma conversao escrita a mao '
                'quebra a mesma decisao e nao aparece em nenhum `pubspec`.',
          );
        }
      }
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
