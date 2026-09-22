// BICHUS-35 — "Registrar um achado avulso, sem QR, **com o que da para ver**".
//
// A ISCA DESTE ARQUIVO: **quem acha um cao na rua nao sabe raca, nem idade,
// nem nome, e a pressao para exigir esses campos e constante e razoavel.**
// Cada um deles melhora o cruzamento por atributos (criterio 7 da BICHUS-35),
// e e exatamente por isso que alguem vai querer torna-los obrigatorios: o
// campo vazio parece desperdicio de quem esta olhando a qualidade do
// pareamento, e nao a pessoa segurando um animal assustado na calcada.
//
// O que o contrato diz hoje, e o que este arquivo trava:
//
//     StrayFoundReportInput.required: [species, size, found_at]
//     anyOf: [ {required: [location]}, {required: [area]} ]
//
// Especie, porte, quando, e onde. **Quatro coisas que se enxergam.** Raca,
// cor, sexo, nome e idade estao no contrato como OPCIONAIS, e o proprio
// contrato explica por que -- `breed_code` carrega a frase "quem acha um
// animal na rua raramente sabe a raca, e e por isso que este campo nao e
// obrigatorio aqui".
//
// POR QUE ESTE ARQUIVO EXISTE NO APP, e nao no backend
// -----------------------------------------------------
// Porque o formulario de F3.5 e do app, e e ele que traduz "obrigatorio" em
// asterisco e em botao desabilitado. O backend pode aceitar um achado sem
// raca e o app impedir o envio assim mesmo -- e ai a promessa da historia
// morre no cliente, com o servidor inocente e verde.
//
// Hoje ele cobra so o contrato, porque **o formulario ainda nao existe**: a
// BICHUS-35 nao foi construida (o dominio `found` nao esta implementado no
// backend, e a historia ficou em To Do). Quando o formulario chegar, o segundo
// grupo abaixo passa a ter o que medir, e ele ja diz o que espera.
//
// Cobrar o contrato sozinho ja vale: e do contrato que o formulario vai sair,
// e um `required` a mais ali e o caminho mais curto para o campo impossivel
// aparecer na tela sem ninguem ter decidido isso.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

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
    'nada, e ficar verde sem conferir e o defeito que ele existe para '
    'impedir.',
  );
}

/// O bloco YAML de um schema, do nome dele ate o proximo schema no mesmo nivel.
///
/// Recorte por indentacao, e nao parser de YAML: o projeto nao tem dependencia
/// de YAML no app, e trazer uma para ler quatro linhas seria pagar caro. O
/// recorte **reprova quando nao acha**, que e o que impede o verde por vazio.
String _schema(String spec, String nome) {
  final inicio = spec.indexOf('\n    $nome:\n');
  if (inicio < 0) {
    throw StateError(
      'REPROVA: nao achei o schema `$nome` em `api/openapi.yaml`. Ou ele foi '
      'renomeado, ou foi removido. Nos dois casos este portao deixou de '
      'cobrar o que ele existe para cobrar, e precisa ser corrigido junto.',
    );
  }
  final resto = spec.substring(inicio + 1);
  final proximo = RegExp(r'\n {4}\w+:\n').firstMatch(resto.substring(1));
  return proximo == null ? resto : resto.substring(0, proximo.start + 1);
}

/// A lista `required:` de um schema, na forma `[a, b, c]`.
Set<String> _obrigatorios(String bloco) {
  final m = RegExp(r'required:\s*\[([^\]]*)\]').firstMatch(bloco);
  if (m == null) return <String>{};
  return m
      .group(1)!
      .split(',')
      .map((s) => s.trim())
      .where((s) => s.isNotEmpty)
      .toSet();
}

void main() {
  final raiz = _raizDoRepositorio().path;
  final spec = File('$raiz/api/openapi.yaml').readAsStringSync();

  group('o achado avulso aceita o que da para ver, e nada alem', () {
    late final String bloco;
    late final Set<String> exigidos;

    setUpAll(() {
      bloco = _schema(spec, 'StrayFoundReportInput');
      exigidos = _obrigatorios(bloco);
    });

    test('o schema foi encontrado e tem `required`', () {
      // Sem isto, um recorte que falhasse devolveria conjunto vazio e TODOS os
      // casos abaixo passariam -- verde por nao estar olhando para nada.
      expect(
        exigidos,
        isNotEmpty,
        reason: 'REPROVA: nao consegui ler a lista `required` de '
            '`StrayFoundReportInput`. O formato do contrato mudou e este '
            'portao ficou cego.',
      );
    });

    test('exige exatamente especie, porte e quando', () {
      expect(
        exigidos,
        <String>{'species', 'size', 'found_at'},
        reason: 'REPROVA: a lista de campos obrigatorios do achado avulso '
            'mudou.\n'
            'A BICHUS-35 se chama "com o que da para ver": especie, porte e '
            'quando sao as tres coisas que quem encontra um animal na rua '
            'consegue responder olhando para ele. Achei: $exigidos',
      );
    });

    test('NAO exige nada que quem acha na rua nao tem como saber', () {
      // O caso central. Cada um destes melhora o cruzamento por atributos, e e
      // por isso que cada um deles vai ser proposto como obrigatorio um dia.
      const impossiveis = <String, String>{
        'breed_code': 'a raca, que quem acha na rua raramente sabe',
        'breed_free_text': 'a raca escrita a mao',
        'name': 'o nome do animal, que so o tutor sabe',
        'age': 'a idade',
        'birth_date': 'a data de nascimento',
        'sex': 'o sexo, que exige manusear um animal assustado',
        'primary_color_code': 'a cor na lista fechada de referencia',
        'microchip': 'o microchip, que exige leitor',
        'photo_upload_id': 'a foto, que pode falhar no envio',
      };
      for (final campo in impossiveis.entries) {
        expect(
          exigidos.contains(campo.key),
          isFalse,
          reason: 'REPROVA: `${campo.key}` virou obrigatorio no achado avulso '
              '-- ${campo.value}.\n'
              'Quem acha um cao na rua nao sabe raca, idade nem nome, e '
              'exigir isso nao melhora o cruzamento: impede o registro. O '
              'achado que nao chega a existir tem zero chance de encontrar o '
              'tutor, e um achado incompleto tem alguma.\n'
              'O criterio 4 da BICHUS-35 ja decidiu esse tipo de troca para a '
              'foto: "achado sem foto vale menos, mas vale". Vale igual aqui.',
        );
      }
    });

    test('a foto e opcional, e o criterio 4 depende disso', () {
      expect(
        exigidos.contains('photo_upload_id'),
        isFalse,
        reason: 'REPROVA: a foto virou obrigatoria. O criterio 4 da BICHUS-35 '
            'diz que, se o upload falhar, "o achado e registrado SEM a foto e '
            'o upload continua em segundo plano". Obrigatoria, ela transforma '
            'uma falha de rede em achado que nao existe.',
      );
    });

    test('onde continua aceitando coordenada OU area', () {
      // O elo com a BICHUS-23, criterio 5: quem nega a permissao de
      // localizacao informa a area, e o achado existe do mesmo jeito. Trocar o
      // `anyOf` por `required: [location]` faria a recusa da permissao virar
      // um beco sem saida no servidor, com o app inteiro continuando verde.
      expect(
        bloco.contains('anyOf:'),
        isTrue,
        reason: 'REPROVA: `StrayFoundReportInput` perdeu o `anyOf` de '
            '`location` / `area`.',
      );
      expect(
        RegExp(r'anyOf:\s*\n\s*- required: \[location\]\s*\n\s*- required: '
                r'\[area\]')
            .hasMatch(bloco),
        isTrue,
        reason: 'REPROVA: o achado deixou de aceitar `area` como alternativa a '
            '`location`.\n'
            'O criterio 5 da BICHUS-23 e o 6 da BICHUS-35 dizem que quem nega '
            'a permissao de localizacao digita bairro, cidade e UF, e o '
            'achado e registrado do mesmo jeito -- perdendo o criterio de '
            'distancia, nao o registro. Exigir coordenada transforma a recusa '
            'de uma permissao num beco sem saida.',
      );
    });

    test('a area do contrato exige so a cidade', () {
      // O app monta `AreaDigitada` com bairro e UF opcionais por causa desta
      // linha. Se o contrato passar a exigir `state`, o app precisa saber --
      // e hoje ele recusaria silenciosamente o envio de quem nao souber a
      // sigla do estado onde encontrou o animal.
      final area = _obrigatorios(_schema(spec, 'Area'));
      expect(
        area,
        <String>{'city'},
        reason: 'REPROVA: os campos obrigatorios de `Area` mudaram para '
            '$area. `AreaDigitada` no app trata bairro e UF como opcionais '
            'por causa desta linha: exigir a sigla do estado para registrar um '
            'achado e mais um campo que quem esta na rua pode nao ter.',
      );
    });
  });

  group('quando F3.5 existir, o formulario herda a mesma regra', () {
    // A BICHUS-35 ficou em To Do: o dominio `found` nao esta implementado no
    // backend (`POST /v1/found-reports` esta no contrato e nao em `src/`), e a
    // historia foi separada. Quando o formulario chegar, este grupo passa a
    // medir a TELA, e nao so o contrato.
    //
    // Ele ja existe, vazio e reprovando por ausencia? Nao: um caso que
    // reprovasse hoje deixaria a suite vermelha por trabalho que ninguem
    // comecou. O que fica e o registro de onde a trava entra, e o caso abaixo
    // ACUSA no dia em que a tela nascer sem ela.
    test('a tela de F3.5 ainda nao existe, e quando existir este grupo cresce',
        () {
      final tela = File('$raiz/app/lib/telas/achado');
      expect(
        tela.existsSync(),
        isFalse,
        reason: 'ATENCAO, e nao defeito: `app/lib/telas/achado` passou a '
            'existir, entao F3.5 foi construida.\n'
            'Este grupo precisa crescer junto, com um caso de widget que monte '
            'o formulario e prove que ele ENVIA com especie, porte, quando e '
            'onde -- e mais nada. O contrato aceitar o achado incompleto nao '
            'basta se o botao de enviar ficar desabilitado esperando a raca.\n'
            'Enquanto so o contrato existia, so o contrato dava para cobrar.',
      );
    });
  });
}
