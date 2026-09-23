/// As fotos escolhidas que ainda nao subiram (BICHUS-87, criterios 6 e 7).
///
/// ## Por que isto NAO e a `FilaOffline`, e por que nao virou uma
///
/// A fila da BICHUS-31 existe e esta ligada, e a primeira pergunta ao escrever
/// isto foi se o envio de foto cabia nela. **Nao cabe**, por tres razoes que
/// sao do formato dela e nao de preguica de quem escreveu:
///
/// 1. **`AcaoEnfileirada.corpo` e um `Map` serializado com `jsonEncode`.**
///    Bytes de imagem nao sao JSON. Em base64 uma foto de 400 kB vira 540 kB
///    de texto, e o teto da fila e de 50 itens: seria o armazenamento do
///    aparelho de quem ja esta com o telefone cheio.
/// 2. **`caminho` e, por decisao escrita na propria classe, relativo a `/v1`,
///    "nunca a URL inteira".** O envio dos bytes nao vai para a nossa API: vai
///    para o endereco que o servidor assina, em outro host, diferente a cada
///    envio. Nao ha caminho relativo que o represente.
/// 3. **`reenviarTudo` repete requisicoes independentes.** O envio de foto e
///    uma cadeia de tres passos em que o dado flui de um para o outro: o
///    `upload_id` do primeiro decide o terceiro, e o endereco do segundo sai do
///    primeiro. E a autorizacao vale **10 minutos**, entao a do momento em que
///    a fila gravou ja venceu quando ela reenviar.
///
/// Forcar o envio de foto dentro daquele formato -- um `corpo` que carrega
/// caminho de arquivo local em vez do corpo da requisicao -- seria contornar a
/// fila, e nao consumi-la. O que fica aqui e outra coisa, e ela e pequena de
/// proposito: **um registro de qual arquivo local pertence a qual pet**. Os
/// bytes continuam onde o seletor os deixou; o que se guarda e o endereco
/// deles no aparelho.
///
/// ## Isto e dado pessoal no aparelho, e entra em `limpezasAoSair`
///
/// O caminho de um arquivo no diretorio do app e, junto com ele, a foto do
/// animal de uma pessoa. Sobrevivendo ao logout, ela espera no aparelho a
/// proxima pessoa que entrar nele -- e aparelho compartilhado e caso real no
/// publico deste produto, nao hipotese. A entrada esta registrada em
/// `limpezasAoSair` no `app.dart`, ao lado da fila offline, e
/// `test/api/fotos_pendentes_test.dart` reprova se ela sair de la.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import '../dispositivo/camera_e_galeria.dart';
import 'envio_de_foto.dart';

/// Uma foto escolhida, ainda no aparelho, esperando sinal.
class FotoPendente {
  const FotoPendente({
    required this.petId,
    required this.foto,
    required this.criadaEm,
  });

  final String petId;
  final FotoLocal foto;
  final DateTime criadaEm;

  Map<String, dynamic> paraJson() => <String, dynamic>{
        'pet_id': petId,
        'caminho': foto.caminho,
        'tipo_de_conteudo': foto.tipoDeConteudo,
        'tamanho_em_bytes': foto.tamanhoEmBytes,
        'criada_em': criadaEm.toIso8601String(),
      };

  static FotoPendente deJson(Map<String, dynamic> json) => FotoPendente(
        petId: json['pet_id'] as String,
        foto: FotoLocal(
          caminho: json['caminho'] as String,
          tipoDeConteudo: json['tipo_de_conteudo'] as String,
          tamanhoEmBytes: json['tamanho_em_bytes'] as int,
        ),
        criadaEm: DateTime.parse(json['criada_em'] as String),
      );
}

/// Onde o registro mora. Separado para o teste nao precisar de aparelho.
abstract class DepositoDeFotosPendentes {
  Future<String?> ler();
  Future<void> gravar(String conteudo);
}

/// Implementacao em arquivo, no diretorio do app.
class DepositoDeFotosEmArquivo implements DepositoDeFotosPendentes {
  DepositoDeFotosEmArquivo({String nomeDoArquivo = 'fotos_pendentes.json'})
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
    // Grava num temporario e renomeia, como a fila offline: `rename` e atomico
    // no sistema de arquivos, e escrever por cima deixaria um JSON pela metade
    // se o sistema encerrasse o app no meio.
    final temporario = File('${arquivo.path}.tmp');
    await temporario.writeAsString(conteudo, flush: true);
    await temporario.rename(arquivo.path);
  }
}

/// O registro das fotos que ainda nao subiram.
class FotosPendentes {
  FotosPendentes({required this.deposito});

  final DepositoDeFotosPendentes deposito;
  List<FotoPendente>? _memoria;

  /// Acima disso, a mais antiga sai para a nova entrar. Mesmo motivo do teto
  /// da fila offline: o aparelho que passa uma semana sem sinal.
  static const int teto = 20;

  /// As pendentes, **sem deixar um item ruim levar os outros junto**.
  ///
  /// A mesma regra da `FilaOffline`, e pelo mesmo motivo: ate a BICHUS-201
  /// aquela classe decodificava a lista inteira num `try` so, e um item
  /// malformado descartava tudo em silencio. Escrever o mesmo defeito de novo
  /// aqui seria repeti-lo por copia.
  Future<List<FotoPendente>> pendentes() async {
    final emMemoria = _memoria;
    if (emMemoria != null) return List.unmodifiable(emMemoria);

    final bruto = await deposito.ler();
    if (bruto == null || bruto.isEmpty) {
      _memoria = <FotoPendente>[];
      return const <FotoPendente>[];
    }

    final List<dynamic> cru;
    try {
      cru = jsonDecode(bruto) as List<dynamic>;
    } on Object catch (erro, pilha) {
      _relatar(erro, pilha, 'o registro de fotos pendentes estava ilegivel');
      _memoria = <FotoPendente>[];
      return const <FotoPendente>[];
    }

    final sobreviventes = <FotoPendente>[];
    var descartados = 0;
    Object? primeiroErro;
    StackTrace? primeiraPilha;
    for (final bruta in cru) {
      try {
        sobreviventes
            .add(FotoPendente.deJson(Map<String, dynamic>.from(bruta as Map)));
      } on Object catch (erro, pilha) {
        descartados += 1;
        primeiroErro ??= erro;
        primeiraPilha ??= pilha;
      }
    }
    if (descartados > 0) {
      _relatar(
        primeiroErro ?? StateError('item malformado'),
        primeiraPilha,
        'itens malformados descartados do registro de fotos pendentes; '
        '$descartados de ${cru.length}',
      );
    }

    _memoria = sobreviventes;
    return List.unmodifiable(sobreviventes);
  }

  /// **So contagem, nunca conteudo.** O caminho do arquivo identifica o
  /// aparelho e a pessoa, e isto aqui sai do aparelho.
  void _relatar(Object erro, StackTrace? pilha, String oQueAconteceu) {
    FlutterError.reportError(
      FlutterErrorDetails(
        exception: erro,
        stack: pilha,
        library: 'bichu/fotos_pendentes',
        context: ErrorDescription('ao ler o registro de fotos pendentes'),
        informationCollector: () => <DiagnosticsNode>[
          ErrorDescription(oQueAconteceu),
        ],
      ),
    );
  }

  /// Guarda a foto que nao subiu. **Uma por pet**: uma segunda escolha para o
  /// mesmo pet substitui a anterior em vez de somar, porque a anterior foi
  /// trocada de proposito e subir as duas daria ao pet duas fotos que a pessoa
  /// nao pediu.
  Future<void> guardar(FotoPendente nova) async {
    final atual = List<FotoPendente>.from(await pendentes())
      ..removeWhere((f) => f.petId == nova.petId)
      ..add(nova);
    while (atual.length > teto) {
      atual.removeAt(0);
    }
    await _persistir(atual);
  }

  Future<void> remover(String petId) async {
    final atual = List<FotoPendente>.from(await pendentes())
      ..removeWhere((f) => f.petId == petId);
    await _persistir(atual);
  }

  /// Apaga o registro inteiro: **a entrada de `limpezasAoSair`**.
  ///
  /// Grava `[]` em vez de apagar o arquivo, como a fila offline: o deposito e
  /// uma porta de duas operacoes, e um terceiro metodo so para o logout
  /// obrigaria toda implementacao futura a saber apagar.
  ///
  /// **Zera a memoria ANTES de gravar.** Se a gravacao falhar -- disco cheio,
  /// que e o aparelho deste publico --, o que fica em pe e um app sem o dado da
  /// conta anterior em memoria e um arquivo que a proxima gravacao
  /// sobrescreve. A ordem inversa deixaria o caminho da foto da tutora
  /// anterior vivo na sessao seguinte.
  Future<void> limpar() async {
    _memoria = <FotoPendente>[];
    await deposito.gravar('[]');
  }

  Future<void> _persistir(List<FotoPendente> lista) async {
    _memoria = lista;
    await deposito.gravar(jsonEncode(lista.map((f) => f.paraJson()).toList()));
  }
}

/// Quem junta o mecanismo de envio ao registro do que ficou pendente.
///
/// **Existe para o `guardar`/`remover` morar num lugar so.** F1.6 envia quando
/// o pet nasce, o arranque do app varre o que ficou, e o botao `Tentar agora`
/// tenta de novo: tres chamadores para a mesma regra de "subiu, esquece; nao
/// subiu por falta de sinal, lembra". Escrita em cada um deles, ela divergiria
/// no primeiro que esquecesse o `remover`, e o sintoma seria a foto subindo
/// duas vezes.
class RetomadaDeFotos {
  const RetomadaDeFotos({
    required this.envio,
    required this.registro,
    required this.pets,
  });

  final EnvioDeFoto envio;
  final FotosPendentes registro;
  final IntencaoEConfirmacaoDePet pets;

  /// Envia a foto do pet e decide o que lembrar.
  ///
  /// - [DesfechoDoEnvio.enviada]: sai do registro. Nao ha o que retomar.
  /// - [DesfechoDoEnvio.semSinal]: **entra** no registro. E o criterio 6 da
  ///   BICHUS-87 -- "o arquivo permanece no disco do aparelho" -- e o que
  ///   torna verdadeira a frase da tela de que ela sobe depois.
  /// - [DesfechoDoEnvio.recusada]: sai do registro. Tipo fora da lista,
  ///   tamanho acima do teto e arquivo que sumiu nao melhoram com repeticao, e
  ///   retentativa infinita de uma recusa definitiva e um laco que gasta
  ///   bateria e nunca avisa ninguem (criterio 19 da BICHUS-87).
  Future<DesfechoDoEnvio> enviarDoPet({
    required String petId,
    required FotoLocal foto,
    DateTime? agora,
  }) async {
    final desfecho = await envio.enviar(
      foto: foto,
      destino: FotoDePet(api: pets, petId: petId),
    );
    if (desfecho == DesfechoDoEnvio.semSinal) {
      await registro.guardar(
        FotoPendente(
          petId: petId,
          foto: foto,
          // A hora do aparelho, que e a unica que existe sem rede.
          criadaEm: agora ?? DateTime.now(),
        ),
      );
    } else {
      await registro.remover(petId);
    }
    return desfecho;
  }

  /// A varredura do arranque: o criterio 7 da BICHUS-87, "o upload sai quando
  /// o sinal voltar".
  ///
  /// **O LIMITE, dito por extenso:** ela roda quando o app abre com sessao, e
  /// nao no instante em que o sinal volta com o app aberto. Reagir a mudanca
  /// de conectividade exige um pacote que este app nao declara, e trabalho de
  /// rede em segundo plano tem orcamento restrito do sistema operacional: o
  /// que precisa terminar com o app fechado e trabalho do servidor, nao do
  /// aparelho. O caminho imediato existe e e o botao da tela.
  ///
  /// **Para na primeira sem sinal.** Se a rede caiu, as seguintes vao falhar
  /// igual, e insistir so gasta bateria -- a mesma regra de
  /// `FilaOffline.reenviarTudo`.
  Future<int> retomarTudo() async {
    var enviadas = 0;
    for (final pendente in await registro.pendentes()) {
      final desfecho = await envio.enviar(
        foto: pendente.foto,
        destino: FotoDePet(api: pets, petId: pendente.petId),
      );
      if (desfecho == DesfechoDoEnvio.semSinal) break;
      await registro.remover(pendente.petId);
      if (desfecho == DesfechoDoEnvio.enviada) enviadas += 1;
    }
    return enviadas;
  }
}
