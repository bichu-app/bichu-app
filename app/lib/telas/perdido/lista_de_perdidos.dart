import '../../widgets/arrastar_para_atualizar.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/modelos.dart';
import '../../api/modelos_perdido.dart';
import '../../api/modelos_pet.dart';
import '../../api/perdidos_api.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_listagem.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/moldura.dart';
import '../../widgets/rodape_da_paginacao.dart';
import 'cartao_do_perdido.dart';

/// O corpo da seção `Pets`: **a listagem pública dos pets perdidos da região.**
///
/// Até este arquivo a seção dizia *"A lista de pets perdidos está em
/// construção"*, e a frase era honesta: `listPublicLostPets` estava no contrato
/// e **não tinha rota**, então o app não tinha o que chamar. A rota existe
/// agora (`listagem-publica-de-perdidos-routes.ts`), e a casca honesta sai —
/// pelo mesmo caminho que a da `Rede` saiu: o estado vazio não desaparece, ele
/// **muda de dono**. Quem o mostra agora é a lista, e só quando o servidor
/// responde que não há caso aberto no recorte, que é afirmação medida e não
/// afirmação sobre dado que a tela não carrega.
///
/// ---------------------------------------------------------------------------
/// ## O padrão de listagem, sem uma linha de cópia
///
/// [BarraDeListagem], e esta é a **quarta** tela a usar o componente (depois de
/// `Perto`, da `Loja` e da `Rede`). O campo de busca é desenhado por esta tela,
/// em **largura total**, acima de tudo (`buscaAcima: true`); filtro e ordem vão
/// para o slot único de ação da barra de topo, na mesma folha. É o padrão de
/// 17/10/2026 inteiro, e nada dele foi reinventado aqui.
///
/// A busca é por **nome do pet**, e nunca por código de plaquinha: o contrato
/// explica por que — aceitar código aqui transformaria a listagem pública num
/// oráculo de existência de código, com teto de listagem em vez do teto estrito
/// da rota da tag. Quem digita um código tem o leitor de QR a um toque, logo
/// acima.
///
/// **A ordenação NÃO é desenhada.** A operação aceita uma ordem só (mais
/// recente primeiro), e um controle de ordem com uma opcão é controle sem
/// desfecho — a mesma regra que mantém `ControleDeOrdenacao.temEscolha` exigindo
/// dois.
///
/// ---------------------------------------------------------------------------
/// ## A CIDADE DEIXOU DE SER OBRIGATÓRIA, E A TELA ABRE SEM NENHUMA
///
/// Decisão do cliente, 19/10/2026: *"o campo cidade do filtro da página pet não
/// deve ser obrigatório, mas devemos filtrar pelos 20 últimos pets cadastrados
/// e deixar que ele altere os filtros manualmente"*. `city` perdeu o
/// `required: true` em `api/openapi.yaml` no mesmo trabalho que este arquivo.
///
/// **A tela abre SEM cidade**, e isso é o recorte e não um estado de espera: a
/// página 1 são os 20 casos abertos mais recentes, de qualquer cidade, pela
/// ordem que a operação sempre teve (`last_seen_at DESC`). `limit` já tinha
/// `default: 20` e `maximum: 20` no contrato, então "os 20 últimos" não pediu
/// nada de novo.
///
/// ### O que SAIU, e por que sair era o ponto
///
/// Havia uma fase própria, `_Fase.semCidade`, com uma linha ("Escolha uma
/// cidade...") e um botão que abria a folha de filtro — a tela não tinha o que
/// mostrar até alguém digitar uma cidade. **Essa fase não existe mais**, e com
/// ela saíram as três fontes de cidade que a alimentavam: o que a pessoa
/// digitou, `Me.reference_area.city` e a última cidade guardada no aparelho
/// (`CidadeEscolhida`).
///
/// **A precedência não foi substituída por outra: ela foi removida.** Qualquer
/// uma das três, aplicada na abertura, faria a página abrir FILTRADA por uma
/// cidade que ninguém escolheu — que é literalmente a reclamação de 18/10
/// (*"não deve trazer nenhum item do filtro por padrão"*), um nível acima,
/// porque cidade recorta mais que janela. E o campo da folha mostraria um valor
/// que o servidor não aplicou, que é o defeito que o contrato nomeia em
/// `period`: "a tela leria um filtro aplicado numa página que ninguém filtrou".
///
/// `CidadeEscolhida` **continua existindo e não é mais lida por esta tela.**
/// Ela é a última leitora de produção que a classe tinha; a classe tem teste
/// próprio e está ligada no `Escopo` e no `app.dart`, então retirá-la é
/// decisão à parte e não estava no pedido.
///
/// O campo de cidade continua na folha, agora **opcional**, e é ele que atende
/// o *"deixar que ele altere os filtros manualmente"*: quem quer uma cidade
/// digita; quem apaga o campo volta a ver todas. Esvaziá-lo é um recorte
/// válido, e é por isso que `obrigatorio` não é mais passado — com ele, o
/// `Aplicar` nascia desabilitado com o campo vazio.
///
/// ## O ESTADO (UF) NÃO VAI NO PEDIDO, E A FALTA É DO CONTRATO
///
/// **Medido em 18/10/2026 contra `api/openapi.yaml`:** `listPublicLostPets`
/// declara `city`, `neighborhood`, `species`, `size`, `period`, `q`, `page` e
/// `limit` — e **não declara `state`**. `listDirectoryEntries` e
/// `listAdminDirectoryEntries` declaram (`UF, duas letras`), então o padrão
/// existe no contrato; só não existe nesta operação.
///
/// A consequência é real e está nomeada no relatório: "São Paulo" não é único no
/// Brasil, e "Campinas" existe em três estados. Sem `state`, um visitante que
/// digita `Campinas` recebe os casos abertos das três.
///
/// **Por isso não há seletor de estado nesta folha**, e a ausência é a regra da
/// casa e não esquecimento: controle cujo valor não tem para onde ir é controle
/// sem desfecho, e o produto não os desenha. `api/estados_brasileiros.dart`
/// continua existindo e não foi duplicado — ele não foi usado. Acrescentar
/// `state` é **aditivo** (parâmetro opcional novo) e a coluna já existe
/// (`lost_cases.last_seen_state`), mas é mudança de contrato mais trabalho de
/// servidor, e isso é decisão do cliente.
///
/// ---------------------------------------------------------------------------
/// ## Paginação NUMERADA, e a escolha é do contrato
///
/// `page`/`limit` com `total`, porque é o que `PublicLostPetPage` declara e os
/// três campos são `required`. Trocar para cursor seria mudança **quebrante** de
/// contrato, e mudança quebrante não se faz por preferência. O desenho é o do
/// parágrafo 11.20 de qualquer forma — `Carregar mais`, nunca rolagem infinita e
/// nunca números de página na tela —, e quem o desenha é [RodapeDaPaginacao].
///
/// ## Sem texto de apoio
///
/// A seção manda `reforcoDaPagina: ''` desde que o cliente removeu as frases de
/// apoio (18/10/2026), e o estado vazio tem **uma linha**. É por isso que esta
/// tela não usa `EstadoVazio`, que exige título e explicação: duas linhas onde o
/// cliente pediu uma.
class ListaDePerdidos extends StatefulWidget {
  const ListaDePerdidos({super.key});

  /// Uma linha, e só uma, em cada estado em que a lista não tem o que mostrar.
  /// **Sem "na sua região"** desde 19/10/2026: a lista abre sem cidade, então a
  /// frase antiga ("Nenhum pet perdido na sua região agora.") afirmava um
  /// recorte geográfico que o servidor não aplicou.
  static const String vazio = 'Nenhum pet perdido agora.';
  static const String vazioFiltrado = 'Nenhum pet perdido com esse recorte.';

  /// O rótulo do campo de cidade, que é também o nome acessível dele.
  static const String rotuloDaCidade = 'Cidade';
  static const String exemploDaCidade = 'São Paulo';

  /// A única linha que o campo mostra além do rótulo, e só quando o valor não
  /// serve. `minLength: 2` é o do contrato.
  static const String validacaoDaCidade =
      'Escreva o nome da cidade, com dois caracteres ou mais.';

  static const String falha = 'Não foi possível carregar os pets perdidos agora.';
  static const String rotuloDeTentar = 'Tentar de novo';

  static const String rotuloDaBusca = 'Buscar pet perdido';
  static const String dicaDaBusca = 'Buscar pelo nome do pet';

  /// A frase do fim da lista. Carrega o substantivo e o plural, que é por que
  /// [RodapeDaPaginacao] não a monta sozinho.
  /// **Sem "na região"**, pelo mesmo motivo de [vazio]: a lista abre sem
  /// cidade, e o total conta o que o recorte de fato tem.
  static String fimDaLista(int total) =>
      total == 1 ? 'Um pet perdido.' : '$total pets perdidos.';

  @override
  State<ListaDePerdidos> createState() => _EstadoDaListaDePerdidos();
}

/// **`semCidade` SAIU em 19/10/2026.** Ela era a fase em que a tela não tinha o
/// que mostrar porque ninguém havia digitado uma cidade, e a cidade deixou de
/// ser obrigatória: não há mais pergunta a fazer antes de listar.
enum _Fase { carregando, lista, falha }

class _EstadoDaListaDePerdidos extends State<ListaDePerdidos>
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

  List<PerdidoPublico> _itens = const <PerdidoPublico>[];
  int _total = 0;
  int _pagina = 1;

  RecorteDePerdidos? _recorte;

  bool _carregandoMais = false;
  bool _falhaAoCarregarMais = false;

  final TextEditingController _buscaControlador = TextEditingController();

  /// Cada carga ganha um número; resposta de carga velha é descartada. É a
  /// mesma guarda da agenda da `Rede`, e ela existe porque trocar o recorte
  /// duas vezes rápido entrega as respostas fora de ordem.
  int _geracao = 0;

  bool _visivel = false;
  bool _cargaAgendada = false;

  /// O instante de referência das frases relativas dos cartões, fixado **por
  /// carga** e não lido a cada pintura: um `DateTime.now()` dentro do `build`
  /// faria dois cartões da mesma lista discordarem sobre o que é "hoje" na
  /// virada da meia-noite.
  DateTime _agora = DateTime.now();

  @override
  void dispose() {
    _buscaControlador.dispose();
    super.dispose();
  }

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
      if (!mounted) return;
      _carregar();
    });
  }

  /// **NÃO HÁ MAIS PRECEDÊNCIA DE CIDADE, e a ausência é a decisão de
  /// 19/10/2026.** Havia `_cidadeDigitada`, `_cidadeDaRegiao` e
  /// `_cidadeDoAparelho`, nessa ordem, mais um `_lerOAparelho()` que buscava a
  /// última cidade do aparelho sem a tela esperar. As três saíram juntas: a
  /// cidade que vale é a que está no recorte, e o recorte nasce sem nenhuma.
  ///
  /// A região do perfil continua sendo lida — mas só para o filtro de BAIRRO,
  /// logo abaixo, que é o único recorte para o qual este app conhece uma opção.
  /// A região cadastrada do tutor. **Lida só pelo filtro de bairro**: a cidade
  /// dela deixou de recortar a lista em 19/10/2026.
  RegiaoDeReferencia? get _regiao =>
      Escopo.of(context).sessao.usuario?.regiaoDeReferencia;

  String? get _meuBairro {
    final b = _regiao?.bairro?.trim();
    return (b == null || b.isEmpty) ? null : b;
  }

  Future<void> _carregar({bool maisUma = false}) async {
    if (!mounted) return;
    // **NÃO HÁ MAIS PORTA AQUI.** Havia um `if (cidade == null)` que punha a
    // tela em `_Fase.semCidade` e devolvia sem chamar a rota: sem cidade a
    // operação respondia 400, então pedir era desperdiçar uma chamada para
    // receber erro. A cidade deixou de ser obrigatória em 19/10/2026 e a porta
    // virou o contrário do pedido — ela é o que impedia a lista de abrir.
    //
    // O recorte nasce VAZIO (`const RecorteDePerdidos()`): sem cidade, sem
    // janela, sem espécie, sem porte. É a página 1 dos 20 mais recentes.
    final atual = _recorte ?? const RecorteDePerdidos();

    final int geracao;
    if (maisUma) {
      if (_carregandoMais) return;
      geracao = _geracao;
      setState(() {
        _carregandoMais = true;
        _falhaAoCarregarMais = false;
      });
    } else {
      geracao = ++_geracao;
      setState(() {
        _fase = _Fase.carregando;
        _agora = DateTime.now();
      });
    }

    final pedido = atual.copiar(pagina: maisUma ? _pagina + 1 : 1);
    final api = PerdidosApi(Escopo.of(context).api);

    try {
      final pagina = await api.listar(pedido);
      if (!mounted || geracao != _geracao) return;
      setState(() {
        _recorte = atual;
        _itens = maisUma
            ? <PerdidoPublico>[..._itens, ...pagina.itens]
            : pagina.itens;
        _total = pagina.total;
        _pagina = pagina.pagina;
        _fase = _Fase.lista;
        _carregandoMais = false;
      });
    } on FalhaDeChamada {
      _falhou(geracao, maisUma: maisUma);
    } on FormatException {
      _falhou(geracao, maisUma: maisUma);
    }
  }

  void _falhou(int geracao, {required bool maisUma}) {
    if (!mounted || geracao != _geracao) return;
    setState(() {
      if (maisUma) {
        // A página seguinte falhou: os cartões que já estão na tela ficam,
        // porque o recorte deles é o mesmo. Apagar tudo porque a terceira
        // página não chegou seria punir quem rolou mais.
        _carregandoMais = false;
        _falhaAoCarregarMais = true;
        return;
      }
      // Os cartões antigos saem: sob uma faixa de erro eles afirmariam um
      // recorte que a tela não conseguiu aplicar.
      _itens = const <PerdidoPublico>[];
      _fase = _Fase.falha;
    });
  }

  void _trocarRecorte(RecorteDePerdidos novo) {
    setState(() => _recorte = novo);
    _carregar();
  }

  ControleDeBusca _controleDeBusca() {
    return ControleDeBusca(
      controlador: _buscaControlador,
      alcance: AlcanceDaBusca.servidor,
      rotulo: ListaDePerdidos.rotuloDaBusca,
      termoAplicado: _recorte?.termoLimpo,
      // `maxLength: 60` no contrato, e `minLength` não existe em `q`: o piso de
      // dois caracteres é do índice trigrama, que não produz trigrama nenhum
      // com menos — e com menos a busca volta a varrer a tabela.
      minimoDeCaracteres: 2,
      aoAplicar: (termo) {
        final base = _recorte;
        if (base == null) return;
        if (termo == base.termoLimpo) return;
        _trocarRecorte(base.copiar(termo: termo, pagina: 1));
      },
    );
  }

  /// O campo de cidade da folha. **Sempre presente, e OPCIONAL desde
  /// 19/10/2026.**
  ///
  /// `obrigatorio` não é mais passado (o padrão de `CampoDeTextoDoFiltro` é
  /// `false`), e a diferença é inteira: com ele, campo vazio desabilitava o
  /// `Aplicar` e o `Limpar` da folha não limpava este campo. Sem ele, apagar a
  /// cidade é um recorte válido — e é assim que quem digitou uma cidade volta a
  /// ver todas sem fechar a folha.
  ///
  /// `valor` é **o que o recorte de fato tem**, e não uma sugestão: campo que
  /// mostra cidade que o servidor não aplicou é o defeito de 18/10 com outro
  /// nome.
  ///
  /// `textoDeValidacao` continua, e continua valendo: `minLength: 2` é do
  /// contrato e vale para quem MANDA o parâmetro. Vazio é omissão e passa;
  /// uma letra só é 400 e a folha o barra antes.
  CampoDeTextoDoFiltro get _campoDaCidade => CampoDeTextoDoFiltro(
        chave: 'city',
        rotulo: ListaDePerdidos.rotuloDaCidade,
        valor: _recorte?.cidadeLimpa,
        textoDeValidacao: ListaDePerdidos.validacaoDaCidade,
        // Os dois números são do contrato (`minLength: 2, maxLength: 80`), e
        // não escolhas desta tela.
        limite: 80,
        minimoDeCaracteres: 2,
        exemplo: ListaDePerdidos.exemploDaCidade,
      );

  ControleDeFiltro _controleDeFiltro() {
    final base = _recorte;
    final bairro = _meuBairro;
    if (base == null) {
      // Primeira pintura, antes da primeira resposta: a folha oferece a CIDADE
      // e só ela, porque as pastilhas recortariam uma lista que ainda não
      // chegou. Com a cidade opcional esta janela é curta — a carga não espera
      // mais ninguém digitar nada.
      return ControleDeFiltro(
        grupos: const <GrupoDeFiltro>[],
        campos: <CampoDeTextoDoFiltro>[_campoDaCidade],
      );
    }
    return ControleDeFiltro(
      campos: <CampoDeTextoDoFiltro>[_campoDaCidade],
      grupos: <GrupoDeFiltro>[
        // O bairro só entra quando há UM para oferecer, e o único que este app
        // conhece é o da própria região cadastrada. Uma lista de bairros da
        // cidade não existe em lugar nenhum deste produto, e inventá-la a
        // partir dos casos que voltaram ofereceria um recorte diferente a cada
        // página.
        if (bairro != null)
          GrupoDeFiltro(
            chave: 'neighborhood',
            titulo: 'Bairro',
            selecionado: base.bairro,
            opcoes: <OpcaoDeRecorte>[
              OpcaoDeRecorte(codigo: bairro, rotulo: bairro),
            ],
            nota: 'O bairro que você cadastrou no perfil.',
          ),
        GrupoDeFiltro(
          chave: 'species',
          titulo: 'Espécie',
          selecionado: base.especie?.valor,
          opcoes: <OpcaoDeRecorte>[
            for (final e in Especie.values)
              OpcaoDeRecorte(codigo: e.valor, rotulo: e.rotulo),
          ],
        ),
        GrupoDeFiltro(
          chave: 'size',
          titulo: 'Porte',
          selecionado: base.porte?.valor,
          opcoes: <OpcaoDeRecorte>[
            for (final p in Porte.values)
              OpcaoDeRecorte(codigo: p.valor, rotulo: p.rotulo),
          ],
        ),
        GrupoDeFiltro(
          chave: 'period',
          titulo: 'Perdido desde',
          // **Nasce SEM pastilha marcada** (cliente, 18/10/2026): nulo e
          // "qualquer janela", e e o estado em que a pagina de pets abre.
          selecionado: base.janela?.codigo,
          opcoes: <OpcaoDeRecorte>[
            for (final j in JanelaDePerdidos.values)
              OpcaoDeRecorte(codigo: j.codigo, rotulo: j.rotulo),
          ],
          nota: 'A janela conta de quando o pet foi visto pela última vez.',
        ),
      ],
    );
  }

  /// O `Aplicar` da folha: **um** recorte, **uma** chamada à rota.
  void _aplicarAFolha(EscolhaDaFolha escolha) {
    // A CIDADE É UM FILTRO COMO OS OUTROS DESDE 19/10/2026, e o tratamento
    // especial dela saiu daqui inteiro. O que havia: a cidade era lida antes de
    // tudo, guardada em `_cidadeDigitada` e **só quando não-vazia** — apagar o
    // campo era indistinguível de não tocar nele, e a cidade anterior
    // continuava valendo. Com o campo opcional, esvaziar é um recorte, e é o
    // caminho de volta para "todas as cidades".
    final base = _recorte ?? const RecorteDePerdidos();
    _trocarRecorte(
      base.copiar(
        // `escolha.filtros['city']` nulo ou vazio limpa a cidade: quem apaga o
        // campo volta a ver todas. `cidadeLimpa` no modelo apara o espaço, e é
        // ele que decide se `city` entra na query.
        cidade: escolha.filtros['city'],
        bairro: escolha.filtros['neighborhood'],
        especie: Especie.de(escolha.filtros['species']),
        porte: Porte.de(escolha.filtros['size']),
        // **Limpar a pastilha deixa a janela NULA**, e `period` sai da
        // consulta. Era o contrário até 18/10/2026: a tela repunha `30d`, e a
        // lista voltava recortada sem ninguém ter pedido. Quem decide o que
        // fazer com a ausência é o servidor, pelo `default: 30d` que o
        // contrato declara na rota — o app parou de escolher por ele.
        janela: JanelaDePerdidos.de(escolha.filtros['period']),
        pagina: 1,
      ),
    );
  }

  bool get _temRecorteAtivo {
    final base = _recorte;
    if (base == null) return false;
    // **A CIDADE CONTA AGORA.** Enquanto era obrigatória ela não podia contar:
    // ela estava sempre lá, e `_temRecorteAtivo` seria sempre verdadeiro, o que
    // faria a lista vazia dizer "com esse recorte" mesmo para quem não filtrou
    // nada. Opcional, ela é um recorte de verdade — quem digitou uma cidade e
    // não achou nada precisa ler que foi o recorte, não que não há perdidos.
    return base.cidadeLimpa != null ||
        base.temBusca ||
        base.bairro != null ||
        base.especie != null ||
        base.porte != null ||
        base.janela != null;
  }

  @override
  Widget build(BuildContext context) {
    final sessao = Escopo.of(context).sessao;
    return AnimatedBuilder(
      animation: sessao,
      builder: (context, _) {
        // **O REAGENDAMENTO POR CIDADE SAIU.** Ele existia porque entrar ou
        // sair trocava a região, a região era fonte de cidade, e a tela tinha
        // de sair ou entrar na fase `semCidade`. Sem aquela fase e sem a
        // região recortando, entrar não muda o recorte desta lista: o que entrar
        // passa a oferecer é a opção de BAIRRO na folha, e a folha é montada a
        // cada pintura. O `AnimatedBuilder` fica — é ele que repinta a folha.
        final busca = _controleDeBusca();
        final filtro = _controleDeFiltro();
        // O campo de busca aparece **exatamente** quando a barra apareceria: a
        // decisão é uma só e mora no componente. Sem isto, a seção sem perdido
        // nenhum desenharia um campo de busca sobre o nada.
        final comControles = _fase == _Fase.lista &&
            BarraDeListagem.desenha(
              total: _total,
              busca: busca,
              filtro: filtro,
              aoAplicar: _aplicarAFolha,
            );

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            // **O GATILHO DE FILTRO VEM NA FRENTE DA BUSCA, na mesma
            // linha** (cliente, 18/10/2026). Era `CampoDeBuscaDaListagem`
            // sozinho aqui e o gatilho com rotulo logo abaixo, desenhado pela
            // barra; agora a linha e uma so e sobe inteira, e a barra deixa de
            // desenhar o gatilho por causa de `buscaAcima`.
            if (comControles) ...<Widget>[
              LinhaDeBuscaDaListagem(
                total: _total,
                busca: busca,
                filtro: filtro,
                aoAplicar: _aplicarAFolha,
              ),
              const SizedBox(height: BichuEspaco.e4),
            ],
            if (_fase == _Fase.lista)
              BarraDeListagem(
                total: _total,
                substantivo: const SubstantivoDaListagem(
                  singular: 'pet perdido',
                  plural: 'pets perdidos',
                ),
                // O campo já foi desenhado acima; a barra recebe o controle
                // para saber do TERMO APLICADO, e não para desenhar de novo.
                buscaAcima: true,
                busca: busca,
                filtro: filtro,
                aoAplicar: _aplicarAFolha,
              ),
            ..._corpo(),
          ],
        );
      },
    );
  }

  List<Widget> _corpo() {
    switch (_fase) {
      case _Fase.carregando:
        return <Widget>[
          Semantics(
            label: 'Carregando pets perdidos',
            liveRegion: true,
            child: const Column(
              children: <Widget>[
                _EsqueletoDePerdido(),
                SizedBox(height: BichuEspaco.e4),
                _EsqueletoDePerdido(),
              ],
            ),
          ),
        ];
      case _Fase.falha:
        return <Widget>[
          FaixaDeAviso(
            texto: ListaDePerdidos.falha,
            rotuloDaAcao: ListaDePerdidos.rotuloDeTentar,
            aoTocarNaAcao: _carregar,
          ),
        ];
      case _Fase.lista:
        if (_itens.isEmpty) {
          return <Widget>[
            _UmaLinha(
              texto: _temRecorteAtivo
                  ? ListaDePerdidos.vazioFiltrado
                  : ListaDePerdidos.vazio,
            ),
          ];
        }
        return <Widget>[
          for (var i = 0; i < _itens.length; i++) ...<Widget>[
            if (i > 0) const SizedBox(height: BichuEspaco.e4),
            // O TOQUE PASSOU A TER DESTINO (cliente, 18/10/2026: *"quando o
            // pet esta perdido, deve ter uma pagina interna do pet"*).
            //
            // O cabecalho de `CartaoDoPerdido` dizia que `aoTocar` era nulo
            // porque "a tela do caso publico por token nao existe no app", e
            // era verdade: `getPublicLostCase` era consumida so pelo SITE.
            // Agora existe (`TelaDoCasoPublico`), e o destino e o endereco do
            // proprio `share_url` -- **nunca `/pets/:petId`**, que e enderecada
            // por UUID interno (ADR-0010, item 6), e cujo id esta
            // deliberadamente ausente desta projecao.
            CartaoDoPerdido(
              perdido: _itens[i],
              agora: _agora,
              aoTocar: () => context.push(
                Rotas.casoPublicoDe(_itens[i].shareToken),
              ),
            ),
          ],
          const SizedBox(height: espacoAcimaDoRodape),
          RodapeDaPaginacao(
            carregados: _itens.length,
            total: _total,
            carregando: _carregandoMais,
            textoDaFalha: _falhaAoCarregarMais ? ListaDePerdidos.falha : null,
            aoPedirMais: () => _carregar(maisUma: true),
            fimDaLista: ListaDePerdidos.fimDaLista,
          ),
        ];
    }
  }
}

/// O estado vazio desta seção: **uma linha**, e nada mais.
///
/// `EstadoVazio` exige `titulo` e `explicacao`, e explicação é a segunda linha
/// que o cliente mandou remover em 18/10/2026. A moldura é a mesma — fundo
/// afundado, raio `lg`, borda `hairline` —, para o vazio continuar parecendo o
/// vazio do resto do app.
class _UmaLinha extends StatelessWidget {
  const _UmaLinha({required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e6),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Text(texto, style: Theme.of(context).textTheme.titleMedium),
    );
  }
}

/// O esqueleto do cartão, com a mesma geometria do cartão de verdade: sem isso
/// a lista dá um salto de layout quando os dados chegam.
class _EsqueletoDePerdido extends StatelessWidget {
  const _EsqueletoDePerdido();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Container(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Moldura(
            largura: BichuMoldura.larguraFotoSm,
            estado: EstadoDaMoldura.carregando,
          ),
          const SizedBox(width: BichuEspaco.e4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                _Barrinha(cor: cores.surfaceSunken, fracao: 0.4),
                const SizedBox(height: BichuEspaco.e2),
                _Barrinha(cor: cores.surfaceSunken, fracao: 0.8),
                const SizedBox(height: BichuEspaco.e2),
                _Barrinha(cor: cores.surfaceSunken, fracao: 0.6),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Barrinha extends StatelessWidget {
  const _Barrinha({required this.cor, required this.fracao});

  final Color cor;
  final double fracao;

  @override
  Widget build(BuildContext context) {
    return FractionallySizedBox(
      alignment: Alignment.centerLeft,
      widthFactor: fracao,
      child: Container(
        height: BichuEspaco.e3,
        decoration: BoxDecoration(
          color: cor,
          borderRadius: BorderRadius.circular(BichuRaio.sm),
        ),
      ),
    );
  }
}
