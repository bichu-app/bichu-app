import 'api_client.dart';

/// O MURAL — a publicacao do usuario e a linha do tempo.
class MuralApi
    implements
        IntencaoDeFotoDaPublicacao,
        LeituraDoMural,
        EscritaDoMural,
        InteracaoDoMural {
  const MuralApi(this._cliente);

  final ApiClient _cliente;

  /// A linha do tempo: as publicacoes de quem e conexao aceita, mais as minhas.
  @override
  Future<PaginaDaLinhaDoTempo> linhaDoTempo({String? cursor}) async {
    return PaginaDaLinhaDoTempo.doJson(
      await _cliente.get(
        '/timeline',
        query: cursor == null ? null : <String, String>{'cursor': cursor},
      ),
    );
  }

  /// As minhas publicacoes. **Nao depende de conexao nenhuma**: e ela que
  /// distingue, na tela, "nao tenho conexao" de "ninguem publicou".
  @override
  Future<PaginaDasMinhasPublicacoes> minhasPublicacoes({String? cursor}) async {
    return PaginaDasMinhasPublicacoes.doJson(
      await _cliente.get(
        '/me/publications',
        query: cursor == null ? null : <String, String>{'cursor': cursor},
      ),
    );
  }

  @override
  Future<MinhaPublicacao> publicar({
    required String texto,
    String? uploadId,
    String? textoAlternativo,
  }) async {
    return MinhaPublicacao.doJson(
      await _cliente.post(
        '/me/publications',
        corpo: <String, dynamic>{
          'body': texto,
          'upload_id': ?uploadId,
          'alt_text': ?textoAlternativo,
        },
      ),
    );
  }

  @override
  Future<void> apagar(String ref) async {
    await _cliente.delete('/me/publications/$ref');
  }

  /// Curte. **IDEMPOTENTE**: `PUT`, e tocar duas vezes nao conta duas -- a
  /// unicidade e a chave primaria de `publication_likes` no servidor.
  @override
  Future<ReacaoDaPublicacao> curtir(String ref) async {
    return ReacaoDaPublicacao.doJson(
      await _cliente.put('/publications/$ref/like'),
    );
  }

  @override
  Future<ReacaoDaPublicacao> descurtir(String ref) async {
    return ReacaoDaPublicacao.doJson(
      await _cliente.delete('/publications/$ref/like'),
    );
  }

  /// Os comentarios, **mais ANTIGO primeiro**.
  @override
  Future<PaginaDeComentarios> comentarios(String ref, {String? cursor}) async {
    return PaginaDeComentarios.doJson(
      await _cliente.get(
        '/publications/$ref/comments',
        query: cursor == null ? null : <String, String>{'cursor': cursor},
      ),
    );
  }

  @override
  Future<ComentarioCriado> comentar(String ref, String texto) async {
    return ComentarioCriado.doJson(
      await _cliente.post(
        '/publications/$ref/comments',
        corpo: <String, dynamic>{'body': texto},
      ),
    );
  }

  /// Apaga um comentario. **So o autor DELE apaga**: o dono da publicacao nao
  /// apaga comentario de terceiro, e isso e decisao de produto ainda aberta.
  @override
  Future<int> apagarComentario(String ref, String refDoComentario) async {
    final corpo = await _cliente.delete(
      '/publications/$ref/comments/$refDoComentario',
    );
    return (corpo['comment_count'] as num?)?.toInt() ?? 0;
  }

  @override
  Future<Map<String, dynamic>> intencaoDeFotoDaPublicacao({
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  }) {
    return _cliente.post(
      '/me/publications/photo-intents',
      corpo: <String, dynamic>{
        'content_type': tipoDeConteudo,
        'byte_size': tamanhoEmBytes,
      },
    );
  }
}

/// O que a TELA DO MURAL precisa para desenhar.
abstract class LeituraDoMural {
  Future<PaginaDaLinhaDoTempo> linhaDoTempo({String? cursor});
  Future<PaginaDasMinhasPublicacoes> minhasPublicacoes({String? cursor});
}

/// O que o mecanismo de envio precisa desta API.
abstract class InteracaoDoMural {
  Future<ReacaoDaPublicacao> curtir(String ref);
  Future<ReacaoDaPublicacao> descurtir(String ref);
  Future<PaginaDeComentarios> comentarios(String ref, {String? cursor});
  Future<ComentarioCriado> comentar(String ref, String texto);
  Future<int> apagarComentario(String ref, String refDoComentario);
}

abstract class IntencaoDeFotoDaPublicacao {
  Future<Map<String, dynamic>> intencaoDeFotoDaPublicacao({
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  });
}

/// O que a tela de PUBLICAR precisa.
abstract class EscritaDoMural implements IntencaoDeFotoDaPublicacao {
  Future<MinhaPublicacao> publicar({
    required String texto,
    String? uploadId,
    String? textoAlternativo,
  });

  Future<void> apagar(String ref);
}

/// `#/components/schemas/MyPublicationImage/properties/status` do contrato.
enum EstadoDaFotoDaPublicacao {
  processando('processing'),
  pronta('ready'),
  recusada('rejected');

  const EstadoDaFotoDaPublicacao(this.codigo);

  /// O valor que o contrato declara em `MyPublicationImage.status`, e a UNICA
  /// copia dele: `_estadoDe` le desta lista.
  final String codigo;
}

EstadoDaFotoDaPublicacao _estadoDe(Object? valor) {
  for (final e in EstadoDaFotoDaPublicacao.values) {
    if (e.codigo == valor) return e;
  }
  return EstadoDaFotoDaPublicacao.processando;
}

/// A imagem de uma publicacao na LINHA DO TEMPO.
class ImagemDaPublicacao {
  const ImagemDaPublicacao({required this.url, required this.textoAlternativo});

  factory ImagemDaPublicacao.doJson(Map<String, dynamic> json) {
    return ImagemDaPublicacao(
      url: json['url'] as String?,
      textoAlternativo: json['alt_text'] as String?,
    );
  }

  /// A derivada de **1024 x 1024 px**, a UNICA desta imagem.
  final String? url;

  /// O rotulo do leitor de tela.
  final String? textoAlternativo;
}

/// A imagem de uma publicacao do DONO.
class ImagemDaMinhaPublicacao {
  const ImagemDaMinhaPublicacao({
    required this.uploadId,
    required this.estado,
    required this.url,
    required this.motivoDaRecusa,
    required this.textoAlternativo,
  });

  factory ImagemDaMinhaPublicacao.doJson(Map<String, dynamic> json) {
    return ImagemDaMinhaPublicacao(
      uploadId: json['upload_id'] as String?,
      estado: _estadoDe(json['status']),
      url: json['url'] as String?,
      motivoDaRecusa: json['rejection_reason'] as String?,
      textoAlternativo: json['alt_text'] as String?,
    );
  }

  final String? uploadId;
  final EstadoDaFotoDaPublicacao estado;

  /// A derivada de 1024 px. **Nula enquanto `processando`**: antes de o worker
  /// reescrever a derivada a foto carrega o EXIF do celular.
  final String? url;
  final String? motivoDaRecusa;
  final String? textoAlternativo;
}

/// Quem publicou, na linha do tempo.
class AutorDaPublicacao {
  const AutorDaPublicacao({
    required this.apelido,
    required this.nomeExibido,
    required this.urlDoIcone,
    required this.canalConfirmado,
  });

  factory AutorDaPublicacao.doJson(Map<String, dynamic> json) {
    return AutorDaPublicacao(
      apelido: json['handle'] as String?,
      nomeExibido: json['display_name'] as String? ?? '',
      urlDoIcone: json['photo_icon_url'] as String?,
      canalConfirmado: json['contact_channel_verified'] as bool? ?? false,
    );
  }

  /// O apelido, e e ele o endereco do perfil.
  final String? apelido;

  final String nomeExibido;

  /// A `thumb` de 176 da foto do autor.
  final String? urlDoIcone;

  /// **O SELO DE VALIDADO** — `contact_channel_verified`, emenda do ADR-0010 de
  /// 21/10/2026, decisao do cliente.
  final bool canalConfirmado;
}

/// Uma publicacao na linha do tempo.
class ReacaoDaPublicacao {
  const ReacaoDaPublicacao({required this.curtidas, required this.curtiEu});

  factory ReacaoDaPublicacao.doJson(Map<String, dynamic> json) {
    return ReacaoDaPublicacao(
      curtidas: (json['like_count'] as num?)?.toInt() ?? 0,
      curtiEu: json['liked_by_me'] as bool? ?? false,
    );
  }

  final int curtidas;
  final bool curtiEu;
}

/// Um comentario.
class ComentarioDaPublicacao {
  const ComentarioDaPublicacao({
    required this.ref,
    required this.texto,
    required this.criadoEm,
    required this.autor,
    required this.meu,
  });

  factory ComentarioDaPublicacao.doJson(Map<String, dynamic> json) {
    return ComentarioDaPublicacao(
      ref: json['ref'] as String? ?? '',
      texto: json['body'] as String? ?? '',
      criadoEm: DateTime.tryParse(json['created_at'] as String? ?? ''),
      autor: AutorDaPublicacao.doJson(
        (json['author'] as Map<String, dynamic>?) ?? const <String, dynamic>{},
      ),
      meu: json['mine'] as bool? ?? false,
    );
  }

  final String ref;
  final String texto;
  final DateTime? criadoEm;
  final AutorDaPublicacao autor;

  /// `true` quando quem chama escreveu o comentario.
  final bool meu;
}

/// Uma pagina de comentarios, com o TOTAL da publicacao.
class PaginaDeComentarios {
  const PaginaDeComentarios({
    required this.itens,
    required this.proximoCursor,
    required this.total,
  });

  factory PaginaDeComentarios.doJson(Map<String, dynamic> json) {
    return PaginaDeComentarios(
      itens: (json['items'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(ComentarioDaPublicacao.doJson)
          .toList(),
      proximoCursor: json['next_cursor'] as String?,
      total: (json['comment_count'] as num?)?.toInt() ?? 0,
    );
  }

  final List<ComentarioDaPublicacao> itens;
  final String? proximoCursor;

  /// O total da PUBLICACAO, e nao `itens.length`, que e o tamanho desta pagina.
  final int total;
}

/// O comentario criado **e** a contagem nova, numa resposta so: sem ela a tela
/// precisaria de uma segunda ida ao servidor para atualizar o numero no cartao.
class ComentarioCriado {
  const ComentarioCriado({required this.comentario, required this.total});

  factory ComentarioCriado.doJson(Map<String, dynamic> json) {
    return ComentarioCriado(
      comentario: ComentarioDaPublicacao.doJson(
        (json['comment'] as Map<String, dynamic>?) ?? const <String, dynamic>{},
      ),
      total: (json['comment_count'] as num?)?.toInt() ?? 0,
    );
  }

  final ComentarioDaPublicacao comentario;
  final int total;
}

class PublicacaoDaLinha {
  const PublicacaoDaLinha({
    required this.ref,
    required this.texto,
    required this.criadaEm,
    required this.imagem,
    required this.autor,
    required this.minha,
    required this.curtidas,
    required this.comentarios,
    required this.curtiEu,
  });

  factory PublicacaoDaLinha.doJson(Map<String, dynamic> json) {
    final imagem = json['image'];
    return PublicacaoDaLinha(
      ref: json['ref'] as String? ?? '',
      texto: json['body'] as String? ?? '',
      criadaEm: DateTime.tryParse(json['created_at'] as String? ?? ''),
      imagem: imagem is Map<String, dynamic>
          ? ImagemDaPublicacao.doJson(imagem)
          : null,
      autor: AutorDaPublicacao.doJson(
        (json['author'] as Map<String, dynamic>?) ?? const <String, dynamic>{},
      ),
      minha: json['mine'] as bool? ?? false,
      curtidas: (json['like_count'] as num?)?.toInt() ?? 0,
      comentarios: (json['comment_count'] as num?)?.toInt() ?? 0,
      curtiEu: json['liked_by_me'] as bool? ?? false,
    );
  }

  final String ref;
  final String texto;
  final DateTime? criadaEm;
  final ImagemDaPublicacao? imagem;
  final AutorDaPublicacao autor;

  /// `true` quando quem chama e o autor.
  final bool minha;

  /// Quantas pessoas curtiram.
  final int curtidas;

  /// Quantos comentarios VIVOS.
  final int comentarios;

  /// Se quem chama curtiu. Vem do servidor: a tela nao teria como saber, e
  /// deixa-la adivinhar faria o coracao piscar errado na primeira rolagem.
  final bool curtiEu;
}

/// Uma publicacao do DONO.
class MinhaPublicacao {
  const MinhaPublicacao({
    required this.ref,
    required this.texto,
    required this.criadaEm,
    required this.imagem,
  });

  factory MinhaPublicacao.doJson(Map<String, dynamic> json) {
    final imagem = json['image'];
    return MinhaPublicacao(
      ref: json['ref'] as String? ?? '',
      texto: json['body'] as String? ?? '',
      criadaEm: DateTime.tryParse(json['created_at'] as String? ?? ''),
      imagem: imagem is Map<String, dynamic>
          ? ImagemDaMinhaPublicacao.doJson(imagem)
          : null,
    );
  }

  final String ref;
  final String texto;
  final DateTime? criadaEm;
  final ImagemDaMinhaPublicacao? imagem;
}

/// A linha do tempo, paginada por cursor.
class PaginaDaLinhaDoTempo {
  const PaginaDaLinhaDoTempo({required this.itens, required this.proximoCursor});

  factory PaginaDaLinhaDoTempo.doJson(Map<String, dynamic> json) {
    return PaginaDaLinhaDoTempo(
      itens: (json['items'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(PublicacaoDaLinha.doJson)
          .toList(),
      proximoCursor: json['next_cursor'] as String?,
    );
  }

  final List<PublicacaoDaLinha> itens;

  /// Nulo e fim da lista. **Opaco**: a tela o devolve como veio e nunca o lê.
  final String? proximoCursor;
}

/// As minhas publicacoes, paginadas por cursor.
class PaginaDasMinhasPublicacoes {
  const PaginaDasMinhasPublicacoes({
    required this.itens,
    required this.proximoCursor,
  });

  factory PaginaDasMinhasPublicacoes.doJson(Map<String, dynamic> json) {
    return PaginaDasMinhasPublicacoes(
      itens: (json['items'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(MinhaPublicacao.doJson)
          .toList(),
      proximoCursor: json['next_cursor'] as String?,
    );
  }

  final List<MinhaPublicacao> itens;
  final String? proximoCursor;
}
