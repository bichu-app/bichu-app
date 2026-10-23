import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../roteamento/rotas.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// O que a saida promete a quem toca nela.
///
/// A distincao nao e de icone, e de verdade: cada uma afirma uma coisa
/// diferente sobre o que existe atras da tela, e afirmar a errada e mentir
/// para quem esta com pressa.
enum TipoDeSaida {
  /// A tela e um **desvio**: o passo anterior existe e continua na pilha.
  /// Voltar devolve a pessoa a ele, com o que ela tinha digitado no lugar.
  voltar,

  /// A tela e um **destino**: o passo anterior foi substituido de proposito e
  /// nao existe mais. Nao ha para onde voltar; ha de onde sair.
  fechar,
}

/// O controle de saida das telas que cobrem a casca de abas.
///
/// **Por que ele e explicito, e nao a seta automatica do Flutter.** O
/// `AppBar` desenha a seta sozinho quando ha algo para desempilhar, e so
/// nesse caso. Uma tela alcancada por link direto (F5: App Links e Universal
/// Links entregam uma URL com o app fechado) nasce com a pilha de uma pagina
/// so, e ali a seta automatica simplesmente nao aparece. Saida que depende do
/// estado da pilha e saida que some justamente no caminho que ninguem testa a
/// mao. Este botao existe sempre, e quando nao ha o que desempilhar ele cai no
/// [escape] que a tela declarou.
///
/// **Por que 64 dp e nao 48.** O piso critico do sistema (design system 6.5,
/// pesquisa de UX 15.1) vale para quem esta em pe, com um animal em um dos
/// bracos, usando o polegar da outra mao. Sair de uma tela em que se caiu por
/// engano e exatamente essa situacao. Voltar e fechar nao sao excecao ao piso.
///
/// **Por que tooltip.** `IconButton` sem `tooltip` nem rotulo semantico e
/// anunciado por VoiceOver e TalkBack como "botao", e nada mais (WCAG 2.1 SC
/// 4.1.2). O tooltip vira o nome acessivel do controle.
class SaidaDaTela extends StatelessWidget {
  const SaidaDaTela({
    required this.tipo,
    super.key,
    this.escape = Rotas.pets,
    this.resultado,
    this.cor,
  });

  final TipoDeSaida tipo;

  /// A cor do glifo, quando o fundo atras dele **nao e superficie do tema**.
  ///
  /// **Nulo e o normal e e o padrao**: o controle pinta em
  /// `cores.textPrimary`, que e o que contrasta com a superficie em que quase
  /// toda tela o desenha.
  ///
  /// Ele existe por um pedido do cliente de 22/10/2026 -- *"Na tela de
  /// escanear o qr-code do pet ou do usuario, o x para fechar deve ser branco,
  /// em algumas paginas ele esta ficando cinza ou preto e nao esta dando muita
  /// leitura"*. O leitor de QR desenha esta saida **sobreposta a imagem da
  /// camera**, e ali `textPrimary` e o cinza-escuro do tema claro: o glifo
  /// desaparece no video.
  ///
  /// **E por isso que ele e parametro e nao uma troca dentro desta classe.** A
  /// mesma `SaidaDaTela` e desenhada por telas de formulario e de conta, sobre
  /// superficie clara: branco fixo aqui resolveria o leitor e apagaria o
  /// controle em todas as outras. Quem sabe o que ha atras do glifo e a tela,
  /// e e ela que diz.
  final Color? cor;

  /// O valor que [BuildContext.pop] devolve a quem empilhou a tela.
  ///
  /// **Nulo em quase toda tela, e e por isso que ele e opcional.** Voltar de
  /// um formulario que so escreve no `Salvar` nao tem o que devolver: quem
  /// abriu continua com o dado que tinha.
  ///
  /// Ele existe para a tela que **escreve no servidor antes do `Salvar`**. A
  /// edicao do pet e a primeira: trocar e remover a foto valem na hora, e sem
  /// este valor quem volta sem salvar deixa o detalhe pintando a foto antiga
  /// de um pet que ja nao a tem.
  ///
  /// E uma funcao, e nao um valor, porque o `build` da barra roda antes de a
  /// escrita acontecer: um valor capturado aqui seria sempre o do primeiro
  /// quadro.
  final Object? Function()? resultado;

  /// Para onde ir quando nao ha nada para desempilhar. `Pets` e o default
  /// porque ele e a secao de aterrissagem -- a unica tela do app que nunca
  /// exige conta e nunca depende de
  /// um passo anterior.
  final String escape;

  @override
  Widget build(BuildContext context) {
    final voltar = tipo == TipoDeSaida.voltar;
    // "Voltar" e "Fechar" sao as palavras que o proprio sistema usa para estes
    // dois controles, e o design system ja as emprega: a ordem de foco do
    // paragrafo 11.0 comeca por "voltar", e o paragrafo 11.12 fala do `close`
    // "anunciado como fechar". Nao ha microcopy nova aqui.
    final rotulo = voltar ? 'Voltar' : 'Fechar';

    return IconButton(
      onPressed: () {
        if (context.canPop()) {
          final valor = resultado?.call();
          // `pop()` e `pop(null)` nao sao a mesma chamada para quem espera um
          // tipo nao nulo: o segundo satisfaz o `await` com nulo, e o primeiro
          // tambem -- mas passar nulo explicitamente obrigaria toda tela sem
          // resultado a declarar o tipo. O ramo mantem o comportamento antigo
          // byte a byte para quem nao usa `resultado`.
          if (valor == null) {
            context.pop();
          } else {
            context.pop(valor);
          }
          return;
        }
        context.go(escape);
      },
      tooltip: rotulo,
      icon: Icon(voltar ? Icons.arrow_back : Icons.close),
      iconSize: 24,
      // O alvo e o que decide, nao o desenho do icone (11.12).
      constraints: const BoxConstraints(
        minWidth: BichuAlvoDeToque.critico,
        minHeight: BichuAlvoDeToque.critico,
      ),
      padding: EdgeInsets.zero,
      color: cor ?? BichuColors.of(context).cores.textPrimary,
      focusColor: BichuColors.of(context).cores.focusRing,
      style: IconButton.styleFrom(
        minimumSize: const Size.square(BichuAlvoDeToque.critico),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(BichuRaio.sm),
        ),
      ),
    );
  }
}

/// A barra de topo das telas de conta: titulo e saida, sempre as duas.
///
/// Ela existe para que "tela de conta com saida" seja uma decisao tomada num
/// lugar so. Uma tela nova de conta que use `AppBar` cru volta a nascer sem
/// saida, e o defeito reaparece calado.
///
/// A altura sobe de 56 para 64 porque o alvo de saida e de 64: barra de 56 com
/// alvo de 64 estoura o leiaute, e reduzir o alvo para caber na barra e
/// escolher a medida errada das duas.
class BarraDeConta extends StatelessWidget implements PreferredSizeWidget {
  const BarraDeConta({
    required this.titulo,
    required this.saida,
    super.key,
    this.escape = Rotas.pets,
    this.resultado,
  });

  final String titulo;
  final TipoDeSaida saida;
  final String escape;

  /// Repassado a [SaidaDaTela.resultado]. Ver a documentacao de la.
  final Object? Function()? resultado;

  @override
  Size get preferredSize =>
      const Size.fromHeight(BichuAlvoDeToque.critico);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      toolbarHeight: BichuAlvoDeToque.critico,
      leadingWidth: BichuAlvoDeToque.critico,
      leading: SaidaDaTela(tipo: saida, escape: escape, resultado: resultado),
      title: Text(titulo),
    );
  }
}
