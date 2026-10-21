import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// A barra de ferramentas do teclado: `Concluir` e as setas de travessia.
///
/// ## Por que ela existe, e para quais campos
///
/// **Num campo de texto corrido nao existe tecla que feche o teclado.** Campo
/// com mais de uma linha vira `TextInputType.multiline` no Flutter, e com
/// `multiline` a tecla de retorno **insere linha** -- nao ha `Concluir` a
/// declarar, porque `TextInputAction.newline` e o desfecho certo para quem
/// esta escrevendo um paragrafo. Levantado em 20/10/2026 sobre a arvore
/// inteira: **16 dos 65 campos** do app sao assim.
///
/// Junte a isso que o Flutter recusa o toque fora no telefone (consertado em
/// `bichu_field.dart`) e que a barra de acao ficava atras do teclado
/// (consertado em `barra_de_acao_fixa.dart`), e o resultado medido era **7 das
/// 22 telas** com campo em que o teclado subia e nao descia. No Android o
/// botao voltar salvava a pessoa; **no iOS nao ha equivalente**, e e por isso
/// que o cliente relatou o defeito como sendo do iOS.
///
/// **E o que ele pediu, com as palavras dele** (20/10/2026): *"em alguns
/// outros aplicativos, vem um icone de certo nativo no proprio teclado, que
/// permite com que o usuario feche o teclado nativo do celular"*. Esta e a
/// faixa acima do teclado que o iOS garante -- o unico lugar em que um
/// controle fica sempre visivel com o teclado aberto.
///
/// ## Ela NAO aparece em campo de uma linha, e isso e decisao
///
/// Campo de uma linha ja tem desfecho: `TextInputAction.done` desenha a tecla
/// de certo no proprio teclado do sistema, e `next` desenha a flecha de
/// avancar. Oferecer as duas coisas seria dois controles para a mesma acao, um
/// deles roubando 48 dp de altura util de quem nao precisa dele. Ha
/// contrapeso medindo essa ausencia.
class BarraDoTeclado extends StatelessWidget {
  const BarraDoTeclado({required this.aoConcluir, super.key});

  /// Fecha o teclado. Recebido de fora para esta barra nao decidir sozinha o
  /// que e o foco da tela.
  final VoidCallback aoConcluir;

  /// A altura da faixa, e o que [BarraDeAcaoFixa] reserva por cima dela.
  ///
  /// E o piso de alvo de toque do design system, e nao um numero escolhido:
  /// os tres controles daqui sao alvos, e alvo abaixo do piso reprova no
  /// portao de acessibilidade.
  static const double altura = BichuAlvoDeToque.min;

  /// Quanto a faixa RESERVA enquanto um campo de texto corrido tem o foco, ou
  /// zero.
  ///
  /// **Existe uma so, porque existe um teclado so.** Quem desenha a barra de
  /// acao do rodape le este valor para se empilhar ACIMA da faixa, em vez de
  /// ficar atras dela -- sem isto, consertar o teclado cobrindo o `Salvar`
  /// produziria a faixa cobrindo o `Salvar`, que e o mesmo defeito com outro
  /// nome.
  ///
  /// **Ele diz "ha campo de texto corrido focado", e nao "ha faixa
  /// desenhada".** A faixa so aparece com o teclado na tela, e quem consome
  /// este valor confere `viewInsets.bottom` do proprio lado -- os dois lados
  /// gastam a mesma condicao, em vez de este valor ser escrito durante o
  /// `build` de alguem.
  static final ValueNotifier<double> alturaEmUso = ValueNotifier<double>(0);

  static const String rotuloConcluir = 'Concluir';
  static const String rotuloAnterior = 'Campo anterior';
  static const String rotuloProximo = 'Próximo campo';

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;

    return Material(
      color: cores.surfaceSunken,
      child: SizedBox(
        height: altura,
        child: Row(
          children: <Widget>[
            // AS SETAS VEM PRIMEIRO, e `Concluir` fica na borda oposta: e a
            // ordem do acessorio do iOS, e e a que poe a acao que ENCERRA
            // longe das duas que apenas navegam.
            IconButton(
              icon: const Icon(Icons.keyboard_arrow_up),
              tooltip: rotuloAnterior,
              onPressed: () => FocusManager.instance.primaryFocus?.previousFocus(),
            ),
            IconButton(
              icon: const Icon(Icons.keyboard_arrow_down),
              tooltip: rotuloProximo,
              onPressed: () => FocusManager.instance.primaryFocus?.nextFocus(),
            ),
            const Spacer(),
            Padding(
              padding: const EdgeInsets.only(right: BichuEspaco.e2),
              child: TextButton(
                onPressed: aoConcluir,
                child: const Text(rotuloConcluir),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Mostra a [BarraDoTeclado] enquanto o campo de texto corrido que ele embala
/// estiver com o foco.
///
/// **Por que num `Overlay`, e nao ao lado do campo.** A faixa precisa ficar
/// encostada no topo do teclado, e o corpo da tela termina ACIMA do teclado
/// (o `Scaffold` encolhe o corpo com `resizeToAvoidBottomInset`). Desenhada
/// dentro da lista, ela rolaria junto com o conteudo e sairia da tela -- que e
/// exatamente o que nao pode acontecer com o unico controle que fecha o
/// teclado.
///
/// **Por que `Focus` com `canRequestFocus: false`.** Este widget nao e um
/// alvo de foco: ele apenas OBSERVA o campo que vive dentro dele. Um no de
/// `Focus` reporta `hasFocus` quando qualquer descendente tem o foco, e e por
/// isso que nao e preciso passar um `FocusNode` por fora -- os 62 campos do
/// app chamam `BichuField` sem `foco`, e o `TextField` cria o dele por dentro.
class AcessorioDeTextoCorrido extends StatefulWidget {
  const AcessorioDeTextoCorrido({required this.child, super.key});

  final Widget child;

  @override
  State<AcessorioDeTextoCorrido> createState() =>
      _AcessorioDeTextoCorridoState();
}

class _AcessorioDeTextoCorridoState extends State<AcessorioDeTextoCorrido> {
  OverlayEntry? _faixa;

  @override
  void dispose() {
    // ANTES de `super.dispose()`, e sem esperar quadro nenhum: a tela pode
    // estar saindo da pilha com o campo ainda focado, e uma entrada de
    // `Overlay` que sobrevive a propria tela fica desenhada sobre a seguinte.
    _esconder();
    super.dispose();
  }

  void _mostrar() {
    if (_faixa != null) return;
    final overlay = Overlay.maybeOf(context);
    if (overlay == null) return;
    final entrada = OverlayEntry(
      builder: (contexto) {
        final double teclado = MediaQuery.viewInsetsOf(contexto).bottom;
        // SEM TECLADO NA TELA, SEM FAIXA, e isto nao e detalhe: foco e teclado
        // aberto nao sao a mesma coisa.
        //
        // **Medido em 20/10/2026**, e por reprovacao: sem esta guarda a faixa
        // se encosta em `bottom: 0` -- o chao da tela -- e cobre o que estiver
        // ali. O caso `comentar manda o texto no corpo` do mural reprovou
        // exatamente assim: o `Comentar` da folha de comentario ficou atras da
        // faixa (o `_RenderTheater` do `Overlay` aparecendo no resultado do
        // teste de toque), porque o campo de comentario tem `linhas: 2` e o
        // teste nao levanta o teclado. No aparelho o estado existe tambem:
        // campo focado com teclado fisico ligado, e o quadro entre o foco e o
        // teclado subir.
        if (teclado <= 0) return const SizedBox.shrink();
        return Positioned(
          left: 0,
          right: 0,
          // Encostada no topo do teclado. `viewInsetsOf` e lido no `builder`,
          // entao a faixa acompanha a animacao do teclado quadro a quadro.
          bottom: teclado,
          child: BarraDoTeclado(
            aoConcluir: () => FocusManager.instance.primaryFocus?.unfocus(),
          ),
        );
      },
    );
    _faixa = entrada;
    overlay.insert(entrada);
    BarraDoTeclado.alturaEmUso.value = BarraDoTeclado.altura;
  }

  void _esconder() {
    _faixa?.remove();
    _faixa = null;
    BarraDoTeclado.alturaEmUso.value = 0;
  }

  @override
  Widget build(BuildContext context) {
    return Focus(
      canRequestFocus: false,
      skipTraversal: true,
      onFocusChange: (bool tem) => tem ? _mostrar() : _esconder(),
      child: widget.child,
    );
  }
}
