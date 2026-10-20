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

  /// Os comentarios, **mais ANTIGO primeiro**. `404` quando a publicacao nao e
  /// visivel, e nao lista vazia: lista vazia afirmaria que ela existe e nao tem
  /// comentario.
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
/// O que o CARTAO e a folha de comentarios precisam. Interface ESTREITA, pelo
/// mesmo motivo das outras: o cartao que curte nao deve alcancar
/// [MuralApi.apagar] -- um toque errado apagaria a publicacao em vez de
/// descurtir.
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

/// `#/components/schemas/MyPublicationImage/properties/status` do contrato.
///
/// O estado de processamento da foto. `processing` -> `ready` | `rejected`, e
/// **nunca volta**.
///
/// **A ANCORA E O CODIGO DE FIO ENTRARAM NA MESCLA DO TERCEIRO LOTE DE
/// 20/10/2026.** Este enum nasceu sem os dois e `verificar-conformidade-do-app`
/// passou de UMA divergencia para DUAS -- a frente do Mural copiou a forma
/// antiga do irmao `EstadoDaFoto` de `vitrine_api.dart`, que e justamente a
/// que o portao ja acusava. A forma usada aqui e a MESMA que a sessao que
/// conserta o irmao escolheu, para as duas nao divergirem: o codigo de fio mora
/// no enum, e nao dentro do decodificador.
enum EstadoDaFotoDaPublicacao {
  processando('processing'),
  pronta('ready'),
  recusada('rejected');

  const EstadoDaFotoDaPublicacao(this.codigo);

  /// O codigo de fio, e a UNICA copia dele: `_estadoDe` le desta lista. O
  /// portao de conformidade compara estes valores com o contrato, e so
  /// consegue porque eles moram no enum, e nao dentro do decodificador.
  final String codigo;
}

EstadoDaFotoDaPublicacao _estadoDe(Object? valor) {
  for (final estado in EstadoDaFotoDaPublicacao.values) {
    if (estado.codigo == valor) return estado;
  }
  // Qualquer outra coisa — inclusive um estado novo que o servidor passe a
  // mandar — cai em `processando`. E o estado em que a tela nao promete
  // imagem nenhuma, e portanto o unico seguro para o desconhecido.
  return EstadoDaFotoDaPublicacao.processando;
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

/// Quem publicou, na linha do tempo. **Tres campos, e nada mais.**
///
/// **A FOTO ENTROU EM 20/10/2026** pela Emenda 5 do ADR-0010 — decisao do
/// cliente, *"tras a foto, algo bem parecido com o instagram"*. Ela nasceu
/// ausente de proposito: a Emenda 3 limitava a foto de pessoa a
/// `Conversation.participants[]` *"e em mais nenhuma resposta deste contrato"*,
/// a frente parou e perguntou, e a emenda NOMEOU esta superficie.
///
/// A derivada e a `thumb` de 176, a MESMA da Emenda 3 — nunca a `card` de 512.
class AutorDaPublicacao {
  const AutorDaPublicacao({
    required this.apelido,
    required this.nomeExibido,
    required this.urlDoIcone,
  });

  factory AutorDaPublicacao.doJson(Map<String, dynamic> json) {
    return AutorDaPublicacao(
      apelido: json['handle'] as String?,
      nomeExibido: json['display_name'] as String? ?? '',
      urlDoIcone: json['photo_icon_url'] as String?,
    );
  }

  /// O apelido, e e ele o endereco do perfil. **Nulo** quando a pessoa nao tem
  /// apelido: ai o toque no autor **nao nasce**, em vez de nascer e nao levar a
  /// lugar nenhum (criterio 2 da BICHUS-62).
  final String? apelido;

  final String nomeExibido;

  /// A `thumb` de 176 da foto do autor. **Nula em tres estados**, e nenhum e
  /// erro: a pessoa nao tem foto, a foto nao esta `ready` (em `processing` ela
  /// carrega o EXIF do celular), ou a conta esta desabilitada. A tela nao os
  /// distingue — com nula ela desenha a inicial do nome.
  final String? urlDoIcone;
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
///
/// **O autor usa o MESMO [AutorDaPublicacao]** da publicacao, e o reuso vem do
/// contrato: e a mesma pessoa, com os mesmos tres campos e a mesma derivada de
/// foto (Emenda 5 do ADR-0010).
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
      // Padrao `false`: na duvida o `Apagar` NAO nasce. Oferecer apagar o
      // comentario de outra pessoa levaria a um 404, e a tela teria mentido.
      meu: json['mine'] as bool? ?? false,
    );
  }

  final String ref;
  final String texto;
  final DateTime? criadoEm;
  final AutorDaPublicacao autor;

  /// `true` quando quem chama escreveu o comentario. **Vem do SERVIDOR.**
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
  /// A tela mostra o total no cartao e a pagina na folha.
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
      // Padrao `false`: na duvida o cartao oferece `Denunciar` e nao `Apagar`.
      // O caminho errado aqui seria oferecer apagar a publicacao de outra
      // pessoa, e o servidor responderia 404 — mas a tela teria mentido.
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

  /// `true` quando quem chama e o autor. **Vem do SERVIDOR**, e nao de uma
  /// comparacao de apelido nesta camada: a tela nao tem o apelido de quem chama
  /// em toda rolagem, e comparar aqui seria a autorizacao migrando para o
  /// cliente.
  final bool minha;

  /// Quantas pessoas curtiram. **Lida das linhas no servidor**, e nao de coluna
  /// denormalizada. A tela mostra o numero e **nunca quem**: nao existe lista de
  /// quem curtiu (item 7 da Emenda 5 do ADR-0010).
  final int curtidas;

  /// Quantos comentarios VIVOS. Comentario apagado nao conta.
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
