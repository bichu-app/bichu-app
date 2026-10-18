/// A última cidade escolhida na listagem pública de perdidos.
///
/// ## É DO APARELHO, e não da conta
///
/// Irmã de `OportunidadesDeAviso` e **não** de `RegistroDoAvisoDeCadastro`, e a
/// escolha entre as duas é a mesma pergunta que aquele arquivo responde: o que
/// está guardado aqui pertence à pessoa ou ao aparelho?
///
/// Pertence ao aparelho. O que ela guarda é *"neste telefone, a última lista de
/// perdidos aberta foi a de Campinas"* — e quem a escreve, no caso que importa,
/// **não tem conta nenhuma**: é o visitante que digitou a cidade para a
/// vizinhança poder achar o pet. Não há conta a que amarrar, e amarrar à conta
/// apagaria exatamente o uso que justifica o campo existir.
///
/// A consequência honesta: o próximo visitante deste aparelho herda a cidade do
/// anterior. É conveniência de digitação, e não afirmação sobre ninguém — o
/// nome de uma cidade não é dado pessoal, e a tela mostra qual cidade está
/// valendo na linha de resumo da listagem. Por isso ela **não** entra em
/// `limpezasAoSair`: sair da conta não muda em que cidade este telefone está.
///
/// ## A LEITURA PODE FALHAR, E FALHAR É NORMAL
///
/// `getApplicationDocumentsDirectory()` é canal de plataforma: em aparelho com
/// armazenamento bloqueado, em perfil restrito, em teste de widget e no primeiro
/// arranque de um build sem o plugin registrado, ele **estoura**. Um `await` sem
/// guarda ali derruba a seção em que o aplicativo ABRE — e derruba com
/// `MissingPluginException`, que é o formato de falha que não aponta para a
/// causa.
///
/// Por isso [CidadeEscolhida] engole toda falha das duas pontas e devolve nulo:
/// a tela abre com o campo vazio, que é o estado de quem nunca escolheu. Guardar
/// a cidade é conveniência, e conveniência que falha não pode custar a tela.
/// Quem cobra isso é `test/sessao/cidade_escolhida_test.dart`, com um depósito
/// que estoura de propósito.
library;

import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// Onde o nome da cidade é guardado. Trocável para o teste poder estourar.
abstract interface class DepositoDaCidade {
  Future<String?> ler();
  Future<void> gravar(String conteudo);
}

/// Implementação em arquivo, no diretório do app. Mesma forma de
/// `DepositoDoAvisoEmArquivo`.
class DepositoDaCidadeEmArquivo implements DepositoDaCidade {
  DepositoDaCidadeEmArquivo({String nomeDoArquivo = 'cidade_dos_perdidos.txt'})
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
    await arquivo.writeAsString(conteudo, flush: true);
  }
}

/// Depósito em memória, para os testes.
class DepositoDaCidadeEmMemoria implements DepositoDaCidade {
  DepositoDaCidadeEmMemoria({this.conteudo});

  String? conteudo;

  /// Quantas vezes alguém mandou gravar.
  int gravacoes = 0;

  @override
  Future<String?> ler() async => conteudo;

  @override
  Future<void> gravar(String texto) async {
    gravacoes += 1;
    conteudo = texto;
  }
}

/// Um depósito que **estoura nas duas pontas**, para a isca do armazenamento
/// bloqueado.
///
/// Ele existe aqui, e não no arquivo de teste, por um motivo: o modo de falhar
/// que ele reproduz é o do aparelho de verdade, e deixá-lo ao lado da classe que
/// precisa sobreviver a ele é o que mantém as duas no mesmo campo de visão.
class DepositoDaCidadeQueFalha implements DepositoDaCidade {
  const DepositoDaCidadeQueFalha();

  @override
  Future<String?> ler() async =>
      throw const FileSystemException('armazenamento bloqueado');

  @override
  Future<void> gravar(String conteudo) async =>
      throw const FileSystemException('armazenamento bloqueado');
}

/// A cidade guardada, com toda falha engolida.
class CidadeEscolhida {
  CidadeEscolhida({DepositoDaCidade? deposito})
      : _deposito = deposito ?? DepositoDaCidadeEmArquivo();

  final DepositoDaCidade _deposito;

  /// O teto do contrato para `city` (`maxLength: 80`). Texto maior que isso no
  /// arquivo é lixo de uma versão que não existe, e não uma cidade.
  static const int limiteDeCaracteres = 80;

  /// A cidade guardada, ou nulo.
  ///
  /// **Nunca lança.** `on Object` e não `on Exception`: `MissingPluginException`
  /// é uma, mas um canal de plataforma ausente também produz `Error`, e um
  /// `catch` que só pega `Exception` deixaria o segundo passar.
  Future<String?> ler() async {
    try {
      final bruto = await _deposito.ler();
      final limpo = bruto?.trim();
      if (limpo == null || limpo.isEmpty) return null;
      if (limpo.length > limiteDeCaracteres) return null;
      return limpo;
    } on Object {
      return null;
    }
  }

  /// Guarda a cidade. **Nunca lança, e nunca espera ser esperada**: quem chama
  /// já tem a lista na tela, e uma gravação que falha não pode desfazer isso.
  Future<void> guardar(String cidade) async {
    final limpo = cidade.trim();
    if (limpo.isEmpty || limpo.length > limiteDeCaracteres) return;
    try {
      await _deposito.gravar(limpo);
    } on Object {
      // Nada a fazer e nada a dizer: a pessoa vai redigitar na próxima
      // abertura, que é o estado de quem nunca escolheu.
      return;
    }
  }
}
