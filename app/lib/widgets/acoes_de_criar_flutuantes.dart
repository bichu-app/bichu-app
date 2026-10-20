import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// Uma das opcoes que [AcoesDeCriarFlutuantes] oferece.
class OpcaoDeCriar {
  const OpcaoDeCriar({
    required this.icone,
    required this.rotulo,
    required this.aoTocar,
  }) : assert(
         rotulo != '',
         'OpcaoDeCriar sem rotulo e uma linha muda: o rotulo e o texto '
         'PINTADO na folha e tambem o nome acessivel. Sem ele o leitor de '
         'tela anuncia so "botao".',
       );

  /// O glifo, da familia fechada do design system 10.1 (Material Symbols),
  /// que e a mesma de onde sai todo `Icons.*` deste app. Nenhum vetor novo,
  /// nada baixado, nada gerado.
  final IconData icone;

  /// O que vai ser feito, por extenso e em portugues.
  ///
  /// **Ele e PINTADO aqui, e nao so anunciado**, e e essa a diferenca entre
  /// esta folha e tres icones soltos: na folha cada opcao tem o nome ao lado
  /// do glifo, e ninguem precisa adivinhar o que um desenho de 24 dp quer
  /// dizer.
  final String rotulo;

  /// **Nunca nulo.** Quem explica bloqueio de conta ou de e-mail e a tela de
  /// DESTINO, que tem onde escrever o motivo e a saida; uma linha apagada aqui
  /// seria uma acao morta sem lugar nenhum onde dizer por que.
  final VoidCallback aoTocar;
}

/// A porta de criar de uma secao que tem **MAIS DE UMA** acao: um unico alvo
/// flutuante que abre a folha com as opcoes.
///
/// ## Por que ela existe: a secao `Pets` ganhou TRES acoes
///
/// Decisao do cliente, 19/10/2026, literal: *"so faltou na pagina de pets o
/// botao para adicionar um novo pet perdido ou escanear a tag, gostei desse
/// padrao"* -- *"esse padrao"* e a acao flutuante que ele acabou de ver em
/// `Rede` e no antigo `Perto`.
///
/// Sao **tres** as acoes que precisam desta porta, e nao duas: as duas que ele
/// nomeou mais `Cadastrar pet`. As tres sao exatamente os itens de `destino`
/// VIVOS que a gaveta perdeu quando ela foi ocultada no mesmo dia -- a tabela
/// de para onde cada um dos sete foi esta em `TelaDeAba`, no `leading`.
///
/// ## TRES ALVOS SOLTOS NAO CABEM, e o numero esta medido
///
/// O `floatingActionButton` do `Scaffold` e um slot UNICO. Tres
/// `FloatingActionButton` empilhados em coluna no canto medem
/// **56 + 16 + 56 + 16 + 56 = 200 dp** de altura, contra os **72,00 dp** que a
/// folga do pe da lista paga (`_folgaDaAcaoFlutuante` em
/// `casca_com_abas.dart`, que e `e12 + e2`). Eles cobririam **128 dp a mais**
/// do que o corpo reserva: em `Pets`, cujo conteudo e uma lista de cartoes de
/// pet, isso e mais de um cartao inteiro escondido atras dos botoes, em toda
/// rolagem.
///
/// Aumentar a folga para 200 dp foi medido e recusado: em 320 x 568 dp, com a
/// barra de baixo e a de topo, sobram ~440 dp de corpo -- a reserva passaria a
/// ser 45% da altura visivel da lista.
///
/// ## A FOLHA, e por que ela em vez de uma coluna que expande
///
/// O alvo e **um**: 56 x 56, o mesmo de `AcaoDeCriarFlutuante`, no mesmo canto
/// e com a mesma folga de 72,00 dp paga pelo `padding` rolavel. O toque abre
/// uma folha inferior com as tres opcoes, cada uma com **glifo e rotulo
/// escrito**.
///
/// A coluna de mini-alvos que expande (o "speed dial") foi recusada por tres
/// razoes medidas nesta arvore:
///
/// 1. **Ela nao resolve a altura, so a esconde**: aberta, ela ocupa os mesmos
///    200 dp sobre a lista, e agora sobre o conteudo que a pessoa estava
///    lendo.
/// 2. **Mini-alvo tem 40 dp**, abaixo do piso de 48 do SC 2.5.8. Mantendo 56
///    para respeitar o piso, a coluna fica do tamanho de cima.
/// 3. **O rotulo nao cabe ao lado do mini-alvo** sem um balao proprio por
///    opcao, e sem rotulo as tres acoes viram tres desenhos: `qr_code_scanner`,
///    `campaign` e `note_add` nao se distinguem por forma para quem abre o app
///    pela primeira vez -- e duas delas tratam de bicho perdido, que e
///    justamente onde errar o toque custa mais.
///
/// A folha ainda ganha de graca o que a coluna nao tem: ela e modal, entao a
/// cortina **bloqueia a semantica do fundo** e o leitor de tela nao oferece a
/// lista de pets enquanto as opcoes estao abertas.
///
/// ## O `heroTag` CONTINUA DESLIGADO, e continua sendo conserto de defeito
/// MEDIDO
///
/// Os ramos visitados da casca ficam **MONTADOS** (`IndexedStack` deixa o
/// inativo em `Offstage`, que nao pinta mas continua na arvore de elementos).
/// Com acao flutuante em `Pets` **e** em `Rede`, os dois
/// `FloatingActionButton` coexistem, e com o `heroTag` padrao -- que e o mesmo
/// para todos -- o `Hero` reclama de duas etiquetas iguais na mesma subarvore.
/// `find.byType` nao veria o irmao: os finders pulam o que esta `Offstage` por
/// padrao, e o `Hero` nao pula.
///
/// Uma etiqueta UNICA por secao resolveria a colisao e nao serviria para nada:
/// o `Hero` so anima quando a tela de DESTINO tem um `FloatingActionButton`
/// para receber o voo, e nenhuma das tres telas de destino tem um.
class AcoesDeCriarFlutuantes extends StatelessWidget {
  const AcoesDeCriarFlutuantes({
    required this.rotulo,
    required this.tituloDaFolha,
    required this.opcoes,
    super.key,
  }) : assert(
         rotulo != '',
         'AcoesDeCriarFlutuantes sem rotulo e um icone mudo: o nome acessivel '
         'sai do tooltip, e sem ele o leitor de tela anuncia so "botao".',
       ),
       assert(
         opcoes.length > 1,
         'AcoesDeCriarFlutuantes com uma opcao so e uma folha que existe para '
         'oferecer uma coisa: um toque a mais entre a pessoa e a acao, sem '
         'escolha nenhuma no meio. Com UMA acao use AcaoDeCriarFlutuante, que '
         'leva direto ao destino.',
       );

  /// O nome acessivel do alvo flutuante. Vai para o `tooltip` e, por ele, para
  /// a arvore de semantica.
  ///
  /// **Ele diz o VERBO e nao o objeto** (`Criar`, e nao `Criar pet`): o alvo
  /// nao leva a uma acao, ele abre a escolha entre tres. Um nome que
  /// prometesse uma das tres mentiria sobre as outras duas.
  final String rotulo;

  /// O titulo da folha. **Ele e o rotulo do GRUPO para quem usa leitor de
  /// tela**, e a primeira coisa que a folha anuncia ao abrir.
  final String tituloDaFolha;

  /// As opcoes, na ordem em que sao pintadas. **Duas ou mais** -- ver a
  /// assercao do construtor.
  final List<OpcaoDeCriar> opcoes;

  /// A chave da folha, para o portao achar a folha aberta sem casar texto.
  static const Key chaveDaFolha = ValueKey<String>('criar/folha');

  @override
  Widget build(BuildContext context) {
    return FloatingActionButton(
      // Ver a prosa da classe: conserto de um defeito MEDIDO, e nao
      // precaucao.
      heroTag: null,
      tooltip: rotulo,
      onPressed: () => _abrir(context),
      // `add`, e o glifo e deliberado: ele diz "criar algo" sem dizer O QUE,
      // que e o unico sentido honesto para um alvo que abre tres opcoes. Os
      // glifos especificos (`qr_code_scanner`, `campaign_outlined`,
      // `note_add_outlined`) ficam nas linhas da folha, cada um ao lado do
      // proprio nome escrito.
      child: const Icon(Icons.add),
    );
  }

  Future<void> _abrir(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      // O `SafeArea` do componente NAO cobre o pe em todas as versoes, e a
      // ultima linha caia debaixo da barra de gestos -- achado em aparelho
      // fisico em 22/09, e o mesmo conserto de `antessala_de_aviso.dart`.
      useSafeArea: true,
      builder: (contextoDaFolha) => SafeArea(
        key: chaveDaFolha,
        // **A FOLHA ROLA, e isto e conserto de um defeito MEDIDO.**
        //
        // Sem o rolavel, o `Column` transbordou **39 px** na bancada de teste
        // (800 x 600 px): titulo mais tres linhas de 48 dp mais os respiros
        // nao cabem na altura que `showModalBottomSheet` concede sem
        // `isScrollControlled`. O transbordo nao e cosmetico -- o `Column`
        // CLIPA o que passa, e a ultima opcao (`Cadastrar pet`) deixou de
        // receber toque: `tap()` acusou *"derived an Offset that would not hit
        // test on the specified widget"*.
        //
        // **E em aparelho ele seria pior do que em teste:** a 200% de escala
        // de texto as tres linhas crescem, e a folha teria de caber numa tela
        // de 568 dp de altura com a barra de status e a de gestos fora. Quem
        // perde e sempre a ULTIMA opcao da lista.
        //
        // `SingleChildScrollView` e nao `isScrollControlled: true`: a folha
        // continua com a altura do conteudo quando ele cabe -- que e o caso
        // comum, tres opcoes em escala 1x --, e passa a rolar so quando nao
        // cabe. `isScrollControlled` a faria nascer alta sempre.
        child: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: BichuEspaco.e4),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: BichuEspaco.e4,
                    vertical: BichuEspaco.e2,
                  ),
                  child: Text(
                    tituloDaFolha,
                    style: Theme.of(contextoDaFolha).textTheme.titleMedium,
                  ),
                ),
                for (final opcao in opcoes)
                  _LinhaDaOpcao(
                    opcao: opcao,
                    // **FECHA A FOLHA ANTES DE NAVEGAR, e a ordem importa.**
                    // Navegar com a folha aberta deixa a rota nova empilhada
                    // ATRAS da cortina modal: a tela abre e a pessoa continua
                    // vendo as opcoes por cima dela, e o `Voltar` dela fecha a
                    // folha em vez de voltar.
                    aoTocar: () {
                      Navigator.of(contextoDaFolha).pop();
                      opcao.aoTocar();
                    },
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Uma linha da folha: o glifo, o nome escrito, e o alvo de 48 dp inteiro.
class _LinhaDaOpcao extends StatelessWidget {
  const _LinhaDaOpcao({required this.opcao, required this.aoTocar});

  final OpcaoDeCriar opcao;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;

    return InkWell(
      onTap: aoTocar,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: BichuEspaco.e4,
          vertical: BichuEspaco.e3,
        ),
        child: ConstrainedBox(
          // O piso de 48 dp do SC 2.5.8, pela ALTURA do alvo e nao pelo
          // tamanho do glifo: a linha ocupa a largura toda da folha.
          constraints: const BoxConstraints(minHeight: BichuAlvoDeToque.min),
          child: Row(
            children: <Widget>[
              // O glifo e **decorativo**: o nome ao lado diz a mesma coisa, e
              // dois anuncios do mesmo sentido no mesmo controle e ruido no
              // VoiceOver e no TalkBack. `Icon` sem `semanticLabel` ja nao
              // entra na arvore.
              Icon(opcao.icone, color: cores.textPrimary),
              const SizedBox(width: BichuEspaco.e4),
              Expanded(
                child: Text(
                  opcao.rotulo,
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
