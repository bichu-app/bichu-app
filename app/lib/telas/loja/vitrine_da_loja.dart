import '../../widgets/arrastar_para_atualizar.dart';

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
  static const String precoNaoConfirmado =
      'Preço não confirmado, veja no site do parceiro';

  /// Quando o aparelho nao abre o link. **Uma linha**, e e a mesma frase que a
  /// `Rede` usa para o convite: duas redacoes para a mesma falha sao duas
  /// frases para alguem traduzir diferente depois.
  static const String falhaAoAbrirOLink = 'Não conseguimos abrir o link.';

  static const String rotuloDeAtualizar = 'Atualizar';

  /// O CONVITE DA VITRINE, **redacao do cliente (22/10/2026), literal**:
  /// *"Na pagina da loja inclua a frase: Ajude a mantermos o Bichu gratuito e
  /// ainda ganhe descontos comprando em nossas lojas parceiras. Adicione o
  /// cupom de desconto chamado: bichu"*.
  ///
  /// **A frase e dele palavra por palavra, inclusive `mantermos`.** Nao foi
  /// corrigida para `mantermos o Bichu` -> `manter o Bichu`: microcopia e
  /// decisao dele, e a concordancia da frase e redacao, nao defeito.
  ///
  /// **ELA NAO DESFAZ A REMOCAO DE 17/10.** O que saiu daquela vez foi
  /// [avisoDeQueNaoSomosOVendedor] -- *"Remova o bloco a compra e feita no site
  /// do parceiro"* --, que e afirmacao juridica sobre QUEM VENDE. Esta e outro
  /// texto, com outro assunto, pedido cinco dias depois. As duas decisoes
  /// coexistem: o aviso continua sem ser desenhado em lugar nenhum.
  static const String conviteDaVitrine =
      'Ajude a mantermos o Bichu gratuito e ainda ganhe descontos comprando '
      'em nossas lojas parceiras.';

  /// O cupom, e **o rotulo e meu** -- ele deu o codigo (`bichu`), nao a frase
  /// que o apresenta. Pode ser revisto por ele.
  ///
  /// **`bichu` em minuscula, exatamente como ele escreveu.** Cupom e codigo, e
  /// codigo nao se "arruma": quem digita no site do parceiro digita o que esta
  /// escrito aqui.
  ///
  /// **NAO HA CUPOM NO CONTRATO, e isto foi medido** -- `coupon` e `cupom` nao
  /// aparecem em `api/openapi.yaml`. Entao ele e texto desta tela e nao dado de
  /// servidor: nao ha validade, nao ha por-parceiro e nao ha como esta tela
  /// saber se ele ainda vale. Se ele passar a ter dono no servidor, o lugar de
  /// trocar e esta constante.
  static const String rotuloDoCupom = 'Cupom de desconto';
  static const String codigoDoCupom = 'bichu';

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

class _VitrineDaLojaState extends State<VitrineDaLoja>
    with PublicaAAtualizacao {
  /// A BUSCA QUE O ARRASTO REFAZ (cliente, 18/10/2026).
  ///
  /// **A mesma funcao do `Tentar de novo`**, e nao uma copia: duas buscas com
  /// dois nomes divergem na primeira correcao de filtro. Quem desenha a roda e
  /// a casca, por `SlotDeAtualizacao` -- ver
  /// `widgets/arrastar_para_atualizar.dart`.
  @override
  Future<void> aoArrastarParaAtualizar() => _carregar();

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
        // A BARRA DE LISTAGEM VEM PRIMEIRO (cliente, 28/10/2026), literal:
        // *"coloque a barra de busca acima do texto"*. "O texto" e o bloco do
        // convite com o cupom, que desde 22/10 era a primeira coisa do corpo.
        //
        // **ISTO CUMPRE O PADRAO DE LISTAGEM EM VIGOR, e nao o contraria.** O
        // padrao diz que busca, filtro e ordenacao ficam no topo do CORPO da
        // tela, nunca na barra de topo -- e eram justamente os 31 dp do
        // convite que se metiam entre o topo do corpo e os controles (medido:
        // o rotulo do cupom em `dy = 121` contra o campo de busca em
        // `dy = 152`). Com a troca, o primeiro controle do corpo e de novo a
        // busca, e ela continua FORA da barra de topo.
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
        // O CONVITE E O CUPOM (cliente, 22/10/2026). Ver
        // `VitrineDaLoja.conviteDaVitrine` para a redacao dele e para a razao
        // de isto NAO desfazer a remocao de 17/10.
        //
        // **FORA DO `if (pagina != null)`, e a posicao dele na lista nao muda
        // isso.** Ele desceu para debaixo da barra por pedido de 28/10, mas
        // continua NAO dependendo de `pagina`: a frase vale com a vitrine
        // carregada, vazia, filtrada ou em falha. Pendurado no `if` da barra
        // ele sumiria justamente nos estados em que nao ha produto na tela --
        // que e quando sobra espaco para ele. O `Column` desenha nesta ordem,
        // entao com a barra ausente o convite simplesmente sobe sozinho, sem
        // deixar vao.
        //
        // **O BLOCO INTEIRO DESCE, frase E cupom.** Separar os dois foi
        // recusado no desenho de 22/10 (ver `_ConviteComCupom`): a frase
        // promete o desconto e o cupom e como se obtem o desconto.
        const _ConviteComCupom(),
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
        _recorte.com(termo: termo, limparTermo: termo == null, pagina: 1),
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

  /// A afirmacao da mensagem de apoio que fica **acima do nome do produto**.
  ///
  /// Literal do cliente (18/10/2026): *"vamos colocar a mensagem preco de
  /// referencia, em cima do nome do produto"*.
  ///
  /// **Texto fixo do binario, e nao campo do servidor.** Nada foi acrescentado
  /// ao contrato por causa desta linha: `openapi.yaml` esta intocado.
  ///
  /// Sozinha ela e o rotulo de um item SEM data. Com data, o que a tela
  /// desenha e [rotuloDePrecoComData].
  static const String rotuloDePrecoDeReferencia = 'Preço de referência';

  /// `consultado em 14/03`, ou **nulo** quando o item nao tem data.
  ///
  /// **A redacao e a MESMA do rabo que saiu da linha do preco**, palavra por
  /// palavra, e a data sai da MESMA [dataCurta]. Nada aqui e formato novo: o
  /// rabo dizia `preço de referência, consultado em 14/03` depois do valor, e
  /// isto e aquilo sem o valor.
  ///
  /// **Dia e mes, sem ano, porque e o que o produto ja escrevia.** O motivo
  /// esta em [dataCurta]: um preco que vence em trinta dias nao cruza o ano de
  /// forma que o ano acrescente informacao. (Um dos dois argumentos de la --
  /// "tres numeros disputando a mesma leitura" -- valia para a linha que TINHA
  /// o valor; esta nao tem. O outro continua de pe, e trocar o formato seria
  /// inventar um, que e justamente o que esta tarefa proibiu.)
  ///
  /// **Nulo e o estado que impede "consultado em" com data vazia.** Ele existe
  /// de verdade: `linhaDoPreco` ja exigia data, mas este rotulo e montado a
  /// partir do item e nao da linha, e um item com valor e sem data nao pode
  /// produzir uma frase pela metade.
  static String? sufixoDaConsulta(ItemDaLoja item) {
    final data = item.consultadoEm;
    if (data == null) return null;
    return 'consultado em ${dataCurta(data)}';
  }

  /// O rotulo VISIVEL acima do nome do produto: a afirmacao e a data.
  ///
  /// **A data voltou aqui em 18/10/2026**, por pedido literal do cliente:
  /// *"devolve a data onde esta o novo texto de preço de referência"*. Ela
  /// tinha saido de manha junto com o resto do rabo da linha do preco, e volta
  /// NESTA linha -- nao naquela, que continua sendo so o valor.
  ///
  /// **E isto que torna a clausula dos termos verdadeira de novo.**
  /// `web/src/conteudo/juridico/termos.md` diz, por escrito, que a data da
  /// consulta aparece junto do preco na tela. Entre a remocao do rabo e esta
  /// linha, a afirmacao do juridico estava sem lastro no cartao.
  ///
  /// Sem data, so a afirmacao -- e nunca "consultado em" sem o dia.
  static String rotuloDePrecoComData(ItemDaLoja item) {
    final sufixo = sufixoDaConsulta(item);
    if (sufixo == null) return rotuloDePrecoDeReferencia;
    return '$rotuloDePrecoDeReferencia, $sufixo';
  }

  /// O nome acessivel do no do preco: **a afirmacao junto do valor**.
  ///
  /// Existe porque o rabo da linha do preco saiu em 18/10/2026 por pedido
  /// literal do cliente. Ate aquele dia a frase "preço de referência" viajava
  /// DENTRO do mesmo no de texto do numero, e era por isso que o rotulo
  /// visivel acima do nome podia ser `ExcludeSemantics` sem perda: quem nao ve
  /// ouvia a afirmacao de qualquer jeito, colada no valor.
  ///
  /// Tirar o rabo e parar ai teria deixado o leitor de tela com
  /// "R\$ 189,90" e mais nada -- regressao de acessibilidade silenciosa, porque
  /// na tela a informacao continua (ela esta acima do nome, visivel). Este
  /// rotulo devolve a afirmacao a semantica, no MESMO no do valor, e nada
  /// disso aparece na tela.
  ///
  /// **O rotulo visivel continua `ExcludeSemantics`.** Anunciar os dois faria
  /// o leitor dizer "Preço de referência" solto antes do nome do produto e de
  /// novo junto do valor -- que e exatamente o rotulo orfao que aquele
  /// `ExcludeSemantics` existe para evitar.
  ///
  /// ## A data entra AQUI, e nao no rotulo visivel (18/10/2026, tarde)
  ///
  /// Quando a data voltou ao rotulo visivel, abriram-se dois caminhos para a
  /// semantica, e eles nao sao equivalentes:
  ///
  /// - **anunciar o rotulo visivel** (tirar o `ExcludeSemantics`) e deixar o
  ///   no do valor so com o numero: o leitor diria "Preço de referência,
  ///   consultado em 14/03" ANTES do nome do produto, solto, e depois
  ///   "R\$ 89,90" sem dizer de que preco fala. Dois nos, nenhum completo --
  ///   e o rotulo orfao de volta;
  /// - **manter o visivel excluido e juntar tudo aqui**: um no so, com a
  ///   afirmacao, o valor e a data, **uma vez cada**, na ordem em que fazem
  ///   sentido lidos em voz alta.
  ///
  /// O segundo e o escolhido. O preco e UMA informacao composta de tres
  /// partes, e quem nao ve recebe as tres juntas, como quem ve recebe o bloco
  /// inteiro de uma olhada. **Nada e anunciado duas vezes**, e ha isca que
  /// reprova se a data aparecer em dois nos.
  static String rotuloAcessivelDoPreco(ItemDaLoja item) {
    final valor = item.linhaDoPreco;
    final sufixo = sufixoDaConsulta(item);
    final partes = <String>[rotuloDePrecoDeReferencia, ?valor, ?sufixo];
    return partes.join(', ');
  }

  /// O nome acessivel do botao de saida: diz o produto e para onde leva.
  static String rotuloAcessivelDeSaida(ItemDaLoja item) =>
      '$rotuloDeSaida, ${item.titulo}, no site ${item.parceiro.nome}';

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    // **Nenhuma leitura de preco aqui.** `item.linhaDoPreco` e
    // `item.estadoDoPreco` continuam existindo no modelo -- o contrato nao
    // mudou --, e este cartao deixou de perguntar por eles em 18/10/2026. Ver
    // o bloco de comentario mais abaixo, onde o preco era desenhado.
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
        onTap: destino == null
            ? null
            : () => sairDaLoja(context, item, destino),
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
              // =================================================================
              // **O PREÇO SAIU DO CARTÃO, INTEIRO** (cliente, 18/10/2026,
              // literal: *"Retire o preco dos produtos da loja e o texto de
              // 'preco de referencia'"*).
              //
              // **É REVERSÃO DELIBERADA, e do mesmo dia.** Ele pediu o rótulo
              // "Preço de referência" acima do nome na manhã de 18/10, pediu a
              // data de volta na tarde do mesmo dia, e agora manda os dois
              // embora junto com o valor. Quem abrir este arquivo e achar que
              // o pedido da manhã foi desfeito por descuido está lendo o
              // commit errado: foi desfeito por ele.
              //
              // **TRÊS coisas saíram, e a terceira é a que fica órfã:**
              //
              //  1. o VALOR (`item.linhaDoPreco` em `titleLarge` w700, com
              //     `semanticsLabel: rotuloAcessivelDoPreco`);
              //  2. a LINHA DE APOIO acima do nome
              //     (`rotuloDePrecoComData`, "Preço de referência, consultado
              //     em 14/03", em `ExcludeSemantics`);
              //  3. `VitrineDaLoja.precoNaoConfirmado` -- "Preço não
              //     confirmado, veja no site do parceiro". Esta era a cláusula
              //     VISUAL que acompanhava o preço, no ramo em que ele tinha
              //     vencido. Sem preço nenhum na tela ela deixa de dizer
              //     alguma coisa: a frase existia para ocupar o lugar de um
              //     valor que a pessoa esperava, e já não há lugar. Mantida na
              //     tela, ela anunciaria a ausência de uma informação que o
              //     cartão não oferece mais em nenhum estado.
              //
              // **O QUE NÃO SAIU, e não é esquecimento:** a cláusula JURÍDICA
              // de `web/src/conteudo/juridico/termos.md` -- a plataforma não
              // vende nada e os preços são referência -- continua inteira nos
              // termos. Ela fala do que o Bichu é, não do que o cartão pinta.
              // As constantes ficam no arquivo pelo mesmo motivo que
              // `avisoDeQueNaoSomosOVendedor` ficou: apagar o texto junto com
              // o widget tiraria do repositório a única cópia do que o produto
              // afirmava a quem comprava.
              //
              // **O que o cartão passa a ter:** carrossel, título e
              // `Compre agora` -- e o nome do parceiro no nome acessível do
              // botão de saída, onde ele já estava.
              // =================================================================
              Text(item.titulo, style: textos.titleMedium),
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

/// O CONVITE DA VITRINE E O CUPOM, numa peca so (cliente, 22/10/2026).
///
/// A redacao da frase e dele e esta em [VitrineDaLoja.conviteDaVitrine]; o
/// codigo do cupom tambem (`bichu`). **O DESENHO E MEU** -- ele pediu a frase
/// e o cupom, nao disse como apresenta-los --, e pode ser revisto por ele.
///
/// **Por que os dois no MESMO bloco.** A frase promete desconto e o cupom e
/// como se obtem o desconto: separados, a promessa ficaria no topo e o meio de
/// cumpri-la perdido em outro lugar da tela. Juntos, quem le a frase ja tem o
/// codigo na linha de baixo.
///
/// **O codigo e SELECIONAVEL, e nao so pintado.** Ele e para ser digitado no
/// site do parceiro, e um cupom que a pessoa nao consegue copiar e um cupom
/// que ela erra. `SelectableText` e o unico no desta peca que precisa disso.
///
/// **Sem botao de copiar**, e a ausencia e deliberada: copiar para a area de
/// transferencia exigiria uma confirmacao visivel para nao ser toque sem
/// desfecho (criterio 2 da BICHUS-62), e isso e um mecanismo novo numa tela que
/// o cliente pediu para enxugar. O texto selecionavel resolve o caso sem
/// inventar estado.
///
/// **SEM MOLDURA EM VOLTA DO CONJUNTO, e a razao foi MEDIDA.** A primeira
/// versao desenhava um bloco de `surfaceSunken` com 16 dp de recuo em volta e
/// as duas linhas separadas: ela custava cerca de 145 dp no TOPO de uma lista
/// de produtos, e empurrou o titulo do primeiro cartao para fora da area
/// visivel -- `loja_carrossel_nao_sai_test` reprovou tocando num titulo que ja
/// nao estava alcancavel. A dobra da Loja pertence aos produtos, e e esse
/// numero que manda neste bloco.
///
/// ## O CUPOM MAIS CHAMATIVO -- VARIACAO A (cliente, 29/10/2026)
///
/// Ele pediu *"deixe o cupom de desconto bichu, na pagina da loja, mais
/// chamativo"*. O desenho saiu em `design/prototipos/cupom-da-loja/`
/// (prototipo HTML no lugar do Figma, por autorizacao dele de 23/09) com tres
/// variacoes, e **ele escolheu a A**: o bloco NAO muda de lugar e o conjunto
/// NAO ganha moldura; muda so o par rotulo+codigo. O rotulo vira `overline`
/// (12/16, peso 700, caixa alta) e o codigo vira `title` (18/24, peso 600)
/// dentro de uma pilula de `primaryContainer` com o icone `local_activity`.
/// **Mais chamativo por tamanho, peso e chao -- nunca por cor sozinha**
/// (SC 1.4.1).
///
/// **A pilula e o UNICO elemento novo, e e ela que torna a A barata.** O chao
/// e so do codigo, e nao do bloco: o fundo em volta do conjunto e justamente o
/// desenho de ~145 dp que reprovou em 22/10.
///
/// **O QUE A ESCOLHA CUSTA, MEDIDO NO WIDGET MONTADO** (e nao os px de
/// navegador do prototipo, que precisavam ser remedidos aqui -- ver
/// `test/telas/loja_cupom_chamativo_test.dart`, que tambem explica por que a
/// medicao exige a `Inter` real carregada):
///
/// | largura | hoje | variacao A |
/// |---|---|---|
/// | 412 dp | 72 dp | 88 dp |
/// | 375 dp | 72 dp | 88 dp |
/// | 320 dp | 90 dp | 106 dp |
///
/// Sao os **+16 dp** que o desenho prometeu, nas tres larguras. A B custava
/// +28 e a B2 +61 (151 dp a 320 dp, MAIS que os 145 que reprovaram), e foi a
/// dobra que decidiu -- nao o gosto.
class _ConviteComCupom extends StatelessWidget {
  const _ConviteComCupom();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Padding(
      padding: const EdgeInsets.only(bottom: BichuEspaco.e3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            VitrineDaLoja.conviteDaVitrine,
            style: textos.bodySmall?.copyWith(color: cores.textSecondary),
          ),
          const SizedBox(height: BichuEspaco.e2),
          // O rotulo e o codigo em DOIS nos na MESMA linha, e nao num
          // `'Cupom: bichu'` montado: quem usa leitor de tela ouve o rotulo e
          // depois o codigo, e o codigo precisa de no proprio para ser
          // selecionado sem arrastar o rotulo junto.
          //
          // **`Wrap` E NAO `Row`, E A RAZAO FOI MEDIDA A 200%.** O `Row` com
          // `Flexible` de antes nao estourava, e era pior do que estourar: a
          // 320 dp com a fonte do sistema em 200% ele apertava o codigo num
          // vao de 35 dp e `bichu` saia em QUATRO linhas, uma letra por linha
          // (medido: a caixa do codigo com 160 dp de altura, e o bloco inteiro
          // com 356 dp). Um cupom que a pessoa le letra por letra e um cupom
          // que ela digita errado no site do parceiro.
          //
          // Com `Wrap`, quando o par nao cabe na linha a PILULA DESCE INTEIRA
          // para a linha de baixo e o codigo continua numa linha so. E tambem
          // o que o prototipo desenhou (`flex-wrap: wrap` nas tres variacoes).
          Wrap(
            spacing: BichuEspaco.e2,
            runSpacing: BichuEspaco.e2,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: <Widget>[
              // `labelSmall` E O `overline` DESTA ESCALA (12/16, peso 700,
              // +8% de espacejamento), e nao um tamanho escolhido a mao.
              //
              // **A CAIXA ALTA VEM DO NO, e a constante nao muda.** O Flutter
              // nao tem `text-transform`, e o `overline` deste sistema e
              // definido como o estilo de caixa alta do selo de estado. A
              // constante continua `'Cupom de desconto'`: o rotulo e NOSSO
              // (ver [VitrineDaLoja.rotuloDoCupom]), ao contrario da frase do
              // convite, que e dele palavra por palavra e NAO sobe de caixa.
              Text(
                VitrineDaLoja.rotuloDoCupom.toUpperCase(),
                style: textos.labelSmall?.copyWith(color: cores.textSecondary),
              ),
              // A PILULA, e ela e o UNICO elemento novo da variacao A.
              //
              // O conjunto NAO ganha moldura: a versao de 22/10 que desenhava
              // moldura e fundo em volta do bloco INTEIRO custava ~145 dp e
              // reprovou `loja_carrossel_nao_sai_test`. O chao e so do codigo,
              // e e por isso que ele cabe nos +16 dp.
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: BichuEspaco.e3,
                  vertical: BichuEspaco.e1,
                ),
                decoration: BoxDecoration(
                  color: cores.primaryContainer,
                  borderRadius: BorderRadius.circular(BichuRaio.full),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    // 18 dp, que e o tamanho do icone no prototipo. Ele diz
                    // "cupom" pela FORMA: nenhuma variacao distingue so por
                    // cor (SC 1.4.1), e a A compra o destaque com tamanho,
                    // peso e chao.
                    Icon(
                      Icons.local_activity,
                      size: 18,
                      color: cores.onPrimaryContainer,
                    ),
                    const SizedBox(width: BichuEspaco.e1),
                    // **CONTINUA `SelectableText`, e isso e requisito de
                    // FUNCAO.** O codigo existe para ser digitado no site do
                    // parceiro, e um cupom que a pessoa nao consegue copiar e
                    // um cupom que ela erra; o botao de copiar foi recusado em
                    // 22/10 porque copiar exigiria uma confirmacao visivel
                    // para nao ser toque sem desfecho. Trocar por `Text` para
                    // ganhar estilo seria regressao de funcao.
                    //
                    // `titleMedium` e o `title` desta escala (18/24, peso
                    // 600). O `Flexible` fica: ele e a ultima defesa dentro da
                    // pilula, para o dia em que o codigo deixar de ter cinco
                    // letras.
                    Flexible(
                      child: SelectableText(
                        VitrineDaLoja.codigoDoCupom,
                        style: textos.titleMedium?.copyWith(
                          color: cores.textPrimary,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
