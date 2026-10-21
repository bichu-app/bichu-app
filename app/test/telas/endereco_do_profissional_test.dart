// O ENDERECO COMPLETO DO PROFISSIONAL CHEGA A TELA, E ABRE O APP DE MAPAS.
//
// Pedido do cliente de 21/10/2026, nestas palavras: *"o endereco completo do
// profissional"* -- para a pessoa tocar nele e abrir o aplicativo de mapas.
//
// ## O que estava faltando, e NAO era a tela
//
// As quatro colunas (`postal_code`, `street`, `street_number`, `complement`)
// existiam em `professionals` desde a migracao `20261018000001`. Elas sairam
// so em `AdminDirectoryEntry`, com a razao escrita no proprio contrato: *"o
// aplicativo continua recebendo so bairro, cidade e UF"*. `DirectoryEntryDetail`
// nao tinha nenhuma das quatro. A decisao foi tomada, e a saida abriu.
//
// ## TRES CASOS, os mesmos tres do encontro da Rede
//
// `local_do_encontro.dart` trata com coordenada, sem coordenada e sem nada.
// Aqui as tres formas sao: com endereco de rua (linha tocavel), sem endereco de
// rua mas com bairro/cidade/UF (so a linha de lugar, sem toque) e sem nada
// (nenhuma linha). **Endereco ausente nao pode virar toque que abre o mapa no
// nada**, e e o terceiro grupo deste arquivo que mede isso.
//
// ## O CAMINHO E REUSADO, e o terceiro grupo prova isso
//
// Quem abre e `SaidaDoApp.abrirEnderecoNoAppDeMapas`, a MESMA porta do
// encontro: intencao `geo:0,0?q=<texto>`. Nao ha segundo jeito de abrir mapa
// nesta tela, e o dobre deste arquivo ESTOURA em `abrirNoAppDeMapas` (a variante
// de coordenada) para que um caminho novo reprove alto.
//
// ## A FRONTEIRA, que e o coracao do pedido
//
// Tres enderecos, tres posturas. O do PROFISSIONAL e comercial e publico, e e
// este. O do EVENTO e rua publica e ja estava feito. O do USUARIO e residencia
// e **nunca** sai: o quarto grupo mede que nenhuma linha desta tela nasce de
// endereco de pessoa, e o lado do contrato esta em
// `src/tools/endereco-do-profissional-nao-vale-para-pessoa.test.ts`.

import 'package:bichu/api/modelos_diretorio.dart';
import 'package:bichu/dispositivo/saida_do_app.dart';
import 'package:bichu/telas/perto/pagina_do_local.dart';
import 'package:flutter_test/flutter_test.dart';

import 'telefone_fora_da_tela_test.dart'
    show abrirOLocal, detalheComTudo, redeDoLocal, semanticaDaTela, textoVisivel;

/// O dobre da saida do aparelho.
///
/// **`abrirNoAppDeMapas` ESTOURA de proposito.** Ela e a variante de
/// COORDENADA, e esta tela nao tem coordenada: o contrato nao devolve o ponto
/// (ADR-0006, ADR-0010 item 4). Se alguem escrever um segundo caminho de mapa
/// aqui, este arquivo reprova alto em vez de aprovar calado.
class _SaidaDeMentira extends SaidaDoApp {
  final List<String> enderecos = <String>[];

  /// O que `abrirEnderecoNoAppDeMapas` devolve. `false` e o aparelho sem app
  /// de mapas, e a tela tem de dizer isso.
  bool abre = true;

  @override
  Future<bool> abrirEnderecoNoAppDeMapas({required String endereco}) async {
    enderecos.add(endereco);
    return abre;
  }

  @override
  Future<bool> abrirNoAppDeMapas({
    required double lat,
    required double lon,
    required String nomeDoLugar,
  }) async => throw StateError(
    'a pagina do local nao tem coordenada: o contrato nao devolve o ponto, e '
    'um segundo caminho de mapa aqui e duplicacao do que `local_do_encontro` '
    'ja faz',
  );

  @override
  Future<bool> abrirLink(Uri link) async =>
      throw StateError('a pagina do local nao abre link');

  @override
  Future<bool> adicionarAoCalendario(EventoDeCalendario evento) async =>
      throw StateError('a pagina do local nao escreve no calendario');

  @override
  Future<bool> compartilharTexto({
    required String texto,
    required String assunto,
  }) async => throw StateError('a pagina do local nao compartilha');
}

/// `DirectoryEntryDetail` com o endereco comercial que o servidor passou a
/// devolver em 21/10/2026.
Map<String, dynamic> detalheComEndereco({
  String? cep = '05422030',
  String? logradouro = 'Rua Teodoro Sampaio',
  String? numero = '1020',
  String? complemento = 'Sala 3',
}) {
  return <String, dynamic>{
    ...detalheComTudo(),
    'postal_code': cep,
    'street': logradouro,
    'street_number': numero,
    'complement': complemento,
  };
}

void main() {
  // Local de `main`, e nao de biblioteca: tipo privado em API publica de
  // arquivo de teste e um aviso do analisador, e esconde-lo com `ignore` seria
  // trocar o conserto pelo silencio.
  late _SaidaDeMentira saida;

  setUp(() {
    saida = _SaidaDeMentira();
    SaidaDoApp.atual = saida;
  });
  tearDown(SaidaDoApp.restaurar);

  // -------------------------------------------------------------------------
  group('CASO 1 — com endereço de rua, a linha é desenhada e é tocável', () {
    // DESLIGAR PARA VER REPROVAR: em `lib/telas/perto/pagina_do_local.dart`,
    // troque a condicao do bloco do CASO 1 por `if (false)`. Os tres casos
    // deste grupo reprovam -- o primeiro no texto, o segundo na semantica, o
    // terceiro na lista de enderecos do dobre, que fica vazia.

    testWidgets('o endereço aparece por extenso, com número, complemento e CEP '
        'mascarado', (tester) async {
      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: detalheComEndereco()),
      );
      final texto = textoVisivel(tester);
      // A linha INTEIRA, e nao "contem a rua": o pedido foi o endereco
      // COMPLETO, e um pedaco dele e o defeito que este caso existe para pegar.
      expect(texto, contains('Rua Teodoro Sampaio, 1020 - Sala 3'));
      // O CEP sai MASCARADO na tela e chega sem mascara do servidor. A mascara
      // e `mascaraDeCep`, a mesma do cadastro -- uma definicao so.
      expect(texto, contains('CEP 05422-030'));
      expect(
        texto,
        isNot(contains('05422030')),
        reason: 'REPROVA: o CEP cru na tela. O servidor guarda oito dígitos e '
            'quem lê espera `05422-030`.',
      );
      // E a linha de LUGAR continua embaixo: o endereco nao a substitui.
      expect(texto, contains('Pinheiros'));
    });

    testWidgets('o leitor de tela anuncia a AÇÃO antes do endereço', (
      tester,
    ) async {
      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: detalheComEndereco()),
      );
      // `Abrir no app de mapas: <endereço>`, e nao o contrario: quem ouve o
      // endereco primeiro precisa da linha inteira para descobrir que ela e
      // tocavel. Mesma forma do botao do encontro.
      expect(
        semanticaDaTela(tester),
        contains(
          '${PaginaDoLocal.rotuloDoMapa}: '
          'Rua Teodoro Sampaio, 1020 - Sala 3 · CEP 05422-030',
        ),
      );
    });

    testWidgets('tocar abre o app de mapas pela MESMA porta do encontro', (
      tester,
    ) async {
      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: detalheComEndereco()),
      );
      await tester.tap(find.text('Rua Teodoro Sampaio, 1020 - Sala 3 · CEP 05422-030'));
      await tester.pumpAndSettle();

      expect(
        saida.enderecos,
        hasLength(1),
        reason: 'REPROVA: o toque não chamou `abrirEnderecoNoAppDeMapas`. Essa '
            'é a porta única do `geo:`, e um caminho novo seria duplicação.',
      );
      // O TEXTO DA BUSCA nao e a linha exibida, e a diferenca e deliberada: o
      // COMPLEMENTO sai (nenhum mapa procura por `sala 302`) e o bairro, a
      // cidade e a UF entram (`Rua Teodoro Sampaio, 1020` existe em muitas
      // cidades).
      expect(
        saida.enderecos.single,
        'Rua Teodoro Sampaio, 1020 - Pinheiros - São Paulo - SP - 05422-030',
      );
      expect(
        saida.enderecos.single,
        isNot(contains('Sala 3')),
        reason: 'REPROVA: o complemento foi para a busca do mapa. Nenhum mapa '
            'procura por `Sala 3`, e incluí-lo piora o resultado.',
      );
    });

    testWidgets('aparelho sem app de mapas: a tela DIZ, e não fica calada', (
      tester,
    ) async {
      saida.abre = false;
      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: detalheComEndereco()),
      );
      await tester.tap(find.text('Rua Teodoro Sampaio, 1020 - Sala 3 · CEP 05422-030'));
      await tester.pumpAndSettle();
      expect(find.text(PaginaDoLocal.falhaAoAbrirMapa), findsOneWidget);
    });

    testWidgets('rua SEM número é caso legítimo: nenhuma vírgula órfã', (
      tester,
    ) async {
      // Estrada, rodovia e quadra. A migracao recusou de proposito um `CHECK`
      // que exigisse rua e numero juntos, e juntar a mao produziria
      // `"Rodovia Raposo Tavares, "`.
      await abrirOLocal(
        tester,
        rede: redeDoLocal(
          detalhe: detalheComEndereco(
            logradouro: 'Rodovia Raposo Tavares KM 32',
            numero: null,
            complemento: null,
            cep: null,
          ),
        ),
      );
      final texto = textoVisivel(tester);
      expect(texto, contains('Rodovia Raposo Tavares KM 32'));
      expect(texto, isNot(contains('Rodovia Raposo Tavares KM 32,')));
      expect(texto, isNot(contains('CEP')));
    });
  });

  // -------------------------------------------------------------------------
  group('CASO 2 — sem endereço de rua, a página fica inteira e sem toque', () {
    testWidgets('autônomo sem endereço comercial: linha de lugar, e nenhuma '
        'de endereço', (tester) async {
      // E a MAIORIA das entradas. Adestrador, passeador e veterinario que
      // atende em casa nao tem endereco comercial, e a migracao deixou as
      // quatro colunas anulaveis exatamente para ele continuar cadastravel sem
      // publicar onde mora.
      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: detalheComTudo()),
      );
      // A pagina esta CHEIA -- sem esta ancora, os `findsNothing` abaixo
      // passariam sobre o vazio.
      expect(textoVisivel(tester), contains('Clínica Santa Bárbara'));
      expect(textoVisivel(tester), contains('Pinheiros'));
      expect(
        find.textContaining(PaginaDoLocal.rotuloDoMapa),
        findsNothing,
        reason: 'REPROVA: a tela ofereceu o mapa sem ter endereço.',
      );
      expect(
        semanticaDaTela(tester),
        isNot(contains(PaginaDoLocal.rotuloDoMapa)),
      );
    });

    testWidgets('CEP e complemento SEM logradouro não desenham linha nenhuma', (
      tester,
    ) async {
      // `05422-030` sozinho nao e um endereco que alguem leia, e `Sala 3`
      // sozinho e uma linha que nao diz onde fica nada. A condicao e o
      // LOGRADOURO, e nao "algum dos quatro veio".
      await abrirOLocal(
        tester,
        rede: redeDoLocal(
          detalhe: detalheComEndereco(logradouro: null, numero: null),
        ),
      );
      final texto = textoVisivel(tester);
      expect(texto, contains('Clínica Santa Bárbara'));
      expect(texto, isNot(contains('05422-030')));
      expect(texto, isNot(contains('Sala 3')));
      expect(find.textContaining(PaginaDoLocal.rotuloDoMapa), findsNothing);
    });
  });

  // -------------------------------------------------------------------------
  group('CASO 3 — ISCA: endereço ausente nunca vira toque no nada', () {
    testWidgets('resposta SEM os quatro campos não estoura e não oferece mapa', (
      tester,
    ) async {
      // O APK publicado le esta resposta e nao conhece os quatro campos; por
      // simetria, uma resposta velha chega sem eles. Ausente, nulo, vazio e de
      // outro tipo tem de virar nulo, e a pagina existir sem a linha.
      final detalhe = detalheComTudo();
      expect(
        detalhe.containsKey('street'),
        isFalse,
        reason: 'a isca exige que a resposta REALMENTE não traga o campo',
      );
      await abrirOLocal(tester, rede: redeDoLocal(detalhe: detalhe));
      expect(find.byType(PaginaDoLocal), findsOneWidget);
      expect(find.textContaining(PaginaDoLocal.rotuloDoMapa), findsNothing);
      expect(saida.enderecos, isEmpty);
    });

    testWidgets('campo de OUTRO tipo vira nulo, e não derruba a página', (
      tester,
    ) async {
      await abrirOLocal(
        tester,
        rede: redeDoLocal(
          detalhe: <String, dynamic>{
            ...detalheComTudo(),
            'street': 42,
            'street_number': <String>['1020'],
            'postal_code': '',
            'complement': '   ',
          },
        ),
      );
      expect(find.byType(PaginaDoLocal), findsOneWidget);
      expect(find.textContaining(PaginaDoLocal.rotuloDoMapa), findsNothing);
      expect(textoVisivel(tester), isNot(contains('42')));
    });
  });

  // -------------------------------------------------------------------------
  group('A FRONTEIRA — este endereço é de ENTIDADE, nunca de pessoa', () {
    // DESLIGAR PARA VER REPROVAR: em `lib/api/modelos_diretorio.dart`, faca
    // `temEnderecoDeRua` devolver `cep != null || complemento != null ||
    // logradouro != null`. O primeiro caso deste grupo reprova: `Sala 3`
    // passaria a desenhar uma linha tocável que manda o mapa buscar nada.

    testWidgets('ISCA DE VAZAMENTO: a busca do mapa nunca leva complemento, '
        'que é a parte que localiza a PORTA de alguém', (tester) async {
      // O complemento e o pedaco mais residencial dos quatro -- `apto 52`,
      // `casa dos fundos`. Ele e linha de LEITURA, e nunca termo de busca: o
      // texto que sai do aparelho para um app de terceiro nao o carrega.
      await abrirOLocal(
        tester,
        rede: redeDoLocal(
          detalhe: detalheComEndereco(complemento: 'Apto 52'),
        ),
      );
      await tester.tap(
        find.text('Rua Teodoro Sampaio, 1020 - Apto 52 · CEP 05422-030'),
      );
      await tester.pumpAndSettle();
      expect(saida.enderecos, hasLength(1));
      expect(
        saida.enderecos.single,
        isNot(contains('Apto 52')),
        reason: 'REPROVA: o complemento saiu do aparelho dentro da busca de um '
            'app de terceiro. Ele é linha de leitura, não termo de busca.',
      );
    });

    testWidgets('ISCA DE VAZAMENTO: a composição não inventa endereço a partir '
        'de bairro, cidade e UF', (tester) async {
      // Sem logradouro NAO ha endereco, e `Pinheiros - São Paulo - SP` nao e
      // um. Uma composicao que caisse para a linha de lugar faria a tela
      // oferecer o mapa de um bairro inteiro como se fosse a porta do local --
      // e, no dia em que este codigo fosse copiado para uma tela de PESSOA,
      // seria o endereco dela aproximado por bairro.
      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: detalheComEndereco(logradouro: null)),
      );
      expect(find.textContaining(PaginaDoLocal.rotuloDoMapa), findsNothing);
      expect(saida.enderecos, isEmpty);
      expect(
        const EnderecoComercialDaEntrada(
          complemento: 'Sala 3',
          cep: '05422030',
        ).textoParaBuscaNoMapa(
          bairro: 'Pinheiros',
          cidade: 'São Paulo',
          estado: 'SP',
        ),
        isNull,
      );
    });

    testWidgets('a linha do endereço é a ÚNICA ação nova: o botão `Ligar` e a '
        'linha de lugar continuam como eram', (tester) async {
      // Contrapeso. Uma tela que ganhasse o endereco e perdesse o telefone
      // teria passado nos casos acima e quebrado o pedido de 18/10.
      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: detalheComEndereco()),
      );
      expect(find.text(PaginaDoLocal.rotuloDeLigar), findsOneWidget);
      expect(textoVisivel(tester), contains('Pinheiros'));
      // E o numero continua FORA da tela (pedido de 19/10).
      expect(textoVisivel(tester), isNot(contains('11987654321')));
    });
  });
}
