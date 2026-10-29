// O achado NAO oferece captura de localizacao (cliente, 29/10/2026).
//
// Decisao verbatim: *"remove os botoes e deixa os campos de cep, endereco para
// o usuario preencher, no mesmo padrao das outras paginas"*.
//
// ## As duas afirmacoes, e a segunda vale mais que a primeira
//
//   1. **os dois botoes nao existem** em nenhuma das duas telas de achado.
//      `Usar minha localizacao` e `Prefiro digitar o bairro` sairam, e a peca
//      abre JA nos campos de endereco;
//   2. **o achado continua podendo ser registrado** com endereco digitado, e o
//      corpo sai com `area` e **sem** `location`.
//
// A segunda e a que importa. O caminho obvio de "tirar os botoes" era remover
// `CapturaDeLocalizacao` da pagina 2, e ele **quebraria o envio**: o CEP, o
// bairro, a cidade e a UF moram DENTRO da peca, e a cidade e o unico campo que
// faz o `Onde` existir sem ponto (`Area.required: [city]`). Sem ela
// `montarOnde` devolve nulo, `enviarAchado` cai na guarda dos quatro
// obrigatorios e **nenhum achado se registra**. Medido antes de editar, em
// 29/10/2026.
//
// Por isso este arquivo mede o ENVIO, e nao so a ausencia dos rotulos: um
// formulario sem botoes e sem envio passaria na metade de cima.
//
// ## PARA VER REPROVANDO
//
// Em `captura_de_localizacao.dart`, troque `_ofereceCaptura` por `true` (ou
// volte `_fase` a nascer em `_Fase.escolhendo`). Os dois primeiros casos
// reprovam pelos rotulos; o terceiro reprova porque o formulario volta a abrir
// na fase de escolher, onde os campos de endereco nao estao na tela.

import 'dart:convert';

import 'package:bichu/api/achados_api.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/localizacao/textos_da_localizacao.dart';
import 'package:bichu/widgets/bichu_field.dart';
import 'package:bichu/widgets/seletor_de_lista.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'registrar_achado_test.dart'
    show achadoDoContrato, avancarParaOPasso2, tocarEmRegistrar;

/// O `TextField` do [BichuField] cujo rotulo e [rotulo].
Finder _campo(String rotulo) => find.descendant(
      of: find.byWidgetPredicate(
        (w) => w is BichuField && w.rotulo == rotulo,
      ),
      matching: find.byType(TextField),
    );

/// Uma rede que guarda o corpo do registro.
class _Rede {
  int registros = 0;
  Map<String, dynamic>? corpo;

  Future<http.Response> call(http.Request req) async {
    if (req.url.path.endsWith('/reference-data')) {
      return json200(referenciaDeTeste());
    }
    if (req.url.path == '/v1${AchadosApi.caminhoDeRegistro}' &&
        req.method == 'POST') {
      registros += 1;
      corpo = jsonDecode(req.body) as Map<String, dynamic>;
      return json200(achadoDoContrato(), status: 201);
    }
    if (req.url.path == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{'items': <dynamic>[]});
    }
    // A busca de CEP da BrasilAPI, que preenche bairro, cidade e UF.
    if (req.url.host.contains('brasilapi') ||
        req.url.path.contains('/cep/')) {
      return json200(<String, dynamic>{
        'cep': '01310100',
        'state': 'SP',
        'city': 'São Paulo',
        'neighborhood': 'Bela Vista',
        'street': 'Avenida Paulista',
      });
    }
    return problema('not-found', 404);
  }
}

/// Abre F3.5 e chega ao passo 2.
///
/// **Especie e porte ANTES de `Continuar`**: o botao do passo 1 so habilita
/// com os dois, e sem eles o toque nao faz nada -- o caso fica no passo 1 e
/// reprova com `Bad state: No element` ao procurar um campo do passo 2, que e
/// um motivo que nao e o do caso. Medido reprovando em 29/10/2026.
Future<void> _irAoPasso2(WidgetTester tester) async {
  await irPara(tester, Rotas.registrarAchado);
  await rolarAte(tester, find.text('Cachorro'));
  await tocar(tester, find.text('Cachorro'));
  await rolarAte(tester, find.text('Médio'));
  await tocar(tester, find.text('Médio'));
  await avancarParaOPasso2(tester);
}

void main() {
  group('os dois botoes sairam das DUAS telas de achado', () {
    testWidgets('F3.5 abre nos campos de endereco, sem os dois botoes',
        (tester) async {
      await abrirOApp(
        tester,
        rede: _Rede().call,
        deposito: depositoLogado(),
      );
      await _irAoPasso2(tester);

      expect(
        find.text(TextosDaLocalizacao.usarMinhaLocalizacao),
        findsNothing,
        reason: 'REPROVA: `Usar minha localizacao` continua na tela. O cliente '
            'pediu os dois botoes fora em 29/10/2026, e este e o que '
            'prometia endereco e entregava ponto mais cidade.',
      );
      expect(
        find.text(TextosDaLocalizacao.preferoDigitarOBairro),
        findsNothing,
        reason: 'REPROVA: `Prefiro digitar o bairro` continua na tela. Sem o '
            'outro botao ele deixou de ser escolha: era o par de um caminho '
            'que nao existe mais, e um botao que leva ao unico lugar '
            'possivel e um toque cobrado por nada.',
      );

      // O que entra no lugar dos botoes, e e o pedido literal: o campo de CEP,
      // na tela, pronto para a pessoa preencher.
      await rolarAte(tester, _campo(TextosDaLocalizacao.rotuloCep));
      expect(
        _campo(TextosDaLocalizacao.rotuloCep),
        findsOneWidget,
        reason: 'REPROVA: o campo de CEP nao esta na tela. O pedido era "deixa '
            'os campos de cep, endereco para o usuario preencher", e sem o '
            'CEP a pessoa digita bairro, cidade e estado na mao.',
      );
    });

    testWidgets('o CEP continua preenchendo bairro, cidade e estado',
        (tester) async {
      // **O que o cliente perderia sem perceber.** O CEP e a razao de os tres
      // campos nao serem digitados a mao, e ele dispara sozinho no oitavo
      // digito -- sem botao `Buscar`.
      await abrirOApp(
        tester,
        rede: _Rede().call,
        deposito: depositoLogado(),
      );
      await _irAoPasso2(tester);

      await rolarAte(tester, _campo(TextosDaLocalizacao.rotuloCep));
      await tester.enterText(
        _campo(TextosDaLocalizacao.rotuloCep),
        '01310100',
      );
      await tester.pumpAndSettle();

      expect(
        tester.widget<TextField>(_campo(TextosDaLocalizacao.rotuloBairro))
            .controller!
            .text,
        'Bela Vista',
        reason: 'REPROVA: o CEP nao preencheu o BAIRRO. Com os botoes fora, o '
            'CEP e o unico atalho que sobrou para os tres campos.',
      );
      expect(
        tester.widget<TextField>(_campo(TextosDaLocalizacao.rotuloCidade))
            .controller!
            .text,
        'São Paulo',
        reason: 'REPROVA: o CEP nao preencheu a CIDADE -- e a cidade e o unico '
            'campo que faz o `Onde` existir (`Area.required: [city]`). Sem '
            'ela o botao `Registrar` fica morto.',
      );
      // **A SIGLA no seletor, e nao o rotulo em tela.** O rotulo da lista de 27
      // e o NOME do estado (`São Paulo`), que e exatamente o texto que o campo
      // de cidade tambem tem nesta carga -- um `find.text` casaria com os dois
      // e o caso mediria ambiguidade. O que viaja e a sigla (`Area.state`, de
      // dois caracteres), e e ela que este caso le.
      expect(
        tester
            .widget<SeletorDeLista>(
              find.byWidgetPredicate(
                (w) =>
                    w is SeletorDeLista &&
                    w.rotulo == TextosDaLocalizacao.rotuloEstado,
              ),
            )
            .selecionado,
        'SP',
        reason: 'REPROVA: o CEP nao escolheu o ESTADO na lista de 27. O campo '
            'guarda a sigla e mostra o nome; `Area.state` e de dois '
            'caracteres.',
      );
    });
  });

  group('o achado AINDA se registra, com endereco digitado', () {
    testWidgets(
        'ISCA — o corpo sai com `area` e SEM `location`',
        (tester) async {
      final rede = _Rede();
      await abrirOApp(tester, rede: rede.call, deposito: depositoLogado());
      await _irAoPasso2(tester);

      // O endereco pela TELA, como a pessoa faria -- e sem tocar em botao
      // nenhum antes, que e justamente o que mudou.
      await rolarAte(tester, _campo(TextosDaLocalizacao.rotuloCidade));
      await tester.enterText(
        _campo(TextosDaLocalizacao.rotuloCidade),
        'São Paulo',
      );
      await tester.pumpAndSettle();
      await rolarAte(tester, find.text('Agora'), passo: -120);
      await tocar(tester, find.text('Agora'));
      await tocarEmRegistrar(tester);
      await tester.pumpAndSettle();

      expect(
        rede.registros,
        1,
        reason: 'REPROVA: nenhum `createStrayFoundReport` saiu. ESTE e o '
            'defeito que a remocao obvia da peca causaria: sem os campos de '
            'endereco na tela nao ha cidade, sem cidade `montarOnde` devolve '
            'nulo, e `enviarAchado` desiste na guarda dos quatro '
            'obrigatorios. O formulario fica sem botoes E sem envio.',
      );

      final corpo = rede.corpo!;
      expect(
        (corpo['area'] as Map<String, dynamic>?)?['city'],
        'São Paulo',
        reason: 'REPROVA: o achado saiu sem `area.city`. E o endereco digitado '
            'que passou a carregar o "onde" inteiro.',
      );
      expect(
        corpo.containsKey('location'),
        isFalse,
        reason: 'REPROVA: o corpo levou `location`. Esta tela nao captura mais '
            'coordenada nenhuma, entao um `location` aqui so pode ter vindo '
            'de um caminho que a decisao de 29/10/2026 fechou.',
      );
    });
  });
}
