// BICHUS-35, a regra do titulo: **"com o que da para ver"**.
//
// A afirmacao que este arquivo transforma em caso e esta: *o formulario do
// achado avulso nao exige nada que quem acha um pet na rua nao tenha como
// saber*. Ela e facil de escrever e facil de quebrar em silencio -- uma linha
// nova em `impedimentoEm` basta, e todos os testes de tela daquela linha
// nasceriam verdes, porque eles testariam o formulario COM o campo novo.
//
// COMO ELE MEDE, e por que nao mede a tela
// ----------------------------------------
// Pelas duas pontas, e nenhuma delas e a tela:
//
//  1. **O contrato**, lido do `api/openapi.yaml` no disco. O que
//     `StrayFoundReportInput` declara em `required` e em `anyOf` e a unica
//     lista legitima de exigencias, e ela e conferida contra o que quem esta
//     na rua consegue responder olhando para o animal. **Se o contrato passar
//     a exigir raca, idade ou nome, este caso reprova dizendo que o defeito e
//     de contrato, e nao de tela** -- que e a instrucao da issue, palavra por
//     palavra.
//
//  2. **A regra do rascunho**, `RascunhoDoAchado.impedimentoEm`, que e quem
//     desabilita o botao. Ela e exercitada com o minimo absoluto na mao, e
//     precisa liberar.
//
// NAO E TAUTOLOGIA, e isso foi deliberado: o caso 1 compara duas fontes
// diferentes (o YAML e uma lista escrita a mao aqui), e o caso 2 compara a
// regra com um rascunho montado campo a campo, sem reusar `campos()` nem
// nenhuma outra funcao do proprio rascunho.
//
// DESLIGAR PARA VER REPROVAR -- medido em 22/09/2026:
//
//   1. Em `lib/achado/rascunho_do_achado.dart`, acrescente ao fim de
//      `impedimentoEm`, antes do `return null`:
//          if (corCodigo == null) return ImpedimentoDeRegistrar.semEspecie;
//      Medido: **2 casos reprovam** neste arquivo --
//        - `o minimo do contrato ja libera o registro`
//        - `nenhuma exigencia alem das do contrato`
//      e mais 2 em `test/telas/registrar_achado_test.dart`.
//
//   2. Em `api/openapi.yaml`, acrescente `breed_code` ao `required` de
//      `StrayFoundReportInput`.
//      Medido: reprova `o contrato so exige o que da para ver`, nomeando o
//      campo e dizendo que o conserto e no contrato.

import 'dart:io';

import 'package:bichu/achado/rascunho_do_achado.dart';
import 'package:bichu/api/modelos_localizacao.dart';
import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/dispositivo/localizacao.dart';
import 'package:bichu/perdido/quando_foi_visto.dart';
import 'package:flutter_test/flutter_test.dart';

/// O que uma pessoa com um animal desconhecido no colo consegue responder.
///
/// Escrita a mao, e nao derivada de nada: e o julgamento de produto que a
/// historia fixa no titulo, e o valor dela esta em ser uma SEGUNDA fonte, que
/// o contrato precisa casar.
const Set<String> _oQueDaParaVer = <String>{
  // Cao, gato ou outro bicho. Ve-se.
  'species',
  // Pequeno, medio, grande, gigante. Ve-se.
  'size',
  // Quando. Quem achou estava la.
  'found_at',
  // Onde, nos dois ramos do `anyOf`. A captura resolve os dois.
  'location',
  'area',
};

/// O que NENHUM formulario de achado pode exigir, e o motivo de cada um.
const Map<String, String> _oQueNinguemSabe = <String, String>{
  'breed_code': 'quem acha um animal na rua raramente sabe a raca',
  'breed_free_text': 'idem, e este ainda depende do codigo certo',
  'primary_color_code': 'cor tem nome de lista fechada, e ninguem decora',
  'sex': 'nao se examina um animal assustado no colo',
  'photo_upload_id': 'nao existe antes do achado que ele precisa referenciar',
  'share_token': 'so quem chegou pelo push de um caso tem um',
  'ref_data_version': 'e metadado do cliente, e nao do animal',
};

Directory _raizDoRepositorio() {
  var dir = Directory.current.absolute;
  while (true) {
    if (File('${dir.path}/api/openapi.yaml').existsSync()) return dir;
    final pai = dir.parent;
    if (pai.path == dir.path) break;
    dir = pai;
  }
  throw StateError(
    'REPROVA: nao achei `api/openapi.yaml` subindo a partir de '
    '"${Directory.current.path}". Sem o contrato este portao nao confere '
    'nada, e ficar verde sem conferir e pior que nao existir.',
  );
}

/// As linhas do bloco `StrayFoundReportInput`, ate o schema seguinte.
///
/// Leitor de recorte, e nao de YAML: o app nao traz um analisador de YAML, e
/// trazer um pacote para ler cinco linhas seria custo que a historia nao pede.
/// **Ele reprova quando nao acha o bloco**, em vez de devolver vazio.
List<String> _blocoDoSchema(String yaml, String nome) {
  final linhas = yaml.split('\n');
  final inicio = linhas.indexWhere((l) => l.trimRight() == '    $nome:');
  if (inicio < 0) {
    throw StateError(
      'REPROVA: nao achei o schema `$nome` em `api/openapi.yaml`. Ou ele '
      'mudou de nome, ou sumiu: nos dois casos este portao parou de conferir '
      'o que o formulario do achado exige.',
    );
  }
  final bloco = <String>[];
  for (var i = inicio + 1; i < linhas.length; i += 1) {
    final l = linhas[i];
    // O proximo schema do mesmo nivel fecha o bloco.
    if (l.trim().isNotEmpty && RegExp(r'^    \S').hasMatch(l)) break;
    bloco.add(l);
  }
  return bloco;
}

/// Os nomes dentro de um `required: [a, b, c]` em linha.
Set<String> _listaEmLinha(String linha) {
  final abre = linha.indexOf('[');
  final fecha = linha.indexOf(']');
  if (abre < 0 || fecha < 0) return const <String>{};
  return linha
      .substring(abre + 1, fecha)
      .split(',')
      .map((e) => e.trim())
      .where((e) => e.isNotEmpty)
      .toSet();
}

void main() {
  late List<String> bloco;

  setUpAll(() {
    final yaml =
        File('${_raizDoRepositorio().path}/api/openapi.yaml').readAsStringSync();
    bloco = _blocoDoSchema(yaml, 'StrayFoundReportInput');
    expect(
      bloco,
      isNotEmpty,
      reason: 'REPROVA: o bloco de `StrayFoundReportInput` saiu vazio. Portao '
          'sem o que conferir fica verde por vazio, e e essa a classe de '
          'defeito que este arquivo existe para fechar.',
    );
  });

  group('o contrato so exige o que da para ver', () {
    test('todo `required` de `StrayFoundReportInput` e observavel', () {
      final exigidos = <String>{};
      for (final linha in bloco) {
        final limpo = linha.trim();
        if (limpo.startsWith('required:')) {
          exigidos.addAll(_listaEmLinha(limpo));
        }
        // As duas linhas do `anyOf` sao `- required: [location]`.
        if (limpo.startsWith('- required:')) {
          exigidos.addAll(_listaEmLinha(limpo));
        }
      }

      expect(
        exigidos,
        isNotEmpty,
        reason: 'REPROVA: nao li exigencia nenhuma de '
            '`StrayFoundReportInput`. O schema declara `required` e `anyOf`; '
            'um zero aqui e o leitor cego, e nao um contrato permissivo.',
      );

      final forbidden = exigidos.intersection(_oQueNinguemSabe.keys.toSet());
      expect(
        forbidden,
        isEmpty,
        reason: 'PARE: o contrato passou a exigir $forbidden em '
            '`StrayFoundReportInput`, e ${forbidden.map((c) => _oQueNinguemSabe[c]).join('; ')}.\n'
            'Isto e DEFEITO DE CONTRATO, e nao de tela. A historia diz "com o '
            'que da para ver": quem acha um cao na rua nao sabe raca, idade '
            'nem nome, e uma tela que passasse a cobrar isso perderia o '
            'achado -- que e a unica informacao que existe sobre aquele '
            'animal. O conserto e em `api/openapi.yaml`.',
      );

      final estranhos = exigidos.difference(_oQueDaParaVer);
      expect(
        estranhos,
        isEmpty,
        reason: 'PARE: `StrayFoundReportInput` exige $estranhos, e este portao '
            'nao sabe dizer se quem acha um pet na rua consegue responder '
            'isso.\n'
            'Se consegue, acrescente o campo em `_oQueDaParaVer` com o motivo '
            'escrito ao lado -- um ato deliberado, com a issue no diff. Se '
            'nao consegue, o conserto e no contrato.',
      );
    });

    test('os quatro que o formulario cobra sao exatamente esses', () {
      // A ponte entre o contrato e a regra: os impedimentos da tela existem
      // um para cada exigencia, e nao ha um quinto.
      expect(
        ImpedimentoDeRegistrar.values.length,
        6,
        reason: 'REPROVA: `ImpedimentoDeRegistrar` mudou de tamanho.\n'
            'Ela tem SEIS valores e nenhum deles e um campo a mais: quatro '
            'sao as exigencias do contrato (especie, porte, onde, quando) e '
            'dois sao estados do MESMO "quando" (o calendario ainda nao '
            'respondeu, e a data escolhida esta no futuro).\n'
            'Um valor novo aqui e uma exigencia nova no formulario, e ela '
            'precisa existir no contrato antes de existir na tela.',
      );
    });
  });

  group('nenhuma exigencia alem das do contrato', () {
    final agora = DateTime(2026, 9, 22, 19);

    /// O minimo absoluto, montado campo a campo e **sem reusar nada** do
    /// proprio rascunho: e o que uma pessoa preenche olhando para o animal.
    RascunhoDoAchado minimo() => RascunhoDoAchado(
          especie: Especie.cao,
          porte: Porte.medio,
          quando: QuandoFoiVisto.agora,
          onde: const OndePorArea(AreaDigitada(cidade: 'São Paulo')),
        );

    test('o minimo do contrato ja libera o registro', () {
      final rascunho = minimo();
      expect(
        rascunho.impedimentoEm(agora),
        isNull,
        reason: 'REPROVA: o formulario esta impedindo o registro de um achado '
            'que traz TUDO o que o contrato exige -- especie, porte, onde e '
            'quando -- e nada mais.\n'
            'Motivo dado pela tela: '
            '"${rascunho.impedimentoEm(agora)?.texto}".\n'
            'Quem acha um cao na rua nao sabe raca, idade nem nome. Se a tela '
            'passou a cobrar um desses, o achado deixa de ser registrado, e '
            'ele e a unica informacao que existe sobre aquele animal.',
      );
      expect(rascunho.podeRegistrarEm(agora), isTrue);
    });

    test('sem foto, sem raca, sem cor, sem sexo e sem observacao, registra',
        () {
      // Os cinco, um por um, para a mensagem apontar qual voltou a ser
      // exigido -- e nao "algum deles".
      final rascunho = minimo();
      expect(rascunho.foto, isNull);
      expect(rascunho.racaCodigo, isNull);
      expect(rascunho.corCodigo, isNull);
      expect(rascunho.sexo, isNull);
      expect(rascunho.observacao, isEmpty);
      expect(
        rascunho.impedimentoEm(agora),
        isNull,
        reason: 'REPROVA: um dos cinco campos opcionais voltou a ser exigido. '
            'Os cinco sao opcionais em `StrayFoundReportInput`, e a historia '
            'existe para que o pouco que a pessoa tem ja valha.',
      );
    });

    test('cada uma das quatro exigencias, sozinha, e o que falta', () {
      // O outro sentido: o portao tambem precisa saber REPROVAR. Sem estes
      // quatro, um `impedimentoEm` que devolvesse sempre `null` passaria nos
      // casos acima com o formulario inteiro sem validacao nenhuma.
      expect(
        (minimo()..especie = null).impedimentoEm(agora),
        ImpedimentoDeRegistrar.semEspecie,
      );
      expect(
        (minimo()..porte = null).impedimentoEm(agora),
        ImpedimentoDeRegistrar.semPorte,
      );
      expect(
        (minimo()..onde = null).impedimentoEm(agora),
        ImpedimentoDeRegistrar.semOnde,
      );
      expect(
        (minimo()..quando = null).impedimentoEm(agora),
        ImpedimentoDeRegistrar.semQuando,
      );
    });

    test('`Outra data` no futuro e recusada aqui, e nao so no servidor', () {
      final rascunho = minimo()
        ..quando = QuandoFoiVisto.outraData
        ..dataEscolhida = agora.add(const Duration(days: 1));
      expect(
        rascunho.impedimentoEm(agora),
        ImpedimentoDeRegistrar.dataNoFuturo,
        reason: 'REPROVA: "achei amanha" passou. Gravado assim, o achado fura '
            'o filtro de "achado antes do desaparecimento" na direcao errada '
            'e ordena a lista do tutor por uma data que nao aconteceu.',
      );
    });

    test('so coordenada tambem basta: o `anyOf` tem dois ramos', () {
      final rascunho = minimo()
        ..onde = const OndePorPonto(
          PontoCapturado(
            lat: -23.55,
            lon: -46.63,
            precisaoEmMetros: 240,
            origem: OrigemDoPonto.deviceGps,
          ),
        );
      expect(
        rascunho.impedimentoEm(agora),
        isNull,
        reason: 'REPROVA: o formulario esta exigindo o texto do bairro mesmo '
            'com coordenada. O `anyOf` do contrato tem DOIS ramos, e exigir '
            'os dois faria quem concedeu o GPS digitar um endereco que ele '
            'acabou de medir.',
      );
      expect(
        rascunho.temRotuloDeArea,
        isFalse,
        reason: 'REPROVA: o rascunho diz ter rotulo de area sem ninguem ter '
            'digitado nada. `area_label` so se monta com texto digitado, e '
            'derivar bairro de coordenada e o que o ADR-0006 proibe.',
      );
    });
  });
}
