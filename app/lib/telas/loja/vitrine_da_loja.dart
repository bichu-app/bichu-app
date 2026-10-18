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
import '../../widgets/carrossel_de_fotos.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/rodape_da_paginacao.dart';
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
  /// **NAO E MAIS DESENHADO EM LUGAR NENHUM** (pedido do cliente, 17/10/2026).
  ///
  /// A frase fica aqui porque e afirmacao de natureza juridica -- o criterio 6
  /// da BICHUS-185 a chamava de "condicao para a vitrine existir" --, e apagar
  /// o texto junto com o widget tiraria do repositorio a unica copia do que o
  /// produto afirmava a quem comprava. Quem reabrir a decisao encontra a
  /// redacao exata aqui.
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
        // O AVISO DO PARCEIRO SAIU, por pedido do cliente de 17/10/2026:
        // *"Remova o bloco a compra e feita no site do parceiro"*. Ele estava
        // aqui e na tela de detalhe, e saiu dos dois. O texto que deixou de
        // aparecer esta em `VitrineDaLoja.avisoDeQueNaoSomosOVendedor`, que
        // continua no arquivo de proposito: ele e afirmacao de natureza
        // juridica (criterio 6 da BICHUS-185), e apagar a frase junto com o
        // widget tiraria do repositorio a unica copia do que o produto
        // afirmava.
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
            aoAplicar: _aplicarAFolha,
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
    );
  }

  /// Os dois niveis **e a ordem** de uma vez, no `Aplicar`.
  ///
  /// Trocar a categoria LIMPA a subcategoria, e a regra continua morando em
  /// `RecorteDaLoja.com`: a subcategoria antiga pertence a categoria antiga, e
  /// o par produziria uma lista vazia que a pessoa nao sabe explicar.
  void _aplicarAFolha(EscolhaDaFolha escolha) {
    final categoria = escolha.filtros['category'];
    final subcategoria = escolha.filtros['subcategory'];
    _trocarRecorte(
      _recorte.com(
        categoria: categoria,
        limparCategoria: categoria == null,
        subcategoria: subcategoria,
        limparSubcategoria: subcategoria == null,
        ordem: OrdemDaLoja.porCodigo(escolha.ordem),
        pagina: 1,
      ),
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

/// O cartao de um item da vitrine: **foto, titulo e preco, e nada mais**.
///
/// A ordem, de cima para baixo: carrossel, a linha de apoio
/// [rotuloDePrecoDeReferencia], o titulo, a linha do preco e `Compre agora`.
/// A linha de apoio entrou em 18/10/2026, por pedido literal do cliente, e
/// **acima do nome** -- posicao dele, nao escolha de desenho. Ela so nasce
/// quando ha preco, e e `ExcludeSemantics`: ver a constante.
///
/// Decisao do cliente, 17/10/2026: *"Na listagem do produto, remova as
/// informacoes adicionais, descricoes. Deixe apenas a foto, titulo e preco,
/// como nos e-commerces tradicionais. Coloque o campo de preco em destaque"*.
///
/// **O que saiu**, e saiu nesta mesma mescla: a linha de classificacao
/// ("Rações · Ração seca"), o resumo com `Ler mais` e o nome do parceiro em
/// linha propria. O nome do parceiro nao sumiu do cartao -- ele continua no
/// nome acessivel do botao de saida, que e onde ele importa: e para la que a
/// pessoa vai.
///
/// **Um gesto, e ele vai para fora.** Ate 17/10 o cartao tinha dois destinos
/// (tocar no cartao abria o detalhe; o botao saia para o parceiro). O cliente
/// trocou isto no mesmo dia: *"remova o clique para entrar na pagina de
/// detalhes do produto e coloque para abrir o site do parceiro"*. Agora o
/// cartao inteiro e o botao levam ao MESMO lugar, e `TelaDoProduto` ficou sem
/// entrada -- parada por decisao dele, e nao por descuido.
///
/// **O preco em destaque e hierarquia, e nao cor.** Ele sobe de `body-md`
/// para `title-lg` com `w700`, nos tokens que ja existem: nenhuma cor nova,
/// nenhum componente novo. Em `text-primary`, como estava -- preco em cor de
/// acao pareceria um botao.
///
/// **ARRASTAR NAO SAI DA LOJA.** O carrossel entrou DENTRO do alvo de toque do
/// cartao, e o cartao inteiro agora e o unico destino -- o site do parceiro.
/// Sem cuidado, arrastar para ver a segunda foto abriria o navegador no meio
/// do gesto. Nao abre: o `PageView` do carrossel e o alvo mais interno e
/// reivindica o arrasto horizontal na arena de gestos do Flutter, enquanto o
/// `InkWell` do cartao responde por `onTap`, que so dispara quando o dedo sobe
/// sem ter virado arrasto. O autor do carrossel mediu isto no desenho ANTIGO,
/// em que o cartao levava ao detalhe interno; foi MEDIDO DE NOVO depois desta
/// mescla, porque o destino do cartao mudou e o gesto com ele. Ver
/// `app/test/telas/loja_abre_no_navegador_test.dart`.
///
/// O botao `Compre agora` tambem e filho do cartao e consome o proprio toque;
/// como ele leva ao MESMO destino, nao ha mais area de gesto ambigua.
///
/// **O cartao mostra as fotos, e a ficha nao tem mais entrada.** A descricao
/// sem corte, o preco com historico e a ficha moram em `TelaDoProduto`, que
/// ficou PARADA e nao apagada por decisao do cliente de 17/10: nada no
/// aplicativo navega para ela.
///
/// As fotos passaram a vir na listagem em 17/10/2026, por campo ADITIVO
/// (`StoreItemSummary.images`, opcional, com `image_url` intocado). O
/// paragrafo que estava aqui dizia que trazer oito imagens por cartao pesaria
/// a vitrine, e ele estava certo sobre os BYTES e errado sobre a causa: o que
/// pesa e BAIXAR as oito, nao recebe-las na lista. Medido em 17/10/2026, para
/// uma pagina cheia de 20 cartoes:
///
/// - o JSON da pagina vai de 12,9 KB para 32,7 KB (+19,9 KB) com 8 imagens por
///   item -- ao lado de UMA derivada de 500 KB, e troco;
/// - baixar as 8 de cada cartao pediria ate 78 MB, contra ate 9,8 MB da
///   primeira pintura.
///
/// Por isso o carrossel **carrega sob demanda** (`PageView.builder`): a
/// primeira pintura baixa uma imagem por cartao, exatamente como antes, e as
/// outras sete so saem da rede se a pessoa arrastar. Ver [CarrosselDeFotos].
class CartaoDaLoja extends StatelessWidget {
  const CartaoDaLoja({required this.item, super.key});

  final ItemDaLoja item;

  /// O rotulo do botao de saida.
  ///
  /// **"Compre agora", literal do cliente** (17/10/2026), no lugar de
  /// `Abrir na <parceiro>`. O nome do parceiro saiu do texto VISIVEL e foi
  /// para o nome acessivel, em [rotuloAcessivelDeSaida]: "Compre agora,
  /// botao" repetido em doze cartoes nao diz de qual produto e.
  static const String rotuloDeSaida = 'Compre agora';

  /// A mensagem de apoio que fica **acima do nome do produto**.
  ///
  /// Literal do cliente (18/10/2026): *"vamos colocar a mensagem preco de
  /// referencia, em cima do nome do produto"*.
  ///
  /// **Texto fixo do binario, e nao campo do servidor.** Nada foi acrescentado
  /// ao contrato por causa desta linha: `openapi.yaml` esta intocado. A mesma
  /// afirmacao ja viaja DENTRO de [ItemDaLoja.linhaDoPreco], montada no
  /// modelo -- aqui ela so ganha forma visivel antes do titulo.
  static const String rotuloDePrecoDeReferencia = 'Preço de referência';

  /// O nome acessivel do botao de saida: diz o produto e para onde leva.
  static String rotuloAcessivelDeSaida(ItemDaLoja item) =>
      '$rotuloDeSaida, ${item.titulo}, no site ${item.parceiro.nome}';

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final linhaDoPreco = item.linhaDoPreco;
    final destino = item.destinoExterno;

    // `Material` + `InkWell`, e nao `GestureDetector` sobre o `Container`: o
    // respingo de tinta e pintado no `Material` mais proximo, e sem este o
    // efeito nasceria ATRAS da superficie opaca do cartao -- toque sem
    // resposta visivel, que e o defeito que faz a pessoa tocar de novo.
    return Material(
      color: cores.surface,
      borderRadius: BorderRadius.circular(BichuRaio.lg),
      child: InkWell(
        // Sem destino utilizavel o cartao **nao e tocavel**: um produto mal
        // cadastrado continua na lista, com foto, titulo e preco, e nao ganha
        // um toque que nao leva a lugar nenhum.
        onTap: destino == null ? null : () => sairDaLoja(context, item, destino),
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
              // **O CARROSSEL** (17/10/2026). Com uma foto ele desenha a
              // mesma `Image` de antes, sem indicador e sem gesto; com varias
              // vira `PageView` que carrega sob demanda. Nome acessivel por
              // foto, pela reserva de `ImagemDoProduto.nomeDaImagem`.
              //
              // `fotosDoCartao` e nao `imagens`: o item que vem de servidor sem
              // `images`, ou da massa com imagem externa, cai na lista de um
              // elemento montada a partir de `image_url` -- e a tela tem um
              // caminho so para desenhar foto.
              if (item.fotosDoCartao.isNotEmpty) ...<Widget>[
                CarrosselDeFotos(
                  fotos: item.fotosDoCartao,
                  titulo: item.titulo,
                  altura: 160,
                ),
                const SizedBox(height: BichuEspaco.e3),
              ],
              // **"Preço de referência", ACIMA DO NOME** (18/10/2026, literal
              // do cliente). A ordem do cartao passa a ser: carrossel, esta
              // linha, titulo, linha do preco, `Compre agora`.
              //
              // **So nasce quando ha preco.** O rotulo e sobre o preco: num
              // cartao sem valor -- `linhaDoPreco` nula, ou preco vencido, que
              // desenha `precoNaoConfirmado` -- ele apontaria para nada, e
              // "Preço de referência" sobre um cartao sem preco nenhum e pior
              // que a ausencia da linha. Produto sem valor continua com foto,
              // titulo e botao, exatamente como estava.
              //
              // **E APOIO, e nao competidor do destaque.** `bodySmall`
              // (`caption`, 13/18, w400) em `textSecondary`, medido contra o
              // resto do cartao: o titulo e 18/24 w600 e o valor e 22/28 w700.
              // E o MESMO token em que estas mesmas palavras ja aparecem no
              // rabo da linha do preco, duas linhas abaixo -- as duas
              // aparicoes sao visivelmente a mesma coisa. Nenhum tamanho e
              // nenhuma cor literal entram aqui: so token.
              //
              // **`ExcludeSemantics` e acessibilidade, nao economia.** O
              // `ListView` da casca roda com `addSemanticIndexes: false`
              // (ver `casca_com_abas.dart`), entao cada filho deste `Column` e
              // um no de semantica PROPRIO. Um `Text` cru aqui seria anunciado
              // solto, "Preço de referência", antes do nome e sem dizer de que
              // preco fala -- quem nao ve ouviria o rotulo sem o valor. E nao
              // precisa ser anunciado de novo: `linhaDoPreco` ja carrega
              // "preço de referência" DENTRO do mesmo no de texto do numero
              // ("R$ 99,90 · preço de referência, consultado em ..."), que e
              // onde o leitor de tela precisa dele e onde ele nunca se separa
              // do valor (criterio 15 da BICHUS-185). Esta linha e reforco
              // VISUAL do que ja esta dito junto do preco.
              if (linhaDoPreco != null) ...<Widget>[
                ExcludeSemantics(
                  child: Text(
                    rotuloDePrecoDeReferencia,
                    style: textos.bodySmall?.copyWith(
                      color: cores.textSecondary,
                    ),
                  ),
                ),
                // `e1` e nao `e2`: a linha e rotulo DO titulo que vem abaixo, e
                // 4 px a amarram nele. Com `e2` ela flutuaria entre o carrossel
                // e o nome, sem pertencer a nenhum dos dois.
                const SizedBox(height: BichuEspaco.e1),
              ],
              Text(item.titulo, style: textos.titleMedium),
              // O preco, quando ha. **Valor, rotulo e data no MESMO bloco e
              // simultaneamente**, sem interacao nenhuma (criterio 15): nao ha
              // dica de ferramenta, nao ha icone de informacao e nao ha secao
              // expansivel. Captura de tela e como isso circula.
              if (linhaDoPreco != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e2),
                // **O DESTAQUE E DO VALOR, e a linha continua INTEIRA.**
                //
                // `ItemDaLoja.linhaDoPreco` e uma string so de proposito (o
                // criterio 15 da BICHUS-185: o numero nunca aparece sem o
                // rotulo e a data). Desenhar so `precoFormatado` em corpo
                // grande seria exatamente o que aquele comentario proibe.
                //
                // Entao o texto desenhado E a linha inteira, caractere por
                // caractere: o que muda e o ESTILO dos primeiros
                // `precoFormatado.length` caracteres. Um `Text.rich` com dois
                // trechos e um no de texto so -- nao ha estado em que o valor
                // apareca e o resto nao.
                Text.rich(
                  TextSpan(
                    children: <InlineSpan>[
                      TextSpan(
                        text: linhaDoPreco.substring(0, item.precoFormatado!.length),
                        style: textos.titleLarge?.copyWith(
                          color: cores.textPrimary,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      TextSpan(
                        text: linhaDoPreco.substring(item.precoFormatado!.length),
                        style: textos.bodySmall?.copyWith(
                          color: cores.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ] else if (item.estadoDoPreco == EstadoDoPreco.vencido) ...<Widget>[
                const SizedBox(height: BichuEspaco.e2),
                Text(
                  VitrineDaLoja.precoNaoConfirmado,
                  style: textos.bodySmall?.copyWith(color: cores.textSecondary),
                ),
              ],
              if (destino != null) ...<Widget>[
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

/// Sai do Bichu para o site do parceiro, **sem confirmacao**.
///
/// Decisao do cliente, 17/10/2026: *"Remova a confirmacao de sair do bichu
/// quando clica no produto"*. Ate aqui havia um `AlertDialog` ("Você vai sair
/// do Bichu") com `Ficar aqui` e o nome do parceiro; ele saiu, e **a pessoa
/// passa a ir para o navegador sem aviso nenhum**.
///
/// **O que NAO mudou, e a diferenca importa:** a porta [SaidaDoApp] continua
/// de pe, e continua sendo ela quem escolhe
/// `LaunchMode.externalApplication`. Quem tinha dialogo era este arquivo da
/// `Loja`, e so ele: os tres usos da `Rede` -- mapa, calendario e o link do
/// encontro -- chamam a mesma porta por caminhos proprios e **nao foram
/// tocados**. Tirar o aviso da porta teria mudado a `Rede` junto.
///
/// Funcao de nivel de biblioteca, e nao metodo do botao, porque o CARTAO
/// INTEIRO tambem sai agora: dois chamadores, uma implementacao.
Future<void> sairDaLoja(
  BuildContext context,
  ItemDaLoja item,
  Uri destino,
) async {
  // O mensageiro e capturado ANTES do `await`: abrir o navegador da ao
  // sistema a chance de tirar esta tela da arvore (a pessoa troca de aba, o
  // sistema recicla), e ler `context` depois de um `await` e o defeito que o
  // `use_build_context_synchronously` existe para pegar.
  final mensageiro = ScaffoldMessenger.maybeOf(context);

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

/// O botao que leva para fora.
///
/// Recebe a [destino] **ja conferida** por [ItemDaLoja.destinoExterno], e nao a
/// `String` do item: um widget que recebesse o texto cru poderia ser construido
/// com um destino que ninguem conferiu, e a conferencia voltaria a depender de
/// quem chama lembrar dela. Aqui o tipo cobra.
///
/// **Publico porque a tela de detalhe o reusa** -- e ela continua no codigo,
/// parada e sem entrada, por decisao do cliente de 17/10/2026.
///
/// O botao e FILHO do cartao e os dois levam ao mesmo lugar desde 17/10, entao
/// nao ha mais gesto ambiguo a resolver: o teste de acerto do Flutter entrega
/// o toque ao `OutlinedButton`, que o consome, e o cartao nao sai duas vezes.
class BotaoDeSaidaDaLoja extends StatelessWidget {
  const BotaoDeSaidaDaLoja({
    required this.item,
    required this.destino,
    super.key,
  });

  final ItemDaLoja item;

  /// `https` absoluto, com host. [CartaoDaLoja] nao desenha este widget sem um.
  final Uri destino;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: BichuAlvoDeToque.min,
      child: OutlinedButton(
        onPressed: () => sairDaLoja(context, item, destino),
        child: Text(
          CartaoDaLoja.rotuloDeSaida,
          // "Compre agora, botao" repetido em doze cartoes nao diz de qual
          // produto e nem para onde vai.
          semanticsLabel: CartaoDaLoja.rotuloAcessivelDeSaida(item),
        ),
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
