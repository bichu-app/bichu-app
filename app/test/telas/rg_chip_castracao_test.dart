// RG Animal (SinPatinhas), chip e castracao no cadastro e na edicao do pet.
// Pedido do cliente em 2026-11-02.
//
// ## POR QUE ESTE ARQUIVO EXISTE
//
// As tres colunas existem desde 2026-09-17 (`migrations/20260917000006_pets.sql`,
// linhas 61, 87 e 94), estao em `PetInput` -- o corpo de `createPet` E de
// `updatePet` -- e **nenhuma tela as pedia**. O rotulo `rotuloDoRgAnimal` e a
// ajuda dele estavam escritos no app e eram citados por zero widgets. O que
// este arquivo guarda nao e a existencia dos campos, e o desenho deles.
//
// ## AS CLASSES DE DEFEITO, uma isca para cada
//
//  1. **`neutered` nascer `false`.** A coluna e ANULAVEL: ha tres estados, e
//     "nao informado" e um deles. Um interruptor de duas posicoes gravaria
//     `false` para todo pet cujo tutor nunca tocou no controle -- inventar
//     resposta que ninguem deu, que e pior que nao ter o campo. O desenho sao
//     TRES opcoes, com `Prefiro nao informar` nascendo selecionada e gravando
//     nulo.
//  2. **O numero do chip viajar depois de a pessoa dizer que nao tem chip.**
//     Desligar o interruptor e uma resposta ("nao tem numero"), e o corpo
//     precisa respeita-la.
//  3. **Campo vazio virar string vazia no corpo.** O banco recusa texto de
//     zero caractere nos dois campos (`CHECK ... BETWEEN 1 AND N`): `''`
//     seria um 400 pedido pela propria tela.
//  4. **O teto de tamanho ficar para o servidor recusar.** 20 no chip e 40 no
//     RG Animal sao conhecidos; a tela cobra, e nao o 400.
//  5. **Mascara ou validacao de formato aparecer.** Decisao escrita na
//     migracao: o SinPatinhas nao tem API publica, e recusar formato que nao
//     se conhece recusaria numero verdadeiro.
//  6. **Os campos existirem so no cadastro.** Os pets ja cadastrados sao a
//     maioria, e e pela edicao que eles alcancam os campos.

import 'dart:convert';

import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/pet/rascunho_de_pet.dart';
import 'package:bichu/telas/pet/textos_do_cadastro.dart';
import 'package:bichu/telas/pet/textos_do_detalhe.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/grupo_segmentado.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../api/pets_api_listar_test.dart' show petDoContrato;
import 'ajuda_de_tela.dart';
import 'meus_pets_test.dart' show abrirOPerfil;

const String _idDoPet = '3f1d7a9e-0000-7000-8000-000000000001';

/// O que a rede recebeu, para as iscas CONTAREM em vez de inferirem do
/// desfecho da tela: uma tela que nao chamou nada parece igual a uma que
/// chamou com o corpo errado.
class _Registro {
  final List<String> criados = <String>[];
  final List<String> atualizados = <String>[];

  Map<String, dynamic> get corpoCriado =>
      jsonDecode(criados.single) as Map<String, dynamic>;

  Map<String, dynamic> get corpoAtualizado =>
      jsonDecode(atualizados.single) as Map<String, dynamic>;
}

Future<http.Response> Function(http.Request) _rede(
  _Registro registro, {
  Map<String, dynamic>? pet,
}) {
  final corpo = pet ?? petDoContrato();
  return (req) async {
    final caminho = req.url.path;

    if (caminho.endsWith('/reference-data')) {
      return json200(referenciaDeTeste());
    }
    if (caminho == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{
        'items': <dynamic>[corpo],
      });
    }
    if (caminho == '/v1/pets' && req.method == 'POST') {
      registro.criados.add(req.body);
      return json200(corpo, status: 201);
    }
    if (caminho == '/v1/pets/$_idDoPet') {
      if (req.method == 'PATCH') {
        registro.atualizados.add(req.body);
        return json200(corpo);
      }
      return json200(corpo);
    }
    return http.Response('', 404);
  };
}

RascunhoDePet _rascunhoDaNina() {
  return RascunhoDePet()
    ..nome = 'Nina'
    ..especie = Especie.cao
    ..porte = Porte.medio;
}

/// Abre F1.5, o passo onde chip e RG Animal moram.
Future<void> _abrirF15(
  WidgetTester tester,
  _Registro registro, {
  RascunhoDePet? rascunho,
}) async {
  await abrirOApp(tester, rede: _rede(registro));
  await irPara(
    tester,
    Rotas.cadastrarPetSinais,
    extra: rascunho ?? _rascunhoDaNina(),
  );
}

/// Abre F1.3, o passo onde a castracao mora.
Future<void> _abrirF13(WidgetTester tester, _Registro registro) async {
  await abrirOApp(tester, rede: _rede(registro));
  await irPara(tester, Rotas.cadastrarPet, extra: _rascunhoDaNina());
}

/// Abre a edicao de um pet ja cadastrado, pelo roteador de verdade.
Future<void> _abrirAEdicao(
  WidgetTester tester,
  _Registro registro, {
  Map<String, dynamic>? pet,
}) async {
  await abrirOPerfil(tester, rede: _rede(registro, pet: pet));
  await irPara(tester, Rotas.detalheDoPetDe(_idDoPet));
  await rolarAte(tester, find.text(TextosDoDetalhe.editar));
  await tocar(tester, find.text(TextosDoDetalhe.editar));
}

Future<void> _salvarAEdicao(WidgetTester tester) async {
  await rolarAte(tester, find.text(TextosDoDetalhe.salvar));
  await tocar(tester, find.text(TextosDoDetalhe.salvar));
}

Future<void> _cadastrar(WidgetTester tester) async {
  final botao = find.widgetWithText(BotaoPrimario, TextosDoCadastro.cadastrar);
  await rolarAte(tester, botao);
  await tocar(tester, botao);
}

/// O campo de texto cujo rotulo desenhado e [rotulo].
///
/// `BichuField` desenha o rotulo como `Text` ACIMA do campo e passa
/// `rotuloVisivel`, entao o `TextField` nao carrega `labelText`: casar pelo
/// tipo dentro do mesmo `BichuField` e o que acha o campo certo.
Finder _campoDe(String rotulo) {
  return find.descendant(
    of: find.ancestor(
      of: find.text('$rotulo (opcional)'),
      matching: find.byType(Column),
    ).first,
    matching: find.byType(TextField),
  );
}

void main() {
  group('o contrato: os tres campos entram no corpo de criar e de editar', () {
    testWidgets('ISCA — o POST nao leva `neutered` quando ninguem respondeu',
        (tester) async {
      // **A classe de defeito numero 1, e a unica que corrompe dado.**
      // `neutered` e anulavel: nulo e "nao informado". O pet que nasce sem
      // ninguem tocar no controle tem de nascer SEM a chave -- um `false`
      // aqui seria o app respondendo pela pessoa.
      final registro = _Registro();
      await _abrirF15(tester, registro);
      await _cadastrar(tester);

      expect(registro.criados, hasLength(1));
      expect(
        registro.corpoCriado.containsKey('neutered'),
        isFalse,
        reason: 'REPROVA: o POST levou `neutered` sem ninguem ter respondido. '
            'A coluna e ANULAVEL e tem TRES estados: gravar `false` por '
            'omissao poe no registro do animal uma resposta que o tutor nunca '
            'deu, e depois ninguem consegue distinguir isso de uma resposta '
            'de verdade.',
      );
    });

    testWidgets('ISCA — o PATCH leva `neutered` NULO, e nao a chave ausente',
        (tester) async {
      // O corpo do `PATCH` e um `PetInput` INTEIRO e o servidor grava todas as
      // colunas a partir dele. Omitir a chave nao preserva o valor anterior:
      // o nulo explicito e o que faz o nao informado sobreviver, e tambem o
      // que permite VOLTAR para nao informado depois de ter respondido.
      final registro = _Registro();
      await _abrirAEdicao(tester, registro);
      await _salvarAEdicao(tester);

      expect(registro.atualizados, hasLength(1));
      final corpo = registro.corpoAtualizado;
      expect(
        corpo.containsKey('neutered'),
        isTrue,
        reason: 'REPROVA: `neutered` nao viajou no PATCH. O corpo e um '
            'PetInput inteiro: a chave que nao viaja vira nulo no servidor de '
            'um jeito que a tela nao controla, e voltar a "nao informado" '
            'deixaria de ser possivel.',
      );
      expect(
        corpo['neutered'],
        isNull,
        reason: 'REPROVA: salvar sem tocar no controle gravou '
            '`${corpo['neutered']}`. O pet veio do servidor sem `neutered`, '
            'logo nao informado, e salvar a edicao nao e responder.',
      );
      for (final chave in <String>['microchip_number', 'sinpatinhas_id']) {
        expect(
          corpo.containsKey(chave),
          isTrue,
          reason: 'REPROVA: `$chave` nao viajou no PATCH, e o corpo e um '
              'PetInput inteiro -- corrigir o nome do pet apagaria este campo '
              'em silencio.',
        );
      }
    });
  });

  group('`neutered`: tres opcoes, e o nao informado e uma delas', () {
    testWidgets('`Prefiro nao informar` NASCE selecionada', (tester) async {
      // A condicao que faz as tres opcoes serem melhores que um interruptor:
      // o controle sempre tem posicao, e a posicao inicial e a que grava nulo.
      // Nascer em `Castrado` ou `Nao castrado` seria o defeito de volta.
      final registro = _Registro();
      await _abrirF13(tester, registro);

      final grupo = find.byType(GrupoSegmentado<Castracao>);
      await rolarAte(tester, grupo);

      expect(
        tester.widget<GrupoSegmentado<Castracao>>(grupo).selecionado,
        Castracao.naoInformou,
        reason: 'REPROVA: o grupo da castracao nasceu em outra opcao. '
            '`Prefiro nao informar` e o estado em que o pet esta antes de '
            'alguem responder, e e a unica posicao inicial que nao inventa '
            'dado.',
      );
      for (final rotulo in <String>[
        'Castrado',
        'Não castrado',
        'Prefiro não informar',
      ]) {
        expect(
          find.text(rotulo),
          findsOne,
          reason: 'REPROVA: a opcao `$rotulo` nao esta na tela. O texto das '
              'tres e do cliente (02/11/2026).',
        );
      }
    });

    // Ida e volta nas tres direcoes, no corpo que de fato sai. O terceiro
    // caso cobre VOLTAR a nao informado: quem marcou por engano tem como
    // desfazer, e desfazer grava nulo e nao `false`.
    //
    // **Tres casos e nao um laco**: `abrirOApp` montado duas vezes no mesmo
    // `testWidgets` deixa a arvore anterior na pilha, e a reprovacao sai
    // apontando para a barra de topo da tela errada.
    for (final caso in <List<Object?>>[
      <Object?>['Castrado', true],
      <Object?>['Não castrado', false],
      <Object?>['Prefiro não informar', null],
    ]) {
      final rotulo = caso[0]! as String;
      final esperado = caso[1];
      testWidgets('ISCA — tocar em `$rotulo` grava `$esperado`',
          (tester) async {
        final registro = _Registro();
        await _abrirAEdicao(tester, registro);

        await rolarAte(tester, find.text(rotulo));
        await tocar(tester, find.text(rotulo));
        await _salvarAEdicao(tester);

        expect(
          registro.corpoAtualizado['neutered'],
          esperado,
          reason: 'REPROVA: tocar em `$rotulo` gravou '
              '`${registro.corpoAtualizado['neutered']}` e nao `$esperado`.',
        );
      });
    }

    // O pet que JA tem resposta abre com ela marcada. Sem isto, abrir a
    // edicao e salvar sem mexer apagaria a resposta -- e o campo que mais
    // sofre e justamente o que ninguem reabre para conferir.
    for (final caso in <List<Object?>>[
      <Object?>[true, Castracao.castrado],
      <Object?>[false, Castracao.naoCastrado],
      <Object?>[null, Castracao.naoInformou],
    ]) {
      final doServidor = caso[0] as bool?;
      final esperado = caso[1]! as Castracao;
      testWidgets(
          'ISCA — `neutered: $doServidor` do servidor abre em `${esperado.name}`',
          (tester) async {
        final registro = _Registro();
        await _abrirAEdicao(
          tester,
          registro,
          pet: petDoContrato()
            ..addAll(<String, dynamic>{'neutered': doServidor}),
        );

        final grupo = find.byType(GrupoSegmentado<Castracao>);
        await rolarAte(tester, grupo);
        expect(
          tester.widget<GrupoSegmentado<Castracao>>(grupo).selecionado,
          esperado,
          reason: 'REPROVA: `neutered: $doServidor` do servidor abriu em '
              'outra opcao que nao `$esperado`. Salvar sem mexer passaria a '
              'reescrever a resposta do tutor.',
        );

        // E salvar sem mexer devolve o MESMO valor, nao um vizinho.
        await _salvarAEdicao(tester);
        expect(
          registro.corpoAtualizado['neutered'],
          doServidor,
          reason: 'REPROVA: ida e volta mudou `neutered` de `$doServidor` '
              'para `${registro.corpoAtualizado['neutered']}` sem ninguem '
              'tocar no controle.',
        );
      });
    }
  });

  group('o chip: o interruptor revela o campo, e desligado nao manda numero',
      () {
    testWidgets('o campo do numero so existe com o interruptor LIGADO',
        (tester) async {
      final registro = _Registro();
      await _abrirF15(tester, registro);

      final interruptor = find.text(TextosDoCadastro.rotuloDoTemChip);
      await rolarAte(tester, interruptor);

      expect(
        find.text('${TextosDoCadastro.rotuloDoChip} (opcional)'),
        findsNothing,
        reason: 'REPROVA: o campo do numero aparece com o interruptor '
            'desligado. O pedido do cliente e que ele seja REVELADO.',
      );

      await tocar(tester, interruptor);
      expect(
        find.text('${TextosDoCadastro.rotuloDoChip} (opcional)'),
        findsOne,
        reason: 'REPROVA: ligar `Tem chip?` nao revelou o campo do numero.',
      );
    });

    testWidgets('ISCA — desligar `Tem chip?` nao manda o numero digitado',
        (tester) async {
      // **A classe de defeito numero 2.** A pessoa digitou, se corrigiu e
      // disse que o animal nao tem chip. Mandar o numero junto dessa resposta
      // gravaria o contrario do que ela respondeu.
      final registro = _Registro();
      await _abrirF15(tester, registro);

      final interruptor = find.text(TextosDoCadastro.rotuloDoTemChip);
      await rolarAte(tester, interruptor);
      await tocar(tester, interruptor);

      final campo = _campoDe(TextosDoCadastro.rotuloDoChip);
      await rolarAte(tester, campo);
      await tester.enterText(campo, '982000123456789');
      await tester.pumpAndSettle();

      // Desliga de novo: "nao tem chip".
      await rolarAte(tester, interruptor);
      await tocar(tester, interruptor);
      await _cadastrar(tester);

      final corpo = registro.corpoCriado;
      expect(
        corpo.containsKey('microchip_number'),
        isFalse,
        reason: 'REPROVA: o POST levou `microchip_number` com o interruptor '
            'DESLIGADO. Desligar e a resposta "nao tem numero", e o corpo '
            'tem de respeita-la.',
      );
      expect(
        jsonEncode(corpo),
        isNot(contains('982000123456789')),
        reason: 'REPROVA: o numero digitado viajou por outra chave.',
      );
    });

    testWidgets('ligado e preenchido, o numero viaja', (tester) async {
      // O controle positivo do caso acima: sem ele, um campo que NUNCA manda
      // o numero passaria as duas iscas de desligado.
      final registro = _Registro();
      await _abrirF15(tester, registro);

      final interruptor = find.text(TextosDoCadastro.rotuloDoTemChip);
      await rolarAte(tester, interruptor);
      await tocar(tester, interruptor);

      final campo = _campoDe(TextosDoCadastro.rotuloDoChip);
      await rolarAte(tester, campo);
      await tester.enterText(campo, '982000123456789');
      await tester.pumpAndSettle();
      await _cadastrar(tester);

      expect(
        registro.corpoCriado['microchip_number'],
        '982000123456789',
        reason: 'REPROVA: o numero do chip nao chegou ao corpo. Sem este '
            'caso, as iscas de "desligado nao manda" ficariam verdes num '
            'campo que nao manda nunca.',
      );
    });

    testWidgets('ISCA — ligado e VAZIO nao manda string vazia', (tester) async {
      // **A classe de defeito numero 3.** O banco recusa texto de zero
      // caractere (`CHECK ... BETWEEN 1 AND 20`): `''` seria um 400 pedido
      // pela propria tela.
      final registro = _Registro();
      await _abrirF15(tester, registro);

      final interruptor = find.text(TextosDoCadastro.rotuloDoTemChip);
      await rolarAte(tester, interruptor);
      await tocar(tester, interruptor);
      await _cadastrar(tester);

      final corpo = registro.corpoCriado;
      expect(
        corpo.containsKey('microchip_number'),
        isFalse,
        reason: 'REPROVA: o POST levou `microchip_number` vazio. O banco '
            'recusa string de zero caractere, entao a tela estaria pedindo um '
            '400 por um campo que a pessoa deixou em branco de proposito.',
      );
    });
  });

  group('o RG Animal: opcional, livre de formato, com o teto na tela', () {
    testWidgets('o campo usa o rotulo e a AJUDA escritos em 17/09',
        (tester) async {
      // Os dois textos existiam no app e eram citados por zero widgets. A
      // ajuda e tambem onde a decisao de o campo ser opcional esta escrita,
      // e por isso ela nao foi reescrita.
      final registro = _Registro();
      await _abrirF15(tester, registro);

      final campo = _campoDe(TextosDoCadastro.rotuloDoRgAnimal);
      await rolarAte(tester, campo);

      expect(
        find.text('${TextosDoCadastro.rotuloDoRgAnimal} (opcional)'),
        findsOne,
        reason: 'REPROVA: o RG Animal nao esta na tela com o rotulo de '
            '`rotuloDoRgAnimal`, ou nao esta marcado como opcional.',
      );
      expect(
        find.textContaining('Se você não tem, pule'),
        findsOne,
        reason: 'REPROVA: a ajuda de 17/09 nao esta na tela. Ela e onde a '
            'decisao de o campo ser opcional esta escrita.',
      );
    });

    testWidgets('ISCA — vazio nao manda string vazia', (tester) async {
      final registro = _Registro();
      await _abrirF15(tester, registro);
      await _cadastrar(tester);

      expect(
        registro.corpoCriado.containsKey('sinpatinhas_id'),
        isFalse,
        reason: 'REPROVA: o POST levou `sinpatinhas_id` vazio. O banco recusa '
            'texto de zero caractere (1 a 40).',
      );
    });

    testWidgets('ISCA — acima de 40 caracteres e recusado NA TELA',
        (tester) async {
      // **A classe de defeito numero 4.** O teto e conhecido: deixar o
      // servidor recusar poe a pessoa diante de um erro depois de ela ter
      // preenchido a tela inteira.
      final registro = _Registro();
      await _abrirF15(tester, registro);

      final campo = _campoDe(TextosDoCadastro.rotuloDoRgAnimal);
      await rolarAte(tester, campo);
      await tester.enterText(campo, 'X' * 60);
      await tester.pumpAndSettle();
      await _cadastrar(tester);

      final enviado = registro.corpoCriado['sinpatinhas_id'] as String;
      expect(
        enviado.length,
        TextosDoCadastro.limiteDoRgAnimal,
        reason: 'REPROVA: a tela deixou passar ${enviado.length} caracteres '
            'em `sinpatinhas_id`, e o teto do contrato e '
            '${TextosDoCadastro.limiteDoRgAnimal}. O servidor recusaria com '
            '400 depois de a pessoa preencher a tela inteira.',
      );
    });

    testWidgets('ISCA — o chip tambem para em 20 na tela', (tester) async {
      final registro = _Registro();
      await _abrirF15(tester, registro);

      final interruptor = find.text(TextosDoCadastro.rotuloDoTemChip);
      await rolarAte(tester, interruptor);
      await tocar(tester, interruptor);

      final campo = _campoDe(TextosDoCadastro.rotuloDoChip);
      await rolarAte(tester, campo);
      await tester.enterText(campo, '9' * 40);
      await tester.pumpAndSettle();
      await _cadastrar(tester);

      final enviado = registro.corpoCriado['microchip_number'] as String;
      expect(
        enviado.length,
        TextosDoCadastro.limiteDoChip,
        reason: 'REPROVA: a tela deixou passar ${enviado.length} caracteres '
            'em `microchip_number`, e o teto e '
            '${TextosDoCadastro.limiteDoChip}.',
      );
    });

    testWidgets('ISCA — nada de mascara nem de formatador de formato',
        (tester) async {
      // Decisao escrita na propria migracao (17/09): o SinPatinhas nao tem
      // API publica, e validar formato que nao se conhece RECUSARIA numero
      // verdadeiro. O unico `inputFormatter` aceitavel e o do teto de
      // tamanho, que o `maxLength` ja poe.
      final registro = _Registro();
      await _abrirF15(tester, registro);

      final campo = _campoDe(TextosDoCadastro.rotuloDoRgAnimal);
      await rolarAte(tester, campo);

      final campoDeTexto = tester.widget<TextField>(campo);
      expect(
        campoDeTexto.inputFormatters,
        anyOf(isNull, isEmpty),
        reason: 'REPROVA: o RG Animal ganhou formatador. O campo e LIVRE por '
            'decisao de 17/09, escrita na migracao: recusar formato que nao '
            'se conhece recusaria numero verdadeiro.',
      );

      // E o que foi digitado chega INTEIRO, com pontuacao e letra.
      await tester.enterText(campo, 'BR-2026/abc 12');
      await tester.pumpAndSettle();
      await _cadastrar(tester);
      expect(
        registro.corpoCriado['sinpatinhas_id'],
        'BR-2026/abc 12',
        reason: 'REPROVA: a tela mexeu no que foi digitado no RG Animal.',
      );
    });
  });

  group('os tres campos existem no cadastro E na edicao', () {
    testWidgets('ISCA — a edicao tem os tres', (tester) async {
      // **A classe de defeito numero 6.** Campo que so existe no cadastro nao
      // alcanca os pets ja cadastrados, e eles sao a maioria.
      final registro = _Registro();
      await _abrirAEdicao(tester, registro);

      await rolarAte(tester, find.byType(GrupoSegmentado<Castracao>));
      expect(
        find.byType(GrupoSegmentado<Castracao>),
        findsOne,
        reason: 'REPROVA: a edicao nao tem o grupo da castracao.',
      );

      await rolarAte(tester, find.text(TextosDoCadastro.rotuloDoTemChip));
      expect(find.text(TextosDoCadastro.rotuloDoTemChip), findsOne);

      await rolarAte(
        tester,
        find.text('${TextosDoCadastro.rotuloDoRgAnimal} (opcional)'),
      );
      expect(
        find.text('${TextosDoCadastro.rotuloDoRgAnimal} (opcional)'),
        findsOne,
        reason: 'REPROVA: a edicao nao tem o RG Animal. Os pets ja '
            'cadastrados sao a maioria, e e por aqui que eles o alcancam.',
      );
    });

    testWidgets('ISCA — a edicao abre com o chip que o pet JA tem',
        (tester) async {
      // O interruptor nao e estado de tela: ele deriva de `microchip_number`.
      // Um pet com chip que abrisse com o interruptor desligado perderia o
      // numero no primeiro `Salvar`.
      final registro = _Registro();
      await _abrirAEdicao(
        tester,
        registro,
        pet: petDoContrato()
          ..addAll(<String, dynamic>{
            'microchip_number': '982000123456789',
            'sinpatinhas_id': 'RG-998',
          }),
      );

      final campo = _campoDe(TextosDoCadastro.rotuloDoChip);
      await rolarAte(tester, campo);
      expect(
        tester.widget<TextField>(campo).controller?.text,
        '982000123456789',
        reason: 'REPROVA: o pet tem chip e a edicao abriu com o campo vazio '
            'ou com o interruptor desligado. O primeiro `Salvar` apagaria o '
            'numero.',
      );

      await _salvarAEdicao(tester);
      final corpo = registro.corpoAtualizado;
      expect(corpo['microchip_number'], '982000123456789');
      expect(
        corpo['sinpatinhas_id'],
        'RG-998',
        reason: 'REPROVA: salvar sem mexer apagou o RG Animal do pet.',
      );
    });
  });
}
