import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

/// **O CACHE DE IMAGEM NO APARELHO** (BICHUS-296, cliente 26/10/2026: *"um
/// cache local no device do usuario para as imagens"*).
///
/// ## O QUE EXISTIA ANTES DISTO, MEDIDO E NAO SUPOSTO
///
/// `ImagemDaRede` desenhava `Image.network`, e `Image.network` guarda a imagem
/// **so em memoria**: a entrada vive no `PaintingBinding.instance.imageCache`,
/// que e global, tem teto de 1000 entradas / 100 MiB e **morre com o
/// processo**. `package:http` sobre o `HttpClient` do `dart:io` nao guarda
/// resposta em disco, e nenhum pacote de cache em disco entrou no `pubspec`
/// (ha portao para isso -- ver a secao do QR, abaixo). Entao o pedido do
/// cliente nao estava atendido de forma nenhuma: fechar o aplicativo apagava
/// tudo, e a foto voltava pela rede na abertura seguinte.
///
/// ## A CHAVE NAO E A URL, E ISSO FOI MEDIDO
///
/// O produto tem **duas formas de URL de imagem**, e elas sao diferentes no que
/// importa para um cache:
///
/// 1. **A derivada PUBLICA** -- foto de pet, cartaz de perdido, capa de
///    encontro, catalogo da `Loja`, logo e faixa do profissional, e a `thumb`
///    de 176 da foto de pessoa. O servidor a monta como
///    `${MEDIA_PUBLIC_BASE_URL}/${chave}` (`src/bin/api.ts`), **sem assinatura
///    e sem parametro de consulta**: `chave-de-objeto.ts` diz por extenso que
///    assinar a derivada publica "inviabilizaria o cache, que e o motivo de ela
///    existir". Aqui a URL inteira ate serviria de chave.
/// 2. **A URL ASSINADA** -- a foto do achado dentro da conversa mediada. Ela
///    sai de `ObjectStorage.getSignedReadUrl` com `X-Amz-Date`,
///    `X-Amz-Expires`, `X-Amz-Credential` e `X-Amz-Signature` na consulta, e
///    com validade de **600 segundos**
///    (`messaging/domain/leitura-da-foto.ts`). **A assinatura muda a cada
///    leitura da conversa**: usar a URL como chave daria um cache que nunca
///    acerta -- cada abertura da conversa gravaria o MESMO arquivo com nome
///    novo, e o teto despejaria as imagens boas para guardar copias de uma so.
///
/// **Entao a identidade e o CAMINHO da URL, nunca a URL inteira.** O caminho e
/// a chave do objeto no armazenamento, e `chave-de-objeto.ts` a declara parte
/// do contrato: *"copiar os objetos sem preservar a chave quebra todas as URLs
/// de foto ja compartilhadas"*. Ela tem 128 bits de aleatoriedade e nao se
/// repete entre objetos. E o unico identificador estavel que o aplicativo
/// recebe -- o contrato nao manda id interno de imagem para o cliente
/// (ADR-0010 item 6).
///
/// ## A FOTO DA CONVERSA NAO ENTRA AQUI, E A RECUSA E MEDIDA
///
/// Apesar de o caminho dela ser estavel, ela **nao e cacheada**:
/// `messaging/domain/leitura-da-foto.ts` fecha a questao em cinco palavras --
/// *"Nunca em rota publica e nunca com cache longo"* --, porque a foto do
/// achado vive sob o golpe do falso achador e so faz sentido para duas pessoas.
/// Gravar aquele arquivo no aparelho do tutor o deixaria la depois de a
/// conversa acabar.
///
/// ## A IMAGEM DO QR TAMBEM NAO, E ELA E A RAZAO DE O CACHE SER OPT-IN
///
/// `app/test/telas/qr_na_tela_test.dart` tem **dois portoes** que decidem o
/// desenho deste arquivo:
///
/// - um aponta o `path_provider` para uma pasta vazia, roda o fluxo do QR
///   inteiro e **reprova se os bytes do PNG aparecerem em qualquer arquivo**;
/// - o outro le o `pubspec.yaml` e reprova se `cached_network_image`,
///   `flutter_cache_manager`, `extended_image`, `dio_cache_interceptor` ou
///   `http_cache_stream` entrarem.
///
/// Os dois estao certos: o QR carrega o codigo da tag dentro dos pixeis, e o
/// ADR-0004 torna codigo de tag irreversivel. Por isso **este cache nao e um
/// gancho global** no `HttpClient` nem no `imageCache`, e **nenhum pacote novo
/// entrou no `pubspec`**: ele e opt-in por chamada, e quem nao passa chave
/// continua desenhando `Image.network` exatamente como antes. Um cache global
/// teria levado o QR ao disco e reprovado aquele portao -- foi ele que decidiu
/// este desenho, e nao preferencia de estilo.
///
/// ## A REGRA DE VISIBILIDADE VALE NO DISCO, E NAO SO NA TELA
///
/// A **Emenda 3 do ADR-0010** (decisao do cliente, 19/10/2026) diz que a foto
/// de perfil de uma pessoa sai para outra *"apenas quando as duas ja aceitaram
/// conexao"*, e a Emenda 5 acrescentou o autor do Mural pelo mesmo predicado.
/// No servidor isso e uma clausula `WHERE`. **No aparelho, um arquivo gravado
/// continua gravado depois de a conexao ser desfeita** -- e ai a emenda teria
/// virado regra de interface, verdadeira so enquanto a tela nao pintar.
///
/// Por isso a chave de foto de PESSOA carrega **a identidade dela**, e o cache
/// sabe apagar por pessoa:
///
/// - [ChaveDeImagem.dePessoa] grava sob `pessoa/<resumo do apelido>/`, e
///   [esquecerPessoa] apaga aquela pasta inteira. Desfazer conexao e bloquear
///   chamam isso;
/// - [esquecerTodasAsPessoas] apaga `pessoa/` inteira, e esta na lista
///   `limpezasAoSair` do `app.dart`: o aparelho compartilhado e caso real no
///   publico deste produto, e a foto da conexao de quem saiu nao pode esperar a
///   proxima pessoa que entrar;
/// - [ChaveDeImagem.publica] grava sob `publica/`, e ali nao ha pessoa a
///   esquecer: foto de pet perdido, capa de encontro e item de catalogo sao
///   superficie publica, e o que as limita e o teto e o despejo.
///
/// **O apelido e a identidade, e nao um UUID**, porque o apelido e o unico
/// identificador de pessoa que o contrato manda ao aplicativo: o ADR-0010 item
/// 6 proibe `users.id` e `users.public_ref` em superficie de cliente, e toda
/// resposta que traz `photo_icon_url` traz `handle` ao lado dele
/// (`ConnectedPerson`, `Conversation.participants[]`, `PublicationAuthor`,
/// `PersonSearchResult`, `getPersonProfile`). Ele viaja em claro na memoria do
/// processo, mas **nao no nome do arquivo**: o nome e o resumo SHA-256, para
/// que listar a pasta de cache do aplicativo nao devolva a lista de com quem a
/// pessoa tem conexao.
class CacheDeImagensNoAparelho {
  CacheDeImagensNoAparelho({
    required this.pasta,
    this.tetoDeBytes = tetoPadraoDeBytes,
  });


  /// Como chegar a pasta de cache. **Injetada, e nunca
  /// `getApplicationCacheDirectory()` chamado aqui dentro.**
  ///
  /// A razao e a mesma de [CidadeEscolhida] em `sessao/cidade_escolhida.dart`:
  /// canal de plataforma **trava o `pumpAndSettle` para sempre, sem mensagem**,
  /// em teste de widget. Um cache que resolvesse a pasta por conta travaria a
  /// suite na secao em que o aplicativo abre, e o sintoma -- `pumpAndSettle
  /// timed out` -- nao aponta para a causa.
  final Future<Directory> Function() pasta;

  /// O TETO EM BYTES, e de onde sai o numero.
  ///
  /// 32 MiB. As derivadas que este cache guarda sao as que a tela pinta, e elas
  /// tem tamanho conhecido: a `thumb` de 176 em WebP fica na casa de 10 KiB, a
  /// `card` de 512 na casa de 60 KiB e a faixa de 1280 na casa de 200 KiB.
  /// 32 MiB cabe na ordem de dois mil retratos, ou algumas centenas de faixas
  /// -- mais do que qualquer sessao de rolagem produz, e pouco o bastante para
  /// nao ser notado na lista de armazenamento do sistema.
  ///
  /// **Nao e o teto do `imageCache` e nao tem relacao com ele**: aquele conta
  /// os bytes DECODIFICADOS (`largura x altura x 4`) e vive em memoria; este
  /// conta os bytes do arquivo comprimido em disco.
  final int tetoDeBytes;

  static const int tetoPadraoDeBytes = 32 * 1024 * 1024;

  /// A pasta raiz, resolvida uma vez. Sem isto, cada leitura de imagem numa
  /// lista de vinte cartoes atravessaria o canal de plataforma vinte vezes.
  Future<Directory>? _raiz;

  Future<Directory> _raizDoCache() {
    return _raiz ??= pasta().then((base) async {
      final dir = Directory('${base.path}/imagens-bichu');
      if (!dir.existsSync()) {
        await dir.create(recursive: true);
      }
      return dir;
    });
  }

  /// Os bytes guardados, ou **nulo** quando nao ha nada para esta chave.
  ///
  /// Nulo nao e erro: e o caso comum da primeira vez. Qualquer falha de leitura
  /// tambem devolve nulo, e de proposito -- cache que lanca transforma um
  /// arquivo truncado por falta de espaco num quadro quebrado na tela, quando a
  /// resposta certa e buscar pela rede como se nao houvesse cache.
  Future<Uint8List?> ler(ChaveDeImagem chave) async {
    try {
      final arquivo = File('${(await _raizDoCache()).path}/${chave.caminhoRelativo}');
      if (!arquivo.existsSync()) return null;
      final bytes = await arquivo.readAsBytes();
      if (bytes.isEmpty) return null;
      // O CARIMBO E O RELOGIO DO DESPEJO. `lastModified` e o que o despejo
      // ordena, e tocar nele na LEITURA e o que faz a politica ser LRU (o menos
      // usado recentemente) em vez de FIFO (o mais antigo gravado). Sem esta
      // linha, o retrato que a pessoa ve todo dia sairia na frente de uma faixa
      // aberta uma vez.
      //
      // `atime` nao serve: varios sistemas de arquivos o montam com `noatime` e
      // ele simplesmente nao avanca.
      try {
        arquivo.setLastModifiedSync(DateTime.now());
      } on FileSystemException {
        // Carimbo que nao avanca degrada o despejo para FIFO. Nao e motivo para
        // recusar a imagem que ja esta na mao.
      }
      return bytes;
    } on FileSystemException {
      return null;
    }
  }

  /// Guarda [bytes] para [chave], **ou recusa**.
  ///
  /// Devolve `true` quando gravou. Os dois motivos de recusa:
  ///
  /// 1. **A imagem nao esta `ready`** ([ChaveDeImagem.pronta] falsa). O
  ///    contrato tem `status: processing -> ready | rejected`, e a transicao
  ///    **nunca volta**: enquanto a foto esta em `processing` o que existe no
  ///    armazenamento ainda nao e a derivada definitiva -- em `processing` o
  ///    original "carrega o EXIF do celular" (ADR-0010 item 4), e o
  ///    trabalhador de higiene ainda vai **substituir** aquele objeto. Gravar
  ///    ali congelaria no aparelho a versao que o servidor esta trocando, e o
  ///    cache passaria a servir para sempre a imagem que o produto decidiu
  ///    descartar. **A recusa mora AQUI e nao no chamador** de proposito: uma
  ///    convencao de quem chama vale ate o decimo primeiro chamador;
  /// 2. **O arquivo nao caberia nem num cache vazio** (maior que [tetoDeBytes]).
  ///    Gravar o que obriga a apagar tudo o mais e um cache que serve uma
  ///    imagem so.
  Future<bool> gravar(ChaveDeImagem chave, Uint8List bytes) async {
    if (!chave.pronta) return false;
    if (bytes.isEmpty || bytes.length > tetoDeBytes) return false;
    try {
      final raiz = await _raizDoCache();
      final arquivo = File('${raiz.path}/${chave.caminhoRelativo}');
      await arquivo.parent.create(recursive: true);
      // `.parcial` e depois `rename`: o `rename` e atomico no mesmo sistema de
      // arquivos, e sem ele um aplicativo morto no meio da escrita deixaria um
      // arquivo truncado com o nome definitivo -- que a leitura seguinte
      // entregaria como se fosse a imagem inteira, e o quadro apareceria
      // cortado sem nada acusar.
      final parcial = File('${arquivo.path}.parcial');
      await parcial.writeAsBytes(bytes, flush: true);
      await parcial.rename(arquivo.path);
      await _despejarAteCaber(raiz);
      return true;
    } on FileSystemException {
      // Disco cheio, permissao, cartao removido. O desenho na tela nao depende
      // do cache ter conseguido gravar.
      return false;
    }
  }

  /// **APAGA DO DISCO AS FOTOS DAQUELA PESSOA.** Chamado ao desfazer conexao e
  /// ao bloquear.
  ///
  /// E a linha que faz a Emenda 3 do ADR-0010 valer no disco: sem ela, a foto
  /// de quem deixou de ser conexao continuaria no aparelho, e a regra de
  /// privacidade do cliente seria verdadeira so na tela.
  ///
  /// Idempotente: pessoa sem nada em cache nao e erro.
  Future<void> esquecerPessoa(String apelido) =>
      _apagarPasta('${ChaveDeImagem.pastaDePessoas}/${ChaveDeImagem.resumoDe(apelido)}');

  /// **APAGA DO DISCO A FOTO DE TODA PESSOA.** Esta em `limpezasAoSair`.
  ///
  /// So a pasta das pessoas, e nunca a publica: foto de pet perdido e capa de
  /// encontro nao sao de ninguem e nao vazam de uma conta para a proxima que
  /// entrar neste aparelho. Apagar a publica no logout jogaria fora exatamente
  /// o que o cliente pediu -- abertura rapida -- sem fechar risco nenhum.
  Future<void> esquecerTodasAsPessoas() => _apagarPasta(ChaveDeImagem.pastaDePessoas);

  /// Quantos bytes o cache ocupa agora. Existe para a medicao do teto.
  Future<int> bytesEmDisco() async {
    try {
      return _arquivos(await _raizDoCache()).fold<int>(0, (soma, f) => soma + f.lengthSync());
    } on FileSystemException {
      return 0;
    }
  }

  Future<void> _apagarPasta(String relativo) async {
    // ===================================================================
    // AQUI SE APAGA ARQUIVO, E E PRECISO DIZER POR QUE ISSO NAO VIOLA A
    // DECISAO DE 17/10/2026.
    //
    // A decisao do cliente, literal: *"voce so deve apagar as informacoes,
    // caso o usuario remova o pet ou delete a conta"*. Ela esta repetida em
    // `media/application/varrer-envios-vencidos.ts`, em
    // `media/ports/media-repository.ts` e tem portao proprio
    // (`varredura-nao-apaga-a-vitrine.test.ts`). Ela e real e nao se reabre
    // aqui.
    //
    // **Ela fala de DADO DO USUARIO, e nao de arquivo de cache.** A diferenca
    // nao e de grau, e de natureza: o que esta nesta pasta e uma COPIA, de
    // leitura, de um objeto cujo original continua inteiro no armazenamento do
    // servidor, e que a proxima tela busca de novo pela rede se nao achar aqui.
    // Apagar daqui **nao remove nada de ninguem**: nenhuma foto sai da conta,
    // nenhuma publicacao perde imagem, nenhum pet fica sem retrato. O unico
    // efeito observavel e uma imagem demorar o que demorava antes deste
    // arquivo existir.
    //
    // O inverso disto seria o defeito: um cache que **nunca** apaga cresce sem
    // teto no aparelho de quem nao pediu nada, e -- no caso da foto de pessoa
    // -- guarda para sempre o rosto de quem deixou de ser conexao, o que e a
    // Emenda 3 do ADR-0010 sendo desobedecida em disco.
    //
    // Quem ler esta linha procurando violacao da decisao de 17/10 deve ler este
    // paragrafo antes de mudar nada: o que a decisao proibe e varredura por
    // PRAZO sobre dado do usuario, e aqui nao ha prazo nenhum -- o que apaga e
    // (a) a pessoa saindo da conta, (b) a conexao sendo desfeita ou a pessoa
    // sendo bloqueada, (c) o teto de disco. Os tres sao ato explicito ou limite
    // de recurso, e nenhum e um relogio.
    // ===================================================================
    try {
      final dir = Directory('${(await _raizDoCache()).path}/$relativo');
      if (dir.existsSync()) {
        await dir.delete(recursive: true);
      }
    } on FileSystemException {
      // Pasta que nao sai nao e motivo para derrubar o logout nem o desfazer.
    }
  }

  /// O DESPEJO: enquanto passar do teto, sai o arquivo com o carimbo mais
  /// antigo.
  ///
  /// LRU por `lastModified`, que a leitura toca -- ver [ler]. A ordenacao e
  /// feita uma vez e consumida em ordem: reordenar a cada remocao seria
  /// `n log n` por arquivo removido, numa lista que pode ter milhares de
  /// entradas.
  ///
  /// Ver o bloco em [_apagarPasta] sobre por que apagar aqui nao viola a
  /// decisao de 17/10/2026.
  Future<void> _despejarAteCaber(Directory raiz) async {
    final arquivos = _arquivos(raiz);
    var total = arquivos.fold<int>(0, (soma, f) => soma + f.lengthSync());
    if (total <= tetoDeBytes) return;
    arquivos.sort((a, b) => a.lastModifiedSync().compareTo(b.lastModifiedSync()));
    for (final arquivo in arquivos) {
      if (total <= tetoDeBytes) return;
      final tamanho = arquivo.lengthSync();
      try {
        await arquivo.delete();
        total -= tamanho;
      } on FileSystemException {
        // Arquivo que outra coisa esta lendo fica. O proximo `gravar` tenta de
        // novo, e o teto e um alvo e nao uma invariante instantanea.
      }
    }
  }

  List<File> _arquivos(Directory raiz) {
    if (!raiz.existsSync()) return <File>[];
    return raiz
        .listSync(recursive: true)
        .whereType<File>()
        // Os `.parcial` sao escrita em curso de outra chamada: contar seus
        // bytes esta certo, apagar o de outra escrita nao.
        .where((f) => !f.path.endsWith('.parcial'))
        .toList();
  }
}

/// **A IDENTIDADE ESTAVEL DE UMA IMAGEM**, e o escopo de privacidade dela.
///
/// Nao e a URL: ver a secao "A CHAVE NAO E A URL" em
/// [CacheDeImagensNoAparelho]. E o **caminho** da URL -- a chave do objeto no
/// armazenamento --, somado ao escopo.
///
/// Os dois construtores sao os dois escopos, e nao ha um terceiro de
/// proposito: uma imagem ou e publica (o que a limita e o teto) ou e de uma
/// pessoa nomeada (o que a limita e a conexao). Um escopo "sem dono" para foto
/// de pessoa seria exatamente o furo que a Emenda 3 do ADR-0010 fecha.
class ChaveDeImagem {
  const ChaveDeImagem._({
    required this.identidade,
    required this.pronta,
    this.apelido,
  });

  /// **UMA IMAGEM PUBLICA**: foto de pet, cartaz de perdido, capa de encontro,
  /// item do catalogo da `Loja`, logo e faixa do profissional.
  ///
  /// Devolve **nulo quando [url] nao tem caminho util** -- URL vazia, relativa
  /// sem caminho, ou que nao se analisa. Nulo significa "nao cacheie", e quem
  /// chama desenha pela rede como sempre: inventar uma identidade a partir de
  /// uma URL que nao se entende e o jeito conhecido de duas imagens diferentes
  /// dividirem um arquivo.
  static ChaveDeImagem? publica(String url, {bool pronta = true}) {
    final identidade = _caminhoDe(url);
    if (identidade == null) return null;
    return ChaveDeImagem._(identidade: identidade, pronta: pronta);
  }

  /// **A FOTO DE UMA PESSOA**, com a identidade dela na chave.
  ///
  /// Devolve **nulo quando [apelido] e nulo ou vazio**, e essa e a parte que
  /// importa: sem apelido nao ha a quem apagar depois, e uma foto de pessoa
  /// sem dono no disco e a Emenda 3 do ADR-0010 valendo so na tela. A
  /// superficie que nao sabe de quem e a foto **nao cacheia** -- ela continua
  /// desenhando pela rede, que e o comportamento de antes deste arquivo.
  ///
  /// `Conversation.participants[].handle` e `PublicationAuthor.handle` sao
  /// anulaveis no contrato, e e por isso que este caminho existe em vez de um
  /// `assert`.
  static ChaveDeImagem? dePessoa(String url, {required String? apelido, bool pronta = true}) {
    final identidade = _caminhoDe(url);
    if (identidade == null) return null;
    final dono = apelido?.trim();
    if (dono == null || dono.isEmpty) return null;
    return ChaveDeImagem._(identidade: identidade, pronta: pronta, apelido: dono);
  }

  /// O caminho da URL -- a chave do objeto. **Sem a consulta**, que e onde a
  /// assinatura V4 viaja e muda a cada leitura.
  static String? _caminhoDe(String url) {
    if (url.isEmpty) return null;
    final uri = Uri.tryParse(url);
    if (uri == null) return null;
    final caminho = uri.path;
    if (caminho.isEmpty || caminho == '/') return null;
    return caminho;
  }

  /// A chave do objeto no armazenamento. 128 bits de aleatoriedade, estavel por
  /// contrato (ADR-0007).
  final String identidade;

  /// O apelido da pessoa de quem e esta foto, ou nulo para imagem publica.
  ///
  /// **Viaja em memoria e nunca no nome do arquivo**: ver [resumoDe].
  final String? apelido;

  /// A imagem esta `ready`? Falsa impede a gravacao -- ver
  /// [CacheDeImagensNoAparelho.gravar].
  final bool pronta;

  static const String pastaDePessoas = 'pessoa';
  static const String pastaPublica = 'publica';

  /// O nome do arquivo sob a raiz do cache.
  ///
  /// `publica/<resumo>` ou `pessoa/<resumo do apelido>/<resumo>`. A pasta por
  /// pessoa e o que torna [CacheDeImagensNoAparelho.esquecerPessoa] uma
  /// remocao de pasta em vez de uma varredura que le o conteudo de cada
  /// arquivo para descobrir de quem ele e.
  ///
  /// O escopo entra no resumo e nao so no caminho: sem isso, a mesma chave de
  /// objeto vista como publica e como de pessoa daria o mesmo nome de arquivo,
  /// e `esquecerPessoa` apagaria a copia que a superficie publica estava
  /// usando (ou pior, a nao apagaria, se a publica tivesse gravado primeiro).
  String get caminhoRelativo {
    final dono = apelido;
    if (dono == null) {
      return '$pastaPublica/${resumoDe('$pastaPublica\n$identidade')}';
    }
    return '$pastaDePessoas/${resumoDe(dono)}/'
        '${resumoDe('$pastaDePessoas\n$dono\n$identidade')}';
  }

  /// SHA-256 em hexadecimal.
  ///
  /// **O apelido nao vira nome de arquivo em claro**, e isso nao e zelo: a
  /// pasta de cache do aplicativo e legivel por quem tem o aparelho na mao, e
  /// uma lista de pastas chamadas pelos apelidos seria a lista de com quem a
  /// pessoa tem conexao -- que e precisamente o que o ADR-0025 decisao 2 proibe
  /// o produto de ter em forma nenhuma.
  static String resumoDe(String texto) => sha256.convert(utf8.encode(texto)).toString();

  @override
  bool operator ==(Object other) =>
      other is ChaveDeImagem &&
      other.identidade == identidade &&
      other.apelido == apelido &&
      other.pronta == pronta;

  @override
  int get hashCode => Object.hash(identidade, apelido, pronta);

  @override
  String toString() => 'ChaveDeImagem($caminhoRelativo)';
}
