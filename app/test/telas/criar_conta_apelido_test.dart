import 'dart:convert';

import 'package:bichu/app.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/formato/apelido.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'ajuda_de_tela.dart';

/// F1.1 — o **apelido (`@`)**, que e OPCIONAL no cadastro.
///
/// ## A decisao, nas palavras do cliente (18/10/2026)
///
/// *"o apelido esta livre, vai estar no cadastro do usuario e na pagina de
/// edicao do perfil"*.
///
/// ## OPCIONAL, E ESSA FOI A DECISAO QUE ESTA TAREFA TOMOU
///
/// Ele disse que o apelido **esta** no cadastro, nao que e exigido. Tres
/// razoes para nao entrar em `required`, e as tres estao medidas no relatorio:
///
/// 1. o desenho fechado (plano `9d99ac0f`, 4-C.8) diz que a coluna e anulavel
///    e que **nenhum fluxo obriga a escolher apelido**;
/// 2. `required` seria uma SEGUNDA quebra de contrato no mesmo dia -- a data de
///    nascimento ja custou o APK em campo. Campo acrescentado e **opcional nao
///    quebra ninguem**, e o `oasdiff` confirmou: `new-optional-request-property`,
///    nivel `info`;
/// 3. sem rota de disponibilidade, a pessoa descobre que o apelido esta tomado
///    so no envio. Exigi-lo transformaria "achar um apelido livre" em
///    pre-requisito para ter conta.
///
/// **O caso que guarda essa decisao e o primeiro deste arquivo**: cadastro SEM
/// apelido cria conta e o corpo nao carrega a chave.
///
/// ## O QUE NAO ESTA AQUI, E ONDE ISSO E MEDIDO
///
/// **Duplicidade.** Nao ha o que testar na tela: a disponibilidade e decidida
/// pelo indice unico de `handles`, no envio (plano 4-C.5). A recusa por
/// duplicidade, a colisao de esqueleto, o espaco compartilhado com `pets.slug`
/// e a recusa da palavra reservada **pelo banco** foram exercitados contra o
/// Postgres em `BEGIN/ROLLBACK`, e os vereditos estao no relatorio.
///
/// A regra de 60 dias para trocar tambem e do servidor: a tela nao a conhece e
/// nao deve conhecer -- ela trataria uma recusa que nao sabe calcular.
void main() {
  setUp(AppConfig.limparParaTeste);

  group('a faixa do apelido: 5 a 20, nas DUAS bordas', () {
    /// AS DUAS BORDAS, que e onde o erro mora. 4 recusa e 5 passa; 20 passa e
    /// 21 recusa. Uma borda so nao prova nada: a regra `< 5` e a regra `<= 5`
    /// concordam em todo o resto e discordam exatamente aqui.
    ///
    /// **Os mesmos quatro casos foram rodados contra o `CHECK` de
    /// `handles.handle` no Postgres e contra `verificarApelido` no
    /// TypeScript**, e os tres deram o mesmo resultado. E essa coincidencia
    /// que o relatorio chama de "a mesma faixa nos tres lugares".
    test('a borda de BAIXO: 4 recusa, 5 passa', () {
      expect(IdentificadorDoApelido.recusa('abcd'), IdentificadorDoApelido.curtoDemais);
      expect(IdentificadorDoApelido.recusa('abcde'), isNull);
      expect(apelidoParaOContrato('abcd'), isNull);
      expect(apelidoParaOContrato('abcde'), 'abcde');
    });

    test('a borda de CIMA: 20 passa, 21 recusa', () {
      const String vinte = 'abcdefghij0123456789';
      expect(vinte.length, maximoDoApelido);
      expect(IdentificadorDoApelido.recusa(vinte), isNull);
      expect(apelidoParaOContrato(vinte), vinte);

      const String vinteEUm = '${vinte}0';
      expect(vinteEUm.length, maximoDoApelido + 1);
      expect(IdentificadorDoApelido.recusa(vinteEUm), IdentificadorDoApelido.foraDaFaixa);
      expect(apelidoParaOContrato(vinteEUm), isNull);
    });

    /// O teto de 20 e do NORMALIZADO, e o plano afirma que ele e identico ao
    /// digitado. **Isto confere a afirmacao** em vez de confiar nela.
    test('normalizado e digitado tem o MESMO comprimento, sempre', () {
      for (final String bruto in <String>[
        'MARIA-SILVA',
        'Maria-Silva',
        'abcdefghij0123456789',
        'MaRiA-01',
      ]) {
        expect(
          normalizarApelido(bruto).length,
          bruto.trim().length,
          reason:
              '"$bruto" mudou de comprimento ao normalizar: o teto de '
              '$maximoDoApelido deixaria de valer igual no contrato e na coluna',
        );
      }
    });

    test('a forma e a MESMA dos quatro lugares', () {
      expect(
        FormaDoApelido.regex.pattern,
        r'^[a-z0-9][a-z0-9-]{3,18}[a-z0-9]$',
        reason:
            'se este regex mudar, o `CHECK` de handles.handle, o `pattern` de '
            'Handle no contrato e `FORMA_DO_APELIDO` do TypeScript mudam junto',
      );
      expect(minimoDoApelido, 5);
      expect(maximoDoApelido, 20);
    });

    test('ponto, sublinhado, acento e hifen na ponta sao recusados', () {
      for (final String ruim in <String>[
        'maria.silva',
        'maria_silva',
        'mariá-silva',
        '-maria',
        'maria-',
      ]) {
        expect(
          IdentificadorDoApelido.recusa(ruim),
          IdentificadorDoApelido.foraDaFaixa,
          reason: '"$ruim" deveria ser recusado pela forma',
        );
      }
    });

    /// Maiuscula e NORMALIZADA e nao recusada: `@Leandro` e `@leandro`.
    test('maiuscula vira minuscula em vez de ser recusada', () {
      expect(IdentificadorDoApelido.recusa('MARIA-SILVA'), isNull);
      expect(apelidoParaOContrato('MARIA-SILVA'), 'maria-silva');
      expect(apelidoParaOContrato('  Maria-Silva  '), 'maria-silva');
    });
  });

  group('as reservadas e o esqueleto', () {
    /// A ISCA QUE O PLANO PEDE, e ela precisa das DUAS regras ao mesmo tempo.
    ///
    /// `@B1CHU-suporte` escapa de tudo que nao seja "contem, sobre o
    /// esqueleto": nao e igual a `bichu`, nao comeca com `bichu`, e com o `1`
    /// no lugar do `i` nao contem `bichu` como texto.
    test('@B1CHU-suporte e recusado', () {
      expect(
        IdentificadorDoApelido.recusa('B1CHU-suporte'),
        IdentificadorDoApelido.indisponivel,
      );
    });

    test('CONTEM e nao comeca-com: @suporte-bichu e @oi-bichu caem', () {
      for (final String golpe in <String>[
        'suporte-bichu',
        'oi-bichu',
        'bichu-oficial',
        'xxbichuxx',
      ]) {
        expect(
          IdentificadorDoApelido.recusa(golpe),
          IdentificadorDoApelido.indisponivel,
          reason: '"$golpe" e a forma real do golpe e precisa ser recusado',
        );
      }
    });

    /// O esqueleto colapsa por GRUPO. **Divergencia declarada do plano:** ele
    /// escreve `0->o`, `1->l`, `5->s`, `3->e`, e esse mapa sozinho nao produz
    /// esta colisao -- `i` tambem colapsa em `l` para o invariante valer.
    ///
    /// As tres saidas foram rodadas contra `handle_esqueleto` no Postgres: as
    /// tres deram `marlasllva`.
    test('@maria-silva, @mariasilva e @mar1a-silva sao o MESMO apelido', () {
      const String esperado = 'marlasllva';
      expect(IdentificadorDoApelido.esqueleto('maria-silva'), esperado);
      expect(IdentificadorDoApelido.esqueleto('mariasilva'), esperado);
      expect(IdentificadorDoApelido.esqueleto('mar1a-silva'), esperado);
    });

    /// PARIDADE COM O BANCO E COM O TYPESCRIPT. As saidas vieram de
    /// `SELECT handle_esqueleto(...)` contra o Postgres 16.
    test('bate caractere a caractere com handle_esqueleto do Postgres', () {
      const Map<String, String> medidoNoBanco = <String, String>{
        'bichu': 'blchu',
        'b1chu-suporte': 'blchusuporte',
        'maria-silva': 'marlasllva',
        'mariasilva': 'marlasllva',
        'mar1a-silva': 'marlasllva',
      };
      medidoNoBanco.forEach((String entrada, String esperado) {
        expect(
          IdentificadorDoApelido.esqueleto(entrada),
          esperado,
          reason:
              '"$entrada": a tela divergiu do que o banco devolveu. Divergencia '
              'aqui aparece como "a tela aceitou e o servidor recusou"',
        );
      });
    });

    /// A lista tem 52 palavras e 51 esqueletos, e a migracao grava 51 linhas:
    /// `noreply` e `no-reply` colidem porque o esqueleto tira o hifen. **As
    /// duas continuam recusadas**, que e o que importa.
    test('a lista tem 52 palavras e 51 esqueletos', () {
      expect(IdentificadorDoApelido.reservadas.length, 52);
      final Set<String> esqueletos = IdentificadorDoApelido.reservadas
          .map(IdentificadorDoApelido.esqueleto)
          .toSet();
      expect(esqueletos.length, 51);
      expect(IdentificadorDoApelido.ehReservado('noreply'), isTrue);
      expect(IdentificadorDoApelido.ehReservado('no-reply'), isTrue);

      // Nenhuma reservada pode ser impossivel pela propria forma: reservar o
      // que o piso de 5 ja proibe e regra morta.
      for (final String palavra in IdentificadorDoApelido.reservadas) {
        expect(
          FormaDoApelido.regex.hasMatch(palavra),
          isTrue,
          reason: '"$palavra" nao passa na forma: reservar o que o piso de '
              '$minimoDoApelido ja proibe e regra morta',
        );
      }
    });

    /// CONTRAPESO. Sem ele, `ehReservado` passando a devolver `true` para tudo
    /// deixaria todos os casos acima verdes.
    test('apelido comum NAO e reservado', () {
      for (final String bom in <String>[
        'maria-silva',
        'leandro-p',
        'bidu-2026',
        'joana-vet',
      ]) {
        expect(IdentificadorDoApelido.ehReservado(bom), isFalse, reason: '"$bom"');
        expect(IdentificadorDoApelido.recusa(bom), isNull);
      }
    });
  });

  group('as tres sugestoes, que substituem o paragrafo de apoio', () {
    /// Elas existem porque **nao ha rota de disponibilidade**: sem conferencia
    /// a cada tecla, a pessoa so descobre no envio, e a mitigacao que nao custa
    /// nada e oferecer saidas. E isso que resolve o nome curto legitimo -- Ana,
    /// Leo, Ze -- por exemplo e nao por explicacao.
    test('sao tres, distintas, e todas passam na propria forma', () {
      for (final String curto in <String>['ana', 'leo', 'ze', 'maria-silva', '']) {
        final List<String> sugestoes = IdentificadorDoApelido.sugestoes(curto);
        expect(sugestoes.length, 3, reason: '"$curto" nao gerou tres sugestoes');
        expect(sugestoes.toSet().length, 3, reason: 'as tres precisam ser distintas');
        for (final String sugestao in sugestoes) {
          expect(
            FormaDoApelido.regex.hasMatch(sugestao),
            isTrue,
            reason: 'a sugestao "$sugestao" para "$curto" nao passa na forma',
          );
          expect(
            IdentificadorDoApelido.ehReservado(sugestao),
            isFalse,
            reason: 'sugerir "$sugestao", que sera recusado, e pior que nao sugerir',
          );
          expect(sugestao.length, lessThanOrEqualTo(maximoDoApelido));
        }
      }
    });
  });

  group('o filtro de digitacao formata e NAO valida', () {
    /// Mesma divisao de trabalho de `MascaraDeCep` e `MascaraDeData`: ele
    /// descarta o que nao e aceito e **nunca recusa**. `ze` continua digitavel,
    /// e quem recusa e `recusa`, no envio -- filtro que cobrasse a faixa
    /// impediria a pessoa de digitar o quinto caractere depois do quarto.
    test('ele passa maiuscula para minuscula e descarta o que nao e aceito', () {
      const FiltroDeApelido filtro = FiltroDeApelido();
      String aplicar(String bruto) => filtro
          .formatEditUpdate(TextEditingValue.empty, TextEditingValue(text: bruto))
          .text;

      expect(aplicar('Maria-Silva'), 'maria-silva');
      expect(aplicar('maria.silva'), 'mariasilva');
      expect(aplicar('maria_silva'), 'mariasilva');
      expect(aplicar('maria silva'), 'mariasilva');
      expect(aplicar('mariá'), 'mari');
      // Deixa o curto passar: ele nao valida.
      expect(aplicar('ze'), 'ze');
      // Corta no teto em vez de aceitar para recusar depois.
      expect(aplicar('a' * 30).length, maximoDoApelido);
    });
  });

  group('a tela de criar conta: apelido OPCIONAL', () {
    const String urlBase = 'http://localhost:3000';
    const String versao = '2026-09-17';

    http.Response sessaoCriada() {
      return http.Response(
        jsonEncode(<String, dynamic>{
          'access_token': 'a',
          'refresh_token': 'r',
          'expires_in': 900,
          'user': <String, dynamic>{
            'id': '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f',
            'email': 'marina@exemplo.com.br',
            'email_verified': false,
          },
        }),
        201,
        headers: <String, String>{'content-type': 'application/json'},
      );
    }

    late List<Map<String, dynamic>> cadastros;

    Future<void> abrirCriarConta(WidgetTester tester) async {
      cadastros = <Map<String, dynamic>>[];
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
      AppConfig.limparParaTeste();
      await tester.pumpWidget(
        BichuApp(
          config: AppConfig.carregar(
            apiBaseUrlDeTeste: urlBase,
            versaoDosTermosDeTeste: versao,
          ),
          deposito: DepositoEmMemoria(),
          clienteHttp: MockClient((req) async {
            if (req.url.path.endsWith('/auth/register')) {
              cadastros.add(jsonDecode(req.body) as Map<String, dynamic>);
              return sessaoCriada();
            }
            return http.Response('{}', 404);
          }),
        ),
      );
      await tester.pumpAndSettle();
      // A PORTA DA CONTA E A FOTO DA BARRA DE TOPO (uniao de 18/10/2026): o slot
      // `Perfil` saiu da barra de baixo. Este ajudante nasceu num ramo anterior
      // a essa decisao. `irParaAConta` e a mesma porta dos outros arquivos, e o
      // caso prova exatamente o mesmo.
      await irParaAConta(tester);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Criar conta'));
      await tester.pumpAndSettle();
    }

    // Nome(0), Apelido(1), Data de nascimento(2), E-mail(3), Senha(4).
    final Finder campoNome = find.byType(TextField).at(0);
    final Finder campoApelido = find.byType(TextField).at(1);
    final Finder campoNascimento = find.byType(TextField).at(2);
    final Finder campoEmail = find.byType(TextField).at(3);
    final Finder campoSenha = find.byType(TextField).at(4);
    final Finder botaoCriarConta =
        find.widgetWithText(FilledButton, 'Criar conta');

    Future<void> preencher(WidgetTester tester, String apelido) async {
      await tester.enterText(campoNome, 'Marina');
      if (apelido.isNotEmpty) await tester.enterText(campoApelido, apelido);
      await tester.enterText(campoNascimento, '12/05/1990');
      await tester.enterText(campoEmail, 'marina@exemplo.com.br');
      await tester.enterText(campoSenha, 'coleira-azul-do-bidu-2026');
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byType(Checkbox));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(Checkbox));
      await tester.pumpAndSettle();
    }

    /// O rotulo diz que o campo e opcional, e isso e verdade. Campo que PARECE
    /// obrigatorio e nao e foi exatamente o defeito do `Nome` antes de 18/10.
    testWidgets('o campo existe e o rotulo diz `(opcional)`', (tester) async {
      await abrirCriarConta(tester);

      expect(find.text('Apelido (opcional)'), findsOneWidget);
      // O exemplo mora DENTRO do campo, e nao numa linha de apoio acima.
      expect(find.text('maria-silva'), findsOneWidget);
      expect(
        find.byType(TextField),
        findsNWidgets(5),
        reason: 'Nome, Apelido, Data de nascimento, E-mail e Senha',
      );
    });

    /// ISCA QUE GUARDA A DECISAO DE "OPCIONAL": cadastro **sem** apelido cria
    /// conta, e o corpo **nao carrega a chave**.
    ///
    /// Desligada: pondo `handle` em `required` no contrato, ou fazendo a tela
    /// cobrar o campo, este caso reprova. Ele e o que diz que apelido nulo nao
    /// quebra o cadastro -- que e o estado das 7 contas de hml.
    testWidgets('SEM apelido o cadastro sai, e a chave nao vai no corpo',
        (tester) async {
      await abrirCriarConta(tester);
      await preencher(tester, '');

      await tester.tap(botaoCriarConta);
      await tester.pumpAndSettle();

      expect(
        cadastros,
        hasLength(1),
        reason:
            'o apelido e OPCIONAL: exigi-lo transformaria "achar um apelido '
            'livre" em pre-requisito para ter conta, e contradiria o desenho '
            'fechado, que diz que nenhum fluxo obriga a escolher',
      );
      expect(
        cadastros.single.containsKey('handle'),
        isFalse,
        reason:
            'a chave nao pode ir no corpo quando nao ha apelido: `Handle` nao e '
            '`nullable` no contrato, e `handle: null` seria recusado pelo schema',
      );
    });

    /// CONTRAPESO: com apelido, o corpo leva o **normalizado**.
    testWidgets('COM apelido o corpo leva minusculo e aparado', (tester) async {
      await abrirCriarConta(tester);
      // Maiuscula de proposito: o filtro ja a derruba na digitacao, e este
      // caso afirma que o que chega na borda e minusculo de qualquer forma.
      await preencher(tester, 'Maria-Silva');

      await tester.tap(botaoCriarConta);
      await tester.pumpAndSettle();

      expect(cadastros, hasLength(1));
      expect(cadastros.single['handle'], 'maria-silva');
    });

    /// ISCA: apelido fora da faixa nao sai, e a recusa traz as sugestoes.
    ///
    /// Desligada: apagando a guarda `recusaDoApelido` de `_criarConta`, este
    /// caso reprova em `cadastros` -- que e a requisicao saindo com um apelido
    /// que o servidor vai recusar depois da ida a rede.
    testWidgets('apelido curto nao sai, e a recusa oferece saidas',
        (tester) async {
      await abrirCriarConta(tester);
      await preencher(tester, 'ze');

      await tester.tap(botaoCriarConta);
      await tester.pumpAndSettle();

      expect(cadastros, isEmpty);
      // A frase diz so a faixa, e as tres sugestoes vem colada nela -- sem
      // paragrafo de apoio.
      expect(
        find.textContaining(IdentificadorDoApelido.curtoDemais),
        findsOneWidget,
      );
      expect(find.textContaining('Tente '), findsOneWidget);
    });

    /// ISCA: a reservada tambem nao sai da tela.
    testWidgets('@b1chu-suporte nao sai da tela', (tester) async {
      await abrirCriarConta(tester);
      await preencher(tester, 'b1chu-suporte');

      await tester.tap(botaoCriarConta);
      await tester.pumpAndSettle();

      expect(cadastros, isEmpty);
      expect(
        find.textContaining(IdentificadorDoApelido.indisponivel),
        findsOneWidget,
      );
    });
  });
}
