/// O envelope de intenção pendente (UX 8.3, BICHU-30).
library;

/// As ações que o produto guarda (UX 8.3).
enum AcaoDeIntencao {
  marcarPerdido('marcar_perdido'),
  registrarAchado('registrar_achado'),
  responderConversa('responder_conversa'),
  encerrarCaso('encerrar_caso'),
  cadastrarPet('cadastrar_pet'),
  gerarTag('gerar_tag'),

  /// Pedir para participar de um encontro privado da `Rede` (design system
  /// 24.17.1, item 5).
  pedirParaParticipar('pedir_para_participar'),

  /// **VER** um conteúdo que exige conta (20/10/2026).
  verConteudo('ver_conteudo');

  const AcaoDeIntencao(this.valor);

  /// Como a ação é gravada no disco.
  final String valor;

  static AcaoDeIntencao? porValor(String valor) {
    for (final acao in AcaoDeIntencao.values) {
      if (acao.valor == valor) return acao;
    }
    return null;
  }
}

/// Uma foto do rascunho: **o caminho do arquivo**, e nada do conteúdo dele.
class FotoDaIntencao {
  const FotoDaIntencao({
    required this.caminho,
    required this.tipoDeConteudo,
    required this.tamanhoEmBytes,
  });

  /// O caminho do arquivo no disco do aparelho.
  final String caminho;

  final String tipoDeConteudo;
  final int tamanhoEmBytes;

  Map<String, dynamic> paraJson() => <String, dynamic>{
        'caminho': caminho,
        'tipo_de_conteudo': tipoDeConteudo,
        'tamanho_em_bytes': tamanhoEmBytes,
      };

  static FotoDaIntencao deJson(Map<String, dynamic> json) => FotoDaIntencao(
        caminho: json['caminho'] as String,
        tipoDeConteudo: json['tipo_de_conteudo'] as String,
        tamanhoEmBytes: json['tamanho_em_bytes'] as int,
      );
}

/// A coordenada já capturada, **com a hora em que foi capturada**.
class LocalizacaoDaIntencao {
  const LocalizacaoDaIntencao({
    required this.latitude,
    required this.longitude,
    required this.capturadaEm,
  });

  final double latitude;
  final double longitude;
  final DateTime capturadaEm;

  /// Acima disto, a tela de resultado pergunta se o lugar ainda vale (regra 6
  /// de 8.3).
  static const Duration validade = Duration(minutes: 30);

  bool desatualizadaEm(DateTime agora) =>
      agora.difference(capturadaEm) > validade;

  Map<String, dynamic> paraJson() => <String, dynamic>{
        'latitude': latitude,
        'longitude': longitude,
        'capturada_em': capturadaEm.toIso8601String(),
      };

  static LocalizacaoDaIntencao deJson(Map<String, dynamic> json) =>
      LocalizacaoDaIntencao(
        latitude: (json['latitude'] as num).toDouble(),
        longitude: (json['longitude'] as num).toDouble(),
        capturadaEm: DateTime.parse(json['capturada_em'] as String),
      );
}

/// Onde a pessoa estava na tela: a rolagem e o passo do assistente.
class PosicaoNaTela {
  const PosicaoNaTela({this.rolagem = 0, this.passo = 0});

  final double rolagem;
  final int passo;

  Map<String, dynamic> paraJson() =>
      <String, dynamic>{'rolagem': rolagem, 'passo': passo};

  static PosicaoNaTela deJson(Map<String, dynamic> json) => PosicaoNaTela(
        rolagem: (json['rolagem'] as num?)?.toDouble() ?? 0,
        passo: (json['passo'] as int?) ?? 0,
      );
}

/// Tudo o que a pessoa já tinha digitado, escolhido, fotografado e localizado.
class RascunhoDaIntencao {
  /// Valida os campos na **captura**, e não na gravação.
  RascunhoDaIntencao({
    Map<String, Object?> campos = const <String, Object?>{},
    this.fotos = const <FotoDaIntencao>[],
    this.localizacao,
    this.posicaoNaTela,
  }) : campos = Map<String, Object?>.unmodifiable(campos) {
    for (final entrada in this.campos.entries) {
      if (!_valorAceito(entrada.value)) {
        throw ArgumentError.value(
          entrada.value,
          entrada.key,
          'O rascunho do envelope aceita apenas o que foi digitado ou '
          'escolhido: texto, número, booleano, nulo ou lista de textos. '
          'Conteúdo binário (bytes de foto, por exemplo) não entra aqui — a '
          'foto vai em `fotos`, por CAMINHO de arquivo (UX 8.3, regra 5). Um '
          'envelope com bytes dentro estoura a serialização no aparelho '
          'antigo, que é exatamente o aparelho em que ele precisa existir',
        );
      }
    }
  }

  static bool _valorAceito(Object? valor) {
    if (valor == null || valor is String || valor is num || valor is bool) {
      return true;
    }
    if (valor is List) return valor.every((e) => e is String);
    return false;
  }

  /// Campo a campo, como a pessoa preencheu.
  final Map<String, Object?> campos;

  /// **Caminhos de arquivo.** Ver `FotoDaIntencao`.
  final List<FotoDaIntencao> fotos;

  final LocalizacaoDaIntencao? localizacao;
  final PosicaoNaTela? posicaoNaTela;

  Map<String, dynamic> paraJson() => <String, dynamic>{
        'campos': campos,
        'fotos': fotos.map((f) => f.paraJson()).toList(),
        if (localizacao != null) 'localizacao': localizacao!.paraJson(),
        if (posicaoNaTela != null) 'posicao_na_tela': posicaoNaTela!.paraJson(),
      };

  static RascunhoDaIntencao deJson(Map<String, dynamic> json) {
    final localizacao = json['localizacao'];
    final posicao = json['posicao_na_tela'];
    return RascunhoDaIntencao(
      campos: Map<String, Object?>.from(
        (json['campos'] as Map?) ?? const <String, Object?>{},
      ),
      fotos: <FotoDaIntencao>[
        for (final f in (json['fotos'] as List?) ?? const <dynamic>[])
          FotoDaIntencao.deJson(Map<String, dynamic>.from(f as Map)),
      ],
      localizacao: localizacao == null
          ? null
          : LocalizacaoDaIntencao.deJson(
              Map<String, dynamic>.from(localizacao as Map),
            ),
      posicaoNaTela: posicao == null
          ? null
          : PosicaoNaTela.deJson(Map<String, dynamic>.from(posicao as Map)),
    );
  }
}

/// O envelope: o que a pessoa ia fazer quando o app pediu conta.
class IntencaoPendente {
  IntencaoPendente({
    required this.acao,
    required this.telaDeRetorno,
    required this.criadaEm,
    this.alvo,
    RascunhoDaIntencao? rascunho,
  }) : rascunho = rascunho ?? RascunhoDaIntencao();

  final AcaoDeIntencao acao;

  /// Id do pet, do caso ou da conversa.
  final String? alvo;

  /// O ID de tela da pesquisa de UX, ex.: `F1.5`.
  final String telaDeRetorno;

  final RascunhoDaIntencao rascunho;
  final DateTime criadaEm;

  /// Vinte e quatro horas (regra 2 de 8.3).
  static const Duration validade = Duration(hours: 24);

  bool expiradaEm(DateTime agora) =>
      agora.difference(criadaEm) >= validade;

  Map<String, dynamic> paraJson() => <String, dynamic>{
        'acao': acao.valor,
        if (alvo != null) 'alvo': alvo,
        'tela_de_retorno': telaDeRetorno,
        'rascunho': rascunho.paraJson(),
        'criada_em': criadaEm.toIso8601String(),
      };

  /// Lê um envelope gravado.
  static IntencaoPendente deJson(Map<String, dynamic> json) {
    final bruta = json['acao'];
    if (bruta is! String) {
      throw const FormatException('envelope sem ação');
    }
    final acao = AcaoDeIntencao.porValor(bruta);
    if (acao == null) {
      throw FormatException('ação desconhecida neste build: $bruta');
    }
    final tela = json['tela_de_retorno'];
    if (tela is! String || tela.isEmpty) {
      throw const FormatException('envelope sem tela de retorno');
    }
    final criadaEm = json['criada_em'];
    if (criadaEm is! String) {
      throw const FormatException('envelope sem data de criação');
    }
    return IntencaoPendente(
      acao: acao,
      alvo: json['alvo'] as String?,
      telaDeRetorno: tela,
      rascunho: RascunhoDaIntencao.deJson(
        Map<String, dynamic>.from(
          (json['rascunho'] as Map?) ?? const <String, dynamic>{},
        ),
      ),
      criadaEm: DateTime.parse(criadaEm),
    );
  }
}
