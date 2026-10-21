import '../../widgets/arrastar_para_atualizar.dart';
import 'dart:async';
import 'dart:collection';

import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/modelos_pet.dart';
import '../../api/modelos_rede.dart';
import '../../api/rede_api.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_listagem.dart';
import '../../widgets/cidade_por_localizacao.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../casca_com_abas.dart';
import 'cartao_do_encontro.dart';
import 'encontro_da_rede.dart';

/// `Rede`: a agenda dos encontros (design system 24.14 com 24.15 a 24.17,
/// textos da UX 28.7.4).
///
/// ## Tres abas, tres operacoes
///
/// | Aba | Operacao | Ordem |
/// |---|---|---|
/// | `Próximos` | `listNetworkEvents` com `when=upcoming` (ou `today`, `weekend`, `next_30_days`); com `Mais perto` ou `Distância`, `listNearbyNetworkEvents` | `Data mais próxima`; `Mais perto` com regiao |
/// | `Encerrados` | `listNetworkEvents` com `when=past` | `Mais recente primeiro`, unica |
///
/// Trocar de aba limpa filtros e ordem, porque cada aba tem os seus. As duas
/// abas aparecem com conta e sem.
///
/// ## SO EVENTO ABERTO (cliente, 19/10/2026)
///
/// *"vamos deixar apenas os eventos abertos por enquanto, no futuro analisamos
/// a necessidade de ter eventos privados tambem"*. Tres coisas sairam com essa
/// frase: a aba `Meus pedidos` (e com ela a unica leitura de
/// `listMyNetworkEventJoinRequests` do app), o filtro `Situação do pedido` e o
/// filtro `Público ou privado`.
///
/// A agenda pede `visibility=public` em toda chamada, e
/// `PaginaDaRede.doJson` DESCARTA o que nao for publico -- as duas metades,
/// porque a primeira depende do servidor obedecer e a segunda nao.
///
/// ## Busca, filtro e ordem: o componente que ja existe
///
/// [BarraDeListagem], sem copia. Filtros de lista fechada, os do contrato e
/// so eles (`when`, `admission`, `city`, `size`, `max_km`), cada um so na aba
/// cuja operacao o aceita. `visibility` e `state` sairam em 19/10/2026 com o
/// evento privado.
///
/// ## A distancia e da regiao cadastrada, e nunca do GPS
///
/// Com conta, `Próximos` faz duas perguntas em paralelo: a agenda publica (que
/// tem o teaser do privado) e `listNearbyNetworkEvents` com `sort=proximos`
/// (APP-2 da matriz de rastreabilidade), so para ler `distance_m` de cada
/// encontro publico. **Nenhuma coordenada sai do aparelho**: o servidor usa a
/// regiao ja gravada. Se a segunda pergunta falhar, a agenda sai igual, sem a
/// linha de distancia (UX 28.3, decisao 3: a distancia nao atrasa nem derruba
/// a tela). `Mais perto` e o filtro `Distância` so aparecem depois que a
/// resposta mostrou que ha regiao cadastrada, e somem sem aviso quando nao ha.
///
/// ## A situacao vem do servidor
///
/// O cancelado fica em `Próximos` ate o fim previsto, com o selo `Cancelado`
/// (ADR-0027 12.6). Esta tela nao recalcula nada.
class AgendaDaRede extends StatefulWidget {
  const AgendaDaRede({super.key, this.reforcoDaSecao});

  /// A linha que explica a secao, que ate 17/10 era desenhada pela casca
  /// (`TelaDeAba.reforco`) **acima** de tudo o que esta tela monta.
  ///
  /// Ela desceu para ca porque o cliente pediu, em 17/10/2026: *"coloque o
  /// campo de busca acima do texto e das abas proximos e encerrados"*. A
  /// ordem pedida e busca, texto, abas -- e a casca nao tem como por nada
  /// acima do proprio reforco sem conhecer o estado desta tela, que e de quem
  /// o campo de busca e.
  ///
  /// Nulo em teste de unidade que monta a agenda sem a casca: a tela nao
  /// inventa texto de secao.
  final String? reforcoDaSecao;

  static const String tituloDoVazio = 'A Rede ainda não tem eventos';
  static const String explicacaoDoVazio =
      'Aparecem aqui assim que forem criados.';
  // `tituloDoVazioDePedidos` e `explicacaoDoVazioDePedidos` sairam em
  // 19/10/2026 com a aba `Meus pedidos`: eram `Nenhum pedido ainda` e `Seus
  // pedidos aparecem aqui.`, e nao ha mais aba para mostra-las.
  static const String tituloDoVazioDeEncerrados = 'Nenhum evento encerrado';
  static const String explicacaoDoVazioDeEncerrados =
      'Os eventos que já aconteceram ficam aqui.';
  static const String tituloDoVazioFiltrado =
      'Nenhum evento com esses filtros';
  static const String explicacaoDoVazioFiltrado =
      'Tente outra palavra, outro período ou menos filtros.';
  static const String textoDaFalha =
      'Não conseguimos carregar os eventos agora.';
  static const String rotuloDeAtualizar = 'Atualizar';
  static const String exemploDaBusca = 'passeio, praça, Pinheiros';

  /// O rotulo da porta de criar. **Diz o verbo da pessoa**, e nao o nome do
  /// recurso: quem abre a `Rede` quer criar um evento, nao "criar um
  /// NetworkEvent". A redacao foi pedida pelo cliente em 18/10; o dominio
  /// continua chamando a coisa de `encontro` no codigo inteiro.
  ///
  /// **Esta constante e a UNICA fonte do rotulo da porta de criar.** Ate
  /// 18/10 havia duas: esta (`Marcar um encontro`, definida e SEM USO depois
  /// que a porta saiu do corpo) e o literal `'Criar evento'` da barra, em
  /// `abas.dart`. A mescla do lote juntou as duas frentes e fechou a
  /// pendencia que o ramo do icone deixou escrita: o valor e o do
  /// vocabulario novo, e quem desenha a porta le DAQUI.
  static const String rotuloDeMarcar = 'Criar evento';
  static const String ordemTrocadaPeloServidor =
      'A ordem escolhida não está disponível agora. A lista usa a ordem '
      'marcada acima.';

  /// "Carregar mais" (ATENCAO: a especificacao nao desenhou a paginacao da
  /// agenda; texto no padrao de 28.2, `Tentar de novo` refaz uma coisa so).
  static const String rotuloDeCarregarMais = 'Carregar mais eventos';
  /// O que a lista esta mostrando **enquanto nao ha cidade**.
  ///
  /// A aba abre SEM cidade de proposito, e isso e o recorte e nao um estado de
  /// espera: sao os eventos mais recentes, de qualquer cidade. O molde e a
  /// decisao do cliente de 19/10/2026 para os pets -- *"o campo cidade do
  /// filtro da pagina pet nao deve ser obrigatorio, mas devemos filtrar pelos
  /// 20 ultimos pets cadastrados e ordenar pela cidade da localizacao dele"* --
  /// e ele vale aqui pela decisao de 20/10 (*"utilizar a mesma inteligencia do
  /// pets"*).
  ///
  /// **Dizer isto importa:** uma lista do pais inteiro sem a frase parece uma
  /// lista que nao conseguiu recortar, e e a mesma reclamacao que tirou a cidade
  /// obrigatoria dos pets -- lista vazia com cara de defeito.
  static const String explicacaoSemCidade =
      'Mostrando os eventos mais recentes de todas as cidades.';

  static const String falhaAoCarregarMais =
      'Não conseguimos carregar mais eventos agora.';
  static const String rotuloDeTentar = 'Tentar de novo';

  static String tituloDoVazioComBusca(String termo) =>
      'Nenhum evento com “$termo”';

  @override
  State<AgendaDaRede> createState() => _AgendaDaRedeState();
}

/// **`AbaDaRede` NAO EXISTE MAIS: as abas viraram FILTRO (19/10/2026).**
///
/// Decisao do cliente. Elas couberam no filtro **porque a entidade nao
/// muda**: a lista continua sendo de eventos, e o que cada recorte faz e
/// escolher QUAIS eventos.
///
/// | Aba de ontem | Virou |
/// |---|---|
/// | `Próximos` | grupo `Quando` -> `Próximos` (o padrao, e por isso o recorte guarda `null`) |
/// | `Encerrados` | grupo `Quando` -> `Encerrados` |
/// | `Meus pedidos` | **NAO VIROU NADA: a aba SAIU.** Ver abaixo. |
///
/// **`Meus pedidos` SAIU E NAO VIROU FILTRO, e esta e a UNIAO DE DUAS FRENTES
/// QUE ESTAVAM NO MESMO METODO (19/10/2026).**
/// `feat/barra-com-mural-e-rede-unificada` converteu as TRES abas em recorte e
/// deixou a terceira viva como um `bool _soOndePedi` mais o grupo
/// `Meu envolvimento`; `feat/evento-simples-e-sem-telefone` APAGOU essa mesma
/// aba do mesmo `enum` e da mesma `_abasVisiveis`, por decisao do cliente no
/// mesmo dia: *"vamos deixar apenas os eventos abertos por enquanto, no futuro
/// analisamos a necessidade de ter eventos privados tambem"*.
///
/// **A REMOCAO GANHA, e nao por preferencia de quem mesclou: o outro lado nem
/// compilaria.** `RecorteDaRede` perdeu `visibilidade`, `estadoDoPedido` e
/// `queryDePedidos` no commit da decisao, e `_soOndePedi` dependia dos tres.
/// O pedido de participacao tambem nascia na pagina de detalhe do evento, que
/// saiu no mesmo dia. Logo: nao ha `_soOndePedi`, nao ha grupo
/// `Meu envolvimento`, nao ha grupo `Situação do pedido` e nao ha ramo de
/// carga por `listMyNetworkEventJoinRequests`.
///
/// **As SETE operacoes do pedido ficam DECLARADAS e sem chamador** em
/// `api/rede_api.dart`, de proposito e com a prosa que explica por que -- ele
/// disse *"no futuro analisamos"*, e nao "nunca".
///
/// **O estado de recorte de tempo ja morava em `RecorteDaRede.quando`** -- era
/// so a aba que escolhia o valor por ela --, e por isso a conversao das outras
/// duas abas em filtro nao inventou estado novo nesta tela.
///
/// **As duas abas que a secao tem agora sao outras**: `Eventos` e
/// `Comunidade`, e elas moram em `AbaDaSecaoRede` (`rede/secao_da_rede.dart`).
/// Esta tela e o corpo da primeira, e **nao desenha `TabBar` nenhuma** -- quem
/// desenha e a secao, acima dela, porque as abas tem de ficar na tela em todo
/// estado (carregando, vazio, falha) e esta tela desaparece em alguns deles.
///
/// **`Minhas indicações` NAO virou filtro, e a assimetria e medida**: ver
/// `Rotas.minhasIndicacoes`. A entidade muda -- uma indicacao em analise nao e
/// um local da lista --, e filtrar devolveria zero no unico caso que importa.

/// Um cartao da lista: o encontro e o que so a lista sabe dele.
///
/// `pedido` (o `EstadoDoPedido` que virava a pilula do cartao) saiu em
/// 19/10/2026 com a aba `Meus pedidos`. `distancia` FICA: o cartao nao a
/// desenha mais, mas e a resposta de `listNearbyNetworkEvents` que revela se
/// ha regiao cadastrada, e e isso que decide se `Mais perto` e `Distância`
/// aparecem na barra.
class _ItemDaAgenda {
  const _ItemDaAgenda(this.encontro, {this.distancia});
  final EncontroDaRede encontro;
  final int? distancia;
}

enum _Fase { carregando, lista, falha }

class _AgendaDaRedeState extends State<AgendaDaRede>
    with PublicaAAtualizacao {
  /// A BUSCA QUE O ARRASTO REFAZ (cliente, 18/10/2026).
  ///
  /// **A mesma funcao do `Tentar de novo`**, e nao uma copia: duas buscas com
  /// dois nomes divergem na primeira correcao de filtro. Quem desenha a roda e
  /// a casca, por `SlotDeAtualizacao` -- ver
  /// `widgets/arrastar_para_atualizar.dart`.
  @override
  Future<void> aoArrastarParaAtualizar() => _carregar();

  // **O CAMPO `_soOndePedi` E A CONSTANTE `_codigoDeSoOndePedi` NAO
  // EXISTEM (uniao do lote de 19/10/2026).**
  //
  // `feat/barra-com-mural-e-rede-unificada` os criou para manter viva a aba
  // `Meus pedidos` convertida em recorte; `feat/evento-simples-e-sem-telefone`
  // removeu a aba por decisao do cliente (*"vamos deixar apenas os eventos
  // abertos por enquanto"*). Com ela sairam `RecorteDaRede.visibilidade`,
  // `RecorteDaRede.estadoDoPedido` e `queryDePedidos`, de que este campo
  // dependia -- mante-lo nao compilaria. Ver o comentario de `AbaDaRede`
  // no alto deste arquivo.

  RecorteDaRede _recorte = const RecorteDaRede();
  _Fase _fase = _Fase.carregando;

  List<_ItemDaAgenda> _itens = const <_ItemDaAgenda>[];
  int _total = 0;
  int _pagina = 1;
  String _ordemEfetiva = OrdemDaRede.proximos.codigo;

  /// As distancias ja medidas, por `slug`, DESACOPLADAS da pagina da agenda.
  ///
  /// Elas vem de `listNearbyNetworkEvents` com `sort=proximos` e dependem so
  /// de quais encontros publicos o recorte tem ([RecorteDaRede.
  /// assinaturaDasDistancias]): nao da pagina carregada e nao do termo de
  /// busca. Assim digitar nao repete a pergunta, e "Carregar mais" so pede a
  /// proxima pagina de distancias quando falta medida para um cartao novo.
  final Map<String, int?> _medidas = <String, int?>{};
  String? _assinaturaDasMedidas;
  int _paginaDasMedidas = 0;
  bool _medidasEsgotadas = false;

  bool _carregandoMais = false;
  bool _falhaAoCarregarMais = false;

  bool? _logadoDaUltimaCarga;

  final SplayTreeSet<String> _cidadesConhecidas = SplayTreeSet<String>();
  final TextEditingController _buscaControlador = TextEditingController();

  /// A CIDADE DO APARELHO, pela mesma peca que `Pets` usa.
  ///
  /// Decisao do cliente, 20/10/2026: *"nos eventos e na comunidade, voce
  /// tambem deve trazer os mais proximos da localizacao, utilizar a mesma
  /// inteligencia do pets"*. A `inteligencia do pets` resolve a **cidade** a
  /// partir da coordenada e recorta por cidade -- ela nao manda coordenada
  /// para rota nenhuma (ADR-0006 e emenda 1). Ver
  /// `widgets/cidade_por_localizacao.dart`.
  ///
  /// **Isto NAO substitui a ordem por distancia desta aba**, que ja existia e
  /// continua: aquela sai do ponto de referencia que o SERVIDOR guarda por
  /// aparelho (`listNearbyNetworkEvents`, `ST_Distance`), e nunca passou pelo
  /// GPS. As duas se somam -- a cidade recorta quais eventos entram, a
  /// distancia ordena os que entraram.
  ///
  /// Nulo ate `didChangeDependencies`: a porta vem do [Escopo], que precisa de
  /// contexto.
  CidadeDoAparelho? _cidadeDoAparelho;

  /// A FOLHA decidiu a cidade, e por isso a derivada nao manda mais.
  ///
  /// **Nao e `a pessoa mexeu em algo`**, e a diferenca e o defeito de
  /// 20/10/2026 nos pets: um sinal generico de interacao descartava o
  /// resultado do botao de localizacao. Este sinal e **so sobre a cidade**:
  /// ele liga quando a folha de filtro traz a chave `city` -- inclusive
  /// trazendo-a VAZIA, que e alguem limpando o recorte de proposito -- e
  /// desliga no toque de `Usar minha localização`, porque ai a escolha mais
  /// nova e a localizacao.
  bool _folhaDecidiuACidade = false;

  bool _visivel = false;
  bool _cargaAgendada = false;

  /// Cada carga ganha um numero; resposta de carga velha e descartada.
  int _geracao = 0;

  @override
  void dispose() {
    _buscaControlador.dispose();
    _cidadeDoAparelho?.dispose();
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
    _criarAResolucaoDaCidade();
    _agendarCarga();
  }

  /// Cria o resolvedor de cidade e **dispara a resolucao de abertura**.
  ///
  /// Uma vez por tela, e nao por quadro: `didChangeDependencies` corre de novo
  /// a cada troca de dependencia herdada, e recriar o resolvedor gastaria uma
  /// resolucao -- e um pedaco do teto de uso da plataforma -- a cada vez.
  ///
  /// **A lista NAO espera por isto.** `_agendarCarga` corre em seguida e pinta
  /// os eventos mais recentes; quando a cidade chega, `_trocarRecorte`
  /// recarrega. Esperar deixaria a aba em branco por doze segundos para quem
  /// nao concedeu a permissao.
  void _criarAResolucaoDaCidade() {
    if (_cidadeDoAparelho != null) return;
    // `doEscopo` e nao `Escopo.of(context).localizacao`: a porta fica atras da
    // peca, e esta tela nao a nomeia. Ver `CidadeDoAparelho.doEscopo` e a lista
    // de `localizacao_no_ponto_de_uso_test.dart`.
    final resolvedor = CidadeDoAparelho.doEscopo(context)
      ..addListener(_aResolucaoAndou);
    _cidadeDoAparelho = resolvedor;
    unawaited(
      resolvedor.resolverNaAbertura().then((trocou) {
        if (!mounted || !trocou) return;
        // A derivada chegou depois da primeira pintura. Quem mexeu na cidade na
        // folha enquanto ela corria MANDA: trocar a lista debaixo de quem
        // acabou de escolher e o pior desfecho possivel.
        if (_folhaDecidiuACidade) return;
        _carregar();
      }),
    );
  }

  /// A caixa e a frase dela dependem do resolvedor; `setState` vazio basta.
  void _aResolucaoAndou() {
    if (!mounted) return;
    setState(() {});
  }

  /// A CIDADE QUE VALE AGORA, e e ela que vai para `city` na rota.
  ///
  /// **A folha ganha da derivada, inclusive quando a folha diz `nenhuma`** --
  /// e o que faz `Limpar filtro` significar limpar. Ver [_folhaDecidiuACidade]
  /// para por que este criterio e so sobre a cidade.
  String? get _cidadeEmUso =>
      _folhaDecidiuACidade ? _recorte.cidade : _cidadeDoAparelho?.cidade;

  /// O TOQUE em `Usar minha localização`.
  ///
  /// Ele **devolve a palavra a localizacao**: [_folhaDecidiuACidade] desliga,
  /// porque a pessoa acabou de escolher a localizacao e essa e a escolha mais
  /// nova. Sem desligar, a precedencia de [_cidadeEmUso] devolveria a cidade da
  /// folha e a resolucao ficaria sem efeito -- o defeito de 20/10/2026 nos
  /// pets, inteiro.
  Future<void> _usarMinhaLocalizacao() async {
    final resolvedor = _cidadeDoAparelho;
    if (resolvedor == null) return;
    final trocou = await resolvedor.resolverPorToque();
    if (!mounted) return;
    if (resolvedor.cidade == null) return;
    setState(() {
      _folhaDecidiuACidade = false;
      // A cidade da folha sai do recorte junto: deixa-la gravada faria a folha
      // abrir marcando uma cidade que a lista nao esta usando.
      if (_recorte.cidade != null) _recorte = _recorte.copiar(semCidade: true);
    });
    if (trocou || _cidadeEmUso != null) await _carregar();
  }

  void _agendarCarga() {
    if (_cargaAgendada) return;
    _cargaAgendada = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _cargaAgendada = false;
      if (mounted) _carregar();
    });
  }

  /// O recorte de tempo EFETIVO.
  ///
  /// **Nulo no recorte significa `upcoming`**, e isso nao e invencao desta
  /// mudanca: `RecorteDaRede.quando` ja era nulavel com esse sentido, e
  /// `queryDaAgenda` ja fazia `(quando ?? quandoDaAba)`. O que mudou e QUEM
  /// escolhe o valor -- era a aba, e agora e o grupo `Quando` da folha.
  ///
  /// Manter `null` como padrao em vez de gravar `aVir` tem uma consequencia
  /// desejada: `Próximos` nao conta como filtro ativo, e o distintivo da barra
  /// nao nasce com `1` numa lista que ninguem recortou.
  QuandoDaRede get _quandoEfetivo => _recorte.quando ?? QuandoDaRede.aVir;

  /// A lista esta nos eventos que ja passaram (o que era a aba `Encerrados`).
  bool get _encerrados => _quandoEfetivo == QuandoDaRede.passados;

  /// A lista esta na agenda do que vem (o que era a aba `Próximos`).
  ///
  /// **Os tres sub-recortes de tempo (`Hoje`, `Este fim de semana`,
  /// `Próximos 30 dias`) continuam DENTRO deste caso**, e nao viraram um quarto
  /// estado: eles sao janelas do futuro, e e por isso que a distancia e a ordem
  /// por proximidade continuam valendo neles -- como valiam dentro da aba
  /// `Próximos`, que tinha os mesmos tres sub-recortes.
  ///
  /// **O termo `!_soOndePedi` SAIU desta conta na uniao do lote de 19/10**: a
  /// aba `Meus pedidos` foi removida por decisao do cliente, nao ha mais um
  /// terceiro lado, e `!_encerrados` passou a ser a conta inteira.
  bool get _naAgendaDoQueVem => !_encerrados;

  /// Ha regiao cadastrada no perfil (`Me.reference_area`). Sem ela nao ha
  /// distancia, e a pergunta de distancias nao sai (UX 28.3, decisao 3).
  bool get _temRegiao =>
      Escopo.of(context).sessao.usuario?.regiaoDeReferencia != null;

  /// Carrega a primeira pagina do recorte, ou a seguinte com [maisUma].
  Future<void> _carregar({bool maisUma = false}) async {
    if (!mounted) return;
    final escopo = Escopo.of(context);
    final logado = escopo.sessao.logado;
    if (_logadoDaUltimaCarga != null && _logadoDaUltimaCarga != logado) {
      // Outra conta, outra regiao: as medidas antigas nao valem.
      _limparMedidas();
    }
    _logadoDaUltimaCarga = logado;

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
      setState(() => _fase = _Fase.carregando);
    }
    // **A cidade em uso entra AQUI, no caminho da chamada, e nao no recorte.**
    // A resolucao pode ter chegado depois da primeira carga; gravar a derivada
    // em `_recorte` acenderia o distintivo da barra numa agenda que ninguem
    // filtrou e faria `Limpar filtro` nao limpar. Ver `RecorteDaRede.copiar`.
    final cidade = _cidadeEmUso;
    final recorte = _recorte.copiar(
      pagina: maisUma ? _pagina + 1 : 1,
      cidade: cidade,
      semCidade: cidade == null,
    );
    final rede = RedeApi(escopo.api);
    // O ultimo termo era `recorte.visibilidade != VisibilidadeDoEncontro.privado`:
    // `listNearbyNetworkEvents` nao devolve privado, e medir distancia com o
    // filtro em privado gastava uma pergunta que nao casaria com nada. O
    // filtro saiu em 19/10/2026 e a agenda so pede publicos, entao o termo
    // ficou sempre verdadeiro e saiu com ele.
    final medir = logado &&
        _temRegiao &&
        _naAgendaDoQueVem &&
        !recorte.pedeDistancia;

    try {
      late final List<_ItemDaAgenda> itens;
      late final int total;
      late final int pagina;
      late final String efetiva;

      // **O RECORTE ESCOLHE A OPERACAO, e era a aba que escolhia.** Os ramos
      // sao os mesmos de antes, palavra por palavra; o que mudou foi a
      // condicao de cada um -- `_encerrados` no lugar de
      // `AbaDaRede.encerrados`.
      //
      // **NAO HA MAIS RAMO DE `Meus pedidos`** (uniao do lote de 19/10): era
      // o unico lugar do app que chamava `listMyNetworkEventJoinRequests`, e
      // `feat/evento-simples-e-sem-telefone` o removeu junto com a aba. A
      // frente da barra o tinha convertido em `if (_soOndePedi)`; a remocao
      // ganha porque `recorte.queryDePedidos` deixou de existir.
      if (_encerrados) {
        // `quandoDaAba` continua sendo o PADRAO de quem nao escolheu, e aqui
        // ele e redundante de proposito: `_encerrados` so e verdadeiro quando
        // `_recorte.quando` JA e `passados`, e `queryDaAgenda` faz
        // `(quando ?? quandoDaAba)`. Repetir o valor deixa a chamada legivel
        // sozinha e nao muda o resultado.
        final p = await rede.listar(
          recorte.queryDaAgenda(quandoDaAba: QuandoDaRede.passados),
        );
        _cidadesConhecidas.addAll(p.cidades);
        itens = <_ItemDaAgenda>[for (final e in p.itens) _ItemDaAgenda(e)];
        (total, pagina) = (p.total, p.pagina);
        efetiva = p.ordemEfetiva.codigo;
      } else {
        if (logado && _temRegiao && recorte.pedeDistancia) {
          final p = await rede.listarPorPerto(
            recorte.queryPorPerto(
              ordemPorPerto: recorte.ordem == OrdemPorPerto.distancia.codigo
                  ? OrdemPorPerto.distancia
                  : OrdemPorPerto.proximos,
            ),
          );
          for (final i in p.itens) {
            _cidadesConhecidas.add(i.encontro.lugar.cidade);
          }
          itens = <_ItemDaAgenda>[
            for (final i in p.itens)
              _ItemDaAgenda(i.encontro, distancia: i.distanciaEmMetros),
          ];
          (total, pagina) = (p.total, p.pagina);
          efetiva = p.ordemEfetiva.codigo;
        } else {
          final p = await rede.listar(
            recorte.queryDaAgenda(quandoDaAba: QuandoDaRede.aVir),
          );
          _cidadesConhecidas.addAll(p.cidades);
          if (medir) {
            await _garantirMedidas(rede, recorte, <String>[
              for (final e in p.itens)
                if (e is EncontroPublico) e.slug,
            ]);
          }
          itens = <_ItemDaAgenda>[
            for (final e in p.itens)
              _ItemDaAgenda(
                e,
                // So publico recebe medida; o teaser nao tem onde por.
                distancia: medir && e is EncontroPublico ? _medidas[e.slug] : null,
              ),
          ];
          (total, pagina) = (p.total, p.pagina);
          efetiva = p.ordemEfetiva.codigo;
        }
      }

      if (!mounted || geracao != _geracao) return;
      setState(() {
        _itens = maisUma ? <_ItemDaAgenda>[..._itens, ...itens] : itens;
        _total = total;
        _pagina = pagina;
        _ordemEfetiva = efetiva;
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
        // A pagina seguinte falhou: os cartoes que ja estao na tela ficam,
        // porque o recorte deles e o mesmo, e so o fim da lista diz.
        _carregandoMais = false;
        _falhaAoCarregarMais = true;
        return;
      }
      // Os cartoes antigos saem: sob uma faixa de erro eles afirmariam um
      // recorte que a tela nao conseguiu aplicar.
      _itens = const <_ItemDaAgenda>[];
      _fase = _Fase.falha;
    });
  }

  void _limparMedidas() {
    _medidas.clear();
    _assinaturaDasMedidas = null;
    _paginaDasMedidas = 0;
    _medidasEsgotadas = false;
  }

  /// Pede paginas de distancias ate cobrir os [slugs] da tela, no maximo
  /// tres por vez. Falha nao derruba a agenda: o cartao sai sem a linha.
  Future<void> _garantirMedidas(
    RedeApi rede,
    RecorteDaRede recorte,
    List<String> slugs,
  ) async {
    final r = Escopo.of(context).sessao.usuario?.regiaoDeReferencia;
    final assinatura = recorte.assinaturaDasDistancias(
      regiao: <Object?>[r?.bairro, r?.cidade, r?.uf, r?.cep].join('/'),
    );
    if (assinatura != _assinaturaDasMedidas) {
      _limparMedidas();
      _assinaturaDasMedidas = assinatura;
    }
    for (var rodada = 0; rodada < 3; rodada++) {
      if (_medidasEsgotadas) return;
      if (slugs.every(_medidas.containsKey)) return;
      try {
        final p = await rede.listarPorPerto(
          recorte
              .copiar(pagina: _paginaDasMedidas + 1, semTermo: true)
              .queryPorPerto(ordemPorPerto: OrdemPorPerto.proximos),
        );
        _paginaDasMedidas = p.pagina;
        for (final i in p.itens) {
          _medidas[i.encontro.slug] = i.distanciaEmMetros;
        }
        if (p.itens.isEmpty || p.pagina * p.limite >= p.total) {
          _medidasEsgotadas = true;
        }
      } on FalhaDeChamada {
        return;
      } on FormatException {
        return;
      }
    }
  }

  void _trocarRecorte(RecorteDaRede novo) {
    setState(() => _recorte = novo);
    _carregar();
  }

  /// **`_trocarAba` SAIU com as abas (19/10/2026).**
  ///
  /// Ele zerava filtro e ordem ao trocar de aba, mantendo so a busca
  /// (*"filtros e ordem sao de cada aba; a busca vale para as tres"*). Com as
  /// tres abas virando recortes da MESMA folha, nao ha mais o que zerar: a
  /// folha aplica tudo num `Aplicar` e e ela que decide o que fica.
  ///
  /// **O que o zeramento resolvia continua resolvido, e por construcao em vez
  /// de por limpeza:** um recorte que a operacao escolhida nao aceita nao e
  /// OFERECIDO -- `_controleDeFiltro` nao desenha o grupo --, e
  /// `_aplicarAFolha` so mexe nas chaves que os grupos daquela composicao
  /// declararam (`_Nada` e "nao mexer"). Entao `max_km` nao pode sobrar ligado
  /// numa lista de pedidos, porque o grupo de distancia nao existe la para
  /// liga-lo.
  bool get _podeMedir =>
      Escopo.of(context).sessao.logado && _temRegiao && _naAgendaDoQueVem;

  bool get _temMais => _itens.length < _total;

  /// O TOQUE NO CARTAO, e a decisao de sessao mora AQUI (20/10/2026).
  ///
  /// Pedido do cliente, em duas rodadas. Em 19/10 ele pediu *"remover o clique
  /// para o usuario nnao conseguir acessar a pagina de detalhes"* e a entrega
  /// apagou a pagina inteira; em 20/10 ele corrigiu -- *"eu nao pedi pra voce
  /// remover, eu pedi para remover o clique"* -- e disse o que o toque tem de
  /// fazer: *"quando o usuario estiver deslogado e tentar clicar para ver
  /// detalhes de algum conteudo, como por exemplo os eventos, que ele precisa
  /// estar logado para ver mais informacoes"*.
  ///
  /// **Deslogado nao e um toque morto, e nao e um cartao desabilitado.** As
  /// duas alternativas foram medidas contra o que ele pediu:
  ///
  ///   - **cartao nao tocavel** e o estado de 19/10, e e exatamente a
  ///     reclamacao: a pessoa toca, nada acontece, e ela nao recebe
  ///     informacao nenhuma;
  ///   - **cartao desabilitado** anuncia uma recusa antes de a pessoa pedir, e
  ///     ela nao tem como saber que basta entrar.
  ///
  /// A folha diz o que falta e oferece a saida, no lugar do toque. A escolha
  /// entre folha, texto no cartao e convite de tela cheia esta medida em
  /// `widgets/convite_para_entrar.dart` -- e a razao curta e que **a agenda
  /// continua publica**: `GET /v1/network/events` responde 200 sem conta
  /// (medido em 20/10/2026), e trocar a lista por um muro esconderia conteudo
  /// que o servidor entrega.
  ///
  /// **A volta e a propria pagina do encontro.** Depois de entrar, a guarda de
  /// acao devolve a pessoa a `/rede/encontros/<slug>` em vez de a `/pets` --
  /// ver `intencao/leitura_como_intencao.dart`.
  void _tocarNoCartao(_ItemDaAgenda item, {required bool logado}) {
    final slug = item.encontro.slug;
    if (!logado) {
      unawaited(
        mostrarConviteParaEntrar(
          context,
          secao: SecaoComConta.encontroDaRede,
          rotaDeVolta: Rotas.encontroDaRedeDe(slug),
        ),
      );
      return;
    }
    unawaited(
      TelaDoEncontro.abrir(
        context,
        slug,
        // A distancia vem desta lista, e nao da pagina: quem a leu foi
        // `listNearbyNetworkEvents`.
        distanciaEmMetros: item.distancia,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final sessao = Escopo.of(context).sessao;
    return AnimatedBuilder(
      animation: sessao,
      builder: (context, _) {
        final logado = sessao.logado;
        if (_logadoDaUltimaCarga != null && _logadoDaUltimaCarga != logado) {
          // Entrou ou saiu com a agenda aberta: recarrega com o recorte certo.
          _agendarCarga();
        }
        final busca = _controleDeBusca();
        final filtro = _controleDeFiltro();
        final ordenacao = _controleDeOrdenacao();
        final reforco = widget.reforcoDaSecao;
        // O campo de busca aparece **exatamente** quando a barra apareceria:
        // a decisao e uma so, e ela mora no componente. Sem isto a `Rede`
        // sem encontro nenhum desenharia um campo de busca sobre o nada,
        // que e o caso que a secao "Lista vazia" da `BarraDeListagem`
        // resolve nao desenhando.
        final comControles = _fase != _Fase.carregando &&
            BarraDeListagem.desenha(
              total: _total,
              busca: busca,
              filtro: filtro,
              ordenacao: ordenacao,
              aoAplicar: _aplicarAFolha,
            );

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            // A ORDEM E BUSCA, TEXTO, ABAS (decisao do cliente, 17/10/2026).
            //
            // As abas continuam DEPOIS do campo e **fora** da barra: elas
            // ficam na tela em todo estado -- carregando, vazio, falha --, e
            // a barra nao e desenhada em alguns deles. Abas dentro da barra
            // sumiriam junto, e quem filtrou ate o vazio em `Encerrados`
            // ficaria sem como voltar para `Próximos`.
            // **O GATILHO DE FILTRO E ORDEM VEM NA FRENTE DA BUSCA, na
            // mesma linha** (cliente, 18/10/2026). Era `CampoDeBuscaDaListagem`
            // sozinho aqui e o gatilho com rotulo abaixo das abas, desenhado
            // pela barra; agora a linha e uma so e sobe inteira, acima do
            // reforco e das abas, e a barra deixa de desenhar o gatilho por
            // causa de `buscaAcima`.
            if (comControles) ...<Widget>[
              LinhaDeBuscaDaListagem(
                total: _total,
                busca: busca,
                filtro: filtro,
                ordenacao: ordenacao,
                aoAplicar: _aplicarAFolha,
              ),
              const SizedBox(height: BichuEspaco.e4),
            ],
            // **Vazio nao desenha** (18/10/2026): a `Rede` manda
            // `reforcoDaPagina: ''` desde que o cliente removeu as cinco
            // frases de apoio, e sem o `isNotEmpty` a secao abriria com um
            // `Text` vazio e 24 dp de respiro entre a busca e as abas.
            if (reforco != null && reforco.isNotEmpty) ...<Widget>[
              Text(
                reforco,
                style: Theme.of(context)
                    .textTheme
                    .bodyLarge
                    ?.copyWith(color: BichuColors.of(context).cores.textSecondary),
              ),
              const SizedBox(height: BichuEspaco.e6),
            ],
            // **A PORTA DE CRIAR EVENTO NAO ESTA MAIS AQUI**, e ela mudou
            // de lugar DUAS vezes, as duas por decisao do cliente.
            //
            // Em 18/10/2026 ela subiu para a BARRA DE TOPO: "os itens de
            // criacao, como evento e indicacao, ate o escanear poderia ser
            // icones na barra superior ... e nao fique esse botao grande na
            // pagina ocupando muito espaco". Isso REVERTEU o que estava
            // escrito nesta linha em 17/10 -- "no CORPO e nao na `AppBar`".
            //
            // Em 19/10/2026 ela SAIU DA BARRA e virou acao FLUTUANTE, para o
            // sino de notificacao entrar no lugar: *"O botao criar sai da
            // barra"*. **Ela nao voltou para esta linha**, e a diferenca e o
            // que ele recusou em 18/10: o botao de LARGURA TOTAL que ocupava
            // 64 dp de linha aqui. A acao flutuante fica por cima, no canto,
            // e o corpo da agenda continua comecando na primeira linha.
            //
            // Quem desenha e `AcaoDeCriarFlutuante`; quem a entrega a casca e
            // `AbaRede`, em `abas.dart`, que e quem conhece a sessao: a porta
            // so aparece com conta E e-mail confirmado, tambem por decisao
            // dele no mesmo dia.
            //
            // O que saiu daqui foi um `BotaoSecundario` de largura total com
            // 48 dp de altura, dentro de um `Padding` de 16 dp embaixo: 64 dp
            // de altura devolvidos ao corpo da agenda.
            // **A `TabBar` DAS TRES ABAS SAIU DAQUI (19/10/2026).** Elas
            // viraram recortes da folha de filtro -- a conta esta no lugar em
            // que `AbaDaRede` estava, no alto deste arquivo.
            //
            // **E NAO FOI SUBSTITUIDA POR OUTRA AQUI:** as duas abas que a
            // secao tem agora (`Eventos` e `Comunidade`) sao da SECAO e nao
            // desta lista, e quem as desenha e `SecaoDaRede`, ACIMA desta
            // tela. A razao e a mesma que mantinha as tres fora da
            // `BarraDeListagem`: esta tela desaparece em alguns estados
            // (carregando, falha) e as abas tem de ficar -- quem filtrou ate o
            // vazio precisa de como voltar.
            // **A CAIXA DA LOCALIZACAO, e ela sai de cena quando a cidade
            // chega** (cliente, 20/10/2026 -- pedido em `Pets` e valendo para
            // as tres secoes). Quem decide aparecer e sair e a propria caixa,
            // pelo criterio `ha cidade em uso`: a regra mora num lugar so,
            // porque tres copias divergem na proxima correcao.
            //
            // **No CORPO da tela e nao na barra**, como busca, filtro e ordem
            // (padrao de listagem do cliente), e ACIMA da barra: ela explica o
            // recorte que a barra resume.
            if (_fase != _Fase.carregando) ...<Widget>[
              CaixaDeLocalizacao(
                cidadeEmUso: _cidadeEmUso,
                explicacao: AgendaDaRede.explicacaoSemCidade,
                podeOferecer: _cidadeDoAparelho?.podeOferecer ?? false,
                aviso: _cidadeDoAparelho?.aviso,
                // Desabilitado enquanto procura: dois toques pediriam a
                // permissao duas vezes e gastariam o teto de uso do geocoder
                // duas vezes.
                aoUsarLocalizacao: (_cidadeDoAparelho?.procurando ?? true)
                    ? null
                    : _usarMinhaLocalizacao,
              ),
              // O respiro acompanha a caixa: sem ela, 16 dp de buraco entre a
              // busca e a barra.
              if (_cidadeEmUso == null &&
                  (_cidadeDoAparelho?.podeOferecer ?? false))
                const SizedBox(height: BichuEspaco.e4),
            ],
            if (_fase != _Fase.carregando)
              BarraDeListagem(
                total: _total,
                // Um substantivo so: era `pedido`/`pedidos` na aba que saiu.
                substantivo: const SubstantivoDaListagem(
                  singular: 'evento',
                  plural: 'eventos',
                ),
                // O campo ja foi desenhado acima; a barra recebe o controle
                // para saber do TERMO APLICADO, e nao para desenhar de novo.
                buscaAcima: true,
                busca: busca,
                filtro: filtro,
                ordenacao: ordenacao,
                aoAplicar: _aplicarAFolha,
              ),
            ..._corpo(logado: logado),
          ],
        );
      },
    );
  }

  /// A busca. **Aplicada no toque, e nunca na tecla.**
  ///
  /// O rotulo `Buscar evento` virou a dica DENTRO do campo, e o
  /// `(opcional)` saiu: pedido do cliente de 17/10/2026, *"Tire o texto do
  /// app buscar encontro (opcional), coloque o texto no placeholder do campo
  /// buscar"*. O nome acessivel continua sendo `Buscar evento` --
  /// `BichuField.rotuloVisivel` explica como, e por que campo com dica e sem
  /// rotulo e campo mudo.
  ///
  /// A espera de 300 ms **saiu**, e com ela a razao de existir dela: nao ha
  /// mais pergunta por tecla para o teto de 300 por hora contar.
  ControleDeBusca _controleDeBusca() {
    return ControleDeBusca(
      controlador: _buscaControlador,
      alcance: AlcanceDaBusca.servidor,
      rotulo: 'Buscar evento',
      termoAplicado: _recorte.termoLimpo,
      // `minLength: 2` no contrato: um caractere so produziria 400, e agora
      // ele e estado da lupa em vez de um `setState` que engolia a tecla.
      minimoDeCaracteres: 2,
      aoAplicar: (termo) {
        if (termo == _recorte.termoLimpo) return;
        _trocarRecorte(_recorteCom(termo: termo));
      },
    );
  }

  /// Copia o recorte trocando so o que foi passado. `_Nada` marca "nao
  /// mexer", para `null` poder significar "limpar".
  RecorteDaRede _recorteCom({
    Object? termo = const _Nada(),
    Object? quando = const _Nada(),
    Object? entrada = const _Nada(),
    Object? cidade = const _Nada(),
    Object? porte = const _Nada(),
    Object? distanciaMaxima = const _Nada(),
    Object? ordem = const _Nada(),
  }) {
    final r = _recorte;
    T? v<T>(Object? novo, T? atual) => novo is _Nada ? atual : novo as T?;
    return RecorteDaRede(
      termo: v<String>(termo, r.termo),
      quando: v<QuandoDaRede>(quando, r.quando),
      entrada: v<TipoDeEntrada>(entrada, r.entrada),
      cidade: v<String>(cidade, r.cidade),
      porte: v<Porte>(porte, r.porte),
      distanciaMaxima: v<DistanciaMaxima>(distanciaMaxima, r.distanciaMaxima),
      ordem: v<String>(ordem, r.ordem),
    );
  }

  ControleDeFiltro _controleDeFiltro() {
    final r = _recorte;
    final grupos = <GrupoDeFiltro>[];

    // **DOIS GRUPOS SAIRAM EM 19/10/2026, E UM TERCEIRO NUNCA NASCEU.**
    //
    // `Situação do pedido` (`state`) existia so na aba `Meus pedidos`, e a
    // aba saiu. `Público ou privado` (`visibility`) nao tem mais desfecho:
    // *"vamos deixar apenas os eventos abertos por enquanto"*, e um controle
    // cujas duas opcoes dao a mesma lista e pior que controle nenhum
    // (criterio 2 da BICHUS-62). A agenda pede `visibility=public` em toda
    // chamada; quem decide isso e `RecorteDaRede.queryDaAgenda`, e nao a
    // folha de filtros.
    //
    // **O grupo `Meu envolvimento` (`involvement`, `Só onde eu pedi`) NAO
    // ENTRA**, e aqui esta a uniao das duas frentes que mexeram neste metodo:
    // `feat/barra-com-mural-e-rede-unificada` o criou para receber a aba
    // `Meus pedidos` convertida em recorte, e `feat/evento-simples-e-sem-telefone`
    // removeu a aba por decisao do cliente. Um grupo que troca a operacao para
    // uma rota sem chamador e sem recorte (`queryDePedidos` nao existe mais)
    // seria controle sem desfecho.
    {
      // **O GRUPO QUE ABSORVEU AS ABAS `Próximos` E `Encerrados`
      // (19/10/2026).**
      //
      // Ele ja existia, com os TRES sub-recortes do futuro (`Hoje`, `Este fim
      // de semana`, `Próximos 30 dias`) e so dentro da aba `Próximos`. Agora
      // ele carrega as duas abas tambem, e passou a ser oferecido sempre.
      //
      // **A ORDEM DAS OPCOES E DELIBERADA**: `Próximos` e `Encerrados`
      // primeiro, porque sao as duas metades do tempo e uma delas e sempre a
      // verdade da lista; os tres sub-recortes depois, porque recortam DENTRO
      // de `Próximos`.
      //
      // **`Próximos` e mostrado como SELECIONADO quando ninguem escolheu**
      // (`?? QuandoDaRede.aVir`), e isso nao e o mesmo que estar no recorte: o
      // recorte guarda `null`, e por isso o distintivo da barra nao nasce com
      // `1`. A folha mostra a verdade da lista -- ela E a agenda do que vem --
      // sem afirmar que alguem filtrou. `_aplicarAFolha` fecha o circulo
      // devolvendo `null` quando a escolha e `upcoming`.
      //
      // **Escolher um sub-recorte NAO desliga `Próximos`**, porque os tres sao
      // janelas do futuro e o servidor os trata como `when` unico: o grupo e
      // de escolha unica, e marcar `Hoje` substitui `Próximos` por uma janela
      // mais estreita DO MESMO lado do tempo.
      grupos.add(
        GrupoDeFiltro(
          chave: 'when',
          titulo: 'Quando',
          selecionado: _quandoEfetivo.codigo,
          // **`Próximos` E A VERDADE DA LISTA E NAO UM RECORTE**, e esta linha
          // e o que separa as duas coisas. Sem ela o distintivo da barra
          // nascia com `1` numa agenda que ninguem filtrou, e -- pior -- o
          // estado vazio trocava de frase: a `Rede` sem evento nenhum dizia
          // *"Nenhum evento com esses filtros"* e oferecia `Limpar filtro`,
          // um botao que nao tinha o que limpar. **Medido**, e e o defeito que
          // `GrupoDeFiltro.codigoPadrao` existe para fechar.
          codigoPadrao: QuandoDaRede.aVir.codigo,
          opcoes: <OpcaoDeRecorte>[
            OpcaoDeRecorte(
              codigo: QuandoDaRede.aVir.codigo,
              rotulo: QuandoDaRede.aVir.rotulo,
            ),
            OpcaoDeRecorte(
              codigo: QuandoDaRede.passados.codigo,
              rotulo: QuandoDaRede.passados.rotulo,
            ),
            for (final q in QuandoDaRede.subRecortes)
              OpcaoDeRecorte(codigo: q.codigo, rotulo: q.rotulo),
          ],
        ),
      );
      grupos.add(
        GrupoDeFiltro(
          chave: 'admission',
          titulo: 'Valor',
          selecionado: r.entrada?.codigo,
          opcoes: <OpcaoDeRecorte>[
            for (final t in TipoDeEntrada.values)
              OpcaoDeRecorte(codigo: t.codigo, rotulo: t.rotulo),
          ],
        ),
      );
      final cidades = SplayTreeSet<String>.from(_cidadesConhecidas);
      if (r.cidade != null) cidades.add(r.cidade!);
      // **A CIDADE DERIVADA APARECE NA FOLHA, marcada e editavel.** E a outra
      // metade do pedido de 20/10/2026: resolvida, a caixa sai e fica *"so a
      // cidade dentro do filtro"*. Ela entra nas OPCOES tambem porque a
      // resolucao pode chegar antes da primeira resposta da rota -- sem esta
      // linha o grupo abriria com um valor selecionado que nao existe na lista.
      final emUso = _cidadeEmUso;
      if (emUso != null) cidades.add(emUso);
      grupos.add(
        GrupoDeFiltro(
          chave: 'city',
          titulo: 'Cidade',
          selecionado: emUso,
          opcoes: <OpcaoDeRecorte>[
            for (final c in cidades) OpcaoDeRecorte(codigo: c, rotulo: c),
          ],
        ),
      );
      grupos.add(
        GrupoDeFiltro(
          chave: 'size',
          titulo: 'Porte do cão',
          selecionado: r.porte?.valor,
          opcoes: <OpcaoDeRecorte>[
            for (final p in Porte.values)
              OpcaoDeRecorte(codigo: p.valor, rotulo: p.rotulo),
          ],
        ),
      );
      // A distancia continua so na agenda do que vem, e `_podeMedir` ja diz
      // isso: ela chama `_naAgendaDoQueVem`, que e falso em `Encerrados`.
      // Medir a distancia de um evento que ja passou e oferecer um recorte
      // sobre uma decisao que ninguem mais pode tomar.
      if (_podeMedir) {
        grupos.add(
          GrupoDeFiltro(
            chave: 'max_km',
            titulo: 'Distância',
            selecionado: r.distanciaMaxima?.codigo,
            opcoes: <OpcaoDeRecorte>[
              for (final d in DistanciaMaxima.values)
                OpcaoDeRecorte(codigo: d.codigo, rotulo: d.rotulo),
            ],
          ),
        );
      }
    }

    return ControleDeFiltro(grupos: grupos);
  }

  /// **Todos os grupos E a ordem de uma vez, no `Aplicar`.**
  ///
  /// Antes cada pastilha fechava a folha e recarregava a agenda, e a ordem
  /// tinha folha propria: trocar `Quando`, `Valor`, `Cidade` e a ordem eram
  /// quatro chamadas a rota, com a lista voltando a primeira pagina quatro
  /// vezes. Agora e uma.
  ///
  /// So as chaves que os grupos da aba atual DECLARARAM entram: `_Nada` e
  /// "nao mexer", e um grupo que esta aba nao oferece nao pode ter o recorte
  /// apagado por ela.
  void _aplicarAFolha(EscolhaDaFolha escolha) {
    final filtros = escolha.filtros;
    Object? v(String chave, Object? Function(String?) de) =>
        filtros.containsKey(chave) ? de(filtros[chave]) : const _Nada();
    // **QUANDO A FOLHA PASSA A MANDAR NA CIDADE -- e nao e a cada `Aplicar`.**
    //
    // `EscolhaDaFolha.filtros` traz **todas** as chaves que os grupos daquela
    // composicao declararam, com o valor marcado de cada um; `containsKey` diz
    // que o grupo EXISTE, e nao que alguem mexeu nele. Como o grupo `Cidade`
    // abre pre-marcado com a cidade em uso, um `containsKey` cru faria qualquer
    // `Aplicar` -- trocar `Quando`, por exemplo -- gravar a cidade DERIVADA no
    // recorte. Duas consequencias, as duas indesejadas: o distintivo da barra
    // subiria em cima de uma cidade que ninguem escolheu, e a derivada pararia
    // de acompanhar o aparelho.
    //
    // **A comparacao e com a cidade derivada, e e ela que separa os casos:**
    // valor igual significa que a folha so devolveu o que ja estava valendo, e
    // ninguem decidiu nada sobre a cidade; valor diferente e uma decisao --
    // inclusive `nenhuma`, que e alguem limpando o recorte de proposito, e e
    // justamente o caso que a derivada nao pode desfazer no proximo `copiar`.
    Object? cidadeDaFolha = const _Nada();
    if (filtros.containsKey('city')) {
      final escolhida = filtros['city'];
      if (escolhida == _cidadeDoAparelho?.cidade) {
        // So a derivada, de volta. Ela NAO e gravada no recorte: continua
        // entrando pelo caminho da chamada, onde nao conta como filtro.
        cidadeDaFolha = null;
      } else {
        cidadeDaFolha = escolhida;
        _folhaDecidiuACidade = true;
      }
    }
    final ordem = escolha.ordem;
    // `state` e `visibility` nao chegam mais nesta folha: os dois grupos
    // sairam em 19/10/2026 (ver `_controleDeFiltro`). `involvement` tambem
    // nao chega -- o grupo `Meu envolvimento` que a frente da barra criou nao
    // sobreviveu a remocao da aba `Meus pedidos`, e com ele saiu o
    // `_soOndePedi` que era aplicado aqui antes do `_trocarRecorte`. `max_km`
    // e `Distância` continuam, e continuam sendo so de publicos -- o que
    // mudou e que agora TODA a agenda e.
    _trocarRecorte(
      _recorteCom(
        // **`Próximos` VOLTA A SER `null` no recorte**, e e isto que mantem o
        // distintivo da barra em zero para a lista que ninguem recortou. A
        // folha mostra `Próximos` marcado porque e a verdade da lista; o
        // recorte guarda "nao escolhi".
        quando: v(
          'when',
          (c) => c == QuandoDaRede.aVir.codigo
              ? null
              : QuandoDaRede.porCodigo(c),
        ),
        entrada: v('admission', TipoDeEntrada.porCodigo),
        cidade: cidadeDaFolha,
        porte: v('size', Porte.de),
        distanciaMaxima: v('max_km', DistanciaMaxima.porCodigo),
        ordem: ordem ?? const _Nada(),
      ),
    );
  }

  ControleDeOrdenacao _controleDeOrdenacao() {
    final opcoes = <OpcaoDeRecorte>[];
    // **AS DUAS COMPOSICOES DE ANTES**, agora escolhidas pelo recorte e nao
    // pela aba: `Encerrados` so aceita uma ordem, e a agenda do que vem
    // aceita duas quando ha de onde medir. A terceira composicao era a da
    // aba `Meus pedidos`, que saiu em 19/10 por decisao do cliente.
    if (_encerrados) {
      opcoes.add(
        OpcaoDeRecorte(
          codigo: OrdemDaRede.recentes.codigo,
          rotulo: OrdemDaRede.recentes.rotulo,
        ),
      );
    } else {
      opcoes.add(
        OpcaoDeRecorte(
          codigo: OrdemDaRede.proximos.codigo,
          rotulo: OrdemDaRede.proximos.rotulo,
        ),
      );
      if (_podeMedir) {
        opcoes.add(
          OpcaoDeRecorte(
            codigo: OrdemPorPerto.distancia.codigo,
            rotulo: OrdemPorPerto.distancia.rotulo,
          ),
        );
      }
    }
    // A barra mostra a ordem REAL. Se o servidor devolveu uma que o recorte
    // atual nao oferece, ela entra na lista em vez de a barra mentir.
    if (!opcoes.any((o) => o.codigo == _ordemEfetiva)) {
      final rotulo = OrdemDaRede.porCodigo(_ordemEfetiva)?.rotulo ??
          OrdemPorPerto.porCodigo(_ordemEfetiva)?.rotulo ??
          _ordemEfetiva;
      opcoes.add(OpcaoDeRecorte(codigo: _ordemEfetiva, rotulo: rotulo));
    }
    final pedida = _recorte.ordem;
    return ControleDeOrdenacao(
      opcoes: opcoes,
      efetiva: _ordemEfetiva,
      porQueNaoEAPedida: pedida != null && pedida != _ordemEfetiva
          ? AgendaDaRede.ordemTrocadaPeloServidor
          : null,
    );
  }

  /// O corpo. **[logado] e PARAMETRO e nao `Escopo.of(context)`**: quem
  /// decide o estado desenhado e o `AnimatedBuilder` do `build`, e ler a
  /// sessao de novo aqui abriria a porta para o corpo discordar da casca no
  /// quadro em que a sessao muda.
  List<Widget> _corpo({required bool logado}) {
    if (_fase == _Fase.carregando) {
      return <Widget>[
        Semantics(
          label: 'Carregando eventos',
          liveRegion: true,
          child: const Column(
            children: <Widget>[
              _EsqueletoDeEncontro(),
              SizedBox(height: BichuEspaco.e3),
              _EsqueletoDeEncontro(),
            ],
          ),
        ),
      ];
    }

    if (_fase == _Fase.falha) {
      return <Widget>[
        FaixaDeAviso(
          texto: AgendaDaRede.textoDaFalha,
          rotuloDaAcao: AgendaDaRede.rotuloDeAtualizar,
          aoTocarNaAcao: _carregar,
        ),
      ];
    }

    if (_itens.isEmpty) return <Widget>[_vazio()];

    return <Widget>[
      for (var i = 0; i < _itens.length; i++) ...<Widget>[
        if (i > 0) const SizedBox(height: BichuEspaco.e4),
        // **So o encontro NO CARTAO.** Ele mostra foto e titulo, e a
        // distancia e o estado do pedido nao voltaram para dentro dele
        // (cliente, 19/10/2026, confirmado em 20/10). `_ItemDaAgenda` continua
        // carregando a distancia: ela e a resposta de
        // `listNearbyNetworkEvents` que revela se ha regiao cadastrada -- e e
        // isso que decide se `Mais perto` e `Distância` aparecem na barra --,
        // e ela agora tambem viaja no `extra` do toque, para a pagina nao
        // perguntar de novo o que esta lista ja sabe.
        CartaoDoEncontro(
          encontro: _itens[i].encontro,
          aoTocar: () => _tocarNoCartao(_itens[i], logado: logado),
        ),
      ],
      const SizedBox(height: BichuEspaco.e4),
      _LinhaDaPagina(naTela: _itens.length, total: _total),
      if (_temMais) ...<Widget>[
        const SizedBox(height: BichuEspaco.e3),
        if (_falhaAoCarregarMais) ...<Widget>[
          Text(
            AgendaDaRede.falhaAoCarregarMais,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: BichuEspaco.e2),
        ],
        OutlinedButton(
          onPressed: _carregandoMais ? null : () => _carregar(maisUma: true),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
          ),
          child: Text(
            _falhaAoCarregarMais
                ? AgendaDaRede.rotuloDeTentar
                : AgendaDaRede.rotuloDeCarregarMais,
          ),
        ),
      ],
    ];
  }

  Widget _vazio() {
    final r = _recorte;
    // **A CONTAGEM SAI DOS GRUPOS DESENHADOS, e nao de
    // `RecorteDaRede.quantidadeDeFiltros`.** As duas contas coincidem hoje,
    // depois que a aba `Meus pedidos` saiu e todo recorte desta tela voltou a
    // morar no modelo; contar os grupos DESENHADOS continua sendo a conta
    // certa porque e a unica que nao pode divergir do que a pessoa ve.
    //
    // `ControleDeFiltro.ativos` conta grupo com `selecionado != null`, e e a
    // MESMA conta que o distintivo da barra usa. Uma verdade so.
    final filtros = _controleDeFiltro().ativos;
    if (!r.temBusca && filtros == 0) {
      // Sem busca e sem recorte nenhum a lista e a agenda do que vem, e so
      // ela: `Encerrados` e um filtro e conta acima. (`Só onde eu pedi` nao
      // existe: a aba `Meus pedidos` saiu em 19/10 por decisao do cliente.)
      return const EstadoVazio(
        titulo: AgendaDaRede.tituloDoVazio,
        explicacao: AgendaDaRede.explicacaoDoVazio,
      );
    }

    final filtroTexto = filtros == 1 ? 'filtro' : 'filtros';
    final rotulo = r.temBusca && filtros > 0
        ? 'Limpar busca e $filtroTexto'
        : r.temBusca
            ? 'Limpar busca'
            : 'Limpar $filtroTexto';
    final limpar = OutlinedButton(
      onPressed: () {
        if (r.temBusca) _buscaControlador.clear();
        _trocarRecorte(RecorteDaRede(ordem: r.ordem));
      },
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
      ),
      child: Text(rotulo),
    );

    // **OS DOIS VAZIOS QUE ERAM DE ABA CONTINUAM, e agora sao de FILTRO.**
    //
    // `Nenhum pedido ainda` e `Nenhum evento encerrado` existiam porque
    // `Meus pedidos` e `Encerrados` eram abas, e cada uma tinha o proprio
    // vazio sem recorte. Com as duas virando filtro, a frase generica
    // (`Nenhum evento com esses filtros`) passaria a cobrir os dois casos --
    // e ela diria menos: *"nenhum pedido ainda"* conta a historia de quem
    // nunca pediu para ir a nada, e *"nenhum evento com esses filtros"*
    // sugere que mexer no filtro resolve.
    //
    // A condicao e **filtro UNICO**: com mais de um recorte ligado a frase
    // especifica mentiria por omissao (pode nao haver pedido *naquela cidade*,
    // e nao pedido nenhum).
    //
    // **E agora eles TEM a acao de limpar**, que como abas nao tinham: sendo
    // filtro, ha o que desfazer.
    if (!r.temBusca && filtros == 1) {
      if (_encerrados) {
        return EstadoVazio(
          titulo: AgendaDaRede.tituloDoVazioDeEncerrados,
          explicacao: AgendaDaRede.explicacaoDoVazioDeEncerrados,
          acao: limpar,
        );
      }
    }

    return EstadoVazio(
      titulo: r.temBusca
          ? AgendaDaRede.tituloDoVazioComBusca(r.termoLimpo!)
          : AgendaDaRede.tituloDoVazioFiltrado,
      explicacao: AgendaDaRede.explicacaoDoVazioFiltrado,
      acao: limpar,
    );
  }
}

class _Nada {
  const _Nada();
}

class _LinhaDaPagina extends StatelessWidget {
  const _LinhaDaPagina({required this.naTela, required this.total});

  final int naTela;
  final int total;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Text(
      'Mostrando 1 a $naTela de $total',
      style: textos.bodySmall?.copyWith(color: cores.textSecondary),
    );
  }
}

class _EsqueletoDeEncontro extends StatelessWidget {
  const _EsqueletoDeEncontro();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return ExcludeSemantics(
      child: AspectRatio(
        aspectRatio: 1,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: cores.surfaceSunken,
            borderRadius: BorderRadius.circular(BichuRaio.lg),
          ),
        ),
      ),
    );
  }
}
