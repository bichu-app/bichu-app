import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

/// **O CACHE DE IMAGEM NO APARELHO** (BICHUS-296, cliente 26/10/2026: *"um
/// cache local no device do usuario para as imagens"*).
class CacheDeImagensNoAparelho {
  CacheDeImagensNoAparelho({
    required this.pasta,
    this.tetoDeBytes = tetoPadraoDeBytes,
  });

  /// Como chegar a pasta de cache.
  final Future<Directory> Function() pasta;

  /// O TETO EM BYTES, e de onde sai o numero.
  final int tetoDeBytes;

  static const int tetoPadraoDeBytes = 32 * 1024 * 1024;

  /// A pasta raiz, resolvida uma vez.
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
  Future<Uint8List?> ler(ChaveDeImagem chave) async {
    try {
      final arquivo = File('${(await _raizDoCache()).path}/${chave.caminhoRelativo}');
      if (!arquivo.existsSync()) return null;
      final bytes = await arquivo.readAsBytes();
      if (bytes.isEmpty) return null;
      try {
        arquivo.setLastModifiedSync(DateTime.now());
      } on FileSystemException {
        // Carimbo que nao avanca degrada o despejo para FIFO.
      }
      return bytes;
    } on FileSystemException {
      return null;
    }
  }

  /// Guarda [bytes] para [chave], **ou recusa**.
  Future<bool> gravar(ChaveDeImagem chave, Uint8List bytes) async {
    if (!chave.pronta) return false;
    if (bytes.isEmpty || bytes.length > tetoDeBytes) return false;
    try {
      final raiz = await _raizDoCache();
      final arquivo = File('${raiz.path}/${chave.caminhoRelativo}');
      await arquivo.parent.create(recursive: true);
      final parcial = File('${arquivo.path}.parcial');
      await parcial.writeAsBytes(bytes, flush: true);
      await parcial.rename(arquivo.path);
      await _despejarAteCaber(raiz);
      return true;
    } on FileSystemException {
      return false;
    }
  }

  /// **APAGA DO DISCO AS FOTOS DAQUELA PESSOA.** Chamado ao desfazer conexao e
  /// ao bloquear.
  Future<void> esquecerPessoa(String apelido) =>
      _apagarPasta('${ChaveDeImagem.pastaDePessoas}/${ChaveDeImagem.resumoDe(apelido)}');

  /// **APAGA DO DISCO A FOTO DE TODA PESSOA.** Esta em `limpezasAoSair`.
  Future<void> esquecerTodasAsPessoas() => _apagarPasta(ChaveDeImagem.pastaDePessoas);

  /// Quantos bytes o cache ocupa agora.
  Future<int> bytesEmDisco() async {
    try {
      return _arquivos(await _raizDoCache()).fold<int>(0, (soma, f) => soma + f.lengthSync());
    } on FileSystemException {
      return 0;
    }
  }

  Future<void> _apagarPasta(String relativo) async {
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
        // Arquivo que outra coisa esta lendo fica.
      }
    }
  }

  List<File> _arquivos(Directory raiz) {
    if (!raiz.existsSync()) return <File>[];
    return raiz
        .listSync(recursive: true)
        .whereType<File>()
        .where((f) => !f.path.endsWith('.parcial'))
        .toList();
  }
}

/// **A IDENTIDADE ESTAVEL DE UMA IMAGEM**, e o escopo de privacidade dela.
class ChaveDeImagem {
  const ChaveDeImagem._({
    required this.identidade,
    required this.pronta,
    this.apelido,
  });

  /// **UMA IMAGEM PUBLICA**: foto de pet, cartaz de perdido, capa de encontro,
  /// item do catalogo da `Loja`, logo e faixa do profissional.
  static ChaveDeImagem? publica(String url, {bool pronta = true}) {
    final identidade = _caminhoDe(url);
    if (identidade == null) return null;
    return ChaveDeImagem._(identidade: identidade, pronta: pronta);
  }

  /// **A FOTO DE UMA PESSOA**, com a identidade dela na chave.
  static ChaveDeImagem? dePessoa(String url, {required String? apelido, bool pronta = true}) {
    final identidade = _caminhoDe(url);
    if (identidade == null) return null;
    final dono = apelido?.trim();
    if (dono == null || dono.isEmpty) return null;
    return ChaveDeImagem._(identidade: identidade, pronta: pronta, apelido: dono);
  }

  /// O caminho da URL -- a chave do objeto.
  static String? _caminhoDe(String url) {
    if (url.isEmpty) return null;
    final uri = Uri.tryParse(url);
    if (uri == null) return null;
    final caminho = uri.path;
    if (caminho.isEmpty || caminho == '/') return null;
    return caminho;
  }

  /// A chave do objeto no armazenamento.
  final String identidade;

  /// O apelido da pessoa de quem e esta foto, ou nulo para imagem publica.
  final String? apelido;

  /// A imagem esta `ready`? Falsa impede a gravacao -- ver
  /// [CacheDeImagensNoAparelho.gravar].
  final bool pronta;

  static const String pastaDePessoas = 'pessoa';
  static const String pastaPublica = 'publica';

  /// O nome do arquivo sob a raiz do cache.
  String get caminhoRelativo {
    final dono = apelido;
    if (dono == null) {
      return '$pastaPublica/${resumoDe('$pastaPublica\n$identidade')}';
    }
    return '$pastaDePessoas/${resumoDe(dono)}/'
        '${resumoDe('$pastaDePessoas\n$dono\n$identidade')}';
  }

  /// SHA-256 em hexadecimal.
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
