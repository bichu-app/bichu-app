import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_loja.dart';
import '../../escopo.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_listagem.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../casca_com_abas.dart';

/// `Loja` — a vitrine curada que leva a loja do parceiro.
///
/// A listagem de `GET /v1/store/items` (`listStoreItems`), com o topo de
/// listagem do app ([BarraDeListagem]). **Segunda tela a usar o componente**,
/// e foi nela que se mediu se ele generaliza.
///
/// ## O que esta tela NAO tem, e nenhuma ausencia e esquecimento
///
/// - **Nao ha carrinho, pedido, pagamento nem estado de compra.** Nao existe
///   no contrato, nao existe no banco e nao existe aqui (criterio 5 da
///   BICHUS-185). A Loja e uma vitrine de saida: a compra acontece no site do
///   parceiro.
/// - **Nao ha preco riscado, "de/por", desconto nem "menor preco".** Criterio
///   19. Comparacao e afirmacao sobre o mercado, e nos nao medimos o mercado.
/// - **Nao ha tela de detalhe.** O cartao leva para fora, que e o unico
///   destino que a vitrine tem.
/// - **Nao ha ordenacao por preco.** O preco e opcional e vence: a lista se
///   reordenaria sozinha sem ninguem mexer em nada, e "do mais barato" e
///   comparacao.
///
/// ## A saida e anunciada, e acontece no navegador do SISTEMA
///
/// O toque leva a pessoa para fora do Bichu, para um site que nao
/// controlamos. Ela **sabe antes de acontecer** e o destino e **nomeado**
/// ("Abrir na Cobasi"), nunca generico (consequencia 1 da BICHUS-185).
///
/// E abre em [LaunchMode.externalApplication], **nunca em webview embutida**:
/// uma webview com a nossa moldura em volta faz o Bichu parecer o vendedor,
/// mistura de quem e a responsabilidade e cria uma superficie em que a pessoa
/// digita dado de pagamento dentro de uma janela que parece nossa. Com preco
/// na tela isso pesa mais, nao menos.
///
/// **Nenhum identificador de pessoa entra na URL de saida** (criterio 4). A
/// tela abre `item.urlDeDestino` como o servidor a mandou, sem acrescentar um
/// parametro sequer -- e `saida_sem_dado_pessoal_test.dart` reprova se algum
/// aparecer.
class VitrineDaLoja extends StatefulWidget {
  const VitrineDaLoja({super.key});

  /// O vazio **sem nenhum recorte**: a vitrine ainda nao tem produto.
  static const String tituloDoVazio = 'A Loja está sendo montada';

  static const String explicacaoDoVazio =
      'O Bichu está escolhendo a dedo os produtos que valem a pena para o seu '
      'pet. Quando os primeiros entrarem, eles aparecem nesta lista.';

  /// O vazio **depois de recortar**. E outro estado: aqui existe vitrine, e
  /// foi a busca ou o filtro que a esvaziou.
  static const String tituloDoVazioFiltrado = 'Nada com esse recorte';

  static const String explicacaoDoVazioFiltrado =
      'Tente outra palavra ou tire o filtro para ver mais produtos.';

  /// O aviso que a Loja inteira carrega, e ele nao e opcional.
  ///
  /// Criterio 6: a compra e feita com o parceiro e o Bichu nao e o vendedor.
  /// **O texto final e de quem assina os termos**, e a pergunta esta na pauta
  /// de refinamento: o que esta aqui e a redacao de engenharia, para a tela
  /// nao ir ao ar sem o aviso.
  static const String avisoDeQueNaoSomosOVendedor =
      'A compra é feita no site do parceiro. O Bichu não é o vendedor e não '
      'controla preço, estoque nem entrega.';

  /// O que a linha de preco diz quando o preco venceu.
  ///
  /// **Nunca o valor acompanhado de aviso de que está velho.** "R$ 89,90
  /// (desatualizado)" é o pior dos dois mundos: a pessoa lê o número e ignora
  /// o adjetivo. O valor não chega do servidor, e esta frase ocupa o lugar
  /// dele.
  static const String precoNaoConfirmado = 'Preço não confirmado, veja no site do parceiro';

  static const String rotuloDeAtualizar = 'Atualizar';

  static const String exemploDaBusca = 'ração, coleira, shampoo';

  @override
  State<VitrineDaLoja> createState() => _VitrineDaLojaState();
}

/// Os desfechos de uma carga. Nenhum e "tela em branco", e nenhum e "lista
/// vazia por falha".
enum _Fase { carregando, lista, falha }

class _VitrineDaLojaState extends State<VitrineDaLoja> {
  _Fase _fase = _Fase.carregando;
  RecorteDaLoja _recorte = const RecorteDaLoja();
  PaginaDaLoja? _pagina;
  String? _textoDaFalha;

  /// O controlador da busca vive no ESTADO, e nao no `build`.
  ///
  /// Um controlador criado a cada `build` perderia o cursor e o texto a cada
  /// tecla, que e o defeito classico de campo de busca em lista que recarrega.
  final TextEditingController _buscaControlador = TextEditingController();

  bool _visivel = false;
  bool _cargaAgendada = false;

  @override
  void dispose() {
    _buscaControlador.dispose();
    super.dispose();
  }

  /// Recarrega quando a tela volta a aparecer, pelo mesmo mecanismo de `Perto`.
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!TickerMode.valuesOf(context).enabled) {
      _visivel = false;
      return;
    }
    if (_visivel) return;
    _visivel = true;
    _agendarCarga();
  }

  void _agendarCarga() {
    if (_cargaAgendada) return;
    _cargaAgendada = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _cargaAgendada = false;
      if (mounted) _carregar();
    });
  }

  Future<void> _carregar() async {
    if (!mounted) return;
    final escopo = Escopo.of(context);
    setState(() {
      _fase = _Fase.carregando;
      _textoDaFalha = null;
    });

    try {
      final pagina = await escopo.loja.listar(_recorte);
      if (!mounted) return;
      setState(() {
        _pagina = pagina;
        _fase = _Fase.lista;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.de(falha).texto;
        // A pagina anterior sai da tela, pela mesma razao de `Perto`: deixar
        // os cartoes antigos sob uma faixa de erro faria a lista afirmar um
        // recorte que ela nao conseguiu aplicar.
        _pagina = null;
        _fase = _Fase.falha;
      });
    } on FormatException catch (erro) {
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.servidorFora;
        _pagina = null;
        _fase = _Fase.falha;
      });
      debugPrint('Resposta da vitrine fora do contrato: $erro');
    }
  }

  void _trocarRecorte(RecorteDaLoja novo) {
    setState(() => _recorte = novo);
    _carregar();
  }

  @override
  Widget build(BuildContext context) {
    final pagina = _pagina;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        // O aviso vem ANTES da lista e fica sempre, inclusive no vazio e na
        // falha. Ele nao e um rodape: e a condicao para a vitrine existir.
        const _AvisoDoParceiro(),
        const SizedBox(height: BichuEspaco.e4),
        if (pagina != null)
          BarraDeListagem(
            total: pagina.total,
            substantivo: const SubstantivoDaListagem(
              singular: 'produto',
              plural: 'produtos',
            ),
            busca: _controleDeBusca(),
            filtro: _controleDeFiltro(),
            ordenacao: _controleDeOrdenacao(pagina),
          ),
        ..._corpo(),
      ],
    );
  }

  /// A busca. Alcance de SERVIDOR, porque `q` entrou no contrato desta rota.
  ///
  /// A diferenca em relacao a `Perto` e a rota, e nao o gosto: la o parametro
  /// nao existe e o campo por isso nao nasce. Aqui ele existe, entao o campo
  /// nasce e **nao mente sobre o alcance**.
  ControleDeBusca _controleDeBusca() {
    return ControleDeBusca(
      controlador: _buscaControlador,
      alcance: AlcanceDaBusca.servidor,
      exemplo: VitrineDaLoja.exemploDaBusca,
      rotulo: 'Buscar produto',
      aoMudar: (texto) {
        final limpo = texto.trim();
        // O termo de dois caracteres e o piso do contrato (`minLength: 2`).
        // Mandar um caractere so produziria um 400 a cada primeira tecla.
        if (limpo.isNotEmpty && limpo.length < 2) {
          // `setState` mesmo sem recarregar: a barra le o texto do
          // controlador para saber se o recorte esta ativo, e sem a
          // reconstrucao ela decidiria com o texto anterior.
          setState(() {});
          return;
        }
        _trocarRecorte(
          _recorte.com(
            termo: limpo,
            limparTermo: limpo.isEmpty,
            pagina: 1,
          ),
        );
      },
    );
  }

  /// O filtro: categoria, que e o unico recorte que a rota aceita alem da
  /// busca. Nada mais entra aqui sem entrar antes no contrato.
  ControleDeFiltro _controleDeFiltro() {
    return ControleDeFiltro(
      grupos: <GrupoDeFiltro>[
        GrupoDeFiltro(
          chave: 'category',
          titulo: 'Categoria',
          selecionado: _recorte.categoria?.codigo,
          opcoes: <OpcaoDeRecorte>[
            for (final c in CategoriaDaLoja.values)
              OpcaoDeRecorte(codigo: c.codigo, rotulo: c.rotulo),
          ],
        ),
      ],
      aoEscolher: (chave, codigo) {
        Navigator.of(context).pop();
        _trocarRecorte(
          _recorte.com(
            categoria: CategoriaDaLoja.porCodigo(codigo),
            limparCategoria: codigo == null,
            pagina: 1,
          ),
        );
      },
      aoLimpar: () {
        Navigator.of(context).pop();
        _trocarRecorte(_recorte.com(limparCategoria: true, pagina: 1));
      },
    );
  }

  /// A ordenacao, montada a partir do que **de fato** aconteceu.
  ///
  /// [PaginaDaLoja.ordemEfetiva] sai de `effective_sort`, que e a resposta do
  /// servidor sobre a ordem real. Ler `_recorte.ordem` aqui faria o controle
  /// afirmar a ordem PEDIDA sobre uma lista que pode ter saido em outra.
  ControleDeOrdenacao _controleDeOrdenacao(PaginaDaLoja pagina) {
    return ControleDeOrdenacao(
      opcoes: <OpcaoDeRecorte>[
        for (final o in OrdemDaLoja.values)
          OpcaoDeRecorte(codigo: o.codigo, rotulo: o.rotulo),
      ],
      efetiva: pagina.ordemEfetiva.codigo,
      aoEscolher: (codigo) => _trocarRecorte(
        _recorte.com(ordem: OrdemDaLoja.porCodigo(codigo), pagina: 1),
      ),
    );
  }

  List<Widget> _corpo() {
    if (_fase == _Fase.carregando) {
      return const <Widget>[
        _EsqueletoDeItem(),
        SizedBox(height: BichuEspaco.e3),
        _EsqueletoDeItem(),
      ];
    }

    final pagina = _pagina;
    if (_fase == _Fase.falha || pagina == null) {
      return <Widget>[
        FaixaDeAviso(
          texto: _textoDaFalha ?? MensagensDeErro.servidorFora,
          rotuloDaAcao: VitrineDaLoja.rotuloDeAtualizar,
          aoTocarNaAcao: _carregar,
        ),
      ];
    }

    if (pagina.itens.isEmpty) {
      // **Dois vazios, e eles dizem coisas diferentes.** Um diz que a vitrine
      // ainda nao tem produto; o outro diz que o recorte da pessoa e que nao
      // tem. Uma frase so mandaria embora quem so precisava apagar a busca.
      return <Widget>[
        if (_recorte.temRecorte)
          const EstadoVazio(
            titulo: VitrineDaLoja.tituloDoVazioFiltrado,
            explicacao: VitrineDaLoja.explicacaoDoVazioFiltrado,
          )
        else
          const EstadoVazio(
            titulo: VitrineDaLoja.tituloDoVazio,
            explicacao: VitrineDaLoja.explicacaoDoVazio,
          ),
      ];
    }

    return <Widget>[
      for (var i = 0; i < pagina.itens.length; i++) ...<Widget>[
        if (i > 0) const SizedBox(height: BichuEspaco.e3),
        CartaoDaLoja(item: pagina.itens[i]),
      ],
      const SizedBox(height: BichuEspaco.e4),
      _LinhaDaPagina(pagina: pagina),
    ];
  }
}

/// O aviso de que a compra e com o parceiro.
class _AvisoDoParceiro extends StatelessWidget {
  const _AvisoDoParceiro();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Text(
        VitrineDaLoja.avisoDeQueNaoSomosOVendedor,
        style: textos.bodySmall?.copyWith(color: cores.textPrimary),
      ),
    );
  }
}

/// `Mostrando 1 a 10 de 10`.
class _LinhaDaPagina extends StatelessWidget {
  const _LinhaDaPagina({required this.pagina});

  final PaginaDaLoja pagina;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final primeiro = (pagina.pagina - 1) * pagina.limite + 1;
    final ultimo = primeiro + pagina.itens.length - 1;

    return Text(
      'Mostrando $primeiro a $ultimo de ${pagina.total}',
      style: textos.bodySmall?.copyWith(color: cores.textSecondary),
    );
  }
}

/// O cartao de um item da vitrine.
///
/// **A unica acao e sair do app**, e ela e anunciada antes de acontecer.
class CartaoDaLoja extends StatelessWidget {
  const CartaoDaLoja({required this.item, super.key});

  final ItemDaLoja item;

  /// O rotulo do botao de saida.
  ///
  /// **Nomeia o destino e nao carrega valor monetario.** "Comprar por
  /// R$ 89,90" seria uma oferta nossa, e nos nao somos o vendedor (criterio
  /// 18).
  static String rotuloDeSaida(String parceiro) => 'Abrir na $parceiro';

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final linhaDoPreco = item.linhaDoPreco;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          if (item.urlDaImagem != null) ...<Widget>[
            ClipRRect(
              borderRadius: BorderRadius.circular(BichuRaio.md),
              child: Image.network(
                item.urlDaImagem!,
                height: 160,
                width: double.infinity,
                fit: BoxFit.cover,
                // Nome acessivel em portugues (criterio 11). A imagem do
                // produto nao acrescenta informacao ao titulo que ja esta
                // logo abaixo, e repetir os dois faz o leitor de tela dizer
                // a mesma coisa duas vezes.
                semanticLabel: 'Foto de ${item.titulo}',
                errorBuilder: (_, _, _) => const SizedBox.shrink(),
              ),
            ),
            const SizedBox(height: BichuEspaco.e3),
          ],
          Text(item.titulo, style: textos.titleMedium),
          const SizedBox(height: BichuEspaco.e1),
          Text(
            item.resumo,
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          ),
          const SizedBox(height: BichuEspaco.e2),
          Text(
            item.parceiro.nome,
            style: textos.labelMedium?.copyWith(color: cores.textSecondary),
          ),
          // O preco, quando ha. **Valor, rotulo e data no MESMO bloco e
          // simultaneamente**, sem interacao nenhuma (criterio 15): nao ha
          // dica de ferramenta, nao ha icone de informacao e nao ha secao
          // expansivel. Captura de tela e como isso circula.
          if (linhaDoPreco != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e2),
            Text(
              linhaDoPreco,
              style: textos.bodyMedium?.copyWith(color: cores.textPrimary),
            ),
          ] else if (item.estadoDoPreco == EstadoDoPreco.vencido) ...<Widget>[
            const SizedBox(height: BichuEspaco.e2),
            Text(
              VitrineDaLoja.precoNaoConfirmado,
              style: textos.bodySmall?.copyWith(color: cores.textSecondary),
            ),
          ],
          const SizedBox(height: BichuEspaco.e3),
          _BotaoDeSaida(item: item),
        ],
      ),
    );
  }
}

/// O botao que leva para fora, com o aviso de saida antes.
class _BotaoDeSaida extends StatelessWidget {
  const _BotaoDeSaida({required this.item});

  final ItemDaLoja item;

  Future<void> _sair(BuildContext context) async {
    final confirmou = await showDialog<bool>(
      context: context,
      builder: (contexto) => AlertDialog(
        title: const Text('Você vai sair do Bichu'),
        content: Text(
          'O produto abre no site ${item.parceiro.nome} '
          '(${item.parceiro.host}), no navegador do seu aparelho. A compra é '
          'feita lá, com o parceiro.',
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(contexto).pop(false),
            child: const Text('Ficar aqui'),
          ),
          TextButton(
            onPressed: () => Navigator.of(contexto).pop(true),
            child: Text(CartaoDaLoja.rotuloDeSaida(item.parceiro.nome)),
          ),
        ],
      ),
    );
    if (confirmou != true) return;

    // **Navegador do SISTEMA, nunca webview embutida.** Uma webview com a
    // nossa moldura em volta faz o Bichu parecer o vendedor. A URL vai como o
    // servidor a mandou: nenhum parametro e acrescentado aqui.
    await launchUrl(
      Uri.parse(item.urlDeDestino),
      mode: LaunchMode.externalApplication,
    );
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: BichuAlvoDeToque.min,
      child: OutlinedButton(
        onPressed: () => _sair(context),
        child: Text(CartaoDaLoja.rotuloDeSaida(item.parceiro.nome)),
      ),
    );
  }
}

/// O esqueleto de carregamento, na altura de um cartao.
class _EsqueletoDeItem extends StatelessWidget {
  const _EsqueletoDeItem();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Container(
      width: double.infinity,
      height: 200,
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
      ),
    );
  }
}
