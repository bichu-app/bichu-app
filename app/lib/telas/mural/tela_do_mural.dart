import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/mural_api.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/imagem_da_rede.dart';
import '../casca_com_abas.dart';

/// O corpo da secao `Mural`: **a linha do tempo.**
///
/// ## O que esta frente construiu
///
/// A frente de 19/10 construiu o LUGAR — o slot na barra de baixo (`Mural` pede
/// 50,90 dp num slot de 64,00, medido), o ramo do `IndexedStack`, a rota
/// [Rotas.mural] e um estado vazio honesto que dizia, por escrito, que publicar
/// *"ainda nao esta no ar"*. Estava certo: nao havia onde guardar publicacao.
///
/// **Agora ha.** `user_publications` existe (migracao `20261020000002`),
/// `GET /timeline` e `POST /me/publications` existem, e esta tela desenha o que
/// elas devolvem. O estado vazio deixou de prometer o futuro e passou a
/// descrever o presente.
///
/// ## O RECORTE NAO E DESTA TELA, e isso e a parte que importa
///
/// Esta tela desenha **exatamente** o que `GET /timeline` devolveu, e nao tem um
/// `if` que esconda item nenhum. Quem decide o que entra e a clausula `WHERE` da
/// consulta do servidor (ADR-0021): publicacao de quem nao e conexao aceita de
/// quem chama **nao chega aqui** — nao chega vazia, nao chega marcada, nao
/// chega. Nao existe campo nesta resposta que diga "voce nao pode ver isto",
/// porque nao existe estado assim.
///
/// **E por isso que a isca do app e sobre a AUSENCIA de outra fonte**, e nao
/// sobre um filtro: `mural_nao_tem_outra_fonte_test.dart` prova que a unica
/// coisa que esta tela pinta vem de `LeituraDoMural.linhaDoTempo`, e que ela nao
/// alcanca nenhuma outra leitura do app. Um filtro de tela seria o recorte
/// migrando para o cliente — e o cliente e onde ele nao pode estar.
///
/// ## OS DOIS ESTADOS VAZIOS, e eles sao diferentes de proposito
///
/// `items: []` tem duas causas, e a pessoa precisa saber qual:
///
/// - **ninguem publicou ainda** (ela tem conexao, ou publicou algo): a lista
///   vazia e temporaria, e o texto diz isso;
/// - **ela nao tem conexao nenhuma e nao publicou nada**: a lista vazia e
///   estrutural, e dizer "quando alguem publicar aparece aqui" seria mentir —
///   nao ha ninguem de quem esperar.
///
/// A distincao sai de `listMyPublications`, que **nao depende de conexao**: se
/// ela tambem vem vazia, a pessoa nao publicou nada. E por isso que esta tela
/// faz DUAS leituras e nao uma.
///
/// ## O TEXTO NAO PROMETE AVISO, e isso continua medido
///
/// Nenhuma frase desta tela diz "a gente te avisa": o envio de push esta
/// bloqueado em producao por falta de permissao da conta de servico, e a rota de
/// contagem da caixa de notificacoes nem esta no contrato. O sino esta na barra;
/// o aviso nao esta.
///
/// ## A BARRA DE LISTAGEM NAO E DESENHADA, e isso e o padrao sendo OBEDECIDO
///
/// As tres regras de `barra_de_listagem.dart`, aplicadas: nao existe rota de
/// busca de publicacao (campo que mente sobre o alcance e pior que campo
/// ausente); uma linha do tempo tem UMA ordem (mais recente primeiro, e uma
/// opcao nao e uma escolha); e nao ha grupo de filtro que o servidor aceite. Com
/// os tres ausentes o componente devolveria `SizedBox.shrink()` sozinho — entao
/// ele nao e chamado. **No dia em que o servidor oferecer um recorte, a barra
/// aparece no lugar padrao, sem desenho novo.**
class CorpoDoMural extends StatefulWidget {
  const CorpoDoMural({required this.leitura, super.key, this.aoDenunciar, this.aoApagar});

  /// A leitura, por interface ESTREITA: esta tela nao alcanca `publicar` nem
  /// `apagar` por aqui. Quem publica e a tela de publicar, aberta pela acao
  /// flutuante.
  final LeituraDoMural leitura;

  /// Abre a denuncia de uma publicacao de OUTRA pessoa. Nulo nao desenha a
  /// opcao — `reportPublication` existe no contrato, e quem a liga na tela e
  /// quem montar a folha de denuncia; ate la a opcao **nao nasce**, em vez de
  /// nascer sem destino (criterio 2 da BICHUS-62).
  final void Function(PublicacaoDaLinha)? aoDenunciar;

  /// Apaga a PROPRIA publicacao. Nulo nao desenha a opcao, pelo mesmo motivo.
  final Future<void> Function(PublicacaoDaLinha)? aoApagar;

  static const String tituloSemConexao = 'Comece pelas suas conexões';
  static const String explicacaoSemConexao =
      'O Mural mostra o que as suas conexões publicam. Você ainda não tem '
      'nenhuma — e também pode publicar, que aparece aqui para elas.';

  static const String tituloSemPublicacao = 'As publicações ficam aqui';
  static const String explicacaoSemPublicacao =
      'Quando as suas conexões publicarem, as publicações aparecem aqui.';

  /// O rotulo da foto para quem usa leitor de tela **quando quem publicou nao
  /// escreveu uma descricao**.
  ///
  /// Generico, e **nao `ExcludeSemantics`**: quem nao ve precisa saber que ha
  /// uma foto ali, mesmo sem saber o que ela mostra. Esconder a imagem do leitor
  /// apagaria metade da publicacao para essa pessoa.
  static const String fotoSemDescricao = 'Foto da publicação';

  @override
  State<CorpoDoMural> createState() => _CorpoDoMuralState();
}

class _CorpoDoMuralState extends State<CorpoDoMural> {
  List<PublicacaoDaLinha>? _linha;

  /// Se a propria pessoa tem alguma publicacao. **E ele que escolhe qual estado
  /// vazio desenhar** — ver o cabecalho.
  bool _tenhoPublicacao = false;

  bool _carregando = true;
  MensagemDeErro? _faixa;

  @override
  void initState() {
    super.initState();
    unawaitedCarregar();
  }

  /// Sem `unawaited` de `dart:async` para nao acrescentar import por uma linha;
  /// o nome diz o que esta acontecendo.
  void unawaitedCarregar() {
    _carregar();
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _faixa = null;
    });
    try {
      // AS DUAS LEITURAS. A segunda nao e luxo: sem ela os dois estados vazios
      // ficam indistinguiveis, e a tela escolheria a frase errada em metade dos
      // casos. Ver o cabecalho.
      final linha = await widget.leitura.linhaDoTempo();
      final minhas = await widget.leitura.minhasPublicacoes();
      if (!mounted) return;
      setState(() {
        _linha = linha.itens;
        _tenhoPublicacao = minhas.itens.isNotEmpty;
        _carregando = false;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _faixa = MensagensDeErro.de(falha);
      });
    }
  }

  /// Recarrega, para quem publicou agora. Publico porque a acao flutuante vive
  /// em `AbaMural`, fora desta arvore.
  Future<void> recarregar() => _carregar();

  @override
  Widget build(BuildContext context) {
    final faixa = _faixa;
    final linha = _linha;

    if (faixa != null) {
      return Padding(
        padding: const EdgeInsets.only(bottom: BichuEspaco.e4),
        child: FaixaDeAviso(texto: faixa.texto),
      );
    }

    if (_carregando || linha == null) {
      return const Padding(
        padding: EdgeInsets.all(BichuEspaco.e6),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (linha.isEmpty) {
      // OS DOIS ESTADOS VAZIOS. **Sem acao**, nos dois: a porta de publicar e a
      // acao flutuante da secao, que esta sempre no canto — um segundo botao
      // aqui seria a mesma porta em dois lugares, e o `EstadoVazio` com acao
      // repetida e o criterio 2 sendo quebrado dentro do componente que existe
      // para nao quebra-lo.
      return EstadoVazio(
        titulo: _tenhoPublicacao
            ? CorpoDoMural.tituloSemPublicacao
            : CorpoDoMural.tituloSemConexao,
        explicacao: _tenhoPublicacao
            ? CorpoDoMural.explicacaoSemPublicacao
            : CorpoDoMural.explicacaoSemConexao,
        acao: null,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        for (final publicacao in linha) ...<Widget>[
          _CartaoDaPublicacao(
            publicacao: publicacao,
            aoDenunciar: widget.aoDenunciar,
            aoApagar: widget.aoApagar == null
                ? null
                : () async {
                    await widget.aoApagar!(publicacao);
                    await _carregar();
                  },
          ),
          const SizedBox(height: BichuEspaco.e4),
        ],
      ],
    );
  }
}

/// Um cartao da linha do tempo.
///
/// ## O QUE ELE NAO DESENHA, e cada ausencia tem dono
///
/// - **nenhuma foto de pessoa.** `PublicationAuthor` nao tem o campo, porque a
///   Emenda 3 do ADR-0010 abriu `photo_icon_url` em
///   `Conversation.participants[]` *"e em mais nenhuma resposta deste
///   contrato"*. O autor aparece pelo NOME, e so;
/// - **nenhum pet**: nem nome, nem miniatura, nem link. Foto de pet dentro da
///   foto da publicacao e permitida (cliente, 19/10); LIGAR a ficha dele
///   agruparia os pets de um tutor (item 7 do ADR-0010), e nao ha campo que o
///   permita;
/// - **nenhuma curtida e nenhum contador.** O cliente decidiu "curtir e
///   comentar" para a primeira versao, e as duas **nao foram construidas**:
///   nao ha tabela, nao ha operacao e nao ha campo. Desenhar um coracao que nao
///   conta nada seria uma acao sem destino;
/// - **nenhum lugar** (ADR-0006).
class _CartaoDaPublicacao extends StatelessWidget {
  const _CartaoDaPublicacao({
    required this.publicacao,
    required this.aoDenunciar,
    required this.aoApagar,
  });

  final PublicacaoDaLinha publicacao;
  final void Function(PublicacaoDaLinha)? aoDenunciar;
  final Future<void> Function()? aoApagar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final imagem = publicacao.imagem;
    final urlDaImagem = imagem?.url;

    return Container(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  publicacao.autor.nomeExibido,
                  style: textos.titleMedium,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              _menu(context),
            ],
          ),
          const SizedBox(height: BichuEspaco.e2),

          // O TEXTO, como a pessoa escreveu. Sem recorte, sem "ver mais" e sem
          // nenhum tratamento de conteudo: ele cabe em 280 caracteres, e o
          // cliente mandou deixa-lo livre.
          Text(publicacao.texto, style: textos.bodyLarge),

          if (urlDaImagem != null && urlDaImagem.isNotEmpty) ...<Widget>[
            const SizedBox(height: BichuEspaco.e4),
            // `ImagemDaRede` e nunca `Image.network` cru: ela trata
            // `cacheWidth` pelo que a tela PINTA e tem `errorBuilder` sempre.
            // A derivada e a `card` de 1024 x 1024 (1:1), e o cartao a desenha
            // na largura do corpo — por isso `proporcao: 1`, que e o que faz a
            // altura ser reservada antes de os bytes chegarem e a rolagem nao
            // saltar.
            ImagemDaRede(
              url: urlDaImagem,
              descricao: (imagem?.textoAlternativo?.trim().isNotEmpty ?? false)
                  ? imagem!.textoAlternativo!.trim()
                  : CorpoDoMural.fotoSemDescricao,
              proporcao: 1,
            ),
          ],
        ],
      ),
    );
  }

  /// O `⋮` do cartao: **`Apagar` na propria, `Denunciar` na de outra pessoa, e
  /// nunca as duas.**
  ///
  /// Quem decide e `publicacao.minha`, que vem do SERVIDOR como coluna
  /// calculada — e nao de uma comparacao de apelido nesta camada: a tela nao tem
  /// o apelido de quem chama em toda rolagem, e comparar aqui seria a
  /// autorizacao migrando para o cliente.
  ///
  /// **Denunciar a propria publicacao nao existe**, e isso e produto e nao
  /// economia: o caminho para o proprio conteudo e apaga-lo, que e imediato, e o
  /// servidor responde `400 own_content` a quem tentar. Oferecer as duas seria
  /// desenhar um controle cujo unico desfecho e um erro.
  Widget _menu(BuildContext context) {
    final opcoes = <PopupMenuEntry<String>>[
      if (publicacao.minha && aoApagar != null)
        const PopupMenuItem<String>(value: 'apagar', child: Text('Apagar')),
      if (!publicacao.minha && aoDenunciar != null)
        const PopupMenuItem<String>(value: 'denunciar', child: Text('Denunciar')),
    ];
    // **Menu sem opcao nao nasce.** Um `⋮` que abre uma folha vazia e um toque
    // que termina em nada.
    if (opcoes.isEmpty) return const SizedBox.shrink();

    return PopupMenuButton<String>(
      // O nome acessivel do alvo. Sem ele o leitor de tela anuncia so "botao".
      tooltip: 'Opções da publicação',
      itemBuilder: (_) => opcoes,
      onSelected: (escolha) {
        if (escolha == 'apagar') {
          aoApagar?.call();
          return;
        }
        aoDenunciar?.call(publicacao);
      },
    );
  }
}
