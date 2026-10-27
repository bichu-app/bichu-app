import 'dart:io';
import 'dart:typed_data';

import 'package:bichu/api/cache_de_imagens.dart';
import 'package:flutter_test/flutter_test.dart';

/// A BANCADA DO CACHE DE IMAGEM EM DISCO (BICHUS-296).
///
/// ## CADA CASO TEM A PROPRIA PASTA, e isso nao e zelo
///
/// [_bancada] cria uma pasta nova por caso e a apaga no `tearDown`. Sem isso o
/// caso do teto despejaria os arquivos que o caso de leitura acabou de gravar,
/// e o segundo reprovaria por causa do primeiro -- um defeito do teste que se
/// parece exatamente com um defeito do cache, e que se cacaria no lugar errado.
///
/// `createTempSync` e nao `createTemp`: nos casos de widget o tempo e falso e
/// um `Future` de I/O real nunca completa. Aqui nao haveria problema, mas as
/// duas bancadas usam a mesma forma de proposito.
///
/// ## DESLIGAR PARA VER REPROVAR
///
/// Os casos DESTE arquivo medem a peca de baixo, e nao a tela. Para ve-los
/// reprovar, troque o corpo de `CacheDeImagensNoAparelho.gravar` por
/// `return false;`.
///
/// Os dois interruptores da TELA -- o do cache e o da regra de privacidade --,
/// com o que cada um reprova medido, estao no cabecalho de
/// `test/telas/cache_de_imagens_na_tela_test.dart`.
void main() {
  late Directory pasta;
  late CacheDeImagensNoAparelho cache;

  /// Monta uma pasta nova e um cache apontado para ela.
  void bancada({int teto = CacheDeImagensNoAparelho.tetoPadraoDeBytes}) {
    pasta = Directory.systemTemp.createTempSync('bichu-cache-imagens');
    addTearDown(() {
      if (pasta.existsSync()) pasta.deleteSync(recursive: true);
    });
    cache = CacheDeImagensNoAparelho(
      pasta: () async => pasta,
      tetoDeBytes: teto,
    );
  }

  Uint8List bytes(int quantos, [int valor = 7]) =>
      Uint8List.fromList(List<int>.filled(quantos, valor));

  group('a chave e o CAMINHO da URL, e nunca a URL inteira', () {
    // O ACHADO QUE DECIDE O DESENHO, medido no servidor e nao suposto: a foto
    // da conversa sai de `ObjectStorage.getSignedReadUrl` com `X-Amz-Date`,
    // `X-Amz-Expires`, `X-Amz-Credential` e `X-Amz-Signature` na consulta, e a
    // assinatura MUDA a cada leitura (validade de 600 s,
    // `messaging/domain/leitura-da-foto.ts`). As derivadas publicas nao tem
    // consulta nenhuma (`${MEDIA_PUBLIC_BASE_URL}/${chave}` em `src/bin/api.ts`).
    //
    // Com a URL na chave, o cache acertaria nas publicas e **nunca** nas
    // assinadas -- cada leitura gravaria o mesmo objeto com nome novo e o teto
    // despejaria as imagens boas para guardar copias de uma so.
    test('duas assinaturas da MESMA imagem dao a mesma chave', () {
      final a = ChaveDeImagem.publica(
        'https://m.bichu.app/p/9f3a/card.webp'
        '?X-Amz-Date=20261027T120000Z&X-Amz-Expires=600&X-Amz-Signature=aaaa',
      );
      final b = ChaveDeImagem.publica(
        'https://m.bichu.app/p/9f3a/card.webp'
        '?X-Amz-Date=20261027T121000Z&X-Amz-Expires=600&X-Amz-Signature=bbbb',
      );

      expect(
        a!.caminhoRelativo,
        b!.caminhoRelativo,
        reason: 'REPROVA: a assinatura entrou na chave. A URL da foto da '
            'conversa e assinada e vence em 600 s: com ela na chave o cache '
            'nunca acerta, grava uma copia por leitura e o teto despeja as '
            'imagens boas para guardar varias copias da mesma.',
      );
    });

    test('objetos DIFERENTES nao dividem arquivo', () {
      final a = ChaveDeImagem.publica('https://m.bichu.app/p/9f3a/card.webp')!;
      final b = ChaveDeImagem.publica('https://m.bichu.app/p/7c11/card.webp')!;

      expect(a.caminhoRelativo, isNot(b.caminhoRelativo));
    });

    test('URL sem caminho util nao vira chave, e devolve NULO', () {
      // Nulo significa "nao cacheie". Inventar identidade a partir de uma URL
      // que nao se entende e o jeito conhecido de duas imagens dividirem um
      // arquivo.
      expect(ChaveDeImagem.publica(''), isNull);
      expect(ChaveDeImagem.publica('https://m.bichu.app'), isNull);
      expect(ChaveDeImagem.publica('https://m.bichu.app/'), isNull);
    });
  });

  group('o escopo de privacidade esta na chave', () {
    test('a mesma imagem como PUBLICA e como DE PESSOA nao divide arquivo', () {
      const url = 'https://m.bichu.app/u/4b2e/thumb.webp';
      final publica = ChaveDeImagem.publica(url)!;
      final dela = ChaveDeImagem.dePessoa(url, apelido: 'marina')!;

      expect(
        publica.caminhoRelativo,
        isNot(dela.caminhoRelativo),
        reason: 'REPROVA: o escopo nao entrou no resumo. Com o mesmo nome de '
            'arquivo, `esquecerPessoa` apagaria a copia que a superficie '
            'publica esta usando -- ou, se a publica gravasse primeiro, NAO '
            'apagaria a foto da pessoa, e a Emenda 3 do ADR-0010 ficaria '
            'valendo so na tela.',
      );
    });

    test('duas pessoas nao dividem pasta', () {
      const url = 'https://m.bichu.app/u/4b2e/thumb.webp';
      final uma = ChaveDeImagem.dePessoa(url, apelido: 'marina')!;
      final outra = ChaveDeImagem.dePessoa(url, apelido: 'joana')!;

      expect(uma.caminhoRelativo, isNot(outra.caminhoRelativo));
      expect(uma.caminhoRelativo, startsWith('pessoa/'));
    });

    test('o APELIDO nao aparece em claro no caminho do arquivo', () {
      // A pasta de cache do aplicativo e legivel por quem tem o aparelho na
      // mao. Pastas com os apelidos seriam a lista de com quem a pessoa tem
      // conexao -- o que o ADR-0025 decisao 2 proibe o produto de ter em forma
      // nenhuma.
      final chave = ChaveDeImagem.dePessoa(
        'https://m.bichu.app/u/4b2e/thumb.webp',
        apelido: 'marina',
      )!;

      expect(
        chave.caminhoRelativo.contains('marina'),
        isFalse,
        reason: 'REPROVA: o apelido virou nome de pasta. Listar a pasta de '
            'cache devolveria a lista de conexoes da pessoa.',
      );
    });

    test('foto de pessoa SEM apelido nao cacheia', () {
      // `Conversation.participants[].handle` e `PublicationAuthor.handle` sao
      // anulaveis no contrato. Sem apelido nao ha a quem apagar depois, e uma
      // foto de pessoa sem dono no disco e exatamente o furo que a Emenda 3
      // fecha. Nulo manda desenhar pela rede, como antes desta frente.
      const url = 'https://m.bichu.app/u/4b2e/thumb.webp';
      expect(ChaveDeImagem.dePessoa(url, apelido: null), isNull);
      expect(ChaveDeImagem.dePessoa(url, apelido: ''), isNull);
      expect(ChaveDeImagem.dePessoa(url, apelido: '   '), isNull);
    });
  });

  group('gravar e ler', () {
    test('o que foi gravado volta igual', () async {
      bancada();
      final chave = ChaveDeImagem.publica('https://m.bichu.app/p/9f3a/card.webp')!;
      final conteudo = bytes(128);

      expect(await cache.gravar(chave, conteudo), isTrue);
      expect(await cache.ler(chave), conteudo);
    });

    test('chave sem nada gravado devolve NULO, e nao lanca', () async {
      bancada();
      final chave = ChaveDeImagem.publica('https://m.bichu.app/p/0000/card.webp')!;

      expect(await cache.ler(chave), isNull);
    });

    test('nao sobra `.parcial` depois de gravar', () async {
      // A escrita e em `.parcial` + `rename` para que um aplicativo morto no
      // meio nao deixe um arquivo truncado com o nome definitivo -- que a
      // leitura seguinte entregaria como imagem inteira.
      bancada();
      final chave = ChaveDeImagem.publica('https://m.bichu.app/p/9f3a/card.webp')!;
      await cache.gravar(chave, bytes(64));

      final parciais = pasta
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.parcial'))
          .toList();

      expect(parciais, isEmpty);
    });
  });

  group('`processing` NAO entra no cache como definitiva', () {
    // O contrato tem `status: processing -> ready | rejected`, e a transicao
    // nunca volta. Em `processing` o objeto no armazenamento ainda nao e a
    // derivada definitiva: o trabalhador de higiene vai **substitui-lo** (em
    // `processing` o original carrega o EXIF do celular, ADR-0010 item 4).
    // Gravar ali congelaria no aparelho a versao que o servidor esta trocando.
    test('`gravar` RECUSA imagem que nao esta pronta', () async {
      bancada();
      final chave = ChaveDeImagem.publica(
        'https://m.bichu.app/p/9f3a/card.webp',
        pronta: false,
      )!;

      expect(
        await cache.gravar(chave, bytes(128)),
        isFalse,
        reason: 'REPROVA: uma imagem em `processing` foi gravada como '
            'definitiva. O servidor ainda vai substituir aquele objeto, e o '
            'cache passaria a servir para sempre a versao que o produto '
            'decidiu descartar.',
      );
      expect(await cache.ler(chave), isNull);
      expect(await cache.bytesEmDisco(), 0);
    });

    test('a recusa mora no CACHE, e nao na boa vontade de quem chama', () {
      // Se a decisao estivesse no chamador, ela valeria ate o decimo primeiro
      // chamador. Este caso existe para que mover a guarda para fora reprove
      // aqui, e nao numa tela qualquer meses depois.
      final naoPronta = ChaveDeImagem.publica(
        'https://m.bichu.app/p/9f3a/card.webp',
        pronta: false,
      )!;
      final pronta = ChaveDeImagem.publica(
        'https://m.bichu.app/p/9f3a/card.webp',
      )!;

      expect(naoPronta.pronta, isFalse);
      expect(pronta.pronta, isTrue);
      expect(
        naoPronta,
        isNot(pronta),
        reason: 'REPROVA: `pronta` saiu da identidade da chave. Com ela fora, '
            'a entrada gravada quando a foto ficou pronta e a recusada de '
            'antes seriam a mesma, e a ordem das duas decidiria o resultado.',
      );
    });
  });

  group('o TETO de disco e o despejo', () {
    test('nada passa do teto depois de gravar', () async {
      bancada(teto: 400);
      for (var i = 0; i < 10; i++) {
        final chave = ChaveDeImagem.publica('https://m.bichu.app/p/$i/card.webp')!;
        await cache.gravar(chave, bytes(100));
        // O carimbo de `lastModified` tem resolucao de segundo em varios
        // sistemas de arquivos. Sem este passo as dez gravacoes teriam o MESMO
        // carimbo, a ordenacao do despejo seria arbitraria e o caso do LRU
        // abaixo passaria ou reprovaria por sorte.
        await Future<void>.delayed(const Duration(milliseconds: 1100));
      }

      final total = await cache.bytesEmDisco();
      expect(
        total,
        lessThanOrEqualTo(400),
        reason: 'REPROVA: o cache passou do teto ($total bytes contra 400). '
            'Cache sem teto cresce sem limite no aparelho de quem nao pediu '
            'nada.',
      );
    }, timeout: const Timeout(Duration(minutes: 2)));

    test('o despejo tira o MENOS USADO, e nao o mais antigo gravado', () async {
      // LRU e nao FIFO: a leitura toca o carimbo. Sem isso, o retrato que a
      // pessoa ve todo dia sairia na frente de uma faixa aberta uma vez.
      bancada(teto: 250);
      final primeira = ChaveDeImagem.publica('https://m.bichu.app/p/1/card.webp')!;
      final segunda = ChaveDeImagem.publica('https://m.bichu.app/p/2/card.webp')!;

      await cache.gravar(primeira, bytes(100));
      await Future<void>.delayed(const Duration(milliseconds: 1100));
      await cache.gravar(segunda, bytes(100));
      await Future<void>.delayed(const Duration(milliseconds: 1100));

      // Usar a PRIMEIRA agora a torna a mais recentemente usada.
      expect(await cache.ler(primeira), isNotNull);
      await Future<void>.delayed(const Duration(milliseconds: 1100));

      // A terceira estoura o teto e forca o despejo.
      final terceira = ChaveDeImagem.publica('https://m.bichu.app/p/3/card.webp')!;
      await cache.gravar(terceira, bytes(100));

      expect(
        await cache.ler(primeira),
        isNotNull,
        reason: 'REPROVA: o despejo tirou a imagem que acabou de ser LIDA. '
            'A politica e LRU -- a leitura toca `lastModified` --, e sem isso '
            'ela degrada para FIFO: a foto que a pessoa abre todo dia sai na '
            'frente de uma faixa aberta uma vez.',
      );
      expect(await cache.ler(segunda), isNull);
    }, timeout: const Timeout(Duration(minutes: 2)));

    test('arquivo maior que o teto inteiro e RECUSADO', () async {
      // Gravar o que obriga a apagar tudo o mais e um cache que serve uma
      // imagem so.
      bancada(teto: 100);
      final chave = ChaveDeImagem.publica('https://m.bichu.app/p/9f3a/card.webp')!;

      expect(await cache.gravar(chave, bytes(200)), isFalse);
      expect(await cache.bytesEmDisco(), 0);
    });
  });

  group('APAGAR: a Emenda 3 do ADR-0010 valendo no DISCO', () {
    test('`esquecerPessoa` apaga as fotos DELA e nao as das outras', () async {
      bancada();
      final dela = ChaveDeImagem.dePessoa(
        'https://m.bichu.app/u/4b2e/thumb.webp',
        apelido: 'marina',
      )!;
      final deOutra = ChaveDeImagem.dePessoa(
        'https://m.bichu.app/u/8a01/thumb.webp',
        apelido: 'joana',
      )!;
      final publica = ChaveDeImagem.publica('https://m.bichu.app/p/9f3a/card.webp')!;
      await cache.gravar(dela, bytes(64));
      await cache.gravar(deOutra, bytes(64));
      await cache.gravar(publica, bytes(64));

      await cache.esquecerPessoa('marina');

      expect(
        await cache.ler(dela),
        isNull,
        reason: 'REPROVA: a foto da pessoa continua no disco depois de a '
            'conexao ser desfeita. A Emenda 3 do ADR-0010 diz que a foto sai '
            'so entre conexoes aceitas -- um arquivo que sobrevive a perda da '
            'permissao transforma essa decisao do cliente em regra de '
            'interface, verdadeira so enquanto a tela nao pintar.',
      );
      expect(
        await cache.ler(deOutra),
        isNotNull,
        reason: 'REPROVA: desfazer UMA conexao apagou a foto de OUTRA pessoa. '
            'O escopo da chave e por pessoa, e nao "todas as pessoas".',
      );
      expect(
        await cache.ler(publica),
        isNotNull,
        reason: 'REPROVA: desfazer conexao apagou imagem PUBLICA. Cartaz de '
            'pet perdido e capa de encontro nao sao de ninguem.',
      );
    });

    test('`esquecerTodasAsPessoas` apaga pessoa e PRESERVA publica', () async {
      // E a entrada de `limpezasAoSair`. So a pasta das pessoas: foto de pet
      // perdido nao vaza de uma conta para a proxima que entrar no aparelho, e
      // apaga-la jogaria fora exatamente o que o cliente pediu -- abertura
      // rapida -- sem fechar risco nenhum.
      bancada();
      final dela = ChaveDeImagem.dePessoa(
        'https://m.bichu.app/u/4b2e/thumb.webp',
        apelido: 'marina',
      )!;
      final deOutra = ChaveDeImagem.dePessoa(
        'https://m.bichu.app/u/8a01/thumb.webp',
        apelido: 'joana',
      )!;
      final publica = ChaveDeImagem.publica('https://m.bichu.app/p/9f3a/card.webp')!;
      await cache.gravar(dela, bytes(64));
      await cache.gravar(deOutra, bytes(64));
      await cache.gravar(publica, bytes(64));

      await cache.esquecerTodasAsPessoas();

      expect(
        await cache.ler(dela),
        isNull,
        reason: 'REPROVA: a foto de uma conexao de quem SAIU da conta continua '
            'no disco. O aparelho compartilhado e caso real no publico deste '
            'produto: a proxima pessoa que entrar neste telefone teria o rosto '
            'das conexoes da anterior guardado pelo aplicativo.',
      );
      expect(await cache.ler(deOutra), isNull);
      expect(await cache.ler(publica), isNotNull);
    });

    test('esquecer pessoa sem nada em cache nao lanca', () async {
      bancada();
      await expectLater(cache.esquecerPessoa('ninguem'), completes);
      await expectLater(cache.esquecerTodasAsPessoas(), completes);
    });
  });
}
