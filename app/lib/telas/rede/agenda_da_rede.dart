import '../../widgets/arrastar_para_atualizar.dart';
import 'dart:async';
import 'dart:collection';

import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/modelos_pet.dart';
import '../../api/modelos_rede.dart';
import '../../api/rede_api.dart';
import '../../escopo.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_listagem.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../casca_com_abas.dart';
import 'cartao_do_encontro.dart';

/// `Rede`: a agenda dos encontros (design system 24.14 com 24.15 a 24.17,
/// textos da UX 28.7.4).
///
/// ## Tres abas, tres operacoes
///
/// | Aba | Operacao | Ordem |
/// |---|---|---|
/// | `Próximos` | `listNetworkEvents` com `when=upcoming` (ou `today`, `weekend`, `next_30_days`); com `Mais perto` ou `Distância`, `listNearbyNetworkEvents` | `Data mais próxima`; `Mais perto` com regiao |
/// | `Meus pedidos` | `listMyNetworkEventJoinRequests`, so com conta | `Data mais próxima`, unica |
/// | `Encerrados` | `listNetworkEvents` com `when=past` | `Mais recente primeiro`, unica |
///
/// Trocar de aba limpa filtros e ordem, porque cada aba tem os seus. Sem
/// conta, `Meus pedidos` **nao aparece** (nao fica desabilitada): controle sem
/// desfecho.
///
/// ## Busca, filtro e ordem: o componente que ja existe
///
/// [BarraDeListagem], sem copia. Filtros de lista fechada, os do contrato e
/// so eles (`when`, `admission`, `visibility`, `city`, `size`, `max_km`,
/// `state`), cada um so na aba cuja operacao o aceita.
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
  static const String tituloDoVazioDePedidos = 'Nenhum pedido ainda';
  static const String explicacaoDoVazioDePedidos =
      'Seus pedidos aparecem aqui.';
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
  static const String falhaAoCarregarMais =
      'Não conseguimos carregar mais eventos agora.';
  static const String rotuloDeTentar = 'Tentar de novo';

  static String tituloDoVazioComBusca(String termo) =>
      'Nenhum evento com “$termo”';

  @override
  State<AgendaDaRede> createState() => _AgendaDaRedeState();
}

/// **`AbaDaRede` NAO EXISTE MAIS: as TRES abas viraram FILTRO (19/10/2026).**
///
/// Decisao do cliente. As tres couberam no filtro **porque a entidade nao
/// muda**: a lista continua sendo de eventos, e o que cada recorte faz e
/// escolher QUAIS eventos.
///
/// | Aba de ontem | Virou |
/// |---|---|
/// | `Próximos` | grupo `Quando` -> `Próximos` (o padrao, e por isso o recorte guarda `null`) |
/// | `Encerrados` | grupo `Quando` -> `Encerrados` |
/// | `Meus pedidos` | grupo `Meu envolvimento` -> `Só onde eu pedi` |
///
/// **O estado que sobrou nesta tela e UM `bool`**, e nao um enum de tres: o
/// recorte de tempo ja morava em `RecorteDaRede.quando` -- era so a aba que
/// escolhia o valor por ela --, e o unico recorte que o modelo nao sabia
/// expressar e "so os eventos em que eu pedi para ir", porque ele nao e um
/// parametro da lista e sim **outra operacao**
/// (`listMyNetworkEventJoinRequests`). Ver `_soOndePedi`.
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
class _ItemDaAgenda {
  const _ItemDaAgenda(this.encontro, {this.distancia, this.pedido});
  final EncontroDaRede encontro;
  final int? distancia;
  final EstadoDoPedido? pedido;
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

  /// **O UNICO recorte que `RecorteDaRede` nao sabe expressar.**
  ///
  /// Ele nao e um parametro da lista de eventos: "so onde eu pedi" e uma
  /// OPERACAO diferente (`listMyNetworkEventJoinRequests`), com outra resposta
  /// e outros parametros aceitos. Por isso ele e estado desta tela e nao campo
  /// do recorte -- po-lo no modelo faria `queryDaAgenda` ter de ignora-lo, e
  /// recorte que o modelo carrega e a rota ignora e a classe de defeito que
  /// `barra_de_listagem.dart` existe para impedir.
  ///
  /// Ele entra na folha como o grupo `Meu envolvimento`, e e por isso que o
  /// distintivo da barra o conta: `ControleDeFiltro.ativos` conta grupo com
  /// `selecionado != null`, e o grupo declara o valor quando ele e verdadeiro.
  bool _soOndePedi = false;

  /// O codigo da unica opcao do grupo `Meu envolvimento`.
  ///
  /// **Ele NAO vai para o servidor**, e e por isso que ele e local: a rota de
  /// pedidos nao tem parametro de envolvimento -- ela E a lista dos meus
  /// pedidos. O codigo existe para o componente de filtro poder dizer
  /// "selecionado" e para `_aplicarAFolha` poder ler a escolha de volta, e
  /// `requested` e a palavra que o contrato usa para o pedido
  /// (`NetworkEventJoinRequest`).
  static const String _codigoDeSoOndePedi = 'requested';

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

  bool _visivel = false;
  bool _cargaAgendada = false;

  /// Cada carga ganha um numero; resposta de carga velha e descartada.
  int _geracao = 0;

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
  bool get _naAgendaDoQueVem => !_soOndePedi && !_encerrados;

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
    // Saiu da conta com `Só onde eu pedi` ligado: o recorte cai, e a lista
    // volta a agenda publica em vez de pedir uma rota que responderia `401`.
    if (!logado && _soOndePedi) _soOndePedi = false;

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
    final recorte = _recorte.copiar(pagina: maisUma ? _pagina + 1 : 1);
    final rede = RedeApi(escopo.api);
    final medir = logado &&
        _temRegiao &&
        _naAgendaDoQueVem &&
        !recorte.pedeDistancia &&
        recorte.visibilidade != VisibilidadeDoEncontro.privado;

    try {
      late final List<_ItemDaAgenda> itens;
      late final int total;
      late final int pagina;
      late final String efetiva;

      // **O RECORTE ESCOLHE A OPERACAO, e era a aba que escolhia.** Os tres
      // ramos sao os mesmos de antes, palavra por palavra; o que mudou foi a
      // condicao de cada um -- `_soOndePedi` e `_encerrados` no lugar de
      // `AbaDaRede.pedidos` e `AbaDaRede.encerrados`.
      //
      // **`Só onde eu pedi` vem PRIMEIRO, e a ordem importa**: ele e uma
      // operacao diferente e nao aceita `when`, entao um recorte de tempo
      // junto com ele nao tem efeito -- e por isso o grupo `Quando` nao e
      // oferecido quando ele esta ligado (ver `_controleDeFiltro`).
      if (_soOndePedi) {
        final p = await rede.meusPedidos(recorte.queryDePedidos);
        itens = <_ItemDaAgenda>[
          for (final m in p.itens)
            _ItemDaAgenda(
              m.encontro,
              // Estado desconhecido vira `Pedido enviado`, nunca recusa.
              pedido: m.estado ?? EstadoDoPedido.enviado,
            ),
        ];
        (total, pagina) = (p.total, p.pagina);
        efetiva = OrdemDaRede.proximos.codigo;
      } else if (_encerrados) {
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
        // Saiu da conta com `Só onde eu pedi` ligado: o recorte cai aqui
        // tambem, e nao so em `_carregar`. Sem esta linha a folha continuaria
        // mostrando o grupo `Meu envolvimento` com a opcao marcada no quadro
        // entre sair da conta e a carga nova chegar.
        if (!logado && _soOndePedi) _soOndePedi = false;

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
            if (_fase != _Fase.carregando)
              BarraDeListagem(
                total: _total,
                // O substantivo acompanha a OPERACAO e nao a aba: com
                // `Só onde eu pedi` a lista e de pedidos, e o resumo da barra
                // tem de dizer `3 pedidos` e nao `3 eventos`.
                substantivo: _soOndePedi
                    ? const SubstantivoDaListagem(
                        singular: 'pedido',
                        plural: 'pedidos',
                      )
                    : const SubstantivoDaListagem(
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
            ..._corpo(),
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
    Object? visibilidade = const _Nada(),
    Object? cidade = const _Nada(),
    Object? porte = const _Nada(),
    Object? distanciaMaxima = const _Nada(),
    Object? ordem = const _Nada(),
    Object? estadoDoPedido = const _Nada(),
  }) {
    final r = _recorte;
    T? v<T>(Object? novo, T? atual) => novo is _Nada ? atual : novo as T?;
    return RecorteDaRede(
      termo: v<String>(termo, r.termo),
      quando: v<QuandoDaRede>(quando, r.quando),
      entrada: v<TipoDeEntrada>(entrada, r.entrada),
      visibilidade: v<VisibilidadeDoEncontro>(visibilidade, r.visibilidade),
      cidade: v<String>(cidade, r.cidade),
      porte: v<Porte>(porte, r.porte),
      distanciaMaxima: v<DistanciaMaxima>(distanciaMaxima, r.distanciaMaxima),
      ordem: v<String>(ordem, r.ordem),
      estadoDoPedido: v<EstadoDoPedido>(estadoDoPedido, r.estadoDoPedido),
    );
  }

  ControleDeFiltro _controleDeFiltro() {
    final r = _recorte;
    final grupos = <GrupoDeFiltro>[];

    // **O GRUPO QUE ABSORVEU A ABA `Meus pedidos` (19/10/2026).**
    //
    // Ele vem PRIMEIRO de proposito: ele e o unico grupo que troca a OPERACAO
    // -- e, com ela, quais outros grupos existem. Quem abre a folha le a
    // escolha que governa as outras antes de ver as outras.
    //
    // **SO COM SESSAO, e ele nao nasce desabilitado.** Sem conta nao existe
    // "onde eu pedi": a rota responderia `401`, e uma opcao que convidasse a
    // entrar seria um controle cujo desfecho e uma recusa. Mesma regra que a
    // aba antiga ja seguia (`_abasVisiveis` escondia `Meus pedidos` sem
    // sessao), e e a regra dos tres casos em que um controle nao nasce, de
    // `barra_de_listagem.dart`.
    //
    // **A REGUA E SESSAO e nao `podeCriarNaComunidade`**, e a diferenca e
    // medida: pedir para ir e escrever e exige canal verificado; VER os
    // pedidos que eu ja fiz e ler, e quem pediu e depois trocou de e-mail
    // continua tendo pedidos na fila.
    //
    // **UMA opcao num grupo nao e um grupo vazio**, e aqui ela e uma escolha
    // de verdade: marcar recorta, desmarcar devolve a agenda inteira. A
    // alternativa -- duas opcoes, `Todos` e `Só onde eu pedi` -- seria a
    // ausencia de recorte vestida de recorte, e o componente ja expressa
    // "nenhum" por `selecionado: null`.
    if (Escopo.of(context).sessao.logado) {
      grupos.add(
        GrupoDeFiltro(
          chave: 'involvement',
          titulo: 'Meu envolvimento',
          selecionado: _soOndePedi ? _codigoDeSoOndePedi : null,
          opcoes: const <OpcaoDeRecorte>[
            OpcaoDeRecorte(
              codigo: _codigoDeSoOndePedi,
              rotulo: 'Só onde eu pedi',
            ),
          ],
        ),
      );
    }

    if (_soOndePedi) {
      // `listMyNetworkEventJoinRequests` nao aceita `when`, `admission`,
      // `size`, `visibility` nem distancia: filtrar por valor oculto
      // entregaria o valor, e oferecer grupo que a rota ignora e o filtro que
      // mente sobre o alcance.
      grupos.add(
        GrupoDeFiltro(
          chave: 'state',
          titulo: 'Situação do pedido',
          selecionado: r.estadoDoPedido?.codigo,
          opcoes: <OpcaoDeRecorte>[
            for (final e in EstadoDoPedido.doFiltro)
              OpcaoDeRecorte(
                codigo: e.codigo,
                rotulo: e == EstadoDoPedido.enviado ? 'Enviado' : 'Aprovado',
              ),
          ],
        ),
      );
    } else {
      // **O GRUPO QUE ABSORVEU AS ABAS `Próximos` E `Encerrados`
      // (19/10/2026).**
      //
      // Ele ja existia, com os TRES sub-recortes do futuro (`Hoje`, `Este fim
      // de semana`, `Próximos 30 dias`) e so dentro da aba `Próximos`. Agora
      // ele carrega as duas abas tambem, e passou a ser oferecido sempre que a
      // lista e de eventos.
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
      // Com a lista vindo de `listNearbyNetworkEvents` (so publicos), o grupo
      // de visibilidade nao tem desfecho, e nao aparece.
      if (!r.pedeDistancia) {
        grupos.add(
          GrupoDeFiltro(
            chave: 'visibility',
            titulo: 'Público ou privado',
            selecionado: r.visibilidade?.codigo,
            opcoes: <OpcaoDeRecorte>[
              for (final v in VisibilidadeDoEncontro.values)
                OpcaoDeRecorte(codigo: v.codigo, rotulo: v.rotulo),
            ],
          ),
        );
      }
      final cidades = SplayTreeSet<String>.from(_cidadesConhecidas);
      if (r.cidade != null) cidades.add(r.cidade!);
      grupos.add(
        GrupoDeFiltro(
          chave: 'city',
          titulo: 'Cidade',
          selecionado: r.cidade,
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
    final maxKm = filtros['max_km'];
    final ordem = escolha.ordem;
    // `Distância` como ordem e a lista so de publicos, pela mesma razao do
    // filtro `max_km`: `listNearbyNetworkEvents` nao devolve privado.
    final porDistancia = ordem == OrdemPorPerto.distancia.codigo;
    // **O RECORTE QUE TROCA A OPERACAO, aplicado ANTES do resto.**
    //
    // `_soOndePedi` nao mora no recorte (ver o campo), entao ele e aplicado
    // aqui e o `_trocarRecorte` abaixo dispara a carga uma vez so -- e nao
    // duas, que e o que aconteceria com um `setState` proprio.
    //
    // `containsKey` e nao `!= null`: o grupo nao e oferecido sem sessao nem
    // dentro da propria lista de pedidos para alguns casos, e chave ausente e
    // "nao mexer". Sem esta distincao, abrir a folha com o grupo escondido
    // desligaria o recorte sozinho.
    if (filtros.containsKey('involvement')) {
      _soOndePedi = filtros['involvement'] == _codigoDeSoOndePedi;
    }
    _trocarRecorte(
      _recorteCom(
        estadoDoPedido: v('state', EstadoDoPedido.porCodigo),
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
        // Lista so de publicos: o filtro de visibilidade sai junto.
        visibilidade: maxKm != null || porDistancia
            ? null
            : v('visibility', VisibilidadeDoEncontro.porCodigo),
        cidade: v('city', (c) => c),
        porte: v('size', Porte.de),
        distanciaMaxima: v('max_km', DistanciaMaxima.porCodigo),
        ordem: ordem ?? const _Nada(),
      ),
    );
  }

  ControleDeOrdenacao _controleDeOrdenacao() {
    final opcoes = <OpcaoDeRecorte>[];
    // **AS MESMAS TRES COMPOSICOES DE ANTES**, agora escolhidas pelo recorte e
    // nao pela aba: `Só onde eu pedi` e `Encerrados` so aceitam uma ordem
    // cada, e a agenda do que vem aceita duas quando ha de onde medir.
    if (_soOndePedi) {
      opcoes.add(
        OpcaoDeRecorte(
          codigo: OrdemDaRede.proximos.codigo,
          rotulo: OrdemDaRede.proximos.rotulo,
        ),
      );
    } else if (_encerrados) {
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

  List<Widget> _corpo() {
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
        CartaoDoEncontro(
          encontro: _itens[i].encontro,
          distanciaEmMetros: _itens[i].distancia,
          estadoDoPedido: _itens[i].pedido,
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
    // `RecorteDaRede.quantidadeDeFiltros`.** Isto conserta um portao cego que
    // a absorcao das abas teria aberto: `_soOndePedi` **nao mora no recorte**,
    // entao `quantidadeDeFiltros` devolveria `0` com `Só onde eu pedi`
    // ligado -- e a tela diria "a Rede ainda nao tem evento" sobre uma lista
    // de PEDIDOS vazia, que e uma afirmacao diferente e falsa.
    //
    // `ControleDeFiltro.ativos` conta grupo com `selecionado != null`, e e a
    // MESMA conta que o distintivo da barra usa. Uma verdade so.
    final filtros = _controleDeFiltro().ativos;
    if (!r.temBusca && filtros == 0) {
      // Sem busca e sem recorte nenhum a lista e a agenda do que vem, e so
      // ela: `Só onde eu pedi` e `Encerrados` sao filtros e contam acima.
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
        // `_soOndePedi` nao mora no recorte, entao limpar o recorte nao o
        // limpa: sem esta linha, `Limpar filtro` deixaria a lista de pedidos
        // vazia exatamente como estava, e o botao viraria um toque sem
        // desfecho.
        _soOndePedi = false;
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
      if (_soOndePedi) {
        return EstadoVazio(
          titulo: AgendaDaRede.tituloDoVazioDePedidos,
          explicacao: AgendaDaRede.explicacaoDoVazioDePedidos,
          acao: limpar,
        );
      }
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
