import 'package:flutter/material.dart';

import '../api/cache_de_imagens.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import 'imagem_em_cache.dart';

/// Uma imagem que vem do servidor, **desenhada com disciplina de memoria**.
///
/// Irma de `PreviaDaFoto`: aquela desenha o arquivo do aparelho, esta desenha a
/// derivada que o contrato manda. As duas existem pela mesma razao -- uma
/// politica de decodificacao num lugar so, em vez de uma por tela.
///
/// ## Por que ela nao e `Image.network` solto na tela
///
/// Tres coisas tem de valer nas tres pinturas de imagem de servidor que este
/// app tem (a logo do profissional na lista do `Perto`, a faixa do local e a
/// foto do proprio usuario em `Meus dados`), e nenhuma delas e automatica:
///
/// 1. **`cacheWidth` pelo tamanho que a tela PINTA, nunca pelo do arquivo.**
///    O `ui.Image` em memoria custa `largura x altura x 4` bytes da imagem
///    DECODIFICADA, e nao os bytes do JPEG. Sem `cacheWidth`, uma derivada
///    `banner` de 1280 x 720 custa 3,52 MiB mesmo desenhada num cartao de 56
///    dp -- e vinte cartoes assim sao os 9,8 MB de primeira pintura que a
///    vitrine da `Loja` chegou a ter.
/// 2. **`errorBuilder`, sempre.** Imagem que falha nao pode derrubar a tela
///    nem deixar buraco: a derivada pode nao existir ainda, o leitor de midia
///    pode estar fora, a rede do celular pode cair no meio. O lugar da imagem
///    continua la, com o simbolo que diz que havia uma imagem ali.
/// 3. **Ausencia e decisao de QUEM CHAMA.** Esta peca recebe uma `url` nao
///    anulavel de proposito: `Image.network('')` **lanca**, e tratar vazio
///    aqui dentro esconderia de quem chama que existe um estado de ausencia a
///    desenhar. Quem chama le `urlDeImagem` (em `api/modelos_diretorio.dart`),
///    recebe nulo e decide o que fazer com o nulo.
///
/// ## A semantica e do chamador, e `null` significa DECORATIVA
///
/// [descricao] nula embrulha a imagem em `ExcludeSemantics`. Isso existe para
/// o cartao da lista do `Perto`: ali a logo fica **ao lado do nome**, o nome ja
/// e o rotulo da entrada, e uma logo rotulada faria o leitor de tela dizer o
/// nome duas vezes na mesma parada de foco.
class ImagemDaRede extends StatelessWidget {
  const ImagemDaRede({
    required this.url,
    required this.descricao,
    super.key,
    this.largura,
    this.proporcao = 1,
    this.raio = BichuRaio.md,
    this.simboloDeFalha = Icons.image_not_supported_outlined,
    this.aoTocarNaFalha,
    this.textoDaFalha,
    this.reservaDeFalha,
    this.cache,
  });

  /// A URL da **derivada**. Nao anulavel e nao vazia: ver o item 3 acima.
  final String url;

  /// O rotulo do leitor de tela, ou **nulo para imagem decorativa**.
  final String? descricao;

  /// A largura pintada, em dp. Nula ocupa a largura que o pai oferecer -- que
  /// e o caso da faixa de borda a borda do detalhe do local.
  final double? largura;

  /// Largura dividida pela altura. `1` e quadrado (logo, retrato); `16 / 9` e
  /// a faixa.
  final double proporcao;

  final double raio;

  /// O simbolo do estado de falha. Trocavel porque o retrato de uma pessoa
  /// falhando pede outro desenho que uma fachada falhando.
  ///
  /// **Ignorado quando ha [reservaDeFalha].**
  final IconData simboloDeFalha;

  /// O que fazer quando a imagem **nao carregou e vale tentar de novo**.
  ///
  /// ## Por que isto existe, e por que nao vale para toda imagem
  ///
  /// As tres primeiras imagens de servidor deste app (a logo do profissional,
  /// a faixa do local, a foto em `Meus dados`) vem de URL **estavel**: se ela
  /// falhou, ela vai falhar igual no toque seguinte, e um botao ali seria o
  /// toque sem desfecho.
  ///
  /// A foto dentro da conversa e o caso oposto: ela vem numa **URL assinada de
  /// validade curta**, e a causa mais comum da falha e justamente o
  /// vencimento. Ali "buscar de novo" nao e insistir na mesma URL -- e pedir a
  /// conversa outra vez e receber uma assinatura nova. Sem este caminho, quem
  /// reabre a conversa depois de um tempo ve um quadro quebrado e nao tem o que
  /// fazer.
  ///
  /// Nulo mantem o estado de falha **decorativo**, que e o comportamento de
  /// todas as chamadas que existiam antes.
  final VoidCallback? aoTocarNaFalha;

  /// O texto do estado de falha quando ele e um controle. Obrigatorio na
  /// pratica junto de [aoTocarNaFalha]: um botao de icone sem nome e um
  /// controle mudo para quem usa leitor de tela.
  final String? textoDaFalha;

  /// O DESENHO INTEIRO DO ESTADO DE FALHA, quando um glifo nao serve.
  ///
  /// Nulo mantem o comportamento de sempre: [simboloDeFalha] centralizado. Ele
  /// existe para o avatar da barra de topo, onde a reserva da falha **nao e um
  /// glifo de erro e sim a inicial do nome** -- a cadeia de reserva de la tem
  /// tres degraus (foto, inicial, glifo de pessoa), e um icone de "imagem
  /// quebrada" no lugar do segundo degrau mostraria um defeito a quem tem nome
  /// cadastrado.
  ///
  /// **Opcional e no fim da lista de proposito**: nenhuma das nove chamadas que
  /// ja existem muda de desenho, e a politica que importa -- `cacheWidth` pela
  /// largura pintada, `errorBuilder` SEMPRE -- continua morando aqui, num lugar
  /// so. Quem precisa de outra reserva passa um widget em vez de reescrever
  /// `Image.network` na tela.
  final Widget? reservaDeFalha;

  /// **A IDENTIDADE ESTAVEL DA IMAGEM, PARA O CACHE EM DISCO** (BICHUS-296).
  ///
  /// Nula -- o padrao -- mantem o comportamento de sempre: `Image.network`, com
  /// cache **so em memoria**, que morre com o processo. **Nenhuma das quinze
  /// chamadas que ja existiam mudou de comportamento por este parametro
  /// existir.**
  ///
  /// ## Por que e OPT-IN, e nao um gancho global
  ///
  /// Porque uma imagem deste aplicativo **nao pode encostar no disco**: a do QR
  /// da tag, que carrega o codigo da tag dentro dos pixeis (ADR-0004). Ha
  /// portao medindo isso -- `app/test/telas/qr_na_tela_test.dart` aponta o
  /// `path_provider` para uma pasta vazia, roda o fluxo e reprova se os bytes
  /// aparecerem em qualquer arquivo. Um cache ligado por padrao aqui teria
  /// reprovado aquele portao.
  ///
  /// E o mesmo desenho do item 3 do cabecalho desta classe: **a decisao e de
  /// quem chama**, porque so quem chama sabe o que a imagem e.
  ///
  /// ## Como se escolhe entre os dois escopos
  ///
  /// - [ChaveDeImagem.publica] para foto de pet, cartaz de perdido, capa de
  ///   encontro, item do catalogo, logo e faixa do profissional;
  /// - [ChaveDeImagem.dePessoa] para a `thumb` de 176 da foto de uma pessoa,
  ///   **com o apelido dela**. E o apelido que faz desfazer conexao e bloquear
  ///   apagarem o arquivo do disco -- sem ele a Emenda 3 do ADR-0010 valeria so
  ///   na tela. Ver `MarcaDaPessoa`.
  ///
  /// **Chave sem cache no escopo nao faz nada**: se
  /// `CacheDeImagensDoAplicativo` nao esta na arvore -- o caso de todo teste de
  /// widget que nao o monta --, esta peca desenha `Image.network` como antes.
  final ChaveDeImagem? cache;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    // Fora do `LayoutBuilder`: o fator de pixel e do aparelho, nao do espaco
    // disponivel, e ler `MediaQuery` dentro do construtor de layout refaria a
    // dependencia a cada medida.
    final fatorDePixel = MediaQuery.devicePixelRatioOf(context);

    return LayoutBuilder(
      builder: (context, limites) {
        // `maxWidth` infinito acontece dentro de linha sem largura definida.
        // Ali nao ha numero para pedir ao decodificador, e desenhar sem
        // `cacheWidth` seria exatamente o que esta peca existe para impedir --
        // entao ela nao desenha.
        final double? larguraPintada =
            largura ?? (limites.maxWidth.isFinite ? limites.maxWidth : null);
        if (larguraPintada == null || larguraPintada <= 0) {
          return const SizedBox.shrink();
        }
        final alturaPintada = larguraPintada / proporcao;

        final moldura = BoxDecoration(
          // O fundo afundado faz as vezes de lugar reservado enquanto os bytes
          // chegam: sem ele a tela daria um salto de layout quando a imagem
          // aparecesse.
          color: cores.surfaceSunken,
          borderRadius: BorderRadius.circular(raio),
        );

        // **O numero que decide o custo em memoria.** Em pixeis do aparelho,
        // pela largura que a tela pinta.
        final emPixeis = (larguraPintada * fatorDePixel).round();

        final conteudo = Container(
          width: larguraPintada,
          height: alturaPintada,
          clipBehavior: Clip.antiAlias,
          decoration: moldura,
          child: Image(
            // O PROVEDOR E O UNICO RAMO DESTA PECA, e ele mantem as duas
            // politicas do cabecalho nos dois caminhos.
            //
            // Sem chave de cache ele e `NetworkImage(url)` -- que e
            // literalmente o que `Image.network` monta por dentro, entao a
            // pintura de antes nao mudou em nada. Com chave ele e
            // `ImagemEmCache`, que le o disco antes da rede.
            //
            // `ResizeImage` nos DOIS casos, e nao `cacheWidth` so num deles: e
            // ele que `Image.network(cacheWidth: ...)` usa por dentro, e deixar
            // o caminho em cache sem ele devolveria o item 1 do cabecalho --
            // uma faixa de 1280 x 720 custando 3,52 MiB num cartao de 56 dp.
            image: ResizeImage(_provedor(context), width: emPixeis),
            width: larguraPintada,
            height: alturaPintada,
            fit: BoxFit.cover,
            // Uniao das duas frentes: a reserva desenhada pela tela vence, e
            // sem ela vale `_falha`, que sem `aoTocarNaFalha` devolve
            // exatamente o glifo centralizado de antes.
            errorBuilder: (context, erro, pilha) =>
                reservaDeFalha ?? _falha(cores),
          ),
        );

        // Com rotulo: uma parada, anunciada como imagem. **O rotulo vale
        // TAMBEM quando ha [aoTocarNaFalha]**, e a primeira versao disto
        // errava aqui: ela devolvia o conteudo cru sempre que havia toque de
        // falha, e a foto da conversa -- que passa `descricao` -- ficava sem
        // nome acessivel no caminho em que ela CARREGA. O `Semantics` nao
        // bloqueia descendentes (so `excludeSemantics: true` bloqueia), entao
        // o botao do estado de falha continua alcancavel dentro dele.
        if (descricao != null) {
          return Semantics(image: true, label: descricao, child: conteudo);
        }
        // Decorativa: nenhuma parada de foco, nenhum anuncio.
        //
        // **`ExcludeSemantics` so entra sem [aoTocarNaFalha]**: um botao
        // dentro dele desaparece para o leitor de tela, e quem nao ve a tela
        // perderia o unico caminho de buscar a foto de novo.
        return aoTocarNaFalha == null
            ? ExcludeSemantics(child: conteudo)
            : conteudo;
      },
    );
  }

  /// De onde os bytes vem: o disco antes da rede, ou **so a rede**.
  ///
  /// Os dois degraus sao exigidos para o cache entrar, e nenhum deles e
  /// opcional:
  ///
  /// 1. **quem chama passou uma [cache]** -- ver o campo, e por que isto e
  ///    opt-in;
  /// 2. **o escopo tem um `CacheDeImagensDoAplicativo`**. Sem ele nao ha pasta
  ///    nem buscador, e inventar os dois aqui chamaria `path_provider` dentro
  ///    de `build` -- um canal de plataforma que **trava o `pumpAndSettle`
  ///    para sempre, sem mensagem**, em teste de widget.
  ///
  /// Faltando qualquer um, devolve `NetworkImage(url)`, que e o que
  /// `Image.network` monta: o comportamento identico ao de antes da BICHUS-296.
  ImageProvider<Object> _provedor(BuildContext context) {
    final chave = cache;
    if (chave == null) return NetworkImage(url);
    final escopo = CacheDeImagensDoAplicativo.talvezDe(context);
    if (escopo == null) return NetworkImage(url);
    return ImagemEmCache(
      url: url,
      chave: chave,
      cache: escopo.cache,
      buscador: escopo.buscador,
    );
  }

  /// O lugar da imagem que nao carregou.
  ///
  /// Sem [aoTocarNaFalha] e um simbolo, como sempre foi. Com ele e um botao
  /// com nome, e o nome e o texto que a tela escreveu -- esta peca nao tem
  /// microcopy propria, porque "buscar de novo" significa coisas diferentes em
  /// cada superficie.
  Widget _falha(BichuCores cores) {
    final simbolo = Icon(
      simboloDeFalha,
      size: BichuEspaco.e6,
      color: cores.textMuted,
    );
    final aoTocar = aoTocarNaFalha;
    if (aoTocar == null) return Center(child: simbolo);
    return Semantics(
      button: true,
      label: textoDaFalha ?? '',
      child: InkWell(
        onTap: aoTocar,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(BichuEspaco.e3),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: <Widget>[
                simbolo,
                if (textoDaFalha != null) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e2),
                  // `ExcludeSemantics`: o texto ja e o nome do botao acima, e
                  // sem isso o leitor de tela o diria duas vezes na mesma
                  // parada de foco.
                  ExcludeSemantics(
                    child: Text(
                      textoDaFalha!,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: cores.textSecondary,
                        fontSize: BichuEscalaDeTipo.bodySm.tamanho,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
