/// O envelope de intenção pendente (UX 8.3, BICHU-30).
///
/// A pessoa toca em `Marcar como perdido` com o pet já escolhido, a foto já
/// tirada e o texto já digitado. Sobe a folha que pede conta. Ela cria a conta,
/// verifica o e-mail noutro app, e o sistema encerra o Bichu enquanto isso —
/// que é o comportamento normal de um aparelho com pouca memória, e é
/// exatamente o aparelho de quem mais precisa deste produto.
///
/// **O que este arquivo garante é que aquilo não se perde.** O envelope é o
/// que a pessoa ia fazer, gravado em disco, com o rascunho inteiro, esperando o
/// login acontecer. Quem executa é a `GuardaDeAcao`; aqui mora só o formato —
/// e o formato é onde estão as duas armadilhas:
///
/// 1. **Foto é caminho de arquivo, nunca conteúdo.** Um envelope com os bytes
///    da foto dentro é um JSON de alguns megabytes sendo serializado no
///    momento de menos memória disponível do app. Ele estoura no aparelho
///    antigo, que é justamente o aparelho em que o envelope precisa existir. O
///    arquivo já está no disco: o que atravessa é o caminho dele.
/// 2. **A localização carrega o carimbo de tempo.** Coordenada sem hora é
///    coordenada de ontem passando por coordenada de agora, e o caso de pet
///    perdido é gravado no lugar errado — que é pior que não ter lugar
///    nenhum, porque a busca acontece em volta dele.
library;

/// As seis ações que o produto guarda (UX 8.3).
///
/// Enum fechado, e não `String` livre: um envelope com ação que este build não
/// conhece precisa ser recusado na leitura, e não descoberto na hora de
/// executar — quando a pessoa já entrou e está esperando o resultado.
enum AcaoDeIntencao {
  marcarPerdido('marcar_perdido'),
  registrarAchado('registrar_achado'),
  responderConversa('responder_conversa'),
  encerrarCaso('encerrar_caso'),
  cadastrarPet('cadastrar_pet'),
  gerarTag('gerar_tag');

  const AcaoDeIntencao(this.valor);

  /// Como a ação é gravada no disco. Fixo: o envelope gravado por uma versão
  /// do app é lido por outra, depois da atualização.
  final String valor;

  static AcaoDeIntencao? porValor(String valor) {
    for (final acao in AcaoDeIntencao.values) {
      if (acao.valor == valor) return acao;
    }
    return null;
  }
}

/// Uma foto do rascunho: **o caminho do arquivo**, e nada do conteúdo dele.
///
/// Os três campos são os mesmos de `FotoLocal`, que é o que a câmera devolve.
/// Não há campo de bytes e não vai haver: ver a regra 5 da seção 8.3.
class FotoDaIntencao {
  const FotoDaIntencao({
    required this.caminho,
    required this.tipoDeConteudo,
    required this.tamanhoEmBytes,
  });

  /// O caminho do arquivo no disco do aparelho. O arquivo é de quem o criou
  /// (a câmera, a galeria) e continua lá depois de o app ser encerrado.
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
  /// de 8.3). Meia hora é o tempo em que alguém andando com o animal no colo
  /// já saiu do quarteirão: gravar a coordenada velha calada põe o caso no
  /// lugar errado e manda a busca para lá.
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
///
/// Parece detalhe e não é: voltar para o topo de um formulário de sete campos
/// depois do login faz a pessoa procurar de novo onde tinha parado, e é o tipo
/// de coisa que ninguém reporta como defeito — só abandona.
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
  ///
  /// Se a checagem ficasse na hora de gravar, o defeito apareceria no aparelho
  /// de quem estivesse com a memória no limite, em produção, e não na tela que
  /// montou o rascunho errado. Aqui ele aparece para quem escreveu a tela.
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

  /// Id do pet, do caso ou da conversa. Nulo quando o alvo **ainda não
  /// existe** — é o caso do achado avulso e do cadastro, em que a ação é
  /// justamente criar o alvo.
  final String? alvo;

  /// O ID de tela da pesquisa de UX, ex.: `F1.5`. É para onde a pessoa volta
  /// quando a execução falha (regra 4 de 8.3).
  final String telaDeRetorno;

  final RascunhoDaIntencao rascunho;
  final DateTime criadaEm;

  /// Vinte e quatro horas (regra 2 de 8.3).
  ///
  /// Rascunho de ontem executado sozinho hoje é pior que rascunho nenhum: a
  /// pessoa entra na conta para ver uma notificação e o app publica um caso
  /// de pet perdido que ela já resolveu ontem à noite.
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
  ///
  /// Lança `FormatException` para o que este build não sabe executar — ação
  /// desconhecida, campo faltando, data ilegível. Quem chama trata isso como
  /// "não há intenção", e não como erro de tela: um envelope gravado por outra
  /// versão do app não pode impedir a pessoa de entrar na conta dela.
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
