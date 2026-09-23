import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../roteamento/rotas.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import '../widgets/marca.dart';

/// O estado de uma secao no registro (UX 27.5).
///
/// `existe` e codigo rodando; `casca` e tela sem conteudo mas com saida real;
/// `planejada` e o que o mapa declara e ninguem construiu.
enum EstadoDaSecao { existe, casca, planejada }

/// O campo semantico do glifo de cada secao (BICHUS-230, criterio 2).
///
/// **Ele existe porque o rotulo encurtou e o significado foi transferido para
/// o icone** (UX 27.3). Duas secoes que desenham do mesmo campo desfazem
/// justamente a transferencia de que a barra de cinco depende, e foi o que o
/// cliente leu no aparelho em 22/09: `storefront` em `Perto` e `shopping_bag`
/// em `Loja` eram duas leituras de comercio, adjacentes na barra.
///
/// Declarar o campo no registro, e nao so trocar o glifo, e o que faz o portao
/// pegar **a proxima** colisao: quem acrescentar uma secao e escolher o icone
/// pela estetica reprova antes de chegar ao aparelho.
enum CampoSemantico { animal, comunidade, lugar, compra, conta }

/// Qual build esta sendo montado (UX 25.7.3).
///
/// O paragrafo manda que secao `planejada` **nao seja renderizada** fora do
/// build que o cliente abre, e que essa selecao venha de **configuracao de
/// compilacao, nunca por acaso**. Este enum e essa configuracao, e ele existe
/// porque sem ele o criterio 3 desta historia seria uma frase sem mecanismo.
enum ConfiguracaoDeBuild {
  /// O build que o cliente abre para decidir escopo. Mostra tudo, inclusive o
  /// que e `planejada`.
  referencia,

  /// O build que vai para a loja. Secao `planejada` nao aparece na barra.
  entrega,
}

/// Um destino da barra inferior.
///
/// Carrega **os tres sinais** que a decisao do cliente de 21/09 separou: o
/// icone (quem enxerga), o [rotulo] visivel (todo mundo) e o [reforcoDaPagina]
/// (quem abriu a secao). O [semanticsLabel] existe porque quem usa leitor de
/// tela recebia **so o rotulo**, e o rotulo acabou de encurtar de `Perdidos`
/// para `Pets` e de `Eventos` para `Rede` -- sem ele, a decisao de produto
/// seria uma regressao de acessibilidade (UX 27.7).
class DestinoDeNavegacao {
  const DestinoDeNavegacao({
    required this.rotulo,
    required this.reforcoAcessivel,
    required this.reforcoDaPagina,
    required this.icone,
    required this.iconeSelecionado,
    required this.rota,
    required this.estado,
    required this.campoSemantico,
  });

  /// O texto que aparece na barra. Curto por decisao: com cinco destinos o
  /// slot em 320 dp e de 64,0 dp (UX 27.2.1), e rotulo que nao cabe se resolve
  /// trocando a palavra em projeto, nunca com reticencia ou quebra de linha.
  final String rotulo;

  /// A metade de tras do nome acessivel. Redacao equivalente a
  /// [reforcoDaPagina] (UX 27.7, regra 5), mais curta porque o leitor de tela
  /// le a frase inteira a cada passagem pela barra.
  final String reforcoAcessivel;

  /// A primeira linha do corpo da pagina, em `body-lg`.
  ///
  /// **Nao vai na barra de topo.** Medido em UX 27.4.1: o titulo da `AppBar`
  /// dispoe de 240,0 dp em 320 dp e corta com reticencia, e
  /// `Profissionais e estabelecimentos` pede 406,72 ja em escala 1x. Um
  /// significado que some com reticencia nao foi transferido para lugar
  /// nenhum, e era justamente o titulo que o cliente encarregou de carregar o
  /// significado que o rotulo curto deixou de carregar.
  final String reforcoDaPagina;

  final IconData icone;
  final IconData iconeSelecionado;

  /// O endereco do ramo. Estado que merece link tem endereco (F5).
  final String rota;

  final EstadoDaSecao estado;

  /// O campo de significado de que o glifo desta secao tira a leitura.
  ///
  /// **Dois destinos nao podem declarar o mesmo**, e o portao de
  /// `test/telas/casca_de_cinco_secoes_test.dart` reprova quando declaram.
  final CampoSemantico campoSemantico;

  /// O nome que o VoiceOver e o TalkBack anunciam.
  ///
  /// **O rotulo visivel vem primeiro, literal.** E o SC 2.5.3 (rotulo no
  /// nome): quem usa comando de voz diz "tocar em Pets" e o casamento acontece
  /// pelo texto visivel contido no nome. Por o reforco antes quebra o comando
  /// em alguns motores; depois, nunca quebra.
  String get semanticsLabel => '$rotulo, $reforcoAcessivel';
}

/// A casca de navegacao: **cinco** destinos, barra sempre visivel, **inclusive
/// deslogado**.
///
/// Deslogado e um estado de navegacao, nao um muro (UX 5.2). Nenhuma aba fica
/// escondida, desabilitada ou com cadeado: a acao aparece normal e o login
/// acontece dentro do caminho dela, e nao no lugar dela.
///
/// **`Escanear` deixou de ser aba, e o leitor nao ficou mais longe.** Ele tem
/// duas portas (UX 27.5.6): a primaria em `Pets`, que e a secao cujo trabalho e
/// esse, e a de conta em `Perfil`, onde o cliente pediu. Um leitor so, e o
/// destino da leitura sai das regras dos tres cenarios de QR, nunca da aba de
/// origem. Quem acha um cachorro na rua nao pensa a palavra `Perfil`, e por
/// isso a porta que nao pode faltar e a de `Pets`. O leitor em si e rota de
/// tela inteira e **nao leva a barra**, pela regra do design system 11.11
/// ("quando a barra nao aparece: ... no leitor de camera").
class CascaComAbas extends StatelessWidget {
  const CascaComAbas({required this.navegacao, super.key});

  final StatefulNavigationShell navegacao;

  /// O registro de secoes, na ordem da barra (UX 27.2).
  ///
  /// **Publico e constante de proposito:** os portoes desta historia e o da
  /// BICHUS-172 iteram esta lista em vez de repetir os rotulos a mao. Portao
  /// que guarda uma copia da lista fica verde no dia em que a lista muda.
  static const List<DestinoDeNavegacao> destinos = <DestinoDeNavegacao>[
    DestinoDeNavegacao(
      rotulo: 'Pets',
      reforcoAcessivel: 'pets perdidos e para adoção perto de você',
      reforcoDaPagina:
          'Os pets perdidos e os que estão para adoção aqui na sua região.',
      // A PATINHA AQUI E LEGITIMA, e isto esta escrito para nao ser reaberto.
      //
      // `Icons.pets` e o glifo `pets` do Material Symbols, que e a familia
      // fechada do design system 10.1. Ele **nao** e a patinha aposentada da
      // marca: o node `184:61` do Figma chama-se "icone 24dp - pets
      // (contorno)" e desenha o glifo da familia, cujas cinco formas sao os
      // quatro dedos e o coxim -- construcao do proprio glifo, e nao o simbolo
      // desenhado a mao.
      //
      // A regra 4 de `design/marca/README.md` enumera quatro usos proibidos:
      // simbolo, favicon, icone do app e marcador de posicao de foto. Icone de
      // secao de navegacao nao e nenhum dos quatro. O criterio 6 da BICHUS-144
      // proibe a patinha como icone de **especie**, e ali a razao e outra: o
      // contrato tem um enum fechado de especies e uma pata diria "animal" onde
      // e preciso dizer "cao" ou "gato". Nesta barra "animal" e exatamente o
      // que a secao e. A UX ja corrigiu esta premissa por escrito em 27.3.
      //
      // O glifo que a UX preferiria -- uma pata dentro de um alfinete de
      // localizacao -- nao existe no Material Symbols, e compor dois glifos
      // sai da familia unica do 10.1 (UX 27.3.1). **E ele deixou de ser
      // possivel por outro motivo em 22/09**: o alfinete foi para `Perto`
      // (BICHUS-233), e duas secoes vizinhas nao dividem a mesma forma. O
      // desejo morre aqui, e isto esta escrito para nao ser reaberto.
      icone: Icons.pets_outlined,
      iconeSelecionado: Icons.pets,
      rota: Rotas.pets,
      // O leitor de QR responde ao toque e leva a tela de verdade: a secao
      // satisfaz o criterio (a) de 25.7.3.
      //
      // **O cadastro de pet sustentava este `existe` junto com o leitor, e
      // saiu daqui em 22/09** (BICHUS-232): cadastrar o **meu** pet e custodia
      // e mora em `Perfil` > `Meus pets`, como a UX 27.5.1 e a 27.5.5 ja
      // diziam. Sobra o leitor, e ele **continua bastando** pela letra do
      // 25.7.3 -- por isso o estado declarado nao muda. O que nao podia ficar
      // e esta justificativa citando uma acao que nao esta mais na tela.
      estado: EstadoDaSecao.existe,
      campoSemantico: CampoSemantico.animal,
    ),
    DestinoDeNavegacao(
      rotulo: 'Rede',
      reforcoAcessivel: 'eventos e encontros da comunidade',
      reforcoDaPagina:
          'Os eventos e encontros de quem tem pet aqui perto de você.',
      icone: Icons.groups_outlined,
      iconeSelecionado: Icons.groups,
      rota: Rotas.rede,
      estado: EstadoDaSecao.planejada,
      campoSemantico: CampoSemantico.comunidade,
    ),
    DestinoDeNavegacao(
      rotulo: 'Perto',
      reforcoAcessivel: 'profissionais e estabelecimentos indicados',
      reforcoDaPagina:
          'Os profissionais e estabelecimentos indicados por quem já usou.',
      // O ALFINETE DE LOCALIZACAO, e nao a fachada de loja (BICHUS-233).
      //
      // `storefront` desenha uma fachada, e ficava a **dois slots** de
      // `shopping_bag`, a sacola da aba `Loja`. A UX 27.3 defendia o par com
      // o argumento de que "a sacola e compra minha; a fachada e o negocio de
      // outra pessoa", e o argumento se sustenta no papel. No aparelho ele nao
      // sobreviveu ao primeiro usuario, que e a unica bancada que conta: o
      // cliente leu duas lojas lado a lado em 22/09.
      //
      // **`near_me` foi recusado**, e nao por ser pior: a seta e o sinal
      // universal de "tracar rota", e o produto nao tem mapa nem rota por
      // decisao de 17/09 (ADR-0010, o Maps cobra por carregamento). Um
      // signifier que promete um mecanismo inexistente e o golfo da execucao
      // aberto de proposito. `pin_drop`, `my_location` e `location_searching`
      // caem pelo mesmo motivo, mais fraco: os tres leem como controle de mapa.
      //
      // Contorno em repouso e preenchido no selecionado, que e o M3 e o que os
      // outros quatro ja fazem. As cores nao mudam: continuam vindo de
      // `navigationBarTheme.iconTheme`. O rotulo e o nome acessivel tambem
      // nao: o icone e decorativo e nao entra na arvore (UX 27.7), entao a
      // troca nao tem efeito de acessibilidade.
      icone: Icons.place_outlined,
      iconeSelecionado: Icons.place,
      rota: Rotas.perto,
      // **`existe`, e nao `planejada`, desde a listagem do diretorio.**
      //
      // A troca nao e cosmetica e tem duas consequencias medidas. A primeira:
      // `planejada` obriga a secao a dizer "Perto esta em construcao"
      // (UX 25.7.3), e essa frase passou a ser falsa -- ha lista, vinda de
      // `GET /directory/entries`. A segunda: `visiveisEm` esconde o que e
      // `planejada` no build de ENTREGA, entao enquanto esta linha dissesse
      // `planejada` a secao com conteudo nao apareceria na barra do build que
      // vai para a loja.
      estado: EstadoDaSecao.existe,
      campoSemantico: CampoSemantico.lugar,
    ),
    DestinoDeNavegacao(
      rotulo: 'Loja',
      reforcoAcessivel: 'a loja do Bichu',
      reforcoDaPagina:
          'A loja do Bichu: plaquinha, coleira e o que seu pet precisa.',
      icone: Icons.shopping_bag_outlined,
      iconeSelecionado: Icons.shopping_bag,
      rota: Rotas.loja,
      estado: EstadoDaSecao.planejada,
      campoSemantico: CampoSemantico.compra,
    ),
    DestinoDeNavegacao(
      rotulo: 'Perfil',
      reforcoAcessivel: 'seus pets e sua conta',
      reforcoDaPagina: 'Seus pets, sua plaquinha e os ajustes da sua conta.',
      icone: Icons.account_circle_outlined,
      iconeSelecionado: Icons.account_circle,
      rota: Rotas.perfil,
      estado: EstadoDaSecao.existe,
      campoSemantico: CampoSemantico.conta,
    ),
  ];

  /// A configuracao deste build, vinda de `--dart-define`.
  ///
  /// O padrao e [ConfiguracaoDeBuild.referencia] porque e **este** o build que
  /// existe hoje: o cliente pediu para ver o escopo inteiro, com todos os
  /// botoes visiveis mesmo sem conteudo, e 25.7.3 permite exatamente isso. O
  /// build de loja se pede por escrito:
  ///
  /// ```
  /// flutter build apk --dart-define=BICHU_BUILD=entrega
  /// ```
  static ConfiguracaoDeBuild get configuracao {
    const String escolhido = String.fromEnvironment(
      'BICHU_BUILD',
      defaultValue: 'referencia',
    );
    return escolhido == 'entrega'
        ? ConfiguracaoDeBuild.entrega
        : ConfiguracaoDeBuild.referencia;
  }

  /// O destino de uma rota de aba.
  ///
  /// As telas de aba pegam o titulo e a linha de reforco **daqui**, e nao de
  /// uma constante propria: o registro e a barra passam a ter uma fonte so, e
  /// a regra de 25.7.2 ("titulo igual ao rotulo do registro, a mesma palavra
  /// nos dois lugares") deixa de depender de alguem lembrar.
  static DestinoDeNavegacao porRota(String rota) {
    return destinos.firstWhere(
      (d) => d.rota == rota,
      orElse: () => throw ArgumentError.value(
        rota,
        'rota',
        'nao esta no registro de secoes de CascaComAbas.destinos',
      ),
    );
  }

  /// Os destinos que a barra mostra em [qual].
  ///
  /// No build de entrega, secao `planejada` **nao e renderizada** (UX 25.7.3).
  /// A rota dela continua existindo, porque link profundo e endereco e nao
  /// depende de a barra mostrar o destino.
  static List<DestinoDeNavegacao> visiveisEm(ConfiguracaoDeBuild qual) {
    if (qual == ConfiguracaoDeBuild.referencia) return destinos;
    return destinos
        .where((d) => d.estado != EstadoDaSecao.planejada)
        .toList(growable: false);
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final visiveis = visiveisEm(configuracao);
    // O indice do ramo e a posicao em `destinos`, nao em `visiveis`: no build
    // de entrega a barra esconde destinos e as duas listas deixam de casar.
    // Sem esta traducao, tocar em `Perfil` abriria `Rede`.
    final ramos = <int>[
      for (final destino in visiveis) destinos.indexOf(destino),
    ];
    final selecionado = ramos.indexOf(navegacao.currentIndex);

    return Scaffold(
      body: navegacao,
      bottomNavigationBar: DecoratedBox(
        // O filete de 1px em `outline` e obrigatorio, nao decorativo (design
        // system 22.1): a barra usa `surface`, que esta a 1,04:1 do corpo da
        // pagina, e sem o filete ela **nao existe visualmente**.
        decoration: BoxDecoration(
          border: Border(
            top: BorderSide(
              color: cores.outline,
              width: BichuBorda.hairline,
            ),
          ),
        ),
        child: NavigationBar(
          selectedIndex: selecionado < 0 ? 0 : selecionado,
          onDestinationSelected: (indice) => navegacao.goBranch(
            ramos[indice],
            initialLocation: ramos[indice] == navegacao.currentIndex,
          ),
          destinations: <Widget>[
            for (final destino in visiveis)
              // O nome acessivel entra num `Semantics` que embrulha o destino,
              // e nao no `label`: o `label` e o texto **pintado**, e ele
              // precisa continuar sendo a palavra curta que cabe em 64,0 dp.
              //
              // `excludeSemantics: true` nao serve aqui: ele levaria junto o
              // `selected` e a acao de toque que o proprio componente emite, e
              // o criterio 7 pede que a aba ativa seja identificavel sem
              // depender de cor.
              Semantics(
                label: destino.semanticsLabel,
                child: NavigationDestination(
                  // O icone e **decorativo** e nao entra na arvore: icone com
                  // nome proprio ao lado de um rotulo que diz a mesma coisa e
                  // anuncio duplo, que e ruido no VoiceOver e no TalkBack
                  // (UX 27.7, regra 2). `Icon` sem `semanticLabel` ja nao
                  // entra.
                  icon: Icon(destino.icone),
                  selectedIcon: Icon(destino.iconeSelecionado),
                  label: destino.rotulo,
                  // O tooltip continua sendo **so o rotulo visivel**: ele e
                  // dica visual de quem pressiona e segura, e um paragrafo ali
                  // e defeito (UX 27.7, regra 3).
                  tooltip: destino.rotulo,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Casca visual comum das telas de aba: titulo, linha de reforco, margem
/// lateral de 16 e area segura.
///
/// Area segura nao e margem: notch, ilha dinamica, barra de gestos e teclado
/// mudam a area utilizavel em tempo de execucao, e conteudo em coordenada fixa
/// e defeito que so aparece no aparelho que ninguem tem em maos.
class TelaDeAba extends StatelessWidget {
  const TelaDeAba({
    required this.titulo,
    required this.filhos,
    super.key,
    this.reforco,
    this.tituloEmMarca = false,
  });

  /// O **nome curto** da secao, igual ao rotulo da aba (UX 25.7.2 e 27.4.2).
  final String titulo;

  /// A frase que explica a secao. Vai na **primeira linha do corpo**, em
  /// `body-lg`, e nunca na barra de topo: ali ela quebra em quantas linhas
  /// precisar, rola junto com a pagina, escala ate 200% sem cortar nada e e
  /// lida pelo leitor de tela na ordem certa (UX 27.4.2).
  final String? reforco;

  final List<Widget> filhos;

  /// Quando a barra de topo carrega o LOGOTIPO em vez do titulo escrito.
  ///
  /// Vale so para a tela em que o titulo E a marca. O paragrafo 8.4 do design
  /// system diz que o logotipo e vetor e que nenhuma tela o recompoe digitando;
  /// a barra precisa do lockup SEM descritor, porque o completo tem piso de
  /// 160px de largura e nao cabe numa barra de 56px (paragrafo 21.2).
  ///
  /// [titulo] continua obrigatorio: ele vira o rotulo que o leitor de tela
  /// anuncia. Imagem de marca sem rotulo e barra muda para quem nao ve.
  final bool tituloEmMarca;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(
        // A MARCA no lugar do texto quando `tituloEmMarca` (BICHUS-195/196).
        // O `rotulo` continua indo para o leitor de tela: vetor sem nome e
        // vetor mudo.
        title: tituloEmMarca
            ? MarcaLockup(
                largura: MarcaLockup.pisoDeLargura,
                rotulo: titulo,
              )
            : Text(titulo),
        // 64 dp, e nao os 56 do padrao do M3.
        //
        // O design system 23.2 desenhou a casca com barra de topo de 64 dp, e
        // `BarraDeConta` ja usa a mesma medida nas telas de conta. O tema nao
        // fixa `toolbarHeight`, entao sem esta linha a raiz de aba nasce com
        // 56 e diverge do quadro do Figma em toda tela do app.
        //
        // Raiz de aba **nao tem saida**: a variante e `Saida=Nenhuma` (23.4),
        // e por isso aqui nao entra `SaidaDaTela`. Quem chega numa aba chegou
        // pela barra de baixo.
        toolbarHeight: BichuAlvoDeToque.critico,
      ),
      body: SafeArea(
        // `addSemanticIndexes: false` **nao e** microotimizacao. O padrao do
        // `ListView` e embrulhar cada filho direto num `IndexedSemantics`, e
        // com ele o filho vira **um** no de semantica: tudo o que estiver
        // dentro colapsa num rotulo so. Isso e o certo para uma lista de
        // itens, onde "item 3 de 10" significa alguma coisa -- e esta lista
        // nao e uma lista de itens, e o corpo rolavel de uma pagina.
        //
        // O que o padrao causava, medido na arvore de semantica do `Perfil`:
        // a secao inteira de `Meus pets` virava um unico no **anunciado como
        // botao**, de nome `Meus pets Seu primeiro pet entra aqui. Cadastre
        // seu pet ... Cadastrar meu pet`. O titulo da secao entrava no nome
        // acessivel do botao, e o botao deixava de existir como controle
        // separado: quem usa TalkBack ou VoiceOver nao tinha como parar nele.
        // E SC 4.1.2 (nome, papel, valor) falhando numa acao primaria -- nas
        // quatro abas de entao, e agora seriam cinco.
        //
        // Cada secao volta a compor os proprios nos, que e o que o leitor de
        // tela precisa para deslizar entre titulo, texto e acao.
        //
        // NAO REMOVA. `test/telas/casca_de_cinco_secoes_test.dart` reprova por
        // dois caminhos independentes: a varredura do fonte deste arquivo, e a
        // arvore de semantica com a acao primaria colapsada.
        child: ListView(
          addSemanticIndexes: false,
          padding: const EdgeInsets.all(BichuEspaco.e4),
          children: <Widget>[
            if (reforco != null) ...<Widget>[
              Text(
                reforco!,
                style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
              ),
              const SizedBox(height: BichuEspaco.e6),
            ],
            ...filhos,
          ],
        ),
      ),
    );
  }
}

/// O estado vazio do sistema: o M3 nao define um, e este e composicao.
class EstadoVazio extends StatelessWidget {
  const EstadoVazio({
    required this.titulo,
    required this.explicacao,
    super.key,
    this.acao,
  });

  final String titulo;
  final String explicacao;
  final Widget? acao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e6),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(titulo, style: textos.titleLarge),
          const SizedBox(height: BichuEspaco.e2),
          Text(
            explicacao,
            style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
          ),
          if (acao != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e6),
            acao!,
          ],
        ],
      ),
    );
  }
}
