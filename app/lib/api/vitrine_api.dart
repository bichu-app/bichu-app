import 'api_client.dart';
import 'envio_de_foto.dart';

/// A VITRINE DE FOTOS DO USUARIO, **visivel so ao dono**.
class VitrineApi
    implements IntencaoDeFotoDaVitrine, LeituraDaVitrine, EscritaDaVitrine {
  const VitrineApi(this._cliente);

  final ApiClient _cliente;

  /// A vitrine da propria conta.
  @override
  Future<Vitrine> minhaVitrine() async {
    return Vitrine.doJson(await _cliente.get('/me/showcase'));
  }

  /// Substitui a vitrine inteira, na ordem em que [fotos] vem.
  @override
  Future<Vitrine> substituir(List<FotoPedida> fotos) async {
    return Vitrine.doJson(
      await _cliente.put(
        '/me/showcase',
        corpo: {'photos': fotos.map((f) => f.paraJson()).toList()},
      ),
    );
  }

  @override
  Future<Map<String, dynamic>> intencaoDeFotoDaVitrine({
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  }) {
    return _cliente.post(
      '/me/showcase/photo-intents',
      corpo: {'content_type': tipoDeConteudo, 'byte_size': tamanhoEmBytes},
    );
  }
}

/// O que a TELA precisa para desenhar a grade.
abstract class LeituraDaVitrine {
  Future<Vitrine> minhaVitrine();
}

/// O que o mecanismo de envio precisa desta API.
abstract class IntencaoDeFotoDaVitrine {
  Future<Map<String, dynamic>> intencaoDeFotoDaVitrine({
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  });
}

/// O que a TELA precisa para ACRESCENTAR uma foto (19/10/2026).
abstract class EscritaDaVitrine implements IntencaoDeFotoDaVitrine {
  Future<Vitrine> substituir(List<FotoPedida> fotos);
}

/// A foto da vitrine como destino de envio.
class FotoDaVitrine implements DestinoDaFoto {
  const FotoDaVitrine({required this.api});

  final IntencaoDeFotoDaVitrine api;

  @override
  Future<AutorizacaoDeEnvio> pedirAutorizacao({
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  }) async {
    return AutorizacaoDeEnvio.doJson(
      await api.intencaoDeFotoDaVitrine(
        tipoDeConteudo: tipoDeConteudo,
        tamanhoEmBytes: tamanhoEmBytes,
      ),
    );
  }

  @override
  Future<void> confirmar(String uploadId) async {}
}

/// Uma foto que a escrita declarativa pede manter ou acrescentar.
class FotoPedida {
  const FotoPedida({required this.uploadId, this.textoAlternativo});

  final String uploadId;

  /// Rotulo para leitor de tela, **e nao legenda**: a vitrine nao desenha texto
  /// sobre a foto.
  final String? textoAlternativo;

  Map<String, dynamic> paraJson() => {
        'upload_id': uploadId,
        if (textoAlternativo != null) 'alt_text': textoAlternativo,
      };
}

/// `#/components/schemas/ShowcasePhoto/properties/status` do contrato.
enum EstadoDaFoto {
  processando('processing'),
  pronta('ready'),
  recusada('rejected');

  const EstadoDaFoto(this.codigo);

  /// O codigo de fio, e a UNICA copia dele: `_estadoDe` le desta lista.
  final String codigo;
}

EstadoDaFoto _estadoDe(Object? valor) {
  for (final estado in EstadoDaFoto.values) {
    if (estado.codigo == valor) return estado;
  }
  return EstadoDaFoto.processando;
}

/// Uma foto da vitrine, como o dono a ve.
class FotoDaVitrineLida {
  const FotoDaVitrineLida({
    required this.uploadId,
    required this.posicao,
    required this.estado,
    required this.urlDaGrade,
    required this.urlAberta,
    required this.motivoDaRecusa,
    required this.textoAlternativo,
  });

  factory FotoDaVitrineLida.doJson(Map<String, dynamic> json) {
    return FotoDaVitrineLida(
      uploadId: json['upload_id'] as String?,
      posicao: (json['position'] as num?)?.toInt() ?? 0,
      estado: _estadoDe(json['status']),
      urlDaGrade: json['grid_url'] as String?,
      urlAberta: json['open_url'] as String?,
      motivoDaRecusa: json['rejection_reason'] as String?,
      textoAlternativo: json['alt_text'] as String?,
    );
  }

  /// Nulo depois que o varredor apagou a intencao: a foto fica e deixa de poder
  /// ser reordenada por ela.
  final String? uploadId;
  final int posicao;
  final EstadoDaFoto estado;

  /// A derivada de **320 px**, a da GRADE.
  final String? urlDaGrade;

  /// A derivada de **1024 px**, a da foto ABERTA.
  final String? urlAberta;

  final String? motivoDaRecusa;
  final String? textoAlternativo;

  /// A CAPA e a posicao 0. Reordenar troca a capa.
  bool get ehCapa => posicao == 0;
}

/// A vitrine inteira, mais o teto que o servidor declara.
class Vitrine {
  const Vitrine({required this.fotos, required this.teto});

  factory Vitrine.doJson(Map<String, dynamic> json) {
    final lista = (json['photos'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(FotoDaVitrineLida.doJson)
        .toList()
      ..sort((a, b) => a.posicao.compareTo(b.posicao));
    return Vitrine(
      fotos: lista,
      teto: (json['max_photos'] as num?)?.toInt() ?? 9,
    );
  }

  final List<FotoDaVitrineLida> fotos;
  final int teto;

  bool get estaCheia => fotos.length >= teto;

  /// Quantas ainda cabem. **Nunca usado para cobrar uma segunda foto**: pedir
  /// uma e o caso comum, e a vitrine com uma foto e completa.
  int get vagas => teto - fotos.length;
}
