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
///
/// ## ANTES DE LIGAR ESTA FILA NO APP: ela precisa entrar em `limpezasAoSair`
///
/// Hoje `FilaOffline` existe em `lib/` e nos testes, e **nada no app a
/// instancia**. Quem for ligá-la tem uma obrigação que não é óbvia no código
/// desta classe:
///
/// A fila guarda **dado da conta em disco** — o corpo de cada ação carrega o
/// que a pessoa digitou: nome do pet, endereço de referência, telefone de
/// contato. Então ela tem de entrar na lista `limpezasAoSair` do
/// `ControladorDeSessao` (`sessao/controlador_de_sessao.dart`), que é o que o
/// `sair()` executa nos **quatro** desfechos de logout. O registro é uma linha
/// em `app.dart`, ao lado do cache de pets que já está lá.
///
/// Fila offline que sobrevive ao logout é dado de uma conta esperando a
/// próxima pessoa que entrar naquele aparelho — e o aparelho compartilhado é
/// caso real no público deste produto, não hipótese.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import 'api_client.dart';
import 'falhas.dart';

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

  /// As ações pendentes, **sem deixar um item ruim levar os outros junto**.
  ///
  /// ## O que estava errado (BICHUS-201, defeito 1)
  ///
  /// Este método decodificava a lista inteira numa expressão só, dentro de um
  /// `try`, e um `on FormatException` devolvia `[]`. O efeito era o oposto do
  /// propósito desta classe: **um** item malformado descartava a fila
  /// **inteira**, em silêncio. O alerta de pet sumido disparado no elevador
  /// saía junto com o item quebrado, e não ficava registro em lugar nenhum.
  ///
  /// A fila existe exatamente para isso não acontecer.
  ///
  /// ## Como ficou
  ///
  /// Duas falhas diferentes, tratadas diferente, porque são diferentes:
  ///
  /// - **O documento não é uma lista JSON.** Não há item nenhum a salvar, e aí
  ///   começar vazia continua sendo melhor que não abrir — a pessoa perderia o
  ///   acesso ao app inteiro por causa de um arquivo. Mas é um **evento**, e
  ///   sai pelo canal de erro, não por um `return []` calado.
  /// - **Um item da lista não se decodifica.** Descartado sozinho; os demais
  ///   sobrevivem. Também registrado, porque perda silenciosa é o que esta
  ///   issue existe para acabar.
  ///
  /// `on Object`, e não `on FormatException`: `AcaoEnfileirada.deJson` converte
  /// com `as String` e `as Map`, que levantam `TypeError`, não
  /// `FormatException`. O `catch` antigo deixava esses passarem direto e
  /// derrubar quem chamasse — ele nem cobria a classe que dizia cobrir.
  ///
  /// O item ruim **não é reescrito aqui**: `pendentes()` é leitura, e leitura
  /// que grava surpreende quem chama e pode falhar na abertura do app. Ele some
  /// do disco sozinho na próxima mutação, porque `_persistir` regrava a lista
  /// inteira a partir dos sobreviventes.
  Future<List<AcaoEnfileirada>> pendentes() async {
    final emMemoria = _memoria;
    if (emMemoria != null) return List.unmodifiable(emMemoria);

    final bruto = await _deposito.ler();
    if (bruto == null || bruto.isEmpty) {
      _memoria = <AcaoEnfileirada>[];
      return const <AcaoEnfileirada>[];
    }

    final List<dynamic> cru;
    try {
      cru = jsonDecode(bruto) as List<dynamic>;
    } on Object catch (erro, pilha) {
      _relatar(
        erro,
        pilha,
        'a fila offline inteira estava ilegível e foi descartada',
        <String, int>{'bytes_no_arquivo': bruto.length},
      );
      _memoria = <AcaoEnfileirada>[];
      return const <AcaoEnfileirada>[];
    }

    final sobreviventes = <AcaoEnfileirada>[];
    var descartados = 0;
    Object? primeiroErro;
    StackTrace? primeiraPilha;

    for (final bruta in cru) {
      try {
        sobreviventes
            .add(AcaoEnfileirada.deJson(Map<String, dynamic>.from(bruta as Map)));
      } on Object catch (erro, pilha) {
        descartados += 1;
        primeiroErro ??= erro;
        primeiraPilha ??= pilha;
      }
    }

    if (descartados > 0) {
      _relatar(
        primeiroErro ?? StateError('item malformado na fila offline'),
        primeiraPilha,
        'itens malformados descartados da fila offline; os demais foram mantidos',
        <String, int>{
          'descartados': descartados,
          'mantidos': sobreviventes.length,
          'itens_no_arquivo': cru.length,
        },
      );
    }

    _memoria = sobreviventes;
    return List.unmodifiable(sobreviventes);
  }

  /// Manda a perda para o canal que a observabilidade escuta (Sentry, ADR-0008).
  ///
  /// **Só contagem, nunca conteúdo.** O corpo de uma ação enfileirada carrega o
  /// que a pessoa digitou — nome do pet, endereço, telefone de contato — e isto
  /// aqui sai do aparelho. O que o operador precisa para agir é quantos itens
  /// sumiram e de que tipo era a falha, e nada disso identifica ninguém.
  void _relatar(
    Object erro,
    StackTrace? pilha,
    String oQueAconteceu,
    Map<String, int> numeros,
  ) {
    FlutterError.reportError(
      FlutterErrorDetails(
        exception: erro,
        stack: pilha,
        library: 'bichu/fila_offline',
        context: ErrorDescription('ao ler a fila offline do disco'),
        informationCollector: () => <DiagnosticsNode>[
          ErrorDescription(oQueAconteceu),
          for (final entrada in numeros.entries)
            ErrorDescription('${entrada.key}: ${entrada.value}'),
        ],
      ),
    );
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

  /// Apaga a fila inteira: **a entrada de `limpezasAoSair`** (BICHUS-21).
  ///
  /// Ela existe porque o cabeçalho desta classe cobrava uma obrigação que não
  /// tinha como ser cumprida: não havia método para limpar. Registrar um
  /// fecho que só zerasse a memória teria esvaziado a lista em pé e deixado o
  /// arquivo no disco — o pior dos dois mundos, porque a leitura seguinte o
  /// traria de volta e o logout teria *parecido* funcionar.
  ///
  /// Grava `[]` em vez de apagar o arquivo: o depósito é uma porta de duas
  /// operações (`ler`, `gravar`), e um terceiro método só para o logout
  /// obrigaria toda implementação futura a saber apagar. Lista vazia lê como
  /// lista vazia em qualquer depósito.
  ///
  /// **Zera a memória ANTES de gravar**, e não depois: se a gravação falhar —
  /// disco cheio, que é o aparelho deste público —, o que fica em pé é um app
  /// sem os dados da conta anterior em memória e um arquivo que a próxima
  /// gravação sobrescreve. A ordem inversa deixaria o nome do pet, o endereço
  /// de referência e o telefone da tutora anterior vivos na sessão seguinte.
  Future<void> limpar() async {
    _memoria = <AcaoEnfileirada>[];
    await _deposito.gravar('[]');
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

/// A varredura que DRENA a fila. O chamador que `reenviarTudo` nao tinha.
///
/// ## O defeito que esta classe existe para fechar
///
/// `FilaOffline.reenviarTudo` estava escrito, testado, e **sem nenhum call
/// site**. Duas telas enfileiravam de verdade -- `tela_alcance_do_alerta.dart`
/// (o caso de perdido) e `tela_registrar_achado.dart` (o achado avulso) -- e
/// nada nunca tirava nada de lá. O efeito: **caso registrado sem sinal ficava no
/// disco para sempre**, enquanto a tela dizia "vamos enviar assim que o sinal
/// voltar".
///
/// Era o pior formato de defeito que este produto consegue produzir. Nada
/// falhava: a tela prometia o certo, o arquivo era gravado corretamente, a
/// chave de idempotencia estava lá, e o método que resolveria tudo existia e
/// passava nos testes. A única evidência era um tutor cujo pet sumiu e cujo
/// alerta nunca saiu.
///
/// **Um teste que só verifique que `reenviarTudo` existe aprova esse defeito.**
/// A prova é o call site.
///
/// ## QUANDO a fila drena, e por que nos DOIS momentos
///
/// 1. **No arranque do app**, depois de a sessão ser lida do chaveiro.
/// 2. **Ao o app voltar para o primeiro plano** (`AppLifecycleState.resumed`).
///
/// Os dois, e não um: eles cobrem casos diferentes.
///
/// O arranque cobre o app que o sistema **matou** para liberar memória — que é
/// o que acontece com app em segundo plano num aparelho barato, e é o caso que
/// a fila em disco existe para atender. A retomada cobre o app que ficou vivo
/// no bolso enquanto a pessoa saía do elevador ou do metrô: sem ela, a fila só
/// drenaria quando o sistema resolvesse matar o processo, o que pode não
/// acontecer por dias.
///
/// **O que NÃO existe aqui é reagir ao sinal voltar.** Detectar mudança de
/// conectividade exige um pacote que este app não declara (`connectivity_plus`),
/// e a decisão de acrescentar dependência não é minha. A retomada é a
/// aproximação honesta: quem estava sem sinal e voltou a ter, na prática,
/// olha o telefone. E o caminho imediato continua existindo, e é o botão da
/// tela.
///
/// ## COMO ELA PARA, que é a pergunta que custa caro
///
/// Fila que reenvia em laço sem limite é o desfecho pior que o defeito: gasta
/// bateria, nunca avisa ninguém, e foi exatamente o buraco que deixou foto
/// presa em "processando" para sempre em outro lugar deste produto.
///
/// Ela para por **três mecanismos diferentes**, e nenhum deles é um contador de
/// tentativas:
///
/// - **Recusa permanente DESCARTA a ação.** `400`, `404`, `409`, `410`, `422`:
///   o servidor recusou, e tentar de novo não muda a resposta. A ação sai da
///   fila. É este ramo que garante que a fila esvazia em vez de circular.
/// - **Falha temporária PARA a varredura e MANTÉM a ação.** Sem rede, `5xx`,
///   `429`: as seguintes vão falhar igual, e insistir só gasta bateria. Nada é
///   descartado, e a próxima retomada tenta de novo.
/// - **`401` e `403` PARAM e MANTÊM.** Ver [_desfecho]: este é o ramo que, mal
///   escrito, apaga exatamente o que a fila existe para salvar.
///
/// O teto de 50 de [FilaOffline.teto] é a terceira defesa, e ela já existia: a
/// fila não cresce sem limite nem no aparelho que passa uma semana sem sinal.
class RetomadaDaFila {
  const RetomadaDaFila({required this.fila, required this.api});

  final FilaOffline fila;
  final ApiClient api;

  /// Drena a fila. Devolve quantas ações saíram de fato.
  ///
  /// **Nunca estoura**: ela é chamada do arranque do app e de um observador de
  /// ciclo de vida, dois lugares onde uma exceção não tem quem a pegue. Uma
  /// falha no meio vira o fim da varredura, e a próxima retomada recomeça.
  Future<int> drenar() async {
    try {
      return await fila.reenviarTudo(_enviar);
    } on Object {
      return 0;
    }
  }

  /// Reenvia UMA ação, com a chave da primeira tentativa.
  ///
  /// **`idempotencyKey: acao.idempotencyKey`, e nunca uma nova.** É a garantia
  /// inteira da fila: a mesma chave faz o servidor devolver a resposta original
  /// em vez de executar de novo. Gerar uma chave aqui faria o tutor receber o
  /// mesmo aviso a cada retomada do app, e o defeito só apareceria na caixa de
  /// entrada de quem está procurando o pet.
  Future<ResultadoDoEnvio> _enviar(AcaoEnfileirada acao) async {
    try {
      // Só `POST` entra na fila hoje (as duas telas que enfileiram registram
      // criações), e é por isso que o método é conferido em vez de assumido:
      // uma ação com outro verbo enviada como `POST` chegaria na rota errada, e
      // o servidor responderia 404 -- que este arquivo classificaria como
      // recusa permanente e DESCARTARIA. Ação que não sabemos enviar fica
      // guardada, e quem acrescentar o verbo acrescenta o ramo aqui.
      if (acao.metodo != 'POST') return ResultadoDoEnvio.semSinal;
      await api.post(
        acao.caminho,
        corpo: acao.corpo,
        idempotencyKey: acao.idempotencyKey,
      );
      return ResultadoDoEnvio.entregue;
    } on FalhaDeChamada catch (falha) {
      return _desfecho(falha);
    }
  }

  /// Traduz a falha em um dos três desfechos que a fila entende.
  ///
  /// ## O ramo que apaga o que a fila existe para salvar
  ///
  /// `401` e `403` **não** são recusa permanente aqui, e tratá-los como tal é o
  /// erro mais caro deste arquivo. As duas rotas que a fila carrega
  /// (`POST /pets/{petId}/lost-cases` e `POST /found-reports`) são
  /// `bearerAuth`: sem token elas respondem `401`. Se `401` descartasse, a
  /// primeira varredura de quem está deslogado — ou de quem teve o token
  /// expirado — apagaria em silêncio o caso do pet sumido que a pessoa abriu no
  /// elevador.
  ///
  /// É o mesmo buraco que `RetomadaDeFotos` documenta, e lá a defesa é a
  /// guarda de sessão antes da varredura. Aqui há **as duas**: a guarda no
  /// chamador, e este ramo. A guarda cobre o arranque; este ramo cobre o token
  /// que expira no meio da varredura, que a guarda não vê.
  static ResultadoDoEnvio _desfecho(FalhaDeChamada falha) {
    return switch (falha) {
      // Sem rede. Não conta tentativa, não descarta.
      FalhaDeConexao() => ResultadoDoEnvio.semSinal,
      // **A ação PODE ter acontecido no servidor.** É justamente para isto que
      // ela viaja com `Idempotency-Key`: o reenvio com a mesma chave devolve a
      // resposta original em vez de criar um segundo caso. Descartar aqui
      // perderia a ação que talvez não tenha saído; reenviar é seguro.
      FalhaDeTempo() => ResultadoDoEnvio.semSinal,
      // Nada saiu do aparelho: a requisição foi recusada antes de sair, porque
      // o endereço não era desta API. Não é caso de fila (a fila monta o
      // endereço a partir da configuração, não de um corpo de resposta), e não
      // é recusa do servidor -- mantém.
      FalhaDeEnderecoRecusado() => ResultadoDoEnvio.semSinal,
      FalhaDaApi(:final problem) => _desfechoDoStatus(problem.status),
    };
  }

  static ResultadoDoEnvio _desfechoDoStatus(int status) {
    // Sessão. Ver o cabeçalho de [_desfecho]: é o ramo que, invertido, apaga o
    // caso do pet sumido.
    if (status == 401 || status == 403) return ResultadoDoEnvio.semSinal;
    // Teto de chamada. Tem hora para voltar, e ela não é agora.
    if (status == 429) return ResultadoDoEnvio.semSinal;
    // Servidor fora, gateway ruim, indisponível. Temporário por definição.
    if (status >= 500) return ResultadoDoEnvio.semSinal;
    // **A RECUSA PERMANENTE, e é ela que faz a fila esvaziar.** `400` de corpo
    // inválido, `404` de pet que foi excluído, `409` de conflito, `410` de tag
    // revogada, `422` de regra de negócio: nenhum melhora com repetição.
    // Repetir para sempre uma recusa definitiva é um laço que gasta bateria e
    // nunca avisa ninguém.
    if (status >= 400) return ResultadoDoEnvio.recusada;
    // Não deveria chegar aqui: `FalhaDaApi` nasce de status fora de 2xx. Se
    // chegar, MANTÉM -- descartar por um status que não soubemos classificar é
    // perder trabalho da pessoa por uma falha nossa de leitura.
    return ResultadoDoEnvio.semSinal;
  }
}
