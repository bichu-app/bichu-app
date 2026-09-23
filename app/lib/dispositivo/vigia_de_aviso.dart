/// O que o app faz quando a permissao de aviso muda **enquanto ele esta
/// aberto** (BICHUS-24).
///
/// ## O caso que este arquivo existe para cobrir
///
/// Permissao no aparelho e dialogo, e nao configuracao: a pessoa diz nao, e
/// depois muda de ideia nos ajustes do sistema, **sem abrir o app**. No caso
/// da notificacao esse e o unico caminho de volta que existe, porque o dialogo
/// do iOS nao e mostrado uma segunda vez -- e por isso o app oferece `Ligar
/// nos ajustes` em Perfil.
///
/// Oferecer o caminho e metade do trabalho. A outra metade e o que acontece
/// **depois** que a pessoa liga a chave e volta: ela volta com a permissao
/// concedida e um token de push que o servidor nunca viu. Sem alguem
/// reconciliando isso, `Ligar nos ajustes` vira um botao que leva a um lugar
/// onde a pessoa faz uma coisa que nao produz efeito nenhum -- e o efeito que
/// nao acontece e justamente o criterio 4 do ADR-0006, "tem ao menos um
/// aparelho com `push_permission = granted` e token valido". A pessoa ligou o
/// aviso e continua fora da base de alerta. Ninguem descobre, porque nada
/// falha: a tela nao muda, nenhuma chamada da erro, e o sintoma aparece
/// semanas depois como uma base de tutores que nao recebe nada.
///
/// ## Por que no ciclo de vida, e nao na tela
///
/// A pessoa sai para os ajustes a partir de Perfil, mas pode voltar para
/// qualquer lugar do app, e pode nem voltar para a tela de onde saiu. Uma
/// verificacao presa a uma tela cobre a tela, e o problema nao e da tela.
/// `AppLifecycleState.resumed` e o unico ponto que enxerga "a pessoa saiu do
/// app e voltou" independentemente de onde ela estava.
///
/// ## Por que isto NAO fere o criterio 1 ("nada na abertura do app")
///
/// Duas coisas diferentes: [Avisos.estado] **nao abre dialogo nenhum**, e
/// retomar nao e abrir. O observador so e chamado numa TRANSICAO para
/// `resumed`, e o arranque do app nao produz essa transicao -- o estado
/// inicial ja e `resumed` e o Flutter nao chama o observador para ele. A isca
/// de `antessala_de_aviso_test.dart` cobra `vezesQueConsultouEstado == 0` na
/// abertura, e ela continua valendo; o caso novo em
/// `permissao_muda_com_o_app_aberto_test.dart` cobra o outro lado.
library;

import 'dart:async';

import 'package:flutter/widgets.dart';

import '../api/devices_api.dart';
import '../api/falhas.dart';
import 'avisos.dart';

/// Observa o ciclo de vida e reconcilia a permissao de aviso na retomada.
///
/// E um [ChangeNotifier] porque a tela precisa saber: a linha de Perfil que
/// diz "Você não recebe aviso de pet perdido por perto" tem de sumir no
/// instante em que a pessoa volta dos ajustes com a chave ligada. Uma linha
/// que continuasse la depois disso diria a ela que nao funcionou.
class VigiaDeAviso extends ChangeNotifier with WidgetsBindingObserver {
  VigiaDeAviso({required this.avisos, required this.devices});

  final Avisos avisos;
  final DevicesApi devices;


  PermissaoDeAviso? _ultimoConhecido;

  /// O ultimo estado que o app viu, ou nulo enquanto ele nao viu nenhum.
  ///
  /// Nulo e o estado de quem abriu o app e ainda nao chegou a F1.6: o app nao
  /// encostou na permissao, e nao pode fingir que sabe.
  PermissaoDeAviso? get ultimoConhecido => _ultimoConhecido;

  /// `true` quando o app sabe que a pessoa recusou no dialogo do sistema.
  ///
  /// So `negada` conta. `naoPedida` **nao** e recusa: a pessoa nunca viu o
  /// dialogo, e dizer a ela que nao recebe aviso por perto sem nunca ter
  /// perguntado seria o app se desculpando por algo que ele mesmo escolheu
  /// nao fazer ainda.
  bool get negouOAviso => _ultimoConhecido == PermissaoDeAviso.negada;

  /// Registra o que o fluxo da antessala acabou de descobrir.
  ///
  /// Chamado pelo coordenador do pedido. Sem isto o vigia acharia, na primeira
  /// retomada, que TODO estado e novidade, e reenviaria um registro que acabou
  /// de sair.
  void anotar(PermissaoDeAviso permissao) {
    if (_ultimoConhecido == permissao) return;
    _ultimoConhecido = permissao;
    notifyListeners();
  }

  /// Esquece o que o app sabia e registra o aparelho de novo.
  ///
  /// **Chamado depois de TODO login bem-sucedido, e o motivo e o SEC-019.**
  ///
  /// "Sair de todos os aparelhos" passou a apagar a linha de `user_devices` de
  /// todos os aparelhos da conta, inclusive o de quem pediu. O servidor nao tem
  /// como poupar um: nao ha vinculo entre a linha e a familia de refresh, e um
  /// parametro de "nao apague este" seria preenchido por quem esta com o
  /// telefone roubado.
  ///
  /// Quem paga esse preco e este metodo. Sem ele, [reconciliar] nao re-registra
  /// nada: ela so age quando a permissao do sistema **mudou**, e sair de todos
  /// nao muda permissao nenhuma -- a do sistema operacional continua
  /// `concedida`, `_ultimoConhecido` continua `concedida`, e a comparacao
  /// `antes == agora` devolve na primeira linha. A pessoa entra de novo, ve o
  /// app funcionando, e fica sem alerta de pet perdido por tempo indeterminado,
  /// sem nenhum sinal. O registro so voltaria quando o processo do app fosse
  /// encerrado e reaberto, porque ai `_ultimoConhecido` nasce nulo.
  ///
  /// Trocar "o ladrao recebe alerta" por "a vitima nao recebe alerta" e o lado
  /// pior para um produto cuja funcao e avisar. Por isso este metodo zera o que
  /// o app sabia **antes** de reconciliar: com `_ultimoConhecido` nulo, a
  /// permissao concedida volta a ser novidade e o registro sai.
  ///
  /// Nao estoura: [reconciliar] ja trata a falta de rede e a falha do aparelho
  /// por dentro, e quem chama e um caminho de login que nao pode cair por causa
  /// de um registro de push.
  Future<void> esquecerEReconciliar() async {
    _ultimoConhecido = null;
    await reconciliar();
  }

  void ligar() => WidgetsBinding.instance.addObserver(this);

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) return;
    // `unawaited` de `dart:async`, e nao um `await` engolido: o ciclo de vida
    // nao tem como esperar, e a reconciliacao nao pode segurar a volta do app.
    // A falha e tratada dentro de `reconciliar`.
    unawaited(reconciliar());
  }

  /// Le o estado agora e, se ele mudou, refaz o registro do aparelho.
  ///
  /// Publico porque o teste precisa exercita-lo sem simular o sistema
  /// operacional inteiro, e porque uma tela pode ter motivo para pedir a
  /// reconciliacao na mao depois de mandar a pessoa aos ajustes.
  Future<void> reconciliar() async {
    final plataforma = avisos.plataforma;
    // Sem plataforma nao ha push neste processo. Registrar aqui poria na base
    // um aparelho que nunca vai receber nada, e a contagem de alcance mentiria
    // para cima -- que e o lado errado para uma metrica de alcance errar.
    if (plataforma == null) return;

    final PermissaoDeAviso agora;
    try {
      agora = await avisos.estado();
    } on Object {
      // O aparelho nao respondeu. Nao da para concluir nada, e concluir
      // errado aqui apagaria um token valido do servidor.
      return;
    }
    if (agora == PermissaoDeAviso.indisponivel) return;

    final antes = _ultimoConhecido;
    if (antes == agora) return;

    // Quando o app ainda nao sabia de nada, so `concedida` e `negada` valem um
    // registro. `naoPedida` nesse ponto e o estado de quem nem chegou a F1.6,
    // e registrar o aparelho dela aqui seria o app se antecipando ao fluxo que
    // decide isso -- alem de por na base um aparelho de alguem que ainda nem
    // tem pet.
    final novidadeQueValeRegistro = antes != null ||
        agora == PermissaoDeAviso.concedida ||
        agora == PermissaoDeAviso.negada;

    _ultimoConhecido = agora;
    notifyListeners();
    if (!novidadeQueValeRegistro) return;

    // O token sai junto, e e ele que fecha o criterio 4 do ADR-0006. No
    // caminho oposto -- permissao revogada nos ajustes -- o `null` explicito
    // e o que **apaga** no servidor o token que estava la; um campo ausente
    // deixaria o servidor mandando push para um aparelho que nao recebe mais.
    final token =
        agora == PermissaoDeAviso.concedida ? await avisos.token() : null;
    try {
      await devices.registrar(
        plataforma: plataforma,
        permissao: agora,
        pushToken: token,
      );
    } on FalhaDeChamada {
      // Sem rede agora. O estado local ja esta certo, e a proxima retomada
      // tenta de novo: `_ultimoConhecido` foi atualizado, entao volta a
      // divergir so se o aparelho mudar outra vez.
      //
      // O que NAO se faz aqui e mostrar erro: a pessoa acabou de voltar dos
      // ajustes e nao pediu nada ao app neste instante. O lugar onde a falha
      // de registro tem texto e o fluxo da antessala, onde ela pediu.
      debugPrint(
        'BICHU avisos: a permissao mudou para $agora e o registro do aparelho '
        'nao saiu. A proxima retomada com estado diferente tenta de novo.',
      );
    }
  }
}
