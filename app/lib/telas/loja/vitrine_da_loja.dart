import 'dart:async';

import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_loja.dart';
import '../../dispositivo/saida_do_app.dart';
import '../../escopo.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_listagem.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/rodape_da_paginacao.dart';
import '../casca_com_abas.dart';
import 'produto_da_loja.dart';

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
/// E abre no navegador do SISTEMA, **nunca em webview embutida**: uma webview
/// com a nossa moldura em volta faz o Bichu parecer o vendedor, mistura de quem
/// e a responsabilidade e cria uma superficie em que a pessoa digita dado de
/// pagamento dentro de uma janela que parece nossa. Com preco na tela isso pesa
/// mais, nao menos. O modo externo e escolhido por [SaidaDoApp.abrirLink], a
/// mesma porta que a `Rede` usa para o link do convite -- a tela nao fala com o
/// plugin de aparelho, e por isso a saida e testavel sem aparelho.
///
/// ## Tres estados de saida, e eles sao tres
///
/// 1. **Destino `https` utilizavel**: o botao existe, avisa e abre fora.
/// 2. **Destino ausente ou de outro esquema** (`http`, `intent:`,
///    `javascript:`, `tel:`): o botao **nao e desenhado**. Nao ha mensagem,
///    porque nao ha o que a pessoa possa fazer a respeito -- e um produto mal
///    cadastrado, e o lugar do conserto e o painel.
/// 3. **O sistema nao abriu**: uma linha, e a lista continua onde estava.
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

  /// Quando o aparelho nao abre o link. **Uma linha**, e e a mesma frase que a
  /// `Rede` usa para o convite: duas redacoes para a mesma falha sao duas
  /// frases para alguem traduzir diferente depois.
  static const String falhaAoAbrirOLink = 'Não conseguimos abrir o link.';

  static const String rotuloDeAtualizar = 'Atualizar';


  /// A frase do fim da lista (paragrafo 11.20), no plural e no singular.
  ///
  /// Nao diz "desta região" como a de `Perto`: a vitrine e a mesma para todo
  /// mundo, e nao ha recorte geografico nenhum nesta rota.
  static String fimDaLista(int total) => total == 1
      ? 'Você viu o único produto da vitrine.'
      : 'Você viu todos os $total produtos da vitrine.';

  /// Quando a pagina seguinte nao chega. A lista ja carregada **fica**.
  static const String falhaAoCarregarMais =
      'Não foi possível carregar mais produtos.';

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

  /// O vocabulario dos dois niveis (`GET /v1/store/taxonomy`).
  ///
  /// **Nao bloqueia a lista, e a falha dele nao e falha da tela.** Sem
  /// vocabulario o grupo de filtro de categoria simplesmente nao aparece, e a
  /// vitrine carrega igual: o rotulo de cada cartao vem do proprio item
  /// (`category_label`), nao daqui.
  TaxonomiaDaLoja _taxonomia = TaxonomiaDaLoja.vazia;

  /// Os itens de **todas** as paginas ja pedidas, na ordem em que chegaram.
  ///
  /// `_pagina.itens` tem so a ultima pagina, e desenhar a lista a partir dela
  /// e o defeito que esta tela tinha: a pagina 2 substituiria a 1 em vez de
  /// continuar.
  final List<ItemDaLoja> _itens = <ItemDaLoja>[];

  /// A pagina seguinte esta em voo.
  bool _carregandoMais = false;

  /// Por que a pagina seguinte nao chegou. Nulo quando chegou.
  String? _falhaDeMais;

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
    unawaited(_carregarTaxonomia());
  }

  void _agendarCarga() {
    if (_cargaAgendada) return;
    _cargaAgendada = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _cargaAgendada = false;
      if (mounted) _carregar();
    });
  }

  /// Carrega a **primeira** pagina do recorte atual, sempre.
  ///
  /// A normalizacao do `page` nao e zelo: este metodo e chamado tambem pelo
  /// retorno a aba (`didChangeDependencies`) e pelo `Atualizar` da faixa de
  /// falha, e nesses dois caminhos `_recorte.pagina` pode estar em 3 por causa
  /// do `Carregar mais`. Sem ela, voltar para a aba pediria a pagina 3 e
  /// mostraria vinte itens do meio como se fossem a vitrine inteira -- e com
  /// um recorte pequeno a pagina 3 volta **vazia**, que e o "a lista ficou
  /// vazia sem motivo" que ninguem consegue reproduzir.
  /// Pede o vocabulario UMA vez por tela, e em silencio.
  ///
  /// Nao entra em `_carregar`: aquele metodo roda a cada troca de recorte e a
  /// cada volta para a aba, e o vocabulario so muda por migracao -- pedir de
  /// novo seria carga que existe para ser descartada. A resposta e cacheavel
  /// por 24 h, entao a segunda abertura do app nem sai do aparelho.
  Future<void> _carregarTaxonomia() async {
    if (!mounted || _taxonomia.categorias.isNotEmpty) return;
    final escopo = Escopo.of(context);
    try {
      final taxonomia = await escopo.loja.taxonomia();
      if (!mounted) return;
      setState(() => _taxonomia = taxonomia);
    } on FalhaDeChamada catch (_) {
      // Silencio deliberado: o filtro de categoria deixa de ser oferecido, e
      // nada mais na tela depende disto. Uma faixa de erro aqui falaria de uma
      // lista que a pessoa nao pediu.
    } on FormatException catch (erro) {
      debugPrint('Resposta da taxonomia fora do contrato: $erro');
    }
  }

  Future<void> _carregar() async {
    if (!mounted) return;
    final escopo = Escopo.of(context);
    final recorte = _recorte.pagina == 1 ? _recorte : _recorte.com(pagina: 1);
    setState(() {
      _recorte = recorte;
      _fase = _Fase.carregando;
      _textoDaFalha = null;
      _falhaDeMais = null;
      _carregandoMais = false;
      _itens.clear();
    });

    try {
      final pagina = await escopo.loja.listar(recorte);
      if (!mounted) return;
      setState(() {
        _pagina = pagina;
        _itens
          ..clear()
          ..addAll(pagina.itens);
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

  /// Pede a pagina seguinte e **acrescenta** o que vier.
  ///
  /// A falha aqui nao apaga a vitrine, ao contrario da falha da pagina 1. Na
  /// pagina 1 o recorte mudou e os cartoes antigos seriam a resposta errada;
  /// aqui o recorte e o mesmo, e os itens na tela continuam sendo a resposta
  /// certa para ele.
  Future<void> _carregarMais() async {
    if (!mounted || _carregandoMais) return;
    final atual = _pagina;
    if (atual == null) return;

    final escopo = Escopo.of(context);
    final proximo = _recorte.com(pagina: atual.pagina + 1);
    setState(() {
      _carregandoMais = true;
      _falhaDeMais = null;
    });

    try {
      final pagina = await escopo.loja.listar(proximo);
      if (!mounted) return;
      setState(() {
        _recorte = proximo;
        _pagina = pagina;
        _itens.addAll(pagina.itens);
        _carregandoMais = false;
      });
    } on FalhaDeChamada catch (_) {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falhaDeMais = VitrineDaLoja.falhaAoCarregarMais;
      });
    } on FormatException catch (erro) {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falhaDeMais = VitrineDaLoja.falhaAoCarregarMais;
      });
      debugPrint('Resposta da vitrine fora do contrato: $erro');
    }
  }

  @override
  Widget build(BuildContext context) {
    final pagina = _pagina;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        // O aviso vem ANTES da lista e fica sempre, inclusive no vazio e na
        // falha. Ele nao e um rodape: e a condicao para a vitrine existir.
        const AvisoDoParceiroDaLoja(),
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
      rotulo: 'Buscar produto',
      termoAplicado: _recorte.termo,
      // O piso do contrato (`minLength: 2`). Ele deixou de ser um `setState`
      // que engolia a primeira tecla: agora a lupa nao habilita abaixo dele,
      // e o `setState` que remendava o recorte ativo saiu junto -- a barra le
      // o termo APLICADO e nao precisa mais de quem a avise.
      minimoDeCaracteres: 2,
      aoAplicar: (termo) => _trocarRecorte(
        _recorte.com(
          termo: termo,
          limparTermo: termo == null,
          pagina: 1,
        ),
      ),
    );
  }

  /// O filtro: categoria e, **dentro dela**, subcategoria.
  ///
  /// ## Dois grupos, e o segundo so existe depois do primeiro
  ///
  /// O grupo de subcategoria **nao aparece** enquanto nao ha categoria
  /// escolhida, e tambem nao aparece quando a categoria escolhida ainda nao
  /// tem arvore de segundo nivel levantada (gato, passaro, peixe e outros, em
  /// 17/10). Mostrar as 83 subcategorias de uma vez devolveria a pessoa ao
  /// problema que os dois niveis existem para resolver; mostrar um grupo vazio
  /// pareceria defeito.
  ///
  /// As opcoes vem de `GET /v1/store/taxonomy`, e nao de lista neste binario:
  /// o vocabulario e dado desde 17/10, e um `enum` aqui faria acrescentar
  /// subcategoria exigir um APK.
  ControleDeFiltro _controleDeFiltro() {
    final subcategorias = _taxonomia.subcategoriasDe(_recorte.categoria);
    return ControleDeFiltro(
      grupos: <GrupoDeFiltro>[
        // Sem vocabulario carregado o grupo nao nasce: um grupo de filtro sem
        // opcao e um controle que nao faz nada.
        if (_taxonomia.categorias.isNotEmpty)
          GrupoDeFiltro(
            chave: 'category',
            titulo: 'Categoria',
            selecionado: _recorte.categoria,
            opcoes: <OpcaoDeRecorte>[
              for (final c in _taxonomia.categorias)
                OpcaoDeRecorte(codigo: c.codigo, rotulo: c.rotulo),
            ],
          ),
        if (subcategorias.isNotEmpty)
          GrupoDeFiltro(
            chave: 'subcategory',
            titulo: 'Subcategoria',
            // As opcoes sao as da categoria APLICADA. Com a escolha virando
            // pendente, trocar a categoria na folha solta esta e esconde o
            // grupo -- sem isso o par (categoria nova, subcategoria antiga)
            // iria junto para a rota e a lista voltaria vazia.
            dependeDe: 'category',
            selecionado: _recorte.subcategoria,
            opcoes: <OpcaoDeRecorte>[
              for (final s in subcategorias)
                OpcaoDeRecorte(codigo: s.codigo, rotulo: s.rotulo),
            ],
          ),
      ],
      // Os dois niveis de uma vez, no `Aplicar`. Trocar a categoria LIMPA a
      // subcategoria, e a regra continua morando em `RecorteDaLoja.com`: a
      // subcategoria antiga pertence a categoria antiga, e o par produziria
      // uma lista vazia que a pessoa nao sabe explicar.
      aoAplicar: (escolhas) {
        final categoria = escolhas['category'];
        final subcategoria = escolhas['subcategory'];
        _trocarRecorte(
          _recorte.com(
            categoria: categoria,
            limparCategoria: categoria == null,
            subcategoria: subcategoria,
            limparSubcategoria: subcategoria == null,
            pagina: 1,
          ),
        );
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

    if (_itens.isEmpty) {
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
      for (var i = 0; i < _itens.length; i++) ...<Widget>[
        if (i > 0) const SizedBox(height: BichuEspaco.e3),
        CartaoDaLoja(item: _itens[i]),
      ],
      const SizedBox(height: espacoAcimaDoRodape),
      RodapeDaPaginacao(
        carregados: _itens.length,
        total: pagina.total,
        carregando: _carregandoMais,
        textoDaFalha: _falhaDeMais,
        fimDaLista: VitrineDaLoja.fimDaLista,
        aoPedirMais: _carregarMais,
      ),
    ];
  }
}

/// O aviso de que a compra e com o parceiro.
///
/// **Publico porque a tela de detalhe o reusa.** Ele nao e um rodape nem um
/// enfeite da lista: e a condicao para a vitrine existir (criterio 6 da
/// BICHUS-185), e a pagina de um produto so precisa dele mais, e nao menos --
/// la o preco aparece sozinho, sem os outros cartoes em volta lembrando que
/// aquilo e uma vitrine de saida. Uma segunda copia do texto criaria duas
/// redacoes para a mesma afirmacao juridica.
class AvisoDoParceiroDaLoja extends StatelessWidget {
  const AvisoDoParceiroDaLoja({super.key});

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

/// O cartao de um item da vitrine.
///
/// **Dois gestos, e eles nao disputam a mesma area.**
///
/// - **Tocar no cartao abre o detalhe do produto** (`TelaDoProduto`), dentro
///   do Bichu, sob o ramo da `Loja`: a barra de abas continua e voltar devolve
///   esta vitrine com a busca e o filtro de quem estava lendo.
/// - **Tocar no botao `Abrir na <parceiro>` sai do app**, com o aviso antes,
///   como sempre foi.
///
/// O botao e FILHO do cartao, e o toque dele nao chega ao cartao: o teste de
/// acerto do Flutter entrega o gesto ao alvo mais interno, e `OutlinedButton`
/// e `TextButton` (o `Ler mais`) consomem o proprio toque. Nao ha area em que
/// o gesto seja ambiguo -- e por isso a saida nao e um toque no cartao
/// inteiro, que era o desenho de antes: la a vitrine tinha UM destino e ele
/// era para fora; agora ha dois, e o de fora ficou com o controle que o
/// nomeia.
///
/// **O que o cartao mostra continua sendo o resumo.** A galeria inteira, a
/// descricao sem corte e a ficha do produto moram no detalhe: a lista carrega
/// so `image_url` de proposito, e trazer oito imagens por cartao pesaria a
/// vitrine para quem esta comparando produtos.
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

    // `Material` + `InkWell`, e nao `GestureDetector` sobre o `Container`: o
    // respingo de tinta e pintado no `Material` mais proximo, e sem este o
    // efeito nasceria ATRAS da superficie opaca do cartao -- toque sem
    // resposta visivel, que e o defeito que faz a pessoa tocar de novo.
    return Material(
      color: cores.surface,
      borderRadius: BorderRadius.circular(BichuRaio.lg),
      child: InkWell(
        onTap: () => TelaDoProduto.abrir(context, item.slug),
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(BichuEspaco.e4),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(BichuRaio.lg),
            border: Border.all(
              color: cores.outline,
              width: BichuBorda.hairline,
            ),
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
                    // Nome acessivel em portugues (criterio 11): o texto que o
                    // administrador escreveu, e `Foto de <titulo>` quando ele nao
                    // escreveu. A escolha e de `ItemDaLoja.nomeDaImagem`, e nao
                    // daqui: ate 17/10/2026 esta linha montava a frase generica e
                    // o texto do painel nunca chegava a ninguem.
                    semanticLabel: item.nomeDaImagem,
                    errorBuilder: (_, _, _) => const SizedBox.shrink(),
                  ),
                ),
                const SizedBox(height: BichuEspaco.e3),
              ],
              // A classificacao vem ANTES do titulo, e em corpo menor: ela e o
              // contexto do produto, nao o nome dele. Depois do titulo ela
              // disputaria a leitura com o resumo, que e a frase que vende.
              //
              // **Ate 17/10/2026 o cartao nao mostrava categoria nenhuma** -- o
              // dado chegava na resposta e nao aparecia em lugar nenhum da tela. A
              // decisao dos dois niveis e o que trouxe a linha para ca.
              if (item.linhaDaClassificacao case final String classificacao) ...<Widget>[
                Text(
                  classificacao,
                  style: textos.labelMedium?.copyWith(color: cores.textSecondary),
                ),
                const SizedBox(height: BichuEspaco.e1),
              ],
              Text(item.titulo, style: textos.titleMedium),
              const SizedBox(height: BichuEspaco.e1),
              // O resumo com "Ler mais" (lote anterior de 17/10). O ramo dos
              // dois niveis nasceu antes dele e trazia um `Text` simples aqui;
              // o que ele acrescenta e a linha acima, nao a troca deste.
              _ResumoDoProduto(item: item),
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
              // O botao so existe com destino `https` utilizavel. Sem ele o
              // cartao termina no preco: um produto mal cadastrado continua
              // navegavel -- tocar no cartao ainda abre o detalhe -- e nao
              // ganha um botao que nao leva a lugar nenhum.
              if (item.destinoExterno case final Uri destino) ...<Widget>[
                const SizedBox(height: BichuEspaco.e3),
                BotaoDeSaidaDaLoja(item: item, destino: destino),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// A descricao do produto no cartao: **os 500 primeiros caracteres, com um
/// botao para ler o resto no lugar** (decisao do cliente de 17/10/2026).
///
/// ## Por que nao `maxLines` com reticencias
///
/// `maxLines` corta pelo que CABE na largura do aparelho, e nao pelo texto:
/// o mesmo produto mostraria trechos diferentes em telas diferentes, e nao
/// haveria como dizer "500 caracteres". O corte por caractere, no ultimo
/// espaco, mora em `ItemDaLoja.trechoDoResumo` e e o mesmo em todo aparelho.
///
/// ## Recolhe, e isso e deliberado
///
/// A vitrine e uma LISTA. Um cartao expandido com 3000 caracteres empurra o
/// resto da vitrine para baixo, e sem como recolher a pessoa teria de rolar de
/// volta para seguir comparando produtos. Os rotulos sao de duas palavras:
/// "Ler mais" e "Ler menos".
///
/// ## Leitor de tela
///
/// Colapsado, o `Text` recebe o TRECHO como dado -- nao ha `semanticsLabel`
/// mentindo sobre o que esta na tela, e nao ha 3000 caracteres anunciados num
/// cartao de lista. O botao diz de qual produto ele e (`semanticsLabel`),
/// porque "Ler mais, botao" repetido numa lista de doze cartoes nao diz nada.
/// Expandido, o texto inteiro vira dado do mesmo `Text` e e lido ali.
///
/// A altura do cartao muda ao expandir, e o `ListView` mantem o deslocamento:
/// o conteudo ABAIXO desce, e o topo deste cartao fica onde estava. Nada aqui
/// rola a lista por conta propria, que seria o jeito de perder a posicao de
/// quem esta lendo.
class _ResumoDoProduto extends StatefulWidget {
  const _ResumoDoProduto({required this.item});

  final ItemDaLoja item;

  static const String lerMais = 'Ler mais';
  static const String lerMenos = 'Ler menos';

  @override
  State<_ResumoDoProduto> createState() => _ResumoDoProdutoState();
}

class _ResumoDoProdutoState extends State<_ResumoDoProduto> {
  bool _expandido = false;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final item = widget.item;
    final cabeInteiro = item.resumoCabeNoCartao;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          // A quebra de linha vai no valor, nos dois estados: `Text` a desenha.
          _expandido || cabeInteiro ? item.resumo : item.trechoDoResumo,
          style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
        ),
        // Nada escondido, nada de botao.
        if (!cabeInteiro) ...<Widget>[
          const SizedBox(height: BichuEspaco.e1),
          TextButton(
            onPressed: () => setState(() => _expandido = !_expandido),
            style: TextButton.styleFrom(
              padding: EdgeInsets.zero,
              minimumSize: const Size(0, BichuEspaco.e12),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              alignment: Alignment.centerLeft,
            ),
            child: Text(
              _expandido ? _ResumoDoProduto.lerMenos : _ResumoDoProduto.lerMais,
              semanticsLabel: _expandido
                  ? 'Ler menos da descrição de ${item.titulo}'
                  : 'Ler mais da descrição de ${item.titulo}',
              style: textos.labelLarge?.copyWith(color: cores.textPrimary),
            ),
          ),
        ],
      ],
    );
  }
}

/// O botao que leva para fora, com o aviso de saida antes.
///
/// Recebe a [destino] **ja conferida** por [ItemDaLoja.destinoExterno], e nao a
/// `String` do item: um widget que recebesse o texto cru poderia ser construido
/// com um destino que ninguem conferiu, e a conferencia voltaria a depender de
/// quem chama lembrar dela. Aqui o tipo cobra.
///
/// **Publico porque a tela de detalhe o reusa**, e reusar e o ponto: o aviso
/// de saida, o nome do destino, o `LaunchMode.externalApplication` (pela porta
/// `SaidaDoApp`) e a regra de nao acrescentar parametro a URL sao a mesma
/// decisao nos dois lugares. Reimplementar o botao na outra tela criaria um
/// segundo caminho de saida do app, e e o segundo caminho que esquece o aviso.
///
/// A pendencia que a branch da tela de detalhe anotou aqui ESTA RESOLVIDA
/// nesta mescla: a conferencia de `https` absoluto com host nao foi
/// reimplementada, e a versao com ela e a que vale -- os dois chamadores
/// (cartao e detalhe) so desenham o botao sob
/// `if (item.destinoExterno case final Uri destino)`.
class BotaoDeSaidaDaLoja extends StatelessWidget {
  const BotaoDeSaidaDaLoja({
    required this.item,
    required this.destino,
    super.key,
  });

  final ItemDaLoja item;

  /// `https` absoluto, com host. [CartaoDaLoja] nao desenha este widget sem um.
  final Uri destino;

  Future<void> _sair(BuildContext context) async {
    // O mensageiro e capturado ANTES de qualquer `await`: tanto o dialogo
    // quanto a abertura do navegador dao ao sistema a chance de tirar esta
    // tela da arvore (a pessoa troca de aba, o sistema recicla), e ler
    // `context` depois de um `await` e o defeito que o
    // `use_build_context_synchronously` existe para pegar.
    final mensageiro = ScaffoldMessenger.maybeOf(context);

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

    // **Navegador do SISTEMA, nunca webview embutida.** A porta escolhe
    // `LaunchMode.externalApplication` num lugar so, e devolve `false` em vez
    // de lancar quando o aparelho nao tem o que responder. A URL vai como o
    // servidor a mandou: nenhum parametro e acrescentado aqui.
    final abriu = await SaidaDoApp.atual.abrirLink(destino);
    if (abriu) return;

    // Nao abriu. Uma linha, e a vitrine fica onde estava: nao ha tela de erro,
    // nao ha nova tentativa automatica e nao ha explicacao de por que o
    // aparelho recusou -- a pessoa nao tem o que fazer com esse detalhe.
    mensageiro?.showSnackBar(
      const SnackBar(content: Text(VitrineDaLoja.falhaAoAbrirOLink)),
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
