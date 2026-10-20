import 'api_client.dart';
import 'envio_de_foto.dart';

/// A VITRINE DE FOTOS DO USUARIO, **visivel so ao dono**.
///
/// Arquivo proprio, e nao metodos dentro de `me_api.dart`, por dois motivos: a
/// vitrine tem tres operacoes e um modelo proprio, e `me_api.dart` e a porta
/// dos DADOS da conta (nome, telefone, endereco de referencia). Misturar os
/// dois faria o envio de uma foto alcancar `atualizar` -- que e exatamente o
/// que `IntencaoEGravacaoDaFotoDoUsuario` existe para impedir.
///
/// ## Nenhuma rota de vitrine de OUTRA pessoa, e a ausencia e deliberada
///
/// As tres rotas sao `/me/showcase`. Nao existe `GET /users/{id}/showcase` no
/// contrato, e por isso nao existe metodo aqui: o ADR-0025 item 2 proibe avatar
/// de pessoa na superficie da `Rede`, e o contrato afirma em dois lugares que
/// `Conversation.participants` nunca traz foto de perfil. Mostrar a vitrine a
/// terceiro seria decisao do cliente.
///
/// ## A escrita e DECLARATIVA, e e uma so
///
/// `PUT /me/showcase` manda a vitrine inteira, na ordem. Ela trata acrescentar,
/// reordenar, **trocar a capa** (a posicao 0) e remover -- e `fotos: []` tira
/// todas. Quatro metodos separados seriam quatro lugares para o teto de nove
/// divergir.
class VitrineApi implements IntencaoDeFotoDaVitrine, LeituraDaVitrine {
  const VitrineApi(this._cliente);

  final ApiClient _cliente;

  /// A vitrine da propria conta. Lista vazia e estado normal e completo.
  @override
  Future<Vitrine> minhaVitrine() async {
    return Vitrine.doJson(await _cliente.get('/me/showcase'));
  }

  /// Substitui a vitrine inteira, na ordem em que [fotos] vem.
  ///
  /// `PUT` e sem `Idempotency-Key`, como `ApiClient.put` explica: o verbo e
  /// idempotente por definicao e o reenvio e a propria edicao.
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

/// O que a TELA precisa para desenhar a grade. Interface ESTREITA, pelo mesmo
/// motivo de [IntencaoDeFotoDaVitrine]: a tela que so desenha nao deve alcancar
/// [VitrineApi.substituir] -- um toque errado reordenaria ou apagaria a
/// vitrine.
///
/// Ela tambem e o que permite medir a tela sem rede: a bancada de teste
/// implementa este metodo e nada mais, em vez de construir um `ApiClient` que
/// aponta para algum lugar. Teste de widget que alcanca a rede e teste que
/// pisca.
abstract class LeituraDaVitrine {
  Future<Vitrine> minhaVitrine();
}

/// O que o mecanismo de envio precisa desta API. Interface ESTREITA, e nao a
/// classe: um envio que alcancasse [VitrineApi.substituir] poderia reordenar ou
/// apagar a vitrine ao gravar uma foto.
abstract class IntencaoDeFotoDaVitrine {
  Future<Map<String, dynamic>> intencaoDeFotoDaVitrine({
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  });
}

/// A foto da vitrine como destino de envio.
///
/// **[confirmar] nao faz nada, e a ausencia e deliberada** -- como em
/// `FotoDeAchado`, e por motivo oposto ao de `FotoDoUsuario`. A foto da vitrine
/// passa a existir quando `PUT /me/showcase` grava a ordem nova com o
/// `upload_id` dentro; nao ha operacao de confirmacao separada no contrato, e
/// um metodo que fingisse confirmar inventaria uma rota.
///
/// Quem envia guarda o `upload_id` e o manda na escrita. E **e nessa escrita
/// que a intencao e confirmada no servidor, na mesma transacao** -- sem isso a
/// varredura de vencidos apagaria a foto dez minutos depois, que foi o que
/// aconteceu com a foto do achado.
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
  /// sobre a foto. Opcional.
  final String? textoAlternativo;

  Map<String, dynamic> paraJson() => {
        'upload_id': uploadId,
        if (textoAlternativo != null) 'alt_text': textoAlternativo,
      };
}

/// `#/components/schemas/ShowcasePhoto/properties/status` do contrato.
///
/// O estado de processamento de uma foto. `processing` -> `ready` | `rejected`,
/// e **nunca volta**.
enum EstadoDaFoto {
  processando('processing'),
  pronta('ready'),
  recusada('rejected');

  const EstadoDaFoto(this.codigo);

  /// O codigo de fio, e a UNICA copia dele: `_estadoDe` le desta lista. O
  /// portao de conformidade compara estes valores com o contrato, e so
  /// consegue porque eles moram no enum, e nao dentro do decodificador.
  final String codigo;
}

EstadoDaFoto _estadoDe(Object? valor) {
  for (final estado in EstadoDaFoto.values) {
    if (estado.codigo == valor) return estado;
  }
  // Qualquer outra coisa -- inclusive um estado novo que o servidor passe a
  // mandar -- cai em `processando`. E o estado em que a tela nao promete
  // imagem nenhuma, e portanto o unico seguro para o desconhecido.
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
  /// ser reordenada por ela. Estado raro e previsto, nao erro.
  final String? uploadId;
  final int posicao;
  final EstadoDaFoto estado;

  /// A derivada de **320 px**, a da GRADE. Nula enquanto processa.
  final String? urlDaGrade;

  /// A derivada de **1024 px**, a da foto ABERTA. Nula enquanto processa.
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
      // O teto vem do SERVIDOR, e nao de uma constante aqui: duas copias do
      // numero divergem na primeira mudanca, e a tela e a copia que ninguem
      // lembra de atualizar. O `9` e so o fallback de uma resposta velha.
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
