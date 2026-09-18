/// A fila de ações que saíram sem conexão (BICHUS-31, critérios 1 e 13).
///
/// O produto é usado na rua, com sinal oscilando, por alguém com 11% de bateria
/// e um animal desaparecido. A fila existe para que uma ação disparada nesse
/// momento **não se perca** — nem quando o sistema encerra o app para liberar
/// memória, que é exatamente o que acontece com um app em segundo plano num
/// aparelho barato.
///
/// ## Por que em disco, e não em memória
///
/// O critério 1 é explícito: *"sobrevive ao app ser encerrado pelo sistema"*.
/// Memória não sobrevive a isso. O tutor que marcou o pet como perdido no
/// elevador do prédio precisa que o alerta saia quando ele chegar na rua,
/// mesmo que o sistema tenha matado o app no caminho.
///
/// ## A mesma `Idempotency-Key`, sempre
///
/// O critério 13 é o que impede o desastre silencioso: o reenvio usa **a chave
/// da primeira tentativa**, gravada junto da ação. Gerar uma chave nova no
/// reenvio faria o servidor tratar cada tentativa como um pedido novo — e o
/// tutor receberia o mesmo aviso várias vezes, ou o mesmo pet entraria duas
/// vezes no cadastro. A chave é parte da ação, não da tentativa.
///
/// ## O que esta fila NÃO aceita
///
/// Ação que exige servidor para responder (login, leitura, conferência de
/// código) não é enfileirável: enfileirar produziria uma tela de sucesso para
/// algo que ainda não aconteceu, que é o defeito que o critério 2 proíbe. Quem
/// decide é quem chama, e a fila não tem como adivinhar — por isso `enfileirar`
/// é uma escolha explícita e não um retorno automático de falha de rede.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// Uma ação esperando sinal.
class AcaoEnfileirada {
  const AcaoEnfileirada({
    required this.id,
    required this.metodo,
    required this.caminho,
    required this.corpo,
    required this.idempotencyKey,
    required this.criadaEm,
    this.tentativas = 0,
  });

  final String id;
  final String metodo;

  /// Caminho relativo a `/v1`. **Nunca a URL inteira**: a base vem da
  /// configuração na hora do envio, e uma URL gravada carregaria o ambiente do
  /// dia em que a ação foi enfileirada — que pode ser outro quando ela sair.
  final String caminho;

  final Map<String, dynamic> corpo;

  /// A chave da PRIMEIRA tentativa. Gravada junto, e nunca regerada.
  final String idempotencyKey;

  final DateTime criadaEm;
  final int tentativas;

  AcaoEnfileirada comMaisUmaTentativa() => AcaoEnfileirada(
        id: id,
        metodo: metodo,
        caminho: caminho,
        corpo: corpo,
        idempotencyKey: idempotencyKey,
        criadaEm: criadaEm,
        tentativas: tentativas + 1,
      );

  Map<String, dynamic> paraJson() => <String, dynamic>{
        'id': id,
        'metodo': metodo,
        'caminho': caminho,
        'corpo': corpo,
        'idempotency_key': idempotencyKey,
        'criada_em': criadaEm.toIso8601String(),
        'tentativas': tentativas,
      };

  static AcaoEnfileirada deJson(Map<String, dynamic> json) => AcaoEnfileirada(
        id: json['id'] as String,
        metodo: json['metodo'] as String,
        caminho: json['caminho'] as String,
        corpo: Map<String, dynamic>.from(json['corpo'] as Map),
        idempotencyKey: json['idempotency_key'] as String,
        criadaEm: DateTime.parse(json['criada_em'] as String),
        tentativas: (json['tentativas'] as int?) ?? 0,
      );
}

/// Onde a fila mora. Separado para o teste não precisar de aparelho.
abstract class DepositoDaFila {
  Future<String?> ler();
  Future<void> gravar(String conteudo);
}

/// Implementação em arquivo, no diretório do app.
class DepositoEmArquivo implements DepositoDaFila {
  DepositoEmArquivo({String nomeDoArquivo = 'fila_offline.json'})
      : _nome = nomeDoArquivo;

  final String _nome;
  File? _arquivo;

  Future<File> _abrir() async {
    final existente = _arquivo;
    if (existente != null) return existente;
    final dir = await getApplicationDocumentsDirectory();
    final novo = File('${dir.path}/$_nome');
    _arquivo = novo;
    return novo;
  }

  @override
  Future<String?> ler() async {
    final arquivo = await _abrir();
    if (!arquivo.existsSync()) return null;
    return arquivo.readAsString();
  }

  @override
  Future<void> gravar(String conteudo) async {
    final arquivo = await _abrir();
    // Grava num temporário e renomeia: `rename` é atômico no sistema de
    // arquivos, e escrever por cima direto deixaria um JSON pela metade se o
    // sistema encerrasse o app no meio — perdendo a fila inteira, e não só a
    // ação sendo gravada.
    final temporario = File('${arquivo.path}.tmp');
    await temporario.writeAsString(conteudo, flush: true);
    await temporario.rename(arquivo.path);
  }
}

/// O resultado de tentar enviar uma ação.
enum ResultadoDoEnvio {
  /// Saiu. Some da fila.
  entregue,

  /// Ainda sem sinal. Fica na fila, sem contar tentativa.
  semSinal,

  /// O servidor recusou de um jeito que tentar de novo não resolve.
  /// Some da fila: repetir para sempre uma recusa definitiva é um laço que
  /// gasta bateria e nunca avisa ninguém.
  recusada,
}

/// A fila.
class FilaOffline {
  FilaOffline({required this._deposito});

  final DepositoDaFila _deposito;
  List<AcaoEnfileirada>? _memoria;

  /// Acima disso, a ação mais antiga sai para a nova entrar. O teto existe
  /// contra o aparelho que passa uma semana sem sinal: sem ele, a fila cresce
  /// até ocupar o armazenamento de quem já está com o telefone cheio.
  static const int teto = 50;

  Future<List<AcaoEnfileirada>> pendentes() async {
    final emMemoria = _memoria;
    if (emMemoria != null) return List.unmodifiable(emMemoria);

    final bruto = await _deposito.ler();
    if (bruto == null || bruto.isEmpty) {
      _memoria = <AcaoEnfileirada>[];
      return const <AcaoEnfileirada>[];
    }

    try {
      final lista = (jsonDecode(bruto) as List<dynamic>)
          .map((e) => AcaoEnfileirada.deJson(Map<String, dynamic>.from(e as Map)))
          .toList();
      _memoria = lista;
      return List.unmodifiable(lista);
    } on FormatException {
      // Arquivo corrompido: começa vazia em vez de derrubar o app na abertura.
      // Perder a fila é ruim; não abrir é pior, porque a pessoa perde o acesso
      // ao cadastro inteiro por causa de um arquivo.
      _memoria = <AcaoEnfileirada>[];
      return const <AcaoEnfileirada>[];
    }
  }

  Future<void> enfileirar(AcaoEnfileirada acao) async {
    final atual = List<AcaoEnfileirada>.from(await pendentes());
    atual.add(acao);
    while (atual.length > teto) {
      atual.removeAt(0);
    }
    await _persistir(atual);
  }

  Future<void> remover(String id) async {
    final atual = List<AcaoEnfileirada>.from(await pendentes())
      ..removeWhere((a) => a.id == id);
    await _persistir(atual);
  }

  /// Tenta enviar tudo, **na ordem em que entrou**.
  ///
  /// A ordem importa: criar o pet e depois marcar como perdido só funciona
  /// nessa sequência. Enviar em paralelo seria mais rápido e produziria um
  /// "marcar como perdido" contra um pet que ainda não existe.
  ///
  /// Para na primeira sem sinal: se o sinal caiu de novo, as seguintes vão
  /// falhar igual, e insistir só gasta bateria.
  Future<int> reenviarTudo(
    Future<ResultadoDoEnvio> Function(AcaoEnfileirada) enviar,
  ) async {
    var entregues = 0;
    for (final acao in await pendentes()) {
      final resultado = await enviar(acao);
      if (resultado == ResultadoDoEnvio.semSinal) break;
      await remover(acao.id);
      if (resultado == ResultadoDoEnvio.entregue) entregues += 1;
    }
    return entregues;
  }

  Future<void> _persistir(List<AcaoEnfileirada> lista) async {
    _memoria = lista;
    await _deposito.gravar(jsonEncode(lista.map((a) => a.paraJson()).toList()));
  }
}
