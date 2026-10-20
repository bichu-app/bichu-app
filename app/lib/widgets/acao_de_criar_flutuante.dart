import 'package:flutter/material.dart';

/// A porta de CRIAR da secao, desenhada como acao FLUTUANTE no corpo da tela.
///
/// ## Ela saiu da barra de topo em 19/10/2026, e a decisao e dele
///
/// Eu lhe mostrei a conta: com o sino de notificacao na barra, o lado direito
/// passaria a ter quatro controles e o titulo de `Perto` sairia com
/// reticencia. Perguntei qual sairia. Palavras dele: **"O botao criar sai da
/// barra"**.
///
/// Entao isto **nao desfaz** o pedido de 18/10 (*"os itens de criacao, como
/// evento e indicacao ... e nao fique esse botao grande na pagina ocupando
/// muito espaco"*): o que ele recusou naquele dia foi o `BotaoSecundario` de
/// LARGURA TOTAL no meio do corpo -- 48 dp de altura mais 16 dp de folga,
/// empurrando a lista para baixo em cada uma das duas secoes. A acao flutuante
/// nao ocupa linha nenhuma do corpo: ela fica por cima, no canto, e o conteudo
/// continua comecando na primeira linha.
///
/// ## O NOME ACESSIVEL nao mudou de forma, e isso e deliberado
///
/// O [rotulo] continua obrigatorio e continua indo para o `tooltip`, que e de
/// onde o Flutter publica o nome da arvore de semantica. **A mudanca de forma
/// nao podia mudar o que o leitor de tela anuncia**: quem usa TalkBack ouvia
/// `Criar evento` no icone da barra e tem de continuar ouvindo `Criar evento`
/// aqui. Tirar o `tooltip:` apaga o nome e deixa so "botao" (SC 4.1.2), e e
/// isso que a isca 2 de `test/telas/criar_e_icone_na_barra_test.dart` derruba.
///
/// ## O desenho vem do tema, e nao daqui
///
/// `floatingActionButtonTheme` de `bichu_theme.dart` ja fixa tinta, tinta do
/// glifo, elevacao zero e raio `lg` em tokens. Este arquivo **nao escreve cor
/// nem medida**: um `backgroundColor` aqui seria a segunda fonte da mesma
/// decisao, e a primeira e o tema.
///
/// O alvo e o do proprio `FloatingActionButton` -- 56 x 56 --, acima do piso
/// de 48 dp do SC 2.5.8. Ele nao usa os 64 dp de `BichuAlvoDeToque.critico`
/// porque 64 e o piso de **controle de canto de barra** (11.23.1), e este
/// controle deixou de ser um.
class AcaoDeCriarFlutuante extends StatelessWidget {
  const AcaoDeCriarFlutuante({
    required this.icone,
    required this.rotulo,
    required this.aoTocar,
    super.key,
  }) : assert(
         rotulo != '',
         'AcaoDeCriarFlutuante sem rotulo e um icone mudo: o nome acessivel '
         'sai do tooltip, e sem ele o leitor de tela anuncia so "botao".',
       );

  /// O glifo. Da familia fechada do design system 10.1 (Material Symbols),
  /// que e a mesma de onde sai todo `Icons.*` deste app -- nenhum vetor novo,
  /// nenhum asset baixado.
  final IconData icone;

  /// O que vai ser criado, por extenso e em portugues. Vai para o `tooltip` e,
  /// por ele, para o nome acessivel.
  final String rotulo;

  /// **Nunca nulo.** Quem explica bloqueio de conta ou de e-mail e a tela de
  /// DESTINO, que tem onde escrever o motivo e a saida; um controle apagado
  /// aqui seria uma acao morta sem lugar nenhum onde dizer por que.
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    return FloatingActionButton(
      // **`heroTag: null` DESLIGA O HERO, e isto e conserto de um defeito
      // MEDIDO, nao precaucao.**
      //
      // O `FloatingActionButton` nasce com um `heroTag` padrao comum a todos,
      // e `Rede` e `Perto` tem uma acao de criar cada: as duas desenham um
      // destes. **Os ramos visitados da casca continuam MONTADOS** -- o
      // `IndexedStack` deixa o inativo em `Offstage`, que nao pinta mas
      // continua no arvore de elementos --, entao os dois `FloatingActionButton`
      // coexistem e o Hero reclama de duas etiquetas iguais na mesma subarvore.
      //
      // Medido: `flutter test test/telas/criar_e_icone_na_barra_test.dart`
      // reprovou com *"There are multiple heroes that share the same tag
      // within a subtree ... <default FloatingActionButton tag>"* no caso de
      // `Perto`, que e o que chega la depois de passar pela `Rede`. Um
      // `find.byType` nao veria o irmao: os finders pulam o que esta
      // `Offstage` por padrao, e o Hero nao pula.
      //
      // **Uma etiqueta unica por secao resolveria a colisao e nao serviria
      // para nada**: o Hero so anima quando a tela de DESTINO tem um
      // `FloatingActionButton` para receber o voo, e nem
      // `TelaCriarEncontro` nem `TelaSugerirProfissional` tem um. Ficaria uma
      // etiqueta a manter e uma colisao a reabrir no dia em que uma terceira
      // secao criar algo.
      heroTag: null,
      onPressed: aoTocar,
      tooltip: rotulo,
      child: Icon(icone),
    );
  }
}
