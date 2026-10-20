import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// Uma acao que [AcoesDeCriarFlutuantes] oferece: a principal, ou uma das
/// secundarias da folha.
class OpcaoDeCriar {
  const OpcaoDeCriar({
    required this.icone,
    required this.rotulo,
    required this.aoTocar,
  }) : assert(
         rotulo != '',
         'OpcaoDeCriar sem rotulo e uma linha muda: o rotulo e o texto '
         'PINTADO na folha (ou o `tooltip` do alvo principal) e tambem o nome '
         'acessivel. Sem ele o leitor de tela anuncia so "botao".',
       );

  /// O glifo, da familia fechada do design system 10.1 (Material Symbols),
  /// que e a mesma de onde sai todo `Icons.*` deste app. Nenhum vetor novo,
  /// nada baixado, nada gerado.
  final IconData icone;

  /// O que o toque FAZ, por extenso e em portugues.
  ///
  /// **Ele diz o VERBO da pessoa, e nunca "adicionar".** `Escanear uma tag`
  /// diz o que acontece; `Adicionar` diria o que o app faz com o resultado, e
  /// quem usa leitor de tela ouviria uma palavra que nao descreve nada do que
  /// vem depois do toque.
  ///
  /// Na folha ele e **PINTADO** ao lado do glifo -- e e essa a diferenca entre
  /// a folha e dois icones soltos: ninguem precisa adivinhar o que um desenho
  /// de 24 dp quer dizer. No alvo principal ele vai para o `tooltip`, que e de
  /// onde o Flutter publica o nome da arvore de semantica.
  final String rotulo;

  /// **Nunca nulo.** Quem explica bloqueio de conta ou de e-mail e a tela de
  /// DESTINO, que tem onde escrever o motivo e a saida; uma linha apagada aqui
  /// seria uma acao morta sem lugar nenhum onde dizer por que.
  final VoidCallback aoTocar;
}

/// A porta de criar de uma secao que tem uma acao PRINCIPAL e outras atras
/// dela: dois alvos flutuantes na MESMA LINHA, o principal direto e o
/// secundario abrindo a folha.
///
/// ## O que o cliente decidiu, e em duas rodadas (19/10/2026)
///
/// Primeiro ele pediu a acao flutuante em `Pets`: *"so faltou na pagina de
/// pets o botao para adicionar um novo pet perdido ou escanear a tag, gostei
/// desse padrao"*. Eram TRES as acoes que precisavam de casa -- os itens de
/// `destino` vivos que a gaveta perdeu quando ela foi ocultada no mesmo dia --
/// e elas nasceram as tres dentro de uma folha, atras de um alvo de `add`.
///
/// **Entao eu perguntei qual delas era "adicionar um novo pet perdido", e ele
/// respondeu: *"botao para escanear o pet"*.** E o leitor de plaquinha, e ele
/// quer um TOQUE.
///
/// Por isso a forma mudou: a acao principal perdeu a folha do caminho e virou
/// o alvo de 56 dp direto, e as outras duas passaram a ser alcancadas por um
/// alvo SECUNDARIO ao lado dele.
///
/// ## POR QUE DOIS ALVOS NA MESMA LINHA, e nao as outras tres formas
///
/// O briefing deu tres caminhos (alvo secundario, pressao longa, as duas no
/// corpo) e tres critorios, e a escolha e o unico arranjo que satisfaz os tres.
///
/// **PRESSAO LONGA foi recusada, e nao e por gosto.** Ela nao e descobrivel --
/// nada na tela diz que o alvo tem um segundo gesto -- e **nao e anunciada por
/// leitor de tela**: `onLongPress` nao entra na arvore de semantica com nome,
/// entao quem usa TalkBack ou VoiceOver nao tem como saber que as duas acoes
/// existem. Como UNICO caminho ela deixaria as duas inalcancaveis para essas
/// pessoas, que e o critorio 1 quebrado do jeito mais silencioso possivel. E
/// com um caminho visivel equivalente ao lado, ela deixa de ser necessaria.
///
/// **AS DUAS NO CORPO foram recusadas por uma decisao que ja existe.** Em
/// 18/10 o cliente removeu exatamente isso: *"nao fique esse botao grande na
/// pagina ocupando muito espaco"*, e era um `BotaoSecundario` de largura total
/// que empurrava a lista 64 dp para baixo. Duas portas no corpo de `Pets`
/// empurrariam a listagem de perdidos -- que e o conteudo da secao -- em mais
/// do que aquele botao empurrava.
///
/// **O ALVO SECUNDARIO AO LADO, e nao ACIMA, e e aqui que a conta fecha.**
/// Empilhados em coluna, dois alvos medem `56 + 16 + 56 = 128` dp de altura, e
/// a invasao do pe da lista iria de 72,00 para **144,00 dp** -- o respiro
/// rolavel do `padding` teria de dobrar, e em 320 x 568 dp (barra de topo 64 +
/// barra de baixo 72, corpo de ~432) isso e **um terco da altura visivel da
/// lista** reservado para nao ser coberto.
///
/// Na MESMA LINHA a altura nao muda: ela e a do alvo mais alto, 56 dp. **A
/// invasao continua exatamente 72,00 dp** (56 de desenho + 16 de assentamento
/// do `Scaffold`), o respiro de `_folgaDaAcaoFlutuante` que ja existe continua
/// pagando-a inteira, e nenhum item da lista termina embaixo de alvo nenhum.
/// O que o segundo alvo custa e LARGURA do canto inferior direito --
/// `16 + 56 + 16 + 56 = 144` dp de um corpo de 288 em 320 dp --, e largura
/// nao cobre item: o respiro vertical e que decide isso.
///
/// Medido no portao `a acao flutuante nao cobre o fim do corpo` e no grupo
/// `(g)` de `gaveta_oculta_e_barra_nova_test.dart`.
///
/// ## OS DOIS ALVOS TEM 56 dp, e o piso NAO foi afrouxado
///
/// O Material ofereceria `FloatingActionButton.small` (40 x 40) para o
/// secundario, e **40 fura o piso de 48 dp do SC 2.5.8** -- o mesmo piso que
/// [AvatarDaConta] cumpre com os 48 dela e que o 11.23.1 trata como minimo de
/// controle. Com os dois em 56 o piso sobra nos dois, e a hierarquia vem de
/// onde ela pode vir sem custar alvo: o principal fica no canto, ao alcance do
/// polegar, e o secundario a esquerda dele; os glifos dizem o resto.
///
/// ## O `heroTag` CONTINUA DESLIGADO nos dois
///
/// Os ramos visitados da casca ficam **MONTADOS** (`IndexedStack` deixa o
/// inativo em `Offstage`, que nao pinta mas continua na arvore de elementos).
/// Com acao flutuante em `Pets` **e** em `Rede`, ha agora TRES
/// `FloatingActionButton` coexistindo, e com o `heroTag` padrao -- que e o
/// mesmo para todos -- o `Hero` reclama de etiquetas iguais na mesma
/// subarvore. `find.byType` nao veria os irmaos: os finders pulam o que esta
/// `Offstage` por padrao, e o `Hero` nao pula.
///
/// Uma etiqueta unica por alvo resolveria a colisao e nao serviria para nada:
/// o `Hero` so anima quando a tela de DESTINO tem um `FloatingActionButton`
/// para receber o voo, e nenhuma das tres telas de destino tem um.
class AcoesDeCriarFlutuantes extends StatelessWidget {
  const AcoesDeCriarFlutuantes({
    required this.principal,
    required this.rotuloDasOutras,
    required this.tituloDaFolha,
    required this.outras,
    super.key,
  }) : assert(
         rotuloDasOutras != '',
         'O alvo secundario sem rotulo e um icone mudo: o nome acessivel sai '
         'do tooltip, e sem ele o leitor de tela anuncia so "botao".',
       ),
       assert(
         outras.length > 1,
         'AcoesDeCriarFlutuantes com UMA acao secundaria e uma folha que '
         'existe para oferecer uma coisa: um toque a mais entre a pessoa e a '
         'acao, sem escolha nenhuma no meio. Com uma secundaria so, use dois '
         'AcaoDeCriarFlutuante -- ou leve a segunda direto ao destino.',
       );

  /// A acao de UM TOQUE: o alvo de 56 dp no canto, sem folha no caminho.
  ///
  /// Em `Pets` ela e `Escanear uma tag`, por decisao do cliente de 19/10
  /// (*"botao para escanear o pet"*).
  final OpcaoDeCriar principal;

  /// O nome acessivel do alvo SECUNDARIO.
  ///
  /// **Ele diz o que o toque FAZ: abrir mais acoes.** Nao diz "adicionar" --
  /// o toque nao adiciona nada, ele oferece uma escolha -- e nao nomeia uma
  /// das duas, porque nomear uma mentiria sobre a outra.
  final String rotuloDasOutras;

  /// O titulo da folha. **Ele e o rotulo do GRUPO para quem usa leitor de
  /// tela**, e a primeira coisa que a folha anuncia ao abrir.
  final String tituloDaFolha;

  /// As acoes secundarias, na ordem em que sao pintadas. **Duas ou mais** --
  /// ver a assercao do construtor.
  final List<OpcaoDeCriar> outras;

  /// A chave da folha, para o portao achar a folha aberta sem casar texto.
  static const Key chaveDaFolha = ValueKey<String>('criar/folha');

  /// A chave do alvo PRINCIPAL, para o portao distinguir os dois sem casar
  /// glifo nem posicao.
  static const Key chaveDoPrincipal = ValueKey<String>('criar/principal');

  /// A chave do alvo SECUNDARIO.
  static const Key chaveDoSecundario = ValueKey<String>('criar/secundario');

  @override
  Widget build(BuildContext context) {
    // `mainAxisSize: min` para a linha ocupar so o que os dois alvos pedem: o
    // `floatingActionButton` do `Scaffold` posiciona o que recebe, e uma linha
    // de largura total empurraria o alvo principal para o centro da tela.
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        FloatingActionButton(
          key: chaveDoSecundario,
          // Ver a prosa da classe: conserto de um defeito MEDIDO, e nao
          // precaucao.
          heroTag: null,
          tooltip: rotuloDasOutras,
          onPressed: () => _abrir(context),
          // `more_horiz`, e o glifo e deliberado: ele diz "ha mais aqui" sem
          // dizer O QUE, que e o unico sentido honesto para um alvo que abre
          // duas opcoes. Os glifos especificos de cada uma ficam nas linhas da
          // folha, cada um ao lado do proprio nome escrito.
          //
          // **`add` nao serve mais neste alvo.** Ele era o glifo dos TRES
          // numa folha so; com a acao principal fora da folha, um `add` aqui
          // leria como "criar algo" ao lado de um alvo que tambem cria -- dois
          // sinais de criacao no mesmo canto, que e a colisao que o cliente
          // leu no aparelho em 22/09.
          child: const Icon(Icons.more_horiz),
        ),
        const SizedBox(width: BichuEspaco.e4),
        FloatingActionButton(
          key: chaveDoPrincipal,
          heroTag: null,
          // O `tooltip` E o nome acessivel (11.23.3), e por isso ele diz o
          // verbo da pessoa: `Escanear uma tag`, e nao `Adicionar`.
          tooltip: principal.rotulo,
          onPressed: principal.aoTocar,
          child: Icon(principal.icone),
        ),
      ],
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
        // (800 x 600 px): titulo mais as linhas de 48 dp mais os respiros nao
        // cabem na altura que `showModalBottomSheet` concede sem
        // `isScrollControlled`. O transbordo nao e cosmetico -- o `Column`
        // CLIPA o que passa, e a ultima opcao deixou de receber toque:
        // `tap()` acusou *"derived an Offset that would not hit test on the
        // specified widget"*.
        //
        // **E em aparelho ele seria pior do que em teste:** a 200% de escala
        // de texto as linhas crescem, e a folha teria de caber numa tela de
        // 568 dp de altura com a barra de status e a de gestos fora. Quem
        // perde e sempre a ULTIMA opcao da lista.
        //
        // `SingleChildScrollView` e nao `isScrollControlled: true`: a folha
        // continua com a altura do conteudo quando ele cabe -- que e o caso
        // comum -- e passa a rolar so quando nao cabe.
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
                for (final opcao in outras)
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
