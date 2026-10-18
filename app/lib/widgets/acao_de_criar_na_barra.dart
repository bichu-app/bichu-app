import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// A porta de CRIAR da secao, desenhada como icone na barra de topo.
///
/// Pedido literal do cliente em 18/10/2026: *"os itens de criacao, como evento
/// e indicacao, ate o escanear poderia ser icones na barra superior ou um
/// simbolo apenas de + para que o designer fique mais bonito e nao fique esse
/// botao grande na pagina ocupando muito espaco"*.
///
/// **Isto REVERTE a regra de 17/10 que mandava a porta de escrita morar no
/// corpo** (`agenda_da_rede.dart` e `lista_do_diretorio.dart` diziam, com
/// todas as letras, "no CORPO e nao na `AppBar`"). A reversao e decisao dele, e
/// nao descuido -- o mesmo caminho que o `Filtros` fez em 17/10, quando subiu
/// para a barra desfazendo a regra de 22/09.
///
/// **Ele ofereceu DUAS saidas, e esta e a primeira: um icone por acao, que diz
/// o que faz.** A segunda -- um `+` unico que abre as opcoes -- esta desenhada
/// no protipo HTML de `workspace/artefatos-site/app-criar-na-barra/` e nao foi
/// construida: com UMA acao de criar por tela, o `+` transforma um toque em
/// dois e nao diz o que faz antes de ser tocado. O `+` passa a ganhar no dia
/// em que uma tela tiver DUAS ou mais acoes de criar, e ai o rotulo dele tem
/// de nomear o que vai ser criado, nunca "adicionar".
///
/// **O [rotulo] nao e enfeite, e por isso ele e obrigatorio e nao pode ser
/// vazio.** Icone sozinho e mudo para quem usa TalkBack ou VoiceOver, e aqui o
/// glifo e o UNICO indicio do que a acao faz -- o texto que o botao grande
/// carregava saiu da tela. Quem publica o nome acessivel e o `tooltip`: o
/// `IconButton` embrulha o filho num `Tooltip`, e e dele que sai o rotulo da
/// arvore de semantica. Tirar o `tooltip` apaga o nome acessivel junto, e e
/// isso que a isca de `test/a11y/icone_de_criar_tem_rotulo_test.dart` derruba.
///
/// O alvo e [BichuAlvoDeToque.critico] (64 dp), que e a altura da propria
/// barra (design system 23.2) e esta acima do piso de 48 dp. Mesma caixa do
/// `BotaoDeAcaoDaListagem`, que divide o lado direito com esta acao.
class AcaoDeCriarNaBarra extends StatelessWidget {
  const AcaoDeCriarNaBarra({
    required this.icone,
    required this.rotulo,
    required this.aoTocar,
    super.key,
  }) : assert(
         rotulo != '',
         'AcaoDeCriarNaBarra sem rotulo e um icone mudo: o nome acessivel '
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
  /// DESTINO, que tem onde escrever o motivo e a saida; um icone apagado aqui
  /// seria um controle morto sem lugar nenhum onde dizer por que.
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;

    return SizedBox(
      width: BichuAlvoDeToque.critico,
      height: BichuAlvoDeToque.critico,
      child: IconButton(
        onPressed: aoTocar,
        tooltip: rotulo,
        icon: Icon(icone, color: cores.textPrimary),
      ),
    );
  }
}
