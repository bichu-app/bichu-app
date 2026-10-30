import 'package:flutter/material.dart';

/// **Arrastar a pagina para baixo refaz a busca.** Um lugar so, para o app
/// inteiro.
class ArrastarParaAtualizar extends StatelessWidget {
  /// A tela que **conhece a propria busca**: as que tem `Scaffold` e `ListView`
  /// proprios.
  const ArrastarParaAtualizar({
    required Future<void> Function() aoAtualizar,
    required this.child,
    super.key,
  }) : _fixa = aoAtualizar,
       _doSlot = null;

  /// A CASCA DAS CINCO SECOES, onde a busca chega **depois** e pode nao
  /// existir.
  const ArrastarParaAtualizar.doSlot({
    required RecargaDaSecao recarga,
    required this.child,
    super.key,
  }) : _doSlot = recarga,
       _fixa = null;

  /// A busca de quem a conhece na construcao.
  final Future<void> Function()? _fixa;

  /// A busca de quem a recebe depois, pelo slot.
  final RecargaDaSecao? _doSlot;

  /// O rolavel. Ver o item 3 do cabecalho.
  final Widget child;

  /// O que o leitor de tela anuncia no gesto.
  static const String rotulo = 'Atualizando a página';

  /// A busca de AGORA, resolvida no momento do gesto e nao no da construcao.
  Future<void> Function()? _buscaAtual() => _fixa ?? _doSlot?.value;

  @override
  Widget build(BuildContext context) {
    final ScrollBehavior heranca = ScrollConfiguration.of(context);
    return ScrollConfiguration(
      behavior: heranca.copyWith(
        physics: const AlwaysScrollableScrollPhysics()
            .applyTo(heranca.getScrollPhysics(context)),
      ),
      child: RefreshIndicator(
        notificationPredicate: (notificacao) =>
            _buscaAtual() != null &&
            defaultScrollNotificationPredicate(notificacao),
        onRefresh: () async {
          final busca = _buscaAtual();
          if (busca != null) await busca();
        },
        semanticsLabel: rotulo,
        child: child,
      ),
    );
  }
}

/// O caminho de quem **nao e dono da rolagem**: as cinco raizes de secao.
class SlotDeAtualizacao extends InheritedWidget {
  const SlotDeAtualizacao({
    required this.recarga,
    required super.child,
    super.key,
  });

  final RecargaDaSecao recarga;

  static SlotDeAtualizacao? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<SlotDeAtualizacao>();

  /// Publica (ou apaga) a busca, **sem reconstruir por valor igual**.
  void publicar(Future<void> Function()? nova) {
    if (recarga.descartada) return;
    if (recarga.value == nova) return;
    recarga.value = nova;
  }

  @override
  bool updateShouldNotify(SlotDeAtualizacao antigo) =>
      antigo.recarga != recarga;
}

/// A busca publicada, **com o proprio descarte observavel**.
class RecargaDaSecao extends ValueNotifier<Future<void> Function()?> {
  RecargaDaSecao() : super(null);

  bool _descartada = false;

  bool get descartada => _descartada;

  @override
  void dispose() {
    _descartada = true;
    super.dispose();
  }
}

/// O que um corpo de secao faz para ganhar o gesto: dizer qual e a busca.
mixin PublicaAAtualizacao<T extends StatefulWidget> on State<T> {
  SlotDeAtualizacao? _slot;

  /// A busca que o arrasto refaz.
  Future<void> aoArrastarParaAtualizar();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final slot = _slot = SlotDeAtualizacao.maybeOf(context);
    if (slot == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) slot.publicar(aoArrastarParaAtualizar);
    });
  }

  @override
  void dispose() {
    final slot = _slot;
    final Future<void> Function() minha = aoArrastarParaAtualizar;
    _slot = null;
    if (slot != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (slot.recarga.value == minha) slot.publicar(null);
      });
    }
    super.dispose();
  }
}
