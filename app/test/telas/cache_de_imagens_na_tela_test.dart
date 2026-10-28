import 'dart:io';
import 'dart:typed_data';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/cache_de_imagens.dart';
import 'package:bichu/api/conexoes_api.dart';
import 'package:bichu/api/pessoas_api.dart';
import 'package:bichu/api/seguranca_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/telas/pessoa/tela_perfil_de_pessoa.dart';
import 'package:bichu/telas/seguranca/menu_do_perfil.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/imagem_da_rede.dart';
import 'package:bichu/widgets/imagem_em_cache.dart';
import 'package:bichu/widgets/marca_da_pessoa.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// AS DUAS ISCAS DO CACHE DE IMAGEM EM DISCO (BICHUS-296).
///
/// ## DESLIGAR PARA VER REPROVAR — a isca do cache
///
/// Em `lib/widgets/imagem_da_rede.dart`, no fim do metodo `_provedor`, troque
///
///     return ImagemEmCache(url: url, chave: chave, ...);
///
/// por `return NetworkImage(url);`. Isso desliga o cache por completo sem
/// apagar nada mais. **MEDIDO em 27/10/2026: `+4 -1`, e reprova UMA**, por
/// nome:
///
/// - `ImagemDaRede com chave escolhe o provedor de CACHE, e sem chave nao`
///
/// **Os dois interruptores mais obvios NAO compilam, e isso foi medido antes
/// de este texto ser escrito** -- quem tentar o caminho curto perde o tempo
/// que este paragrafo devolve. Pondo `return NetworkImage(url);` no comeco do
/// metodo, `chave` fica sem uso e o `ImagemEmCache` abaixo fica inalcancavel;
/// invertendo `if (chave == null)` para `if (chave != null)`, o `chave` que
/// desce para o construtor deixa de ser promovido e o tipo nao casa. Nos dois
/// casos o arquivo **nao carrega**, e o relatorio diz `-1` em `loading` em vez
/// de nomear um caso -- que e um verde falso ao contrario: parece isca, e nao
/// e.
///
/// **Por que SO uma reprova, e por que isso esta certo.** Os outros tres casos
/// exercitam `CacheDeImagensNoAparelho` **direto**, sem passar pela arvore:
/// eles medem o motor, e o motor continua inteiro quando o fio e cortado. Para
/// ve-los reprovar, troque o corpo de `CacheDeImagensNoAparelho.gravar` por
/// `return false;`. Dizer aqui que os quatro reprovariam seria uma afirmacao
/// que a execucao desmente.
///
/// ## DESLIGAR PARA VER REPROVAR — a isca da privacidade
///
/// Em `lib/telas/pessoa/tela_perfil_de_pessoa.dart`, troque o corpo de
/// `_esquecerAsFotosDela` por `return;`. **REMEDIDO em 27/10/2026 sobre a
/// arvore integrada: `+4 -1`**, e reprova **so uma**, que e a que importa:
///
/// - `a foto de PESSOA sai do disco quando a conexao e desfeita PELO menu ⋮`
///
/// Duas chaves separadas de proposito: a primeira mede que o cache existe, a
/// segunda mede que ele **obedece a regra de visibilidade**. Uma isca que
/// reprovasse pelos dois motivos nao distinguiria "o cache quebrou" de "a
/// Emenda 3 do ADR-0010 deixou de valer no disco" -- e e a segunda que e a
/// decisao desta frente.
///
/// ## REANCORAGEM DE 27/10/2026: `Desfazer conexão` SAIU DO CORPO DA TELA
///
/// **O que a isca da privacidade media antes.** Ela abria o perfil de uma
/// conexao aceita com a foto dela JA em disco, achava `Desfazer conexão` **no
/// corpo da tela** por `find.text`, tocava, e cobrava o arquivo fora do disco
/// no fim -- com dois controles positivos: o arquivo presente ANTES, e a
/// chamada `DELETE /v1/connections/r1` registrada.
///
/// **O que mudou na estrutura.** Outra entrega moveu o botao para o menu `⋮` da
/// barra, por pedido do cliente de 22/10/2026 (*"leve o desfazer conexao para
/// os 3 pontinhos, junto com o denunciar"*). O corpo da tela nao desenha mais
/// `Desfazer conexão`, e um `PopupMenuButton` nao monta os itens dele enquanto
/// o menu nao abre: o `find.text` achava **zero** widgets -- medido em
/// 27/10/2026, `Found 0 widgets with text "Desfazer conexão"` -- e a isca
/// reprovava no seu PROPRIO controle positivo, antes de chegar ao disco.
///
/// **O que ela mede agora, e e MAIS do que antes.** O caminho inteiro **pelo
/// `⋮`**: abrir o menu da barra, tocar o item de desfazer, e cobrar o arquivo
/// fora do disco. **E isso tem de ser medido exatamente assim**, porque depois
/// do pedido de 22/10 o `⋮` e o **UNICO** caminho de desfazer que existe. A
/// frente da integracao roteou o `aoDesfazerConexao` do menu por `_encerrar`
/// (= `endConnection` **mais** `_esquecerAsFotosDela()`) precisamente por isso:
/// com a chamada crua de `widget.conexoes.encerrar`, desfazer pelo `⋮` deixaria
/// a foto no disco e a Emenda 3 valeria so enquanto a tela nao pintasse. **Uma
/// isca nova que medisse apenas que o item EXISTE apagaria a prova dessa
/// regra** -- ela ficaria verde sobre a chamada crua.
///
/// **Por que o veredito continua o mesmo.** O fato cobrado nao mudou uma
/// virgula: um arquivo que sobrevive a perda da permissao transforma a decisao
/// de privacidade numa regra de INTERFACE. A isca ganhou um terceiro controle
/// positivo (o item existe no menu aberto) e uma afirmacao nova (o corpo NAO
/// tem mais o botao, que e a decisao de 22/10), e nenhuma assercao foi
/// afrouxada.
///
/// ## POR QUE `tester.runAsync`, e nao `pumpAndSettle` sozinho
///
/// Dentro de `testWidgets` o relogio e falso, e `pumpAndSettle` adianta
/// TIMERS. I/O de arquivo e real e nao e timer: um `File.readAsBytes` disparado
/// durante o `pump` nao completa ali, e o caso ficaria pendurado ate o teto sem
/// mensagem que aponte para a causa. `runAsync` roda o trecho no relogio de
/// verdade, que e onde o disco responde.
const String _apelido = 'marina';
const String _urlBase = 'https://api.exemplo.test';
const String _urlDaFoto = 'https://m.bichu.app/u/4b2e/thumb.webp';

/// Um PNG de 1x1 valido. Precisa ser decodificavel de verdade: um `Uint8List`
/// qualquer faria o `Image` cair no `errorBuilder`, e os casos mediriam o
/// estado de falha achando que mediam o de sucesso.
final Uint8List _pngDeUmPixel = Uint8List.fromList(<int>[
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, //
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
  0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9C, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
  0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D,
  0xB0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
  0x44, 0xAE, 0x42, 0x60, 0x82,
]);

Directory _pastaNova() {
  // `createTempSync` e nao `createTemp`: ver o cabecalho sobre o relogio falso.
  // **Uma pasta por caso**, ou o despejo de um contamina o outro e se caca um
  // defeito do cache que e do proprio teste.
  final pasta = Directory.systemTemp.createTempSync('bichu-cache-na-tela');
  addTearDown(() {
    if (pasta.existsSync()) pasta.deleteSync(recursive: true);
  });
  return pasta;
}

http.Response _json(Map<String, dynamic> corpo, {int status = 200}) {
  return http.Response(
    '{${corpo.entries.map((e) => '"${e.key}":${_valor(e.value)}').join(',')}}',
    status,
    headers: const <String, String>{'content-type': 'application/json'},
  );
}

String _valor(Object? v) {
  if (v == null) return 'null';
  if (v is String) return '"$v"';
  if (v is num || v is bool) return '$v';
  if (v is Map<String, dynamic>) {
    return '{${v.entries.map((e) => '"${e.key}":${_valor(e.value)}').join(',')}}';
  }
  if (v is List<Object?>) return '[${v.map(_valor).join(',')}]';
  return '"$v"';
}

void main() {
  group('o provedor que `ImagemDaRede` escolhe', () {
    testWidgets(
      'ImagemDaRede com chave escolhe o provedor de CACHE, e sem chave nao',
      (tester) async {
        // Medicao ESTRUTURAL e nao de pintura: o que este caso cobra e a
        // escolha do provedor, que e exatamente o que a isca desliga. Sem
        // tocar o disco, ele roda sob o relogio falso sem `runAsync`.
        final cache = CacheDeImagensNoAparelho(pasta: () async => _pastaNova());

        await tester.pumpWidget(
          MaterialApp(
            theme: BichuTheme.claro,
            home: CacheDeImagensDoAplicativo(
              cache: cache,
              buscador: (_) async => _pngDeUmPixel,
              child: const Column(
                children: <Widget>[
                  SizedBox(
                    width: 40,
                    child: ImagemDaRede(
                      url: _urlDaFoto,
                      descricao: null,
                      largura: 40,
                      cache: null,
                    ),
                  ),
                  SizedBox(
                    width: 40,
                    child: MarcaDaPessoa(
                      urlDoIcone: _urlDaFoto,
                      inicial: 'M',
                      apelido: _apelido,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
        await tester.pump();

        final provedores = tester
            .widgetList<Image>(find.byType(Image))
            .map((i) => i.image)
            .whereType<ResizeImage>()
            .map((r) => r.imageProvider)
            .toList();

        expect(
          provedores.whereType<ImagemEmCache>(),
          hasLength(1),
          reason: 'REPROVA: a chamada COM chave de cache nao montou um '
              '`ImagemEmCache`. O cache em disco esta desligado, e a foto '
              'volta pela rede em toda abertura do aplicativo -- que e '
              'exatamente o que o cliente pediu para parar de acontecer em '
              '26/10/2026.',
        );
        expect(
          provedores.whereType<NetworkImage>(),
          hasLength(1),
          reason: 'REPROVA: a chamada SEM chave deixou de ser `NetworkImage`. '
              'O cache precisa ser OPT-IN: a imagem do QR da tag carrega a '
              'credencial nos pixeis (ADR-0004) e nao pode encostar no disco, '
              'e ha portao medindo isso em `qr_na_tela_test.dart`.',
        );
      },
    );

    testWidgets('sem cache no escopo, nada muda em relacao a antes', (tester) async {
      // O CONTROLE POSITIVO do caso acima, e a garantia de que os 210 arquivos
      // de teste que existiam nao passaram a tocar o disco: sem o
      // `CacheDeImagensDoAplicativo` na arvore, a chave e ignorada.
      await tester.pumpWidget(
        MaterialApp(
          theme: BichuTheme.claro,
          home: SizedBox(
            width: 40,
            child: ImagemDaRede(
              url: _urlDaFoto,
              descricao: null,
              largura: 40,
              cache: ChaveDeImagem.publica(_urlDaFoto),
            ),
          ),
        ),
      );
      await tester.pump();

      final provedor = (tester.widget<Image>(find.byType(Image)).image as ResizeImage)
          .imageProvider;

      expect(
        provedor,
        isA<NetworkImage>(),
        reason: 'REPROVA: chave de cache sem `CacheDeImagensDoAplicativo` no '
            'escopo montou um provedor de disco. Sem o escopo nao ha pasta '
            'nem buscador, e resolve-los dentro de `build` chamaria '
            '`path_provider` -- um canal de plataforma que trava o '
            '`pumpAndSettle` para sempre, sem mensagem.',
      );
    });
  });

  group('o disco responde', () {
    test('o DISCO responde na segunda pintura, e a rede nao e chamada de novo', () async {
      // **O GANHO QUE O CLIENTE PEDIU, medido.** `test` e nao `testWidgets`:
      // aqui o relogio e real, e e o disco que se mede -- nao a arvore.
      final pasta = Directory.systemTemp.createTempSync('bichu-cache-disco');
      addTearDown(() => pasta.deleteSync(recursive: true));
      final cache = CacheDeImagensNoAparelho(pasta: () async => pasta);
      final chave = ChaveDeImagem.publica(_urlDaFoto)!;

      var idas = 0;
      Future<Uint8List?> buscar(String url) async {
        idas++;
        return _pngDeUmPixel;
      }

      // Primeira: nao ha nada em disco, e a rede e chamada.
      expect(await cache.ler(chave), isNull);
      final bytes = await buscar(_urlDaFoto);
      expect(await cache.gravar(chave, bytes!), isTrue);
      expect(idas, 1);

      // Segunda: o disco responde. **O cache em MEMORIA nao conta aqui** --
      // esta medicao e de processo novo, que e o caso que `Image.network`
      // nunca cobriu: o aplicativo fechado e reaberto.
      final doDisco = await cache.ler(chave);
      expect(
        doDisco,
        isNotNull,
        reason: 'REPROVA: a imagem nao estava no disco na segunda leitura. '
            '`Image.network` guarda so em MEMORIA, e a memoria morre com o '
            'processo: sem este arquivo, fechar e reabrir o aplicativo busca '
            'tudo pela rede de novo.',
      );
      expect(doDisco, _pngDeUmPixel);
      expect(
        idas,
        1,
        reason: 'REPROVA: a rede foi chamada $idas vezes para a MESMA imagem. '
            'Menos trafego e abertura mais rapida eram o pedido; sem este '
            'numero em 1, o cache nao esta entregando nenhum dos dois.',
      );
    });

    test('a foto de PESSOA chega ao disco com a identidade dela na chave', () async {
      final pasta = Directory.systemTemp.createTempSync('bichu-cache-pessoa');
      addTearDown(() => pasta.deleteSync(recursive: true));
      final cache = CacheDeImagensNoAparelho(pasta: () async => pasta);

      final chave = ChaveDeImagem.dePessoa(_urlDaFoto, apelido: _apelido)!;
      await cache.gravar(chave, _pngDeUmPixel);

      expect(
        chave.caminhoRelativo,
        startsWith('${ChaveDeImagem.pastaDePessoas}/'),
        reason: 'REPROVA: a foto de uma pessoa foi gravada fora da pasta por '
            'pessoa. E a pasta que torna `esquecerPessoa` uma remocao de '
            'diretorio: sem ela, apagar a foto de quem deixou de ser conexao '
            'exigiria abrir cada arquivo do cache para descobrir de quem ele e '
            '-- e a Emenda 3 do ADR-0010 deixaria de valer no disco na '
            'primeira vez que isso ficasse caro.',
      );
      expect(await cache.ler(chave), isNotNull);
    });
  });

  group('A ISCA DA PRIVACIDADE: desfazer conexao tira o arquivo do disco', () {
    testWidgets(
        'a foto de PESSOA sai do disco quando a conexao e desfeita PELO menu ⋮',
        (
      tester,
    ) async {
      // **A isca que sustenta a decisao desta frente.** A Emenda 3 do ADR-0010
      // (cliente, 19/10/2026) diz que a foto de uma pessoa aparece para outra
      // *"apenas quando as duas ja aceitaram conexao"*. No servidor isso e uma
      // clausula `WHERE`; no aparelho, um arquivo gravado continua gravado.
      // Este caso roda o caminho inteiro -- tela de perfil de uma conexao
      // aceita, com a foto dela JA em disco, e o toque em `Desfazer conexão`
      // **DENTRO DO MENU `⋮`**, que desde 22/10/2026 e o unico caminho que
      // existe -- e cobra o arquivo fora do disco no fim. Ver o paragrafo da
      // reancoragem no cabecalho: medir so que o item existe apagaria a prova
      // de que o `⋮` passa por `_encerrar` e nao pela chamada crua.
      AppConfig.limparParaTeste();
      final pasta = _pastaNova();
      final cache = CacheDeImagensNoAparelho(pasta: () async => pasta);
      final chave = ChaveDeImagem.dePessoa(_urlDaFoto, apelido: _apelido)!;

      // Semear o disco com a foto dela, no relogio de verdade.
      await tester.runAsync(() => cache.gravar(chave, _pngDeUmPixel));
      final antes = await tester.runAsync(() => cache.ler(chave));
      expect(
        antes,
        isNotNull,
        reason: 'A MEDICAO QUE SUSTENTA O RESTO: sem o arquivo em disco agora, '
            'este caso passaria sozinho medindo a ausencia de uma peca em vez '
            'de um defeito -- ele diria "o arquivo saiu" sobre um arquivo que '
            'nunca entrou.',
      );

      final chamadas = <String>[];
      final cliente = MockClient((http.Request pedido) async {
        chamadas.add('${pedido.method} ${pedido.url.path}');
        if (pedido.method == 'DELETE') return http.Response('', 204);
        if (pedido.url.path.contains('/people/')) {
          return _json(<String, dynamic>{
            'handle': _apelido,
            'display_name': 'Marina',
            'public_ref': 'pr-1',
            'pets_count': 0,
            'connections_count': 0,
            'photo_icon_url': _urlDaFoto,
            'connection_state': 'connected',
            'connection_ref': 'r1',
          });
        }
        return _json(<String, dynamic>{}, status: 404);
      });
      final api = ApiClient(
        config: AppConfig.carregar(apiBaseUrlDeTeste: _urlBase),
        cliente: cliente,
        tokenDeAcesso: () async => 'token-de-teste',
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: BichuTheme.claro,
          home: TelaDePerfilDePessoa(
            apelido: _apelido,
            pessoas: PessoasApi(api),
            conexoes: ConexoesApi(api),
            seguranca: SegurancaApi(api),
            cacheDeImagens: cache,
          ),
        ),
      );
      await tester.pumpAndSettle();

      // **A DECISAO DE 22/10/2026, AFIRMADA.** O corpo da tela nao desenha mais
      // `Desfazer conexão`: o cliente pediu *"leve o desfazer conexao para os 3
      // pontinhos, junto com o denunciar"*. Esta linha nao e zelo -- ela e o
      // que impede este caso de voltar a medir um botao no corpo se alguem
      // repuser a porta velha, e o caso continuaria verde sobre um caminho que
      // nao e o que a pessoa usa.
      expect(
        find.text(MenuDoPerfil.desfazerConexao),
        findsNothing,
        reason: 'REPROVA: `${MenuDoPerfil.desfazerConexao}` esta no CORPO da '
            'tela, antes de o menu `⋮` ser aberto. Ele saiu do corpo em '
            '22/10/2026 por pedido do cliente, e este caso mede o caminho '
            'DELE: duas portas para a mesma acao deixariam a isca medir a que '
            'ninguem usa.',
      );

      // **O PRIMEIRO CONTROLE POSITIVO: o `⋮` esta na barra.** Sem ele nao ha
      // por onde desfazer, e o `expect` do arquivo no fim mediria "a tela nao
      // desenhou o ramo de conexao aceita" em vez de "o arquivo saiu do disco"
      // -- duas coisas diferentes com o mesmo resultado verde.
      final menu = find.byType(MenuDoPerfil);
      expect(
        menu,
        findsOneWidget,
        reason: 'O CONTROLE POSITIVO: o `⋮` nao esta na barra desta tela, '
            'entao nao ha caminho nenhum ate desfazer a conexao.',
      );

      // ABRIR O MENU. `pumpAndSettle` E SEGURO AQUI, e so aqui: a abertura do
      // `PopupMenuButton` e uma rota com animacao que TERMINA, e nada esta em
      // voo -- o `_carregar()` da abertura da tela ja assentou acima. Depois do
      // toque no ITEM, nao: ver o paragrafo dos tres relogios mais abaixo.
      await tester.tap(menu);
      await tester.pumpAndSettle();

      // **O SEGUNDO CONTROLE POSITIVO: o item existe no menu ABERTO.** O
      // recorte por estado mora em `TelaDePerfilDePessoa.build` -- o `⋮`
      // aparece nos quatro estados da relacao, e `aoDesfazerConexao` so e
      // passado em `conectado` com `connectionRef` --, entao achar o item aqui
      // tambem prova que a bancada montou o estado de conexao ACEITA, que e o
      // unico em que a foto dela podia estar em disco.
      final itemDeDesfazer = find.text(MenuDoPerfil.desfazerConexao);
      expect(
        itemDeDesfazer,
        findsOneWidget,
        reason: 'O SEGUNDO CONTROLE POSITIVO: o menu `⋮` abriu e nao tem '
            '`${MenuDoPerfil.desfazerConexao}`. Ou a bancada nao montou o '
            'estado `conectado` com `connection_ref` -- e ai nao ha conexao a '
            'desfazer e este caso nao mede nada --, ou o item morreu e '
            'desfazer conexao deixou de ter caminho desde que ele saiu do '
            'corpo da tela em 22/10/2026.',
      );

      // **NEM `pumpAndSettle`, NEM `pump` DENTRO DE `runAsync`**, e as duas
      // recusas foram medidas neste caso.
      //
      // O desfazer atravessa tres relogios em sequencia: a resposta do
      // `MockClient` completa por microtarefa (relogio falso, `pump` basta),
      // `esquecerPessoa` e I/O de arquivo (relogio de verdade, so `runAsync`
      // adianta) e o `_carregar()` seguinte volta ao `MockClient`. Entao os
      // dois se alternam.
      //
      // `pumpAndSettle` no fim **pendurou este caso** na primeira escrita:
      // depois do toque a tela tem indicador de carregamento em animacao, e
      // `pumpAndSettle` espera a arvore parar de animar -- o que nao acontece
      // enquanto o `_carregar()` nao volta. O sintoma foi `pumpAndSettle timed
      // out`, que nao aponta para a causa. E o que este caso mede nao e a
      // arvore parada: e o ARQUIVO fora do disco.
      //
      // **SEIS VOLTAS E NAO QUATRO, desde a reancoragem de 27/10/2026.** Pelo
      // `⋮` ha um quarto relogio antes dos tres: a rota do menu FECHA com
      // animacao, e `onSelected` so dispara depois do `pop`. As duas voltas a
      // mais pagam esse fechamento sem trocar o laco por um `pumpAndSettle`
      // que penduraria o caso pela razao de cima.
      await tester.tap(itemDeDesfazer);
      for (var volta = 0; volta < 6; volta++) {
        await tester.pump();
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 50)),
        );
      }
      await tester.pump();

      expect(
        chamadas.any((c) => c == 'DELETE /v1/connections/r1'),
        isTrue,
        reason: 'O SEGUNDO CONTROLE POSITIVO: sem a chamada de desfazer, o '
            'arquivo poderia ter saido por qualquer outro motivo.',
      );

      final depois = await tester.runAsync(() => cache.ler(chave));
      expect(
        depois,
        isNull,
        reason: 'REPROVA: a foto da pessoa CONTINUA no disco depois de a '
            'conexao ser desfeita. A Emenda 3 do ADR-0010 (cliente, '
            '19/10/2026) diz que a foto dela aparece "SO quando as duas '
            'pessoas ja aceitaram conexao". Um arquivo que sobrevive a perda '
            'da permissao transforma essa decisao de privacidade numa regra de '
            'INTERFACE -- verdadeira enquanto a tela nao pintar, e falsa no '
            'aparelho. Ver `_esquecerAsFotosDela` em '
            '`telas/pessoa/tela_perfil_de_pessoa.dart`.',
      );
    });
  });
}
