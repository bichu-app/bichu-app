/// O registro de quantas vezes o aviso persistente de cadastro foi dispensado,
/// e de quando foi a ultima (BICHUS-75, criterios 4 e 6).
///
/// ## Por que existe um arquivo, e nao um booleano em memoria
///
/// O criterio 4 fala em **7 dias**. Memoria daria "7 dias ou ate o app ser
/// encerrado, o que vier primeiro", e quem fecha o app a noite veria a faixa
/// cheia de novo na manha seguinte. O ciclo so e o ciclo se ele sobreviver ao
/// processo.
///
/// ## Por que ele MORRE no logout, ao contrario do registro de oportunidades
///
/// `OportunidadesDeAviso` fica de fora de `limpezasAoSair` porque o dialogo de
/// notificacao do sistema e gasto uma vez por **instalacao**: ele e do
/// aparelho. Este aqui e o oposto exato. O que ele guarda e "a Marina dispensou
/// tres vezes o pedido para confirmar **o e-mail dela**" -- e da CONTA, e o
/// e-mail em questao e dado pessoal dela.
///
/// Sobrevivendo ao logout, o proximo tutor a entrar neste aparelho herdaria o
/// silencio de sete dias comprado pela anterior, e o criterio 1 -- a faixa
/// aparece quando a conta nao tem contato verificado -- ficaria falso para ele
/// sem nada acusar. Pior: com tres dispensas herdadas ele veria de cara o texto
/// de endereco errado sobre um endereco que e dele e esta certo.
///
/// A entrada esta em `limpezasAoSair` no `app.dart`. A isca que segura a
/// decisao esta em `test/sessao/registro_do_aviso_de_cadastro_test.dart`: ela
/// reprova se alguem tirar a limpeza da lista, e o motivo fica na mensagem.
///
/// ## O relogio entra pela porta
///
/// O ciclo de 7 dias nao e observavel em treze dias sem relogio injetavel --
/// foi a ressalva escrita no refinamento de 17/09. [AvisoDeCadastro] recebe
/// `agora` como funcao e nunca chama `DateTime.now()` direto.
library;

import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// O ciclo do criterio 4: dispensado, some por 7 dias, volta cheio, repete.
const Duration janelaDeSilencio = Duration(days: 7);

/// Quantas dispensas seguidas trocam o texto para o de endereco errado
/// (criterio 6).
const int dispensasQueTrocamOTexto = 3;

/// O que o registro sabe sobre uma conta.
class EstadoDoAviso {
  const EstadoDoAviso({this.dispensadoEm, this.dispensas = 0});

  /// Quando a pessoa tocou em `Agora nao` pela ultima vez. Nulo quando ela
  /// nunca dispensou.
  final DateTime? dispensadoEm;

  /// Quantas vezes seguidas ela dispensou.
  final int dispensas;

  static const EstadoDoAviso nenhum = EstadoDoAviso();
}

/// Onde o registro mora entre uma abertura do app e a seguinte.
///
/// Abstrato pelo mesmo motivo de `DepositoDeOportunidades`:
/// `getApplicationDocumentsDirectory` e um canal de plataforma, e um teste de
/// widget que dependesse dele travaria num `Future` que nunca resolve.
abstract class DepositoDoAvisoDeCadastro {
  Future<String?> ler();
  Future<void> gravar(String conteudo);
  Future<void> apagar();
}

/// Implementacao em arquivo, no diretorio do app.
class DepositoDoAvisoEmArquivo implements DepositoDoAvisoDeCadastro {
  DepositoDoAvisoEmArquivo({String nomeDoArquivo = 'aviso_de_cadastro.json'})
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
    // Temporario e `rename`, como o envelope de intencao: `rename` e atomico.
    // Escrever por cima deixaria um JSON pela metade se o sistema encerrasse o
    // app no meio, e um JSON pela metade aqui e lido como "nunca dispensou" --
    // a faixa cheia volta a quem acabou de pedir silencio.
    final temporario = File('${arquivo.path}.tmp');
    await temporario.writeAsString(conteudo, flush: true);
    await temporario.rename(arquivo.path);
  }

  @override
  Future<void> apagar() async {
    final arquivo = await _abrir();
    if (arquivo.existsSync()) await arquivo.delete();
  }
}

/// Deposito em memoria, para teste de widget.
class DepositoDoAvisoEmMemoria implements DepositoDoAvisoDeCadastro {
  DepositoDoAvisoEmMemoria({String? conteudoInicial})
      : conteudo = conteudoInicial;

  String? conteudo;

  /// Quantas vezes alguem mandou apagar. O caso do logout le isto.
  int apagamentos = 0;

  @override
  Future<String?> ler() async => conteudo;

  @override
  Future<void> gravar(String texto) async => conteudo = texto;

  @override
  Future<void> apagar() async {
    apagamentos += 1;
    conteudo = null;
  }
}

/// O registro de dispensas do aviso persistente, por conta.
class AvisoDeCadastro {
  AvisoDeCadastro({required this.deposito, this.agora = DateTime.now});

  final DepositoDoAvisoDeCadastro deposito;

  /// O relogio. Publico porque o nome privado exigiria um formal de
  /// inicializacao privado, que a linguagem nao permite em parametro nomeado.
  final DateTime Function() agora;

  /// Cache de leitura: o arquivo e lido uma vez por processo.
  EstadoDoAviso? _memoria;
  String? _contaEmMemoria;

  /// O que esta registrado para [idDaConta].
  ///
  /// A conta entra na chave alem de o arquivo morrer no logout. As duas
  /// defesas cobrem coisas diferentes: `limpezasAoSair` cobre a saida pela
  /// porta, e a chave cobre o arquivo que sobreviveu a uma versao anterior do
  /// app, a um logout que falhou ao gravar, ou a uma restauracao de backup do
  /// aparelho. Registro de outra conta e lido como registro nenhum.
  Future<EstadoDoAviso> estado(String idDaConta) async {
    if (_contaEmMemoria == idDaConta) {
      final memoria = _memoria;
      if (memoria != null) return memoria;
    }
    final lido = await _ler(idDaConta);
    _contaEmMemoria = idDaConta;
    _memoria = lido;
    return lido;
  }

  Future<EstadoDoAviso> _ler(String idDaConta) async {
    final String? cru;
    try {
      cru = await deposito.ler();
    } on Object {
      // Disco que nao responde vira "nunca dispensou": o lado seguro aqui e o
      // oposto do das oportunidades de aviso. La, insistir gastava um dialogo
      // do sistema que nao volta. Aqui, calar esconde de quem tem e-mail nao
      // confirmado a unica razao pela qual alguem conseguiria devolver o pet
      // dele. O custo de mostrar a faixa a mais e uma faixa a mais.
      return EstadoDoAviso.nenhum;
    }
    if (cru == null || cru.isEmpty) return EstadoDoAviso.nenhum;
    try {
      final corpo = jsonDecode(cru);
      if (corpo is! Map<String, dynamic>) return EstadoDoAviso.nenhum;
      if (corpo['conta'] != idDaConta) return EstadoDoAviso.nenhum;
      final quando = corpo['dispensado_em'];
      return EstadoDoAviso(
        dispensadoEm: quando is String ? DateTime.tryParse(quando) : null,
        dispensas: corpo['dispensas'] is int ? corpo['dispensas'] as int : 0,
      );
    } on FormatException {
      return EstadoDoAviso.nenhum;
    }
  }

  /// Registra um toque em `Agora nao`.
  ///
  /// Conta **dispensas**, e nao exibicoes: o criterio 6 fala em "dispensei tres
  /// vezes seguidas", e quem abre o app dez vezes sem tocar em nada nao pediu
  /// silencio nenhuma delas.
  Future<void> dispensar(String idDaConta) async {
    final atual = await estado(idDaConta);
    final novo = EstadoDoAviso(
      dispensadoEm: agora(),
      dispensas: atual.dispensas + 1,
    );
    _contaEmMemoria = idDaConta;
    _memoria = novo;
    try {
      await deposito.gravar(
        jsonEncode(<String, dynamic>{
          'conta': idDaConta,
          'dispensado_em': novo.dispensadoEm!.toUtc().toIso8601String(),
          'dispensas': novo.dispensas,
        }),
      );
    } on Object {
      // A memoria ja tem o valor certo, entao esta execucao do app respeita o
      // silencio. A proxima abertura volta a mostrar cheio, que e o lado
      // seguro: uma faixa a mais nao derruba nada.
    }
  }

  /// A entrada de `limpezasAoSair`.
  Future<void> limpar() async {
    _memoria = null;
    _contaEmMemoria = null;
    try {
      await deposito.apagar();
    } on Object {
      // Nada a fazer: o arquivo continua la, e a chave por conta o neutraliza
      // para o proximo tutor.
    }
  }

  /// Verdadeiro quando o silencio de 7 dias ainda vale.
  bool silencioVale(EstadoDoAviso registro) {
    final quando = registro.dispensadoEm;
    if (quando == null) return false;
    return agora().difference(quando) < janelaDeSilencio;
  }
}
