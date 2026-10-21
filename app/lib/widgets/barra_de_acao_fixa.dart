import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import 'barra_do_teclado.dart';

/// A barra de acao fixa do rodape (design system 11.8).
///
/// Todas as telas desta entrega a trazem no Figma, e o motivo e sempre o
/// mesmo: **a acao primaria nao pode depender de rolagem**. A tela de
/// cadastro tem sete campos e a de sinais tem um bloco de ajuda de quatro
/// paragrafos; sem a barra ancorada, o `Continuar` de F1.3 fica abaixo da
/// dobra em aparelho pequeno com a fonte do sistema aumentada, e a pessoa
/// conclui que a tela nao tem saida.
///
/// O M3 nao tem "barra de acao fixa": e layout, e nao componente (tabela do
/// paragrafo 11 do design system). Ela vive em `Scaffold.bottomNavigationBar`
/// para respeitar a area segura inferior, que muda em tempo de execucao com a
/// barra de gestos.
///
/// ## ELA SOBE COM O TECLADO, E ISSO E O CONSERTO DE 20/10/2026
///
/// **O `Scaffold` nao levanta esta barra, e por isso ela se levanta sozinha.**
/// `_ScaffoldLayout.performLayout` ancora a `bottomNavigationBar` em
/// `size.height` -- a altura inteira da tela -- e so o `body` recebe o recuo
/// do teclado (`contentBottom = bottom - max(minInsets.bottom,
/// bottomWidgetsHeight)`). Sem o recuo que o `build` daqui aplica, a barra
/// fica ATRAS do teclado e a acao primaria vira um botao que nao da para
/// tocar.
///
/// **O cliente mediu isso duas vezes no iPhone dele, em 20/10/2026**, e as
/// duas como o mesmo defeito: no leitor de QR (*"o teclado vem aberto e
/// sobrepoe os botoes embaixo"*) e em `Meus dados` (*"o teclado vem aberto o
/// que impede de clicar no botao de salvar"*). Medido no gabarito de
/// 800 x 600 dp com teclado de 266,7: `Continuar` ocupava 460..524 dp com o
/// chao visivel em 333,3 -- 127 dp atras do teclado.
///
/// **ESTE COMENTARIO AFIRMAVA O CONTRARIO, e a afirmacao custou.** Ate aqui
/// ele descrevia o mesmo mecanismo e chamava o resultado de *vantagem*: "a
/// consequencia pratica e boa e e o motivo de a barra caber em tela de
/// formulario", porque, tomando o `Scaffold` o MAIOR dos dois recuos, a barra
/// custava zero de area rolavel com o teclado aberto. A medicao estava certa
/// (em 360 x 640 dp com teclado de 270, de 23/09/2026: barra em 543..640,
/// teclado cobrindo 370..640, 282 dp de area rolavel com e sem barra); a
/// conclusao estava errada, porque area rolavel de graca nao serve de nada
/// quando o que se perde e o botao que conclui a tarefa. Fica escrito porque
/// quem ler depois precisa saber que o numero foi medido e lido ao contrario.
///
/// **O recuo nasceu na tela e subiu para ca.** Na primeira ocorrencia ele foi
/// posto em `escanear/tela_leitor_de_qr.dart`, para nao mexer num arquivo que
/// todas as telas usam. Com a SEGUNDA ocorrencia a conta inverteu: sao 13 as
/// telas que trazem esta barra junto com campo de texto, e cada tela nova
/// herdaria o defeito e dependeria de alguem lembrar. O conserto passou a ser
/// um so, aqui.
///
/// **E ele nao cobra espaco de quem nao tem campo.** O recuo e
/// `viewInsets.bottom`, que e zero em toda tela sem teclado na frente -- as 10
/// telas que usam esta barra sem campo de texto continuam com a barra
/// encostada no chao, sem um dp de espaco morto. Nao ha condicional a escrever:
/// quem nao abre teclado nao recebe recuo.
///
/// **De onde o numero e lido.** Daqui, e isto so funciona porque a barra vive
/// no slot `bottomNavigationBar`: o `Scaffold` zera `viewInsets` para o `body`
/// (`removeBottomInset: _resizeToAvoidBottomInset`) e **nao** zera para este
/// slot. Quem puser esta barra dentro do corpo de uma tela recebe zero, que e
/// o valor certo la -- o corpo ja foi encolhido pelo teclado.
///
/// `Padding` e nao `AnimatedPadding`: o sistema entrega o inset quadro a
/// quadro enquanto o teclado sobe, e a barra ja acompanha a animacao dele. Um
/// segundo animador correria atras do primeiro.
class BarraDeAcaoFixa extends StatelessWidget {
  const BarraDeAcaoFixa({required this.acoes, super.key});

  /// Da principal para a ultima. A principal tem 64 dp de alvo; as demais, 48.
  final List<Widget> acoes;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;

    // O TECLADO, MAIS A FAIXA DE `Concluir` QUANDO ELA ESTA NA TELA.
    //
    // A faixa de [BarraDoTeclado] tambem se encosta no topo do teclado, num
    // `Overlay`, e `Overlay` desenha POR CIMA do `Scaffold`: sem somar a
    // altura dela aqui, consertar "o teclado cobre o `Salvar`" produziria "a
    // faixa cobre o `Salvar`" -- o mesmo defeito com outro nome. Ela so existe
    // enquanto um campo de texto corrido tem o foco, e vale zero no resto do
    // tempo.
    return ValueListenableBuilder<double>(
      valueListenable: BarraDoTeclado.alturaEmUso,
      builder: (context, faixaDoTeclado, filho) {
        final double teclado = MediaQuery.viewInsetsOf(context).bottom;
        // A FAIXA SO CONTA COM O TECLADO NA TELA, pela mesma condicao que
        // [BarraDoTeclado] usa para se desenhar. Campo focado sem teclado
        // aberto -- teclado fisico, ou o quadro entre uma coisa e a outra --
        // nao tem faixa, e reservar altura ali levantaria a barra de acao
        // sobre um vao vazio.
        final double reserva = teclado > 0 ? faixaDoTeclado : 0;
        return Padding(
          // O RECUO DO TECLADO. Ver a secao do cabecalho: sem ele a barra
          // fica atras do teclado, e zero em toda tela que nao abre teclado.
          //
          // Por FORA da caixa pintada, e nao como recuo interno dela: assim a
          // superficie e a borda de cima param onde a barra para, em vez de a
          // cor da barra se esticar por tras do teclado.
          padding: EdgeInsets.only(bottom: teclado + reserva),
          child: filho,
        );
      },
      child: Container(
        decoration: BoxDecoration(
          color: cores.surface,
          border: Border(
            top: BorderSide(color: cores.outline, width: BichuBorda.hairline),
          ),
        ),
        child: SafeArea(
          // So a borda de baixo: as laterais e o topo desta caixa sao a borda
          // da barra, e aplicar a area segura neles deixaria a linha superior
          // solta do canto da tela.
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(BichuEspaco.e4),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                for (var i = 0; i < acoes.length; i++) ...<Widget>[
                  if (i > 0) const SizedBox(height: BichuEspaco.e3),
                  acoes[i],
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// O passo do assistente de cadastro, dito em texto e nao so em barra.
///
/// "Passo 2 de 3" e anunciado pelo leitor de tela como cabecalho da tela
/// (UX F1.3/F1.4/F1.5, acessibilidade das tres). Uma barra de progresso sem
/// texto e invisivel para quem nao ve a barra.
class IndicadorDePasso extends StatelessWidget {
  const IndicadorDePasso({
    required this.passo,
    required this.total,
    required this.titulo,
    super.key,
  });

  final int passo;
  final int total;
  final String titulo;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Semantics(
          // Nao e cabecalho: o cabecalho da tela e o titulo abaixo. Isto e o
          // estado do assistente, e ele precisa ser lido junto, e nao como uma
          // segunda secao.
          child: Text(
            'Passo $passo de $total',
            style: textos.labelMedium?.copyWith(color: cores.primary),
          ),
        ),
        const SizedBox(height: BichuEspaco.e2),
        Semantics(
          header: true,
          child: Text(titulo, style: textos.headlineSmall),
        ),
      ],
    );
  }
}
