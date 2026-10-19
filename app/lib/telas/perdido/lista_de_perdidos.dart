import 'dart:async';

import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/modelos.dart';
import '../../api/modelos_perdido.dart';
import '../../api/modelos_pet.dart';
import '../../api/perdidos_api.dart';
import '../../escopo.dart';
import '../../sessao/cidade_escolhida.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_listagem.dart';
import '../../widgets/botao_primario.dart';
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
/// ## A CIDADE É OBRIGATÓRIA NO CONTRATO, E ELA É DIGITÁVEL
///
/// `city` é `required` em `listPublicLostPets`, e a obrigatoriedade é de
/// privacidade: sem ela a operação seria um inventário nacional de animais
/// perdidos, que é a listagem que o item 6 do ADR-0010 não quer existir.
///
/// **São três fontes, nesta ordem de precedência:**
///
/// 1. **O que a pessoa digitou na folha de filtro**, que ganha de tudo. Quem
///    está em viagem, ou procurando na cidade vizinha onde o cachorro pode ter
///    ido, precisa poder trocar — e a região do perfil não é forçada por cima
///    disso (decisão do cliente, 18/10/2026).
/// 2. **`Me.reference_area.city`**, o padrão de quem tem conta com região
///    cadastrada. É só o padrão: ele preenche o campo e sai da frente.
/// 3. **A última cidade escolhida neste aparelho** ([CidadeEscolhida]), para o
///    visitante sem conta não redigitar a cada abertura. É a última da
///    precedência de propósito: quem tem conta com região abre na região, e não
///    na cidade da última busca. E ela chega **sem a tela esperar** — ver
///    [_EstadoDaListaDePerdidos._lerOAparelho].
///
/// **Deslogado, a 1 e a 3 são as únicas**, e é isso que torna a seção útil para
/// quem não tem conta — que é exatamente quem a vizinhança precisa que veja a
/// lista. Sem nenhuma das três, a tela desenha **uma linha** e para: ela não
/// inventa cidade, não pede coordenada e não afirma que não há perdidos.
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
  static const String vazio = 'Nenhum pet perdido na sua região agora.';
  static const String vazioFiltrado = 'Nenhum pet perdido com esse recorte.';
  static const String semCidade =
      'Escolha uma cidade para ver os pets perdidos por perto.';

  /// O rótulo do campo de cidade, que é também o nome acessível dele.
  static const String rotuloDaCidade = 'Cidade';
  static const String exemploDaCidade = 'São Paulo';

  /// A única linha que o campo mostra além do rótulo, e só quando o valor não
  /// serve. `minLength: 2` é o do contrato.
  static const String validacaoDaCidade =
      'Escreva o nome da cidade, com dois caracteres ou mais.';

  /// A porta do campo de cidade quando a lista ainda não existe.
  ///
  /// **Existe porque a folha de filtro mora atrás de um controle que a barra só
  /// desenha quando há lista** (`BarraDeListagem.desenha` responde falso com
  /// `total: 0` e nenhum recorte aplicado). Sem esta porta, quem não tem cidade
  /// leria a linha única e não teria caminho nenhum para sair dela — que é o
  /// beco que o critério 2 da BICHUS-62 proíbe.
  static const String rotuloDeEscolherCidade = 'Escolher cidade';
  static const String falha = 'Não foi possível carregar os pets perdidos agora.';
  static const String rotuloDeTentar = 'Tentar de novo';

  static const String rotuloDaBusca = 'Buscar pet perdido';
  static const String dicaDaBusca = 'Buscar pelo nome do pet';

  /// A frase do fim da lista. Carrega o substantivo e o plural, que é por que
  /// [RodapeDaPaginacao] não a monta sozinho.
  static String fimDaLista(int total) =>
      total == 1 ? 'Um pet perdido na região.' : '$total pets perdidos na região.';

  @override
  State<ListaDePerdidos> createState() => _EstadoDaListaDePerdidos();
}

enum _Fase { carregando, lista, falha, semCidade }

class _EstadoDaListaDePerdidos extends State<ListaDePerdidos> {
  _Fase _fase = _Fase.carregando;

  List<PerdidoPublico> _itens = const <PerdidoPublico>[];
  int _total = 0;
  int _pagina = 1;

  RecorteDePerdidos? _recorte;

  bool _carregandoMais = false;
  bool _falhaAoCarregarMais = false;

  final TextEditingController _buscaControlador = TextEditingController();

  /// Onde a última cidade escolhida é guardada **neste aparelho**.
  ///
  /// **Vem do `Escopo`, e não é construída aqui.** O depósito em arquivo chama
  /// `getApplicationDocumentsDirectory()`, um canal de plataforma que trava o
  /// `pumpAndSettle` para sempre, sem mensagem, em teste de widget. Construído
  /// aqui, ele travaria a suíte inteira na seção em que o aplicativo ABRE — e o
  /// sintoma não aponta para a causa. Custou uma execução travada para
  /// descobrir, e é a mesma armadilha que `DepositoDeIntencaoEmArquivo` tem.
  CidadeEscolhida get _cidadeGuardada => Escopo.of(context).cidadeEscolhida;

  /// A cidade que a PESSOA escolheu nesta sessão. Ganha de tudo.
  String? _cidadeDigitada;

  /// A cidade que estava guardada neste aparelho. **Último lugar da
  /// precedência**: quem tem conta com região cadastrada abre na região, e não
  /// na cidade da última busca (decisão do cliente, 18/10/2026).
  String? _cidadeDoAparelho;

  /// A leitura do aparelho já foi PEDIDA. Pedida, e não concluída: ver
  /// [_lerOAparelho].
  bool _pediuOAparelho = false;

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
      if (!_pediuOAparelho) {
        _pediuOAparelho = true;
        unawaited(_lerOAparelho());
      }
      _carregar();
    });
  }

  /// Lê a cidade guardada no aparelho, **sem a tela esperar por ela**.
  ///
  /// ## O `unawaited` é a parte que importa, e não é descuido
  ///
  /// O depósito em arquivo chama `getApplicationDocumentsDirectory()`, que é
  /// canal de plataforma. Canal de plataforma **pode não responder nunca**: em
  /// teste de widget ele trava o `pumpAndSettle` para sempre, sem mensagem, e
  /// num aparelho com armazenamento lento ou bloqueado ele demora.
  ///
  /// Esperá-lo antes da primeira carga faria a seção em que o aplicativo ABRE
  /// ficar presa numa conveniência de digitação. A primeira versão disto
  /// esperava, e travou cinco arquivos da suíte — cada um deles montando o
  /// aplicativo por um caminho que não injeta o depósito. O sintoma era
  /// `pumpAndSettle timed out`, que não aponta para a causa.
  ///
  /// Então a ordem é: a lista carrega com o que já tem (a região, ou nada), e a
  /// cidade guardada chega **depois** — e só é usada se ainda não houver nada
  /// melhor. Uma recarga a mais no arranque do visitante é barata; a seção
  /// presa não é.
  Future<void> _lerOAparelho() async {
    // **Nunca lança**, e é `CidadeEscolhida` quem garante.
    final guardada = await _cidadeGuardada.ler();
    if (!mounted || guardada == null) return;
    // Chegou tarde: a pessoa já escolheu, ou a região já é o padrão dela. Nos
    // dois casos a guardada perdeu, e recarregar seria trocar a lista debaixo
    // de quem está lendo.
    if (_cidadeDigitada != null || _cidadeDaRegiao != null) return;
    _cidadeDoAparelho = guardada;
    await _carregar();
  }

  /// A cidade que vale agora, na precedência do cabeçalho: o que a pessoa
  /// escolheu, depois a região do perfil, depois a guardada no aparelho.
  String? get _cidadeEmUso =>
      _cidadeDigitada ?? _cidadeDaRegiao ?? _cidadeDoAparelho;

  /// A região cadastrada do tutor. **A única fonte de cidade deste app.**
  RegiaoDeReferencia? get _regiao =>
      Escopo.of(context).sessao.usuario?.regiaoDeReferencia;

  /// A cidade da região cadastrada. **Só o padrão**, e não uma imposição: quem
  /// digitou outra continua nela (decisão do cliente, 18/10/2026).
  String? get _cidadeDaRegiao {
    final c = _regiao?.cidade?.trim();
    return (c == null || c.isEmpty) ? null : c;
  }

  String? get _meuBairro {
    final b = _regiao?.bairro?.trim();
    return (b == null || b.isEmpty) ? null : b;
  }

  Future<void> _carregar({bool maisUma = false}) async {
    if (!mounted) return;
    final cidade = _cidadeEmUso;
    if (cidade == null) {
      setState(() {
        _fase = _Fase.semCidade;
        _itens = const <PerdidoPublico>[];
        _total = 0;
      });
      return;
    }

    // O recorte nasce com a cidade que vale (digitada, depois a da região) e a
    // acompanha: quem troca a cidade na folha, ou muda a região no perfil, não
    // deve continuar vendo a lista da antiga.
    final atual = (_recorte ?? RecorteDePerdidos(cidade: cidade)).copiar(cidade: cidade);
    // **Guardada ANTES da chamada, e sem `await`.** Guardar depois perderia a
    // cidade de quem fechou o aplicativo enquanto a lista carregava, e esperar
    // a gravação atrasaria a lista por uma conveniência.
    unawaited(_cidadeGuardada.guardar(cidade));

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

  /// O campo de cidade da folha. **Sempre presente**, e obrigatório: é a
  /// pergunta sem a qual a rota não responde nada.
  CampoDeTextoDoFiltro get _campoDaCidade => CampoDeTextoDoFiltro(
        chave: 'city',
        rotulo: ListaDePerdidos.rotuloDaCidade,
        valor: _cidadeEmUso,
        obrigatorio: true,
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
      // Sem lista ainda, a folha oferece a CIDADE e só ela: as pastilhas
      // recortariam uma lista que não existe.
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
    // A CIDADE PRIMEIRO, porque ela decide se há lista. `obrigatorio: true` na
    // folha garante que ela não chega vazia: o `Aplicar` não habilita assim.
    final cidade = escolha.filtros['city']?.trim();
    if (cidade != null && cidade.isNotEmpty) {
      _cidadeDigitada = cidade;
    }
    final base = _recorte;
    if (base == null) {
      // Primeira cidade escolhida: não há recorte anterior a copiar, e a carga
      // monta um do zero com a cidade que acabou de valer.
      _carregar();
      return;
    }
    _trocarRecorte(
      base.copiar(
        cidade: _cidadeEmUso,
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
    return base.temBusca ||
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
        // Entrar ou sair com a seção aberta troca a região, e a região é uma
        // das fontes de cidade: sem isto quem acabou de entrar continuaria na
        // linha única. Quem DIGITOU uma cidade não é afetado — a digitada ganha
        // da região, e entrar não a sobrescreve.
        final cidade = _cidadeEmUso;
        if (cidade == null && _fase != _Fase.semCidade) _agendarCarga();
        if (cidade != null && _fase == _Fase.semCidade) _agendarCarga();

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
      case _Fase.semCidade:
        // UMA LINHA, E UMA SAÍDA. A linha diz o que falta; o botão abre a MESMA
        // folha de filtro da lista cheia -- e não uma segunda folha, que
        // divergiria da primeira na primeira edição.
        //
        // O botão existe porque a barra não nasce aqui: `desenha` responde
        // falso com `total: 0` e nenhum recorte aplicado, e sem ele quem não
        // tem cidade leria a linha e não teria caminho nenhum.
        return <Widget>[
          _UmaLinha(texto: ListaDePerdidos.semCidade),
          const SizedBox(height: BichuEspaco.e4),
          BotaoSecundario(
            rotulo: ListaDePerdidos.rotuloDeEscolherCidade,
            aoTocar: () => abrirFolhaDeFiltros(
              context,
              filtro: _controleDeFiltro(),
              aoAplicar: _aplicarAFolha,
            ),
          ),
        ];
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
            CartaoDoPerdido(perdido: _itens[i], agora: _agora),
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
