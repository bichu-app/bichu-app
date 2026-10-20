/// O NUMERO DO SINO: um objeto, no app inteiro, que pergunta ao servidor
/// quantos avisos nao lidos a pessoa tem.
///
/// ---------------------------------------------------------------------------
/// ## Por que ele existe, e por que no `Escopo`
///
/// A rota (`GET /v1/me/notifications/count`) e a camada
/// ([NotificacoesApi.contar]) existiam desde 19/10 e **ninguem as chamava**: o
/// sino da barra de topo era montado com `naoLidas` nulo porque nao havia
/// objeto de contagem no app de onde ler um numero.
///
/// Ele mora no `Escopo`, como as outras camadas, e **nao dentro do sino**, e o
/// motivo e medido: os ramos visitados da casca ficam montados
/// (`IndexedStack`/`Offstage`), entao um sino que buscasse por conta propria
/// dispararia **uma chamada por secao visitada** -- cinco pedidos para desenhar
/// um numero, e cinco respostas chegando fora de ordem para o mesmo circulo.
/// Um objeto so tambem e o que permite a caixa de avisos derrubar o numero
/// quando ela abre: com uma contagem por sino, a caixa nao teria a quem falar.
///
/// ## A POLITICA DE ATUALIZACAO, por extenso
///
/// **Nao ha polling, e nao e esquecimento.** Este repositorio nao tem
/// temporizador de rede em lugar nenhum, e um aqui seria o primeiro: o custo e
/// uma chamada por intervalo em todo aparelho ligado, para um numero que
/// envelhece sem consequencia. O que ha sao QUATRO momentos, todos eventos que
/// o app ja observava:
///
///   1. **O arranque, atras da sessao** (`_arrancar` em `app.dart`). Sem ele o
///      numero nunca existe, e o sino volta a ser o espaco vazio de antes. A
///      guarda de sessao e a mesma de `_drenarAFila` e `_retomarAsFotos`: a
///      rota e `bearerAuth`, e chamar deslogado seria um 401 garantido no
///      arranque de quem nem tem conta.
///   2. **Depois de todo login** (`aoEntrar` do `ControladorDeSessao`). Mora
///      ali, e nao no `onPressed` da tela de entrar, pela razao que o proprio
///      `AoEntrar` escreve: sao quatro caminhos de login hoje e nada garante
///      que o quinto lembre.
///   3. **A volta ao primeiro plano** (`didChangeAppLifecycleState`). **E o
///      momento que faz o sino valer a pena**, e deixar de fora seria entregar
///      a metade errada: o caso para o qual este contador existe e o aviso que
///      chegou com o app no bolso -- a pessoa toca no push, o app RETOMA (nao
///      arranca: o processo esta vivo), e sem este momento o sino lhe mostra o
///      numero do arranque, que e de horas atras. Mostrar o numero velho
///      justamente quando ha novidade e pior que nao mostrar numero.
///      Precedente no proprio app: `VigiaDeAviso` reconcilia a permissao e
///      `app.dart` drena a fila offline, as duas em `resumed`.
///   4. **A caixa de avisos foi aberta e o servidor confirmou** (ver
///      [zerarPorqueAListaFoiVista]).
///
/// **O que NAO esta decidido e esta com o cliente** (`.jarvis/
/// DECISOES-PARA-19-10.md`, perguntas 1 a 3): um intervalo minimo entre duas
/// retomadas, se um push que chega com o app ABERTO deve somar na hora, e se
/// fechar a caixa deve reconferir. Os tres sao ADITIVOS -- o contador funciona
/// sem nenhum deles --, e por isso nenhum foi inventado aqui.
///
/// ## Falha de rede NAO vira numero
///
/// [atualizar] que quebra **mantem o valor anterior**, ou o nulo de quem nunca
/// contou. Nunca zero. Zero e a afirmacao "voce nao tem aviso nenhum", e o
/// elevador sem sinal nao autoriza ninguem a dize-la -- seria esconder, de quem
/// tem trinta avisos, que eles existem. E a mesma regra que
/// `caixa_de_notificacoes.dart` segue ao recusar virar lista vazia na falha, e
/// a mesma que `notificacoes_api.dart` escreve ao proibir somar `read` no
/// aparelho: **o numero certo e o que o servidor sabe**, e duas contas feitas
/// no aparelho divergem entre dois aparelhos da mesma pessoa.
///
/// ## O numero e da CONTA, e sai no logout
///
/// [limpar] esta em `limpezasAoSair`, pela mesma razao de `AvisoDeCadastro` e
/// `CacheDeMeusPets`: sem ela o tutor seguinte neste aparelho abriria o app com
/// o `3` da pessoa anterior no sino -- e tocaria nele para ver avisos que nao
/// sao dele.
library;

import 'package:flutter/foundation.dart';

import '../api/falhas.dart';
import '../api/modelos_notificacao.dart';
import '../api/notificacoes_api.dart';

/// Quantos avisos nao lidos, segundo o servidor. Ver a doc do arquivo.
class ContadorDeAvisos extends ChangeNotifier {
  ContadorDeAvisos({required NotificacoesApi notificacoes})
      : _api = notificacoes;

  final NotificacoesApi _api;

  int? _naoLidas;

  /// Qual numero cada geracao esta autorizada a publicar. Ver [atualizar].
  int _geracao = 0;

  /// Se o objeto ja foi descartado. Ver [_publicar].
  bool _descartado = false;

  /// Quantos nao lidos, ou **nulo enquanto ninguem contou**.
  ///
  /// **Nulo nao e zero**, e a distincao e a razao de o tipo ser anulavel: nulo
  /// e "o app ainda nao sabe" e o sino nao pinta distintivo nenhum; zero e "o
  /// servidor disse que nao ha nada". Colapsar os dois faria o sino afirmar
  /// caixa vazia no instante entre abrir o app e a primeira resposta chegar.
  int? get naoLidas => _naoLidas;

  /// Pergunta ao servidor e publica. Ver os quatro momentos na doc do arquivo.
  ///
  /// **Nao estoura.** Quem chama sao ciclo de vida e pos-login, e nenhum dos
  /// dois tem tela para mostrar erro: a pessoa nao pediu este numero neste
  /// instante. A falha fica no valor que NAO mudou.
  Future<void> atualizar() async {
    // A GERACAO, e o caso que ela cobre e o LOGOUT -- nao a corrida de dois
    // numeros parecidos.
    //
    // `sair()` roda `limpar()` enquanto uma busca disparada pela retomada pode
    // estar no ar. Sem esta trava, a resposta chegaria DEPOIS da limpeza e
    // repintaria no sino o numero de quem acabou de sair -- e a proxima pessoa
    // a entrar neste aparelho veria o `3` da anterior, que e exatamente o que
    // `limpezasAoSair` existe para impedir. O mesmo vale para duas retomadas
    // encavaladas: publica a ultima que COMECOU, e nao a ultima que chegou.
    final minhaGeracao = ++_geracao;
    final ContagemDeAvisos contagem;
    try {
      contagem = await _api.contar();
    } on FalhaDeChamada {
      // Sem rede, ou o servidor recusou. **Mantem o anterior**, que pode ser
      // nulo. Ver "Falha de rede NAO vira numero" na doc do arquivo.
      return;
    } on FormatException {
      // Corpo 200 fora do contrato (`unread_total` ausente ou nao inteiro).
      // E falha de leitura, e nao contagem zero. `ContagemDeAvisos.doJson`
      // estoura ISTO e nao `TypeError` -- ver a doc de la, escrita depois de o
      // `as int` cru derrubar o arranque de 55 casos da suite.
      return;
    } on Object catch (erro, pilha) {
      // **O CINTO, e ele e sobre o ARRANQUE.** `_contarOsAvisos` e aguardado
      // em `_arrancar`, e a retomada o chama por `unawaited`: qualquer coisa
      // que escapasse daqui derrubaria a fila de arranque do app, ou viraria
      // erro assincrono sem dono -- por causa do numero de um distintivo.
      //
      // Vai para o canal da observabilidade (ADR-0008) e nao para o console:
      // se um deploy mudar este corpo, isso precisa chegar a quem opera. O
      // numero continua no valor anterior.
      registrarFalhaInesperada(erro, pilha, onde: 'ao contar os avisos');
      return;
    }
    if (minhaGeracao != _geracao) return;
    _publicar(contagem.naoLidos);
  }

  /// A caixa foi aberta **e o servidor confirmou** `markNotificationsListSeen`.
  ///
  /// **Isto nao e inventar zero, e e a diferenca que importa.** Aquela operacao
  /// zera o contador no servidor (e nao marca item nenhum -- ver
  /// `notificacoes_api.dart`). Quando ela responde `204`, a contagem do
  /// servidor E zero, e publicar zero aqui e REPETIR o que o servidor acabou de
  /// dizer, nao adivinhar.
  ///
  /// Por isso quem chama e so o caminho de sucesso de `_marcarListaVista` na
  /// caixa. **Quando ela falha, o numero fica onde estava**: o servidor
  /// continua com ele, e a proxima [atualizar] o traz de volta. Um sino que
  /// zerasse ali mentiria ate o app ser reaberto -- e a pessoa perderia os
  /// avisos justamente porque abriu a caixa num lugar sem sinal.
  ///
  /// **Nao chama a rede.** Esperar uma segunda resposta para apagar um
  /// distintivo que a pessoa acabou de resolver deixaria o numero piscando
  /// atras da tela que ela ja abriu.
  void zerarPorqueAListaFoiVista() {
    // A geracao avanca junto: uma busca no ar comecou ANTES de a caixa ser
    // vista, e o numero dela ja nasceu velho. Sem esta linha ela chegaria
    // depois e reacenderia o distintivo que a pessoa acabou de limpar.
    _geracao++;
    _publicar(0);
  }

  /// Esquece o numero: ele e da CONTA. Em `limpezasAoSair`.
  ///
  /// Volta a NULO, e nao a zero: zero diria a quem entrar neste aparelho que
  /// nao ha aviso nenhum na conta DELA, sobre uma conta que o app nunca
  /// consultou.
  void limpar() {
    _geracao++;
    _publicar(null);
  }

  @override
  void dispose() {
    _descartado = true;
    super.dispose();
  }

  void _publicar(int? valor) {
    // **A GUARDA DE DESCARTE, e ela e sobre a SUITE antes de ser sobre o
    // app.** Uma busca pode estar no ar quando o objeto e descartado -- em
    // producao no `dispose` do app, e em teste a cada `pumpWidget`, que
    // descarta o app anterior e deixa a resposta dele chegando. `ChangeNotifier`
    // estoura `A ContadorDeAvisos was used after being disposed` em
    // `notifyListeners` depois do descarte, e o erro cairia dentro de um
    // `Future` sem dono: reprovaria um caso que nao fala de notificacao
    // nenhuma, de forma intermitente, apontando para a causa errada.
    if (_descartado) return;
    if (_naoLidas == valor) return;
    _naoLidas = valor;
    notifyListeners();
  }
}
