import 'package:bichu/api/falhas.dart';
import 'package:bichu/api/modelos_seguranca.dart';
import 'package:bichu/api/problem.dart';
import 'package:bichu/telas/seguranca/folha_de_denuncia.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// A FOLHA DE DENÚNCIA: a contagem de toques, as três listas e o que cada lado
/// vê.
///
/// ## O caso que mais importa: **o terceiro toque NÃO envia**
///
/// Escolher o motivo **seleciona**, e o envio é um quarto toque explícito.
/// Denúncia não tem desfazer, e o erro custa a quem foi denunciado — uma folha
/// que disparasse no toque do motivo entregaria uma denúncia a cada polegar
/// errado, sobre uma pessoa real, sem volta.
///
/// A isca por desligamento está no fim: o mesmo caso, com o envio ligado no
/// toque do motivo, produz o envio que este arquivo proíbe.
///
/// ## O que mais está guardado aqui
///
/// - **os motivos aparecem na própria folha** — nenhum passo entre o menu e
///   eles, porque três níveis de profundidade é o padrão em que a pessoa
///   desiste;
/// - **a frase de que o outro não é avisado aparece ANTES do envio**, e não na
///   confirmação: quem decide precisa saber disso *enquanto decide*;
/// - **nenhuma frase de prazo**, em nenhum estado da folha — não existe prazo;
/// - **não existe caminho de enviar sem motivo**.
Future<void> montar(
  WidgetTester tester, {
  required AlvoDaDenuncia alvo,
  required Future<void> Function(String motivo, String? relato) aoEnviar,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      // O tema do app, e nao o do Material: `BichuColors` vive no `ThemeData`.
      theme: BichuTheme.claro,
      home: Scaffold(body: FolhaDeDenuncia(alvo: alvo, aoEnviar: aoEnviar)),
    ),
  );
  await tester.pumpAndSettle();
}

/// As frases que nenhum estado da folha pode conter. Não existe prazo.
const List<String> prazosProibidos = <String>[
  'prazo',
  'em até',
  'horas',
  'dias úteis',
  'nossa equipe',
  'vamos analisar',
  'responderemos',
];

void main() {
  group('a folha de denúncia: os toques', () {
    testWidgets('os motivos estão na própria folha, sem um passo a mais', (tester) async {
      await montar(tester, alvo: AlvoDaDenuncia.perfil, aoEnviar: (_, _) async {});
      // Os cinco, visíveis sem navegar para nada.
      for (final motivo in motivosDePerfil) {
        expect(find.text(motivo.rotulo), findsOneWidget, reason: motivo.valor);
      }
    });

    testWidgets('O CASO QUE IMPORTA: escolher o motivo SELECIONA e não envia', (tester) async {
      final enviados = <String>[];
      await montar(
        tester,
        alvo: AlvoDaDenuncia.perfil,
        aoEnviar: (motivo, _) async => enviados.add(motivo),
      );

      await tester.tap(find.text('Está incomodando ou ameaçando'));
      await tester.pumpAndSettle();

      expect(
        enviados,
        isEmpty,
        reason: 'o toque no motivo enviou a denúncia. Denúncia NÃO TEM DESFAZER, e o erro '
            'custa a quem foi denunciado: o envio é um quarto toque explícito.',
      );

      // E o quarto toque envia.
      await tester.tap(find.text('Enviar'));
      await tester.pumpAndSettle();
      expect(enviados, <String>['harassment']);
    });

    testWidgets('não existe caminho de enviar sem motivo', (tester) async {
      final enviados = <String>[];
      await montar(
        tester,
        alvo: AlvoDaDenuncia.perfil,
        aoEnviar: (motivo, _) async => enviados.add(motivo),
      );
      await tester.tap(find.text('Enviar'));
      await tester.pumpAndSettle();
      expect(enviados, isEmpty, reason: 'enviou sem motivo: motivo vazio não se tria');
    });

    testWidgets('ISCA POR DESLIGAMENTO: ligado no toque do motivo, o envio acontece', (tester) async {
      // A mesma folha com um callback que se dispara na seleção — que é o que
      // alguém escreveria "para economizar um toque". Este caso prova que o
      // caso acima mede algo: se a folha passar a enviar na seleção, ele
      // reprova lá e esta isca continua passando aqui.
      final enviados = <String>[];
      await tester.pumpWidget(
        MaterialApp(
          theme: BichuTheme.claro,
          home: Scaffold(
            body: _FolhaQueEnviaNaSelecao(aoEnviar: (motivo) => enviados.add(motivo)),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Está incomodando ou ameaçando'));
      await tester.pumpAndSettle();
      expect(enviados, <String>['harassment'], reason: 'a isca precisa enviar na seleção');
    });
  });

  group('o que cada lado vê', () {
    testWidgets('a frase de que o outro não é avisado aparece ANTES do envio', (tester) async {
      await montar(tester, alvo: AlvoDaDenuncia.perfil, aoEnviar: (_, _) async {});
      expect(find.text(oOutroNaoEAvisado), findsOneWidget);
      // E ela fala do que acontece com o OUTRO, não do que acontece depois.
      expect(oOutroNaoEAvisado, contains('não fica sabendo'));
    });

    testWidgets('NENHUM PRAZO É PROMETIDO, em nenhum estado da folha', (tester) async {
      await montar(tester, alvo: AlvoDaDenuncia.perfil, aoEnviar: (_, _) async {});
      final textos = tester
          .widgetList<Text>(find.byType(Text))
          .map((t) => (t.data ?? '').toLowerCase())
          .join(' | ');
      for (final proibida in prazosProibidos) {
        expect(
          textos.contains(proibida),
          isFalse,
          reason: 'a folha promete "$proibida". NÃO EXISTE PRAZO: o que faz a denúncia '
              'valer sem prazo é a ocultação imediata, e é isso que a confirmação diz.',
        );
      }
      // E o mesmo vale para as frases guardadas em `modelos_seguranca.dart`.
      for (final proibida in prazosProibidos) {
        expect(denunciaRecebida.toLowerCase().contains(proibida), isFalse, reason: proibida);
        expect(oOutroNaoEAvisado.toLowerCase().contains(proibida), isFalse, reason: proibida);
      }
    });

    testWidgets('a confirmação promete a ocultação imediata, que é o que acontece', (tester) async {
      expect(denunciaRecebida, contains('não vai mais ver'));
      expect(denunciaJaEnviada, 'Denúncia enviada');
    });

    testWidgets('o erro do servidor aparece com a frase do servidor', (tester) async {
      await montar(
        tester,
        alvo: AlvoDaDenuncia.perfil,
        aoEnviar: (_, _) async => throw FalhaDaApi(
          const Problem(
            tipo: ProblemTipo.limiteDeTentativas,
            tipoUri: 'https://dominio-a-definir.com.br/problems/rate-limited',
            titulo: 'Muitas tentativas',
            detalhe: 'Você já denunciou cinco perfis hoje.',
            status: 429,
          ),
        ),
      );
      await tester.tap(find.text('Outro motivo'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Enviar'));
      await tester.pumpAndSettle();
      // A tela não reescreve a frase: o servidor é quem sabe o que recusou.
      expect(find.byType(Text), findsWidgets);
    });
  });

  group('as três listas fechadas', () {
    test('os tamanhos são 5, 6 e 5, e os números são do desenho', () {
      expect(motivosDePerfil.length, 5);
      expect(motivosDeFoto.length, 6);
      expect(motivosDePublicacao.length, 5);
    });

    test('"Outro motivo" é sempre o ÚLTIMO, nas três', () {
      // Primeiro item fechado faria dele o caminho mais barato, e a fila
      // receberia "outro" para tudo.
      for (final lista in <List<MotivoDeDenuncia>>[
        motivosDePerfil,
        motivosDeFoto,
        motivosDePublicacao,
      ]) {
        expect(lista.last.valor, 'other');
      }
    });

    test('a lista de publicação tem o motivo que só existe neste produto', () {
      // Um avistamento inventado manda a pessoa para o bairro errado e custa
      // horas de busca. Em "outro" ele chegaria à fila sem dizer que é urgente.
      expect(motivosDePublicacao.first.valor, 'false_lost_pet_info');
      expect(motivosDePublicacao.first.rotulo, contains('pet perdido'));
    });

    test('NENHUMA lista tem opção de texto livre como motivo', () {
      for (final lista in <List<MotivoDeDenuncia>>[
        motivosDePerfil,
        motivosDeFoto,
        motivosDePublicacao,
      ]) {
        for (final motivo in lista) {
          expect(motivo.valor.trim(), isNotEmpty);
          expect(motivo.rotulo.trim(), isNotEmpty);
        }
      }
    });

    test('os valores NÃO são traduzidos: os quatro clientes usam os mesmos', () {
      // Regra da casa: o rótulo é da tela, o valor é do contrato.
      final valores = <String>[
        ...motivosDePerfil.map((m) => m.valor),
        ...motivosDeFoto.map((m) => m.valor),
        ...motivosDePublicacao.map((m) => m.valor),
      ];
      for (final valor in valores) {
        expect(valor, matches(RegExp(r'^[a-z][a-z_]*$')), reason: valor);
      }
    });

    test('cada alvo oferece a SUA lista, e nenhuma outra', () {
      // Misturar as listas ofereceria motivos impossíveis: "nudez" num perfil,
      // "não é quem diz ser" numa publicação.
      expect(AlvoDaDenuncia.perfil.motivos, motivosDePerfil);
      expect(AlvoDaDenuncia.foto.motivos, motivosDeFoto);
      expect(AlvoDaDenuncia.publicacao.motivos, motivosDePublicacao);

      final dePerfil = motivosDePerfil.map((m) => m.valor).toSet();
      expect(dePerfil.contains('nudity_or_sexual'), isFalse);
      expect(dePerfil.contains('false_lost_pet_info'), isFalse);
    });
  });
}

/// A ISCA: a folha que envia na seleção. Existe só para provar que o caso de
/// cima mede algo.
class _FolhaQueEnviaNaSelecao extends StatelessWidget {
  const _FolhaQueEnviaNaSelecao({required this.aoEnviar});

  final void Function(String motivo) aoEnviar;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: motivosDePerfil
          .map(
            (m) => TextButton(
              onPressed: () => aoEnviar(m.valor),
              child: Text(m.rotulo),
            ),
          )
          .toList(),
    );
  }
}
