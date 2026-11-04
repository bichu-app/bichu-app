// A ISCA DO PAR TROCADO: a tinta de um preenchimento sobre OUTRO preenchimento.
//
// Ela reproduz, com o MESMO desenho do widget de verdade, os dois pares que
// chegaram ao cliente em 03/11/2026:
//
//   pastilha de filtro marcada  on-action-fill sobre primary (claro)   2.10:1
//   giro de carga do botao      on-action-fill sobre disabled-surface  1.02:1
//                                                            (escuro)
//
// POR QUE A ISCA E UMA REPLICA, e nao o widget de verdade com o defeito
// replantado: replantar o defeito no widget significa mexer em `app/lib` para
// o teste reprovar, e ninguem versiona isso. A replica fica aqui, errada de
// proposito e para sempre, e o verificador que aprova o widget consertado e o
// MESMO que reprova esta. Se um dia ela passar, o verificador parou de medir.
//
// AS CORES SAEM DE `BichuCores`, nunca de um hex escrito aqui. A isca mede o
// sistema de cores do app -- o mesmo que os casos positivos medem --, e uma
// copia em hex envelheceria calada no dia em que um token mudasse de valor.

library;

import 'package:bichu/theme/bichu_colors.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/theme/bichu_tokens.g.dart';
import 'package:flutter/material.dart';

/// O rotulo que a isca da pastilha pinta. A medicao o procura por conteudo.
const String rotuloDaIscaDaPastilha = 'Veterinário';

/// O GLIFO do coracao cheio, que e o "conteudo" pelo qual a medicao acha o
/// icone na arvore.
///
/// `Icon` renderiza por `RichText`, e o texto plano dele e o ponto de codigo da
/// fonte de icones. Ele sai de `Icons.favorite` e nunca de um literal: um
/// `''` escrito aqui envelheceria calado se o pacote de icones remapeasse
/// o glifo, e a medicao passaria a nao achar nada -- que e por sorte uma
/// excecao em `razaoMedidaDoTexto`, nao um verde.
final String glifoDoCoracaoCurtido =
    String.fromCharCode(Icons.favorite.codePoint);

Widget _casca({required bool escuro, required Widget filho}) {
  final cores = escuro ? BichuCores.escuro : BichuCores.claro;
  return MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: escuro ? BichuTheme.escuro : BichuTheme.claro,
    home: Material(
      color: cores.surface,
      child: Center(child: filho),
    ),
  );
}

/// A pastilha de filtro MARCADA, com o par de 03/11: `on-action-fill` por cima
/// de `primary`.
///
/// O desenho e o de `_Pastilha` em `widgets/barra_de_listagem.dart`: `Material`
/// pintado com a cor do estado e `Text` por cima dele.
Widget iscaDaPastilhaComParTrocado({required bool escuro}) {
  final cores = escuro ? BichuCores.escuro : BichuCores.claro;
  return _casca(
    escuro: escuro,
    filho: Material(
      color: cores.primary,
      borderRadius: BorderRadius.circular(BichuRaio.full),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: BichuEspaco.e4,
          vertical: BichuEspaco.e3,
        ),
        child: Text(
          rotuloDaIscaDaPastilha,
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w500,
            color: cores.onActionFill,
          ),
        ),
      ),
    ),
  );
}

/// O giro de carga com o par de 03/11: `on-action-fill` por cima da superficie
/// DESABILITADA, que e o fundo que o botao de verdade tem enquanto carrega.
///
/// [comIsencaoDeTexto] pendura a chave de isencao de TEXTO (SC 1.4.3) num
/// ancestral. Ela existe para a contraprova de que aquela chave NAO silencia o
/// verificador de objeto grafico (SC 1.4.11): a chave e legitima para o rotulo
/// de um botao desabilitado, e se ela levasse o giro junto o defeito voltaria a
/// passar por uma porta que alguem abriu com razao.
Widget iscaDoGiroComParTrocado({
  required bool escuro,
  bool comIsencaoDeTexto = false,
}) {
  final bichu = escuro ? BichuColors.temaEscuro : BichuColors.claro;
  final cores = bichu.cores;

  final Widget botao = SizedBox(
    width: 240,
    child: FilledButton(
      // Nulo DESABILITA, e e por isso que o fundo resolve para
      // `disabled-surface`: e o mesmo caminho que `BotaoPrimario` segue
      // enquanto `carregando` e verdadeiro.
      onPressed: null,
      style: bichu.filledButtonStyle,
      child: SizedBox(
        width: 18,
        height: 18,
        child: CircularProgressIndicator(
          strokeWidth: 2.5,
          color: cores.onActionFill,
        ),
      ),
    ),
  );

  return _casca(
    escuro: escuro,
    filho: comIsencaoDeTexto
        ? KeyedSubtree(
            key: const ValueKey<String>(
              'a11y-exempt:componente desabilitado, SC 1.4.3',
            ),
            child: botao,
          )
        : botao,
  );
}

/// O CORACAO DE "CURTIDO" com o par de 04/11/2026: `urgency` -- tinta de
/// PREENCHIMENTO do banner de pet perdido -- por cima de `surface`, que e o
/// que o cartao do Mural pinta.
///
/// 1.62:1 no tema ESCURO, onde `urgency` e `ember.800` (#6B220A) e `surface` e
/// `bark.900` (#17150F): dois marrons quase pretos. Piso de 3.0 do SC 1.4.11,
/// porque o glifo de 24px cai em "texto grande" e um icone e objeto de
/// interface.
///
/// NO CLARO O MESMO PAR DA 6.99:1 E PASSA, e e por isso que a isca fixa o tema
/// escuro no numero: uma isca de tema claro aprovaria e nao provaria nada.
///
/// O desenho e o de `_AcoesDaPublicacao` em `telas/mural/tela_do_mural.dart`:
/// `IconButton` ATIVO com um `Icon` de 24. Ativo de proposito -- um coracao
/// desabilitado cairia na unica isencao que o SC 1.4.3 concede, e a isca
/// passaria a medir a isencao em vez do defeito.
Widget iscaDoCoracaoComParTrocado({required bool escuro}) {
  final cores = escuro ? BichuCores.escuro : BichuCores.claro;
  return _casca(
    escuro: escuro,
    filho: IconButton(
      onPressed: () {},
      tooltip: 'Descurtir',
      icon: Icon(Icons.favorite, color: cores.urgency),
    ),
  );
}
