/// As DUAS oportunidades de pedir a permissao de aviso, e o registro de quais
/// ja foram gastas (UX 10.1, BICHUS-24).
///
/// ## O buraco que este arquivo fecha
///
/// Ate aqui o app decidia mostrar a antessala olhando **so** para o estado da
/// permissao: `PermissaoDeAviso.naoPedida` abria a antessala, qualquer outro
/// valor nao abria. Isso cobre "nenhum dialogo repetido" e **nao cobre** "duas
/// oportunidades, nao uma terceira".
///
/// A diferenca aparece em quem toca em `Agora nao`: a permissao continua em
/// `naoPedida`, porque o dialogo do sistema nunca foi aberto -- e esse e o
/// desenho certo. So que `naoPedida` e a condicao que abre a antessala. Quem
/// recusasse a antessala e cadastrasse um segundo pet veria F1.6 abrir a
/// antessala de novo. E um terceiro pet, de novo. A frase "Duas oportunidades.
/// Nao uma terceira dentro do mesmo fluxo" nao tinha nada no codigo que a
/// sustentasse, e nenhum teste reprovava, porque o defeito **nao aparece no
/// primeiro pet** -- ele aparece no segundo, que nenhum caso montava.
///
/// ## Por que sao dois lugares nomeados, e nao um contador ate dois
///
/// `int vezesQueOfereci` daria duas antessalas em F1.6 (dois pets) e nenhuma
/// em F3.2. UX 10.4 e literal na tabela: a notificacao tem antessala em
/// **F1.6** e segunda chance em **F3.2, uma vez**. Sao dois momentos com um
/// tiro cada, e nao duas fichas gastaveis onde der. Um enum de dois valores diz
/// isso na assinatura; um inteiro deixa a regra na cabeca de quem chamou.
///
/// O limite de duas sai de graca: o conjunto tem dois elementos possiveis, e
/// uma terceira oportunidade precisaria de um valor novo no enum -- que e uma
/// mudanca deliberada, com nome e diff, e nao um efeito colateral.
///
/// ## Onde isto mora, e por que nao morre no logout
///
/// Em **disco**, no diretorio do app, pelo mesmo motivo do envelope de
/// intencao: o que nao sobrevive ao app ser encerrado nao serve aqui.
/// Memoria daria uma oportunidade nova a cada arranque, e "duas e nao mais"
/// viraria "duas por sessao de processo", que e o contrario da frase.
///
/// **E ele NAO entra em `limpezasAoSair`.** A lista existe para o que e da
/// CONTA: os termos aceitos, os pets em cache, a imagem do QR -- credencial e
/// dado de uma pessoa, que nao pode vazar para a proxima que entrar neste
/// aparelho. Isto aqui nao e da conta: e do **aparelho**.
///
/// O dialogo de notificacao do iOS e gasto uma vez por INSTALACAO, nao por
/// login. Se o registro morresse no logout, o tutor seguinte no mesmo aparelho
/// ganharia duas antessalas novas cujo botao `Sim` abriria um dialogo que o
/// sistema nao mostra mais -- exatamente o "botao que nao faz nada" que a porta
/// `Avisos` foi desenhada para impedir. Limpar aqui seria zelo aplicado ao
/// objeto errado.
///
/// O que de fato precisa morrer com a conta e o **consentimento** registrado
/// com a versao do texto da antessala (ressalva do refinamento de 17/09), e ele
/// e do servidor, nao deste arquivo. Ver a pergunta aberta na pauta.
///
/// A isca que segura esta decisao esta em
/// `test/dispositivo/oportunidades_de_aviso_test.dart`: ela reprova se alguem
/// acrescentar a limpeza a lista, e o motivo fica na mensagem de falha.
library;

import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// Os dois momentos em que o app pode oferecer o aviso, e so eles.
enum OportunidadeDeAviso {
  /// F1.6, logo depois de o QR do primeiro pet aparecer. "O primeiro instante
  /// em que a pessoa tem algo a perder" (UX 10.1).
  primeiroPetCadastrado('primeiro_pet_cadastrado'),

  /// F3.2, ao confirmar o primeiro caso de perdido. A segunda e ultima.
  primeiroCasoDePerdido('primeiro_caso_de_perdido');

  const OportunidadeDeAviso(this.noDisco);

  /// O nome gravado no arquivo.
  ///
  /// Escrito a mao, e nao `name` do enum: renomear o valor em Dart e uma
  /// refatoracao, e ela nao pode reabrir uma oportunidade que a pessoa ja
  /// gastou no aparelho dela. O arquivo e um contrato com o passado.
  final String noDisco;
}

/// Onde o registro mora entre uma abertura do app e a seguinte.
///
/// Abstrato **para o teste nao precisar de aparelho**:
/// `getApplicationDocumentsDirectory` e um canal de plataforma, e um teste de
/// widget que dependesse dele travaria num `Future` que nunca resolve.
abstract class DepositoDeOportunidades {
  Future<String?> ler();
  Future<void> gravar(String conteudo);
}

/// Implementacao em arquivo, no diretorio do app.
class DepositoDeOportunidadesEmArquivo implements DepositoDeOportunidades {
  DepositoDeOportunidadesEmArquivo({
    String nomeDoArquivo = 'oportunidades_de_aviso.json',
  }) : _nome = nomeDoArquivo;

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
    // Temporario e `rename`, como o envelope de intencao: `rename` e atomico
    // no sistema de arquivos. Escrever por cima deixaria um JSON pela metade
    // se o sistema encerrasse o app no meio -- e um JSON pela metade aqui e
    // lido como "nenhuma oportunidade gasta", que devolve a antessala a quem
    // ja a recusou.
    final temporario = File('${arquivo.path}.tmp');
    await temporario.writeAsString(conteudo, flush: true);
    await temporario.rename(arquivo.path);
  }
}

/// Deposito em memoria, para teste de widget.
///
/// Nao usar em producao: memoria nao sobrevive ao app ser encerrado, que e
/// metade da razao de este registro existir.
class DepositoDeOportunidadesEmMemoria implements DepositoDeOportunidades {
  DepositoDeOportunidadesEmMemoria({String? conteudoInicial})
      : _conteudo = conteudoInicial;

  String? _conteudo;

  /// Quantas vezes alguem gravou. O teste do logout le isto.
  int gravacoes = 0;

  @override
  Future<String?> ler() async => _conteudo;

  @override
  Future<void> gravar(String conteudo) async {
    gravacoes += 1;
    _conteudo = conteudo;
  }
}

/// Quais das duas oportunidades ja foram gastas neste aparelho.
class OportunidadesDeAviso {
  OportunidadesDeAviso({required this.deposito});

  /// Publico porque o nome privado exigiria um formal de inicializacao
  /// privado, que a linguagem nao permite em parametro nomeado -- e o
  /// resultado seria um `ignore:` de lint onde nao ha nada para ignorar.
  final DepositoDeOportunidades deposito;

  /// Cache de leitura. O arquivo e lido uma vez por processo; dali em diante a
  /// verdade esta aqui e no disco, gravados juntos.
  Set<OportunidadeDeAviso>? _gastas;

  /// O conjunto do que ja foi gasto.
  Future<Set<OportunidadeDeAviso>> gastas() async {
    final memoria = _gastas;
    if (memoria != null) return memoria;
    final lido = await _ler();
    _gastas = lido;
    return lido;
  }

  Future<Set<OportunidadeDeAviso>> _ler() async {
    final String? cru;
    try {
      cru = await deposito.ler();
    } on Object {
      // Disco que nao responde nao pode virar "nunca ofereci": isso
      // devolveria a antessala a quem ja a recusou. O lado seguro de uma
      // leitura que falhou e assumir que as duas ja foram gastas -- o app
      // fica calado, que e recuperavel pelos ajustes, em vez de insistente,
      // que nao e.
      return OportunidadeDeAviso.values.toSet();
    }
    if (cru == null || cru.isEmpty) return <OportunidadeDeAviso>{};
    try {
      final corpo = jsonDecode(cru);
      if (corpo is! Map<String, dynamic>) return <OportunidadeDeAviso>{};
      final lista = corpo['gastas'];
      if (lista is! List) return <OportunidadeDeAviso>{};
      final nomes = lista.whereType<String>().toSet();
      return OportunidadeDeAviso.values
          .where((o) => nomes.contains(o.noDisco))
          .toSet();
    } on FormatException {
      // JSON corrompido e o caso em que o `rename` atomico nao chegou a
      // acontecer. Zero gasto e o que o arquivo de fato diz: nao ha registro.
      return <OportunidadeDeAviso>{};
    }
  }

  /// `true` quando [qual] ainda nao foi oferecida neste aparelho.
  Future<bool> aindaCabe(OportunidadeDeAviso qual) async =>
      !(await gastas()).contains(qual);

  /// Marca [qual] como gasta, em memoria e em disco.
  ///
  /// **Gasta no momento em que a antessala e EXIBIDA**, e nao no da resposta.
  /// A oportunidade e a chance de convencer, e ela foi usada assim que a
  /// pessoa leu o texto: `Agora nao`, dispensar com o dedo e o botao de voltar
  /// consomem a mesma chance. Marcar so no `Sim` faria a recusa nao custar
  /// nada, e a antessala voltaria a cada pet novo -- que e o defeito que este
  /// arquivo existe para fechar.
  Future<void> gastar(OportunidadeDeAviso qual) async {
    final atuais = await gastas();
    if (atuais.contains(qual)) return;
    final novas = <OportunidadeDeAviso>{...atuais, qual};
    _gastas = novas;
    try {
      await deposito.gravar(
        jsonEncode(<String, dynamic>{
          'gastas': novas.map((o) => o.noDisco).toList(growable: false),
        }),
      );
    } on Object {
      // A gravacao falhou; a memoria ja tem o valor certo, entao esta execucao
      // do app respeita o limite. A proxima abertura volta a oferecer, e esse
      // e o lado seguro da falha: um arquivo que nao gravou nao pode derrubar
      // o cadastro do pet, que e o que a pessoa estava fazendo.
    }
  }
}
