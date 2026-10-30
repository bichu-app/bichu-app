/// O VEU DO AUTOR SOBRE A MIDIA: a barra preta translucida em que o nome e a
/// foto de quem publicou pousam EM CIMA da imagem, no desenho do Instagram.
///
/// ## O pedido, e ele e do cliente e nao desta camada
///
/// 29/10/2026, primeiro: *"o nome do usuario e a foto dele, fica sobre a
/// imagem"*. E, no mesmo dia, depois de ver a primeira volta: *"mantenha essa
/// barra com o nome e perfil do usuario preta, porem com transparencia e
/// diminua bastante para que isso nao interfira na foto, igual acontece no
/// instagram"*.
///
/// Sao tres determinacoes, e as tres estao neste arquivo: **preta**,
/// **translucida** e **o mais baixa possivel**.
///
/// ## A OPACIDADE E O PISO DE CONTRASTE, E NAO UMA ESCOLHA DE GOSTO
///
/// O fundo e uma FOTO ARBITRARIA. O pior caso nao e a foto media: e a foto
/// BRANCA, porque e nela que o veu preto clareia mais e o nome claro tem menos
/// onde se apoiar. Medido, com a conta do SC 1.4.3 do WCAG 2.1, compondo o veu
/// sobre `#FFFFFF` e medindo contra a tinta clara:
///
/// | veu                               | foto branca | foto media | foto preta |
/// |-----------------------------------|-------------|------------|------------|
/// | claro — `scrim` `#1C1B19` a 64%   | **4,94:1**  | 10,05:1    | 18,05:1    |
/// | escuro — `scrim` `#000000` a 72%  | **8,89:1**  | 14,85:1    | 20,09:1    |
///
/// O piso e **4,5:1** (texto comum, tela nao critica). O pior caso passa com
/// 0,44 de folga, e a folga e pequena de proposito: **a opacidade do token ja
/// esta quase no minimo**. Medido tambem: o alfa MINIMO de `#1C1B19` para o
/// nome alcancar 4,5:1 sobre foto branca e **0,612**, e o token vale 0,64. Ou
/// seja, nao da para deixar a barra mais transparente do que ela esta sem
/// reprovar o portao — e foi por isso que a opacidade nao virou mais um lugar
/// onde o *"diminua bastante"* pudesse ser obedecido.
///
/// **A COR E A OPACIDADE VEM DO TOKEN `scrim`**, e nao de hexadecimal cravado:
/// e o mesmo preto translucido que ja escurece o fundo de folha, de leitor de
/// QR e de visualizador de imagem no app inteiro.
///
/// ## ONDE O "DIMINUA BASTANTE" FOI OBEDECIDO, COM NUMERO
///
/// Na ALTURA e no TAMANHO DO TEXTO, que e onde ele cabia:
///
/// | medida             | primeira volta | agora        |
/// |--------------------|----------------|--------------|
/// | altura ocupada     | 68 dp          | **40 dp**    |
/// | foto do autor      | 40 dp          | **28 dp**    |
/// | nome               | 18 px (`title`)| **14 px** (`label`) |
/// | recuo da borda     | 12 dp          | **0** (encosta no topo) |
///
/// ## O QUE IMPEDE 40 DP DE VIRAR 32, E E UM PORTAO E NAO UM GOSTO
///
/// O `⋮` e um CONTROLE, e controle tem piso de alvo de toque:
/// [BichuAlvoDeToque.min] = 48 dp (WCAG 2.5.5 e o paragrafo 6.5). Esse alvo nao
/// encolhe com a barra. O que se pode fazer -- e e o que [alturaDaBarra] faz --
/// e deixar o ALVO transbordar a barra para baixo, invisivel sobre a foto,
/// mantendo o GLIFO inteiro dentro do veu: glifo de 24 dp centrado em 24 ocupa
/// de 12 a 36, e a barra de 40 o cobre com 4 dp de folga em cima e embaixo.
///
/// Abaixo de 40 o glifo comeca a sair do veu e passa a ser um `⋮` claro sobre
/// foto arbitraria -- o defeito que esta barra existe para nao ter. **40 dp e o
/// minimo que passa**, e a restricao e o alvo de toque do menu, nao o desenho.
///
/// ## O PORTAO DA ESTEIRA NAO CONSEGUE MEDIR ISTO, e a franqueza e obrigatoria
///
/// `test/a11y/verificador.dart` acha o fundo pelo ancestral com preenchimento
/// SOLIDO (`_fundoSolidoMaisProximo`, `alpha >= 1.0`). Um veu translucido e
/// PULADO por ele: o verificador sobe a arvore e encontra a `surface` do cartao,
/// que nao e o que esta atras do nome. Com o desenho anterior (tarja opaca) ele
/// media certo; com este, ele mediria um par que ninguem ve.
///
/// Por isso, duas coisas:
///
///   1. a sub-arvore leva a chave de isencao do paragrafo 18.2.1
///      ([chaveDeIsencao]), que e marcada, listada e publicada pelo job --
///      isencao que ninguem ve vira isencao permanente;
///   2. a medicao de verdade vive em
///      `test/mural/cartao_no_desenho_do_instagram_test.dart`, que compoe o veu
///      sobre `#FFFFFF` e mede com a MESMA `razaoWcag` do verificador. O numero
///      da tabela acima sai de la, nao daqui.
library;

import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

class VeuDoAutorSobreMidia extends StatelessWidget {
  const VeuDoAutorSobreMidia({required this.child, super.key});

  final Widget child;

  /// 40 dp. **O minimo que passa**, e quem fixa o numero e
  /// [BichuAlvoDeToque.min]. Ver o cabecalho.
  static const double alturaDaBarra = 40;

  /// O recuo horizontal do conteudo dentro da barra.
  static const double recuoInterno = BichuEspaco.e3;

  /// A marca de isencao do paragrafo 18.2.1, com o motivo e o endereco da
  /// medicao que a substitui. **Isencao so vale marcada.**
  static const String chaveDeIsencao =
      'a11y-exempt:texto sobre veu translucido em foto arbitraria; o '
      'verificador so acha fundo SOLIDO. A medicao do pior caso (foto branca) '
      'esta em test/mural/cartao_no_desenho_do_instagram_test.dart: 4,94:1 no '
      'tema claro e 8,89:1 no escuro, contra o piso de 4,5.';

  /// A TINTA SOBRE O VEU, e ela e CLARA NOS DOIS TEMAS.
  ///
  /// O veu e escuro nos dois (`scrim` e preto nos dois), e o fundo dele e uma
  /// foto, que nao troca com o tema. Entao a tinta tambem nao pode trocar.
  ///
  /// **Nao ha um unico token que seja claro nos dois temas** -- e essa ausencia
  /// ja esta registrada em `widgets/visualizador_de_imagem.dart`:
  /// `textOnInverse` e claro no tema claro e ESCURO no escuro, porque ele e o
  /// par de `surfaceInverse`, que inverte. O que existe e, em CADA tema, o
  /// nome do extremo claro da rampa: `textOnInverse` no claro e
  /// `surfaceInverse` no escuro. Os dois resolvem para o mesmo `#FAFAF8`, e e
  /// essa a cor medida na tabela do cabecalho.
  static Color tinta(BichuColors tema) =>
      tema.escuro ? tema.cores.surfaceInverse : tema.cores.textOnInverse;

  @override
  Widget build(BuildContext context) {
    final tema = BichuColors.of(context);
    return Semantics(
      // A chave de isencao mora no `Semantics` de fora para cobrir a sub-arvore
      // inteira -- nome, foto e `⋮` pousam todos no mesmo veu.
      key: const ValueKey<String>(chaveDeIsencao),
      child: SizedBox(
        height: alturaDaBarra,
        child: ColoredBox(
          // PRETO COM TRANSPARENCIA, pelo token e nao por hexadecimal: `scrim`
          // e `#1C1B19` a 64% no tema claro e `#000000` a 72% no escuro.
          color: tema.cores.scrim,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: recuoInterno),
            child: child,
          ),
        ),
      ),
    );
  }
}
