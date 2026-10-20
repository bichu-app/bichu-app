import 'api_client.dart';

/// O MURAL — a publicacao do usuario e a linha do tempo.
///
/// Arquivo proprio, e nao metodos dentro de `me_api.dart`, pelo mesmo motivo de
/// `vitrine_api.dart`: o Mural tem cinco operacoes e modelos proprios, e
/// `me_api.dart` e a porta dos DADOS da conta (nome, telefone, endereco de
/// referencia). Misturar os dois faria o envio de uma foto alcancar `atualizar`
/// — que e exatamente o que `IntencaoDeFotoDoUsuario` existe para impedir.
///
/// ## NENHUMA rota de publicacao de OUTRA pessoa, e a ausencia e deliberada
///
/// Nao existe `GET /publications/{ref}` no contrato, e nao existe
/// `/people/{apelido}/publications`. A UNICA leitura que mostra publicacao de
/// outra pessoa e `GET /timeline`, e ela devolve **so** quem e conexao aceita de
/// quem chama — o recorte mora na clausula `WHERE` da consulta do servidor
/// (ADR-0021), e nao num campo que esta camada pudesse interpretar.
///
/// Por isso nao ha metodo aqui que receba um apelido: **nao ha o que chamar.**
///
/// ## A escrita e UMA, e ela confirma a foto
///
/// `POST /me/publications` manda o texto e, opcionalmente, o `upload_id`. **E
/// nessa escrita que a intencao de envio e confirmada no servidor, na mesma
/// transacao** — nao ha operacao de confirmacao separada. Sem isso a varredura
/// de vencidos apagaria a foto dez minutos depois, que foi o que aconteceu com a
/// foto do achado.
class MuralApi
    implements IntencaoDeFotoDaPublicacao, LeituraDoMural, EscritaDoMural {
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
          // `?` e nao `if`: e o marcador null-aware que o lint deste
          // repositorio pede, e o mesmo que `auth_api.dart` e `achados_api.dart`
          // ja usam.
          //
          // **O vazio e filtrado na TELA**, e nao aqui: e ela que sabe que
          // `alt_text` so vale com foto -- mandar o par invalido seria produzir
          // um `400` que ela sabia evitar.
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

/// O que a TELA DO MURAL precisa para desenhar. Interface ESTREITA, pelo mesmo
/// motivo de `LeituraDaVitrine`: a tela que so desenha nao deve alcancar
/// [MuralApi.apagar] nem [MuralApi.publicar] — um toque errado apagaria uma
/// publicacao.
///
/// Ela tambem e o que permite medir a tela sem rede: a bancada de teste
/// implementa estes metodos e nada mais, em vez de construir um `ApiClient` que
/// aponta para algum lugar. Teste de widget que alcanca a rede e teste que
/// pisca.
abstract class LeituraDoMural {
  Future<PaginaDaLinhaDoTempo> linhaDoTempo({String? cursor});
  Future<PaginaDasMinhasPublicacoes> minhasPublicacoes({String? cursor});
}

/// O que o mecanismo de envio precisa desta API. Interface ESTREITA, e nao a
/// classe: um envio que alcancasse [MuralApi.apagar] poderia apagar uma
/// publicacao ao gravar uma foto.
abstract class IntencaoDeFotoDaPublicacao {
  Future<Map<String, dynamic>> intencaoDeFotoDaPublicacao({
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  });
}

/// O que a tela de PUBLICAR precisa.
///
/// **Ela ESTENDE [IntencaoDeFotoDaPublicacao] em vez de redeclarar o metodo**: a
/// assinatura da intencao e a que `EnvioParaConfirmarDepois` recebe como FUNCAO,
/// e duas declaracoes dela seriam duas assinaturas identicas — que e exatamente
/// a forma do defeito consertado em 19/10, a vitrine chamando o registrador de
/// capa de encontro e gravando `network_event` numa foto de pessoa. A troca
/// COMPILAVA.
abstract class EscritaDoMural implements IntencaoDeFotoDaPublicacao {
  Future<MinhaPublicacao> publicar({
    required String texto,
    String? uploadId,
    String? textoAlternativo,
  });

  Future<void> apagar(String ref);
}

/// O estado de processamento da foto. `processing` -> `ready` | `rejected`, e
/// **nunca volta**.
enum EstadoDaFotoDaPublicacao { processando, pronta, recusada }

EstadoDaFotoDaPublicacao _estadoDe(Object? valor) {
  switch (valor) {
    case 'ready':
      return EstadoDaFotoDaPublicacao.pronta;
    case 'rejected':
      return EstadoDaFotoDaPublicacao.recusada;
    default:
      // Qualquer outra coisa — inclusive um estado novo que o servidor passe a
      // mandar — cai em `processando`. E o estado em que a tela nao promete
      // imagem nenhuma, e portanto o unico seguro para o desconhecido.
      return EstadoDaFotoDaPublicacao.processando;
  }
}

/// A imagem de uma publicacao na LINHA DO TEMPO. **Sem estado**: imagem que nao
/// esta `ready` nao chega aqui, porque o predicado esta no `WHERE` do servidor.
///
/// **`image`/`url` e nao `photo`/`open_url`**, e os dois nomes vem do contrato,
/// que diz por que: `photo` e o nome da foto de PESSOA nesta casa (um portao
/// conta os campos `photo:`) e `open_url` e o de uma derivada da VITRINE (outro
/// portao os varre por nome de campo). A imagem de uma publicacao nao e nenhuma
/// das duas.
class ImagemDaPublicacao {
  const ImagemDaPublicacao({required this.url, required this.textoAlternativo});

  factory ImagemDaPublicacao.doJson(Map<String, dynamic> json) {
    return ImagemDaPublicacao(
      url: json['url'] as String?,
      textoAlternativo: json['alt_text'] as String?,
    );
  }

  /// A derivada de **1024 x 1024 px**, a UNICA desta imagem. Nula so se o
  /// servidor mandar o campo vazio — a tela decide o que fazer com o nulo.
  final String? url;

  /// O rotulo do leitor de tela. Nulo quando quem publicou nao o escreveu — e
  /// ai a tela anuncia um rotulo generico, e **nao** esconde a imagem.
  final String? textoAlternativo;
}

/// A imagem de uma publicacao do DONO. **Com estado**, porque motivo de recusa e
/// assunto entre o dono e quem modera.
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

/// Quem publicou, na linha do tempo. **Dois campos, e nada mais.**
///
/// **NAO HA FOTO**, e a ausencia vem do contrato: a Emenda 3 do ADR-0010 abriu
/// `photo_icon_url` em `Conversation.participants[]` *"e em mais nenhuma
/// resposta deste contrato"*. `PublicationAuthor` nao tem o campo, entao nao ha
/// o que ler aqui — e no dia em que o cliente o abrir, ele entra no contrato
/// primeiro e nesta classe depois.
class AutorDaPublicacao {
  const AutorDaPublicacao({required this.apelido, required this.nomeExibido});

  factory AutorDaPublicacao.doJson(Map<String, dynamic> json) {
    return AutorDaPublicacao(
      apelido: json['handle'] as String?,
      nomeExibido: json['display_name'] as String? ?? '',
    );
  }

  /// O apelido, e e ele o endereco do perfil. **Nulo** quando a pessoa nao tem
  /// apelido: ai o toque no autor **nao nasce**, em vez de nascer e nao levar a
  /// lugar nenhum (criterio 2 da BICHUS-62).
  final String? apelido;

  final String nomeExibido;
}

/// Uma publicacao na linha do tempo.
class PublicacaoDaLinha {
  const PublicacaoDaLinha({
    required this.ref,
    required this.texto,
    required this.criadaEm,
    required this.imagem,
    required this.autor,
    required this.minha,
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
      // Padrao `false`: na duvida o cartao oferece `Denunciar` e nao `Apagar`.
      // O caminho errado aqui seria oferecer apagar a publicacao de outra
      // pessoa, e o servidor responderia 404 — mas a tela teria mentido.
      minha: json['mine'] as bool? ?? false,
    );
  }

  final String ref;
  final String texto;
  final DateTime? criadaEm;
  final ImagemDaPublicacao? imagem;
  final AutorDaPublicacao autor;

  /// `true` quando quem chama e o autor. **Vem do SERVIDOR**, e nao de uma
  /// comparacao de apelido nesta camada: a tela nao tem o apelido de quem chama
  /// em toda rolagem, e comparar aqui seria a autorizacao migrando para o
  /// cliente.
  final bool minha;
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
