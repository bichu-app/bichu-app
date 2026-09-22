// BICHUS-220 — `Perfil` › `Meus pets` relista quando o pet nasce com a tela
// JA montada.
//
// POR QUE ESTE ARQUIVO EXISTE, e nao um caso a mais dentro de
// `meus_pets_test.dart`.
//
// O criterio 10 da BICHUS-62 ja tinha isca, e ela esta la: "com pet, o estado
// vazio NAO aparece". Ela abre o app com a conta **ja** com pet, monta a tela
// e cobra a ausencia do `EstadoVazio`. Essa sequencia fica verde com o defeito
// inteiro de pe, porque o monte novo roda `initState` **depois** de o pet
// existir.
//
// O caminho do tutor e o inverso, e o produto nao oferece o outro: a tela do
// Perfil ja esta aberta quando ele toca em `Cadastrar meu pet`. O pet nasce
// com a tela montada, e o `State` sobrevive a ida e a volta -- a casca e
// `StatefulShellRoute.indexedStack` e o assistente sobe no navegador raiz, por
// cima dela.
//
// Todo caso daqui monta a tela ANTES de o pet existir. Nenhum deles pode ser
// reescrito para abrir o app com a conta ja cheia: seria voltar a medir a
// sequencia conveniente.

import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/casca_com_abas.dart';
import 'package:bichu/telas/perfil/meus_pets.dart';
import 'package:bichu/telas/pet/rascunho_de_pet.dart';
import 'package:bichu/telas/pet/textos_do_cadastro.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/cartao_de_pet.dart';
import 'package:bichu/widgets/faixa_de_aviso.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../api/pets_api_listar_test.dart' show petDoContrato;
import 'ajuda_de_tela.dart';

/// Um servidor de mentira que **guarda o que foi escrito nele**.
///
/// E a diferenca que faz este arquivo medir o que ele diz medir. Uma rede que
/// devolve sempre a mesma lista nao consegue distinguir "a tela relistou" de
/// "a tela nunca relistou": os dois desfechos tem a mesma aparencia. Aqui o
/// `POST /v1/pets` muda o que o `GET /v1/pets` seguinte responde, como o
/// servidor de verdade faz.
class ServidorDePets {
  ServidorDePets({List<Map<String, dynamic>>? inicial})
      : pets = <Map<String, dynamic>>[...?inicial];

  final List<Map<String, dynamic>> pets;

  /// Quantas vezes a tela perguntou. Nao e a medida do criterio -- o criterio
  /// e o que aparece na tela --, mas separa "relistou" de "relistou tres
  /// vezes".
  int leituras = 0;

  /// Quando verdadeiro, `GET /v1/pets` passa a falhar. E o criterio 3 da
  /// BICHUS-220: a recarga que falha cai na faixa de cache, e **nunca** numa
  /// lista que finge estar vazia.
  bool leituraQuebrada = false;

  Future<http.Response> responder(http.Request pedido) async {
    final caminho = pedido.url.path;
    if (caminho == '/v1/pets' && pedido.method == 'GET') {
      leituras++;
      if (leituraQuebrada) return problema('server-error', 500);
      return json200(<String, dynamic>{'items': pets});
    }
    if (caminho == '/v1/pets' && pedido.method == 'POST') {
      final novo = petDoContrato(id: 'p-${pets.length + 1}', nome: 'Nina');
      pets.add(novo);
      return json200(novo, status: 201);
    }
    if (caminho.endsWith('/reference-data')) {
      return json200(referenciaDeTeste());
    }
    // 404 no resto, e nao 200 vazio: chamada nao declarada aqui precisa
    // falhar ruidosamente em vez de passar por acidente.
    return problema('not-found', 404);
  }
}

void main() {
  /// Abre o app logado e entra em `Perfil` pela barra, como o tutor entra.
  Future<void> abrirOPerfil(
    WidgetTester tester,
    ServidorDePets servidor,
  ) async {
    await abrirOApp(
      tester,
      rede: servidor.responder,
      deposito: depositoLogado(),
    );
    await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
    await tester.pumpAndSettle();
  }

  /// Percorre o assistente ate o fim e volta, **sem desmontar o Perfil**.
  ///
  /// A porta e a do proprio estado da tela (`Cadastrar meu pet` no vazio), e
  /// nao uma navegacao inventada pelo teste: e ela que empurra o assistente no
  /// navegador raiz, por cima da casca, que e a condicao do defeito. Os dois
  /// primeiros passos do formulario sao pulados com o rascunho pronto -- o que
  /// este arquivo mede nao e o preenchimento, e sim o que acontece com a tela
  /// que ficou montada embaixo.
  Future<void> cadastrarEVoltar(
    WidgetTester tester, {
    Finder? porta,
  }) async {
    if (porta != null) await tocar(tester, porta);
    await irPara(
      tester,
      Rotas.cadastrarPetSinais,
      extra: RascunhoDePet()
        ..nome = 'Nina'
        ..especie = Especie.cao
        ..porte = Porte.medio,
    );
    await tocar(
      tester,
      find.widgetWithText(BotaoPrimario, TextosDoCadastro.cadastrar),
    );
    // F1.6, `Depois`: e o caminho de saida que a propria tela oferece, e ele
    // e `context.go(Rotas.perfil)` -- nao e um `pop`. A diferenca importa: um
    // mecanismo que so escute `pop` nao acorda por aqui.
    await tocar(tester, find.text(TextosDoCadastro.depois));
  }

  group('BICHUS-220 — ISCA: a tela ja estava montada quando o pet nasceu', () {
    testWidgets(
        'conta vazia, cadastro concluido, volta: o cartao entra e o estado '
        'vazio sai', (tester) async {
      final servidor = ServidorDePets();
      await abrirOPerfil(tester, servidor);

      // A PRE-CONDICAO E PARTE DA ISCA. Sem ela o caso poderia estar medindo
      // uma tela que nunca chegou ao estado vazio, e passaria por nao ter
      // entrado no cenario.
      expect(
        find.text(MeusPets.tituloDoVazio),
        findsOneWidget,
        reason: 'A isca nao entrou no cenario: o Perfil precisa abrir NO '
            'estado vazio, com a conta sem pet, antes de o pet nascer.',
      );
      expect(servidor.pets, isEmpty);

      await cadastrarEVoltar(
        tester,
        porta: find.widgetWithText(BotaoPrimario, 'Cadastrar meu pet'),
      );

      expect(servidor.pets, hasLength(1));
      expect(
        find.text(MeusPets.tituloDoVazio),
        findsNothing,
        reason: 'REPROVA: o pet existe no servidor e a tela continua dizendo '
            '"${MeusPets.tituloDoVazio}". E exatamente o que o cliente leu no '
            'aparelho dele em 22/09. O mecanismo e a recarga por visibilidade '
            'de `MeusPets`; desligue-a e este caso reprova aqui.',
      );
      expect(
        find.byType(EstadoVazio),
        findsNothing,
        reason: 'REPROVA: o `EstadoVazio` ficou na arvore com um pet na '
            'conta. E o criterio 10 da BICHUS-62 violado pela ordem real dos '
            'acontecimentos.',
      );
      expect(find.text('Nina'), findsOneWidget);
      expect(find.byType(CartaoDePet), findsOneWidget);
    });

    testWidgets('a tela que ja mostrava N cartoes passa a mostrar N+1',
        (tester) async {
      // O caso anterior sozinho aceitaria um conserto que so tratasse o vazio
      // (um `if (_pets.isEmpty) recarregar`). Este cobra a lista, e nao o
      // estado vazio.
      final servidor = ServidorDePets(
        inicial: <Map<String, dynamic>>[
          petDoContrato(id: 'p-0', nome: 'Mel'),
        ],
      );
      await abrirOPerfil(tester, servidor);
      expect(find.byType(CartaoDePet), findsOneWidget);

      // Sem tocar em aba nenhuma: o tutor fica no `Perfil` o tempo todo, e e
      // a VOLTA do assistente que precisa acordar a tela. Um caso que passasse
      // pela aba `Pets` no meio estaria medindo a troca de aba, que e outro
      // gatilho.
      await cadastrarEVoltar(tester);

      expect(
        find.byType(CartaoDePet),
        findsNWidgets(2),
        reason: 'REPROVA: a conta tem ${servidor.pets.length} pets e a tela '
            'mostra ${find.byType(CartaoDePet).evaluate().length} cartoes. A '
            'recarga ao voltar nao pode valer so para o estado vazio.',
      );
      expect(find.text('Mel'), findsOneWidget);
      expect(find.text('Nina'), findsOneWidget);
    });
  });

  group('BICHUS-220 — voltar para a aba tambem relista', () {
    testWidgets('sair do Perfil, o pet nascer fora, e voltar: o cartao entra',
        (tester) async {
      // A outra metade do mesmo mecanismo. Aqui o pet nao nasce pelo
      // assistente: ele aparece no servidor enquanto o tutor esta em outra
      // aba, que e o que acontece quando ele cadastra pelo site, quando outra
      // pessoa da casa cadastra, ou quando o suporte mexe na conta.
      final servidor = ServidorDePets();
      await abrirOPerfil(tester, servidor);
      expect(find.text(MeusPets.tituloDoVazio), findsOneWidget);

      await tocar(tester, find.widgetWithText(NavigationDestination, 'Pets'));
      servidor.pets.add(petDoContrato(id: 'p-1', nome: 'Nina'));
      await tocar(tester, find.widgetWithText(NavigationDestination, 'Perfil'));

      expect(
        find.text('Nina'),
        findsOneWidget,
        reason: 'REPROVA: o pet existe e a aba `Perfil` continua mostrando o '
            'que ela leu na primeira vez. Trocar de aba nao desmonta a tela: '
            'sem gatilho de visibilidade, `_carregar()` nunca mais roda.',
      );
      expect(find.text(MeusPets.tituloDoVazio), findsNothing);
    });
  });

  group('BICHUS-220 — contraprova: nao basta recarregar sempre', () {
    testWidgets('entrar no assistente e voltar SEM concluir mantem a tela '
        'coerente', (tester) async {
      // Sem esta contraprova a isca de cima fica verde por excesso: uma
      // recarga disparada em qualquer reconstrucao passaria nela e estragaria
      // aqui, apagando a lista a cada respiro da arvore.
      final servidor = ServidorDePets(
        inicial: <Map<String, dynamic>>[
          petDoContrato(id: 'p-0', nome: 'Mel'),
        ],
      );
      await abrirOPerfil(tester, servidor);
      expect(find.byType(CartaoDePet), findsOneWidget);
      final leiturasAteAqui = servidor.leituras;

      // A porta e a ACAO PERMANENTE de `Perfil` > `Meus pets` (BICHUS-232),
      // e nao mais o botao da secao `Pets`, que saiu em 22/09.
      //
      // O caso ganha com a troca: com um pet na lista, esta acao **nao
      // existia** antes de hoje, e a ida e volta ao assistente com a lista
      // cheia era um caminho que nenhum teste percorria.
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, 'Cadastrar meu pet'),
      );
      // Desiste: a saida da propria tela do assistente, que em F1.3 e
      // `Voltar`.
      await tocar(tester, find.byTooltip('Voltar'));
      await tocar(tester, find.widgetWithText(NavigationDestination, 'Perfil'));

      expect(servidor.pets, hasLength(1));
      expect(
        find.byType(CartaoDePet),
        findsOneWidget,
        reason: 'REPROVA: desistir do cadastro mudou a lista. A tela precisa '
            'continuar coerente com o servidor, e o servidor nao mudou.',
      );
      expect(find.text('Mel'), findsOneWidget);
      expect(find.byType(EstadoVazio), findsNothing);
      expect(
        servidor.leituras,
        lessThanOrEqualTo(leiturasAteAqui + 4),
        reason: 'REPROVA: ${servidor.leituras - leiturasAteAqui} leituras de '
            '`GET /v1/pets` para uma ida e volta. A recarga e por '
            'visibilidade, e nao por reconstrucao: cada mudanca de tema, de '
            'escala de fonte ou de rotacao nao pode virar uma chamada de '
            'rede.',
      );
    });

    testWidgets('a recarga que falha cai na faixa de cache, e nunca no vazio',
        (tester) async {
      // Criterio 3 da BICHUS-220. E o desfecho que separa este defeito do
      // outro que o cliente poderia ter visto: com a leitura quebrada, a tela
      // **nao** pode fingir que a conta esta vazia.
      final servidor = ServidorDePets(
        inicial: <Map<String, dynamic>>[
          petDoContrato(id: 'p-0', nome: 'Mel'),
        ],
      );
      await abrirOPerfil(tester, servidor);
      expect(find.text('Mel'), findsOneWidget);

      servidor.leituraQuebrada = true;
      await tocar(tester, find.widgetWithText(NavigationDestination, 'Pets'));
      await tocar(tester, find.widgetWithText(NavigationDestination, 'Perfil'));

      expect(
        find.text(MeusPets.tituloDoVazio),
        findsNothing,
        reason: 'REPROVA: a recarga falhou e a tela mostrou o estado vazio. '
            'Uma lista vazia por falha e indistinguivel de "voce nao tem '
            'pet", que e o estado vazio que parece sucesso.',
      );
      expect(
        find.text(MeusPets.faixaDeCache),
        findsOneWidget,
        reason: 'REPROVA: a falha na recarga precisa dizer que o que esta na '
            'tela e o que estava salvo, e oferecer '
            '`${MeusPets.rotuloDeAtualizar}` (criterio 7 da BICHUS-62).',
      );
      expect(find.text('Mel'), findsOneWidget);
      expect(find.byType(FaixaDeAviso), findsOneWidget);
    });
  });
}
