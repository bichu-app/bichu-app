// As iscas da BICHUS-61 (editar) e da BICHUS-60 (excluir).
//
// Tres classes de defeito, e cada uma tem aqui o caso que PRECISA reprovar
// quando o mecanismo e desligado:
//
//  1. **Autorizacao** — a edicao ou a exclusao ficarem alcancaveis para um pet
//     que nao e do chamador. O servidor responde 404 (ADR-0021, nunca 403), e
//     a tela nao pode oferecer acao nenhuma sobre um pet que ela nao tem.
//  2. **Confirmacao** — a exclusao acontecer sem a folha confirmar. O `DELETE`
//     so pode sair do botao destrutivo; tocar em `Excluir`, cancelar, voltar
//     pelo gesto do sistema e arrastar a folha para baixo nao podem chegar
//     nele.
//  3. **A tag nao volta** — a tela deixar de dizer que o codigo e desativado
//     para sempre. E a frase da ADR-0004, e e a unica protecao de quem esta
//     prestes a perder a plaquinha por engano.
//
// **A fonte e sempre a arvore montada, e nunca o texto do codigo.** Uma
// varredura de fonte casaria com a mencao ao proprio mecanismo dentro de um
// comentario -- ja aconteceu neste repositorio, e apagar o codigo de verdade
// deixava a isca verde.
//
// O `DELETE` e contado, e nao inferido do desfecho da tela: uma tela que
// navegasse de volta sem chamar nada pareceria identica a uma que excluiu, e
// o contrario tambem -- um `DELETE` disparado por engano com a tela parada
// nao mudaria pixel nenhum.

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/pet/campos_do_pet.dart';
import 'package:bichu/telas/pet/tela_detalhe_do_pet.dart';
import 'package:bichu/telas/pet/tela_editar_pet.dart';
import 'package:bichu/telas/pet/textos_do_detalhe.dart';
import 'package:bichu/widgets/folha_destrutiva.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../api/pets_api_listar_test.dart' show petDoContrato;
import 'ajuda_de_tela.dart';
import 'meus_pets_test.dart' show abrirOPerfil;

const String _idDoPet = '3f1d7a9e-0000-7000-8000-000000000001';
const String _idDeOutraConta = '3f1d7a9e-0000-7000-8000-00000000dead';

/// O que a rede recebeu, para as iscas contarem em vez de inferirem.
class _Registro {
  final List<String> excluidos = <String>[];
  final List<Map<String, String>> atualizados = <Map<String, String>>[];
}

/// Uma rede com um pet do tutor e um pet que **nao e dele**.
///
/// O segundo responde **404, e nao 403** (ADR-0021): a autorizacao mora na
/// clausula `WHERE` do servidor, e distinguir "nao existe" de "nao e seu"
/// confirmaria a existencia do registro para quem nao e o dono.
Future<http.Response> Function(http.Request) _rede(
  _Registro registro, {
  Map<String, dynamic>? pet,
  bool falharAoExcluir = false,
}) {
  final corpo = pet ?? petDoContrato();
  return (req) async {
    final caminho = req.url.path;

    if (caminho == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{
        'items': <dynamic>[corpo],
      });
    }
    if (caminho.endsWith('/reference-data')) {
      return json200(referenciaDeTeste());
    }

    if (caminho == '/v1/pets/$_idDeOutraConta') {
      // Nao e do chamador. 404, nunca 403.
      return problema('not-found', 404);
    }

    if (caminho == '/v1/pets/$_idDoPet') {
      switch (req.method) {
        case 'GET':
          return json200(corpo);
        case 'PATCH':
          registro.atualizados.add(<String, String>{'corpo': req.body});
          return json200(corpo);
        case 'DELETE':
          registro.excluidos.add(_idDoPet);
          if (falharAoExcluir) return problema('internal-error', 500);
          return http.Response('', 204);
      }
    }
    return http.Response('', 404);
  };
}

/// Abre T.1 pelo roteador de verdade, a partir de `Perfil` > `Meus pets`.
Future<void> _abrirODetalhe(
  WidgetTester tester, {
  required _Registro registro,
  Map<String, dynamic>? pet,
  String id = _idDoPet,
  bool falharAoExcluir = false,
}) async {
  await abrirOPerfil(
    tester,
    rede: _rede(registro, pet: pet, falharAoExcluir: falharAoExcluir),
  );
  await irPara(tester, Rotas.detalheDoPetDe(id));
}

/// Rola ate a acao e toca nela.
///
/// **`Editar` e `Excluir` vivem no FIM de T.1, abaixo da dobra**, e isso e a
/// especificacao 7.6.3 sendo cumprida: sao acoes destrutivas, ficam longe da
/// acao principal. O `ListView` so constroi o que cabe na tela, entao um `tap`
/// direto reprovaria por nao achar o widget -- que nao e o defeito que
/// nenhuma destas iscas procura.
Future<void> _tocarNaAcao(WidgetTester tester, String rotulo) async {
  await rolarAte(tester, find.text(rotulo));
  await tocar(tester, find.text(rotulo));
}

void main() {
  // -------------------------------------------------------------------------
  // ISCA 1 — a autorizacao
  // -------------------------------------------------------------------------
  group('ISCA — editar e excluir nao alcancam pet de outra conta', () {
    testWidgets('o pet que nao e do chamador nao oferece acao nenhuma',
        (tester) async {
      final registro = _Registro();
      await _abrirODetalhe(
        tester,
        registro: registro,
        id: _idDeOutraConta,
      );

      // A tela diz o que aconteceu, **sem distinguir "nao existe" de "nao e
      // seu"**: as duas respostas sao 404 de proposito.
      expect(find.text(TextosDoDetalhe.petForaDaConta), findsOneWidget);

      expect(
        find.text(TextosDoDetalhe.editar),
        findsNothing,
        reason: 'REPROVA: `Editar` esta na arvore de um pet que o servidor '
            'recusou. A tela nao tem o pet, e oferecer a edicao dele e '
            'oferecer uma escrita que o `WHERE` do servidor vai recusar -- ou, '
            'pior, que ele aceitaria se a autorizacao caisse.',
      );
      expect(
        find.text(TextosDoDetalhe.excluir),
        findsNothing,
        reason: 'REPROVA: `Excluir` esta na arvore de um pet que nao e do '
            'chamador.',
      );
      expect(
        registro.excluidos,
        isEmpty,
        reason: 'REPROVA: saiu um DELETE para um pet que a tela nem carregou.',
      );
    });

    testWidgets('a rota de edicao alcancada direto nao abre o formulario',
        (tester) async {
      // O link direto e o caminho que contorna a tela: `/pets/<id>/editar` sem
      // passar por T.1. Ele nao pode virar um formulario que edita um pet que
      // o app nunca leu -- ele cai no detalhe, que sabe carregar e sabe
      // recusar.
      final registro = _Registro();
      await abrirOPerfil(tester, rede: _rede(registro));
      await irPara(tester, Rotas.editarPetDe(_idDeOutraConta));

      expect(find.byType(TelaEditarPet), findsNothing);
      expect(find.byType(TelaDetalheDoPet), findsOneWidget);
      expect(find.text(TextosDoDetalhe.petForaDaConta), findsOneWidget);
      expect(registro.atualizados, isEmpty);
    });
  });

  // -------------------------------------------------------------------------
  // ISCA 2 — a confirmacao
  // -------------------------------------------------------------------------
  group('ISCA — a exclusao nao acontece sem a confirmacao', () {
    testWidgets('tocar em `Excluir` abre a folha e NAO exclui', (tester) async {
      final registro = _Registro();
      await _abrirODetalhe(tester, registro: registro);

      await _tocarNaAcao(tester, TextosDoDetalhe.excluir);

      expect(
        find.byType(FolhaDestrutiva),
        findsOneWidget,
        reason: 'REPROVA: `Excluir` nao abriu a folha de confirmacao.',
      );
      expect(
        registro.excluidos,
        isEmpty,
        reason: 'REPROVA: o DELETE saiu no toque em `Excluir`, antes de '
            'qualquer confirmacao. O criterio 3 da BICHUS-60 exige '
            'confirmacao explicita, e a ADR-0004 diz que isto nao volta: a '
            'tag e desativada para sempre.',
      );
    });

    testWidgets('cancelar fecha a folha e NAO exclui', (tester) async {
      final registro = _Registro();
      await _abrirODetalhe(tester, registro: registro);

      await _tocarNaAcao(tester, TextosDoDetalhe.excluir);
      await tocar(tester, find.text('Cancelar'));

      expect(find.byType(FolhaDestrutiva), findsNothing);
      expect(
        registro.excluidos,
        isEmpty,
        reason: 'REPROVA: cancelar excluiu o pet.',
      );
      // O pet continua na tela: cancelar nao navega para lugar nenhum.
      expect(find.byType(TelaDetalheDoPet), findsOneWidget);
    });

    testWidgets('o gesto de voltar do sistema equivale a cancelar',
        (tester) async {
      // **`Navigator.pop` sem valor devolve nulo, e nulo e `false`.** Um
      // `?? true` naquela linha transformaria o gesto de voltar num
      // confirmador de exclusao, e seria invisivel na revisao do diff.
      final registro = _Registro();
      await _abrirODetalhe(tester, registro: registro);

      await _tocarNaAcao(tester, TextosDoDetalhe.excluir);
      expect(find.byType(FolhaDestrutiva), findsOneWidget);

      final contexto = tester.element(find.byType(FolhaDestrutiva));
      Navigator.of(contexto).pop();
      await tester.pumpAndSettle();

      expect(
        registro.excluidos,
        isEmpty,
        reason: 'REPROVA: fechar a folha pelo gesto de voltar excluiu o pet. '
            'Fechar por gesto equivale a cancelar, nunca a confirmar '
            '(design system 11.9.1).',
      );

      // **E nao basta o DELETE nao sair: a tela nao pode DAR A EXCLUSAO POR
      // FEITA.**
      //
      // Medido: com `confirmou ?? true` em `mostrarFolhaDestrutiva`, nenhum
      // DELETE sai -- `aoConfirmar` vive dentro da folha e nao e chamado --,
      // entao a linha acima sozinha continuava verde. O que acontecia era
      // pior e invisivel: o app limpava o cache, anunciava "Nina foi
      // excluida" e navegava para o Perfil, com o pet **vivo no servidor**. A
      // pessoa acreditaria ter excluido, e a plaquinha continuaria
      // respondendo.
      expect(
        find.byType(TelaDetalheDoPet),
        findsOneWidget,
        reason: 'REPROVA: o gesto de voltar tirou a pessoa do detalhe do pet. '
            'Cancelar nao navega para lugar nenhum, e tratar o gesto como '
            'confirmacao faz o app dizer que excluiu algo que continua la.',
      );
    });

    testWidgets('so o botao destrutivo exclui, e ai sim o DELETE sai',
        (tester) async {
      // O caso POSITIVO. Sem ele as tres iscas acima ficariam verdes com a
      // exclusao quebrada: portao que so sabe reprovar some do CI do mesmo
      // jeito que portao que so sabe aprovar.
      final registro = _Registro();
      await _abrirODetalhe(tester, registro: registro);

      await _tocarNaAcao(tester, TextosDoDetalhe.excluir);
      await tocar(tester, find.text(TextosDoDetalhe.confirmarExclusao));

      expect(
        registro.excluidos,
        <String>[_idDoPet],
        reason: 'REPROVA: a confirmacao nao chamou `DELETE /pets/{petId}`.',
      );
    });

    testWidgets('a falha do DELETE mantem a folha aberta e nao diz excluido',
        (tester) async {
      // O caminho esperado do erro (11.9.1): a folha permanece aberta, nada
      // foi destruido, e a falha aparece na faixa. Fechar aqui devolveria a
      // pessoa para uma lista que ainda tem o pet, sem dizer por que.
      final registro = _Registro();
      await _abrirODetalhe(tester, registro: registro, falharAoExcluir: true);

      await _tocarNaAcao(tester, TextosDoDetalhe.excluir);
      await tocar(tester, find.text(TextosDoDetalhe.confirmarExclusao));

      expect(find.byType(FolhaDestrutiva), findsOneWidget);
      expect(find.byType(TelaDetalheDoPet), findsOneWidget);
    });
  });

  // -------------------------------------------------------------------------
  // ISCA 3 — a tela diz que a tag nao volta
  // -------------------------------------------------------------------------
  group('ISCA — a confirmacao diz que a tag nao volta', () {
    testWidgets('a frase da ADR-0004 esta na arvore ANTES de confirmar',
        (tester) async {
      final registro = _Registro();
      await _abrirODetalhe(tester, registro: registro);
      await _tocarNaAcao(tester, TextosDoDetalhe.excluir);

      // **Medido na arvore montada, e por substring do texto renderizado.**
      //
      // A frase vive dentro do corpo da folha, concatenada ao resto pelo
      // `corpoDaExclusao`. Procurar o `Text` inteiro por igualdade prenderia a
      // isca a redacao do paragrafo em volta; procurar a frase reprova quando
      // ela some, que e a classe de defeito.
      final corpo = tester
          .widgetList<Text>(
            find.descendant(
              of: find.byType(FolhaDestrutiva),
              matching: find.byType(Text),
            ),
          )
          .map((t) => t.data ?? '')
          .join('\n');

      // **As frases sao LITERAIS aqui, e nao `TextosDoDetalhe.aTagNaoVolta`.**
      //
      // Comparar o texto renderizado com a mesma constante que o produz e
      // tautologia: esvaziar a constante deixaria os dois lados iguais e a
      // isca verde, que e exatamente o defeito que ela existe para pegar.
      // Medido: com `contains(TextosDoDetalhe.aTagNaoVolta)`, trocar a
      // constante por "A plaquinha para de funcionar." passava.
      //
      // Os literais prendem as DUAS metades da ADR-0004, que sao as duas que
      // as pessoas confundem: o efeito (a plaquinha para) e a
      // irreversibilidade (o codigo nao volta, e nao vai para outro pet). So
      // a primeira deixa quem le imaginando que o atendimento religa depois.
      for (final frase in <String>[
        'para de funcionar',
        'não tem como voltar atrás',
        'para sempre',
        'não pode ser usado em outro pet',
      ]) {
        expect(
          corpo,
          contains(frase),
          reason: 'REPROVA: a confirmacao de exclusao nao diz "$frase". A '
              'ADR-0004 e explicita -- "o codigo pertence ao pet e e '
              'imutavel; nao se edita, nao se transfere para outro pet, nao '
              'se reativa" -- e quem exclui por engano NAO recupera a tag. '
              'Sem esta frase a pessoa confirma achando que da para desfazer.',
        );
      }
      expect(
        registro.excluidos,
        isEmpty,
        reason: 'REPROVA: a frase foi conferida depois de o DELETE ja ter '
            'saido. Ela precisa ser lida ANTES da confirmacao, senao e aviso '
            'de velorio.',
      );
    });

    testWidgets('o que some e enumerado, e o caso aberto entra so quando ha',
        (tester) async {
      final registro = _Registro();

      // Sem caso aberto: o aviso extra NAO aparece. Um aviso que aparece
      // sempre e um aviso que ninguem le no dia em que ele vale.
      await _abrirODetalhe(tester, registro: registro);
      await _tocarNaAcao(tester, TextosDoDetalhe.excluir);
      expect(
        find.text(TextosDoDetalhe.casoAbertoSeraEncerrado('Nina')),
        findsNothing,
      );
      expect(find.textContaining('plaquinha'), findsWidgets);
    });

    testWidgets('com caso aberto, a folha avisa que ele sera encerrado',
        (tester) async {
      // Criterio 4 da BICHUS-60.
      final registro = _Registro();
      await _abrirODetalhe(
        tester,
        registro: registro,
        pet: petDoContrato(casoAberto: 'caso-1'),
      );
      await _tocarNaAcao(tester, TextosDoDetalhe.excluir);

      expect(
        find.text(TextosDoDetalhe.casoAbertoSeraEncerrado('Nina')),
        findsOneWidget,
        reason: 'REPROVA: o pet esta dado como perdido e a folha nao avisa '
            'que a exclusao encerra o caso sem desfecho.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // BICHUS-61 — a edicao
  // -------------------------------------------------------------------------
  group('BICHUS-61 — a edicao usa os MESMOS campos do cadastro', () {
    testWidgets('o formulario monta os dois blocos de campo do cadastro',
        (tester) async {
      final registro = _Registro();
      await _abrirODetalhe(tester, registro: registro);
      await _tocarNaAcao(tester, TextosDoDetalhe.editar);

      expect(find.byType(TelaEditarPet), findsOneWidget);
      // **Os mesmos widgets do assistente, e nao uma segunda versao deles.**
      // Se alguem escrever campos proprios aqui, estes dois somem da arvore e
      // o caso reprova -- que e o ponto: duas formas diferentes de editar os
      // mesmos campos e defeito, nao escolha.
      expect(find.byType(CamposDeIdentificacao), findsOneWidget);
      expect(find.byType(CamposDeSinais), findsOneWidget);
    });

    testWidgets('ISCA — o PATCH leva o pet INTEIRO, e nao so o que mudou',
        (tester) async {
      // **A classe de defeito:** `PATCH /pets/{petId}` recebe um `PetInput`
      // completo e o repositorio grava TODAS as colunas a partir dele. Um
      // corpo com so o campo alterado zeraria cor, sexo e sinais no servidor,
      // sem erro nenhum e sem nada no app acusando.
      final registro = _Registro();
      await _abrirODetalhe(
        tester,
        registro: registro,
        pet: petDoContrato()
          ..addAll(<String, dynamic>{
            'sex': 'female',
            'primary_color_code': 'caramelo',
            'distinctive_marks': 'mancha branca no peito',
          }),
      );
      await _tocarNaAcao(tester, TextosDoDetalhe.editar);
      await rolarAte(tester, find.text(TextosDoDetalhe.salvar));
      await tocar(tester, find.text(TextosDoDetalhe.salvar));

      expect(registro.atualizados, hasLength(1));
      final corpo = registro.atualizados.single['corpo']!;
      for (final campo in <String>[
        'sex',
        'primary_color_code',
        'distinctive_marks',
      ]) {
        expect(
          corpo,
          contains(campo),
          reason: 'REPROVA: `$campo` nao viajou no PATCH. O servidor grava '
              'todas as colunas a partir do corpo: o que nao viaja vira nulo, '
              'e corrigir o nome apagaria o resto em silencio.',
        );
      }
      expect(corpo, contains('mancha branca no peito'));
    });

    testWidgets('com caso aberto, a edicao avisa que o alerta ja saiu',
        (tester) async {
      // Criterio 3 da BICHUS-61, palavra por palavra.
      final registro = _Registro();
      await _abrirODetalhe(
        tester,
        registro: registro,
        pet: petDoContrato(casoAberto: 'caso-1'),
      );
      await _tocarNaAcao(tester, TextosDoDetalhe.editar);

      expect(find.text(TextosDoDetalhe.oAlertaJaSaiu), findsOneWidget);
    });
  });
}
